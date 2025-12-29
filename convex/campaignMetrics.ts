import { v } from "convex/values";
import { query, mutation, internalMutation, httpAction } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// ============================================
// CAMPAIGN METRICS QUERIES
// ============================================

/**
 * Get detailed metrics for a campaign
 */
export const getCampaignMetrics = query({
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

    // Get recipients
    const recipients = await ctx.db
      .query("campaign_recipients")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();

    // Get events
    const events = await ctx.db
      .query("campaign_events")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();

    // Calculate metrics
    const totalRecipients = recipients.length;
    const sent = recipients.filter((r) => r.status === "sent" || r.status === "delivered").length;
    const delivered = recipients.filter((r) => r.status === "delivered").length;
    const bounced = recipients.filter((r) => r.status === "bounced").length;
    const failed = recipients.filter((r) => r.status === "failed").length;

    const opened = new Set(events.filter((e) => e.eventType === "opened").map((e) => e.recipientId)).size;
    const clicked = new Set(events.filter((e) => e.eventType === "clicked").map((e) => e.recipientId)).size;
    const unsubscribed = events.filter((e) => e.eventType === "unsubscribed").length;
    const complained = events.filter((e) => e.eventType === "complained").length;

    // Calculate rates
    const openRate = sent > 0 ? Math.round((opened / sent) * 100 * 10) / 10 : 0;
    const clickRate = sent > 0 ? Math.round((clicked / sent) * 100 * 10) / 10 : 0;
    const clickToOpenRate = opened > 0 ? Math.round((clicked / opened) * 100 * 10) / 10 : 0;
    const bounceRate = totalRecipients > 0 ? Math.round((bounced / totalRecipients) * 100 * 10) / 10 : 0;
    const unsubscribeRate = sent > 0 ? Math.round((unsubscribed / sent) * 100 * 10) / 10 : 0;

    // Get click breakdown by URL
    const clickEvents = events.filter((e) => e.eventType === "clicked" && e.clickUrl);
    const clicksByUrl: Record<string, number> = {};
    for (const event of clickEvents) {
      if (event.clickUrl) {
        clicksByUrl[event.clickUrl] = (clicksByUrl[event.clickUrl] || 0) + 1;
      }
    }

    // Get timeline data (opens/clicks over time)
    const timeline = getTimelineData(events);

    return {
      campaignId,
      campaignName: campaign.name,
      sentAt: campaign.sentAt,

      // Delivery metrics
      totalRecipients,
      sent,
      delivered,
      bounced,
      failed,

      // Engagement metrics
      opened,
      clicked,
      unsubscribed,
      complained,

      // Rates
      openRate,
      clickRate,
      clickToOpenRate,
      bounceRate,
      unsubscribeRate,

      // Click breakdown
      clicksByUrl: Object.entries(clicksByUrl)
        .map(([url, count]) => ({ url, count }))
        .sort((a, b) => b.count - a.count),

      // Timeline
      timeline,
    };
  },
});

/**
 * Get aggregate metrics for all campaigns
 */
export const getAggregateMetrics = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    days: v.optional(v.number()),
  },
  async handler(ctx, { actorProfileId, days = 30 }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // Verify ownership
    const profile = await ctx.db.get(actorProfileId);
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

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    // Get all campaigns in time range
    const campaigns = await ctx.db
      .query("email_campaigns")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();

    const recentCampaigns = campaigns.filter(
      (c) => c.sentAt && c.sentAt >= cutoff && c.status === "sent"
    );

    // Aggregate metrics
    let totalSent = 0;
    let totalOpened = 0;
    let totalClicked = 0;
    let totalBounced = 0;
    let totalUnsubscribed = 0;

    for (const campaign of recentCampaigns) {
      totalSent += campaign.recipientCount || 0;
      totalOpened += campaign.openCount || 0;
      totalClicked += campaign.clickCount || 0;
      totalBounced += campaign.bounceCount || 0;
      totalUnsubscribed += campaign.unsubscribeCount || 0;
    }

    return {
      periodDays: days,
      campaignCount: recentCampaigns.length,
      totalSent,
      totalOpened,
      totalClicked,
      totalBounced,
      totalUnsubscribed,
      avgOpenRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100 * 10) / 10 : 0,
      avgClickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100 * 10) / 10 : 0,
    };
  },
});

/**
 * Export campaign metrics as CSV data
 */
export const exportCampaignMetrics = query({
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

    // Get recipients with events
    const recipients = await ctx.db
      .query("campaign_recipients")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();

    const events = await ctx.db
      .query("campaign_events")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();

    // Build CSV rows
    const rows = recipients.map((recipient) => {
      const recipientEvents = events.filter((e) => e.recipientId === recipient._id);
      const firstOpen = recipientEvents.find((e) => e.eventType === "opened");
      const firstClick = recipientEvents.find((e) => e.eventType === "clicked");

      return {
        email: recipient.email,
        name: recipient.name || "",
        status: recipient.status,
        sentAt: recipient.sentAt ? new Date(recipient.sentAt).toISOString() : "",
        openedAt: firstOpen ? new Date(firstOpen.occurredAt).toISOString() : "",
        clickedAt: firstClick ? new Date(firstClick.occurredAt).toISOString() : "",
        clickUrl: firstClick?.clickUrl || "",
      };
    });

    // Generate CSV string
    const headers = ["email", "name", "status", "sent_at", "opened_at", "clicked_at", "click_url"];
    const csvRows = [
      headers.join(","),
      ...rows.map((row) =>
        [
          row.email,
          `"${row.name}"`,
          row.status,
          row.sentAt,
          row.openedAt,
          row.clickedAt,
          row.clickUrl,
        ].join(",")
      ),
    ];

    return csvRows.join("\n");
  },
});

