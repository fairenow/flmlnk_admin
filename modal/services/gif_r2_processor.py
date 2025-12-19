"""
GIF R2 Processor - R2-Based GIF Generation Pipeline

Generates GIFs from videos stored in R2 (from browser upload or YouTube download).
Uses AI to detect viral/funny moments and creates GIFs with text overlays.

Key features:
- AssemblyAI transcription with sentiment analysis
- OpenAI GPT-4o for viral moment detection
- FFmpeg for high-quality GIF encoding with palette optimization
- Multiple overlay styles: meme_top_bottom, caption_bar, subtitle, none

Flow:
1. Claim job from Convex (idempotent lock)
2. Download video from R2
3. Extract audio and transcribe with AssemblyAI (sentiment_analysis=True)
4. Analyze transcript with GPT-4o for viral/funny moments
5. Extract video segments at detected moments
6. Encode GIFs with text overlays using FFmpeg
7. Upload GIFs to R2
8. Complete job in Convex
"""

import os
import asyncio
import uuid
import shutil
import subprocess
import json
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field

from .r2_fetcher import R2Fetcher
from .convex_client import ConvexClient


# =============================================================================
# CONFIGURATION
# =============================================================================

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
ASSEMBLYAI_API_KEY = os.environ.get("ASSEMBLYAI_API_KEY") or os.environ.get("OPENAI_API_KEY")

# Gemini fallback configuration
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

# GIF Constraints
DEFAULT_GIF_COUNT = 5
MAX_GIF_COUNT = 10
DEFAULT_GIF_DURATION = 4.0
MAX_GIF_DURATION = 8.0
DEFAULT_GIF_WIDTH = 480
DEFAULT_FRAME_RATE = 12

# Overlay styles configuration
OVERLAY_STYLES = {
    "meme_top_bottom": {
        "name": "Meme Classic",
        "description": "Impact font with black stroke, top/bottom text",
        "fontFamily": "Impact",
        "fontSize": 48,
        "fontColor": "white",
        "strokeColor": "black",
        "strokeWidth": 3,
        "position": "top_bottom",
        "textTransform": "uppercase",
    },
    "caption_bar": {
        "name": "Caption Bar",
        "description": "Modern bottom bar with semi-transparent background",
        "fontFamily": "Arial",
        "fontSize": 32,
        "fontColor": "white",
        "hasBackground": True,
        "backgroundColor": "rgba(0,0,0,0.7)",
        "position": "bottom",
        "padding": 16,
    },
    "subtitle": {
        "name": "Subtitle",
        "description": "Clean subtitles with slight shadow",
        "fontFamily": "Arial",
        "fontSize": 28,
        "fontColor": "white",
        "shadowColor": "black",
        "shadowOffset": 2,
        "position": "bottom",
    },
    "none": {
        "name": "No Overlay",
        "description": "Just the GIF, no text",
        "position": "none",
    },
}


@dataclass
class ViralMoment:
    """A detected viral/funny moment in the video."""
    start_time: float
    end_time: float
    transcript_text: str
    humor_score: float  # 0-100
    viral_score: float  # 0-100
    emotion: str
    reason: str
    suggested_caption: Optional[str] = None


@dataclass
class GifR2ProcessingResult:
    """Result of R2-based GIF processing."""
    success: bool
    job_id: str
    gifs: List[Dict[str, Any]] = field(default_factory=list)
    moments: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None
    error_stage: Optional[str] = None
    video_title: Optional[str] = None
    video_duration: Optional[float] = None


