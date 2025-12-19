import { v } from "convex/values";
import { action, internalAction, internalQuery, query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import OpenAI from "openai";

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Convert camelCase to snake_case for template placeholder matching
 * e.g., "creatorName" -> "creator_name"
 */
function camelToSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// ============================================
// TYPE DEFINITIONS
// ============================================

// Base context gathered from database
interface BaseDataContext {
  creatorName: string;
  bio?: string;
  location?: string;
  headline?: string;
  socials?: Record<string, string | undefined>;
  avatarUrl?: string;
  userEmail?: string;
  userName?: string;
  movieTitle?: string;
  tagline?: string;
  description?: string;
  releaseYear?: number;
  trailerUrl?: string;
  projectStatus?: string;
  watchCtaText?: string;
  watchCtaUrl?: string;
  clipHighlights: string[];
  generatedClipHighlights: string[];
  trailerTranscriptSummary?: string;
  trailerHighlights?: string[];
  quotableLines?: string[];
  subscriberCount: number;
  pageUrl: string;
}

// Data context for email generation
interface EmailGenerationDataContext {
  creatorName?: string;
  bio?: string;
  location?: string;
  headline?: string;
  movieTitle?: string;
  tagline?: string;
  description?: string;
  releaseWindow?: string;
  eventDate?: string;
  eventTime?: string;
  eventVenue?: string;
  eventType?: string;
  eventDescription?: string;
  ctaUrl?: string;
  ctaText?: string;
  trailerTranscriptSummary?: string;
  clipHighlights?: string[];
  customContent?: string;
  platform?: string;
  creatorRole?: string;
  productionStage?: string;
  btsHighlights?: string;
  funFact?: string;
  challengeOvercome?: string;
  panelGuests?: string;
}

// ============================================
// DATA CONTEXT GATHERING
// ============================================

/**
 * Internal query to gather all available data for campaign generation
 */
export const gatherDataContext = internalQuery({
  args: {
    actorProfileId: v.id("actor_profiles"),
    projectId: v.optional(v.id("projects")),
  },
  async handler(ctx, { actorProfileId, projectId }) {
    // Get actor profile
    const profile = await ctx.db.get(actorProfileId);
    if (!profile) {
      throw new Error("Profile not found");
    }

    // Get user info
    const user = await ctx.db.get(profile.userId);

    // Get specific project or featured project
    let project = null;
    if (projectId) {
      project = await ctx.db.get(projectId);
    } else {
      // Get first featured project or most recent
      const projects = await ctx.db
        .query("projects")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
        .collect();
      project = projects.find((p) => p.isFeatured) || projects[0];
    }

    // Get clips for highlights
    const clips = await ctx.db
      .query("clips")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();
    const publicClips = clips.filter((c) => c.isPublic !== false);

    // Get generated clips
    const generatedClips = await ctx.db
      .query("generated_clips")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();
    const publicGeneratedClips = generatedClips.filter((c) => c.isPublic);

    // Get transcript summaries if available
    const transcriptSummaries = await ctx.db
      .query("transcript_summaries")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();

    // Check for trailer transcript summary specifically
    let trailerSummary = null;
    if (project?.trailerUrl) {
      trailerSummary = transcriptSummaries.find(
        (s) => s.sourceId === project.trailerUrl || s.sourceType === "project_trailer"
      );
    }

    // Get subscriber count for audience context
    const subscribers = await ctx.db
      .query("fan_emails")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();
    const activeSubscribers = subscribers.filter((s) => !s.unsubscribed);

    return {
      // Creator info
      creatorName: profile.displayName,
      bio: profile.bio,
      location: profile.location,
      headline: profile.headline,
      socials: profile.socials,
      avatarUrl: profile.avatarUrl,

      // User info
      userEmail: user?.email,
      userName: user?.name,

      // Project info
      movieTitle: project?.title,
      tagline: project?.logline,
      description: project?.description,
      releaseYear: project?.releaseYear,
      trailerUrl: project?.trailerUrl,
      projectStatus: project?.status,
      watchCtaText: project?.watchCtaText,
      watchCtaUrl: project?.watchCtaUrl || project?.primaryWatchUrl,

      // Content highlights
      clipHighlights: publicClips.slice(0, 5).map((c) => c.title),
      generatedClipHighlights: publicGeneratedClips
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 3)
        .map((c) => c.title),

      // Transcript summaries
      trailerTranscriptSummary: trailerSummary?.mediumSummary || trailerSummary?.shortSummary,
      trailerHighlights: trailerSummary?.keyHighlights,
      quotableLines: trailerSummary?.quotableLines,

      // Audience context
      subscriberCount: activeSubscribers.length,

      // Flmlnk page URL
      pageUrl: `https://flmlnk.com/${profile.slug}`,
    };
  },
});

