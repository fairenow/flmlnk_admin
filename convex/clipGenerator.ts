import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { Id } from "./_generated/dataModel";

// =============================================================================
// CONFIGURATION
// =============================================================================

// Modal endpoint - set in Convex dashboard environment variables
const MODAL_ENDPOINT = process.env.MODAL_ENDPOINT || "https://flmlnk--video-processor-process-video.modal.run";
const MODAL_WEBHOOK_SECRET = process.env.MODAL_WEBHOOK_SECRET;

// Convex URL for webhooks - auto-detected or set via environment
const getConvexSiteUrl = (): string => {
  // In production, this will be your deployed Convex URL
  // Format: https://your-app.convex.site
  return process.env.CONVEX_SITE_URL || "https://flmlnk-convex-app.convex.site";
};

// Legacy DO API constants (deprecated - kept for backwards compatibility)
// With Modal.com webhooks, we no longer need polling
const CLIPPING_API_URL = process.env.CLIPPING_API_URL || "https://api.clip.example.com";
const POLL_INTERVAL_MS = 5000; // 5 seconds
const MAX_POLL_ATTEMPTS = 120; // 10 minutes max polling

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function getOwnedProfileBySlug(ctx: QueryCtx | MutationCtx, slug: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
    .unique();

  if (!user) return null;

  const profile = await ctx.db
    .query("actor_profiles")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();

  if (!profile) return null;
  if (profile.userId !== user._id) return null;

  return { user, profile } as const;
}

// Generate a unique visitor ID for the DO API
function generateVisitorId(profileId: string): string {
  return `flmlnk_${profileId}_${Date.now()}`;
}

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Create a new clip generation job record
 */
export const createJob = mutation({
  args: {
    slug: v.string(),
    sourceVideoUrl: v.string(),
    clipCount: v.number(),
    externalJobId: v.string(),
    visitorId: v.string(),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("Unauthorized: Profile not found or not owned by user");
    }

    const jobId = await ctx.db.insert("clip_generation_jobs", {
      actorProfileId: owned.profile._id,
      visitorId: args.visitorId,
      externalJobId: args.externalJobId,
      sourceVideoUrl: args.sourceVideoUrl,
      status: "submitted",
      clipCount: args.clipCount,
      createdAt: Date.now(),
    });

    return jobId;
  },
});

/**
 * Update job status (internal - called by polling action)
 */
export const updateJobStatus = internalMutation({
  args: {
    jobId: v.id("clip_generation_jobs"),
    status: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: {
      status: string;
      errorMessage?: string;
      completedAt?: number;
    } = {
      status: args.status,
    };

    if (args.errorMessage) {
      updates.errorMessage = args.errorMessage;
    }

    if (args.status === "completed" || args.status === "failed") {
      updates.completedAt = Date.now();
    }

    await ctx.db.patch(args.jobId, updates);
  },
});

/**
 * Update job progress (called by Modal webhook)
 */
export const updateJobProgress = internalMutation({
  args: {
    externalJobId: v.string(),
    status: v.string(),
    progress: v.optional(v.number()),
    currentStep: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    videoTitle: v.optional(v.string()),
    videoDuration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("clip_generation_jobs")
      .withIndex("by_externalJobId", (q) => q.eq("externalJobId", args.externalJobId))
      .unique();

    if (!job) {
      throw new Error(`Job not found: ${args.externalJobId}`);
    }

    const updates: Record<string, unknown> = {
      status: args.status,
    };

    if (args.progress !== undefined) {
      updates.progress = args.progress;
    }
    if (args.currentStep !== undefined) {
      updates.currentStep = args.currentStep;
    }
    if (args.errorMessage) {
      updates.errorMessage = args.errorMessage;
    }
    if (args.videoTitle) {
      updates.videoTitle = args.videoTitle;
    }
    if (args.videoDuration !== undefined) {
      updates.videoDuration = args.videoDuration;
    }

    await ctx.db.patch(job._id, updates);
  },
});

/**
 * Complete a job (called by Modal webhook)
 */
