"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Wand2,
  Trash2,
  Download,
  Play,
  Clock,
  TrendingUp,
  Loader2,
  Video,
  Eye,
  EyeOff,
  Image,
  Sparkles,
  AlertTriangle,
  XCircle,
  MoreHorizontal,
} from "lucide-react";
import { ClipGeneratorModal } from "./ClipGeneratorModal";
import { ThumbnailPicker } from "./ThumbnailPicker";
import { HighlightExtractor } from "./HighlightExtractor";
import { useAutoThumbnail } from "@/hooks/useAutoThumbnail";
import { JobCard, type JobCardData } from "./JobCard";
import { AssetDetailView, type ClipAsset, type FilterOption } from "./AssetDetailView";
import { FilterDropdown } from "./FilterDropdown";

type GeneratedClip = {
  _id: Id<"generated_clips">;
  jobId: Id<"clip_generation_jobs">;
  title: string;
  description: string;
  transcript: string;
  downloadUrl?: string;
  duration: number;
  startTime: number;
  endTime: number;
  score: number;
  videoTitle?: string;
  createdAt: number;
  isPublic?: boolean;
  thumbnailUrl?: string;
  customThumbnailUrl?: string;
};

// Type for R2 processing clips with signed URLs
type ProcessingClipWithUrl = {
  _id: string;
  _creationTime: number;
  jobId: string;
  clipIndex: number;
  title?: string;
  description?: string;
  transcript?: string;
  duration: number;
  startTime: number;
  endTime: number;
  score?: number;
  r2ClipKey?: string;
  r2ThumbKey?: string;
  clipUrl: string | null;
  thumbUrl: string | null;
  isPublic?: boolean;
  createdAt: number;
  // Custom thumbnail fields
  customThumbnailStorageId?: string;
  customThumbnailUrl?: string;
  thumbnailTimestamp?: number;
};

// Type for grouped processing clips by job
type ProcessingJobGroup = {
  job: {
    _id: string;
    title: string;
    sourceUrl?: string;
    status: string;
    clipCount?: number;
    createdAt: number;
    completedAt?: number;
  };
  clips: ProcessingClipWithUrl[];
  clipCount: number;
};

// Unified clip type for combined display
type UnifiedClip = {
  id: string;
  type: "generated" | "processing";
  title: string;
  duration: number;
  score: number;
  isPublic: boolean;
  createdAt: number;
  thumbnailUrl?: string;
  downloadUrl?: string;
  description?: string;
  transcript?: string;
  // Original clip references
  generatedClip?: GeneratedClip;
  processingClip?: ProcessingClipWithUrl;
};

// Unified Job type combining both generated and processing jobs
type UnifiedJob = {
  id: string;
  type: "generated" | "processing";
  title: string;
  sourceUrl?: string;
  status: string;
  assetCount: number;
  publicCount: number;
  createdAt: number;
  completedAt?: number;
  previewThumbnails: string[];
  averageScore: number;
  clips: UnifiedClip[];
};

