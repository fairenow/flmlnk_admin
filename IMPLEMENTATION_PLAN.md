# Implementation Plan: Unified YouTube → R2 → Modal Video Processing

## Overview

This plan outlines the refactoring to:
1. **Remove legacy YouTube download flow** (yt-dlp in Modal with proxy)
2. **Create YouTube → R2 download service** (download YouTube directly to R2 bucket)
3. **Unify all processing through R2-based flow** (clips and memes)

## Current Architecture Problems

| Flow | Problem |
|------|---------|
| YouTube clips | Downloads in Modal temp → processes → uploads clips to Convex storage |
| Browser upload clips | Uploads to R2 → Modal downloads from R2 → uploads clips to R2 |
| Memes | Downloads in Modal temp → processes → uploads to Convex storage |

**Issues:**
- Split storage (Convex storage vs R2) based on input type
- Duplicate YouTube download code
- yt-dlp proxy management in Modal is fragile
- No unified processing path

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    UNIFIED FLOW (ALL INPUTS)                    │
└─────────────────────────────────────────────────────────────────┘

Input Sources:
  1. YouTube URL   ──┐
  2. Browser Upload ─┼──► R2 Bucket ──► Modal Processor ──► R2 Clips
  3. Direct URL    ──┘    (source)       (from R2)          (output)
```

**Key Change**: YouTube videos are downloaded to R2 FIRST, then processed using the same R2-based pipeline as browser uploads.

---

## Phase 1: YouTube to R2 Download Service

### 1.1 New Modal Service: `youtube_to_r2_downloader.py`

**Location**: `modal/services/youtube_to_r2_downloader.py`

**Purpose**: Download YouTube video and upload directly to R2

```python
class YouTubeToR2Downloader:
    """
    Downloads YouTube videos and uploads them directly to R2.
    This separates the download step from processing.
    """

    async def download_to_r2(
        self,
        video_url: str,
        user_id: str,
        job_id: str,
    ) -> dict:
        """
        1. Download from YouTube using yt-dlp (with proxy if available)
        2. Upload video to R2: users/{userId}/jobs/{jobId}/source/video.mp4
        3. Return r2_key and video metadata (duration, title)
        """
```

### 1.2 New Modal Endpoint: `download_youtube_r2_endpoint`

**Location**: `modal/app.py`

```python
@app.function(...)
@modal.fastapi_endpoint(method="POST")
async def download_youtube_r2_endpoint(request: dict):
    """
    HTTP endpoint to download YouTube video to R2.
    Called by Convex when inputType="youtube".

    Request:
    {
        "job_id": "convex-job-id",
        "video_url": "https://youtube.com/...",
        "webhook_secret": "..."
    }

    Flow:
    1. Download video from YouTube
    2. Upload to R2
    3. Call Convex webhook with r2SourceKey
    4. Convex triggers processing via process_video_r2
    """
```

### 1.3 Convex Changes: New Job State

**Location**: `convex/processing.ts`

Add new job status: `DOWNLOADING`

```
CREATED → DOWNLOADING → UPLOADED → PROCESSING → READY
              ↑              ↑
         (YouTube)     (Browser upload)
```

**New mutations needed:**
- `markDownloadComplete` - Called after YouTube→R2 download completes
- `triggerYouTubeDownload` - Internal action to call download endpoint

### 1.4 New HTTP Webhook: YouTube Download Complete

**Location**: `convex/http.ts`

```typescript
// POST /modal/youtube-download-complete
// Called by Modal after YouTube video is uploaded to R2
{
  job_id: string,
  r2_source_key: string,  // e.g., "users/{userId}/jobs/{jobId}/source/video.mp4"
  video_title: string,
  video_duration: number,
  webhook_secret: string
}
```

---

## Phase 2: Remove Legacy YouTube Processing

### 2.1 Deprecate `process_video` and `process_video_endpoint`

**Location**: `modal/app.py`

- Mark as deprecated (keep for backwards compatibility initially)
- Remove `youtube-proxy` and `rapidapi-youtube` secrets from R2 functions
- All new YouTube jobs use: YouTube → R2 → `process_video_r2`

### 2.2 Update Convex `callModalEndpoint`

**Location**: `convex/processing.ts`

```typescript
// Current: Routes to different endpoints based on inputType
// New: Always route through R2 flow

