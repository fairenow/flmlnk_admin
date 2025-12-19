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

// ============================================
// SOCIAL ACCOUNTS QUERIES
// ============================================

/**
 * Get all connected social accounts for a profile
 */
export const getSocialAccounts = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
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

    const accounts = await ctx.db
      .query("social_accounts")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();

    // Don't return encrypted tokens to frontend
    return accounts.map((account) => ({
      _id: account._id,
      provider: account.provider,
      providerUserId: account.providerUserId,
      username: account.username,
      displayName: account.displayName,
      profileImageUrl: account.profileImageUrl,
      followerCount: account.followerCount,
      status: account.status,
      lastError: account.lastError,
      scopes: account.scopes,
      autoPostEnabled: account.autoPostEnabled,
      connectedAt: account.connectedAt,
      lastUsedAt: account.lastUsedAt,
      tokenExpiresAt: account.tokenExpiresAt,
    }));
  },
});

/**
 * Get social pages for an account
 */
export const getSocialPages = query({
  args: {
    socialAccountId: v.id("social_accounts"),
  },
  async handler(ctx, { socialAccountId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const account = await ctx.db.get(socialAccountId);
    if (!account) {
      return [];
    }

    // Verify ownership
    const profile = await ctx.db.get(account.actorProfileId);
    if (!profile) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    if (!user || profile.userId !== user._id) {
      return [];
    }

    const pages = await ctx.db
      .query("social_pages")
      .withIndex("by_socialAccount", (q) => q.eq("socialAccountId", socialAccountId))
      .collect();

    // Don't return encrypted tokens
    return pages.map((page) => ({
      _id: page._id,
      pageId: page.pageId,
      pageType: page.pageType,
      name: page.name,
      username: page.username,
      profileImageUrl: page.profileImageUrl,
      followerCount: page.followerCount,
      category: page.category,
      isDefault: page.isDefault,
      status: page.status,
      connectedAt: page.connectedAt,
    }));
  },
});

/**
 * Get all connected accounts with their pages
 */
export const getConnectedPlatforms = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    const profile = await ctx.db.get(actorProfileId);
    if (!profile || !user || profile.userId !== user._id) {
      return [];
    }

    const accounts = await ctx.db
      .query("social_accounts")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();

    const result = await Promise.all(
      accounts.map(async (account) => {
        const pages = await ctx.db
          .query("social_pages")
          .withIndex("by_socialAccount", (q) => q.eq("socialAccountId", account._id))
          .collect();

        return {
          _id: account._id,
          provider: account.provider,
          username: account.username,
          displayName: account.displayName,
          profileImageUrl: account.profileImageUrl,
          status: account.status,
          scopes: account.scopes,
          autoPostEnabled: account.autoPostEnabled,
          connectedAt: account.connectedAt,
          tokenExpiresAt: account.tokenExpiresAt,
          pages: pages.map((p) => ({
            _id: p._id,
            pageId: p.pageId,
            pageType: p.pageType,
            name: p.name,
            username: p.username,
            profileImageUrl: p.profileImageUrl,
            isDefault: p.isDefault,
            status: p.status,
          })),
        };
      })
    );

    return result;
  },
});

// ============================================
// SOCIAL POSTS QUERIES
// ============================================

/**
 * Get all posts for a profile
 */
export const getPosts = query({
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

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    const profile = await ctx.db.get(actorProfileId);
    if (!profile || !user || profile.userId !== user._id) {
      return [];
    }

    let posts;
    if (status) {
      posts = await ctx.db
        .query("social_posts")
        .withIndex("by_actorProfile_status", (q) =>
          q.eq("actorProfileId", actorProfileId).eq("status", status)
        )
        .order("desc")
        .take(limit);
    } else {
      posts = await ctx.db
        .query("social_posts")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
        .order("desc")
        .take(limit);
    }

    return posts;
  },
});

/**
 * Get a single post by ID
 */