type GeneratedClipsManagerProps = {
  slug: string;
  actorProfileId?: Id<"actor_profiles">;
  onClipsChange?: () => void;
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

export function GeneratedClipsManager({
  slug,
  actorProfileId,
  onClipsChange,
}: GeneratedClipsManagerProps) {
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);
  const [_deletingClipId, setDeletingClipId] = useState<Id<"generated_clips"> | null>(null);
  const [thumbnailPickerClip, setThumbnailPickerClip] = useState<GeneratedClip | null>(null);
  const [highlightExtractorClip, setHighlightExtractorClip] = useState<GeneratedClip | null>(null);
  const [cancellingJobId, setCancellingJobId] = useState<Id<"clip_generation_jobs"> | null>(null);

  // Filter state
  const [filterOption, setFilterOption] = useState<FilterOption>("recent");

  // Detail view state
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detailViewOpen, setDetailViewOpen] = useState(false);

  // Auto-thumbnail capture
  const { captureFirstFrame } = useAutoThumbnail();
  const autoThumbnailProcessed = useRef<Set<string>>(new Set());

  // R2 processing clips state - now grouped by job
  const [r2JobGroups, setR2JobGroups] = useState<ProcessingJobGroup[]>([]);
  const [r2ClipsLoading, setR2ClipsLoading] = useState(false);
  const [_r2ClipsError, setR2ClipsError] = useState<string | null>(null);
  const [deletingR2ClipId, setDeletingR2ClipId] = useState<string | null>(null);
  const [togglingR2VisibilityId, setTogglingR2VisibilityId] = useState<string | null>(null);
  const [r2ThumbnailPickerClip, setR2ThumbnailPickerClip] = useState<ProcessingClipWithUrl | null>(null);
  const [r2HighlightExtractorClip, setR2HighlightExtractorClip] = useState<ProcessingClipWithUrl | null>(null);

  // URL cache with expiry tracking
  const urlCacheRef = useRef<{
    expiresAt: number;
    fetchedAt: number;
  } | null>(null);
  const URL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  const URL_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const clips = useQuery(api.clipGenerator.getGeneratedClipsByProfile, { slug });
  const jobs = useQuery(api.clipGenerator.getJobsByProfile, { slug });
  const clipsGroupedByJob = useQuery(api.clipGenerator.getClipsGroupedByJob, { slug });
  const deleteClip = useMutation(api.clipGenerator.deleteGeneratedClip);
  const toggleVisibility = useMutation(api.clipGenerator.toggleGeneratedClipVisibility);
  const cancelJob = useMutation(api.clipGenerator.cancelJob);

  // R2 processing clips mutations
  const deleteR2Clip = useMutation(api.processing.deleteProcessingClip);
  const toggleR2Visibility = useMutation(api.processing.toggleProcessingClipVisibility);

  // R2 processing clips action
  const getProcessingClipsGrouped = useAction(api.processing.getProcessingClipsGroupedByJobWithUrls);

  // Check if URL cache needs refresh
  const shouldRefreshUrls = useCallback(() => {
    if (!urlCacheRef.current) return true;
    const now = Date.now();
    return now >= urlCacheRef.current.expiresAt - URL_REFRESH_BUFFER_MS;
  }, []);

  // Fetch R2 processing clips grouped by job
  useEffect(() => {
    const fetchR2Clips = async () => {
      if (!slug) return;

      if (!shouldRefreshUrls() && r2JobGroups.length > 0) {
        return;
      }

      setR2ClipsLoading(true);
      setR2ClipsError(null);

      try {
        const result = await getProcessingClipsGrouped({ slug, expiresIn: 3600 });
        if (result.error) {
          setR2ClipsError(result.error);
        } else {
          setR2JobGroups(result.jobGroups);
          const now = Date.now();
          urlCacheRef.current = {
            fetchedAt: now,
            expiresAt: now + URL_CACHE_TTL_MS,
          };
        }
      } catch (err) {
        console.error("Failed to fetch R2 processing clips:", err);
        setR2ClipsError("Failed to load clips");
      } finally {
        setR2ClipsLoading(false);
      }
    };

    fetchR2Clips();
  }, [slug, getProcessingClipsGrouped, fetchTrigger, shouldRefreshUrls, URL_CACHE_TTL_MS]);

  // Periodic check to refresh URLs
  useEffect(() => {
    const checkCacheInterval = setInterval(() => {
      if (shouldRefreshUrls() && r2JobGroups.length > 0 && !r2ClipsLoading) {
        urlCacheRef.current = null;
        setFetchTrigger((prev) => prev + 1);
      }
    }, 60 * 1000);

    return () => clearInterval(checkCacheInterval);
  }, [shouldRefreshUrls, r2JobGroups.length, r2ClipsLoading]);

  // Auto-thumbnail capture for clips without custom thumbnails
  useEffect(() => {
    if (!clips) return;

    const processAutoThumbnails = async () => {
      for (const clip of clips) {
        if (autoThumbnailProcessed.current.has(clip._id) || clip.customThumbnailUrl) {
          continue;
        }

        if (!clip.downloadUrl) {
          continue;
        }

        autoThumbnailProcessed.current.add(clip._id);

        captureFirstFrame(clip.downloadUrl, clip._id, "generated").catch((err) => {
          console.error("Auto-thumbnail capture failed:", err);
        });
      }
    };

    processAutoThumbnails();
  }, [clips, captureFirstFrame]);

  // Create unified job list combining generated jobs and processing jobs
  const unifiedJobs = useMemo((): UnifiedJob[] => {
    const allJobs: UnifiedJob[] = [];

    // Add generated clip jobs
    if (clipsGroupedByJob) {
      for (const jobGroup of clipsGroupedByJob) {
        const jobClips: UnifiedClip[] = jobGroup.clips.map((clip: GeneratedClip) => ({
          id: clip._id,
          type: "generated" as const,
          title: clip.title,
          duration: clip.duration,
          score: clip.score,
          isPublic: clip.isPublic ?? false,
          createdAt: clip.createdAt,
          thumbnailUrl: clip.customThumbnailUrl || clip.thumbnailUrl,
          downloadUrl: clip.downloadUrl,
          description: clip.description,
          transcript: clip.transcript,
          generatedClip: clip,
        }));

        const publicCount = jobClips.filter((c) => c.isPublic).length;
        const totalScore = jobClips.reduce((sum, c) => sum + c.score, 0);
        const previewThumbs = jobClips
          .slice(0, 4)
          .map((c) => c.thumbnailUrl)
          .filter(Boolean) as string[];

        allJobs.push({
          id: jobGroup.job._id,
          type: "generated",
          title: jobGroup.job.videoTitle || "Untitled Video",
          sourceUrl: jobGroup.job.sourceVideoUrl,
          status: jobGroup.job.status,
          assetCount: jobClips.length,
          publicCount,
          createdAt: jobGroup.job.createdAt,
          completedAt: jobGroup.job.completedAt,
          previewThumbnails: previewThumbs,
          averageScore: jobClips.length > 0 ? totalScore / jobClips.length : 0,
          clips: jobClips,
        });
      }
    }

    // Add R2 processing jobs
    for (const jobGroup of r2JobGroups) {
      const jobClips: UnifiedClip[] = jobGroup.clips.map((clip) => ({
        id: clip._id,
        type: "processing" as const,
        title: clip.title || `Clip ${clip.clipIndex + 1}`,
        duration: clip.duration,
        score: clip.score ?? 0,
        isPublic: clip.isPublic ?? false,
        createdAt: clip.createdAt,
        thumbnailUrl: clip.customThumbnailUrl || clip.thumbUrl || undefined,
        downloadUrl: clip.clipUrl || undefined,
        description: clip.description,
        transcript: clip.transcript,
        processingClip: clip,
      }));

      const publicCount = jobClips.filter((c) => c.isPublic).length;
      const totalScore = jobClips.reduce((sum, c) => sum + c.score, 0);
      const previewThumbs = jobClips
        .slice(0, 4)
        .map((c) => c.thumbnailUrl)
        .filter(Boolean) as string[];

      allJobs.push({
        id: jobGroup.job._id,
        type: "processing",
        title: jobGroup.job.title || "Uploaded Video",
        sourceUrl: jobGroup.job.sourceUrl,
        status: jobGroup.job.status,
        assetCount: jobClips.length,
        publicCount,
        createdAt: jobGroup.job.createdAt,
        completedAt: jobGroup.job.completedAt,
        previewThumbnails: previewThumbs,
        averageScore: jobClips.length > 0 ? totalScore / jobClips.length : 0,
        clips: jobClips,
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
  }, [clipsGroupedByJob, r2JobGroups, filterOption]);

  // Get selected job for detail view
  const selectedJob = selectedJobId ? unifiedJobs.find((j) => j.id === selectedJobId) : null;

  // Convert clips to Asset format for detail view
  const selectedJobAssets = useMemo((): ClipAsset[] => {
    if (!selectedJob) return [];
    return selectedJob.clips.map((clip) => ({
      id: clip.id,
      type: "clip" as const,
      title: clip.title,
      thumbnailUrl: clip.thumbnailUrl,
      mediaUrl: clip.downloadUrl,
      score: clip.score,
      isPublic: clip.isPublic,
      createdAt: clip.createdAt,
      duration: clip.duration,
      description: clip.description,
      transcript: clip.transcript,
    }));
  }, [selectedJob]);

  const handleDelete = useCallback(
    async (clipId: Id<"generated_clips">) => {
      if (!confirm("Are you sure you want to delete this generated clip?")) {
        return;
      }

      setDeletingClipId(clipId);
      try {
        await deleteClip({ slug, clipId });
        onClipsChange?.();
      } catch (err) {
        console.error("Failed to delete clip:", err);
        alert(err instanceof Error ? err.message : "Failed to delete clip");
      } finally {
        setDeletingClipId(null);
      }
    },
    [slug, deleteClip, onClipsChange]
  );

  const handleToggleVisibility = useCallback(
    async (clipId: Id<"generated_clips">, currentIsPublic: boolean) => {
      try {
        await toggleVisibility({ slug, clipId, isPublic: !currentIsPublic });
        onClipsChange?.();
      } catch (err) {
        console.error("Failed to toggle visibility:", err);
        alert(err instanceof Error ? err.message : "Failed to toggle visibility");
      }
    },
    [slug, toggleVisibility, onClipsChange]
  );

  const handleJobCreated = useCallback(() => {
    // Job created - the query will automatically update
  }, []);

  const handleThumbnailSaved = useCallback(() => {
    setThumbnailPickerClip(null);
    onClipsChange?.();
  }, [onClipsChange]);

  const handleHighlightsSaved = useCallback((count: number) => {
    setHighlightExtractorClip(null);
    console.log(`${count} highlight images saved to assets`);
  }, []);

  // R2 thumbnail saved handler
  const handleR2ThumbnailSaved = useCallback((thumbnailUrl: string) => {
    if (r2ThumbnailPickerClip) {
      setR2JobGroups((prev) =>
        prev.map((group) => ({
          ...group,
          clips: group.clips.map((c) =>
            c._id === r2ThumbnailPickerClip._id
              ? { ...c, customThumbnailUrl: thumbnailUrl }
              : c
          ),
        }))
      );
    }
    setR2ThumbnailPickerClip(null);
    onClipsChange?.();
  }, [r2ThumbnailPickerClip, onClipsChange]);

  const handleR2HighlightsSaved = useCallback((count: number) => {
    setR2HighlightExtractorClip(null);
    console.log(`${count} highlight images saved to assets from uploaded clip`);
  }, []);

  // R2 clip handlers
  const handleDeleteR2Clip = useCallback(
    async (clipId: string) => {
      if (!confirm("Are you sure you want to delete this clip?")) {
        return;
      }

      setDeletingR2ClipId(clipId);
      try {
        await deleteR2Clip({ slug, clipId: clipId as Id<"processing_clips"> });
        setR2JobGroups((prev) =>
          prev
            .map((group) => ({
              ...group,
              clips: group.clips.filter((c) => c._id !== clipId),
              clipCount: group.clips.filter((c) => c._id !== clipId).length,
            }))
            .filter((group) => group.clipCount > 0)
        );
        onClipsChange?.();
      } catch (err) {
        console.error("Failed to delete R2 clip:", err);
        alert(err instanceof Error ? err.message : "Failed to delete clip");
      } finally {
        setDeletingR2ClipId(null);
      }
    },
    [slug, deleteR2Clip, onClipsChange]
  );

  const handleToggleR2Visibility = useCallback(
    async (clipId: string, currentIsPublic: boolean) => {
      setTogglingR2VisibilityId(clipId);
      try {
        await toggleR2Visibility({ slug, clipId: clipId as Id<"processing_clips">, isPublic: !currentIsPublic });
        setR2JobGroups((prev) =>
          prev.map((group) => ({
            ...group,
            clips: group.clips.map((c) =>
              c._id === clipId ? { ...c, isPublic: !currentIsPublic } : c
            ),
          }))
        );
        onClipsChange?.();
      } catch (err) {
        console.error("Failed to toggle R2 clip visibility:", err);
        alert(err instanceof Error ? err.message : "Failed to toggle visibility");
      } finally {
        setTogglingR2VisibilityId(null);
      }
    },
    [slug, toggleR2Visibility, onClipsChange]
  );

  // Detail view handlers
  const handleDetailToggleVisibility = useCallback(
    async (assetId: string, currentIsPublic: boolean) => {
      // Find the clip to determine if it's generated or processing
      const clip = selectedJob?.clips.find((c) => c.id === assetId);
      if (!clip) return;

      if (clip.type === "generated") {
        await handleToggleVisibility(assetId as Id<"generated_clips">, currentIsPublic);
      } else {
        await handleToggleR2Visibility(assetId, currentIsPublic);
      }
    },
    [selectedJob, handleToggleVisibility, handleToggleR2Visibility]
  );

  const handleDetailDelete = useCallback(
    async (assetId: string) => {
      const clip = selectedJob?.clips.find((c) => c.id === assetId);
      if (!clip) return;

      if (clip.type === "generated") {
        await handleDelete(assetId as Id<"generated_clips">);
      } else {
        await handleDeleteR2Clip(assetId);
      }
    },
    [selectedJob, handleDelete, handleDeleteR2Clip]
  );

  // Job card click handler
  const handleJobClick = useCallback((jobId: string) => {
    setSelectedJobId(jobId);
    setDetailViewOpen(true);
  }, []);

  // Check if there's a job currently processing
  const STALE_JOB_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

  const isJobStale = useCallback((job: { createdAt: number; status: string }) => {
    const processingStatuses = ["submitted", "processing", "pending", "downloading"];
    if (!processingStatuses.includes(job.status)) return false;
    return Date.now() - job.createdAt > STALE_JOB_THRESHOLD_MS;
  }, []);

  const activeJob = jobs?.find(
    (job) => (job.status === "submitted" || job.status === "processing") && !isJobStale(job)
  );

  const staleJob = jobs?.find(
    (job) => (job.status === "submitted" || job.status === "processing") && isJobStale(job)
  );

  const handleCancelStaleJob = useCallback(
    async (jobId: Id<"clip_generation_jobs">) => {
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

  const isLoading = clips === undefined || jobs === undefined || clipsGroupedByJob === undefined;
  const totalClips = unifiedJobs.reduce((sum, job) => sum + job.assetCount, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 dark:text-white/50">
            Flmlnk Reels generated from your videos
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
            <Wand2 className="w-3.5 h-3.5" />
            {activeJob ? "Processing..." : "Generate Clips"}
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
                Generating clips...
              </p>
              <p className="text-xs text-amber-400/70">
                Status: {activeJob.status} • This may take a few minutes
              </p>
            </div>
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
                averageScore: job.averageScore,
              }}
              assetType="clips"
              isSelected={selectedJobId === job.id}
              onClick={() => handleJobClick(job.id)}
            />
          ))}
        </div>
      )}

      {/* R2 Clips Loading State */}
      {r2ClipsLoading && (
        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 className="w-5 h-5 animate-spin text-red-500" />
          <span className="text-sm text-slate-500">Loading clips...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !r2ClipsLoading && unifiedJobs.length === 0 && !activeJob && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-white/20 dark:bg-transparent">
          <Video className="w-10 h-10 mx-auto text-slate-300 dark:text-white/30 mb-3" />
          <p className="text-sm font-medium text-slate-600 dark:text-white/70">
            No Flmlnk Reels yet
          </p>
          <p className="text-xs text-slate-400 dark:text-white/40 mt-1 max-w-sm mx-auto">
            Generate reels from your YouTube videos using our AI-powered highlight detection
          </p>
          <button
            type="button"
            onClick={() => setShowGeneratorModal(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-500 transition-all"
          >
            <Wand2 className="w-3.5 h-3.5" />
            Generate Your First Reels
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
        assetType="clips"
        assets={selectedJobAssets}
        onToggleVisibility={handleDetailToggleVisibility}
        onDelete={handleDetailDelete}
      />

      {/* Generator Modal */}
      <ClipGeneratorModal
        isOpen={showGeneratorModal}
        onClose={() => setShowGeneratorModal(false)}
        slug={slug}
        actorProfileId={actorProfileId}
        onJobCreated={handleJobCreated}
      />

      {/* Thumbnail Picker Modal */}
      {thumbnailPickerClip && thumbnailPickerClip.downloadUrl && (
        <ThumbnailPicker
          isOpen={!!thumbnailPickerClip}
          onClose={() => setThumbnailPickerClip(null)}
          videoUrl={thumbnailPickerClip.downloadUrl}
          clipId={thumbnailPickerClip._id}
          clipType="generated"
          onThumbnailSaved={handleThumbnailSaved}
          currentThumbnailUrl={thumbnailPickerClip.customThumbnailUrl || thumbnailPickerClip.thumbnailUrl}
        />
      )}

      {/* Highlight Extractor Modal */}
      {highlightExtractorClip && highlightExtractorClip.downloadUrl && (
        <HighlightExtractor
          isOpen={!!highlightExtractorClip}
          onClose={() => setHighlightExtractorClip(null)}
          videoUrl={highlightExtractorClip.downloadUrl}
          sourceType="generated_clip"
          sourceId={highlightExtractorClip._id}
          sourceTitle={highlightExtractorClip.title}
          slug={slug}
          onAssetsSaved={handleHighlightsSaved}
        />
      )}

      {/* R2 Processing Clip Thumbnail Picker Modal */}
      {r2ThumbnailPickerClip && r2ThumbnailPickerClip.clipUrl && (
        <ThumbnailPicker
          isOpen={!!r2ThumbnailPickerClip}
          onClose={() => setR2ThumbnailPickerClip(null)}
          videoUrl={r2ThumbnailPickerClip.clipUrl}
          clipId={r2ThumbnailPickerClip._id as Id<"processing_clips">}
          clipType="processing"
          onThumbnailSaved={handleR2ThumbnailSaved}
          currentThumbnailUrl={r2ThumbnailPickerClip.customThumbnailUrl || r2ThumbnailPickerClip.thumbUrl || undefined}
        />
      )}

      {/* R2 Processing Clip Highlight Extractor Modal */}
      {r2HighlightExtractorClip && r2HighlightExtractorClip.clipUrl && (
        <HighlightExtractor
          isOpen={!!r2HighlightExtractorClip}
          onClose={() => setR2HighlightExtractorClip(null)}
          videoUrl={r2HighlightExtractorClip.clipUrl}
          sourceType="generated_clip"
          sourceId={r2HighlightExtractorClip._id}
          sourceTitle={r2HighlightExtractorClip.title || `Uploaded Clip`}
          slug={slug}
          onAssetsSaved={handleR2HighlightsSaved}
        />
      )}
    </div>
  );
}

export default GeneratedClipsManager;
