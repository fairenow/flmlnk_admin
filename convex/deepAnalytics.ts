import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Deep Analytics Module
 *
 * This module provides granular analytics for asset performance tracking,
 * enabling users to understand which content performs best across their
 * public profile page. This data helps inform decisions about which assets
 * to promote with paid advertising.
 *
 * Key Features:
 * - Asset-level performance metrics (clips, memes, GIFs, trailers)
 * - Social platform attribution
 * - Engagement funnel analysis
 * - Content performance comparison
 * - Actionable insights for ad spend allocation
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Asset performance summary for a single asset.
 */
export interface AssetPerformance {
  assetId: string;
  assetType: "clip" | "meme" | "gif" | "trailer" | "poster" | "generated_clip" | "processing_clip";
  assetTitle?: string;
  // Core metrics
  impressions: number;
  engagements: number;
  plays: number;
  shares: number;
  // Engagement rates
  engagementRate: number; // engagements / impressions
  playRate: number; // plays / impressions
  shareRate: number; // shares / plays
  // Time metrics
  avgWatchTime?: number;
  completionRate?: number;
  // Performance score (0-100)
  performanceScore: number;
}

/**
 * Social platform attribution data.
 */
export interface PlatformAttribution {
  platform: "instagram" | "facebook" | "youtube" | "tiktok" | "twitter" | "linkedin" | "direct" | "organic" | "email" | "other";
  visitors: number;
  engagements: number;
  conversions: number;
  conversionRate: number;
}

/**
 * Engagement funnel stages.
 */
export interface EngagementFunnel {
  pageViews: number;
  scrolled50: number;
  watchedVideo: number;
  clicked_cta: number;
  emailCaptured: number;
  // Conversion rates between stages
  scrollRate: number;
  videoWatchRate: number;
  ctaClickRate: number;
  conversionRate: number;
}

/**
 * Content performance insights.
 */
export interface ContentInsights {
  topPerformingAssets: AssetPerformance[];
  underperformingAssets: AssetPerformance[];
  recommendations: {
    boostCandidates: string[]; // Asset IDs worth promoting
    optimizationNeeded: string[]; // Assets that need improvement
    insights: string[]; // Actionable text insights
  };
}

/**
 * User journey funnel stages.
 */
export interface UserJourneyFunnel {
  // Landing page stage
  landingPageViews: number;
  landingCtaClicks: number;
  landingSignupFormViews: number;
  landingSignupFormStarts: number;
  // Auth stage
  signupPageViews: number;
  signupFormStarts: number;
  signupFormSubmits: number;
  signupGoogleClicks: number;
  signupEmailsSent: number;
  signupCompleted: number;
  // Onboarding stage
  onboardingStarted: number;
  onboardingStep1Complete: number;
  onboardingStep7Complete: number;
  onboardingCompleted: number;
  onboardingAbandoned: number;
  // Dashboard stage
  dashboardPageViews: number;
  dashboardModuleClicks: number;
  dashboardSettingsSaved: number;
  // Conversion rates
  landingToSignup: number;
  signupToOnboarding: number;
  onboardingCompletion: number;
  dashboardRetention: number;
}

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get detailed analytics overview for Deep Analytics dashboard.
 * Returns comprehensive metrics for the user's profile page.
 */
