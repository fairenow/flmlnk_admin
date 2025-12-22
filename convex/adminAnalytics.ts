import { v } from "convex/values";
import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// =============================================================================
// ADMIN-ONLY ANALYTICS QUERIES
// These queries require superadmin access and should only be deployed
// from the admin dashboard repo, not the user-facing app
// =============================================================================

/**
 * Get analytics overview for all users (admin view)
 * Supports filters for location, trailer status, and film count
 */
export const getDeepAnalyticsAdmin = query({
  args: {
    daysBack: v.optional(v.number()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    country: v.optional(v.string()),
    hasTrailer: v.optional(v.boolean()),
    filmCount: v.optional(v.union(v.literal("one"), v.literal("multiple"))),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!currentUser?.superadmin) throw new Error("Admin access required");

    const daysBack = args.daysBack ?? 30;
    const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    let profiles = await ctx.db.query("actor_profiles").collect();

    // Apply location filter
    if (args.city || args.state || args.country) {
      profiles = profiles.filter((profile) => {
        const location = profile.location?.toLowerCase() || "";
        if (args.city && !location.includes(args.city.toLowerCase())) return false;
        if (args.state && !location.includes(args.state.toLowerCase())) return false;
        if (args.country && !location.includes(args.country.toLowerCase())) return false;
        return true;
      });
    }

    // Apply trailer filter
    if (args.hasTrailer !== undefined) {
      const profilesWithTrailerInfo = await Promise.all(
        profiles.map(async (profile) => {
          const projects = await ctx.db
            .query("projects")
            .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
            .collect();
          const hasTrailer = projects.some((p) => p.trailerUrl);
          return { profile, hasTrailer };
        })
      );
      profiles = profilesWithTrailerInfo
        .filter((p) => p.hasTrailer === args.hasTrailer)
        .map((p) => p.profile);
    }

    // Apply film count filter
    if (args.filmCount) {
      const profilesWithFilmCount = await Promise.all(
        profiles.map(async (profile) => {
          const projects = await ctx.db
            .query("projects")
            .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
            .collect();
          return { profile, filmCount: projects.length };
        })
      );
      profiles = profilesWithFilmCount
        .filter((p) =>
          args.filmCount === "one" ? p.filmCount === 1 : p.filmCount > 1
        )
        .map((p) => p.profile);
    }

    const profileIds = new Set(profiles.map((p) => p._id.toString()));

    const allEvents = await ctx.db.query("analytics_events").collect();
    const filteredEvents = allEvents.filter(
      (e) =>
        e.actorProfileId &&
        profileIds.has(e.actorProfileId.toString()) &&
        e._creationTime >= cutoffTime
    );

    const counts: Record<string, number> = {};
    const sessionsByProfile = new Map<string, Set<string>>();

    for (const event of filteredEvents) {
      counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
      if (event.actorProfileId) {
        const profileKey = event.actorProfileId.toString();
        if (!sessionsByProfile.has(profileKey)) {
          sessionsByProfile.set(profileKey, new Set());
        }
        if (event.sessionId) {
          sessionsByProfile.get(profileKey)!.add(event.sessionId);
        }
      }
    }

    const allSessions = new Set<string>();
    for (const sessions of sessionsByProfile.values()) {
      for (const session of sessions) {
        allSessions.add(session);
      }
    }

    const userDetails = await Promise.all(
      profiles.map(async (profile) => {
        const user = await ctx.db.get(profile.userId);
        const projects = await ctx.db
          .query("projects")
          .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
          .collect();
        const hasTrailer = projects.some((p) => p.trailerUrl);
        const profileSessions = sessionsByProfile.get(profile._id.toString());

        return {
          profileId: profile._id,
          displayName: profile.displayName,
          slug: profile.slug,
          location: profile.location,
          userName: user?.name || user?.email,
          userEmail: user?.email,
          filmCount: projects.length,
          hasTrailer,
          uniqueVisitors: profileSessions?.size ?? 0,
        };
      })
    );

    return {
      period: `${daysBack} days`,
      totalProfiles: profiles.length,
      totalEvents: filteredEvents.length,
      uniqueSessions: allSessions.size,
      pageViews: counts["page_view"] ?? 0,
      clipPlays: counts["clip_played"] ?? 0,
      clipShares: counts["clip_shared"] ?? 0,
      emailCaptures: counts["email_captured"] ?? 0,
      inquiries: counts["inquiry_submitted"] ?? 0,
      comments: counts["comment_submitted"] ?? 0,
      signups: counts["user_signup"] ?? 0,
      profilesCreated: counts["profile_created"] ?? 0,
      onboardingCompleted: counts["onboarding_completed"] ?? 0,
      users: userDetails,
    };
  },
});

