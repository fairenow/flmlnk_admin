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
  | "onboarding_completed"
  | "social_link_clicked";

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
        socialClicks: counts["social_link_clicked"] ?? 0,
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

// =============================================================================
// ADMIN QUERIES - Deep Analytics
// =============================================================================

/**
 * Get analytics overview for all users (admin view)
 * Supports filters for location, trailer status, and film count
 */
export const getDeepAnalyticsAdmin = query({
  args: {
    daysBack: v.optional(v.number()),
    // Location filters
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    country: v.optional(v.string()),
    // Content filters
    hasTrailer: v.optional(v.boolean()),
    filmCount: v.optional(v.union(v.literal("one"), v.literal("multiple"))),
  },
  async handler(ctx, args) {
    const daysBack = args.daysBack ?? 30;
    const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    // Get all actor profiles
    let profiles = await ctx.db.query("actor_profiles").collect();

    // Apply location filter if provided
    if (args.city || args.state || args.country) {
      profiles = profiles.filter((profile) => {
        const location = profile.location?.toLowerCase() || "";
        if (args.city && !location.includes(args.city.toLowerCase())) return false;
        if (args.state && !location.includes(args.state.toLowerCase())) return false;
        if (args.country && !location.includes(args.country.toLowerCase())) return false;
        return true;
      });
    }

    // Apply trailer filter
    if (args.hasTrailer !== undefined) {
      const profilesWithTrailerInfo = await Promise.all(
        profiles.map(async (profile) => {
          const projects = await ctx.db
            .query("projects")
            .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
            .collect();
          const hasTrailer = projects.some((p) => p.trailerUrl);
          return { profile, hasTrailer };
        })
      );
      profiles = profilesWithTrailerInfo
        .filter((p) => p.hasTrailer === args.hasTrailer)
        .map((p) => p.profile);
    }

    // Apply film count filter
    if (args.filmCount) {
      const profilesWithFilmCount = await Promise.all(
        profiles.map(async (profile) => {
          const projects = await ctx.db
            .query("projects")
            .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
            .collect();
          return { profile, filmCount: projects.length };
        })
      );
      profiles = profilesWithFilmCount
        .filter((p) =>
          args.filmCount === "one" ? p.filmCount === 1 : p.filmCount > 1
        )
        .map((p) => p.profile);
    }

    // Aggregate analytics for filtered profiles
    const profileIds = new Set(profiles.map((p) => p._id.toString()));

    // Get events for all filtered profiles
    const allEvents = await ctx.db.query("analytics_events").collect();
    const filteredEvents = allEvents.filter(
      (e) =>
        e.actorProfileId &&
        profileIds.has(e.actorProfileId.toString()) &&
        e._creationTime >= cutoffTime
    );

    // Aggregate by event type
    const counts: Record<string, number> = {};
    const sessionsByProfile = new Map<string, Set<string>>();

    for (const event of filteredEvents) {
      counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
      if (event.actorProfileId) {
        const profileKey = event.actorProfileId.toString();
        if (!sessionsByProfile.has(profileKey)) {
          sessionsByProfile.set(profileKey, new Set());
        }
        if (event.sessionId) {
          sessionsByProfile.get(profileKey)!.add(event.sessionId);
        }
      }
    }

    // Calculate unique sessions across all profiles
    const allSessions = new Set<string>();
    for (const sessions of sessionsByProfile.values()) {
      for (const session of sessions) {
        allSessions.add(session);
      }
    }

    // Get users info for matched profiles
    const userDetails = await Promise.all(
      profiles.map(async (profile) => {
        const user = await ctx.db.get(profile.userId);
        const projects = await ctx.db
          .query("projects")
          .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
          .collect();
        const hasTrailer = projects.some((p) => p.trailerUrl);
        const profileSessions = sessionsByProfile.get(profile._id.toString());

        return {
          profileId: profile._id,
          displayName: profile.displayName,
          slug: profile.slug,
          location: profile.location,
          userName: user?.name || user?.email,
          userEmail: user?.email,
          filmCount: projects.length,
          hasTrailer,
          uniqueVisitors: profileSessions?.size ?? 0,
        };
      })
    );

    return {
      period: `${daysBack} days`,
      totalProfiles: profiles.length,
      totalEvents: filteredEvents.length,
      uniqueSessions: allSessions.size,
      // Event breakdowns
      pageViews: counts["page_view"] ?? 0,
      clipPlays: counts["clip_played"] ?? 0,
      clipShares: counts["clip_shared"] ?? 0,
      emailCaptures: counts["email_captured"] ?? 0,
      inquiries: counts["inquiry_submitted"] ?? 0,
      comments: counts["comment_submitted"] ?? 0,
      signups: counts["user_signup"] ?? 0,
      profilesCreated: counts["profile_created"] ?? 0,
      onboardingCompleted: counts["onboarding_completed"] ?? 0,
      // User breakdown
      users: userDetails,
    };
  },
});

