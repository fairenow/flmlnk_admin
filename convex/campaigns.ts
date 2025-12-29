import { v } from "convex/values";
import {
  mutation,
  query,
  action,
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { Resend } from "resend";

// ============================================
// CAMPAIGN QUERIES
// ============================================

/**
 * Get all campaigns for a profile
 */
export const getCampaigns = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  async handler(ctx, { actorProfileId, status, limit = 50 }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    // Verify ownership
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    const profile = await ctx.db.get(actorProfileId);
    if (!profile || !user || profile.userId !== user._id) {
      return [];
    }

    let campaigns;
    if (status) {
      campaigns = await ctx.db
        .query("email_campaigns")
        .withIndex("by_actorProfile_status", (q) =>
          q.eq("actorProfileId", actorProfileId).eq("status", status)
        )
        .order("desc")
        .take(limit);
    } else {
      campaigns = await ctx.db
        .query("email_campaigns")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
        .order("desc")
        .take(limit);
    }

    return campaigns;
  },
});

/**
 * Get a single campaign by ID
 */
export const getCampaign = query({
  args: {
    campaignId: v.id("email_campaigns"),
  },
  async handler(ctx, { campaignId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) {
      return null;
    }

    // Verify ownership
    const profile = await ctx.db.get(campaign.actorProfileId);
    if (!profile) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    if (!user || profile.userId !== user._id) {
      return null;
    }

    return campaign;
  },
});

/**
 * Get campaign by ID (internal)
 */
export const getCampaignById = internalQuery({
  args: {
    campaignId: v.id("email_campaigns"),
  },
  async handler(ctx, { campaignId }) {
    return ctx.db.get(campaignId);
  },
});

/**
 * Get campaign with full details including recipient stats
 */
export const getCampaignWithStats = query({
  args: {
    campaignId: v.id("email_campaigns"),
  },
  async handler(ctx, { campaignId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) {
      return null;
    }

    // Verify ownership
    const profile = await ctx.db.get(campaign.actorProfileId);
    if (!profile) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    if (!user || profile.userId !== user._id) {
      return null;
    }

    // Get recipient stats
    const recipients = await ctx.db
      .query("campaign_recipients")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();

    const stats = {
      total: recipients.length,
      pending: recipients.filter((r) => r.status === "pending").length,
      sent: recipients.filter((r) => r.status === "sent").length,
      delivered: recipients.filter((r) => r.status === "delivered").length,
      bounced: recipients.filter((r) => r.status === "bounced").length,
      failed: recipients.filter((r) => r.status === "failed").length,
      opened: recipients.filter((r) => r.openedAt).length,
      clicked: recipients.filter((r) => r.clickedAt).length,
    };

    return {
      ...campaign,
      recipientStats: stats,
    };
  },
});

// ============================================
// CAMPAIGN MUTATIONS
// ============================================

/**
 * Create a new campaign (draft)
 */
export const createCampaign = mutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    name: v.string(),
    templateKey: v.optional(v.string()),
    subject: v.string(),
    preheaderText: v.optional(v.string()),
    htmlContent: v.string(),
    textContent: v.string(),
    aiGenerated: v.boolean(),
    generationTone: v.optional(v.string()),
    generationBrevity: v.optional(v.string()),
    dataContext: v.optional(v.any()),
    audienceType: v.string(),
    audienceTags: v.optional(v.array(v.string())),
    fromName: v.optional(v.string()),
    replyTo: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Verify ownership
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile || profile.userId !== user._id) {
      throw new Error("Not authorized");
    }

    // Get estimated recipient count
    let estimatedRecipientCount = 0;
    if (args.audienceType === "creator_subscribers") {
      const subscribers = await ctx.db
        .query("fan_emails")
        .withIndex("by_actorProfile_unsubscribed", (q) =>
          q.eq("actorProfileId", args.actorProfileId).eq("unsubscribed", false)
        )
        .collect();
      estimatedRecipientCount = subscribers.length;

      // Fallback: also get those without explicit unsubscribed=false
      if (estimatedRecipientCount === 0) {
        const allSubscribers = await ctx.db
          .query("fan_emails")
          .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.actorProfileId))
          .collect();
        estimatedRecipientCount = allSubscribers.filter((s) => !s.unsubscribed).length;
      }
    }

    const now = Date.now();

    const campaignId = await ctx.db.insert("email_campaigns", {
      actorProfileId: args.actorProfileId,
      createdByUserId: user._id,
      name: args.name,
      templateKey: args.templateKey,
      status: "draft",
      subject: args.subject,
      preheaderText: args.preheaderText,
      htmlContent: args.htmlContent,
      textContent: args.textContent,
      aiGenerated: args.aiGenerated,
      generationTone: args.generationTone,
      generationBrevity: args.generationBrevity,
      dataContext: args.dataContext,
      audienceType: args.audienceType,
      audienceTags: args.audienceTags,
      estimatedRecipientCount,
      fromName: args.fromName || profile.displayName,
      replyTo: args.replyTo || user.email,
      createdAt: now,
      updatedAt: now,
    });

    return { campaignId };
  },
});

