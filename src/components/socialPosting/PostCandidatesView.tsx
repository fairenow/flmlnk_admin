"use client";

import { useState, type ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowLeft,
  Instagram,
  Facebook,
  Twitter,
  Youtube,
  Linkedin,
  Sparkles,
  Check,
  X,
  Video,
  Image as ImageIcon,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  Zap,
} from "lucide-react";

interface PostCandidatesViewProps {
  actorProfileId: Id<"actor_profiles">;
  onBack: () => void;
}

// Type for connected platform from API
interface ConnectedPlatform {
  provider: string;
}

// Type for post candidate from API
interface PostCandidate {
  _id: Id<"post_candidates">;
  assetType: string;
  assetTitle?: string;
  assetThumbnailUrl?: string;
  assetDuration?: number;
  suggestedCaption: string;
  suggestedHashtags: string[];
  platformFitness: {
    instagram?: number;
    facebook?: number;
    twitter?: number;
    tiktok?: number;
    youtube?: number;
    linkedin?: number;
  };
  contentTone?: string;
  contentCategory?: string;
  aiReasoning?: string;
  generatedAt: number;
}

// Platform icons
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

export function PostCandidatesView({ actorProfileId, onBack }: PostCandidatesViewProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, string[]>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Fetch candidates
  const candidates = useQuery(api.socialPosting.getPostCandidates, {
    actorProfileId,
    status: "pending",
    limit: 50,
  });

  // Fetch connected platforms
  const connectedPlatforms = useQuery(api.socialPosting.getConnectedPlatforms, { actorProfileId });

  // Mutations
  const approveCandidate = useMutation(api.socialPosting.approveCandidate);
  const rejectCandidate = useMutation(api.socialPosting.rejectCandidate);

  const handlePlatformToggle = (candidateId: string, platform: string) => {
    setSelectedPlatforms((prev) => {
      const current = prev[candidateId] || [];
      if (current.includes(platform)) {
        return {
          ...prev,
          [candidateId]: current.filter((p) => p !== platform),
        };
      }
      return {
        ...prev,
        [candidateId]: [...current, platform],
      };
    });
  };

  const handleApprove = async (candidateId: Id<"post_candidates">) => {
    const platforms = selectedPlatforms[candidateId] || [];
    if (platforms.length === 0) {
      alert("Please select at least one platform");
      return;
    }

    setProcessingId(candidateId);
    try {
      await approveCandidate({ candidateId, platforms });
    } catch (error) {
      console.error("Error approving candidate:", error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (candidateId: Id<"post_candidates">) => {
    setProcessingId(candidateId);
    try {
      await rejectCandidate({ candidateId });
    } catch (error) {
      console.error("Error rejecting candidate:", error);
    } finally {
      setProcessingId(null);
    }
  };

  // Get connected platform providers
  const availablePlatforms = (connectedPlatforms as ConnectedPlatform[] | undefined)?.map((p: ConnectedPlatform) => p.provider) || [];

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
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-red-500" />
            AI-Suggested Posts
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Review and approve AI-generated post suggestions
          </p>
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-xl bg-red-50 border border-red-200 p-4 dark:bg-red-900/20 dark:border-red-900/50">
        <div className="flex items-start gap-3">
          <Zap className="h-5 w-5 text-red-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              Smart Content Suggestions
            </p>
            <p className="text-sm text-red-600 dark:text-red-400/80 mt-1">
              These posts were automatically generated from your clips, images, and memes.
              Review the content, select target platforms, and approve to create a draft.
            </p>
          </div>
        </div>
      </div>

      {/* Candidates list */}
      {!candidates ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-red-500" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-3xl border border-red-200 bg-white p-12 text-center dark:border-red-900/50 dark:bg-[#0f1219]">
          <Sparkles className="h-12 w-12 text-red-300 dark:text-red-800 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            No Suggestions Yet
          </h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            AI suggestions are generated automatically from your clips and images.
            Upload more content to get personalized post suggestions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(candidates as PostCandidate[]).map((candidate: PostCandidate) => (
            <CandidateCard
              key={candidate._id}
              candidate={candidate}
              availablePlatforms={availablePlatforms}
              selectedPlatforms={selectedPlatforms[candidate._id] || []}
              onPlatformToggle={(platform) => handlePlatformToggle(candidate._id, platform)}
              onApprove={() => handleApprove(candidate._id)}
              onReject={() => handleReject(candidate._id)}
              isProcessing={processingId === candidate._id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  availablePlatforms,
  selectedPlatforms,
  onPlatformToggle,
  onApprove,
  onReject,
  isProcessing,
}: {
  candidate: {
    _id: Id<"post_candidates">;
    assetType: string;
    assetTitle?: string;
    assetThumbnailUrl?: string;
    assetDuration?: number;
    suggestedCaption: string;
    suggestedHashtags: string[];
    platformFitness: {
      instagram?: number;
      facebook?: number;
      twitter?: number;
      tiktok?: number;
      youtube?: number;
      linkedin?: number;
    };
    contentTone?: string;
    contentCategory?: string;
    aiReasoning?: string;
    generatedAt: number;
  };
  availablePlatforms: string[];
  selectedPlatforms: string[];
  onPlatformToggle: (platform: string) => void;
  onApprove: () => void;
  onReject: () => void;
  isProcessing: boolean;
}) {
  // Sort platforms by fitness score
  const sortedPlatforms = Object.entries(candidate.platformFitness)
    .filter(([platform]) => availablePlatforms.includes(platform))
    .sort(([, a], [, b]) => (b || 0) - (a || 0));

  const getScoreColor = (score: number | undefined) => {
    if (!score) return "text-slate-400";
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-amber-500";
    return "text-red-500";
  };

  return (
    <div className="rounded-2xl border border-red-200 bg-white overflow-hidden dark:border-red-900/50 dark:bg-[#0f1219]">
      {/* Asset preview */}
      <div className="aspect-video bg-slate-100 dark:bg-slate-800 relative">
        {candidate.assetThumbnailUrl ? (
          <img
            src={candidate.assetThumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {candidate.assetType === "clip" || candidate.assetType === "video" ? (
              <Video className="h-12 w-12 text-slate-400" />
            ) : (
              <ImageIcon className="h-12 w-12 text-slate-400" />
            )}
          </div>
        )}
        {/* Asset type badge */}
        <div className="absolute top-3 left-3">
          <span className="px-2 py-1 rounded-full text-xs bg-black/50 text-white capitalize">
            {candidate.assetType}
            {candidate.assetDuration && ` • ${Math.round(candidate.assetDuration)}s`}
          </span>
        </div>
        {/* Tone badge */}
        {candidate.contentTone && (
          <div className="absolute top-3 right-3">
            <span className="px-2 py-1 rounded-full text-xs bg-red-500 text-white capitalize">
              {candidate.contentTone}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Caption preview */}
        <div>
          <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-3">
            {candidate.suggestedCaption}
          </p>
          {candidate.suggestedHashtags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {candidate.suggestedHashtags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="text-xs text-red-600 dark:text-red-400"
                >
                  #{tag}
                </span>
              ))}
              {candidate.suggestedHashtags.length > 5 && (
                <span className="text-xs text-slate-400">
                  +{candidate.suggestedHashtags.length - 5} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* AI reasoning */}
        {candidate.aiReasoning && (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 italic">
              &quot;{candidate.aiReasoning}&quot;
            </p>
          </div>
        )}

        {/* Platform fitness & selection */}
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Platform Fitness & Selection
          </p>
          <div className="flex flex-wrap gap-2">
            {sortedPlatforms.map(([platform, score]) => (
              <button
                key={platform}
                onClick={() => onPlatformToggle(platform)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all ${
                  selectedPlatforms.includes(platform)
                    ? "bg-red-600 text-white"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {platformIcons[platform]}
                <span className="capitalize">{platform}</span>
                <span className={`text-xs ${selectedPlatforms.includes(platform) ? "text-red-200" : getScoreColor(score)}`}>
                  {score || 0}%
                </span>
              </button>
            ))}
          </div>
          {availablePlatforms.length === 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Connect accounts to post to platforms
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onApprove}
            disabled={isProcessing || selectedPlatforms.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ThumbsUp className="h-4 w-4" />
            )}
            Approve
          </button>
          <button
            onClick={onReject}
            disabled={isProcessing}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400 font-medium disabled:opacity-50 transition-colors"
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </div>

        {/* Timestamp */}
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
          Generated {new Date(candidate.generatedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
