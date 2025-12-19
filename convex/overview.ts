import { v } from "convex/values";
import { query, mutation, action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const timeRangeValidator = v.union(
  v.literal("7d"),
  v.literal("14d"),
  v.literal("30d")
);

/**
 * Get recent assets (clips, memes, GIFs) for Quick Actions Grid
 */
export const getRecentAssets = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    timeRange: timeRangeValidator,
    limit: v.optional(v.number()),
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

    const days = args.timeRange === "7d" ? 7 : args.timeRange === "14d" ? 14 : 30;
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const limit = args.limit ?? 6;
    const limitPerType = Math.ceil(limit / 3);

    // Fetch recent clips
    const allClips = await ctx.db
      .query("generated_clips")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", args.actorProfileId)
      )
      .order("desc")
      .collect();

    const clips = allClips
      .filter((c) => c.createdAt >= cutoffTime)
      .slice(0, limitPerType);

    // Fetch recent memes
    const allMemes = await ctx.db
      .query("generated_memes")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", args.actorProfileId)
      )
      .order("desc")
      .collect();

    const memes = allMemes
      .filter((m) => m.createdAt >= cutoffTime)
      .slice(0, limitPerType);

    // Fetch recent GIFs
    const allGifs = await ctx.db
      .query("generated_gifs")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", args.actorProfileId)
      )
      .order("desc")
      .collect();

    const gifs = allGifs
      .filter((g) => g.createdAt >= cutoffTime)
      .slice(0, limitPerType);

    // R2 public bucket URL for constructing URLs from R2 keys
    const r2Bucket = process.env.R2_PUBLIC_BUCKET_URL;

    // Generate URLs for assets with storage IDs or R2 keys
    const memeUrls = await Promise.all(
      memes.map(async (m) => {
        // Try to get URL from Convex storage first
        if (m.memeStorageId) {
          const url = await ctx.storage.getUrl(m.memeStorageId);
          if (url) return url;
        }
        // Try R2 public URL
        if (r2Bucket && m.r2MemeKey) {
          return `${r2Bucket}/${m.r2MemeKey}`;
        }
        if (r2Bucket && m.r2FrameKey) {
          return `${r2Bucket}/${m.r2FrameKey}`;
        }
        // Fall back to existing URLs
        return m.memeUrl || m.frameUrl || null;
      })
    );

    const gifUrls = await Promise.all(
      gifs.map(async (g) => {
        // Try to get URL from Convex storage first
        if (g.storageId) {
          const url = await ctx.storage.getUrl(g.storageId);
          if (url) return url;
        }
        // Try R2 public URL
        if (r2Bucket && g.r2GifKey) {
          return `${r2Bucket}/${g.r2GifKey}`;
        }
        // Fall back to existing URL
        return g.gifUrl || null;
      })
    );

    // Combine and sort by creation date
    const combined = [
      ...clips.map((c) => ({
        _id: c._id,
        type: "clip" as const,
        title: c.title,
        thumbnailUrl: c.customThumbnailUrl || c.thumbnailUrl,
        createdAt: c.createdAt,
        score: c.score,
        viralScore: undefined,
      })),
      ...memes.map((m, i) => ({
        _id: m._id,
        type: "meme" as const,
        title: m.caption?.slice(0, 50) || "Meme",
        thumbnailUrl: memeUrls[i],
        createdAt: m.createdAt,
        score: undefined,
        viralScore: m.viralScore,
      })),
      ...gifs.map((g, i) => ({
        _id: g._id,
        type: "gif" as const,
        title: g.title || "GIF",
        thumbnailUrl: gifUrls[i],
        createdAt: g.createdAt,
        score: undefined,
        viralScore: g.viralScore,
      })),
    ];

    return combined.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  },
});

/**
 * Internal query to get recent assets data (used by action)
 */