/**
 * Search users and films with auto-suggest (admin view)
 */
export const searchUsersAndFilmsAdmin = query({
  args: {
    query: v.string(),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!currentUser?.superadmin) throw new Error("Admin access required");

    const searchQuery = args.query.toLowerCase().trim();
    if (!searchQuery || searchQuery.length < 2) {
      return { users: [], films: [], profiles: [] };
    }

    const users = await ctx.db.query("users").collect();
    const matchedUsers = users
      .filter((user) => {
        const name = (user.name || "").toLowerCase();
        const email = (user.email || "").toLowerCase();
        const displayName = (user.displayName || "").toLowerCase();
        return (
          name.includes(searchQuery) ||
          email.includes(searchQuery) ||
          displayName.includes(searchQuery)
        );
      })
      .slice(0, 3)
      .map((user) => ({
        _id: user._id,
        name: user.name || user.email,
        email: user.email,
        type: "user" as const,
      }));

    const projects = await ctx.db.query("projects").collect();
    const matchedFilms = projects
      .filter((project) => {
        const title = (project.title || "").toLowerCase();
        const logline = (project.logline || "").toLowerCase();
        return title.includes(searchQuery) || logline.includes(searchQuery);
      })
      .slice(0, 3);

    const enrichedFilms = await Promise.all(
      matchedFilms.map(async (project) => {
        const profile = await ctx.db.get(project.actorProfileId);
        return {
          _id: project._id,
          title: project.title,
          profileName: profile?.displayName,
          profileSlug: profile?.slug,
          posterUrl: project.posterUrl,
          type: "film" as const,
        };
      })
    );

    const profiles = await ctx.db.query("actor_profiles").collect();
    const matchedProfiles = profiles
      .filter((profile) => {
        const displayName = (profile.displayName || "").toLowerCase();
        const slug = (profile.slug || "").toLowerCase();
        return displayName.includes(searchQuery) || slug.includes(searchQuery);
      })
      .slice(0, 3);

    const enrichedProfiles = await Promise.all(
      matchedProfiles.map(async (profile) => {
        const user = await ctx.db.get(profile.userId);
        return {
          _id: profile._id,
          displayName: profile.displayName,
          slug: profile.slug,
          userName: user?.name || user?.email,
          type: "profile" as const,
        };
      })
    );

    return {
      users: matchedUsers,
      films: enrichedFilms,
      profiles: enrichedProfiles,
    };
  },
});

/**
 * Get analytics for a specific user/profile (admin detail view)
 */
export const getProfileAnalyticsAdmin = query({
  args: {
    profileId: v.id("actor_profiles"),
    daysBack: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!currentUser?.superadmin) throw new Error("Admin access required");

    const daysBack = args.daysBack ?? 30;
    const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    const profile = await ctx.db.get(args.profileId);
    if (!profile) return null;

    const user = await ctx.db.get(profile.userId);

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.profileId))
      .collect();

    const allEvents = await ctx.db
      .query("analytics_events")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.profileId))
      .collect();

    const recentEvents = allEvents.filter((e) => e._creationTime >= cutoffTime);

    const counts: Record<string, number> = {};
    const sessions = new Set<string>();

    for (const event of recentEvents) {
      counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
      if (event.sessionId) sessions.add(event.sessionId);
    }

    const startDate = new Date(cutoffTime).toISOString().split("T")[0];
    const endDate = new Date().toISOString().split("T")[0];

    const snapshots = await ctx.db
      .query("analytics_snapshots")
      .withIndex("by_profile", (q) => q.eq("actorProfileId", args.profileId))
      .collect();

    const filteredSnapshots = snapshots
      .filter((s) => s.date >= startDate && s.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      profile: {
        _id: profile._id,
        displayName: profile.displayName,
        slug: profile.slug,
        location: profile.location,
      },
      user: {
        _id: user?._id,
        name: user?.name,
        email: user?.email,
      },
      projects: projects.map((p) => ({
        _id: p._id,
        title: p.title,
        hasTrailer: !!p.trailerUrl,
        posterUrl: p.posterUrl,
      })),
      metrics: {
        period: `${daysBack} days`,
        totalEvents: recentEvents.length,
        uniqueSessions: sessions.size,
        pageViews: counts["page_view"] ?? 0,
        clipPlays: counts["clip_played"] ?? 0,
        clipShares: counts["clip_shared"] ?? 0,
        emailCaptures: counts["email_captured"] ?? 0,
        inquiries: counts["inquiry_submitted"] ?? 0,
        comments: counts["comment_submitted"] ?? 0,
      },
      snapshots: filteredSnapshots,
    };
  },
});

