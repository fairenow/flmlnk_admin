import { action, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Generate upload URL for any file (avatar, trailer, clip)
export const generateUploadUrl = action({
  args: {},
  handler: async (ctx) => {
    const url = await ctx.storage.generateUploadUrl();
    return { url };
  },
});

// Get the public URL for an uploaded file by storage ID
export const getFileUrl = action({
  args: { storageId: v.string() },
  handler: async (ctx, { storageId }) => {
    const url = await ctx.storage.getUrl(storageId);
    return { url };
  },
});

// Attach uploaded file to actor profile
export const attachAvatar = internalMutation({
  args: {
    profileId: v.id("actor_profiles"),
    storageId: v.string(),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.profileId, {
      avatarStorageId: args.storageId,
      avatarUrl: args.url,
    });
  },
});

// Attach file to a clip
// Note: The clips schema doesn't currently support fileStorageId/fileUrl fields
// This mutation is a placeholder for future schema updates
export const attachClip = internalMutation({
  args: {
    clipId: v.id("clips"),
    storageId: v.string(),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify clip exists
    const clip = await ctx.db.get(args.clipId);
    if (!clip) {
      throw new Error("Clip not found");
    }
    // File attachment not yet supported in schema - log for debugging
    console.log(`File attachment requested for clip ${args.clipId}: ${args.url}`);
  },
});
