"use client";

import type { FC, ChangeEvent, DragEvent } from "react";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  X,
  Pause,
  Play,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Film,
  CloudUpload,
} from "lucide-react";
import { useResumableUpload, type UploadJobOptions } from "@/hooks/useResumableUpload";
import type { Id } from "@convex/_generated/dataModel";
import { UploadProgress } from "./UploadProgress";
import { JobStatus } from "./JobStatus";

interface VideoUploaderProps {
  onJobCreated?: (jobId: Id<"processing_jobs">) => void;
  onUploadComplete?: (jobId: Id<"processing_jobs">) => void;
  onProcessingComplete?: (jobId: Id<"processing_jobs">) => void;
  onClose?: () => void;
  defaultClipCount?: number;
  defaultLayout?: string;
  actorProfileId?: Id<"actor_profiles">;
  className?: string;
}

// Supported video formats - Professional & Distribution
const SUPPORTED_FORMATS = [
  // Distribution formats
  "video/mp4",                // MP4 - Web/social distribution
  "video/webm",               // WebM - Web streaming
  // Post-production formats
  "video/quicktime",          // MOV - ProRes, DNxHR, Animation
  "video/x-msvideo",          // AVI - Legacy/DV
  "video/x-matroska",         // MKV - Open container
  // Broadcast/Studio formats
  "video/mxf",                // MXF - Broadcast interchange
  "application/mxf",          // MXF - Alternative MIME type
  // Additional professional formats
  "video/mpeg",               // MPEG - Legacy broadcast
  "video/mp2t",               // MPEG-TS - Transport stream
  "video/x-m4v",              // M4V - Apple variant
];

const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB for professional files