/**
 * Get all assets (clips, memes, GIFs) across all users (admin view)
 */
export const getAllAssetsAdmin = query({
  args: {
    assetType: v.optional(v.union(v.literal("clip"), v.literal("meme"), v.literal("gif"), v.literal("all"))),
    userId: v.optional(v.id("users")),
    profileId: v.optional(v.id("actor_profiles")),
    limit: v.optional(v.number()),
    sortBy: v.optional(v.union(v.literal("recent"), v.literal("score"), v.literal("viral"))),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!currentUser?.superadmin) throw new Error("Admin access required");

    const limit = args.limit ?? 50;
    const assetType = args.assetType ?? "all";
    const sortBy = args.sortBy ?? "recent";
    const r2Bucket = process.env.R2_PUBLIC_BUCKET_URL;

    type AssetData = {
      _id: string;
      type: "clip" | "meme" | "gif";
      title: string;
      thumbnailUrl: string | null;
      createdAt: number;
      score?: number;
      viralScore?: number;
      actorProfileId: Id<"actor_profiles">;
      userId?: Id<"users">;
      profileName?: string;
      profileSlug?: string;
      userName?: string;
      userEmail?: string;
      boosted?: boolean;
      boostCampaignId?: Id<"boost_campaigns">;
    };

    const assets: AssetData[] = [];

    if (assetType === "all" || assetType === "clip") {
      const clips = args.profileId
        ? await ctx.db
            .query("generated_clips")
            .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.profileId!))
            .order("desc")
            .take(limit)
        : await ctx.db.query("generated_clips").order("desc").take(limit);

      for (const clip of clips) {
        assets.push({
          _id: clip._id,
          type: "clip",
          title: clip.title,
          thumbnailUrl: clip.customThumbnailUrl || clip.thumbnailUrl || null,
          createdAt: clip.createdAt,
          score: clip.score,
          actorProfileId: clip.actorProfileId,
        });
      }
    }

    if (assetType === "all" || assetType === "meme") {
      const memes = args.profileId
        ? await ctx.db
            .query("generated_memes")
            .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.profileId!))
            .order("desc")
            .take(limit)
        : await ctx.db.query("generated_memes").order("desc").take(limit);

      for (const meme of memes) {
        let thumbnailUrl: string | null = null;
        if (meme.memeStorageId) {
          thumbnailUrl = await ctx.storage.getUrl(meme.memeStorageId);
        } else if (r2Bucket && meme.r2MemeKey) {
          thumbnailUrl = `${r2Bucket}/${meme.r2MemeKey}`;
        } else if (r2Bucket && meme.r2FrameKey) {
          thumbnailUrl = `${r2Bucket}/${meme.r2FrameKey}`;
        } else {
          thumbnailUrl = meme.memeUrl || meme.frameUrl || null;
        }

        assets.push({
          _id: meme._id,
          type: "meme",
          title: meme.caption?.slice(0, 50) || "Meme",
          thumbnailUrl,
          createdAt: meme.createdAt,
          viralScore: meme.viralScore,
          actorProfileId: meme.actorProfileId,
        });
      }
    }

    if (assetType === "all" || assetType === "gif") {
      const gifs = args.profileId
        ? await ctx.db
            .query("generated_gifs")
            .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.profileId!))
            .order("desc")
            .take(limit)
        : await ctx.db.query("generated_gifs").order("desc").take(limit);

      for (const gif of gifs) {
        let thumbnailUrl: string | null = null;
        if (gif.storageId) {
          thumbnailUrl = await ctx.storage.getUrl(gif.storageId);
        } else if (r2Bucket && gif.r2GifKey) {
          thumbnailUrl = `${r2Bucket}/${gif.r2GifKey}`;
        } else {
          thumbnailUrl = gif.gifUrl || null;
        }

        assets.push({
          _id: gif._id,
          type: "gif",
          title: gif.title || "GIF",
          thumbnailUrl,
          createdAt: gif.createdAt,
          viralScore: gif.viralScore,
          actorProfileId: gif.actorProfileId,
        });
      }
    }

    const boostCampaigns = await ctx.db.query("boost_campaigns").collect();
    const boostedAssets = new Map<string, Id<"boost_campaigns">>();
    for (const campaign of boostCampaigns) {
      if (campaign.assetId && (campaign.status === "active" || campaign.status === "completed")) {
        boostedAssets.set(campaign.assetId, campaign._id);
      }
    }

    const enrichedAssets = await Promise.all(
      assets.map(async (asset) => {
        const profile = await ctx.db.get(asset.actorProfileId);
        const user = profile ? await ctx.db.get(profile.userId) : null;

        return {
          ...asset,
          profileName: profile?.displayName,
          profileSlug: profile?.slug,
          userName: user?.name || user?.email,
          userEmail: user?.email,
          userId: profile?.userId,
          boosted: boostedAssets.has(asset._id),
          boostCampaignId: boostedAssets.get(asset._id),
        };
      })
    );

    let filteredAssets = enrichedAssets;
    if (args.userId) {
      filteredAssets = enrichedAssets.filter((a) => a.userId === args.userId);
    }

    if (sortBy === "score") {
      filteredAssets.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } else if (sortBy === "viral") {
      filteredAssets.sort((a, b) => (b.viralScore ?? 0) - (a.viralScore ?? 0));
    } else {
      filteredAssets.sort((a, b) => b.createdAt - a.createdAt);
    }

    return filteredAssets.slice(0, limit);
  },
});