export const getDeepAnalyticsOverview = query({
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

    // Get events for the time period
    const daysBack = args.daysBack ?? 30;
    const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    const allEvents = await ctx.db
      .query("analytics_events")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", args.actorProfileId)
      )
      .collect();

    const recentEvents = allEvents.filter(
      (e) => e._creationTime >= cutoffTime
    );

    // Count unique sessions
    const uniqueSessions = new Set(recentEvents.map((e) => e.sessionId));

    // Aggregate by event type
    const counts: Record<string, number> = {};
    for (const event of recentEvents) {
      counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
    }

    // Calculate engagement funnel
    const pageViews = counts["page_view"] ?? 0;
    const scrolled50 = counts["scroll_depth_50"] ?? 0;
    const watchedVideo = (counts["video_play"] ?? 0) +
                         (counts["clip_played"] ?? 0) +
                         (counts["trailer_play"] ?? 0) +
                         (counts["generated_clip_played"] ?? 0) +
                         (counts["processing_clip_played"] ?? 0);
    const clickedCta = (counts["watch_cta_clicked"] ?? 0) +
                       (counts["get_updates_clicked"] ?? 0) +
                       (counts["hero_cta_clicked"] ?? 0) +
                       (counts["film_watch_cta_clicked"] ?? 0);
    const emailCaptured = (counts["email_captured"] ?? 0) +
                          (counts["email_signup_completed"] ?? 0);

    const engagementFunnel: EngagementFunnel = {
      pageViews,
      scrolled50,
      watchedVideo,
      clicked_cta: clickedCta,
      emailCaptured,
      scrollRate: pageViews > 0 ? (scrolled50 / pageViews) * 100 : 0,
      videoWatchRate: pageViews > 0 ? (watchedVideo / pageViews) * 100 : 0,
      ctaClickRate: pageViews > 0 ? (clickedCta / pageViews) * 100 : 0,
      conversionRate: pageViews > 0 ? (emailCaptured / pageViews) * 100 : 0,
    };

    // Aggregate asset performance from metadata
    const assetMetrics = new Map<string, {
      impressions: number;
      engagements: number;
      plays: number;
      shares: number;
      assetType?: string;
      assetTitle?: string;
    }>();

    for (const event of recentEvents) {
      const metadata = event.metadata as Record<string, any> | undefined;
      if (metadata?.assetId) {
        const assetId = metadata.assetId;
        const existing = assetMetrics.get(assetId) || {
          impressions: 0,
          engagements: 0,
          plays: 0,
          shares: 0,
          assetType: metadata.assetType,
          assetTitle: metadata.assetTitle,
        };

        // Track impressions (views)
        if (event.eventType === "asset_impression" ||
            event.eventType.includes("viewed") ||
            event.eventType === "clip_thumbnail_viewed" ||
            event.eventType === "film_card_viewed" ||
            event.eventType === "trailer_loaded") {
          existing.impressions++;
        }

        // Track engagements (clicks, interactions)
        if (event.eventType === "asset_engagement" ||
            event.eventType.includes("played") ||
            event.eventType.includes("clicked") ||
            event.eventType === "clip_fullscreen_opened" ||
            event.eventType === "film_card_clicked" ||
            event.eventType === "film_trailer_clicked" ||
            event.eventType === "clip_contribution_clicked") {
          existing.engagements++;
        }

        // Track plays (video/clip plays)
        if (event.eventType.includes("played") ||
            event.eventType === "video_play" ||
            event.eventType === "clip_played" ||
            event.eventType === "trailer_play" ||
            event.eventType === "generated_clip_played" ||
            event.eventType === "processing_clip_played") {
          existing.plays++;
        }

        // Track shares
        if (event.eventType.includes("share") ||
            event.eventType === "clip_shared" ||
            event.eventType === "trailer_share" ||
            event.eventType === "social_share_completed") {
          existing.shares++;
        }

        assetMetrics.set(assetId, existing);
      }
    }

    // Convert to AssetPerformance array
    const assetPerformanceList: AssetPerformance[] = Array.from(assetMetrics.entries()).map(
      ([assetId, metrics]) => {
        const engagementRate = metrics.impressions > 0
          ? (metrics.engagements / metrics.impressions) * 100
          : 0;
        const playRate = metrics.impressions > 0
          ? (metrics.plays / metrics.impressions) * 100
          : 0;
        const shareRate = metrics.plays > 0
          ? (metrics.shares / metrics.plays) * 100
          : 0;

        // Calculate performance score (weighted average)
        const performanceScore = Math.min(100, Math.round(
          engagementRate * 0.3 +
          playRate * 0.4 +
          shareRate * 0.3
        ));

        return {
          assetId,
          assetType: (metrics.assetType || "clip") as AssetPerformance["assetType"],
          assetTitle: metrics.assetTitle,
          impressions: metrics.impressions,
          engagements: metrics.engagements,
          plays: metrics.plays,
          shares: metrics.shares,
          engagementRate,
          playRate,
          shareRate,
          performanceScore,
        };
      }
    );

    // Sort by performance score
    assetPerformanceList.sort((a, b) => b.performanceScore - a.performanceScore);

    // Generate recommendations
    const topPerformers = assetPerformanceList.slice(0, 5);
    const underperformers = assetPerformanceList
      .filter((a) => a.performanceScore < 30 && a.impressions >= 10)
      .slice(0, 5);

    const boostCandidates = topPerformers
      .filter((a) => a.performanceScore >= 50)
      .map((a) => a.assetId);

    const optimizationNeeded = underperformers.map((a) => a.assetId);

    // Generate text insights
    const insights: string[] = [];

    if (engagementFunnel.conversionRate > 5) {
      insights.push(`Strong conversion rate of ${engagementFunnel.conversionRate.toFixed(1)}% - your page is converting well.`);
    } else if (engagementFunnel.conversionRate < 1 && pageViews > 50) {
      insights.push("Low conversion rate detected. Consider adding a stronger call-to-action or improving your email capture offer.");
    }

    if (engagementFunnel.videoWatchRate < 20 && pageViews > 30) {
      insights.push("Video engagement is low. Try adding autoplay or improving your video thumbnail.");
    }

    if (topPerformers.length > 0 && topPerformers[0].performanceScore >= 70) {
      insights.push(`"${topPerformers[0].assetTitle || 'Top asset'}" is your best performing content - consider boosting it with paid ads.`);
    }

    if (counts["watch_cta_clicked"] && counts["watch_cta_clicked"] > 0) {
      const ctaConversion = (counts["watch_cta_clicked"] / pageViews) * 100;
      insights.push(`Your Watch CTA has a ${ctaConversion.toFixed(1)}% click rate.`);
    }

    // Clip engagement insights
    const totalClipPlays = (counts["clip_played"] ?? 0) +
                           (counts["generated_clip_played"] ?? 0) +
                           (counts["processing_clip_played"] ?? 0);
    if (totalClipPlays > 0 && pageViews > 20) {
      const clipEngagementRate = (totalClipPlays / pageViews) * 100;
      if (clipEngagementRate > 50) {
        insights.push(`Excellent clip engagement! ${clipEngagementRate.toFixed(1)}% of visitors are watching your clips.`);
      } else if (clipEngagementRate < 15) {
        insights.push("Consider featuring more eye-catching clip thumbnails to increase clip views.");
      }
    }

    // Trailer engagement insights
    const trailerPlays = counts["trailer_play"] ?? 0;
    if (trailerPlays > 0 && pageViews > 10) {
      const trailerRate = (trailerPlays / pageViews) * 100;
      insights.push(`Trailer play rate: ${trailerRate.toFixed(1)}% of visitors watched a trailer.`);
    }

    // Film card insights
    const filmClicks = (counts["film_card_clicked"] ?? 0) + (counts["film_trailer_clicked"] ?? 0);
    if (filmClicks > 0 && pageViews > 20) {
      insights.push(`Filmography section engagement: ${filmClicks} clicks on your film cards.`);
    }

    // Booking/contact insights
    const bookingSubmissions = counts["booking_form_submitted"] ?? 0;
    if (bookingSubmissions > 0) {
      insights.push(`You received ${bookingSubmissions} booking inquiries in this period.`);
    }

    // Contribution insights
    const contributionClicks = counts["clip_contribution_clicked"] ?? 0;
    if (contributionClicks > 0) {
      insights.push(`${contributionClicks} visitors clicked on your contribution button - consider promoting your support options.`);
    }

    return {
      period: `${daysBack} days`,
      summary: {
        totalEvents: recentEvents.length,
        uniqueVisitors: uniqueSessions.size,
        pageViews,
        totalEngagements: watchedVideo + filmClicks + (counts["clip_fullscreen_opened"] ?? 0),
        totalVideoPlays: watchedVideo,
        totalClipPlays: totalClipPlays,
        trailerPlays,
        filmInteractions: filmClicks,
        bookingInquiries: bookingSubmissions,
        contributionClicks,
        emailCaptures: emailCaptured,
      },
      engagementFunnel,
      assetPerformance: assetPerformanceList,
      contentInsights: {
        topPerformingAssets: topPerformers,
        underperformingAssets: underperformers,
        recommendations: {
          boostCandidates,
          optimizationNeeded,
          insights,
        },
      },
      // Raw counts for custom dashboards
      eventCounts: counts,
    };
  },
});

