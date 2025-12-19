# Browser-First Video Ingestion Architecture

## Core Principle

**The backend is never allowed to fetch from YouTube.**

The client may *reference* YouTube, but the system only processes files that the user's device uploads to R2.

---

## Architecture Overview

```
User uploads file (or downloads YouTube locally first)
↓
Convex job created (CREATED)
↓
Upload session created via action (uploadId, partUrls)
↓
Browser uploads chunks → R2 (reports each part)
↓
Convex tracks completedParts[] incrementally
↓
Upload complete → job = UPLOADED
↓
Convex scheduler triggers Modal
↓
Modal worker claims job (idempotent lock)
↓
Worker fetches timestamps from Convex
↓
FFmpeg cuts clips
↓
Clips uploaded to R2
↓
Convex updated → READY
↓
UI streams clips (cached signed URLs)
```

---

## System Roles

| Layer | Responsibility |
|-------|----------------|
| Browser (Next.js) | Collects user-provided media (local file upload; optionally user-assisted download) and uploads to R2 |
| R2 (Cloudflare) | Object storage for source videos + clips |
| Convex | Orchestration, state, auth, job lifecycle, scheduling |
| Modal | Deterministic compute (FFmpeg, ML, generation) - never touches YouTube |

---

## 1. Job Status Model

```
CREATED    → Job exists, no media yet
UPLOADING  → Client actively uploading
UPLOADED   → R2 has the source video
PROCESSING → Worker is clipping (locked)
READY      → Clips available
FAILED     → Store error + stage
```

---

## 2. Convex Schema

### `jobs` table
```typescript
{
  _id: Id<"jobs">
  userId: Id<"users">
  status: "CREATED" | "UPLOADING" | "UPLOADED" | "PROCESSING" | "READY" | "FAILED"
  inputType: "youtube" | "local"
  sourceUrl?: string           // YouTube URL if applicable (reference only)
  videoId?: string             // YouTube video ID if applicable
  title?: string
  r2SourceKey?: string         // R2 key for source video

  // Processing lock (prevents duplicate workers)
  processingLockId?: string
  processingStartedAt?: number
  attemptCount: number         // Default: 0

  error?: string
  errorStage?: string
  createdAt: number
  updatedAt: number
}
```

**Indexes:**
- `by_userId`
- `by_status`
- `by_userId_status`

### `uploadSessions` table
```typescript
{
  _id: Id<"uploadSessions">
  jobId: Id<"jobs">
  r2Key: string                // Target R2 key
  uploadId: string             // R2 multipart upload ID
  partSize: number             // Bytes per part
  totalParts: number
  completedParts: Array<{      // Updated incrementally
    partNumber: number
    etag: string               // Store EXACTLY as returned (may include quotes)
  }>
  bytesUploaded: number
  totalBytes: number
  status: "ACTIVE" | "COMPLETED" | "ABORTED"
  createdAt: number
  updatedAt: number
}
```

**Indexes:**
- `by_jobId_status` (for resume lookup)

### `clips` table
```typescript
{
  _id: Id<"clips">
  jobId: Id<"jobs">
  clipIndex: number
  startTime: number            // Seconds
  endTime: number              // Seconds
  duration: number             // Seconds
  r2ClipKey: string
  r2ThumbKey?: string
  title?: string
  createdAt: number
}
```

**Indexes:**
- `by_jobId`

### `clipTimestamps` table
```typescript
{
  _id: Id<"clipTimestamps">
  jobId: Id<"jobs">
  timestamps: Array<{
    start: number
    end: number
    reason?: string            // Why AI selected this segment
  }>
  source: "equal_segments" | "scene_detection" | "ai_analysis"
  createdAt: number
}
```

**Indexes:**
- `by_jobId`

---

## 3. R2 Object Layout

```
users/{userId}/jobs/{jobId}/source/original.mp4
users/{userId}/jobs/{jobId}/clips/{clipId}.mp4
users/{userId}/jobs/{jobId}/thumbs/{clipId}.jpg
```

---

## 4. Ingestion Paths

### Path A: Local File Upload (Hero Path)

**Use when:** User has the file locally. This is the primary, most reliable path.

**UX framing:** "Upload your video for best quality and fastest processing."

**Flow:**
1. User selects file
2. UI calls `createJob` mutation (`CREATED`, `inputType="local"`)
3. UI calls `r2CreateMultipart` action → returns `{uploadId, partUrls}`
4. UI calls `saveUploadSession` mutation → persists session
5. Browser uploads parts directly to R2
6. After each part: UI calls `reportUploadedPart` mutation
7. When done: UI calls `r2CompleteMultipart` action + `markUploadComplete` mutation
8. Job → `UPLOADED`, Convex scheduler triggers Modal

