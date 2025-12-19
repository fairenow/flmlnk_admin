"""
Modal App Definition for Video Clip Generator

This is the main Modal application that defines the container image,
secrets, and entry points for the video processing pipeline.
"""

import modal

# =============================================================================
# APPLICATION DEFINITION
# =============================================================================

app = modal.App("flmlnk-video-processor")

# =============================================================================
# CONTAINER IMAGE
# =============================================================================

# Build a Docker image with all required dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    # System dependencies
    .apt_install(
        "ffmpeg",
        "libsm6",
        "libxext6",
        "libgl1-mesa-glx",
        "libglib2.0-0",
        "wget",
        "curl",
        # Fonts for meme text overlay
        "fonts-dejavu-core",
        "fonts-liberation",
        "fontconfig",
        # Phase 5: Required for librosa audio loading
        "libsndfile1",
    )
    # Python packages
    .pip_install(
        # OpenAI for Whisper and GPT-4o
        "openai>=1.0.0",
        # MediaPipe for face detection
        "mediapipe>=0.10.0",
        # Image/video processing
        "opencv-python-headless>=4.8.0",
        "Pillow>=10.0.0",
        "numpy>=1.24.0",
        # HTTP requests (for RapidAPI and Convex storage uploads)
        "httpx>=0.25.0",
        "requests>=2.31.0",
        # Data validation
        "pydantic>=2.0.0",
        # Web endpoints
        "fastapi>=0.104.0",
        # Utilities
        "python-dateutil>=2.8.0",
        # YouTube downloading with browser impersonation support
        # curl_cffi is REQUIRED for --impersonate flag to bypass YouTube TLS fingerprinting
        "yt-dlp>=2024.1.0",
        "curl_cffi>=0.5.0",
        # R2/S3 storage for browser-first architecture
        "boto3>=1.34.0",
        # Phase 5: Audio analysis for beat-sync editing
        "librosa>=0.10.0",
        "soundfile>=0.12.0",
    )
    # Add local Python source code (services package)
    .add_local_python_source("services")
)

# =============================================================================
# SECRETS & VOLUMES
# =============================================================================

# Secrets are configured in Modal dashboard (https://modal.com/secrets)
#
# Required secrets:
#
# 1. "openai-secret" - for OpenAI API access
#    - OPENAI_API_KEY: Your OpenAI API key
#
# 2. "convex-webhooks" - for Convex integration
#    - CONVEX_URL: Your Convex deployment URL (e.g., https://marvelous-bat-438.convex.cloud)
#    - MODAL_WEBHOOK_SECRET: Shared secret for authenticating webhook requests
#
# 3. "r2-credentials" - for Cloudflare R2 (browser-first architecture)
#    - R2_ENDPOINT_URL: R2 endpoint (e.g., https://<account>.r2.cloudflarestorage.com)
#    - R2_ACCESS_KEY_ID: R2 access key
#    - R2_SECRET_ACCESS_KEY: R2 secret key
#    - R2_BUCKET_NAME: R2 bucket name
#
# 4. "rapidapi-youtube" - Required for YouTube URL processing
#    - RAPIDAPI_KEY: RapidAPI key for YouTube download service
#    - RAPIDAPI_HOST: API host (default: ytstream-download-youtube-videos.p.rapidapi.com)
#
# 5. "gemini-secret" - Fallback for caption generation when OpenAI fails
#    - GEMINI_API_KEY: Your Google Gemini API key (get from https://aistudio.google.com/apikey)
#
# NOTE: The youtube-proxy secret is no longer needed - using RapidAPI instead of yt-dlp
#
# To configure secrets in Modal:
#   1. Go to https://modal.com/secrets
#   2. Create a new secret with the name specified above
#   3. Add the required key-value pairs
#   4. Redeploy your Modal app

# Temporary volume for processing
volume = modal.Volume.from_name("flmlnk-temp-storage", create_if_missing=True)

# =============================================================================
# CONSTANTS
# =============================================================================

TEMP_DIR = "/tmp/video_processing"
VOLUME_DIR = "/data"

# =============================================================================
# MAIN PROCESSING FUNCTION
# =============================================================================

