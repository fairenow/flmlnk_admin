/**
 * Processing Jobs - State Mutations
 *
 * Handles state management for browser-first video processing jobs.
 * Works in conjunction with r2.ts actions for R2 operations.
 *
 * Flow:
 * 1. UI calls createJob → job in CREATED state
 * 2. UI calls r2CreateMultipart action → gets uploadId + partUrls
 * 3. UI calls saveUploadSession → persists session, job → UPLOADING
 * 4. For each part: UI uploads to R2, then calls reportUploadedPart
 * 5. UI calls r2CompleteMultipart action → R2 assembles file
 * 6. UI calls markUploadComplete → job → UPLOADED, triggers Modal
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  action,
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";

// =============================================================================
// YOUTUBE METADATA HELPERS
// =============================================================================

/**
 * Fetch YouTube video metadata using the oEmbed API (no API key required).
 * Returns the video title and thumbnail URL.
 */
async function fetchYouTubeMetadata(videoUrl: string): Promise<{
  title?: string;
  thumbnailUrl?: string;
  authorName?: string;
}> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    const response = await fetch(oembedUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      console.warn(`[YouTube oEmbed] Failed to fetch metadata: ${response.status}`);
      return {};
    }

    const data = await response.json();
    return {
      title: data.title || undefined,
      thumbnailUrl: data.thumbnail_url || undefined,
      authorName: data.author_name || undefined,
    };
  } catch (error) {
    console.warn(`[YouTube oEmbed] Error fetching metadata:`, error);
    return {};
  }
}

// =============================================================================
// JOB MUTATIONS
// =============================================================================

/**
 * Create a new processing job.
 * Called when user initiates video upload.
 */
export const createJob = mutation({
  args: {
    inputType: v.union(v.literal("youtube"), v.literal("local")),
    sourceUrl: v.optional(v.string()), // YouTube URL reference
    title: v.optional(v.string()),
    actorProfileId: v.optional(v.id("actor_profiles")),
    // Processing configuration
    clipCount: v.optional(v.number()),
    layout: v.optional(v.string()),
    // Clip duration controls
    minClipDuration: v.optional(v.number()), // Min clip length in seconds
    maxClipDuration: v.optional(v.number()), // Max clip length in seconds
    // Output format
    aspectRatio: v.optional(v.string()), // "9:16", "16:9", "1:1"
    // Clip tone/style
    clipTone: v.optional(v.string()), // "viral", "educational", "funny", etc.
    // Full video mode - process full video without clipping
    fullVideoMode: v.optional(v.boolean()),
    // Enhanced caption styling
    captionStyle: v.optional(
      v.object({
        highlightColor: v.optional(v.string()),
        fontFamily: v.optional(v.string()),
        fontSize: v.optional(v.string()),
        fontScale: v.optional(v.number()),
        position: v.optional(v.string()),
        style: v.optional(v.string()),
        outline: v.optional(v.boolean()),
        shadow: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Look up user by auth ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // If actorProfileId provided, verify ownership
    if (args.actorProfileId) {
      const profile = await ctx.db.get(args.actorProfileId);
      if (!profile || profile.userId !== user._id) {
        throw new Error("Actor profile not found or not owned by user");
      }
    }

    const now = Date.now();

    const jobId = await ctx.db.insert("processing_jobs", {
      userId: user._id,
      actorProfileId: args.actorProfileId,
      status: "CREATED",
      inputType: args.inputType,
      sourceUrl: args.sourceUrl,
      title: args.title,
      attemptCount: 0,
      clipCount: args.clipCount,
      layout: args.layout,
      // New clip generation controls
      minClipDuration: args.minClipDuration,
      maxClipDuration: args.maxClipDuration,
      aspectRatio: args.aspectRatio,
      clipTone: args.clipTone,
      fullVideoMode: args.fullVideoMode,
      captionStyle: args.captionStyle,
      createdAt: now,
      updatedAt: now,
    });

    return jobId;
  },
});

/**
 * Get a job by ID (with ownership verification).
 */
export const getJob = query({
  args: { jobId: v.id("processing_jobs") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return null;
    }

    const job = await ctx.db.get(args.jobId);
    if (!job || job.userId !== user._id) {
      return null;
    }

    return job;
  },
});

/**
 * Get all jobs for current user.
 */
export const getMyJobs = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return [];
    }

    let jobsQuery = ctx.db
      .query("processing_jobs")
      .withIndex("by_userId", (q) => q.eq("userId", user._id));

    const jobs = await jobsQuery.collect();

    // Filter by status if provided
    let filtered = jobs;
    if (args.status) {
      filtered = jobs.filter((j) => j.status === args.status);
    }

    // Sort by createdAt descending
    filtered.sort((a, b) => b.createdAt - a.createdAt);

    // Apply limit
    if (args.limit) {
      filtered = filtered.slice(0, args.limit);
    }

    return filtered;
  },
});

// =============================================================================
// UPLOAD SESSION MUTATIONS
// =============================================================================

/**
 * Save upload session after r2CreateMultipart action.
 * Transitions job from CREATED → UPLOADING.
 */
export const saveUploadSession = mutation({
  args: {
    jobId: v.id("processing_jobs"),
    r2Key: v.string(),
    uploadId: v.string(),
    partSize: v.number(),
    totalParts: v.number(),
    totalBytes: v.number(),
  },
  handler: async (ctx, args) => {
    // Verify job exists and user owns it
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const job = await ctx.db.get(args.jobId);
    if (!job || job.userId !== user._id) {
      throw new Error("Job not found or not owned by user");
    }

    if (job.status !== "CREATED") {
      throw new Error(`Cannot start upload: job status is ${job.status}`);
    }

    const now = Date.now();

    // Create upload session
    const sessionId = await ctx.db.insert("upload_sessions", {
      jobId: args.jobId,
      r2Key: args.r2Key,
      uploadId: args.uploadId,
      partSize: args.partSize,
      totalParts: args.totalParts,
      completedParts: [],
      bytesUploaded: 0,
      totalBytes: args.totalBytes,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    // Update job status
    await ctx.db.patch(args.jobId, {
      status: "UPLOADING",
      updatedAt: now,
    });

    return sessionId;
  },
});

/**
 * Report a successfully uploaded part.
 * Called after each part is uploaded to R2.
 * Critical for resume integrity on flaky networks.
 */
export const reportUploadedPart = mutation({
  args: {
    sessionId: v.id("upload_sessions"),
    partNumber: v.number(),
    etag: v.string(), // Store EXACTLY as returned (may include quotes)
    partBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Upload session not found");
    }

    if (session.status !== "ACTIVE") {
      throw new Error(`Cannot report part: session status is ${session.status}`);
    }

    // Check if part already reported (idempotent)
    const existingPart = session.completedParts.find(
      (p) => p.partNumber === args.partNumber
    );
    if (existingPart) {
      // Already reported, return success
      return { alreadyReported: true };
    }

    // Append to completedParts
    const completedParts = [
      ...session.completedParts,
      { partNumber: args.partNumber, etag: args.etag },
    ];

    await ctx.db.patch(args.sessionId, {
      completedParts,
      bytesUploaded: session.bytesUploaded + args.partBytes,
      updatedAt: Date.now(),
    });

    return {
      alreadyReported: false,
      partsCompleted: completedParts.length,
      totalParts: session.totalParts,
    };
  },
});

/**
 * Get active upload session for a job (for resume).
 */
export const getActiveUploadSession = query({
  args: { jobId: v.id("processing_jobs") },
  handler: async (ctx, args) => {
    // Find active session for this job
    const sessions = await ctx.db
      .query("upload_sessions")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();

    // Return the active one (should be at most one)
    return sessions.find((s) => s.status === "ACTIVE") || null;
  },
});

/**
 * Mark upload as complete after r2CompleteMultipart action succeeds.
 * Transitions job from UPLOADING → UPLOADED and triggers Modal.
 */
export const markUploadComplete = mutation({
  args: {
    sessionId: v.id("upload_sessions"),
    r2Key: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Upload session not found");
    }

    if (session.status !== "ACTIVE") {
      throw new Error(`Cannot complete: session status is ${session.status}`);
    }

    // Verify all parts are uploaded
    if (session.completedParts.length !== session.totalParts) {
      throw new Error(
        `Not all parts uploaded: ${session.completedParts.length}/${session.totalParts}`
      );
    }

    const now = Date.now();

    // Update session status
    await ctx.db.patch(args.sessionId, {
      status: "COMPLETED",
      updatedAt: now,
    });

    // Update job status and R2 key
    await ctx.db.patch(session.jobId, {
      status: "UPLOADED",
      r2SourceKey: args.r2Key,
      updatedAt: now,
    });

    // Trigger Modal processing via scheduler
    await ctx.scheduler.runAfter(0, internal.processing.triggerModalProcessing, {
      jobId: session.jobId,
    });

    return { success: true, jobId: session.jobId };
  },
});