/**
 * Get historical performance data for trend analysis.
 */
export const getPerformanceTrends = query({
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

    // Get snapshots for the time period
    const daysBack = args.daysBack ?? 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    const snapshots = await ctx.db
      .query("analytics_snapshots")
      .withIndex("by_profile", (q) => q.eq("actorProfileId", args.actorProfileId))
      .collect();

    const filteredSnapshots = snapshots
      .filter((s) => s.date >= startDateStr && s.date <= endDateStr)
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate daily trends
    const dailyData = filteredSnapshots.map((snapshot) => ({
      date: snapshot.date,
      pageViews: snapshot.pageViews,
      uniqueVisitors: snapshot.uniqueVisitors,
      clipPlays: snapshot.clipPlays,
      emailCaptures: snapshot.emailCaptures,
      watchCtaClicks: snapshot.watchCtaClicks ?? 0,
      // Granular metrics if available
      videoPlays: snapshot.videoEngagement?.totalPlays ?? 0,
      scrollDepth50: snapshot.scrollDepth?.reached50 ?? 0,
    }));

    // Calculate period-over-period comparison
    const midpoint = Math.floor(filteredSnapshots.length / 2);
    const firstHalf = filteredSnapshots.slice(0, midpoint);
    const secondHalf = filteredSnapshots.slice(midpoint);

    const sumMetric = (arr: typeof filteredSnapshots, key: keyof typeof filteredSnapshots[0]) =>
      arr.reduce((sum, s) => sum + ((s[key] as number) ?? 0), 0);

    const comparison = {
      pageViews: {
        previous: sumMetric(firstHalf, "pageViews"),
        current: sumMetric(secondHalf, "pageViews"),
        change: 0,
      },
      emailCaptures: {
        previous: sumMetric(firstHalf, "emailCaptures"),
        current: sumMetric(secondHalf, "emailCaptures"),
        change: 0,
      },
      clipPlays: {
        previous: sumMetric(firstHalf, "clipPlays"),
        current: sumMetric(secondHalf, "clipPlays"),
        change: 0,
      },
    };

    // Calculate percentage changes
    for (const key of Object.keys(comparison) as (keyof typeof comparison)[]) {
      const prev = comparison[key].previous;
      const curr = comparison[key].current;
      comparison[key].change = prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;
    }

    return {
      period: `${daysBack} days`,
      dailyData,
      comparison,
      totalDays: filteredSnapshots.length,
    };
  },
});

