import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/**
 * Event types that can be logged to the analytics_events table.
 *
 * Core Events (existing):
 * - page_view: User visited the public page
 * - clip_played: User played a clip/video
 * - clip_shared: User shared a clip
 * - email_captured: User submitted email via modal
 * - inquiry_submitted: User submitted a booking inquiry
 * - comment_submitted: User submitted a comment
 * - user_signup: New user registered
 * - profile_created: User created an actor profile
 * - onboarding_completed: User completed onboarding
 *
 * Granular CTA Events:
 * - watch_cta_clicked: User clicked the Watch CTA button in hero
 * - get_updates_clicked: User clicked Get Updates button
 * - social_link_clicked: User clicked a social media link
 * - share_button_clicked: User clicked the share button
 *
 * Navigation Events:
 * - tab_changed: User changed tabs on the page
 * - filmography_item_clicked: User clicked a film in filmography
 * - project_selected: User selected a project to view trailer
 *
 * Video Engagement Events:
 * - video_play: User started playing video
 * - video_pause: User paused video
 * - video_mute_toggle: User toggled mute
 * - video_fullscreen: User entered fullscreen
 * - video_progress_25: User watched 25% of video
 * - video_progress_50: User watched 50% of video
 * - video_progress_75: User watched 75% of video
 * - video_completed: User watched video to completion
 *
 * Gallery Events:
 * - generated_clip_viewed: User viewed a generated clip
 * - generated_clip_played: User played a generated clip
 * - processing_clip_viewed: User viewed an uploaded clip
 * - processing_clip_played: User played an uploaded clip
 *
 * Engagement Events:
 * - scroll_depth_25: User scrolled 25% of page
 * - scroll_depth_50: User scrolled 50% of page
 * - scroll_depth_75: User scrolled 75% of page
 * - scroll_depth_100: User scrolled to bottom
 * - time_on_page_30s: User spent 30 seconds on page
 * - time_on_page_60s: User spent 60 seconds on page
 * - time_on_page_180s: User spent 3 minutes on page
 *
 * Deep Analytics Events (for future module):
 * - asset_impression: Asset was viewed/displayed
 * - asset_engagement: User engaged with asset (click, play, etc.)
 * - social_share_intent: User initiated social share
 * - social_share_completed: User completed social share
 * - outbound_link_clicked: User clicked external link
 */
export type EventType =
  // Core events
  | "page_view"
  | "clip_played"
  | "clip_shared"
  | "email_captured"
  | "inquiry_submitted"
  | "comment_submitted"
  | "user_signup"
  | "profile_created"
  | "onboarding_completed"
  // Granular CTA events
  | "watch_cta_clicked"
  | "get_updates_clicked"
  | "social_link_clicked"
  | "share_button_clicked"
  // Navigation events
  | "tab_changed"
  | "filmography_item_clicked"
  | "project_selected"
  // Video engagement events
  | "video_play"
  | "video_pause"
  | "video_mute_toggle"
  | "video_fullscreen"
  | "video_progress_25"
  | "video_progress_50"
  | "video_progress_75"
  | "video_completed"
  // Gallery events
  | "generated_clip_viewed"
  | "generated_clip_played"
  | "processing_clip_viewed"
  | "processing_clip_played"
  // Engagement events
  | "scroll_depth_25"
  | "scroll_depth_50"
  | "scroll_depth_75"
  | "scroll_depth_100"
  | "time_on_page_30s"
  | "time_on_page_60s"
  | "time_on_page_180s"
  // Deep Analytics events
  | "asset_impression"
  | "asset_engagement"
  | "social_share_intent"
  | "social_share_completed"
  | "outbound_link_clicked";

/**
 * Event metadata schema for granular tracking.
 */
