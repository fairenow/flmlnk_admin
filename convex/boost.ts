import { v } from "convex/values";
import { action, mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/**
 * Create a boost campaign with pending payment status
 * Returns the campaign ID for use with Stripe checkout
 */
export const createPendingBoostCampaign = mutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    assetId: v.string(),
    assetType: v.union(v.literal("clip"), v.literal("meme"), v.literal("gif")),
    dailyBudgetCents: v.number(),
    durationDays: v.number(),
    platform: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile || profile.userId !== user._id) {
      throw new Error("Not authorized");
    }

    // Verify the asset exists and get its title
    let assetTitle = "Boosted Asset";
    if (args.assetType === "clip") {
      const clip = await ctx.db.get(args.assetId as Id<"generated_clips">);
      if (!clip || clip.actorProfileId !== args.actorProfileId) {
        throw new Error("Asset not found");
      }
      assetTitle = clip.title;
    } else if (args.assetType === "meme") {
      const meme = await ctx.db.get(args.assetId as Id<"generated_memes">);
      if (!meme || meme.actorProfileId !== args.actorProfileId) {
        throw new Error("Asset not found");
      }
      assetTitle = meme.caption?.slice(0, 50) || "Boosted Meme";
    } else if (args.assetType === "gif") {
      const gif = await ctx.db.get(args.assetId as Id<"generated_gifs">);
      if (!gif || gif.actorProfileId !== args.actorProfileId) {
        throw new Error("Asset not found");
      }
      assetTitle = gif.title || "Boosted GIF";
    }

    const now = Date.now();
    const totalBudgetCents = args.dailyBudgetCents * args.durationDays;

    // Create campaign with pending_payment status
    const campaignId = await ctx.db.insert("boost_campaigns", {
      createdByUserId: user._id,
      actorProfileId: args.actorProfileId,
      assetId: args.assetId,
      assetType: args.assetType,
      name: assetTitle,
      status: "pending_payment",
      budgetCents: totalBudgetCents,
      dailyBudgetCents: args.dailyBudgetCents,
      durationDays: args.durationDays,
      platform: args.platform ?? "all",
      paymentStatus: "pending",
      createdAt: now,
      // Initialize metrics
      spentCents: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    });

    return {
      campaignId,
      name: assetTitle,
      totalBudgetCents,
      dailyBudgetCents: args.dailyBudgetCents,
      durationDays: args.durationDays,
    };
  },
});

/**
 * Create Stripe checkout session for boost payment
 */