### Path B: YouTube URL (User-Assisted)

**Use when:** User wants to process a YouTube video.

**Reality check:** Browser cannot reliably capture YouTube playback due to cross-origin restrictions and DRM. User must download the file themselves.

**UX framing:** "Download the video from YouTube, then upload it here."

**Flow:**
1. User pastes YouTube URL
2. UI shows: "To process this video, download it first using [browser extension / yt-dlp / etc], then upload the file."
3. User downloads video locally
4. Proceeds via Path A (local file upload)

**Alternative (future):** Desktop helper app or browser extension that handles download + upload seamlessly. Not MVP scope.

---

## 5. Upload Flow (Multipart, Resumable)

### Key Correction: Actions vs Mutations

- **Actions** handle R2 network I/O (create multipart, sign URLs, complete)
- **Mutations** handle DB state (persist session, track progress)

### R2 Actions

```typescript
// action: Create multipart upload
export const r2CreateMultipart = action({
  args: {
    jobId: v.id("jobs"),
    filename: v.string(),
    totalBytes: v.number(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.jobs.get, { jobId: args.jobId })
    // Verify ownership via ctx.auth

    const r2Key = `users/${job.userId}/jobs/${args.jobId}/source/${args.filename}`
    const partSize = 10 * 1024 * 1024 // 10MB parts
    const totalParts = Math.ceil(args.totalBytes / partSize)

    // Create R2 multipart upload
    const uploadId = await r2Client.createMultipartUpload(r2Key)

    // Generate first batch of signed URLs
    const partUrls = await signPartUrls(r2Key, uploadId, 1, Math.min(20, totalParts))

    return { uploadId, r2Key, partSize, totalParts, partUrls }
  }
})

// action: Sign additional part URLs (for large files)
export const r2SignParts = action({
  args: {
    sessionId: v.id("uploadSessions"),
    startPart: v.number(),
    endPart: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(internal.uploadSessions.get, { id: args.sessionId })
    return await signPartUrls(session.r2Key, session.uploadId, args.startPart, args.endPart)
  }
})

// action: Complete multipart upload
export const r2CompleteMultipart = action({
  args: { sessionId: v.id("uploadSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(internal.uploadSessions.get, { id: args.sessionId })

    // IMPORTANT: Pass ETags exactly as stored (may include quotes)
    await r2Client.completeMultipartUpload(
      session.r2Key,
      session.uploadId,
      session.completedParts
    )

    return { r2Key: session.r2Key }
  }
})
```

### State Mutations

```typescript
// mutation: Create job
export const createJob = mutation({
  args: {
    inputType: v.union(v.literal("youtube"), v.literal("local")),
    sourceUrl: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.auth.getUserIdentity()

    return await ctx.db.insert("jobs", {
      userId,
      status: "CREATED",
      inputType: args.inputType,
      sourceUrl: args.sourceUrl,
      title: args.title,
      attemptCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }
})

// mutation: Save upload session (after r2CreateMultipart action)
export const saveUploadSession = mutation({
  args: {
    jobId: v.id("jobs"),
    r2Key: v.string(),
    uploadId: v.string(),
    partSize: v.number(),
    totalParts: v.number(),
    totalBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const sessionId = await ctx.db.insert("uploadSessions", {
      jobId: args.jobId,
      r2Key: args.r2Key,
      uploadId: args.uploadId,
      partSize: args.partSize,
      totalParts: args.totalParts,
      completedParts: [],
      bytesUploaded: 0,
      totalBytes: args.totalBytes,
      status: "ACTIVE",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await ctx.db.patch(args.jobId, {
      status: "UPLOADING",
      updatedAt: Date.now(),
    })

    return sessionId
  }
})

// mutation: Report each uploaded part (critical for resume integrity)
export const reportUploadedPart = mutation({
  args: {
    sessionId: v.id("uploadSessions"),
    partNumber: v.number(),
    etag: v.string(),           // Store EXACTLY as returned
    partBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)

    // Append to completedParts
    const completedParts = [
      ...session.completedParts,
      { partNumber: args.partNumber, etag: args.etag }
    ]

    await ctx.db.patch(args.sessionId, {
      completedParts,
      bytesUploaded: session.bytesUploaded + args.partBytes,
      updatedAt: Date.now(),
    })
  }
})

// mutation: Mark upload complete (after r2CompleteMultipart action)
export const markUploadComplete = mutation({
  args: {
    sessionId: v.id("uploadSessions"),
    r2Key: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)

    await ctx.db.patch(args.sessionId, {
      status: "COMPLETED",
      updatedAt: Date.now(),
    })

    await ctx.db.patch(session.jobId, {
      status: "UPLOADED",
      r2SourceKey: args.r2Key,
      updatedAt: Date.now(),
    })

    // Trigger Modal via scheduler
    await ctx.scheduler.runAfter(0, internal.processing.triggerModal, {
      jobId: session.jobId
    })
  }
})
```

