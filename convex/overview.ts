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
 * Get chart data for trajectory visualization.
 * This now queries analytics_events directly for real-time data,
 * matching the approach used in deep analytics.
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

    // Calculate time range
    const now = Date.now();
    const cutoffTime = now - days * 24 * 60 * 60 * 1000;

    // Query raw analytics_events for real-time data (matching deep analytics approach)
    const allEvents = await ctx.db
      .query("analytics_events")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", args.actorProfileId)
      )
      .collect();

    const recentEvents = allEvents.filter(
      (e) => e._creationTime >= cutoffTime
    );

    // Group events by date
    const dailyData = new Map<
      string,
      {
        pageViews: number;
        clipPlays: number;
        emailCaptures: number;
        linkClicks: number;
        clipShares: number;
        comments: number;
      }
    >();

    // Initialize all days in range with zero counts
    for (let i = 0; i < days; i++) {
      const date = new Date(now - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split("T")[0];
      dailyData.set(dateKey, {
        pageViews: 0,
        clipPlays: 0,
        emailCaptures: 0,
        linkClicks: 0,
        clipShares: 0,
        comments: 0,
      });
    }

    // Aggregate events by date using the same event types as deep analytics
    for (const event of recentEvents) {
      const dateKey = new Date(event._creationTime).toISOString().split("T")[0];
      const dayStats = dailyData.get(dateKey);
      if (!dayStats) continue;

      switch (event.eventType) {
        case "page_view":
          dayStats.pageViews++;
          break;
        case "clip_played":
        case "generated_clip_played":
        case "processing_clip_played":
        case "video_play":
          dayStats.clipPlays++;
          break;
        case "email_captured":
          dayStats.emailCaptures++;
          break;
        case "social_link_clicked":
        case "outbound_link_clicked":
        case "watch_cta_clicked":
        case "get_updates_clicked":
        case "share_button_clicked":
          dayStats.linkClicks++;
          break;
        case "clip_shared":
        case "social_share_completed":
          dayStats.clipShares++;
          break;
        case "comment_submitted":
          dayStats.comments++;
          break;
      }

      dailyData.set(dateKey, dayStats);
    }

    // Convert to sorted array for chart
    return Array.from(dailyData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        label: new Date(date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        timestamp: new Date(date).getTime(),
        pageViews: stats.pageViews,
        clipPlays: stats.clipPlays,
        engagement: stats.clipPlays + stats.clipShares + stats.comments + stats.linkClicks,
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
 * Get metrics summary for the overview cards.
 * This now queries analytics_events directly for real-time data,
 * matching the approach used in deep analytics.
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

    // Calculate time ranges for current and previous periods
    const now = Date.now();
    const currentPeriodStart = now - days * 24 * 60 * 60 * 1000;
    const previousPeriodStart = currentPeriodStart - days * 24 * 60 * 60 * 1000;

    // Query raw analytics_events for real-time data (matching deep analytics approach)
    const allEvents = await ctx.db
      .query("analytics_events")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", args.actorProfileId)
      )
      .collect();

    // Split events into current and previous periods
    const currentPeriodEvents = allEvents.filter(
      (e) => e._creationTime >= currentPeriodStart
    );
    const previousPeriodEvents = allEvents.filter(
      (e) => e._creationTime >= previousPeriodStart && e._creationTime < currentPeriodStart
    );

    // Aggregate event counts by type for current period
    const countEvents = (events: typeof allEvents) => {
      const counts: Record<string, number> = {};
      for (const event of events) {
        counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
      }
      return counts;
    };

    const currentCounts = countEvents(currentPeriodEvents);
    const previousCounts = countEvents(previousPeriodEvents);

    // Calculate metrics using the same event types as deep analytics
    // Page Views: page_view events
    const currentPageViews = currentCounts["page_view"] ?? 0;
    const previousPageViews = previousCounts["page_view"] ?? 0;

    // Clip Plays: clip_played + generated_clip_played + processing_clip_played + video_play
    const currentClipPlays =
      (currentCounts["clip_played"] ?? 0) +
      (currentCounts["generated_clip_played"] ?? 0) +
      (currentCounts["processing_clip_played"] ?? 0) +
      (currentCounts["video_play"] ?? 0);
    const previousClipPlays =
      (previousCounts["clip_played"] ?? 0) +
      (previousCounts["generated_clip_played"] ?? 0) +
      (previousCounts["processing_clip_played"] ?? 0) +
      (previousCounts["video_play"] ?? 0);

    // Email Captures: email_captured events
    const currentEmailCaptures = currentCounts["email_captured"] ?? 0;
    const previousEmailCaptures = previousCounts["email_captured"] ?? 0;

    // Link Clicks: social_link_clicked + outbound_link_clicked + watch_cta_clicked + get_updates_clicked
    const currentLinkClicks =
      (currentCounts["social_link_clicked"] ?? 0) +
      (currentCounts["outbound_link_clicked"] ?? 0) +
      (currentCounts["watch_cta_clicked"] ?? 0) +
      (currentCounts["get_updates_clicked"] ?? 0) +
      (currentCounts["share_button_clicked"] ?? 0);
    const previousLinkClicks =
      (previousCounts["social_link_clicked"] ?? 0) +
      (previousCounts["outbound_link_clicked"] ?? 0) +
      (previousCounts["watch_cta_clicked"] ?? 0) +
      (previousCounts["get_updates_clicked"] ?? 0) +
      (previousCounts["share_button_clicked"] ?? 0);

    // Calculate percentage changes
    const calcChange = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    return {
      pageViews: currentPageViews,
      pageViewsChange: calcChange(currentPageViews, previousPageViews),
      clipPlays: currentClipPlays,
      clipPlaysChange: calcChange(currentClipPlays, previousClipPlays),
      emailCaptures: currentEmailCaptures,
      emailCapturesChange: calcChange(currentEmailCaptures, previousEmailCaptures),
      linkClicks: currentLinkClicks,
      linkClicksChange: calcChange(currentLinkClicks, previousLinkClicks),
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
