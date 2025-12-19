/**
 * Video jobs database operations (mutations and queries).
 * These run in the Convex runtime (not Node.js).
 */

import { v } from "convex/values";
import {
  QueryCtx,
  MutationCtx,
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const STATUS = {
  CREATED: "CREATED",
  META_READY: "META_READY",
  UPLOAD_READY: "UPLOAD_READY",
  UPLOADING: "UPLOADING",
  UPLOADED: "UPLOADED",
  PROCESSING: "PROCESSING",
  READY: "READY",
  FAILED: "FAILED",
} as const;

async function getUserFromIdentity(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"users">> {
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

  return user._id;
}

export const getCurrentUserForAction = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();
  },
});

export const getVideoJobInternal = internalQuery({
  args: { jobId: v.id("video_jobs") },
  handler: async (ctx, args) => ctx.db.get(args.jobId),
});

export const createVideoJobRecord = internalMutation({
  args: {
    userId: v.id("users"),
    youtubeUrl: v.string(),
    videoId: v.string(),
    meta: v.object({
      title: v.optional(v.string()),
      thumbnailUrl: v.optional(v.string()),
      duration: v.optional(v.number()),
      authorName: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const jobId = await ctx.db.insert("video_jobs", {
      userId: args.userId,
      sourceUrl: args.youtubeUrl,
      videoId: args.videoId,
      sourceMeta: args.meta,
      status: STATUS.META_READY,
      progress: 0,
      createdAt: now,
      updatedAt: now,
    });

    return jobId;
  },
});

export const confirmVideoRightsInternal = internalMutation({
  args: { jobId: v.id("video_jobs"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);

    if (!job || job.userId !== args.userId) {
      throw new Error("Job not found");
    }

    if (job.status !== STATUS.META_READY) {
      throw new Error("Job is not ready for upload");
    }

    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      rightsConfirmedAt: now,
      status: STATUS.UPLOAD_READY,
      updatedAt: now,
    });

    return { status: STATUS.UPLOAD_READY };
  },
});

export const getVideoJob = query({
  args: { jobId: v.id("video_jobs") },
  handler: async (ctx, args) => {
    const userId = await getUserFromIdentity(ctx);
    const job = await ctx.db.get(args.jobId);

    if (!job || job.userId !== userId) return null;
    return job;
  },
});

export const saveVideoUploadSession = mutation({
  args: {
    jobId: v.id("video_jobs"),
    r2Key: v.string(),
    uploadId: v.string(),
    partSize: v.number(),
    totalParts: v.number(),
    totalBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserFromIdentity(ctx);
    const job = await ctx.db.get(args.jobId);

    if (!job || job.userId !== userId) {
      throw new Error("Job not found");
    }

    if (job.status !== STATUS.UPLOAD_READY && job.status !== STATUS.UPLOADING) {
      throw new Error(`Cannot start upload from status ${job.status}`);
    }

    const now = Date.now();

    const sessionId = await ctx.db.insert("video_upload_sessions", {
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

    await ctx.db.patch(args.jobId, {
      uploadSessionId: sessionId,
      status: STATUS.UPLOADING,
      updatedAt: now,
    });

    return sessionId;
  },
});

export const reportVideoUploadedPart = mutation({
  args: {
    sessionId: v.id("video_upload_sessions"),
    partNumber: v.number(),
    etag: v.string(),
    partBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Upload session not found");

    const existing = session.completedParts.find(
      (p) => p.partNumber === args.partNumber
    );
    if (!existing) {
      session.completedParts.push({
        partNumber: args.partNumber,
        etag: args.etag,
      });
    }

    const bytesUploaded = session.bytesUploaded + args.partBytes;
    await ctx.db.patch(args.sessionId, {
      completedParts: session.completedParts,
      bytesUploaded,
      updatedAt: Date.now(),
    });

    const job = await ctx.db.get(session.jobId);
    if (job) {
      const progress = Math.min(100, Math.round((bytesUploaded / session.totalBytes) * 100));
      await ctx.db.patch(session.jobId, {
        progress,
        updatedAt: Date.now(),
        status: STATUS.UPLOADING,
      });
    }

    return await ctx.db.get(args.sessionId);
  },
});

export const markVideoUploadComplete = mutation({
  args: {
    sessionId: v.id("video_upload_sessions"),
    r2Key: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Upload session not found");

    await ctx.db.patch(args.sessionId, {
      status: "COMPLETED",
      updatedAt: Date.now(),
    });

    await ctx.db.patch(session.jobId, {
      status: STATUS.UPLOADED,
      r2SourceKey: args.r2Key,
      progress: 100,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const setVideoJobUploading = internalMutation({
  args: { jobId: v.id("video_jobs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: STATUS.UPLOADING,
      updatedAt: Date.now(),
    });
  },
});

export const updateVideoJobProgress = internalMutation({
  args: {
    jobId: v.id("video_jobs"),
    progress: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      progress: Math.min(100, Math.max(0, args.progress)),
      updatedAt: Date.now(),
    });
  },
});

export const markVideoJobUploaded = internalMutation({
  args: { jobId: v.id("video_jobs"), r2Key: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: STATUS.UPLOADED,
      r2SourceKey: args.r2Key,
      progress: 100,
      updatedAt: Date.now(),
    });
  },
});

export const markVideoJobFailed = internalMutation({
  args: { jobId: v.id("video_jobs"), error: v.string(), stage: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: STATUS.FAILED,
      error: args.error,
      errorStage: args.stage,
      updatedAt: Date.now(),
    });
  },
});

