import { v } from "convex/values";
import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// =============================================================================
// ADMIN PORTAL QUERIES
// These queries verify superadmin status by email (from session cookie)
// instead of using ctx.auth (which requires Convex auth tokens)
// =============================================================================

/**
 * Helper to validate superadmin by email
 */
async function validateSuperadminByEmail(ctx: any, email: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q: any) => q.eq("email", email))
    .unique();

  if (!user?.superadmin) {
    throw new Error("Admin access required");
  }
  return user;
}

// =============================================================================
// DEEP ANALYTICS - User counts, signups, page analytics
// =============================================================================

/**
 * Get comprehensive site-wide statistics for admin dashboard
 */
export const getSiteWideStats = query({
  args: {
    adminEmail: v.string(),
  },
  async handler(ctx, args) {
    await validateSuperadminByEmail(ctx, args.adminEmail);

    const now = Date.now();
    const today = now - 24 * 60 * 60 * 1000;
    const thisWeek = now - 7 * 24 * 60 * 60 * 1000;
    const thisMonth = now - 30 * 24 * 60 * 60 * 1000;

    const [users, profiles, fanEmails, events, projects, clips, bookingInquiries] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("actor_profiles").collect(),
      ctx.db.query("fan_emails").collect(),
      ctx.db.query("analytics_events").collect(),
      ctx.db.query("projects").collect(),
      ctx.db.query("clips").collect(),
      ctx.db.query("booking_inquiries").collect(),
    ]);

    // User counts
    const totalUsers = users.length;
    const usersWithProfiles = new Set(profiles.map((p) => p.userId.toString())).size;
    const usersWithoutProfiles = totalUsers - usersWithProfiles;

    const usersToday = users.filter((u) => u._creationTime >= today).length;
    const usersThisWeek = users.filter((u) => u._creationTime >= thisWeek).length;
    const usersThisMonth = users.filter((u) => u._creationTime >= thisMonth).length;

    // Profile counts
    const profilesToday = profiles.filter((p) => p._creationTime >= today).length;
    const profilesThisWeek = profiles.filter((p) => p._creationTime >= thisWeek).length;
    const profilesThisMonth = profiles.filter((p) => p._creationTime >= thisMonth).length;

    // Fan email counts
    const activeEmails = fanEmails.filter((e) => !e.unsubscribed);
    const fanEmailsToday = fanEmails.filter((e) => (e.createdAt ?? e._creationTime) >= today).length;
    const fanEmailsThisWeek = fanEmails.filter((e) => (e.createdAt ?? e._creationTime) >= thisWeek).length;

    // Events
    const eventsToday = events.filter((e) => e._creationTime >= today).length;
    const eventsThisWeek = events.filter((e) => e._creationTime >= thisWeek).length;
    const eventsThisMonth = events.filter((e) => e._creationTime >= thisMonth).length;

    // Active users (had events in last 30 days)
    const activeUserIds = new Set<string>();
    for (const event of events) {
      if (event._creationTime >= thisMonth && event.actorProfileId) {
        const profile = profiles.find((p) => p._id === event.actorProfileId);
        if (profile) activeUserIds.add(profile.userId.toString());
      }
    }

    // Booking inquiries
    const inquiriesToday = bookingInquiries.filter((b) => b.createdAt >= today).length;
    const inquiriesThisWeek = bookingInquiries.filter((b) => b.createdAt >= thisWeek).length;

    return {
      users: {
        total: totalUsers,
        withProfiles: usersWithProfiles,
        withoutProfiles: usersWithoutProfiles,
        today: usersToday,
        thisWeek: usersThisWeek,
        thisMonth: usersThisMonth,
        activeAccounts: activeUserIds.size,
      },
      profiles: {
        total: profiles.length,
        today: profilesToday,
        thisWeek: profilesThisWeek,
        thisMonth: profilesThisMonth,
      },
      fanEmails: {
        total: fanEmails.length,
        active: activeEmails.length,
        unsubscribed: fanEmails.length - activeEmails.length,
        today: fanEmailsToday,
        thisWeek: fanEmailsThisWeek,
      },
      events: {
        total: events.length,
        today: eventsToday,
        thisWeek: eventsThisWeek,
        thisMonth: eventsThisMonth,
      },
      content: {
        projects: projects.length,
        clips: clips.length,
        projectsWithTrailer: projects.filter((p) => p.trailerUrl).length,
      },
      bookingInquiries: {
        total: bookingInquiries.length,
        today: inquiriesToday,
        thisWeek: inquiriesThisWeek,
      },
    };
  },
});

