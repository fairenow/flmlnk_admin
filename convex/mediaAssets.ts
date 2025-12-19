/**
 * Media Assets Management
 *
 * Handles creation, storage, and management of extracted media assets
 * for social media, thumbnails, and highlight images.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Helper to get owned profile by slug (matching filmmakers.ts pattern)
async function getOwnedProfileBySlug(ctx: any, slug: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  // First, look up the user by their auth identifier
  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q: any) => q.eq("authId", identity.tokenIdentifier))
    .unique();

  if (!user) return null;

  const profile = await ctx.db
    .query("actor_profiles")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .unique();

  if (!profile) return null;

  // Check ownership - compare profile.userId (Convex ID) with user._id (Convex ID)
  if (profile.userId !== user._id) return null;

  return { profile, identity, user };
}

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get all media assets for an actor profile
 */
export const getAssetsByProfile = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      return [];
    }

    const assets = await ctx.db
      .query("media_assets")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", owned.profile._id)
      )
      .order("desc")
      .collect();

    return assets;
  },
});

/**
 * Get assets by type (highlight, thumbnail, poster, social)
 */
export const getAssetsByType = query({
  args: {
    slug: v.string(),
    assetType: v.string(),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      return [];
    }

    const assets = await ctx.db
      .query("media_assets")
      .withIndex("by_profile_type", (q) =>
        q.eq("actorProfileId", owned.profile._id).eq("assetType", args.assetType)
      )
      .order("desc")
      .collect();

    return assets;
  },
});

/**
 * Get a single asset by ID
 */
export const getAsset = query({
  args: { assetId: v.id("media_assets") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.assetId);
  },
});

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Create a new media asset from an extracted frame
 */
export const createAsset = mutation({
  args: {
    slug: v.string(),
    storageId: v.id("_storage"),
    sourceType: v.string(), // "generated_clip", "youtube_clip", "youtube_video"
    sourceId: v.optional(v.string()),
    sourceTitle: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    timestamp: v.optional(v.number()),
    width: v.number(),
    height: v.number(),
    aspectRatio: v.string(),
    assetType: v.string(), // "highlight", "thumbnail", "poster", "social"
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("Unauthorized or profile not found");
    }

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      throw new Error("Failed to get storage URL");
    }

    const assetId = await ctx.db.insert("media_assets", {
      actorProfileId: owned.profile._id,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      sourceTitle: args.sourceTitle,
      title: args.title,
      description: args.description,
      timestamp: args.timestamp,
      storageId: args.storageId,
      url,
      width: args.width,
      height: args.height,
      aspectRatio: args.aspectRatio,
      assetType: args.assetType,
      tags: args.tags,
      createdAt: Date.now(),
    });

    return { assetId, url };
  },
});

/**
 * Create multiple assets in batch (for highlight extraction)
 */
export const createAssetsBatch = mutation({
  args: {
    slug: v.string(),
    assets: v.array(
      v.object({
        storageId: v.id("_storage"),
        sourceType: v.string(),
        sourceId: v.optional(v.string()),
        sourceTitle: v.optional(v.string()),
        title: v.optional(v.string()),
        timestamp: v.optional(v.number()),
        width: v.number(),
        height: v.number(),
        aspectRatio: v.string(),
        assetType: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("Unauthorized or profile not found");
    }

    const results: { assetId: Id<"media_assets">; url: string }[] = [];

    for (const asset of args.assets) {
      const url = await ctx.storage.getUrl(asset.storageId);
      if (!url) continue;

      const assetId = await ctx.db.insert("media_assets", {
        actorProfileId: owned.profile._id,
        sourceType: asset.sourceType,
        sourceId: asset.sourceId,
        sourceTitle: asset.sourceTitle,
        title: asset.title,
        timestamp: asset.timestamp,
        storageId: asset.storageId,
        url,
        width: asset.width,
        height: asset.height,
        aspectRatio: asset.aspectRatio,
        assetType: asset.assetType,
        createdAt: Date.now(),
      });

      results.push({ assetId, url });
    }

    return results;
  },
});

/**
 * Update an asset's metadata
 */
export const updateAsset = mutation({
  args: {
    slug: v.string(),
    assetId: v.id("media_assets"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    assetType: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("Unauthorized or profile not found");
    }

    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.actorProfileId !== owned.profile._id) {
      throw new Error("Asset not found or unauthorized");
    }

    const updates: Record<string, unknown> = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.tags !== undefined) updates.tags = args.tags;
    if (args.assetType !== undefined) updates.assetType = args.assetType;
    if (args.isPublic !== undefined) updates.isPublic = args.isPublic;

    await ctx.db.patch(args.assetId, updates);

    return { success: true };
  },
});

/**
 * Delete an asset and its storage
 */
export const deleteAsset = mutation({
  args: {
    slug: v.string(),
    assetId: v.id("media_assets"),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("Unauthorized or profile not found");
    }

    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.actorProfileId !== owned.profile._id) {
      throw new Error("Asset not found or unauthorized");
    }

    // Delete storage file
    try {
      await ctx.storage.delete(asset.storageId);
    } catch {
      // Ignore if already deleted
    }

    // Delete record
    await ctx.db.delete(args.assetId);

    return { success: true };
  },
});

/**
 * Delete multiple assets in batch
 */
export const deleteAssetsBatch = mutation({
  args: {
    slug: v.string(),
    assetIds: v.array(v.id("media_assets")),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("Unauthorized or profile not found");
    }

    let deleted = 0;

    for (const assetId of args.assetIds) {
      const asset = await ctx.db.get(assetId);
      if (!asset || asset.actorProfileId !== owned.profile._id) {
        continue;
      }

      // Delete storage file
      try {
        await ctx.storage.delete(asset.storageId);
      } catch {
        // Ignore if already deleted
      }

      // Delete record
      await ctx.db.delete(assetId);
      deleted++;
    }

    return { deleted };
  },
});