/**
 * Abort an upload session (on user cancel or error).
 */
export const abortUploadSession = mutation({
  args: {
    sessionId: v.id("upload_sessions"),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      return { success: false, reason: "Session not found" };
    }

    if (session.status !== "ACTIVE") {
      return { success: false, reason: `Session already ${session.status}` };
    }

    const now = Date.now();

    // Update session status
    await ctx.db.patch(args.sessionId, {
      status: "ABORTED",
      updatedAt: now,
    });

    // Update job status
    await ctx.db.patch(session.jobId, {
      status: "FAILED",
      error: args.error || "Upload aborted",
      errorStage: "upload",
      updatedAt: now,
    });

    return { success: true };
  },
});

// =============================================================================
// INTERNAL MUTATIONS (for Modal callbacks and scheduler)
// =============================================================================

/**
 * Trigger Modal processing for a job.
 * Called via scheduler after upload completes.
 * This is a mutation that schedules the actual HTTP call via action.
 */
export const triggerModalProcessing = internalMutation({
  args: { jobId: v.id("processing_jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      console.error(`Job not found: ${args.jobId}`);
      return;
    }

    if (job.status !== "UPLOADED") {
      console.error(`Job not in UPLOADED state: ${job.status}`);
      return;
    }

    // Schedule the HTTP action to call Modal
    await ctx.scheduler.runAfter(0, internal.processing.callModalEndpoint, {
      jobId: args.jobId,
    });
  },
});

/**
 * Internal action to call Modal HTTP endpoint.
 * Separated from mutation because HTTP calls are not allowed in mutations.
 *
 * UNIFIED ARCHITECTURE:
 * - All jobs (YouTube and local) use R2-based processing
 * - YouTube videos MUST be downloaded via browser-first flow (RapidAPI → Browser → R2)
 * - Server-side yt-dlp is DEPRECATED due to YouTube datacenter IP blocking
 * - Local jobs already have video in R2, process directly
 *
 * IMPORTANT: YouTube jobs without r2SourceKey will fail fast with a deprecation error.
 * All YouTube processing must go through: Client → RapidAPI → Browser download → R2 upload → Modal R2 processing
 */