/**
 * Search users and films with auto-suggest (admin view)
 * Returns max 3 results for each category
 */
export const searchUsersAndFilmsAdmin = query({
  args: {
    query: v.string(),
  },
  async handler(ctx, args) {
    const searchQuery = args.query.toLowerCase().trim();
    if (!searchQuery || searchQuery.length < 2) {
      return { users: [], films: [] };
    }

    // Search users (by name, email, display name)
    const users = await ctx.db.query("users").collect();
    const matchedUsers = users
      .filter((user) => {
        const name = (user.name || "").toLowerCase();
        const email = (user.email || "").toLowerCase();
        const displayName = (user.displayName || "").toLowerCase();
        return (
          name.includes(searchQuery) ||
          email.includes(searchQuery) ||
          displayName.includes(searchQuery)
        );
      })
      .slice(0, 3)
      .map((user) => ({
        _id: user._id,
        name: user.name || user.email,
        email: user.email,
        type: "user" as const,
      }));

    // Search films (by project title)
    const projects = await ctx.db.query("projects").collect();
    const matchedFilms = projects
      .filter((project) => {
        const title = (project.title || "").toLowerCase();
        const logline = (project.logline || "").toLowerCase();
        return title.includes(searchQuery) || logline.includes(searchQuery);
      })
      .slice(0, 3);

    // Enrich films with profile info
    const enrichedFilms = await Promise.all(
      matchedFilms.map(async (project) => {
        const profile = await ctx.db.get(project.actorProfileId);
        return {
          _id: project._id,
          title: project.title,
          profileName: profile?.displayName,
          profileSlug: profile?.slug,
          posterUrl: project.posterUrl,
          type: "film" as const,
        };
      })
    );

    // Also search actor profiles
    const profiles = await ctx.db.query("actor_profiles").collect();
    const matchedProfiles = profiles
      .filter((profile) => {
        const displayName = (profile.displayName || "").toLowerCase();
        const slug = (profile.slug || "").toLowerCase();
        return displayName.includes(searchQuery) || slug.includes(searchQuery);
      })
      .slice(0, 3);

    const enrichedProfiles = await Promise.all(
      matchedProfiles.map(async (profile) => {
        const user = await ctx.db.get(profile.userId);
        return {
          _id: profile._id,
          displayName: profile.displayName,
          slug: profile.slug,
          userName: user?.name || user?.email,
          type: "profile" as const,
        };
      })
    );

    return {
      users: matchedUsers,
      films: enrichedFilms,
      profiles: enrichedProfiles,
    };
  },
});

/**
 * Get analytics for a specific user/profile (admin detail view)
 */
