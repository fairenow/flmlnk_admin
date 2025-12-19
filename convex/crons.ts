// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Take a daily usage snapshot once every 24 hours.
 * You can see these logs in the Convex dashboard under "Scheduler".
 */
crons.interval(
  "dailyUsageSnapshot",
  { hours: 24 },
  internal.usageMetrics.dailySnapshot,
  {},
);

/**
 * Aggregate daily analytics snapshots for each actor profile.
 * This runs every 24 hours and:
 * - If GA4 credentials are configured: imports from GA4 Data API
 * - Otherwise: aggregates events from Convex analytics_events table
 */
crons.interval(
  "dailyAnalyticsSnapshot",
  { hours: 24 },
  internal.analytics.importFromGA4,
  {},
);

/**
 * Clean up old clip generation jobs.
 * Runs daily and removes:
 * - Failed jobs older than 7 days
 * - Completed jobs older than 30 days (clips are kept)
 * - Stale pending jobs older than 24 hours
 */
crons.interval(
  "cleanupOldJobs",
  { hours: 24 },
  internal.clipGenerator.cleanupOldJobs,
  {},
);

/**
 * Clean up old transcription cache.
 * Runs weekly and removes transcriptions not used in 60 days.
 */
crons.interval(
  "cleanupOldTranscriptions",
  { hours: 168 }, // 7 days
  internal.clipGenerator.cleanupOldTranscriptions,
  {},
);

/**
 * Process scheduled email campaigns.
 * Runs every 5 minutes to check for campaigns due to be sent.
 */
crons.interval(
  "processScheduledCampaigns",
  { minutes: 5 },
  internal.campaignScheduler.processScheduledCampaigns,
  {},
);

/**
 * Seed campaign templates on startup.
 * Runs once per deployment to ensure templates exist.
 */
crons.interval(
  "seedCampaignTemplates",
  { hours: 24 },
  internal.campaignTemplates.seedSystemTemplates,
  {},
);

/**
 * Seed trailer profiles on startup.
 * Runs once per deployment to ensure built-in profiles exist.
 */
crons.interval(
  "seedTrailerProfiles",
  { hours: 24 },
  internal.trailerProfiles.seedBuiltInProfiles,
  {},
);

// ============================================
// SOCIAL MEDIA POSTING CRONS
// ============================================

/**
 * Process queued social media posts.
 * Runs every 2 minutes to publish queued posts immediately.
 */
crons.interval(
  "processQueuedSocialPosts",
  { minutes: 2 },
  internal.socialPostingScheduler.processQueuedPosts,
  {},
);

/**
 * Process scheduled social media posts.
 * Runs every 5 minutes to check for posts due to be published.
 */
crons.interval(
  "processScheduledSocialPosts",
  { minutes: 5 },
  internal.socialPostingScheduler.processScheduledPosts,
  {},
);

/**
 * Retry failed social media posts.
 * Runs every 15 minutes with exponential backoff logic.
 */
crons.interval(
  "retryFailedSocialPosts",
  { minutes: 15 },
  internal.socialPostingScheduler.retryFailedPosts,
  {},
);

/**
 * Refresh expiring social media tokens.
 * Runs every hour to proactively refresh tokens expiring soon.
 */
crons.interval(
  "refreshExpiringSocialTokens",
  { hours: 1 },
  internal.socialPostingScheduler.refreshExpiringTokens,
  {},
);

/**
 * Fetch social media post metrics.
 * Runs every 6 hours to update engagement metrics for recent posts.
 */
crons.interval(
  "fetchSocialPostMetrics",
  { hours: 6 },
  internal.socialPostingScheduler.fetchPostMetrics,
  {},
);

export default crons;
