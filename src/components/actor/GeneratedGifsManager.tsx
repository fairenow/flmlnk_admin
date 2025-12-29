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
  Eye,
  EyeOff,
  Heart,
  Zap,
  Copy,
  Check,
  Hash,
  Clock,
  Film,
  Smile,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { GifGeneratorModal } from "./GifGeneratorModal";
import { JobCard } from "./JobCard";
import { AssetDetailView, type GifAsset, type FilterOption } from "./AssetDetailView";
import { FilterDropdown } from "./FilterDropdown";

type GeneratedGif = {
  _id: Id<"generated_gifs">;
  jobId: Id<"gif_generation_jobs">;
  title?: string;
  description?: string;
  startTime: number;
  endTime: number;
  duration: number;
  gifUrl?: string;
  mp4Url?: string;
  webpUrl?: string;
  r2GifKey?: string;
  r2Mp4Key?: string;
  r2WebpKey?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  frameRate?: number;
  overlayText?: string;
  overlayStyle?: string;
  viralScore?: number;
  humorScore?: number;
  emotionalIntensity?: number;
  suggestedHashtags?: string[];
  aiReasoning?: string;
  transcript?: string;
  hasAudioPeak?: boolean;
  hasSentimentSpike?: boolean;
  hasLaughter?: boolean;
  hasKeywords?: string[];
  isFavorite?: boolean;
  isPublic?: boolean;
  createdAt: number;
};

// Type for GIF with signed URLs from R2
type GifWithSignedUrls = GeneratedGif & {
  signedGifUrl: string | null;
  signedMp4Url: string | null;
  signedWebpUrl: string | null;
  urlExpiresAt: number | null;
};

// Unified Job type for GIFs
type UnifiedGifJob = {
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
  gifs: GifWithSignedUrls[];
};

