/**
 * Convex Storage Operations
 *
 * Handles file uploads directly to Convex storage.
 * Modal will request upload URLs, POST files directly, then notify Convex.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// =============================================================================
// PUBLIC MUTATIONS (used by HTTP endpoints)
// =============================================================================

/**
 * Generate an upload URL for Modal to upload a clip.
 * Modal will POST the file directly to this URL.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Get the public URL for a storage ID.
 */
export const getFileUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Save clip file after upload and update the clip record.
 */
export const saveClipFile = mutation({
  args: {
    clipId: v.id("generated_clips"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const url = await ctx.storage.getUrl(args.storageId);

    await ctx.db.patch(args.clipId, {
      storageId: args.storageId,
      downloadUrl: url ?? undefined,
      status: "completed",
    });

    return url;
  },
});

/**
 * Save thumbnail file after upload.
 */
export const saveThumbnailFile = mutation({
  args: {
    clipId: v.id("generated_clips"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const url = await ctx.storage.getUrl(args.storageId);

    await ctx.db.patch(args.clipId, {
      thumbnailStorageId: args.storageId,
      thumbnailUrl: url ?? undefined,
    });

    return url;
  },
});

/**
 * Save custom 9:16 thumbnail for generated clips.
 * This overrides the Modal-generated thumbnail.
 */
export const saveCustomThumbnail = mutation({
  args: {
    clipId: v.id("generated_clips"),
    storageId: v.id("_storage"),
    timestamp: v.optional(v.number()), // Optional timestamp in clip where thumbnail was extracted
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.clipId);
    if (!clip) {
      throw new Error("Clip not found");
    }

    // Delete old custom thumbnail if exists
    if (clip.customThumbnailStorageId) {
      try {
        await ctx.storage.delete(clip.customThumbnailStorageId);
      } catch {
        // Ignore if already deleted
      }
    }

    const url = await ctx.storage.getUrl(args.storageId);

    await ctx.db.patch(args.clipId, {
      customThumbnailStorageId: args.storageId,
      customThumbnailUrl: url ?? undefined,
      thumbnailTimestamp: args.timestamp,
    });

    return url;
  },
});

/**
 * Save custom 9:16 thumbnail for YouTube clips.
 * This overrides the YouTube default thumbnail.
 */
export const saveClipCustomThumbnail = mutation({
  args: {
    clipId: v.id("clips"),
    storageId: v.id("_storage"),
    timestamp: v.optional(v.number()), // Optional timestamp in video where thumbnail was extracted
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.clipId);
    if (!clip) {
      throw new Error("Clip not found");
    }

    // Delete old custom thumbnail if exists
    if (clip.customThumbnailStorageId) {
      try {
        await ctx.storage.delete(clip.customThumbnailStorageId);
      } catch {
        // Ignore if already deleted
      }
    }

    const url = await ctx.storage.getUrl(args.storageId);

    await ctx.db.patch(args.clipId, {
      customThumbnailStorageId: args.storageId,
      customThumbnailUrl: url ?? undefined,
      thumbnailTimestamp: args.timestamp,
    });

    return url;
  },
});

/**
 * Save custom 9:16 thumbnail for processing clips (uploaded video clips).
 * This allows users to select a custom thumbnail for R2-stored clips.
 */
export const saveProcessingClipCustomThumbnail = mutation({
  args: {
    clipId: v.id("processing_clips"),
    storageId: v.id("_storage"),
    timestamp: v.optional(v.number()), // Optional timestamp in video where thumbnail was extracted
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.clipId);
    if (!clip) {
      throw new Error("Processing clip not found");
    }

    // Delete old custom thumbnail if exists
    if (clip.customThumbnailStorageId) {
      try {
        await ctx.storage.delete(clip.customThumbnailStorageId);
      } catch {
        // Ignore if already deleted
      }
    }

    const url = await ctx.storage.getUrl(args.storageId);

    await ctx.db.patch(args.clipId, {
      customThumbnailStorageId: args.storageId,
      customThumbnailUrl: url ?? undefined,
      thumbnailTimestamp: args.timestamp,
    });

    return url;
  },
});

/**
 * Remove custom thumbnail from a processing clip.
 */
export const removeProcessingClipCustomThumbnail = mutation({
  args: {
    clipId: v.id("processing_clips"),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.clipId);
    if (!clip) {
      throw new Error("Processing clip not found");
    }

    // Delete storage file if exists
    if (clip.customThumbnailStorageId) {
      try {
        await ctx.storage.delete(clip.customThumbnailStorageId);
      } catch {
        // Ignore if already deleted
      }
    }

    await ctx.db.patch(args.clipId, {
      customThumbnailStorageId: undefined,
      customThumbnailUrl: undefined,
      thumbnailTimestamp: undefined,
    });
  },
});