class GifR2Processor:
    """
    GIF processor for R2-based architecture.

    Processes videos uploaded to R2 by the browser or downloaded from YouTube.
    Uses AI to detect viral moments and creates GIFs with text overlays.
    """

    def __init__(
        self,
        job_id: str,
        temp_dir: str = "/tmp/gif_processing",
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

        # HTTP client for API calls
        self._http_client = None

        # Job data (populated after claiming)
        self.user_id: Optional[str] = None
        self.actor_profile_id: Optional[str] = None
        self.r2_source_key: Optional[str] = None
        self.gif_count: int = DEFAULT_GIF_COUNT
        self.max_duration: float = DEFAULT_GIF_DURATION
        self.target_width: int = DEFAULT_GIF_WIDTH
        self.frame_rate: int = DEFAULT_FRAME_RATE
        self.overlay_style: str = "caption_bar"
        self.movie_metadata: Optional[Dict[str, Any]] = None

    async def _get_http_client(self):
        """Get or create HTTP client for API calls."""
        if self._http_client is None:
            import httpx
            self._http_client = httpx.AsyncClient(timeout=120.0)
        return self._http_client

    async def process(self) -> GifR2ProcessingResult:
        """
        Run the full GIF generation pipeline.
        """
        gifs = []
        moments = []
        video_title = None
        video_duration = None

        try:
            # =================================================================
            # STEP 1: Claim job
            # =================================================================
            print(f"[{self.job_id}] Claiming GIF job with lock_id={self.lock_id}")

            claim_result = await self.convex.claim_gif_job(
                job_id=self.job_id,
                lock_id=self.lock_id,
            )

            if not claim_result.get("claimed"):
                reason = claim_result.get("reason", "Unknown")
                print(f"[{self.job_id}] Failed to claim GIF job: {reason}")
                return GifR2ProcessingResult(
                    success=False,
                    job_id=self.job_id,
                    error=f"Failed to claim job: {reason}",
                    error_stage="claim",
                )

            # Extract job data
            self.user_id = claim_result.get("userId")
            self.actor_profile_id = claim_result.get("actorProfileId")
            self.r2_source_key = claim_result.get("r2SourceKey")
            self.gif_count = int(claim_result.get("gifCount") or DEFAULT_GIF_COUNT)
            self.max_duration = float(claim_result.get("maxDuration") or DEFAULT_GIF_DURATION)
            self.target_width = int(claim_result.get("targetWidth") or DEFAULT_GIF_WIDTH)
            self.frame_rate = int(claim_result.get("frameRate") or DEFAULT_FRAME_RATE)
            self.overlay_style = claim_result.get("overlayStyle") or "caption_bar"
            self.movie_metadata = claim_result.get("movieMetadata")
            video_title = claim_result.get("videoTitle")

            print(f"[{self.job_id}] GIF job claimed: user={self.user_id}, r2Key={self.r2_source_key}")
            print(f"[{self.job_id}] Config: count={self.gif_count}, duration={self.max_duration}s, width={self.target_width}px")

            if not self.r2_source_key:
                raise ValueError("No R2 source key in GIF job data")

            # =================================================================
            # STEP 2: Download video from R2
            # =================================================================
            await self.convex.update_gif_progress(
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
            # STEP 3: Transcribe with sentiment analysis
            # =================================================================
            await self.convex.update_gif_progress(
                self.job_id, self.lock_id, 15, "transcribing", "Transcribing audio with sentiment analysis..."
            )
            print(f"[{self.job_id}] Transcribing audio...")

            transcript_data = await self._transcribe_with_sentiment(str(audio_path))
            transcript_text = transcript_data.get("text", "")
            transcript_segments = transcript_data.get("segments", [])
            sentiment_results = transcript_data.get("sentiment_results", [])

            print(f"[{self.job_id}] Transcription complete: {len(transcript_text)} chars, {len(transcript_segments)} segments")

            # =================================================================
            # STEP 4: Detect viral moments with AI
            # =================================================================
            await self.convex.update_gif_progress(
                self.job_id, self.lock_id, 35, "analyzing", "Detecting viral moments..."
            )
            print(f"[{self.job_id}] Analyzing transcript for viral moments...")

            detected_moments = await self._detect_viral_moments(
                transcript_text=transcript_text,
                transcript_segments=transcript_segments,
                sentiment_results=sentiment_results,
                video_duration=video_duration,
            )

            # Sort by combined score and take top N
            detected_moments.sort(
                key=lambda m: (m.humor_score * 0.6 + m.viral_score * 0.4),
                reverse=True
            )
            top_moments = detected_moments[:self.gif_count]

            print(f"[{self.job_id}] Detected {len(detected_moments)} moments, selected top {len(top_moments)}")

            if not top_moments:
                raise ValueError("No viral moments detected in video")

            # Save candidate moments
            for moment in detected_moments:
                moments.append({
                    "startTime": moment.start_time,
                    "endTime": moment.end_time,
                    "transcriptText": moment.transcript_text,
                    "humorScore": moment.humor_score,
                    "viralScore": moment.viral_score,
                    "emotion": moment.emotion,
                    "reason": moment.reason,
                    "suggestedCaption": moment.suggested_caption,
                })

            # =================================================================
            # STEP 5: Generate GIFs
            # =================================================================
            await self.convex.update_gif_progress(
                self.job_id, self.lock_id, 50, "generating", "Generating GIFs..."
            )
            print(f"[{self.job_id}] Generating {len(top_moments)} GIFs...")

            for i, moment in enumerate(top_moments):
                progress = 50 + int((i / len(top_moments)) * 40)
                await self.convex.update_gif_progress(
                    self.job_id, self.lock_id, progress, "generating",
                    f"Creating GIF {i + 1}/{len(top_moments)}..."
                )

                try:
                    # Calculate actual duration (may be shorter at end of video)
                    actual_duration = min(
                        moment.end_time - moment.start_time,
                        self.max_duration,
                        video_duration - moment.start_time
                    )

                    # Determine caption text
                    caption_text = moment.suggested_caption or moment.transcript_text

                    # Generate GIF
                    gif_path = await self._create_gif(
                        video_path=str(video_path),
                        start_time=moment.start_time,
                        duration=actual_duration,
                        caption_text=caption_text if self.overlay_style != "none" else None,
                        output_index=i,
                    )

                    # Also generate MP4 version for better compatibility
                    mp4_path = await self._create_mp4_version(
                        video_path=str(video_path),
                        start_time=moment.start_time,
                        duration=actual_duration,
                        caption_text=caption_text if self.overlay_style != "none" else None,
                        output_index=i,
                    )

                    # Upload to R2
                    r2_gif_key = self._upload_gif(gif_path, i)
                    r2_mp4_key = self._upload_mp4(mp4_path, i) if mp4_path else None

                    gif_data = {
                        "index": i,
                        "r2GifKey": r2_gif_key,
                        "r2Mp4Key": r2_mp4_key,
                        "startTime": moment.start_time,
                        "endTime": moment.start_time + actual_duration,
                        "duration": actual_duration,
                        "transcriptText": moment.transcript_text,
                        "captionText": caption_text,
                        "overlayStyle": self.overlay_style,
                        "humorScore": moment.humor_score,
                        "viralScore": moment.viral_score,
                        "emotion": moment.emotion,
                        "reason": moment.reason,
                        "width": self.target_width,
                        "frameRate": self.frame_rate,
                    }
                    gifs.append(gif_data)
                    print(f"[{self.job_id}] GIF {i + 1} created and uploaded")

                except Exception as e:
                    print(f"[{self.job_id}] GIF generation failed for moment {i}: {e}")

            # =================================================================
            # STEP 6: Complete job
            # =================================================================
            await self.convex.update_gif_progress(
                self.job_id, self.lock_id, 95, "completing", "Finalizing..."
            )
            print(f"[{self.job_id}] Completing GIF job...")

            complete_result = await self.convex.complete_gif_processing(
                job_id=self.job_id,
                lock_id=self.lock_id,
                gifs=gifs,
                moments=moments,
                video_title=video_title,
                video_duration=video_duration,
            )

            if not complete_result.get("success"):
                reason = complete_result.get("reason", "Unknown")
                print(f"[{self.job_id}] Failed to complete GIF job: {reason}")
                return GifR2ProcessingResult(
                    success=False,
                    job_id=self.job_id,
                    gifs=gifs,
                    moments=moments,
                    error=f"Failed to complete job: {reason}",
                    error_stage="complete",
                    video_title=video_title,
                    video_duration=video_duration,
                )

            print(f"[{self.job_id}] GIF job completed successfully!")

            return GifR2ProcessingResult(
                success=True,
                job_id=self.job_id,
                gifs=gifs,
                moments=moments,
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
            elif "moment" in error_msg.lower() or "detect" in error_msg.lower():
                error_stage = "analysis"
            elif "gif" in error_msg.lower() or "generat" in error_msg.lower():
                error_stage = "generation"
            elif "upload" in error_msg.lower():
                error_stage = "upload"

            print(f"[{self.job_id}] GIF processing error at {error_stage}: {error_msg}")

            # Try to fail the job in Convex
            try:
                await self.convex.fail_gif_processing(
                    job_id=self.job_id,
                    lock_id=self.lock_id,
                    error=error_msg,
                    error_stage=error_stage,
                )
            except Exception as fail_error:
                print(f"[{self.job_id}] Failed to report GIF failure: {fail_error}")

            return GifR2ProcessingResult(
                success=False,
                job_id=self.job_id,
                gifs=gifs,
                moments=moments,
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

    async def _transcribe_with_sentiment(self, audio_path: str) -> Dict[str, Any]:
        """
        Transcribe audio using OpenAI Whisper API.

        Note: For enhanced sentiment analysis, AssemblyAI could be used instead
        with sentiment_analysis=True parameter. Using Whisper for simplicity
        as it's already configured in the project.
        """
        if not OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not configured")

        import httpx

        # Read audio file
        with open(audio_path, "rb") as f:
            audio_data = f.read()

        # Use OpenAI Whisper API
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                },
                files={
                    "file": ("audio.mp3", audio_data, "audio/mpeg"),
                },
                data={
                    "model": "whisper-1",
                    "response_format": "verbose_json",
                    "timestamp_granularities[]": "segment",
                },
            )

            if response.status_code != 200:
                raise Exception(f"Whisper API error: {response.status_code} - {response.text}")

            result = response.json()

        # Parse segments
        segments = []
        for seg in result.get("segments", []):
            segments.append({
                "start": seg.get("start", 0),
                "end": seg.get("end", 0),
                "text": seg.get("text", "").strip(),
            })

        return {
            "text": result.get("text", ""),
            "segments": segments,
            "sentiment_results": [],  # Would come from AssemblyAI if configured
        }

    async def _detect_viral_moments(
        self,
        transcript_text: str,
        transcript_segments: List[Dict[str, Any]],
        sentiment_results: List[Dict[str, Any]],
        video_duration: float,
    ) -> List[ViralMoment]:
        """
        Detect viral/funny moments with Gemini fallback.
        """
        if not transcript_segments:
            return []

        # Try OpenAI first, fall back to Gemini on failure
        openai_error = None
        if OPENAI_API_KEY:
            try:
                return await self._detect_viral_moments_openai(
                    transcript_segments, video_duration
                )
            except Exception as e:
                openai_error = str(e)
                print(f"[{self.job_id}] OpenAI viral detection failed: {e}, trying Gemini fallback...")

        # Try Gemini as fallback
        if GEMINI_API_KEY:
            try:
                return await self._detect_viral_moments_gemini(
                    transcript_segments, video_duration
                )
            except Exception as e:
                print(f"[{self.job_id}] Gemini viral detection also failed: {e}")
                raise Exception(f"Both APIs failed. OpenAI: {openai_error}, Gemini: {e}")

        if openai_error:
            raise Exception(f"OpenAI failed and no Gemini fallback: {openai_error}")
        raise ValueError("No API keys configured (OPENAI_API_KEY or GEMINI_API_KEY)")

    async def _detect_viral_moments_openai(
        self,
        transcript_segments: List[Dict[str, Any]],
        video_duration: float,
    ) -> List[ViralMoment]:
        """Use OpenAI GPT-4o to detect viral/funny moments."""
        # Build context from segments
        segment_text = "\n".join([
            f"[{seg['start']:.1f}s - {seg['end']:.1f}s]: {seg['text']}"
            for seg in transcript_segments
        ])

        # Movie context if available
        context_info = ""
        if self.movie_metadata:
            context_info = f"\n\nContext: This is from \"{self.movie_metadata.get('title', 'a video')}\". {self.movie_metadata.get('logline', '')} Genre: {self.movie_metadata.get('genre', 'Unknown')}"

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
                        "content": f"""You are an expert at identifying viral, funny, and shareable moments in video transcripts.
Analyze the transcript and identify the best moments for GIF generation.

Look for:
1. Humor: Funny quotes, unexpected reactions, comedic timing
2. Emotion peaks: Intense emotional moments (joy, surprise, shock)
3. Quotable lines: Memorable phrases people would share
4. Reaction moments: Expressions that could become reaction GIFs
5. Dramatic pauses or delivery: Moments with natural visual appeal

For each moment, provide:
- Start and end timestamps (ensure they cover complete thoughts, 2-{int(self.max_duration)}s long)
- The transcript text for that segment
- Humor score (0-100): How funny is this moment?
- Viral score (0-100): How shareable/memeable is this?
- Emotion: The dominant emotion (funny, shocked, excited, confused, angry, happy, sad, etc.)
- Reason: Why this moment is GIF-worthy (1-2 sentences)
- Suggested caption: Optional improved/funnier text for the GIF overlay

Return a JSON array with up to {self.gif_count * 2} moments (we'll select the best).
Return ONLY valid JSON, no markdown code blocks.""",
                    },
                    {
                        "role": "user",
                        "content": f"""Analyze this transcript for GIF-worthy moments:

{segment_text}{context_info}

Return the moments as a JSON array.""",
                    },
                ],
                "max_tokens": 2000,
                "temperature": 0.7,
            },
            timeout=60.0,
        )

        if response.status_code != 200:
            raise Exception(f"OpenAI API error: {response.status_code}")

        result = response.json()
        content = result["choices"][0]["message"]["content"]

        return self._parse_viral_moments(content, video_duration)

    async def _detect_viral_moments_gemini(
        self,
        transcript_segments: List[Dict[str, Any]],
        video_duration: float,
    ) -> List[ViralMoment]:
        """Use Google Gemini as fallback for viral moment detection."""
        # Build context from segments
        segment_text = "\n".join([
            f"[{seg['start']:.1f}s - {seg['end']:.1f}s]: {seg['text']}"
            for seg in transcript_segments
        ])

        # Movie context if available
        context_info = ""
        if self.movie_metadata:
            context_info = f"\n\nContext: This is from \"{self.movie_metadata.get('title', 'a video')}\". {self.movie_metadata.get('logline', '')} Genre: {self.movie_metadata.get('genre', 'Unknown')}"

        prompt = f"""You are an expert at identifying viral, funny, and shareable moments in video transcripts.
Analyze the transcript and identify the best moments for GIF generation.

Look for:
1. Humor: Funny quotes, unexpected reactions, comedic timing
2. Emotion peaks: Intense emotional moments (joy, surprise, shock)
3. Quotable lines: Memorable phrases people would share
4. Reaction moments: Expressions that could become reaction GIFs
5. Dramatic pauses or delivery: Moments with natural visual appeal

For each moment, provide:
- start: Start timestamp in seconds
- end: End timestamp in seconds (ensure they cover complete thoughts, 2-{int(self.max_duration)}s long)
- text: The transcript text for that segment
- humor_score: 0-100 how funny is this moment
- viral_score: 0-100 how shareable/memeable is this
- emotion: The dominant emotion (funny, shocked, excited, confused, angry, happy, sad, etc.)
- reason: Why this moment is GIF-worthy (1-2 sentences)
- suggested_caption: Optional improved/funnier text for the GIF overlay

Transcript:
{segment_text}{context_info}

Return a JSON array with up to {self.gif_count * 2} moments.
Return ONLY valid JSON, no markdown code blocks."""

        client = await self._get_http_client()

        response = await client.post(
            f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.7,
                    "maxOutputTokens": 2000,
                },
            },
            timeout=60.0,
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

        return self._parse_viral_moments(text, video_duration)

    def _parse_viral_moments(self, content: str, video_duration: float) -> List[ViralMoment]:
        """Parse viral moments from JSON response."""
        # Parse JSON from response
        try:
            moments_data = json.loads(content)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            moments_data = json.loads(content.strip())

        # Convert to ViralMoment objects
        moments = []
        for m in moments_data:
            try:
                start = float(m.get("start", m.get("startTime", m.get("start_time", 0))))
                end = float(m.get("end", m.get("endTime", m.get("end_time", start + 3))))

                # Validate times
                if start < 0:
                    start = 0
                if end > video_duration:
                    end = video_duration
                if end <= start:
                    end = min(start + self.max_duration, video_duration)

                moments.append(ViralMoment(
                    start_time=start,
                    end_time=end,
                    transcript_text=m.get("text", m.get("transcript_text", m.get("transcriptText", ""))),
                    humor_score=float(m.get("humor_score", m.get("humorScore", 50))),
                    viral_score=float(m.get("viral_score", m.get("viralScore", 50))),
                    emotion=m.get("emotion", "neutral"),
                    reason=m.get("reason", "Interesting moment"),
                    suggested_caption=m.get("suggested_caption", m.get("suggestedCaption")),
                ))
            except (KeyError, ValueError, TypeError) as e:
                print(f"[{self.job_id}] Skipping invalid moment: {e}")
                continue

        return moments

    async def _create_gif(
        self,
        video_path: str,
        start_time: float,
        duration: float,
        caption_text: Optional[str],
        output_index: int,
    ) -> str:
        """
        Create a GIF from a video segment with optional text overlay.
        Uses FFmpeg with palette optimization for high-quality GIFs.
        """
        output_path = os.path.join(self.job_dir, f"gif_{output_index}.gif")
        palette_path = os.path.join(self.job_dir, f"palette_{output_index}.png")

        # Build filter complex for text overlay
        filters = [f"fps={self.frame_rate}", f"scale={self.target_width}:-1:flags=lanczos"]

        if caption_text and self.overlay_style != "none":
            text_filter = self._build_text_filter(caption_text)
            if text_filter:
                filters.append(text_filter)

        filter_str = ",".join(filters)

        # Step 1: Generate palette for better colors
        palette_cmd = [
            "ffmpeg", "-y",
            "-ss", str(start_time),
            "-t", str(duration),
            "-i", video_path,
            "-vf", f"{filter_str},palettegen=stats_mode=diff",
            palette_path,
        ]

        result = subprocess.run(palette_cmd, capture_output=True, timeout=60)
        if result.returncode != 0:
            print(f"[{self.job_id}] Palette generation warning: {result.stderr.decode()[:200]}")
            # Fall back to simple GIF without palette
            simple_cmd = [
                "ffmpeg", "-y",
                "-ss", str(start_time),
                "-t", str(duration),
                "-i", video_path,
                "-vf", filter_str,
                output_path,
            ]
            subprocess.run(simple_cmd, capture_output=True, timeout=60)
            return output_path

        # Step 2: Generate GIF with palette
        gif_cmd = [
            "ffmpeg", "-y",
            "-ss", str(start_time),
            "-t", str(duration),
            "-i", video_path,
            "-i", palette_path,
            "-lavfi", f"{filter_str} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
            output_path,
        ]

        result = subprocess.run(gif_cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            raise Exception(f"GIF encoding failed: {result.stderr.decode()[:500]}")

        # Clean up palette
        if os.path.exists(palette_path):
            os.remove(palette_path)

        return output_path

    async def _create_mp4_version(
        self,
        video_path: str,
        start_time: float,
        duration: float,
        caption_text: Optional[str],
        output_index: int,
    ) -> Optional[str]:
        """
        Create an MP4 version of the GIF for better compatibility.
        MP4s are smaller and play better on most platforms.
        """
        output_path = os.path.join(self.job_dir, f"clip_{output_index}.mp4")

        # Build filter complex
        filters = [f"scale={self.target_width}:-2"]

        if caption_text and self.overlay_style != "none":
            text_filter = self._build_text_filter(caption_text)
            if text_filter:
                filters.append(text_filter)

        filter_str = ",".join(filters)

        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start_time),
            "-t", str(duration),
            "-i", video_path,
            "-vf", filter_str,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-an",  # No audio for GIF-like clips
            "-movflags", "+faststart",
            output_path,
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, timeout=60)
            if result.returncode == 0:
                return output_path
            else:
                print(f"[{self.job_id}] MP4 creation failed: {result.stderr.decode()[:200]}")
                return None
        except Exception as e:
            print(f"[{self.job_id}] MP4 creation error: {e}")
            return None

    def _wrap_text_for_gif(self, text: str, max_chars_per_line: int = 20) -> str:
        """
        Wrap text for GIF overlay to prevent overflow.
        Uses word-based wrapping to avoid cutting words in half.
        """
        import textwrap
        # Wrap text at max_chars_per_line characters
        wrapped = textwrap.fill(text, width=max_chars_per_line)
        return wrapped

    def _build_text_filter(self, caption_text: str) -> Optional[str]:
        """Build FFmpeg drawtext filter based on overlay style."""
        style = OVERLAY_STYLES.get(self.overlay_style, OVERLAY_STYLES["caption_bar"])

        if style.get("position") == "none":
            return None

        # Wrap text to prevent overflow - GIFs are typically 480px wide
        # With font size 32, ~20 chars per line is safe
        max_chars = 20 if self.target_width <= 480 else 25
        wrapped_text = self._wrap_text_for_gif(caption_text, max_chars)

        # Escape special characters for FFmpeg drawtext
        # Replace newlines with FFmpeg's line break syntax
        escaped_text = wrapped_text.replace("'", "'\\''").replace(":", "\\:").replace("\n", "\\n")

        # Get font settings
        font_family = style.get("fontFamily", "Arial")
        font_size = style.get("fontSize", 32)
        font_color = style.get("fontColor", "white")

        # Check for Impact font availability, fall back to DejaVu
        if font_family == "Impact":
            # Use DejaVu Sans Bold as fallback (installed in Docker image)
            font_file = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
            if not os.path.exists(font_file):
                font_file = ""
                font_family = "sans-serif"

        # Count lines for proper vertical positioning
        num_lines = wrapped_text.count('\n') + 1
        line_height = int(font_size * 1.2)  # Line height with some spacing
        total_text_height = num_lines * line_height

        # Build drawtext filter based on style
        if self.overlay_style == "meme_top_bottom":
            # Classic meme style with stroke
            stroke_color = style.get("strokeColor", "black")
            stroke_width = style.get("strokeWidth", 3)

            # Position text at bottom with proper offset for multiple lines
            return (
                f"drawtext=text='{escaped_text}'"
                f":fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
                f":fontsize={font_size}"
                f":fontcolor={font_color}"
                f":borderw={stroke_width}"
                f":bordercolor={stroke_color}"
                f":x=(w-text_w)/2"
                f":y=h-{total_text_height + 20}"
                f":line_spacing=4"
            )

        elif self.overlay_style == "caption_bar":
            # Modern caption bar with background - adjust height based on text lines
            bar_height = max(80, total_text_height + 30)
            return (
                f"drawbox=x=0:y=ih-{bar_height}:w=iw:h={bar_height}:color=black@0.7:t=fill,"
                f"drawtext=text='{escaped_text}'"
                f":fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
                f":fontsize={font_size}"
                f":fontcolor={font_color}"
                f":x=(w-text_w)/2"
                f":y=h-{total_text_height + 15}"
                f":line_spacing=4"
            )

        elif self.overlay_style == "subtitle":
            # Clean subtitle with shadow
            shadow_offset = style.get("shadowOffset", 2)
            return (
                f"drawtext=text='{escaped_text}'"
                f":fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
                f":fontsize={font_size}"
                f":fontcolor={font_color}"
                f":shadowcolor=black"
                f":shadowx={shadow_offset}"
                f":shadowy={shadow_offset}"
                f":x=(w-text_w)/2"
                f":y=h-{total_text_height + 30}"
                f":line_spacing=4"
            )

        return None

    def _upload_gif(self, gif_path: str, index: int) -> str:
        """Upload a GIF to R2."""
        r2_key = f"users/{self.user_id}/gif-jobs/{self.job_id}/gifs/gif_{index}.gif"
        self.r2.upload(
            local_path=Path(gif_path),
            r2_key=r2_key,
            content_type="image/gif",
        )
        return r2_key

    def _upload_mp4(self, mp4_path: str, index: int) -> str:
        """Upload an MP4 clip to R2."""
        r2_key = f"users/{self.user_id}/gif-jobs/{self.job_id}/clips/clip_{index}.mp4"
        self.r2.upload(
            local_path=Path(mp4_path),
            r2_key=r2_key,
            content_type="video/mp4",
        )
        return r2_key

    def cleanup(self):
        """Clean up temporary files."""
        try:
            if os.path.exists(self.job_dir):
                shutil.rmtree(self.job_dir)
                print(f"[{self.job_id}] Cleaned up GIF temp files")
        except Exception as e:
            print(f"[{self.job_id}] GIF cleanup error: {e}")