/**
 * Get asset summary stats for admin dashboard
 */
export const getAssetSummaryAdmin = query({
  args: {},
  async handler(ctx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!currentUser?.superadmin) throw new Error("Admin access required");

    const [clips, memes, gifs] = await Promise.all([
      ctx.db.query("generated_clips").collect(),
      ctx.db.query("generated_memes").collect(),
      ctx.db.query("generated_gifs").collect(),
    ]);

    const now = Date.now();
    const today = now - 24 * 60 * 60 * 1000;
    const thisWeek = now - 7 * 24 * 60 * 60 * 1000;
    const thisMonth = now - 30 * 24 * 60 * 60 * 1000;

    const clipsToday = clips.filter((c) => c.createdAt >= today).length;
    const memesToday = memes.filter((m) => m.createdAt >= today).length;
    const gifsToday = gifs.filter((g) => g.createdAt >= today).length;

    const clipsWeek = clips.filter((c) => c.createdAt >= thisWeek).length;
    const memesWeek = memes.filter((m) => m.createdAt >= thisWeek).length;
    const gifsWeek = gifs.filter((g) => g.createdAt >= thisWeek).length;

    const clipsMonth = clips.filter((c) => c.createdAt >= thisMonth).length;
    const memesMonth = memes.filter((m) => m.createdAt >= thisMonth).length;
    const gifsMonth = gifs.filter((g) => g.createdAt >= thisMonth).length;

    const profileIds = new Set([
      ...clips.map((c) => c.actorProfileId.toString()),
      ...memes.map((m) => m.actorProfileId.toString()),
      ...gifs.map((g) => g.actorProfileId.toString()),
    ]);

    const boostCampaigns = await ctx.db.query("boost_campaigns").collect();
    const activeBoostedAssets = boostCampaigns
      .filter((c) => c.status === "active" && c.assetId)
      .map((c) => c.assetId);

    const clipScores = clips.filter((c) => c.score).map((c) => c.score!);
    const memeScores = memes.filter((m) => m.viralScore).map((m) => m.viralScore!);
    const gifScores = gifs.filter((g) => g.viralScore).map((g) => g.viralScore!);

    const avgClipScore = clipScores.length > 0
      ? Math.round(clipScores.reduce((a, b) => a + b, 0) / clipScores.length)
      : 0;
    const avgMemeScore = memeScores.length > 0
      ? Math.round(memeScores.reduce((a, b) => a + b, 0) / memeScores.length)
      : 0;
    const avgGifScore = gifScores.length > 0
      ? Math.round(gifScores.reduce((a, b) => a + b, 0) / gifScores.length)
      : 0;

    return {
      totalClips: clips.length,
      totalMemes: memes.length,
      totalGifs: gifs.length,
      totalAssets: clips.length + memes.length + gifs.length,
      clipsToday, memesToday, gifsToday,
      assetsToday: clipsToday + memesToday + gifsToday,
      clipsWeek, memesWeek, gifsWeek,
      assetsWeek: clipsWeek + memesWeek + gifsWeek,
      clipsMonth, memesMonth, gifsMonth,
      assetsMonth: clipsMonth + memesMonth + gifsMonth,
      uniqueProfiles: profileIds.size,
      activeBoostedCount: activeBoostedAssets.length,
      avgClipScore, avgMemeScore, avgGifScore,
    };
  },
});

