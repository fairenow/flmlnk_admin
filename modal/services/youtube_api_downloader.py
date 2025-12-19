"""
YouTube API Downloader Service

Downloads videos from YouTube using RapidAPI-based services instead of yt-dlp.
This approach avoids the need for residential proxies and browser impersonation.

Supported RapidAPI services:
- ytstream-download-youtube-videos (primary)
- youtube-mp3-downloader (fallback)

Usage:
    downloader = YouTubeAPIDownloader(temp_dir="/tmp/download")
    result = await downloader.download(
        video_url="https://youtube.com/watch?v=...",
        quality="medium"
    )
"""

import os
import re
import asyncio
import httpx
from pathlib import Path
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class YouTubeAPIResult:
    """Result of YouTube API download."""
    success: bool
    video_path: Optional[str] = None
    audio_path: Optional[str] = None
    title: Optional[str] = None
    duration: Optional[float] = None
    uploader: Optional[str] = None
    thumbnail: Optional[str] = None
    error: Optional[str] = None
    error_stage: Optional[str] = None


def extract_video_id(url: str) -> Optional[str]:
    """Extract YouTube video ID from various URL formats."""
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com\/embed\/([a-zA-Z0-9_-]{11})',
        r'youtube\.com\/v\/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


class YouTubeAPIDownloader:
    """
    Downloads YouTube videos using RapidAPI services.

    This is a cleaner alternative to yt-dlp that doesn't require
    residential proxies or browser fingerprint impersonation.
    """

    # Quality presets
    QUALITY_MAP = {
        "high": "1080",
        "medium": "720",
        "low": "480",
    }

    def __init__(self, temp_dir: str = "/tmp/youtube_download"):
        """
        Initialize the downloader.

        Args:
            temp_dir: Directory to store downloaded files.
        """
        self.temp_dir = temp_dir
        os.makedirs(temp_dir, exist_ok=True)

        # Get RapidAPI credentials from environment
        self.rapidapi_key = os.environ.get("RAPIDAPI_KEY")
        self.rapidapi_host = os.environ.get("RAPIDAPI_HOST", "ytstream-download-youtube-videos.p.rapidapi.com")

    async def _get_video_info(self, video_id: str) -> Dict[str, Any]:
        """Get video metadata from YouTube API."""
        if not self.rapidapi_key:
            raise ValueError("RAPIDAPI_KEY environment variable not set")

        # Use ytstream API - provides formats and adaptiveFormats arrays
        url = f"https://{self.rapidapi_host}/dl"
        params = {
            "id": video_id,
            "cgeo": "US",  # Provide geo for better/direct links
        }
        headers = {
            "X-RapidAPI-Key": self.rapidapi_key,
            "X-RapidAPI-Host": self.rapidapi_host,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            return response.json()

    async def _download_file(self, url: str, output_path: str) -> bool:
        """Download a file from URL to output path."""
        # YouTube CDN requires specific headers for downloads
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Encoding": "identity;q=1, *;q=0",  # Don't request compressed
            "Accept-Language": "en-US,en;q=0.9",
            "Range": "bytes=0-",  # YouTube CDN often requires Range header
            "Referer": "https://www.youtube.com/",
            "Origin": "https://www.youtube.com",
            "Sec-Fetch-Dest": "video",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "cross-site",
        }

        # Use proxy if configured - YouTube CDN URLs are IP-restricted
        proxy_url = os.environ.get("YOUTUBE_PROXY")
        proxy_config = None
        if proxy_url:
            import base64
            from urllib.parse import urlparse, unquote
            parsed = urlparse(proxy_url)
            if parsed.username and parsed.password:
                # Extract credentials (unquote in case already URL-encoded)
                username = unquote(parsed.username)
                password = unquote(parsed.password)
                # Build proxy URL without auth
                proxy_config = f"{parsed.scheme}://{parsed.hostname}"
                if parsed.port:
                    proxy_config += f":{parsed.port}"
                # Add Proxy-Authorization header manually (more reliable than URL-embedded auth)
                auth_string = f"{username}:{password}"
                auth_bytes = base64.b64encode(auth_string.encode('utf-8')).decode('ascii')
                headers["Proxy-Authorization"] = f"Basic {auth_bytes}"
                print(f"[YouTube API] Using proxy for download")
            else:
                proxy_config = proxy_url
                print(f"[YouTube API] Using proxy for download (no auth)")

        try:
            async with httpx.AsyncClient(
                timeout=300.0,
                follow_redirects=True,
                headers=headers,
                proxy=proxy_config,
            ) as client:
                async with client.stream("GET", url) as response:
                    if response.status_code == 403:
                        # Log more details about the 403
                        print(f"[YouTube API] 403 Forbidden - Response headers: {dict(response.headers)}")
                    response.raise_for_status()
                    with open(output_path, "wb") as f:
                        async for chunk in response.aiter_bytes(chunk_size=8192):
                            f.write(chunk)
            return os.path.exists(output_path) and os.path.getsize(output_path) > 0
        except httpx.HTTPStatusError as e:
            # Note: Can't access response.text on streaming response without read()
            print(f"[YouTube API] Download HTTP error {e.response.status_code}")
            raise

    def _find_best_format(self, formats: list, target_quality: str) -> Optional[Dict]:
        """Find the best format matching target quality."""
        target_height = int(self.QUALITY_MAP.get(target_quality, "720"))

        # Filter to video formats with audio (or separate audio)
        video_formats = []
        audio_formats = []

        for fmt in formats:
            # Log first format structure for debugging
            if len(video_formats) == 0 and len(audio_formats) == 0:
                print(f"[YouTube API] First format structure: {list(fmt.keys())}")

            # Check for video using multiple possible field names
            has_video = (
                fmt.get("hasVideo") or
                fmt.get("videoCodec") or
                fmt.get("vcodec") or
                (fmt.get("mimeType", "").startswith("video/")) or
                (fmt.get("type", "").startswith("video/")) or
                fmt.get("qualityLabel") or  # qualityLabel usually indicates video
                fmt.get("height")  # height indicates video
            )

            # Check for audio using multiple possible field names
            has_audio = (
                fmt.get("hasAudio") or
                fmt.get("audioCodec") or
                fmt.get("acodec") or
                (fmt.get("mimeType", "").startswith("audio/")) or
                (fmt.get("type", "").startswith("audio/")) or
                fmt.get("audioBitrate") or
                fmt.get("audioQuality")
            )

            # Get height from various possible fields
            height = (
                fmt.get("height") or
                fmt.get("qualityLabel", "").replace("p", "").split()[0] if fmt.get("qualityLabel") else 0
            )
            try:
                height = int(height) if height else 0
            except (ValueError, TypeError):
                height = 0

            if has_video:
                video_formats.append((height, fmt))
            elif has_audio and not has_video:
                # Audio-only format
                bitrate = fmt.get("audioBitrate", 0) or fmt.get("bitrate", 0) or 0
                audio_formats.append((bitrate, fmt))

        print(f"[YouTube API] Found {len(video_formats)} video formats, {len(audio_formats)} audio formats")

        # Sort by quality (height for video, bitrate for audio)
        video_formats.sort(key=lambda x: x[0], reverse=True)
        audio_formats.sort(key=lambda x: x[0], reverse=True)

        # Find video format closest to target quality
        best_video = None
        for height, fmt in video_formats:
            if height <= target_height:
                best_video = fmt
                break
        if not best_video and video_formats:
            best_video = video_formats[-1][1]  # Take lowest if all are higher

        # Get best audio format
        best_audio = audio_formats[0][1] if audio_formats else None

        return best_video, best_audio

    def _find_best_format_v2(self, video_formats: list, audio_formats: list, target_quality: str) -> tuple:
        """Find the best format matching target quality from pre-separated format lists.

        Handles both API response formats:
        - ytstream: formats/adaptiveFormats with audioQuality field
        - youtube-media-downloader: videos.items[] with hasAudio field

        Priority: formats WITH audio are preferred since they're more reliable for downloads.
        """
        target_height = int(self.QUALITY_MAP.get(target_quality, "720"))

        # Process video formats - separate those with and without audio
        videos_with_audio = []
        videos_without_audio = []

        for fmt in video_formats:
            # Log first format structure for debugging
            if len(videos_with_audio) == 0 and len(videos_without_audio) == 0:
                print(f"[YouTube API] Video format structure: {list(fmt.keys())}")

            # Get height from 'quality' field like "360p", "720p" or from 'height' directly
            height = 0
            quality_str = fmt.get("quality", "") or fmt.get("qualityLabel", "")
            if quality_str:
                # Extract number from strings like "360p", "720p"
                height_match = re.search(r'(\d+)', str(quality_str))
                if height_match:
                    height = int(height_match.group(1))
            if not height:
                height = fmt.get("height", 0) or 0

            # Only include formats with a download URL
            if fmt.get("url"):
                # Check for audio: hasAudio (bool) or audioQuality (string like "AUDIO_QUALITY_LOW")
                has_audio = fmt.get("hasAudio", False) or bool(fmt.get("audioQuality"))
                if has_audio:
                    videos_with_audio.append((height, fmt))
                else:
                    videos_without_audio.append((height, fmt))

        # Process audio formats
        processed_audios = []
        for fmt in audio_formats:
            if len(processed_audios) == 0:
                print(f"[YouTube API] Audio format structure: {list(fmt.keys())}")

            # Get size as a proxy for quality
            size = fmt.get("size", 0) or fmt.get("bitrate", 0) or 0

            if fmt.get("url"):
                processed_audios.append((size, fmt))

        print(f"[YouTube API] Processed {len(videos_with_audio)} video+audio formats, {len(videos_without_audio)} video-only formats, {len(processed_audios)} audio formats")

        # Sort by quality (height for video, size for audio)
        videos_with_audio.sort(key=lambda x: x[0], reverse=True)
        videos_without_audio.sort(key=lambda x: x[0], reverse=True)
        processed_audios.sort(key=lambda x: x[0], reverse=True)

        # First try to find a video WITH audio at or below target quality (more reliable)
        best_video = None
        for height, fmt in videos_with_audio:
            if height <= target_height:
                best_video = fmt
                break
        # If no video with audio at target, take highest quality video with audio
        if not best_video and videos_with_audio:
            best_video = videos_with_audio[0][1]

        # If still no video, fall back to video-only formats
        if not best_video:
            for height, fmt in videos_without_audio:
                if height <= target_height:
                    best_video = fmt
                    break
            if not best_video and videos_without_audio:
                best_video = videos_without_audio[-1][1]

        # Get best audio format (needed if video doesn't have audio)
        best_audio = processed_audios[0][1] if processed_audios else None

        if best_video:
            quality_label = best_video.get("quality") or best_video.get("qualityLabel") or f"{best_video.get('height', '?')}p"
            has_audio = best_video.get("hasAudio", False) or bool(best_video.get("audioQuality"))
            print(f"[YouTube API] Selected video format: {quality_label}, hasAudio: {has_audio}")

        return best_video, best_audio

    async def download(
        self,
        video_url: str,
        quality: str = "medium",
    ) -> YouTubeAPIResult:
        """
        Download a YouTube video.

        Args:
            video_url: YouTube URL to download.
            quality: Quality preset ("high", "medium", "low").

        Returns:
            YouTubeAPIResult with video path and metadata.
        """
        # Extract video ID
        video_id = extract_video_id(video_url)
        if not video_id:
            return YouTubeAPIResult(
                success=False,
                error="Could not extract video ID from URL",
                error_stage="parse",
            )

        try:
            # Get video info from API
            print(f"[YouTube API] Getting info for video: {video_id}")
            info = await self._get_video_info(video_id)

            # Check for API error - youtube-media-downloader uses errorId
            error_id = info.get("errorId", "")
            if error_id and error_id != "Success":
                return YouTubeAPIResult(
                    success=False,
                    error=f"API error: {error_id} - {info.get('reason', 'Unknown error')}",
                    error_stage="api",
                )
            # Also check legacy status field for backwards compatibility
            status = info.get("status", "")
            if status and status.lower() not in ["ok", "success", ""]:
                return YouTubeAPIResult(
                    success=False,
                    error=f"API error: {info.get('msg', 'Unknown error')}",
                    error_stage="api",
                )

            # Extract metadata
            title = info.get("title", "Unknown")
            duration = info.get("lengthSeconds", 0)
            # Get uploader from channel.name or fallback fields
            channel_info = info.get("channel", {})
            uploader = (
                channel_info.get("name") if isinstance(channel_info, dict) else None
            ) or info.get("channelTitle") or info.get("author") or "Unknown"
            thumbnail = None

            # Get thumbnail from thumbnails array
            thumbnails = info.get("thumbnail", []) or info.get("thumbnails", [])
            if isinstance(thumbnails, list) and thumbnails:
                # Get highest quality thumbnail
                best_thumb = max(thumbnails, key=lambda t: t.get("width", 0))
                thumbnail = best_thumb.get("url")
            elif isinstance(thumbnails, str):
                thumbnail = thumbnails

            print(f"[YouTube API] Video: {title}, Duration: {duration}s")

            # Get formats - check multiple possible response structures
            video_formats = []
            audio_formats = []

            # youtube-media-downloader API returns videos/audios objects with items[] array
            videos_data = info.get("videos", {})
            audios_data = info.get("audios", {})

            if isinstance(videos_data, dict):
                videos_error = videos_data.get("errorId", "")
                if videos_error and videos_error != "Success":
                    print(f"[YouTube API] Videos error: {videos_error} - {videos_data.get('reason', '')}")
                # Extract items array
                if videos_data.get("items"):
                    video_formats.extend(videos_data["items"])
                    print(f"[YouTube API] Found {len(videos_data['items'])} video items from videos.items")
                else:
                    # Legacy: videos might be dict with quality keys
                    for quality_key, video_items in videos_data.items():
                        if isinstance(video_items, list):
                            video_formats.extend(video_items)
            elif isinstance(videos_data, list):
                video_formats.extend(videos_data)

            if isinstance(audios_data, dict):
                audios_error = audios_data.get("errorId", "")
                if audios_error and audios_error != "Success":
                    print(f"[YouTube API] Audios error: {audios_error} - {audios_data.get('reason', '')}")
                # Extract items array
                if audios_data.get("items"):
                    audio_formats.extend(audios_data["items"])
                    print(f"[YouTube API] Found {len(audios_data['items'])} audio items from audios.items")
                else:
                    # Legacy: audios might be dict with quality keys
                    for quality_key, audio_items in audios_data.items():
                        if isinstance(audio_items, list):
                            audio_formats.extend(audio_items)
            elif isinstance(audios_data, list):
                audio_formats.extend(audios_data)

            # Also check formats and adaptiveFormats (ytstream API format)
            if info.get("formats"):
                video_formats.extend(info.get("formats"))
            if info.get("adaptiveFormats"):
                video_formats.extend(info.get("adaptiveFormats"))

            # Try alternative location in streamingData if no formats found
            if not video_formats and not audio_formats:
                streaming_data = info.get("streamingData", {})
                if streaming_data.get("formats"):
                    video_formats.extend(streaming_data.get("formats"))
                if streaming_data.get("adaptiveFormats"):
                    video_formats.extend(streaming_data.get("adaptiveFormats"))

            if not video_formats and not audio_formats:
                # Log available keys for debugging
                available_keys = list(info.keys()) if isinstance(info, dict) else []
                print(f"[YouTube API] No formats found. API response keys: {available_keys}")
                return YouTubeAPIResult(
                    success=False,
                    error=f"No download formats available. API returned keys: {available_keys}",
                    error_stage="formats",
                )

            print(f"[YouTube API] Found {len(video_formats)} video formats, {len(audio_formats)} audio formats")

            # Find best format - pass separated video and audio formats
            best_video, best_audio = self._find_best_format_v2(video_formats, audio_formats, quality)

            if not best_video:
                print(f"[YouTube API] No suitable video format found among {len(video_formats)} video formats")
                return YouTubeAPIResult(
                    success=False,
                    error="No suitable video format found",
                    error_stage="formats",
                )

            # Create output paths
            safe_title = re.sub(r'[^\w\s-]', '', title)[:50]
            video_path = os.path.join(self.temp_dir, f"{safe_title}_{video_id}.mp4")
            audio_path = os.path.join(self.temp_dir, f"{safe_title}_{video_id}.m4a")

            # Download video
            video_url_download = best_video.get("url")
            if not video_url_download:
                # Log available format keys to debug
                format_keys = list(best_video.keys()) if isinstance(best_video, dict) else []
                print(f"[YouTube API] No download URL in format. Format keys: {format_keys}")
                return YouTubeAPIResult(
                    success=False,
                    error=f"No video download URL in format. Format keys: {format_keys}",
                    error_stage="download",
                )

            quality_label = best_video.get('quality') or best_video.get('qualityLabel') or 'unknown quality'
            # Log URL pattern for debugging (show host only, not full URL with tokens)
            from urllib.parse import urlparse
            parsed_url = urlparse(video_url_download)
            print(f"[YouTube API] Downloading video: {quality_label} from {parsed_url.netloc}")
            success = await self._download_file(video_url_download, video_path)

            if not success:
                return YouTubeAPIResult(
                    success=False,
                    error="Video download failed",
                    error_stage="download",
                )

            # Download audio if separate
            audio_result_path = None
            if best_audio and not best_video.get("hasAudio"):
                audio_url_download = best_audio.get("url")
                if audio_url_download:
                    print(f"[YouTube API] Downloading audio: {best_audio.get('audioBitrate', 'unknown')} kbps")
                    audio_success = await self._download_file(audio_url_download, audio_path)
                    if audio_success:
                        audio_result_path = audio_path
            elif best_video.get("hasAudio"):
                # Video already has audio, extract it
                audio_result_path = video_path  # FFmpeg will extract audio

            print(f"[YouTube API] Download complete: {video_path}")

            return YouTubeAPIResult(
                success=True,
                video_path=video_path,
                audio_path=audio_result_path,
                title=title,
                duration=float(duration) if duration else None,
                uploader=uploader,
                thumbnail=thumbnail,
            )

        except httpx.HTTPStatusError as e:
            return YouTubeAPIResult(
                success=False,
                error=f"HTTP error: {e.response.status_code}",
                error_stage="api",
            )
        except httpx.TimeoutException:
            return YouTubeAPIResult(
                success=False,
                error="Request timed out",
                error_stage="api",
            )
        except Exception as e:
            return YouTubeAPIResult(
                success=False,
                error=str(e),
                error_stage="unknown",
            )