export const getProfileAnalyticsAdmin = query({
  args: {
    profileId: v.id("actor_profiles"),
    daysBack: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const daysBack = args.daysBack ?? 30;
    const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    const profile = await ctx.db.get(args.profileId);
    if (!profile) {
      return null;
    }

    const user = await ctx.db.get(profile.userId);

    // Get projects
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.profileId))
      .collect();

    // Get events
    const allEvents = await ctx.db
      .query("analytics_events")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.profileId))
      .collect();

    const recentEvents = allEvents.filter((e) => e._creationTime >= cutoffTime);

    // Aggregate
    const counts: Record<string, number> = {};
    const sessions = new Set<string>();

    for (const event of recentEvents) {
      counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
      if (event.sessionId) {
        sessions.add(event.sessionId);
      }
    }

    // Get snapshots for trend data
    const startDate = new Date(cutoffTime).toISOString().split("T")[0];
    const endDate = new Date().toISOString().split("T")[0];

    const snapshots = await ctx.db
      .query("analytics_snapshots")
      .withIndex("by_profile", (q) => q.eq("actorProfileId", args.profileId))
      .collect();

    const filteredSnapshots = snapshots
      .filter((s) => s.date >= startDate && s.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      profile: {
        _id: profile._id,
        displayName: profile.displayName,
        slug: profile.slug,
        location: profile.location,
      },
      user: {
        _id: user?._id,
        name: user?.name,
        email: user?.email,
      },
      projects: projects.map((p) => ({
        _id: p._id,
        title: p.title,
        hasTrailer: !!p.trailerUrl,
        posterUrl: p.posterUrl,
      })),
      metrics: {
        period: `${daysBack} days`,
        totalEvents: recentEvents.length,
        uniqueSessions: sessions.size,
        pageViews: counts["page_view"] ?? 0,
        clipPlays: counts["clip_played"] ?? 0,
        clipShares: counts["clip_shared"] ?? 0,
        emailCaptures: counts["email_captured"] ?? 0,
        inquiries: counts["inquiry_submitted"] ?? 0,
        comments: counts["comment_submitted"] ?? 0,
      },
      snapshots: filteredSnapshots,
    };
  },
});

// =============================================================================
// ADMIN QUERIES - Assets
// =============================================================================

/**
 * Get all assets (clips, memes, GIFs) across all users (admin view)
 * Returns enriched data with user info and asset details
 */
