"""
Meme R2 Processor - R2-Based Meme Generation Pipeline

Generates memes from videos stored in R2 (from browser upload or YouTube download).
This replaces the webhook-based MemeGenerator for the unified R2 architecture.

Key differences from MemeGenerator:
- Downloads source video from R2 instead of YouTube
- Uses ConvexClient for job state management (same pattern as R2VideoProcessor)
- Uploads generated memes to R2 instead of Convex storage
- Uses idempotent job claiming with lock IDs

Flow:
1. Claim job from Convex (idempotent lock)
2. Download video from R2
3. Extract audio, transcribe for context
4. Extract frames at smart intervals
5. Analyze frames with OpenAI Vision
6. Generate viral captions with GPT-4o
7. Compose meme images
8. Upload memes to R2
9. Complete job in Convex
"""

import os
import asyncio
import uuid
import shutil
import base64
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field

from .r2_fetcher import R2Fetcher
from .convex_client import ConvexClient
from .transcription import TranscriptionService
from .meme_generator import (
    compose_meme_image,
    FrameAnalysis,
    DEFAULT_FRAME_COUNT,
    MIN_MEMEABILITY_SCORE,
    OPENAI_API_KEY,
    OPENAI_API_URL,
    GEMINI_API_KEY,
    GEMINI_API_URL,
)


@dataclass
class MemeR2ProcessingResult:
    """Result of R2-based meme processing."""
    success: bool
    job_id: str
    memes: List[Dict[str, Any]] = field(default_factory=list)
    candidate_frames: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None
    error_stage: Optional[str] = None
    video_title: Optional[str] = None
    video_duration: Optional[float] = None