export const getPost = query({
  args: {
    postId: v.id("social_posts"),
  },
  async handler(ctx, { postId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const post = await ctx.db.get(postId);
    if (!post) {
      return null;
    }

    const profile = await ctx.db.get(post.actorProfileId);
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

    return post;
  },
});

/**
 * Get scheduled posts
 */
export const getScheduledPosts = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    const profile = await ctx.db.get(actorProfileId);
    if (!profile || !user || profile.userId !== user._id) {
      return [];
    }

    const posts = await ctx.db
      .query("social_posts")
      .withIndex("by_actorProfile_status", (q) =>
        q.eq("actorProfileId", actorProfileId).eq("status", "scheduled")
      )
      .order("asc")
      .collect();

    // Sort by scheduled time
    return posts.sort((a, b) => (a.scheduledAt || 0) - (b.scheduledAt || 0));
  },
});

/**
 * Get post candidates (AI-suggested posts)
 */
export const getPostCandidates = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  async handler(ctx, { actorProfileId, status = "pending", limit = 20 }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    const profile = await ctx.db.get(actorProfileId);
    if (!profile || !user || profile.userId !== user._id) {
      return [];
    }

    const candidates = await ctx.db
      .query("post_candidates")
      .withIndex("by_actorProfile_status", (q) =>
        q.eq("actorProfileId", actorProfileId).eq("status", status)
      )
      .order("desc")
      .take(limit);

    return candidates;
  },
});

// ============================================
// SOCIAL POSTS MUTATIONS
// ============================================

/**
 * Create a new social post draft
 */
export const createPost = mutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    caption: v.string(),
    hashtags: v.optional(v.array(v.string())),
    link: v.optional(v.string()),
    assetRefs: v.optional(
      v.array(
        v.object({
          type: v.string(),
          sourceTable: v.string(),
          sourceId: v.string(),
          r2Key: v.optional(v.string()),
          storageId: v.optional(v.string()),
          url: v.optional(v.string()),
          mimeType: v.optional(v.string()),
          duration: v.optional(v.number()),
          width: v.optional(v.number()),
          height: v.optional(v.number()),
        })
      )
    ),
    platforms: v.array(
      v.object({
        provider: v.string(),
        socialAccountId: v.optional(v.id("social_accounts")),
        socialPageId: v.optional(v.id("social_pages")),
        captionOverride: v.optional(v.string()),
        hashtagsOverride: v.optional(v.array(v.string())),
      })
    ),
    aiGenerated: v.optional(v.boolean()),
    generationTone: v.optional(v.string()),
    isSponsoredContent: v.optional(v.boolean()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

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

    const now = Date.now();

    const postId = await ctx.db.insert("social_posts", {
      userId: user._id,
      actorProfileId: args.actorProfileId,
      caption: args.caption,
      hashtags: args.hashtags,
      link: args.link,
      assetRefs: args.assetRefs,
      platforms: args.platforms,
      status: "draft",
      aiGenerated: args.aiGenerated,
      generationTone: args.generationTone,
      isSponsoredContent: args.isSponsoredContent,
      createdAt: now,
      updatedAt: now,
    });

    return { postId };
  },
});

/**
 * Update a social post draft
 */
export const updatePost = mutation({
  args: {
    postId: v.id("social_posts"),
    caption: v.optional(v.string()),
    hashtags: v.optional(v.array(v.string())),
    link: v.optional(v.string()),
    assetRefs: v.optional(
      v.array(
        v.object({
          type: v.string(),
          sourceTable: v.string(),
          sourceId: v.string(),
          r2Key: v.optional(v.string()),
          storageId: v.optional(v.string()),
          url: v.optional(v.string()),
          mimeType: v.optional(v.string()),
          duration: v.optional(v.number()),
          width: v.optional(v.number()),
          height: v.optional(v.number()),
        })
      )
    ),
    platforms: v.optional(
      v.array(
        v.object({
          provider: v.string(),
          socialAccountId: v.optional(v.id("social_accounts")),
          socialPageId: v.optional(v.id("social_pages")),
          captionOverride: v.optional(v.string()),
          hashtagsOverride: v.optional(v.array(v.string())),
        })
      )
    ),
    isSponsoredContent: v.optional(v.boolean()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found");
    }

    if (post.status !== "draft" && post.status !== "scheduled") {
      throw new Error("Can only edit draft or scheduled posts");
    }

    const profile = await ctx.db.get(post.actorProfileId);
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

    const updates: Partial<Doc<"social_posts">> = {
      updatedAt: Date.now(),
    };

    if (args.caption !== undefined) updates.caption = args.caption;
    if (args.hashtags !== undefined) updates.hashtags = args.hashtags;
    if (args.link !== undefined) updates.link = args.link;
    if (args.assetRefs !== undefined) updates.assetRefs = args.assetRefs;
    if (args.platforms !== undefined) updates.platforms = args.platforms;
    if (args.isSponsoredContent !== undefined) updates.isSponsoredContent = args.isSponsoredContent;

    await ctx.db.patch(args.postId, updates);

    return { success: true };
  },
});