if (job.inputType === "youtube") {
  // NEW: First download to R2, then process
  await ctx.scheduler.runAfter(0, internal.processing.triggerYouTubeDownload, {
    jobId: args.jobId,
  });
} else {
  // Browser upload: already in R2, trigger processing directly
  await ctx.scheduler.runAfter(0, internal.processing.callModalR2Endpoint, {
    jobId: args.jobId,
  });
}
```

### 2.3 Update Job Flow for YouTube

```
User submits YouTube URL
        ↓
createJob(inputType: "youtube", sourceUrl: "https://...")
        ↓
status: CREATED → DOWNLOADING
        ↓
Modal: download_youtube_r2_endpoint
        ↓
yt-dlp downloads → uploads to R2
        ↓
Webhook: /modal/youtube-download-complete
        ↓
markDownloadComplete() → status: UPLOADED, r2SourceKey set
        ↓
triggerModalProcessing() → process_video_r2_endpoint
        ↓
(Same as browser upload from here)
```

---

## Phase 3: Apply to Meme Generator

### 3.1 New Service: `meme_r2_processor.py`

**Location**: `modal/services/meme_r2_processor.py`

**Pattern**: Copy structure from `r2_video_processor.py`

```python
class MemeR2Processor:
    """
    Meme generator for R2-based architecture.
    Processes videos stored in R2 (from browser upload or YouTube download).
    """

    async def process(self) -> MemeProcessingResult:
        """
        1. Claim job from Convex
        2. Download video from R2
        3. Extract audio, transcribe
        4. Extract frames at smart intervals
        5. Analyze frames with OpenAI Vision
        6. Generate captions with GPT-4o
        7. Compose memes
        8. Upload memes to R2
        9. Complete job in Convex
        """
```

### 3.2 New Modal Endpoint: `process_memes_r2_endpoint`

**Location**: `modal/app.py`

```python
@app.function(
    secrets=[
        modal.Secret.from_name("openai-secret"),
        modal.Secret.from_name("convex-webhooks"),
        modal.Secret.from_name("r2-credentials"),
    ],
    ...
)
async def process_memes_r2(job_id: str):
    """Process memes from R2-stored video."""
    processor = MemeR2Processor(job_id=job_id, temp_dir=TEMP_DIR)
    return await processor.process()

@modal.fastapi_endpoint(method="POST")
async def process_memes_r2_endpoint(request: dict):
    """HTTP endpoint for R2-based meme generation."""
```

### 3.3 Convex Meme Generator Updates

**Location**: `convex/memeGenerator.ts`

**Schema changes for `meme_generation_jobs`:**
```typescript
{
  // Existing fields...
  inputType: "youtube" | "local",  // NEW
  r2SourceKey?: string,            // NEW: R2 key for source video
  status: "created" | "downloading" | "uploaded" | "processing" | ...
}
```

**New mutations:**
- `createMemeJob` - Updated to support inputType
- `markMemeDownloadComplete` - After YouTube→R2 download
- `claimMemeJobForProcessing` - Idempotent lock (same pattern as clips)
- `completeMemeProcessing` - Store results with R2 keys

**Updated flow:**
```typescript
// submitMemeGenerationJob
if (sourceVideoUrl.includes("youtube.com") || sourceVideoUrl.includes("youtu.be")) {
  // YouTube: Download to R2 first
  inputType = "youtube";
  // Trigger YouTube→R2 download
} else {
  // Assume browser upload already in R2
  inputType = "local";
  // Trigger meme processing directly
}
```

### 3.4 Meme R2 Storage Structure

```
users/{userId}/meme-jobs/{jobId}/
  ├── source/video.mp4           # Source video (from YouTube or upload)
  ├── frames/frame_{index}.jpg   # Extracted candidate frames
  └── memes/meme_{index}.jpg     # Generated memes
