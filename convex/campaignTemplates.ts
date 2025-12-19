import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// ============================================
// SYSTEM PROMPT TEMPLATES FOR FILM INDUSTRY EMAIL
// ============================================

const FILM_EMAIL_SYSTEM_PROMPT = `You are an expert email copywriter specializing in the film and entertainment industry. You write compelling, authentic emails for filmmakers, actors, directors, and film professionals to engage their audiences.

Your writing style:
- Authentic and personal, never corporate or salesy
- Connects the reader to the creative journey
- Uses film industry terminology naturally
- Creates excitement without being over-the-top
- Respects the audience's time with concise, impactful messaging

Key principles:
1. Ground every claim in the provided data - never hallucinate details
2. If information is missing, acknowledge it gracefully or omit that section
3. Maintain the creator's authentic voice and personality
4. Include clear calls-to-action that feel natural, not pushy
5. Write subject lines that intrigue without clickbait

Format guidelines:
- Use short paragraphs (2-3 sentences max)
- Include relevant emojis sparingly (1-2 per email max)
- Always provide both HTML and plain text versions
- Ensure alt text for any images mentioned`;

// ============================================
// TEMPLATE DEFINITIONS
// ============================================

export interface CampaignTemplateDefinition {
  key: string;
  name: string;
  description: string;
  category: "onboarding" | "engagement" | "announcement" | "event" | "promotional";
  systemPrompt: string;
  userPromptTemplate: string;
  availableVariables: string[];
  subjectLineTemplates: string[];
  supportedTones: string[];
  defaultTone: string;
  supportedBrevityLevels: string[];
  defaultBrevity: string;
  sortOrder: number;
}

