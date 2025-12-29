import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// =============================================================================
// ADMIN-ONLY EMAIL CAMPAIGN FUNCTIONS
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
// AUDIENCE QUERIES
// =============================================================================

/**
 * Get all filmmakers (users with profiles) for email campaigns
 */
export const getAllFilmmakersRecipients = query({
  args: {},
  async handler(ctx) {
    await validateSuperadmin(ctx);

    const profiles = await ctx.db.query("actor_profiles").collect();
    const users = await ctx.db.query("users").collect();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const recipients = profiles.map((profile) => {
      const user = userMap.get(profile.userId.toString());
      return {
        email: user?.email,
        name: profile.displayName || user?.name,
        userId: profile.userId,
        profileId: profile._id,
        slug: profile.slug,
      };
    }).filter((r) => r.email);

    return recipients;
  },
});

/**
 * Preview audience count based on filters
 */
export const getAudiencePreview = query({
  args: {
    audienceType: v.string(),
    filters: v.optional(
      v.object({
        location: v.optional(v.string()),
        hasTrailer: v.optional(v.boolean()),
        minFilmCount: v.optional(v.number()),
        engagementLevel: v.optional(v.string()),
        hasClips: v.optional(v.boolean()),
        hasMemes: v.optional(v.boolean()),
      })
    ),
  },
  async handler(ctx, args) {
    await validateSuperadmin(ctx);

    let recipients: Array<{ email: string; name?: string }> = [];

    if (args.audienceType === "all_filmmakers") {
      const profiles = await ctx.db.query("actor_profiles").collect();
      const users = await ctx.db.query("users").collect();
      const userMap = new Map(users.map((u) => [u._id.toString(), u]));

      let filteredProfiles = profiles;

      // Apply location filter
      if (args.filters?.location) {
        const locationLower = args.filters.location.toLowerCase();
        filteredProfiles = filteredProfiles.filter(
          (p) => p.location?.toLowerCase().includes(locationLower)
        );
      }

      // Apply trailer filter
      if (args.filters?.hasTrailer !== undefined) {
        const projects = await ctx.db.query("projects").collect();
        const profilesWithTrailer = new Set(
          projects.filter((p) => p.trailerUrl).map((p) => p.actorProfileId.toString())
        );
        filteredProfiles = filteredProfiles.filter((p) =>
          args.filters?.hasTrailer
            ? profilesWithTrailer.has(p._id.toString())
            : !profilesWithTrailer.has(p._id.toString())
        );
      }

      // Apply film count filter
      if (args.filters?.minFilmCount) {
        const projects = await ctx.db.query("projects").collect();
        const filmCounts = new Map<string, number>();
        for (const project of projects) {
          const key = project.actorProfileId.toString();
          filmCounts.set(key, (filmCounts.get(key) ?? 0) + 1);
        }
        filteredProfiles = filteredProfiles.filter(
          (p) => (filmCounts.get(p._id.toString()) ?? 0) >= (args.filters?.minFilmCount ?? 0)
        );
      }

      // Apply clips filter
      if (args.filters?.hasClips !== undefined) {
        const clips = await ctx.db.query("generated_clips").collect();
        const profilesWithClips = new Set(clips.map((c) => c.actorProfileId.toString()));
        filteredProfiles = filteredProfiles.filter((p) =>
          args.filters?.hasClips
            ? profilesWithClips.has(p._id.toString())
            : !profilesWithClips.has(p._id.toString())
        );
      }

      recipients = filteredProfiles
        .map((profile) => {
          const user = userMap.get(profile.userId.toString());
          return {
            email: user?.email || "",
            name: profile.displayName || user?.name,
          };
        })
        .filter((r) => r.email);
    } else if (args.audienceType === "incomplete_onboarding") {
      // Get from adminCampaigns
      const incompleteUsers = await ctx.runQuery(
        internal.adminCampaigns.getIncompleteOnboardingRecipients,
        {}
      );
      recipients = incompleteUsers.map((u) => ({
        email: u.email,
        name: u.name,
      }));
    } else if (args.audienceType === "fan_subscribers") {
      const fanEmails = await ctx.db
        .query("fan_emails")
        .filter((q) => q.neq(q.field("unsubscribed"), true))
        .collect();
      recipients = fanEmails.map((f) => ({
        email: f.email,
        name: f.name,
      }));
    }

    // Dedupe by email
    const uniqueEmails = new Map<string, { email: string; name?: string }>();
    for (const r of recipients) {
      if (!uniqueEmails.has(r.email.toLowerCase())) {
        uniqueEmails.set(r.email.toLowerCase(), r);
      }
    }

    return {
      audienceType: args.audienceType,
      count: uniqueEmails.size,
      sampleRecipients: Array.from(uniqueEmails.values()).slice(0, 5),
    };
  },
});

