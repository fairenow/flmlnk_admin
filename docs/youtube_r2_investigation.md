# YouTube → R2 → Modal Workflow: Current State

This note maps the existing browser-first ingestion stack and highlights gaps relative to the requested YouTube URL → user-uploaded bytes → R2 → Modal flow.

## Backend (Convex)

- **Schema** – `processing_jobs`, `upload_sessions`, and generated clip/timestamp tables already exist for browser-first ingestion. Job statuses are currently stringly typed (`CREATED`, `UPLOADING`, `UPLOADED`, `PROCESSING`, `READY`, `FAILED`) without the META_READY/UPLOAD_READY variants. Source metadata fields (`sourceUrl`, `videoId`, `title`, `r2SourceKey`, etc.) are present.
- **Job lifecycle + uploads** – `convex/processing.ts` owns job creation, upload session persistence, part reporting, and completion. The documented flow is `createJob` → `r2CreateMultipart` → `saveUploadSession` → `reportUploadedPart` → `markUploadComplete`, which moves jobs to `UPLOADED` and schedules Modal.
- **R2 actions & signing** – `convex/r2.ts` provides multipart primitives: R2 client helpers, `r2CreateMultipart` (creates uploadId and initial part URLs), `r2GetUploadPartUrl`, `r2AbortMultipart`, `r2CompleteMultipart`, and `r2GetSignedUrl` for downloads. Actions rely on Cloudflare R2 credentials and bucket env vars.

## Frontend (Next.js)

- **Upload orchestration hook** – `src/hooks/useResumableUpload.ts` implements resumable multipart uploads with concurrency, retries, pause/resume, and Convex calls for session creation, part reporting, and completion. The hook tracks processing state after upload but does not enforce any rights/ownership confirmation.
- **UI components** – `src/components/upload/VideoUploader.tsx` and `src/components/upload/JobStatus.tsx` wrap the hook for creating jobs, streaming upload progress, and showing processing status. The clip generator modal (`src/components/actor/ClipGeneratorModal.tsx`) integrates the same flow for actor pages.

## Modal workers

- **Processing entrypoint** – `modal/app.py` exposes `process_video_r2` and `process_video_r2_endpoint`, which claim Convex jobs, download the source from R2, process clips via `R2VideoProcessor`, upload artifacts back to R2, and update Convex.
- **Processor implementation** – `modal/services/r2_video_processor.py` contains the worker logic (download from R2, FFmpeg/captioning, clip uploads, webhook updates).

## What’s missing for the requested workflow

- No `createJobFromYouTubeUrl` mutation to parse YouTube URLs, fetch safe metadata, or persist a `sourceMeta` block.
- Status machine lacks META_READY, UPLOAD_READY, and explicit UPLOADING→UPLOADED transitions for a browser-mediated YouTube flow; no job/clip artifacts table mirroring `video_artifacts` is present.
- Browser upload UI does not include a rights/ownership confirmation prior to uploading.
- Multipart helpers cover creation, part signing, and completion, but there is no dedicated resumable flow specialized for a YouTube-sourced job (e.g., ensuring metadata is saved before upload prompts).
- Modal workers poll Convex via webhooks and direct triggers but do not include a queue/poller dedicated to the new UPLOADED→PROCESSING claim semantics described in the prompt.

## Implementation plan (YouTube URL → browser upload → R2 → Modal)

### Data model and status machine

- **Add tables** – Extend Convex schema with `video_jobs` and `video_artifacts` collections that mirror the existing `processing_jobs`/clip artifacts shape. Jobs hold `sourceMeta`, `r2SourceKey`, and a status enum: `CREATED → META_READY → UPLOAD_READY → UPLOADING → UPLOADED → PROCESSING → READY/FAILED`.
- **Migrations** – Add schema definitions and regenerate Convex types. Ensure Modal/webhook callers use the new collection names.
- **Status helpers** – Centralize status transitions (e.g., `assertJobStatus(jobId, allowed)`) reused by mutations/actions and Modal workers to avoid string drift.