const eventMetadataSchema = v.optional(v.object({
  // CTA tracking
  ctaLabel: v.optional(v.string()),
  ctaUrl: v.optional(v.string()),
  ctaPosition: v.optional(v.string()),
  // Social tracking
  socialPlatform: v.optional(v.string()),
  socialAction: v.optional(v.string()),
  // Video tracking
  videoProgress: v.optional(v.number()),
  videoDuration: v.optional(v.number()),
  videoCurrentTime: v.optional(v.number()),
  // Navigation tracking
  tabName: v.optional(v.string()),
  previousTab: v.optional(v.string()),
  // Asset tracking
  assetId: v.optional(v.string()),
  assetType: v.optional(v.string()),
  assetTitle: v.optional(v.string()),
  // Project tracking
  projectId: v.optional(v.string()),
  projectTitle: v.optional(v.string()),
  // Scroll tracking
  scrollDepth: v.optional(v.number()),
  // Time tracking
  timeOnPage: v.optional(v.number()),
  // Device info
  deviceType: v.optional(v.string()),
  screenWidth: v.optional(v.number()),
  screenHeight: v.optional(v.number()),
  // Outbound links
  outboundUrl: v.optional(v.string()),
  outboundLabel: v.optional(v.string()),
}));

/**
 * Log an analytics event.
 * This is a public mutation for client-side event logging.
 */
export const logEvent = mutation({
  args: {
    actorProfileId: v.optional(v.id("actor_profiles")),
    projectId: v.optional(v.id("projects")),
    clipId: v.optional(v.id("clips")),
    eventType: v.string(),
    sessionId: v.string(),
    userAgent: v.optional(v.string()),
    referrer: v.optional(v.string()),
    metadata: eventMetadataSchema,
  },
  async handler(ctx, args) {
    await ctx.db.insert("analytics_events", {
      actorProfileId: args.actorProfileId,
      projectId: args.projectId,
      clipId: args.clipId,
      eventType: args.eventType,
      sessionId: args.sessionId,
      userAgent: args.userAgent,
      referrer: args.referrer,
      metadata: args.metadata,
    });
    return { ok: true };
  },
});

/**
 * Internal mutation for server-side event logging (from other mutations).
 */
export const logEventInternal = internalMutation({
  args: {
    actorProfileId: v.optional(v.id("actor_profiles")),
    projectId: v.optional(v.id("projects")),
    clipId: v.optional(v.id("clips")),
    eventType: v.string(),
    sessionId: v.optional(v.string()),
  },
  async handler(ctx, args) {
    await ctx.db.insert("analytics_events", {
      actorProfileId: args.actorProfileId,
      projectId: args.projectId,
      clipId: args.clipId,
      eventType: args.eventType,
      sessionId: args.sessionId ?? `server-${Date.now()}`,
    });
    return { ok: true };
  },
});

/**
 * Get recent activity feed for an actor profile.
 * Returns the most recent events for display in the dashboard.
 */
export const getActivityFeed = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    limit: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    // Verify the user owns this profile
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return [];
    }

    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile || profile.userId !== user._id) {
      return [];
    }

    // Get recent events for this profile
    const limit = args.limit ?? 20;
    const events = await ctx.db
      .query("analytics_events")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", args.actorProfileId)
      )
      .order("desc")
      .take(limit);

    // Enrich events with clip titles where applicable
    const enrichedEvents = await Promise.all(
      events.map(async (event) => {
        let clipTitle: string | undefined;
        if (event.clipId) {
          const clip = await ctx.db.get(event.clipId);
          clipTitle = clip?.title;
        }

        return {
          id: event._id,
          eventType: event.eventType,
          timestamp: event._creationTime,
          clipTitle,
          referrer: event.referrer,
        };
      })
    );

    return enrichedEvents;
  },
});

/**
 * Get analytics overview for an actor profile.
 * Returns aggregated metrics for the dashboard.
 */