/**
 * Get user journey analytics for platform-wide funnel analysis.
 * This tracks the full user lifecycle from landing page to dashboard.
 */
export const getUserJourneyAnalytics = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // Only superadmins can access platform-wide analytics
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return null;
    }

    // Check for superadmin role - if not superadmin, return their own journey data only
    const isSuperAdmin = user.superadmin === true;

    // Get events for the time period
    const daysBack = args.daysBack ?? 30;
    const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    // Get all analytics events (for superadmin) or user-specific events
    let allEvents = await ctx.db
      .query("analytics_events")
      .collect();

    // If not superadmin, filter to only events that don't have an actorProfileId
    // (these are the user journey events like landing, signup, etc.)
    // Or events associated with the user's own profile
    if (!isSuperAdmin) {
      const userProfiles = await ctx.db
        .query("actor_profiles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();

      const userProfileIds = new Set(userProfiles.map(p => p._id));

      allEvents = allEvents.filter(e =>
        !e.actorProfileId || userProfileIds.has(e.actorProfileId)
      );
    }

    const recentEvents = allEvents.filter((e) => e._creationTime >= cutoffTime);

    // Aggregate by event type
    const counts: Record<string, number> = {};
    for (const event of recentEvents) {
      counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
    }

    // Build user journey funnel
    const journeyFunnel: UserJourneyFunnel = {
      // Landing page stage
      landingPageViews: counts["landing_page_view"] ?? 0,
      landingCtaClicks: counts["landing_cta_clicked"] ?? 0,
      landingSignupFormViews: counts["landing_signup_form_view"] ?? 0,
      landingSignupFormStarts: counts["landing_signup_form_started"] ?? 0,
      // Auth stage
      signupPageViews: counts["signup_page_view"] ?? 0,
      signupFormStarts: counts["signup_form_started"] ?? 0,
      signupFormSubmits: counts["signup_form_submitted"] ?? 0,
      signupGoogleClicks: counts["signup_google_clicked"] ?? 0,
      signupEmailsSent: counts["signup_email_sent"] ?? 0,
      signupCompleted: counts["signup_completed"] ?? 0,
      // Onboarding stage
      onboardingStarted: counts["onboarding_started"] ?? 0,
      onboardingStep1Complete: 0, // Calculated from step_completed events
      onboardingStep7Complete: 0,
      onboardingCompleted: counts["onboarding_completed"] ?? 0,
      onboardingAbandoned: counts["onboarding_abandoned"] ?? 0,
      // Dashboard stage
      dashboardPageViews: counts["dashboard_page_view"] ?? 0,
      dashboardModuleClicks: counts["dashboard_module_clicked"] ?? 0,
      dashboardSettingsSaved: counts["dashboard_settings_saved"] ?? 0,
      // Conversion rates (calculated below)
      landingToSignup: 0,
      signupToOnboarding: 0,
      onboardingCompletion: 0,
      dashboardRetention: 0,
    };

    // Count onboarding step completions
    for (const event of recentEvents) {
      if (event.eventType === "onboarding_step_completed") {
        const metadata = event.metadata as Record<string, any> | undefined;
        const stepNumber = parseInt(metadata?.assetId || "0", 10);
        if (stepNumber === 1) journeyFunnel.onboardingStep1Complete++;
        if (stepNumber === 7) journeyFunnel.onboardingStep7Complete++;
      }
    }

    // Calculate conversion rates
    if (journeyFunnel.landingPageViews > 0) {
      journeyFunnel.landingToSignup =
        (journeyFunnel.signupFormSubmits / journeyFunnel.landingPageViews) * 100;
    }

    if (journeyFunnel.signupFormSubmits > 0) {
      journeyFunnel.signupToOnboarding =
        (journeyFunnel.onboardingStarted / journeyFunnel.signupFormSubmits) * 100;
    }

    if (journeyFunnel.onboardingStarted > 0) {
      journeyFunnel.onboardingCompletion =
        (journeyFunnel.onboardingCompleted / journeyFunnel.onboardingStarted) * 100;
    }

    if (journeyFunnel.onboardingCompleted > 0) {
      // Measure dashboard retention as users who visited dashboard multiple times
      const uniqueDashboardUsers = new Set(
        recentEvents
          .filter(e => e.eventType === "dashboard_page_view")
          .map(e => e.sessionId)
      ).size;
      journeyFunnel.dashboardRetention =
        (uniqueDashboardUsers / journeyFunnel.onboardingCompleted) * 100;
    }

    // Generate insights
    const insights: string[] = [];

    // Landing page insights
    if (journeyFunnel.landingPageViews > 100) {
      if (journeyFunnel.landingToSignup < 5) {
        insights.push("Landing page conversion is low. Consider A/B testing different CTAs or value propositions.");
      } else if (journeyFunnel.landingToSignup > 20) {
        insights.push(`Excellent landing page conversion rate of ${journeyFunnel.landingToSignup.toFixed(1)}%!`);
      }
    }

    // Signup insights
    if (journeyFunnel.signupPageViews > 50) {
      const signupConversion = journeyFunnel.signupFormSubmits / journeyFunnel.signupPageViews * 100;
      if (signupConversion < 30) {
        insights.push("Many users view the signup page but don't complete. Consider simplifying the form.");
      }
    }

    // Onboarding insights
    if (journeyFunnel.onboardingStarted > 10) {
      if (journeyFunnel.onboardingCompletion < 50) {
        insights.push(`Only ${journeyFunnel.onboardingCompletion.toFixed(0)}% of users complete onboarding. Review the flow for friction points.`);
      } else if (journeyFunnel.onboardingCompletion > 80) {
        insights.push(`Great onboarding completion rate of ${journeyFunnel.onboardingCompletion.toFixed(0)}%!`);
      }
    }

    // Dashboard insights
    if (journeyFunnel.dashboardPageViews > 0 && journeyFunnel.onboardingCompleted > 0) {
      if (journeyFunnel.dashboardRetention < 50) {
        insights.push("Users may not be returning to their dashboard. Consider adding engagement features or email reminders.");
      }
    }

    // Auth method insights
    const googleRatio = journeyFunnel.signupGoogleClicks /
      (journeyFunnel.signupFormSubmits + journeyFunnel.signupGoogleClicks || 1) * 100;
    if (googleRatio > 70) {
      insights.push(`${googleRatio.toFixed(0)}% of signups use Google - social login is working well.`);
    } else if (googleRatio < 20 && journeyFunnel.signupFormSubmits > 20) {
      insights.push("Most users prefer email signup. Make sure email verification is smooth.");
    }

    return {
      period: `${daysBack} days`,
      journeyFunnel,
      insights,
      eventCounts: counts,
      isSuperAdmin,
    };
  },
});

