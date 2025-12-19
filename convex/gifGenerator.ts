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
import { Doc, Id } from "./_generated/dataModel";

// =============================================================================
// CONFIGURATION
// =============================================================================

// Modal endpoints for GIF generation - set in Convex dashboard environment variables
// NOTE: GIF processing requires a dedicated Modal endpoint to be created.
// The endpoint should handle:
// 1. Video download/R2 retrieval
// 2. Transcription via AssemblyAI for moment detection
// 3. OpenAI analysis for viral/humor scoring
// 4. GIF encoding with FFmpeg (segment extraction, frame rate, palette optimization)
// 5. Text overlay rendering
// 6. Upload results to R2
//
// Until a dedicated endpoint is created, you can set these env vars:
// - MODAL_GIF_ENDPOINT_URL: Direct YouTube processing endpoint
// - MODAL_GIF_R2_ENDPOINT_URL: R2-based processing endpoint (for local uploads)
//
// Alternatively, reuse existing endpoints temporarily:
// - process_memes_r2_endpoint can be adapted for GIF generation
const MODAL_GIF_ENDPOINT_URL = process.env.MODAL_GIF_ENDPOINT_URL;
const MODAL_GIF_R2_ENDPOINT_URL = process.env.MODAL_GIF_R2_ENDPOINT_URL;
const MODAL_YOUTUBE_DOWNLOAD_ENDPOINT = process.env.MODAL_YOUTUBE_DOWNLOAD_ENDPOINT_URL
  || "https://fairenow--flmlnk-video-processor-download-youtube-r2-wit-d5d030.modal.run";
const MODAL_WEBHOOK_SECRET = process.env.MODAL_WEBHOOK_SECRET;

// Convex URL for webhooks - auto-detected or set via environment
const getConvexSiteUrl = (): string => {
  return process.env.CONVEX_SITE_URL || "https://flmlnk-convex-app.convex.site";
};

// OpenAI API for viral moment analysis
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// AssemblyAI for transcription and audio analysis
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

// =============================================================================
// GIF GENERATION CONSTRAINTS
// =============================================================================

export const GIF_CONSTRAINTS = {
  maxDurationSeconds: 8, // Maximum GIF duration
  minDurationSeconds: 1, // Minimum GIF duration
  defaultDurationSeconds: 4, // Default GIF duration
  maxWidthPx: 720, // Maximum input width
  defaultWidthPx: 480, // Default output width
  minWidthPx: 240, // Minimum output width
  defaultFrameRate: 12, // Default FPS (10-15 is optimal for GIFs)
  minFrameRate: 5,
  maxFrameRate: 20,
  maxFileSizeMb: 10, // Maximum GIF file size
  maxGifsPerJob: 10, // Maximum GIFs per generation job
  defaultGifCount: 5, // Default number of GIFs to generate
};

// =============================================================================
// OVERLAY STYLE PRESETS
// =============================================================================