export const SYSTEM_TEMPLATES: CampaignTemplateDefinition[] = [
  // 1. Welcome Email
  {
    key: "welcome",
    name: "Welcome Email",
    description: "Sent to new subscribers when they join your email list. Introduces you and sets expectations.",
    category: "onboarding",
    systemPrompt: FILM_EMAIL_SYSTEM_PROMPT,
    userPromptTemplate: `Write a warm welcome email for a new subscriber to {creator_name}'s email list.

Creator Info:
- Name: {creator_name}
- Bio: {bio}
- Location: {location}
- Current/Latest Project: {movie_title}
{tagline ? "- Tagline: " + tagline : ""}

The email should:
1. Thank them for subscribing
2. Briefly introduce the creator and their work
3. Set expectations for what kind of updates they'll receive
4. Include a call-to-action to {cta_text} at {cta_url}

Tone: {tone}
Length: {brevity}

Generate a subject line and email body in both HTML and plain text formats.`,
    availableVariables: ["creator_name", "bio", "location", "movie_title", "tagline", "cta_url", "cta_text"],
    subjectLineTemplates: [
      "Welcome to the journey, {first_name}! 🎬",
      "You're in! Here's what's coming next...",
      "Thanks for joining {creator_name}'s community",
      "Welcome aboard! Let's make movie magic together"
    ],
    supportedTones: ["heartfelt", "casual", "formal", "hype"],
    defaultTone: "heartfelt",
    supportedBrevityLevels: ["short", "medium", "detailed"],
    defaultBrevity: "short",
    sortOrder: 1,
  },

  // 2. Newsletter
  {
    key: "newsletter",
    name: "Newsletter Update",
    description: "Regular update email sharing news, behind-the-scenes content, and project progress.",
    category: "engagement",
    systemPrompt: FILM_EMAIL_SYSTEM_PROMPT,
    userPromptTemplate: `Write a newsletter update from {creator_name} to their subscribers.

Creator Info:
- Name: {creator_name}
- Bio: {bio}
- Location: {location}
{movie_title ? "- Current Project: " + movie_title : ""}
{tagline ? "- Project Tagline: " + tagline : ""}

Content to include:
{clip_highlights ? "- Recent Clips/Content: " + clip_highlights.join(", ") : ""}
{trailer_transcript_summary ? "- Trailer Summary: " + trailer_transcript_summary : ""}
{custom_content ? "- Additional Content: " + custom_content : ""}

The email should:
1. Open with a personal, engaging hook
2. Share 2-3 updates or pieces of news
3. Include behind-the-scenes insights if available
4. End with a call-to-action to {cta_text} at {cta_url}

Tone: {tone}
Length: {brevity}

Generate a subject line and email body in both HTML and plain text formats.`,
    availableVariables: ["creator_name", "bio", "location", "movie_title", "tagline", "clip_highlights", "trailer_transcript_summary", "custom_content", "cta_url", "cta_text"],
    subjectLineTemplates: [
      "What's been happening on set...",
      "Your monthly update from {creator_name}",
      "Behind the scenes: {movie_title}",
      "News, updates, and a sneak peek 👀"
    ],
    supportedTones: ["casual", "heartfelt", "informational", "hype"],
    defaultTone: "casual",
    supportedBrevityLevels: ["short", "medium", "detailed"],
    defaultBrevity: "medium",
    sortOrder: 2,
  },

  // 3. Coming Soon
  {
    key: "coming_soon",
    name: "Coming Soon Announcement",
    description: "Build anticipation for an upcoming film, project, or release.",
    category: "announcement",
    systemPrompt: FILM_EMAIL_SYSTEM_PROMPT,
    userPromptTemplate: `Write a "Coming Soon" announcement email from {creator_name} about their upcoming project.

Project Info:
- Title: {movie_title}
- Tagline: {tagline}
- Description/Logline: {description}
- Release Window: {release_window}
{trailer_transcript_summary ? "- Trailer Summary: " + trailer_transcript_summary : ""}

Creator Info:
- Name: {creator_name}
- Bio: {bio}

The email should:
1. Build excitement and anticipation
2. Reveal key details about the project without spoilers
3. Share what makes this project special
4. Include a call-to-action to {cta_text} at {cta_url}
5. Create urgency around staying tuned for more

Tone: {tone}
Length: {brevity}

Generate a subject line and email body in both HTML and plain text formats.`,
    availableVariables: ["creator_name", "bio", "movie_title", "tagline", "description", "release_window", "trailer_transcript_summary", "cta_url", "cta_text"],
    subjectLineTemplates: [
      "Something big is coming... 🎬",
      "{movie_title} - Coming {release_window}",
      "First look: My next project is almost here",
      "Mark your calendars: {movie_title}"
    ],
    supportedTones: ["hype", "formal", "heartfelt", "casual"],
    defaultTone: "hype",
    supportedBrevityLevels: ["short", "medium", "detailed"],
    defaultBrevity: "medium",
    sortOrder: 3,
  },

  // 4. Event/General
  {
    key: "event",
    name: "Event Announcement",
    description: "Announce any type of event - Q&A, live stream, panel, meet & greet, etc.",
    category: "event",
    systemPrompt: FILM_EMAIL_SYSTEM_PROMPT,
    userPromptTemplate: `Write an event announcement email from {creator_name}.

Event Details:
- Event Type: {event_type}
- Date: {event_date}
- Time: {event_time}
- Venue/Location: {event_venue}
{event_description ? "- Description: " + event_description : ""}
{movie_title ? "- Related Project: " + movie_title : ""}

Creator Info:
- Name: {creator_name}
{location ? "- Based in: " + location : ""}

The email should:
1. Announce the event with excitement
2. Provide all essential details (what, when, where)
3. Explain what attendees can expect
4. Create urgency with limited spots or ticket availability
5. Include a clear call-to-action to {cta_text} at {cta_url}

Tone: {tone}
Length: {brevity}

Generate a subject line and email body in both HTML and plain text formats.`,
    availableVariables: ["creator_name", "location", "movie_title", "event_type", "event_date", "event_time", "event_venue", "event_description", "cta_url", "cta_text"],
    subjectLineTemplates: [
      "You're invited: {event_type} on {event_date}",
      "Join me {event_date} for something special",
      "Don't miss this: {event_type}",
      "Save the date: {event_date} 📅"
    ],
    supportedTones: ["hype", "formal", "casual", "heartfelt"],
    defaultTone: "hype",
    supportedBrevityLevels: ["short", "medium", "detailed"],
    defaultBrevity: "medium",
    sortOrder: 4,
  },

  // 5. Screening/Panel
  {
    key: "screening",
    name: "Screening or Panel",
    description: "Announce a film screening, Q&A panel, or festival appearance.",
    category: "event",
    systemPrompt: FILM_EMAIL_SYSTEM_PROMPT,
    userPromptTemplate: `Write a screening/panel announcement email from {creator_name}.

Event Details:
- Type: {event_type} (screening, Q&A, panel discussion, festival appearance)
- Film: {movie_title}
{tagline ? "- Film Tagline: " + tagline : ""}
- Date: {event_date}
- Time: {event_time}
- Venue: {event_venue}
{event_description ? "- Event Details: " + event_description : ""}
{panel_guests ? "- Also appearing: " + panel_guests : ""}

Creator Info:
- Name: {creator_name}
- Role: {creator_role}
{bio ? "- Bio: " + bio : ""}

The email should:
1. Generate excitement about seeing the film
2. Highlight the Q&A/panel opportunity
3. Share any special guests or exclusive content
4. Provide logistics (tickets, parking, accessibility)
5. Include a clear call-to-action to {cta_text} at {cta_url}

Tone: {tone}
Length: {brevity}

Generate a subject line and email body in both HTML and plain text formats.`,
    availableVariables: ["creator_name", "creator_role", "bio", "movie_title", "tagline", "event_type", "event_date", "event_time", "event_venue", "event_description", "panel_guests", "cta_url", "cta_text"],
    subjectLineTemplates: [
      "See {movie_title} on the big screen + Q&A with me!",
      "Exclusive screening: {movie_title} - {event_date}",
      "Join me at {event_venue} for {movie_title}",
      "{movie_title} screening + live Q&A 🎬"
    ],
    supportedTones: ["hype", "formal", "heartfelt", "casual"],
    defaultTone: "hype",
    supportedBrevityLevels: ["short", "medium", "detailed"],
    defaultBrevity: "medium",
    sortOrder: 5,
  },

  // 6. Trailer Drop
  {
    key: "trailer_drop",
    name: "Trailer Drop",
    description: "Announce a new trailer release with maximum impact.",
    category: "announcement",
    systemPrompt: FILM_EMAIL_SYSTEM_PROMPT,
    userPromptTemplate: `Write a trailer drop announcement email from {creator_name}.

Trailer Info:
- Film: {movie_title}
- Tagline: {tagline}
{trailer_transcript_summary ? "- What the trailer reveals: " + trailer_transcript_summary : ""}
{release_window ? "- Film Release: " + release_window : ""}

Creator Info:
- Name: {creator_name}
{creator_role ? "- Role: " + creator_role : ""}
{bio ? "- Bio: " + bio : ""}

The email should:
1. Create maximum excitement - this is a big moment!
2. Tease what viewers will see without spoilers
3. Share the creator's personal excitement/journey
4. Include a prominent call-to-action to watch at {cta_url}
5. Ask subscribers to share with their networks

Tone: {tone}
Length: {brevity}

Generate a subject line and email body in both HTML and plain text formats.`,
    availableVariables: ["creator_name", "creator_role", "bio", "movie_title", "tagline", "trailer_transcript_summary", "release_window", "cta_url", "cta_text"],
    subjectLineTemplates: [
      "🎬 IT'S HERE: {movie_title} Official Trailer",
      "The wait is over - Watch the {movie_title} trailer NOW",
      "WATCH: {movie_title} trailer just dropped!",
      "First look: {movie_title} trailer 🎥"
    ],
    supportedTones: ["hype", "casual", "heartfelt", "formal"],
    defaultTone: "hype",
    supportedBrevityLevels: ["short", "medium", "detailed"],
    defaultBrevity: "short",
    sortOrder: 6,
  },

  // 7. Behind-the-Scenes Update
  {
    key: "bts_update",
    name: "Behind-the-Scenes Update",
    description: "Share behind-the-scenes content, production updates, or creative process insights.",
    category: "engagement",
    systemPrompt: FILM_EMAIL_SYSTEM_PROMPT,
    userPromptTemplate: `Write a behind-the-scenes update email from {creator_name}.

Project Info:
- Project: {movie_title}
{tagline ? "- Tagline: " + tagline : ""}
{production_stage ? "- Current Stage: " + production_stage : ""}

BTS Content:
{bts_highlights ? "- What to share: " + bts_highlights : ""}
{clip_highlights ? "- Clips/Content: " + clip_highlights.join(", ") : ""}
{fun_fact ? "- Fun fact: " + fun_fact : ""}
{challenge_overcome ? "- Challenge we overcame: " + challenge_overcome : ""}

Creator Info:
- Name: {creator_name}
{creator_role ? "- Role: " + creator_role : ""}

The email should:
1. Pull back the curtain on the creative process
2. Make subscribers feel like insiders
3. Share authentic moments from production
4. Balance professionalism with vulnerability
5. Include a call-to-action to {cta_text} at {cta_url}

Tone: {tone}
Length: {brevity}

Generate a subject line and email body in both HTML and plain text formats.`,
    availableVariables: ["creator_name", "creator_role", "movie_title", "tagline", "production_stage", "bts_highlights", "clip_highlights", "fun_fact", "challenge_overcome", "cta_url", "cta_text"],
    subjectLineTemplates: [
      "From the set of {movie_title}...",
      "Behind the scenes: What you didn't see",
      "Exclusive look at {movie_title} production",
      "The story behind the story 🎬"
    ],
    supportedTones: ["casual", "heartfelt", "informational", "hype"],
    defaultTone: "casual",
    supportedBrevityLevels: ["short", "medium", "detailed"],
    defaultBrevity: "medium",
    sortOrder: 7,
  },

  // 8. Premiere Reminder
  {
    key: "premiere_reminder",
    name: "Premiere Reminder",
    description: "Reminder email for an upcoming premiere, release, or major event.",
    category: "event",
    systemPrompt: FILM_EMAIL_SYSTEM_PROMPT,
    userPromptTemplate: `Write a premiere/release reminder email from {creator_name}.

Premiere Details:
- Film: {movie_title}
- Tagline: {tagline}
- Date: {event_date}
- Time: {event_time}
{event_venue ? "- Where to Watch: " + event_venue : ""}
{platform ? "- Streaming Platform: " + platform : ""}
{trailer_transcript_summary ? "- About the film: " + trailer_transcript_summary : ""}

Creator Info:
- Name: {creator_name}
{creator_role ? "- Role: " + creator_role : ""}

The email should:
1. Create urgency - the big day is almost here!
2. Remind of the date, time, and where to watch
3. Reignite excitement for the project
4. Ask for support (watch, share, review)
5. Include a clear call-to-action to {cta_text} at {cta_url}

Tone: {tone}
Length: {brevity}

Generate a subject line and email body in both HTML and plain text formats.`,
    availableVariables: ["creator_name", "creator_role", "movie_title", "tagline", "event_date", "event_time", "event_venue", "platform", "trailer_transcript_summary", "cta_url", "cta_text"],
    subjectLineTemplates: [
      "⏰ {movie_title} premieres in {days_until}!",
      "This is it - {movie_title} drops {event_date}",
      "Mark your calendar: {event_date} 🎬",
      "Don't forget: {movie_title} is almost here!"
    ],
    supportedTones: ["hype", "heartfelt", "casual", "formal"],
    defaultTone: "hype",
    supportedBrevityLevels: ["short", "medium", "detailed"],
    defaultBrevity: "short",
    sortOrder: 8,
  },
];