/**
 * Get all users for filtering dropdown (admin view)
 */
export const getAllUsersAdmin = query({
  args: {},
  async handler(ctx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!currentUser?.superadmin) throw new Error("Admin access required");

    const users = await ctx.db.query("users").collect();
    const profiles = await ctx.db.query("actor_profiles").collect();

    const profilesByUser = new Map<string, typeof profiles>();
    for (const profile of profiles) {
      const key = profile.userId.toString();
      if (!profilesByUser.has(key)) {
        profilesByUser.set(key, []);
      }
      profilesByUser.get(key)!.push(profile);
    }

    return users.map((user) => {
      const userProfiles = profilesByUser.get(user._id.toString()) || [];
      return {
        _id: user._id,
        name: user.name || user.email,
        email: user.email,
        profileCount: userProfiles.length,
        profiles: userProfiles.map((p) => ({
          _id: p._id,
          displayName: p.displayName,
          slug: p.slug,
        })),
      };
    });
  },
});

/**
 * Get comprehensive site-wide statistics for admin dashboard
 */
export const getSiteWideStatsAdmin = query({
  args: {},
  async handler(ctx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!currentUser?.superadmin) throw new Error("Admin access required");

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

    const usersToday = users.filter((u) => u._creationTime >= today).length;
    const usersThisWeek = users.filter((u) => u._creationTime >= thisWeek).length;
    const usersThisMonth = users.filter((u) => u._creationTime >= thisMonth).length;

    const profilesToday = profiles.filter((p) => p._creationTime >= today).length;
    const profilesThisWeek = profiles.filter((p) => p._creationTime >= thisWeek).length;
    const profilesThisMonth = profiles.filter((p) => p._creationTime >= thisMonth).length;

    const activeEmails = fanEmails.filter((e) => !e.unsubscribed);
    const unsubscribedEmails = fanEmails.filter((e) => e.unsubscribed);
    const fanEmailsToday = fanEmails.filter((e) => (e.createdAt ?? e._creationTime) >= today).length;
    const fanEmailsThisWeek = fanEmails.filter((e) => (e.createdAt ?? e._creationTime) >= thisWeek).length;
    const fanEmailsThisMonth = fanEmails.filter((e) => (e.createdAt ?? e._creationTime) >= thisMonth).length;

    const eventsToday = events.filter((e) => e._creationTime >= today).length;
    const eventsThisWeek = events.filter((e) => e._creationTime >= thisWeek).length;
    const eventsThisMonth = events.filter((e) => e._creationTime >= thisMonth).length;

    const activeUserIds = new Set<string>();
    for (const event of events) {
      if (event._creationTime >= thisMonth && event.actorProfileId) {
        const profile = profiles.find((p) => p._id === event.actorProfileId);
        if (profile) activeUserIds.add(profile.userId.toString());
      }
    }

    let totalOpened = 0, totalClicked = 0, totalSent = 0;
    for (const email of fanEmails) {
      if (email.emailsSentCount) totalSent += email.emailsSentCount;
      if (email.emailsOpenedCount) totalOpened += email.emailsOpenedCount;
      if (email.emailsClickedCount) totalClicked += email.emailsClickedCount;
    }

    const inquiriesToday = bookingInquiries.filter((b) => b.createdAt >= today).length;
    const inquiriesThisWeek = bookingInquiries.filter((b) => b.createdAt >= thisWeek).length;
    const inquiriesThisMonth = bookingInquiries.filter((b) => b.createdAt >= thisMonth).length;

    return {
      users: {
        total: users.length,
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
        unsubscribed: unsubscribedEmails.length,
        today: fanEmailsToday,
        thisWeek: fanEmailsThisWeek,
        thisMonth: fanEmailsThisMonth,
        engagement: {
          totalSent, totalOpened, totalClicked,
          openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
          clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
        },
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
        thisMonth: inquiriesThisMonth,
      },
    };
  },
});

