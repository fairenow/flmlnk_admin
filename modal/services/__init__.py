"""
Modal Services Package

This package contains all the services for video processing:
- youtube_downloader: Download videos from YouTube/other platforms
- transcription: Whisper-based transcription with word timing
- clip_analyzer: GPT-4o viral content analysis
- face_detector: MediaPipe face detection
- video_clipper: FFmpeg clip generation
- caption_generator: ASS subtitle generation
- convex_storage: Direct upload to Convex storage
- video_processor: Main pipeline orchestrator
- r2_fetcher: R2 storage operations (browser-first architecture)
- convex_client: Convex API client for Modal workers
- r2_video_processor: R2-based video processor (browser-first architecture)

Phase 3 (Exceed clip-gold-main):
- speaker_detector: Smart speaker detection for podcast/interview content
"""

from .youtube_downloader import YouTubeDownloader, VideoInfoExtractor
from .transcription import TranscriptionService
from .clip_analyzer import ClipAnalyzer, AnalysisResult
from .face_detector import FaceDetector, LayoutCalculator
from .video_clipper import VideoClipper
from .caption_generator import CaptionGenerator, SimpleCaptionGenerator
from .convex_storage import ConvexStorage, ClipMetadata, get_storage
from .video_processor import VideoProcessor, ProcessingResult

# Browser-first architecture services
from .r2_fetcher import R2Fetcher
from .convex_client import ConvexClient
from .r2_video_processor import R2VideoProcessor, R2ProcessingResult

# Phase 3 services
from .speaker_detector import SpeakerDetector, ConversationAnalyzer

__all__ = [
    # Legacy (YouTube-based)
    "YouTubeDownloader",
    "VideoInfoExtractor",
    "TranscriptionService",
    "ClipAnalyzer",
    "AnalysisResult",
    "FaceDetector",
    "LayoutCalculator",
    "VideoClipper",
    "CaptionGenerator",
    "SimpleCaptionGenerator",
    "ConvexStorage",
    "ClipMetadata",
    "get_storage",
    "VideoProcessor",
    "ProcessingResult",
    # Browser-first (R2-based)
    "R2Fetcher",
    "ConvexClient",
    "R2VideoProcessor",
    "R2ProcessingResult",
    # Phase 3
    "SpeakerDetector",
    "ConversationAnalyzer",
]
