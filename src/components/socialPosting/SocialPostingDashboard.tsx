"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Share2,
  Plus,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Users,
  Sparkles,
  Calendar,
  Loader2,
  FileText,
  Instagram,
  Facebook,
  Twitter,
  Youtube,
  Linkedin,
  Link as LinkIcon,
  BarChart3,
  Settings,
  Image as ImageIcon,
  Video,
  Zap,
} from "lucide-react";
import { PostComposer } from "./PostComposer";
import { AccountConnectionManager } from "./AccountConnectionManager";
import { PostMetricsView } from "./PostMetricsView";
import { PostCandidatesView } from "./PostCandidatesView";

interface SocialPostingDashboardProps {
  actorProfileId: Id<"actor_profiles">;
}

type ViewMode = "list" | "compose" | "accounts" | "metrics" | "candidates";

// Type for social account
interface SocialAccount {
  _id: Id<"social_accounts">;
  provider: string;
  displayName?: string;
  username?: string;
  profileImageUrl?: string;
  status: string;
}

// Type for social post
interface SocialPost {
  _id: Id<"social_posts">;
  caption: string;
  status: string;
  platforms: Array<{ provider: string }>;
  platformResults?: Array<{
    provider: string;
    success: boolean;
    externalPostUrl?: string;
  }>;
  scheduledAt?: number;
  postedAt?: number;
  createdAt?: number;
}

// Type for post candidate
interface PostCandidatePreview {
  _id: Id<"post_candidates">;
  assetType: string;
  assetThumbnailUrl?: string;
  suggestedCaption: string;
  status: string;
  platformFitness?: {
    instagram?: number;
    facebook?: number;
    twitter?: number;
    tiktok?: number;
    youtube?: number;
    linkedin?: number;
  };
}

// Platform icons mapping
const platformIcons: Record<string, ReactNode> = {
  instagram: <Instagram className="h-4 w-4" />,
  facebook: <Facebook className="h-4 w-4" />,
  twitter: <Twitter className="h-4 w-4" />,
  tiktok: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  ),
  youtube: <Youtube className="h-4 w-4" />,
  linkedin: <Linkedin className="h-4 w-4" />,
};