// =============================================================================
// CAMPAIGN MANAGEMENT
// =============================================================================

/**
 * Get all admin email campaigns
 */
export const getCampaigns = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  async handler(ctx, args) {
    await validateSuperadmin(ctx);

    let campaignsQuery = ctx.db.query("admin_email_campaigns").order("desc");

    if (args.status) {
      campaignsQuery = ctx.db
        .query("admin_email_campaigns")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc");
    }

    const campaigns = await campaignsQuery.take(args.limit ?? 50);

    // Enrich with creator info
    const enriched = await Promise.all(
      campaigns.map(async (campaign) => {
        const creator = await ctx.db.get(campaign.createdBy);
        return {
          ...campaign,
          creatorName: creator?.name || creator?.email,
        };
      })
    );

    return enriched;
  },
});

/**
 * Get a single campaign by ID
 */
export const getCampaign = query({
  args: {
    campaignId: v.id("admin_email_campaigns"),
  },
  async handler(ctx, args) {
    await validateSuperadmin(ctx);

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) return null;

    const creator = await ctx.db.get(campaign.createdBy);
    const sentBy = campaign.sentBy ? await ctx.db.get(campaign.sentBy) : null;

    return {
      ...campaign,
      creatorName: creator?.name || creator?.email,
      sentByName: sentBy?.name || sentBy?.email,
    };
  },
});

/**
 * Get campaign send details
 */
export const getCampaignSends = query({
  args: {
    campaignId: v.id("admin_email_campaigns"),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  async handler(ctx, args) {
    await validateSuperadmin(ctx);

    let sendsQuery = ctx.db
      .query("admin_email_sends")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId));

    if (args.status) {
      sendsQuery = ctx.db
        .query("admin_email_sends")
        .withIndex("by_campaign_status", (q) =>
          q.eq("campaignId", args.campaignId).eq("status", args.status!)
        );
    }

    const sends = await sendsQuery.take(args.limit ?? 100);
    return sends;
  },
});

/**
 * Create a new admin email campaign (draft)
 */
export const createCampaign = mutation({
  args: {
    name: v.string(),
    subject: v.string(),
    preheaderText: v.optional(v.string()),
    bodyHtml: v.string(),
    bodyText: v.optional(v.string()),
    audienceType: v.string(),
    audienceFilters: v.optional(
      v.object({
        location: v.optional(v.string()),
        hasTrailer: v.optional(v.boolean()),
        minFilmCount: v.optional(v.number()),
        engagementLevel: v.optional(v.string()),
        signupDateAfter: v.optional(v.number()),
        signupDateBefore: v.optional(v.number()),
        hasClips: v.optional(v.boolean()),
        hasMemes: v.optional(v.boolean()),
      })
    ),
    fromName: v.string(),
    replyTo: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const admin = await validateSuperadmin(ctx);

    const now = Date.now();
    const campaignId = await ctx.db.insert("admin_email_campaigns", {
      name: args.name,
      subject: args.subject,
      preheaderText: args.preheaderText,
      bodyHtml: args.bodyHtml,
      bodyText: args.bodyText,
      audienceType: args.audienceType,
      audienceFilters: args.audienceFilters,
      status: "draft",
      fromName: args.fromName,
      replyTo: args.replyTo,
      createdBy: admin._id,
      createdAt: now,
      updatedAt: now,
    });

    // Log admin action
    await ctx.db.insert("admin_audit_log", {
      adminUserId: admin._id,
      adminEmail: admin.email,
      action: "create_campaign",
      actionCategory: "campaign",
      targetType: "campaign",
      targetId: campaignId,
      targetName: args.name,
      success: true,
      createdAt: now,
    });

    return campaignId;
  },
});

/**
 * Update an existing campaign (only drafts can be updated)
 */
export const updateCampaign = mutation({
  args: {
    campaignId: v.id("admin_email_campaigns"),
    name: v.optional(v.string()),
    subject: v.optional(v.string()),
    preheaderText: v.optional(v.string()),
    bodyHtml: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    audienceType: v.optional(v.string()),
    audienceFilters: v.optional(
      v.object({
        location: v.optional(v.string()),
        hasTrailer: v.optional(v.boolean()),
        minFilmCount: v.optional(v.number()),
        engagementLevel: v.optional(v.string()),
        signupDateAfter: v.optional(v.number()),
        signupDateBefore: v.optional(v.number()),
        hasClips: v.optional(v.boolean()),
        hasMemes: v.optional(v.boolean()),
      })
    ),
    fromName: v.optional(v.string()),
    replyTo: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const admin = await validateSuperadmin(ctx);

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status !== "draft") {
      throw new Error("Only draft campaigns can be updated");
    }

    const updates: any = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.subject !== undefined) updates.subject = args.subject;
    if (args.preheaderText !== undefined) updates.preheaderText = args.preheaderText;
    if (args.bodyHtml !== undefined) updates.bodyHtml = args.bodyHtml;
    if (args.bodyText !== undefined) updates.bodyText = args.bodyText;
    if (args.audienceType !== undefined) updates.audienceType = args.audienceType;
    if (args.audienceFilters !== undefined) updates.audienceFilters = args.audienceFilters;
    if (args.fromName !== undefined) updates.fromName = args.fromName;
    if (args.replyTo !== undefined) updates.replyTo = args.replyTo;

    await ctx.db.patch(args.campaignId, updates);

    return { success: true };
  },
});