export const getAllAssetsAdmin = query({
  args: {
    assetType: v.optional(v.union(v.literal("clip"), v.literal("meme"), v.literal("gif"), v.literal("all"))),
    userId: v.optional(v.id("users")),
    profileId: v.optional(v.id("actor_profiles")),
    limit: v.optional(v.number()),
    sortBy: v.optional(v.union(v.literal("recent"), v.literal("score"), v.literal("viral"))),
  },
  async handler(ctx, args) {
    const limit = args.limit ?? 50;
    const assetType = args.assetType ?? "all";
    const sortBy = args.sortBy ?? "recent";
    const r2Bucket = process.env.R2_PUBLIC_BUCKET_URL;

    type AssetData = {
      _id: string;
      type: "clip" | "meme" | "gif";
      title: string;
      thumbnailUrl: string | null;
      createdAt: number;
      score?: number;
      viralScore?: number;
      actorProfileId: Id<"actor_profiles">;
      userId?: Id<"users">;
      profileName?: string;
      profileSlug?: string;
      userName?: string;
      userEmail?: string;
      boosted?: boolean;
      boostCampaignId?: Id<"boost_campaigns">;
    };

    const assets: AssetData[] = [];

    // Fetch clips
    if (assetType === "all" || assetType === "clip") {
      const clips = args.profileId
        ? await ctx.db
            .query("generated_clips")
            .withIndex("by_actorProfile", (q) =>
              q.eq("actorProfileId", args.profileId!)
            )
            .order("desc")
            .take(limit)
        : await ctx.db.query("generated_clips").order("desc").take(limit);

      for (const clip of clips) {
        assets.push({
          _id: clip._id,
          type: "clip",
          title: clip.title,
          thumbnailUrl: clip.customThumbnailUrl || clip.thumbnailUrl || null,
          createdAt: clip.createdAt,
          score: clip.score,
          actorProfileId: clip.actorProfileId,
        });
      }
    }

    // Fetch memes
    if (assetType === "all" || assetType === "meme") {
      const memes = args.profileId
        ? await ctx.db
            .query("generated_memes")
            .withIndex("by_actorProfile", (q) =>
              q.eq("actorProfileId", args.profileId!)
            )
            .order("desc")
            .take(limit)
        : await ctx.db.query("generated_memes").order("desc").take(limit);

      for (const meme of memes) {
        let thumbnailUrl: string | null = null;
        if (meme.memeStorageId) {
          thumbnailUrl = await ctx.storage.getUrl(meme.memeStorageId);
        } else if (r2Bucket && meme.r2MemeKey) {
          thumbnailUrl = `${r2Bucket}/${meme.r2MemeKey}`;
        } else if (r2Bucket && meme.r2FrameKey) {
          thumbnailUrl = `${r2Bucket}/${meme.r2FrameKey}`;
        } else {
          thumbnailUrl = meme.memeUrl || meme.frameUrl || null;
        }

        assets.push({
          _id: meme._id,
          type: "meme",
          title: meme.caption?.slice(0, 50) || "Meme",
          thumbnailUrl,
          createdAt: meme.createdAt,
          viralScore: meme.viralScore,
          actorProfileId: meme.actorProfileId,
        });
      }
    }

    // Fetch GIFs
    if (assetType === "all" || assetType === "gif") {
      const gifs = args.profileId
        ? await ctx.db
            .query("generated_gifs")
            .withIndex("by_actorProfile", (q) =>
              q.eq("actorProfileId", args.profileId!)
            )
            .order("desc")
            .take(limit)
        : await ctx.db.query("generated_gifs").order("desc").take(limit);

      for (const gif of gifs) {
        let thumbnailUrl: string | null = null;
        if (gif.storageId) {
          thumbnailUrl = await ctx.storage.getUrl(gif.storageId);
        } else if (r2Bucket && gif.r2GifKey) {
          thumbnailUrl = `${r2Bucket}/${gif.r2GifKey}`;
        } else {
          thumbnailUrl = gif.gifUrl || null;
        }

        assets.push({
          _id: gif._id,
          type: "gif",
          title: gif.title || "GIF",
          thumbnailUrl,
          createdAt: gif.createdAt,
          viralScore: gif.viralScore,
          actorProfileId: gif.actorProfileId,
        });
      }
    }

    // Get boost campaigns to check which assets are boosted
    const boostCampaigns = await ctx.db.query("boost_campaigns").collect();
    const boostedAssets = new Map<string, Id<"boost_campaigns">>();
    for (const campaign of boostCampaigns) {
      if (campaign.assetId && (campaign.status === "active" || campaign.status === "completed")) {
        boostedAssets.set(campaign.assetId, campaign._id);
      }
    }

    // Enrich assets with user info
    const enrichedAssets = await Promise.all(
      assets.map(async (asset) => {
        const profile = await ctx.db.get(asset.actorProfileId);
        const user = profile ? await ctx.db.get(profile.userId) : null;

        return {
          ...asset,
          profileName: profile?.displayName,
          profileSlug: profile?.slug,
          userName: user?.name || user?.email,
          userEmail: user?.email,
          userId: profile?.userId,
          boosted: boostedAssets.has(asset._id),
          boostCampaignId: boostedAssets.get(asset._id),
        };
      })
    );

    // Filter by user if specified
    let filteredAssets = enrichedAssets;
    if (args.userId) {
      filteredAssets = enrichedAssets.filter((a) => a.userId === args.userId);
    }

    // Sort
    if (sortBy === "score") {
      filteredAssets.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } else if (sortBy === "viral") {
      filteredAssets.sort((a, b) => (b.viralScore ?? 0) - (a.viralScore ?? 0));
    } else {
      filteredAssets.sort((a, b) => b.createdAt - a.createdAt);
    }

    return filteredAssets.slice(0, limit);
  },
});

/**
 * Get asset summary stats for admin dashboard
 */
