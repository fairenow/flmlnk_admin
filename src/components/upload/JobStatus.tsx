"use client";

import type { FC } from "react";
import { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Download,
  RefreshCw,
  Sparkles,
  CloudUpload,
  Cpu,
  Film,
} from "lucide-react";
import type { ProcessingState } from "@/hooks/useResumableUpload";

interface JobStatusProps {
  jobId: Id<"processing_jobs">;
  processingState: ProcessingState | null;
  processingProgress: number;
  processingStep: string | null;
  onStartNew: () => void;
  onClose?: () => void;
}

type ClipWithUrl = {
  _id: string;
  title?: string;
  description?: string;
  duration: number;
  score?: number;
  clipUrl: string | null;
  thumbUrl: string | null;
  r2ClipKey?: string;
};

export const JobStatus: FC<JobStatusProps> = ({
  jobId,
  processingState,
  processingProgress,
  processingStep,
  onStartNew,
  onClose,
}) => {
  // Get clips with signed URLs for this job
  const [clips, setClips] = useState<ClipWithUrl[] | null>(null);
  const [clipsLoading, setClipsLoading] = useState(false);
  const getClipsWithUrls = useAction(api.processing.getJobClipsWithUrls);

  // Fetch clips with URLs when processing completes
  useEffect(() => {
    const fetchClips = async () => {
      if (processingState === "READY" && !clips && !clipsLoading) {
        setClipsLoading(true);
        try {
          const result = await getClipsWithUrls({ jobId });
          if (result.clips && result.clips.length > 0) {
            setClips(result.clips);
          }
        } catch (err) {
          console.error("Failed to fetch clips with URLs:", err);
        } finally {
          setClipsLoading(false);
        }
      }
    };
    fetchClips();
  }, [jobId, processingState, clips, clipsLoading, getClipsWithUrls]);

  // Get step label
  const getStepLabel = (state: ProcessingState | null, step: string | null): string => {
    if (step) return step;

    switch (state) {
      case "UPLOADED":
        return "Queued for processing...";
      case "PROCESSING":
        return "AI is analyzing your video...";
      case "READY":
        return "Processing complete!";
      case "FAILED":
        return "Processing failed";
      default:
        return "Processing...";
    }
  };

  // Processing steps for visualization
  const steps = [
    { key: "upload", label: "Upload", icon: CloudUpload },
    { key: "queue", label: "Queue", icon: Loader2 },
    { key: "process", label: "Process", icon: Cpu },
    { key: "ready", label: "Ready", icon: CheckCircle2 },
  ];

  const getStepStatus = (stepKey: string): "completed" | "active" | "pending" => {
    switch (processingState) {
      case "UPLOADED":
        if (stepKey === "upload") return "completed";
        if (stepKey === "queue") return "active";
        return "pending";
      case "PROCESSING":
        if (stepKey === "upload" || stepKey === "queue") return "completed";
        if (stepKey === "process") return "active";
        return "pending";
      case "READY":
        return "completed";
      case "FAILED":
        if (stepKey === "upload") return "completed";
        if (stepKey === "queue") return "completed";
        return "pending";
      default:
        if (stepKey === "upload") return "completed";
        return "pending";
    }
  };

  // Render processing state
  if (processingState === "READY") {
    return (
      <div className="py-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/10">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
            {clips?.length || 0} Clips Generated!
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Your AI-generated clips are ready to view and download.
          </p>
        </div>

        {/* Clips loading */}
        {clipsLoading && (
          <div className="mb-6 flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-red-500" />
            <span className="text-sm text-slate-500">Loading clips...</span>
          </div>
        )}

        {/* Clips preview */}
        {clips && clips.length > 0 && (
          <div className="mb-6 max-h-64 space-y-2 overflow-y-auto">
            {clips.slice(0, 5).map((clip, idx) => (
              <div
                key={clip._id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded bg-red-600 text-xs font-bold text-white">
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-900 dark:text-white">
                    {clip.title || `Clip ${idx + 1}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    Score: {clip.score || 0}% • {Math.round(clip.duration || 0)}s
                  </p>
                </div>
                {/* Download button with signed URL */}
                {clip.clipUrl && (
                  <a
                    href={clip.clipUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                    title="Download clip"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
                {/* Fallback icon when no URL yet */}
                {!clip.clipUrl && clip.r2ClipKey && (
                  <div className="flex items-center gap-1">
                    <Film className="h-4 w-4 text-slate-400" />
                  </div>
                )}
              </div>
            ))}
            {clips.length > 5 && (
              <p className="pt-2 text-center text-xs text-slate-500">
                Showing 5 of {clips.length} clips
              </p>
            )}
          </div>
        )}

        <div className="flex justify-center gap-3">
          <button
            onClick={onStartNew}
            className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Upload Another
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition-all hover:bg-red-500"
            >
              View All Clips
            </button>
          )}
        </div>
      </div>
    );
  }

  // Render failed state
  if (processingState === "FAILED") {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
          Processing Failed
        </h3>
        <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
          {processingStep || "Something went wrong during processing."}
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={onStartNew}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition-all hover:bg-red-500"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Render processing state
  return (
    <div className="py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="relative">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-slate-200 dark:border-slate-700">
            <Sparkles className="h-5 w-5 text-red-500" />
          </div>
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-red-500" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900 dark:text-white">
            AI Processing
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {getStepLabel(processingState, processingStep)}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full bg-red-500 transition-all duration-500 ease-out"
            style={{ width: `${processingProgress}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between">
          <span className="text-xs text-slate-500">
            {processingProgress}% complete
          </span>
          <span className="text-xs text-slate-500">
            {processingState === "UPLOADED" ? "Waiting" : "Processing"}
          </span>
        </div>
      </div>

      {/* Steps visualization */}
      <div className="mb-6 grid grid-cols-4 gap-1 text-center text-xs">
        {steps.map(({ key, label, icon: Icon }) => {
          const status = getStepStatus(key);
          return (
            <div key={key} className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  status === "completed"
                    ? "bg-green-500 text-white"
                    : status === "active"
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-slate-200 text-slate-400 dark:bg-slate-700"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span
                className={
                  status === "active"
                    ? "text-red-500 dark:text-red-400"
                    : status === "completed"
                      ? "text-green-600 dark:text-green-400"
                      : "text-slate-400 dark:text-slate-600"
                }
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-slate-500">
        Processing typically takes 3-6 minutes depending on video length.
        <br />
        Progress updates in real-time.
      </p>
    </div>
  );
};

export default JobStatus;