/**
 * Schedule a campaign for future sending
 */
export const scheduleCampaign = mutation({
  args: {
    campaignId: v.id("admin_email_campaigns"),
    scheduledFor: v.number(),
  },
  async handler(ctx, args) {
    const admin = await validateSuperadmin(ctx);

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status !== "draft") {
      throw new Error("Only draft campaigns can be scheduled");
    }

    await ctx.db.patch(args.campaignId, {
      status: "scheduled",
      scheduledFor: args.scheduledFor,
      updatedAt: Date.now(),
    });

    // Log admin action
    await ctx.db.insert("admin_audit_log", {
      adminUserId: admin._id,
      adminEmail: admin.email,
      action: "schedule_campaign",
      actionCategory: "campaign",
      targetType: "campaign",
      targetId: args.campaignId,
      targetName: campaign.name,
      details: JSON.stringify({ scheduledFor: args.scheduledFor }),
      success: true,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Cancel a scheduled or sending campaign
 */
export const cancelCampaign = mutation({
  args: {
    campaignId: v.id("admin_email_campaigns"),
    reason: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const admin = await validateSuperadmin(ctx);

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");
    if (!["draft", "scheduled", "sending"].includes(campaign.status)) {
      throw new Error("Cannot cancel a campaign that is already sent");
    }

    await ctx.db.patch(args.campaignId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });

    // Log admin action
    await ctx.db.insert("admin_audit_log", {
      adminUserId: admin._id,
      adminEmail: admin.email,
      action: "cancel_campaign",
      actionCategory: "campaign",
      targetType: "campaign",
      targetId: args.campaignId,
      targetName: campaign.name,
      details: args.reason ? JSON.stringify({ reason: args.reason }) : undefined,
      success: true,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Delete a draft campaign
 */
export const deleteCampaign = mutation({
  args: {
    campaignId: v.id("admin_email_campaigns"),
  },
  async handler(ctx, args) {
    const admin = await validateSuperadmin(ctx);

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status !== "draft") {
      throw new Error("Only draft campaigns can be deleted");
    }

    await ctx.db.delete(args.campaignId);

    // Log admin action
    await ctx.db.insert("admin_audit_log", {
      adminUserId: admin._id,
      adminEmail: admin.email,
      action: "delete_campaign",
      actionCategory: "campaign",
      targetType: "campaign",
      targetId: args.campaignId,
      targetName: campaign.name,
      success: true,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

// =============================================================================
// INTERNAL FUNCTIONS FOR SENDING
// =============================================================================

/**
 * Internal: Get recipients for a campaign based on audience type
 */
export const getCampaignRecipients = internalQuery({
  args: {
    campaignId: v.id("admin_email_campaigns"),
  },
  async handler(ctx, args) {
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) return [];

    let recipients: Array<{
      email: string;
      name?: string;
      recipientType: string;
      recipientId?: string;
    }> = [];

    if (campaign.audienceType === "all_filmmakers") {
      const profiles = await ctx.db.query("actor_profiles").collect();
      const users = await ctx.db.query("users").collect();
      const userMap = new Map(users.map((u) => [u._id.toString(), u]));

      let filteredProfiles = profiles;

      // Apply filters from campaign.audienceFilters
      if (campaign.audienceFilters?.location) {
        const locationLower = campaign.audienceFilters.location.toLowerCase();
        filteredProfiles = filteredProfiles.filter(
          (p) => p.location?.toLowerCase().includes(locationLower)
        );
      }

      if (campaign.audienceFilters?.hasTrailer !== undefined) {
        const projects = await ctx.db.query("projects").collect();
        const profilesWithTrailer = new Set(
          projects.filter((p) => p.trailerUrl).map((p) => p.actorProfileId.toString())
        );
        filteredProfiles = filteredProfiles.filter((p) =>
          campaign.audienceFilters?.hasTrailer
            ? profilesWithTrailer.has(p._id.toString())
            : !profilesWithTrailer.has(p._id.toString())
        );
      }

      recipients = filteredProfiles
        .map((profile) => {
          const user = userMap.get(profile.userId.toString());
          return {
            email: user?.email || "",
            name: profile.displayName || user?.name,
            recipientType: "user",
            recipientId: profile.userId.toString(),
          };
        })
        .filter((r) => r.email);
    } else if (campaign.audienceType === "incomplete_onboarding") {
      const incompleteUsers = await ctx.runQuery(
        internal.adminCampaigns.getIncompleteOnboardingRecipients,
        {}
      );
      recipients = incompleteUsers.map((u) => ({
        email: u.email,
        name: u.name,
        recipientType: "auth_user",
        recipientId: u.authId,
      }));
    } else if (campaign.audienceType === "fan_subscribers") {
      const fanEmails = await ctx.db
        .query("fan_emails")
        .filter((q) => q.neq(q.field("unsubscribed"), true))
        .collect();
      recipients = fanEmails.map((f) => ({
        email: f.email,
        name: f.name,
        recipientType: "fan_email",
        recipientId: f._id.toString(),
      }));
    }

    // Dedupe by email
    const uniqueEmails = new Map<
      string,
      { email: string; name?: string; recipientType: string; recipientId?: string }
    >();
    for (const r of recipients) {
      if (!uniqueEmails.has(r.email.toLowerCase())) {
        uniqueEmails.set(r.email.toLowerCase(), r);
      }
    }

    return Array.from(uniqueEmails.values());
  },
});

/**
 * Internal: Create send records for a campaign
 */
export const createSendRecords = internalMutation({
  args: {
    campaignId: v.id("admin_email_campaigns"),
  },
  async handler(ctx, args) {
    const recipients = await ctx.runQuery(internal.adminEmails.getCampaignRecipients, {
      campaignId: args.campaignId,
    });

    const now = Date.now();
    const sendIds: Id<"admin_email_sends">[] = [];

    for (const recipient of recipients) {
      const trackingId = `${args.campaignId}-${now}-${Math.random().toString(36).substr(2, 9)}`;

      const sendId = await ctx.db.insert("admin_email_sends", {
        campaignId: args.campaignId,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        recipientType: recipient.recipientType,
        recipientId: recipient.recipientId,
        status: "pending",
        trackingId,
        createdAt: now,
      });

      sendIds.push(sendId);
    }

    // Update campaign with recipient count
    await ctx.db.patch(args.campaignId, {
      recipientCount: sendIds.length,
      status: "sending",
      sentAt: now,
      updatedAt: now,
    });

    return { sendIds, count: sendIds.length };
  },
});

/**
 * Internal: Update campaign metrics after sending
 */
export const updateCampaignMetrics = internalMutation({
  args: {
    campaignId: v.id("admin_email_campaigns"),
  },
  async handler(ctx, args) {
    const sends = await ctx.db
      .query("admin_email_sends")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect();

    const sentCount = sends.filter((s) => s.status !== "pending" && s.status !== "failed").length;
    const deliveredCount = sends.filter((s) => s.deliveredAt).length;
    const openedCount = sends.filter((s) => s.openedAt).length;
    const clickedCount = sends.filter((s) => s.clickedAt).length;
    const bouncedCount = sends.filter((s) => s.status === "bounced").length;
    const failedCount = sends.filter((s) => s.status === "failed").length;

    await ctx.db.patch(args.campaignId, {
      sentCount,
      deliveredCount,
      openedCount,
      clickedCount,
      bouncedCount,
      failedCount,
      updatedAt: Date.now(),
    });

    return {
      sentCount,
      deliveredCount,
      openedCount,
      clickedCount,
      bouncedCount,
      failedCount,
    };
  },
});

/**
 * Track email open via tracking pixel
 */
export const trackEmailOpen = mutation({
  args: {
    trackingId: v.string(),
  },
  async handler(ctx, args) {
    const sends = await ctx.db
      .query("admin_email_sends")
      .withIndex("by_trackingId", (q) => q.eq("trackingId", args.trackingId))
      .collect();

    const send = sends[0];
    if (!send) return { success: false };

    // Only update if not already opened
    if (!send.openedAt) {
      await ctx.db.patch(send._id, {
        status: "opened",
        openedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/**
 * Track email click
 */
export const trackEmailClick = mutation({
  args: {
    trackingId: v.string(),
    url: v.string(),
  },
  async handler(ctx, args) {
    const sends = await ctx.db
      .query("admin_email_sends")
      .withIndex("by_trackingId", (q) => q.eq("trackingId", args.trackingId))
      .collect();

    const send = sends[0];
    if (!send) return { success: false };

    const clickedLinks = send.clickedLinks || [];
    if (!clickedLinks.includes(args.url)) {
      clickedLinks.push(args.url);
    }

    await ctx.db.patch(send._id, {
      status: "clicked",
      clickedAt: send.clickedAt || Date.now(),
      clickedLinks,
    });

    return { success: true };
  },
});