export const callModalEndpoint = internalAction({
  args: { jobId: v.id("processing_jobs") },
  handler: async (ctx, args) => {
    const modalR2Endpoint = process.env.MODAL_R2_ENDPOINT_URL;
    const webhookSecret = process.env.MODAL_WEBHOOK_SECRET;

    try {
      // Get the job to determine inputType and other details
      const job = await ctx.runQuery(internal.processing.getJobInternal, {
        jobId: args.jobId,
      });

      if (!job) {
        throw new Error(`Job not found: ${args.jobId}`);
      }

      // UNIFIED FLOW: All processing goes through R2
      // YouTube videos MUST be downloaded via browser-first flow (RapidAPI → Browser → R2)
      // Server-side yt-dlp is deprecated due to YouTube datacenter IP blocking
      if (job.inputType === "youtube" && !job.r2SourceKey) {
        // DEPRECATED: YouTube download on Modal is no longer supported
        // All YouTube videos must use the browser-first flow:
        // 1. Client calls getYouTubeDownloadUrl (RapidAPI)
        // 2. Browser downloads video
        // 3. Browser uploads to R2
        // 4. Then this endpoint is called with r2SourceKey set
        console.error(`[DEPRECATED] YouTube job ${args.jobId} has no r2SourceKey - server-side YouTube download is no longer supported`);

        throw new Error(
          "YouTube video download on server is no longer supported. " +
          "Please use the browser-based upload flow which downloads videos via RapidAPI " +
          "and uploads to R2 before processing. This avoids YouTube's datacenter IP blocking."
        );
      } else {
        // Job has r2SourceKey (either local upload or YouTube already downloaded)
        // Use R2 processing endpoint
        if (!modalR2Endpoint) {
          throw new Error("MODAL_R2_ENDPOINT_URL not configured");
        }

        if (!job.r2SourceKey) {
          throw new Error(`Job has no r2SourceKey: ${args.jobId}`);
        }

        console.log(`Calling Modal R2 endpoint for job: ${args.jobId}`);

        const response = await fetch(modalR2Endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            job_id: args.jobId,
            webhook_secret: webhookSecret,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Modal R2 responded with ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log(`Modal R2 response: ${JSON.stringify(result)}`);

        if (result.status === "processing") {
          console.log(`Modal R2 job spawned successfully: ${args.jobId}`);
        } else if (result.status === "error") {
          throw new Error(result.message || "Modal R2 returned error status");
        }
      }
    } catch (error) {
      console.error(`Failed to trigger Modal: ${error}`);
      // Mark job as failed
      await ctx.runMutation(internal.processing.markJobFailed, {
        jobId: args.jobId,
        error: `Failed to trigger processing: ${error}`,
        errorStage: "trigger",
      });
    }
  },
});

/**
 * Legacy Modal endpoint for backwards compatibility.
 * Uses the old YouTube download flow (yt-dlp in Modal with proxy).
 * Will be deprecated once unified R2 flow is stable.
 */
export const callLegacyModalEndpoint = internalAction({
  args: { jobId: v.id("processing_jobs") },
  handler: async (ctx, args) => {
    const modalEndpoint = process.env.MODAL_ENDPOINT_URL;
    const webhookSecret = process.env.MODAL_WEBHOOK_SECRET;

    const job = await ctx.runQuery(internal.processing.getJobInternal, {
      jobId: args.jobId,
    });

    if (!job) {
      throw new Error(`Job not found: ${args.jobId}`);
    }

    if (!modalEndpoint) {
      throw new Error("MODAL_ENDPOINT_URL not configured");
    }

    if (!job.sourceUrl) {
      throw new Error(`Job has no source URL: ${args.jobId}`);
    }

    console.log(`[LEGACY] Calling Modal endpoint for job: ${args.jobId}`);

    const response = await fetch(modalEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        job_id: args.jobId,
        video_url: job.sourceUrl,
        webhook_secret: webhookSecret,
        num_clips: job.clipCount || 5,
        layout: job.layout || "standard",
        caption_style: job.captionStyle || undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Modal responded with ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`[LEGACY] Modal response: ${JSON.stringify(result)}`);
  },
});

/**
 * Update job status (internal mutation).
 * Used by actions that need to update job state.
 */
export const updateJobStatus = internalMutation({
  args: {
    jobId: v.id("processing_jobs"),
    status: v.string(),
    currentStep: v.optional(v.string()),
    progress: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: args.status,
      currentStep: args.currentStep,
      progress: args.progress,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Mark YouTube download as complete.
 * Called by Modal webhook after video is uploaded to R2.
 * Updates job with r2SourceKey and triggers R2 processing.
 */
export const markYouTubeDownloadComplete = internalMutation({
  args: {
    jobId: v.id("processing_jobs"),
    r2SourceKey: v.string(),
    videoTitle: v.optional(v.string()),
    videoDuration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error(`Job not found: ${args.jobId}`);
    }

    if (job.status !== "DOWNLOADING") {
      console.warn(`Job not in DOWNLOADING state: ${job.status}`);
      // Continue anyway - idempotent operation
    }

    const now = Date.now();

    // Update job with R2 source key and mark as UPLOADED
    await ctx.db.patch(args.jobId, {
      status: "UPLOADED",
      r2SourceKey: args.r2SourceKey,
      title: args.videoTitle || job.title,
      videoDuration: args.videoDuration,
      currentStep: "Video ready for processing",
      updatedAt: now,
    });

    // Trigger R2 processing via scheduler
    await ctx.scheduler.runAfter(0, internal.processing.callModalEndpoint, {
      jobId: args.jobId,
    });

    return { success: true };
  },
});

/**
 * Mark YouTube download as failed.
 * Called by Modal webhook if download fails.
 */
export const markYouTubeDownloadFailed = internalMutation({
  args: {
    jobId: v.id("processing_jobs"),
    error: v.string(),
    errorStage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "FAILED",
      error: args.error,
      errorStage: args.errorStage || "download",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Internal query to get a job by ID.
 */
export const getJobInternal = internalQuery({
  args: { jobId: v.id("processing_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

/**
 * Internal action to generate a signed URL for the source video.
 * Used by callModalEndpoint to provide Modal with a download URL.
 */
export const getSignedVideoUrl = internalAction({
  args: {
    r2Key: v.string(),
    expiresIn: v.number(),
  },
  handler: async (_ctx, args) => {
    // Import R2 dependencies
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

    const endpoint = process.env.R2_ENDPOINT_URL;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET_NAME;

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error("R2 credentials not configured");
    }

    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      // Disable automatic checksums for R2 CORS compatibility
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: args.r2Key,
    });

    const url = await getSignedUrl(client, command, {
      expiresIn: args.expiresIn,
    });

    return { url };
  },
});

/**
 * Helper mutation to mark a job as failed.
 * Used when Modal trigger fails.
 */
export const markJobFailed = internalMutation({
  args: {
    jobId: v.id("processing_jobs"),
    error: v.string(),
    errorStage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "FAILED",
      error: args.error,
      errorStage: args.errorStage,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Claim job for processing (called by Modal worker).
 * Implements idempotent locking to prevent duplicate processing.
 */
export const claimJobForProcessing = internalMutation({
  args: {
    jobId: v.id("processing_jobs"),
    lockId: v.string(),
  },
  handler: async (ctx, args): Promise<
    | { claimed: false; reason: string; status?: string }
    | {
        claimed: true;
        r2SourceKey: string | undefined;
        userId: string;
        actorProfileId: string | undefined;
        clipCount: number | undefined;
        layout: string | undefined;
        minClipDuration: number | undefined;
        maxClipDuration: number | undefined;
        aspectRatio: string | undefined;
        clipTone: string | undefined;
        fullVideoMode: boolean | undefined;
        captionStyle: {
          highlightColor?: string;
          fontFamily?: string;
          fontSize?: string;
          fontScale?: number;
          position?: string;
          style?: string;
          outline?: boolean;
          shadow?: boolean;
        } | undefined;
      }
  > => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return { claimed: false as const, reason: "job_not_found" };
    }

    // Only claim if UPLOADED and not already locked
    if (job.status !== "UPLOADED") {
      return { claimed: false as const, reason: "wrong_status", status: job.status };
    }

    if (job.processingLockId) {
      // Check if lock is stale (> 30 minutes)
      const staleThreshold = 30 * 60 * 1000;
      if (
        job.processingStartedAt &&
        Date.now() - job.processingStartedAt < staleThreshold
      ) {
        return { claimed: false as const, reason: "already_locked" };
      }
      // Lock is stale, allow claim
    }

    const now = Date.now();

    // Claim the job
    await ctx.db.patch(args.jobId, {
      status: "PROCESSING",
      processingLockId: args.lockId,
      processingStartedAt: now,
      attemptCount: job.attemptCount + 1,
      updatedAt: now,
    });

    return {
      claimed: true as const,
      r2SourceKey: job.r2SourceKey,
      userId: job.userId,
      actorProfileId: job.actorProfileId,
      clipCount: job.clipCount,
      layout: job.layout,
      // New clip generation controls
      minClipDuration: job.minClipDuration,
      maxClipDuration: job.maxClipDuration,
      aspectRatio: job.aspectRatio,
      clipTone: job.clipTone,
      fullVideoMode: job.fullVideoMode,
      captionStyle: job.captionStyle,
    };
  },
});

/**
 * Complete processing (called by Modal worker on success).
 */
export const completeProcessing = internalMutation({
  args: {
    jobId: v.id("processing_jobs"),
    lockId: v.string(),
    clips: v.array(
      v.object({
        clipIndex: v.number(),
        title: v.optional(v.string()),
        description: v.optional(v.string()),
        transcript: v.optional(v.string()),
        startTime: v.number(),
        endTime: v.number(),
        duration: v.number(),
        r2ClipKey: v.string(),
        r2ThumbKey: v.optional(v.string()),
        score: v.optional(v.number()),
        hasFaces: v.optional(v.boolean()),
        layout: v.optional(v.string()),
        captionStyle: v.optional(v.string()),
        viralAnalysis: v.optional(
          v.object({
            hookStrength: v.optional(v.number()),
            retentionScore: v.optional(v.number()),
            shareabilityScore: v.optional(v.number()),
            suggestedHashtags: v.optional(v.array(v.string())),
            summary: v.optional(v.string()),
          })
        ),
      })
    ),
    videoDuration: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<
    | { success: false; reason: string }
    | { success: true; clipCount: number }
  > => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return { success: false as const, reason: "job_not_found" };
    }

    // Verify lock ownership
    if (job.processingLockId !== args.lockId) {
      return { success: false as const, reason: "lock_mismatch" };
    }

    const now = Date.now();

    // Insert clips
    for (const clip of args.clips) {
      await ctx.db.insert("processing_clips", {
        jobId: args.jobId,
        userId: job.userId,
        actorProfileId: job.actorProfileId,
        clipIndex: clip.clipIndex,
        title: clip.title,
        description: clip.description,
        transcript: clip.transcript,
        startTime: clip.startTime,
        endTime: clip.endTime,
        duration: clip.duration,
        r2ClipKey: clip.r2ClipKey,
        r2ThumbKey: clip.r2ThumbKey,
        score: clip.score,
        hasFaces: clip.hasFaces,
        layout: clip.layout,
        viralAnalysis: clip.viralAnalysis,
        createdAt: now,
      });
    }

    // Update job status
    await ctx.db.patch(args.jobId, {
      status: "READY",
      progress: 100,
      currentStep: "Complete",
      videoDuration: args.videoDuration,
      completedAt: now,
      updatedAt: now,
      // Clear lock
      processingLockId: undefined,
      processingStartedAt: undefined,
    });

    return { success: true as const, clipCount: args.clips.length };
  },
});

/**
 * Fail processing (called by Modal worker on error).
 */
export const failProcessing = internalMutation({
  args: {
    jobId: v.id("processing_jobs"),
    lockId: v.string(),
    error: v.string(),
    errorStage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return { success: false, reason: "job_not_found" };
    }

    // Verify lock ownership
    if (job.processingLockId !== args.lockId) {
      return { success: false, reason: "lock_mismatch" };
    }

    const now = Date.now();

    // Update job status
    await ctx.db.patch(args.jobId, {
      status: "FAILED",
      error: args.error,
      errorStage: args.errorStage || "processing",
      updatedAt: now,
      // Clear lock
      processingLockId: undefined,
      processingStartedAt: undefined,
    });

    return { success: true };
  },
});

// =============================================================================
// HTTP ACTIONS (for Modal worker callbacks)
// =============================================================================

/**
 * HTTP action for Modal to claim a job.
 * Verifies webhook secret and delegates to internal mutation.
 */
export const httpClaimJob = action({
  args: {
    jobId: v.string(), // Convex ID as string
    lockId: v.string(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<
    | { claimed: false; reason: string; status?: string }
    | { claimed: true; r2SourceKey: string | undefined; userId: string; actorProfileId: string | undefined; clipCount: number | undefined; layout: string | undefined; captionStyle: { highlightColor?: string; fontScale?: number; position?: string } | undefined }
  > => {
    // Verify webhook secret
    const expectedSecret = process.env.MODAL_WEBHOOK_SECRET;
    if (expectedSecret && args.webhookSecret !== expectedSecret) {
      return { claimed: false, reason: "invalid_secret" };
    }

    // Call internal mutation
    const result = await ctx.runMutation(internal.processing.claimJobForProcessing, {
      jobId: args.jobId as Id<"processing_jobs">,
      lockId: args.lockId,
    });

    return result;
  },
});

/**
 * HTTP action for Modal to complete processing.
 */
export const httpCompleteProcessing = action({
  args: {
    jobId: v.string(),
    lockId: v.string(),
    clips: v.array(
      v.object({
        index: v.number(),
        r2Key: v.string(),
        thumbnailR2Key: v.optional(v.string()),
        title: v.optional(v.string()),
        description: v.optional(v.string()),
        transcript: v.optional(v.string()),
        startTime: v.number(),
        endTime: v.number(),
        duration: v.number(),
        score: v.optional(v.number()),
        hasFaces: v.optional(v.boolean()),
        layout: v.optional(v.string()),
        captionStyle: v.optional(v.string()),
        viralAnalysis: v.optional(v.any()),
        smartThumbnail: v.optional(v.boolean()),
      })
    ),
    videoDuration: v.optional(v.number()),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<
    | { success: false; reason: string }
    | { success: true; clipCount: number }
  > => {
    // Verify webhook secret
    const expectedSecret = process.env.MODAL_WEBHOOK_SECRET;
    if (expectedSecret && args.webhookSecret !== expectedSecret) {
      return { success: false, reason: "invalid_secret" };
    }

    // Transform clips to internal format
    const clips = args.clips.map((clip) => ({
      clipIndex: clip.index,
      title: clip.title,
      description: clip.description,
      transcript: clip.transcript,
      startTime: clip.startTime,
      endTime: clip.endTime,
      duration: clip.duration,
      r2ClipKey: clip.r2Key,
      r2ThumbKey: clip.thumbnailR2Key,
      score: clip.score,
      hasFaces: clip.hasFaces,
      layout: clip.layout,
      viralAnalysis: clip.viralAnalysis,
    }));

    // Call internal mutation
    const result = await ctx.runMutation(internal.processing.completeProcessing, {
      jobId: args.jobId as Id<"processing_jobs">,
      lockId: args.lockId,
      clips,
      videoDuration: args.videoDuration,
    });

    return result;
  },
});

/**
 * HTTP action for Modal to fail processing.
 */
export const httpFailProcessing = action({
  args: {
    jobId: v.string(),
    lockId: v.string(),
    error: v.string(),
    errorStage: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; reason?: string }> => {
    // Verify webhook secret
    const expectedSecret = process.env.MODAL_WEBHOOK_SECRET;
    if (expectedSecret && args.webhookSecret !== expectedSecret) {
      return { success: false, reason: "invalid_secret" };
    }

    // Call internal mutation
    const result = await ctx.runMutation(internal.processing.failProcessing, {
      jobId: args.jobId as Id<"processing_jobs">,
      lockId: args.lockId,
      error: args.error,
      errorStage: args.errorStage,
    });

    return result;
  },
});

/**
 * HTTP action for Modal to save clip timestamps.
 */
export const httpSaveClipTimestamps = action({
  args: {
    jobId: v.string(),
    timestamps: v.array(
      v.object({
        start: v.number(),
        end: v.number(),
        reason: v.optional(v.string()),
        title: v.optional(v.string()),
        score: v.optional(v.number()),
      })
    ),
    source: v.string(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify webhook secret
    const expectedSecret = process.env.MODAL_WEBHOOK_SECRET;
    if (expectedSecret && args.webhookSecret !== expectedSecret) {
      return { success: false, reason: "invalid_secret" };
    }

    // Call internal mutation
    await ctx.runMutation(internal.processing.saveClipTimestamps, {
      jobId: args.jobId as Id<"processing_jobs">,
      timestamps: args.timestamps,
      source: args.source,
    });

    return { success: true };
  },
});

/**
 * HTTP action for Modal to update progress.
 */
export const httpUpdateProgress = action({
  args: {
    jobId: v.string(),
    lockId: v.string(),
    progress: v.number(), // 0-100
    currentStep: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify webhook secret
    const expectedSecret = process.env.MODAL_WEBHOOK_SECRET;
    if (expectedSecret && args.webhookSecret !== expectedSecret) {
      return { success: false, reason: "invalid_secret" };
    }

    // Call internal mutation
    await ctx.runMutation(internal.processing.updateProgress, {
      jobId: args.jobId as Id<"processing_jobs">,
      lockId: args.lockId,
      progress: args.progress,
      currentStep: args.currentStep,
    });

    return { success: true };
  },
});

/**
 * Internal mutation to update job progress.
 */
export const updateProgress = internalMutation({
  args: {
    jobId: v.id("processing_jobs"),
    lockId: v.string(),
    progress: v.number(),
    currentStep: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return;
    }

    // Verify lock ownership
    if (job.processingLockId !== args.lockId) {
      return;
    }

    await ctx.db.patch(args.jobId, {
      progress: args.progress,
      currentStep: args.currentStep,
      updatedAt: Date.now(),
    });
  },
});

// =============================================================================
// CLIP QUERIES
// =============================================================================

/**
 * Get clips for a job.
 */
export const getJobClips = query({
  args: { jobId: v.id("processing_jobs") },
  handler: async (ctx, args) => {
    // Verify user owns the job
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return [];
    }

    const job = await ctx.db.get(args.jobId);
    if (!job || job.userId !== user._id) {
      return [];
    }

    const clips = await ctx.db
      .query("processing_clips")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();

    // Sort by clipIndex
    clips.sort((a, b) => a.clipIndex - b.clipIndex);

    return clips;
  },
});

/**
 * Internal query to get clips without auth (for use by actions that verify auth themselves).
 */
export const getJobClipsInternal = internalQuery({
  args: { jobId: v.id("processing_jobs") },
  handler: async (ctx, args) => {
    const clips = await ctx.db
      .query("processing_clips")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();

    // Sort by clipIndex
    clips.sort((a, b) => a.clipIndex - b.clipIndex);

    return clips;
  },
});

// Type for clip with signed URL
type ClipWithUrl = {
  _id: Id<"processing_clips">;
  _creationTime: number;
  jobId: Id<"processing_jobs">;
  clipIndex: number;
  title?: string;
  description?: string;
  duration: number;
  startTime: number;
  endTime: number;
  score?: number;
  r2ClipKey?: string;
  r2ThumbKey?: string;
  clipUrl: string | null;
  thumbUrl: string | null;
};

// Return type for getJobClipsWithUrls
type GetJobClipsWithUrlsResult = {
  clips: ClipWithUrl[];
  error: string | null;
};

/**
 * Get clips for a job with signed URLs for playback.
 * This action fetches clips and generates presigned R2 URLs.
 */
export const getJobClipsWithUrls = action({
  args: {
    jobId: v.id("processing_jobs"),
    expiresIn: v.optional(v.number()), // Seconds, default 1 hour
  },
  handler: async (ctx, args): Promise<GetJobClipsWithUrlsResult> => {
    // Verify user owns the job
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { clips: [], error: "Not authenticated" };
    }

    // Get job to verify ownership
    const job = await ctx.runQuery(internal.processing.getJobInternal, {
      jobId: args.jobId,
    });

    if (!job) {
      return { clips: [], error: "Job not found" };
    }

    // Get user to verify ownership
    const user = await ctx.runQuery(internal.processing.getUserByAuthId, {
      authId: identity.tokenIdentifier,
    });

    if (!user || job.userId !== user._id) {
      return { clips: [], error: "Not authorized" };
    }

    // Get clips
    const clips = await ctx.runQuery(internal.processing.getJobClipsInternal, {
      jobId: args.jobId,
    });

    if (clips.length === 0) {
      return { clips: [], error: null };
    }

    // Separate clips into external (Klap) and R2 clips
    const r2Keys: Array<{ id: string; clipKey: string; thumbKey?: string }> = [];
    const externalClipUrls = new Map<string, string>();

    for (const clip of clips) {
      // Check for external URL (Klap clips)
      if (clip.externalUrl) {
        externalClipUrls.set(clip._id, clip.externalUrl);
      } else if (clip.r2ClipKey && !clip.r2ClipKey.startsWith("klap-external-")) {
        // Regular R2 clip
        r2Keys.push({
          id: clip._id,
          clipKey: clip.r2ClipKey,
          thumbKey: clip.r2ThumbKey,
        });
      }
    }

    // Create URL map for R2 clips
    const urlMap = new Map<string, { clipUrl: string; thumbUrl: string | null }>();

    // Get signed URLs for R2 clips if any
    if (r2Keys.length > 0) {
      const signedUrls = await ctx.runAction(internal.r2.r2GetSignedUrlsInternal, {
        r2Keys,
        expiresIn: args.expiresIn || 3600,
      });

      for (const item of signedUrls) {
        urlMap.set(item.id, { clipUrl: item.clipUrl, thumbUrl: item.thumbUrl });
      }
    }

    // Merge clips with URLs (external or R2)
    const clipsWithUrls: ClipWithUrl[] = clips.map((clip: Doc<"processing_clips">) => {
      // Check for external URL first (Klap clips)
      const externalUrl = externalClipUrls.get(clip._id);
      if (externalUrl) {
        return {
          ...clip,
          clipUrl: externalUrl,
          thumbUrl: null, // Klap doesn't provide thumbnails
        };
      }

      // Otherwise use R2 signed URL
      const urls = urlMap.get(clip._id);
      return {
        ...clip,
        clipUrl: urls?.clipUrl || null,
        thumbUrl: urls?.thumbUrl || null,
      };
    });

    return { clips: clipsWithUrls, error: null };
  },
});

/**
 * Internal query to get user by auth ID.
 */
export const getUserByAuthId = internalQuery({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", args.authId))
      .unique();
  },
});

/**
 * Save clip timestamps (AI-generated or system-generated).
 */
export const saveClipTimestamps = internalMutation({
  args: {
    jobId: v.id("processing_jobs"),
    timestamps: v.array(
      v.object({
        start: v.number(),
        end: v.number(),
        reason: v.optional(v.string()),
        title: v.optional(v.string()),
        score: v.optional(v.number()),
      })
    ),
    source: v.string(), // "equal_segments", "scene_detection", "ai_analysis"
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("clip_timestamps", {
      jobId: args.jobId,
      timestamps: args.timestamps,
      source: args.source,
      createdAt: Date.now(),
    });
  },
});

/**
 * Get clip timestamps for a job.
 */
export const getClipTimestamps = internalQuery({
  args: { jobId: v.id("processing_jobs") },
  handler: async (ctx, args) => {
    const timestamps = await ctx.db
      .query("clip_timestamps")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    return timestamps;
  },
});

// =============================================================================
// PROFILE-BASED CLIP QUERIES
// =============================================================================

/**
 * Get all processing clips for an actor profile (editor view - requires auth).
 * Returns clips from the processing_clips table for display in the clips manager.
 */
export const getProcessingClipsByProfile = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    // Verify user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();
    if (!user) {
      return [];
    }

    // Get profile by slug
    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!profile || profile.userId !== user._id) {
      return [];
    }

    // Get clips for this profile
    const clips = await ctx.db
      .query("processing_clips")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
      .order("desc")
      .collect();

    return clips;
  },
});

/**
 * Internal query to get processing clips by profile (for use by actions).
 */
export const getProcessingClipsByProfileInternal = internalQuery({
  args: { profileId: v.id("actor_profiles") },
  handler: async (ctx, args) => {
    const clips = await ctx.db
      .query("processing_clips")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.profileId))
      .order("desc")
      .collect();

    return clips;
  },
});

