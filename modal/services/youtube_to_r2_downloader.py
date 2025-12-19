"""
YouTube to R2 Downloader Service

Downloads videos from YouTube and uploads them directly to R2 storage.
This decouples the download step from processing, enabling a unified
R2-based processing pipeline for all video sources.

Usage:
    downloader = YouTubeToR2Downloader(temp_dir="/tmp/download")
    result = await downloader.download_to_r2(
        video_url="https://youtube.com/watch?v=...",
        user_id="user123",
        job_id="job456",
    )
    # result = {
    #     "r2_key": "users/user123/jobs/job456/source/video.mp4",
    #     "title": "Video Title",
    #     "duration": 120.5,
    #     ...
    # }
"""

import os
import asyncio
import shutil
from pathlib import Path
from typing import Dict, Any, Optional
from dataclasses import dataclass

from .youtube_downloader import YouTubeDownloader
from .r2_fetcher import R2Fetcher


@dataclass
class YouTubeToR2Result:
    """Result of YouTube to R2 download."""
    success: bool
    r2_key: Optional[str] = None
    title: Optional[str] = None
    duration: Optional[float] = None
    uploader: Optional[str] = None
    thumbnail: Optional[str] = None
    error: Optional[str] = None
    error_stage: Optional[str] = None


class YouTubeToR2Downloader:
    """
    Downloads YouTube videos and uploads them directly to R2.

    This service bridges the gap between YouTube URLs and the R2-based
    processing pipeline. After download, the video can be processed
    using the same R2VideoProcessor used for browser uploads.
    """

    def __init__(self, temp_dir: str = "/tmp/youtube_download"):
        """
        Initialize the downloader.

        Args:
            temp_dir: Temporary directory for downloads before R2 upload.
        """
        self.temp_dir = temp_dir
        os.makedirs(temp_dir, exist_ok=True)

        # Initialize R2 client
        self.r2 = R2Fetcher(temp_dir)

    async def download_to_r2(
        self,
        video_url: str,
        user_id: str,
        job_id: str,
        quality: str = "medium",
    ) -> YouTubeToR2Result:
        """
        Download a YouTube video and upload it to R2.

        Args:
            video_url: YouTube URL to download.
            user_id: User ID for R2 path namespacing.
            job_id: Job ID for R2 path organization.
            quality: Quality preset ("high", "medium", "low").

        Returns:
            YouTubeToR2Result with r2_key and video metadata.
        """
        # Create job-specific directory
        job_dir = os.path.join(self.temp_dir, job_id)
        os.makedirs(job_dir, exist_ok=True)

        try:
            # Step 1: Download from YouTube
            print(f"[{job_id}] Downloading from YouTube: {video_url}")

            downloader = YouTubeDownloader(job_dir)
            download_result = await downloader.download(video_url, quality=quality)

            video_path = download_result.get("video_path")
            if not video_path or not os.path.exists(video_path):
                return YouTubeToR2Result(
                    success=False,
                    error="Download failed: video file not found",
                    error_stage="download",
                )

            print(f"[{job_id}] Downloaded: {download_result.get('title', 'Unknown')}")
            print(f"[{job_id}] Duration: {download_result.get('duration', 0)}s")

            # Step 2: Upload to R2
            print(f"[{job_id}] Uploading to R2...")

            r2_key = f"users/{user_id}/jobs/{job_id}/source/video.mp4"

            self.r2.upload(
                local_path=Path(video_path),
                r2_key=r2_key,
                content_type="video/mp4",
            )

            print(f"[{job_id}] Uploaded to R2: {r2_key}")

            # Return success with metadata
            return YouTubeToR2Result(
                success=True,
                r2_key=r2_key,
                title=download_result.get("title"),
                duration=download_result.get("duration"),
                uploader=download_result.get("uploader"),
                thumbnail=download_result.get("thumbnail"),
            )

        except Exception as e:
            error_msg = str(e)
            error_stage = "download"

            if "upload" in error_msg.lower() or "r2" in error_msg.lower():
                error_stage = "upload"

            print(f"[{job_id}] Error at {error_stage}: {error_msg}")

            return YouTubeToR2Result(
                success=False,
                error=error_msg,
                error_stage=error_stage,
            )

        finally:
            # Cleanup job directory
            self._cleanup(job_dir)

    def _cleanup(self, job_dir: str):
        """Clean up temporary files after upload."""
        try:
            if os.path.exists(job_dir):
                shutil.rmtree(job_dir)
                print(f"Cleaned up temp directory: {job_dir}")
        except Exception as e:
            print(f"Cleanup warning: {e}")