export const getRecentAssetsInternal = internalQuery({
  args: {
    actorProfileId: v.id("actor_profiles"),
    timeRange: timeRangeValidator,
    limit: v.optional(v.number()),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", args.tokenIdentifier))
      .unique();

    if (!user) return null;

    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile || profile.userId !== user._id) return null;

    const days = args.timeRange === "7d" ? 7 : args.timeRange === "14d" ? 14 : 30;
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const limit = args.limit ?? 6;
    const limitPerType = Math.ceil(limit / 3);

    // Fetch recent clips
    const allClips = await ctx.db
      .query("generated_clips")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", args.actorProfileId)
      )
      .order("desc")
      .collect();

    const clips = allClips
      .filter((c) => c.createdAt >= cutoffTime)
      .slice(0, limitPerType);

    // Fetch recent memes
    const allMemes = await ctx.db
      .query("generated_memes")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", args.actorProfileId)
      )
      .order("desc")
      .collect();

    const memes = allMemes
      .filter((m) => m.createdAt >= cutoffTime)
      .slice(0, limitPerType);

    // Fetch recent GIFs
    const allGifs = await ctx.db
      .query("generated_gifs")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", args.actorProfileId)
      )
      .order("desc")
      .collect();

    const gifs = allGifs
      .filter((g) => g.createdAt >= cutoffTime)
      .slice(0, limitPerType);

    return { clips, memes, gifs, limit };
  },
});

// Return type for recent asset
type RecentAsset = {
  _id: string;
  type: "clip" | "meme" | "gif";
  title: string;
  thumbnailUrl: string | null | undefined;
  createdAt: number;
  score: number | undefined;
  viralScore: number | undefined;
};

/**
 * Get recent assets with signed URLs for GIFs and memes
 * This action generates fresh signed URLs for R2 assets
 */
export const getRecentAssetsWithSignedUrls = action({
  args: {
    actorProfileId: v.id("actor_profiles"),
    timeRange: timeRangeValidator,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<RecentAsset[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    // Get raw asset data
    const data = await ctx.runQuery(internal.overview.getRecentAssetsInternal, {
      actorProfileId: args.actorProfileId,
      timeRange: args.timeRange,
      limit: args.limit,
      tokenIdentifier: identity.tokenIdentifier,
    });

    if (!data) return [];

    const { clips, memes, gifs, limit: assetLimit } = data;

    // Collect R2 keys for GIFs that need signed URLs
    const gifR2Keys: Array<{
      id: string;
      gifKey?: string;
      mp4Key?: string;
      webpKey?: string;
    }> = [];

    for (const gif of gifs) {
      if (gif.r2GifKey || gif.r2Mp4Key || gif.r2WebpKey) {
        gifR2Keys.push({
          id: gif._id,
          gifKey: gif.r2GifKey,
          mp4Key: gif.r2Mp4Key,
          webpKey: gif.r2WebpKey,
        });
      }
    }

    // Collect R2 keys for memes that need signed URLs
    const memeR2Keys: Array<{
      id: string;
      memeKey?: string;
      frameKey?: string;
    }> = [];

    for (const meme of memes) {
      if (meme.r2MemeKey || meme.r2FrameKey) {
        memeR2Keys.push({
          id: meme._id,
          memeKey: meme.r2MemeKey,
          frameKey: meme.r2FrameKey,
        });
      }
    }

    // Generate signed URLs for GIFs
    let gifSignedUrls: Array<{
      id: string;
      gifUrl: string | null;
      mp4Url: string | null;
      webpUrl: string | null;
      expiresAt: number;
    }> = [];

    if (gifR2Keys.length > 0) {
      gifSignedUrls = await ctx.runAction(internal.r2.r2GetGifSignedUrlsInternal, {
        r2Keys: gifR2Keys,
        expiresIn: 3600, // 1 hour
      });
    }

    // Generate signed URLs for memes
    let memeSignedUrls: Array<{
      id: string;
      memeUrl: string | null;
      frameUrl: string | null;
      expiresAt: number;
    }> = [];

    if (memeR2Keys.length > 0) {
      memeSignedUrls = await ctx.runAction(internal.r2.r2GetMemeSignedUrlsInternal, {
        r2Keys: memeR2Keys,
        expiresIn: 3600, // 1 hour
      });
    }

    // Create maps for quick lookup
    const gifUrlMap = new Map<string, string | null>();
    for (const item of gifSignedUrls) {
      gifUrlMap.set(item.id, item.gifUrl || item.mp4Url);
    }

    const memeUrlMap = new Map<string, string | null>();
    for (const item of memeSignedUrls) {
      memeUrlMap.set(item.id, item.memeUrl || item.frameUrl);
    }

    // Combine and sort by creation date
    type ClipData = typeof clips[number];
    type MemeData = typeof memes[number];
    type GifData = typeof gifs[number];

    const combined = [
      ...clips.map((c: ClipData) => ({
        _id: c._id,
        type: "clip" as const,
        title: c.title,
        thumbnailUrl: c.customThumbnailUrl || c.thumbnailUrl,
        createdAt: c.createdAt,
        score: c.score,
        viralScore: undefined,
      })),
      ...memes.map((m: MemeData) => ({
        _id: m._id,
        type: "meme" as const,
        title: m.caption?.slice(0, 50) || "Meme",
        thumbnailUrl: memeUrlMap.get(m._id) || m.memeUrl || m.frameUrl || null,
        createdAt: m.createdAt,
        score: undefined,
        viralScore: m.viralScore,
      })),
      ...gifs.map((g: GifData) => ({
        _id: g._id,
        type: "gif" as const,
        title: g.title || "GIF",
        thumbnailUrl: gifUrlMap.get(g._id) || g.gifUrl || null,
        createdAt: g.createdAt,
        score: undefined,
        viralScore: g.viralScore,
      })),
    ];

    return combined.sort((a, b) => b.createdAt - a.createdAt).slice(0, assetLimit);
  },
});

/**
 * Get chart data for trajectory visualization
 */
export const getChartData = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    timeRange: timeRangeValidator,
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

    const days =
      args.timeRange === "7d" ? 7 : args.timeRange === "14d" ? 14 : 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // Get analytics snapshots
    const snapshots = await ctx.db
      .query("analytics_snapshots")
      .withIndex("by_profile", (q) =>
        q.eq("actorProfileId", args.actorProfileId)
      )
      .collect();

    const filteredSnapshots = snapshots
      .filter((s) => s.date >= startDateStr && s.date <= endDateStr)
      .sort((a, b) => a.date.localeCompare(b.date));

    return filteredSnapshots.map((snapshot) => ({
      date: snapshot.date,
      label: new Date(snapshot.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      timestamp: new Date(snapshot.date).getTime(),
      pageViews: snapshot.pageViews,
      clipPlays: snapshot.clipPlays,
      engagement:
        snapshot.clipPlays + snapshot.clipShares + snapshot.commentCount,
    }));
  },
});