@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-secret"),
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("rapidapi-youtube"),
        modal.Secret.from_name("gemini-secret"),  # Fallback for AI generation
    ],
    volumes={VOLUME_DIR: volume},
    timeout=1800,  # 30 minutes max
    memory=4096,   # 4GB RAM
    cpu=2.0,       # 2 CPU cores
)
async def process_video(
    job_id: str,
    video_url: str,
    num_clips: int = 5,
    layout: str = "standard",
    caption_style: dict = None,
    webhook_url: str = None,
    webhook_secret: str = None,
):
    """
    Main entry point for video processing.

    This function orchestrates the entire pipeline:
    1. Download video (yt-dlp + residential proxy via YOUTUBE_PROXY)
    2. Extract/compress audio (FFmpeg)
    3. Transcribe (Whisper API)
    4. Analyze for clips (GPT-4o)
    5. Detect faces (MediaPipe)
    6. Generate clips (FFmpeg + ASS captions)
    7. Upload to Convex storage
    8. Send results via webhook
    """
    import os
    import asyncio
    from services.video_processor import VideoProcessor

    # Create temp directory
    os.makedirs(TEMP_DIR, exist_ok=True)

    # Default caption style
    if caption_style is None:
        caption_style = {
            "highlightColor": "00FFFF",
            "fontScale": 1.0,
            "position": "bottom",
        }

    # Initialize processor
    processor = VideoProcessor(
        job_id=job_id,
        webhook_url=webhook_url,
        webhook_secret=webhook_secret,
        temp_dir=TEMP_DIR,
    )

    try:
        # Run the full pipeline
        result = await processor.process(
            video_url=video_url,
            num_clips=num_clips,
            layout=layout,
            caption_style=caption_style,
        )
        return result
    finally:
        # Cleanup temp files
        processor.cleanup()


# =============================================================================
# WEB ENDPOINT (for triggering from Convex)
# =============================================================================

@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-secret"),
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("rapidapi-youtube"),
        modal.Secret.from_name("gemini-secret"),  # Fallback for AI generation
    ],
    volumes={VOLUME_DIR: volume},
    timeout=1800,
    memory=4096,
    cpu=2.0,
)
@modal.fastapi_endpoint(method="POST")
async def process_video_endpoint(request: dict):
    """
    HTTP endpoint to trigger video processing.
    Called by Convex action.

    Expected body:
    {
        "job_id": "unique-job-id",
        "video_url": "https://youtube.com/watch?v=...",
        "num_clips": 5,
        "layout": "standard",
        "caption_style": {...},
        "webhook_url": "https://your-app.convex.site",
        "webhook_secret": "secret"
    }
    """
    import os

    # Validate request
    job_id = request.get("job_id")
    video_url = request.get("video_url")

    if not job_id or not video_url:
        return {"status": "error", "message": "Missing job_id or video_url"}

    # Extract parameters
    num_clips = request.get("num_clips", 5)
    layout = request.get("layout", "standard")
    caption_style = request.get("caption_style", {
        "highlightColor": "00FFFF",
        "fontScale": 1.0,
        "position": "bottom",
    })
    webhook_url = request.get("webhook_url")
    webhook_secret = request.get("webhook_secret")

    # Spawn the processing function asynchronously
    # This allows the HTTP endpoint to return immediately
    process_video.spawn(
        job_id=job_id,
        video_url=video_url,
        num_clips=num_clips,
        layout=layout,
        caption_style=caption_style,
        webhook_url=webhook_url,
        webhook_secret=webhook_secret,
    )

    return {
        "status": "processing",
        "job_id": job_id,
        "message": "Video processing started",
    }


# =============================================================================
# MEME GENERATION FUNCTION
# =============================================================================