/**
 * Update a campaign draft
 */
export const updateCampaign = mutation({
  args: {
    campaignId: v.id("email_campaigns"),
    name: v.optional(v.string()),
    subject: v.optional(v.string()),
    preheaderText: v.optional(v.string()),
    htmlContent: v.optional(v.string()),
    textContent: v.optional(v.string()),
    audienceType: v.optional(v.string()),
    audienceTags: v.optional(v.array(v.string())),
    fromName: v.optional(v.string()),
    replyTo: v.optional(v.string()),
    dataContext: v.optional(v.any()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    if (campaign.status !== "draft" && campaign.status !== "ready") {
      throw new Error("Can only edit draft or ready campaigns");
    }

    // Verify ownership
    const profile = await ctx.db.get(campaign.actorProfileId);
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

    // Build update object
    const updates: Partial<Doc<"email_campaigns">> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.subject !== undefined) updates.subject = args.subject;
    if (args.preheaderText !== undefined) updates.preheaderText = args.preheaderText;
    if (args.htmlContent !== undefined) updates.htmlContent = args.htmlContent;
    if (args.textContent !== undefined) updates.textContent = args.textContent;
    if (args.audienceType !== undefined) updates.audienceType = args.audienceType;
    if (args.audienceTags !== undefined) updates.audienceTags = args.audienceTags;
    if (args.fromName !== undefined) updates.fromName = args.fromName;
    if (args.replyTo !== undefined) updates.replyTo = args.replyTo;
    if (args.dataContext !== undefined) updates.dataContext = args.dataContext;

    // Recalculate estimated recipients if audience changed
    if (args.audienceType) {
      let estimatedRecipientCount = 0;
      if (args.audienceType === "creator_subscribers") {
        const subscribers = await ctx.db
          .query("fan_emails")
          .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", campaign.actorProfileId))
          .collect();
        estimatedRecipientCount = subscribers.filter((s) => !s.unsubscribed).length;
      }
      updates.estimatedRecipientCount = estimatedRecipientCount;
    }

    await ctx.db.patch(args.campaignId, updates);

    return { success: true };
  },
});

/**
 * Mark campaign as ready to send
 */