/**
 * Get processing clips with signed URLs for an actor profile.
 * This action fetches clips and generates presigned R2 URLs for playback/download.
 */
export const getProcessingClipsWithUrlsByProfile = action({
  args: {
    slug: v.string(),
    expiresIn: v.optional(v.number()), // Seconds, default 1 hour
  },
  handler: async (ctx, args): Promise<GetJobClipsWithUrlsResult> => {
    // Verify user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { clips: [], error: "Not authenticated" };
    }

    // Get user
    const user = await ctx.runQuery(internal.processing.getUserByAuthId, {
      authId: identity.tokenIdentifier,
    });
    if (!user) {
      return { clips: [], error: "User not found" };
    }

    // Get profile by slug
    const profile = await ctx.runQuery(internal.processing.getProfileBySlug, {
      slug: args.slug,
    });
    if (!profile || profile.userId !== user._id) {
      return { clips: [], error: "Profile not found or not authorized" };
    }

    // Get clips for this profile
    const clips = await ctx.runQuery(internal.processing.getProcessingClipsByProfileInternal, {
      profileId: profile._id,
    });

    if (clips.length === 0) {
      return { clips: [], error: null };
    }

    // Generate signed URLs for each clip
    const r2Keys: Array<{ id: string; clipKey: string; thumbKey?: string }> = [];
    for (const clip of clips) {
      if (clip.r2ClipKey) {
        r2Keys.push({
          id: clip._id,
          clipKey: clip.r2ClipKey,
          thumbKey: clip.r2ThumbKey,
        });
      }
    }

    if (r2Keys.length === 0) {
      // No R2 clips, return as-is
      return {
        clips: clips.map((clip: Doc<"processing_clips">) => ({
          ...clip,
          clipUrl: null,
          thumbUrl: null,
        })),
        error: null,
      };
    }

    // Call R2 action to get signed URLs
    const signedUrls = await ctx.runAction(internal.r2.r2GetSignedUrlsInternal, {
      r2Keys,
      expiresIn: args.expiresIn || 3600,
    });

    // Create a map for quick lookup
    const urlMap = new Map<string, { clipUrl: string; thumbUrl: string | null }>();
    for (const item of signedUrls) {
      urlMap.set(item.id, { clipUrl: item.clipUrl, thumbUrl: item.thumbUrl });
    }

    // Merge clips with URLs
    const clipsWithUrls: ClipWithUrl[] = clips.map((clip: Doc<"processing_clips">) => {
      const urls = urlMap.get(clip._id);
      return {
        ...clip,
        clipUrl: urls?.clipUrl || null,
        thumbUrl: urls?.thumbUrl || null,
      };
    });

    return { clips: clipsWithUrls, error: null };
  },
});