/**
 * Query to get data context for UI (editable before generation)
 */
export const getDataContextForCampaign = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    projectId: v.optional(v.id("projects")),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Verify ownership
    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile) {
      throw new Error("Profile not found");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    if (!user || profile.userId !== user._id) {
      throw new Error("Not authorized");
    }

    // Get all projects for selection
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.actorProfileId))
      .collect();

    // Gather context using internal query logic (inlined for query context)
    let project = null;
    if (args.projectId) {
      project = await ctx.db.get(args.projectId);
    } else {
      project = projects.find((p) => p.isFeatured) || projects[0];
    }

    const clips = await ctx.db
      .query("clips")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.actorProfileId))
      .collect();
    const publicClips = clips.filter((c) => c.isPublic !== false);

    const transcriptSummaries = await ctx.db
      .query("transcript_summaries")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.actorProfileId))
      .collect();

    let trailerSummary = null;
    if (project?.trailerUrl) {
      trailerSummary = transcriptSummaries.find(
        (s) => s.sourceId === project?.trailerUrl || s.sourceType === "project_trailer"
      );
    }

    const subscribers = await ctx.db
      .query("fan_emails")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.actorProfileId))
      .collect();
    const activeSubscribers = subscribers.filter((s) => !s.unsubscribed);

    return {
      context: {
        creatorName: profile.displayName,
        bio: profile.bio,
        location: profile.location,
        headline: profile.headline,
        movieTitle: project?.title,
        tagline: project?.logline,
        description: project?.description,
        releaseYear: project?.releaseYear,
        trailerUrl: project?.trailerUrl,
        clipHighlights: publicClips.slice(0, 5).map((c) => c.title),
        trailerTranscriptSummary: trailerSummary?.mediumSummary,
        trailerHighlights: trailerSummary?.keyHighlights,
        subscriberCount: activeSubscribers.length,
        pageUrl: `https://flmlnk.com/${profile.slug}`,
      },
      availableProjects: projects.map((p) => ({
        _id: p._id,
        title: p.title,
        status: p.status,
        isFeatured: p.isFeatured,
      })),
      dataQuality: {
        hasBio: !!profile.bio && profile.bio.length > 50,
        hasProject: !!project,
        hasTrailer: !!project?.trailerUrl,
        hasTranscriptSummary: !!trailerSummary,
        subscriberCount: activeSubscribers.length,
        missingOptIn: activeSubscribers.filter((s) => !s.consentedAt).length,
      },
    };
  },
});

// ============================================
// AI GENERATION
// ============================================

interface GeneratedEmailContent {
  subject: string;
  preheaderText: string;
  htmlContent: string;
  textContent: string;
  alternateSubjects: string[];
}

/**
 * Generate email content using AI
 */
