"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Clapperboard,
  Trash2,
  Download,
  Play,
  Clock,
  Loader2,
  Eye,
  EyeOff,
  MoreHorizontal,
  AlertTriangle,
  XCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { TrailerGeneratorModal } from "./TrailerGeneratorModal";

type TrailerJob = {
  _id: Id<"trailer_jobs">;
  videoJobId: Id<"video_jobs">;
  userId: Id<"users">;
  status: string;
  progress?: number;
  currentStep?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  thumbnailR2Key?: string | null;
  clipCount?: number;
};

type TrailerClip = {
  _id: Id<"trailer_clips">;
  trailerJobId: Id<"trailer_jobs">;
  variantKey: string;
  r2Key: string;
  r2ThumbKey?: string;
  durationSec: number;
  fileSizeBytes: number;
  aspectRatio: string;
  resolution: string;
  createdAt: number;
  isPublic?: boolean;
};

type GeneratedTrailersManagerProps = {
  slug: string;
  actorProfileId?: Id<"actor_profiles">;
  onTrailersChange?: () => void;
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}:${remainingMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function getStatusColor(status: string): string {
  switch (status) {
    case "READY":
      return "text-green-400";
    case "FAILED":
      return "text-red-400";
    case "ANALYSIS_READY":
    case "PLAN_READY":
      return "text-amber-400";
    default:
      return "text-blue-400";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "CREATED":
      return "Created";
    case "UPLOADING":
      return "Uploading";
    case "UPLOADED":
      return "Uploaded";
    case "CLAIMED":
      return "Processing";
    case "PROXY_GENERATING":
      return "Generating Proxy";
    case "TRANSCRIBING":
      return "Transcribing";
    case "SCENE_DETECTING":
      return "Detecting Scenes";
    case "ANALYZING":
      return "Analyzing";
    case "ANALYSIS_READY":
      return "Analysis Ready";
    case "PLANNING":
      return "Planning";
    case "PLAN_READY":
      return "Plan Ready";
    case "RENDERING":
      return "Rendering";
    case "UPLOADING_OUTPUTS":
      return "Uploading";
    case "READY":
      return "Ready";
    case "FAILED":
      return "Failed";
    default:
      return status;
  }
}

export function GeneratedTrailersManager({
  slug,
  actorProfileId,
  onTrailersChange,
}: GeneratedTrailersManagerProps) {
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);
  const [activeJobMenu, setActiveJobMenu] = useState<Id<"trailer_jobs"> | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<Id<"trailer_jobs"> | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [isLoadingUrls, setIsLoadingUrls] = useState(false);

  // Query trailer jobs
  const jobs = useQuery(api.trailerJobs.listTrailerJobs, { limit: 20 });

  // Action to get signed URLs for thumbnails
  const getSignedUrl = useAction(api.r2.r2GetSignedUrl);

  // Query selected job details with clips
  const selectedJobDetails = useQuery(
    api.trailerJobs.getTrailerJobWithDetails,
    selectedJobId ? { jobId: selectedJobId } : "skip"
  );

  // Action to get signed URLs
  const getSignedUrls = useAction(api.r2.r2GetSignedUrls);

  // Fetch signed URLs when job is selected and has clips
  useEffect(() => {
    async function fetchSignedUrls() {
      if (!selectedJobDetails?.clips?.length) return;

      setIsLoadingUrls(true);
      try {
        const r2Keys = selectedJobDetails.clips.map((clip) => ({
          id: clip._id,
          clipKey: clip.r2Key,
          thumbKey: clip.r2ThumbKey,
        }));
        const urls = await getSignedUrls({ r2Keys });
        const urlMap: Record<string, string> = {};
        urls.forEach((item) => {
          if (item.clipUrl) {
            urlMap[item.id] = item.clipUrl;
          }
        });
        setSignedUrls(urlMap);
      } catch (error) {
        console.error("Failed to get signed URLs:", error);
      } finally {
        setIsLoadingUrls(false);
      }
    }

    if (selectedJobId && selectedJobDetails?.clips) {
      fetchSignedUrls();
    }
  }, [selectedJobId, selectedJobDetails?.clips, getSignedUrls]);

  // Close player modal
  const closePlayer = useCallback(() => {
    setSelectedJobId(null);
    setSignedUrls({});
  }, []);

  // Fetch thumbnail URLs for completed jobs
  useEffect(() => {
    async function fetchThumbnailUrls() {
      if (!jobs) return;

      const jobsWithThumbnails = jobs.filter(
        (job) => job.status === "READY" && job.thumbnailR2Key && !thumbnailUrls[job._id]
      );

      if (jobsWithThumbnails.length === 0) return;

      // Fetch signed URLs for each thumbnail
      const newUrls: Record<string, string> = { ...thumbnailUrls };
      await Promise.all(
        jobsWithThumbnails.map(async (job) => {
          try {
            if (job.thumbnailR2Key) {
              const result = await getSignedUrl({ r2Key: job.thumbnailR2Key });
              if (result.url) {
                newUrls[job._id] = result.url;
              }
            }
          } catch (error) {
            console.error(`Failed to get thumbnail URL for job ${job._id}:`, error);
          }
        })
      );
      setThumbnailUrls(newUrls);
    }

    fetchThumbnailUrls();
  }, [jobs, getSignedUrl, thumbnailUrls]);

  // Check if there's a job currently processing
  const STALE_JOB_THRESHOLD_MS = 45 * 60 * 1000; // 45 minutes for trailers (longer processing)

  const isJobStale = useCallback((job: TrailerJob) => {
    const processingStatuses = [
      "CREATED", "UPLOADING", "UPLOADED", "CLAIMED",
      "PROXY_GENERATING", "TRANSCRIBING", "SCENE_DETECTING",
      "ANALYZING", "PLANNING", "RENDERING", "UPLOADING_OUTPUTS"
    ];
    if (!processingStatuses.includes(job.status)) return false;
    return Date.now() - job.createdAt > STALE_JOB_THRESHOLD_MS;
  }, []);

  const activeJob = jobs?.find(
    (job) => ![
      "READY", "FAILED", "ANALYSIS_READY", "PLAN_READY"
    ].includes(job.status) && !isJobStale(job)
  );

  const staleJob = jobs?.find(
    (job) => ![
      "READY", "FAILED", "ANALYSIS_READY", "PLAN_READY"
    ].includes(job.status) && isJobStale(job)
  );

  const handleJobCreated = useCallback(() => {
    // Job created - the query will automatically update
    onTrailersChange?.();
  }, [onTrailersChange]);

  const isLoading = jobs === undefined;

  // Filter to show only completed jobs with clips
  const completedJobs = useMemo(() => {
    if (!jobs) return [];
    return jobs.filter((job) => job.status === "READY");
  }, [jobs]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 dark:text-white/50">
            AI-generated trailers from your feature films
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowGeneratorModal(true)}
          disabled={!!activeJob}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-medium text-indigo-700 transition hover:border-indigo-500 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-indigo-400 dark:hover:text-indigo-400"
        >
          <Clapperboard className="w-3.5 h-3.5" />
          {activeJob ? "Processing..." : "Generate Trailer"}
        </button>
      </div>

      {/* Active Job Status */}
      {activeJob && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-indigo-300">
                Generating trailer...
              </p>
              <p className="text-xs text-indigo-400/70">
                Status: {getStatusLabel(activeJob.status)}
                {activeJob.progress !== undefined && ` (${activeJob.progress}%)`}
              </p>
            </div>
          </div>
          {activeJob.progress !== undefined && (
            <div className="mt-3">
              <div className="h-1.5 bg-indigo-900/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                  style={{ width: `${activeJob.progress}%` }}
                />
              </div>
            </div>
          )}
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
                Status: {getStatusLabel(staleJob.status)} - Started over 45 minutes ago
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/30 transition"
            >
              <XCircle className="w-3.5 h-3.5" />
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

      {/* Completed Trailers Grid */}
      {!isLoading && completedJobs.length > 0 && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {completedJobs.map((job) => (
            <div
              key={job._id}
              className="group relative overflow-hidden rounded-lg bg-slate-900 aspect-video"
            >
              {/* Thumbnail or Placeholder */}
              {thumbnailUrls[job._id] ? (
                <img
                  src={thumbnailUrls[job._id]}
                  alt={`Trailer ${job._id.slice(-6)}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-900/50 to-purple-900/50">
                  <Clapperboard className="w-12 h-12 text-indigo-400/50" />
                </div>
              )}

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

              {/* Play Button Overlay */}
              <button
                type="button"
                onClick={() => setSelectedJobId(job._id)}
                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <div className="w-14 h-14 rounded-full bg-indigo-500/90 flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform">
                  <Play className="w-6 h-6 text-white ml-1" fill="currentColor" />
                </div>
              </button>

              {/* Top Row - Status */}
              <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full backdrop-blur-sm bg-black/50 ${getStatusColor(job.status)}`}>
                  {getStatusLabel(job.status)}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full backdrop-blur-sm bg-black/50 text-white/70">
                  {formatTimeAgo(job.createdAt)}
                </span>
              </div>

              {/* Bottom Info */}
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <h4 className="text-sm font-medium text-white line-clamp-1 mb-1">
                  Trailer #{job._id.slice(-6)}
                </h4>
                <div className="flex items-center gap-2 text-[10px] text-white/70">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {job.completedAt ? formatTimeAgo(job.completedAt) : "Processing..."}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && completedJobs.length === 0 && !activeJob && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-white/20 dark:bg-transparent">
          <Clapperboard className="w-10 h-10 mx-auto text-slate-300 dark:text-white/30 mb-3" />
          <p className="text-sm font-medium text-slate-600 dark:text-white/70">
            No trailers yet
          </p>
          <p className="text-xs text-slate-400 dark:text-white/40 mt-1 max-w-sm mx-auto">
            Generate professional trailers from your feature films using our AI-powered analysis
          </p>
          <button
            type="button"
            onClick={() => setShowGeneratorModal(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-xs font-medium text-white hover:from-indigo-500 hover:to-purple-500 transition-all"
          >
            <Clapperboard className="w-3.5 h-3.5" />
            Generate Your First Trailer
          </button>
        </div>
      )}

      {/* Generator Modal */}
      <TrailerGeneratorModal
        isOpen={showGeneratorModal}
        onClose={() => setShowGeneratorModal(false)}
        slug={slug}
        actorProfileId={actorProfileId}
        onJobCreated={handleJobCreated}
      />

      {/* Video Player Modal */}
      {selectedJobId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
          {/* Close button */}
          <button
            type="button"
            onClick={closePlayer}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {/* Loading state */}
          {(isLoadingUrls || !selectedJobDetails) && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
              <p className="text-white/70 text-sm">Loading trailer...</p>
            </div>
          )}

          {/* Video player */}
          {!isLoadingUrls && selectedJobDetails?.clips && selectedJobDetails.clips.length > 0 && (
            <div className="w-full max-w-5xl px-4">
              {/* Show first clip (16:9 variant if available) */}
              {(() => {
                const preferredClip = selectedJobDetails.clips.find(
                  (c) => c.variantKey?.includes("16x9")
                ) || selectedJobDetails.clips[0];
                const videoUrl = signedUrls[preferredClip._id];

                if (!videoUrl) {
                  return (
                    <div className="flex flex-col items-center gap-4">
                      <AlertTriangle className="w-10 h-10 text-amber-400" />
                      <p className="text-white/70 text-sm">Unable to load video URL</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <video
                      src={videoUrl}
                      controls
                      autoPlay
                      className="w-full rounded-lg shadow-2xl"
                      style={{ maxHeight: "80vh" }}
                    >
                      Your browser does not support the video tag.
                    </video>

                    {/* Variant selector if multiple clips */}
                    {selectedJobDetails.clips.length > 1 && (
                      <div className="flex justify-center gap-2">
                        {selectedJobDetails.clips.map((clip) => {
                          const url = signedUrls[clip._id];
                          const isActive = clip._id === preferredClip._id;
                          return (
                            <a
                              key={clip._id}
                              href={url || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                isActive
                                  ? "bg-indigo-500 text-white"
                                  : "bg-white/10 text-white/70 hover:bg-white/20"
                              }`}
                            >
                              {clip.variantKey || "Clip"}
                            </a>
                          );
                        })}
                      </div>
                    )}

                    {/* Clip info */}
                    <div className="text-center text-white/50 text-xs">
                      {preferredClip.variantKey} • {formatDuration(preferredClip.duration || 0)}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* No clips state */}
          {!isLoadingUrls && selectedJobDetails && (!selectedJobDetails.clips || selectedJobDetails.clips.length === 0) && (
            <div className="flex flex-col items-center gap-4">
              <Clapperboard className="w-10 h-10 text-white/30" />
              <p className="text-white/70 text-sm">No clips available for this trailer</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default GeneratedTrailersManager;