/**
 * Internal query to get a profile by slug.
 */
export const getProfileBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

/**
 * Get public processing clips for an actor profile (public view - no auth required).
 * Returns clips from the processing_clips table where isPublic is true.
 */
export const getPublicProcessingClips = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    // Get profile by slug (no auth required for public view)
    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!profile) {
      return [];
    }

    // Get clips for this profile
    const clips = await ctx.db
      .query("processing_clips")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
      .order("desc")
      .collect();

    // Filter to only public clips
    return clips.filter((c) => c.isPublic === true);
  },
});

/**
 * Internal query to get public processing clips by profile ID.
 */
export const getPublicProcessingClipsByProfileInternal = internalQuery({
  args: { profileId: v.id("actor_profiles") },
  handler: async (ctx, args) => {
    const clips = await ctx.db
      .query("processing_clips")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.profileId))
      .order("desc")
      .collect();

    // Filter to only public clips
    return clips.filter((c) => c.isPublic === true);
  },
});

/**
 * Get public processing clips with signed URLs for public page display.
 * This action fetches public clips and generates presigned R2 URLs for playback.
 */
export const getPublicProcessingClipsWithUrls = action({
  args: {
    slug: v.string(),
    expiresIn: v.optional(v.number()), // Seconds, default 1 hour
  },
  handler: async (ctx, args): Promise<{
    clips: Array<{
      _id: string;
      _creationTime: number;
      jobId: string;
      clipIndex: number;
      title?: string;
      description?: string;
      transcript?: string;
      duration: number;
      startTime: number;
      endTime: number;
      score?: number;
      clipUrl: string | null;
      thumbUrl: string | null;
      isPublic?: boolean;
      createdAt: number;
      customThumbnailUrl?: string;
    }>;
    error: string | null;
  }> => {
    // Get profile by slug (public - no auth required)
    const profile = await ctx.runQuery(internal.processing.getProfileBySlug, {
      slug: args.slug,
    });

    if (!profile) {
      return { clips: [], error: "Profile not found" };
    }

    // Get public clips for this profile
    const clips = await ctx.runQuery(internal.processing.getPublicProcessingClipsByProfileInternal, {
      profileId: profile._id,
    });

    if (clips.length === 0) {
      return { clips: [], error: null };
    }

    // Generate signed URLs for each clip
    const r2Keys: Array<{ id: string; clipKey: string; thumbKey?: string }> = [];
    for (const clip of clips) {
      if (clip.r2ClipKey) {
        r2Keys.push({
          id: clip._id,
          clipKey: clip.r2ClipKey,
          thumbKey: clip.r2ThumbKey,
        });
      }
    }

    if (r2Keys.length === 0) {
      // No R2 clips, return as-is
      return {
        clips: clips.map((clip: Doc<"processing_clips">) => ({
          _id: clip._id,
          _creationTime: clip._creationTime,
          jobId: clip.jobId,
          clipIndex: clip.clipIndex,
          title: clip.title,
          description: clip.description,
          transcript: clip.transcript,
          duration: clip.duration,
          startTime: clip.startTime,
          endTime: clip.endTime,
          score: clip.score,
          clipUrl: null,
          thumbUrl: null,
          isPublic: clip.isPublic,
          createdAt: clip.createdAt,
          customThumbnailUrl: clip.customThumbnailUrl,
        })),
        error: null,
      };
    }

    // Call R2 action to get signed URLs
    const signedUrls = await ctx.runAction(internal.r2.r2GetSignedUrlsInternal, {
      r2Keys,
      expiresIn: args.expiresIn || 3600,
    });

    // Create a map for quick lookup
    const urlMap = new Map<string, { clipUrl: string; thumbUrl: string | null }>();
    for (const item of signedUrls) {
      urlMap.set(item.id, { clipUrl: item.clipUrl, thumbUrl: item.thumbUrl });
    }

    // Merge clips with URLs
    const clipsWithUrls = clips.map((clip: Doc<"processing_clips">) => {
      const urls = urlMap.get(clip._id);
      return {
        _id: clip._id,
        _creationTime: clip._creationTime,
        jobId: clip.jobId,
        clipIndex: clip.clipIndex,
        title: clip.title,
        description: clip.description,
        transcript: clip.transcript,
        duration: clip.duration,
        startTime: clip.startTime,
        endTime: clip.endTime,
        score: clip.score,
        clipUrl: urls?.clipUrl || null,
        thumbUrl: urls?.thumbUrl || null,
        isPublic: clip.isPublic,
        createdAt: clip.createdAt,
        customThumbnailUrl: clip.customThumbnailUrl,
      };
    });

    return { clips: clipsWithUrls, error: null };
  },
});

