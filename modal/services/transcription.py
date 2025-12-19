"""
Transcription Service

Uses OpenAI's Whisper API for high-quality transcription with word-level timestamps.
Includes progressive audio compression and retry logic for robustness.
"""

import os
import asyncio
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, Any, List, Optional

from openai import AsyncOpenAI

from .segment_utils import get_segment_value, normalize_segments


# Maximum file size for Whisper API (in bytes)
WHISPER_MAX_SIZE_MB = 24
WHISPER_MAX_SIZE_BYTES = WHISPER_MAX_SIZE_MB * 1024 * 1024

# Video file extensions that need audio extraction
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv'}


class TranscriptionService:
    """
    Service for transcribing audio using OpenAI Whisper API.
    Provides word-level timestamps for caption generation.

    Features:
    - Progressive audio compression (64k → 48k → 32k) to stay under Whisper's 24MB limit
    - Retry logic with exponential backoff for transient API errors
    """

    def __init__(self):
        self.client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        self.max_retries = 5
        self.initial_backoff = 1.0

    def _get_file_size_mb(self, file_path: str) -> float:
        """Get file size in megabytes."""
        return Path(file_path).stat().st_size / (1024 * 1024)

    async def _extract_audio(
        self,
        video_path: str,
        bitrate: str = "64k",
    ) -> str:
        """
        Extract and compress audio from video file using FFmpeg.

        Args:
            video_path: Path to video/audio file
            bitrate: Audio bitrate (e.g., "64k", "48k", "32k")

        Returns:
            Path to the extracted audio file
        """
        output_path = tempfile.mktemp(suffix='.mp3')

        cmd = [
            'ffmpeg',
            '-y',  # Overwrite output
            '-i', video_path,
            '-vn',  # No video
            '-acodec', 'libmp3lame',
            '-ar', '16000',  # 16kHz sample rate (optimal for Whisper)
            '-ac', '1',  # Mono
            '-b:a', bitrate,
            output_path
        ]

        print(f"Extracting audio at {bitrate}: {' '.join(cmd[:4])}...")

        # Run FFmpeg asynchronously
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise RuntimeError(f"Audio extraction failed: {error_msg}")

        size_mb = self._get_file_size_mb(output_path)
        print(f"Audio extracted: {size_mb:.1f}MB at {bitrate}")

        return output_path

    async def _prepare_audio_for_whisper(self, audio_path: str) -> str:
        """
        Prepare audio file for Whisper API, compressing if necessary.

        Uses progressive bitrate reduction (64k → 48k → 32k) to ensure
        the file stays under Whisper's 24MB limit.

        Args:
            audio_path: Path to audio or video file

        Returns:
            Path to the audio file ready for Whisper (may be original or compressed)
        """
        file_path = Path(audio_path)
        file_size_mb = self._get_file_size_mb(audio_path)
        is_video = file_path.suffix.lower() in VIDEO_EXTENSIONS

        print(f"Processing file: {audio_path} ({file_size_mb:.1f}MB, is_video={is_video})")

        # If it's a small audio file, use it directly
        if not is_video and file_size_mb <= WHISPER_MAX_SIZE_MB:
            print(f"File is small enough ({file_size_mb:.1f}MB <= {WHISPER_MAX_SIZE_MB}MB), using directly")
            return audio_path

        # Need to extract/compress audio
        bitrates = ["64k", "48k", "32k"]
        last_path = None

        for bitrate in bitrates:
            try:
                extracted_path = await self._extract_audio(audio_path, bitrate)
                extracted_size_mb = self._get_file_size_mb(extracted_path)

                # Clean up previous attempt if any
                if last_path and last_path != audio_path and os.path.exists(last_path):
                    try:
                        os.unlink(last_path)
                    except Exception:
                        pass

                if extracted_size_mb <= WHISPER_MAX_SIZE_MB:
                    print(f"Audio compressed successfully: {extracted_size_mb:.1f}MB at {bitrate}")
                    return extracted_path

                print(f"Audio still too large ({extracted_size_mb:.1f}MB), trying lower bitrate...")
                last_path = extracted_path

            except Exception as e:
                print(f"Extraction at {bitrate} failed: {e}")
                continue

        # If we have any extracted file, use it even if large
        if last_path and os.path.exists(last_path):
            print(f"Warning: Could not compress below {WHISPER_MAX_SIZE_MB}MB, using last attempt")
            return last_path

        # Fall back to original
        print(f"Warning: All extraction attempts failed, using original file")
        return audio_path

    async def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
        prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Transcribe audio file using Whisper API.

        Includes:
        - Automatic audio extraction/compression for large files
        - Retry logic with exponential backoff (5 attempts)

        Args:
            audio_path: Path to audio file (mp3, wav, etc.) or video file
            language: Optional language code (e.g., "en", "es")
            prompt: Optional prompt to guide transcription

        Returns:
            Dictionary with segments (including word-level timing), text, and metadata
        """
        # Prepare audio (extract and compress if needed)
        transcribe_path = await self._prepare_audio_for_whisper(audio_path)
        cleanup_path = transcribe_path if transcribe_path != audio_path else None

        try:
            return await self._transcribe_with_retry(
                transcribe_path,
                language=language,
                prompt=prompt,
            )
        finally:
            # Clean up temporary audio file
            if cleanup_path and os.path.exists(cleanup_path):
                try:
                    os.unlink(cleanup_path)
                except Exception:
                    pass

    async def _transcribe_with_retry(
        self,
        audio_path: str,
        language: Optional[str] = None,
        prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Transcribe with retry logic and exponential backoff.

        Retries up to 5 times with exponential backoff (1s, 2s, 4s, 8s, 16s).
        """
        backoff = self.initial_backoff
        last_error = None

        for attempt in range(1, self.max_retries + 1):
            try:
                print(f"Calling Whisper API (attempt {attempt}/{self.max_retries})")

                with open(audio_path, "rb") as audio_file:
                    response = await self.client.audio.transcriptions.create(
                        model="whisper-1",
                        file=audio_file,
                        response_format="verbose_json",
                        timestamp_granularities=["word", "segment"],
                        language=language,
                        prompt=prompt,
                    )

                # Parse response
                segments = self._parse_segments(response)
                full_text = response.text if hasattr(response, "text") else ""

                print(f"Transcription successful: {len(segments)} segments")

                return {
                    "segments": segments,
                    "text": full_text,
                    "language": getattr(response, "language", language),
                    "duration": getattr(response, "duration", None),
                }

            except Exception as e:
                last_error = e
                print(f"Transcription attempt {attempt} failed: {e}")

                if attempt < self.max_retries:
                    print(f"Retrying in {backoff}s...")
                    await asyncio.sleep(backoff)
                    backoff *= 2  # Exponential backoff

        raise RuntimeError(f"Transcription failed after {self.max_retries} attempts: {last_error}")

    def _parse_segments(self, response: Any) -> List[Dict[str, Any]]:
        """Parse Whisper response into segment format with word timings."""
        segments = []

        if hasattr(response, "segments"):
            for segment in response.segments:
                # Handle both dict-like and object-like segment types
                # OpenAI SDK returns TranscriptionSegment objects with attributes
                if hasattr(segment, "start"):
                    # Object with attributes (TranscriptionSegment)
                    seg_data = {
                        "start": getattr(segment, "start", 0),
                        "end": getattr(segment, "end", 0),
                        "text": getattr(segment, "text", "").strip(),
                    }
                else:
                    # Dictionary-like access (fallback)
                    seg_data = {
                        "start": segment.get("start", 0) if hasattr(segment, "get") else 0,
                        "end": segment.get("end", 0) if hasattr(segment, "get") else 0,
                        "text": (segment.get("text", "") if hasattr(segment, "get") else "").strip(),
                    }

                # Add word-level timings if available
                if hasattr(response, "words"):
                    seg_words = self._get_words_for_segment(
                        response.words,
                        seg_data["start"],
                        seg_data["end"],
                    )
                    seg_data["words"] = seg_words

                segments.append(seg_data)

        return segments

    def _get_words_for_segment(
        self,
        all_words: List[Any],
        seg_start: float,
        seg_end: float,
    ) -> List[Dict[str, Any]]:
        """Extract words that belong to a specific segment."""
        words = []

        for word in all_words:
            # Handle both dict-like and object-like word types
            # OpenAI SDK returns TranscriptionWord objects with attributes
            if hasattr(word, "start"):
                # Object with attributes (TranscriptionWord)
                word_start = getattr(word, "start", 0)
                word_end = getattr(word, "end", 0)
                word_text = getattr(word, "word", "")
                word_prob = getattr(word, "probability", 1.0)
            else:
                # Dictionary-like access (fallback)
                word_start = word.get("start", 0) if hasattr(word, "get") else 0
                word_end = word.get("end", 0) if hasattr(word, "get") else 0
                word_text = word.get("word", "") if hasattr(word, "get") else ""
                word_prob = word.get("probability", 1.0) if hasattr(word, "get") else 1.0

            # Check if word falls within segment
            if word_start >= seg_start and word_end <= seg_end:
                words.append({
                    "word": word_text.strip() if word_text else "",
                    "start": word_start,
                    "end": word_end,
                    "confidence": word_prob,
                })

        return words