export const OVERLAY_STYLES = {
  meme_top_bottom: {
    name: "Meme Classic",
    styleKey: "meme_top_bottom",
    description: "Classic meme style with Impact font and white text with black outline",
    fontFamily: "Impact",
    fontSize: 32,
    textColor: "#FFFFFF",
    strokeColor: "#000000",
    strokeWidth: 3,
    position: "top_bottom",
  },
  caption_bar: {
    name: "Caption Bar",
    styleKey: "caption_bar",
    description: "Modern caption bar at the bottom with semi-transparent background",
    fontFamily: "Arial Bold",
    fontSize: 24,
    textColor: "#FFFFFF",
    position: "bottom",
    hasBackground: true,
    backgroundColor: "#000000",
    backgroundOpacity: 0.7,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  subtitle: {
    name: "Subtitle",
    styleKey: "subtitle",
    description: "Clean subtitle style centered at the bottom",
    fontFamily: "Helvetica Neue",
    fontSize: 20,
    textColor: "#FFFFFF",
    strokeColor: "#000000",
    strokeWidth: 2,
    position: "bottom",
    paddingBottom: 30,
  },
  none: {
    name: "No Overlay",
    styleKey: "none",
    description: "No text overlay on the GIF",
    fontFamily: "Arial",
    fontSize: 0,
    textColor: "#FFFFFF",
    position: "none",
  },
};

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

// Generate unique job ID
function generateGifJobId(): string {
  return `gif_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get all overlay styles (active ones)
 */
export const getOverlayStyles = query({
  args: {},
  handler: async (ctx) => {
    const styles = await ctx.db
      .query("gif_overlay_styles")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .collect();

    // If no styles in DB, return default styles
    if (styles.length === 0) {
      return Object.values(OVERLAY_STYLES).map((s, idx) => ({
        ...s,
        sortOrder: idx,
        isActive: true,
        createdAt: Date.now(),
      }));
    }

    return styles;
  },
});

/**
 * Get GIF generation jobs for a profile
 */
export const getGifJobsByProfile = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) return [];

    return await ctx.db
      .query("gif_generation_jobs")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", owned.profile._id))
      .order("desc")
      .collect();
  },
});

/**
 * Get a specific GIF job
 */
export const getGifJob = query({
  args: { jobId: v.id("gif_generation_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

/**
 * Get generated GIFs for a job
 */
export const getGifsByJob = query({
  args: { jobId: v.id("gif_generation_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("generated_gifs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .order("desc")
      .collect();
  },
});

/**
 * Get all generated GIFs for a profile
 */
export const getGifsByProfile = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) return [];

    return await ctx.db
      .query("generated_gifs")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", owned.profile._id))
      .order("desc")
      .collect();
  },
});

/**
 * Get public GIFs for a profile (no auth required)
 */
export const getPublicGifs = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!profile) return [];

    const gifs = await ctx.db
      .query("generated_gifs")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
      .order("desc")
      .collect();

    return gifs.filter((g) => g.isPublic === true);
  },
});

/**
 * Get candidate moments for a job
 */
export const getCandidateMoments = query({
  args: { jobId: v.id("gif_generation_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gif_candidate_moments")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .order("desc")
      .collect();
  },
});

/**
 * Get a single generated GIF by ID (for detail page)
 */
export const getGeneratedGifById = query({
  args: { gifId: v.id("generated_gifs") },
  handler: async (ctx, args) => {
    const gif = await ctx.db.get(args.gifId);
    if (!gif) return null;

    // Get the job to include video title
    const job = await ctx.db.get(gif.jobId);

    return {
      ...gif,
      jobVideoTitle: job?.videoTitle,
      jobSourceUrl: job?.sourceVideoUrl,
    };
  },
});

/**
 * Get GIFs grouped by job for a profile (for history dropdown with pagination)
 */
export const getGifsGroupedByJob = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      return [];
    }

    // Get all GIF jobs for this profile, ordered by creation date descending
    const jobs = await ctx.db
      .query("gif_generation_jobs")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", owned.profile._id)
      )
      .order("desc")
      .collect();

    // Get GIFs for each job
    const jobsWithGifs = await Promise.all(
      jobs.map(async (job) => {
        const gifs = await ctx.db
          .query("generated_gifs")
          .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
          .order("desc")
          .collect();

        return {
          job: {
            _id: job._id,
            videoTitle: job.videoTitle || "Untitled Video",
            sourceVideoUrl: job.sourceVideoUrl,
            status: job.status,
            gifCount: job.gifCount,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
          },
          gifs,
          gifCount: gifs.length,
        };
      })
    );

    // Filter to only jobs that have GIFs
    return jobsWithGifs.filter((j) => j.gifCount > 0);
  },
});

// =============================================================================
// TYPE DEFINITIONS FOR SIGNED URL ACTIONS
// =============================================================================

// Type for a GIF with signed URLs - extends the base Doc with signed URL fields
type GifWithSignedUrls = Doc<"generated_gifs"> & {
  signedGifUrl: string | null;
  signedMp4Url: string | null;
  signedWebpUrl: string | null;
  urlExpiresAt: number | null;
};

// Return type for getGifsWithSignedUrls
type GetGifsWithSignedUrlsResult = {
  gifs: GifWithSignedUrls[];
  error: string | null;
};

// Type for job summary in grouped result
type GifJobSummary = {
  _id: Id<"gif_generation_jobs">;
  videoTitle: string;
  sourceVideoUrl: string;
  status: string;
  gifCount?: number;
  createdAt: number;
  completedAt?: number;
};

// Type for a job with its GIFs
type GifJobGroup = {
  job: GifJobSummary;
  gifs: GifWithSignedUrls[];
  gifCount: number;
};

// Return type for getGifsGroupedByJobWithSignedUrls
type GetGifsGroupedByJobResult = {
  jobsWithGifs: GifJobGroup[];
  error: string | null;
};

/**
 * Get GIFs with signed URLs for a profile.
 * Similar to getProcessingClipsWithSignedUrls in processing.ts.
 * Generates fresh signed URLs for GIF, MP4, and WebP files stored in R2.
 */
export const getGifsWithSignedUrls = action({
  args: {
    slug: v.string(),
    expiresIn: v.optional(v.number()), // Seconds, default 1 hour
  },
  handler: async (ctx, args): Promise<GetGifsWithSignedUrlsResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { gifs: [], error: "Not authenticated" };
    }

    // Get profile
    const profile: Doc<"actor_profiles"> | null = await ctx.runQuery(
      internal.gifGenerator.getProfileBySlugInternal,
      {
        slug: args.slug,
        tokenIdentifier: identity.tokenIdentifier,
      }
    );

    if (!profile) {
      return { gifs: [], error: "Profile not found or not authorized" };
    }

    // Get all GIFs for the profile
    const gifs: Doc<"generated_gifs">[] = await ctx.runQuery(
      internal.gifGenerator.getGifsByProfileInternal,
      {
        actorProfileId: profile._id,
      }
    );

    if (!gifs || gifs.length === 0) {
      return { gifs: [], error: null };
    }

    // Collect R2 keys for GIFs that have them
    const r2Keys: Array<{
      id: string;
      gifKey?: string;
      mp4Key?: string;
      webpKey?: string;
    }> = [];

    for (const gif of gifs) {
      if (gif.r2GifKey || gif.r2Mp4Key || gif.r2WebpKey) {
        r2Keys.push({
          id: gif._id,
          gifKey: gif.r2GifKey,
          mp4Key: gif.r2Mp4Key,
          webpKey: gif.r2WebpKey,
        });
      }
    }

    // If no R2 keys, return GIFs with existing URLs (legacy or Convex storage)
    if (r2Keys.length === 0) {
      return {
        gifs: gifs.map((gif: Doc<"generated_gifs">): GifWithSignedUrls => ({
          ...gif,
          signedGifUrl: gif.gifUrl || null,
          signedMp4Url: gif.mp4Url || null,
          signedWebpUrl: gif.webpUrl || null,
          urlExpiresAt: null,
        })),
        error: null,
      };
    }

    // Generate signed URLs for R2 files
    const signedUrls = await ctx.runAction(internal.r2.r2GetGifSignedUrlsInternal, {
      r2Keys,
      expiresIn: args.expiresIn || 3600,
    });

    // Create a map for quick lookup
    const urlMap = new Map<
      string,
      { gifUrl: string | null; mp4Url: string | null; webpUrl: string | null; expiresAt: number }
    >();
    for (const item of signedUrls) {
      urlMap.set(item.id, {
        gifUrl: item.gifUrl,
        mp4Url: item.mp4Url,
        webpUrl: item.webpUrl,
        expiresAt: item.expiresAt,
      });
    }

    // Merge GIFs with signed URLs
    const gifsWithUrls: GifWithSignedUrls[] = gifs.map(
      (gif: Doc<"generated_gifs">): GifWithSignedUrls => {
        const urls = urlMap.get(gif._id);
        return {
          ...gif,
          // Use signed URL if available, otherwise fall back to stored URL
          signedGifUrl: urls?.gifUrl || gif.gifUrl || null,
          signedMp4Url: urls?.mp4Url || gif.mp4Url || null,
          signedWebpUrl: urls?.webpUrl || gif.webpUrl || null,
          urlExpiresAt: urls?.expiresAt || null,
        };
      }
    );

    return { gifs: gifsWithUrls, error: null };
  },
});

// Type for internal grouped job data
type InternalJobData = {
  job: GifJobSummary;
  gifs: Doc<"generated_gifs">[];
  gifCount: number;
};

/**
 * Get GIFs grouped by job with signed URLs.
 * Returns jobs with their GIFs, where each GIF has fresh signed URLs.
 */
export const getGifsGroupedByJobWithSignedUrls = action({
  args: {
    slug: v.string(),
    expiresIn: v.optional(v.number()), // Seconds, default 1 hour
  },
  handler: async (ctx, args): Promise<GetGifsGroupedByJobResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { jobsWithGifs: [], error: "Not authenticated" };
    }

    // Get profile
    const profile: Doc<"actor_profiles"> | null = await ctx.runQuery(
      internal.gifGenerator.getProfileBySlugInternal,
      {
        slug: args.slug,
        tokenIdentifier: identity.tokenIdentifier,
      }
    );

    if (!profile) {
      return { jobsWithGifs: [], error: "Profile not found or not authorized" };
    }

    // Get all jobs and GIFs
    const jobsData: InternalJobData[] = await ctx.runQuery(
      internal.gifGenerator.getGifsGroupedByJobInternal,
      {
        actorProfileId: profile._id,
      }
    );

    if (!jobsData || jobsData.length === 0) {
      return { jobsWithGifs: [], error: null };
    }

    // Collect all R2 keys across all GIFs
    const r2Keys: Array<{
      id: string;
      gifKey?: string;
      mp4Key?: string;
      webpKey?: string;
    }> = [];

    for (const jobData of jobsData) {
      for (const gif of jobData.gifs) {
        if (gif.r2GifKey || gif.r2Mp4Key || gif.r2WebpKey) {
          r2Keys.push({
            id: gif._id,
            gifKey: gif.r2GifKey,
            mp4Key: gif.r2Mp4Key,
            webpKey: gif.r2WebpKey,
          });
        }
      }
    }

    // Generate signed URLs if there are R2 keys
    const urlMap = new Map<
      string,
      { gifUrl: string | null; mp4Url: string | null; webpUrl: string | null; expiresAt: number }
    >();

    if (r2Keys.length > 0) {
      const signedUrls = await ctx.runAction(internal.r2.r2GetGifSignedUrlsInternal, {
        r2Keys,
        expiresIn: args.expiresIn || 3600,
      });

      for (const item of signedUrls) {
        urlMap.set(item.id, {
          gifUrl: item.gifUrl,
          mp4Url: item.mp4Url,
          webpUrl: item.webpUrl,
          expiresAt: item.expiresAt,
        });
      }
    }

    // Merge jobs with signed URLs
    const jobsWithSignedUrls: GifJobGroup[] = jobsData.map(
      (jobData: InternalJobData): GifJobGroup => ({
        job: jobData.job,
        gifs: jobData.gifs.map(
          (gif: Doc<"generated_gifs">): GifWithSignedUrls => {
            const urls = urlMap.get(gif._id);
            return {
              ...gif,
              signedGifUrl: urls?.gifUrl || gif.gifUrl || null,
              signedMp4Url: urls?.mp4Url || gif.mp4Url || null,
              signedWebpUrl: urls?.webpUrl || gif.webpUrl || null,
              urlExpiresAt: urls?.expiresAt || null,
            };
          }
        ),
        gifCount: jobData.gifCount,
      })
    );

    return { jobsWithGifs: jobsWithSignedUrls, error: null };
  },
});

// =============================================================================
// INTERNAL QUERIES
// =============================================================================

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

export const getGifJobInternal = internalQuery({
  args: { jobId: v.id("gif_generation_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const getGifJobByExternalId = internalQuery({
  args: { externalJobId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gif_generation_jobs")
      .withIndex("by_externalJobId", (q) => q.eq("externalJobId", args.externalJobId))
      .unique();
  },
});

/**
 * Internal query to get GIFs by actor profile ID.
 * Used by getGifsWithSignedUrls action.
 */
export const getGifsByProfileInternal = internalQuery({
  args: { actorProfileId: v.id("actor_profiles") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("generated_gifs")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.actorProfileId))
      .order("desc")
      .collect();
  },
});

/**
 * Internal query to get GIFs grouped by job for an actor profile.
 * Used by getGifsGroupedByJobWithSignedUrls action.
 */
export const getGifsGroupedByJobInternal = internalQuery({
  args: { actorProfileId: v.id("actor_profiles") },
  handler: async (ctx, args) => {
    // Get all GIF jobs for this profile
    const jobs = await ctx.db
      .query("gif_generation_jobs")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.actorProfileId))
      .order("desc")
      .collect();

    // Get GIFs for each job
    const jobsWithGifs = await Promise.all(
      jobs.map(async (job) => {
        const gifs = await ctx.db
          .query("generated_gifs")
          .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
          .order("desc")
          .collect();

        return {
          job: {
            _id: job._id,
            videoTitle: job.videoTitle || "Untitled Video",
            sourceVideoUrl: job.sourceVideoUrl,
            status: job.status,
            gifCount: job.gifCount,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
          },
          gifs,
          gifCount: gifs.length,
        };
      })
    );

    // Filter to only jobs that have GIFs
    return jobsWithGifs.filter((j) => j.gifCount > 0);
  },
});

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Create a new GIF generation job
 */
export const createGifJobInternal = internalMutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    sourceVideoUrl: v.string(),
    inputType: v.optional(v.string()),
    gifCount: v.number(),
    maxDurationSeconds: v.optional(v.number()),
    targetWidth: v.optional(v.number()),
    frameRate: v.optional(v.number()),
    externalJobId: v.string(),
    sourceClipId: v.optional(v.id("generated_clips")),
    sourceProcessingClipId: v.optional(v.id("processing_clips")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("gif_generation_jobs", {
      actorProfileId: args.actorProfileId,
      sourceVideoUrl: args.sourceVideoUrl,
      inputType: args.inputType || "youtube",
      gifCount: args.gifCount,
      maxDurationSeconds: args.maxDurationSeconds || GIF_CONSTRAINTS.maxDurationSeconds,
      targetWidth: args.targetWidth || GIF_CONSTRAINTS.defaultWidthPx,
      frameRate: args.frameRate || GIF_CONSTRAINTS.defaultFrameRate,
      status: "pending",
      progress: 0,
      currentStep: "Initializing",
      externalJobId: args.externalJobId,
      sourceClipId: args.sourceClipId,
      sourceProcessingClipId: args.sourceProcessingClipId,
      createdAt: Date.now(),
    });
  },
});

/**
 * Update GIF job status
 */
export const updateGifJobStatus = internalMutation({
  args: {
    jobId: v.id("gif_generation_jobs"),
    status: v.string(),
    progress: v.optional(v.number()),
    currentStep: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    errorStage: v.optional(v.string()),
    videoTitle: v.optional(v.string()),
    videoDuration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {
      status: args.status,
    };

    if (args.progress !== undefined) updates.progress = args.progress;
    if (args.currentStep !== undefined) updates.currentStep = args.currentStep;
    if (args.errorMessage) updates.errorMessage = args.errorMessage;
    if (args.errorStage) updates.errorStage = args.errorStage;
    if (args.videoTitle) updates.videoTitle = args.videoTitle;
    if (args.videoDuration !== undefined) updates.videoDuration = args.videoDuration;

    if (args.status === "completed" || args.status === "failed") {
      updates.completedAt = Date.now();
    }

    await ctx.db.patch(args.jobId, updates);
  },
});

/**
 * Update GIF job progress by external ID
 */
export const updateGifJobProgress = internalMutation({
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
      .query("gif_generation_jobs")
      .withIndex("by_externalJobId", (q) => q.eq("externalJobId", args.externalJobId))
      .unique();

    if (!job) {
      throw new Error(`GIF job not found: ${args.externalJobId}`);
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

    if (args.status === "completed" || args.status === "failed") {
      updates.completedAt = Date.now();
    }

    await ctx.db.patch(job._id, updates);
  },
});

/**
 * Save a candidate moment
 */
export const saveCandidateMoment = internalMutation({
  args: {
    jobId: v.id("gif_generation_jobs"),
    actorProfileId: v.id("actor_profiles"),
    startTime: v.number(),
    endTime: v.number(),
    duration: v.number(),
    transcript: v.optional(v.string()),
    viralScore: v.number(),
    humorScore: v.optional(v.number()),
    emotionalIntensity: v.optional(v.number()),
    surpriseScore: v.optional(v.number()),
    ctaStrength: v.optional(v.number()),
    audioEnergy: v.optional(v.number()),
    sentimentValue: v.optional(v.number()),
    sentimentMagnitude: v.optional(v.number()),
    hasLaughter: v.optional(v.boolean()),
    speakerTurns: v.optional(v.number()),
    disfluencyCount: v.optional(v.number()),
    suggestedOverlayText: v.optional(v.string()),
    suggestedOverlayStyle: v.optional(v.string()),
    reasoning: v.optional(v.string()),
    r2ThumbnailKey: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("gif_candidate_moments", {
      jobId: args.jobId,
      actorProfileId: args.actorProfileId,
      startTime: args.startTime,
      endTime: args.endTime,
      duration: args.duration,
      transcript: args.transcript,
      viralScore: args.viralScore,
      humorScore: args.humorScore,
      emotionalIntensity: args.emotionalIntensity,
      surpriseScore: args.surpriseScore,
      ctaStrength: args.ctaStrength,
      audioEnergy: args.audioEnergy,
      sentimentValue: args.sentimentValue,
      sentimentMagnitude: args.sentimentMagnitude,
      hasLaughter: args.hasLaughter,
      speakerTurns: args.speakerTurns,
      disfluencyCount: args.disfluencyCount,
      suggestedOverlayText: args.suggestedOverlayText,
      suggestedOverlayStyle: args.suggestedOverlayStyle,
      reasoning: args.reasoning,
      r2ThumbnailKey: args.r2ThumbnailKey,
      thumbnailUrl: args.thumbnailUrl,
      createdAt: Date.now(),
    });
  },
});

/**
 * Save a generated GIF
 */
export const saveGeneratedGif = internalMutation({
  args: {
    jobId: v.id("gif_generation_jobs"),
    actorProfileId: v.id("actor_profiles"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    duration: v.number(),
    r2GifKey: v.optional(v.string()),
    gifUrl: v.optional(v.string()),
    r2Mp4Key: v.optional(v.string()),
    mp4Url: v.optional(v.string()),
    r2WebpKey: v.optional(v.string()),
    webpUrl: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    fileSize: v.optional(v.number()),
    frameRate: v.optional(v.number()),
    frameCount: v.optional(v.number()),
    overlayText: v.optional(v.string()),
    overlayStyle: v.optional(v.string()),
    overlayPosition: v.optional(v.string()),
    viralScore: v.optional(v.number()),
    humorScore: v.optional(v.number()),
    emotionalIntensity: v.optional(v.number()),
    suggestedHashtags: v.optional(v.array(v.string())),
    aiReasoning: v.optional(v.string()),
    transcript: v.optional(v.string()),
    hasAudioPeak: v.optional(v.boolean()),
    hasSentimentSpike: v.optional(v.boolean()),
    hasLaughter: v.optional(v.boolean()),
    hasKeywords: v.optional(v.array(v.string())),
    isSafe: v.optional(v.boolean()),
    safetyFlags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("generated_gifs", {
      jobId: args.jobId,
      actorProfileId: args.actorProfileId,
      title: args.title,
      description: args.description,
      startTime: args.startTime,
      endTime: args.endTime,
      duration: args.duration,
      r2GifKey: args.r2GifKey,
      gifUrl: args.gifUrl,
      r2Mp4Key: args.r2Mp4Key,
      mp4Url: args.mp4Url,
      r2WebpKey: args.r2WebpKey,
      webpUrl: args.webpUrl,
      width: args.width,
      height: args.height,
      fileSize: args.fileSize,
      frameRate: args.frameRate,
      frameCount: args.frameCount,
      overlayText: args.overlayText,
      overlayStyle: args.overlayStyle,
      overlayPosition: args.overlayPosition,
      viralScore: args.viralScore,
      humorScore: args.humorScore,
      emotionalIntensity: args.emotionalIntensity,
      suggestedHashtags: args.suggestedHashtags,
      aiReasoning: args.aiReasoning,
      transcript: args.transcript,
      hasAudioPeak: args.hasAudioPeak,
      hasSentimentSpike: args.hasSentimentSpike,
      hasLaughter: args.hasLaughter,
      hasKeywords: args.hasKeywords,
      isSafe: args.isSafe,
      safetyFlags: args.safetyFlags,
      createdAt: Date.now(),
    });
  },
});

/**
 * Toggle GIF visibility
 */
export const toggleGifVisibility = mutation({
  args: {
    slug: v.string(),
    gifId: v.id("generated_gifs"),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const gif = await ctx.db.get(args.gifId);
    if (!gif || gif.actorProfileId !== owned.profile._id) {
      throw new Error("GIF not found or not owned by user");
    }

    await ctx.db.patch(args.gifId, { isPublic: args.isPublic });
    return { ok: true };
  },
});

/**
 * Toggle GIF favorite
 */
export const toggleGifFavorite = mutation({
  args: {
    slug: v.string(),
    gifId: v.id("generated_gifs"),
    isFavorite: v.boolean(),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const gif = await ctx.db.get(args.gifId);
    if (!gif || gif.actorProfileId !== owned.profile._id) {
      throw new Error("GIF not found or not owned by user");
    }

    await ctx.db.patch(args.gifId, { isFavorite: args.isFavorite });
    return { ok: true };
  },
});

/**
 * Update GIF overlay text
 */
export const updateGifOverlay = mutation({
  args: {
    slug: v.string(),
    gifId: v.id("generated_gifs"),
    overlayText: v.optional(v.string()),
    overlayStyle: v.optional(v.string()),
    overlayPosition: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const gif = await ctx.db.get(args.gifId);
    if (!gif || gif.actorProfileId !== owned.profile._id) {
      throw new Error("GIF not found or not owned by user");
    }

    const updates: Record<string, unknown> = {};
    if (args.overlayText !== undefined) updates.overlayText = args.overlayText;
    if (args.overlayStyle !== undefined) updates.overlayStyle = args.overlayStyle;
    if (args.overlayPosition !== undefined) updates.overlayPosition = args.overlayPosition;

    await ctx.db.patch(args.gifId, updates);
    return { ok: true };
  },
});

/**
 * Delete a generated GIF
 */
export const deleteGif = mutation({
  args: {
    slug: v.string(),
    gifId: v.id("generated_gifs"),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const gif = await ctx.db.get(args.gifId);
    if (!gif || gif.actorProfileId !== owned.profile._id) {
      throw new Error("GIF not found or not owned by user");
    }

    // Delete storage files if they exist
    if (gif.storageId) {
      await ctx.storage.delete(gif.storageId);
    }

    await ctx.db.delete(args.gifId);
    return { ok: true };
  },
});

/**
 * Cancel a GIF job
 */
export const cancelGifJob = mutation({
  args: {
    slug: v.string(),
    jobId: v.id("gif_generation_jobs"),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const job = await ctx.db.get(args.jobId);
    if (!job || job.actorProfileId !== owned.profile._id) {
      throw new Error("Job not found or not owned by user");
    }

    if (job.status === "completed" || job.status === "failed") {
      return { success: true, message: "Job already finished" };
    }

    await ctx.db.patch(args.jobId, {
      status: "failed",
      errorMessage: "Cancelled by user",
      completedAt: Date.now(),
    });

    return { success: true, message: "Job cancelled" };
  },
});

/**
 * Complete GIF generation job (called by Modal webhook)
 */
export const completeGifJob = internalMutation({
  args: {
    externalJobId: v.string(),
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("gif_generation_jobs")
      .withIndex("by_externalJobId", (q) => q.eq("externalJobId", args.externalJobId))
      .unique();

    if (!job) {
      throw new Error(`GIF job not found: ${args.externalJobId}`);
    }

    await ctx.db.patch(job._id, {
      status: args.success ? "completed" : "failed",
      progress: args.success ? 100 : job.progress,
      currentStep: args.success ? "Complete!" : "Failed",
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
    });
  },
});

/**
 * Save a generated GIF from Modal webhook
 */
export const saveGeneratedGifFromModal = internalMutation({
  args: {
    externalJobId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    duration: v.number(),
    r2GifKey: v.optional(v.string()),
    gifUrl: v.optional(v.string()),
    r2Mp4Key: v.optional(v.string()),
    mp4Url: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    fileSize: v.optional(v.number()),
    frameRate: v.optional(v.number()),
    frameCount: v.optional(v.number()),
    overlayText: v.optional(v.string()),
    overlayStyle: v.optional(v.string()),
    overlayPosition: v.optional(v.string()),
    viralScore: v.optional(v.number()),
    humorScore: v.optional(v.number()),
    emotionalIntensity: v.optional(v.number()),
    suggestedHashtags: v.optional(v.array(v.string())),
    aiReasoning: v.optional(v.string()),
    transcript: v.optional(v.string()),
    hasAudioPeak: v.optional(v.boolean()),
    hasSentimentSpike: v.optional(v.boolean()),
    hasLaughter: v.optional(v.boolean()),
    hasKeywords: v.optional(v.array(v.string())),
    isSafe: v.optional(v.boolean()),
    safetyFlags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("gif_generation_jobs")
      .withIndex("by_externalJobId", (q) => q.eq("externalJobId", args.externalJobId))
      .unique();

    if (!job) {
      throw new Error(`GIF job not found: ${args.externalJobId}`);
    }

    return await ctx.db.insert("generated_gifs", {
      jobId: job._id,
      actorProfileId: job.actorProfileId,
      title: args.title,
      description: args.description,
      startTime: args.startTime,
      endTime: args.endTime,
      duration: args.duration,
      r2GifKey: args.r2GifKey,
      gifUrl: args.gifUrl,
      r2Mp4Key: args.r2Mp4Key,
      mp4Url: args.mp4Url,
      width: args.width,
      height: args.height,
      fileSize: args.fileSize,
      frameRate: args.frameRate,
      frameCount: args.frameCount,
      overlayText: args.overlayText,
      overlayStyle: args.overlayStyle,
      overlayPosition: args.overlayPosition,
      viralScore: args.viralScore,
      humorScore: args.humorScore,
      emotionalIntensity: args.emotionalIntensity,
      suggestedHashtags: args.suggestedHashtags,
      aiReasoning: args.aiReasoning,
      transcript: args.transcript,
      hasAudioPeak: args.hasAudioPeak,
      hasSentimentSpike: args.hasSentimentSpike,
      hasLaughter: args.hasLaughter,
      hasKeywords: args.hasKeywords,
      isSafe: args.isSafe,
      safetyFlags: args.safetyFlags,
      createdAt: Date.now(),
    });
  },
});

/**
 * Save a candidate moment from Modal webhook
 */
export const saveCandidateMomentFromModal = internalMutation({
  args: {
    externalJobId: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    duration: v.number(),
    transcript: v.optional(v.string()),
    viralScore: v.number(),
    humorScore: v.optional(v.number()),
    emotionalIntensity: v.optional(v.number()),
    surpriseScore: v.optional(v.number()),
    ctaStrength: v.optional(v.number()),
    audioEnergy: v.optional(v.number()),
    sentimentValue: v.optional(v.number()),
    sentimentMagnitude: v.optional(v.number()),
    hasLaughter: v.optional(v.boolean()),
    speakerTurns: v.optional(v.number()),
    disfluencyCount: v.optional(v.number()),
    suggestedOverlayText: v.optional(v.string()),
    suggestedOverlayStyle: v.optional(v.string()),
    reasoning: v.optional(v.string()),
    r2ThumbnailKey: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("gif_generation_jobs")
      .withIndex("by_externalJobId", (q) => q.eq("externalJobId", args.externalJobId))
      .unique();

    if (!job) {
      throw new Error(`GIF job not found: ${args.externalJobId}`);
    }

    return await ctx.db.insert("gif_candidate_moments", {
      jobId: job._id,
      actorProfileId: job.actorProfileId,
      startTime: args.startTime,
      endTime: args.endTime,
      duration: args.duration,
      transcript: args.transcript,
      viralScore: args.viralScore,
      humorScore: args.humorScore,
      emotionalIntensity: args.emotionalIntensity,
      surpriseScore: args.surpriseScore,
      ctaStrength: args.ctaStrength,
      audioEnergy: args.audioEnergy,
      sentimentValue: args.sentimentValue,
      sentimentMagnitude: args.sentimentMagnitude,
      hasLaughter: args.hasLaughter,
      speakerTurns: args.speakerTurns,
      disfluencyCount: args.disfluencyCount,
      suggestedOverlayText: args.suggestedOverlayText,
      suggestedOverlayStyle: args.suggestedOverlayStyle,
      reasoning: args.reasoning,
      r2ThumbnailKey: args.r2ThumbnailKey,
      thumbnailUrl: args.thumbnailUrl,
      createdAt: Date.now(),
    });
  },
});

// =============================================================================
// R2 UPLOAD MUTATIONS (For browser-first video upload)
// =============================================================================

/**
 * Create a new GIF generation job for local video upload.
 * Called when user initiates video upload for GIF generation.
 */
export const createGifUploadJob = action({
  args: {
    slug: v.string(),
    title: v.optional(v.string()),
    gifCount: v.optional(v.number()),
    maxDurationSeconds: v.optional(v.number()),
    targetWidth: v.optional(v.number()),
    frameRate: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    jobId: Id<"gif_generation_jobs">;
    externalJobId: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized: Not authenticated");

    const profile = await ctx.runQuery(
      internal.gifGenerator.getProfileBySlugInternal,
      { slug: args.slug, tokenIdentifier: identity.tokenIdentifier }
    );

    if (!profile) throw new Error("Profile not found or not owned by user");

    // Apply constraints
    const gifCount = Math.min(
      args.gifCount ?? GIF_CONSTRAINTS.defaultGifCount,
      GIF_CONSTRAINTS.maxGifsPerJob
    );
    const maxDurationSeconds = Math.min(
      args.maxDurationSeconds ?? GIF_CONSTRAINTS.maxDurationSeconds,
      GIF_CONSTRAINTS.maxDurationSeconds
    );
    const targetWidth = Math.min(
      Math.max(
        args.targetWidth ?? GIF_CONSTRAINTS.defaultWidthPx,
        GIF_CONSTRAINTS.minWidthPx
      ),
      GIF_CONSTRAINTS.maxWidthPx
    );
    const frameRate = Math.min(
      Math.max(
        args.frameRate ?? GIF_CONSTRAINTS.defaultFrameRate,
        GIF_CONSTRAINTS.minFrameRate
      ),
      GIF_CONSTRAINTS.maxFrameRate
    );

    const externalJobId = generateGifJobId();

    // Create the job record in "pending" state
    const jobId = await ctx.runMutation(
      internal.gifGenerator.createGifJobInternal,
      {
        actorProfileId: profile._id,
        sourceVideoUrl: args.title || "Local Upload", // Placeholder
        inputType: "local",
        gifCount,
        maxDurationSeconds,
        targetWidth,
        frameRate,
        externalJobId,
      }
    );

    return { jobId, externalJobId };
  },
});

/**
 * Save upload session after r2CreateMultipart action.
 * Transitions job from pending → uploading.
 */
export const saveGifUploadSession = mutation({
  args: {
    jobId: v.id("gif_generation_jobs"),
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
    if (!job) {
      throw new Error("Job not found");
    }

    // Verify ownership via profile
    const profile = await ctx.db.get(job.actorProfileId);
    if (!profile || profile.userId !== user._id) {
      throw new Error("Job not owned by user");
    }

    if (job.status !== "pending") {
      throw new Error(`Cannot start upload: job status is ${job.status}`);
    }

    const now = Date.now();

    // Create upload session
    const sessionId = await ctx.db.insert("gif_upload_sessions", {
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
      status: "uploading",
      currentStep: "Uploading video...",
      progress: 0,
    });

    return sessionId;
  },
});

/**
 * Report a successfully uploaded part.
 * Called after each part is uploaded to R2.
 */
export const reportGifUploadedPart = mutation({
  args: {
    sessionId: v.id("gif_upload_sessions"),
    partNumber: v.number(),
    etag: v.string(),
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
      return { alreadyReported: true };
    }

    // Append to completedParts
    const completedParts = [
      ...session.completedParts,
      { partNumber: args.partNumber, etag: args.etag },
    ];

    const bytesUploaded = session.bytesUploaded + args.partBytes;

    await ctx.db.patch(args.sessionId, {
      completedParts,
      bytesUploaded,
      updatedAt: Date.now(),
    });

    // Update job progress
    const job = await ctx.db.get(session.jobId);
    if (job) {
      const progress = Math.round((bytesUploaded / session.totalBytes) * 50); // 0-50% for upload
      await ctx.db.patch(session.jobId, {
        progress,
        currentStep: `Uploading... ${completedParts.length}/${session.totalParts} parts`,
      });
    }

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
export const getActiveGifUploadSession = query({
  args: { jobId: v.id("gif_generation_jobs") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("gif_upload_sessions")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();

    return sessions.find((s) => s.status === "ACTIVE") || null;
  },
});

/**
 * Mark upload as complete after r2CompleteMultipart action succeeds.
 * Transitions job from uploading → uploaded and triggers Modal processing.
 */
export const markGifUploadComplete = mutation({
  args: {
    sessionId: v.id("gif_upload_sessions"),
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
      status: "uploaded",
      r2SourceKey: args.r2Key,
      currentStep: "Video uploaded, starting GIF generation...",
      progress: 50,
    });

    // Trigger GIF R2 processing via scheduler
    await ctx.scheduler.runAfter(0, internal.gifGenerator.callGifR2Endpoint, {
      jobId: session.jobId,
    });

    return { success: true, jobId: session.jobId };
  },
});

/**
 * Abort an upload session (on user cancel or error).
 */
export const abortGifUploadSession = mutation({
  args: {
    sessionId: v.id("gif_upload_sessions"),
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
      status: "failed",
      errorMessage: args.error || "Upload aborted",
      errorStage: "upload",
      completedAt: now,
    });

    return { success: true };
  },
});

// =============================================================================
// ACTIONS (External API Calls)
// =============================================================================

/**
 * Submit a GIF generation job
 */
export const submitGifGenerationJob = action({
  args: {
    slug: v.string(),
    sourceVideoUrl: v.string(),
    inputType: v.optional(v.string()),
    gifCount: v.optional(v.number()),
    maxDurationSeconds: v.optional(v.number()),
    targetWidth: v.optional(v.number()),
    frameRate: v.optional(v.number()),
    sourceClipId: v.optional(v.id("generated_clips")),
    sourceProcessingClipId: v.optional(v.id("processing_clips")),
  },
  handler: async (ctx, args): Promise<{
    jobId: Id<"gif_generation_jobs">;
    status: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized: Not authenticated");

    const profile = await ctx.runQuery(
      internal.gifGenerator.getProfileBySlugInternal,
      { slug: args.slug, tokenIdentifier: identity.tokenIdentifier }
    );

    if (!profile) throw new Error("Profile not found or not owned by user");

    // Apply constraints
    const gifCount = Math.min(
      args.gifCount ?? GIF_CONSTRAINTS.defaultGifCount,
      GIF_CONSTRAINTS.maxGifsPerJob
    );
    const maxDurationSeconds = Math.min(
      args.maxDurationSeconds ?? GIF_CONSTRAINTS.maxDurationSeconds,
      GIF_CONSTRAINTS.maxDurationSeconds
    );
    const targetWidth = Math.min(
      Math.max(
        args.targetWidth ?? GIF_CONSTRAINTS.defaultWidthPx,
        GIF_CONSTRAINTS.minWidthPx
      ),
      GIF_CONSTRAINTS.maxWidthPx
    );
    const frameRate = Math.min(
      Math.max(
        args.frameRate ?? GIF_CONSTRAINTS.defaultFrameRate,
        GIF_CONSTRAINTS.minFrameRate
      ),
      GIF_CONSTRAINTS.maxFrameRate
    );

    const externalJobId = generateGifJobId();

    // Create the job record
    const jobId = await ctx.runMutation(
      internal.gifGenerator.createGifJobInternal,
      {
        actorProfileId: profile._id,
        sourceVideoUrl: args.sourceVideoUrl,
        inputType: args.inputType || "youtube",
        gifCount,
        maxDurationSeconds,
        targetWidth,
        frameRate,
        externalJobId,
        sourceClipId: args.sourceClipId,
        sourceProcessingClipId: args.sourceProcessingClipId,
      }
    );

    // Schedule the GIF generation process
    await ctx.scheduler.runAfter(0, internal.gifGenerator.processGifGeneration, {
      jobId,
      sourceVideoUrl: args.sourceVideoUrl,
      gifCount,
      maxDurationSeconds,
      targetWidth,
      frameRate,
      actorProfileId: profile._id,
    });

    return { jobId, status: "processing" };
  },
});

/**
 * Process GIF generation via Modal (internal action)
 *
 * This uses the R2 pipeline:
 * 1. Download YouTube video to R2 via download_youtube_r2_with_callback_endpoint
 * 2. When download completes, webhook triggers GIF R2 processing
 * 3. GIF R2 endpoint analyzes video and generates GIFs
 * 4. Results uploaded to R2 and saved via webhooks
 */
export const processGifGeneration = internalAction({
  args: {
    jobId: v.id("gif_generation_jobs"),
    sourceVideoUrl: v.string(),
    gifCount: v.number(),
    maxDurationSeconds: v.optional(v.number()),
    targetWidth: v.optional(v.number()),
    frameRate: v.optional(v.number()),
    actorProfileId: v.id("actor_profiles"),
  },
  handler: async (ctx, args) => {
    // Get the job to retrieve the externalJobId
    const job = await ctx.runQuery(internal.gifGenerator.getGifJobInternal, {
      jobId: args.jobId,
    });

    if (!job) {
      throw new Error("Job not found");
    }

    const convexWebhookUrl = getConvexSiteUrl();

    // Check if we have the required endpoint configured
    if (!MODAL_YOUTUBE_DOWNLOAD_ENDPOINT) {
      await ctx.runMutation(internal.gifGenerator.updateGifJobStatus, {
        jobId: args.jobId,
        status: "failed",
        errorMessage: "GIF generation endpoint not configured. Please set MODAL_YOUTUBE_DOWNLOAD_ENDPOINT_URL environment variable.",
      });
      return;
    }

    try {
      // Update status: Starting YouTube download
      await ctx.runMutation(internal.gifGenerator.updateGifJobStatus, {
        jobId: args.jobId,
        status: "downloading",
        progress: 0,
        currentStep: "Downloading video from YouTube...",
      });

      // Step 1: Download YouTube video to R2
      // The download endpoint will call back to /modal/gif-youtube-download-complete when done
      const response = await fetch(MODAL_YOUTUBE_DOWNLOAD_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(MODAL_WEBHOOK_SECRET ? { "Authorization": `Bearer ${MODAL_WEBHOOK_SECRET}` } : {}),
        },
        body: JSON.stringify({
          job_id: args.jobId,
          job_type: "gif", // Tells the endpoint this is a GIF job
          video_url: args.sourceVideoUrl,
          user_id: args.actorProfileId,
          // Callback webhook for when download completes
          callback_url: `${convexWebhookUrl}/modal/gif-youtube-download-complete`,
          webhook_secret: MODAL_WEBHOOK_SECRET,
          // GIF-specific config to pass through
          gif_count: args.gifCount,
          max_duration_seconds: args.maxDurationSeconds || GIF_CONSTRAINTS.maxDurationSeconds,
          target_width: args.targetWidth || GIF_CONSTRAINTS.defaultWidthPx,
          frame_rate: args.frameRate || GIF_CONSTRAINTS.defaultFrameRate,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Modal API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as { status: string; message?: string };

      // Update job status - download has started, webhook will update when complete
      await ctx.runMutation(internal.gifGenerator.updateGifJobStatus, {
        jobId: args.jobId,
        status: "downloading",
        progress: 5,
        currentStep: "Video download in progress...",
      });

      console.log(`GIF job ${args.jobId} YouTube download started: ${data.status}`);

    } catch (err) {
      console.error("Failed to start GIF generation:", err);
      await ctx.runMutation(internal.gifGenerator.updateGifJobStatus, {
        jobId: args.jobId,
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Failed to start YouTube download",
      });
    }
  },
});

/**
 * Mark YouTube download for GIF job as complete.
 * Called by webhook after video is uploaded to R2.
 */
export const markGifDownloadComplete = internalMutation({
  args: {
    jobId: v.id("gif_generation_jobs"),
    r2SourceKey: v.string(),
    videoTitle: v.optional(v.string()),
    videoDuration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error(`GIF job not found: ${args.jobId}`);
    }

    // Update job with R2 source key and mark as ready for processing
    await ctx.db.patch(args.jobId, {
      status: "uploaded",
      r2SourceKey: args.r2SourceKey,
      videoTitle: args.videoTitle || job.videoTitle,
      videoDuration: args.videoDuration,
      currentStep: "Video ready for GIF generation",
    });

    // Trigger R2-based GIF processing
    await ctx.scheduler.runAfter(0, internal.gifGenerator.callGifR2Endpoint, {
      jobId: args.jobId,
    });

    return { success: true };
  },
});

/**
 * Internal action to call Modal R2 GIF processing endpoint.
 * Called after YouTube video has been downloaded to R2.
 *
 * NOTE: This requires MODAL_GIF_R2_ENDPOINT_URL to be set in environment.
 * Until a dedicated GIF endpoint exists, this will fail gracefully.
 */
export const callGifR2Endpoint = internalAction({
  args: { jobId: v.id("gif_generation_jobs") },
  handler: async (ctx, args) => {
    const modalGifR2Endpoint = MODAL_GIF_R2_ENDPOINT_URL;
    const webhookSecret = MODAL_WEBHOOK_SECRET;
    const convexWebhookUrl = getConvexSiteUrl();

    // Get job details for the request
    const job = await ctx.runQuery(internal.gifGenerator.getGifJobInternal, {
      jobId: args.jobId,
    });

    if (!job) {
      console.error(`GIF job not found: ${args.jobId}`);
      return;
    }

    if (!modalGifR2Endpoint) {
      // No dedicated GIF R2 endpoint configured yet
      // For now, mark as needing manual configuration
      console.error("MODAL_GIF_R2_ENDPOINT_URL not configured - GIF processing endpoint needed");
      await ctx.runMutation(internal.gifGenerator.updateGifJobStatus, {
        jobId: args.jobId,
        status: "failed",
        errorMessage: "GIF processing endpoint not yet available. A dedicated Modal endpoint for GIF generation needs to be created.",
      });
      return;
    }

    try {
      // NOTE: Do NOT update status here - Modal will claim the job and set status to "analyzing"
      // The claimGifJob mutation only accepts statuses: pending, downloading, uploaded, UPLOADED
      // Setting status to "analyzing" here would cause the claim to fail

      const response = await fetch(modalGifR2Endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhookSecret ? { "Authorization": `Bearer ${webhookSecret}` } : {}),
        },
        body: JSON.stringify({
          job_id: args.jobId,
          r2_source_key: job.r2SourceKey,
          user_id: job.actorProfileId,
          gif_count: job.gifCount,
          max_duration_seconds: job.maxDurationSeconds || GIF_CONSTRAINTS.maxDurationSeconds,
          target_width: job.targetWidth || GIF_CONSTRAINTS.defaultWidthPx,
          frame_rate: job.frameRate || GIF_CONSTRAINTS.defaultFrameRate,
          webhook_url: convexWebhookUrl,
          webhook_secret: webhookSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Modal responded with ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`Modal R2 GIF response: ${JSON.stringify(result)}`);

    } catch (error) {
      console.error(`Failed to trigger Modal R2 GIF processing: ${error}`);
      await ctx.runMutation(internal.gifGenerator.updateGifJobStatus, {
        jobId: args.jobId,
        status: "failed",
        errorMessage: `Failed to trigger processing: ${error}`,
      });
    }
  },
});

// =============================================================================
// HTTP ACTIONS FOR R2-BASED GIF PROCESSING
// =============================================================================

// Type for claim GIF job result
type ClaimGifJobResult = {
  claimed: boolean;
  reason?: string;
  userId?: Id<"actor_profiles">;
  actorProfileId?: Id<"actor_profiles">;
  r2SourceKey?: string;
  gifCount?: number;
  maxDurationSeconds?: number;
  targetWidth?: number;
  frameRate?: number;
  videoTitle?: string;
};

// Type for complete GIF processing result
type CompleteGifProcessingResult = {
  success: boolean;
  reason?: string;
  gifCount?: number;
};

/**
 * HTTP action to claim a GIF job for R2 processing.
 */
export const httpClaimGifJob = action({
  args: {
    jobId: v.string(),
    lockId: v.string(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ClaimGifJobResult> => {
    // Verify webhook secret
    const expectedSecret = process.env.MODAL_WEBHOOK_SECRET;
    if (expectedSecret && args.webhookSecret !== expectedSecret) {
      return { claimed: false, reason: "Invalid webhook secret" };
    }

    try {
      const result = await ctx.runMutation(internal.gifGenerator.claimGifJobInternal, {
        jobId: args.jobId as Id<"gif_generation_jobs">,
        lockId: args.lockId,
      });
      return result;
    } catch (error) {
      return {
        claimed: false,
        reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Internal mutation to claim a GIF job for processing.
 */
export const claimGifJobInternal = internalMutation({
  args: {
    jobId: v.id("gif_generation_jobs"),
    lockId: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return { claimed: false, reason: "Job not found" };
    }

    // Check if job is in a valid state for claiming
    const validStatuses = ["pending", "downloading", "uploaded", "UPLOADED"];
    if (!validStatuses.includes(job.status)) {
      return { claimed: false, reason: `Invalid job status: ${job.status}` };
    }

    // Check if already claimed by another worker
    if (job.processingLockId && job.processingLockId !== args.lockId) {
      // Check if the lock has expired (30 minutes timeout)
      const lockTimeout = 30 * 60 * 1000;
      if (job.processingStartedAt && Date.now() - job.processingStartedAt < lockTimeout) {
        return { claimed: false, reason: "Job already claimed by another worker" };
      }
    }

    // Claim the job
    await ctx.db.patch(args.jobId, {
      status: "analyzing",
      processingLockId: args.lockId,
      processingStartedAt: Date.now(),
    });

    return {
      claimed: true,
      userId: job.actorProfileId,
      actorProfileId: job.actorProfileId,
      r2SourceKey: job.r2SourceKey,
      gifCount: job.gifCount,
      maxDurationSeconds: job.maxDurationSeconds,
      targetWidth: job.targetWidth,
      frameRate: job.frameRate,
      videoTitle: job.videoTitle,
    };
  },
});

/**
 * HTTP action to update GIF job progress.
 */
export const httpUpdateGifProgress = action({
  args: {
    jobId: v.string(),
    lockId: v.string(),
    progress: v.number(),
    status: v.string(),
    currentStep: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.MODAL_WEBHOOK_SECRET;
    if (expectedSecret && args.webhookSecret !== expectedSecret) {
      return { success: false, reason: "Invalid webhook secret" };
    }

    await ctx.runMutation(internal.gifGenerator.updateGifProgressInternal, {
      jobId: args.jobId as Id<"gif_generation_jobs">,
      lockId: args.lockId,
      progress: args.progress,
      status: args.status,
      currentStep: args.currentStep,
    });

    return { success: true };
  },
});

/**
 * Internal mutation to update GIF job progress.
 */
export const updateGifProgressInternal = internalMutation({
  args: {
    jobId: v.id("gif_generation_jobs"),
    lockId: v.string(),
    progress: v.number(),
    status: v.string(),
    currentStep: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Job not found");
    }

    // Verify lock ownership
    if (job.processingLockId && job.processingLockId !== args.lockId) {
      throw new Error("Lock mismatch");
    }

    await ctx.db.patch(args.jobId, {
      progress: args.progress,
      status: args.status,
      currentStep: args.currentStep,
    });
  },
});

/**
 * HTTP action to complete GIF processing.
 */
export const httpCompleteGifProcessing = action({
  args: {
    jobId: v.string(),
    lockId: v.string(),
    gifs: v.array(v.any()),
    candidateMoments: v.array(v.any()),
    // Use v.union to accept both string and null (Python sends null for None values)
    videoTitle: v.optional(v.union(v.string(), v.null())),
    videoDuration: v.optional(v.union(v.number(), v.null())),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CompleteGifProcessingResult> => {
    const expectedSecret = process.env.MODAL_WEBHOOK_SECRET;
    if (expectedSecret && args.webhookSecret !== expectedSecret) {
      return { success: false, reason: "Invalid webhook secret" };
    }

    try {
      const result = await ctx.runMutation(internal.gifGenerator.completeGifProcessingInternal, {
        jobId: args.jobId as Id<"gif_generation_jobs">,
        lockId: args.lockId,
        gifs: args.gifs,
        candidateMoments: args.candidateMoments,
        videoTitle: args.videoTitle,
        videoDuration: args.videoDuration,
      });
      return result;
    } catch (error) {
      return {
        success: false,
        reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Internal mutation to complete GIF processing and save GIFs.
 */
export const completeGifProcessingInternal = internalMutation({
  args: {
    jobId: v.id("gif_generation_jobs"),
    lockId: v.string(),
    gifs: v.array(v.any()),
    candidateMoments: v.array(v.any()),
    // Use v.union to accept both string/number and null (Python sends null for None values)
    videoTitle: v.optional(v.union(v.string(), v.null())),
    videoDuration: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return { success: false, reason: "Job not found" };
    }

    // Verify lock ownership
    if (job.processingLockId && job.processingLockId !== args.lockId) {
      return { success: false, reason: "Lock mismatch" };
    }

    const now = Date.now();

    // Save candidate moments
    for (const moment of args.candidateMoments) {
      await ctx.db.insert("gif_candidate_moments", {
        jobId: args.jobId,
        actorProfileId: job.actorProfileId,
        startTime: moment.startTime || moment.start_time || 0,
        endTime: moment.endTime || moment.end_time || 0,
        duration: moment.duration || 0,
        transcript: moment.transcript,
        viralScore: moment.viralScore || moment.viral_score || 0,
        humorScore: moment.humorScore || moment.humor_score,
        emotionalIntensity: moment.emotionalIntensity || moment.emotional_intensity,
        surpriseScore: moment.surpriseScore || moment.surprise_score,
        ctaStrength: moment.ctaStrength || moment.cta_strength,
        audioEnergy: moment.audioEnergy || moment.audio_energy,
        sentimentValue: moment.sentimentValue || moment.sentiment_value,
        sentimentMagnitude: moment.sentimentMagnitude || moment.sentiment_magnitude,
        hasLaughter: moment.hasLaughter || moment.has_laughter,
        speakerTurns: moment.speakerTurns || moment.speaker_turns,
        disfluencyCount: moment.disfluencyCount || moment.disfluency_count,
        suggestedOverlayText: moment.suggestedOverlayText || moment.suggested_overlay_text,
        suggestedOverlayStyle: moment.suggestedOverlayStyle || moment.suggested_overlay_style,
        reasoning: moment.reasoning,
        r2ThumbnailKey: moment.r2ThumbnailKey || moment.r2_thumbnail_key,
        thumbnailUrl: moment.thumbnailUrl || moment.thumbnail_url,
        createdAt: now,
      });
    }

    // Save generated GIFs
    for (const gif of args.gifs) {
      await ctx.db.insert("generated_gifs", {
        jobId: args.jobId,
        actorProfileId: job.actorProfileId,
        title: gif.title,
        description: gif.description,
        startTime: gif.startTime || gif.start_time || 0,
        endTime: gif.endTime || gif.end_time || 0,
        duration: gif.duration || 0,
        r2GifKey: gif.r2GifKey || gif.r2_gif_key,
        gifUrl: gif.gifUrl || gif.gif_url,
        r2Mp4Key: gif.r2Mp4Key || gif.r2_mp4_key,
        mp4Url: gif.mp4Url || gif.mp4_url,
        r2WebpKey: gif.r2WebpKey || gif.r2_webp_key,
        webpUrl: gif.webpUrl || gif.webp_url,
        width: gif.width,
        height: gif.height,
        fileSize: gif.fileSize || gif.file_size,
        frameRate: gif.frameRate || gif.frame_rate,
        frameCount: gif.frameCount || gif.frame_count,
        overlayText: gif.overlayText || gif.overlay_text,
        overlayStyle: gif.overlayStyle || gif.overlay_style,
        overlayPosition: gif.overlayPosition || gif.overlay_position,
        viralScore: gif.viralScore || gif.viral_score,
        humorScore: gif.humorScore || gif.humor_score,
        emotionalIntensity: gif.emotionalIntensity || gif.emotional_intensity,
        suggestedHashtags: gif.suggestedHashtags || gif.suggested_hashtags,
        aiReasoning: gif.aiReasoning || gif.ai_reasoning,
        transcript: gif.transcript,
        hasAudioPeak: gif.hasAudioPeak || gif.has_audio_peak,
        hasSentimentSpike: gif.hasSentimentSpike || gif.has_sentiment_spike,
        hasLaughter: gif.hasLaughter || gif.has_laughter,
        hasKeywords: gif.hasKeywords || gif.has_keywords,
        isSafe: gif.isSafe !== false && gif.is_safe !== false,
        safetyFlags: gif.safetyFlags || gif.safety_flags,
        createdAt: now,
      });
    }

    // Update job as completed
    await ctx.db.patch(args.jobId, {
      status: "completed",
      progress: 100,
      currentStep: "Complete!",
      videoTitle: args.videoTitle || job.videoTitle,
      videoDuration: args.videoDuration || job.videoDuration,
      completedAt: now,
      processingLockId: undefined,
    });

    return { success: true, gifCount: args.gifs.length };
  },
});

/**
 * HTTP action to fail GIF processing.
 */
export const httpFailGifProcessing = action({
  args: {
    jobId: v.string(),
    lockId: v.string(),
    error: v.string(),
    errorStage: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.MODAL_WEBHOOK_SECRET;
    if (expectedSecret && args.webhookSecret !== expectedSecret) {
      return { success: false, reason: "Invalid webhook secret" };
    }

    await ctx.runMutation(internal.gifGenerator.failGifProcessingInternal, {
      jobId: args.jobId as Id<"gif_generation_jobs">,
      lockId: args.lockId,
      error: args.error,
      errorStage: args.errorStage,
    });

    return { success: true };
  },
});

/**
 * Internal mutation to fail GIF processing.
 */
export const failGifProcessingInternal = internalMutation({
  args: {
    jobId: v.id("gif_generation_jobs"),
    lockId: v.string(),
    error: v.string(),
    errorStage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return;
    }

    await ctx.db.patch(args.jobId, {
      status: "failed",
      errorMessage: args.error,
      errorStage: args.errorStage,
      completedAt: Date.now(),
      processingLockId: undefined,
    });
  },
});

// =============================================================================
// SEED OVERLAY STYLES (Run once to populate database)
// =============================================================================

// Type for overlay style with all optional properties
type OverlayStyleConfig = {
  name: string;
  styleKey: string;
  description: string;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  position: string;
  strokeColor?: string;
  strokeWidth?: number;
  hasBackground?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
  paddingBottom?: number;
  paddingHorizontal?: number;
};

export const seedOverlayStyles = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Check if styles already exist
    const existing = await ctx.db.query("gif_overlay_styles").first();
    if (existing) {
      console.log("GIF overlay styles already exist, skipping seed");
      return { seeded: false };
    }

    // Insert all styles
    const styleKeys = Object.keys(OVERLAY_STYLES) as Array<keyof typeof OVERLAY_STYLES>;
    for (let i = 0; i < styleKeys.length; i++) {
      const key = styleKeys[i];
      const style = OVERLAY_STYLES[key] as OverlayStyleConfig;
      await ctx.db.insert("gif_overlay_styles", {
        name: style.name,
        styleKey: style.styleKey,
        description: style.description,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        textColor: style.textColor,
        strokeColor: style.strokeColor,
        strokeWidth: style.strokeWidth,
        position: style.position,
        hasBackground: style.hasBackground,
        backgroundColor: style.backgroundColor,
        backgroundOpacity: style.backgroundOpacity,
        paddingBottom: style.paddingBottom,
        paddingHorizontal: style.paddingHorizontal,
        sortOrder: i,
        isActive: true,
        createdAt: Date.now(),
      });
    }

    console.log(`Seeded ${styleKeys.length} GIF overlay styles`);
    return { seeded: true, count: styleKeys.length };
  },
});