/**
 * Get asset generation stats over time (for stacked bar chart)
 */
export const getAssetGenerationStats = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    timeRange: timeRangeValidator,
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

    const days =
      args.timeRange === "7d" ? 7 : args.timeRange === "14d" ? 14 : 30;
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    // Fetch all assets in timeframe
    const [clips, memes, gifs] = await Promise.all([
      ctx.db
        .query("generated_clips")
        .withIndex("by_actorProfile", (q) =>
          q.eq("actorProfileId", args.actorProfileId)
        )
        .collect(),
      ctx.db
        .query("generated_memes")
        .withIndex("by_actorProfile", (q) =>
          q.eq("actorProfileId", args.actorProfileId)
        )
        .collect(),
      ctx.db
        .query("generated_gifs")
        .withIndex("by_actorProfile", (q) =>
          q.eq("actorProfileId", args.actorProfileId)
        )
        .collect(),
    ]);

    // Group by date
    const dayMap = new Map<
      string,
      { clips: number; memes: number; gifs: number }
    >();

    const toDateKey = (timestamp: number) =>
      new Date(timestamp).toISOString().split("T")[0];

    for (const clip of clips.filter((c) => c.createdAt >= cutoffTime)) {
      const key = toDateKey(clip.createdAt);
      const entry = dayMap.get(key) ?? { clips: 0, memes: 0, gifs: 0 };
      entry.clips++;
      dayMap.set(key, entry);
    }

    for (const meme of memes.filter((m) => m.createdAt >= cutoffTime)) {
      const key = toDateKey(meme.createdAt);
      const entry = dayMap.get(key) ?? { clips: 0, memes: 0, gifs: 0 };
      entry.memes++;
      dayMap.set(key, entry);
    }

    for (const gif of gifs.filter((g) => g.createdAt >= cutoffTime)) {
      const key = toDateKey(gif.createdAt);
      const entry = dayMap.get(key) ?? { clips: 0, memes: 0, gifs: 0 };
      entry.gifs++;
      dayMap.set(key, entry);
    }

    // Convert to sorted array
    return Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({
        date,
        label: new Date(date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        clips: counts.clips,
        memes: counts.memes,
        gifs: counts.gifs,
        total: counts.clips + counts.memes + counts.gifs,
      }));
  },
});

/**
 * Get metrics summary for the overview cards
 */
