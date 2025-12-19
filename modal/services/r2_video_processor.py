"""
R2 Video Processor - Browser-First Architecture Pipeline

This module processes videos stored in R2 (uploaded by browser).
It replaces the YouTube-based VideoProcessor for the new architecture.

Key differences from VideoProcessor:
- Downloads from R2 instead of YouTube
- Uses ConvexClient for job state management
- Uploads clips back to R2 instead of Convex storage
- Uses idempotent job claiming with lock IDs
"""

import os
import asyncio
import uuid
import shutil
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field

from .r2_fetcher import R2Fetcher
from .convex_client import ConvexClient
from .transcription import TranscriptionService
from .clip_analyzer import ClipAnalyzer, AnalysisResult
from .face_detector import FaceDetector
from .video_clipper import VideoClipper
from .caption_generator import CaptionGenerator
from .segment_utils import normalize_segments
# Phase 3 imports
from .speaker_detector import SpeakerDetector


@dataclass
class R2ProcessingResult:
    """Result of R2 video processing."""
    success: bool
    job_id: str
    clips: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None
    error_stage: Optional[str] = None
    video_duration: Optional[float] = None


class R2VideoProcessor:
    """
    Video processor for browser-first architecture.

    Processes videos uploaded to R2 by the browser.
    Uses Convex internal mutations for job state management.
    """

    def __init__(
        self,
        job_id: str,
        temp_dir: str = "/tmp/video_processing",
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
        self.analyzer = ClipAnalyzer()
        self.face_detector = FaceDetector()
        self.clipper = VideoClipper(self.job_dir)
        self.caption_generator = CaptionGenerator()
        # Phase 3 services
        self.speaker_detector = SpeakerDetector()

        # Job data (populated after claiming)
        self.user_id: Optional[str] = None
        self.r2_source_key: Optional[str] = None
        self.clip_count: Optional[int] = None
        self.layout: str = "standard"
        # Clip duration controls
        self.min_clip_duration: int = 15
        self.max_clip_duration: int = 60
        # Output format
        self.aspect_ratio: str = "9:16"
        # Clip tone/style
        self.clip_tone: str = "viral"
        # Caption styling
        self.caption_style: Dict[str, Any] = {
            "highlightColor": "00FFFF",
            "fontFamily": "Arial Black",
            "fontSize": "medium",
            "fontScale": 1.0,
            "position": "center",
            "style": "word-highlight",
            "outline": True,
            "shadow": True,
        }
        # Phase 3 feature flags
        self.use_smart_thumbnails: bool = True
        self.use_ai_layout_detection: bool = True
        self.use_speaker_detection: bool = True

    async def process(self) -> R2ProcessingResult:
        """
        Run the full video processing pipeline.

        Steps:
        1. Claim job (idempotent lock)
        2. Download video from R2
        3. Extract audio
        4. Transcribe with Whisper
        5. Analyze for viral clips
        6. Detect faces
        7. Generate clips with captions
        8. Upload clips to R2
        9. Complete job in Convex
        """
        clips = []
        video_duration = None

        try:
            # =================================================================
            # STEP 1: Claim job
            # =================================================================
            print(f"[{self.job_id}] Claiming job with lock_id={self.lock_id}")

            claim_result = await self.convex.claim_job(
                job_id=self.job_id,
                lock_id=self.lock_id,
            )

            if not claim_result.get("claimed"):
                reason = claim_result.get("reason", "Unknown")
                print(f"[{self.job_id}] Failed to claim job: {reason}")
                return R2ProcessingResult(
                    success=False,
                    job_id=self.job_id,
                    error=f"Failed to claim job: {reason}",
                    error_stage="claim",
                )

            # Extract job data
            self.user_id = claim_result.get("userId")
            self.r2_source_key = claim_result.get("r2SourceKey")
            self.clip_count = int(claim_result.get("clipCount") or 5)
            self.layout = claim_result.get("layout") or "standard"

            # Extract new clip generation controls
            self.min_clip_duration = int(claim_result.get("minClipDuration") or 15)
            self.max_clip_duration = int(claim_result.get("maxClipDuration") or 60)
            self.aspect_ratio = claim_result.get("aspectRatio") or "9:16"
            self.clip_tone = claim_result.get("clipTone") or "viral"

            if claim_result.get("captionStyle"):
                self.caption_style.update(claim_result["captionStyle"])

            print(f"[{self.job_id}] Job claimed: user={self.user_id}, r2Key={self.r2_source_key}")

            if not self.r2_source_key:
                raise ValueError("No R2 source key in job data")

            # =================================================================
            # STEP 2: Download video from R2
            # =================================================================
            await self.convex.update_progress(self.job_id, self.lock_id, 5, "Downloading video...")
            print(f"[{self.job_id}] Downloading video from R2...")

            job_path = Path(self.job_dir)
            video_path, audio_path = self.r2.download_source_video(
                self.r2_source_key,
                job_path,
            )

            video_duration = self.r2.get_video_duration(video_path)
            print(f"[{self.job_id}] Video downloaded: duration={video_duration}s")

            # =================================================================
            # STEP 3: Transcribe
            # =================================================================
            await self.convex.update_progress(self.job_id, self.lock_id, 15, "Transcribing audio...")
            print(f"[{self.job_id}] Transcribing audio...")

            transcription_result = await self.transcription.transcribe(str(audio_path))
            segments = transcription_result["segments"]
            full_text = transcription_result["text"]

            print(f"[{self.job_id}] Transcription complete: {len(segments)} segments")

            # =================================================================
            # STEP 4: Analyze for viral clips
            # =================================================================
            await self.convex.update_progress(self.job_id, self.lock_id, 30, "Analyzing for viral clips...")
            print(f"[{self.job_id}] Analyzing for viral clips...")

            analysis_result: AnalysisResult = await self.analyzer.analyze(
                segments=segments,
                full_text=full_text,
                video_duration=video_duration or 0,
                num_clips=self.clip_count,
                min_duration=self.min_clip_duration,
                max_duration=self.max_clip_duration,
                clip_tone=self.clip_tone,
            )

            clip_suggestions = analysis_result.clips
            detected_content_type = analysis_result.content_type
            ai_caption_color = analysis_result.caption_color

            print(f"[{self.job_id}] Found {len(clip_suggestions)} clip suggestions")

            # Refine clip boundaries to snap to sentence endings
            clip_suggestions = self.analyzer.refine_clip_boundaries(
                clips=clip_suggestions,
                segments=segments,
                min_duration=self.min_clip_duration,
                max_duration=self.max_clip_duration,
            )
            print(f"[{self.job_id}] Refined clip boundaries to sentence endings")

            # Save timestamps to Convex
            timestamps = [
                {
                    "start": clip["start_time"],
                    "end": clip["end_time"],
                    "reason": clip.get("title", ""),
                    "score": clip.get("score", 50),
                }
                for clip in clip_suggestions
            ]
            await self.convex.save_clip_timestamps(
                job_id=self.job_id,
                timestamps=timestamps,
                source="ai_analysis",
            )

            # Auto-detect layout if needed (Phase 3.3: AI Layout Detection)
            if self.layout == "auto":
                if self.use_ai_layout_detection:
                    # Use GPT-4o Vision for accurate layout detection
                    print(f"[{self.job_id}] Running AI layout detection...")
                    await self.convex.update_progress(
                        self.job_id, self.lock_id, 35,
                        "Detecting optimal layout..."
                    )
                    layout_result = await self.analyzer.detect_optimal_layout(
                        video_path=str(video_path),
                        num_samples=3,
                    )
                    self.layout = layout_result.get("layout", "standard")
                    layout_confidence = layout_result.get("confidence", 0)
                    layout_reason = layout_result.get("reason", "")
                    print(f"[{self.job_id}] AI layout detection: {self.layout} "
                          f"(confidence: {layout_confidence:.2f}, reason: {layout_reason})")
                else:
                    # Fallback to transcript-based detection
                    layout_mapping = {
                        "gaming": "gaming",
                        "podcast": "podcast",
                        "educational": "standard",
                        "vlog": "standard",
                        "entertainment": "standard",
                    }
                    self.layout = layout_mapping.get(detected_content_type, "standard")
                    print(f"[{self.job_id}] Auto-detected layout (transcript): {self.layout}")

            # Use AI caption color if default
            if self.caption_style.get("highlightColor") == "00FFFF":
                self.caption_style["highlightColor"] = ai_caption_color

            # =================================================================
            # STEP 5: Detect faces
            # =================================================================
            await self.convex.update_progress(self.job_id, self.lock_id, 45, "Detecting faces...")
            print(f"[{self.job_id}] Detecting faces...")

            face_results = await self.face_detector.detect_faces(
                video_path=str(video_path),
                clip_times=[(s["start_time"], s["end_time"]) for s in clip_suggestions],
            )

            # =================================================================
            # STEP 5b: Speaker Detection (Phase 3.1) - for podcast/interview content
            # =================================================================
            speaker_results = {}
            if self.use_speaker_detection and self.layout == "podcast":
                await self.convex.update_progress(
                    self.job_id, self.lock_id, 50,
                    "Analyzing speakers..."
                )
                print(f"[{self.job_id}] Running speaker detection for podcast layout...")

                for i, suggestion in enumerate(clip_suggestions):
                    face_data = face_results.get(i, {})
                    faces = face_data.get("positions", [])

                    if len(faces) >= 2:
                        # Detect who is speaking when
                        try:
                            speaker_segments = await self.speaker_detector.detect_active_speakers(
                                video_path=str(video_path),
                                start_time=suggestion["start_time"],
                                end_time=suggestion["end_time"],
                                faces=faces,
                            )

                            if speaker_segments:
                                timeline = self.speaker_detector.get_speaker_timeline(
                                    speaker_segments,
                                    suggestion["end_time"] - suggestion["start_time"],
                                )
                                speaker_results[i] = {
                                    "segments": speaker_segments,
                                    "timeline": timeline,
                                    "dominant_speaker": timeline.get("dominant_speaker", 0),
                                }
                                print(f"[{self.job_id}] Clip {i + 1}: "
                                      f"detected {len(speaker_segments)} speaker segments, "
                                      f"dominant speaker: {timeline.get('dominant_speaker', 0)}")
                        except Exception as e:
                            print(f"[{self.job_id}] Speaker detection failed for clip {i + 1}: {e}")

            # =================================================================
            # STEP 6: Generate clips and upload to R2
            # =================================================================
            await self.convex.update_progress(self.job_id, self.lock_id, 55, "Generating clips...")
            print(f"[{self.job_id}] Generating {len(clip_suggestions)} clips...")

            for i, suggestion in enumerate(clip_suggestions):
                # Calculate progress: 55% to 90% for clip generation
                clip_progress = 55 + int((i / len(clip_suggestions)) * 35)
                await self.convex.update_progress(
                    self.job_id, self.lock_id, clip_progress,
                    f"Generating clip {i + 1}/{len(clip_suggestions)}..."
                )
                print(f"[{self.job_id}] Generating clip {i + 1}/{len(clip_suggestions)}")

                # Get face data for this clip
                face_data = face_results.get(i, {})

                # Get segments for this clip
                clip_segments = self._get_segments_for_clip(
                    segments=segments,
                    start_time=suggestion["start_time"],
                    end_time=suggestion["end_time"],
                )

                # Generate ASS captions
                ass_content = self.caption_generator.generate(
                    segments=clip_segments,
                    clip_start=suggestion["start_time"],
                    clip_end=suggestion["end_time"],
                    highlight_color=self.caption_style.get("highlightColor", "00FFFF"),
                    font_scale=self.caption_style.get("fontScale", 1.0),
                    position=self.caption_style.get("position", "bottom"),
                )

                # Render clip (Phase 3.2: Smart Thumbnail Selection)
                if self.use_smart_thumbnails:
                    clip_result = await self.clipper.create_clip_with_smart_thumbnail(
                        video_path=str(video_path),
                        start_time=suggestion["start_time"],
                        end_time=suggestion["end_time"],
                        ass_content=ass_content,
                        layout=self.layout,
                        aspect_ratio=self.aspect_ratio,
                        face_positions=face_data.get("positions", []),
                        clip_index=i,
                        use_smart_thumbnail=True,
                    )
                else:
                    clip_result = await self.clipper.create_clip(
                        video_path=str(video_path),
                        start_time=suggestion["start_time"],
                        end_time=suggestion["end_time"],
                        ass_content=ass_content,
                        layout=self.layout,
                        aspect_ratio=self.aspect_ratio,
                        face_positions=face_data.get("positions", []),
                        clip_index=i,
                    )

                # Upload clip to R2
                clip_path = Path(clip_result["output_path"])
                r2_clip_key = self.r2.upload_clip(
                    clip_path=clip_path,
                    user_id=self.user_id,
                    job_id=self.job_id,
                    clip_index=i,
                )

                # Upload thumbnail if exists
                r2_thumb_key = None
                if clip_result.get("thumbnail_path"):
                    thumb_path = Path(clip_result["thumbnail_path"])
                    r2_thumb_key = self.r2.upload_thumbnail(
                        thumb_path=thumb_path,
                        user_id=self.user_id,
                        job_id=self.job_id,
                        clip_index=i,
                    )

                # Build clip data
                clip_data = {
                    "index": i,
                    "r2Key": r2_clip_key,
                    "thumbnailR2Key": r2_thumb_key,
                    "title": suggestion.get("title", f"Clip {i + 1}"),
                    "description": suggestion.get("description", ""),
                    "transcript": suggestion.get("transcript", ""),
                    "duration": suggestion["end_time"] - suggestion["start_time"],
                    "startTime": suggestion["start_time"],
                    "endTime": suggestion["end_time"],
                    "score": suggestion.get("score", 50),
                    "hasFaces": face_data.get("has_faces", False),
                    "layout": self.layout,
                    "captionStyle": self.caption_style.get("position", "bottom"),
                    "viralAnalysis": suggestion.get("viral_analysis"),
                    # Phase 3 metadata
                    "smartThumbnail": clip_result.get("smart_thumbnail", False),
                }

                # Add speaker analysis data if available (Phase 3.1)
                if i in speaker_results:
                    speaker_data = speaker_results[i]
                    clip_data["speakerAnalysis"] = {
                        "dominantSpeaker": speaker_data.get("dominant_speaker", 0),
                        "speakerCount": len(speaker_data.get("timeline", {}).get("speakers", [])),
                        "turnCount": len(speaker_data.get("segments", [])),
                    }

                clips.append(clip_data)
                print(f"[{self.job_id}] Clip {i + 1} uploaded: {r2_clip_key}")

            # =================================================================
            # STEP 7: Complete job
            # =================================================================
            await self.convex.update_progress(self.job_id, self.lock_id, 95, "Finalizing...")
            print(f"[{self.job_id}] Completing job...")

            complete_result = await self.convex.complete_processing(
                job_id=self.job_id,
                lock_id=self.lock_id,
                clips=clips,
                video_duration=video_duration,
            )

            if not complete_result.get("success"):
                reason = complete_result.get("reason", "Unknown")
                print(f"[{self.job_id}] Failed to complete job: {reason}")
                return R2ProcessingResult(
                    success=False,
                    job_id=self.job_id,
                    clips=clips,
                    error=f"Failed to complete job: {reason}",
                    error_stage="complete",
                    video_duration=video_duration,
                )

            print(f"[{self.job_id}] Job completed successfully!")

            return R2ProcessingResult(
                success=True,
                job_id=self.job_id,
                clips=clips,
                video_duration=video_duration,
            )

        except Exception as e:
            error_msg = str(e)
            error_stage = "processing"

            # Determine error stage
            if "claim" in error_msg.lower():
                error_stage = "claim"
            elif "download" in error_msg.lower() or "r2" in error_msg.lower():
                error_stage = "download"
            elif "transcri" in error_msg.lower():
                error_stage = "transcription"
            elif "analyz" in error_msg.lower():
                error_stage = "analysis"
            elif "face" in error_msg.lower():
                error_stage = "face_detection"
            elif "clip" in error_msg.lower():
                error_stage = "clip_generation"
            elif "upload" in error_msg.lower():
                error_stage = "upload"

            print(f"[{self.job_id}] Processing error at {error_stage}: {error_msg}")

            # Try to fail the job in Convex
            try:
                await self.convex.fail_processing(
                    job_id=self.job_id,
                    lock_id=self.lock_id,
                    error=error_msg,
                    error_stage=error_stage,
                )
            except Exception as fail_error:
                print(f"[{self.job_id}] Failed to report failure: {fail_error}")

            return R2ProcessingResult(
                success=False,
                job_id=self.job_id,
                clips=clips,
                error=error_msg,
                error_stage=error_stage,
                video_duration=video_duration,
            )

        finally:
            # Close Convex client
            await self.convex.close()

    def _get_segments_for_clip(
        self,
        segments: List[Dict[str, Any]],
        start_time: float,
        end_time: float,
    ) -> List[Dict[str, Any]]:
        """Extract segments that fall within the clip time range."""
        normalized = normalize_segments(segments)
        clip_segments = []

        for segment in normalized:
            seg_start = segment.get("start", 0)
            seg_end = segment.get("end", 0)

            if seg_end >= start_time and seg_start <= end_time:
                adjusted_segment = segment.copy()
                adjusted_segment["start"] = max(seg_start - start_time, 0)
                adjusted_segment["end"] = min(seg_end - start_time, end_time - start_time)

                if "words" in adjusted_segment:
                    adjusted_words = []
                    for word in adjusted_segment["words"]:
                        word_start = word.get("start", 0)
                        word_end = word.get("end", 0)
                        if word_end >= start_time and word_start <= end_time:
                            adjusted_word = word.copy()
                            adjusted_word["start"] = max(word_start - start_time, 0)
                            adjusted_word["end"] = min(word_end - start_time, end_time - start_time)
                            adjusted_words.append(adjusted_word)
                    adjusted_segment["words"] = adjusted_words

                clip_segments.append(adjusted_segment)

        return clip_segments

    def cleanup(self):
        """Clean up temporary files."""
        try:
            if os.path.exists(self.job_dir):
                shutil.rmtree(self.job_dir)
                print(f"[{self.job_id}] Cleaned up temp files")
        except Exception as e:
            print(f"[{self.job_id}] Cleanup error: {e}")
