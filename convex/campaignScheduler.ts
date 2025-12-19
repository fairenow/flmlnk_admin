import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/**
 * Process scheduled campaigns that are due to be sent.
 * Runs as a cron job every 5 minutes.
 */
export const processScheduledCampaigns = internalAction({
  args: {},
  async handler(ctx) {
    const now = Date.now();

    // Get all scheduled campaigns that are due
    const dueCampaigns = await ctx.runQuery(internal.campaignScheduler.getScheduledCampaignsDue, {
      currentTime: now,
    });

    console.log(`Found ${dueCampaigns.length} scheduled campaigns due for sending`);

    let sent = 0;
    let failed = 0;

    for (const campaign of dueCampaigns) {
      try {
        // Execute the campaign send
        await ctx.runAction(internal.campaigns.executeCampaignSend, {
          campaignId: campaign._id,
        });
        sent++;
        console.log(`Successfully triggered send for campaign: ${campaign._id}`);
      } catch (error) {
        failed++;
        console.error(`Failed to send campaign ${campaign._id}:`, error);
      }
    }

    console.log(`Scheduled campaign processing complete: ${sent} sent, ${failed} failed`);
    return { sent, failed };
  },
});

/**
 * Get scheduled campaigns that are due to be sent.
 */
export const getScheduledCampaignsDue = internalQuery({
  args: {
    currentTime: v.number(),
  },
  async handler(ctx, { currentTime }) {
    // Get campaigns with status "scheduled" and scheduledAt <= currentTime
    const scheduledCampaigns = await ctx.db
      .query("email_campaigns")
      .withIndex("by_status", (q) => q.eq("status", "scheduled"))
      .collect();

    // Filter to those that are due
    return scheduledCampaigns.filter(
      (campaign) => campaign.scheduledAt && campaign.scheduledAt <= currentTime
    );
  },
});