export const generateEmailContent = internalAction({
  args: {
    templateKey: v.string(),
    dataContext: v.object({
      creatorName: v.optional(v.string()),
      bio: v.optional(v.string()),
      location: v.optional(v.string()),
      headline: v.optional(v.string()),
      movieTitle: v.optional(v.string()),
      tagline: v.optional(v.string()),
      description: v.optional(v.string()),
      releaseWindow: v.optional(v.string()),
      eventDate: v.optional(v.string()),
      eventTime: v.optional(v.string()),
      eventVenue: v.optional(v.string()),
      eventType: v.optional(v.string()),
      eventDescription: v.optional(v.string()),
      ctaUrl: v.optional(v.string()),
      ctaText: v.optional(v.string()),
      trailerTranscriptSummary: v.optional(v.string()),
      clipHighlights: v.optional(v.array(v.string())),
      customContent: v.optional(v.string()),
      platform: v.optional(v.string()),
      creatorRole: v.optional(v.string()),
      productionStage: v.optional(v.string()),
      btsHighlights: v.optional(v.string()),
      funFact: v.optional(v.string()),
      challengeOvercome: v.optional(v.string()),
      panelGuests: v.optional(v.string()),
    }),
    tone: v.string(),
    brevity: v.string(),
  },
  async handler(ctx, { templateKey, dataContext, tone, brevity }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const openai = new OpenAI({ apiKey });

    // Get template
    const template = await ctx.runQuery(internal.campaignTemplates.getTemplateByKeyInternal, { key: templateKey });
    if (!template) {
      throw new Error(`Template not found: ${templateKey}`);
    }

    // Build the prompt by substituting variables
    let userPrompt = template.userPromptTemplate;

    // Replace all variables in the prompt
    // Templates use snake_case placeholders (e.g., {creator_name}) but dataContext uses camelCase keys (e.g., creatorName)
    // We need to convert camelCase keys to snake_case for proper matching
    for (const [key, value] of Object.entries(dataContext)) {
      // Convert camelCase key to snake_case for placeholder matching
      const snakeCaseKey = camelToSnakeCase(key);
      const placeholder = `{${snakeCaseKey}}`;

      if (Array.isArray(value)) {
        userPrompt = userPrompt.replace(new RegExp(placeholder, "g"), value.join(", "));
      } else if (value !== undefined && value !== null) {
        userPrompt = userPrompt.replace(new RegExp(placeholder, "g"), String(value));
      } else {
        // Remove conditional sections for missing data
        userPrompt = userPrompt.replace(new RegExp(`\\{${snakeCaseKey}\\s*\\?[^}]*\\}`, "g"), "");
        userPrompt = userPrompt.replace(new RegExp(placeholder, "g"), "[Not provided]");
      }
    }

    // Add tone and brevity
    userPrompt = userPrompt
      .replace("{tone}", tone)
      .replace("{brevity}", brevity);

    // Generate email content
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: template.systemPrompt + `

IMPORTANT OUTPUT FORMAT:
You MUST respond with valid JSON in exactly this format:
{
  "subject": "The email subject line",
  "preheaderText": "Preview text shown in email clients (50-100 characters)",
  "htmlContent": "Full HTML email body (use proper HTML formatting with inline styles)",
  "textContent": "Plain text version of the email body",
  "alternateSubjects": ["Subject option 2", "Subject option 3"]
}

HTML Guidelines:
- Use inline styles only (no <style> tags)
- IMPORTANT: This email uses a dark background (#0c0911). ALL text MUST be light-colored for readability:
  - Primary text color: #ffffff (white) or #e2e8f0 (light gray)
  - Secondary text: #94a3b8 (medium gray)
  - Accent/links: #f53c56 (Flmlnk brand red)
- Every paragraph, heading, and text element MUST have an explicit color style (e.g., style="color: #ffffff;")
- Keep it mobile-responsive
- Include proper paragraph spacing
- Never include <html>, <head>, or <body> tags - just the content`,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const responseContent = completion.choices[0].message.content;
    if (!responseContent) {
      throw new Error("No response from AI");
    }

    const generated = JSON.parse(responseContent) as GeneratedEmailContent;

    // Wrap HTML content in email template
    const fullHtmlContent = wrapInEmailTemplate(generated.htmlContent, dataContext.creatorName || "Flmlnk");

    return {
      subject: generated.subject,
      preheaderText: generated.preheaderText,
      htmlContent: fullHtmlContent,
      textContent: generated.textContent,
      alternateSubjects: generated.alternateSubjects || [],
    };
  },
});

/**
 * Wrap generated HTML content in a full email template
 */