/**
 * Get top performing content for boost recommendations.
 */
export const getBoostRecommendations = query({
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

    // Get generated clips with their engagement data
    const generatedClips = await ctx.db
      .query("generated_clips")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.actorProfileId))
      .collect();

    // Get events for engagement data
    const cutoffTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const events = await ctx.db
      .query("analytics_events")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.actorProfileId))
      .collect();

    const recentEvents = events.filter((e) => e._creationTime >= cutoffTime);

    // Count engagements per clip
    const clipEngagements = new Map<string, { plays: number; shares: number; impressions: number; contributions: number }>();

    for (const event of recentEvents) {
      const metadata = event.metadata as Record<string, any> | undefined;
      const clipId = event.clipId as string | undefined || metadata?.assetId;

      if (clipId) {
        const existing = clipEngagements.get(clipId) || { plays: 0, shares: 0, impressions: 0, contributions: 0 };

        // Track plays
        if (event.eventType === "clip_played" ||
            event.eventType === "generated_clip_played" ||
            event.eventType === "processing_clip_played") {
          existing.plays++;
        }

        // Track shares
        if (event.eventType === "clip_shared" ||
            event.eventType === "social_share_completed") {
          existing.shares++;
        }

        // Track impressions
        if (event.eventType === "clip_thumbnail_viewed" ||
            event.eventType === "generated_clip_viewed" ||
            event.eventType === "processing_clip_viewed" ||
            event.eventType === "clip_fullscreen_opened") {
          existing.impressions++;
        }

        // Track contributions
        if (event.eventType === "clip_contribution_clicked") {
          existing.contributions++;
        }

        clipEngagements.set(clipId, existing);
      }
    }

    // Score and rank clips
    const scoredClips = generatedClips
      .filter((clip) => clip.status === "completed" && clip.storageId)
      .map((clip) => {
        const engagement = clipEngagements.get(clip._id as string) || { plays: 0, shares: 0, impressions: 0, contributions: 0 };
        const viralScore = clip.viralAnalysis?.shareabilityScore ?? clip.score ?? 50;

        // Combined score: viral potential + actual engagement
        // - viralScore: 30% weight (AI-predicted viral potential)
        // - plays: 25% weight (actual video plays)
        // - shares: 20% weight (social sharing)
        // - impressions-to-play conversion: 15% weight (how well it converts views to plays)
        // - contributions: 10% weight (monetization potential)
        const playScore = Math.min(100, engagement.plays * 5);
        const shareScore = Math.min(100, engagement.shares * 20);
        const conversionRate = engagement.impressions > 0
          ? Math.min(100, (engagement.plays / engagement.impressions) * 100)
          : 0;
        const contributionScore = Math.min(100, engagement.contributions * 50);

        const boostScore = Math.round(
          viralScore * 0.3 +
          playScore * 0.25 +
          shareScore * 0.2 +
          conversionRate * 0.15 +
          contributionScore * 0.1
        );

        return {
          clipId: clip._id,
          title: clip.title,
          description: clip.description,
          thumbnailUrl: clip.customThumbnailUrl || clip.thumbnailUrl,
          viralScore,
          plays: engagement.plays,
          shares: engagement.shares,
          impressions: engagement.impressions,
          contributions: engagement.contributions,
          conversionRate: engagement.impressions > 0
            ? Math.round((engagement.plays / engagement.impressions) * 100)
            : 0,
          boostScore,
          reason: boostScore >= 70
            ? "High engagement and viral potential - strong ad candidate"
            : boostScore >= 50
            ? "Good engagement - worth testing with small budget"
            : boostScore >= 30
            ? "Moderate potential - consider improving thumbnail or description"
            : "Lower engagement - may need content optimization first",
        };
      })
      .sort((a, b) => b.boostScore - a.boostScore)
      .slice(0, args.limit ?? 5);

    return scoredClips;
  },
});