export const getAssetSummaryAdmin = query({
  args: {},
  async handler(ctx) {
    const [clips, memes, gifs] = await Promise.all([
      ctx.db.query("generated_clips").collect(),
      ctx.db.query("generated_memes").collect(),
      ctx.db.query("generated_gifs").collect(),
    ]);

    // Count by time periods
    const now = Date.now();
    const today = now - 24 * 60 * 60 * 1000;
    const thisWeek = now - 7 * 24 * 60 * 60 * 1000;
    const thisMonth = now - 30 * 24 * 60 * 60 * 1000;

    const clipsToday = clips.filter((c) => c.createdAt >= today).length;
    const memesToday = memes.filter((m) => m.createdAt >= today).length;
    const gifsToday = gifs.filter((g) => g.createdAt >= today).length;

    const clipsWeek = clips.filter((c) => c.createdAt >= thisWeek).length;
    const memesWeek = memes.filter((m) => m.createdAt >= thisWeek).length;
    const gifsWeek = gifs.filter((g) => g.createdAt >= thisWeek).length;

    const clipsMonth = clips.filter((c) => c.createdAt >= thisMonth).length;
    const memesMonth = memes.filter((m) => m.createdAt >= thisMonth).length;
    const gifsMonth = gifs.filter((g) => g.createdAt >= thisMonth).length;

    // Get unique profiles
    const profileIds = new Set([
      ...clips.map((c) => c.actorProfileId.toString()),
      ...memes.map((m) => m.actorProfileId.toString()),
      ...gifs.map((g) => g.actorProfileId.toString()),
    ]);

    // Get boost campaigns
    const boostCampaigns = await ctx.db.query("boost_campaigns").collect();
    const activeBoostedAssets = boostCampaigns
      .filter((c) => c.status === "active" && c.assetId)
      .map((c) => c.assetId);

    // Calculate average scores
    const clipScores = clips.filter((c) => c.score).map((c) => c.score!);
    const memeScores = memes.filter((m) => m.viralScore).map((m) => m.viralScore!);
    const gifScores = gifs.filter((g) => g.viralScore).map((g) => g.viralScore!);

    const avgClipScore = clipScores.length > 0
      ? Math.round(clipScores.reduce((a, b) => a + b, 0) / clipScores.length)
      : 0;
    const avgMemeScore = memeScores.length > 0
      ? Math.round(memeScores.reduce((a, b) => a + b, 0) / memeScores.length)
      : 0;
    const avgGifScore = gifScores.length > 0
      ? Math.round(gifScores.reduce((a, b) => a + b, 0) / gifScores.length)
      : 0;

    return {
      totalClips: clips.length,
      totalMemes: memes.length,
      totalGifs: gifs.length,
      totalAssets: clips.length + memes.length + gifs.length,
      // Today
      clipsToday,
      memesToday,
      gifsToday,
      assetsToday: clipsToday + memesToday + gifsToday,
      // This week
      clipsWeek,
      memesWeek,
      gifsWeek,
      assetsWeek: clipsWeek + memesWeek + gifsWeek,
      // This month
      clipsMonth,
      memesMonth,
      gifsMonth,
      assetsMonth: clipsMonth + memesMonth + gifsMonth,
      // Other stats
      uniqueProfiles: profileIds.size,
      activeBoostedCount: activeBoostedAssets.length,
      avgClipScore,
      avgMemeScore,
      avgGifScore,
    };
  },
});

/**
 * Get all users for filtering dropdown (admin view)
 */
export const getAllUsersAdmin = query({
  args: {},
  async handler(ctx) {
    const users = await ctx.db.query("users").collect();
    const profiles = await ctx.db.query("actor_profiles").collect();

    // Build user-profile map
    const profilesByUser = new Map<string, typeof profiles>();
    for (const profile of profiles) {
      const key = profile.userId.toString();
      if (!profilesByUser.has(key)) {
        profilesByUser.set(key, []);
      }
      profilesByUser.get(key)!.push(profile);
    }

    return users.map((user) => {
      const userProfiles = profilesByUser.get(user._id.toString()) || [];
      return {
        _id: user._id,
        name: user.name || user.email,
        email: user.email,
        profileCount: userProfiles.length,
        profiles: userProfiles.map((p) => ({
          _id: p._id,
          displayName: p.displayName,
          slug: p.slug,
        })),
      };
    });
  },
});