/**
 * Get page-by-page analytics for each profile
 */
export const getPageByPageAnalytics = query({
  args: {
    adminEmail: v.string(),
    daysBack: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  async handler(ctx, args) {
    await validateSuperadminByEmail(ctx, args.adminEmail);

    const daysBack = args.daysBack ?? 30;
    const limit = args.limit ?? 50;
    const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    const [profiles, events, fanEmails, projects, users] = await Promise.all([
      ctx.db.query("actor_profiles").collect(),
      ctx.db.query("analytics_events").collect(),
      ctx.db.query("fan_emails").collect(),
      ctx.db.query("projects").collect(),
      ctx.db.query("users").collect(),
    ]);

    const recentEvents = events.filter((e) => e._creationTime >= cutoffTime);
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    type PageAnalytics = {
      profileId: string;
      displayName: string;
      slug: string;
      location: string | undefined;
      ownerName: string | undefined;
      ownerEmail: string | undefined;
      pageViews: number;
      uniqueVisitors: number;
      clipPlays: number;
      emailCaptures: number;
      inquiries: number;
      totalFanEmails: number;
      projectCount: number;
      conversionRate: number;
    };

    const pageAnalytics: PageAnalytics[] = [];

    for (const profile of profiles) {
      const profileEvents = recentEvents.filter(
        (e) => e.actorProfileId?.toString() === profile._id.toString()
      );

      const pageViews = profileEvents.filter((e) => e.eventType === "page_view").length;
      const uniqueVisitors = new Set(
        profileEvents.filter((e) => e.eventType === "page_view").map((e) => e.sessionId)
      ).size;
      const clipPlays = profileEvents.filter((e) => e.eventType === "clip_played").length;
      const emailCaptures = profileEvents.filter((e) => e.eventType === "email_captured").length;
      const inquiries = profileEvents.filter((e) => e.eventType === "inquiry_submitted").length;

      const totalFanEmails = fanEmails.filter(
        (e) => e.actorProfileId.toString() === profile._id.toString()
      ).length;

      const projectCount = projects.filter(
        (p) => p.actorProfileId.toString() === profile._id.toString()
      ).length;

      const conversionRate = pageViews > 0 ? Math.round((emailCaptures / pageViews) * 1000) / 10 : 0;
      const user = userMap.get(profile.userId.toString());

      pageAnalytics.push({
        profileId: profile._id,
        displayName: profile.displayName,
        slug: profile.slug,
        location: profile.location,
        ownerName: user?.name,
        ownerEmail: user?.email,
        pageViews,
        uniqueVisitors,
        clipPlays,
        emailCaptures,
        inquiries,
        totalFanEmails,
        projectCount,
        conversionRate,
      });
    }

    pageAnalytics.sort((a, b) => b.pageViews - a.pageViews);

    const totals = {
      pageViews: pageAnalytics.reduce((sum, p) => sum + p.pageViews, 0),
      uniqueVisitors: pageAnalytics.reduce((sum, p) => sum + p.uniqueVisitors, 0),
      clipPlays: pageAnalytics.reduce((sum, p) => sum + p.clipPlays, 0),
      emailCaptures: pageAnalytics.reduce((sum, p) => sum + p.emailCaptures, 0),
      inquiries: pageAnalytics.reduce((sum, p) => sum + p.inquiries, 0),
      totalFanEmails: pageAnalytics.reduce((sum, p) => sum + p.totalFanEmails, 0),
    };

    return {
      period: `${daysBack} days`,
      totals,
      pages: pageAnalytics.slice(0, limit),
    };
  },
});

/**
 * Get all users with their profile status for email campaigns
 */
export const getAllUsersForCampaigns = query({
  args: {
    adminEmail: v.string(),
    filter: v.optional(v.union(
      v.literal("all"),
      v.literal("with_profiles"),
      v.literal("without_profiles"),
      v.literal("inactive")
    )),
  },
  async handler(ctx, args) {
    await validateSuperadminByEmail(ctx, args.adminEmail);

    const filter = args.filter ?? "all";
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const [users, profiles, events] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("actor_profiles").collect(),
      ctx.db.query("analytics_events").collect(),
    ]);

    // Map profiles by userId
    const profilesByUser = new Map<string, typeof profiles[0]>();
    for (const profile of profiles) {
      profilesByUser.set(profile.userId.toString(), profile);
    }

    // Get recent activity by profile
    const recentEvents = events.filter((e) => e._creationTime >= thirtyDaysAgo);
    const activeProfileIds = new Set<string>();
    for (const event of recentEvents) {
      if (event.actorProfileId) {
        activeProfileIds.add(event.actorProfileId.toString());
      }
    }

    // Build user list with profile info
    const userList = users.map((user) => {
      const profile = profilesByUser.get(user._id.toString());
      const isActive = profile ? activeProfileIds.has(profile._id.toString()) : false;

      return {
        _id: user._id,
        name: user.name || user.displayName || "Unknown",
        email: user.email,
        createdAt: user._creationTime,
        hasProfile: !!profile,
        profileSlug: profile?.slug,
        profileDisplayName: profile?.displayName,
        isActive,
      };
    });

    // Apply filter
    let filteredUsers = userList;
    if (filter === "with_profiles") {
      filteredUsers = userList.filter((u) => u.hasProfile);
    } else if (filter === "without_profiles") {
      filteredUsers = userList.filter((u) => !u.hasProfile);
    } else if (filter === "inactive") {
      filteredUsers = userList.filter((u) => u.hasProfile && !u.isActive);
    }

    // Sort by creation date (newest first)
    filteredUsers.sort((a, b) => b.createdAt - a.createdAt);

    return {
      total: filteredUsers.length,
      withProfiles: userList.filter((u) => u.hasProfile).length,
      withoutProfiles: userList.filter((u) => !u.hasProfile).length,
      inactive: userList.filter((u) => u.hasProfile && !u.isActive).length,
      users: filteredUsers,
    };
  },
});