/**
 * Get detailed fan email analytics for admin dashboard
 */
export const getFanEmailAnalyticsAdmin = query({
  args: {
    daysBack: v.optional(v.number()),
    profileId: v.optional(v.id("actor_profiles")),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!currentUser?.superadmin) throw new Error("Admin access required");

    const daysBack = args.daysBack ?? 30;
    const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    const fanEmails = args.profileId
      ? await ctx.db
          .query("fan_emails")
          .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.profileId!))
          .collect()
      : await ctx.db.query("fan_emails").collect();

    const profiles = await ctx.db.query("actor_profiles").collect();
    const profileMap = new Map(profiles.map((p) => [p._id.toString(), p]));

    const sourceBreakdown: Record<string, number> = {};
    for (const email of fanEmails) {
      const source = email.source ?? "unknown";
      sourceBreakdown[source] = (sourceBreakdown[source] ?? 0) + 1;
    }

    const byProfile: { profileId: string; profileName: string; slug: string; count: number; active: number; unsubscribed: number }[] = [];
    const profileCounts = new Map<string, { total: number; active: number; unsubscribed: number }>();

    for (const email of fanEmails) {
      const key = email.actorProfileId.toString();
      const current = profileCounts.get(key) ?? { total: 0, active: 0, unsubscribed: 0 };
      current.total++;
      if (email.unsubscribed) current.unsubscribed++;
      else current.active++;
      profileCounts.set(key, current);
    }

    for (const [profileId, counts] of profileCounts) {
      const profile = profileMap.get(profileId);
      if (profile) {
        byProfile.push({
          profileId,
          profileName: profile.displayName,
          slug: profile.slug,
          count: counts.total,
          active: counts.active,
          unsubscribed: counts.unsubscribed,
        });
      }
    }

    byProfile.sort((a, b) => b.count - a.count);

    const recentEmails = fanEmails.filter((e) => (e.createdAt ?? e._creationTime) >= cutoffTime);

    const dailyCounts: { date: string; count: number }[] = [];
    const dateMap = new Map<string, number>();

    for (const email of recentEmails) {
      const date = new Date(email.createdAt ?? email._creationTime).toISOString().split("T")[0];
      dateMap.set(date, (dateMap.get(date) ?? 0) + 1);
    }

    for (let i = 0; i < daysBack; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      dailyCounts.push({ date, count: dateMap.get(date) ?? 0 });
    }
    dailyCounts.reverse();

    return {
      period: `${daysBack} days`,
      totals: {
        total: fanEmails.length,
        active: fanEmails.filter((e) => !e.unsubscribed).length,
        unsubscribed: fanEmails.filter((e) => e.unsubscribed).length,
        recentSignups: recentEmails.length,
      },
      sourceBreakdown,
      byProfile: byProfile.slice(0, 20),
      dailyTrend: dailyCounts,
    };
  },
});

/**
 * Get event types breakdown for admin dashboard
 */
export const getEventTypesBreakdownAdmin = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!currentUser?.superadmin) throw new Error("Admin access required");

    const daysBack = args.daysBack ?? 30;
    const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    const events = await ctx.db.query("analytics_events").collect();
    const recentEvents = events.filter((e) => e._creationTime >= cutoffTime);

    const eventTypeCounts: Record<string, number> = {};
    for (const event of recentEvents) {
      eventTypeCounts[event.eventType] = (eventTypeCounts[event.eventType] ?? 0) + 1;
    }

    const breakdown = Object.entries(eventTypeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    return {
      period: `${daysBack} days`,
      total: recentEvents.length,
      breakdown,
    };
  },
});

/**
 * Get daily trends for charts
 */