export const getOverview = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    daysBack: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // Verify the user owns this profile
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return null;
    }

    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile || profile.userId !== user._id) {
      return null;
    }

    // Get all events for this profile
    const allEvents = await ctx.db
      .query("analytics_events")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", args.actorProfileId)
      )
      .collect();

    // Calculate time range
    const daysBack = args.daysBack ?? 30;
    const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    // Filter to recent events
    const recentEvents = allEvents.filter(
      (e) => e._creationTime >= cutoffTime
    );

    // Aggregate by event type
    const counts: Record<string, number> = {};
    for (const event of recentEvents) {
      counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
    }

    // Count unique sessions
    const uniqueSessions = new Set(recentEvents.map(e => e.sessionId));

    return {
      period: `${daysBack} days`,
      totalEvents: recentEvents.length,
      uniqueVisitors: uniqueSessions.size,
      // Core metrics
      pageViews: counts["page_view"] ?? 0,
      clipPlays: counts["clip_played"] ?? 0,
      clipShares: counts["clip_shared"] ?? 0,
      emailCaptures: counts["email_captured"] ?? 0,
      inquiries: counts["inquiry_submitted"] ?? 0,
      comments: counts["comment_submitted"] ?? 0,
      // Granular CTA metrics
      ctaMetrics: {
        watchCtaClicks: counts["watch_cta_clicked"] ?? 0,
        getUpdatesClicks: counts["get_updates_clicked"] ?? 0,
        shareButtonClicks: counts["share_button_clicked"] ?? 0,
        socialLinkClicks: counts["social_link_clicked"] ?? 0,
        outboundLinkClicks: counts["outbound_link_clicked"] ?? 0,
      },
      // Video engagement
      videoEngagement: {
        plays: counts["video_play"] ?? 0,
        pauses: counts["video_pause"] ?? 0,
        muteToggles: counts["video_mute_toggle"] ?? 0,
        fullscreenEnters: counts["video_fullscreen"] ?? 0,
        progress25: counts["video_progress_25"] ?? 0,
        progress50: counts["video_progress_50"] ?? 0,
        progress75: counts["video_progress_75"] ?? 0,
        completed: counts["video_completed"] ?? 0,
      },
      // Tab engagement
      tabEngagement: {
        tabChanges: counts["tab_changed"] ?? 0,
        projectSelections: counts["project_selected"] ?? 0,
        filmographyClicks: counts["filmography_item_clicked"] ?? 0,
      },
      // Gallery metrics
      galleryMetrics: {
        generatedClipViews: counts["generated_clip_viewed"] ?? 0,
        generatedClipPlays: counts["generated_clip_played"] ?? 0,
        processingClipViews: counts["processing_clip_viewed"] ?? 0,
        processingClipPlays: counts["processing_clip_played"] ?? 0,
      },
      // Engagement depth
      engagementDepth: {
        scrollDepth25: counts["scroll_depth_25"] ?? 0,
        scrollDepth50: counts["scroll_depth_50"] ?? 0,
        scrollDepth75: counts["scroll_depth_75"] ?? 0,
        scrollDepth100: counts["scroll_depth_100"] ?? 0,
        timeOnPage30s: counts["time_on_page_30s"] ?? 0,
        timeOnPage60s: counts["time_on_page_60s"] ?? 0,
        timeOnPage180s: counts["time_on_page_180s"] ?? 0,
      },
    };
  },
});

/**
 * Get top clips by play count for an actor profile.
 */
export const getTopClips = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    limit: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    // Verify the user owns this profile
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return [];
    }

    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile || profile.userId !== user._id) {
      return [];
    }

    // Get all clip_played events
    const events = await ctx.db
      .query("analytics_events")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", args.actorProfileId)
      )
      .filter((q) => q.eq(q.field("eventType"), "clip_played"))
      .collect();

    // Count plays per clip
    const playCounts = new Map<string, number>();
    for (const event of events) {
      if (event.clipId) {
        const count = playCounts.get(event.clipId) ?? 0;
        playCounts.set(event.clipId, count + 1);
      }
    }

    // Sort by count and get top clips
    const sorted = Array.from(playCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, args.limit ?? 5);

    // Fetch clip details
    const topClips = await Promise.all(
      sorted.map(async ([clipId, playCount]) => {
        const clip = await ctx.db.get(clipId as Id<"clips">);
        return {
          clipId,
          title: clip?.title ?? "Unknown",
          playCount,
        };
      })
    );

    return topClips;
  },
});