/**
 * Get boost campaigns summary for admin
 */
export const getBoostCampaignsSummary = query({
  args: {
    adminEmail: v.string(),
  },
  async handler(ctx, args) {
    await validateSuperadminByEmail(ctx, args.adminEmail);

    const campaigns = await ctx.db.query("boost_campaigns").collect();

    const activeCampaigns = campaigns.filter((c) => c.status === "active");
    const pendingCampaigns = campaigns.filter((c) => c.status === "pending");
    const completedCampaigns = campaigns.filter((c) => c.status === "completed");

    const totalRevenue = campaigns
      .filter((c) => c.paymentStatus === "paid")
      .reduce((sum, c) => sum + c.budgetCents, 0);

    const totalImpressions = campaigns.reduce((sum, c) => sum + (c.impressions ?? 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks ?? 0), 0);

    return {
      total: campaigns.length,
      active: activeCampaigns.length,
      pending: pendingCampaigns.length,
      completed: completedCampaigns.length,
      totalRevenueCents: totalRevenue,
      totalImpressions,
      totalClicks,
      avgCTR: totalImpressions > 0
        ? Math.round((totalClicks / totalImpressions) * 10000) / 100
        : 0,
    };
  },
});

/**
 * Get user engagement levels categorized by activity
 */
export const getUserEngagementLevels = query({
  args: {
    adminEmail: v.string(),
    daysBack: v.optional(v.number()),
  },
  async handler(ctx, args) {
    await validateSuperadminByEmail(ctx, args.adminEmail);

    const daysBack = args.daysBack ?? 30;
    const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    const [profiles, events, fanEmails, projects] = await Promise.all([
      ctx.db.query("actor_profiles").collect(),
      ctx.db.query("analytics_events").collect(),
      ctx.db.query("fan_emails").collect(),
      ctx.db.query("projects").collect(),
    ]);

    const recentEvents = events.filter((e) => e._creationTime >= cutoffTime);

    type ProfileEngagement = {
      profileId: string;
      displayName: string;
      slug: string;
      pageViews: number;
      clipPlays: number;
      emailCaptures: number;
      totalFanEmails: number;
      projectCount: number;
      engagementScore: number;
      engagementLevel: "high" | "medium" | "low" | "inactive";
    };

    const profileEngagement: ProfileEngagement[] = [];

    for (const profile of profiles) {
      const profileEvents = recentEvents.filter(
        (e) => e.actorProfileId?.toString() === profile._id.toString()
      );

      const pageViews = profileEvents.filter((e) => e.eventType === "page_view").length;
      const clipPlays = profileEvents.filter((e) => e.eventType === "clip_played").length;
      const emailCaptures = profileEvents.filter((e) => e.eventType === "email_captured").length;
      const totalFanEmails = fanEmails.filter(
        (e) => e.actorProfileId.toString() === profile._id.toString()
      ).length;
      const projectCount = projects.filter(
        (p) => p.actorProfileId.toString() === profile._id.toString()
      ).length;

      const engagementScore =
        pageViews * 1 + clipPlays * 2 + emailCaptures * 5 + totalFanEmails * 3;

      let engagementLevel: "high" | "medium" | "low" | "inactive";
      if (engagementScore >= 100) engagementLevel = "high";
      else if (engagementScore >= 20) engagementLevel = "medium";
      else if (engagementScore > 0) engagementLevel = "low";
      else engagementLevel = "inactive";

      profileEngagement.push({
        profileId: profile._id,
        displayName: profile.displayName,
        slug: profile.slug,
        pageViews,
        clipPlays,
        emailCaptures,
        totalFanEmails,
        projectCount,
        engagementScore,
        engagementLevel,
      });
    }

    profileEngagement.sort((a, b) => b.engagementScore - a.engagementScore);

    const levelCounts = {
      high: profileEngagement.filter((p) => p.engagementLevel === "high").length,
      medium: profileEngagement.filter((p) => p.engagementLevel === "medium").length,
      low: profileEngagement.filter((p) => p.engagementLevel === "low").length,
      inactive: profileEngagement.filter((p) => p.engagementLevel === "inactive").length,
    };

    return {
      period: `${daysBack} days`,
      levelCounts,
      topEngaged: profileEngagement.slice(0, 10),
      allProfiles: profileEngagement,
    };
  },
});