### Resume Flow

```typescript
// query: Check for active upload session
export const getActiveUploadSession = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("uploadSessions")
      .withIndex("by_jobId_status", q =>
        q.eq("jobId", args.jobId).eq("status", "ACTIVE")
      )
      .first()
  }
})

// Resume flow in UI:
// 1. On mount, check for ACTIVE session
// 2. If found:
//    - nextPart = completedParts.length + 1
//    - Request signed URLs only for missing parts
//    - Continue uploading
// 3. On each part complete, call reportUploadedPart
// 4. This survives page reloads, network drops, browser crashes
```

---

## 6. Modal Worker (Pure Compute)

### Idempotent Job Claiming

Workers must claim jobs atomically to prevent duplicate processing.

```typescript
// Convex internal mutation: Claim job for processing
export const claimJobForProcessing = internalMutation({
  args: { jobId: v.id("jobs"), lockId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId)

    // Only claim if UPLOADED and not already locked
    if (job.status !== "UPLOADED") {
      return { claimed: false, reason: "wrong_status" }
    }

    if (job.processingLockId) {
      // Check if lock is stale (> 30 minutes)
      const staleThreshold = 30 * 60 * 1000
      if (Date.now() - job.processingStartedAt < staleThreshold) {
        return { claimed: false, reason: "already_locked" }
      }
    }

    // Claim the job
    await ctx.db.patch(args.jobId, {
      status: "PROCESSING",
      processingLockId: args.lockId,
      processingStartedAt: Date.now(),
      attemptCount: job.attemptCount + 1,
      updatedAt: Date.now(),
    })

    return { claimed: true, r2SourceKey: job.r2SourceKey }
  }
})
```

### Modal Worker Flow

```python
# modal/services/r2_fetcher.py
import boto3
import os
from pathlib import Path

class R2Fetcher:
    def __init__(self):
        self.s3 = boto3.client(
            's3',
            endpoint_url=os.environ['R2_ENDPOINT'],
            aws_access_key_id=os.environ['R2_ACCESS_KEY'],
            aws_secret_access_key=os.environ['R2_SECRET_KEY'],
        )
        self.bucket = os.environ['R2_BUCKET']

    def download(self, r2_key: str, local_path: Path) -> Path:
        """Download file from R2 to local path."""
        self.s3.download_file(self.bucket, r2_key, str(local_path))
        return local_path

    def upload(self, local_path: Path, r2_key: str) -> str:
        """Upload file to R2, return key."""
        self.s3.upload_file(str(local_path), self.bucket, r2_key)
        return r2_key
```

```python
# modal/app.py - Worker endpoint
@app.function(...)
async def process_job(job_id: str):
    lock_id = str(uuid.uuid4())

    # 1. Claim job (idempotent)
    claim_result = await convex_client.mutation("claimJobForProcessing", {
        "jobId": job_id,
        "lockId": lock_id
    })

    if not claim_result["claimed"]:
        print(f"Job {job_id} not claimed: {claim_result['reason']}")
        return

    try:
        # 2. Download source from R2
        r2_key = claim_result["r2SourceKey"]
        local_path = r2_fetcher.download(r2_key, temp_dir / "source.mp4")

        # 3. Get or generate timestamps
        timestamps = await get_timestamps(job_id)  # From Convex or generate equal segments

        # 4. Cut clips
        clips = await cut_clips(local_path, timestamps)

        # 5. Upload clips to R2
        clip_keys = []
        for clip in clips:
            key = r2_fetcher.upload(clip.path, f"users/{user_id}/jobs/{job_id}/clips/{clip.id}.mp4")
            clip_keys.append({"clipId": clip.id, "r2Key": key, ...})

        # 6. Update Convex
        await convex_client.mutation("completeProcessing", {
            "jobId": job_id,
            "lockId": lock_id,
            "clips": clip_keys
        })

    except Exception as e:
        await convex_client.mutation("failProcessing", {
            "jobId": job_id,
            "lockId": lock_id,
            "error": str(e)
        })
```