/**
 * Get in-progress processing jobs for an actor profile.
 * Returns jobs that are currently being processed (not yet READY or FAILED).
 * Used for real-time progress tracking in the UI.
 *
 * Filters out stale jobs that have been processing for too long (> 30 minutes)
 * to avoid cluttering the UI with abandoned/stuck jobs.
 */
export const getInProgressJobs = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    // Verify user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();
    if (!user) {
      return [];
    }

    // Get profile by slug
    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!profile || profile.userId !== user._id) {
      return [];
    }

    // Get all processing jobs for this profile
    const jobs = await ctx.db
      .query("processing_jobs")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", profile._id)
      )
      .order("desc")
      .collect();

    // Filter to only in-progress jobs (not READY and not FAILED)
    const inProgressStatuses = ["CREATED", "UPLOADING", "UPLOADED", "DOWNLOADING", "PROCESSING"];

    // Stale job threshold: 30 minutes
    // Jobs older than this are likely stuck and should not clutter the UI
    const STALE_JOB_THRESHOLD_MS = 30 * 60 * 1000;
    const now = Date.now();

    const inProgressJobs = jobs.filter((job) => {
      // Must be in an in-progress status
      if (!inProgressStatuses.includes(job.status)) {
        return false;
      }

      // Filter out stale jobs (older than 30 minutes with no recent updates)
      const lastUpdate = job.updatedAt || job.createdAt;
      const isStale = now - lastUpdate > STALE_JOB_THRESHOLD_MS;
      if (isStale) {
        return false;
      }

      return true;
    });

    return inProgressJobs.map((job) => ({
      _id: job._id,
      title: job.title || "Processing Video",
      sourceUrl: job.sourceUrl,
      status: job.status,
      progress: job.progress ?? 0,
      currentStep: job.currentStep || "Initializing...",
      inputType: job.inputType,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }));
  },
});