/**
 * Get analytics broken down by project for an actor profile.
 * Shows CTA clicks, video plays, and engagement per project.
 */
export const getProjectAnalytics = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    daysBack: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // Verify the user owns this profile
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return null;
    }

    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile || profile.userId !== user._id) {
      return null;
    }

    // Get all projects for this profile
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.actorProfileId))
      .collect();

    // Get all events for this profile
    const daysBack = args.daysBack ?? 30;
    const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    const allEvents = await ctx.db
      .query("analytics_events")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.actorProfileId))
      .collect();

    const recentEvents = allEvents.filter((e) => e._creationTime >= cutoffTime);

    // Aggregate events by project
    const projectMetrics = new Map<string, {
      projectId: string;
      title: string;
      watchCtaClicks: number;
      getUpdatesClicks: number;
      shareClicks: number;
      videoPlays: number;
      videoPauses: number;
      fullscreenEnters: number;
      totalEngagements: number;
    }>();

    // Initialize with all projects
    for (const project of projects) {
      projectMetrics.set(project._id, {
        projectId: project._id,
        title: project.title,
        watchCtaClicks: 0,
        getUpdatesClicks: 0,
        shareClicks: 0,
        videoPlays: 0,
        videoPauses: 0,
        fullscreenEnters: 0,
        totalEngagements: 0,
      });
    }

    // Count events by project
    for (const event of recentEvents) {
      // Get projectId from event or metadata
      let eventProjectId = event.projectId as string | undefined;

      // Also check metadata for projectId (for events tracked with project context)
      const metadata = event.metadata as Record<string, any> | undefined;
      if (!eventProjectId && metadata?.projectId) {
        eventProjectId = metadata.projectId;
      }

      if (!eventProjectId) continue;

      const metrics = projectMetrics.get(eventProjectId);
      if (!metrics) continue;

      switch (event.eventType) {
        case "watch_cta_clicked":
          metrics.watchCtaClicks++;
          metrics.totalEngagements++;
          break;
        case "get_updates_clicked":
          metrics.getUpdatesClicks++;
          metrics.totalEngagements++;
          break;
        case "share_button_clicked":
          metrics.shareClicks++;
          metrics.totalEngagements++;
          break;
        case "video_play":
          metrics.videoPlays++;
          metrics.totalEngagements++;
          break;
        case "video_pause":
          metrics.videoPauses++;
          break;
        case "video_fullscreen":
          metrics.fullscreenEnters++;
          metrics.totalEngagements++;
          break;
      }

      projectMetrics.set(eventProjectId, metrics);
    }

    // Convert to array and sort by total engagements
    const projectAnalytics = Array.from(projectMetrics.values())
      .sort((a, b) => b.totalEngagements - a.totalEngagements);

    return {
      period: `${daysBack} days`,
      projects: projectAnalytics,
      totalProjects: projects.length,
    };
  },
});

// =============================================================================
// SNAPSHOT MANAGEMENT
// =============================================================================

/**
 * Upsert a daily analytics snapshot for a profile.
 * Used by both GA4 import and Convex aggregation.
 */
