import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// =============================================================================
// ADMIN-ONLY BOOST MANAGEMENT FUNCTIONS
// These functions require superadmin access and should only be used
// from the admin dashboard
// =============================================================================

/**
 * Helper to validate superadmin access
 */
async function validateSuperadmin(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const currentUser = await ctx.db
    .query("users")
    .withIndex("by_authId", (q: any) => q.eq("authId", identity.tokenIdentifier))
    .unique();

  if (!currentUser?.superadmin) throw new Error("Admin access required");
  return currentUser;
}

// =============================================================================
// BOOST CAMPAIGN QUERIES (ADMIN VIEW)
// =============================================================================

/**
 * Get all boost campaigns across all users (admin view)
 */
export const getAllBoostCampaignsAdmin = query({
  args: {
    status: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    profileId: v.optional(v.id("actor_profiles")),
    sortBy: v.optional(v.union(v.literal("recent"), v.literal("budget"), v.literal("impressions"))),
    limit: v.optional(v.number()),
  },
  async handler(ctx, args) {
    await validateSuperadmin(ctx);

    const limit = args.limit ?? 100;
    let campaigns = await ctx.db.query("boost_campaigns").order("desc").collect();

    // Apply filters
    if (args.status) {
      campaigns = campaigns.filter((c) => c.status === args.status);
    }
    if (args.userId) {
      campaigns = campaigns.filter((c) => c.createdByUserId === args.userId);
    }
    if (args.profileId) {
      campaigns = campaigns.filter((c) => c.actorProfileId === args.profileId);
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
 * Get boost analytics summary for admin dashboard
 */
export const getBoostAnalyticsSummary = query({
  args: {},
  async handler(ctx) {
    await validateSuperadmin(ctx);

    const campaigns = await ctx.db.query("boost_campaigns").collect();

    const activeCampaigns = campaigns.filter((c) => c.status === "active");
    const paidCampaigns = campaigns.filter((c) => c.paymentStatus === "paid");

    const totalRevenue = paidCampaigns.reduce((sum, c) => sum + c.budgetCents, 0);
    const totalSpent = campaigns.reduce((sum, c) => sum + (c.spentCents ?? 0), 0);
    const totalImpressions = campaigns.reduce((sum, c) => sum + (c.impressions ?? 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks ?? 0), 0);

    const avgCPC = totalClicks > 0 ? Math.round(totalSpent / totalClicks) : 0;
    const avgCPM = totalImpressions > 0 ? Math.round((totalSpent / totalImpressions) * 1000) : 0;
    const overallCTR = totalImpressions > 0
      ? Math.round((totalClicks / totalImpressions) * 10000) / 100
      : 0;

    // Get top performers (by impressions)
    const topPerformers = campaigns
      .filter((c) => c.status === "active" || c.status === "completed")
      .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
      .slice(0, 5);

    const enrichedTopPerformers = await Promise.all(
      topPerformers.map(async (c) => {
        const profile = c.actorProfileId ? await ctx.db.get(c.actorProfileId) : null;
        return {
          _id: c._id,
          name: c.name,
          impressions: c.impressions ?? 0,
          clicks: c.clicks ?? 0,
          spentCents: c.spentCents ?? 0,
          profileName: profile?.displayName,
        };
      })
    );

    // Time-based stats
    const now = Date.now();
    const today = now - 24 * 60 * 60 * 1000;
    const thisWeek = now - 7 * 24 * 60 * 60 * 1000;
    const thisMonth = now - 30 * 24 * 60 * 60 * 1000;

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

    return {
      totalCampaigns: campaigns.length,
      activeCampaigns: activeCampaigns.length,
      paidCampaigns: paidCampaigns.length,
      totalRevenueCents: totalRevenue,
      totalSpentCents: totalSpent,
      totalImpressions,
      totalClicks,
      avgCPC,
      avgCPM,
      overallCTR,
      topPerformers: enrichedTopPerformers,
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
// ADMIN BOOST ACTIONS
// =============================================================================

/**
 * Gift a boost to a user (no payment required)
 */
export const giftBoostToUser = mutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    assetId: v.string(),
    assetType: v.union(v.literal("clip"), v.literal("meme"), v.literal("gif")),
    budgetCents: v.number(),
    durationDays: v.number(),
    platform: v.optional(v.string()),
    reason: v.string(), // "contest_winner", "featured", "promotional", etc.
  },
  async handler(ctx, args) {
    const admin = await validateSuperadmin(ctx);

    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile) throw new Error("Profile not found");

    // Verify the asset exists
    let assetTitle = "Gifted Boost";
    if (args.assetType === "clip") {
      const clip = await ctx.db.get(args.assetId as Id<"generated_clips">);
      if (!clip) throw new Error("Clip not found");
      assetTitle = clip.title;
    } else if (args.assetType === "meme") {
      const meme = await ctx.db.get(args.assetId as Id<"generated_memes">);
      if (!meme) throw new Error("Meme not found");
      assetTitle = meme.caption?.slice(0, 50) || "Boosted Meme";
    } else if (args.assetType === "gif") {
      const gif = await ctx.db.get(args.assetId as Id<"generated_gifs">);
      if (!gif) throw new Error("GIF not found");
      assetTitle = gif.title || "Boosted GIF";
    }

    const now = Date.now();
    const endDate = now + args.durationDays * 24 * 60 * 60 * 1000;

    // Create the campaign as active (gift = no payment needed)
    const campaignId = await ctx.db.insert("boost_campaigns", {
      createdByUserId: profile.userId, // Assign to the user who owns the profile
      actorProfileId: args.actorProfileId,
      assetId: args.assetId,
      assetType: args.assetType,
      name: `[GIFT] ${assetTitle}`,
      status: "active",
      budgetCents: args.budgetCents,
      dailyBudgetCents: Math.round(args.budgetCents / args.durationDays),
      durationDays: args.durationDays,
      platform: args.platform ?? "all",
      paymentStatus: "paid", // Gifted = no payment required
      paidAt: now,
      startDate: now,
      endDate: endDate,
      createdAt: now,
      // Initialize metrics
      spentCents: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    });

    // Log admin action
    await ctx.db.insert("admin_audit_log", {
      adminUserId: admin._id,
      adminEmail: admin.email,
      action: "gift_boost",
      actionCategory: "boost",
      targetType: "boost",
      targetId: campaignId,
      targetName: assetTitle,
      details: JSON.stringify({
        reason: args.reason,
        budgetCents: args.budgetCents,
        durationDays: args.durationDays,
        recipientProfileId: args.actorProfileId,
      }),
      success: true,
      createdAt: now,
    });

    return {
      campaignId,
      message: `Gifted $${(args.budgetCents / 100).toFixed(2)} boost for ${args.durationDays} days`,
    };
  },
});

/**
 * Pause a boost campaign
 */
export const pauseBoostCampaign = mutation({
  args: {
    campaignId: v.id("boost_campaigns"),
    reason: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const admin = await validateSuperadmin(ctx);

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status !== "active") {
      throw new Error("Only active campaigns can be paused");
    }

    await ctx.db.patch(args.campaignId, {
      status: "paused",
    });

    // Log admin action
    await ctx.db.insert("admin_audit_log", {
      adminUserId: admin._id,
      adminEmail: admin.email,
      action: "pause_boost",
      actionCategory: "boost",
      targetType: "boost",
      targetId: args.campaignId,
      targetName: campaign.name,
      details: args.reason ? JSON.stringify({ reason: args.reason }) : undefined,
      previousValue: "active",
      newValue: "paused",
      success: true,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Resume a paused boost campaign
 */
export const resumeBoostCampaign = mutation({
  args: {
    campaignId: v.id("boost_campaigns"),
  },
  async handler(ctx, args) {
    const admin = await validateSuperadmin(ctx);

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status !== "paused") {
      throw new Error("Only paused campaigns can be resumed");
    }

    // Check if campaign hasn't expired
    if (campaign.endDate && campaign.endDate < Date.now()) {
      throw new Error("Campaign has expired and cannot be resumed");
    }

    await ctx.db.patch(args.campaignId, {
      status: "active",
    });

    // Log admin action
    await ctx.db.insert("admin_audit_log", {
      adminUserId: admin._id,
      adminEmail: admin.email,
      action: "resume_boost",
      actionCategory: "boost",
      targetType: "boost",
      targetId: args.campaignId,
      targetName: campaign.name,
      previousValue: "paused",
      newValue: "active",
      success: true,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Cancel a boost campaign (with optional refund note)
 */
export const cancelBoostCampaign = mutation({
  args: {
    campaignId: v.id("boost_campaigns"),
    reason: v.string(),
    refundRequested: v.optional(v.boolean()),
  },
  async handler(ctx, args) {
    const admin = await validateSuperadmin(ctx);

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status === "completed" || campaign.status === "cancelled") {
      throw new Error("Campaign is already completed or cancelled");
    }

    await ctx.db.patch(args.campaignId, {
      status: "cancelled",
    });

    // Log admin action
    await ctx.db.insert("admin_audit_log", {
      adminUserId: admin._id,
      adminEmail: admin.email,
      action: "cancel_boost",
      actionCategory: "boost",
      targetType: "boost",
      targetId: args.campaignId,
      targetName: campaign.name,
      details: JSON.stringify({
        reason: args.reason,
        refundRequested: args.refundRequested,
        spentCents: campaign.spentCents,
        budgetCents: campaign.budgetCents,
      }),
      previousValue: campaign.status,
      newValue: "cancelled",
      success: true,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

// =============================================================================
// SUBMISSION NOTIFICATIONS
// =============================================================================

/**
 * Get unreviewed submission notifications
 */
export const getSubmissionNotifications = query({
  args: {
    reviewed: v.optional(v.boolean()),
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  async handler(ctx, args) {
    await validateSuperadmin(ctx);

    const limit = args.limit ?? 50;
    const reviewed = args.reviewed ?? false;

    let notifications = await ctx.db
      .query("admin_submission_notifications")
      .withIndex("by_reviewed", (q) => q.eq("reviewed", reviewed))
      .order("desc")
      .take(limit);

    if (args.type) {
      notifications = notifications.filter((n) => n.type === args.type);
    }

    // Enrich with profile info
    const enriched = await Promise.all(
      notifications.map(async (notification) => {
        const profile = await ctx.db.get(notification.actorProfileId);
        const user = notification.userId ? await ctx.db.get(notification.userId) : null;

        return {
          ...notification,
          profileName: profile?.displayName,
          profileSlug: profile?.slug,
          userName: user?.name || user?.email,
          userEmail: user?.email,
        };
      })
    );

    return enriched;
  },
});

/**
 * Mark a submission notification as reviewed
 */
export const reviewSubmissionNotification = mutation({
  args: {
    notificationId: v.id("admin_submission_notifications"),
    action: v.string(), // "boosted", "featured", "ignored", "flagged"
    notes: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const admin = await validateSuperadmin(ctx);

    const notification = await ctx.db.get(args.notificationId);
    if (!notification) throw new Error("Notification not found");

    await ctx.db.patch(args.notificationId, {
      reviewed: true,
      reviewedBy: admin._id,
      reviewedAt: Date.now(),
      action: args.action,
      actionNotes: args.notes,
    });

    return { success: true };
  },
});

// =============================================================================
// BOOST SUGGESTIONS
// =============================================================================

/**
 * Get AI boost suggestions
 */
export const getBoostSuggestions = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  async handler(ctx, args) {
    await validateSuperadmin(ctx);

    const status = args.status ?? "pending";
    const limit = args.limit ?? 20;

    const suggestions = await ctx.db
      .query("admin_boost_suggestions")
      .withIndex("by_status", (q) => q.eq("status", status))
      .order("desc")
      .take(limit);

    // Enrich with profile info
    const enriched = await Promise.all(
      suggestions.map(async (suggestion) => {
        const profile = await ctx.db.get(suggestion.actorProfileId);
        const user = profile ? await ctx.db.get(profile.userId) : null;

        return {
          ...suggestion,
          profileName: profile?.displayName,
          profileSlug: profile?.slug,
          userName: user?.name || user?.email,
        };
      })
    );

    // Sort by score descending
    enriched.sort((a, b) => b.score - a.score);

    return enriched;
  },
});

/**
 * Approve or reject a boost suggestion
 */
export const reviewBoostSuggestion = mutation({
  args: {
    suggestionId: v.id("admin_boost_suggestions"),
    action: v.union(v.literal("approved"), v.literal("rejected")),
    rejectionReason: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const admin = await validateSuperadmin(ctx);

    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) throw new Error("Suggestion not found");

    await ctx.db.patch(args.suggestionId, {
      status: args.action,
      reviewedBy: admin._id,
      reviewedAt: Date.now(),
      rejectionReason: args.rejectionReason,
    });

    return { success: true };
  },
});

/**
 * Create a boost from an approved suggestion
 */
export const createBoostFromSuggestion = mutation({
  args: {
    suggestionId: v.id("admin_boost_suggestions"),
    budgetCents: v.number(),
    durationDays: v.number(),
    platform: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const admin = await validateSuperadmin(ctx);

    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) throw new Error("Suggestion not found");
    if (suggestion.status !== "approved") {
      throw new Error("Suggestion must be approved first");
    }

    // Create the boost using the gift function logic
    const profile = await ctx.db.get(suggestion.actorProfileId);
    if (!profile) throw new Error("Profile not found");

    const now = Date.now();
    const endDate = now + args.durationDays * 24 * 60 * 60 * 1000;

    const campaignId = await ctx.db.insert("boost_campaigns", {
      createdByUserId: profile.userId,
      actorProfileId: suggestion.actorProfileId,
      assetId: suggestion.assetId,
      assetType: suggestion.assetType,
      name: suggestion.assetTitle || "Boosted Asset",
      status: "active",
      budgetCents: args.budgetCents,
      dailyBudgetCents: Math.round(args.budgetCents / args.durationDays),
      durationDays: args.durationDays,
      platform: args.platform ?? "all",
      paymentStatus: "paid",
      paidAt: now,
      startDate: now,
      endDate: endDate,
      createdAt: now,
      spentCents: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    });

    // Update suggestion status
    await ctx.db.patch(args.suggestionId, {
      status: "boosted",
      boostCampaignId: campaignId,
    });

    // Log admin action
    await ctx.db.insert("admin_audit_log", {
      adminUserId: admin._id,
      adminEmail: admin.email,
      action: "boost_from_suggestion",
      actionCategory: "boost",
      targetType: "boost",
      targetId: campaignId,
      targetName: suggestion.assetTitle,
      details: JSON.stringify({
        suggestionId: args.suggestionId,
        suggestionScore: suggestion.score,
        budgetCents: args.budgetCents,
        durationDays: args.durationDays,
      }),
      success: true,
      createdAt: now,
    });

    return { campaignId };
  },
});