### What Changes in Existing Code

**Keep (reuse):**
- `video_processor.py` - Pipeline orchestration
- `transcription.py` - Whisper API integration
- `clip_analyzer.py` - GPT-4o clip identification
- `video_clipper.py` - FFmpeg rendering
- `face_detector.py` - MediaPipe face detection
- `caption_generator.py` - ASS subtitle format

**Remove:**
- `youtube_downloader.py` - Replace with R2Fetcher
- `ProxyManager` class - No longer needed
- All proxy/PO token/impersonation logic

**Add:**
- `r2_fetcher.py` - R2 download/upload
- Idempotent job claiming logic

---

## 7. Clip URL Caching

### Problem
If every clip card requests a signed URL on every render, you'll hit read load issues.

### Solution
Generate signed URLs with TTL and cache in UI.

```typescript
// Convex action: Get signed URLs for clips (batch)
export const getClipUrls = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const clips = await ctx.runQuery(internal.clips.byJobId, { jobId: args.jobId })

    // Sign all URLs with 60-minute TTL
    const signedUrls = await Promise.all(
      clips.map(clip => ({
        clipId: clip._id,
        clipUrl: signR2Url(clip.r2ClipKey, 60 * 60),
        thumbUrl: clip.r2ThumbKey ? signR2Url(clip.r2ThumbKey, 60 * 60) : null,
      }))
    )

    return signedUrls
  }
})
```

```typescript
// UI: Cache signed URLs
const [signedUrls, setSignedUrls] = useState<Map<string, {url: string, expires: number}>>()

useEffect(() => {
  if (job.status === "READY" && !signedUrls) {
    // Fetch once per job load
    getClipUrls({ jobId }).then(urls => {
      const urlMap = new Map()
      urls.forEach(u => urlMap.set(u.clipId, {
        url: u.clipUrl,
        expires: Date.now() + 55 * 60 * 1000 // Refresh 5 min before expiry
      }))
      setSignedUrls(urlMap)
    })
  }
}, [job.status])
```

---

## 8. Build Order (Refined)

| Step | Task | Outcome |
|------|------|---------|
| 1 | Convex schema + indexes | Data model exists |
| 2 | R2 actions (create, sign, complete) | R2 integration works |
| 3 | State mutations (createJob, saveUploadSession, reportUploadedPart, markUploadComplete) | Upload lifecycle works |
| 4 | Resume query (getActiveUploadSession) | Resumable uploads |
| 5 | Modal worker v1 with idempotent claiming | Processing works |
| 6 | UI: resumable uploader + job status subscription | End-to-end visible |
| 7 | Clip URL caching | Performance |
| 8 | Error handling + progress UI | Production-ready |
| 9 | AI timestamp selection (reuse existing GPT-4o logic) | Full intelligence |

---

## 9. Security & Access Control

- Every job is owned by `userId`
- Only job owner can request upload URLs for that job
- Clip URLs: signed GET URLs with TTL, cached in UI
- Upload credentials stay server-side; client sees only short-lived signed URLs
- Processing lock prevents duplicate worker execution

---

## 10. Scale Plan

### Stage 1: MVP
- Multipart upload (signed URLs)
- Convex scheduler → Modal
- One worker instance
- Equal-segment clip generation

### Stage 2: Production
- Horizontal workers (N instances)
- Backpressure: max jobs per user
- Retry policy via attemptCount
- Stale lock detection

### Stage 3: Scale
- Processing profiles (720p preview vs full res)
- Priority queue for paid users
- Lifecycle rules on R2 (auto-delete sources after X days)

---

## Why This Architecture Wins

**Eliminated:**
- YouTube bot detection
- Proxy costs and complexity
- PO token chasing
- Random 2am breakages
- Arms race with Google
- Browser capture brittleness

**Gained:**
- Local upload as hero path (reliable, high quality)
- Modal handles compute (deterministic, scalable)
- Convex handles state (reactive, resumable)
- R2 handles storage (cheap, scalable)
- Idempotent processing (no duplicate work)
- Incremental upload tracking (no lost progress)

**Product reality:**
Filmmakers already have the file. Local upload is the hero path.
YouTube URL support exists as a reference + user-assisted workflow, not as automatic capture.

This is no longer a hack. It's a platform shape.
