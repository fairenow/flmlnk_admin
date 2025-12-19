import { v } from "convex/values";
import { query } from "./_generated/server";

// =============================================================================
// BACKGROUND JOB NOTIFICATIONS
// =============================================================================
// This module provides a unified query to track all active asset generation jobs
// across processing_jobs, gif_generation_jobs, and meme_generation_jobs tables.
// Used by the frontend to show toast notifications when jobs complete.

// Define job types and their terminal states
const PROCESSING_STATUSES = {
  active: ["CREATED", "UPLOADING", "UPLOADED", "PROCESSING"],
  terminal: ["READY", "FAILED"],
};

const GIF_STATUSES = {
  active: ["pending", "downloading", "uploaded", "analyzing", "generating"],
  terminal: ["completed", "failed"],
};

const MEME_STATUSES = {
  active: [
    "pending",
    "downloading",
    "uploaded",
    "processing",
    "extracting_frames",
    "analyzing",
    "generating_captions",
  ],
  terminal: ["completed", "failed"],
};

export type JobType = "clip" | "gif" | "meme";

export interface BackgroundJob {
  _id: string;
  type: JobType;
  status: string;
  title?: string;
  progress?: number;
  currentStep?: string;
  createdAt: number;
  completedAt?: number;
  error?: string;
  clipCount?: number;
  gifCount?: number;
  memeCount?: number;
}

/**
 * Get all background jobs for the current user.
 * Returns jobs from all three job types (clips, gifs, memes).
 * Used by JobNotificationProvider to track job completion.
 */
export const getAllJobs = query({
  args: {
    // Optionally filter to only active or recent jobs
    activeOnly: v.optional(v.boolean()),
    // Limit how far back to look (in hours, default 24)
    maxAgeHours: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<BackgroundJob[]> => {
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

    const maxAgeMs = (args.maxAgeHours ?? 24) * 60 * 60 * 1000;
    const cutoffTime = Date.now() - maxAgeMs;

    // Get all actor profiles for this user
    const profiles = await ctx.db
      .query("actor_profiles")
      .filter((q) => q.eq(q.field("userId"), user._id))
      .collect();

    const profileIds = profiles.map((p) => p._id);

    const jobs: BackgroundJob[] = [];

    // 1. Get processing jobs (clips)
    const processingJobs = await ctx.db
      .query("processing_jobs")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const job of processingJobs) {
      if (job.createdAt < cutoffTime) continue;

      const isActive = PROCESSING_STATUSES.active.includes(job.status);
      if (args.activeOnly && !isActive) continue;

      jobs.push({
        _id: job._id,
        type: "clip",
        status: job.status,
        title: job.title,
        progress: job.progress,
        currentStep: job.currentStep,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        error: job.error,
        clipCount: job.clipCount,
      });
    }

    // 2. Get GIF generation jobs
    for (let i = 0; i < profileIds.length; i++) {
      const profileId = profileIds[i];
      const gifJobs = await ctx.db
        .query("gif_generation_jobs")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profileId))
        .collect();

      for (const job of gifJobs) {
        if (job.createdAt < cutoffTime) continue;

        const isActive = GIF_STATUSES.active.includes(job.status);
        if (args.activeOnly && !isActive) continue;

        jobs.push({
          _id: job._id,
          type: "gif",
          status: job.status,
          title: job.videoTitle,
          progress: job.progress,
          currentStep: job.currentStep,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          error: job.errorMessage,
          gifCount: job.gifCount,
        });
      }
    }

    // 3. Get meme generation jobs
    for (let i = 0; i < profileIds.length; i++) {
      const profileId = profileIds[i];
      const memeJobs = await ctx.db
        .query("meme_generation_jobs")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profileId))
        .collect();

      for (const job of memeJobs) {
        if (job.createdAt < cutoffTime) continue;

        const isActive = MEME_STATUSES.active.includes(job.status);
        if (args.activeOnly && !isActive) continue;

        jobs.push({
          _id: job._id,
          type: "meme",
          status: job.status,
          title: job.videoTitle,
          progress: job.progress,
          currentStep: job.currentStep,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          error: job.errorMessage,
          memeCount: job.memeCount,
        });
      }
    }

    // Sort by createdAt descending
    jobs.sort((a, b) => b.createdAt - a.createdAt);

    return jobs;
  },
});

/**
 * Get only active jobs (jobs that are currently processing).
 * Optimized query for real-time monitoring.
 */
export const getActiveJobs = query({
  args: {},
  handler: async (ctx): Promise<BackgroundJob[]> => {
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

    // Get all actor profiles for this user
    const profiles = await ctx.db
      .query("actor_profiles")
      .filter((q) => q.eq(q.field("userId"), user._id))
      .collect();

    const profileIds = profiles.map((p) => p._id);

    const jobs: BackgroundJob[] = [];

    // 1. Get active processing jobs (clips)
    const processingJobs = await ctx.db
      .query("processing_jobs")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const job of processingJobs) {
      if (!PROCESSING_STATUSES.active.includes(job.status)) continue;

      jobs.push({
        _id: job._id,
        type: "clip",
        status: job.status,
        title: job.title,
        progress: job.progress,
        currentStep: job.currentStep,
        createdAt: job.createdAt,
        clipCount: job.clipCount,
      });
    }

    // 2. Get active GIF generation jobs
    for (let i = 0; i < profileIds.length; i++) {
      const profileId = profileIds[i];
      const gifJobs = await ctx.db
        .query("gif_generation_jobs")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profileId))
        .collect();

      for (const job of gifJobs) {
        if (!GIF_STATUSES.active.includes(job.status)) continue;

        jobs.push({
          _id: job._id,
          type: "gif",
          status: job.status,
          title: job.videoTitle,
          progress: job.progress,
          currentStep: job.currentStep,
          createdAt: job.createdAt,
          gifCount: job.gifCount,
        });
      }
    }

    // 3. Get active meme generation jobs
    for (let i = 0; i < profileIds.length; i++) {
      const profileId = profileIds[i];
      const memeJobs = await ctx.db
        .query("meme_generation_jobs")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profileId))
        .collect();

      for (const job of memeJobs) {
        if (!MEME_STATUSES.active.includes(job.status)) continue;

        jobs.push({
          _id: job._id,
          type: "meme",
          status: job.status,
          title: job.videoTitle,
          progress: job.progress,
          currentStep: job.currentStep,
          createdAt: job.createdAt,
          memeCount: job.memeCount,
        });
      }
    }

    // Sort by createdAt descending
    jobs.sort((a, b) => b.createdAt - a.createdAt);

    return jobs;
  },
});
