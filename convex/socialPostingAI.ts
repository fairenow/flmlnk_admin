import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";
import OpenAI from "openai";

// ============================================
// AI COPY GENERATION
// ============================================

/**
 * Generate AI copy for a social media post
 */
export const generatePostCopy = action({
  args: {
    actorProfileId: v.id("actor_profiles"),
    assetType: v.optional(v.string()), // "image", "clip", "meme"
    assetDescription: v.optional(v.string()),
    targetPlatforms: v.array(v.string()),
    tone: v.string(), // "hype", "informative", "press", "casual", "heartfelt"
    filmSlug: v.optional(v.string()),
    filmTitle: v.optional(v.string()),
    filmLogline: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    caption: v.optional(v.string()),
    hashtags: v.optional(v.array(v.string())),
    platformVariants: v.optional(
      v.array(
        v.object({
          platform: v.string(),
          caption: v.string(),
          hashtags: v.array(v.string()),
        })
      )
    ),
    error: v.optional(v.string()),
    tokensUsed: v.optional(v.number()),
  }),
  async handler(ctx, args) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { success: false, error: "OpenAI API key not configured" };
    }

    // Get profile data
    const profile = await ctx.runQuery(internal.socialPostingAI.getProfileData, {
      actorProfileId: args.actorProfileId,
    });

    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    const openai = new OpenAI({ apiKey });

    // Build the prompt
    const systemPrompt = buildSystemPrompt(args.tone);
    const userPrompt = buildUserPrompt({
      profile,
      assetType: args.assetType,
      assetDescription: args.assetDescription,
      targetPlatforms: args.targetPlatforms,
      filmSlug: args.filmSlug,
      filmTitle: args.filmTitle,
      filmLogline: args.filmLogline,
      customPrompt: args.customPrompt,
    });

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: 1000,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        return { success: false, error: "No response from AI" };
      }

      const result = JSON.parse(content);

      return {
        success: true,
        caption: result.caption,
        hashtags: result.hashtags || [],
        platformVariants: result.platform_variants,
        tokensUsed: completion.usage?.total_tokens,
      };
    } catch (error) {
      console.error("AI generation error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "AI generation failed",
      };
    }
  },
});

function buildSystemPrompt(tone: string): string {
  const toneInstructions: Record<string, string> = {
    hype: "Write with high energy, excitement, and urgency. Use bold statements and emojis sparingly. Create FOMO and anticipation.",
    informative:
      "Write clearly and professionally. Focus on facts, dates, and key information. Keep it straightforward and accessible.",
    press:
      "Write in a formal, press-release style. Suitable for industry professionals and media. Avoid casual language.",
    casual:
      "Write in a friendly, conversational tone. Be relatable and personable. Feel free to use humor where appropriate.",
    heartfelt:
      "Write with sincerity and emotional depth. Express gratitude and connection with the audience. Be genuine and warm.",
  };

  return `You are a social media marketing expert for independent filmmakers and actors.
Your job is to create engaging, platform-optimized social media posts that drive engagement and film views.

Tone: ${tone}
${toneInstructions[tone] || toneInstructions.casual}

Rules:
1. Never use more than 3-5 hashtags unless specifically for Instagram
2. Keep captions concise - Twitter under 280 chars, Instagram under 2200, TikTok under 150
3. Include a clear call-to-action when appropriate
4. Reference the film/content link naturally
5. Don't overuse emojis - max 2-3 per post
6. Create authentic, human-sounding copy - avoid corporate speak
7. For hashtags, mix popular (high visibility) with niche (high relevance)

Respond with valid JSON in this format:
{
  "caption": "Main caption text",
  "hashtags": ["hashtag1", "hashtag2"],
  "platform_variants": [
    {
      "platform": "twitter",
      "caption": "Twitter-optimized version (under 280 chars)",
      "hashtags": ["tag1", "tag2"]
    },
    {
      "platform": "instagram",
      "caption": "Instagram-optimized version",
      "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
    }
  ]
}`;
}