export const listVideoJobs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getUserFromIdentity(ctx);
    let jobs = await ctx.db
      .query("video_jobs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    jobs = jobs.sort((a, b) => b.createdAt - a.createdAt);
    if (args.limit) jobs = jobs.slice(0, args.limit);
    return jobs;
  },
});

/**
 * Create a video job for a local file upload (for trailer generation).
 * Unlike YouTube jobs, this job starts in UPLOAD_READY status since
 * the user will upload the file directly.
 */
export const createLocalVideoJob = mutation({
  args: {
    title: v.string(),
    actorProfileId: v.optional(v.id("actor_profiles")),
  },
  handler: async (ctx, args): Promise<Id<"video_jobs">> => {
    const userId = await getUserFromIdentity(ctx);

    // If actorProfileId is provided, verify ownership
    if (args.actorProfileId) {
      const profile = await ctx.db.get(args.actorProfileId);
      if (!profile || profile.userId !== userId) {
        throw new Error("Actor profile not found or not owned by user");
      }
    }

    const now = Date.now();

    const jobId = await ctx.db.insert("video_jobs", {
      userId,
      sourceUrl: "", // No URL for local uploads
      videoId: "", // No video ID for local uploads
      sourceMeta: {
        title: args.title,
      },
      status: STATUS.UPLOAD_READY, // Ready for browser upload
      progress: 0,
      rightsConfirmedAt: now, // Auto-confirm rights for local uploads (user owns the file)
      createdAt: now,
      updatedAt: now,
    });

    return jobId;
  },
});

/**
 * Create a trailer job from a video job and trigger processing.
 * This should be called after the video upload is complete.
 */
export const createTrailerJobAndTrigger = mutation({
  args: {
    videoJobId: v.id("video_jobs"),
    profileId: v.id("trailer_profiles"),
  },
  handler: async (ctx, args): Promise<Id<"trailer_jobs">> => {
    const userId = await getUserFromIdentity(ctx);

    // Verify video job exists, belongs to user, and is uploaded
    const videoJob = await ctx.db.get(args.videoJobId);
    if (!videoJob || videoJob.userId !== userId) {
      throw new Error("Video job not found");
    }

    if (videoJob.status !== STATUS.UPLOADED) {
      throw new Error(`Video must be uploaded before creating trailer job (current status: ${videoJob.status})`);
    }

    const now = Date.now();

    // Create trailer job
    const trailerJobId = await ctx.db.insert("trailer_jobs", {
      videoJobId: args.videoJobId,
      userId,
      status: "UPLOADED", // Ready for Modal to pick up
      selectedProfileId: args.profileId,
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Schedule the trailer processing trigger
    await ctx.scheduler.runAfter(0, internal.videoJobsDb.triggerTrailerProcessing, {
      trailerJobId,
    });

    return trailerJobId;
  },
});

/**
 * Trigger Modal trailer processing (internal mutation called via scheduler).
 */
export const triggerTrailerProcessing = internalMutation({
  args: { trailerJobId: v.id("trailer_jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.trailerJobId);
    if (!job) {
      console.error(`Trailer job not found: ${args.trailerJobId}`);
      return;
    }

    if (job.status !== "UPLOADED") {
      console.error(`Trailer job not in UPLOADED state: ${job.status}`);
      return;
    }

    // Schedule the HTTP action to call Modal (action defined in videoJobs.ts)
    await ctx.scheduler.runAfter(0, internal.videoJobs.callModalTrailerEndpoint, {
      trailerJobId: args.trailerJobId,
    });
  },
});