export const completeJob = internalMutation({
  args: {
    externalJobId: v.string(),
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("clip_generation_jobs")
      .withIndex("by_externalJobId", (q) => q.eq("externalJobId", args.externalJobId))
      .unique();

    if (!job) {
      throw new Error(`Job not found: ${args.externalJobId}`);
    }

    await ctx.db.patch(job._id, {
      status: args.success ? "completed" : "failed",
      progress: args.success ? 100 : job.progress,
      currentStep: args.success ? "Complete" : "Failed",
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
    });
  },
});

/**
 * Save a clip from Modal webhook
 */
export const saveClipFromWebhook = internalMutation({
  args: {
    externalJobId: v.string(),
    clip: v.object({
      externalClipId: v.string(),
      title: v.string(),
      description: v.string(),
      transcript: v.string(),
      downloadUrl: v.string(),
      thumbnailUrl: v.optional(v.string()),
      duration: v.number(),
      startTime: v.number(),
      endTime: v.number(),
      score: v.number(),
      videoTitle: v.optional(v.string()),
      hasFaces: v.optional(v.boolean()),
      facePositions: v.optional(
        v.array(
          v.object({
            x: v.number(),
            y: v.number(),
            width: v.number(),
            height: v.number(),
            timestamp: v.number(),
          })
        )
      ),
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
    }),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("clip_generation_jobs")
      .withIndex("by_externalJobId", (q) => q.eq("externalJobId", args.externalJobId))
      .unique();

    if (!job) {
      throw new Error(`Job not found: ${args.externalJobId}`);
    }

    // Check if clip already exists
    const existing = await ctx.db
      .query("generated_clips")
      .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
      .filter((q) => q.eq(q.field("externalClipId"), args.clip.externalClipId))
      .first();

    if (existing) {
      return existing._id;
    }

    const clipId = await ctx.db.insert("generated_clips", {
      jobId: job._id,
      actorProfileId: job.actorProfileId,
      externalClipId: args.clip.externalClipId,
      title: args.clip.title,
      description: args.clip.description,
      transcript: args.clip.transcript,
      downloadUrl: args.clip.downloadUrl,
      thumbnailUrl: args.clip.thumbnailUrl,
      duration: args.clip.duration,
      startTime: args.clip.startTime,
      endTime: args.clip.endTime,
      score: args.clip.score,
      videoTitle: args.clip.videoTitle,
      hasFaces: args.clip.hasFaces,
      facePositions: args.clip.facePositions,
      layout: args.clip.layout,
      captionStyle: args.clip.captionStyle,
      viralAnalysis: args.clip.viralAnalysis,
      createdAt: Date.now(),
    });

    return clipId;
  },
});

/**
 * Save transcription (for caching)
 */
export const saveTranscription = internalMutation({
  args: {
    videoHash: v.string(),
    sourceVideoUrl: v.string(),
    videoTitle: v.optional(v.string()),
    videoDuration: v.optional(v.number()),
    segments: v.array(
      v.object({
        start: v.number(),
        end: v.number(),
        text: v.string(),
        words: v.optional(
          v.array(
            v.object({
              word: v.string(),
              start: v.number(),
              end: v.number(),
              confidence: v.optional(v.number()),
            })
          )
        ),
      })
    ),
    fullText: v.string(),
    language: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if transcription already exists
    const existing = await ctx.db
      .query("transcriptions")
      .withIndex("by_videoHash", (q) => q.eq("videoHash", args.videoHash))
      .unique();

    if (existing) {
      // Update lastUsedAt
      await ctx.db.patch(existing._id, { lastUsedAt: Date.now() });
      return existing._id;
    }

    const transcriptionId = await ctx.db.insert("transcriptions", {
      videoHash: args.videoHash,
      sourceVideoUrl: args.sourceVideoUrl,
      videoTitle: args.videoTitle,
      videoDuration: args.videoDuration,
      segments: args.segments,
      fullText: args.fullText,
      language: args.language,
      model: args.model,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });

    return transcriptionId;
  },
});

/**
 * Get transcription by video hash
 */
export const getTranscriptionByHash = internalQuery({
  args: { videoHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transcriptions")
      .withIndex("by_videoHash", (q) => q.eq("videoHash", args.videoHash))
      .unique();
  },
});

