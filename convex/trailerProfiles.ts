/**
 * Trailer profile management.
 * Built-in archetypes and custom profile support.
 */

import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// ============================================
// BUILT-IN PROFILE DEFINITIONS
// ============================================

type OutputVariant = {
  aspectRatio: string;
  resolution: string;
  codec?: string;
  maxBitrate?: number;
  loudnessNorm?: boolean;
  burnCaptions?: boolean;
};

type TextCardDefaults = {
  fontFamily?: string;
  primaryColor?: string;
  shadowColor?: string;
  defaultStyle?: string;
  defaultMotion?: string;
};

type PolishOptions = {
  filmGrain?: {
    enabled?: boolean;
    intensity?: number; // 0-100
  };
  letterbox?: {
    enabled?: boolean;
    aspectRatio?: string; // "2.39:1", "2.35:1", "1.85:1"
  };
  colorGrade?: {
    enabled?: boolean;
    preset?: string; // "cinematic", "thriller", "drama", "action"
    saturation?: number; // 0-2, 1 is normal
    contrast?: number; // 0-2, 1 is normal
    vignette?: number; // 0-1
  };
};

type ProfileDefinition = Omit<Doc<"trailer_profiles">, "_id" | "_creationTime">;

export const BUILT_IN_PROFILES: ProfileDefinition[] = [
  {
    key: "theatrical",
    label: "Theatrical",
    description: "Classic three-act trailer structure with escalating tension (2-2.5 min)",
    durationTargetSec: 135,
    durationMinSec: 120,
    durationMaxSec: 150,
    structure: ["cold_open", "premise", "stakes", "escalation", "montage", "button"],
    avgShotSecStart: 4.0,
    avgShotSecEnd: 1.2,
    dialogueWeight: 0.6,
    musicWeight: 0.5,
    actionWeight: 0.6,
    textCardDefaults: {
      fontFamily: "Bebas Neue",
      primaryColor: "#FFFFFF",
      shadowColor: "#000000",
      defaultStyle: "bold",
      defaultMotion: "fade_up",
    },
    polishOptions: {
      filmGrain: { enabled: true, intensity: 15 },
      letterbox: { enabled: true, aspectRatio: "2.39:1" },
      colorGrade: {
        enabled: true,
        preset: "cinematic",
        saturation: 0.9,
        contrast: 1.1,
        vignette: 0.25,
      },
    },
    outputVariants: [
      { aspectRatio: "16x9", resolution: "1080p", codec: "h264" },
      { aspectRatio: "16x9", resolution: "4k", codec: "h265" },
    ],
    isBuiltIn: true,
    sortOrder: 1,
    createdAt: Date.now(),
  },
  {
    key: "teaser",
    label: "Teaser",
    description: "Curiosity-driven hook with minimal plot reveal (15-60 sec)",
    durationTargetSec: 45,
    durationMinSec: 15,
    durationMaxSec: 60,
    structure: ["hook", "intrigue", "button"],
    avgShotSecStart: 2.5,
    avgShotSecEnd: 1.5,
    dialogueWeight: 0.4,
    musicWeight: 0.8,
    actionWeight: 0.5,
    textCardDefaults: {
      fontFamily: "Helvetica Neue",
      primaryColor: "#FFFFFF",
      shadowColor: "#000000",
      defaultStyle: "minimal",
      defaultMotion: "fade_up",
    },
    polishOptions: {
      filmGrain: { enabled: true, intensity: 10 },
      letterbox: { enabled: false },
      colorGrade: {
        enabled: true,
        preset: "cinematic",
        saturation: 0.95,
        contrast: 1.05,
        vignette: 0.15,
      },
    },
    outputVariants: [
      { aspectRatio: "16x9", resolution: "1080p", codec: "h264" },
      { aspectRatio: "9x16", resolution: "1080p", codec: "h264" },
    ],
    isBuiltIn: true,
    sortOrder: 2,
    createdAt: Date.now(),
  },
  {
    key: "festival",
    label: "Festival",
    description: "Atmospheric, mood-driven cut for festival submissions (60-90 sec)",
    durationTargetSec: 75,
    durationMinSec: 60,
    durationMaxSec: 90,
    structure: ["atmosphere", "premise", "character", "tension", "mystery"],
    avgShotSecStart: 4.5,
    avgShotSecEnd: 3.0,
    dialogueWeight: 0.7,
    musicWeight: 0.6,
    actionWeight: 0.3,
    textCardDefaults: {
      fontFamily: "Didot",
      primaryColor: "#FFFFFF",
      shadowColor: "#000000",
      defaultStyle: "elegant",
      defaultMotion: "fade_up",
    },
    polishOptions: {
      filmGrain: { enabled: true, intensity: 20 },
      letterbox: { enabled: true, aspectRatio: "2.39:1" },
      colorGrade: {
        enabled: true,
        preset: "drama",
        saturation: 0.85,
        contrast: 1.15,
        vignette: 0.35,
      },
    },
    outputVariants: [
      { aspectRatio: "16x9", resolution: "1080p", codec: "h264" },
    ],
    isBuiltIn: true,
    sortOrder: 3,
    createdAt: Date.now(),
  },
  {
    key: "social_vertical",
    label: "Social (Vertical)",
    description: "Mobile-optimized vertical cuts for TikTok/Reels/Shorts (6-60 sec)",
    durationTargetSec: 30,
    durationMinSec: 6,
    durationMaxSec: 60,
    structure: ["hook", "peak", "cta"],
    avgShotSecStart: 1.5,
    avgShotSecEnd: 0.8,
    dialogueWeight: 0.3,
    musicWeight: 0.9,
    actionWeight: 0.8,
    outputVariants: [
      {
        aspectRatio: "9x16",
        resolution: "1080p",
        codec: "h264",
        loudnessNorm: true,
        burnCaptions: true,
      },
      {
        aspectRatio: "1x1",
        resolution: "1080p",
        codec: "h264",
        loudnessNorm: true,
        burnCaptions: true,
      },
      {
        aspectRatio: "4x5",
        resolution: "1080p",
        codec: "h264",
        loudnessNorm: true,
      },
    ],
    isBuiltIn: true,
    sortOrder: 4,
    createdAt: Date.now(),
  },
  {
    key: "social_square",
    label: "Social (Square)",
    description: "Square format optimized for Instagram feed (15-60 sec)",
    durationTargetSec: 30,
    durationMinSec: 15,
    durationMaxSec: 60,
    structure: ["hook", "highlights", "cta"],
    avgShotSecStart: 2.0,
    avgShotSecEnd: 1.0,
    dialogueWeight: 0.4,
    musicWeight: 0.8,
    actionWeight: 0.7,
    outputVariants: [
      {
        aspectRatio: "1x1",
        resolution: "1080p",
        codec: "h264",
        loudnessNorm: true,
        burnCaptions: true,
      },
    ],
    isBuiltIn: true,
    sortOrder: 5,
    createdAt: Date.now(),
  },
  {
    key: "tv_spot_30",
    label: "TV Spot (30s)",
    description: "Broadcast-ready 30-second commercial spot",
    durationTargetSec: 30,
    durationMinSec: 29,
    durationMaxSec: 31,
    structure: ["hook", "premise", "button"],
    avgShotSecStart: 2.0,
    avgShotSecEnd: 1.0,
    dialogueWeight: 0.5,
    musicWeight: 0.7,
    actionWeight: 0.6,
    textCardDefaults: {
      fontFamily: "Bebas Neue",
      primaryColor: "#FFFFFF",
      shadowColor: "#000000",
      defaultStyle: "bold",
      defaultMotion: "cut",
    },
    polishOptions: {
      filmGrain: { enabled: false },
      letterbox: { enabled: false },
      colorGrade: {
        enabled: true,
        preset: "broadcast",
        saturation: 1.0,
        contrast: 1.0,
        vignette: 0,
      },
    },
    outputVariants: [
      { aspectRatio: "16x9", resolution: "1080p", codec: "h264", maxBitrate: 25000 },
    ],
    isBuiltIn: true,
    sortOrder: 6,
    createdAt: Date.now(),
  },
  {
    key: "tv_spot_60",
    label: "TV Spot (60s)",
    description: "Broadcast-ready 60-second commercial spot",
    durationTargetSec: 60,
    durationMinSec: 59,
    durationMaxSec: 61,
    structure: ["hook", "premise", "stakes", "button"],
    avgShotSecStart: 2.5,
    avgShotSecEnd: 1.2,
    dialogueWeight: 0.6,
    musicWeight: 0.6,
    actionWeight: 0.6,
    textCardDefaults: {
      fontFamily: "Bebas Neue",
      primaryColor: "#FFFFFF",
      shadowColor: "#000000",
      defaultStyle: "bold",
      defaultMotion: "cut",
    },
    polishOptions: {
      filmGrain: { enabled: false },
      letterbox: { enabled: false },
      colorGrade: {
        enabled: true,
        preset: "broadcast",
        saturation: 1.0,
        contrast: 1.0,
        vignette: 0,
      },
    },
    outputVariants: [
      { aspectRatio: "16x9", resolution: "1080p", codec: "h264", maxBitrate: 25000 },
    ],
    isBuiltIn: true,
    sortOrder: 7,
    createdAt: Date.now(),
  },
];