// ============================================
// QUERIES
// ============================================

/**
 * Get all active campaign templates
 */
export const getActiveTemplates = query({
  args: {},
  async handler(ctx) {
    const templates = await ctx.db
      .query("campaign_templates")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .collect();

    return templates.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  },
});

/**
 * Get a specific template by key
 */
export const getTemplateByKey = query({
  args: {
    key: v.string(),
  },
  async handler(ctx, { key }) {
    return ctx.db
      .query("campaign_templates")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
  },
});

/**
 * Get a specific template by key (internal version)
 */
export const getTemplateByKeyInternal = internalQuery({
  args: {
    key: v.string(),
  },
  async handler(ctx, { key }) {
    return ctx.db
      .query("campaign_templates")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
  },
});

/**
 * Get templates by category
 */
export const getTemplatesByCategory = query({
  args: {
    category: v.string(),
  },
  async handler(ctx, { category }) {
    const templates = await ctx.db
      .query("campaign_templates")
      .withIndex("by_category", (q) => q.eq("category", category))
      .collect();

    return templates
      .filter((t) => t.isActive)
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Seed system templates - call this once to initialize templates
 */
export const seedSystemTemplates = internalMutation({
  args: {},
  async handler(ctx) {
    const now = Date.now();

    for (const template of SYSTEM_TEMPLATES) {
      // Check if template already exists
      const existing = await ctx.db
        .query("campaign_templates")
        .withIndex("by_key", (q) => q.eq("key", template.key))
        .first();

      if (!existing) {
        await ctx.db.insert("campaign_templates", {
          ...template,
          isActive: true,
          isSystemTemplate: true,
          createdAt: now,
        });
        console.log(`Created template: ${template.key}`);
      } else {
        // Update existing template (but preserve isActive)
        await ctx.db.patch(existing._id, {
          name: template.name,
          description: template.description,
          category: template.category,
          systemPrompt: template.systemPrompt,
          userPromptTemplate: template.userPromptTemplate,
          availableVariables: template.availableVariables,
          subjectLineTemplates: template.subjectLineTemplates,
          supportedTones: template.supportedTones,
          defaultTone: template.defaultTone,
          supportedBrevityLevels: template.supportedBrevityLevels,
          defaultBrevity: template.defaultBrevity,
          sortOrder: template.sortOrder,
          updatedAt: now,
        });
        console.log(`Updated template: ${template.key}`);
      }
    }

    return { seeded: SYSTEM_TEMPLATES.length };
  },
});

/**
 * Create a custom template (for creator-specific templates)
 */
export const createCustomTemplate = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    systemPrompt: v.optional(v.string()),
    userPromptTemplate: v.string(),
    availableVariables: v.array(v.string()),
    subjectLineTemplates: v.array(v.string()),
    supportedTones: v.array(v.string()),
    defaultTone: v.string(),
    supportedBrevityLevels: v.array(v.string()),
    defaultBrevity: v.string(),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Generate a unique key
    const key = `custom_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const templateId = await ctx.db.insert("campaign_templates", {
      key,
      name: args.name,
      description: args.description,
      category: args.category,
      systemPrompt: args.systemPrompt || FILM_EMAIL_SYSTEM_PROMPT,
      userPromptTemplate: args.userPromptTemplate,
      availableVariables: args.availableVariables,
      subjectLineTemplates: args.subjectLineTemplates,
      supportedTones: args.supportedTones,
      defaultTone: args.defaultTone,
      supportedBrevityLevels: args.supportedBrevityLevels,
      defaultBrevity: args.defaultBrevity,
      isActive: true,
      isSystemTemplate: false,
      createdAt: Date.now(),
    });

    return { templateId, key };
  },
});

/**
 * Toggle template active status
 */
export const toggleTemplateActive = mutation({
  args: {
    templateId: v.id("campaign_templates"),
    isActive: v.boolean(),
  },
  async handler(ctx, { templateId, isActive }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    await ctx.db.patch(templateId, {
      isActive,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
