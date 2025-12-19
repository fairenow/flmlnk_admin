import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Scheduled job to send weekly analytics digest emails.
 * Should be run weekly (e.g., every Monday morning).
 */
export const sendWeeklyDigests = internalAction({
  args: {},
  async handler(ctx) {
    // Get all actor profiles with their owners
    const profiles = await ctx.runQuery(internal.emailScheduler.getProfilesForDigest);

    let sent = 0;
    let failed = 0;

    for (const profile of profiles) {
      try {
        // Get analytics data for the past week
        const analytics = await ctx.runQuery(internal.emailScheduler.getWeeklyAnalytics, {
          actorProfileId: profile._id,
        });

        // Only send if there's been some activity
        if (analytics.pageViews > 0 || analytics.inquiries > 0 || analytics.emailCaptures > 0) {
          await ctx.runAction(internal.email.sendWeeklyDigest, {
            ownerEmail: profile.ownerEmail,
            ownerName: profile.ownerName,
            pageName: profile.displayName,
            pageSlug: profile.slug,
            pageViews: analytics.pageViews,
            pageViewsChange: analytics.pageViewsChange,
            clipPlays: analytics.clipPlays,
            emailCaptures: analytics.emailCaptures,
            inquiries: analytics.inquiries,
            newComments: analytics.newComments,
            topReferrer: analytics.topReferrer,
          });
          sent++;
        }
      } catch (error) {
        console.error(`Failed to send digest to ${profile.ownerEmail}:`, error);
        failed++;
      }
    }

    console.log(`Weekly digest complete: ${sent} sent, ${failed} failed`);
    return { sent, failed };
  },
});

/**
 * Get all profiles with their owner info for digest emails.
 */
export const getProfilesForDigest = internalQuery({
  args: {},
  async handler(ctx) {
    const profiles = await ctx.db.query("actor_profiles").collect();

    const profilesWithOwners = [];
    for (const profile of profiles) {
      const user = await ctx.db.get(profile.userId);
      if (user && user.email) {
        profilesWithOwners.push({
          _id: profile._id,
          displayName: profile.displayName,
          slug: profile.slug,
          ownerEmail: user.email,
          ownerName: user.name || profile.displayName,
        });
      }
    }

    return profilesWithOwners;
  },
});

/**
 * Get weekly analytics for a profile.
 */
export const getWeeklyAnalytics = internalQuery({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

    // Get this week's events
    const thisWeekEvents = await ctx.db
      .query("analytics_events")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();

    // Filter by time (since we don't have a createdAt index)
    const recentEvents = thisWeekEvents.filter(
      (e) => e._creationTime >= oneWeekAgo
    );

    // Count events by type
    const pageViews = recentEvents.filter((e) => e.eventType === "page_view").length;
    const clipPlays = recentEvents.filter((e) => e.eventType === "clip_play").length;
    const emailCaptures = recentEvents.filter((e) => e.eventType === "email_captured").length;

    // Get inquiries this week
    const inquiries = await ctx.db
      .query("booking_inquiries")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();
    const weekInquiries = inquiries.filter((i) => i.createdAt >= oneWeekAgo).length;

    // Get comments this week
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();
    const newComments = comments.filter((c) => c.createdAt >= oneWeekAgo).length;

    // Calculate change from last week
    const lastWeekEvents = thisWeekEvents.filter(
      (e) => e._creationTime >= twoWeeksAgo && e._creationTime < oneWeekAgo
    );
    const lastWeekPageViews = lastWeekEvents.filter((e) => e.eventType === "page_view").length;

    let pageViewsChange = 0;
    if (lastWeekPageViews > 0) {
      pageViewsChange = Math.round(((pageViews - lastWeekPageViews) / lastWeekPageViews) * 100);
    } else if (pageViews > 0) {
      pageViewsChange = 100; // 100% increase from 0
    }

    // Get top referrer (simplified - just check referrer field)
    const referrers = recentEvents
      .filter((e) => e.referrer && e.eventType === "page_view")
      .map((e) => e.referrer);

    const referrerCounts: Record<string, number> = {};
    for (const ref of referrers) {
      if (ref) {
        try {
          const url = new URL(ref);
          const domain = url.hostname.replace("www.", "");
          referrerCounts[domain] = (referrerCounts[domain] || 0) + 1;
        } catch {
          // Invalid URL, skip
        }
      }
    }

    const topReferrer = Object.entries(referrerCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    return {
      pageViews,
      pageViewsChange,
      clipPlays,
      emailCaptures,
      inquiries: weekInquiries,
      newComments,
      topReferrer,
    };
  },
});