@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-secret"),
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("rapidapi-youtube"),
        modal.Secret.from_name("gemini-secret"),  # Fallback for caption generation
    ],
    volumes={VOLUME_DIR: volume},
    timeout=1800,  # 30 minutes max
    memory=4096,   # 4GB RAM
    cpu=2.0,       # 2 CPU cores
)
async def process_memes(
    job_id: str,
    video_url: str,
    meme_count: int = 5,
    target_templates: list = None,
    movie_metadata: dict = None,
    webhook_url: str = None,
    webhook_secret: str = None,
):
    """
    Meme generation entry point.

    This function generates memes from video frames:
    1. Download video (yt-dlp + residential proxy)
    2. Extract/compress audio for transcription
    3. Transcribe (Whisper API) for context
    4. Extract frames at smart intervals (FFmpeg)
    5. Analyze frames with OpenAI Vision
    6. Generate viral captions with GPT-4o
    7. Upload frames and results to Convex
    """
    import os
    from services.youtube_downloader import YouTubeDownloader
    from services.transcription import TranscriptionService
    from services.meme_generator import MemeGenerator

    # Create temp directory
    os.makedirs(TEMP_DIR, exist_ok=True)

    # Initialize services
    downloader = YouTubeDownloader(TEMP_DIR)
    transcription_service = TranscriptionService()
    meme_generator = MemeGenerator(
        job_id=job_id,
        webhook_url=webhook_url,
        webhook_secret=webhook_secret,
        temp_dir=TEMP_DIR,
    )

    try:
        # Step 1: Download video
        await meme_generator._update_progress(
            status="downloading",
            progress=5,
            current_step="Downloading video...",
        )

        download_result = await downloader.download(video_url)
        video_path = download_result["video_path"]
        audio_path = download_result["audio_path"]
        video_title = download_result.get("title")
        video_duration = download_result.get("duration", 60)

        await meme_generator._update_progress(
            status="downloading",
            progress=15,
            current_step="Video downloaded",
            video_title=video_title,
            video_duration=video_duration,
        )

        # Step 2: Transcribe for context
        await meme_generator._update_progress(
            status="transcribing",
            progress=20,
            current_step="Transcribing audio for context...",
        )

        transcript_segments = []
        try:
            transcription_result = await transcription_service.transcribe(audio_path)
            transcript_segments = transcription_result.get("segments", [])
            print(f"Transcription complete: {len(transcript_segments)} segments")
        except Exception as e:
            print(f"Transcription failed (continuing without): {e}")

        # Step 3: Generate memes from video frames
        print("\n=== CALLING MEME GENERATOR ===")
        print(f"Video path: {video_path}")
        print(f"Video duration: {video_duration}")
        print(f"Meme count: {meme_count}")
        print(f"Target templates: {target_templates}")
        print(f"Movie context: {movie_metadata}")
        print(f"Transcript segments: {len(transcript_segments)}")
        print("===============================\n")

        result = await meme_generator.generate_memes(
            video_path=video_path,
            video_duration=video_duration,
            meme_count=meme_count,
            target_templates=target_templates,
            movie_context=movie_metadata,
            transcript_segments=transcript_segments,
        )

        print("\n=== MEME GENERATOR RETURNED ===")
        print(f"Success: {result.success}")
        print(f"Memes: {len(result.memes)}")
        print(f"Candidate frames: {len(result.candidate_frames)}")
        if result.error:
            print(f"Error: {result.error}")
        print("===============================\n")

        result.video_title = video_title
        result.video_duration = video_duration

        return result

    except Exception as e:
        print(f"\n!!! PROCESS_MEMES EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        raise

    finally:
        # Cleanup temp files
        print("Cleaning up temp files...")
        meme_generator.cleanup()
        print("Cleanup complete")


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-secret"),
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("rapidapi-youtube"),
        modal.Secret.from_name("gemini-secret"),  # Fallback for caption generation
    ],
    volumes={VOLUME_DIR: volume},
    timeout=1800,
    memory=4096,
    cpu=2.0,
)
@modal.fastapi_endpoint(method="POST")
async def process_memes_endpoint(request: dict):
    """
    HTTP endpoint to trigger meme generation.
    Called by Convex action.

    Expected body:
    {
        "job_id": "unique-job-id",
        "video_url": "https://youtube.com/watch?v=...",
        "meme_count": 5,
        "target_templates": ["reaction", "absurd_visual"],
        "movie_metadata": {"title": "...", "genre": "..."},
        "webhook_url": "https://your-app.convex.site",
        "webhook_secret": "secret"
    }
    """
    # Validate request
    job_id = request.get("job_id")
    video_url = request.get("video_url")

    if not job_id or not video_url:
        return {"status": "error", "message": "Missing job_id or video_url"}

    # Extract parameters
    meme_count = request.get("meme_count", 5)
    target_templates = request.get("target_templates")
    movie_metadata = request.get("movie_metadata")
    webhook_url = request.get("webhook_url")
    webhook_secret = request.get("webhook_secret")

    # Spawn the processing function asynchronously
    process_memes.spawn(
        job_id=job_id,
        video_url=video_url,
        meme_count=meme_count,
        target_templates=target_templates,
        movie_metadata=movie_metadata,
        webhook_url=webhook_url,
        webhook_secret=webhook_secret,
    )

    return {
        "status": "processing",
        "job_id": job_id,
        "message": "Meme generation started",
    }