export const getMetricsSummary = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    timeRange: timeRangeValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        pageViews: 0,
        clipPlays: 0,
        emailCaptures: 0,
        linkClicks: 0,
      };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return {
        pageViews: 0,
        clipPlays: 0,
        emailCaptures: 0,
        linkClicks: 0,
      };
    }

    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile || profile.userId !== user._id) {
      return {
        pageViews: 0,
        clipPlays: 0,
        emailCaptures: 0,
        linkClicks: 0,
      };
    }

    const days =
      args.timeRange === "7d" ? 7 : args.timeRange === "14d" ? 14 : 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // Get current period snapshots
    const snapshots = await ctx.db
      .query("analytics_snapshots")
      .withIndex("by_profile", (q) =>
        q.eq("actorProfileId", args.actorProfileId)
      )
      .collect();

    const currentPeriod = snapshots.filter(
      (s) => s.date >= startDateStr && s.date <= endDateStr
    );

    // Get previous period for comparison
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - days);
    const prevStartDateStr = prevStartDate.toISOString().split("T")[0];

    const previousPeriod = snapshots.filter(
      (s) => s.date >= prevStartDateStr && s.date < startDateStr
    );

    // Calculate totals
    const current = {
      pageViews: currentPeriod.reduce((sum, s) => sum + s.pageViews, 0),
      clipPlays: currentPeriod.reduce((sum, s) => sum + s.clipPlays, 0),
      emailCaptures: currentPeriod.reduce(
        (sum, s) => sum + (s.emailCaptures ?? 0),
        0
      ),
      linkClicks: currentPeriod.reduce(
        (sum, s) => sum + (s.socialClicks ?? 0),
        0
      ),
    };

    const previous = {
      pageViews: previousPeriod.reduce((sum, s) => sum + s.pageViews, 0),
      clipPlays: previousPeriod.reduce((sum, s) => sum + s.clipPlays, 0),
      emailCaptures: previousPeriod.reduce(
        (sum, s) => sum + (s.emailCaptures ?? 0),
        0
      ),
      linkClicks: previousPeriod.reduce(
        (sum, s) => sum + (s.socialClicks ?? 0),
        0
      ),
    };

    // Calculate percentage changes
    const calcChange = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    return {
      pageViews: current.pageViews,
      pageViewsChange: calcChange(current.pageViews, previous.pageViews),
      clipPlays: current.clipPlays,
      clipPlaysChange: calcChange(current.clipPlays, previous.clipPlays),
      emailCaptures: current.emailCaptures,
      emailCapturesChange: calcChange(
        current.emailCaptures,
        previous.emailCaptures
      ),
      linkClicks: current.linkClicks,
      linkClicksChange: calcChange(current.linkClicks, previous.linkClicks),
    };
  },
});

/**
 * Get active boost campaigns for the Boost card
 */
export const getActiveBoostCampaigns = query({
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

    // Get active campaigns for this user
    const campaigns = await ctx.db
      .query("boost_campaigns")
      .withIndex("by_creator", (q) => q.eq("createdByUserId", user._id))
      .collect();

    // Filter to active campaigns and calculate days remaining
    const now = Date.now();
    const activeCampaigns = campaigns
      .filter((c) => c.status === "active" && (!c.endDate || c.endDate > now))
      .map((c) => {
        const daysRemaining = c.endDate
          ? Math.max(0, Math.ceil((c.endDate - now) / (24 * 60 * 60 * 1000)))
          : null;
        return {
          _id: c._id,
          name: c.name,
          status: c.status,
          budgetCents: c.budgetCents,
          platform: c.platform,
          impressions: c.impressions ?? 0,
          clicks: c.clicks ?? 0,
          reach: c.reach ?? 0,
          daysRemaining,
          startDate: c.startDate,
          endDate: c.endDate,
        };
      });

    return activeCampaigns;
  },
});

/**
 * Create a new boost campaign
 */
export const createBoostCampaign = mutation({
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

    // Verify the asset exists and belongs to this profile
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
    const endDate = now + args.durationDays * 24 * 60 * 60 * 1000;

    // Create the boost campaign
    const campaignId = await ctx.db.insert("boost_campaigns", {
      createdByUserId: user._id,
      name: assetTitle,
      status: "active",
      budgetCents: args.dailyBudgetCents,
      platform: args.platform ?? "all",
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

    return { campaignId, name: assetTitle };
  },
});

/**
 * Cancel/pause a boost campaign
 */
export const updateBoostCampaignStatus = mutation({
  args: {
    campaignId: v.id("boost_campaigns"),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("completed")),
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

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.createdByUserId !== user._id) {
      throw new Error("Campaign not found or not authorized");
    }

    await ctx.db.patch(args.campaignId, {
      status: args.status,
    });

    return { success: true };
  },
});