/**
 * Schedule a post for future publishing
 */
export const schedulePost = mutation({
  args: {
    postId: v.id("social_posts"),
    scheduledAt: v.number(),
  },
  async handler(ctx, { postId, scheduledAt }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const post = await ctx.db.get(postId);
    if (!post) {
      throw new Error("Post not found");
    }

    if (post.status !== "draft" && post.status !== "scheduled") {
      throw new Error("Can only schedule draft or reschedule scheduled posts");
    }

    if (scheduledAt <= Date.now()) {
      throw new Error("Scheduled time must be in the future");
    }

    const profile = await ctx.db.get(post.actorProfileId);
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

    // Generate idempotency key for this scheduled post
    const idempotencyKey = `${postId}-${scheduledAt}`;

    await ctx.db.patch(postId, {
      status: "scheduled",
      scheduledAt,
      idempotencyKey,
      updatedAt: Date.now(),
    });

    // Schedule the post execution
    const delay = scheduledAt - Date.now();
    await ctx.scheduler.runAfter(delay, internal.socialPostingScheduler.executeScheduledPost, {
      postId,
      idempotencyKey,
    });

    return { success: true };
  },
});

/**
 * Queue post for immediate publishing
 */
export const queuePost = mutation({
  args: {
    postId: v.id("social_posts"),
  },
  async handler(ctx, { postId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const post = await ctx.db.get(postId);
    if (!post) {
      throw new Error("Post not found");
    }

    if (post.status !== "draft") {
      throw new Error("Can only queue draft posts");
    }

    const profile = await ctx.db.get(post.actorProfileId);
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

    const idempotencyKey = `${postId}-${Date.now()}`;

    await ctx.db.patch(postId, {
      status: "queued",
      idempotencyKey,
      updatedAt: Date.now(),
    });

    return { success: true, postId };
  },
});

/**
 * Cancel a scheduled post
 */
export const cancelScheduledPost = mutation({
  args: {
    postId: v.id("social_posts"),
  },
  async handler(ctx, { postId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const post = await ctx.db.get(postId);
    if (!post) {
      throw new Error("Post not found");
    }

    if (post.status !== "scheduled") {
      throw new Error("Can only cancel scheduled posts");
    }

    const profile = await ctx.db.get(post.actorProfileId);
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

    await ctx.db.patch(postId, {
      status: "draft",
      scheduledAt: undefined,
      idempotencyKey: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Delete a post (only drafts or failed posts)
 */
export const deletePost = mutation({
  args: {
    postId: v.id("social_posts"),
  },
  async handler(ctx, { postId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const post = await ctx.db.get(postId);
    if (!post) {
      throw new Error("Post not found");
    }

    if (post.status !== "draft" && post.status !== "failed") {
      throw new Error("Can only delete draft or failed posts");
    }

    const profile = await ctx.db.get(post.actorProfileId);
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

    await ctx.db.delete(postId);

    return { success: true };
  },
});

// ============================================
// SOCIAL ACCOUNT MANAGEMENT
// ============================================

/**
 * Disconnect a social account
 */
export const disconnectAccount = mutation({
  args: {
    socialAccountId: v.id("social_accounts"),
  },
  async handler(ctx, { socialAccountId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const account = await ctx.db.get(socialAccountId);
    if (!account) {
      throw new Error("Account not found");
    }

    const profile = await ctx.db.get(account.actorProfileId);
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

    // Delete associated pages
    const pages = await ctx.db
      .query("social_pages")
      .withIndex("by_socialAccount", (q) => q.eq("socialAccountId", socialAccountId))
      .collect();

    for (const page of pages) {
      await ctx.db.delete(page._id);
    }

    // Delete the account
    await ctx.db.delete(socialAccountId);

    return { success: true };
  },
});

/**
 * Toggle auto-post for an account
 */
export const toggleAutoPost = mutation({
  args: {
    socialAccountId: v.id("social_accounts"),
    enabled: v.boolean(),
  },
  async handler(ctx, { socialAccountId, enabled }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const account = await ctx.db.get(socialAccountId);
    if (!account) {
      throw new Error("Account not found");
    }

    const profile = await ctx.db.get(account.actorProfileId);
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

    await ctx.db.patch(socialAccountId, {
      autoPostEnabled: enabled,
    });

    return { success: true };
  },
});

/**
 * Set default page for a provider
 */
export const setDefaultPage = mutation({
  args: {
    socialPageId: v.id("social_pages"),
  },
  async handler(ctx, { socialPageId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const page = await ctx.db.get(socialPageId);
    if (!page) {
      throw new Error("Page not found");
    }

    const account = await ctx.db.get(page.socialAccountId);
    if (!account) {
      throw new Error("Account not found");
    }

    const profile = await ctx.db.get(account.actorProfileId);
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

    // Unset all other pages as default for this page type
    const samTypePages = await ctx.db
      .query("social_pages")
      .withIndex("by_actorProfile_pageType", (q) =>
        q.eq("actorProfileId", profile._id).eq("pageType", page.pageType)
      )
      .collect();

    for (const p of samTypePages) {
      if (p._id !== socialPageId && p.isDefault) {
        await ctx.db.patch(p._id, { isDefault: false });
      }
    }

    // Set this page as default
    await ctx.db.patch(socialPageId, { isDefault: true });

    return { success: true };
  },
});

// ============================================
// POST CANDIDATE MUTATIONS
// ============================================

/**
 * Approve a post candidate and create a draft post
 */
export const approveCandidate = mutation({
  args: {
    candidateId: v.id("post_candidates"),
    platforms: v.array(v.string()),
  },
  async handler(ctx, { candidateId, platforms }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const candidate = await ctx.db.get(candidateId);
    if (!candidate) {
      throw new Error("Candidate not found");
    }

    const profile = await ctx.db.get(candidate.actorProfileId);
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

    // Get connected accounts for the selected platforms
    const platformTargets = await Promise.all(
      platforms.map(async (provider) => {
        const account = await ctx.db
          .query("social_accounts")
          .withIndex("by_actorProfile_provider", (q) =>
            q.eq("actorProfileId", candidate.actorProfileId).eq("provider", provider)
          )
          .first();

        if (!account) {
          return null;
        }

        // Get default page if any
        const pageType =
          provider === "instagram"
            ? "instagram_business"
            : provider === "facebook"
              ? "facebook_page"
              : provider === "linkedin"
                ? "linkedin_page"
                : provider === "youtube"
                  ? "youtube_channel"
                  : null;

        let defaultPage = null;
        if (pageType) {
          defaultPage = await ctx.db
            .query("social_pages")
            .withIndex("by_actorProfile_pageType", (q) =>
              q.eq("actorProfileId", candidate.actorProfileId).eq("pageType", pageType)
            )
            .filter((q) => q.eq(q.field("isDefault"), true))
            .first();
        }

        return {
          provider,
          socialAccountId: account._id,
          socialPageId: defaultPage?._id,
        };
      })
    );

    const validPlatforms = platformTargets.filter(
      (p): p is NonNullable<typeof p> => p !== null
    );

    if (validPlatforms.length === 0) {
      throw new Error("No connected accounts for selected platforms");
    }

    const now = Date.now();

    // Create the post
    const postId = await ctx.db.insert("social_posts", {
      userId: user._id,
      actorProfileId: candidate.actorProfileId,
      caption: candidate.suggestedCaption,
      hashtags: candidate.suggestedHashtags,
      link: candidate.suggestedLink,
      assetRefs: [
        {
          type: candidate.assetType,
          sourceTable: candidate.assetSourceTable,
          sourceId: candidate.assetSourceId,
          url: candidate.assetThumbnailUrl,
          duration: candidate.assetDuration,
        },
      ],
      platforms: validPlatforms,
      status: "draft",
      aiGenerated: true,
      createdAt: now,
      updatedAt: now,
    });

    // Update candidate status
    await ctx.db.patch(candidateId, {
      status: "approved",
      usedInPostId: postId,
      reviewedAt: now,
    });

    return { postId };
  },
});

/**
 * Reject a post candidate
 */
export const rejectCandidate = mutation({
  args: {
    candidateId: v.id("post_candidates"),
  },
  async handler(ctx, { candidateId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const candidate = await ctx.db.get(candidateId);
    if (!candidate) {
      throw new Error("Candidate not found");
    }

    const profile = await ctx.db.get(candidate.actorProfileId);
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

    await ctx.db.patch(candidateId, {
      status: "rejected",
      reviewedAt: Date.now(),
    });

    return { success: true };
  },
});

// ============================================
// INTERNAL QUERIES & MUTATIONS
// ============================================

export const getPostById = internalQuery({
  args: {
    postId: v.id("social_posts"),
  },
  async handler(ctx, { postId }) {
    return ctx.db.get(postId);
  },
});

export const getSocialAccountById = internalQuery({
  args: {
    accountId: v.id("social_accounts"),
  },
  async handler(ctx, { accountId }) {
    return ctx.db.get(accountId);
  },
});

export const getSocialPageById = internalQuery({
  args: {
    pageId: v.id("social_pages"),
  },
  async handler(ctx, { pageId }) {
    return ctx.db.get(pageId);
  },
});

export const updatePostStatus = internalMutation({
  args: {
    postId: v.id("social_posts"),
    status: v.string(),
    platformResults: v.optional(
      v.array(
        v.object({
          provider: v.string(),
          pageId: v.optional(v.string()),
          success: v.boolean(),
          externalPostId: v.optional(v.string()),
          externalPostUrl: v.optional(v.string()),
          error: v.optional(v.string()),
          postedAt: v.optional(v.number()),
        })
      )
    ),
    error: v.optional(v.string()),
  },
  async handler(ctx, { postId, status, platformResults, error }) {
    const updates: Partial<Doc<"social_posts">> = {
      status,
      updatedAt: Date.now(),
    };

    if (platformResults) {
      updates.platformResults = platformResults;
    }

    if (status === "posting") {
      updates.postingStartedAt = Date.now();
    }

    if (status === "posted" || status === "partially_posted") {
      updates.postedAt = Date.now();
    }

    await ctx.db.patch(postId, updates);
  },
});

export const incrementRetryCount = internalMutation({
  args: {
    postId: v.id("social_posts"),
  },
  async handler(ctx, { postId }) {
    const post = await ctx.db.get(postId);
    if (!post) return;

    await ctx.db.patch(postId, {
      retryCount: (post.retryCount || 0) + 1,
      lastRetryAt: Date.now(),
    });
  },
});

export const getActiveAccountsForProvider = internalQuery({
  args: {
    actorProfileId: v.id("actor_profiles"),
    provider: v.string(),
  },
  async handler(ctx, { actorProfileId, provider }) {
    return ctx.db
      .query("social_accounts")
      .withIndex("by_actorProfile_provider", (q) =>
        q.eq("actorProfileId", actorProfileId).eq("provider", provider)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

// ============================================
// ASSET SELECTOR QUERIES
// ============================================

/**
 * Unified asset type for the asset selector
 */
type UnifiedAsset = {
  id: string;
  type: "image" | "clip" | "meme";
  sourceTable: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  url?: string;
  duration?: number;
  aspectRatio?: string;
  score?: number;
  createdAt: number;
  // For R2-based assets
  r2Key?: string;
  // For Convex storage assets
  storageId?: string;
  // Additional metadata
  mimeType?: string;
  width?: number;
  height?: number;
};

/**
 * Helper function to sanitize strings for JSON serialization.
 * Removes or replaces characters that could cause JSON parsing issues.
 */
function sanitizeString(str: string | undefined | null): string | undefined {
  if (!str) return undefined;
  // Replace null bytes and other control characters that can break JSON
  // Also handle malformed unicode escape sequences
  return str
    .replace(/\x00/g, "") // Remove null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove control characters except \t, \n, \r
    .replace(/\\x[0-9a-fA-F]{0,1}(?![0-9a-fA-F])/g, ""); // Fix malformed hex escapes
}

/**
 * Get all assets for the asset selector in the social posting composer.
 * Returns images, clips, and memes from all sources, unified into a common format.
 */
export const getAssetsForSelector = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    assetType: v.optional(v.union(v.literal("all"), v.literal("image"), v.literal("clip"), v.literal("meme"))),
    limit: v.optional(v.number()),
  },
  async handler(ctx, { actorProfileId, assetType = "all", limit = 50 }): Promise<UnifiedAsset[]> {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    const profile = await ctx.db.get(actorProfileId);
    if (!profile || !user || profile.userId !== user._id) {
      return [];
    }

    const assets: UnifiedAsset[] = [];

    // Fetch images from image_manager_assets
    if (assetType === "all" || assetType === "image") {
      const images = await ctx.db
        .query("image_manager_assets")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
        .order("desc")
        .take(limit);

      for (const img of images) {
        assets.push({
          id: img._id,
          type: "image",
          sourceTable: "image_manager_assets",
          title: sanitizeString(img.name) || "Untitled",
          description: sanitizeString(img.description),
          thumbnailUrl: img.url,
          url: img.url,
          aspectRatio: img.aspectRatio,
          createdAt: img.createdAt,
          storageId: img.storageId,
          mimeType: img.mimeType,
          width: img.width,
          height: img.height,
        });
      }
    }

    // Fetch generated clips (Modal-based)
    if (assetType === "all" || assetType === "clip") {
      const generatedClips = await ctx.db
        .query("generated_clips")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
        .order("desc")
        .take(limit);

      for (const clip of generatedClips) {
        // Use custom thumbnail if available, otherwise use generated thumbnail
        const thumbnailUrl = clip.customThumbnailUrl || clip.thumbnailUrl;
        assets.push({
          id: clip._id,
          type: "clip",
          sourceTable: "generated_clips",
          title: sanitizeString(clip.title) || "Untitled Clip",
          description: sanitizeString(clip.description),
          thumbnailUrl,
          url: clip.downloadUrl,
          duration: clip.duration,
          score: clip.score,
          createdAt: clip.createdAt,
          storageId: clip.storageId as string | undefined,
        });
      }

      // Fetch processing clips (R2-based)
      const processingClips = await ctx.db
        .query("processing_clips")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
        .order("desc")
        .take(limit);

      for (const clip of processingClips) {
        assets.push({
          id: clip._id,
          type: "clip",
          sourceTable: "processing_clips",
          title: sanitizeString(clip.title) || `Clip ${clip.clipIndex + 1}`,
          description: sanitizeString(clip.description),
          thumbnailUrl: undefined, // R2 URLs need to be generated via action
          duration: clip.duration,
          score: clip.score,
          createdAt: clip.createdAt,
          r2Key: clip.r2ClipKey,
        });
      }
    }

    // Fetch generated memes
    if (assetType === "all" || assetType === "meme") {
      const memes = await ctx.db
        .query("generated_memes")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
        .order("desc")
        .take(limit);

      for (const meme of memes) {
        const sanitizedCaption = sanitizeString(meme.caption) || "";
        assets.push({
          id: meme._id,
          type: "meme",
          sourceTable: "generated_memes",
          title: sanitizedCaption.slice(0, 50) + (sanitizedCaption.length > 50 ? "..." : ""),
          description: sanitizedCaption,
          thumbnailUrl: meme.memeUrl || meme.frameUrl,
          url: meme.memeUrl || meme.frameUrl,
          score: meme.viralScore,
          createdAt: meme.createdAt,
          storageId: meme.memeStorageId as string | undefined,
          r2Key: meme.r2MemeKey,
        });
      }
    }

    // Sort all assets by createdAt descending and apply limit
    assets.sort((a, b) => b.createdAt - a.createdAt);
    return assets.slice(0, limit);
  },
});