// =============================================================================
// BOOST TRACKING - View all user boost submissions
// =============================================================================

/**
 * Get all boost campaigns across all users for admin tracking
 */
export const getAllBoostCampaigns = query({
  args: {
    adminEmail: v.string(),
    status: v.optional(v.string()),
    sortBy: v.optional(v.union(v.literal("recent"), v.literal("budget"), v.literal("impressions"))),
    limit: v.optional(v.number()),
  },
  async handler(ctx, args) {
    await validateSuperadminByEmail(ctx, args.adminEmail);

    const limit = args.limit ?? 100;
    let campaigns = await ctx.db.query("boost_campaigns").order("desc").collect();

    // Apply status filter
    if (args.status) {
      campaigns = campaigns.filter((c) => c.status === args.status);
    }

    // Sort
    if (args.sortBy === "budget") {
      campaigns.sort((a, b) => b.budgetCents - a.budgetCents);
    } else if (args.sortBy === "impressions") {
      campaigns.sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0));
    }

    // Limit
    campaigns = campaigns.slice(0, limit);

    // R2 bucket URL for thumbnails
    const r2Bucket = process.env.R2_PUBLIC_BUCKET_URL;

    // Enrich with user and asset details
    const enrichedCampaigns = await Promise.all(
      campaigns.map(async (campaign) => {
        const creator = await ctx.db.get(campaign.createdByUserId);
        const profile = campaign.actorProfileId
          ? await ctx.db.get(campaign.actorProfileId)
          : null;

        let assetThumbnail: string | null = null;
        let assetTitle = campaign.name;

        // Get asset thumbnail
        if (campaign.assetId && campaign.assetType) {
          if (campaign.assetType === "clip") {
            const clip = await ctx.db.get(campaign.assetId as Id<"generated_clips">);
            if (clip) {
              assetThumbnail = clip.customThumbnailUrl || clip.thumbnailUrl || null;
              assetTitle = clip.title || campaign.name;
            }
          } else if (campaign.assetType === "meme") {
            const meme = await ctx.db.get(campaign.assetId as Id<"generated_memes">);
            if (meme) {
              if (meme.memeStorageId) {
                assetThumbnail = await ctx.storage.getUrl(meme.memeStorageId);
              } else if (r2Bucket && meme.r2MemeKey) {
                assetThumbnail = `${r2Bucket}/${meme.r2MemeKey}`;
              }
              assetTitle = meme.caption?.slice(0, 50) || campaign.name;
            }
          } else if (campaign.assetType === "gif") {
            const gif = await ctx.db.get(campaign.assetId as Id<"generated_gifs">);
            if (gif) {
              if (gif.storageId) {
                assetThumbnail = await ctx.storage.getUrl(gif.storageId);
              } else if (r2Bucket && gif.r2GifKey) {
                assetThumbnail = `${r2Bucket}/${gif.r2GifKey}`;
              }
              assetTitle = gif.title || campaign.name;
            }
          }
        }

        const now = Date.now();
        const daysRemaining = campaign.endDate
          ? Math.max(0, Math.ceil((campaign.endDate - now) / (24 * 60 * 60 * 1000)))
          : null;

        return {
          _id: campaign._id,
          name: assetTitle,
          assetType: campaign.assetType || null,
          assetThumbnail,
          status: campaign.status,
          paymentStatus: campaign.paymentStatus,
          budgetCents: campaign.budgetCents,
          dailyBudgetCents: campaign.dailyBudgetCents,
          durationDays: campaign.durationDays,
          platform: campaign.platform,
          // Creator info
          creatorName: creator?.name || creator?.email,
          creatorEmail: creator?.email,
          creatorId: campaign.createdByUserId,
          // Profile info
          profileName: profile?.displayName,
          profileSlug: profile?.slug,
          profileId: campaign.actorProfileId,
          // Metrics
          impressions: campaign.impressions ?? 0,
          clicks: campaign.clicks ?? 0,
          reach: campaign.reach ?? 0,
          spentCents: campaign.spentCents ?? 0,
          conversions: campaign.conversions ?? 0,
          ctr: campaign.ctr,
          cpc: campaign.cpc,
          cpm: campaign.cpm,
          // Dates
          createdAt: campaign.createdAt,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          paidAt: campaign.paidAt,
          daysRemaining,
        };
      })
    );

    return enrichedCampaigns;
  },
});