export const getDailyTrendsAdmin = query({
  args: {
    daysBack: v.optional(v.number()),
    eventTypes: v.optional(v.array(v.string())),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!currentUser?.superadmin) throw new Error("Admin access required");

    const daysBack = args.daysBack ?? 30;
    const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    const eventTypes = args.eventTypes ?? ["page_view", "clip_played", "email_captured", "inquiry_submitted"];

    const events = await ctx.db.query("analytics_events").collect();
    const recentEvents = events.filter((e) => e._creationTime >= cutoffTime);

    type DailyData = { date: string; [key: string]: string | number };
    const dailyData: Map<string, DailyData> = new Map();

    for (let i = 0; i < daysBack; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const data: DailyData = { date };
      for (const type of eventTypes) data[type] = 0;
      dailyData.set(date, data);
    }

    for (const event of recentEvents) {
      const date = new Date(event._creationTime).toISOString().split("T")[0];
      const data = dailyData.get(date);
      if (data && eventTypes.includes(event.eventType)) {
        (data[event.eventType] as number)++;
      }
    }

    const trends = Array.from(dailyData.values()).sort((a, b) => a.date.localeCompare(b.date));

    return { period: `${daysBack} days`, eventTypes, trends };
  },
});

/**
 * Get user engagement levels (categorized by activity)
 */
export const getUserEngagementLevelsAdmin = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!currentUser?.superadmin) throw new Error("Admin access required");

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
      inquiries: number;
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
      const inquiries = profileEvents.filter((e) => e.eventType === "inquiry_submitted").length;
      const totalFanEmails = fanEmails.filter(
        (e) => e.actorProfileId.toString() === profile._id.toString()
      ).length;
      const projectCount = projects.filter(
        (p) => p.actorProfileId.toString() === profile._id.toString()
      ).length;

      const engagementScore =
        pageViews * 1 + clipPlays * 2 + emailCaptures * 5 + inquiries * 10 + totalFanEmails * 3;

      let engagementLevel: "high" | "medium" | "low" | "inactive";
      if (engagementScore >= 100) engagementLevel = "high";
      else if (engagementScore >= 20) engagementLevel = "medium";
      else if (engagementScore > 0) engagementLevel = "low";
      else engagementLevel = "inactive";

      profileEngagement.push({
        profileId: profile._id,
        displayName: profile.displayName,
        slug: profile.slug,
        pageViews, clipPlays, emailCaptures, inquiries,
        totalFanEmails, projectCount, engagementScore, engagementLevel,
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

/**
 * Get page-by-page analytics for each profile
 */
export const getPageByPageAnalyticsAdmin = query({
  args: {
    daysBack: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!currentUser?.superadmin) throw new Error("Admin access required");

    const daysBack = args.daysBack ?? 30;
    const limit = args.limit ?? 50;
    const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    const [profiles, events, fanEmails, projects, clips, users] = await Promise.all([
      ctx.db.query("actor_profiles").collect(),
      ctx.db.query("analytics_events").collect(),
      ctx.db.query("fan_emails").collect(),
      ctx.db.query("projects").collect(),
      ctx.db.query("clips").collect(),
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
      clipShares: number;
      emailCaptures: number;
      inquiries: number;
      socialClicks: number;
      totalFanEmails: number;
      activeFanEmails: number;
      projectCount: number;
      clipCount: number;
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
      const clipShares = profileEvents.filter((e) => e.eventType === "clip_shared").length;
      const emailCaptures = profileEvents.filter((e) => e.eventType === "email_captured").length;
      const inquiries = profileEvents.filter((e) => e.eventType === "inquiry_submitted").length;
      const socialClicks = profileEvents.filter((e) => e.eventType === "social_link_clicked").length;

      const profileFanEmails = fanEmails.filter(
        (e) => e.actorProfileId.toString() === profile._id.toString()
      );
      const totalFanEmails = profileFanEmails.length;
      const activeFanEmails = profileFanEmails.filter((e) => !e.unsubscribed).length;

      const projectCount = projects.filter(
        (p) => p.actorProfileId.toString() === profile._id.toString()
      ).length;
      const clipCount = clips.filter(
        (c) => c.actorProfileId.toString() === profile._id.toString()
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
        pageViews, uniqueVisitors, clipPlays, clipShares,
        emailCaptures, inquiries, socialClicks,
        totalFanEmails, activeFanEmails, projectCount, clipCount, conversionRate,
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