// ============================================
// METRICS UPDATE FUNCTIONS
// ============================================

/**
 * Record an email event (from webhook)
 */
export const recordCampaignEvent = internalMutation({
  args: {
    campaignId: v.id("email_campaigns"),
    recipientId: v.optional(v.id("campaign_recipients")),
    eventType: v.string(),
    clickUrl: v.optional(v.string()),
    occurredAt: v.number(),
    metadata: v.optional(v.any()),
  },
  async handler(ctx, args) {
    // Insert the event
    await ctx.db.insert("campaign_events", {
      campaignId: args.campaignId,
      recipientId: args.recipientId,
      eventType: args.eventType,
      clickUrl: args.clickUrl,
      occurredAt: args.occurredAt,
      metadata: args.metadata,
      createdAt: Date.now(),
    });

    // Update recipient record
    if (args.recipientId) {
      const recipient = await ctx.db.get(args.recipientId);
      if (recipient) {
        const updates: Partial<Doc<"campaign_recipients">> = {};

        if (args.eventType === "opened" && !recipient.openedAt) {
          updates.openedAt = args.occurredAt;
        }
        if (args.eventType === "clicked" && !recipient.clickedAt) {
          updates.clickedAt = args.occurredAt;
        }
        if (args.eventType === "delivered") {
          updates.status = "delivered";
        }
        if (args.eventType === "bounced") {
          updates.status = "bounced";
        }

        if (Object.keys(updates).length > 0) {
          await ctx.db.patch(args.recipientId, updates);
        }
      }

      // Update fan_email engagement tracking
      if (recipient && recipient.fanEmailId && (args.eventType === "opened" || args.eventType === "clicked")) {
        const fanEmail = await ctx.db.get(recipient.fanEmailId);
        if (fanEmail) {
          const fanUpdates: Partial<Doc<"fan_emails">> = {
            updatedAt: Date.now(),
          };

          if (args.eventType === "opened") {
            fanUpdates.lastEmailOpenedAt = args.occurredAt;
            fanUpdates.emailsOpenedCount = (fanEmail.emailsOpenedCount || 0) + 1;
          }
          if (args.eventType === "clicked") {
            fanUpdates.lastEmailClickedAt = args.occurredAt;
            fanUpdates.emailsClickedCount = (fanEmail.emailsClickedCount || 0) + 1;
          }

          await ctx.db.patch(recipient.fanEmailId, fanUpdates);
        }
      }

      // Handle hard bounce
      if (args.eventType === "bounced" && args.metadata?.bounce_type === "hard") {
        const recipient = await ctx.db.get(args.recipientId);
        if (recipient && recipient.fanEmailId) {
          const fanEmail = await ctx.db.get(recipient.fanEmailId);
          if (fanEmail) {
            await ctx.db.patch(recipient.fanEmailId, {
              isHardBounce: true,
              bounceCount: (fanEmail.bounceCount || 0) + 1,
              lastBounceAt: args.occurredAt,
              updatedAt: Date.now(),
            });
          }
        }
      }
    }

    // Update campaign aggregate counts
    const campaign = await ctx.db.get(args.campaignId);
    if (campaign) {
      const updates: Partial<Doc<"email_campaigns">> = {
        updatedAt: Date.now(),
      };

      if (args.eventType === "opened") {
        updates.openCount = (campaign.openCount || 0) + 1;
      }
      if (args.eventType === "clicked") {
        updates.clickCount = (campaign.clickCount || 0) + 1;
      }
      if (args.eventType === "bounced") {
        updates.bounceCount = (campaign.bounceCount || 0) + 1;
      }
      if (args.eventType === "unsubscribed") {
        updates.unsubscribeCount = (campaign.unsubscribeCount || 0) + 1;
      }
      if (args.eventType === "complained") {
        updates.spamCount = (campaign.spamCount || 0) + 1;
      }

      await ctx.db.patch(args.campaignId, updates);
    }
  },
});

/**
 * Find recipient by Resend email ID
 */
export const findRecipientByResendId = internalMutation({
  args: {
    resendEmailId: v.string(),
  },
  async handler(ctx, { resendEmailId }) {
    // Search for the recipient with this Resend ID
    const recipients = await ctx.db.query("campaign_recipients").collect();

    for (const recipient of recipients) {
      if (recipient.resendEmailId === resendEmailId) {
        return {
          recipientId: recipient._id,
          campaignId: recipient.campaignId,
        };
      }
    }

    return null;
  },
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function getTimelineData(events: Doc<"campaign_events">[]) {
  // Group events by hour
  const hourlyData: Record<string, { opens: number; clicks: number }> = {};

  for (const event of events) {
    if (event.eventType !== "opened" && event.eventType !== "clicked") continue;

    const hour = new Date(event.occurredAt);
    hour.setMinutes(0, 0, 0);
    const key = hour.toISOString();

    if (!hourlyData[key]) {
      hourlyData[key] = { opens: 0, clicks: 0 };
    }

    if (event.eventType === "opened") {
      hourlyData[key].opens++;
    } else if (event.eventType === "clicked") {
      hourlyData[key].clicks++;
    }
  }

  return Object.entries(hourlyData)
    .map(([timestamp, data]) => ({
      timestamp,
      ...data,
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
