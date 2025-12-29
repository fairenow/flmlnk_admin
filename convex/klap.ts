/**
 * Klap API Integration via Modal
 *
 * Uses Modal to process YouTube URLs through Klap API.
 * Modal handles the long-running Klap workflow (can take 15-30 minutes):
 * 1. Submit YouTube URL to Klap
 * 2. Poll for task completion
 * 3. Fetch and export clips
 * 4. Return clip URLs via webhook
 *
 * This approach is more reliable than Convex actions for long-running tasks.
 */

import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Modal endpoint for Klap processing
// Format: https://{workspace}--{app}-{function}.modal.run
const MODAL_KLAP_ENDPOINT =
  process.env.MODAL_KLAP_ENDPOINT ||
  "https://flmlnk--flmlnk-video-processor-process-klap-youtube-endpoint.modal.run";

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

/**
 * Submit a YouTube URL to Klap for clip generation via Modal
 */
export const submitToKlap = action({
  args: {
    jobId: v.id("processing_jobs"),
    videoUrl: v.string(),
    maxDuration: v.optional(v.number()), // Max clip duration in seconds
    maxClipCount: v.optional(v.number()), // Max number of clips
    language: v.optional(v.string()), // Language code (e.g., "en")
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> => {
    // Verify authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { success: false, error: "Not authenticated" };
    }

    // Get the job to verify ownership
    const job = await ctx.runQuery(internal.processing.getJobInternal, {
      jobId: args.jobId,
    });

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    // Get user to verify ownership
    const user = await ctx.runQuery(internal.processing.getUserByAuthId, {
      authId: identity.tokenIdentifier,
    });

    if (!user || job.userId !== user._id) {
      return { success: false, error: "Not authorized" };
    }

    try {
      // Update job status
      await ctx.runMutation(internal.processing.updateJobStatus, {
        jobId: args.jobId,
        status: "DOWNLOADING",
        currentStep: "Submitting video for AI processing...",
        progress: 5,
      });

      // Build webhook URL for Modal to send results back
      const convexUrl = process.env.CONVEX_SITE_URL;
      const webhookUrl = convexUrl ? `${convexUrl}/klap-webhook` : undefined;
      const webhookSecret = process.env.MODAL_WEBHOOK_SECRET;

      // Call Modal endpoint to start Klap processing
      const response = await fetch(MODAL_KLAP_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: args.jobId,
          video_url: args.videoUrl,
          max_duration: args.maxDuration || 60,
          max_clip_count: args.maxClipCount || 10,
          language: args.language || "en",
          webhook_url: webhookUrl,
          webhook_secret: webhookSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Modal error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (result.status === "error") {
        throw new Error(result.message || "Modal returned error");
      }

      // Update job status - Modal is now processing
      await ctx.runMutation(internal.processing.updateJobStatus, {
        jobId: args.jobId,
        status: "PROCESSING",
        currentStep: "AI is analyzing your video (this may take 5-15 minutes)...",
        progress: 10,
      });

      // Store that we're using Modal for this job
      await ctx.runMutation(internal.klap.storeKlapMetadata, {
        jobId: args.jobId,
        modalStatus: "processing",
      });

      return {
        success: true,
        message: "Video processing started",
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";

      await ctx.runMutation(internal.processing.markJobFailed, {
        jobId: args.jobId,
        error: `Video processing failed: ${errorMsg}`,
        errorStage: "download",
      });

      return { success: false, error: errorMsg };
    }
  },
});

/**
 * Store Klap processing metadata
 */
export const storeKlapMetadata = internalMutation({
  args: {
    jobId: v.id("processing_jobs"),
    modalStatus: v.string(),
    klapTaskId: v.optional(v.string()),
    klapFolderId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.jobId);
    const existingMetadata = existing?.processingMetadata
      ? JSON.parse(existing.processingMetadata)
      : {};

    await ctx.db.patch(args.jobId, {
      processingMetadata: JSON.stringify({
        ...existingMetadata,
        modalStatus: args.modalStatus,
        klapTaskId: args.klapTaskId,
        klapFolderId: args.klapFolderId,
        updatedAt: Date.now(),
      }),
    });
  },
});

/**
 * Handle Klap webhook results from Modal
 * Called by the HTTP webhook handler in http.ts
 */
export const handleKlapWebhookResult = internalMutation({
  args: {
    jobId: v.id("processing_jobs"),
    success: v.boolean(),
    clips: v.optional(
      v.array(
        v.object({
          name: v.string(),
          url: v.string(),
          virality_score: v.number(),
          index: v.number(),
        })
      )
    ),
    error: v.optional(v.string()),
    errorStage: v.optional(v.string()),
    taskId: v.optional(v.string()),
    folderId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get job to get userId and actorProfileId
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      console.error(`[Klap Webhook] Job not found: ${args.jobId}`);
      return;
    }

    if (!args.success) {
      // Mark job as failed
      await ctx.db.patch(args.jobId, {
        status: "FAILED",
        error: args.error || "Video processing failed",
        errorStage: args.errorStage || "processing",
        updatedAt: Date.now(),
        processingMetadata: JSON.stringify({
          modalStatus: "failed",
          klapTaskId: args.taskId,
          klapFolderId: args.folderId,
          error: args.error,
        }),
      });
      return;
    }

    if (!args.clips || args.clips.length === 0) {
      await ctx.db.patch(args.jobId, {
        status: "FAILED",
        error: "No clips could be generated from this video",
        errorStage: "processing",
        updatedAt: Date.now(),
      });
      return;
    }

    // Sort clips by virality score
    const sortedClips = args.clips.sort((a, b) => b.virality_score - a.virality_score);

    // Create clip records in processing_clips table
    for (let i = 0; i < sortedClips.length; i++) {
      const clip = sortedClips[i];

      await ctx.db.insert("processing_clips", {
        jobId: args.jobId,
        userId: job.userId,
        actorProfileId: job.actorProfileId,
        clipIndex: i,
        title: clip.name,
        description: `Klap clip with ${Math.round(clip.virality_score)}% virality score`,
        transcript: "", // Klap doesn't provide transcript
        // Timing - Klap doesn't provide exact times
        startTime: 0,
        endTime: 0,
        duration: 0,
        // R2 storage - use placeholder since it's an external URL
        r2ClipKey: `klap-external-${args.jobId}-${i}`,
        // External URL from Klap
        externalUrl: clip.url,
        sourceProvider: "klap",
        // Scoring
        score: Math.round(clip.virality_score),
        // Timestamps
        createdAt: Date.now(),
      });
    }

    // Update job as complete
    await ctx.db.patch(args.jobId, {
      status: "READY",
      progress: 100,
      currentStep: `Generated ${args.clips.length} clips`,
      clipCount: args.clips.length,
      completedAt: Date.now(),
      updatedAt: Date.now(),
      processingMetadata: JSON.stringify({
        modalStatus: "completed",
        klapTaskId: args.taskId,
        klapFolderId: args.folderId,
        clipCount: args.clips.length,
      }),
    });
  },
});

