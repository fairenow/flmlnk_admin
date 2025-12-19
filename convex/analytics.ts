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
 */
export type EventType =
  | "page_view"
  | "clip_played"
  | "clip_shared"
  | "email_captured"
  | "inquiry_submitted"
  | "comment_submitted"
  | "user_signup"
  | "profile_created"
  | "onboarding_completed";

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

    return {
      period: `${daysBack} days`,
      totalEvents: recentEvents.length,
      pageViews: counts["page_view"] ?? 0,
      clipPlays: counts["clip_played"] ?? 0,
      clipShares: counts["clip_shared"] ?? 0,
      emailCaptures: counts["email_captured"] ?? 0,
      inquiries: counts["inquiry_submitted"] ?? 0,
      comments: counts["comment_submitted"] ?? 0,
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

      // Create snapshot
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