/**
 * Get boost analytics summary
 */
export const getBoostAnalytics = query({
  args: {
    adminEmail: v.string(),
  },
  async handler(ctx, args) {
    await validateSuperadminByEmail(ctx, args.adminEmail);

    const campaigns = await ctx.db.query("boost_campaigns").collect();

    const now = Date.now();
    const today = now - 24 * 60 * 60 * 1000;
    const thisWeek = now - 7 * 24 * 60 * 60 * 1000;
    const thisMonth = now - 30 * 24 * 60 * 60 * 1000;

    const activeCampaigns = campaigns.filter((c) => c.status === "active");
    const pendingCampaigns = campaigns.filter((c) => c.status === "pending");
    const paidCampaigns = campaigns.filter((c) => c.paymentStatus === "paid");

    const totalRevenue = paidCampaigns.reduce((sum, c) => sum + c.budgetCents, 0);
    const totalSpent = campaigns.reduce((sum, c) => sum + (c.spentCents ?? 0), 0);
    const totalImpressions = campaigns.reduce((sum, c) => sum + (c.impressions ?? 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks ?? 0), 0);

    const campaignsToday = campaigns.filter((c) => c.createdAt >= today).length;
    const campaignsThisWeek = campaigns.filter((c) => c.createdAt >= thisWeek).length;
    const campaignsThisMonth = campaigns.filter((c) => c.createdAt >= thisMonth).length;

    const revenueToday = paidCampaigns
      .filter((c) => (c.paidAt ?? c.createdAt) >= today)
      .reduce((sum, c) => sum + c.budgetCents, 0);
    const revenueThisWeek = paidCampaigns
      .filter((c) => (c.paidAt ?? c.createdAt) >= thisWeek)
      .reduce((sum, c) => sum + c.budgetCents, 0);
    const revenueThisMonth = paidCampaigns
      .filter((c) => (c.paidAt ?? c.createdAt) >= thisMonth)
      .reduce((sum, c) => sum + c.budgetCents, 0);

    // By asset type
    const byAssetType = {
      clip: campaigns.filter((c) => c.assetType === "clip").length,
      meme: campaigns.filter((c) => c.assetType === "meme").length,
      gif: campaigns.filter((c) => c.assetType === "gif").length,
    };

    return {
      totalCampaigns: campaigns.length,
      activeCampaigns: activeCampaigns.length,
      pendingCampaigns: pendingCampaigns.length,
      paidCampaigns: paidCampaigns.length,
      totalRevenueCents: totalRevenue,
      totalSpentCents: totalSpent,
      totalImpressions,
      totalClicks,
      avgCTR: totalImpressions > 0
        ? Math.round((totalClicks / totalImpressions) * 10000) / 100
        : 0,
      byAssetType,
      timeStats: {
        campaignsToday,
        campaignsThisWeek,
        campaignsThisMonth,
        revenueToday,
        revenueThisWeek,
        revenueThisMonth,
      },
    };
  },
});