# =============================================================================
# R2-BASED PROCESSING (Browser-First Architecture)
# =============================================================================

@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-secret"),
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("r2-credentials"),
        modal.Secret.from_name("gemini-secret"),  # Fallback for AI generation
    ],
    volumes={VOLUME_DIR: volume},
    timeout=1800,  # 30 minutes max
    memory=4096,   # 4GB RAM
    cpu=2.0,       # 2 CPU cores
)
async def process_video_r2(job_id: str):
    """
    Process a video from R2 (browser-first architecture).

    This replaces the YouTube-based process_video for jobs where
    the browser has uploaded the video directly to R2.

    Flow:
    1. Claim job from Convex (idempotent lock)
    2. Download video from R2
    3. Extract audio, transcribe, analyze
    4. Generate clips with captions
    5. Upload clips to R2
    6. Complete job in Convex
    """
    import os
    from services.r2_video_processor import R2VideoProcessor

    # Create temp directory
    os.makedirs(TEMP_DIR, exist_ok=True)

    # Initialize processor
    processor = R2VideoProcessor(
        job_id=job_id,
        temp_dir=TEMP_DIR,
    )

    try:
        # Run the full pipeline
        result = await processor.process()
        return {
            "success": result.success,
            "job_id": result.job_id,
            "clips": result.clips,
            "error": result.error,
            "error_stage": result.error_stage,
            "video_duration": result.video_duration,
        }
    finally:
        # Cleanup temp files
        processor.cleanup()


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-secret"),
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("r2-credentials"),
        modal.Secret.from_name("gemini-secret"),  # Fallback for AI generation
    ],
    volumes={VOLUME_DIR: volume},
    timeout=1800,
    memory=4096,
    cpu=2.0,
)
@modal.fastapi_endpoint(method="POST")
async def process_video_r2_endpoint(request: dict):
    """
    HTTP endpoint to trigger R2-based video processing.
    Called by Convex action when browser upload completes.

    Expected body:
    {
        "job_id": "convex-job-id",
        "webhook_secret": "optional-secret-for-verification"
    }

    The job_id is the Convex processing_jobs document ID.
    Job data (r2SourceKey, clipCount, layout, etc.) is fetched
    during the claim process.
    """
    import os

    # Validate request
    job_id = request.get("job_id")
    if not job_id:
        return {"status": "error", "message": "Missing job_id"}

    # Optional: Verify webhook secret
    webhook_secret = request.get("webhook_secret")
    expected_secret = os.environ.get("MODAL_WEBHOOK_SECRET")
    if expected_secret and webhook_secret != expected_secret:
        return {"status": "error", "message": "Invalid webhook secret"}

    # Spawn the processing function asynchronously
    # This allows the HTTP endpoint to return immediately
    process_video_r2.spawn(job_id=job_id)

    return {
        "status": "processing",
        "job_id": job_id,
        "message": "R2 video processing started",
    }


# =============================================================================
# R2-BASED MEME GENERATION (Unified Architecture)
# =============================================================================