export const upsertSnapshot = internalMutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    slug: v.string(),
    date: v.string(),
    pageViews: v.number(),
    uniqueVisitors: v.number(),
    avgSessionDuration: v.optional(v.number()),
    bounceRate: v.optional(v.number()),
    clipPlays: v.number(),
    clipShares: v.number(),
    commentCount: v.number(),
    emailCaptures: v.number(),
    inquiries: v.number(),
    socialClicks: v.optional(v.number()),
    watchCtaClicks: v.optional(v.number()),
    // Granular CTA metrics
    ctaMetrics: v.optional(v.object({
      watchCtaClicks: v.optional(v.number()),
      getUpdatesClicks: v.optional(v.number()),
      shareButtonClicks: v.optional(v.number()),
      outboundLinkClicks: v.optional(v.number()),
    })),
    // Social engagement breakdown
    socialEngagement: v.optional(v.object({
      instagramClicks: v.optional(v.number()),
      facebookClicks: v.optional(v.number()),
      youtubeClicks: v.optional(v.number()),
      tiktokClicks: v.optional(v.number()),
      imdbClicks: v.optional(v.number()),
      websiteClicks: v.optional(v.number()),
    })),
    // Video engagement metrics
    videoEngagement: v.optional(v.object({
      totalPlays: v.optional(v.number()),
      uniquePlays: v.optional(v.number()),
      avgWatchTime: v.optional(v.number()),
      completionRate: v.optional(v.number()),
      progress25: v.optional(v.number()),
      progress50: v.optional(v.number()),
      progress75: v.optional(v.number()),
      progress100: v.optional(v.number()),
    })),
    // Tab navigation metrics
    tabEngagement: v.optional(v.object({
      aboutViews: v.optional(v.number()),
      commentsViews: v.optional(v.number()),
      filmsViews: v.optional(v.number()),
      clipsViews: v.optional(v.number()),
      contactViews: v.optional(v.number()),
    })),
    // Scroll depth metrics
    scrollDepth: v.optional(v.object({
      reached25: v.optional(v.number()),
      reached50: v.optional(v.number()),
      reached75: v.optional(v.number()),
      reached100: v.optional(v.number()),
    })),
    // Time on page metrics
    timeOnPage: v.optional(v.object({
      avg: v.optional(v.number()),
      reached30s: v.optional(v.number()),
      reached60s: v.optional(v.number()),
      reached180s: v.optional(v.number()),
    })),
    trafficSources: v.optional(
      v.object({
        direct: v.number(),
        organic: v.number(),
        social: v.number(),
        referral: v.number(),
        email: v.number(),
      })
    ),
    topReferrers: v.optional(
      v.array(
        v.object({
          referrer: v.string(),
          visitors: v.number(),
        })
      )
    ),
    deviceBreakdown: v.optional(
      v.object({
        mobile: v.number(),
        desktop: v.number(),
        tablet: v.number(),
      })
    ),
    source: v.optional(v.string()),
  },
  async handler(ctx, args) {
    // Check if snapshot already exists for this profile and date
    const existing = await ctx.db
      .query("analytics_snapshots")
      .withIndex("by_profile_date", (q) =>
        q.eq("actorProfileId", args.actorProfileId).eq("date", args.date)
      )
      .first();

    const snapshotData = {
      actorProfileId: args.actorProfileId,
      slug: args.slug,
      date: args.date,
      pageViews: args.pageViews,
      uniqueVisitors: args.uniqueVisitors,
      avgSessionDuration: args.avgSessionDuration,
      bounceRate: args.bounceRate,
      clipPlays: args.clipPlays,
      clipShares: args.clipShares,
      commentCount: args.commentCount,
      emailCaptures: args.emailCaptures,
      inquiries: args.inquiries,
      socialClicks: args.socialClicks,
      watchCtaClicks: args.watchCtaClicks,
      ctaMetrics: args.ctaMetrics,
      socialEngagement: args.socialEngagement,
      videoEngagement: args.videoEngagement,
      tabEngagement: args.tabEngagement,
      scrollDepth: args.scrollDepth,
      timeOnPage: args.timeOnPage,
      trafficSources: args.trafficSources,
      topReferrers: args.topReferrers,
      deviceBreakdown: args.deviceBreakdown,
      source: args.source ?? "convex",
      createdAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, snapshotData);
      return existing._id;
    } else {
      return await ctx.db.insert("analytics_snapshots", snapshotData);
    }
  },
});

/**
 * Aggregate yesterday's Convex events into a snapshot for each profile.
 * This runs daily via cron and provides analytics even without GA4.
 */