/**
 * Handle progress updates from Modal
 * Called by the HTTP webhook handler in http.ts
 */
export const handleKlapProgressUpdate = internalMutation({
  args: {
    jobId: v.id("processing_jobs"),
    status: v.string(),
    progress: v.number(),
    currentStep: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: args.status as "DOWNLOADING" | "PROCESSING" | "READY" | "FAILED",
      progress: args.progress,
      currentStep: args.currentStep,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Trigger Klap processing during onboarding (internal action)
 * Called after actor profile is created to automatically generate clips from the trailer via Klap
 */
export const triggerOnboardingKlapGeneration = internalAction({
  args: {
    slug: v.string(),
    sourceVideoUrl: v.string(),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    jobId?: Id<"processing_jobs">;
    error?: string;
  }> => {
    // Validate the YouTube URL
    const youtubePatterns = [
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
      /^https?:\/\/youtu\.be\/[\w-]+/,
      /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
    ];
    const isValidYouTube = youtubePatterns.some((pattern) => pattern.test(args.sourceVideoUrl));

    if (!isValidYouTube) {
      console.log(`[Onboarding Klap] Invalid YouTube URL: ${args.sourceVideoUrl}`);
      return { success: false, error: "Invalid YouTube URL" };
    }

    // Get the user and profile
    const user = await ctx.runQuery(internal.klap.getUserByTokenIdentifier, {
      tokenIdentifier: args.tokenIdentifier,
    });

    if (!user) {
      console.log(`[Onboarding Klap] User not found for token: ${args.tokenIdentifier}`);
      return { success: false, error: "User not found" };
    }

    const profile = await ctx.runQuery(internal.klap.getProfileBySlug, {
      slug: args.slug,
    });

    if (!profile) {
      console.log(`[Onboarding Klap] Profile not found for slug: ${args.slug}`);
      return { success: false, error: "Profile not found" };
    }

    // Fetch YouTube video metadata for better display
    const youtubeMetadata = await fetchYouTubeMetadata(args.sourceVideoUrl);
    console.log(`[Onboarding Klap] Fetched YouTube metadata:`, youtubeMetadata);

    // Create a processing job for Klap
    const now = Date.now();
    const jobId = await ctx.runMutation(internal.klap.createOnboardingKlapJob, {
      userId: user._id,
      actorProfileId: profile._id,
      sourceUrl: args.sourceVideoUrl,
      title: youtubeMetadata.title, // Set title from YouTube metadata
    });

    // Build webhook URL for Modal to send results back
    const convexUrl = process.env.CONVEX_SITE_URL;
    const webhookUrl = convexUrl ? `${convexUrl}/klap-webhook` : undefined;
    const webhookSecret = process.env.MODAL_WEBHOOK_SECRET;

    try {
      // Call Modal endpoint to start Klap processing
      const response = await fetch(MODAL_KLAP_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: jobId,
          video_url: args.sourceVideoUrl,
          max_duration: 60, // Default max clip duration for onboarding
          max_clip_count: 5, // Fixed at 5 clips for onboarding
          language: "en",
          webhook_url: webhookUrl,
          webhook_secret: webhookSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Update job as failed
        await ctx.runMutation(internal.processing.markJobFailed, {
          jobId,
          error: `Modal Klap error: ${response.status} - ${errorText}`,
          errorStage: "download",
        });
        console.error(`[Onboarding Klap] Modal API error: ${response.status} - ${errorText}`);
        return { success: false, jobId, error: `Modal API error: ${response.status}` };
      }

      const result = await response.json();

      if (result.status === "error") {
        await ctx.runMutation(internal.processing.markJobFailed, {
          jobId,
          error: result.message || "Modal returned error",
          errorStage: "download",
        });
        return { success: false, jobId, error: result.message };
      }

      // Update job status - Modal is now processing
      await ctx.runMutation(internal.processing.updateJobStatus, {
        jobId,
        status: "PROCESSING",
        currentStep: "AI is analyzing your video (this may take 5-15 minutes)...",
        progress: 10,
      });

      // Store that we're using Modal for this job
      await ctx.runMutation(internal.klap.storeKlapMetadata, {
        jobId,
        modalStatus: "processing",
      });

      console.log(`[Onboarding Klap] Successfully triggered Klap processing for slug: ${args.slug}, jobId: ${jobId}`);
      return {
        success: true,
        jobId,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";

      await ctx.runMutation(internal.processing.markJobFailed, {
        jobId,
        error: `Video processing failed: ${errorMsg}`,
        errorStage: "download",
      });

      console.error(`[Onboarding Klap] Error submitting to Modal:`, error);
      return { success: false, jobId, error: errorMsg };
    }
  },
});

/**
 * Internal query to get user by token identifier
 */
export const getUserByTokenIdentifier = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", args.tokenIdentifier))
      .unique();
  },
});

/**
 * Internal query to get profile by slug
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
 * Internal mutation to create a processing job for onboarding Klap
 */
export const createOnboardingKlapJob = internalMutation({
  args: {
    userId: v.id("users"),
    actorProfileId: v.id("actor_profiles"),
    sourceUrl: v.string(),
    title: v.optional(v.string()), // YouTube video title from oEmbed
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const jobId = await ctx.db.insert("processing_jobs", {
      userId: args.userId,
      actorProfileId: args.actorProfileId,
      status: "DOWNLOADING",
      inputType: "youtube",
      sourceUrl: args.sourceUrl,
      title: args.title, // Store YouTube video title
      attemptCount: 0,
      clipCount: 5, // Fixed for onboarding
      layout: "standard",
      maxClipDuration: 60,
      aspectRatio: "9:16",
      createdAt: now,
      updatedAt: now,
    });

    return jobId;
  },
});