export function SocialPostingDashboard({ actorProfileId }: SocialPostingDashboardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedPostId, setSelectedPostId] = useState<Id<"social_posts"> | null>(null);

  // Fetch data
  const connectedPlatforms = useQuery(api.socialPosting.getConnectedPlatforms, { actorProfileId });
  const posts = useQuery(api.socialPosting.getPosts, { actorProfileId });
  const scheduledPosts = useQuery(api.socialPosting.getScheduledPosts, { actorProfileId });
  const candidates = useQuery(api.socialPosting.getPostCandidates, { actorProfileId });

  const handleNewPost = () => {
    setSelectedPostId(null);
    setViewMode("compose");
  };

  const handleEditPost = (postId: Id<"social_posts">) => {
    setSelectedPostId(postId);
    setViewMode("compose");
  };

  const handleViewMetrics = () => {
    setViewMode("metrics");
  };

  const handleBack = () => {
    setViewMode("list");
    setSelectedPostId(null);
  };

  // Calculate stats
  const totalConnected = connectedPlatforms?.length || 0;
  const totalPosted = (posts as SocialPost[] | undefined)?.filter((p: SocialPost) => p.status === "posted" || p.status === "partially_posted").length || 0;
  const totalScheduled = scheduledPosts?.length || 0;
  const totalDrafts = (posts as SocialPost[] | undefined)?.filter((p: SocialPost) => p.status === "draft").length || 0;
  const totalCandidates = candidates?.length || 0;

  if (viewMode === "compose") {
    return (
      <PostComposer
        actorProfileId={actorProfileId}
        postId={selectedPostId}
        onBack={handleBack}
      />
    );
  }

  if (viewMode === "accounts") {
    return (
      <AccountConnectionManager
        actorProfileId={actorProfileId}
        onBack={handleBack}
      />
    );
  }

  if (viewMode === "metrics") {
    return (
      <PostMetricsView
        actorProfileId={actorProfileId}
        onBack={handleBack}
      />
    );
  }

  if (viewMode === "candidates") {
    return (
      <PostCandidatesView
        actorProfileId={actorProfileId}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-carpet-red-800 via-carpet-red-600 to-red-500 p-4 sm:p-6 text-white shadow-lg shadow-red-950/40 ring-1 ring-red-300/30">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.25em] text-red-100">Social Media</p>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Cross-Platform Posting</h2>
            <p className="mt-1 text-sm text-red-100/90">
              Create, schedule, and publish to multiple platforms with AI-powered content
            </p>
          </div>
          <div className="flex gap-3 flex-shrink-0 flex-wrap">
            <button
              onClick={() => setViewMode("accounts")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
            >
              <Settings className="h-4 w-4" />
              Accounts ({totalConnected})
            </button>
            <button
              onClick={handleNewPost}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-red-600 font-medium hover:bg-red-50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Post
            </button>
          </div>
        </div>
      </div>

      {/* Connected Platforms Preview */}
      {connectedPlatforms && connectedPlatforms.length > 0 && (
        <div className="flex items-center gap-4 px-2">
          <span className="text-sm text-slate-500 dark:text-slate-400">Connected:</span>
          <div className="flex items-center gap-2">
            {(connectedPlatforms as SocialAccount[]).map((account: SocialAccount) => (
              <div
                key={account._id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                  account.status === "active"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                }`}
              >
                {platformIcons[account.provider]}
                <span className="hidden sm:inline">{account.displayName || account.username}</span>
                {account.status !== "active" && (
                  <span className="text-xs">({account.status})</span>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => setViewMode("accounts")}
            className="text-sm text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
          >
            + Add more
          </button>
        </div>
      )}

      {/* No accounts connected prompt */}
      {connectedPlatforms && connectedPlatforms.length === 0 && (
        <div className="rounded-3xl border-2 border-dashed border-red-300 bg-red-50 p-8 text-center dark:border-purple-800 dark:bg-red-900/20">
          <Share2 className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Connect Your Social Accounts
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4 max-w-md mx-auto">
            Link your Instagram, Facebook, TikTok, X, YouTube, and LinkedIn accounts to start posting.
          </p>
          <button
            onClick={() => setViewMode("accounts")}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-medium shadow-md shadow-red-950/30 transition-colors"
          >
            <LinkIcon className="h-4 w-4" />
            Connect Accounts
          </button>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          icon={<LinkIcon className="h-5 w-5 text-blue-500" />}
          label="Connected"
          value={totalConnected}
          subtext="platforms"
        />
        <StatCard
          icon={<Send className="h-5 w-5 text-green-500" />}
          label="Published"
          value={totalPosted}
          subtext="posts"
        />
        <StatCard
          icon={<Clock className="h-5 w-5 text-red-500" />}
          label="Scheduled"
          value={totalScheduled}
          subtext="upcoming"
        />
        <StatCard
          icon={<FileText className="h-5 w-5 text-amber-500" />}
          label="Drafts"
          value={totalDrafts}
          subtext="in progress"
        />
        <StatCard
          icon={<Sparkles className="h-5 w-5 text-pink-500" />}
          label="AI Suggested"
          value={totalCandidates}
          subtext="ready to review"
          onClick={() => setViewMode("candidates")}
          clickable
        />
      </div>

      {/* AI Suggestions Quick Access */}
      {candidates && candidates.length > 0 && (
        <div className="rounded-3xl border border-red-300 bg-white p-6 shadow-lg shadow-red-200/50 dark:border-red-900/50 dark:bg-[#0f1219] dark:shadow-red-950/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-red-500" />
              AI-Suggested Posts
            </h3>
            <button
              onClick={() => setViewMode("candidates")}
              className="text-sm text-red-600 hover:text-red-500 dark:text-red-400"
            >
              View all ({candidates.length})
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(candidates as PostCandidatePreview[]).slice(0, 3).map((candidate: PostCandidatePreview) => (
              <CandidateCard
                key={candidate._id}
                candidate={candidate}
                onClick={() => setViewMode("candidates")}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Scheduled Posts */}
      {scheduledPosts && scheduledPosts.length > 0 && (
        <div className="rounded-3xl border border-red-300 bg-white p-6 shadow-lg shadow-red-200/50 dark:border-red-900/50 dark:bg-[#0f1219] dark:shadow-red-950/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="h-5 w-5 text-red-500" />
              Upcoming Posts
            </h3>
          </div>
          <div className="space-y-3">
            {(scheduledPosts as SocialPost[]).slice(0, 3).map((post: SocialPost) => (
              <ScheduledPostCard
                key={post._id}
                post={post}
                onEdit={() => handleEditPost(post._id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Post List */}
      <div className="rounded-3xl border border-red-300 bg-white shadow-lg shadow-red-200/50 dark:border-red-900/50 dark:bg-[#0f1219] dark:shadow-red-950/30 overflow-hidden">
        <div className="px-6 py-4 border-b border-red-200 dark:border-red-900/50 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">All Posts</h3>
          <button
            onClick={handleViewMetrics}
            className="flex items-center gap-2 text-sm text-red-600 hover:text-red-500 dark:text-red-400"
          >
            <BarChart3 className="h-4 w-4" />
            View Analytics
          </button>
        </div>

        {!posts ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-red-500" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12">
            <Share2 className="h-12 w-12 text-purple-300 dark:text-red-800 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 mb-4">No posts yet</p>
            <button
              onClick={handleNewPost}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white font-medium shadow-md shadow-red-950/30 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Your First Post
            </button>
          </div>
        ) : (
          <div className="divide-y divide-red-100 dark:divide-red-900/50">
            {(posts as SocialPost[]).map((post: SocialPost) => (
              <PostRow
                key={post._id}
                post={post}
                onEdit={() => handleEditPost(post._id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtext,
  onClick,
  clickable,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  subtext?: string;
  onClick?: () => void;
  clickable?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <span className="text-slate-500 dark:text-slate-400 text-sm">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
      {subtext && <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtext}</div>}
    </>
  );

  if (clickable && onClick) {
    return (
      <button
        onClick={onClick}
        className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219] text-left hover:border-red-400 dark:hover:border-red-700 transition-colors"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
      {content}
    </div>
  );
}

function CandidateCard({
  candidate,
  onClick,
}: {
  candidate: {
    _id: Id<"post_candidates">;
    assetType: string;
    assetThumbnailUrl?: string;
    suggestedCaption: string;
    platformFitness: {
      instagram?: number;
      facebook?: number;
      twitter?: number;
      tiktok?: number;
    };
  };
  onClick: () => void;
}) {
  const topPlatforms = Object.entries(candidate.platformFitness)
    .filter(([, score]) => score !== undefined && score >= 70)
    .sort(([, a], [, b]) => (b || 0) - (a || 0))
    .slice(0, 3);

  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 hover:border-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:border-red-900/50 dark:hover:border-red-700 transition-all group"
    >
      <div className="flex items-start gap-3">
        {candidate.assetThumbnailUrl ? (
          <img
            src={candidate.assetThumbnailUrl}
            alt=""
            className="w-16 h-16 rounded-lg object-cover"
          />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-red-200 dark:bg-red-800 flex items-center justify-center">
            {candidate.assetType === "clip" ? (
              <Video className="h-6 w-6 text-red-500" />
            ) : (
              <ImageIcon className="h-6 w-6 text-red-500" />
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
            {candidate.suggestedCaption}
          </p>
          <div className="flex items-center gap-1 mt-2">
            {topPlatforms.map(([platform]) => (
              <span key={platform} className="text-red-500">
                {platformIcons[platform]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

function ScheduledPostCard({
  post,
  onEdit,
}: {
  post: {
    _id: Id<"social_posts">;
    caption: string;
    platforms: Array<{ provider: string }>;
    scheduledAt?: number;
  };
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-1">
          {post.platforms.map((p, i) => (
            <span key={i} className="text-red-500">
              {platformIcons[p.provider]}
            </span>
          ))}
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
          {post.caption}
        </p>
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {post.scheduledAt && new Date(post.scheduledAt).toLocaleString()}
        </div>
        <button
          onClick={onEdit}
          className="px-3 py-1.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-sm shadow-sm transition-colors"
        >
          Edit
        </button>
      </div>
    </div>
  );
}

function PostRow({
  post,
  onEdit,
}: {
  post: {
    _id: Id<"social_posts">;
    caption: string;
    status: string;
    platforms: Array<{ provider: string }>;
    platformResults?: Array<{
      provider: string;
      success: boolean;
      externalPostUrl?: string;
    }>;
    createdAt: number;
    postedAt?: number;
    scheduledAt?: number;
  };
  onEdit: () => void;
}) {
  const getStatusIcon = () => {
    switch (post.status) {
      case "draft":
        return <FileText className="h-4 w-4 text-slate-400" />;
      case "queued":
        return <Zap className="h-4 w-4 text-amber-400" />;
      case "scheduled":
        return <Clock className="h-4 w-4 text-red-400" />;
      case "posting":
        return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
      case "posted":
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case "partially_posted":
        return <CheckCircle className="h-4 w-4 text-amber-400" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-400" />;
      default:
        return <Share2 className="h-4 w-4 text-slate-400" />;
    }
  };

  const getStatusLabel = () => {
    switch (post.status) {
      case "draft":
        return "Draft";
      case "queued":
        return "Queued";
      case "scheduled":
        return `Scheduled for ${new Date(post.scheduledAt!).toLocaleString()}`;
      case "posting":
        return "Publishing...";
      case "posted":
        return `Posted ${new Date(post.postedAt!).toLocaleDateString()}`;
      case "partially_posted":
        return "Partially posted";
      case "failed":
        return "Failed";
      default:
        return post.status;
    }
  };

  const successfulPlatforms = post.platformResults?.filter((r) => r.success) || [];

  return (
    <div className="px-6 py-4 hover:bg-red-50 dark:hover:bg-purple-900/20 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div className="flex items-center gap-2">
              {post.platforms.map((p, i) => (
                <span key={i} className="text-slate-400">
                  {platformIcons[p.provider]}
                </span>
              ))}
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
              {post.caption}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 ml-4">
          {/* Links to external posts */}
          {successfulPlatforms.length > 0 && (
            <div className="hidden md:flex items-center gap-2">
              {successfulPlatforms.map((result, i) => (
                result.externalPostUrl && (
                  <a
                    key={i}
                    href={result.externalPostUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-500 hover:text-red-400"
                    title={`View on ${result.provider}`}
                  >
                    {platformIcons[result.provider]}
                  </a>
                )
              ))}
            </div>
          )}

          <div className="text-sm text-slate-500 dark:text-slate-400">{getStatusLabel()}</div>

          <button
            onClick={onEdit}
            className="px-3 py-1.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-sm shadow-sm shadow-red-950/30 transition-colors"
          >
            {post.status === "draft" || post.status === "scheduled" ? "Edit" : "View"}
          </button>
        </div>
      </div>
    </div>
  );
}
