"""
Video Cache Service for Modal

Caches downloaded videos and transcriptions to avoid re-processing.
Uses R2 for persistent storage with local file caching during processing.

Cache structure in R2:
    cache/{video_id}/
        metadata.json       # Video metadata (title, duration, source)
        video.mp4          # Downloaded video file
        transcription.json # Transcription with segments and full text
"""

import os
import json
import hashlib
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from dataclasses import dataclass, field


@dataclass
class CacheEntry:
    """Cached video entry."""
    video_id: str
    video_path: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    transcription: Optional[Dict[str, Any]] = None
    cached_at: Optional[str] = None
    expires_at: Optional[str] = None


class VideoCache:
    """
    Service for caching downloaded videos and their transcriptions.

    Features:
    - Caches videos by ID (YouTube video ID or content hash)
    - Stores transcription with word-level timings
    - Configurable TTL for cache entries
    - R2 storage backend for persistence (optional)
    """

    def __init__(
        self,
        cache_dir: str = "/tmp/video_cache",
        ttl_days: int = 7,
        r2_client=None,
        r2_bucket: str = None,
    ):
        """
        Initialize the video cache.

        Args:
            cache_dir: Local cache directory
            ttl_days: Cache entry time-to-live in days
            r2_client: Optional R2/S3 client for persistent storage
            r2_bucket: R2 bucket name for persistent storage
        """
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.ttl_days = ttl_days
        self.r2_client = r2_client
        self.r2_bucket = r2_bucket

    def _get_cache_path(self, video_id: str) -> Path:
        """Get the cache directory for a specific video."""
        return self.cache_dir / video_id

    def _get_r2_prefix(self, video_id: str) -> str:
        """Get the R2 key prefix for a video."""
        return f"cache/{video_id}"

    @staticmethod
    def generate_video_id(source_url: str) -> str:
        """
        Generate a unique video ID from the source URL.

        For YouTube URLs, extracts the video ID.
        For other URLs, generates a hash.
        """
        # Try to extract YouTube video ID
        import re
        youtube_patterns = [
            r'(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]{11})',
            r'youtube\.com/embed/([a-zA-Z0-9_-]{11})',
            r'youtube\.com/v/([a-zA-Z0-9_-]{11})',
        ]

        for pattern in youtube_patterns:
            match = re.search(pattern, source_url)
            if match:
                return match.group(1)

        # Generate hash for other URLs
        return hashlib.sha256(source_url.encode()).hexdigest()[:16]

    def has_video(self, video_id: str) -> bool:
        """Check if video is cached locally or in R2."""
        local_path = self._get_cache_path(video_id) / "video.mp4"
        if local_path.exists():
            return True

        # Check R2 if configured
        if self.r2_client and self.r2_bucket:
            try:
                r2_key = f"{self._get_r2_prefix(video_id)}/video.mp4"
                self.r2_client.head_object(Bucket=self.r2_bucket, Key=r2_key)
                return True
            except Exception:
                pass

        return False

    def has_transcription(self, video_id: str) -> bool:
        """Check if transcription is cached."""
        local_path = self._get_cache_path(video_id) / "transcription.json"
        if local_path.exists():
            return True

        # Check R2 if configured
        if self.r2_client and self.r2_bucket:
            try:
                r2_key = f"{self._get_r2_prefix(video_id)}/transcription.json"
                self.r2_client.head_object(Bucket=self.r2_bucket, Key=r2_key)
                return True
            except Exception:
                pass

        return False

    def get_cached_video_path(self, video_id: str) -> Optional[str]:
        """
        Get path to cached video, downloading from R2 if needed.

        Returns:
            Path to local video file, or None if not cached
        """
        cache_path = self._get_cache_path(video_id)
        local_path = cache_path / "video.mp4"

        # Check local cache first
        if local_path.exists():
            return str(local_path)

        # Try to download from R2
        if self.r2_client and self.r2_bucket:
            try:
                r2_key = f"{self._get_r2_prefix(video_id)}/video.mp4"
                cache_path.mkdir(parents=True, exist_ok=True)

                self.r2_client.download_file(
                    self.r2_bucket,
                    r2_key,
                    str(local_path),
                )
                print(f"Downloaded cached video from R2: {video_id}")
                return str(local_path)
            except Exception as e:
                print(f"Failed to download cached video from R2: {e}")

        return None

    def get_cached_metadata(self, video_id: str) -> Optional[Dict[str, Any]]:
        """Get cached video metadata."""
        cache_path = self._get_cache_path(video_id)
        local_path = cache_path / "metadata.json"

        # Check local cache first
        if local_path.exists():
            try:
                with open(local_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error reading cached metadata: {e}")

        # Try to download from R2
        if self.r2_client and self.r2_bucket:
            try:
                r2_key = f"{self._get_r2_prefix(video_id)}/metadata.json"
                cache_path.mkdir(parents=True, exist_ok=True)

                self.r2_client.download_file(
                    self.r2_bucket,
                    r2_key,
                    str(local_path),
                )

                with open(local_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"Failed to get cached metadata from R2: {e}")

        return None

    def get_cached_transcription(self, video_id: str) -> Optional[Dict[str, Any]]:
        """
        Get cached transcription with segments.

        Returns:
            Dict with 'text', 'segments', 'language', 'duration'
        """
        cache_path = self._get_cache_path(video_id)
        local_path = cache_path / "transcription.json"

        # Check local cache first
        if local_path.exists():
            try:
                with open(local_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error reading cached transcription: {e}")

        # Try to download from R2
        if self.r2_client and self.r2_bucket:
            try:
                r2_key = f"{self._get_r2_prefix(video_id)}/transcription.json"
                cache_path.mkdir(parents=True, exist_ok=True)

                self.r2_client.download_file(
                    self.r2_bucket,
                    r2_key,
                    str(local_path),
                )

                with open(local_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"Failed to get cached transcription from R2: {e}")

        return None

    def save_video(
        self,
        video_id: str,
        source_path: str,
        metadata: Dict[str, Any],
    ) -> str:
        """
        Cache a downloaded video.

        Args:
            video_id: Video identifier
            source_path: Path to the downloaded video file
            metadata: Video metadata (title, duration, source, etc.)

        Returns:
            Path to the cached video file
        """
        import shutil

        cache_path = self._get_cache_path(video_id)
        cache_path.mkdir(parents=True, exist_ok=True)

        # Copy video to cache
        video_path = cache_path / "video.mp4"
        source = Path(source_path)

        if source.exists() and not video_path.exists():
            shutil.copy2(source, video_path)
            print(f"Cached video for {video_id}: {video_path}")

        # Add cache metadata
        metadata["cached_at"] = datetime.now().isoformat()
        metadata["video_id"] = video_id
        metadata["expires_at"] = (
            datetime.now() + timedelta(days=self.ttl_days)
        ).isoformat()

        # Save metadata
        metadata_path = cache_path / "metadata.json"
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)

        # Upload to R2 for persistence
        if self.r2_client and self.r2_bucket:
            try:
                # Upload video
                r2_video_key = f"{self._get_r2_prefix(video_id)}/video.mp4"
                self.r2_client.upload_file(
                    str(video_path),
                    self.r2_bucket,
                    r2_video_key,
                )

                # Upload metadata
                r2_meta_key = f"{self._get_r2_prefix(video_id)}/metadata.json"
                self.r2_client.upload_file(
                    str(metadata_path),
                    self.r2_bucket,
                    r2_meta_key,
                )
                print(f"Uploaded video cache to R2: {video_id}")
            except Exception as e:
                print(f"Failed to upload video cache to R2: {e}")

        return str(video_path)

    def save_transcription(
        self,
        video_id: str,
        transcription: Dict[str, Any],
    ) -> None:
        """
        Cache transcription data.

        Args:
            video_id: Video identifier
            transcription: Dict with 'text', 'segments', 'language', 'duration'
        """
        cache_path = self._get_cache_path(video_id)
        cache_path.mkdir(parents=True, exist_ok=True)

        # Add cache metadata
        save_data = transcription.copy()
        save_data["cached_at"] = datetime.now().isoformat()

        # Save locally
        transcription_path = cache_path / "transcription.json"
        with open(transcription_path, "w", encoding="utf-8") as f:
            json.dump(save_data, f, indent=2, ensure_ascii=False)

        print(f"Cached transcription for {video_id}: {len(save_data.get('segments', []))} segments")

        # Upload to R2 for persistence
        if self.r2_client and self.r2_bucket:
            try:
                r2_key = f"{self._get_r2_prefix(video_id)}/transcription.json"
                self.r2_client.upload_file(
                    str(transcription_path),
                    self.r2_bucket,
                    r2_key,
                )
                print(f"Uploaded transcription cache to R2: {video_id}")
            except Exception as e:
                print(f"Failed to upload transcription cache to R2: {e}")

    def get_full_cache(self, video_id: str) -> Optional[CacheEntry]:
        """
        Get all cached data for a video.

        Returns:
            CacheEntry with video_path, metadata, transcription, or None
        """
        if not self.has_video(video_id):
            return None

        return CacheEntry(
            video_id=video_id,
            video_path=self.get_cached_video_path(video_id),
            metadata=self.get_cached_metadata(video_id) or {},
            transcription=self.get_cached_transcription(video_id),
            cached_at=self.get_cached_metadata(video_id).get("cached_at") if self.get_cached_metadata(video_id) else None,
        )

    def clear_cache(self, video_id: str) -> bool:
        """Remove cached data for a video."""
        import shutil

        success = False
        cache_path = self._get_cache_path(video_id)

        # Clear local cache
        if cache_path.exists():
            try:
                shutil.rmtree(cache_path)
                print(f"Cleared local cache for {video_id}")
                success = True
            except Exception as e:
                print(f"Error clearing local cache for {video_id}: {e}")

        # Clear R2 cache
        if self.r2_client and self.r2_bucket:
            try:
                prefix = self._get_r2_prefix(video_id)
                # List and delete all objects with this prefix
                response = self.r2_client.list_objects_v2(
                    Bucket=self.r2_bucket,
                    Prefix=prefix,
                )
                if response.get("Contents"):
                    for obj in response["Contents"]:
                        self.r2_client.delete_object(
                            Bucket=self.r2_bucket,
                            Key=obj["Key"],
                        )
                    print(f"Cleared R2 cache for {video_id}")
                    success = True
            except Exception as e:
                print(f"Error clearing R2 cache for {video_id}: {e}")

        return success

    def cleanup_expired(self) -> int:
        """
        Remove expired cache entries.

        Returns:
            Number of entries removed
        """
        removed = 0
        now = datetime.now()

        for cache_dir in self.cache_dir.iterdir():
            if not cache_dir.is_dir():
                continue

            metadata_path = cache_dir / "metadata.json"
            if not metadata_path.exists():
                continue

            try:
                with open(metadata_path, "r") as f:
                    metadata = json.load(f)

                expires_at = metadata.get("expires_at")
                if expires_at:
                    expires = datetime.fromisoformat(expires_at)
                    if now > expires:
                        self.clear_cache(cache_dir.name)
                        removed += 1
            except Exception as e:
                print(f"Error checking cache expiry: {e}")

        if removed > 0:
            print(f"Cleaned up {removed} expired cache entries")

        return removed

    def list_cached_videos(self) -> List[Dict[str, Any]]:
        """List all cached videos with their metadata."""
        cached = []

        for cache_dir in self.cache_dir.iterdir():
            if cache_dir.is_dir():
                video_id = cache_dir.name
                metadata = self.get_cached_metadata(video_id)
                has_transcription = self.has_transcription(video_id)

                cached.append({
                    "video_id": video_id,
                    "metadata": metadata,
                    "has_transcription": has_transcription,
                    "has_video": self.has_video(video_id),
                })

        return cached