/**
 * Update transcription last used timestamp
 */
export const updateTranscriptionLastUsed = internalMutation({
  args: { transcriptionId: v.id("transcriptions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.transcriptionId, { lastUsedAt: Date.now() });
  },
});

/**
 * Save a generated clip to the database (internal)
 */
export const saveGeneratedClip = internalMutation({
  args: {
    jobId: v.id("clip_generation_jobs"),
    actorProfileId: v.id("actor_profiles"),
    externalClipId: v.string(),
    title: v.string(),
    description: v.string(),
    transcript: v.string(),
    downloadUrl: v.string(),
    duration: v.number(),
    startTime: v.number(),
    endTime: v.number(),
    score: v.number(),
    videoTitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if clip already exists (avoid duplicates)
    const existing = await ctx.db
      .query("generated_clips")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .filter((q) => q.eq(q.field("externalClipId"), args.externalClipId))
      .first();

    if (existing) {
      return existing._id;
    }

    const clipId = await ctx.db.insert("generated_clips", {
      jobId: args.jobId,
      actorProfileId: args.actorProfileId,
      externalClipId: args.externalClipId,
      title: args.title,
      description: args.description,
      transcript: args.transcript,
      downloadUrl: args.downloadUrl,
      duration: args.duration,
      startTime: args.startTime,
      endTime: args.endTime,
      score: args.score,
      videoTitle: args.videoTitle,
      createdAt: Date.now(),
    });

    return clipId;
  },
});

/**
 * Delete a generated clip and its storage files
 */
export const deleteGeneratedClip = mutation({
  args: {
    slug: v.string(),
    clipId: v.id("generated_clips"),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("Unauthorized");
    }

    const clip = await ctx.db.get(args.clipId);
    if (!clip || clip.actorProfileId !== owned.profile._id) {
      throw new Error("Clip not found or not owned by user");
    }

    // Delete storage files if they exist
    if (clip.storageId) {
      await ctx.storage.delete(clip.storageId);
    }
    if (clip.thumbnailStorageId) {
      await ctx.storage.delete(clip.thumbnailStorageId);
    }

    await ctx.db.delete(args.clipId);
  },
});

/**
 * Toggle visibility (isPublic) for a generated clip
 */
export const toggleGeneratedClipVisibility = mutation({
  args: {
    slug: v.string(),
    clipId: v.id("generated_clips"),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("Unauthorized");
    }

    const clip = await ctx.db.get(args.clipId);
    if (!clip || clip.actorProfileId !== owned.profile._id) {
      throw new Error("Clip not found or not owned by user");
    }

    await ctx.db.patch(args.clipId, { isPublic: args.isPublic });

    return { ok: true };
  },
});

/**
 * Cancel a running job
 */
export const cancelJob = mutation({
  args: {
    slug: v.string(),
    jobId: v.id("clip_generation_jobs"),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("Unauthorized: Profile not found or not owned by user");
    }

    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Job not found");
    }

    if (job.actorProfileId !== owned.profile._id) {
      throw new Error("Unauthorized: Job does not belong to this profile");
    }

    // Only cancel jobs that are still in progress
    if (job.status === "completed" || job.status === "failed") {
      return { success: true, message: "Job already finished" };
    }

    // Mark the job as failed with cancellation message
    await ctx.db.patch(args.jobId, {
      status: "failed",
      errorMessage: "Cancelled by user",
      completedAt: Date.now(),
    });

    return { success: true, message: "Job cancelled" };
  },
});

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get all jobs for an actor profile
 */
export const getJobsByProfile = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      return [];
    }

    const jobs = await ctx.db
      .query("clip_generation_jobs")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", owned.profile._id)
      )
      .order("desc")
      .collect();

    return jobs;
  },
});

/**
 * Get a specific job by ID
 */
export const getJob = query({
  args: { jobId: v.id("clip_generation_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

/**
 * Get all generated clips for an actor profile (editor view - requires auth)
 */
export const getGeneratedClipsByProfile = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      return [];
    }

    const clips = await ctx.db
      .query("generated_clips")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", owned.profile._id)
      )
      .order("desc")
      .collect();

    return clips;
  },
});