/**
 * Remove custom thumbnail from a generated clip.
 */
export const removeCustomThumbnail = mutation({
  args: {
    clipId: v.id("generated_clips"),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.clipId);
    if (!clip) {
      throw new Error("Clip not found");
    }

    // Delete storage file if exists
    if (clip.customThumbnailStorageId) {
      try {
        await ctx.storage.delete(clip.customThumbnailStorageId);
      } catch {
        // Ignore if already deleted
      }
    }

    await ctx.db.patch(args.clipId, {
      customThumbnailStorageId: undefined,
      customThumbnailUrl: undefined,
      thumbnailTimestamp: undefined,
    });
  },
});

/**
 * Remove custom thumbnail from a YouTube clip.
 */
export const removeClipCustomThumbnail = mutation({
  args: {
    clipId: v.id("clips"),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.clipId);
    if (!clip) {
      throw new Error("Clip not found");
    }

    // Delete storage file if exists
    if (clip.customThumbnailStorageId) {
      try {
        await ctx.storage.delete(clip.customThumbnailStorageId);
      } catch {
        // Ignore if already deleted
      }
    }

    await ctx.db.patch(args.clipId, {
      customThumbnailStorageId: undefined,
      customThumbnailUrl: undefined,
      thumbnailTimestamp: undefined,
    });
  },
});

// =============================================================================
// INTERNAL MUTATIONS (used by webhooks)
// =============================================================================

/**
 * Create a pending clip record before upload.
 * Modal will call this first via HTTP endpoint, then upload the file.
 * Accepts externalJobId and looks up the job to get jobId and actorProfileId.
 */
export const createPendingClip = internalMutation({
  args: {
    externalJobId: v.string(),
    clip: v.object({
      externalClipId: v.string(),
      title: v.string(),
      description: v.string(),
      transcript: v.string(),
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
    // Look up the job by externalJobId
    const job = await ctx.db
      .query("clip_generation_jobs")
      .withIndex("by_externalJobId", (q) => q.eq("externalJobId", args.externalJobId))
      .first();

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
      status: "pending",
      createdAt: Date.now(),
    });

    return clipId;
  },
});

/**
 * Update clip with storage ID after upload completes.
 */
export const updateClipStorage = internalMutation({
  args: {
    clipId: v.id("generated_clips"),
    storageId: v.id("_storage"),
    thumbnailStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const url = await ctx.storage.getUrl(args.storageId);
    let thumbnailUrl: string | null = null;

    if (args.thumbnailStorageId) {
      thumbnailUrl = await ctx.storage.getUrl(args.thumbnailStorageId);
    }

    const updates: Record<string, unknown> = {
      storageId: args.storageId,
      downloadUrl: url,
      status: "completed",
    };

    if (args.thumbnailStorageId) {
      updates.thumbnailStorageId = args.thumbnailStorageId;
      updates.thumbnailUrl = thumbnailUrl;
    }

    await ctx.db.patch(args.clipId, updates);

    return { url, thumbnailUrl };
  },
});

/**
 * Mark clip upload as failed.
 */
export const markClipFailed = internalMutation({
  args: {
    clipId: v.id("generated_clips"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.clipId, {
      status: "failed",
    });
  },
});

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get clip with resolved URL.
 */
export const getClipWithUrl = query({
  args: { clipId: v.id("generated_clips") },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.clipId);
    if (!clip) return null;

    // If URL already exists, return it
    if (clip.downloadUrl) {
      return clip;
    }

    // Generate URL from storage ID if needed
    if (clip.storageId) {
      const url = await ctx.storage.getUrl(clip.storageId);
      return { ...clip, downloadUrl: url };
    }

    return clip;
  },
});

/**
 * Delete a clip and its storage.
 */
export const deleteClipWithStorage = mutation({
  args: { clipId: v.id("generated_clips") },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.clipId);
    if (!clip) return;

    // Delete storage files
    if (clip.storageId) {
      await ctx.storage.delete(clip.storageId);
    }
    if (clip.thumbnailStorageId) {
      await ctx.storage.delete(clip.thumbnailStorageId);
    }
    // Delete custom thumbnail if exists
    if (clip.customThumbnailStorageId) {
      await ctx.storage.delete(clip.customThumbnailStorageId);
    }

    // Delete clip record
    await ctx.db.delete(args.clipId);
  },
});
