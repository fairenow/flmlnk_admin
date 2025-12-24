import { v } from "convex/values";
import {
  mutation,
  query,
  action,
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal, components } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { Resend } from "resend";

// ============================================
// PLATFORM CAMPAIGNS (Admin-only)
// For sending emails to users without fan_emails
// (e.g., incomplete onboarding users)
// ============================================

const resend = new Resend(process.env.RESEND_API_KEY);

// Helper to verify admin access
async function verifyAdmin(ctx: any): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Authentication required");

  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q: any) => q.eq("authId", identity.tokenIdentifier))
    .unique();

  if (!user?.superadmin) throw new Error("Admin access required");
  return user;
}

// ============================================
// QUERIES
// ============================================

/**
 * Get all platform campaigns
 */
export const getPlatformCampaigns = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  async handler(ctx, { status, limit = 50 }) {
    await verifyAdmin(ctx);

    let campaigns;
    if (status) {
      campaigns = await ctx.db
        .query("platform_campaigns")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(limit);
    } else {
      campaigns = await ctx.db
        .query("platform_campaigns")
        .order("desc")
        .take(limit);
    }

    return campaigns;
  },
});

/**
 * Get a single platform campaign with recipient stats
 */
export const getPlatformCampaign = query({
  args: {
    campaignId: v.id("platform_campaigns"),
  },
  async handler(ctx, { campaignId }) {
    await verifyAdmin(ctx);

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) return null;

    // Get recipient stats
    const recipients = await ctx.db
      .query("platform_campaign_recipients")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();

    const stats = {
      total: recipients.length,
      pending: recipients.filter((r) => r.status === "pending").length,
      sent: recipients.filter((r) => r.status === "sent").length,
      delivered: recipients.filter((r) => r.status === "delivered").length,
      bounced: recipients.filter((r) => r.status === "bounced").length,
      failed: recipients.filter((r) => r.status === "failed").length,
    };

    return { ...campaign, recipientStats: stats };
  },
});

/**
 * Get recipients for a platform campaign
 */
export const getPlatformCampaignRecipients = query({
  args: {
    campaignId: v.id("platform_campaigns"),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  async handler(ctx, { campaignId, status, limit = 100, offset = 0 }) {
    await verifyAdmin(ctx);

    let recipients;
    if (status) {
      recipients = await ctx.db
        .query("platform_campaign_recipients")
        .withIndex("by_campaign_status", (q) =>
          q.eq("campaignId", campaignId).eq("status", status)
        )
        .collect();
    } else {
      recipients = await ctx.db
        .query("platform_campaign_recipients")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
        .collect();
    }

    // Apply pagination
    return recipients.slice(offset, offset + limit);
  },
});

/**
 * Get audience count preview before creating campaign
 */
export const getAudiencePreview = query({
  args: {
    audienceType: v.string(),
  },
  async handler(ctx, { audienceType }) {
    await verifyAdmin(ctx);

    if (audienceType === "incomplete_onboarding") {
      const recipients = await ctx.runQuery(
        internal.platformCampaigns.getIncompleteOnboardingUsers,
        {}
      );
      return {
        count: recipients.length,
        sampleEmails: recipients.slice(0, 5).map((r) => r.email),
      };
    }

    if (audienceType === "all_users") {
      const authUsers = await ctx.runQuery(
        internal.platformCampaigns.getAllAuthUsers,
        {}
      );
      return {
        count: authUsers.length,
        sampleEmails: authUsers.slice(0, 5).map((r: any) => r.email),
      };
    }

    if (audienceType === "no_profile") {
      const users = await ctx.db.query("users").collect();
      const profiles = await ctx.db.query("actor_profiles").collect();
      const userIdsWithProfiles = new Set(profiles.map((p) => p.userId.toString()));
      const noProfileUsers = users.filter(
        (u) => !userIdsWithProfiles.has(u._id.toString())
      );
      return {
        count: noProfileUsers.length,
        sampleEmails: noProfileUsers.slice(0, 5).map((u) => u.email).filter(Boolean),
      };
    }

    return { count: 0, sampleEmails: [] };
  },
});

// ============================================
// INTERNAL QUERIES
// ============================================

/**
 * Get all betterAuth users
 */
export const getAllAuthUsers = internalQuery({
  args: {},
  async handler(ctx) {
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      paginationOpts: {
        cursor: null,
        numItems: 10000,
      },
    });
    return result.page || [];
  },
});