class TranscriptionCache:
    """
    In-memory cache for transcriptions to avoid re-transcribing.
    For production, this would use Convex database via webhooks.
    """

    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}

    def get(self, video_hash: str) -> Optional[Dict[str, Any]]:
        """Get cached transcription by video hash."""
        return self._cache.get(video_hash)

    def set(self, video_hash: str, transcription: Dict[str, Any]):
        """Cache a transcription."""
        self._cache[video_hash] = transcription

    def clear(self):
        """Clear the cache."""
        self._cache.clear()


def format_timestamp(seconds: float) -> str:
    """Format seconds to SRT/ASS timestamp format."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centisecs = int((seconds % 1) * 100)

    return f"{hours}:{minutes:02d}:{secs:02d}.{centisecs:02d}"


def format_srt_timestamp(seconds: float) -> str:
    """Format seconds to SRT timestamp format (HH:MM:SS,mmm)."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)

    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def segments_to_srt(segments: List[Dict[str, Any]]) -> str:
    """Convert segments to SRT subtitle format."""
    # Normalize segments to handle both dict and TranscriptionSegment objects
    normalized = normalize_segments(segments)
    srt_lines = []

    for i, segment in enumerate(normalized, 1):
        start = format_srt_timestamp(segment["start"])
        end = format_srt_timestamp(segment["end"])
        text = segment["text"]

        srt_lines.append(f"{i}")
        srt_lines.append(f"{start} --> {end}")
        srt_lines.append(text)
        srt_lines.append("")

    return "\n".join(srt_lines)