/**
 * Check for incomplete profiles and send reminder emails.
 * Should be run daily to catch users who signed up 3 days ago.
 */
export const sendProfileReminders = internalAction({
  args: {},
  async handler(ctx) {
    const profiles = await ctx.runQuery(internal.emailScheduler.getIncompleteProfiles);

    let sent = 0;
    for (const profile of profiles) {
      const missingItems: string[] = [];

      if (!profile.avatarUrl && !profile.avatarStorageId) {
        missingItems.push("headshot");
      }
      if (!profile.bio || profile.bio.length < 50) {
        missingItems.push("bio");
      }
      if (!profile.hasClips) {
        missingItems.push("clips");
      }
      if (!profile.hasProjects) {
        missingItems.push("projects");
      }
      if (!profile.hasSocials) {
        missingItems.push("socials");
      }

      if (missingItems.length > 0 && profile.ownerEmail) {
        try {
          await ctx.runAction(internal.email.sendProfileCompletionReminder, {
            ownerEmail: profile.ownerEmail,
            ownerName: profile.ownerName,
            pageSlug: profile.slug,
            missingItems,
          });
          sent++;
        } catch (error) {
          console.error(`Failed to send profile reminder to ${profile.ownerEmail}:`, error);
        }
      }
    }

    console.log(`Profile reminders sent: ${sent}`);
    return { sent };
  },
});

/**
 * Get profiles that were created 3 days ago and are incomplete.
 */
export const getIncompleteProfiles = internalQuery({
  args: {},
  async handler(ctx) {
    const now = Date.now();
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
    const fourDaysAgo = now - 4 * 24 * 60 * 60 * 1000;

    const profiles = await ctx.db.query("actor_profiles").collect();

    // Filter to profiles created ~3 days ago
    const targetProfiles = profiles.filter(
      (p) => p._creationTime >= fourDaysAgo && p._creationTime < threeDaysAgo
    );

    const result = [];
    for (const profile of targetProfiles) {
      const user = await ctx.db.get(profile.userId);

      // Check if they have clips
      const clips = await ctx.db
        .query("clips")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
        .first();

      // Check if they have projects
      const projects = await ctx.db
        .query("projects")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
        .first();

      // Check if they have socials
      const hasSocials = profile.socials && Object.values(profile.socials).some((v) => v);

      result.push({
        _id: profile._id,
        slug: profile.slug,
        avatarUrl: profile.avatarUrl,
        avatarStorageId: profile.avatarStorageId,
        bio: profile.bio,
        hasClips: !!clips,
        hasProjects: !!projects,
        hasSocials: !!hasSocials,
        ownerEmail: user?.email,
        ownerName: user?.name || profile.displayName,
      });
    }

    return result;
  },
});

/**
 * Manual trigger to send a test weekly digest to a specific email.
 */
export const sendTestDigest = mutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const profile = await ctx.db.get(actorProfileId);
    if (!profile) {
      throw new Error("Profile not found");
    }

    const user = await ctx.db.get(profile.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Schedule the digest to be sent
    await ctx.scheduler.runAfter(0, internal.emailScheduler.sendDigestForProfile, {
      actorProfileId,
      ownerEmail: user.email,
      ownerName: user.name || profile.displayName,
      pageName: profile.displayName,
      pageSlug: profile.slug,
    });

    return { success: true, message: "Digest email scheduled" };
  },
});

/**
 * Send digest for a specific profile (internal helper).
 */
export const sendDigestForProfile = internalAction({
  args: {
    actorProfileId: v.id("actor_profiles"),
    ownerEmail: v.string(),
    ownerName: v.string(),
    pageName: v.string(),
    pageSlug: v.string(),
  },
  async handler(ctx, args) {
    const analytics = await ctx.runQuery(internal.emailScheduler.getWeeklyAnalytics, {
      actorProfileId: args.actorProfileId,
    });

    await ctx.runAction(internal.email.sendWeeklyDigest, {
      ownerEmail: args.ownerEmail,
      ownerName: args.ownerName,
      pageName: args.pageName,
      pageSlug: args.pageSlug,
      pageViews: analytics.pageViews,
      pageViewsChange: analytics.pageViewsChange,
      clipPlays: analytics.clipPlays,
      emailCaptures: analytics.emailCaptures,
      inquiries: analytics.inquiries,
      newComments: analytics.newComments,
      topReferrer: analytics.topReferrer,
    });

    return { success: true };
  },
});