// ============================================
// QUERIES
// ============================================

/**
 * List all available profiles (built-in and custom)
 */
export const listProfiles = query({
  args: {
    includeBuiltIn: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let profiles = await ctx.db.query("trailer_profiles").collect();

    if (args.includeBuiltIn === false) {
      profiles = profiles.filter((p) => !p.isBuiltIn);
    }

    // Sort by sortOrder
    return profiles.sort((a, b) => (a.sortOrder || 100) - (b.sortOrder || 100));
  },
});

/**
 * Get a profile by key
 */
export const getProfileByKey = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("trailer_profiles")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
  },
});

/**
 * Get a profile by ID
 */
export const getProfile = query({
  args: { profileId: v.id("trailer_profiles") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.profileId);
  },
});

// ============================================
// INTERNAL QUERIES (for actions)
// ============================================

import { internalQuery } from "./_generated/server";

/**
 * Get profile by ID (internal, for actions)
 */
export const getProfileInternal = internalQuery({
  args: { profileId: v.id("trailer_profiles") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.profileId);
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Seed built-in profiles (idempotent - safe to call multiple times)
 */
export const seedBuiltInProfiles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const results = {
      created: [] as string[],
      skipped: [] as string[],
      updated: [] as string[],
    };

    for (const profile of BUILT_IN_PROFILES) {
      const existing = await ctx.db
        .query("trailer_profiles")
        .withIndex("by_key", (q) => q.eq("key", profile.key))
        .unique();

      if (existing) {
        // Update existing built-in profile
        if (existing.isBuiltIn) {
          await ctx.db.patch(existing._id, {
            ...profile,
            createdAt: existing.createdAt, // Preserve original creation time
          });
          results.updated.push(profile.key);
        } else {
          // Skip custom profiles with same key
          results.skipped.push(profile.key);
        }
      } else {
        // Create new profile
        await ctx.db.insert("trailer_profiles", profile);
        results.created.push(profile.key);
      }
    }

    return results;
  },
});

