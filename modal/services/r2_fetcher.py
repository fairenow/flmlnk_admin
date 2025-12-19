"""
R2 Fetcher - Cloudflare R2 Storage Service

Downloads source videos from R2 and uploads generated clips back.
Replaces YouTube downloader for browser-first architecture.
"""

import os
import boto3
from pathlib import Path
from typing import Optional, Tuple
from botocore.exceptions import ClientError, NoCredentialsError


class R2Fetcher:
    """
    Handles R2 storage operations for video processing.

    Downloads source videos uploaded by the browser and
    uploads generated clips back to R2.
    """

    def __init__(self, temp_dir: str = "/tmp"):
        """
        Initialize R2 client.

        Environment variables required:
        - R2_ENDPOINT_URL: R2 endpoint (e.g., https://<account>.r2.cloudflarestorage.com)
        - R2_ACCESS_KEY_ID: R2 access key
        - R2_SECRET_ACCESS_KEY: R2 secret key
        - R2_BUCKET_NAME: R2 bucket name
        """
        self.temp_dir = temp_dir
        self._client = None
        self._bucket = None

    @property
    def client(self):
        """Get or create boto3 S3 client for R2."""
        if self._client is None:
            endpoint_url = os.environ.get("R2_ENDPOINT_URL")
            access_key = os.environ.get("R2_ACCESS_KEY_ID")
            secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")

            if not all([endpoint_url, access_key, secret_key]):
                raise RuntimeError(
                    "R2 credentials not configured. "
                    "Set R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
                )

            try:
                self._client = boto3.client(
                    "s3",
                    endpoint_url=endpoint_url,
                    aws_access_key_id=access_key,
                    aws_secret_access_key=secret_key,
                    region_name="auto",  # R2 uses 'auto' region
                )
                print("Successfully initialized R2 client")
            except NoCredentialsError:
                raise RuntimeError("Invalid R2 credentials")
            except Exception as e:
                raise RuntimeError(f"Failed to initialize R2 client: {e}")

        return self._client

    @property
    def bucket(self) -> str:
        """Get R2 bucket name."""
        if self._bucket is None:
            self._bucket = os.environ.get("R2_BUCKET_NAME")
            if not self._bucket:
                raise RuntimeError("R2_BUCKET_NAME not configured")
        return self._bucket

    def download(self, r2_key: str, local_path: Optional[Path] = None) -> Path:
        """
        Download a file from R2 to local storage.

        Args:
            r2_key: The R2 object key (e.g., users/123/jobs/456/source/video.mp4)
            local_path: Optional local path. If not provided, uses temp_dir.

        Returns:
            Path to the downloaded file.
        """
        if local_path is None:
            # Extract filename from key
            filename = Path(r2_key).name
            local_path = Path(self.temp_dir) / filename

        # Ensure parent directory exists
        local_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            print(f"Downloading from R2: {r2_key}")
            self.client.download_file(self.bucket, r2_key, str(local_path))
            print(f"Downloaded to: {local_path}")
            return local_path
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            raise RuntimeError(f"Failed to download from R2: {error_code} - {e}")
        except Exception as e:
            raise RuntimeError(f"Unexpected error downloading from R2: {e}")

    def upload(self, local_path: Path, r2_key: str, content_type: Optional[str] = None) -> str:
        """
        Upload a file to R2.

        Args:
            local_path: Path to the local file.
            r2_key: The R2 object key to upload to.
            content_type: Optional MIME type.

        Returns:
            The R2 key of the uploaded file.
        """
        if not local_path.exists():
            raise FileNotFoundError(f"File not found: {local_path}")

        # Auto-detect content type if not provided
        if content_type is None:
            content_type = self._get_content_type(local_path)

        try:
            print(f"Uploading to R2: {r2_key}")
            extra_args = {"ContentType": content_type}
            self.client.upload_file(
                str(local_path),
                self.bucket,
                r2_key,
                ExtraArgs=extra_args,
            )
            print(f"Uploaded: {r2_key}")
            return r2_key
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            raise RuntimeError(f"Failed to upload to R2: {error_code} - {e}")
        except Exception as e:
            raise RuntimeError(f"Unexpected error uploading to R2: {e}")

    def upload_clip(
        self,
        clip_path: Path,
        user_id: str,
        job_id: str,
        clip_index: int,
    ) -> str:
        """
        Upload a generated clip to R2 with standard naming.

        Args:
            clip_path: Path to the clip file.
            user_id: User ID for namespacing.
            job_id: Job ID for organization.
            clip_index: Clip index number.

        Returns:
            The R2 key of the uploaded clip.
        """
        extension = clip_path.suffix or ".mp4"
        r2_key = f"users/{user_id}/jobs/{job_id}/clips/clip_{clip_index}{extension}"
        return self.upload(clip_path, r2_key, content_type="video/mp4")

    def upload_thumbnail(
        self,
        thumb_path: Path,
        user_id: str,
        job_id: str,
        clip_index: int,
    ) -> str:
        """
        Upload a clip thumbnail to R2.

        Args:
            thumb_path: Path to the thumbnail file.
            user_id: User ID for namespacing.
            job_id: Job ID for organization.
            clip_index: Clip index number.

        Returns:
            The R2 key of the uploaded thumbnail.
        """
        extension = thumb_path.suffix or ".jpg"
        r2_key = f"users/{user_id}/jobs/{job_id}/thumbs/thumb_{clip_index}{extension}"
        return self.upload(thumb_path, r2_key, content_type="image/jpeg")

    def download_source_video(self, r2_key: str, job_dir: Path) -> Tuple[Path, Path]:
        """
        Download source video and extract audio.

        This is the R2 equivalent of YouTubeDownloader.download().

        Args:
            r2_key: R2 key of the source video.
            job_dir: Directory to store downloaded files.

        Returns:
            Tuple of (video_path, audio_path)
        """
        import subprocess

        # Download video
        video_path = job_dir / "source_video.mp4"
        self.download(r2_key, video_path)

        # Extract audio using FFmpeg
        audio_path = job_dir / "audio.mp3"
        print(f"Extracting audio to: {audio_path}")

        cmd = [
            "ffmpeg",
            "-i", str(video_path),
            "-vn",  # No video
            "-acodec", "libmp3lame",
            "-ar", "16000",  # 16kHz for Whisper
            "-ac", "1",  # Mono
            "-b:a", "64k",  # Low bitrate for speech
            "-y",  # Overwrite
            str(audio_path),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"FFmpeg stderr: {result.stderr}")
            raise RuntimeError(f"Failed to extract audio: {result.stderr}")

        print(f"Audio extracted: {audio_path}")
        return video_path, audio_path

    def get_video_duration(self, video_path: Path) -> float:
        """
        Get video duration in seconds using FFprobe.

        Args:
            video_path: Path to the video file.

        Returns:
            Duration in seconds.
        """
        import subprocess
        import json

        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            str(video_path),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"Failed to get video duration: {result.stderr}")

        data = json.loads(result.stdout)
        duration = float(data.get("format", {}).get("duration", 0))
        return duration

    def _get_content_type(self, file_path: Path) -> str:
        """Map file extensions to MIME types."""
        extension_map = {
            ".mp4": "video/mp4",
            ".avi": "video/avi",
            ".mov": "video/quicktime",
            ".mkv": "video/x-matroska",
            ".webm": "video/webm",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".json": "application/json",
            ".txt": "text/plain",
            ".srt": "text/plain",
            ".vtt": "text/vtt",
        }
        return extension_map.get(file_path.suffix.lower(), "application/octet-stream")