// =============================================================================
// ASSET MANAGEMENT - View all generated assets across users
// =============================================================================

/**
 * Get all generated clips across all users
 */
export const getAllGeneratedClips = query({
  args: {
    adminEmail: v.string(),
    limit: v.optional(v.number()),
  },
  async handler(ctx, args) {
    await validateSuperadminByEmail(ctx, args.adminEmail);

    const limit = args.limit ?? 100;
    const clips = await ctx.db.query("generated_clips").order("desc").take(limit);

    const enrichedClips = await Promise.all(
      clips.map(async (clip) => {
        const profile = await ctx.db.get(clip.actorProfileId);
        const user = profile ? await ctx.db.get(profile.userId) : null;

        return {
          _id: clip._id,
          title: clip.title,
          status: clip.status,
          thumbnailUrl: clip.customThumbnailUrl || clip.thumbnailUrl,
          videoUrl: clip.downloadUrl,
          duration: clip.duration,
          createdAt: clip._creationTime,
          // Profile info
          profileName: profile?.displayName,
          profileSlug: profile?.slug,
          // User info
          userName: user?.name || user?.email,
          userEmail: user?.email,
        };
      })
    );

    return enrichedClips;
  },
});

/**
 * Get all generated memes across all users
 */
export const getAllGeneratedMemes = query({
  args: {
    adminEmail: v.string(),
    limit: v.optional(v.number()),
  },
  async handler(ctx, args) {
    await validateSuperadminByEmail(ctx, args.adminEmail);

    const limit = args.limit ?? 100;
    const memes = await ctx.db.query("generated_memes").order("desc").take(limit);
    const r2Bucket = process.env.R2_PUBLIC_BUCKET_URL;

    const enrichedMemes = await Promise.all(
      memes.map(async (meme) => {
        const profile = await ctx.db.get(meme.actorProfileId);
        const user = profile ? await ctx.db.get(profile.userId) : null;

        let imageUrl: string | null = null;
        if (meme.memeStorageId) {
          imageUrl = await ctx.storage.getUrl(meme.memeStorageId);
        } else if (r2Bucket && meme.r2MemeKey) {
          imageUrl = `${r2Bucket}/${meme.r2MemeKey}`;
        }

        return {
          _id: meme._id,
          caption: meme.caption,
          imageUrl,
          templateName: meme.templateName || meme.templateType,
          createdAt: meme._creationTime,
          // Profile info
          profileName: profile?.displayName,
          profileSlug: profile?.slug,
          // User info
          userName: user?.name || user?.email,
          userEmail: user?.email,
        };
      })
    );

    return enrichedMemes;
  },
});

/**
 * Get all generated GIFs across all users
 */
