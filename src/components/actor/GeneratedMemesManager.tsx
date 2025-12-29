"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Trash2,
  Download,
  TrendingUp,
  Loader2,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Heart,
  Sparkles,
  Copy,
  Check,
  Hash,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { MemeGeneratorModal } from "./MemeGeneratorModal";
import { JobCard } from "./JobCard";
import { AssetDetailView, type MemeAsset, type FilterOption } from "./AssetDetailView";
import { FilterDropdown } from "./FilterDropdown";

type GeneratedMeme = {
  _id: Id<"generated_memes">;
  jobId: Id<"meme_generation_jobs">;
  templateType: string;
  templateName?: string;
  caption: string;
  captionPosition?: string;
  viralScore?: number;
  sentiment?: string;
  suggestedHashtags?: string[];
  aiReasoning?: string;
  memeUrl?: string;
  frameUrl?: string;
  memeStorageId?: string;
  r2MemeKey?: string;
  r2FrameKey?: string;
  frames?: Array<{
    timestamp: number;
    url?: string;
    emotion?: string;
    action?: string;
  }>;
  isPublic?: boolean;
  isFavorite?: boolean;
  createdAt: number;
};

// Type for meme with signed URLs from R2
type MemeWithSignedUrls = GeneratedMeme & {
  signedMemeUrl: string | null;
  signedFrameUrl: string | null;
  urlExpiresAt: number | null;
};

// Unified Job type for memes
type UnifiedMemeJob = {
  id: string;
  title: string;
  sourceUrl?: string;
  status: string;
  assetCount: number;
  publicCount: number;
  createdAt: number;
  completedAt?: number;
  previewThumbnails: string[];
  topAssetThumbnail?: string;
  topAssetScore?: number;
  averageScore: number;
  memes: MemeWithSignedUrls[];
};

type GeneratedMemesManagerProps = {
  slug: string;
  onMemesChange?: () => void;
};

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Viral";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Low";
}

function getSentimentColor(sentiment: string): string {
  switch (sentiment?.toLowerCase()) {
    case "funny":
      return "bg-amber-500/20 text-amber-300 ring-amber-500/30";
    case "relatable":
      return "bg-blue-500/20 text-blue-300 ring-blue-500/30";
    case "absurd":
      return "bg-purple-500/20 text-purple-300 ring-purple-500/30";
    case "wholesome":
      return "bg-pink-500/20 text-pink-300 ring-pink-500/30";
    case "sarcastic":
      return "bg-orange-500/20 text-orange-300 ring-orange-500/30";
    default:
      return "bg-slate-500/20 text-slate-300 ring-slate-500/30";
  }
}