/**
 * Get users with incomplete onboarding
 */
export const getIncompleteOnboardingUsers = internalQuery({
  args: {},
  async handler(ctx) {
    // Get all betterAuth users
    const authUsersResult = await ctx.runQuery(
      internal.platformCampaigns.getAllAuthUsers,
      {}
    );

    // Get all application users
    const appUsers = await ctx.db.query("users").collect();

    // Get all actor profiles
    const actorProfiles = await ctx.db.query("actor_profiles").collect();
    const userIdsWithProfiles = new Set(
      actorProfiles.map((p) => p.userId.toString())
    );

    const incompleteUsers: Array<{
      email: string;
      name?: string;
      authUserId: string;
      userId?: Id<"users">;
    }> = [];

    for (const authUser of authUsersResult) {
      if (!authUser.email) continue;

      const appUser = appUsers.find((u) => u.authId === authUser._id);

      if (!appUser) {
        // User signed up but never created app user
        incompleteUsers.push({
          email: authUser.email,
          name: authUser.name || undefined,
          authUserId: authUser._id,
        });
      } else if (!userIdsWithProfiles.has(appUser._id.toString())) {
        // User exists but no profile
        incompleteUsers.push({
          email: authUser.email,
          name: authUser.name || appUser.name || appUser.displayName || undefined,
          authUserId: authUser._id,
          userId: appUser._id,
        });
      }
    }

    return incompleteUsers;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new platform campaign
 */
export const createPlatformCampaign = mutation({
  args: {
    name: v.string(),
    subject: v.string(),
    htmlContent: v.string(),
    textContent: v.string(),
    fromName: v.string(),
    replyTo: v.optional(v.string()),
    audienceType: v.string(),
  },
  async handler(ctx, args) {
    const admin = await verifyAdmin(ctx);

    const now = Date.now();
    const campaignId = await ctx.db.insert("platform_campaigns", {
      name: args.name,
      subject: args.subject,
      htmlContent: args.htmlContent,
      textContent: args.textContent,
      fromName: args.fromName,
      replyTo: args.replyTo,
      audienceType: args.audienceType,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      createdBy: admin._id.toString(),
    });

    return campaignId;
  },
});

/**
 * Update a platform campaign (only if draft)
 */
export const updatePlatformCampaign = mutation({
  args: {
    campaignId: v.id("platform_campaigns"),
    name: v.optional(v.string()),
    subject: v.optional(v.string()),
    htmlContent: v.optional(v.string()),
    textContent: v.optional(v.string()),
    fromName: v.optional(v.string()),
    replyTo: v.optional(v.string()),
    audienceType: v.optional(v.string()),
  },
  async handler(ctx, args) {
    await verifyAdmin(ctx);

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status !== "draft") {
      throw new Error("Can only update draft campaigns");
    }

    const updates: Partial<Doc<"platform_campaigns">> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.subject !== undefined) updates.subject = args.subject;
    if (args.htmlContent !== undefined) updates.htmlContent = args.htmlContent;
    if (args.textContent !== undefined) updates.textContent = args.textContent;
    if (args.fromName !== undefined) updates.fromName = args.fromName;
    if (args.replyTo !== undefined) updates.replyTo = args.replyTo;
    if (args.audienceType !== undefined) updates.audienceType = args.audienceType;

    await ctx.db.patch(args.campaignId, updates);
    return args.campaignId;
  },
});

/**
 * Delete a platform campaign (only if draft)
 */
export const deletePlatformCampaign = mutation({
  args: {
    campaignId: v.id("platform_campaigns"),
  },
  async handler(ctx, { campaignId }) {
    await verifyAdmin(ctx);

    const campaign = await ctx.db.get(campaignId);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status !== "draft") {
      throw new Error("Can only delete draft campaigns");
    }

    await ctx.db.delete(campaignId);
    return true;
  },
});