function wrapInEmailTemplate(content: string, senderName: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Update from ${senderName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0c0911; color: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #ffffff;">
    ${content}
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate subject line variations using AI
 */
export const generateSubjectLines = internalAction({
  args: {
    context: v.string(),
    currentSubject: v.string(),
    count: v.number(),
  },
  async handler(ctx, { context, currentSubject, count }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert email subject line writer for the film industry. Generate compelling, non-clickbait subject lines that intrigue readers and accurately represent the content.

Guidelines:
- Keep under 60 characters
- Use emojis sparingly (max 1)
- Avoid spam trigger words
- Create curiosity without misleading
- Be specific and relevant`,
        },
        {
          role: "user",
          content: `Based on this email context:
${context}

Current subject line: "${currentSubject}"

Generate ${count} alternative subject lines that might perform better. Return as JSON array of strings.`,
        },
      ],
      temperature: 0.8,
      response_format: { type: "json_object" },
    });

    const response = completion.choices[0].message.content;
    if (!response) {
      return { subjects: [] };
    }

    const parsed = JSON.parse(response);
    return { subjects: parsed.subjects || parsed.alternatives || [] };
  },
});

// ============================================
// TRANSCRIPT SUMMARIZATION
// ============================================

/**
 * Summarize a transcript for email use
 */
export const summarizeTranscript = internalAction({
  args: {
    transcriptionId: v.id("transcriptions"),
    actorProfileId: v.optional(v.id("actor_profiles")),
    sourceType: v.string(),
    sourceId: v.string(),
  },
  async handler(ctx, { transcriptionId, actorProfileId, sourceType, sourceId }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Get the transcription
    const transcription = await ctx.runQuery(internal.campaignGeneration.getTranscription, { transcriptionId });
    if (!transcription) {
      throw new Error("Transcription not found");
    }

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a film marketing expert. Summarize video transcripts for use in email marketing campaigns. Extract key talking points, quotable moments, and emotional beats that would resonate with audiences.

Output JSON in this format:
{
  "shortSummary": "1-2 sentence summary",
  "mediumSummary": "3-5 sentence summary with key details",
  "detailedSummary": "Full paragraph with context and nuance",
  "keyHighlights": ["Bullet point 1", "Bullet point 2", "Bullet point 3"],
  "quotableLines": ["Quote 1", "Quote 2"]
}`,
        },
        {
          role: "user",
          content: `Summarize this video transcript for email marketing:

Title: ${transcription.videoTitle || "Untitled"}

Transcript:
${transcription.fullText}`,
        },
      ],
      temperature: 0.5,
      response_format: { type: "json_object" },
    });

    const response = completion.choices[0].message.content;
    if (!response) {
      throw new Error("No response from AI");
    }

    const summary = JSON.parse(response);

    // Save the summary
    await ctx.runMutation(internal.campaignGeneration.saveTranscriptSummary, {
      sourceType,
      sourceId,
      actorProfileId,
      transcriptionId,
      shortSummary: summary.shortSummary,
      mediumSummary: summary.mediumSummary,
      detailedSummary: summary.detailedSummary,
      keyHighlights: summary.keyHighlights,
      quotableLines: summary.quotableLines,
      transcriptLength: transcription.fullText.length,
    });

    return summary;
  },
});

/**
 * Get transcription by ID (internal)
 */
export const getTranscription = internalQuery({
  args: {
    transcriptionId: v.id("transcriptions"),
  },
  async handler(ctx, { transcriptionId }) {
    return ctx.db.get(transcriptionId);
  },
});

/**
 * Save transcript summary
 */
export const saveTranscriptSummary = internalMutation({
  args: {
    sourceType: v.string(),
    sourceId: v.string(),
    actorProfileId: v.optional(v.id("actor_profiles")),
    transcriptionId: v.optional(v.id("transcriptions")),
    shortSummary: v.string(),
    mediumSummary: v.string(),
    detailedSummary: v.optional(v.string()),
    keyHighlights: v.optional(v.array(v.string())),
    quotableLines: v.optional(v.array(v.string())),
    transcriptLength: v.optional(v.number()),
  },
  async handler(ctx, args) {
    // Check if summary already exists
    const existing = await ctx.db
      .query("transcript_summaries")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", args.sourceId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        shortSummary: args.shortSummary,
        mediumSummary: args.mediumSummary,
        detailedSummary: args.detailedSummary,
        keyHighlights: args.keyHighlights,
        quotableLines: args.quotableLines,
        transcriptLength: args.transcriptLength,
        generatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("transcript_summaries", {
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      actorProfileId: args.actorProfileId,
      transcriptionId: args.transcriptionId,
      shortSummary: args.shortSummary,
      mediumSummary: args.mediumSummary,
      detailedSummary: args.detailedSummary,
      keyHighlights: args.keyHighlights,
      quotableLines: args.quotableLines,
      transcriptLength: args.transcriptLength,
      generatedAt: now,
    });
  },
});

// ============================================
// CAMPAIGN GENERATION FLOW
// ============================================

// Return type for generateCampaignDraft
interface GeneratedCampaignDraft {
  subject: string;
  preheaderText: string;
  htmlContent: string;
  textContent: string;
  alternateSubjects: string[];
  dataContext: Record<string, string | string[] | undefined>;
  templateKey: string;
  tone: string;
  brevity: string;
}

/**
 * Generate a campaign draft using AI
 */