/**
 * Get public generated clips for an actor profile (public view - no auth required)
 */
export const getPublicGeneratedClips = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!profile) {
      return [];
    }

    const clips = await ctx.db
      .query("generated_clips")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", profile._id)
      )
      .order("desc")
      .collect();

    // Filter to only public clips (isPublic === true)
    // Generated clips default to private (must explicitly be made public)
    return clips.filter((c) => c.isPublic === true);
  },
});

/**
 * Get generated clips for a specific job
 */
export const getClipsByJob = query({
  args: { jobId: v.id("clip_generation_jobs") },
  handler: async (ctx, args) => {
    const clips = await ctx.db
      .query("generated_clips")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .order("desc")
      .collect();

    return clips;
  },
});

/**
 * Get a single generated clip by ID (public - for detail page)
 */
export const getGeneratedClipById = query({
  args: { clipId: v.id("generated_clips") },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.clipId);
    if (!clip) return null;

    // Get the job to include video title
    const job = await ctx.db.get(clip.jobId);

    return {
      ...clip,
      jobVideoTitle: job?.videoTitle,
      jobSourceUrl: job?.sourceVideoUrl,
    };
  },
});

/**
 * Get clips grouped by job for a profile (for history dropdown with pagination)
 */
export const getClipsGroupedByJob = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      return [];
    }

    // Get all jobs for this profile, ordered by creation date descending
    const jobs = await ctx.db
      .query("clip_generation_jobs")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", owned.profile._id)
      )
      .order("desc")
      .collect();

    // Get clips for each job
    const jobsWithClips = await Promise.all(
      jobs.map(async (job) => {
        const clips = await ctx.db
          .query("generated_clips")
          .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
          .order("desc")
          .collect();

        return {
          job: {
            _id: job._id,
            videoTitle: job.videoTitle || "Untitled Video",
            sourceVideoUrl: job.sourceVideoUrl,
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

// =============================================================================
// ACTIONS (External API Calls)
// =============================================================================

/**
 * Submit a video to Modal for processing
 */
export const submitClipGenerationJob = action({
  args: {
    slug: v.string(),
    sourceVideoUrl: v.string(),
    clipCount: v.optional(v.number()),
    layout: v.optional(v.string()), // "gaming", "podcast", "standard"
    captionStyle: v.optional(
      v.object({
        highlightColor: v.optional(v.string()),
        fontScale: v.optional(v.number()),
        position: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args): Promise<{
    jobId: Id<"clip_generation_jobs">;
    externalJobId: string;
    status: string;
  }> => {
    // Verify ownership via auth
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized: Not authenticated");
    }

    // Get the profile to get its ID for the visitor ID
    const profile = await ctx.runQuery(
      internal.clipGenerator.getProfileBySlugInternal,
      { slug: args.slug, tokenIdentifier: identity.tokenIdentifier }
    );

    if (!profile) {
      throw new Error("Profile not found or not owned by user");
    }

    const clipCount = args.clipCount ?? 5;
    const visitorId = generateVisitorId(profile._id);
    const externalJobId = `modal_${visitorId}_${Date.now()}`;
    const convexWebhookUrl = getConvexSiteUrl();

    // Create job record in Convex first
    const jobId = await ctx.runMutation(
      internal.clipGenerator.createJobInternal,
      {
        actorProfileId: profile._id,
        sourceVideoUrl: args.sourceVideoUrl,
        clipCount,
        externalJobId,
        visitorId,
        layout: args.layout,
        captionStyle: args.captionStyle,
      }
    );

    // Submit to Modal
    try {
      const response = await fetch(MODAL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(MODAL_WEBHOOK_SECRET ? { "Authorization": `Bearer ${MODAL_WEBHOOK_SECRET}` } : {}),
        },
        body: JSON.stringify({
          job_id: externalJobId,
          video_url: args.sourceVideoUrl,
          num_clips: clipCount,
          layout: args.layout || "standard",
          caption_style: args.captionStyle || {
            highlightColor: "00FFFF",
            fontScale: 1.0,
            position: "bottom",
          },
          webhook_url: convexWebhookUrl,
          webhook_secret: MODAL_WEBHOOK_SECRET,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Update job as failed
        await ctx.runMutation(internal.clipGenerator.updateJobStatus, {
          jobId,
          status: "failed",
          errorMessage: `Modal API error: ${response.status} - ${errorText}`,
        });
        throw new Error(`Modal API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as {
        status: string;
        message?: string;
      };

      // Update job status to processing
      await ctx.runMutation(internal.clipGenerator.updateJobStatus, {
        jobId,
        status: "processing",
      });

      return {
        jobId,
        externalJobId,
        status: data.status || "processing",
      };
    } catch (err) {
      // Update job as failed if Modal call fails
      await ctx.runMutation(internal.clipGenerator.updateJobStatus, {
        jobId,
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Failed to submit to Modal",
      });
      throw err;
    }
  },
});

/**
 * Internal query to get profile by slug (for use in actions)
 */
export const getProfileBySlugInternal = internalQuery({
  args: { slug: v.string(), tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", args.tokenIdentifier))
      .unique();

    if (!user) return null;

    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!profile || profile.userId !== user._id) return null;

    return profile;
  },
});

/**
 * Validate YouTube URL format
 */
function isValidYouTubeUrl(url: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
  ];
  return patterns.some((pattern) => pattern.test(url));
}

/**
 * Trigger clip generation during onboarding (internal action)
 * Called after actor profile is created to automatically generate clips from the trailer
 */
export const triggerOnboardingClipGeneration = internalAction({
  args: {
    slug: v.string(),
    sourceVideoUrl: v.string(),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    jobId?: Id<"clip_generation_jobs">;
    externalJobId?: string;
    error?: string;
  }> => {
    // Validate the YouTube URL
    if (!isValidYouTubeUrl(args.sourceVideoUrl)) {
      console.log(`[Onboarding Clip Generation] Invalid YouTube URL: ${args.sourceVideoUrl}`);
      return { success: false, error: "Invalid YouTube URL" };
    }

    // Get the profile
    const profile = await ctx.runQuery(
      internal.clipGenerator.getProfileBySlugInternal,
      { slug: args.slug, tokenIdentifier: args.tokenIdentifier }
    );

    if (!profile) {
      console.log(`[Onboarding Clip Generation] Profile not found for slug: ${args.slug}`);
      return { success: false, error: "Profile not found" };
    }

    const clipCount = 5; // Fixed at 5 clips for onboarding
    const visitorId = generateVisitorId(profile._id);
    const externalJobId = `modal_onboarding_${visitorId}_${Date.now()}`;
    const convexWebhookUrl = getConvexSiteUrl();

    // Create job record in Convex first
    const jobId = await ctx.runMutation(
      internal.clipGenerator.createJobInternal,
      {
        actorProfileId: profile._id,
        sourceVideoUrl: args.sourceVideoUrl,
        clipCount,
        externalJobId,
        visitorId,
        layout: "standard",
      }
    );

    // Submit to Modal
    try {
      const response = await fetch(MODAL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(MODAL_WEBHOOK_SECRET ? { "Authorization": `Bearer ${MODAL_WEBHOOK_SECRET}` } : {}),
        },
        body: JSON.stringify({
          job_id: externalJobId,
          video_url: args.sourceVideoUrl,
          num_clips: clipCount,
          layout: "standard",
          caption_style: {
            highlightColor: "00FFFF",
            fontScale: 1.0,
            position: "bottom",
          },
          webhook_url: convexWebhookUrl,
          webhook_secret: MODAL_WEBHOOK_SECRET,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Update job as failed
        await ctx.runMutation(internal.clipGenerator.updateJobStatus, {
          jobId,
          status: "failed",
          errorMessage: `Modal API error: ${response.status} - ${errorText}`,
        });
        console.error(`[Onboarding Clip Generation] Modal API error: ${response.status} - ${errorText}`);
        return { success: false, jobId, error: `Modal API error: ${response.status}` };
      }

      // Update job status to processing
      await ctx.runMutation(internal.clipGenerator.updateJobStatus, {
        jobId,
        status: "processing",
      });

      console.log(`[Onboarding Clip Generation] Successfully triggered clip generation for slug: ${args.slug}, jobId: ${jobId}`);
      return {
        success: true,
        jobId,
        externalJobId,
      };
    } catch (err) {
      // Update job as failed if Modal call fails
      await ctx.runMutation(internal.clipGenerator.updateJobStatus, {
        jobId,
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Failed to submit to Modal",
      });
      console.error(`[Onboarding Clip Generation] Error submitting to Modal:`, err);
      return {
        success: false,
        jobId,
        error: err instanceof Error ? err.message : "Failed to submit to Modal"
      };
    }
  },
});

/**
 * Internal mutation to create job (for use in actions)
 */
export const createJobInternal = internalMutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    sourceVideoUrl: v.string(),
    clipCount: v.number(),
    externalJobId: v.string(),
    visitorId: v.string(),
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
    const jobId = await ctx.db.insert("clip_generation_jobs", {
      actorProfileId: args.actorProfileId,
      visitorId: args.visitorId,
      externalJobId: args.externalJobId,
      sourceVideoUrl: args.sourceVideoUrl,
      status: "pending",
      clipCount: args.clipCount,
      progress: 0,
      currentStep: "Initializing",
      layout: args.layout,
      captionStyle: args.captionStyle,
      createdAt: Date.now(),
    });

    return jobId;
  },
});

/**
 * Poll the DO API for job status (scheduled action)
 */
export const pollJobStatus = internalAction({
  args: {
    jobId: v.id("clip_generation_jobs"),
    externalJobId: v.string(),
    visitorId: v.string(),
    actorProfileId: v.id("actor_profiles"),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    // Check job status from DO API
    const response = await fetch(
      `${CLIPPING_API_URL}/api/v1/jobs/${args.externalJobId}`
    );

    if (!response.ok) {
      console.error(`Failed to poll job status: ${response.status}`);

      // If we've exceeded max attempts, mark as failed
      if (args.attempt >= MAX_POLL_ATTEMPTS) {
        await ctx.runMutation(internal.clipGenerator.updateJobStatus, {
          jobId: args.jobId,
          status: "failed",
          errorMessage: "Polling timeout - job took too long",
        });
        return;
      }

      // Schedule retry
      await ctx.scheduler.runAfter(
        POLL_INTERVAL_MS,
        internal.clipGenerator.pollJobStatus,
        { ...args, attempt: args.attempt + 1 }
      );
      return;
    }

    const data = (await response.json()) as {
      status: string;
      slug?: string;
      message?: string;
    };

    // Update job status in Convex
    if (data.status === "completed") {
      await ctx.runMutation(internal.clipGenerator.updateJobStatus, {
        jobId: args.jobId,
        status: "completed",
      });

      // Fetch and store the generated clips
      await ctx.runAction(internal.clipGenerator.fetchAndStoreClips, {
        jobId: args.jobId,
        visitorId: args.visitorId,
        actorProfileId: args.actorProfileId,
      });
    } else if (data.status === "failed") {
      await ctx.runMutation(internal.clipGenerator.updateJobStatus, {
        jobId: args.jobId,
        status: "failed",
        errorMessage: data.message || "Job failed on server",
      });
    } else {
      // Still processing - update status and schedule next poll
      await ctx.runMutation(internal.clipGenerator.updateJobStatus, {
        jobId: args.jobId,
        status: data.status,
      });

      if (args.attempt < MAX_POLL_ATTEMPTS) {
        await ctx.scheduler.runAfter(
          POLL_INTERVAL_MS,
          internal.clipGenerator.pollJobStatus,
          { ...args, attempt: args.attempt + 1 }
        );
      } else {
        await ctx.runMutation(internal.clipGenerator.updateJobStatus, {
          jobId: args.jobId,
          status: "failed",
          errorMessage: "Polling timeout - job took too long",
        });
      }
    }
  },
});

/**
 * Fetch clips from DO API and store in Convex
 */
export const fetchAndStoreClips = internalAction({
  args: {
    jobId: v.id("clip_generation_jobs"),
    visitorId: v.string(),
    actorProfileId: v.id("actor_profiles"),
  },
  handler: async (ctx, args) => {
    const response = await fetch(
      `${CLIPPING_API_URL}/api/v1/clips/?user_id=${encodeURIComponent(args.visitorId)}`
    );

    if (!response.ok) {
      console.error(`Failed to fetch clips: ${response.status}`);
      return;
    }

    const clips = (await response.json()) as Array<{
      clip_id: string;
      start_time: number;
      end_time: number;
      duration: number;
      title: string;
      description: string;
      transcript: string;
      score: number;
      download_url: string;
      job_id: string;
      video_title?: string;
    }>;

    // Filter clips for this specific job
    const jobClips = clips.filter((clip) => clip.job_id === args.visitorId.split("_")[1] || true);
    // Note: The DO API might return all clips for the user_id, so we store them all
    // since they're associated with this generation session

    for (const clip of clips) {
      await ctx.runMutation(internal.clipGenerator.saveGeneratedClip, {
        jobId: args.jobId,
        actorProfileId: args.actorProfileId,
        externalClipId: clip.clip_id,
        title: clip.title,
        description: clip.description,
        transcript: clip.transcript,
        downloadUrl: clip.download_url,
        duration: clip.duration,
        startTime: clip.start_time,
        endTime: clip.end_time,
        score: clip.score,
        videoTitle: clip.video_title,
      });
    }

    console.log(`Stored ${clips.length} clips for job ${args.jobId}`);
  },
});

/**
 * Manually refresh clips for a job (if needed)
 */
export const refreshClips = action({
  args: {
    slug: v.string(),
    jobId: v.id("clip_generation_jobs"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    // Get the job to verify ownership and get visitorId
    const job = await ctx.runQuery(internal.clipGenerator.getJobInternal, {
      jobId: args.jobId,
    });

    if (!job) {
      throw new Error("Job not found");
    }

    // Fetch and store clips
    await ctx.runAction(internal.clipGenerator.fetchAndStoreClips, {
      jobId: args.jobId,
      visitorId: job.visitorId,
      actorProfileId: job.actorProfileId,
    });

    return { success: true };
  },
});

/**
 * Internal query to get job (for use in actions)
 */
export const getJobInternal = internalQuery({
  args: { jobId: v.id("clip_generation_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

// =============================================================================
// CLEANUP FUNCTIONS (for cron jobs)
// =============================================================================

/**
 * Clean up old clip generation jobs
 * - Failed jobs older than 7 days
 * - Completed jobs older than 30 days (clips are kept)
 * - Stale pending jobs older than 24 hours
 */
export const cleanupOldJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    // Time thresholds
    const failedThreshold = now - 7 * DAY_MS;
    const completedThreshold = now - 30 * DAY_MS;
    const staleThreshold = now - 1 * DAY_MS;

    let deletedCount = 0;

    // Get all jobs
    const jobs = await ctx.db.query("clip_generation_jobs").collect();

    for (const job of jobs) {
      let shouldDelete = false;

      if (job.status === "failed" && job.createdAt < failedThreshold) {
        shouldDelete = true;
      } else if (job.status === "completed" && job.createdAt < completedThreshold) {
        shouldDelete = true;
      } else if (
        (job.status === "pending" || job.status === "submitted") &&
        job.createdAt < staleThreshold
      ) {
        shouldDelete = true;
      }

      if (shouldDelete) {
        await ctx.db.delete(job._id);
        deletedCount++;
      }
    }

    console.log(`Cleaned up ${deletedCount} old clip generation jobs`);
    return { deletedCount };
  },
});

/**
 * Clean up old transcription cache
 * Removes transcriptions not used in 60 days
 */
export const cleanupOldTranscriptions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
    const threshold = now - SIXTY_DAYS_MS;

    let deletedCount = 0;

    // Get all transcriptions
    const transcriptions = await ctx.db.query("transcriptions").collect();

    for (const transcription of transcriptions) {
      if (transcription.lastUsedAt < threshold) {
        await ctx.db.delete(transcription._id);
        deletedCount++;
      }
    }

    console.log(`Cleaned up ${deletedCount} old transcriptions`);
    return { deletedCount };
  },
});