// ============================================
// INTERNAL MUTATIONS
// ============================================

/**
 * Update campaign status
 */
export const updateCampaignStatus = internalMutation({
  args: {
    campaignId: v.id("platform_campaigns"),
    status: v.string(),
    sentCount: v.optional(v.number()),
    failedCount: v.optional(v.number()),
    deliveredCount: v.optional(v.number()),
    bouncedCount: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const updates: Partial<Doc<"platform_campaigns">> = {
      status: args.status,
      updatedAt: Date.now(),
    };

    if (args.status === "sending") {
      updates.sentAt = Date.now();
    }
    if (args.status === "sent" || args.status === "failed") {
      updates.completedAt = Date.now();
    }
    if (args.sentCount !== undefined) updates.sentCount = args.sentCount;
    if (args.failedCount !== undefined) updates.failedCount = args.failedCount;
    if (args.deliveredCount !== undefined) updates.deliveredCount = args.deliveredCount;
    if (args.bouncedCount !== undefined) updates.bouncedCount = args.bouncedCount;

    await ctx.db.patch(args.campaignId, updates);
  },
});

/**
 * Create recipient records
 */
export const createRecipientRecords = internalMutation({
  args: {
    campaignId: v.id("platform_campaigns"),
    recipients: v.array(
      v.object({
        email: v.string(),
        name: v.optional(v.string()),
        authUserId: v.optional(v.string()),
        userId: v.optional(v.id("users")),
      })
    ),
  },
  async handler(ctx, { campaignId, recipients }) {
    const now = Date.now();

    for (const recipient of recipients) {
      await ctx.db.insert("platform_campaign_recipients", {
        campaignId,
        email: recipient.email,
        name: recipient.name,
        authUserId: recipient.authUserId,
        userId: recipient.userId,
        status: "pending",
        createdAt: now,
      });
    }

    // Update campaign total recipients count
    await ctx.db.patch(campaignId, {
      totalRecipients: recipients.length,
      updatedAt: now,
    });
  },
});

/**
 * Update recipient status after send
 */
export const updateRecipientStatus = internalMutation({
  args: {
    campaignId: v.id("platform_campaigns"),
    email: v.string(),
    status: v.string(),
    resendEmailId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const recipient = await ctx.db
      .query("platform_campaign_recipients")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .filter((q) => q.eq(q.field("email"), args.email))
      .first();

    if (!recipient) return;

    const updates: Partial<Doc<"platform_campaign_recipients">> = {
      status: args.status,
    };

    if (args.status === "sent") {
      updates.sentAt = Date.now();
    }
    if (args.resendEmailId) {
      updates.resendEmailId = args.resendEmailId;
    }
    if (args.errorMessage) {
      updates.errorMessage = args.errorMessage;
    }

    await ctx.db.patch(recipient._id, updates);
  },
});

// ============================================
// ACTIONS (for sending emails)
// ============================================

/**
 * Send a platform campaign immediately
 */
