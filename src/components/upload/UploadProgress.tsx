"use client";

import type { FC } from "react";
import { Pause, Play, X, CloudUpload, CheckCircle2, Loader2 } from "lucide-react";
import type { UploadState } from "@/hooks/useResumableUpload";

interface UploadProgressProps {
  state: UploadState;
  progress: number;
  uploadedBytes: number;
  totalBytes: number;
  currentPart: number;
  totalParts: number;
  fileName?: string;
  onPause: () => void;
  onResume: () => Promise<void>;
  onCancel: () => Promise<void>;
}

export const UploadProgress: FC<UploadProgressProps> = ({
  state,
  progress,
  uploadedBytes,
  totalBytes,
  currentPart,
  totalParts,
  fileName,
  onPause,
  onResume,
  onCancel,
}) => {
  // Format bytes
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Get status label
  const getStatusLabel = (): string => {
    switch (state) {
      case "creating_job":
        return "Creating job...";
      case "starting_upload":
        return "Starting upload...";
      case "uploading":
        return `Uploading part ${currentPart} of ${totalParts}`;
      case "completing":
        return "Finalizing upload...";
      case "paused":
        return "Upload paused";
      default:
        return "Processing...";
    }
  };

  // Get status icon
  const StatusIcon = () => {
    if (state === "paused") {
      return <Pause className="h-5 w-5 text-amber-500" />;
    }
    if (state === "completing") {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }
    return <CloudUpload className="h-5 w-5 text-red-500" />;
  };

  const isUploading = state === "uploading";
  const isPaused = state === "paused";
  const canPause = isUploading;
  const canResume = isPaused;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-slate-200 dark:border-slate-700">
            <StatusIcon />
          </div>
          {(state === "uploading" || state === "creating_job" || state === "starting_upload" || state === "completing") && (
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-red-500" />
          )}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900 dark:text-white">
            {state === "paused" ? "Upload Paused" : "Uploading Video"}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {getStatusLabel()}
          </p>
        </div>
      </div>

      {/* File name */}
      {fileName && (
        <p className="mb-4 truncate text-sm text-slate-600 dark:text-slate-400">
          {fileName}
        </p>
      )}

      {/* Progress bar */}
      <div className="mb-2">
        <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-full transition-all duration-300 ease-out ${
              isPaused
                ? "bg-amber-500"
                : "bg-gradient-to-r from-red-500 to-red-600"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Progress details */}
      <div className="mb-4 flex justify-between text-sm">
        <span className="text-slate-500 dark:text-slate-400">
          {formatSize(uploadedBytes)} / {formatSize(totalBytes)}
        </span>
        <span className="font-medium text-slate-900 dark:text-white">
          {progress}%
        </span>
      </div>

      {/* Part progress */}
      {totalParts > 1 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: totalParts }, (_, i) => {
              const partNum = i + 1;
              const isCompleted = partNum <= currentPart;
              const isCurrent = partNum === currentPart && state === "uploading";

              return (
                <div
                  key={partNum}
                  className={`h-1.5 flex-1 min-w-[4px] max-w-[20px] rounded-full transition-colors ${
                    isCompleted
                      ? "bg-green-500"
                      : isCurrent
                        ? "bg-red-500 animate-pulse"
                        : "bg-slate-200 dark:bg-slate-700"
                  }`}
                  title={`Part ${partNum}`}
                />
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {currentPart} of {totalParts} parts uploaded
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-3">
        {canPause && (
          <button
            onClick={onPause}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Pause className="h-4 w-4" />
            Pause
          </button>
        )}
        {canResume && (
          <button
            onClick={onResume}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
          >
            <Play className="h-4 w-4" />
            Resume
          </button>
        )}
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>
      </div>

      {/* Resume info */}
      {isPaused && (
        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
          Your upload progress is saved. You can resume anytime.
        </p>
      )}
    </div>
  );
};

export default UploadProgress;
