import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Platform reference type for type safety
interface PlatformRef {
  provider: string;
  socialAccountId?: Id<"social_accounts">;
  socialPageId?: Id<"social_pages">;
  captionOverride?: string;
  hashtagsOverride?: string[];
}

// ============================================
// SCHEDULED POST EXECUTION
// ============================================

/**
 * Execute a scheduled post
 */
export const executeScheduledPost = internalAction({
  args: {
    postId: v.id("social_posts"),
    idempotencyKey: v.string(),
  },
  async handler(ctx, { postId, idempotencyKey }) {
    // Get the post
    const post = await ctx.runQuery(internal.socialPosting.getPostById, { postId });

    if (!post) {
      console.error(`Scheduled post ${postId} not found`);
      return;
    }

    // Check idempotency - prevent duplicate posts
    if (post.idempotencyKey !== idempotencyKey) {
      console.log(`Skipping post ${postId} - idempotency key mismatch (post was rescheduled)`);
      return;
    }

    // Check if post is still scheduled
    if (post.status !== "scheduled" && post.status !== "queued") {
      console.log(`Skipping post ${postId} - status is ${post.status}`);
      return;
    }

    // Update status to posting
    await ctx.runMutation(internal.socialPosting.updatePostStatus, {
      postId,
      status: "posting",
    });

    const platformResults: Array<{
      provider: string;
      pageId?: string;
      success: boolean;
      externalPostId?: string;
      externalPostUrl?: string;
      error?: string;
      postedAt?: number;
    }> = [];

    let successCount = 0;
    let failCount = 0;

    // Post to each platform
    for (const platform of post.platforms) {
      try {
        const result = await ctx.runAction(internal.socialPostingAdapters.postToProvider, {
          postId,
          provider: platform.provider,
          socialAccountId: platform.socialAccountId,
          socialPageId: platform.socialPageId,
          caption: platform.captionOverride || post.caption,
          hashtags: platform.hashtagsOverride || post.hashtags || [],
          link: post.link,
          assetRefs: post.assetRefs || [],
          isSponsoredContent: post.isSponsoredContent,
        });

        platformResults.push({
          provider: platform.provider,
          pageId: platform.socialPageId?.toString(),
          success: result.success,
          externalPostId: result.externalPostId,
          externalPostUrl: result.externalPostUrl,
          error: result.error,
          postedAt: result.success ? Date.now() : undefined,
        });

        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(`Error posting to ${platform.provider}:`, error);
        platformResults.push({
          provider: platform.provider,
          pageId: platform.socialPageId?.toString(),
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        failCount++;
      }
    }

    // Determine final status
    let finalStatus: string;
    if (successCount === post.platforms.length) {
      finalStatus = "posted";
    } else if (successCount > 0) {
      finalStatus = "partially_posted";
    } else {
      finalStatus = "failed";
    }

    // Update post with results
    await ctx.runMutation(internal.socialPosting.updatePostStatus, {
      postId,
      status: finalStatus,
      platformResults,
    });

    // Update last used timestamp for accounts
    for (const platform of post.platforms) {
      if (platform.socialAccountId) {
        await ctx.runMutation(internal.socialPostingScheduler.updateAccountLastUsed, {
          accountId: platform.socialAccountId,
        });
      }
    }

    console.log(`Post ${postId} completed: ${successCount} success, ${failCount} failed`);
  },
});

/**
 * Process queued posts (called by cron)
 */
export const processQueuedPosts = internalAction({
  args: {},
  async handler(ctx) {
    // Get all queued posts
    const queuedPosts = await ctx.runQuery(internal.socialPostingScheduler.getQueuedPosts, {});

    console.log(`Processing ${queuedPosts.length} queued posts`);

    for (const post of queuedPosts) {
      await ctx.runAction(internal.socialPostingScheduler.executeScheduledPost, {
        postId: post._id,
        idempotencyKey: post.idempotencyKey || `${post._id}-${Date.now()}`,
      });

      // Small delay between posts to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  },
});

/**
 * Check and execute due scheduled posts (called by cron)
 */
export const processScheduledPosts = internalAction({
  args: {},
  async handler(ctx) {
    const now = Date.now();

    // Get posts scheduled for now or earlier
    const duePosts = await ctx.runQuery(internal.socialPostingScheduler.getDueScheduledPosts, {
      beforeTimestamp: now,
    });

    console.log(`Processing ${duePosts.length} due scheduled posts`);

    for (const post of duePosts) {
      await ctx.runAction(internal.socialPostingScheduler.executeScheduledPost, {
        postId: post._id,
        idempotencyKey: post.idempotencyKey || `${post._id}-${post.scheduledAt}`,
      });

      // Small delay between posts
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  },
});

/**
 * Retry failed posts with exponential backoff
 */
export const retryFailedPosts = internalAction({
  args: {},
  async handler(ctx) {
    // Get recently failed posts that haven't exceeded retry limit
    const failedPosts = await ctx.runQuery(internal.socialPostingScheduler.getRetryablePosts, {});

    console.log(`Retrying ${failedPosts.length} failed posts`);

    for (const post of failedPosts) {
      const retryCount = post.retryCount || 0;

      // Max 3 retries
      if (retryCount >= 3) {
        continue;
      }

      // Exponential backoff: 1min, 5min, 15min
      const backoffMinutes = [1, 5, 15][retryCount];
      const lastRetryAt = post.lastRetryAt || post.createdAt;
      const nextRetryAt = lastRetryAt + backoffMinutes * 60 * 1000;

      if (Date.now() < nextRetryAt) {
        continue; // Not time to retry yet
      }

      // Increment retry count
      await ctx.runMutation(internal.socialPosting.incrementRetryCount, { postId: post._id });

      // Execute the post
      await ctx.runAction(internal.socialPostingScheduler.executeScheduledPost, {
        postId: post._id,
        idempotencyKey: `${post._id}-retry-${retryCount + 1}`,
      });

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  },
});

/**
 * Refresh expiring tokens proactively
 */
export const refreshExpiringTokens = internalAction({
  args: {},
  async handler(ctx) {
    // Get accounts with tokens expiring in the next hour
    const expiringAccounts = await ctx.runQuery(
      internal.socialPostingScheduler.getExpiringAccounts,
      {
        expiresBeforeTimestamp: Date.now() + 60 * 60 * 1000, // 1 hour
      }
    );

    console.log(`Refreshing tokens for ${expiringAccounts.length} accounts`);

    for (const account of expiringAccounts) {
      try {
        await ctx.runAction(internal.socialPostingOAuth.refreshAccountTokens, {
          accountId: account._id,
        });
        console.log(`Refreshed token for account ${account._id}`);
      } catch (error) {
        console.error(`Failed to refresh token for account ${account._id}:`, error);
      }

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  },
});

// ============================================
// INTERNAL QUERIES
// ============================================

export const getQueuedPosts = internalQuery({
  args: {},
  async handler(ctx) {
    return ctx.db
      .query("social_posts")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .take(50);
  },
});

export const getDueScheduledPosts = internalQuery({
  args: {
    beforeTimestamp: v.number(),
  },
  async handler(ctx, { beforeTimestamp }) {
    const scheduledPosts = await ctx.db
      .query("social_posts")
      .withIndex("by_status", (q) => q.eq("status", "scheduled"))
      .collect();

    return scheduledPosts.filter(
      (post) => post.scheduledAt && post.scheduledAt <= beforeTimestamp
    );
  },
});

export const getRetryablePosts = internalQuery({
  args: {},
  async handler(ctx) {
    const failedPosts = await ctx.db
      .query("social_posts")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .collect();

    // Filter to only posts that haven't exceeded retry limit
    // and were created in the last 24 hours
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    return failedPosts.filter(
      (post) =>
        (post.retryCount || 0) < 3 &&
        post.createdAt > oneDayAgo
    );
  },
});

export const getExpiringAccounts = internalQuery({
  args: {
    expiresBeforeTimestamp: v.number(),
  },
  async handler(ctx, { expiresBeforeTimestamp }) {
    const activeAccounts = await ctx.db
      .query("social_accounts")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    // Filter to accounts with refresh tokens that expire soon
    return activeAccounts.filter(
      (account) =>
        account.refreshTokenEncrypted &&
        account.tokenExpiresAt &&
        account.tokenExpiresAt < expiresBeforeTimestamp
    );
  },
});

// ============================================
// INTERNAL MUTATIONS
// ============================================

export const updateAccountLastUsed = internalMutation({
  args: {
    accountId: v.id("social_accounts"),
  },
  async handler(ctx, { accountId }) {
    await ctx.db.patch(accountId, {
      lastUsedAt: Date.now(),
    });
  },
});

// ============================================
// METRICS FETCHING
// ============================================

/**
 * Fetch metrics for posted content
 */
export const fetchPostMetrics = internalAction({
  args: {},
  async handler(ctx) {
    // Get posts from the last 7 days that have been posted
    const recentPosts = await ctx.runQuery(internal.socialPostingScheduler.getRecentPostedPosts, {
      afterTimestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
    });

    console.log(`Fetching metrics for ${recentPosts.length} posts`);

    for (const post of recentPosts) {
      if (!post.platformResults) continue;

      for (const result of post.platformResults) {
        if (!result.success || !result.externalPostId) continue;

        try {
          // Get the social account for this platform
          const platform = post.platforms.find((p: PlatformRef) => p.provider === result.provider);
          if (!platform?.socialAccountId) continue;

          const metrics = await ctx.runAction(internal.socialPostingAdapters.fetchMetrics, {
            provider: result.provider,
            socialAccountId: platform.socialAccountId,
            externalPostId: result.externalPostId,
          });

          if (metrics) {
            // Store or update metrics
            await ctx.runMutation(internal.socialPostingScheduler.upsertPostMetrics, {
              socialPostId: post._id,
              provider: result.provider,
              externalPostId: result.externalPostId,
              metrics,
            });
          }
        } catch (error) {
          console.error(`Failed to fetch metrics for ${result.provider}:`, error);
        }
      }

      // Rate limit
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  },
});

export const getRecentPostedPosts = internalQuery({
  args: {
    afterTimestamp: v.number(),
  },
  async handler(ctx, { afterTimestamp }) {
    const postedPosts = await ctx.db
      .query("social_posts")
      .withIndex("by_status", (q) => q.eq("status", "posted"))
      .collect();

    const partiallyPosted = await ctx.db
      .query("social_posts")
      .withIndex("by_status", (q) => q.eq("status", "partially_posted"))
      .collect();

    const allPosts = [...postedPosts, ...partiallyPosted];

    return allPosts.filter((post) => post.postedAt && post.postedAt > afterTimestamp);
  },
});

export const upsertPostMetrics = internalMutation({
  args: {
    socialPostId: v.id("social_posts"),
    provider: v.string(),
    externalPostId: v.string(),
    metrics: v.object({
      impressions: v.optional(v.number()),
      reach: v.optional(v.number()),
      likes: v.optional(v.number()),
      comments: v.optional(v.number()),
      shares: v.optional(v.number()),
      saves: v.optional(v.number()),
      clicks: v.optional(v.number()),
      videoViews: v.optional(v.number()),
      videoWatchTime: v.optional(v.number()),
      engagementRate: v.optional(v.number()),
    }),
  },
  async handler(ctx, { socialPostId, provider, externalPostId, metrics }) {
    // Check if metrics record exists
    const existing = await ctx.db
      .query("social_post_metrics")
      .withIndex("by_externalPostId", (q) =>
        q.eq("provider", provider).eq("externalPostId", externalPostId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...metrics,
        lastFetchedAt: Date.now(),
        fetchCount: (existing.fetchCount || 0) + 1,
      });
    } else {
      await ctx.db.insert("social_post_metrics", {
        socialPostId,
        provider,
        externalPostId,
        ...metrics,
        lastFetchedAt: Date.now(),
        fetchCount: 1,
      });
    }
  },
});