export const VideoUploader: FC<VideoUploaderProps> = ({
  onJobCreated,
  onUploadComplete,
  onProcessingComplete,
  onClose,
  defaultClipCount = 5,
  defaultLayout = "standard",
  actorProfileId,
  className = "",
}) => {
  // Upload hook
  const {
    state,
    progress,
    uploadedBytes,
    totalBytes,
    currentPart,
    totalParts,
    error,
    errorStage,
    jobId,
    processingState,
    processingProgress,
    processingStep,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    reset,
  } = useResumableUpload({
    onJobCreated,
    onUploadComplete,
    onProcessingComplete,
    onError: (err, stage) => console.error(`Upload error at ${stage}:`, err),
  });

  // Local state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clipCount, setClipCount] = useState(defaultClipCount);
  const [layout, setLayout] = useState(defaultLayout);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validate file
  const validateFile = useCallback((file: File): string | null => {
    // Check MIME type or fall back to extension check for MXF
    const isSupportedType = SUPPORTED_FORMATS.includes(file.type);
    const isMxfExtension = file.name.toLowerCase().endsWith('.mxf');

    if (!isSupportedType && !isMxfExtension) {
      return `Unsupported format. Supported: MP4, MOV, MXF, AVI, WebM, MKV, MPEG.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is 10GB.`;
    }
    if (file.size < 1024 * 1024) {
      return `File too small. Minimum size is 1MB.`;
    }
    return null;
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(
    (file: File) => {
      const validationErr = validateFile(file);
      if (validationErr) {
        setValidationError(validationErr);
        return;
      }
      setValidationError(null);
      setSelectedFile(file);
    },
    [validateFile]
  );

  // File input change handler
  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  // Drag and drop handlers
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  // Start upload
  const handleStartUpload = useCallback(async () => {
    if (!selectedFile) return;

    const options: UploadJobOptions = {
      title: selectedFile.name,
      clipCount,
      layout,
      actorProfileId,
    };

    await startUpload(selectedFile, options);
  }, [selectedFile, clipCount, layout, actorProfileId, startUpload]);

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Clear file selection
  const handleClearFile = useCallback(() => {
    setSelectedFile(null);
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // Start new upload
  const handleStartNew = useCallback(() => {
    reset();
    handleClearFile();
  }, [reset, handleClearFile]);

  const inputClasses =
    "w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 focus:outline-none transition-colors dark:border-slate-600 dark:bg-slate-800 dark:text-white";

  // Render idle/file selection state
  if (state === "idle" && !selectedFile) {
    return (
      <div className={`space-y-4 ${className}`}>
        {/* Drag and drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all ${
            isDragging
              ? "border-red-500 bg-red-50 dark:bg-red-500/10"
              : "border-slate-300 hover:border-red-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:border-red-500 dark:hover:bg-slate-800/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={SUPPORTED_FORMATS.join(",")}
            onChange={handleInputChange}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-red-100 p-4 dark:bg-red-500/20">
              <CloudUpload className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">
                Drop your video here
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                or click to browse
              </p>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              MP4, MOV, MXF, AVI, WebM, MKV • Max 10GB
            </p>
          </div>
        </div>

        {validationError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-100 p-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{validationError}</span>
          </div>
        )}
      </div>
    );
  }

  // Render file selected state (before upload starts)
  if (state === "idle" && selectedFile) {
    return (
      <div className={`space-y-4 ${className}`}>
        {/* Selected file preview */}
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="rounded-lg bg-red-100 p-3 dark:bg-red-500/20">
            <Film className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate font-medium text-slate-900 dark:text-white">
              {selectedFile.name}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {formatSize(selectedFile.size)}
            </p>
          </div>
          <button
            onClick={handleClearFile}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Options */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="clip-count"
              className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Number of Clips
            </label>
            <select
              id="clip-count"
              value={clipCount}
              onChange={(e) => setClipCount(Number(e.target.value))}
              className={inputClasses}
            >
              <option value={3}>3 clips</option>
              <option value={5}>5 clips</option>
              <option value={8}>8 clips</option>
              <option value={10}>10 clips</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="layout"
              className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Video Layout
            </label>
            <select
              id="layout"
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
              className={inputClasses}
            >
              <option value="standard">Standard (9:16)</option>
              <option value="gaming">Gaming (Facecam)</option>
              <option value="podcast">Podcast (Split)</option>
            </select>
          </div>
        </div>

        {/* Start upload button */}
        <button
          onClick={handleStartUpload}
          className="w-full rounded-lg bg-red-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:bg-red-500 hover:shadow-xl"
        >
          <span className="flex items-center justify-center gap-2">
            <Upload className="h-5 w-5" />
            Start Upload
          </span>
        </button>
      </div>
    );
  }

  // Render uploading state
  if (
    state === "creating_job" ||
    state === "starting_upload" ||
    state === "uploading" ||
    state === "completing" ||
    state === "paused"
  ) {
    return (
      <div className={`space-y-4 ${className}`}>
        <UploadProgress
          state={state}
          progress={progress}
          uploadedBytes={uploadedBytes}
          totalBytes={totalBytes}
          currentPart={currentPart}
          totalParts={totalParts}
          fileName={selectedFile?.name}
          onPause={pauseUpload}
          onResume={resumeUpload}
          onCancel={cancelUpload}
        />
      </div>
    );
  }

  // Render completed/processing state
  if (state === "completed" && jobId) {
    return (
      <div className={`space-y-4 ${className}`}>
        <JobStatus
          jobId={jobId}
          processingState={processingState}
          processingProgress={processingProgress}
          processingStep={processingStep}
          onStartNew={handleStartNew}
          onClose={onClose}
        />
      </div>
    );
  }

  // Render error state
  if (state === "failed") {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
            Upload Failed
          </h3>
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
            {error || "Something went wrong during upload."}
          </p>
          {errorStage && (
            <p className="mb-6 text-xs text-slate-500">Stage: {errorStage}</p>
          )}

          <div className="flex justify-center gap-3">
            <button
              onClick={handleStartNew}
              className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Start Fresh
            </button>
            {selectedFile && (
              <button
                onClick={handleStartUpload}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition-all hover:bg-red-500"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default VideoUploader;