class YouTubeToR2DownloaderWithProgress(YouTubeToR2Downloader):
    """
    Extended downloader that reports progress via webhook.

    Used when Modal needs to report download progress back to Convex.
    """

    def __init__(
        self,
        temp_dir: str = "/tmp/youtube_download",
        webhook_callback=None,
    ):
        super().__init__(temp_dir)
        self.webhook_callback = webhook_callback

    async def _report_progress(
        self,
        job_id: str,
        status: str,
        progress: int,
        message: str,
        **extra,
    ):
        """Report progress via callback if available."""
        if self.webhook_callback:
            try:
                await self.webhook_callback(
                    job_id=job_id,
                    status=status,
                    progress=progress,
                    message=message,
                    **extra,
                )
            except Exception as e:
                print(f"Progress callback failed: {e}")

    async def download_to_r2(
        self,
        video_url: str,
        user_id: str,
        job_id: str,
        quality: str = "medium",
    ) -> YouTubeToR2Result:
        """
        Download with progress reporting.
        """
        job_dir = os.path.join(self.temp_dir, job_id)
        os.makedirs(job_dir, exist_ok=True)

        try:
            # Report: Starting download
            await self._report_progress(
                job_id, "downloading", 5, "Starting YouTube download..."
            )

            # Download from YouTube
            downloader = YouTubeDownloader(job_dir)
            download_result = await downloader.download(video_url, quality=quality)

            video_path = download_result.get("video_path")
            if not video_path or not os.path.exists(video_path):
                await self._report_progress(
                    job_id, "failed", 0, "Download failed: video file not found"
                )
                return YouTubeToR2Result(
                    success=False,
                    error="Download failed: video file not found",
                    error_stage="download",
                )

            # Report: Download complete, starting upload
            await self._report_progress(
                job_id, "downloading", 50,
                f"Downloaded: {download_result.get('title', 'Unknown')}",
                video_title=download_result.get("title"),
                video_duration=download_result.get("duration"),
            )

            # Report: Uploading to R2
            await self._report_progress(
                job_id, "uploading", 60, "Uploading to storage..."
            )

            # Upload to R2
            r2_key = f"users/{user_id}/jobs/{job_id}/source/video.mp4"

            self.r2.upload(
                local_path=Path(video_path),
                r2_key=r2_key,
                content_type="video/mp4",
            )

            # Report: Upload complete
            await self._report_progress(
                job_id, "uploaded", 100, "Video ready for processing",
                r2_key=r2_key,
            )

            return YouTubeToR2Result(
                success=True,
                r2_key=r2_key,
                title=download_result.get("title"),
                duration=download_result.get("duration"),
                uploader=download_result.get("uploader"),
                thumbnail=download_result.get("thumbnail"),
            )

        except Exception as e:
            error_msg = str(e)
            error_stage = "download"

            if "upload" in error_msg.lower() or "r2" in error_msg.lower():
                error_stage = "upload"

            await self._report_progress(
                job_id, "failed", 0, f"Error: {error_msg}"
            )

            return YouTubeToR2Result(
                success=False,
                error=error_msg,
                error_stage=error_stage,
            )

        finally:
            self._cleanup(job_dir)