export const createBoostCheckoutSession = action({
  args: {
    campaignId: v.id("boost_campaigns"),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ checkoutUrl: string }> => {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error("Stripe is not configured");
    }

    // Get the campaign details with asset info
    const campaignData = await ctx.runQuery(internal.boost.getCampaignWithAssetForCheckout, {
      campaignId: args.campaignId,
    });

    if (!campaignData || !campaignData.campaign) {
      throw new Error("Campaign not found");
    }

    const { campaign, assetThumbnail } = campaignData;

    if (campaign.status !== "pending_payment") {
      throw new Error("Campaign is not pending payment");
    }

    const dailyBudget = (campaign.dailyBudgetCents ?? 0) / 100;
    const duration = campaign.durationDays ?? 7;
    const estimatedImpressions = Math.floor((campaign.budgetCents / 100) * 75); // ~75 impressions per dollar

    // Build checkout session parameters
    const params: Record<string, string> = {
      mode: "payment",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][product_data][name]": `Boost: ${campaign.name}`,
      "line_items[0][price_data][product_data][description]": `${duration}-day campaign at $${dailyBudget.toFixed(2)}/day - Est. ${estimatedImpressions.toLocaleString()} impressions`,
      "line_items[0][price_data][unit_amount]": campaign.budgetCents.toString(),
      "line_items[0][quantity]": "1",
      success_url: `${args.successUrl}${args.successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: args.cancelUrl,
      "metadata[campaignId]": args.campaignId,
      "metadata[type]": "boost_campaign",
      // Improve checkout UX
      "payment_method_types[0]": "card",
      "submit_type": "pay",
      // Add custom text to explain what they're buying
      "custom_text[submit][message]": `Your boost campaign will start immediately after payment and run for ${duration} days.`,
    };

    // Add asset thumbnail as product image if available
    if (assetThumbnail) {
      params["line_items[0][price_data][product_data][images][0]"] = assetThumbnail;
    }

    // Create Stripe checkout session
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Stripe error:", error);
      throw new Error("Failed to create checkout session");
    }

    const session = await response.json();

    // Update campaign with checkout session ID
    await ctx.runMutation(internal.boost.updateCampaignCheckoutSession, {
      campaignId: args.campaignId,
      checkoutSessionId: session.id,
    });

    return { checkoutUrl: session.url };
  },
});

/**
 * Internal query to get campaign for checkout (used by action)
 */
export const getCampaignForCheckout = internalQuery({
  args: {
    campaignId: v.id("boost_campaigns"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.campaignId);
  },
});

/**
 * Internal query to get campaign with asset thumbnail for checkout
 */
export const getCampaignWithAssetForCheckout = internalQuery({
  args: {
    campaignId: v.id("boost_campaigns"),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) return null;

    let assetThumbnail: string | null = null;
    const r2Bucket = process.env.R2_PUBLIC_BUCKET_URL;

    // Get asset thumbnail if available
    if (campaign.assetId && campaign.assetType) {
      if (campaign.assetType === "clip") {
        const clip = await ctx.db.get(campaign.assetId as Id<"generated_clips">);
        if (clip) {
          assetThumbnail = clip.customThumbnailUrl || clip.thumbnailUrl || null;
        }
      } else if (campaign.assetType === "meme") {
        const meme = await ctx.db.get(campaign.assetId as Id<"generated_memes">);
        if (meme) {
          if (meme.memeStorageId) {
            assetThumbnail = await ctx.storage.getUrl(meme.memeStorageId);
          } else if (r2Bucket && meme.r2MemeKey) {
            assetThumbnail = `${r2Bucket}/${meme.r2MemeKey}`;
          } else if (r2Bucket && meme.r2FrameKey) {
            assetThumbnail = `${r2Bucket}/${meme.r2FrameKey}`;
          } else {
            assetThumbnail = meme.memeUrl || meme.frameUrl || null;
          }
        }
      } else if (campaign.assetType === "gif") {
        const gif = await ctx.db.get(campaign.assetId as Id<"generated_gifs">);
        if (gif) {
          if (gif.storageId) {
            assetThumbnail = await ctx.storage.getUrl(gif.storageId);
          } else if (r2Bucket && gif.r2GifKey) {
            assetThumbnail = `${r2Bucket}/${gif.r2GifKey}`;
          } else {
            assetThumbnail = gif.gifUrl || null;
          }
        }
      }
    }

    return { campaign, assetThumbnail };
  },
});

/**
 * Internal mutation to update checkout session ID
 */
export const updateCampaignCheckoutSession = internalMutation({
  args: {
    campaignId: v.id("boost_campaigns"),
    checkoutSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.campaignId, {
      stripeCheckoutSessionId: args.checkoutSessionId,
    });
  },
});

/**
 * Handle successful Stripe payment (called from webhook)
 * Using public mutation to allow webhook API route to call it
 */
export const handleBoostPaymentSuccess = mutation({
  args: {
    checkoutSessionId: v.string(),
    paymentIntentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find campaign by checkout session ID
    const campaigns = await ctx.db
      .query("boost_campaigns")
      .withIndex("by_stripeCheckout", (q) =>
        q.eq("stripeCheckoutSessionId", args.checkoutSessionId)
      )
      .collect();

    const campaign = campaigns[0];
    if (!campaign) {
      console.error("Campaign not found for checkout session:", args.checkoutSessionId);
      return { success: false, error: "Campaign not found" };
    }

    // Prevent duplicate processing
    if (campaign.paymentStatus === "paid") {
      return { success: true, campaignId: campaign._id, message: "Already processed" };
    }

    const now = Date.now();
    const endDate = now + (campaign.durationDays ?? 7) * 24 * 60 * 60 * 1000;

    // Update campaign to active
    await ctx.db.patch(campaign._id, {
      status: "active",
      paymentStatus: "paid",
      stripePaymentIntentId: args.paymentIntentId,
      paidAt: now,
      startDate: now,
      endDate: endDate,
    });

    return { success: true, campaignId: campaign._id };
  },
});

/**
 * Handle failed Stripe payment (called from webhook)
 */
export const handleBoostPaymentFailed = mutation({
  args: {
    checkoutSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const campaigns = await ctx.db
      .query("boost_campaigns")
      .withIndex("by_stripeCheckout", (q) =>
        q.eq("stripeCheckoutSessionId", args.checkoutSessionId)
      )
      .collect();

    const campaign = campaigns[0];
    if (!campaign) {
      return { success: false, error: "Campaign not found" };
    }

    // Prevent duplicate processing
    if (campaign.paymentStatus === "failed") {
      return { success: true, message: "Already processed" };
    }

    await ctx.db.patch(campaign._id, {
      status: "cancelled",
      paymentStatus: "failed",
    });

    return { success: true };
  },
});

/**
 * Verify payment status after redirect (for client-side verification)
 */
export const verifyBoostPayment = query({
  args: {
    checkoutSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { success: false, error: "Not authenticated" };
    }

    const campaigns = await ctx.db
      .query("boost_campaigns")
      .withIndex("by_stripeCheckout", (q) =>
        q.eq("stripeCheckoutSessionId", args.checkoutSessionId)
      )
      .collect();

    const campaign = campaigns[0];
    if (!campaign) {
      return { success: false, error: "Campaign not found" };
    }

    return {
      success: true,
      campaignId: campaign._id,
      status: campaign.status,
      paymentStatus: campaign.paymentStatus,
      name: campaign.name,
    };
  },
});

/**
 * Get all boost campaigns for history (includes asset details)
 */
export const getBoostCampaignHistory = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) return [];

    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile || profile.userId !== user._id) return [];

    // Get all campaigns for this user
    const campaigns = await ctx.db
      .query("boost_campaigns")
      .withIndex("by_creator", (q) => q.eq("createdByUserId", user._id))
      .order("desc")
      .collect();

    // Filter to campaigns for this actor profile
    const profileCampaigns = campaigns.filter(
      (c) => c.actorProfileId === args.actorProfileId
    );

    // R2 public bucket URL for constructing URLs from R2 keys
    const r2Bucket = process.env.R2_PUBLIC_BUCKET_URL;

    // Enrich with asset details
    const enrichedCampaigns = await Promise.all(
      profileCampaigns.map(async (campaign) => {
        let assetThumbnail: string | null = null;
        let assetTitle = campaign.name;

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
              } else if (r2Bucket && meme.r2FrameKey) {
                assetThumbnail = `${r2Bucket}/${meme.r2FrameKey}`;
              } else {
                assetThumbnail = meme.memeUrl || meme.frameUrl || null;
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
              } else {
                assetThumbnail = gif.gifUrl || null;
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
 * Get boost metrics aggregated by asset
 */
export const getBoostMetricsByAsset = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) return [];

    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile || profile.userId !== user._id) return [];

    // Get all campaigns for this user
    const campaigns = await ctx.db
      .query("boost_campaigns")
      .withIndex("by_creator", (q) => q.eq("createdByUserId", user._id))
      .collect();

    // Filter to campaigns for this actor profile with assets
    const profileCampaigns = campaigns.filter(
      (c) => c.actorProfileId === args.actorProfileId && c.assetId && c.assetType
    );

    // Group by asset
    const assetMap = new Map<string, {
      assetId: string;
      assetType: string;
      campaigns: typeof profileCampaigns;
    }>();

    for (const campaign of profileCampaigns) {
      const key = `${campaign.assetType}:${campaign.assetId}`;
      if (!assetMap.has(key)) {
        assetMap.set(key, {
          assetId: campaign.assetId!,
          assetType: campaign.assetType!,
          campaigns: [],
        });
      }
      assetMap.get(key)!.campaigns.push(campaign);
    }

    // R2 public bucket URL
    const r2Bucket = process.env.R2_PUBLIC_BUCKET_URL;

    // Enrich with asset details and aggregate metrics
    const results = await Promise.all(
      Array.from(assetMap.values()).map(async ({ assetId, assetType, campaigns }) => {
        let assetThumbnail: string | null = null;
        let assetTitle = "Unknown Asset";
        let assetUrl: string | null = null;

        if (assetType === "clip") {
          const clip = await ctx.db.get(assetId as Id<"generated_clips">);
          if (clip) {
            assetThumbnail = clip.customThumbnailUrl || clip.thumbnailUrl || null;
            assetTitle = clip.title || "Clip";
            assetUrl = clip.downloadUrl || null;
          }
        } else if (assetType === "meme") {
          const meme = await ctx.db.get(assetId as Id<"generated_memes">);
          if (meme) {
            if (meme.memeStorageId) {
              assetThumbnail = await ctx.storage.getUrl(meme.memeStorageId);
            } else if (r2Bucket && meme.r2MemeKey) {
              assetThumbnail = `${r2Bucket}/${meme.r2MemeKey}`;
            } else if (r2Bucket && meme.r2FrameKey) {
              assetThumbnail = `${r2Bucket}/${meme.r2FrameKey}`;
            } else {
              assetThumbnail = meme.memeUrl || meme.frameUrl || null;
            }
            assetTitle = meme.caption?.slice(0, 50) || "Meme";
            assetUrl = assetThumbnail;
          }
        } else if (assetType === "gif") {
          const gif = await ctx.db.get(assetId as Id<"generated_gifs">);
          if (gif) {
            if (gif.storageId) {
              assetThumbnail = await ctx.storage.getUrl(gif.storageId);
            } else if (r2Bucket && gif.r2GifKey) {
              assetThumbnail = `${r2Bucket}/${gif.r2GifKey}`;
            } else {
              assetThumbnail = gif.gifUrl || null;
            }
            assetTitle = gif.title || "GIF";
            assetUrl = assetThumbnail;
          }
        }

        // Aggregate metrics
        const totalImpressions = campaigns.reduce((sum, c) => sum + (c.impressions ?? 0), 0);
        const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks ?? 0), 0);
        const totalReach = campaigns.reduce((sum, c) => sum + (c.reach ?? 0), 0);
        const totalSpent = campaigns.reduce((sum, c) => sum + (c.spentCents ?? 0), 0);
        const totalConversions = campaigns.reduce((sum, c) => sum + (c.conversions ?? 0), 0);
        const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        const avgCpc = totalClicks > 0 ? totalSpent / totalClicks : 0;
        const avgCpm = totalImpressions > 0 ? (totalSpent / totalImpressions) * 1000 : 0;

        return {
          assetId,
          assetType,
          assetTitle,
          assetThumbnail,
          assetUrl,
          campaignCount: campaigns.length,
          activeCampaigns: campaigns.filter((c) => c.status === "active").length,
          // Aggregated metrics
          totalImpressions,
          totalClicks,
          totalReach,
          totalSpentCents: totalSpent,
          totalConversions,
          avgCtr: Math.round(avgCtr * 100) / 100,
          avgCpc: Math.round(avgCpc),
          avgCpm: Math.round(avgCpm),
          // Latest campaign date for sorting
          lastCampaignDate: Math.max(...campaigns.map((c) => c.createdAt)),
        };
      })
    );

    // Sort by most recent campaign
    return results.sort((a, b) => b.lastCampaignDate - a.lastCampaignDate);
  },
});

// =============================================================================
// ADMIN QUERIES
// =============================================================================

/**
 * Get all boost campaigns across all users (admin view)
 * Returns enriched data with user info, film name, and asset details
 */
export const getAllBoostCampaignsAdmin = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Admin authorization check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!currentUser?.superadmin) throw new Error("Admin access required");

    // Get all campaigns
    let campaigns;
    if (args.status) {
      campaigns = await ctx.db
        .query("boost_campaigns")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(args.limit ?? 100);
    } else {
      campaigns = await ctx.db
        .query("boost_campaigns")
        .order("desc")
        .take(args.limit ?? 100);
    }

    const r2Bucket = process.env.R2_PUBLIC_BUCKET_URL;

    // Enrich with user, profile, project, and asset details
    const enrichedCampaigns = await Promise.all(
      campaigns.map(async (campaign) => {
        // Get user info
        const user = await ctx.db.get(campaign.createdByUserId);

        // Get actor profile
        const profile = campaign.actorProfileId
          ? await ctx.db.get(campaign.actorProfileId)
          : null;

        // Get project info (for film name)
        const project = campaign.projectId
          ? await ctx.db.get(campaign.projectId)
          : null;

        // Get asset thumbnail and title
        let assetThumbnail: string | null = null;
        let assetTitle = campaign.name;

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
              } else if (r2Bucket && meme.r2FrameKey) {
                assetThumbnail = `${r2Bucket}/${meme.r2FrameKey}`;
              } else {
                assetThumbnail = meme.memeUrl || meme.frameUrl || null;
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
              } else {
                assetThumbnail = gif.gifUrl || null;
              }
              assetTitle = gif.title || campaign.name;
            }
          }
        }

        const now = Date.now();
        const daysRemaining = campaign.endDate
          ? Math.max(0, Math.ceil((campaign.endDate - now) / (24 * 60 * 60 * 1000)))
          : null;
        const daysElapsed = campaign.startDate
          ? Math.ceil((now - campaign.startDate) / (24 * 60 * 60 * 1000))
          : 0;

        return {
          _id: campaign._id,
          // Campaign details
          name: assetTitle,
          status: campaign.status,
          paymentStatus: campaign.paymentStatus,
          platform: campaign.platform,
          // Budget info
          budgetCents: campaign.budgetCents,
          dailyBudgetCents: campaign.dailyBudgetCents,
          spentCents: campaign.spentCents ?? 0,
          durationDays: campaign.durationDays,
          // Duration info
          daysRemaining,
          daysElapsed,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          // Performance metrics
          impressions: campaign.impressions ?? 0,
          clicks: campaign.clicks ?? 0,
          reach: campaign.reach ?? 0,
          conversions: campaign.conversions ?? 0,
          ctr: campaign.ctr,
          cpc: campaign.cpc,
          cpm: campaign.cpm,
          roi: campaign.roi,
          // Asset info
          assetType: campaign.assetType,
          assetId: campaign.assetId,
          assetThumbnail,
          // User/Account info
          userName: user?.name || user?.email || "Unknown User",
          userEmail: user?.email,
          userId: campaign.createdByUserId,
          // Profile info
          profileName: profile?.displayName,
          profileSlug: profile?.slug,
          profileId: campaign.actorProfileId,
          // Film/Project info
          filmName: project?.title || profile?.displayName || "No Film",
          projectId: campaign.projectId,
          // Dates
          createdAt: campaign.createdAt,
          paidAt: campaign.paidAt,
        };
      })
    );

    return enrichedCampaigns;
  },
});

/**
 * Get boost campaign summary stats (admin view)
 */
export const getBoostSummaryAdmin = query({
  args: {},
  handler: async (ctx) => {
    // Admin authorization check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!currentUser?.superadmin) throw new Error("Admin access required");

    const campaigns = await ctx.db.query("boost_campaigns").collect();

    const totalCampaigns = campaigns.length;
    const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
    const completedCampaigns = campaigns.filter((c) => c.status === "completed").length;
    const pendingPayment = campaigns.filter((c) => c.status === "pending_payment").length;

    const totalSpent = campaigns.reduce((sum, c) => sum + (c.spentCents ?? 0), 0);
    const totalBudget = campaigns.reduce((sum, c) => sum + (c.budgetCents ?? 0), 0);
    const totalImpressions = campaigns.reduce((sum, c) => sum + (c.impressions ?? 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks ?? 0), 0);
    const totalReach = campaigns.reduce((sum, c) => sum + (c.reach ?? 0), 0);

    // Get unique users who have boosted
    const uniqueUsers = new Set(campaigns.map((c) => c.createdByUserId.toString())).size;

    return {
      totalCampaigns,
      activeCampaigns,
      completedCampaigns,
      pendingPayment,
      totalSpentCents: totalSpent,
      totalBudgetCents: totalBudget,
      totalImpressions,
      totalClicks,
      totalReach,
      uniqueUsers,
      avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    };
  },
});