class MemeR2Processor:
    """
    Meme processor for R2-based architecture.

    Processes videos uploaded to R2 by the browser or downloaded from YouTube.
    Uses Convex internal mutations for job state management.
    """

    def __init__(
        self,
        job_id: str,
        temp_dir: str = "/tmp/meme_processing",
    ):
        self.job_id = job_id
        self.temp_dir = temp_dir
        self.job_dir = os.path.join(temp_dir, job_id)

        # Generate unique lock ID for this processing attempt
        self.lock_id = f"{job_id}_{uuid.uuid4().hex[:8]}"

        # Create job-specific directory
        os.makedirs(self.job_dir, exist_ok=True)

        # Initialize services
        self.r2 = R2Fetcher(self.job_dir)
        self.convex = ConvexClient()
        self.transcription = TranscriptionService()

        # HTTP client for OpenAI
        self._http_client = None

        # Job data (populated after claiming)
        self.user_id: Optional[str] = None
        self.actor_profile_id: Optional[str] = None
        self.r2_source_key: Optional[str] = None
        self.meme_count: int = 5
        self.target_templates: Optional[List[str]] = None
        self.movie_metadata: Optional[Dict[str, Any]] = None

    async def _get_http_client(self):
        """Get or create HTTP client for OpenAI calls."""
        if self._http_client is None:
            import httpx
            self._http_client = httpx.AsyncClient(timeout=60.0)
        return self._http_client

    async def process(self) -> MemeR2ProcessingResult:
        """
        Run the full meme generation pipeline.
        """
        memes = []
        candidate_frames = []
        video_title = None
        video_duration = None

        try:
            # =================================================================
            # STEP 1: Claim job
            # =================================================================
            print(f"[{self.job_id}] Claiming meme job with lock_id={self.lock_id}")

            claim_result = await self.convex.claim_meme_job(
                job_id=self.job_id,
                lock_id=self.lock_id,
            )

            if not claim_result.get("claimed"):
                reason = claim_result.get("reason", "Unknown")
                print(f"[{self.job_id}] Failed to claim meme job: {reason}")
                return MemeR2ProcessingResult(
                    success=False,
                    job_id=self.job_id,
                    error=f"Failed to claim job: {reason}",
                    error_stage="claim",
                )

            # Extract job data
            self.user_id = claim_result.get("userId")
            self.actor_profile_id = claim_result.get("actorProfileId")
            self.r2_source_key = claim_result.get("r2SourceKey")
            self.meme_count = int(claim_result.get("memeCount") or 5)
            self.target_templates = claim_result.get("targetTemplates")
            self.movie_metadata = claim_result.get("movieMetadata")
            video_title = claim_result.get("videoTitle")

            print(f"[{self.job_id}] Meme job claimed: user={self.user_id}, r2Key={self.r2_source_key}")

            if not self.r2_source_key:
                raise ValueError("No R2 source key in meme job data")

            # =================================================================
            # STEP 2: Download video from R2
            # =================================================================
            await self.convex.update_meme_progress(
                self.job_id, self.lock_id, 5, "downloading", "Downloading video..."
            )
            print(f"[{self.job_id}] Downloading video from R2...")

            job_path = Path(self.job_dir)
            video_path, audio_path = self.r2.download_source_video(
                self.r2_source_key,
                job_path,
            )

            video_duration = self.r2.get_video_duration(video_path)
            print(f"[{self.job_id}] Video downloaded: duration={video_duration}s")

            # =================================================================
            # STEP 3: Transcribe for context
            # =================================================================
            await self.convex.update_meme_progress(
                self.job_id, self.lock_id, 15, "transcribing", "Transcribing audio..."
            )
            print(f"[{self.job_id}] Transcribing audio for context...")

            transcript_text = ""
            try:
                transcription_result = await self.transcription.transcribe(str(audio_path))
                transcript_text = transcription_result.get("text", "")
                print(f"[{self.job_id}] Transcription complete: {len(transcript_text)} chars")
            except Exception as e:
                print(f"[{self.job_id}] Transcription failed (continuing without): {e}")

            # =================================================================
            # STEP 4: Extract frames
            # =================================================================
            await self.convex.update_meme_progress(
                self.job_id, self.lock_id, 25, "extracting_frames", "Extracting video frames..."
            )
            print(f"[{self.job_id}] Extracting frames...")

            timestamps = self._get_smart_timestamps(video_duration)
            frames = self._extract_frames(str(video_path), timestamps)
            print(f"[{self.job_id}] Extracted {len(frames)} frames")

            # =================================================================
            # STEP 5: Analyze frames
            # =================================================================
            await self.convex.update_meme_progress(
                self.job_id, self.lock_id, 35, "analyzing", "Analyzing frames for meme potential..."
            )
            print(f"[{self.job_id}] Analyzing frames...")

            analyzed_frames = []
            for i, frame in enumerate(frames):
                progress = 35 + int((i / len(frames)) * 20)
                await self.convex.update_meme_progress(
                    self.job_id, self.lock_id, progress, "analyzing",
                    f"Analyzing frame {i + 1}/{len(frames)}..."
                )

                try:
                    analysis = await self._analyze_frame(
                        frame["path"],
                        frame["timestamp"],
                        self.movie_metadata,
                    )

                    frame_data = {
                        "timestamp": frame["timestamp"],
                        "path": frame["path"],
                        "analysis": analysis,
                    }
                    analyzed_frames.append(frame_data)
                    candidate_frames.append({
                        "timestamp": frame["timestamp"],
                        "emotion": analysis.emotion,
                        "action": analysis.action,
                        "memeability": analysis.memeability,
                        "potential_templates": analysis.potential_templates,
                    })

                except Exception as e:
                    print(f"[{self.job_id}] Frame analysis failed at {frame['timestamp']}s: {e}")

            # Sort by memeability and filter
            analyzed_frames.sort(key=lambda x: x["analysis"].memeability, reverse=True)
            top_frames = [f for f in analyzed_frames if f["analysis"].memeability >= MIN_MEMEABILITY_SCORE]
            top_frames = top_frames[:self.meme_count]

            print(f"[{self.job_id}] Selected {len(top_frames)} frames for meme generation")

            if not top_frames:
                raise ValueError("No suitable frames found for meme generation")

            # =================================================================
            # STEP 6: Generate captions and compose memes
            # =================================================================
            await self.convex.update_meme_progress(
                self.job_id, self.lock_id, 60, "generating_captions", "Generating meme captions..."
            )
            print(f"[{self.job_id}] Generating captions and composing memes...")

            for i, frame in enumerate(top_frames):
                progress = 60 + int((i / len(top_frames)) * 30)
                await self.convex.update_meme_progress(
                    self.job_id, self.lock_id, progress, "generating_captions",
                    f"Creating meme {i + 1}/{len(top_frames)}..."
                )

                try:
                    # Generate caption
                    caption_result = await self._generate_caption(
                        frame["path"],
                        frame["analysis"],
                        self.movie_metadata,
                        transcript_text,
                    )

                    # Compose meme image
                    meme_output_path = os.path.join(self.job_dir, f"meme_{i}.jpg")
                    compose_meme_image(
                        frame_path=frame["path"],
                        caption=caption_result["caption"],
                        caption_position=caption_result.get("position", "bottom"),
                        output_path=meme_output_path,
                    )

                    # Upload meme to R2
                    r2_meme_key = self._upload_meme(
                        meme_output_path,
                        i,
                    )

                    # Upload frame to R2 (for display purposes)
                    r2_frame_key = self._upload_frame(
                        frame["path"],
                        i,
                    )

                    meme_data = {
                        "index": i,
                        "r2MemeKey": r2_meme_key,
                        "r2FrameKey": r2_frame_key,
                        "frameTimestamp": frame["timestamp"],
                        "templateType": frame["analysis"].potential_templates[0] if frame["analysis"].potential_templates else "reaction",
                        "caption": caption_result["caption"],
                        "captionPosition": caption_result.get("position", "bottom"),
                        "viralScore": caption_result.get("viral_score", 50),
                        "sentiment": caption_result.get("sentiment", "funny"),
                        "suggestedHashtags": caption_result.get("hashtags", []),
                        "emotion": frame["analysis"].emotion,
                        "action": frame["analysis"].action,
                        "memeabilityScore": frame["analysis"].memeability,
                    }
                    memes.append(meme_data)
                    print(f"[{self.job_id}] Meme {i + 1} created and uploaded")

                except Exception as e:
                    print(f"[{self.job_id}] Meme generation failed for frame {i}: {e}")

            # =================================================================
            # STEP 7: Complete job
            # =================================================================
            await self.convex.update_meme_progress(
                self.job_id, self.lock_id, 95, "completing", "Finalizing..."
            )
            print(f"[{self.job_id}] Completing meme job...")

            complete_result = await self.convex.complete_meme_processing(
                job_id=self.job_id,
                lock_id=self.lock_id,
                memes=memes,
                candidate_frames=candidate_frames,
                video_title=video_title,
                video_duration=video_duration,
            )

            if not complete_result.get("success"):
                reason = complete_result.get("reason", "Unknown")
                print(f"[{self.job_id}] Failed to complete meme job: {reason}")
                return MemeR2ProcessingResult(
                    success=False,
                    job_id=self.job_id,
                    memes=memes,
                    candidate_frames=candidate_frames,
                    error=f"Failed to complete job: {reason}",
                    error_stage="complete",
                    video_title=video_title,
                    video_duration=video_duration,
                )

            print(f"[{self.job_id}] Meme job completed successfully!")

            return MemeR2ProcessingResult(
                success=True,
                job_id=self.job_id,
                memes=memes,
                candidate_frames=candidate_frames,
                video_title=video_title,
                video_duration=video_duration,
            )

        except Exception as e:
            error_msg = str(e)
            error_stage = "processing"

            if "claim" in error_msg.lower():
                error_stage = "claim"
            elif "download" in error_msg.lower() or "r2" in error_msg.lower():
                error_stage = "download"
            elif "transcri" in error_msg.lower():
                error_stage = "transcription"
            elif "extract" in error_msg.lower() or "frame" in error_msg.lower():
                error_stage = "frame_extraction"
            elif "analyz" in error_msg.lower():
                error_stage = "analysis"
            elif "caption" in error_msg.lower() or "meme" in error_msg.lower():
                error_stage = "meme_generation"
            elif "upload" in error_msg.lower():
                error_stage = "upload"

            print(f"[{self.job_id}] Meme processing error at {error_stage}: {error_msg}")

            # Try to fail the job in Convex
            try:
                await self.convex.fail_meme_processing(
                    job_id=self.job_id,
                    lock_id=self.lock_id,
                    error=error_msg,
                    error_stage=error_stage,
                )
            except Exception as fail_error:
                print(f"[{self.job_id}] Failed to report meme failure: {fail_error}")

            return MemeR2ProcessingResult(
                success=False,
                job_id=self.job_id,
                memes=memes,
                candidate_frames=candidate_frames,
                error=error_msg,
                error_stage=error_stage,
                video_title=video_title,
                video_duration=video_duration,
            )

        finally:
            # Close HTTP client
            if self._http_client:
                await self._http_client.aclose()
            # Close Convex client
            await self.convex.close()

    def _get_smart_timestamps(
        self,
        video_duration: float,
        frame_count: int = DEFAULT_FRAME_COUNT,
    ) -> List[float]:
        """Generate smart timestamps for frame extraction."""
        if video_duration < 15:
            interval = max(1, video_duration / frame_count)
            return [i * interval for i in range(min(frame_count, int(video_duration)))]

        start = 5.0
        end = max(start + 5, video_duration - 5)
        effective_duration = end - start

        interval = effective_duration / (frame_count - 1)
        timestamps = [round(start + (i * interval), 2) for i in range(frame_count)]

        # Add key moments
        key_moments = [
            video_duration * 0.25,
            video_duration * 0.33,
            video_duration * 0.5,
            video_duration * 0.67,
            video_duration * 0.75,
        ]

        for moment in key_moments:
            if start < moment < end:
                if not any(abs(ts - moment) < 2 for ts in timestamps):
                    timestamps.append(round(moment, 2))

        return sorted(set(timestamps))

    def _extract_frames(
        self,
        video_path: str,
        timestamps: List[float],
    ) -> List[Dict[str, Any]]:
        """Extract frames from video at specified timestamps."""
        frames = []

        for ts in timestamps:
            output_path = os.path.join(self.job_dir, f"frame_{ts:.2f}.jpg")

            try:
                cmd = [
                    'ffmpeg', '-y',
                    '-ss', str(ts),
                    '-i', video_path,
                    '-vframes', '1',
                    '-q:v', '2',
                    output_path
                ]
                result = subprocess.run(cmd, capture_output=True, timeout=30)

                if result.returncode == 0 and os.path.exists(output_path):
                    frames.append({
                        "timestamp": ts,
                        "path": output_path,
                    })
            except Exception as e:
                print(f"Frame extraction error at {ts}s: {e}")

        return frames

    async def _analyze_frame(
        self,
        frame_path: str,
        timestamp: float,
        movie_context: Optional[Dict[str, str]] = None,
    ) -> FrameAnalysis:
        """Analyze a frame for meme potential with Gemini fallback."""
        # Try OpenAI first, fall back to Gemini on failure
        openai_error = None
        if OPENAI_API_KEY:
            try:
                return await self._analyze_frame_openai(frame_path, timestamp, movie_context)
            except Exception as e:
                openai_error = str(e)
                print(f"[{self.job_id}] OpenAI frame analysis failed: {e}, trying Gemini fallback...")

        # Try Gemini as fallback
        if GEMINI_API_KEY:
            try:
                return await self._analyze_frame_gemini(frame_path, timestamp, movie_context)
            except Exception as e:
                print(f"[{self.job_id}] Gemini frame analysis also failed: {e}")
                raise Exception(f"Both APIs failed. OpenAI: {openai_error}, Gemini: {e}")

        if openai_error:
            raise Exception(f"OpenAI failed and no Gemini fallback: {openai_error}")
        raise ValueError("No API keys configured (OPENAI_API_KEY or GEMINI_API_KEY)")

    async def _analyze_frame_openai(
        self,
        frame_path: str,
        timestamp: float,
        movie_context: Optional[Dict[str, str]] = None,
    ) -> FrameAnalysis:
        """Analyze a frame using OpenAI Vision for meme potential."""
        with open(frame_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")

        context_prompt = ""
        if movie_context:
            context_prompt = f"\n\nContext: This frame is from \"{movie_context.get('title', 'a film')}\". {movie_context.get('logline', '')} Genre: {movie_context.get('genre', 'Unknown')}"

        client = await self._get_http_client()

        response = await client.post(
            OPENAI_API_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENAI_API_KEY}",
            },
            json={
                "model": "gpt-4o",
                "messages": [
                    {
                        "role": "system",
                        "content": """You are a meme expert analyzing video frames for meme potential. Analyze the image and return a JSON object with:
- emotion: The primary emotion displayed
- emotionConfidence: 0-1 confidence score
- action: What action is happening
- actionConfidence: 0-1 confidence score
- hasFaces: boolean
- faceCount: number of faces visible
- sceneDescription: Brief description (1-2 sentences)
- potentialTemplates: Array of template types: ["reaction", "before_after", "internal_external", "absurd_visual", "character_voice", "fake_tutorial", "forbidden"]
- memeability: 0-100 score

Return ONLY valid JSON, no markdown code blocks.""",
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": f"Analyze this frame for meme potential.{context_prompt}",
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_data}",
                                    "detail": "high",
                                },
                            },
                        ],
                    },
                ],
                "max_tokens": 500,
            },
            timeout=30.0,
        )

        if response.status_code != 200:
            raise Exception(f"OpenAI API error: {response.status_code}")

        result = response.json()
        message = result.get("choices", [{}])[0].get("message", {})
        content = message.get("content")
        refusal = message.get("refusal")

        if refusal:
            raise Exception(f"OpenAI refused to analyze frame: {refusal}")

        if not content:
            raise Exception(f"OpenAI returned empty content for frame analysis")

        return self._parse_frame_analysis(content, timestamp, frame_path)

    async def _analyze_frame_gemini(
        self,
        frame_path: str,
        timestamp: float,
        movie_context: Optional[Dict[str, str]] = None,
    ) -> FrameAnalysis:
        """Analyze a frame using Google Gemini as fallback."""
        with open(frame_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")

        context_prompt = ""
        if movie_context:
            context_prompt = f"\n\nContext: This frame is from \"{movie_context.get('title', 'a film')}\". {movie_context.get('logline', '')} Genre: {movie_context.get('genre', 'Unknown')}"

        prompt = f"""You are a meme expert analyzing video frames for meme potential. Analyze this image and return a JSON object with:
- emotion: The primary emotion displayed
- emotionConfidence: 0-1 confidence score
- action: What action is happening
- actionConfidence: 0-1 confidence score
- hasFaces: boolean
- faceCount: number of faces visible
- sceneDescription: Brief description (1-2 sentences)
- potentialTemplates: Array of template types: ["reaction", "before_after", "internal_external", "absurd_visual", "character_voice", "fake_tutorial", "forbidden"]
- memeability: 0-100 score

Analyze this frame for meme potential.{context_prompt}

Return ONLY valid JSON, no markdown code blocks."""

        client = await self._get_http_client()

        response = await client.post(
            f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [
                    {
                        "parts": [
                            {"text": prompt},
                            {
                                "inline_data": {
                                    "mime_type": "image/jpeg",
                                    "data": image_data,
                                }
                            },
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.5,
                    "maxOutputTokens": 500,
                },
            },
            timeout=30.0,
        )

        if response.status_code != 200:
            error_text = response.text[:500] if response.text else "No error details"
            raise Exception(f"Gemini API error {response.status_code}: {error_text}")

        result = response.json()
        candidates = result.get("candidates", [])
        if not candidates:
            raise Exception("Gemini returned no candidates")

        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            raise Exception("Gemini returned no content parts")

        text = parts[0].get("text", "")
        if not text or not text.strip():
            raise Exception("Gemini returned empty text content")

        return self._parse_frame_analysis(text, timestamp, frame_path)

    def _parse_frame_analysis(self, content: str, timestamp: float, frame_path: str) -> FrameAnalysis:
        """Parse frame analysis JSON response."""
        import json
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown
            try:
                if "```json" in content:
                    content = content.split("```json")[1].split("```")[0]
                elif "```" in content:
                    content = content.split("```")[1].split("```")[0]
                data = json.loads(content.strip())
            except (json.JSONDecodeError, IndexError) as e:
                raise Exception(f"Failed to parse frame analysis JSON: {e}")

        return FrameAnalysis(
            timestamp=timestamp,
            frame_path=frame_path,
            emotion=data.get("emotion", "neutral"),
            emotion_confidence=data.get("emotionConfidence", 0.5),
            action=data.get("action", "standing"),
            action_confidence=data.get("actionConfidence", 0.5),
            has_faces=data.get("hasFaces", False),
            face_count=data.get("faceCount", 0),
            scene_description=data.get("sceneDescription", ""),
            potential_templates=data.get("potentialTemplates", ["reaction"]),
            memeability=data.get("memeability", 50),
        )

    async def _generate_caption(
        self,
        frame_path: str,
        analysis: FrameAnalysis,
        movie_context: Optional[Dict[str, Any]] = None,
        transcript: str = "",
    ) -> Dict[str, Any]:
        """Generate a viral meme caption for the frame with Gemini fallback."""
        # Try OpenAI first, fall back to Gemini on failure
        openai_error = None
        if OPENAI_API_KEY:
            try:
                return await self._generate_caption_openai(
                    frame_path, analysis, movie_context, transcript
                )
            except Exception as e:
                openai_error = str(e)
                print(f"[{self.job_id}] OpenAI caption failed: {e}, trying Gemini fallback...")

        # Try Gemini as fallback
        if GEMINI_API_KEY:
            try:
                return await self._generate_caption_gemini(
                    frame_path, analysis, movie_context, transcript
                )
            except Exception as e:
                print(f"[{self.job_id}] Gemini caption also failed: {e}")
                # Raise with both errors for debugging
                raise Exception(f"Both caption APIs failed. OpenAI: {openai_error}, Gemini: {e}")

        # No API keys configured or both failed
        if openai_error:
            raise Exception(f"OpenAI failed and no Gemini fallback: {openai_error}")
        raise ValueError("No caption API keys configured (OPENAI_API_KEY or GEMINI_API_KEY)")

    async def _generate_caption_openai(
        self,
        frame_path: str,
        analysis: FrameAnalysis,
        movie_context: Optional[Dict[str, Any]] = None,
        transcript: str = "",
    ) -> Dict[str, Any]:
        """Generate a viral meme caption using OpenAI GPT-4o."""
        if not OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not configured")

        with open(frame_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")

        context_parts = []
        if movie_context:
            context_parts.append(f"From: {movie_context.get('title', 'Unknown')}")
            if movie_context.get('genre'):
                context_parts.append(f"Genre: {movie_context['genre']}")
        context_parts.append(f"Emotion: {analysis.emotion}")
        context_parts.append(f"Action: {analysis.action}")
        if transcript:
            context_parts.append(f"Transcript context: {transcript[:500]}")

        client = await self._get_http_client()

        response = await client.post(
            OPENAI_API_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENAI_API_KEY}",
            },
            json={
                "model": "gpt-4o",
                "messages": [
                    {
                        "role": "system",
                        "content": """You are a viral meme caption expert. Generate a meme caption that:
- Is relatable and shareable
- Uses contemporary meme language/formats
- Matches the emotion and action in the frame
- Is concise (under 100 characters if possible)

Return a JSON object with:
- caption: The meme text (UPPERCASE for classic style, or normal case for modern style)
- position: "top", "bottom", or "top_bottom"
- viral_score: 0-100 predicted virality
- sentiment: "funny", "relatable", "absurd", "wholesome", "sarcastic"
- hashtags: Array of 3-5 suggested hashtags (without #)

Return ONLY valid JSON.""",
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": f"Generate a viral meme caption for this image.\n{chr(10).join(context_parts)}",
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_data}",
                                    "detail": "low",
                                },
                            },
                        ],
                    },
                ],
                "max_tokens": 300,
            },
            timeout=30.0,
        )

        if response.status_code != 200:
            raise Exception(f"OpenAI API error: {response.status_code}")

        result = response.json()
        message = result.get("choices", [{}])[0].get("message", {})
        content = message.get("content")
        refusal = message.get("refusal")

        # Check for OpenAI content moderation refusal
        if refusal:
            raise Exception(f"OpenAI refused to generate caption: {refusal}")

        # Check for None or empty content
        if not content:
            raise Exception(f"OpenAI returned empty content for caption generation")

        import json
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown
            try:
                if "```json" in content:
                    content = content.split("```json")[1].split("```")[0]
                elif "```" in content:
                    content = content.split("```")[1].split("```")[0]
                data = json.loads(content.strip())
            except (json.JSONDecodeError, IndexError) as e:
                raise Exception(f"Failed to parse caption JSON: {e}")

        return {
            "caption": data.get("caption", "WHEN YOU..."),
            "position": data.get("position", "bottom"),
            "viral_score": data.get("viral_score", 50),
            "sentiment": data.get("sentiment", "funny"),
            "hashtags": data.get("hashtags", []),
        }

    async def _generate_caption_gemini(
        self,
        frame_path: str,
        analysis: FrameAnalysis,
        movie_context: Optional[Dict[str, Any]] = None,
        transcript: str = "",
    ) -> Dict[str, Any]:
        """Generate a viral meme caption using Google Gemini as fallback."""
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY not configured")

        with open(frame_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")

        context_parts = []
        if movie_context:
            context_parts.append(f"From: {movie_context.get('title', 'Unknown')}")
            if movie_context.get('genre'):
                context_parts.append(f"Genre: {movie_context['genre']}")
        context_parts.append(f"Emotion: {analysis.emotion}")
        context_parts.append(f"Action: {analysis.action}")
        if transcript:
            context_parts.append(f"Transcript context: {transcript[:500]}")

        prompt = f"""You are a viral meme caption expert. Generate a meme caption that:
- Is relatable and shareable
- Uses contemporary meme language/formats
- Matches the emotion and action in the frame
- Is concise (under 100 characters if possible)

Context:
{chr(10).join(context_parts)}

Return a JSON object with:
- caption: The meme text (UPPERCASE for classic style, or normal case for modern style)
- position: "top", "bottom", or "top_bottom"
- viral_score: 0-100 predicted virality
- sentiment: "funny", "relatable", "absurd", "wholesome", "sarcastic"
- hashtags: Array of 3-5 suggested hashtags (without #)

Return ONLY valid JSON, no markdown code blocks."""

        client = await self._get_http_client()

        response = await client.post(
            f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [
                    {
                        "parts": [
                            {"text": prompt},
                            {
                                "inline_data": {
                                    "mime_type": "image/jpeg",
                                    "data": image_data,
                                }
                            },
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.8,
                    "maxOutputTokens": 300,
                },
            },
            timeout=30.0,
        )

        if response.status_code != 200:
            error_text = response.text[:500] if response.text else "No error details"
            raise Exception(f"Gemini API error {response.status_code}: {error_text}")

        result = response.json()

        # Extract text from Gemini response
        candidates = result.get("candidates", [])
        if not candidates:
            raise Exception("Gemini returned no candidates")

        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            raise Exception("Gemini returned no content parts")

        text = parts[0].get("text", "")
        if not text or not text.strip():
            raise Exception("Gemini returned empty text content")

        # Parse JSON from response
        import json
        text = text.strip()
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown
            try:
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0]
                elif "```" in text:
                    text = text.split("```")[1].split("```")[0]
                data = json.loads(text.strip())
            except (json.JSONDecodeError, IndexError) as e:
                raise Exception(f"Failed to parse Gemini caption JSON: {e}. Raw: {text[:200]}")

        return {
            "caption": data.get("caption", "WHEN YOU..."),
            "position": data.get("position", "bottom"),
            "viral_score": data.get("viral_score", 50),
            "sentiment": data.get("sentiment", "funny"),
            "hashtags": data.get("hashtags", []),
        }

    def _upload_meme(self, meme_path: str, index: int) -> str:
        """Upload a composed meme to R2."""
        r2_key = f"users/{self.user_id}/meme-jobs/{self.job_id}/memes/meme_{index}.jpg"
        self.r2.upload(
            local_path=Path(meme_path),
            r2_key=r2_key,
            content_type="image/jpeg",
        )
        return r2_key

    def _upload_frame(self, frame_path: str, index: int) -> str:
        """Upload a frame to R2."""
        r2_key = f"users/{self.user_id}/meme-jobs/{self.job_id}/frames/frame_{index}.jpg"
        self.r2.upload(
            local_path=Path(frame_path),
            r2_key=r2_key,
            content_type="image/jpeg",
        )
        return r2_key

    def cleanup(self):
        """Clean up temporary files."""
        try:
            if os.path.exists(self.job_dir):
                shutil.rmtree(self.job_dir)
                print(f"[{self.job_id}] Cleaned up meme temp files")
        except Exception as e:
            print(f"[{self.job_id}] Meme cleanup error: {e}")