function buildUserPrompt(data: {
  profile: {
    displayName: string;
    bio?: string;
    location?: string;
    genres?: string[];
  };
  assetType?: string;
  assetDescription?: string;
  targetPlatforms: string[];
  filmSlug?: string;
  filmTitle?: string;
  filmLogline?: string;
  customPrompt?: string;
}): string {
  let prompt = `Create social media posts for ${data.profile.displayName}`;

  if (data.profile.bio) {
    prompt += `\n\nCreator bio: ${data.profile.bio}`;
  }

  if (data.profile.location) {
    prompt += `\nLocation: ${data.profile.location}`;
  }

  if (data.profile.genres && data.profile.genres.length > 0) {
    prompt += `\nGenres: ${data.profile.genres.join(", ")}`;
  }

  if (data.filmTitle) {
    prompt += `\n\nFilm: "${data.filmTitle}"`;
  }

  if (data.filmLogline) {
    prompt += `\nLogline: ${data.filmLogline}`;
  }

  if (data.filmSlug) {
    prompt += `\nFilm page: flmlnk.com/f/${data.filmSlug}`;
  }

  if (data.assetType) {
    prompt += `\n\nContent type: ${data.assetType}`;
  }

  if (data.assetDescription) {
    prompt += `\nContent description: ${data.assetDescription}`;
  }

  prompt += `\n\nTarget platforms: ${data.targetPlatforms.join(", ")}`;

  if (data.customPrompt) {
    prompt += `\n\nAdditional instructions: ${data.customPrompt}`;
  }

  prompt += `\n\nGenerate optimized posts for each platform.`;

  return prompt;
}

// ============================================
// ASSET CURATION & CANDIDATE GENERATION
// ============================================

/**
 * Scan assets and generate post candidates
 */
export const generatePostCandidates = internalAction({
  args: {
    actorProfileId: v.id("actor_profiles"),
    maxCandidates: v.optional(v.number()),
  },
  async handler(ctx, { actorProfileId, maxCandidates = 10 }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OpenAI API key not configured");
      return;
    }

    // Get profile and project data
    const profile = await ctx.runQuery(internal.socialPostingAI.getProfileData, {
      actorProfileId,
    });

    if (!profile) return;

    // Get recent assets
    const assets = await ctx.runQuery(internal.socialPostingAI.getRecentAssets, {
      actorProfileId,
      limit: 50,
    });

    // Get recent clips
    const clips = await ctx.runQuery(internal.socialPostingAI.getRecentClips, {
      actorProfileId,
      limit: 20,
    });

    // Get recent memes
    const memes = await ctx.runQuery(internal.socialPostingAI.getRecentMemes, {
      actorProfileId,
      limit: 20,
    });

    // Combine and score all content
    const allContent = [
      ...assets.map((a: Doc<"image_manager_assets">) => ({ ...a, type: "image" as const, sourceTable: "image_manager_assets" as const })),
      ...clips.map((c: Doc<"processing_clips">) => ({ ...c, type: "clip" as const, sourceTable: "processing_clips" as const })),
      ...memes.map((m: Doc<"generated_memes">) => ({ ...m, type: "meme" as const, sourceTable: "generated_memes" as const })),
    ];

    // Filter out already-used content
    const existingCandidates = await ctx.runQuery(
      internal.socialPostingAI.getExistingCandidateAssetIds,
      { actorProfileId }
    );

    const newContent = allContent.filter(
      (c) => !existingCandidates.includes(c._id.toString())
    );

    // Score and select top candidates
    const scoredContent = newContent.map((content) => ({
      ...content,
      score: calculateContentScore(content),
    }));

    const topContent = scoredContent
      .sort((a, b) => b.score - a.score)
      .slice(0, maxCandidates);

    // Generate candidates with AI
    const openai = new OpenAI({ apiKey });

    for (const content of topContent) {
      try {
        const candidate = await generateCandidate(openai, profile, content);

        if (candidate) {
          await ctx.runMutation(internal.socialPostingAI.createPostCandidate, {
            actorProfileId,
            candidate,
          });
        }
      } catch (error) {
        console.error("Error generating candidate:", error);
      }
    }
  },
});

function calculateContentScore(content: {
  type: string;
  score?: number;
  viralScore?: number;
  aiScore?: number;
  viralAnalysis?: {
    hookStrength?: number;
    retentionScore?: number;
    shareabilityScore?: number;
  };
  createdAt: number;
}): number {
  let score = 50; // Base score

  // Use existing scores if available
  if (content.score) score += content.score * 0.3;
  if (content.viralScore) score += content.viralScore * 0.3;
  if (content.aiScore) score += content.aiScore * 0.2;

  // Viral analysis components
  if (content.viralAnalysis) {
    if (content.viralAnalysis.hookStrength) {
      score += content.viralAnalysis.hookStrength * 0.2;
    }
    if (content.viralAnalysis.shareabilityScore) {
      score += content.viralAnalysis.shareabilityScore * 0.2;
    }
  }

  // Recency bonus (newer content scores higher)
  const ageInDays = (Date.now() - content.createdAt) / (1000 * 60 * 60 * 24);
  if (ageInDays < 7) score += 20;
  else if (ageInDays < 30) score += 10;
  else if (ageInDays > 90) score -= 10;

  // Content type bonuses
  if (content.type === "clip") score += 15; // Video content performs better
  if (content.type === "meme") score += 10; // Memes are shareable

  return Math.min(100, Math.max(0, score));
}