export const getAllGeneratedGifs = query({
  args: {
    adminEmail: v.string(),
    limit: v.optional(v.number()),
  },
  async handler(ctx, args) {
    await validateSuperadminByEmail(ctx, args.adminEmail);

    const limit = args.limit ?? 100;
    const gifs = await ctx.db.query("generated_gifs").order("desc").take(limit);
    const r2Bucket = process.env.R2_PUBLIC_BUCKET_URL;

    const enrichedGifs = await Promise.all(
      gifs.map(async (gif) => {
        const profile = await ctx.db.get(gif.actorProfileId);
        const user = profile ? await ctx.db.get(profile.userId) : null;

        let gifUrl: string | null = null;
        if (gif.storageId) {
          gifUrl = await ctx.storage.getUrl(gif.storageId);
        } else if (r2Bucket && gif.r2GifKey) {
          gifUrl = `${r2Bucket}/${gif.r2GifKey}`;
        }

        return {
          _id: gif._id,
          title: gif.title,
          gifUrl,
          duration: gif.duration,
          createdAt: gif._creationTime,
          // Profile info
          profileName: profile?.displayName,
          profileSlug: profile?.slug,
          // User info
          userName: user?.name || user?.email,
          userEmail: user?.email,
        };
      })
    );

    return enrichedGifs;
  },
});

/**
 * Get asset counts summary across all users
 */
export const getAssetsSummary = query({
  args: {
    adminEmail: v.string(),
  },
  async handler(ctx, args) {
    await validateSuperadminByEmail(ctx, args.adminEmail);

    const now = Date.now();
    const today = now - 24 * 60 * 60 * 1000;
    const thisWeek = now - 7 * 24 * 60 * 60 * 1000;
    const thisMonth = now - 30 * 24 * 60 * 60 * 1000;

    const [clips, memes, gifs, trailerJobs] = await Promise.all([
      ctx.db.query("generated_clips").collect(),
      ctx.db.query("generated_memes").collect(),
      ctx.db.query("generated_gifs").collect(),
      ctx.db.query("trailer_jobs").collect(),
    ]);

    // Count by time period
    const clipsToday = clips.filter((c) => c._creationTime >= today).length;
    const clipsThisWeek = clips.filter((c) => c._creationTime >= thisWeek).length;
    const clipsThisMonth = clips.filter((c) => c._creationTime >= thisMonth).length;

    const memesToday = memes.filter((m) => m._creationTime >= today).length;
    const memesThisWeek = memes.filter((m) => m._creationTime >= thisWeek).length;
    const memesThisMonth = memes.filter((m) => m._creationTime >= thisMonth).length;

    const gifsToday = gifs.filter((g) => g._creationTime >= today).length;
    const gifsThisWeek = gifs.filter((g) => g._creationTime >= thisWeek).length;
    const gifsThisMonth = gifs.filter((g) => g._creationTime >= thisMonth).length;

    // Unique profiles that have generated assets
    const profilesWithClips = new Set(clips.map((c) => c.actorProfileId.toString())).size;
    const profilesWithMemes = new Set(memes.map((m) => m.actorProfileId.toString())).size;
    const profilesWithGifs = new Set(gifs.map((g) => g.actorProfileId.toString())).size;

    // Trailer jobs status
    const pendingTrailers = trailerJobs.filter((t) => t.status === "pending").length;
    const processingTrailers = trailerJobs.filter((t) => t.status === "processing").length;
    const completedTrailers = trailerJobs.filter((t) => t.status === "completed").length;

    return {
      clips: {
        total: clips.length,
        today: clipsToday,
        thisWeek: clipsThisWeek,
        thisMonth: clipsThisMonth,
        profilesUsing: profilesWithClips,
      },
      memes: {
        total: memes.length,
        today: memesToday,
        thisWeek: memesThisWeek,
        thisMonth: memesThisMonth,
        profilesUsing: profilesWithMemes,
      },
      gifs: {
        total: gifs.length,
        today: gifsToday,
        thisWeek: gifsThisWeek,
        thisMonth: gifsThisMonth,
        profilesUsing: profilesWithGifs,
      },
      trailers: {
        total: trailerJobs.length,
        pending: pendingTrailers,
        processing: processingTrailers,
        completed: completedTrailers,
      },
    };
  },
});
