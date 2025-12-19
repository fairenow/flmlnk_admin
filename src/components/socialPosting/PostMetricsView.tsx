"use client";

import { type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowLeft,
  Instagram,
  Facebook,
  Twitter,
  Youtube,
  Linkedin,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MousePointerClick,
  TrendingUp,
  BarChart3,
  Loader2,
  Calendar,
  ExternalLink,
} from "lucide-react";

interface PostMetricsViewProps {
  actorProfileId: Id<"actor_profiles">;
  onBack: () => void;
}

// Type for platform result
interface PlatformResult {
  provider: string;
  success: boolean;
  externalPostId?: string;
  externalPostUrl?: string;
}

// Type for social post from API
interface SocialPost {
  _id: Id<"social_posts">;
  caption: string;
  status: string;
  platforms: Array<{ provider: string }>;
  platformResults?: PlatformResult[];
  postedAt?: number;
}

// Platform icons
const platformIcons: Record<string, ReactNode> = {
  instagram: <Instagram className="h-5 w-5" />,
  facebook: <Facebook className="h-5 w-5" />,
  twitter: <Twitter className="h-5 w-5" />,
  tiktok: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  ),
  youtube: <Youtube className="h-5 w-5" />,
  linkedin: <Linkedin className="h-5 w-5" />,
};

export function PostMetricsView({ actorProfileId, onBack }: PostMetricsViewProps) {
  // Fetch all posts with their metrics
  const posts = useQuery(api.socialPosting.getPosts, { actorProfileId, limit: 100 });

  // Filter to only posted
  const postedPosts =
    (posts as SocialPost[] | undefined)?.filter((p: SocialPost) => p.status === "posted" || p.status === "partially_posted") || [];

  // Calculate aggregate metrics
  const totalMetrics = postedPosts.reduce(
    (acc: { posts: number; platforms: number }, post: SocialPost) => {
      const results = post.platformResults || [];
      acc.platforms += results.filter((r: PlatformResult) => r.success).length;
      acc.posts += 1;
      return acc;
    },
    { posts: 0, platforms: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Post Analytics
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Track engagement across all platforms
          </p>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={<BarChart3 className="h-5 w-5 text-red-500" />}
          label="Total Posts"
          value={totalMetrics.posts}
        />
        <MetricCard
          icon={<Share2 className="h-5 w-5 text-blue-500" />}
          label="Platform Posts"
          value={totalMetrics.platforms}
        />
        <MetricCard
          icon={<TrendingUp className="h-5 w-5 text-green-500" />}
          label="Avg. Engagement"
          value="-"
          subtext="Connect accounts for metrics"
        />
        <MetricCard
          icon={<Eye className="h-5 w-5 text-amber-500" />}
          label="Total Reach"
          value="-"
          subtext="Connect accounts for metrics"
        />
      </div>

      {/* Platform breakdown */}
      <div className="rounded-3xl border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-[#0f1219]">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Performance by Platform
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {["instagram", "facebook", "twitter", "tiktok", "youtube", "linkedin"].map(
            (platform) => {
              const platformPosts = postedPosts.filter((p: SocialPost) =>
                p.platformResults?.some((r: PlatformResult) => r.provider === platform && r.success)
              );
              return (
                <div
                  key={platform}
                  className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 text-center"
                >
                  <div className="flex justify-center mb-2 text-slate-400">
                    {platformIcons[platform]}
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {platformPosts.length}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                    {platform} posts
                  </p>
                </div>
              );
            }
          )}
        </div>
      </div>

      {/* Recent posts with metrics */}
      <div className="rounded-3xl border border-red-200 bg-white dark:border-red-900/50 dark:bg-[#0f1219] overflow-hidden">
        <div className="px-6 py-4 border-b border-red-100 dark:border-red-900/50">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Recent Posts
          </h3>
        </div>

        {!posts ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-red-500" />
          </div>
        ) : postedPosts.length === 0 ? (
          <div className="text-center py-12">
            <BarChart3 className="h-12 w-12 text-red-300 dark:text-red-800 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400">No published posts yet</p>
          </div>
        ) : (
          <div className="divide-y divide-red-100 dark:divide-purple-900/50">
            {postedPosts.slice(0, 20).map((post: SocialPost) => (
              <PostMetricRow key={post._id} post={post} />
            ))}
          </div>
        )}
      </div>

      {/* Note about metrics */}
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 dark:bg-blue-900/20 dark:border-blue-900/50">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          <strong>Note:</strong> Detailed engagement metrics (likes, comments, shares, impressions) are
          fetched periodically from each platform. Metrics may take a few hours to appear after posting.
        </p>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  subtext,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  subtext?: string;
}) {
  return (
    <div className="rounded-2xl border border-red-200 bg-white p-4 dark:border-red-900/50 dark:bg-[#0f1219]">
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <span className="text-slate-500 dark:text-slate-400 text-sm">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
      {subtext && <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtext}</div>}
    </div>
  );
}

function PostMetricRow({
  post,
}: {
  post: {
    _id: Id<"social_posts">;
    caption: string;
    platforms: Array<{ provider: string }>;
    platformResults?: Array<{
      provider: string;
      success: boolean;
      externalPostId?: string;
      externalPostUrl?: string;
    }>;
    postedAt?: number;
  };
}) {
  const successfulPlatforms = post.platformResults?.filter((r) => r.success) || [];

  return (
    <div className="px-6 py-4 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {successfulPlatforms.map((result, i) => (
              <span key={i} className="text-slate-400">
                {platformIcons[result.provider]}
              </span>
            ))}
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
            {post.caption}
          </p>
          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400">
            <Calendar className="h-3.5 w-3.5" />
            {post.postedAt && new Date(post.postedAt).toLocaleString()}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {successfulPlatforms.map(
            (result, i) =>
              result.externalPostUrl && (
                <a
                  key={i}
                  href={result.externalPostUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400 transition-colors"
                >
                  {platformIcons[result.provider]}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )
          )}
        </div>
      </div>
    </div>
  );
}