class YouTubeAPIToR2Downloader:
    """
    Downloads YouTube videos using RapidAPI and uploads to R2.

    This is the main class to use for the unified R2 processing flow.
    """

    def __init__(self, temp_dir: str = "/tmp/youtube_download"):
        """
        Initialize the downloader.

        Args:
            temp_dir: Temporary directory for downloads before R2 upload.
        """
        self.temp_dir = temp_dir
        os.makedirs(temp_dir, exist_ok=True)

        # Import R2 fetcher for uploads
        from .r2_fetcher import R2Fetcher
        self.r2 = R2Fetcher(temp_dir)
        self.downloader = YouTubeAPIDownloader(temp_dir)

    async def download_to_r2(
        self,
        video_url: str,
        user_id: str,
        job_id: str,
        quality: str = "medium",
    ) -> Dict[str, Any]:
        """
        Download a YouTube video and upload it to R2.

        Args:
            video_url: YouTube URL to download.
            user_id: User ID for R2 path namespacing.
            job_id: Job ID for R2 path organization.
            quality: Quality preset ("high", "medium", "low").

        Returns:
            Dict with success, r2_key, title, duration, etc.
        """
        import shutil

        # Create job-specific directory
        job_dir = os.path.join(self.temp_dir, job_id)
        os.makedirs(job_dir, exist_ok=True)

        try:
            # Download from YouTube API
            print(f"[{job_id}] Downloading from YouTube API: {video_url}")

            # Use job-specific temp dir
            job_downloader = YouTubeAPIDownloader(job_dir)
            result = await job_downloader.download(video_url, quality=quality)

            if not result.success:
                print(f"[{job_id}] YouTube API download failed: {result.error} (stage: {result.error_stage})")

                # Check if this is a 403 error (IP restriction) - try yt-dlp fallback
                if "403" in str(result.error) or result.error_stage in ["download", "api"]:
                    print(f"[{job_id}] Attempting yt-dlp fallback for download...")
                    try:
                        from .youtube_downloader import YouTubeDownloader

                        ytdlp_downloader = YouTubeDownloader(job_dir)
                        ytdlp_result = await ytdlp_downloader.download(video_url, quality=quality)

                        if ytdlp_result.get("video_path") and os.path.exists(ytdlp_result["video_path"]):
                            print(f"[{job_id}] yt-dlp fallback successful: {ytdlp_result.get('title')}")
                            # Create a compatible result object
                            result = YouTubeAPIResult(
                                success=True,
                                video_path=ytdlp_result["video_path"],
                                audio_path=ytdlp_result.get("audio_path"),
                                title=ytdlp_result.get("title"),
                                duration=ytdlp_result.get("duration"),
                                uploader=ytdlp_result.get("uploader"),
                                thumbnail=ytdlp_result.get("thumbnail"),
                            )
                        else:
                            print(f"[{job_id}] yt-dlp fallback also failed")
                            return {
                                "success": False,
                                "error": f"Both API and yt-dlp failed. API: {result.error}",
                                "error_stage": result.error_stage or "download",
                            }
                    except Exception as ytdlp_error:
                        print(f"[{job_id}] yt-dlp fallback error: {ytdlp_error}")
                        return {
                            "success": False,
                            "error": f"API failed ({result.error}), yt-dlp fallback also failed ({ytdlp_error})",
                            "error_stage": result.error_stage or "download",
                        }
                else:
                    return {
                        "success": False,
                        "error": result.error or "Download failed",
                        "error_stage": result.error_stage or "download",
                    }

            print(f"[{job_id}] Downloaded: {result.title}")
            print(f"[{job_id}] Duration: {result.duration}s")

            # Upload to R2
            print(f"[{job_id}] Uploading to R2...")

            r2_key = f"users/{user_id}/jobs/{job_id}/source/video.mp4"

            self.r2.upload(
                local_path=Path(result.video_path),
                r2_key=r2_key,
                content_type="video/mp4",
            )

            print(f"[{job_id}] Uploaded to R2: {r2_key}")

            return {
                "success": True,
                "r2_key": r2_key,
                "title": result.title,
                "duration": result.duration,
                "uploader": result.uploader,
                "thumbnail": result.thumbnail,
            }

        except Exception as e:
            error_msg = str(e)
            error_stage = "download"

            if "upload" in error_msg.lower() or "r2" in error_msg.lower():
                error_stage = "upload"

            print(f"[{job_id}] Error at {error_stage}: {error_msg}")

            return {
                "success": False,
                "error": error_msg,
                "error_stage": error_stage,
            }

        finally:
            # Cleanup job directory
            try:
                if os.path.exists(job_dir):
                    shutil.rmtree(job_dir)
                    print(f"[{job_id}] Cleaned up temp directory")
            except Exception as e:
                print(f"[{job_id}] Cleanup warning: {e}")