@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-secret"),
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("r2-credentials"),
        modal.Secret.from_name("gemini-secret"),  # Fallback for caption generation
    ],
    volumes={VOLUME_DIR: volume},
    timeout=1800,  # 30 minutes max
    memory=4096,   # 4GB RAM
    cpu=2.0,       # 2 CPU cores
)
async def process_memes_r2(job_id: str):
    """
    Process memes from R2 (browser-first/unified architecture).

    This replaces the YouTube-based process_memes for jobs where
    the video is already in R2 (from browser upload or YouTube download).

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
    from services.meme_r2_processor import MemeR2Processor

    # Create temp directory
    os.makedirs(TEMP_DIR, exist_ok=True)

    # Initialize processor
    processor = MemeR2Processor(
        job_id=job_id,
        temp_dir=TEMP_DIR,
    )

    try:
        # Run the full pipeline
        result = await processor.process()
        return {
            "success": result.success,
            "job_id": result.job_id,
            "memes": result.memes,
            "candidate_frames": result.candidate_frames,
            "error": result.error,
            "error_stage": result.error_stage,
            "video_title": result.video_title,
            "video_duration": result.video_duration,
        }
    finally:
        # Cleanup temp files
        processor.cleanup()


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-secret"),
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("r2-credentials"),
        modal.Secret.from_name("gemini-secret"),  # Fallback for caption generation
    ],
    volumes={VOLUME_DIR: volume},
    timeout=1800,
    memory=4096,
    cpu=2.0,
)
@modal.fastapi_endpoint(method="POST")
async def process_memes_r2_endpoint(request: dict):
    """
    HTTP endpoint to trigger R2-based meme generation.
    Called by Convex action when video is ready in R2.

    Expected body:
    {
        "job_id": "convex-meme-job-id",
        "webhook_secret": "optional-secret-for-verification"
    }

    The job_id is the Convex meme_generation_jobs document ID.
    Job data (r2SourceKey, memeCount, etc.) is fetched during the claim process.
    """
    import os

    # Validate request
    job_id = request.get("job_id")
    if not job_id:
        return {"status": "error", "message": "Missing job_id"}

    # Optional: Verify webhook secret
    webhook_secret = request.get("webhook_secret")
    expected_secret = os.environ.get("MODAL_WEBHOOK_SECRET")
    if expected_secret and webhook_secret != expected_secret:
        return {"status": "error", "message": "Invalid webhook secret"}

    # Spawn the processing function asynchronously
    process_memes_r2.spawn(job_id=job_id)

    return {
        "status": "processing",
        "job_id": job_id,
        "message": "R2 meme generation started",
    }


# =============================================================================
# YOUTUBE TO R2 DOWNLOAD (Unified Architecture - RapidAPI)
# =============================================================================

@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("r2-credentials"),
        modal.Secret.from_name("rapidapi-youtube"),
        modal.Secret.from_name("youtube-proxy"),  # For CDN download via residential proxy
    ],
    volumes={VOLUME_DIR: volume},
    timeout=1800,  # 30 minutes max
    memory=4096,   # 4GB RAM
    cpu=2.0,       # 2 CPU cores
)
async def download_youtube_to_r2(
    job_id: str,
    video_url: str,
    user_id: str,
    quality: str = "medium",
):
    """
    Download a YouTube video and upload it to R2.

    This decouples YouTube downloading from video processing,
    enabling a unified R2-based processing pipeline.

    Uses RapidAPI-based YouTube download service instead of yt-dlp.
    No proxy required.

    Flow:
    1. Download video from YouTube using RapidAPI
    2. Upload video to R2: users/{userId}/jobs/{jobId}/source/video.mp4
    3. Return r2_key and metadata for Convex to trigger processing
    """
    import os
    from services.youtube_api_downloader import YouTubeAPIToR2Downloader

    # Create temp directory
    os.makedirs(TEMP_DIR, exist_ok=True)

    # Initialize downloader (uses RapidAPI, no proxy needed)
    downloader = YouTubeAPIToR2Downloader(temp_dir=TEMP_DIR)

    # Download and upload to R2
    result = await downloader.download_to_r2(
        video_url=video_url,
        user_id=user_id,
        job_id=job_id,
        quality=quality,
    )

    return {
        "success": result.get("success", False),
        "r2_key": result.get("r2_key"),
        "title": result.get("title"),
        "duration": result.get("duration"),
        "uploader": result.get("uploader"),
        "thumbnail": result.get("thumbnail"),
        "error": result.get("error"),
        "error_stage": result.get("error_stage"),
    }


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("r2-credentials"),
        modal.Secret.from_name("rapidapi-youtube"),
        modal.Secret.from_name("youtube-proxy"),  # For CDN download via residential proxy
    ],
    volumes={VOLUME_DIR: volume},
    timeout=1800,
    memory=4096,
    cpu=2.0,
)
@modal.fastapi_endpoint(method="POST")
async def download_youtube_r2_endpoint(request: dict):
    """
    HTTP endpoint to download YouTube video to R2 using RapidAPI.
    Called by Convex when a YouTube URL job is created.

    Uses RapidAPI-based download (no yt-dlp or proxy required).

    Expected body:
    {
        "job_id": "convex-job-id",
        "video_url": "https://youtube.com/watch?v=...",
        "user_id": "convex-user-id",
        "quality": "medium",  // optional
        "webhook_secret": "secret"
    }

    On success, calls Convex webhook to mark download complete
    and trigger R2-based processing.
    """
    import os

    # Validate request
    job_id = request.get("job_id")
    video_url = request.get("video_url")
    user_id = request.get("user_id")

    if not job_id or not video_url or not user_id:
        return {"status": "error", "message": "Missing job_id, video_url, or user_id"}

    # Verify webhook secret
    webhook_secret = request.get("webhook_secret")
    expected_secret = os.environ.get("MODAL_WEBHOOK_SECRET")
    if expected_secret and webhook_secret != expected_secret:
        return {"status": "error", "message": "Invalid webhook secret"}

    quality = request.get("quality", "medium")

    # Spawn the download function asynchronously
    download_youtube_to_r2.spawn(
        job_id=job_id,
        video_url=video_url,
        user_id=user_id,
        quality=quality,
    )

    return {
        "status": "downloading",
        "job_id": job_id,
        "message": "YouTube download started (RapidAPI)",
    }


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("r2-credentials"),
        modal.Secret.from_name("rapidapi-youtube"),
        modal.Secret.from_name("youtube-proxy"),  # For CDN download via residential proxy
    ],
    volumes={VOLUME_DIR: volume},
    timeout=1800,
    memory=4096,
    cpu=2.0,
)
async def download_youtube_to_r2_with_callback(
    job_id: str,
    video_url: str,
    user_id: str,
    quality: str = "medium",
):
    """
    Download YouTube to R2 with Convex callback on completion.

    Uses RapidAPI-based download (no yt-dlp or proxy required).

    This version calls Convex webhook when download completes,
    allowing Convex to update job state and trigger processing.
    """
    import os
    import httpx
    from services.youtube_api_downloader import YouTubeAPIToR2Downloader

    print(f"[{job_id}] Starting YouTube download with RapidAPI (no yt-dlp)")
    print(f"[{job_id}] Video URL: {video_url}")

    convex_url = os.environ.get("CONVEX_URL")
    webhook_secret = os.environ.get("MODAL_WEBHOOK_SECRET")

    # Create temp directory
    os.makedirs(TEMP_DIR, exist_ok=True)

    # Download and upload to R2 using RapidAPI (no proxy needed)
    downloader = YouTubeAPIToR2Downloader(temp_dir=TEMP_DIR)
    result = await downloader.download_to_r2(
        video_url=video_url,
        user_id=user_id,
        job_id=job_id,
        quality=quality,
    )

    # Call Convex webhook to report result
    if convex_url:
        webhook_url = f"{convex_url.replace('.cloud', '.site')}/modal/youtube-download-complete"

        # Log what we're sending to Convex
        webhook_payload = {
            "job_id": job_id,
            "success": result.get("success", False),
            "r2_source_key": result.get("r2_key"),
            "video_title": result.get("title"),
            "video_duration": result.get("duration"),
            "error": result.get("error"),
            "error_stage": result.get("error_stage"),
            "webhook_secret": webhook_secret,
        }

        if result.get("success"):
            print(f"[{job_id}] Sending success callback to Convex: r2_key={result.get('r2_key')}")
        else:
            print(f"[{job_id}] Sending failure callback to Convex: error={result.get('error')}, stage={result.get('error_stage')}")

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    webhook_url,
                    json=webhook_payload,
                    timeout=30.0,
                )
                print(f"[{job_id}] Webhook response: {response.status_code}")
                if response.status_code != 200:
                    print(f"[{job_id}] Webhook response body: {response.text}")
            except Exception as e:
                print(f"[{job_id}] Webhook call failed: {e}")
    else:
        print(f"[{job_id}] ERROR: CONVEX_URL not set, cannot send callback to Convex")

    return {
        "success": result.get("success", False),
        "r2_key": result.get("r2_key"),
        "title": result.get("title"),
        "duration": result.get("duration"),
        "error": result.get("error"),
    }


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("r2-credentials"),
        modal.Secret.from_name("rapidapi-youtube"),
        modal.Secret.from_name("youtube-proxy"),  # For CDN download via residential proxy
    ],
    volumes={VOLUME_DIR: volume},
    timeout=1800,
    memory=4096,
    cpu=2.0,
)
@modal.fastapi_endpoint(method="POST")
async def download_youtube_r2_with_callback_endpoint(request: dict):
    """
    HTTP endpoint that downloads YouTube to R2 and calls back to Convex.

    Uses RapidAPI-based download (no yt-dlp or proxy required).

    This is the recommended endpoint for the unified flow:
    1. Convex creates job with inputType="youtube"
    2. Convex calls this endpoint
    3. Modal downloads video → uploads to R2 (via RapidAPI)
    4. Modal calls Convex webhook with r2_source_key
    5. Convex updates job and triggers process_video_r2

    Expected body:
    {
        "job_id": "convex-job-id",
        "video_url": "https://youtube.com/watch?v=...",
        "user_id": "convex-user-id",
        "quality": "medium",
        "webhook_secret": "secret"
    }
    """
    import os

    # Validate request
    job_id = request.get("job_id")
    video_url = request.get("video_url")
    user_id = request.get("user_id")

    print(f"[RapidAPI Endpoint] Received request for job_id={job_id}, video_url={video_url}")

    if not job_id or not video_url or not user_id:
        return {"status": "error", "message": "Missing job_id, video_url, or user_id"}

    # Verify webhook secret
    webhook_secret = request.get("webhook_secret")
    expected_secret = os.environ.get("MODAL_WEBHOOK_SECRET")
    if expected_secret and webhook_secret != expected_secret:
        return {"status": "error", "message": "Invalid webhook secret"}

    quality = request.get("quality", "medium")

    print(f"[RapidAPI Endpoint] Spawning download for job_id={job_id} (RapidAPI, no yt-dlp)")

    # Spawn the download function with callback (uses RapidAPI, no proxy)
    download_youtube_to_r2_with_callback.spawn(
        job_id=job_id,
        video_url=video_url,
        user_id=user_id,
        quality=quality,
    )

    return {
        "status": "downloading",
        "job_id": job_id,
        "message": "YouTube download started (RapidAPI) - will callback on completion",
    }


# =============================================================================
# R2-BASED GIF GENERATION
# =============================================================================

@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-secret"),
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("r2-credentials"),
        modal.Secret.from_name("gemini-secret"),  # Fallback for AI generation
    ],
    volumes={VOLUME_DIR: volume},
    timeout=1800,  # 30 minutes max
    memory=4096,   # 4GB RAM
    cpu=2.0,       # 2 CPU cores
)
async def process_gifs_r2(job_id: str):
    """
    Process GIFs from R2 (browser-first/unified architecture).

    This generates GIFs from videos stored in R2 using AI to detect
    viral/funny moments and apply text overlays.

    Flow:
    1. Claim job from Convex (idempotent lock)
    2. Download video from R2
    3. Extract audio and transcribe with sentiment analysis
    4. Analyze transcript with GPT-4o for viral moments
    5. Generate GIFs with text overlays using FFmpeg
    6. Upload GIFs to R2
    7. Complete job in Convex
    """
    import os
    from services.gif_r2_processor import GifR2Processor

    # Create temp directory
    os.makedirs(TEMP_DIR, exist_ok=True)

    # Initialize processor
    processor = GifR2Processor(
        job_id=job_id,
        temp_dir=TEMP_DIR,
    )

    try:
        # Run the full pipeline
        result = await processor.process()
        return {
            "success": result.success,
            "job_id": result.job_id,
            "gifs": result.gifs,
            "moments": result.moments,
            "error": result.error,
            "error_stage": result.error_stage,
            "video_title": result.video_title,
            "video_duration": result.video_duration,
        }
    finally:
        # Cleanup temp files
        processor.cleanup()


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-secret"),
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("r2-credentials"),
        modal.Secret.from_name("gemini-secret"),  # Fallback for AI generation
    ],
    volumes={VOLUME_DIR: volume},
    timeout=1800,
    memory=4096,
    cpu=2.0,
)
@modal.fastapi_endpoint(method="POST")
async def process_gifs_r2_endpoint(request: dict):
    """
    HTTP endpoint to trigger R2-based GIF generation.
    Called by Convex action when video is ready in R2.

    Expected body:
    {
        "job_id": "convex-gif-job-id",
        "webhook_secret": "optional-secret-for-verification"
    }

    The job_id is the Convex gif_generation_jobs document ID.
    Job data (r2SourceKey, gifCount, overlayStyle, etc.) is fetched
    during the claim process.
    """
    import os

    # Validate request
    job_id = request.get("job_id")
    if not job_id:
        return {"status": "error", "message": "Missing job_id"}

    # Optional: Verify webhook secret
    webhook_secret = request.get("webhook_secret")
    expected_secret = os.environ.get("MODAL_WEBHOOK_SECRET")
    if expected_secret and webhook_secret != expected_secret:
        return {"status": "error", "message": "Invalid webhook secret"}

    # Spawn the processing function asynchronously
    process_gifs_r2.spawn(job_id=job_id)

    return {
        "status": "processing",
        "job_id": job_id,
        "message": "R2 GIF generation started",
    }


# =============================================================================
# TRAILER GENERATION PIPELINE
# =============================================================================

@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-secret"),
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("r2-credentials"),
        modal.Secret.from_name("gemini-secret"),  # Fallback for AI generation
    ],
    volumes={VOLUME_DIR: volume},
    timeout=3600,  # 60 minutes max (trailers are longer)
    memory=8192,   # 8GB RAM (larger files)
    cpu=4.0,       # 4 CPU cores (faster encoding)
)
async def process_trailer_r2(job_id: str):
    """
    Process a feature film from R2 into trailer cuts.

    This function implements the full trailer generation pipeline:
    1. Download source from R2 (or use proxy if available)
    2. Generate 720p proxy for faster analysis
    3. Extract audio and transcribe
    4. Detect scene boundaries
    5. AI generates timestamp plan (GPT-4o)
    6. Render trailer variants (theatrical, teaser, social)
    7. Upload outputs to R2
    8. Complete job in Convex

    Flow:
    1. Claim job from Convex (idempotent lock)
    2. Analysis phase (proxy → transcribe → scene detection)
    3. Synthesis phase (GPT-4o timestamp planning)
    4. Render phase (ffmpeg concat with transitions)
    5. Upload and finalize
    """
    import os
    from services.trailer_processor import TrailerProcessor

    # Create temp directory
    os.makedirs(TEMP_DIR, exist_ok=True)

    # Initialize processor
    processor = TrailerProcessor(
        job_id=job_id,
        temp_dir=TEMP_DIR,
    )

    try:
        # Run the full pipeline
        result = await processor.process()
        return {
            "success": result.success,
            "job_id": result.job_id,
            "clips": result.clips,
            "error": result.error,
            "error_stage": result.error_stage,
            "video_duration": result.video_duration,
        }
    finally:
        # Cleanup temp files
        processor.cleanup()


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-secret"),
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("r2-credentials"),
        modal.Secret.from_name("gemini-secret"),  # Fallback for AI generation
    ],
    volumes={VOLUME_DIR: volume},
    timeout=3600,
    memory=8192,
    cpu=4.0,
)
@modal.fastapi_endpoint(method="POST")
async def process_trailer_r2_endpoint(request: dict):
    """
    HTTP endpoint to trigger trailer generation.
    Called by Convex action when source video is ready in R2.

    Expected body:
    {
        "job_id": "convex-trailer-job-id",
        "webhook_secret": "optional-secret-for-verification"
    }

    The job_id is the Convex trailer_jobs document ID.
    Job data (videoJobId, profileId, etc.) is fetched during the claim process.
    """
    import os

    # Validate request
    job_id = request.get("job_id")
    if not job_id:
        return {"status": "error", "message": "Missing job_id"}

    # Optional: Verify webhook secret
    webhook_secret = request.get("webhook_secret")
    expected_secret = os.environ.get("MODAL_WEBHOOK_SECRET")
    if expected_secret and webhook_secret != expected_secret:
        return {"status": "error", "message": "Invalid webhook secret"}

    # Spawn the processing function asynchronously
    process_trailer_r2.spawn(job_id=job_id)

    return {
        "status": "processing",
        "job_id": job_id,
        "message": "Trailer generation started",
    }


# =============================================================================
# CLI ENTRY POINT (for testing)
# =============================================================================

@app.local_entrypoint()
def main(video_url: str, num_clips: int = 5, layout: str = "standard"):
    """
    Local CLI for testing.

    Usage:
        modal run app.py --video-url "https://youtube.com/watch?v=..."
    """
    import uuid

    job_id = f"test_{uuid.uuid4().hex[:8]}"
    print(f"Starting job: {job_id}")
    print(f"Video URL: {video_url}")
    print(f"Num clips: {num_clips}")
    print(f"Layout: {layout}")

    result = process_video.remote(
        job_id=job_id,
        video_url=video_url,
        num_clips=num_clips,
        layout=layout,
    )

    print(f"Result: {result}")