type GeneratedGifsManagerProps = {
  slug: string;
  onGifsChange?: () => void;
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

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
  return `${secs}s`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function GeneratedGifsManager({
  slug,
  onGifsChange,
}: GeneratedGifsManagerProps) {
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);
  const [deletingGifId, setDeletingGifId] = useState<Id<"generated_gifs"> | null>(null);
  const [togglingVisibilityId, setTogglingVisibilityId] = useState<Id<"generated_gifs"> | null>(null);
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<Id<"generated_gifs"> | null>(null);
  const [cancellingJobId, setCancellingJobId] = useState<Id<"gif_generation_jobs"> | null>(null);

  // Filter state
  const [filterOption, setFilterOption] = useState<FilterOption>("recent");

  // Detail view state
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detailViewOpen, setDetailViewOpen] = useState(false);

  // Signed URL state - GIFs with fresh R2 signed URLs
  const [gifsWithUrls, setGifsWithUrls] = useState<GifWithSignedUrls[]>([]);
  const [gifsLoading, setGifsLoading] = useState(false);
  const [gifsError, setGifsError] = useState<string | null>(null);

  // URL cache with expiry tracking
  const urlCacheRef = useRef<{
    expiresAt: number;
    fetchedAt: number;
  } | null>(null);
  const URL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  const URL_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const jobs = useQuery(api.gifGenerator.getGifJobsByProfile, { slug });
  const gifsGroupedByJob = useQuery(api.gifGenerator.getGifsGroupedByJob, { slug });
  const deleteGif = useMutation(api.gifGenerator.deleteGif);
  const toggleVisibility = useMutation(api.gifGenerator.toggleGifVisibility);
  const toggleFavorite = useMutation(api.gifGenerator.toggleGifFavorite);
  const cancelJob = useMutation(api.gifGenerator.cancelGifJob);

  // Action to get GIFs with signed URLs from R2
  const getGifsWithSignedUrls = useAction(api.gifGenerator.getGifsWithSignedUrls);

  // Check if URL cache needs refresh
  const shouldRefreshUrls = useCallback(() => {
    if (!urlCacheRef.current) return true;
    const now = Date.now();
    return now >= urlCacheRef.current.expiresAt - URL_REFRESH_BUFFER_MS;
  }, []);

  // Fetch GIFs with signed URLs
  useEffect(() => {
    const fetchGifsWithUrls = async () => {
      if (!slug) return;

      if (!shouldRefreshUrls() && gifsWithUrls.length > 0) {
        return;
      }

      setGifsLoading(true);
      setGifsError(null);

      try {
        const result = await getGifsWithSignedUrls({ slug, expiresIn: 3600 });
        if (result.error) {
          setGifsError(result.error);
        } else {
          setGifsWithUrls(result.gifs as GifWithSignedUrls[]);
          const now = Date.now();
          urlCacheRef.current = {
            fetchedAt: now,
            expiresAt: now + URL_CACHE_TTL_MS,
          };
        }
      } catch (err) {
        console.error("Failed to fetch GIFs with signed URLs:", err);
        setGifsError("Failed to load GIFs");
      } finally {
        setGifsLoading(false);
      }
    };

    fetchGifsWithUrls();
  }, [slug, getGifsWithSignedUrls, fetchTrigger, shouldRefreshUrls, URL_CACHE_TTL_MS, gifsWithUrls.length]);

  // Periodic check to refresh URLs before they expire
  useEffect(() => {
    const checkCacheInterval = setInterval(() => {
      if (shouldRefreshUrls() && gifsWithUrls.length > 0 && !gifsLoading) {
        urlCacheRef.current = null;
        setFetchTrigger((prev) => prev + 1);
      }
    }, 60 * 1000);

    return () => clearInterval(checkCacheInterval);
  }, [shouldRefreshUrls, gifsWithUrls.length, gifsLoading]);

  // Create unified job list
  const unifiedJobs = useMemo((): UnifiedGifJob[] => {
    if (!gifsGroupedByJob || !gifsWithUrls.length) return [];

    const jobMap = new Map<string, GifWithSignedUrls[]>();

    // Group GIFs with signed URLs by job
    for (const gif of gifsWithUrls) {
      const jobId = gif.jobId;
      if (!jobMap.has(jobId)) {
        jobMap.set(jobId, []);
      }
      jobMap.get(jobId)!.push(gif);
    }

    const allJobs: UnifiedGifJob[] = [];

    for (const jobGroup of gifsGroupedByJob) {
      const jobGifs = jobMap.get(jobGroup.job._id) || [];
      if (jobGifs.length === 0) continue;

      const publicCount = jobGifs.filter((g) => g.isPublic).length;
      const totalScore = jobGifs.reduce((sum, g) => sum + (g.viralScore ?? 0), 0);

      // Find the highest rated GIF
      const topGif = jobGifs.reduce((best, gif) =>
        (gif.viralScore ?? 0) > (best?.viralScore ?? 0) ? gif : best,
        jobGifs[0]
      );
      const previewThumbs = jobGifs
        .slice(0, 4)
        .map((g) => g.signedGifUrl || g.signedMp4Url)
        .filter(Boolean) as string[];

      allJobs.push({
        id: jobGroup.job._id,
        title: jobGroup.job.videoTitle || "Untitled Video",
        sourceUrl: jobGroup.job.sourceVideoUrl,
        status: jobGroup.job.status,
        assetCount: jobGifs.length,
        publicCount,
        createdAt: jobGroup.job.createdAt,
        completedAt: jobGroup.job.completedAt,
        previewThumbnails: previewThumbs,
        topAssetThumbnail: topGif?.signedGifUrl || topGif?.signedMp4Url || undefined,
        topAssetScore: topGif?.viralScore,
        averageScore: jobGifs.length > 0 ? totalScore / jobGifs.length : 0,
        gifs: jobGifs,
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
  }, [gifsGroupedByJob, gifsWithUrls, filterOption]);

  // Get selected job for detail view
  const selectedJob = selectedJobId ? unifiedJobs.find((j) => j.id === selectedJobId) : null;

  // Convert GIFs to Asset format for detail view
  const selectedJobAssets = useMemo((): GifAsset[] => {
    if (!selectedJob) return [];
    return selectedJob.gifs.map((gif) => ({
      id: gif._id,
      type: "gif" as const,
      title: gif.title || "GIF",
      thumbnailUrl: gif.signedGifUrl || gif.signedMp4Url || undefined,
      mediaUrl: gif.signedGifUrl || gif.signedMp4Url || undefined,
      score: gif.viralScore ?? 0,
      isPublic: gif.isPublic ?? false,
      isFavorite: gif.isFavorite ?? false,
      createdAt: gif.createdAt,
      duration: gif.duration,
      overlayText: gif.overlayText,
      humorScore: gif.humorScore,
      emotionalIntensity: gif.emotionalIntensity,
      hasLaughter: gif.hasLaughter,
      hasAudioPeak: gif.hasAudioPeak,
      transcript: gif.transcript,
      fileSize: gif.fileSize,
      mp4Url: gif.signedMp4Url || undefined,
    }));
  }, [selectedJob]);

  const handleDelete = useCallback(
    async (gifId: Id<"generated_gifs">) => {
      if (!confirm("Are you sure you want to delete this GIF?")) {
        return;
      }

      setDeletingGifId(gifId);
      try {
        await deleteGif({ slug, gifId });
        setGifsWithUrls((prev) => prev.filter((g) => g._id !== gifId));
        onGifsChange?.();
      } catch (err) {
        console.error("Failed to delete GIF:", err);
        alert(err instanceof Error ? err.message : "Failed to delete GIF");
      } finally {
        setDeletingGifId(null);
      }
    },
    [slug, deleteGif, onGifsChange]
  );

  const handleToggleVisibility = useCallback(
    async (gifId: Id<"generated_gifs">, currentIsPublic: boolean) => {
      setTogglingVisibilityId(gifId);
      try {
        await toggleVisibility({ slug, gifId, isPublic: !currentIsPublic });
        setGifsWithUrls((prev) =>
          prev.map((g) => (g._id === gifId ? { ...g, isPublic: !currentIsPublic } : g))
        );
        onGifsChange?.();
      } catch (err) {
        console.error("Failed to toggle visibility:", err);
        alert(err instanceof Error ? err.message : "Failed to toggle visibility");
      } finally {
        setTogglingVisibilityId(null);
      }
    },
    [slug, toggleVisibility, onGifsChange]
  );

  const handleToggleFavorite = useCallback(
    async (gifId: Id<"generated_gifs">, currentIsFavorite: boolean) => {
      setTogglingFavoriteId(gifId);
      try {
        await toggleFavorite({ slug, gifId, isFavorite: !currentIsFavorite });
        setGifsWithUrls((prev) =>
          prev.map((g) => (g._id === gifId ? { ...g, isFavorite: !currentIsFavorite } : g))
        );
        onGifsChange?.();
      } catch (err) {
        console.error("Failed to toggle favorite:", err);
        alert(err instanceof Error ? err.message : "Failed to toggle favorite");
      } finally {
        setTogglingFavoriteId(null);
      }
    },
    [slug, toggleFavorite, onGifsChange]
  );

  const handleGifJobCreated = useCallback(() => {
    urlCacheRef.current = null;
    setFetchTrigger((prev) => prev + 1);
  }, []);

  // Detail view handlers
  const handleDetailToggleVisibility = useCallback(
    async (assetId: string, currentIsPublic: boolean) => {
      await handleToggleVisibility(assetId as Id<"generated_gifs">, currentIsPublic);
    },
    [handleToggleVisibility]
  );

  const handleDetailToggleFavorite = useCallback(
    async (assetId: string, currentIsFavorite: boolean) => {
      await handleToggleFavorite(assetId as Id<"generated_gifs">, currentIsFavorite);
    },
    [handleToggleFavorite]
  );

  const handleDetailDelete = useCallback(
    async (assetId: string) => {
      await handleDelete(assetId as Id<"generated_gifs">);
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
    const processingStatuses = ["pending", "downloading", "uploaded", "analyzing", "generating", "processing"];
    if (!processingStatuses.includes(job.status)) return false;
    return Date.now() - job.createdAt > STALE_JOB_THRESHOLD_MS;
  }, []);

  const activeJob = jobs?.find(
    (job) => (job.status === "pending" || job.status === "downloading" || job.status === "uploaded" || job.status === "analyzing" || job.status === "generating") && !isJobStale(job)
  );

  const staleJob = jobs?.find(
    (job) => (job.status === "pending" || job.status === "downloading" || job.status === "uploaded" || job.status === "analyzing" || job.status === "generating" || job.status === "processing") && isJobStale(job)
  );

  const handleCancelStaleJob = useCallback(
    async (jobId: Id<"gif_generation_jobs">) => {
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

  const isLoading = gifsLoading || jobs === undefined || gifsGroupedByJob === undefined;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 dark:text-white/50">
            AI-generated GIFs from viral moments in your videos
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
            <Zap className="w-3.5 h-3.5" />
            {activeJob ? "Processing..." : "Generate GIFs"}
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
                Generating GIFs...
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
              assetType="gifs"
              isSelected={selectedJobId === job.id}
              onClick={() => handleJobClick(job.id)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && unifiedJobs.length === 0 && !activeJob && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-white/20 dark:bg-transparent">
          <Zap className="w-10 h-10 mx-auto text-slate-300 dark:text-white/30 mb-3" />
          <p className="text-sm font-medium text-slate-600 dark:text-white/70">
            No GIFs generated yet
          </p>
          <p className="text-xs text-slate-400 dark:text-white/40 mt-1 max-w-sm mx-auto">
            Generate viral GIFs from your YouTube videos using AI-powered moment detection and text overlays
          </p>
          <button
            type="button"
            onClick={() => setShowGeneratorModal(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-500 transition-all"
          >
            <Zap className="w-3.5 h-3.5" />
            Generate Your First GIFs
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
        assetType="gifs"
        assets={selectedJobAssets}
        onToggleVisibility={handleDetailToggleVisibility}
        onToggleFavorite={handleDetailToggleFavorite}
        onDelete={handleDetailDelete}
      />

      {/* Generator Modal */}
      <GifGeneratorModal
        isOpen={showGeneratorModal}
        onClose={() => setShowGeneratorModal(false)}
        slug={slug}
        onJobCreated={handleGifJobCreated}
      />
    </div>
  );
}

export default GeneratedGifsManager;