export const aggregateDailySnapshots = internalAction({
  handler: async (ctx): Promise<{ processed: number; date: string }> => {
    // Get yesterday's date range
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const startOfYesterday = yesterday.getTime();
    const endOfYesterday = startOfYesterday + 24 * 60 * 60 * 1000;
    const dateString = yesterday.toISOString().split("T")[0];

    // Get all actor profiles
    const profiles = await ctx.runQuery(internal.analytics.getAllProfiles);

    for (const profile of profiles) {
      // Get events for this profile from yesterday
      const events = await ctx.runQuery(
        internal.analytics.getEventsForDateRange,
        {
          actorProfileId: profile._id,
          startTime: startOfYesterday,
          endTime: endOfYesterday,
        }
      );

      // Aggregate events
      const counts: Record<string, number> = {};
      const sessions = new Set<string>();

      for (const event of events) {
        counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
        if (event.sessionId) {
          sessions.add(event.sessionId);
        }
      }

      // Create snapshot with granular metrics
      await ctx.runMutation(internal.analytics.upsertSnapshot, {
        actorProfileId: profile._id,
        slug: profile.slug,
        date: dateString,
        pageViews: counts["page_view"] ?? 0,
        uniqueVisitors: sessions.size,
        clipPlays: counts["clip_played"] ?? 0,
        clipShares: counts["clip_shared"] ?? 0,
        commentCount: counts["comment_submitted"] ?? 0,
        emailCaptures: counts["email_captured"] ?? 0,
        inquiries: counts["inquiry_submitted"] ?? 0,
        watchCtaClicks: counts["watch_cta_clicked"] ?? 0,
        socialClicks: counts["social_link_clicked"] ?? 0,
        // Granular CTA metrics
        ctaMetrics: {
          watchCtaClicks: counts["watch_cta_clicked"] ?? 0,
          getUpdatesClicks: counts["get_updates_clicked"] ?? 0,
          shareButtonClicks: counts["share_button_clicked"] ?? 0,
          outboundLinkClicks: counts["outbound_link_clicked"] ?? 0,
        },
        // Video engagement metrics
        videoEngagement: {
          totalPlays: counts["video_play"] ?? 0,
          progress25: counts["video_progress_25"] ?? 0,
          progress50: counts["video_progress_50"] ?? 0,
          progress75: counts["video_progress_75"] ?? 0,
          progress100: counts["video_completed"] ?? 0,
        },
        // Scroll depth metrics
        scrollDepth: {
          reached25: counts["scroll_depth_25"] ?? 0,
          reached50: counts["scroll_depth_50"] ?? 0,
          reached75: counts["scroll_depth_75"] ?? 0,
          reached100: counts["scroll_depth_100"] ?? 0,
        },
        // Time on page metrics
        timeOnPage: {
          reached30s: counts["time_on_page_30s"] ?? 0,
          reached60s: counts["time_on_page_60s"] ?? 0,
          reached180s: counts["time_on_page_180s"] ?? 0,
        },
        source: "convex",
      });
    }

    return { processed: profiles.length, date: dateString };
  },
});

/**
 * Import analytics data from GA4 Data API.
 * Requires GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_KEY environment variables.
 */