async function generateCandidate(
  openai: OpenAI,
  profile: { displayName: string; bio?: string; genres?: string[] },
  content: {
    _id: Id<"image_manager_assets"> | Id<"processing_clips"> | Id<"generated_memes">;
    type: string;
    sourceTable: string;
    title?: string;
    description?: string;
    caption?: string;
    transcript?: string;
    url?: string;
    thumbnailUrl?: string;
    r2ThumbKey?: string;
    duration?: number;
    aspectRatio?: string;
    viralAnalysis?: {
      suggestedHashtags?: string[];
      summary?: string;
    };
    suggestedHashtags?: string[];
  }
): Promise<{
  assetType: string;
  assetSourceTable: string;
  assetSourceId: string;
  assetTitle?: string;
  assetDescription?: string;
  assetThumbnailUrl?: string;
  assetDuration?: number;
  assetAspectRatio?: string;
  suggestedCaption: string;
  suggestedHashtags: string[];
  platformFitness: {
    instagram?: number;
    facebook?: number;
    twitter?: number;
    tiktok?: number;
    youtube?: number;
    linkedin?: number;
  };
  contentKeywords?: string[];
  contentTone?: string;
  contentCategory?: string;
  aiReasoning?: string;
} | null> {
  const contentDescription =
    content.title || content.description || content.caption || content.transcript || "";

  const existingHashtags =
    content.viralAnalysis?.suggestedHashtags || content.suggestedHashtags || [];

  const prompt = `Analyze this content and create a social media post suggestion:

Creator: ${profile.displayName}
${profile.bio ? `Bio: ${profile.bio}` : ""}
${profile.genres?.length ? `Genres: ${profile.genres.join(", ")}` : ""}

Content type: ${content.type}
${contentDescription ? `Description: ${contentDescription}` : ""}
${content.duration ? `Duration: ${content.duration}s` : ""}
${content.aspectRatio ? `Aspect ratio: ${content.aspectRatio}` : ""}
${existingHashtags.length ? `Existing hashtags: ${existingHashtags.join(", ")}` : ""}

Generate a JSON response with:
{
  "caption": "Engaging caption text (1-2 sentences)",
  "hashtags": ["5-8 relevant hashtags without # symbol"],
  "platform_fitness": {
    "instagram": 0-100,
    "facebook": 0-100,
    "twitter": 0-100,
    "tiktok": 0-100,
    "youtube": 0-100,
    "linkedin": 0-100
  },
  "keywords": ["content keywords"],
  "tone": "funny|dramatic|informative|emotional",
  "category": "behind_scenes|trailer_clip|meme|announcement|promotional",
  "reasoning": "Brief explanation of why this content is good for social media"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a social media expert analyzing content for posting potential. Respond with valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 500,
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) return null;

    const result = JSON.parse(responseContent);

    // Get thumbnail URL
    let thumbnailUrl = content.url || content.thumbnailUrl;
    if (!thumbnailUrl && content.r2ThumbKey) {
      const r2Bucket = process.env.R2_PUBLIC_BUCKET_URL;
      if (r2Bucket) {
        thumbnailUrl = `${r2Bucket}/${content.r2ThumbKey}`;
      }
    }

    return {
      assetType: content.type,
      assetSourceTable: content.sourceTable,
      assetSourceId: content._id.toString(),
      assetTitle: content.title,
      assetDescription: content.description,
      assetThumbnailUrl: thumbnailUrl,
      assetDuration: content.duration,
      assetAspectRatio: content.aspectRatio,
      suggestedCaption: result.caption,
      suggestedHashtags: result.hashtags || [],
      platformFitness: result.platform_fitness || {},
      contentKeywords: result.keywords,
      contentTone: result.tone,
      contentCategory: result.category,
      aiReasoning: result.reasoning,
    };
  } catch (error) {
    console.error("AI candidate generation error:", error);
    return null;
  }
}

// ============================================
// PLATFORM FITNESS CALCULATOR
// ============================================

/**
 * Calculate platform fitness scores for content
 */
export function calculatePlatformFitness(content: {
  type: string;
  duration?: number;
  aspectRatio?: string;
  hasText?: boolean;
}): {
  instagram: number;
  facebook: number;
  twitter: number;
  tiktok: number;
  youtube: number;
  linkedin: number;
} {
  const scores = {
    instagram: 50,
    facebook: 50,
    twitter: 50,
    tiktok: 50,
    youtube: 50,
    linkedin: 50,
  };

  // Video content
  if (content.type === "video" || content.type === "clip") {
    const duration = content.duration || 30;

    // TikTok: prefer short vertical videos
    if (duration <= 60) scores.tiktok += 30;
    else if (duration <= 180) scores.tiktok += 15;
    else scores.tiktok -= 20;

    // Instagram Reels: similar to TikTok
    if (duration <= 90) scores.instagram += 25;
    else if (duration <= 180) scores.instagram += 10;

    // Twitter: prefer under 2:20
    if (duration <= 140) scores.twitter += 20;
    else scores.twitter -= 10;

    // YouTube: prefer longer content
    if (duration >= 60) scores.youtube += 20;
    if (duration >= 300) scores.youtube += 15;

    // Facebook: flexible
    if (duration <= 180) scores.facebook += 15;

    // LinkedIn: professional short clips
    if (duration <= 120 && duration >= 30) scores.linkedin += 15;
  }

  // Image content
  if (content.type === "image" || content.type === "meme") {
    scores.instagram += 20;
    scores.facebook += 20;
    scores.twitter += 15;
    scores.linkedin += 15;
    scores.tiktok -= 30; // TikTok is video-only
    scores.youtube -= 30; // YouTube is video-only
  }

  // Aspect ratio considerations
  if (content.aspectRatio) {
    const isVertical =
      content.aspectRatio.includes("9:16") || content.aspectRatio.includes("4:5");
    const isSquare = content.aspectRatio.includes("1:1");
    const isLandscape = content.aspectRatio.includes("16:9");

    if (isVertical) {
      scores.tiktok += 20;
      scores.instagram += 15;
      scores.facebook += 5;
      scores.youtube -= 10; // YouTube prefers landscape
      scores.linkedin -= 5;
    }

    if (isSquare) {
      scores.instagram += 10;
      scores.facebook += 10;
      scores.twitter += 10;
    }

    if (isLandscape) {
      scores.youtube += 20;
      scores.linkedin += 15;
      scores.facebook += 10;
      scores.twitter += 10;
    }
  }

  // Normalize scores to 0-100
  for (const platform of Object.keys(scores) as Array<keyof typeof scores>) {
    scores[platform] = Math.min(100, Math.max(0, scores[platform]));
  }

  return scores;
}

// ============================================
// INTERNAL QUERIES & MUTATIONS
// ============================================

export const getProfileData = internalQuery({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const profile = await ctx.db.get(actorProfileId);
    if (!profile) return null;

    // Get featured project for context
    const featuredProject = await ctx.db
      .query("projects")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .filter((q) => q.eq(q.field("isFeatured"), true))
      .first();

    return {
      displayName: profile.displayName,
      bio: profile.bio,
      location: profile.location,
      genres: profile.genres,
      slug: profile.slug,
      featuredProject: featuredProject
        ? {
            title: featuredProject.title,
            logline: featuredProject.logline,
          }
        : undefined,
    };
  },
});

export const getRecentAssets = internalQuery({
  args: {
    actorProfileId: v.id("actor_profiles"),
    limit: v.number(),
  },
  async handler(ctx, { actorProfileId, limit }) {
    return ctx.db
      .query("image_manager_assets")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .order("desc")
      .take(limit);
  },
});

export const getRecentClips = internalQuery({
  args: {
    actorProfileId: v.id("actor_profiles"),
    limit: v.number(),
  },
  async handler(ctx, { actorProfileId, limit }) {
    return ctx.db
      .query("processing_clips")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .order("desc")
      .take(limit);
  },
});

export const getRecentMemes = internalQuery({
  args: {
    actorProfileId: v.id("actor_profiles"),
    limit: v.number(),
  },
  async handler(ctx, { actorProfileId, limit }) {
    return ctx.db
      .query("generated_memes")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .order("desc")
      .take(limit);
  },
});

export const getExistingCandidateAssetIds = internalQuery({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const candidates = await ctx.db
      .query("post_candidates")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();

    return candidates.map((c) => c.assetSourceId);
  },
});

export const createPostCandidate = internalMutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    candidate: v.object({
      assetType: v.string(),
      assetSourceTable: v.string(),
      assetSourceId: v.string(),
      assetTitle: v.optional(v.string()),
      assetDescription: v.optional(v.string()),
      assetThumbnailUrl: v.optional(v.string()),
      assetDuration: v.optional(v.number()),
      assetAspectRatio: v.optional(v.string()),
      suggestedCaption: v.string(),
      suggestedHashtags: v.array(v.string()),
      platformFitness: v.object({
        instagram: v.optional(v.number()),
        facebook: v.optional(v.number()),
        twitter: v.optional(v.number()),
        tiktok: v.optional(v.number()),
        youtube: v.optional(v.number()),
        linkedin: v.optional(v.number()),
      }),
      contentKeywords: v.optional(v.array(v.string())),
      contentTone: v.optional(v.string()),
      contentCategory: v.optional(v.string()),
      aiReasoning: v.optional(v.string()),
    }),
  },
  async handler(ctx, { actorProfileId, candidate }) {
    await ctx.db.insert("post_candidates", {
      actorProfileId,
      ...candidate,
      status: "pending",
      generatedAt: Date.now(),
    });
  },
});