export const markCampaignReady = mutation({
  args: {
    campaignId: v.id("email_campaigns"),
  },
  async handler(ctx, { campaignId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    if (campaign.status !== "draft") {
      throw new Error("Can only mark draft campaigns as ready");
    }

    // Verify ownership
    const profile = await ctx.db.get(campaign.actorProfileId);
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

    await ctx.db.patch(campaignId, {
      status: "ready",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Schedule a campaign for future sending
 */
export const scheduleCampaign = mutation({
  args: {
    campaignId: v.id("email_campaigns"),
    scheduledAt: v.number(),
  },
  async handler(ctx, { campaignId, scheduledAt }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    if (campaign.status !== "draft" && campaign.status !== "ready") {
      throw new Error("Can only schedule draft or ready campaigns");
    }

    if (scheduledAt <= Date.now()) {
      throw new Error("Scheduled time must be in the future");
    }

    // Verify ownership
    const profile = await ctx.db.get(campaign.actorProfileId);
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

    await ctx.db.patch(campaignId, {
      status: "scheduled",
      scheduledAt,
      updatedAt: Date.now(),
    });

    // Schedule the send action
    const delay = scheduledAt - Date.now();
    await ctx.scheduler.runAfter(delay, internal.campaigns.executeCampaignSend, {
      campaignId,
    });

    return { success: true };
  },
});

/**
 * Cancel a scheduled campaign
 */
export const cancelScheduledCampaign = mutation({
  args: {
    campaignId: v.id("email_campaigns"),
  },
  async handler(ctx, { campaignId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    if (campaign.status !== "scheduled") {
      throw new Error("Can only cancel scheduled campaigns");
    }

    // Verify ownership
    const profile = await ctx.db.get(campaign.actorProfileId);
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

    await ctx.db.patch(campaignId, {
      status: "cancelled",
      scheduledAt: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Delete a campaign (only drafts)
 */
export const deleteCampaign = mutation({
  args: {
    campaignId: v.id("email_campaigns"),
  },
  async handler(ctx, { campaignId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    if (campaign.status !== "draft" && campaign.status !== "cancelled") {
      throw new Error("Can only delete draft or cancelled campaigns");
    }

    // Verify ownership
    const profile = await ctx.db.get(campaign.actorProfileId);
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

    await ctx.db.delete(campaignId);

    return { success: true };
  },
});

// ============================================
// CAMPAIGN SENDING
// ============================================

// Return type for campaign send actions
interface CampaignSendResult {
  success: boolean;
  sent?: number;
  failed?: number;
  total?: number;
  message?: string;
}

// Recipient type for email sending
interface CampaignRecipient {
  fanEmailId: Id<"fan_emails">;
  email: string;
  name?: string;
  unsubscribeToken?: string;
}

/**
 * Send a campaign immediately
 */
export const sendCampaignNow = action({
  args: {
    campaignId: v.id("email_campaigns"),
  },
  returns: v.object({
    success: v.boolean(),
    sent: v.optional(v.number()),
    failed: v.optional(v.number()),
    total: v.optional(v.number()),
    message: v.optional(v.string()),
  }),
  async handler(ctx, { campaignId }): Promise<CampaignSendResult> {
    // Update status to sending
    await ctx.runMutation(internal.campaigns.updateCampaignStatus, {
      campaignId,
      status: "sending",
    });

    // Execute the send
    try {
      const result = await ctx.runAction(internal.campaigns.executeCampaignSend, {
        campaignId,
      });
      return result;
    } catch (error) {
      // Mark as failed if there's an error
      await ctx.runMutation(internal.campaigns.updateCampaignStatus, {
        campaignId,
        status: "failed",
      });
      throw error;
    }
  },
});

/**
 * Execute campaign send (internal action)
 */
export const executeCampaignSend = internalAction({
  args: {
    campaignId: v.id("email_campaigns"),
  },
  returns: v.object({
    success: v.boolean(),
    sent: v.optional(v.number()),
    failed: v.optional(v.number()),
    total: v.optional(v.number()),
    message: v.optional(v.string()),
  }),
  async handler(ctx, { campaignId }): Promise<CampaignSendResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.campaigns.updateCampaignStatus, {
        campaignId,
        status: "failed",
      });
      throw new Error("RESEND_API_KEY not configured");
    }

    const resend = new Resend(apiKey);

    // Get campaign
    const campaign = await ctx.runQuery(internal.campaigns.getCampaignById, { campaignId });
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    // Check if already sent or sending
    if (campaign.status === "sent") {
      return { success: true, message: "Already sent" };
    }

    // Update status to sending
    await ctx.runMutation(internal.campaigns.updateCampaignStatus, {
      campaignId,
      status: "sending",
    });

    // Get recipients based on audience type
    const recipients = await ctx.runQuery(internal.campaigns.getCampaignRecipients, {
      campaignId,
      actorProfileId: campaign.actorProfileId,
      audienceType: campaign.audienceType,
      audienceTags: campaign.audienceTags,
    });

    if (recipients.length === 0) {
      await ctx.runMutation(internal.campaigns.updateCampaignStatus, {
        campaignId,
        status: "failed",
      });
      throw new Error("No recipients found");
    }

    // Create recipient records
    await ctx.runMutation(internal.campaigns.createRecipientRecords, {
      campaignId,
      recipients,
    });

    // Get profile for page URL (for unsubscribe links)
    const profile = await ctx.runQuery(internal.campaigns.getProfileById, {
      profileId: campaign.actorProfileId,
    });

    let sent = 0;
    let failed = 0;

    // Send emails in batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (recipient: CampaignRecipient) => {
          try {
            // Generate unsubscribe URL
            const unsubscribeUrl = recipient.unsubscribeToken
              ? `https://flmlnk.com/unsubscribe?token=${recipient.unsubscribeToken}`
              : `https://flmlnk.com/unsubscribe`;

            // Add unsubscribe footer to HTML
            const htmlWithFooter = addUnsubscribeFooter(
              campaign.htmlContent,
              campaign.fromName,
              profile?.slug || "",
              unsubscribeUrl
            );

            // Add unsubscribe to text
            const textWithFooter =
              campaign.textContent +
              `\n\n---\nYou're receiving this because you signed up for updates from ${campaign.fromName}.\nUnsubscribe: ${unsubscribeUrl}`;

            const result = await resend.emails.send({
              from: `${campaign.fromName} via Flmlnk <updates@flmlnk.com>`,
              to: recipient.email,
              replyTo: campaign.replyTo,
              subject: campaign.subject,
              html: htmlWithFooter,
              text: textWithFooter,
              headers: {
                "List-Unsubscribe": `<${unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            });

            if (result.error) {
              await ctx.runMutation(internal.campaigns.updateRecipientStatus, {
                fanEmailId: recipient.fanEmailId,
                campaignId,
                status: "failed",
                errorMessage: result.error.message,
              });
              failed++;
            } else {
              await ctx.runMutation(internal.campaigns.updateRecipientStatus, {
                fanEmailId: recipient.fanEmailId,
                campaignId,
                status: "sent",
                resendEmailId: result.data?.id,
              });
              sent++;
            }
          } catch (error) {
            await ctx.runMutation(internal.campaigns.updateRecipientStatus, {
              fanEmailId: recipient.fanEmailId,
              campaignId,
              status: "failed",
              errorMessage: error instanceof Error ? error.message : "Unknown error",
            });
            failed++;
          }
        })
      );
    }

    // Update campaign status and counts
    await ctx.runMutation(internal.campaigns.finalizeCampaignSend, {
      campaignId,
      recipientCount: recipients.length,
      deliveredCount: sent,
      bounceCount: failed,
    });

    return {
      success: true,
      sent,
      failed,
      total: recipients.length,
    };
  },
});

/**
 * Add unsubscribe footer to HTML email with FlmLnk branding
 */
function addUnsubscribeFooter(
  html: string,
  senderName: string,
  pageSlug: string,
  unsubscribeUrl: string
): string {
  const footer = `
    <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px; margin-top: 32px;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0 0 8px 0;">
        You're receiving this because you signed up for updates from ${senderName}.
      </p>
      <p style="color: #64748b; font-size: 12px; margin: 0 0 8px 0;">
        <a href="https://flmlnk.com/f/${pageSlug}" style="color: #f53c56; text-decoration: none;">View ${senderName}'s page</a> ·
        <a href="https://flmlnk.com" style="color: #f53c56; text-decoration: none;">Flmlnk</a>
      </p>
      <p style="color: #64748b; font-size: 11px; margin: 0 0 16px 0;">
        <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe from these emails</a>
      </p>
      <img src="https://flmlnk.com/circle.png" alt="Flmlnk" style="display: block; margin: 0 auto; width: 60px; height: auto;" />
    </div>
  `;

  // Insert before closing </div></body> if present
  if (html.includes("</body>")) {
    return html.replace("</body>", `${footer}</body>`);
  }

  // Otherwise append
  return html + footer;
}

// ============================================
// INTERNAL HELPERS
// ============================================

export const updateCampaignStatus = internalMutation({
  args: {
    campaignId: v.id("email_campaigns"),
    status: v.string(),
  },
  async handler(ctx, { campaignId, status }) {
    await ctx.db.patch(campaignId, {
      status,
      updatedAt: Date.now(),
      ...(status === "sent" ? { sentAt: Date.now() } : {}),
    });
  },
});

export const getCampaignRecipients = internalQuery({
  args: {
    campaignId: v.id("email_campaigns"),
    actorProfileId: v.id("actor_profiles"),
    audienceType: v.string(),
    audienceTags: v.optional(v.array(v.string())),
  },
  async handler(ctx, { actorProfileId, audienceType }) {
    let subscribers: Doc<"fan_emails">[] = [];

    if (audienceType === "creator_subscribers") {
      subscribers = await ctx.db
        .query("fan_emails")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
        .collect();
    } else if (audienceType === "site_wide") {
      // For site-wide, get all non-unsubscribed subscribers
      subscribers = await ctx.db.query("fan_emails").collect();
    }

    // Filter out unsubscribed and hard bounces
    const validSubscribers = subscribers.filter(
      (s) => !s.unsubscribed && !s.isHardBounce
    );

    return validSubscribers.map((s) => ({
      fanEmailId: s._id,
      email: s.email,
      name: s.name,
      unsubscribeToken: s.unsubscribeToken,
    }));
  },
});

export const createRecipientRecords = internalMutation({
  args: {
    campaignId: v.id("email_campaigns"),
    recipients: v.array(
      v.object({
        fanEmailId: v.id("fan_emails"),
        email: v.string(),
        name: v.optional(v.string()),
        unsubscribeToken: v.optional(v.string()),
      })
    ),
  },
  async handler(ctx, { campaignId, recipients }) {
    const now = Date.now();

    for (const recipient of recipients) {
      await ctx.db.insert("campaign_recipients", {
        campaignId,
        fanEmailId: recipient.fanEmailId,
        email: recipient.email,
        name: recipient.name,
        status: "pending",
        createdAt: now,
      });
    }
  },
});

export const updateRecipientStatus = internalMutation({
  args: {
    fanEmailId: v.id("fan_emails"),
    campaignId: v.id("email_campaigns"),
    status: v.string(),
    resendEmailId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  async handler(ctx, { fanEmailId, campaignId, status, resendEmailId, errorMessage }) {
    // Find the recipient record
    const recipient = await ctx.db
      .query("campaign_recipients")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .filter((q) => q.eq(q.field("fanEmailId"), fanEmailId))
      .first();

    if (recipient) {
      await ctx.db.patch(recipient._id, {
        status,
        resendEmailId,
        errorMessage,
        sentAt: status === "sent" ? Date.now() : undefined,
      });
    }

    // Update fan_email engagement tracking
    if (status === "sent") {
      const fanEmail = await ctx.db.get(fanEmailId);
      if (fanEmail) {
        await ctx.db.patch(fanEmailId, {
          lastEmailSentAt: Date.now(),
          emailsSentCount: (fanEmail.emailsSentCount || 0) + 1,
          updatedAt: Date.now(),
        });
      }
    }
  },
});

export const finalizeCampaignSend = internalMutation({
  args: {
    campaignId: v.id("email_campaigns"),
    recipientCount: v.number(),
    deliveredCount: v.number(),
    bounceCount: v.number(),
  },
  async handler(ctx, { campaignId, recipientCount, deliveredCount, bounceCount }) {
    await ctx.db.patch(campaignId, {
      status: "sent",
      sentAt: Date.now(),
      recipientCount,
      deliveredCount,
      bounceCount,
      updatedAt: Date.now(),
    });
  },
});

export const getProfileById = internalQuery({
  args: {
    profileId: v.id("actor_profiles"),
  },
  async handler(ctx, { profileId }) {
    return ctx.db.get(profileId);
  },
});

// ============================================
// SEND TEST EMAIL
// ============================================

/**
 * Send a test email to preview the campaign
 */
// Return type for test email
interface TestEmailResult {
  success: boolean;
  emailId?: string;
}

export const sendTestEmail = action({
  args: {
    campaignId: v.id("email_campaigns"),
    testEmail: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    emailId: v.optional(v.string()),
  }),
  async handler(ctx, { campaignId, testEmail }): Promise<TestEmailResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const campaign = await ctx.runQuery(internal.campaigns.getCampaignById, { campaignId });
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const resend = new Resend(apiKey);

    const result = await resend.emails.send({
      from: `${campaign.fromName} via Flmlnk <updates@flmlnk.com>`,
      to: testEmail,
      replyTo: campaign.replyTo,
      subject: `[TEST] ${campaign.subject}`,
      html: campaign.htmlContent,
      text: campaign.textContent,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return {
      success: true,
      emailId: result.data?.id,
    };
  },
});