export const sendPlatformCampaign = action({
  args: {
    campaignId: v.id("platform_campaigns"),
  },
  async handler(ctx, { campaignId }): Promise<{ sent: number; failed: number }> {
    // Get campaign
    const campaign = await ctx.runQuery(
      internal.platformCampaigns.getCampaignInternal,
      { campaignId }
    );

    if (!campaign) {
      throw new Error("Campaign not found");
    }

    if (campaign.status !== "draft") {
      throw new Error("Campaign has already been sent");
    }

    // Update status to sending
    await ctx.runMutation(internal.platformCampaigns.updateCampaignStatus, {
      campaignId,
      status: "sending",
    });

    // Get recipients based on audience type
    let recipients: Array<{
      email: string;
      name?: string;
      authUserId?: string;
      userId?: Id<"users">;
    }> = [];

    if (campaign.audienceType === "incomplete_onboarding") {
      recipients = await ctx.runQuery(
        internal.platformCampaigns.getIncompleteOnboardingUsers,
        {}
      );
    } else if (campaign.audienceType === "all_users") {
      const authUsers = await ctx.runQuery(
        internal.platformCampaigns.getAllAuthUsers,
        {}
      );
      recipients = authUsers
        .filter((u: any) => u.email)
        .map((u: any) => ({
          email: u.email,
          name: u.name || undefined,
          authUserId: u._id,
        }));
    }

    if (recipients.length === 0) {
      await ctx.runMutation(internal.platformCampaigns.updateCampaignStatus, {
        campaignId,
        status: "failed",
      });
      throw new Error("No recipients found");
    }

    // Create recipient records
    await ctx.runMutation(internal.platformCampaigns.createRecipientRecords, {
      campaignId,
      recipients,
    });

    let sent = 0;
    let failed = 0;

    // Send emails in batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (recipient) => {
          try {
            // Add unsubscribe footer
            const unsubscribeUrl = `https://flmlnk.com/unsubscribe`;
            const htmlWithFooter = addUnsubscribeFooter(
              campaign.htmlContent,
              campaign.fromName,
              unsubscribeUrl
            );
            const textWithFooter =
              campaign.textContent +
              `\n\n---\nYou're receiving this because you signed up for Flmlnk.\nUnsubscribe: ${unsubscribeUrl}`;

            const result = await resend.emails.send({
              from: `${campaign.fromName} <updates@flmlnk.com>`,
              to: recipient.email,
              replyTo: campaign.replyTo || undefined,
              subject: campaign.subject,
              html: htmlWithFooter,
              text: textWithFooter,
              headers: {
                "List-Unsubscribe": `<${unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            });

            if (result.error) {
              await ctx.runMutation(
                internal.platformCampaigns.updateRecipientStatus,
                {
                  campaignId,
                  email: recipient.email,
                  status: "failed",
                  errorMessage: result.error.message,
                }
              );
              failed++;
            } else {
              await ctx.runMutation(
                internal.platformCampaigns.updateRecipientStatus,
                {
                  campaignId,
                  email: recipient.email,
                  status: "sent",
                  resendEmailId: result.data?.id,
                }
              );
              sent++;
            }
          } catch (error) {
            await ctx.runMutation(
              internal.platformCampaigns.updateRecipientStatus,
              {
                campaignId,
                email: recipient.email,
                status: "failed",
                errorMessage:
                  error instanceof Error ? error.message : "Unknown error",
              }
            );
            failed++;
          }
        })
      );
    }

    // Update campaign with final stats
    const finalStatus = failed === recipients.length ? "failed" : "sent";
    await ctx.runMutation(internal.platformCampaigns.updateCampaignStatus, {
      campaignId,
      status: finalStatus,
      sentCount: sent,
      failedCount: failed,
    });

    return { sent, failed };
  },
});

/**
 * Internal query to get campaign (for actions)
 */
export const getCampaignInternal = internalQuery({
  args: {
    campaignId: v.id("platform_campaigns"),
  },
  async handler(ctx, { campaignId }) {
    return await ctx.db.get(campaignId);
  },
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function addUnsubscribeFooter(
  html: string,
  fromName: string,
  unsubscribeUrl: string
): string {
  const footer = `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; text-align: center; font-size: 12px; color: #666;">
      <p>You're receiving this email because you signed up for Flmlnk.</p>
      <p>
        <a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">Unsubscribe</a>
      </p>
      <p style="margin-top: 10px;">Sent by ${fromName}</p>
    </div>
  `;

  // Insert before closing body tag if exists, otherwise append
  if (html.includes("</body>")) {
    return html.replace("</body>", `${footer}</body>`);
  }
  return html + footer;
}