export const importFromGA4 = internalAction({
  handler: async (ctx): Promise<{ processed: number; date: string; source?: string }> => {
    const propertyId = process.env.GA4_PROPERTY_ID;
    const serviceAccountKey = process.env.GA4_SERVICE_ACCOUNT_KEY;

    if (!propertyId || !serviceAccountKey) {
      console.log(
        "GA4 credentials not configured. Falling back to Convex-only aggregation."
      );
      // Fall back to Convex aggregation
      return await ctx.runAction(internal.analytics.aggregateDailySnapshots);
    }

    try {
      // Dynamic import to avoid issues when credentials aren't set
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { BetaAnalyticsDataClient } = (await import(
        /* webpackIgnore: true */ "@google-analytics/data"
      )) as { BetaAnalyticsDataClient: any };

      const credentials = JSON.parse(serviceAccountKey);
      const client = new BetaAnalyticsDataClient({ credentials });

      // Get yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateString = yesterday.toISOString().split("T")[0];

      // Run GA4 report
      const [response] = await client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: dateString, endDate: dateString }],
        dimensions: [
          { name: "customEvent:actor_slug" },
          { name: "sessionDefaultChannelGroup" },
          { name: "deviceCategory" },
        ],
        metrics: [
          { name: "screenPageViews" },
          { name: "activeUsers" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
          { name: "eventCount" },
        ],
      });

      // Process and aggregate by slug
      const slugData = new Map<
        string,
        {
          pageViews: number;
          uniqueVisitors: number;
          avgSessionDuration: number;
          bounceRate: number;
          trafficSources: Record<string, number>;
          deviceBreakdown: Record<string, number>;
        }
      >();

      for (const row of response.rows || []) {
        const slug = row.dimensionValues?.[0]?.value;
        const channel = row.dimensionValues?.[1]?.value || "direct";
        const device = row.dimensionValues?.[2]?.value || "desktop";

        if (!slug || slug === "(not set)") continue;

        const existing = slugData.get(slug) || {
          pageViews: 0,
          uniqueVisitors: 0,
          avgSessionDuration: 0,
          bounceRate: 0,
          trafficSources: { direct: 0, organic: 0, social: 0, referral: 0, email: 0 },
          deviceBreakdown: { mobile: 0, desktop: 0, tablet: 0 },
        };

        existing.pageViews += parseInt(row.metricValues?.[0]?.value || "0");
        existing.uniqueVisitors += parseInt(row.metricValues?.[1]?.value || "0");
        existing.avgSessionDuration = parseFloat(row.metricValues?.[2]?.value || "0");
        existing.bounceRate = parseFloat(row.metricValues?.[3]?.value || "0") * 100;

        // Map channel to traffic source
        const channelMap: Record<string, string> = {
          "Direct": "direct",
          "Organic Search": "organic",
          "Organic Social": "social",
          "Referral": "referral",
          "Email": "email",
        };
        const sourceKey = channelMap[channel] || "direct";
        existing.trafficSources[sourceKey] += parseInt(row.metricValues?.[1]?.value || "0");

        // Device breakdown
        const deviceKey = device.toLowerCase();
        if (deviceKey in existing.deviceBreakdown) {
          existing.deviceBreakdown[deviceKey] += parseInt(row.metricValues?.[1]?.value || "0");
        }

        slugData.set(slug, existing);
      }

      // Get profiles by slug and upsert snapshots
      let processed = 0;
      for (const [slug, data] of slugData) {
        const profile = await ctx.runQuery(internal.analytics.getProfileBySlug, { slug });
        if (!profile) continue;

        // Also get Convex event data to merge
        const convexEvents = await ctx.runQuery(
          internal.analytics.getEventsForDateRange,
          {
            actorProfileId: profile._id,
            startTime: yesterday.setHours(0, 0, 0, 0),
            endTime: yesterday.getTime() + 24 * 60 * 60 * 1000,
          }
        );

        const eventCounts: Record<string, number> = {};
        for (const event of convexEvents) {
          eventCounts[event.eventType] = (eventCounts[event.eventType] ?? 0) + 1;
        }

        await ctx.runMutation(internal.analytics.upsertSnapshot, {
          actorProfileId: profile._id,
          slug,
          date: dateString,
          pageViews: data.pageViews,
          uniqueVisitors: data.uniqueVisitors,
          avgSessionDuration: data.avgSessionDuration,
          bounceRate: data.bounceRate,
          clipPlays: eventCounts["clip_played"] ?? 0,
          clipShares: eventCounts["clip_shared"] ?? 0,
          commentCount: eventCounts["comment_submitted"] ?? 0,
          emailCaptures: eventCounts["email_captured"] ?? 0,
          inquiries: eventCounts["inquiry_submitted"] ?? 0,
          trafficSources: {
            direct: data.trafficSources.direct,
            organic: data.trafficSources.organic,
            social: data.trafficSources.social,
            referral: data.trafficSources.referral,
            email: data.trafficSources.email,
          },
          deviceBreakdown: {
            mobile: data.deviceBreakdown.mobile,
            desktop: data.deviceBreakdown.desktop,
            tablet: data.deviceBreakdown.tablet,
          },
          source: "ga4",
        });

        processed++;
      }

      return { processed, date: dateString, source: "ga4" };
    } catch (error) {
      console.error("GA4 import failed:", error);
      // Fall back to Convex aggregation
      return await ctx.runAction(internal.analytics.aggregateDailySnapshots);
    }
  },
});

