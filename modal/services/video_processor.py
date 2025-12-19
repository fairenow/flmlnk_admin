"""
Video Processor - Main Pipeline Orchestration

This module orchestrates the entire video processing pipeline:
1. Download video (yt-dlp)
2. Extract/compress audio
3. Transcribe (Whisper API)
4. Analyze for clips (GPT-4o)
5. Detect faces (MediaPipe)
6. Generate clips (FFmpeg + ASS captions)
7. Upload to Convex storage
8. Send results via webhook
"""

import os
import asyncio
import hashlib
import shutil
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field

import httpx

from .youtube_downloader import YouTubeDownloader
from .transcription import TranscriptionService
from .clip_analyzer import ClipAnalyzer, AnalysisResult
from .face_detector import FaceDetector
from .video_clipper import VideoClipper
from .caption_generator import CaptionGenerator
from .convex_storage import ConvexStorage, ClipMetadata
from .segment_utils import get_segment_value, normalize_segments


@dataclass
class ProcessingResult:
    """Result of video processing."""
    success: bool
    job_id: str
    clips: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None
    video_title: Optional[str] = None
    video_duration: Optional[float] = None


class VideoProcessor:
    """
    Main video processing pipeline orchestrator.
    """

    def __init__(
        self,
        job_id: str,
        webhook_url: Optional[str] = None,
        webhook_secret: Optional[str] = None,
        temp_dir: str = "/tmp/video_processing",
    ):
        self.job_id = job_id
        self.webhook_url = webhook_url
        self.webhook_secret = webhook_secret
        self.temp_dir = temp_dir
        self.job_dir = os.path.join(temp_dir, job_id)

        # Create job-specific directory
        os.makedirs(self.job_dir, exist_ok=True)

        # Initialize services
        self.downloader = YouTubeDownloader(self.job_dir)
        self.transcription = TranscriptionService()
        self.analyzer = ClipAnalyzer()
        self.face_detector = FaceDetector()
        self.clipper = VideoClipper(self.job_dir)
        self.caption_generator = CaptionGenerator()
        self.storage = ConvexStorage()

        # HTTP client for webhooks
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _get_http_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=30.0)
        return self._http_client

    async def _send_webhook(
        self,
        endpoint: str,
        data: Dict[str, Any],
    ) -> bool:
        """Send webhook to Convex."""
        if not self.webhook_url:
            return False

        try:
            client = await self._get_http_client()
            headers = {"Content-Type": "application/json"}
            if self.webhook_secret:
                headers["Authorization"] = f"Bearer {self.webhook_secret}"

            response = await client.post(
                f"{self.webhook_url}{endpoint}",
                json=data,
                headers=headers,
            )
            return response.status_code == 200
        except Exception as e:
            print(f"Webhook error: {e}")
            return False

    async def _update_progress(
        self,
        status: str,
        progress: int,
        current_step: str,
        video_title: Optional[str] = None,
        video_duration: Optional[float] = None,
        error: Optional[str] = None,
    ):
        """Send progress update to Convex."""
        data = {
            "externalJobId": self.job_id,
            "status": status,
            "progress": progress,
            "currentStep": current_step,
        }
        if video_title:
            data["videoTitle"] = video_title
        if video_duration is not None:
            data["videoDuration"] = video_duration
        if error:
            data["error"] = error

        await self._send_webhook("/modal/progress", data)

    async def _send_clip(self, clip_data: Dict[str, Any]):
        """Send a generated clip to Convex."""
        await self._send_webhook("/modal/clip", {
            "externalJobId": self.job_id,
            "clip": clip_data,
        })

    async def _complete_job(self, success: bool, error: Optional[str] = None):
        """Mark job as complete."""
        await self._send_webhook("/modal/complete", {
            "externalJobId": self.job_id,
            "success": success,
            "error": error,
        })

    def _get_video_hash(self, video_url: str) -> str:
        """Generate a hash for the video URL for caching."""
        return hashlib.sha256(video_url.encode()).hexdigest()[:16]

    async def _check_transcription_cache(self, video_hash: str) -> Optional[Dict[str, Any]]:
        """Check if transcription exists in Convex cache."""
        if not self.webhook_url:
            return None

        try:
            client = await self._get_http_client()
            headers = {}
            if self.webhook_secret:
                headers["Authorization"] = f"Bearer {self.webhook_secret}"

            response = await client.get(
                f"{self.webhook_url}/modal/transcription",
                params={"videoHash": video_hash},
                headers=headers,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("exists"):
                    transcription = data.get("transcription")
                    # Validate that we have a proper transcription dict with segments
                    if (
                        isinstance(transcription, dict)
                        and transcription.get("segments") is not None
                    ):
                        return transcription
                    print(f"Cached transcription for {video_hash} is invalid or incomplete, will re-transcribe")
        except Exception as e:
            print(f"Transcription cache check error: {e}")

        return None

    async def _save_transcription_cache(
        self,
        video_hash: str,
        video_url: str,
        video_title: Optional[str],
        video_duration: Optional[float],
        segments: List[Dict[str, Any]],
        full_text: str,
        language: Optional[str] = None,
        model: str = "whisper-1",
    ):
        """Save transcription to Convex cache."""
        await self._send_webhook("/modal/transcription", {
            "videoHash": video_hash,
            "sourceVideoUrl": video_url,
            "videoTitle": video_title,
            "videoDuration": video_duration,
            "segments": segments,
            "fullText": full_text,
            "language": language,
            "model": model,
        })

    async def process(
        self,
        video_url: str,
        num_clips: int = 5,
        layout: str = "standard",
        caption_style: Optional[Dict[str, Any]] = None,
    ) -> ProcessingResult:
        """
        Run the full video processing pipeline.
        """
        if caption_style is None:
            caption_style = {
                "highlightColor": "00FFFF",
                "fontScale": 1.0,
                "position": "bottom",
            }

        video_hash = self._get_video_hash(video_url)
        video_title = None
        video_duration = None
        clips = []

        try:
            # =================================================================
            # STEP 1: Download video
            # =================================================================
            await self._update_progress(
                status="downloading",
                progress=5,
                current_step="Downloading video...",
            )

            download_result = await self.downloader.download(video_url)
            video_path = download_result["video_path"]
            audio_path = download_result["audio_path"]
            video_title = download_result.get("title")
            video_duration = download_result.get("duration")
            print(f"Video downloaded: title={video_title}, duration={video_duration} (type: {type(video_duration).__name__})")

            await self._update_progress(
                status="downloading",
                progress=20,
                current_step="Video downloaded successfully",
                video_title=video_title,
                video_duration=video_duration,
            )

            # =================================================================
            # STEP 2: Transcribe (or use cache)
            # =================================================================
            await self._update_progress(
                status="transcribing",
                progress=25,
                current_step="Checking transcription cache...",
            )

            # Check cache first
            cached_transcription = await self._check_transcription_cache(video_hash)

            if cached_transcription:
                print(f"Using cached transcription for {video_hash}")
                # Handle potential None values from cached data (JSON null becomes Python None)
                segments = cached_transcription.get("segments") or []
                full_text = cached_transcription.get("fullText") or ""
                print(f"Cached transcription: {len(segments)} segments, fullText length={len(full_text)}")
                if segments:
                    print(f"First segment: {segments[0]}")
                    print(f"Last segment: {segments[-1]}")
            else:
                await self._update_progress(
                    status="transcribing",
                    progress=30,
                    current_step="Transcribing audio with Whisper...",
                )

                transcription_result = await self.transcription.transcribe(audio_path)
                segments = transcription_result["segments"]
                full_text = transcription_result["text"]

                # Save to cache
                await self._save_transcription_cache(
                    video_hash=video_hash,
                    video_url=video_url,
                    video_title=video_title,
                    video_duration=video_duration,
                    segments=segments,
                    full_text=full_text,
                    language=transcription_result.get("language"),
                )

            await self._update_progress(
                status="transcribing",
                progress=45,
                current_step="Transcription complete",
            )

            # =================================================================
            # STEP 3: Analyze for viral clips
            # =================================================================
            await self._update_progress(
                status="analyzing",
                progress=50,
                current_step="Analyzing content for viral clips...",
            )

            effective_duration = video_duration or 0
            print(f"Calling clip analyzer: video_duration={video_duration} -> effective_duration={effective_duration}, num_clips={num_clips}")
            if effective_duration == 0:
                print("WARNING: video_duration is 0 or None! All clips may fail validation.")

            analysis_result: AnalysisResult = await self.analyzer.analyze(
                segments=segments,
                full_text=full_text,
                video_duration=effective_duration,
                num_clips=num_clips,
            )

            clip_suggestions = analysis_result.clips
            detected_content_type = analysis_result.content_type
            ai_caption_color = analysis_result.caption_color
            ai_caption_font = analysis_result.caption_font

            print(f"Clip analyzer returned {len(clip_suggestions)} clip suggestions")
            print(f"AI detected content: type={detected_content_type}, color=#{ai_caption_color}, font={ai_caption_font}")

            # Use AI-detected content type for layout if layout is "auto" or not specified
            if layout == "auto":
                # Map content type to layout
                layout_mapping = {
                    "gaming": "gaming",
                    "podcast": "podcast",
                    "educational": "standard",
                    "vlog": "standard",
                    "entertainment": "standard",
                }
                layout = layout_mapping.get(detected_content_type, "standard")
                print(f"Auto-detected layout: {layout} (from content_type: {detected_content_type})")

            # Use AI-suggested caption color if not explicitly provided
            if caption_style.get("highlightColor") == "00FFFF":  # Default value
                caption_style["highlightColor"] = ai_caption_color
                print(f"Using AI-suggested caption color: #{ai_caption_color}")

            if len(clip_suggestions) == 0:
                print("WARNING: No clip suggestions returned from analyzer!")
            else:
                for i, clip in enumerate(clip_suggestions):
                    print(f"  Clip {i+1}: {clip.get('start_time')}-{clip.get('end_time')}s, title={clip.get('title', 'N/A')[:50]}")
            await self._update_progress(
                status="analyzing",
                progress=60,
                current_step=f"Found {len(clip_suggestions)} potential clips",
            )

            # =================================================================
            # STEP 4: Detect faces in video
            # =================================================================
            await self._update_progress(
                status="detecting",
                progress=65,
                current_step="Detecting faces in video...",
            )

            face_results = await self.face_detector.detect_faces(
                video_path=video_path,
                clip_times=[(s["start_time"], s["end_time"]) for s in clip_suggestions],
            )

            # =================================================================
            # STEP 5: Generate clips
            # =================================================================
            await self._update_progress(
                status="clipping",
                progress=70,
                current_step="Generating video clips...",
            )

            total_clips = len(clip_suggestions)
            for i, suggestion in enumerate(clip_suggestions):
                clip_progress = 70 + int((i / total_clips) * 20)

                await self._update_progress(
                    status="clipping",
                    progress=clip_progress,
                    current_step=f"Generating clip {i + 1} of {total_clips}...",
                )

                # Get face positions for this clip
                face_data = face_results.get(i, {})

                # Get word-level segments for this clip
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
                    highlight_color=caption_style.get("highlightColor", "00FFFF"),
                    font_scale=caption_style.get("fontScale", 1.0),
                    position=caption_style.get("position", "bottom"),
                )

                # Render clip with captions
                clip_result = await self.clipper.create_clip(
                    video_path=video_path,
                    start_time=suggestion["start_time"],
                    end_time=suggestion["end_time"],
                    ass_content=ass_content,
                    layout=layout,
                    face_positions=face_data.get("positions", []),
                    clip_index=i,
                )

                # =================================================================
                # STEP 6: Upload to Convex Storage
                # =================================================================
                await self._update_progress(
                    status="uploading",
                    progress=90 + int((i / total_clips) * 8),
                    current_step=f"Uploading clip {i + 1} of {total_clips}...",
                )

                # Build clip metadata
                clip_metadata = ClipMetadata(
                    externalClipId=f"{self.job_id}_clip_{i:02d}",
                    title=suggestion.get("title", f"Clip {i + 1}"),
                    description=suggestion.get("description", ""),
                    transcript=suggestion.get("transcript", ""),
                    duration=suggestion["end_time"] - suggestion["start_time"],
                    startTime=suggestion["start_time"],
                    endTime=suggestion["end_time"],
                    score=suggestion.get("score", 50),
                    videoTitle=video_title,
                    hasFaces=face_data.get("has_faces", False),
                    facePositions=face_data.get("positions", []),
                    layout=layout,
                    captionStyle=caption_style.get("position", "bottom"),
                    viralAnalysis=suggestion.get("viral_analysis"),
                )

                # Upload clip and thumbnail directly to Convex storage
                # This handles: create pending record -> upload video -> upload thumbnail -> confirm
                upload_result = await self.storage.upload_clip(
                    external_job_id=self.job_id,
                    clip_path=clip_result["output_path"],
                    thumbnail_path=clip_result.get("thumbnail_path"),
                    metadata=clip_metadata,
                )

                # Build clip data for result
                clip_data = {
                    "clipId": upload_result["clipId"],
                    "externalClipId": clip_metadata.externalClipId,
                    "title": clip_metadata.title,
                    "description": clip_metadata.description,
                    "transcript": clip_metadata.transcript,
                    "storageId": upload_result["storageId"],
                    "downloadUrl": upload_result.get("url"),
                    "thumbnailStorageId": upload_result.get("thumbnailStorageId"),
                    "thumbnailUrl": upload_result.get("thumbnailUrl"),
                    "duration": clip_metadata.duration,
                    "startTime": clip_metadata.startTime,
                    "endTime": clip_metadata.endTime,
                    "score": clip_metadata.score,
                    "videoTitle": video_title,
                    "hasFaces": face_data.get("has_faces", False),
                    "facePositions": face_data.get("positions", []),
                    "layout": layout,
                    "captionStyle": caption_style.get("position", "bottom"),
                    "viralAnalysis": suggestion.get("viral_analysis"),
                }

                clips.append(clip_data)

            # =================================================================
            # STEP 7: Complete
            # =================================================================
            await self._update_progress(
                status="completed",
                progress=100,
                current_step="All clips generated successfully!",
            )

            await self._complete_job(success=True)

            return ProcessingResult(
                success=True,
                job_id=self.job_id,
                clips=clips,
                video_title=video_title,
                video_duration=video_duration,
            )

        except Exception as e:
            error_msg = str(e)
            print(f"Processing error: {error_msg}")

            await self._update_progress(
                status="failed",
                progress=0,
                current_step="Processing failed",
                error=error_msg,
            )

            await self._complete_job(success=False, error=error_msg)

            return ProcessingResult(
                success=False,
                job_id=self.job_id,
                error=error_msg,
            )

        finally:
            # Close HTTP client
            if self._http_client:
                await self._http_client.aclose()

            # Close storage client
            if self.storage:
                await self.storage.close()

    def _get_segments_for_clip(
        self,
        segments: List[Dict[str, Any]],
        start_time: float,
        end_time: float,
    ) -> List[Dict[str, Any]]:
        """Extract segments that fall within the clip time range."""
        # Normalize segments to handle both dict and TranscriptionSegment objects
        normalized = normalize_segments(segments)
        clip_segments = []

        for segment in normalized:
            seg_start = segment.get("start", 0)
            seg_end = segment.get("end", 0)

            # Check if segment overlaps with clip
            if seg_end >= start_time and seg_start <= end_time:
                # Adjust times relative to clip start
                adjusted_segment = segment.copy()
                adjusted_segment["start"] = max(seg_start - start_time, 0)
                adjusted_segment["end"] = min(seg_end - start_time, end_time - start_time)

                # Adjust word timings if present
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
        except Exception as e:
            print(f"Cleanup error: {e}")
