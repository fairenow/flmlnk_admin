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

// Modal endpoint for meme generation - set in Convex dashboard environment variables
const MODAL_MEME_ENDPOINT = process.env.MODAL_MEME_ENDPOINT || "https://flmlnk--video-processor-process-memes-endpoint.modal.run";
const MODAL_WEBHOOK_SECRET = process.env.MODAL_WEBHOOK_SECRET;

// Convex URL for webhooks - auto-detected or set via environment
const getConvexSiteUrl = (): string => {
  return process.env.CONVEX_SITE_URL || "https://flmlnk-convex-app.convex.site";
};

// OpenAI API for vision analysis and caption generation (used for direct analysis if Modal unavailable)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// AssemblyAI for transcription (to get context from video)
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

// =============================================================================
// MEME TEMPLATE DEFINITIONS
// =============================================================================

export const MEME_TEMPLATES = {
  reaction: {
    name: "Reaction Meme",
    templateType: "reaction",
    description: "Strong facial expression or body language reactions to relatable situations",
    requirements: {
      emotions: ["happy", "shocked", "stressed", "anxious", "joy", "petty", "disgusted", "confused", "terrified", "smug"],
      needsExpression: true,
      frameCount: 1,
    },
    captionPatterns: [
      "Me when…",
      "My face when…",
      "How I look when…",
      "POV: you just…",
      "Nobody: / Me:",
    ],
    useCases: ["Map moments to common emotional states like stress, anxiety, joy, petty behavior"],
  },
  before_after: {
    name: "Expectation vs Reality / Before vs After",
    templateType: "before_after",
    description: "Two or more distinct frames showing change (happy → shocked, clean → messy)",
    requirements: {
      needsMultipleFrames: true,
      frameCount: 2,
    },
    captionPatterns: [
      "How it started / How it's going",
      "My plans / The group chat",
      "What I ordered / What I got",
      "Expectation / Reality",
      "Before coffee / After coffee",
    ],
    useCases: ["Trailer scenes where tone flips or something goes sideways"],
  },
  internal_external: {
    name: "Internal vs External / Brain vs Me",
    templateType: "internal_external",
    description: "Frame representing internal dialogue (organs, face close-up, stressed character)",
    requirements: {
      emotions: ["stressed", "conflicted", "tempted", "exhausted"],
      needsExpression: true,
      frameCount: 1,
    },
    captionPatterns: [
      "My brain when…",
      "My liver watching me order another…",
      "My last brain cell…",
      "My body: we need sleep / Me at 3am:",
      "My anxiety vs my need to be liked",
    ],
    useCases: ["Lines about bad choices, addictions, sacrifices, unhealthy habits"],
  },
  absurd_visual: {
    name: "Absurd Visual + Relatable Caption",
    templateType: "absurd_visual",
    description: "Any strange frame: odd angle, freeze-frame face, weird action",
    requirements: {
      frameCount: 1,
    },
    captionPatterns: [
      "Day X of…",
      "Me trying to…",
      "When you accidentally…",
      "That one friend who…",
      "Me pretending to…",
    ],
    useCases: ["Stylized or chaotic shots in trailers"],
  },
  character_voice: {
    name: "Character Voice Meme",
    templateType: "character_voice",
    description: "Recognizable character, outfit, or vibe from your film",
    requirements: {
      needsExpression: true,
      frameCount: 1,
    },
    captionPatterns: [
      "[Character name] energy",
      "POV: [Character name] is your…",
      "When [Character name] said '…' I felt that",
      "[Character] would never…",
    ],
    useCases: ["Build iconic, reusable memes around your film's characters"],
  },
  fake_tutorial: {
    name: "Fake Tutorial / Presentation Meme",
    templateType: "fake_tutorial",
    description: "Shot of someone explaining, pointing, teaching, or text-on-screen moment",
    requirements: {
      actions: ["explaining", "pointing", "teaching", "presenting"],
      frameCount: 1,
    },
    captionPatterns: [
      "How to [do something you absolutely should not do]",
      "Step 1: [terrible advice]",
      "A guide to ruining your…",
      "Me explaining why…",
      "[Job title] trying to explain…",
    ],
    useCases: ["Use lecture / planning / briefing scenes"],
  },
  forbidden: {
    name: "Forbidden / Don't Touch Meme",
    templateType: "forbidden",
    description: "A character clearly about to do something they shouldn't",
    requirements: {
      actions: ["reaching", "sneaking", "tempted", "disobedient"],
      frameCount: 1,
    },
    captionPatterns: [
      "They told me not to X / Me: …",
      "The forbidden [object]",
      "Me: I won't / Also me:",
      "What I'm not supposed to do: / Me:",
      "POV: you're about to make a terrible decision",
    ],
    useCases: ["Any disobedience / temptation / heist scene"],
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
function generateMemeJobId(): string {
  return `meme_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// =============================================================================
// OPENAI VISION ANALYSIS
// =============================================================================

interface FrameAnalysis {
  emotion: string;
  emotionConfidence: number;
  action: string;
  actionConfidence: number;
  hasFaces: boolean;
  faceCount: number;
  sceneDescription: string;
  potentialTemplates: string[];
  memeability: number;
}

interface MemeCaption {
  caption: string;
  captionPosition: "top" | "bottom" | "top_bottom";
  viralScore: number;
  sentiment: string;
  suggestedHashtags: string[];
  reasoning: string;
}

/**
 * Analyze a video frame using OpenAI Vision to detect emotions, actions, and meme potential
 */
async function analyzeFrameWithVision(
  imageUrl: string,
  movieContext?: { title?: string; logline?: string; genre?: string }
): Promise<FrameAnalysis> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const contextPrompt = movieContext
    ? `\n\nContext: This frame is from "${movieContext.title || "a film"}". ${movieContext.logline || ""} Genre: ${movieContext.genre || "Unknown"}`
    : "";

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a meme expert analyzing video frames for meme potential. Analyze the image and return a JSON object with:
- emotion: The primary emotion displayed (happy, shocked, stressed, anxious, terrified, smug, disgusted, confused, angry, sad, excited, bored, etc.)
- emotionConfidence: 0-1 confidence score
- action: What action is happening (arguing, sneaking, falling, running, explaining, pointing, reaching, eating, sleeping, etc.)
- actionConfidence: 0-1 confidence score
- hasFaces: boolean - are there visible faces?
- faceCount: number of faces visible
- sceneDescription: Brief description of what's happening in the scene
- potentialTemplates: Array of template types this frame could work with: ["reaction", "before_after", "internal_external", "absurd_visual", "character_voice", "fake_tutorial", "forbidden"]
- memeability: 0-100 score of how good this frame would be for memes (consider expression clarity, composition, relatability)

Return ONLY valid JSON, no markdown.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this frame for meme potential.${contextPrompt}`,
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  try {
    // Clean up the response in case it has markdown code blocks
    const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleanedContent) as FrameAnalysis;
  } catch {
    console.error("Failed to parse frame analysis:", content);
    // Return default analysis on parse failure
    return {
      emotion: "neutral",
      emotionConfidence: 0.5,
      action: "unknown",
      actionConfidence: 0.5,
      hasFaces: false,
      faceCount: 0,
      sceneDescription: "Unable to analyze frame",
      potentialTemplates: ["absurd_visual"],
      memeability: 30,
    };
  }
}

/**
 * Generate a meme caption for a frame using the selected template
 */
async function generateMemeCaption(
  imageUrl: string,
  templateType: string,
  frameAnalysis: FrameAnalysis,
  movieContext?: { title?: string; logline?: string; genre?: string },
  transcript?: string
): Promise<MemeCaption> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const template = MEME_TEMPLATES[templateType as keyof typeof MEME_TEMPLATES];
  if (!template) {
    throw new Error(`Unknown template type: ${templateType}`);
  }

  const contextPrompt = movieContext
    ? `\n\nMovie Context:\n- Title: ${movieContext.title || "Unknown"}\n- Logline: ${movieContext.logline || "Not provided"}\n- Genre: ${movieContext.genre || "Unknown"}`
    : "";

  const transcriptPrompt = transcript
    ? `\n\nRelevant dialogue/transcript:\n${transcript.substring(0, 500)}`
    : "";

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a viral meme caption generator. Create captions that are:
- Highly relatable to internet users
- Funny without being offensive
- Using current meme language and formats
- Perfect for social media sharing

Template: ${template.name}
Description: ${template.description}
Caption Patterns to follow: ${template.captionPatterns.join(", ")}
Use Cases: ${template.useCases?.join(", ") || "General meme content"}

Frame Analysis:
- Detected Emotion: ${frameAnalysis.emotion} (${Math.round(frameAnalysis.emotionConfidence * 100)}% confidence)
- Detected Action: ${frameAnalysis.action} (${Math.round(frameAnalysis.actionConfidence * 100)}% confidence)
- Scene: ${frameAnalysis.sceneDescription}
- Faces: ${frameAnalysis.faceCount} detected

Return a JSON object with:
- caption: The meme caption text (can include line breaks with \\n for multi-part memes)
- captionPosition: "top", "bottom", or "top_bottom" for where text should go
- viralScore: 0-100 predicted virality score
- sentiment: "funny", "relatable", "absurd", "wholesome", "sarcastic", etc.
- suggestedHashtags: Array of 3-5 relevant hashtags (without #)
- reasoning: Brief explanation of why this caption works

Return ONLY valid JSON, no markdown.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Generate a viral meme caption for this frame.${contextPrompt}${transcriptPrompt}`,
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 400,
      temperature: 0.8, // Higher temperature for more creative captions
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  try {
    const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleanedContent) as MemeCaption;
  } catch {
    console.error("Failed to parse meme caption:", content);
    return {
      caption: "When the meme generator fails...",
      captionPosition: "top",
      viralScore: 50,
      sentiment: "relatable",
      suggestedHashtags: ["memes", "relatable", "mood"],
      reasoning: "Fallback caption due to parsing error",
    };
  }
}

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get all meme templates (active ones)
 */
export const getMemeTemplates = query({
  args: {},
  handler: async (ctx) => {
    const templates = await ctx.db
      .query("meme_templates")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .collect();

    // If no templates in DB, return default templates
    if (templates.length === 0) {
      return Object.values(MEME_TEMPLATES).map((t, idx) => ({
        ...t,
        sortOrder: idx,
        isActive: true,
        createdAt: Date.now(),
      }));
    }

    return templates;
  },
});

/**
 * Get meme generation jobs for a profile
 */
export const getMemeJobsByProfile = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) return [];

    return await ctx.db
      .query("meme_generation_jobs")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", owned.profile._id))
      .order("desc")
      .collect();
  },
});

/**
 * Get a specific meme job
 */
export const getMemeJob = query({
  args: { jobId: v.id("meme_generation_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

/**
 * Get generated memes for a job
 */
export const getMemesByJob = query({
  args: { jobId: v.id("meme_generation_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("generated_memes")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .order("desc")
      .collect();
  },
});

/**
 * Get all generated memes for a profile
 */
export const getMemesByProfile = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) return [];

    return await ctx.db
      .query("generated_memes")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", owned.profile._id))
      .order("desc")
      .collect();
  },
});

/**
 * Get public memes for a profile (no auth required)
 */
export const getPublicMemes = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!profile) return [];

    const memes = await ctx.db
      .query("generated_memes")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
      .order("desc")
      .collect();

    return memes.filter((m) => m.isPublic === true);
  },
});

/**
 * Get candidate frames for a job
 */
export const getCandidateFrames = query({
  args: { jobId: v.id("meme_generation_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("meme_candidate_frames")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .order("desc")
      .collect();
  },
});

/**
 * Get a single generated meme by ID (for detail page)
 */
export const getGeneratedMemeById = query({
  args: { memeId: v.id("generated_memes") },
  handler: async (ctx, args) => {
    const meme = await ctx.db.get(args.memeId);
    if (!meme) return null;

    // Get the job to include video title
    const job = await ctx.db.get(meme.jobId);

    return {
      ...meme,
      jobVideoTitle: job?.videoTitle,
      jobSourceUrl: job?.sourceVideoUrl,
    };
  },
});

/**
 * Get memes grouped by job for a profile (for history dropdown with pagination)
 */
export const getMemesGroupedByJob = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      return [];
    }

    // Get all meme jobs for this profile, ordered by creation date descending
    const jobs = await ctx.db
      .query("meme_generation_jobs")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", owned.profile._id)
      )
      .order("desc")
      .collect();

    // Get memes for each job
    const jobsWithMemes = await Promise.all(
      jobs.map(async (job) => {
        const memes = await ctx.db
          .query("generated_memes")
          .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
          .order("desc")
          .collect();

        return {
          job: {
            _id: job._id,
            videoTitle: job.videoTitle || "Untitled Video",
            sourceVideoUrl: job.sourceVideoUrl,
            status: job.status,
            memeCount: job.memeCount,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
          },
          memes,
          memeCount: memes.length,
        };
      })
    );

    // Filter to only jobs that have memes
    return jobsWithMemes.filter((j) => j.memeCount > 0);
  },
});

// =============================================================================
// TYPE DEFINITIONS FOR SIGNED URL ACTIONS
// =============================================================================

// Type for a meme with signed URLs
type MemeWithSignedUrls = Doc<"generated_memes"> & {
  signedMemeUrl: string | null;
  signedFrameUrl: string | null;
  urlExpiresAt: number | null;
};

// Return type for getMemesWithSignedUrls
type GetMemesWithSignedUrlsResult = {
  memes: MemeWithSignedUrls[];
  error: string | null;
};

/**
 * Get memes with signed URLs for a profile.
 * Generates fresh signed URLs for meme and frame images stored in R2.
 */
export const getMemesWithSignedUrls = action({
  args: {
    slug: v.string(),
    expiresIn: v.optional(v.number()), // Seconds, default 1 hour
  },
  handler: async (ctx, args): Promise<GetMemesWithSignedUrlsResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { memes: [], error: "Not authenticated" };
    }

    // Get profile
    const profile: Doc<"actor_profiles"> | null = await ctx.runQuery(
      internal.memeGenerator.getProfileBySlugInternal,
      {
        slug: args.slug,
        tokenIdentifier: identity.tokenIdentifier,
      }
    );

    if (!profile) {
      return { memes: [], error: "Profile not found or not authorized" };
    }

    // Get all memes for the profile
    const memes: Doc<"generated_memes">[] = await ctx.runQuery(
      internal.memeGenerator.getMemesByProfileInternal,
      {
        actorProfileId: profile._id,
      }
    );

    if (!memes || memes.length === 0) {
      return { memes: [], error: null };
    }

    // Collect R2 keys for memes that have them
    const r2Keys: Array<{
      id: string;
      memeKey?: string;
      frameKey?: string;
    }> = [];

    for (const meme of memes) {
      if (meme.r2MemeKey || meme.r2FrameKey) {
        r2Keys.push({
          id: meme._id,
          memeKey: meme.r2MemeKey,
          frameKey: meme.r2FrameKey,
        });
      }
    }

    // If no R2 keys, return memes with existing URLs (legacy Convex storage)
    if (r2Keys.length === 0) {
      return {
        memes: memes.map((meme: Doc<"generated_memes">): MemeWithSignedUrls => ({
          ...meme,
          signedMemeUrl: meme.memeUrl || meme.frameUrl || null,
          signedFrameUrl: meme.frameUrl || meme.frames?.[0]?.url || null,
          urlExpiresAt: null,
        })),
        error: null,
      };
    }

    // Generate signed URLs for R2 files
    const signedUrls = await ctx.runAction(internal.r2.r2GetMemeSignedUrlsInternal, {
      r2Keys,
      expiresIn: args.expiresIn || 3600,
    });

    // Create a map for quick lookup
    const urlMap = new Map<
      string,
      { memeUrl: string | null; frameUrl: string | null; expiresAt: number }
    >();
    for (const item of signedUrls) {
      urlMap.set(item.id, {
        memeUrl: item.memeUrl,
        frameUrl: item.frameUrl,
        expiresAt: item.expiresAt,
      });
    }

    // Merge memes with signed URLs
    const memesWithUrls: MemeWithSignedUrls[] = memes.map(
      (meme: Doc<"generated_memes">): MemeWithSignedUrls => {
        const urls = urlMap.get(meme._id);
        return {
          ...meme,
          // Use signed URL if available, otherwise fall back to stored URL
          signedMemeUrl: urls?.memeUrl || meme.memeUrl || meme.frameUrl || null,
          signedFrameUrl: urls?.frameUrl || meme.frameUrl || meme.frames?.[0]?.url || null,
          urlExpiresAt: urls?.expiresAt || null,
        };
      }
    );

    return { memes: memesWithUrls, error: null };
  },
});

// =============================================================================
// INTERNAL QUERIES
// =============================================================================

/**
 * Internal query to get memes by actor profile ID.
 * Used by getMemesWithSignedUrls action.
 */
export const getMemesByProfileInternal = internalQuery({
  args: { actorProfileId: v.id("actor_profiles") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("generated_memes")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.actorProfileId))
      .order("desc")
      .collect();
  },
});

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

export const getMemeJobInternal = internalQuery({
  args: { jobId: v.id("meme_generation_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Create a new meme generation job
 */
export const createMemeJobInternal = internalMutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    sourceVideoUrl: v.string(),
    memeCount: v.number(),
    targetTemplates: v.optional(v.array(v.string())),
    movieMetadata: v.optional(
      v.object({
        title: v.optional(v.string()),
        logline: v.optional(v.string()),
        genre: v.optional(v.string()),
        cast: v.optional(v.array(v.string())),
      })
    ),
    externalJobId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("meme_generation_jobs", {
      actorProfileId: args.actorProfileId,
      sourceVideoUrl: args.sourceVideoUrl,
      memeCount: args.memeCount,
      targetTemplates: args.targetTemplates,
      movieMetadata: args.movieMetadata,
      status: "pending",
      progress: 0,
      currentStep: "Initializing",
      externalJobId: args.externalJobId,
      createdAt: Date.now(),
    });
  },
});

/**
 * Update meme job status
 */
export const updateMemeJobStatus = internalMutation({
  args: {
    jobId: v.id("meme_generation_jobs"),
    status: v.string(),
    progress: v.optional(v.number()),
    currentStep: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
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
    if (args.videoTitle) updates.videoTitle = args.videoTitle;
    if (args.videoDuration !== undefined) updates.videoDuration = args.videoDuration;

    if (args.status === "completed" || args.status === "failed") {
      updates.completedAt = Date.now();
    }

    await ctx.db.patch(args.jobId, updates);
  },
});

/**
 * Save a candidate frame
 */
export const saveCandidateFrame = internalMutation({
  args: {
    jobId: v.id("meme_generation_jobs"),
    actorProfileId: v.id("actor_profiles"),
    url: v.string(),
    timestamp: v.number(),
    storageId: v.optional(v.id("_storage")),
    emotion: v.optional(v.string()),
    emotionConfidence: v.optional(v.number()),
    action: v.optional(v.string()),
    actionConfidence: v.optional(v.number()),
    hasFaces: v.optional(v.boolean()),
    faceCount: v.optional(v.number()),
    sceneDescription: v.optional(v.string()),
    potentialTemplates: v.optional(v.array(v.string())),
    qualityScore: v.optional(v.number()),
    memeability: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("meme_candidate_frames", {
      jobId: args.jobId,
      actorProfileId: args.actorProfileId,
      url: args.url,
      timestamp: args.timestamp,
      storageId: args.storageId,
      emotion: args.emotion,
      emotionConfidence: args.emotionConfidence,
      action: args.action,
      actionConfidence: args.actionConfidence,
      hasFaces: args.hasFaces,
      faceCount: args.faceCount,
      sceneDescription: args.sceneDescription,
      potentialTemplates: args.potentialTemplates,
      qualityScore: args.qualityScore,
      memeability: args.memeability,
      createdAt: Date.now(),
    });
  },
});

/**
 * Save a generated meme
 */
export const saveGeneratedMeme = internalMutation({
  args: {
    jobId: v.id("meme_generation_jobs"),
    actorProfileId: v.id("actor_profiles"),
    templateType: v.string(),
    templateName: v.optional(v.string()),
    frames: v.array(
      v.object({
        storageId: v.optional(v.id("_storage")),
        url: v.string(),
        timestamp: v.number(),
        emotion: v.optional(v.string()),
        action: v.optional(v.string()),
        hasFaces: v.optional(v.boolean()),
        faceCount: v.optional(v.number()),
      })
    ),
    caption: v.string(),
    captionPosition: v.optional(v.string()),
    memeStorageId: v.optional(v.id("_storage")),
    memeUrl: v.optional(v.string()),
    viralScore: v.optional(v.number()),
    sentiment: v.optional(v.string()),
    suggestedHashtags: v.optional(v.array(v.string())),
    aiReasoning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("generated_memes", {
      jobId: args.jobId,
      actorProfileId: args.actorProfileId,
      templateType: args.templateType,
      templateName: args.templateName,
      frames: args.frames,
      caption: args.caption,
      captionPosition: args.captionPosition,
      memeStorageId: args.memeStorageId,
      memeUrl: args.memeUrl,
      viralScore: args.viralScore,
      sentiment: args.sentiment,
      suggestedHashtags: args.suggestedHashtags,
      aiReasoning: args.aiReasoning,
      createdAt: Date.now(),
    });
  },
});

/**
 * Toggle meme visibility
 */
export const toggleMemeVisibility = mutation({
  args: {
    slug: v.string(),
    memeId: v.id("generated_memes"),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const meme = await ctx.db.get(args.memeId);
    if (!meme || meme.actorProfileId !== owned.profile._id) {
      throw new Error("Meme not found or not owned by user");
    }

    await ctx.db.patch(args.memeId, { isPublic: args.isPublic });
    return { ok: true };
  },
});

/**
 * Toggle meme favorite
 */
export const toggleMemeFavorite = mutation({
  args: {
    slug: v.string(),
    memeId: v.id("generated_memes"),
    isFavorite: v.boolean(),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const meme = await ctx.db.get(args.memeId);
    if (!meme || meme.actorProfileId !== owned.profile._id) {
      throw new Error("Meme not found or not owned by user");
    }

    await ctx.db.patch(args.memeId, { isFavorite: args.isFavorite });
    return { ok: true };
  },
});

/**
 * Delete a generated meme
 */
export const deleteMeme = mutation({
  args: {
    slug: v.string(),
    memeId: v.id("generated_memes"),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const meme = await ctx.db.get(args.memeId);
    if (!meme || meme.actorProfileId !== owned.profile._id) {
      throw new Error("Meme not found or not owned by user");
    }

    // Delete storage files if they exist
    if (meme.memeStorageId) {
      await ctx.storage.delete(meme.memeStorageId);
    }

    await ctx.db.delete(args.memeId);
    return { ok: true };
  },
});

/**
 * Cancel a meme job
 */
export const cancelMemeJob = mutation({
  args: {
    slug: v.string(),
    jobId: v.id("meme_generation_jobs"),
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

// =============================================================================
// R2 UPLOAD MUTATIONS (For browser-first video upload)
// =============================================================================

/**
 * Create a new meme generation job for local video upload.
 * Called when user initiates video upload for meme generation.
 */
export const createMemeUploadJob = action({
  args: {
    slug: v.string(),
    title: v.optional(v.string()),
    memeCount: v.optional(v.number()),
    targetTemplates: v.optional(v.array(v.string())),
    movieMetadata: v.optional(
      v.object({
        title: v.optional(v.string()),
        logline: v.optional(v.string()),
        genre: v.optional(v.string()),
        cast: v.optional(v.array(v.string())),
      })
    ),
  },
  handler: async (ctx, args): Promise<{
    jobId: Id<"meme_generation_jobs">;
    externalJobId: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized: Not authenticated");

    const profile = await ctx.runQuery(
      internal.memeGenerator.getProfileBySlugInternal,
      { slug: args.slug, tokenIdentifier: identity.tokenIdentifier }
    );

    if (!profile) throw new Error("Profile not found or not owned by user");

    const memeCount = args.memeCount ?? 5;
    const externalJobId = generateMemeJobId();

    // Create the job record in "pending" state
    const jobId = await ctx.runMutation(
      internal.memeGenerator.createMemeUploadJobInternal,
      {
        actorProfileId: profile._id,
        sourceVideoUrl: args.title || "Local Upload",
        inputType: "local",
        memeCount,
        targetTemplates: args.targetTemplates,
        movieMetadata: args.movieMetadata,
        externalJobId,
      }
    );

    return { jobId, externalJobId };
  },
});

/**
 * Internal mutation to create a meme job for local upload
 */
export const createMemeUploadJobInternal = internalMutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    sourceVideoUrl: v.string(),
    inputType: v.string(),
    memeCount: v.number(),
    targetTemplates: v.optional(v.array(v.string())),
    movieMetadata: v.optional(
      v.object({
        title: v.optional(v.string()),
        logline: v.optional(v.string()),
        genre: v.optional(v.string()),
        cast: v.optional(v.array(v.string())),
      })
    ),
    externalJobId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("meme_generation_jobs", {
      actorProfileId: args.actorProfileId,
      sourceVideoUrl: args.sourceVideoUrl,
      inputType: args.inputType,
      memeCount: args.memeCount,
      targetTemplates: args.targetTemplates,
      movieMetadata: args.movieMetadata,
      status: "pending",
      progress: 0,
      currentStep: "Initializing",
      externalJobId: args.externalJobId,
      createdAt: Date.now(),
    });
  },
});

/**
 * Save upload session after r2CreateMultipart action.
 * Transitions job from pending → uploading.
 */
export const saveMemeUploadSession = mutation({
  args: {
    jobId: v.id("meme_generation_jobs"),
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
    const sessionId = await ctx.db.insert("meme_upload_sessions", {
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
export const reportMemeUploadedPart = mutation({
  args: {
    sessionId: v.id("meme_upload_sessions"),
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
export const getActiveMemeUploadSession = query({
  args: { jobId: v.id("meme_generation_jobs") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("meme_upload_sessions")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();

    return sessions.find((s) => s.status === "ACTIVE") || null;
  },
});

/**
 * Mark upload as complete after r2CompleteMultipart action succeeds.
 * Transitions job from uploading → uploaded and triggers Modal processing.
 */
export const markMemeUploadComplete = mutation({
  args: {
    sessionId: v.id("meme_upload_sessions"),
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
      currentStep: "Video uploaded, starting meme generation...",
      progress: 50,
    });

    // Trigger meme R2 processing via scheduler
    await ctx.scheduler.runAfter(0, internal.memeGenerator.callMemeR2Endpoint, {
      jobId: session.jobId,
    });

    return { success: true, jobId: session.jobId };
  },
});

/**
 * Abort an upload session (on user cancel or error).
 */
export const abortMemeUploadSession = mutation({
  args: {
    sessionId: v.id("meme_upload_sessions"),
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
 * Submit a meme generation job
 */
export const submitMemeGenerationJob = action({
  args: {
    slug: v.string(),
    sourceVideoUrl: v.string(),
    memeCount: v.optional(v.number()),
    targetTemplates: v.optional(v.array(v.string())),
    movieMetadata: v.optional(
      v.object({
        title: v.optional(v.string()),
        logline: v.optional(v.string()),
        genre: v.optional(v.string()),
        cast: v.optional(v.array(v.string())),
      })
    ),
  },
  handler: async (ctx, args): Promise<{
    jobId: Id<"meme_generation_jobs">;
    status: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized: Not authenticated");

    const profile = await ctx.runQuery(
      internal.memeGenerator.getProfileBySlugInternal,
      { slug: args.slug, tokenIdentifier: identity.tokenIdentifier }
    );

    if (!profile) throw new Error("Profile not found or not owned by user");

    const memeCount = args.memeCount ?? 5;
    const externalJobId = generateMemeJobId();

    // Create the job record
    const jobId = await ctx.runMutation(
      internal.memeGenerator.createMemeJobInternal,
      {
        actorProfileId: profile._id,
        sourceVideoUrl: args.sourceVideoUrl,
        memeCount,
        targetTemplates: args.targetTemplates,
        movieMetadata: args.movieMetadata,
        externalJobId,
      }
    );

    // Schedule the meme generation process
    await ctx.scheduler.runAfter(0, internal.memeGenerator.processMemeGeneration, {
      jobId,
      sourceVideoUrl: args.sourceVideoUrl,
      memeCount,
      targetTemplates: args.targetTemplates,
      movieMetadata: args.movieMetadata,
      actorProfileId: profile._id,
    });

    return { jobId, status: "processing" };
  },
});

/**
 * Process meme generation via Modal (internal action)
 *
 * This triggers the Modal meme generation pipeline which:
 * 1. Downloads the video
 * 2. Extracts actual frames at various timestamps using FFmpeg
 * 3. Analyzes frames with OpenAI Vision for meme potential
 * 4. Generates viral captions using GPT-4o with transcription context
 * 5. Uploads frames and results back to Convex via webhooks
 */
export const processMemeGeneration = internalAction({
  args: {
    jobId: v.id("meme_generation_jobs"),
    sourceVideoUrl: v.string(),
    memeCount: v.number(),
    targetTemplates: v.optional(v.array(v.string())),
    movieMetadata: v.optional(
      v.object({
        title: v.optional(v.string()),
        logline: v.optional(v.string()),
        genre: v.optional(v.string()),
        cast: v.optional(v.array(v.string())),
      })
    ),
    actorProfileId: v.id("actor_profiles"),
  },
  handler: async (ctx, args) => {
    // Get the job to retrieve the externalJobId
    const job = await ctx.runQuery(internal.memeGenerator.getMemeJobInternal, {
      jobId: args.jobId,
    });

    if (!job) {
      throw new Error("Job not found");
    }

    const convexWebhookUrl = getConvexSiteUrl();

    try {
      // Update status: Starting Modal processing
      await ctx.runMutation(internal.memeGenerator.updateMemeJobStatus, {
        jobId: args.jobId,
        status: "pending",
        progress: 0,
        currentStep: "Submitting to Modal for processing...",
      });

      // Submit to Modal meme generation endpoint
      const response = await fetch(MODAL_MEME_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(MODAL_WEBHOOK_SECRET ? { "Authorization": `Bearer ${MODAL_WEBHOOK_SECRET}` } : {}),
        },
        body: JSON.stringify({
          job_id: job.externalJobId,
          video_url: args.sourceVideoUrl,
          meme_count: args.memeCount,
          target_templates: args.targetTemplates,
          movie_metadata: args.movieMetadata ? {
            title: args.movieMetadata.title,
            logline: args.movieMetadata.logline,
            genre: args.movieMetadata.genre,
          } : undefined,
          webhook_url: convexWebhookUrl,
          webhook_secret: MODAL_WEBHOOK_SECRET,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Modal API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as { status: string; message?: string };

      // Update job status to processing - Modal will send progress via webhooks
      await ctx.runMutation(internal.memeGenerator.updateMemeJobStatus, {
        jobId: args.jobId,
        status: "downloading",
        progress: 5,
        currentStep: "Processing started in Modal...",
      });

      console.log(`Meme generation job ${job.externalJobId} submitted to Modal: ${data.status}`);

    } catch (err) {
      console.error("Failed to submit meme generation to Modal:", err);
      await ctx.runMutation(internal.memeGenerator.updateMemeJobStatus, {
        jobId: args.jobId,
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Failed to submit to Modal",
      });
    }
  },
});

/**
 * Update meme job progress (called by Modal webhook)
 */
export const updateMemeJobProgress = internalMutation({
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
      .query("meme_generation_jobs")
      .withIndex("by_externalJobId", (q) => q.eq("externalJobId", args.externalJobId))
      .unique();

    if (!job) {
      throw new Error(`Meme job not found: ${args.externalJobId}`);
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
 * Save a candidate frame from Modal (called by Modal webhook)
 */
export const saveCandidateFrameFromModal = internalMutation({
  args: {
    externalJobId: v.string(),
    timestamp: v.number(),
    url: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    emotion: v.optional(v.string()),
    emotionConfidence: v.optional(v.number()),
    action: v.optional(v.string()),
    actionConfidence: v.optional(v.number()),
    hasFaces: v.optional(v.boolean()),
    faceCount: v.optional(v.number()),
    sceneDescription: v.optional(v.string()),
    potentialTemplates: v.optional(v.array(v.string())),
    memeability: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("meme_generation_jobs")
      .withIndex("by_externalJobId", (q) => q.eq("externalJobId", args.externalJobId))
      .unique();

    if (!job) {
      throw new Error(`Meme job not found: ${args.externalJobId}`);
    }

    return await ctx.db.insert("meme_candidate_frames", {
      jobId: job._id,
      actorProfileId: job.actorProfileId,
      url: args.url || "",
      timestamp: args.timestamp,
      storageId: args.storageId,
      emotion: args.emotion,
      emotionConfidence: args.emotionConfidence,
      action: args.action,
      actionConfidence: args.actionConfidence,
      hasFaces: args.hasFaces,
      faceCount: args.faceCount,
      sceneDescription: args.sceneDescription,
      potentialTemplates: args.potentialTemplates,
      memeability: args.memeability,
      createdAt: Date.now(),
    });
  },
});

/**
 * Save a generated meme from Modal (called by Modal webhook)
 */
export const saveGeneratedMemeFromModal = internalMutation({
  args: {
    externalJobId: v.string(),
    templateType: v.string(),
    templateName: v.optional(v.string()),
    frameTimestamp: v.number(),
    frameUrl: v.optional(v.string()),
    frameStorageId: v.optional(v.id("_storage")),
    caption: v.string(),
    captionPosition: v.optional(v.string()),
    viralScore: v.optional(v.number()),
    sentiment: v.optional(v.string()),
    suggestedHashtags: v.optional(v.array(v.string())),
    aiReasoning: v.optional(v.string()),
    emotion: v.optional(v.string()),
    action: v.optional(v.string()),
    hasFaces: v.optional(v.boolean()),
    faceCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("meme_generation_jobs")
      .withIndex("by_externalJobId", (q) => q.eq("externalJobId", args.externalJobId))
      .unique();

    if (!job) {
      throw new Error(`Meme job not found: ${args.externalJobId}`);
    }

    // Generate URL from storageId if no URL provided but storageId exists
    let frameUrl = args.frameUrl || "";
    if (!frameUrl && args.frameStorageId) {
      const generatedUrl = await ctx.storage.getUrl(args.frameStorageId);
      if (generatedUrl) {
        frameUrl = generatedUrl;
      }
    }

    return await ctx.db.insert("generated_memes", {
      jobId: job._id,
      actorProfileId: job.actorProfileId,
      templateType: args.templateType,
      templateName: args.templateName,
      frames: [
        {
          storageId: args.frameStorageId,
          url: frameUrl,
          timestamp: args.frameTimestamp,
          emotion: args.emotion,
          action: args.action,
          hasFaces: args.hasFaces,
          faceCount: args.faceCount,
        },
      ],
      caption: args.caption,
      captionPosition: args.captionPosition,
      memeUrl: frameUrl,
      memeStorageId: args.frameStorageId,
      viralScore: args.viralScore,
      sentiment: args.sentiment,
      suggestedHashtags: args.suggestedHashtags,
      aiReasoning: args.aiReasoning,
      createdAt: Date.now(),
    });
  },
});

/**
 * Complete meme generation job (called by Modal webhook)
 */
export const completeMemeJob = internalMutation({
  args: {
    externalJobId: v.string(),
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("meme_generation_jobs")
      .withIndex("by_externalJobId", (q) => q.eq("externalJobId", args.externalJobId))
      .unique();

    if (!job) {
      throw new Error(`Meme job not found: ${args.externalJobId}`);
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
 * Analyze a single frame with OpenAI Vision (exposed action)
 */
export const analyzeFrame = action({
  args: {
    slug: v.string(),
    imageUrl: v.string(),
    movieContext: v.optional(
      v.object({
        title: v.optional(v.string()),
        logline: v.optional(v.string()),
        genre: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const profile = await ctx.runQuery(
      internal.memeGenerator.getProfileBySlugInternal,
      { slug: args.slug, tokenIdentifier: identity.tokenIdentifier }
    );

    if (!profile) throw new Error("Profile not found");

    return await analyzeFrameWithVision(args.imageUrl, args.movieContext);
  },
});

/**
 * Generate a caption for a specific frame and template
 */
export const generateCaption = action({
  args: {
    slug: v.string(),
    imageUrl: v.string(),
    templateType: v.string(),
    movieContext: v.optional(
      v.object({
        title: v.optional(v.string()),
        logline: v.optional(v.string()),
        genre: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const profile = await ctx.runQuery(
      internal.memeGenerator.getProfileBySlugInternal,
      { slug: args.slug, tokenIdentifier: identity.tokenIdentifier }
    );

    if (!profile) throw new Error("Profile not found");

    // First analyze the frame
    const analysis = await analyzeFrameWithVision(args.imageUrl, args.movieContext);

    // Then generate caption
    return await generateMemeCaption(
      args.imageUrl,
      args.templateType,
      analysis,
      args.movieContext
    );
  },
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract YouTube video ID from various URL formats
 */
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

// =============================================================================
// SEED TEMPLATES (Run once to populate database)
// =============================================================================

export const seedMemeTemplates = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Check if templates already exist
    const existing = await ctx.db.query("meme_templates").first();
    if (existing) {
      console.log("Meme templates already exist, skipping seed");
      return { seeded: false };
    }

    // Insert all templates
    for (const [key, template] of Object.entries(MEME_TEMPLATES)) {
      await ctx.db.insert("meme_templates", {
        name: template.name,
        templateType: template.templateType,
        description: template.description,
        requirements: template.requirements,
        captionPatterns: template.captionPatterns,
        useCases: template.useCases,
        sortOrder: Object.keys(MEME_TEMPLATES).indexOf(key),
        isActive: true,
        createdAt: Date.now(),
      });
    }

    console.log(`Seeded ${Object.keys(MEME_TEMPLATES).length} meme templates`);
    return { seeded: true, count: Object.keys(MEME_TEMPLATES).length };
  },
});

// =============================================================================
// HTTP ACTIONS FOR R2-BASED MEME PROCESSING
// Called by Modal ConvexClient for the unified R2 architecture
// =============================================================================

// Type for claim meme job result
type ClaimMemeJobResult = {
  claimed: boolean;
  reason?: string;
  userId?: Id<"actor_profiles">;
  actorProfileId?: Id<"actor_profiles">;
  r2SourceKey?: string;
  memeCount?: number;
  targetTemplates?: string[];
  movieMetadata?: {
    title?: string;
    logline?: string;
    genre?: string;
    cast?: string[];
  };
  videoTitle?: string;
};

// Type for complete meme processing result
type CompleteMemeProcessingResult = {
  success: boolean;
  reason?: string;
  memeCount?: number;
};

/**
 * HTTP action to claim a meme job for R2 processing.
 * Called by Modal's ConvexClient.claim_meme_job()
 */
export const httpClaimMemeJob = action({
  args: {
    jobId: v.string(),
    lockId: v.string(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ClaimMemeJobResult> => {
    // Verify webhook secret
    const expectedSecret = process.env.MODAL_WEBHOOK_SECRET;
    if (expectedSecret && args.webhookSecret !== expectedSecret) {
      return { claimed: false, reason: "Invalid webhook secret" };
    }

    try {
      const result = await ctx.runMutation(internal.memeGenerator.claimMemeJobInternal, {
        jobId: args.jobId as Id<"meme_generation_jobs">,
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
 * Internal mutation to claim a meme job for processing.
 */
export const claimMemeJobInternal = internalMutation({
  args: {
    jobId: v.id("meme_generation_jobs"),
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
      status: "processing",
      processingLockId: args.lockId,
      processingStartedAt: Date.now(),
    });

    // Get user and profile info
    const user = await ctx.db.get(job.actorProfileId!);

    return {
      claimed: true,
      userId: job.actorProfileId, // Using actorProfileId as userId for meme jobs
      actorProfileId: job.actorProfileId,
      r2SourceKey: job.r2SourceKey,
      memeCount: job.memeCount || 5,
      targetTemplates: job.targetTemplates,
      movieMetadata: job.movieMetadata,
      videoTitle: job.videoTitle,
    };
  },
});

/**
 * HTTP action to update meme job progress.
 * Called by Modal's ConvexClient.update_meme_progress()
 */
export const httpUpdateMemeProgress = action({
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

    await ctx.runMutation(internal.memeGenerator.updateMemeProgressInternal, {
      jobId: args.jobId as Id<"meme_generation_jobs">,
      lockId: args.lockId,
      progress: args.progress,
      status: args.status,
      currentStep: args.currentStep,
    });

    return { success: true };
  },
});

/**
 * Internal mutation to update meme job progress.
 */
export const updateMemeProgressInternal = internalMutation({
  args: {
    jobId: v.id("meme_generation_jobs"),
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
 * HTTP action to complete meme processing.
 * Called by Modal's ConvexClient.complete_meme_processing()
 */
export const httpCompleteMemeProcessing = action({
  args: {
    jobId: v.string(),
    lockId: v.string(),
    memes: v.array(v.any()),
    candidateFrames: v.array(v.any()),
    videoTitle: v.optional(v.string()),
    videoDuration: v.optional(v.number()),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CompleteMemeProcessingResult> => {
    const expectedSecret = process.env.MODAL_WEBHOOK_SECRET;
    if (expectedSecret && args.webhookSecret !== expectedSecret) {
      return { success: false, reason: "Invalid webhook secret" };
    }

    try {
      const result = await ctx.runMutation(internal.memeGenerator.completeMemeProcessingInternal, {
        jobId: args.jobId as Id<"meme_generation_jobs">,
        lockId: args.lockId,
        memes: args.memes,
        candidateFrames: args.candidateFrames,
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
 * Internal mutation to complete meme processing and save memes.
 */
export const completeMemeProcessingInternal = internalMutation({
  args: {
    jobId: v.id("meme_generation_jobs"),
    lockId: v.string(),
    memes: v.array(v.any()),
    candidateFrames: v.array(v.any()),
    videoTitle: v.optional(v.string()),
    videoDuration: v.optional(v.number()),
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

    // Save candidate frames
    for (const frame of args.candidateFrames) {
      await ctx.db.insert("meme_candidate_frames", {
        jobId: args.jobId,
        actorProfileId: job.actorProfileId,
        url: "",
        timestamp: frame.timestamp || 0,
        emotion: frame.emotion,
        action: frame.action,
        memeability: frame.memeability,
        potentialTemplates: frame.potential_templates,
        r2FrameKey: frame.r2FrameKey,
        createdAt: now,
      });
    }

    // Save generated memes
    for (const meme of args.memes) {
      await ctx.db.insert("generated_memes", {
        jobId: args.jobId,
        actorProfileId: job.actorProfileId,
        templateType: meme.templateType || "reaction",
        templateName: meme.templateName,
        frameTimestamp: meme.frameTimestamp || 0,
        frameUrl: "",
        caption: meme.caption || "",
        captionPosition: meme.captionPosition || "bottom",
        viralScore: meme.viralScore,
        sentiment: meme.sentiment,
        suggestedHashtags: meme.suggestedHashtags,
        emotion: meme.emotion,
        action: meme.action,
        memeabilityScore: meme.memeabilityScore,
        // R2 storage keys
        r2MemeKey: meme.r2MemeKey,
        r2FrameKey: meme.r2FrameKey,
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

    return { success: true, memeCount: args.memes.length };
  },
});

/**
 * HTTP action to fail meme processing.
 * Called by Modal's ConvexClient.fail_meme_processing()
 */
export const httpFailMemeProcessing = action({
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

    await ctx.runMutation(internal.memeGenerator.failMemeProcessingInternal, {
      jobId: args.jobId as Id<"meme_generation_jobs">,
      lockId: args.lockId,
      error: args.error,
      errorStage: args.errorStage,
    });

    return { success: true };
  },
});

/**
 * Internal mutation to fail meme processing.
 */
export const failMemeProcessingInternal = internalMutation({
  args: {
    jobId: v.id("meme_generation_jobs"),
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

/**
 * Mark YouTube download for meme job as complete.
 * Called by webhook after video is uploaded to R2.
 */
export const markMemeDownloadComplete = internalMutation({
  args: {
    jobId: v.id("meme_generation_jobs"),
    r2SourceKey: v.string(),
    videoTitle: v.optional(v.string()),
    videoDuration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error(`Meme job not found: ${args.jobId}`);
    }

    const now = Date.now();

    // Update job with R2 source key and mark as ready for processing
    await ctx.db.patch(args.jobId, {
      status: "uploaded",
      r2SourceKey: args.r2SourceKey,
      videoTitle: args.videoTitle || job.videoTitle,
      videoDuration: args.videoDuration,
      currentStep: "Video ready for meme generation",
    });

    // Trigger R2-based meme processing
    await ctx.scheduler.runAfter(0, internal.memeGenerator.callMemeR2Endpoint, {
      jobId: args.jobId,
    });

    return { success: true };
  },
});

/**
 * Internal action to call Modal R2 meme processing endpoint.
 */
export const callMemeR2Endpoint = internalAction({
  args: { jobId: v.id("meme_generation_jobs") },
  handler: async (ctx, args) => {
    const modalMemeR2Endpoint = process.env.MODAL_MEME_R2_ENDPOINT_URL;
    const webhookSecret = process.env.MODAL_WEBHOOK_SECRET;

    if (!modalMemeR2Endpoint) {
      console.error("MODAL_MEME_R2_ENDPOINT_URL not configured");
      await ctx.runMutation(internal.memeGenerator.updateMemeJobStatus, {
        jobId: args.jobId,
        status: "failed",
        errorMessage: "MODAL_MEME_R2_ENDPOINT_URL not configured",
      });
      return;
    }

    try {
      const response = await fetch(modalMemeR2Endpoint, {
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
        throw new Error(`Modal responded with ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`Modal R2 meme response: ${JSON.stringify(result)}`);

    } catch (error) {
      console.error(`Failed to trigger Modal R2 meme processing: ${error}`);
      await ctx.runMutation(internal.memeGenerator.updateMemeJobStatus, {
        jobId: args.jobId,
        status: "failed",
        errorMessage: `Failed to trigger processing: ${error}`,
      });
    }
  },
});