export function GeneratedMemesManager({
  slug,
  onMemesChange,
}: GeneratedMemesManagerProps) {
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);
  const [deletingMemeId, setDeletingMemeId] = useState<Id<"generated_memes"> | null>(null);
  const [togglingVisibilityId, setTogglingVisibilityId] = useState<Id<"generated_memes"> | null>(null);
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<Id<"generated_memes"> | null>(null);
  const [cancellingJobId, setCancellingJobId] = useState<Id<"meme_generation_jobs"> | null>(null);

  // Filter state
  const [filterOption, setFilterOption] = useState<FilterOption>("recent");

  // Detail view state
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detailViewOpen, setDetailViewOpen] = useState(false);

  // Signed URL state - memes with fresh R2 signed URLs
  const [memesWithUrls, setMemesWithUrls] = useState<MemeWithSignedUrls[]>([]);
  const [memesLoading, setMemesLoading] = useState(false);
  const [memesError, setMemesError] = useState<string | null>(null);

  // URL cache with expiry tracking
  const urlCacheRef = useRef<{
    expiresAt: number;
    fetchedAt: number;
  } | null>(null);
  const URL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  const URL_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const jobs = useQuery(api.memeGenerator.getMemeJobsByProfile, { slug });
  const memesGroupedByJob = useQuery(api.memeGenerator.getMemesGroupedByJob, { slug });
  const deleteMeme = useMutation(api.memeGenerator.deleteMeme);
  const toggleVisibility = useMutation(api.memeGenerator.toggleMemeVisibility);
  const toggleFavorite = useMutation(api.memeGenerator.toggleMemeFavorite);
  const cancelJob = useMutation(api.memeGenerator.cancelMemeJob);

  // Action to get memes with signed URLs from R2
  const getMemesWithSignedUrls = useAction(api.memeGenerator.getMemesWithSignedUrls);

  // Check if URL cache needs refresh
  const shouldRefreshUrls = useCallback(() => {
    if (!urlCacheRef.current) return true;
    const now = Date.now();
    return now >= urlCacheRef.current.expiresAt - URL_REFRESH_BUFFER_MS;
  }, []);

  // Fetch memes with signed URLs
  useEffect(() => {
    const fetchMemesWithUrls = async () => {
      if (!slug) return;

      if (!shouldRefreshUrls() && memesWithUrls.length > 0) {
        return;
      }

      setMemesLoading(true);
      setMemesError(null);

      try {
        const result = await getMemesWithSignedUrls({ slug, expiresIn: 3600 });
        if (result.error) {
          setMemesError(result.error);
        } else {
          setMemesWithUrls(result.memes as MemeWithSignedUrls[]);
          const now = Date.now();
          urlCacheRef.current = {
            fetchedAt: now,
            expiresAt: now + URL_CACHE_TTL_MS,
          };
        }
      } catch (err) {
        console.error("Failed to fetch memes with signed URLs:", err);
        setMemesError("Failed to load memes");
      } finally {
        setMemesLoading(false);
      }
    };

    fetchMemesWithUrls();
  }, [slug, getMemesWithSignedUrls, fetchTrigger, shouldRefreshUrls, URL_CACHE_TTL_MS, memesWithUrls.length]);

  // Periodic check to refresh URLs before they expire
  useEffect(() => {
    const checkCacheInterval = setInterval(() => {
      if (shouldRefreshUrls() && memesWithUrls.length > 0 && !memesLoading) {
        urlCacheRef.current = null;
        setFetchTrigger((prev) => prev + 1);
      }
    }, 60 * 1000);

    return () => clearInterval(checkCacheInterval);
  }, [shouldRefreshUrls, memesWithUrls.length, memesLoading]);

  // Create unified job list
  const unifiedJobs = useMemo((): UnifiedMemeJob[] => {
    if (!memesGroupedByJob || !memesWithUrls.length) return [];

    const jobMap = new Map<string, MemeWithSignedUrls[]>();

    // Group memes with signed URLs by job
    for (const meme of memesWithUrls) {
      const jobId = meme.jobId;
      if (!jobMap.has(jobId)) {
        jobMap.set(jobId, []);
      }
      jobMap.get(jobId)!.push(meme);
    }

    const allJobs: UnifiedMemeJob[] = [];

    for (const jobGroup of memesGroupedByJob) {
      const jobMemes = jobMap.get(jobGroup.job._id) || [];
      if (jobMemes.length === 0) continue;

      const publicCount = jobMemes.filter((m) => m.isPublic).length;
      const totalScore = jobMemes.reduce((sum, m) => sum + (m.viralScore ?? 0), 0);

      // Find the highest rated meme
      const topMeme = jobMemes.reduce((best, meme) =>
        (meme.viralScore ?? 0) > (best?.viralScore ?? 0) ? meme : best,
        jobMemes[0]
      );
      const previewThumbs = jobMemes
        .slice(0, 4)
        .map((m) => m.signedMemeUrl || m.signedFrameUrl)
        .filter(Boolean) as string[];

      allJobs.push({
        id: jobGroup.job._id,
        title: jobGroup.job.videoTitle || "Untitled Video",
        sourceUrl: jobGroup.job.sourceVideoUrl,
        status: jobGroup.job.status,
        assetCount: jobMemes.length,
        publicCount,
        createdAt: jobGroup.job.createdAt,
        completedAt: jobGroup.job.completedAt,
        previewThumbnails: previewThumbs,
        topAssetThumbnail: topMeme?.signedMemeUrl || topMeme?.signedFrameUrl || undefined,
        topAssetScore: topMeme?.viralScore,
        averageScore: jobMemes.length > 0 ? totalScore / jobMemes.length : 0,
        memes: jobMemes,
      });
    }

    // Sort based on filter option
    switch (filterOption) {
      case "recent":
        return allJobs.sort((a, b) => b.createdAt - a.createdAt);
      case "oldest":
        return allJobs.sort((a, b) => a.createdAt - b.createdAt);
      case "highest":
        return allJobs.sort((a, b) => b.averageScore - a.averageScore);
      case "lowest":
        return allJobs.sort((a, b) => a.averageScore - b.averageScore);
      default:
        return allJobs.sort((a, b) => b.createdAt - a.createdAt);
    }
  }, [memesGroupedByJob, memesWithUrls, filterOption]);

  // Get selected job for detail view
  const selectedJob = selectedJobId ? unifiedJobs.find((j) => j.id === selectedJobId) : null;

  // Convert memes to Asset format for detail view
  const selectedJobAssets = useMemo((): MemeAsset[] => {
    if (!selectedJob) return [];
    return selectedJob.memes.map((meme) => ({
      id: meme._id,
      type: "meme" as const,
      title: meme.templateName || meme.templateType || "Meme",
      thumbnailUrl: meme.signedMemeUrl || meme.signedFrameUrl || undefined,
      mediaUrl: meme.signedMemeUrl || meme.signedFrameUrl || undefined,
      score: meme.viralScore ?? 0,
      isPublic: meme.isPublic ?? false,
      isFavorite: meme.isFavorite ?? false,
      createdAt: meme.createdAt,
      caption: meme.caption,
      templateType: meme.templateType,
      sentiment: meme.sentiment,
      suggestedHashtags: meme.suggestedHashtags,
    }));
  }, [selectedJob]);

  const handleDelete = useCallback(
    async (memeId: Id<"generated_memes">) => {
      if (!confirm("Are you sure you want to delete this meme?")) {
        return;
      }

      setDeletingMemeId(memeId);
      try {
        await deleteMeme({ slug, memeId });
        setMemesWithUrls((prev) => prev.filter((m) => m._id !== memeId));
        onMemesChange?.();
      } catch (err) {
        console.error("Failed to delete meme:", err);
        alert(err instanceof Error ? err.message : "Failed to delete meme");
      } finally {
        setDeletingMemeId(null);
      }
    },
    [slug, deleteMeme, onMemesChange]
  );

  const handleToggleVisibility = useCallback(
    async (memeId: Id<"generated_memes">, currentIsPublic: boolean) => {
      setTogglingVisibilityId(memeId);
      try {
        await toggleVisibility({ slug, memeId, isPublic: !currentIsPublic });
        setMemesWithUrls((prev) =>
          prev.map((m) => (m._id === memeId ? { ...m, isPublic: !currentIsPublic } : m))
        );
        onMemesChange?.();
      } catch (err) {
        console.error("Failed to toggle visibility:", err);
        alert(err instanceof Error ? err.message : "Failed to toggle visibility");
      } finally {
        setTogglingVisibilityId(null);
      }
    },
    [slug, toggleVisibility, onMemesChange]
  );

  const handleToggleFavorite = useCallback(
    async (memeId: Id<"generated_memes">, currentIsFavorite: boolean) => {
      setTogglingFavoriteId(memeId);
      try {
        await toggleFavorite({ slug, memeId, isFavorite: !currentIsFavorite });
        setMemesWithUrls((prev) =>
          prev.map((m) => (m._id === memeId ? { ...m, isFavorite: !currentIsFavorite } : m))
        );
        onMemesChange?.();
      } catch (err) {
        console.error("Failed to toggle favorite:", err);
        alert(err instanceof Error ? err.message : "Failed to toggle favorite");
      } finally {
        setTogglingFavoriteId(null);
      }
    },
    [slug, toggleFavorite, onMemesChange]
  );

  const handleMemeJobCreated = useCallback(() => {
    urlCacheRef.current = null;
    setFetchTrigger((prev) => prev + 1);
  }, []);

  // Detail view handlers
  const handleDetailToggleVisibility = useCallback(
    async (assetId: string, currentIsPublic: boolean) => {
      await handleToggleVisibility(assetId as Id<"generated_memes">, currentIsPublic);
    },
    [handleToggleVisibility]
  );

  const handleDetailToggleFavorite = useCallback(
    async (assetId: string, currentIsFavorite: boolean) => {
      await handleToggleFavorite(assetId as Id<"generated_memes">, currentIsFavorite);
    },
    [handleToggleFavorite]
  );

  const handleDetailDelete = useCallback(
    async (assetId: string) => {
      await handleDelete(assetId as Id<"generated_memes">);
    },
    [handleDelete]
  );

  // Job card click handler
  const handleJobClick = useCallback((jobId: string) => {
    setSelectedJobId(jobId);
    setDetailViewOpen(true);
  }, []);

  // Check if there's a job currently processing
  const STALE_JOB_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

  const isJobStale = useCallback((job: { createdAt: number; status: string }) => {
    const processingStatuses = ["pending", "downloading", "extracting_frames", "analyzing", "generating_captions", "processing", "uploaded"];
    if (!processingStatuses.includes(job.status)) return false;
    return Date.now() - job.createdAt > STALE_JOB_THRESHOLD_MS;
  }, []);

  const activeJob = jobs?.find(
    (job) => (job.status === "pending" || job.status === "downloading" || job.status === "extracting_frames" || job.status === "analyzing" || job.status === "generating_captions") && !isJobStale(job)
  );

  const staleJob = jobs?.find(
    (job) => (job.status === "pending" || job.status === "downloading" || job.status === "extracting_frames" || job.status === "analyzing" || job.status === "generating_captions" || job.status === "processing" || job.status === "uploaded") && isJobStale(job)
  );

  const handleCancelStaleJob = useCallback(
    async (jobId: Id<"meme_generation_jobs">) => {
      setCancellingJobId(jobId);
      try {
        await cancelJob({ slug, jobId });
      } catch (err) {
        console.error("Failed to cancel job:", err);
        alert(err instanceof Error ? err.message : "Failed to cancel job");
      } finally {
        setCancellingJobId(null);
      }
    },
    [slug, cancelJob]
  );

  const isLoading = memesLoading || jobs === undefined || memesGroupedByJob === undefined;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 dark:text-white/50">
            AI-generated memes from your videos
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter Dropdown */}
          {!isLoading && unifiedJobs.length > 0 && (
            <FilterDropdown
              value={filterOption}
              onChange={setFilterOption}
            />
          )}
          <button
            type="button"
            onClick={() => setShowGeneratorModal(true)}
            disabled={!!activeJob}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 transition hover:border-red-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-[#f53c56] dark:hover:text-[#f53c56]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {activeJob ? "Processing..." : "Generate Memes"}
          </button>
        </div>
      </div>

      {/* Active Job Status */}
      {activeJob && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-300">
                Generating memes...
              </p>
              <p className="text-xs text-amber-400/70">
                Status: {activeJob.status} ({activeJob.progress || 0}%)
                {activeJob.currentStep && ` - ${activeJob.currentStep}`}
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-amber-900/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-all duration-500"
              style={{ width: `${activeJob.progress || 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Stale Job Warning */}
      {staleJob && !activeJob && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-300">
                Previous job appears to be stuck
              </p>
              <p className="text-xs text-red-400/70">
                Job status: {staleJob.status} • Started over 30 minutes ago
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCancelStaleJob(staleJob._id)}
              disabled={cancellingJobId === staleJob._id}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/30 disabled:opacity-50 transition"
            >
              {cancellingJobId === staleJob._id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      )}

      {/* Job Cards Grid */}
      {!isLoading && unifiedJobs.length > 0 && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {unifiedJobs.map((job) => (
            <JobCard
              key={job.id}
              job={{
                id: job.id,
                title: job.title,
                sourceUrl: job.sourceUrl,
                status: job.status,
                assetCount: job.assetCount,
                publicCount: job.publicCount,
                createdAt: job.createdAt,
                completedAt: job.completedAt,
                previewThumbnails: job.previewThumbnails,
                topAssetThumbnail: job.topAssetThumbnail,
                topAssetScore: job.topAssetScore,
                averageScore: job.averageScore,
              }}
              assetType="memes"
              isSelected={selectedJobId === job.id}
              onClick={() => handleJobClick(job.id)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && unifiedJobs.length === 0 && !activeJob && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-white/20 dark:bg-transparent">
          <Sparkles className="w-10 h-10 mx-auto text-slate-300 dark:text-white/30 mb-3" />
          <p className="text-sm font-medium text-slate-600 dark:text-white/70">
            No memes generated yet
          </p>
          <p className="text-xs text-slate-400 dark:text-white/40 mt-1 max-w-sm mx-auto">
            Generate viral memes from your YouTube videos using AI-powered frame analysis and caption generation
          </p>
          <button
            type="button"
            onClick={() => setShowGeneratorModal(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-500 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate Your First Memes
          </button>
        </div>
      )}

      {/* Asset Detail View */}
      <AssetDetailView
        isOpen={detailViewOpen}
        onClose={() => {
          setDetailViewOpen(false);
          setSelectedJobId(null);
        }}
        jobTitle={selectedJob?.title || ""}
        jobId={selectedJobId || ""}
        assetType="memes"
        assets={selectedJobAssets}
        onToggleVisibility={handleDetailToggleVisibility}
        onToggleFavorite={handleDetailToggleFavorite}
        onDelete={handleDetailDelete}
      />

      {/* Meme Generator Modal */}
      <MemeGeneratorModal
        isOpen={showGeneratorModal}
        onClose={() => setShowGeneratorModal(false)}
        slug={slug}
        onJobCreated={handleMemeJobCreated}
      />
    </div>
  );
}

export default GeneratedMemesManager;