```

### 3.5 New HTTP Webhooks for Meme R2 Flow

**Location**: `convex/http.ts`

```typescript
// POST /modal/meme-r2-progress
// POST /modal/meme-r2-frame
// POST /modal/meme-r2-complete
```

---

## Phase 4: Browser Upload for Memes (Optional Enhancement)

Allow users to upload videos directly for meme generation (same as clip upload).

### 4.1 Convex R2 Actions for Memes

**Location**: `convex/r2.ts`

```typescript
// r2CreateMemeMultipart - Start multipart upload for meme job
// r2CompleteMemeMultipart - Complete upload and trigger processing
```

### 4.2 UI Integration

Add video upload component to meme generator page, similar to clip generator.

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `modal/services/youtube_to_r2_downloader.py` | YouTube → R2 download service |
| `modal/services/meme_r2_processor.py` | Meme generation from R2 videos |

### Modified Files
| File | Changes |
|------|---------|
| `modal/app.py` | Add `download_youtube_r2_endpoint`, `process_memes_r2_endpoint` |
| `convex/processing.ts` | Add DOWNLOADING status, YouTube→R2 flow |
| `convex/memeGenerator.ts` | Add R2 support, inputType field |
| `convex/http.ts` | Add YouTube download complete webhook, meme R2 webhooks |
| `convex/schema.ts` | Update `meme_generation_jobs` schema |

### Deprecated (Keep for Backwards Compatibility)
| File | What |
|------|------|
| `modal/app.py` | `process_video()`, `process_video_endpoint()` |
| `modal/services/video_processor.py` | Legacy YouTube processor |

---

## Implementation Order

### Step 1: YouTube → R2 Download Service
1. Create `youtube_to_r2_downloader.py`
2. Add `download_youtube_r2_endpoint` to `modal/app.py`
3. Add webhook handler in `convex/http.ts`
4. Update `convex/processing.ts` with new flow

### Step 2: Test YouTube → R2 → Clips Flow
1. Submit YouTube URL
2. Verify download to R2 works
3. Verify `process_video_r2` processes correctly
4. Verify clips stored in R2

### Step 3: Meme Generator R2 Integration
1. Create `meme_r2_processor.py`
2. Add `process_memes_r2_endpoint` to `modal/app.py`
3. Update `convex/memeGenerator.ts`
4. Add meme webhooks to `convex/http.ts`
5. Update schema

### Step 4: Test Meme R2 Flow
1. Submit YouTube URL for meme generation
2. Verify YouTube → R2 download
3. Verify meme processing from R2
4. Verify memes stored in R2

### Step 5: Deprecate Legacy Endpoints
1. Add deprecation warnings to legacy endpoints
2. Update documentation
3. Monitor for any remaining usage

---

## Environment Variables

### Required (Already Configured)
- `R2_ENDPOINT_URL`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `CONVEX_URL`
- `MODAL_WEBHOOK_SECRET`
- `OPENAI_API_KEY`

### New Environment Variables
- `MODAL_YOUTUBE_DOWNLOAD_ENDPOINT_URL` - URL for YouTube→R2 download endpoint
- `MODAL_MEME_R2_ENDPOINT_URL` - URL for R2-based meme processing

---

## Rollback Plan

1. Legacy endpoints remain functional
2. Feature flag to switch between old/new flows
3. Both Convex storage and R2 storage remain available

---

## Benefits of This Architecture

1. **Unified processing path** - All videos go through R2
2. **Consistent storage** - All outputs in R2
3. **Decoupled download from processing** - Can retry downloads without re-processing
4. **Easier debugging** - Source videos preserved in R2
5. **Scalable** - R2 handles large files better than Convex storage
6. **Resume support** - Downloads and processing can be resumed