### Convex backend

- **Metadata mutation** – Add `createJobFromYouTubeUrl(url, userId)` mutation that parses `videoId`, fetches YouTube oEmbed (title/thumbnail/duration if available), and stores `sourceMeta` plus `status: "META_READY"`. Reject non-YouTube URLs and sanitize stored fields.
- **Upload prep** – Add `prepareUpload(jobId, fileMeta)` mutation/action to verify `status === META_READY`, set `UPLOAD_READY`, initialize an upload session, and return upload session ids + first part URLs via existing `r2CreateMultipart` helper.
- **Multipart signing** – Expose `getUploadPartUrl(jobId, partNumber)` to fetch signed URLs and mark status `UPLOADING` on first part request. Keep `reportUploadedPart` and `completeUpload` (or equivalents) to record ETags and move the job to `UPLOADED` while persisting `r2SourceKey`.
- **Completion webhook** – Confirm `markUploadComplete` moves jobs to `UPLOADED` and enqueues processing via existing Modal trigger call. Emit job audit logs for observability.
- **Error handling** – Add `abortUpload(jobId)` to cancel multipart sessions (uses `r2AbortMultipart`) and set status `FAILED` with reason.

### Frontend (Next.js)

- **URL capture screen** – New page/stepper that accepts a YouTube URL, calls `createJobFromYouTubeUrl`, and shows fetched metadata (title, thumbnail, duration) before allowing upload.
- **Rights gate** – Add a required checkbox “I have rights to upload/process this video” before enabling file selection/upload. Persist acknowledgement on the job (e.g., `rightsConfirmedAt`).
- **Upload component reuse** – Reuse `useResumableUpload` but adapt it to (a) call `prepareUpload`, (b) request part URLs via the new `getUploadPartUrl`, and (c) report completion with `completeUpload(jobId, partsETags)`. Surface pause/resume and retry UX already in the hook.
- **Job detail view** – Stepper displaying `META_READY → UPLOAD_READY → UPLOADING → PROCESSING → READY`. Show progress for multipart upload and a processing spinner once Modal has claimed the job. When READY, render artifacts from `video_artifacts` with download links via `r2GetSignedUrl`.
- **Error/resume** – On reload, fetch job status; if `UPLOAD_READY/UPLOADING`, rehydrate the upload session from Convex and continue.

### Modal worker

- **Polling/claim** – Add a lightweight poller or queue listener for `video_jobs` where `status === "UPLOADED"` and not claimed. Use an atomic mutation to mark status `PROCESSING` with `claimedBy` before work starts.
- **Processing** – Reuse `R2VideoProcessor` to download the source via `r2SourceKey`, generate clips/gifs, upload artifacts to R2, and call Convex to insert `video_artifacts` entries (type, duration, dimensions, signed URL path) then set job `READY`.
- **Failure paths** – On processing errors, set job `FAILED` with message; leave source in R2 for debugging. Consider retry/backoff toggle.

### Observability and safeguards

- **Validation** – Enforce YouTube host allowlist and maximum duration before allowing upload prep. Block non-YouTube domains.
- **Audit/logs** – Add job timeline entries (status changes, upload parts completed, Modal start/finish) for supportability.
- **Metrics** – Emit counters for job creations, upload failures, processing failures to existing logging hooks if available.

### Deliverable slices (PR-ready)

1) **Schema + status machine + metadata mutation** – Add `video_jobs/video_artifacts`, status constants, and `createJobFromYouTubeUrl`.
2) **Upload APIs + frontend rights gate** – `prepareUpload`, part signing, completion, and updated upload UI/stepper with rights checkbox.
3) **Modal poller + artifact writes** – Worker claim loop for UPLOADED jobs, processing via `R2VideoProcessor`, artifact persistence, READY/FAILED transitions.