/**
 * Get processing clips grouped by their source job.
 * Returns jobs with their associated clips for display in the editor view.
 */
export const getProcessingClipsGroupedByJob = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    // Verify user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();
    if (!user) {
      return [];
    }

    // Get profile by slug
    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!profile || profile.userId !== user._id) {
      return [];
    }

    // Get all processing jobs for this profile, ordered by creation date descending
    const jobs = await ctx.db
      .query("processing_jobs")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", profile._id)
      )
      .order("desc")
      .collect();

    // Get clips for each job
    const jobsWithClips = await Promise.all(
      jobs.map(async (job) => {
        const clips = await ctx.db
          .query("processing_clips")
          .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
          .order("desc")
          .collect();

        return {
          job: {
            _id: job._id,
            title: job.title || "Untitled Video",
            sourceUrl: job.sourceUrl,
            status: job.status,
            clipCount: job.clipCount,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
          },
          clips,
          clipCount: clips.length,
        };
      })
    );

    // Filter to only jobs that have clips
    return jobsWithClips.filter((j) => j.clipCount > 0);
  },
});

/**
 * Internal query to get processing jobs for a profile.
 */
export const getProcessingJobsByProfileInternal = internalQuery({
  args: { profileId: v.id("actor_profiles") },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("processing_jobs")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", args.profileId)
      )
      .order("desc")
      .collect();

    return jobs;
  },
});

// =============================================================================
// PROCESSING CLIP MUTATIONS
// =============================================================================

/**
 * Toggle visibility of a processing clip.
 */
export const toggleProcessingClipVisibility = mutation({
  args: {
    slug: v.string(),
    clipId: v.id("processing_clips"),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Verify user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();
    if (!user) {
      throw new Error("User not found");
    }

    // Get profile by slug
    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!profile || profile.userId !== user._id) {
      throw new Error("Profile not found or not authorized");
    }

    // Get the clip
    const clip = await ctx.db.get(args.clipId);
    if (!clip) {
      throw new Error("Clip not found");
    }

    // Verify clip belongs to this profile
    if (clip.actorProfileId !== profile._id) {
      throw new Error("Clip does not belong to this profile");
    }

    // Update visibility
    await ctx.db.patch(args.clipId, {
      isPublic: args.isPublic,
    });

    return { success: true };
  },
});

/**
 * Delete a processing clip.
 */
export const deleteProcessingClip = mutation({
  args: {
    slug: v.string(),
    clipId: v.id("processing_clips"),
  },
  handler: async (ctx, args) => {
    // Verify user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();
    if (!user) {
      throw new Error("User not found");
    }

    // Get profile by slug
    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!profile || profile.userId !== user._id) {
      throw new Error("Profile not found or not authorized");
    }

    // Get the clip
    const clip = await ctx.db.get(args.clipId);
    if (!clip) {
      throw new Error("Clip not found");
    }

    // Verify clip belongs to this profile
    if (clip.actorProfileId !== profile._id) {
      throw new Error("Clip does not belong to this profile");
    }

    // Delete the clip
    await ctx.db.delete(args.clipId);

    return { success: true };
  },
});

// =============================================================================
// YOUTUBE URL SUBMISSION (Unified R2 Flow)
// =============================================================================

/**
 * Submit a YouTube URL for processing through the unified R2 flow.
 *
 * Flow:
 * 1. Create processing job with inputType="youtube"
 * 2. Mark as UPLOADED to trigger Modal download
 * 3. Modal downloads video → uploads to R2 → calls webhook
 * 4. Webhook updates job with r2SourceKey and triggers R2 processing
 */