export const generateCampaignDraft = action({
  args: {
    actorProfileId: v.id("actor_profiles"),
    templateKey: v.string(),
    projectId: v.optional(v.id("projects")),
    // Override data context fields
    overrides: v.optional(
      v.object({
        creatorName: v.optional(v.string()),
        bio: v.optional(v.string()),
        location: v.optional(v.string()),
        headline: v.optional(v.string()),
        movieTitle: v.optional(v.string()),
        tagline: v.optional(v.string()),
        description: v.optional(v.string()),
        releaseWindow: v.optional(v.string()),
        eventDate: v.optional(v.string()),
        eventTime: v.optional(v.string()),
        eventVenue: v.optional(v.string()),
        eventType: v.optional(v.string()),
        eventDescription: v.optional(v.string()),
        ctaUrl: v.optional(v.string()),
        ctaText: v.optional(v.string()),
        trailerTranscriptSummary: v.optional(v.string()),
        customContent: v.optional(v.string()),
        platform: v.optional(v.string()),
        creatorRole: v.optional(v.string()),
        productionStage: v.optional(v.string()),
        btsHighlights: v.optional(v.string()),
        funFact: v.optional(v.string()),
        challengeOvercome: v.optional(v.string()),
        panelGuests: v.optional(v.string()),
      })
    ),
    tone: v.optional(v.string()),
    brevity: v.optional(v.string()),
  },
  returns: v.object({
    subject: v.string(),
    preheaderText: v.string(),
    htmlContent: v.string(),
    textContent: v.string(),
    alternateSubjects: v.array(v.string()),
    dataContext: v.any(),
    templateKey: v.string(),
    tone: v.string(),
    brevity: v.string(),
  }),
  async handler(ctx, args): Promise<GeneratedCampaignDraft> {
    // Gather data context
    const baseContext = await ctx.runQuery(internal.campaignGeneration.gatherDataContext, {
      actorProfileId: args.actorProfileId,
      projectId: args.projectId,
    }) as BaseDataContext;

    // Get template for defaults
    const template = await ctx.runQuery(internal.campaignTemplates.getTemplateByKeyInternal, {
      key: args.templateKey,
    }) as { defaultTone: string; defaultBrevity: string } | null;

    if (!template) {
      throw new Error(`Template not found: ${args.templateKey}`);
    }

    // Merge base context with overrides
    const dataContext: Record<string, string | string[] | undefined> = {
      creatorName: args.overrides?.creatorName || baseContext.creatorName,
      bio: args.overrides?.bio || baseContext.bio,
      location: args.overrides?.location || baseContext.location,
      headline: args.overrides?.headline || baseContext.headline,
      movieTitle: args.overrides?.movieTitle || baseContext.movieTitle,
      tagline: args.overrides?.tagline || baseContext.tagline,
      description: args.overrides?.description || baseContext.description,
      releaseWindow: args.overrides?.releaseWindow,
      eventDate: args.overrides?.eventDate,
      eventTime: args.overrides?.eventTime,
      eventVenue: args.overrides?.eventVenue,
      eventType: args.overrides?.eventType,
      eventDescription: args.overrides?.eventDescription,
      ctaUrl: args.overrides?.ctaUrl || baseContext.pageUrl,
      ctaText: args.overrides?.ctaText || "Visit my page",
      trailerTranscriptSummary: args.overrides?.trailerTranscriptSummary || baseContext.trailerTranscriptSummary,
      clipHighlights: baseContext.clipHighlights,
      customContent: args.overrides?.customContent,
      platform: args.overrides?.platform,
      creatorRole: args.overrides?.creatorRole,
      productionStage: args.overrides?.productionStage,
      btsHighlights: args.overrides?.btsHighlights,
      funFact: args.overrides?.funFact,
      challengeOvercome: args.overrides?.challengeOvercome,
      panelGuests: args.overrides?.panelGuests,
    };

    // Generate content
    const generated = await ctx.runAction(internal.campaignGeneration.generateEmailContent, {
      templateKey: args.templateKey,
      dataContext: dataContext as EmailGenerationDataContext,
      tone: args.tone || template.defaultTone,
      brevity: args.brevity || template.defaultBrevity,
    }) as GeneratedEmailContent;

    return {
      ...generated,
      dataContext,
      templateKey: args.templateKey,
      tone: args.tone || template.defaultTone,
      brevity: args.brevity || template.defaultBrevity,
    };
  },
});

/**
 * Regenerate just the subject line with variations
 */
export const regenerateSubjectLines = action({
  args: {
    campaignId: v.id("email_campaigns"),
    count: v.optional(v.number()),
  },
  returns: v.array(v.string()),
  async handler(ctx, { campaignId, count = 3 }): Promise<string[]> {
    const campaign = await ctx.runQuery(internal.campaigns.getCampaignById, { campaignId }) as {
      dataContext?: { movieTitle?: string; creatorName?: string };
      textContent: string;
      subject: string;
    } | null;
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    // Build context from campaign data
    const context: string = JSON.stringify({
      movieTitle: campaign.dataContext?.movieTitle,
      creatorName: campaign.dataContext?.creatorName,
      emailContent: campaign.textContent.substring(0, 500),
    });

    const result = await ctx.runAction(internal.campaignGeneration.generateSubjectLines, {
      context,
      currentSubject: campaign.subject,
      count,
    });

    return result.subjects;
  },
});