/**
 * Public mutation to ensure built-in profiles exist.
 * Call this from the frontend when the trailer modal opens to ensure profiles are available.
 * Idempotent - safe to call multiple times.
 */
export const ensureBuiltInProfiles = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if any profiles exist
    const existingCount = await ctx.db.query("trailer_profiles").collect();

    // If profiles already exist, we're done
    if (existingCount.length > 0) {
      return { seeded: false, count: existingCount.length };
    }

    // Seed the built-in profiles
    let created = 0;
    for (const profile of BUILT_IN_PROFILES) {
      const existing = await ctx.db
        .query("trailer_profiles")
        .withIndex("by_key", (q) => q.eq("key", profile.key))
        .unique();

      if (!existing) {
        await ctx.db.insert("trailer_profiles", profile);
        created++;
      }
    }

    return { seeded: true, count: created };
  },
});

/**
 * Create a custom profile (user mutation)
 */
export const createCustomProfile = mutation({
  args: {
    key: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    durationTargetSec: v.number(),
    durationMinSec: v.optional(v.number()),
    durationMaxSec: v.optional(v.number()),
    structure: v.optional(v.array(v.string())),
    avgShotSecStart: v.optional(v.number()),
    avgShotSecEnd: v.optional(v.number()),
    dialogueWeight: v.optional(v.number()),
    musicWeight: v.optional(v.number()),
    actionWeight: v.optional(v.number()),
    outputVariants: v.array(
      v.object({
        aspectRatio: v.string(),
        resolution: v.string(),
        codec: v.optional(v.string()),
        maxBitrate: v.optional(v.number()),
        loudnessNorm: v.optional(v.boolean()),
        burnCaptions: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Check for duplicate key
    const existing = await ctx.db
      .query("trailer_profiles")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (existing) {
      throw new Error(`Profile with key "${args.key}" already exists`);
    }

    // Validate weights are 0-1
    const weights = [args.dialogueWeight, args.musicWeight, args.actionWeight];
    for (const weight of weights) {
      if (weight !== undefined && (weight < 0 || weight > 1)) {
        throw new Error("Weights must be between 0 and 1");
      }
    }

    const profileId = await ctx.db.insert("trailer_profiles", {
      key: args.key,
      label: args.label,
      description: args.description,
      durationTargetSec: args.durationTargetSec,
      durationMinSec: args.durationMinSec,
      durationMaxSec: args.durationMaxSec,
      structure: args.structure,
      avgShotSecStart: args.avgShotSecStart,
      avgShotSecEnd: args.avgShotSecEnd,
      dialogueWeight: args.dialogueWeight,
      musicWeight: args.musicWeight,
      actionWeight: args.actionWeight,
      outputVariants: args.outputVariants,
      isBuiltIn: false,
      sortOrder: 100, // Custom profiles sort after built-in
      createdAt: Date.now(),
    });

    return profileId;
  },
});

/**
 * Delete a custom profile (cannot delete built-in)
 */
export const deleteProfile = mutation({
  args: { profileId: v.id("trailer_profiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);

    if (!profile) {
      throw new Error("Profile not found");
    }

    if (profile.isBuiltIn) {
      throw new Error("Cannot delete built-in profiles");
    }

    await ctx.db.delete(args.profileId);
    return { success: true };
  },
});

// ============================================
// PROFILE UTILITIES
// ============================================

/**
 * Get resolution dimensions from resolution string
 */
export function getResolutionDimensions(
  resolution: string,
  aspectRatio: string
): { width: number; height: number } {
  const baseHeights: Record<string, number> = {
    "720p": 720,
    "1080p": 1080,
    "4k": 2160,
  };

  const aspectRatios: Record<string, number> = {
    "16x9": 16 / 9,
    "9x16": 9 / 16,
    "1x1": 1,
    "4x5": 4 / 5,
  };

  const baseHeight = baseHeights[resolution] || 1080;
  const ratio = aspectRatios[aspectRatio] || 16 / 9;

  if (ratio >= 1) {
    // Landscape or square
    const width = Math.round(baseHeight * ratio);
    return { width, height: baseHeight };
  } else {
    // Portrait
    const width = baseHeight;
    const height = Math.round(width / ratio);
    return { width, height };
  }
}

/**
 * Generate variant key from output variant config
 */
export function getVariantKey(variant: OutputVariant): string {
  return `${variant.aspectRatio}_${variant.resolution}`;
}