export const submitYouTubeJob = action({
  args: {
    slug: v.string(),
    sourceVideoUrl: v.string(),
    clipCount: v.optional(v.number()),
    layout: v.optional(v.string()),
    captionStyle: v.optional(
      v.object({
        highlightColor: v.optional(v.string()),
        fontScale: v.optional(v.number()),
        position: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args): Promise<{
    jobId: Id<"processing_jobs">;
    status: string;
  }> => {
    // Verify ownership via auth
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized: Not authenticated");
    }

    // Get the profile to get its ID
    const profile = await ctx.runQuery(internal.processing.getProfileBySlug, {
      slug: args.slug,
    });

    if (!profile) {
      throw new Error("Profile not found");
    }

    // Get user to verify ownership
    const user = await ctx.runQuery(internal.processing.getUserByAuthId, {
      authId: identity.tokenIdentifier,
    });

    if (!user || profile.userId !== user._id) {
      throw new Error("Profile not found or not owned by user");
    }

    // Fetch YouTube video metadata (title, thumbnail) for better display
    const youtubeMetadata = await fetchYouTubeMetadata(args.sourceVideoUrl);
    console.log(`[submitYouTubeJob] Fetched YouTube metadata:`, youtubeMetadata);

    // Create processing job with inputType="youtube"
    const jobId = await ctx.runMutation(internal.processing.createJobInternal, {
      userId: user._id,
      actorProfileId: profile._id,
      inputType: "youtube",
      sourceUrl: args.sourceVideoUrl,
      title: youtubeMetadata.title, // Set title from YouTube metadata
      clipCount: args.clipCount ?? 5,
      layout: args.layout ?? "standard",
      captionStyle: args.captionStyle,
    });

    // Mark job as UPLOADED to trigger the YouTube download flow
    // This will cause callModalEndpoint to call the YouTube download endpoint
    await ctx.runMutation(internal.processing.updateJobStatus, {
      jobId,
      status: "UPLOADED",
      currentStep: "Preparing YouTube download...",
    });

    // Trigger Modal processing (which will detect YouTube and download to R2 first)
    await ctx.scheduler.runAfter(0, internal.processing.callModalEndpoint, {
      jobId,
    });

    return {
      jobId,
      status: "processing",
    };
  },
});

/**
 * Internal mutation to create a processing job (for use in actions).
 */
export const createJobInternal = internalMutation({
  args: {
    userId: v.id("users"),
    actorProfileId: v.optional(v.id("actor_profiles")),
    inputType: v.union(v.literal("youtube"), v.literal("local")),
    sourceUrl: v.optional(v.string()),
    title: v.optional(v.string()),
    clipCount: v.optional(v.number()),
    layout: v.optional(v.string()),
    captionStyle: v.optional(
      v.object({
        highlightColor: v.optional(v.string()),
        fontScale: v.optional(v.number()),
        position: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const jobId = await ctx.db.insert("processing_jobs", {
      userId: args.userId,
      actorProfileId: args.actorProfileId,
      status: "CREATED",
      inputType: args.inputType,
      sourceUrl: args.sourceUrl,
      title: args.title,
      attemptCount: 0,
      clipCount: args.clipCount,
      layout: args.layout,
      captionStyle: args.captionStyle,
      createdAt: now,
      updatedAt: now,
    });

    return jobId;
  },
});

// =============================================================================
// GROUPED CLIPS WITH URLS (For UI Display)
// =============================================================================

// Type for a job group with clips and URLs
type ProcessingJobGroup = {
  job: {
    _id: string;
    title: string;
    sourceUrl?: string;
    status: string;
    clipCount?: number;
    createdAt: number;
    completedAt?: number;
  };
  clips: Array<{
    _id: string;
    _creationTime: number;
    jobId: string;
    clipIndex: number;
    title?: string;
    description?: string;
    transcript?: string;
    duration: number;
    startTime: number;
    endTime: number;
    score?: number;
    r2ClipKey?: string;
    r2ThumbKey?: string;
    clipUrl: string | null;
    thumbUrl: string | null;
    isPublic?: boolean;
    createdAt: number;
    customThumbnailStorageId?: string;
    customThumbnailUrl?: string;
    thumbnailTimestamp?: number;
  }>;
  clipCount: number;
};

// Return type for getProcessingClipsGroupedByJobWithUrls
type GetProcessingClipsGroupedByJobResult = {
  jobGroups: ProcessingJobGroup[];
  error: string | null;
};

/**
 * Get processing clips grouped by job with signed URLs for playback.
 * This action fetches clips, groups them by job, and generates presigned R2 URLs.
 */
export const getProcessingClipsGroupedByJobWithUrls = action({
  args: {
    slug: v.string(),
    expiresIn: v.optional(v.number()), // Seconds, default 1 hour
  },
  handler: async (ctx, args): Promise<GetProcessingClipsGroupedByJobResult> => {
    // Verify user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { jobGroups: [], error: "Not authenticated" };
    }

    // Get user
    const user = await ctx.runQuery(internal.processing.getUserByAuthId, {
      authId: identity.tokenIdentifier,
    });
    if (!user) {
      return { jobGroups: [], error: "User not found" };
    }

    // Get profile by slug
    const profile = await ctx.runQuery(internal.processing.getProfileBySlug, {
      slug: args.slug,
    });
    if (!profile || profile.userId !== user._id) {
      return { jobGroups: [], error: "Profile not found or not authorized" };
    }

    // Get all processing jobs for this profile
    const jobs = await ctx.runQuery(internal.processing.getProcessingJobsByProfileInternal, {
      profileId: profile._id,
    });

    if (jobs.length === 0) {
      return { jobGroups: [], error: null };
    }

    // Get clips for each job
    const jobGroups: ProcessingJobGroup[] = [];
    const allR2Keys: Array<{ id: string; clipKey: string; thumbKey?: string }> = [];
    // Track external URLs (Klap clips)
    const externalClipUrls = new Map<string, string>();

    for (const job of jobs) {
      const clips = await ctx.runQuery(internal.processing.getJobClipsInternal, {
        jobId: job._id,
      });

      if (clips.length === 0) {
        continue;
      }

      // Collect R2 keys for batch URL generation, and track external URLs
      for (const clip of clips) {
        // Check for external URL (Klap clips)
        if (clip.externalUrl) {
          externalClipUrls.set(clip._id, clip.externalUrl);
        } else if (clip.r2ClipKey && !clip.r2ClipKey.startsWith("klap-external-")) {
          // Regular R2 clip
          allR2Keys.push({
            id: clip._id,
            clipKey: clip.r2ClipKey,
            thumbKey: clip.r2ThumbKey,
          });
        }
      }

      // Add job group with clips (URLs will be filled in later)
      jobGroups.push({
        job: {
          _id: job._id,
          title: job.title || "Untitled Video",
          sourceUrl: job.sourceUrl,
          status: job.status,
          clipCount: job.clipCount,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
        },
        clips: clips.map((clip: Doc<"processing_clips">) => {
          // Check for external URL first (Klap clips)
          const externalUrl = externalClipUrls.get(clip._id);
          return {
            _id: clip._id,
            _creationTime: clip._creationTime,
            jobId: clip.jobId,
            clipIndex: clip.clipIndex,
            title: clip.title,
            description: clip.description,
            transcript: clip.transcript,
            duration: clip.duration,
            startTime: clip.startTime,
            endTime: clip.endTime,
            score: clip.score,
            r2ClipKey: clip.r2ClipKey,
            r2ThumbKey: clip.r2ThumbKey,
            clipUrl: externalUrl || null, // Use external URL if available
            thumbUrl: null,
            isPublic: clip.isPublic,
            createdAt: clip.createdAt,
            customThumbnailStorageId: clip.customThumbnailStorageId,
            customThumbnailUrl: clip.customThumbnailUrl,
            thumbnailTimestamp: clip.thumbnailTimestamp,
          };
        }),
        clipCount: clips.length,
      });
    }

    // Generate signed URLs for all clips in batch
    if (allR2Keys.length > 0) {
      const signedUrls = await ctx.runAction(internal.r2.r2GetSignedUrlsInternal, {
        r2Keys: allR2Keys,
        expiresIn: args.expiresIn || 3600,
      });

      // Create a map for quick lookup
      const urlMap = new Map<string, { clipUrl: string; thumbUrl: string | null }>();
      for (const item of signedUrls) {
        urlMap.set(item.id, { clipUrl: item.clipUrl, thumbUrl: item.thumbUrl });
      }

      // Fill in URLs for each clip
      for (const group of jobGroups) {
        for (const clip of group.clips) {
          const urls = urlMap.get(clip._id);
          if (urls) {
            clip.clipUrl = urls.clipUrl;
            clip.thumbUrl = urls.thumbUrl;
          }
        }
      }
    }

    return { jobGroups, error: null };
  },
});