// =============================================================================
// INTERNAL QUERIES (for aggregation)
// =============================================================================

/**
 * Get all actor profiles (internal use).
 */
export const getAllProfiles = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("actor_profiles").collect();
  },
});

/**
 * Get profile by slug (internal use).
 */
export const getProfileBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
  },
});

/**
 * Get events for a date range (internal use).
 */
export const getEventsForDateRange = internalQuery({
  args: {
    actorProfileId: v.id("actor_profiles"),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, { actorProfileId, startTime, endTime }) => {
    const events = await ctx.db
      .query("analytics_events")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();

    return events.filter(
      (e) => e._creationTime >= startTime && e._creationTime < endTime
    );
  },
});

// =============================================================================
// DASHBOARD QUERIES (use snapshots for historical data)
// =============================================================================

/**
 * Get analytics snapshots for a date range.
 * Use this for charts and historical trends.
 */
export const getSnapshots = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    startDate: v.string(),
    endDate: v.string(),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    // Verify the user owns this profile
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return [];
    }

    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile || profile.userId !== user._id) {
      return [];
    }

    // Get snapshots for this profile
    const snapshots = await ctx.db
      .query("analytics_snapshots")
      .withIndex("by_profile", (q) => q.eq("actorProfileId", args.actorProfileId))
      .collect();

    // Filter by date range
    return snapshots
      .filter((s) => s.date >= args.startDate && s.date <= args.endDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  },
});

/**
 * Get aggregated metrics from snapshots for a date range.
 */
export const getAggregatedMetrics = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    daysBack: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // Verify the user owns this profile
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return null;
    }

    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile || profile.userId !== user._id) {
      return null;
    }

    // Calculate date range
    const daysBack = args.daysBack ?? 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // Get snapshots
    const snapshots = await ctx.db
      .query("analytics_snapshots")
      .withIndex("by_profile", (q) => q.eq("actorProfileId", args.actorProfileId))
      .collect();

    const filteredSnapshots = snapshots.filter(
      (s) => s.date >= startDateStr && s.date <= endDateStr
    );

    if (filteredSnapshots.length === 0) {
      // Fall back to real-time events
      return null;
    }

    // Aggregate
    const totals = {
      pageViews: 0,
      uniqueVisitors: 0,
      clipPlays: 0,
      clipShares: 0,
      emailCaptures: 0,
      inquiries: 0,
      comments: 0,
      avgSessionDuration: 0,
      bounceRate: 0,
    };

    let durationCount = 0;
    let bounceCount = 0;

    for (const snapshot of filteredSnapshots) {
      totals.pageViews += snapshot.pageViews;
      totals.uniqueVisitors += snapshot.uniqueVisitors;
      totals.clipPlays += snapshot.clipPlays;
      totals.clipShares += snapshot.clipShares;
      totals.emailCaptures += snapshot.emailCaptures;
      totals.inquiries += snapshot.inquiries;
      totals.comments += snapshot.commentCount;

      if (snapshot.avgSessionDuration) {
        totals.avgSessionDuration += snapshot.avgSessionDuration;
        durationCount++;
      }
      if (snapshot.bounceRate) {
        totals.bounceRate += snapshot.bounceRate;
        bounceCount++;
      }
    }

    return {
      period: `${daysBack} days`,
      daysWithData: filteredSnapshots.length,
      ...totals,
      avgSessionDuration: durationCount > 0 ? totals.avgSessionDuration / durationCount : undefined,
      bounceRate: bounceCount > 0 ? totals.bounceRate / bounceCount : undefined,
    };
  },
});
