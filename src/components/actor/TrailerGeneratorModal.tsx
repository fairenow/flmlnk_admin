"use client";

import type { FC, FormEvent, ChangeEvent, DragEvent, ReactNode } from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  X,
  Film,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Clock,
  Upload,
  FileText,
  Search,
  Scissors,
  Check,
  Clapperboard,
  Mic,
  Eye,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { useVideoJobUpload } from "@/hooks/useVideoJobUpload";

type TrailerGeneratorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  actorProfileId?: Id<"actor_profiles">;
  onJobCreated?: (jobId: Id<"trailer_jobs">) => void;
};

type JobStatus = "idle" | "submitting" | "processing" | "analysis_ready" | "plan_ready" | "completed" | "failed" | "stalled";

// Supported video formats for feature films
const SUPPORTED_FORMATS = [
  "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
  "video/x-matroska", "video/mxf", "application/mxf", "video/mpeg",
  "video/mp2t", "video/x-m4v", "video/x-prores",
];
const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; // 50GB for feature films

// Job is considered stalled if no progress updates for 10 minutes
const STALE_JOB_THRESHOLD_MS = 10 * 60 * 1000;
// Maximum time a job can be processing before we consider it failed (30 minutes)
const MAX_JOB_DURATION_MS = 30 * 60 * 1000;

// Profile type from the query
type TrailerProfile = {
  _id: Id<"trailer_profiles">;
  key: string;
  label: string;
  description?: string;
  durationTargetSec: number;
  durationMinSec?: number;
  durationMaxSec?: number;
  structure?: string[];
  isBuiltIn?: boolean;
};

export const TrailerGeneratorModal: FC<TrailerGeneratorModalProps> = ({
  isOpen,
  onClose,
  slug,
  actorProfileId,
  onJobCreated,
}) => {
  // Status state
  const [status, setStatus] = useState<JobStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [currentJobId, setCurrentJobId] = useState<Id<"trailer_jobs"> | null>(null);
  const [lastProgressTime, setLastProgressTime] = useState<number | null>(null);
  const [jobStartTime, setJobStartTime] = useState<number | null>(null);
  const lastProgressRef = useRef<number | null>(null);

  // Profile selection
  const [selectedProfileId, setSelectedProfileId] = useState<Id<"trailer_profiles"> | null>(null);
  const [showProfileSelector, setShowProfileSelector] = useState(false);

  // Local file upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Query for profiles
  const profiles = useQuery(api.trailerProfiles.listProfiles, { includeBuiltIn: true });

  // Mutation to ensure built-in profiles exist
  const ensureProfiles = useMutation(api.trailerProfiles.ensureBuiltInProfiles);

  // Mutations for trailer job flow
  const createLocalVideoJob = useMutation(api.videoJobsDb.createLocalVideoJob);
  const createTrailerJobAndTrigger = useMutation(api.videoJobsDb.createTrailerJobAndTrigger);

  // Video job ID state (for the source video upload)
  const [videoJobId, setVideoJobId] = useState<Id<"video_jobs"> | null>(null);

  // Video upload hook - uses video_jobs flow (correct for trailers)
  const {
    state: uploadState,
    progress: uploadProgress,
    uploadedBytes,
    totalBytes,
    error: uploadError,
    jobStatus,
    startUpload: startVideoUpload,
  } = useVideoJobUpload(videoJobId);

  // Track total parts for display (estimate based on 10MB parts)
  const totalParts = totalBytes > 0 ? Math.ceil(totalBytes / (10 * 1024 * 1024)) : 0;
  const currentPart = uploadProgress > 0 && totalParts > 0 ? Math.ceil((uploadProgress / 100) * totalParts) : 0;

  // Watch for video upload completion to create trailer job
  useEffect(() => {
    async function createTrailerJob() {
      if (jobStatus === "UPLOADED" && videoJobId && selectedProfileId && !currentJobId) {
        console.log("Video upload complete, creating trailer job...");
        try {
          const trailerJobId = await createTrailerJobAndTrigger({
            videoJobId,
            profileId: selectedProfileId,
          });
          console.log("Trailer job created:", trailerJobId);
          setCurrentJobId(trailerJobId);
          onJobCreated?.(trailerJobId);
        } catch (err) {
          console.error("Failed to create trailer job:", err);
          setErrorMessage(err instanceof Error ? err.message : "Failed to create trailer job");
          setStatus("failed");
        }
      }
    }
    createTrailerJob();
  }, [jobStatus, videoJobId, selectedProfileId, currentJobId, createTrailerJobAndTrigger, onJobCreated]);

  // Handle upload errors
  useEffect(() => {
    if (uploadError) {
      setErrorMessage(uploadError);
      setStatus("failed");
    }
  }, [uploadError]);

  // Real-time subscription to trailer job status
  const job = useQuery(
    api.trailerJobs.getTrailerJob,
    currentJobId ? { jobId: currentJobId } : "skip"
  );

  // Ensure built-in profiles exist when modal opens
  const [hasSeededProfiles, setHasSeededProfiles] = useState(false);
  useEffect(() => {
    // If profiles query returned empty array and we haven't tried seeding yet
    if (isOpen && profiles !== undefined && profiles.length === 0 && !hasSeededProfiles) {
      setHasSeededProfiles(true);
      ensureProfiles().catch(console.error);
    }
  }, [isOpen, profiles, hasSeededProfiles, ensureProfiles]);

  // Set default profile when profiles load
  useEffect(() => {
    if (profiles && profiles.length > 0 && !selectedProfileId) {
      // Default to "theatrical" profile if available
      const theatrical = profiles.find((p) => p.key === "theatrical");
      setSelectedProfileId(theatrical?._id || profiles[0]._id);
    }
  }, [profiles, selectedProfileId]);

  // Track progress updates to detect stalled jobs
  useEffect(() => {
    if (job && job.progress !== undefined) {
      const currentProgress = job.progress;
      if (lastProgressRef.current !== currentProgress) {
        lastProgressRef.current = currentProgress;
        setLastProgressTime(Date.now());
      }
    }
  }, [job?.progress]);

  // Check for stalled or timed-out jobs
  useEffect(() => {
    if (status !== "processing" || !jobStartTime) return;

    const checkStaleJob = () => {
      const now = Date.now();

      // Check if job has exceeded maximum duration
      if (now - jobStartTime > MAX_JOB_DURATION_MS) {
        setStatus("failed");
        setErrorMessage("Job timed out. The processing took too long. Please try again with a shorter video.");
        return;
      }

      // Check if job is stalled (no progress updates)
      if (lastProgressTime && (now - lastProgressTime > STALE_JOB_THRESHOLD_MS)) {
        setStatus("stalled");
        setErrorMessage("Job appears to be stalled. No progress updates received for several minutes.");
      }
    };

    // Check immediately and then every 30 seconds
    checkStaleJob();
    const interval = setInterval(checkStaleJob, 30000);
    return () => clearInterval(interval);
  }, [status, jobStartTime, lastProgressTime]);

  // Update status based on real-time job updates
  useEffect(() => {
    if (job) {
      if (job.status === "READY") {
        setStatus("completed");
      } else if (job.status === "FAILED") {
        setStatus("failed");
        setErrorMessage(job.error || "Job failed. Please try again.");
      } else if (job.status === "ANALYSIS_READY") {
        setStatus("analysis_ready");
      } else if (job.status === "PLAN_READY") {
        setStatus("plan_ready");
      } else if ([
        "CREATED", "UPLOADING", "UPLOADED", "CLAIMED",
        "PROXY_GENERATING", "TRANSCRIBING", "SCENE_DETECTING",
        "ANALYZING", "PLANNING", "RENDERING", "UPLOADING_OUTPUTS"
      ].includes(job.status)) {
        // Only update to processing if not already in a special state
        if (status !== "stalled" && status !== "analysis_ready" && status !== "plan_ready") {
          setStatus("processing");
        }
        // If we receive updates after being stalled, recover
        if (status === "stalled" && job.progress !== undefined && job.progress > (lastProgressRef.current || 0)) {
          setStatus("processing");
          setErrorMessage("");
        }
      }
    }
  }, [job, status]);

  const handleClose = useCallback(() => {
    // Allow closing if not actively submitting or uploading
    if (status === "submitting" || uploadState === "uploading") {
      return;
    }
    // Reset state
    setStatus("idle");
    setErrorMessage("");
    setCurrentJobId(null);
    setVideoJobId(null);
    setLastProgressTime(null);
    setJobStartTime(null);
    lastProgressRef.current = null;
    setSelectedFile(null);
    onClose();
  }, [onClose, status, uploadState]);

  const handleStartNew = useCallback(() => {
    setStatus("idle");
    setErrorMessage("");
    setCurrentJobId(null);
    setVideoJobId(null);
    setLastProgressTime(null);
    setJobStartTime(null);
    lastProgressRef.current = null;
    setSelectedFile(null);
  }, []);

  // File upload handlers
  const validateFile = useCallback((file: File): string | null => {
    const isSupportedType = SUPPORTED_FORMATS.includes(file.type);
    const isMxfExtension = file.name.toLowerCase().endsWith('.mxf');
    const isProresExtension = file.name.toLowerCase().endsWith('.mov');
    if (!isSupportedType && !isMxfExtension && !isProresExtension) {
      return "Unsupported format. Supported: MP4, MOV, MXF, AVI, WebM, MKV, ProRes.";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "File too large. Maximum size is 50GB.";
    }
    if (file.size < 100 * 1024 * 1024) {
      return "File too small. Feature films should be at least 100MB.";
    }
    return null;
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    const validationErr = validateFile(file);
    if (validationErr) {
      setErrorMessage(validationErr);
      return;
    }
    setErrorMessage("");
    setSelectedFile(file);
  }, [validateFile]);

  const handleFileInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

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

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleClearFile = useCallback(() => {
    setSelectedFile(null);
    setErrorMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleStartFileUpload = useCallback(async () => {
    if (!selectedFile || !selectedProfileId) return;

    setStatus("submitting");
    setJobStartTime(Date.now());
    setLastProgressTime(Date.now());
    lastProgressRef.current = null;

    try {
      // Step 1: Create video job for the source file
      console.log("Creating video job for:", selectedFile.name);
      const newVideoJobId = await createLocalVideoJob({
        title: selectedFile.name,
        actorProfileId,
      });
      console.log("Video job created:", newVideoJobId);
      setVideoJobId(newVideoJobId);

      // Step 2: Start the upload (useVideoJobUpload will handle the rest)
      await startVideoUpload(selectedFile, newVideoJobId);
      setStatus("processing");
    } catch (err) {
      setStatus("failed");
      const errorMsg = err instanceof Error ? err.message : "Failed to start upload";
      setErrorMessage(errorMsg);
    }
  }, [selectedFile, selectedProfileId, actorProfileId, createLocalVideoJob, startVideoUpload]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      return `${hours}:${remainingMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Helper to get step label
  const getStepLabel = (stepStatus: string | undefined): string => {
    switch (stepStatus) {
      case "CREATED":
        return "Job created...";
      case "UPLOADING":
        return "Uploading video...";
      case "UPLOADED":
        return "Upload complete...";
      case "CLAIMED":
        return "Processing claimed...";
      case "PROXY_GENERATING":
        return "Generating 720p proxy...";
      case "TRANSCRIBING":
        return "Transcribing dialogue with Whisper...";
      case "SCENE_DETECTING":
        return "Detecting scene boundaries...";
      case "ANALYZING":
        return "Analyzing content with AI...";
      case "ANALYSIS_READY":
        return "Analysis complete!";
      case "PLANNING":
        return "Generating timestamp plan...";
      case "PLAN_READY":
        return "Plan ready for review...";
      case "RENDERING":
        return "Rendering trailer clips...";
      case "UPLOADING_OUTPUTS":
        return "Uploading final files...";
      case "READY":
        return "Complete!";
      case "FAILED":
        return "Processing failed";
      default:
        return job?.currentStep || "Processing...";
    }
  };

  const selectedProfile = profiles?.find((p) => p._id === selectedProfileId);

  if (!isOpen) return null;

  const inputClasses =
    "w-full rounded-lg border border-indigo-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 focus:outline-none transition-colors dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-indigo-200 dark:border-slate-700">
        {/* Close Button - Sticky at top */}
        <button
          type="button"
          onClick={handleClose}
          disabled={status === "submitting"}
          className="absolute top-4 right-4 z-10 p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm"
          title={status === "processing" ? "Close and abandon job" : "Close"}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6 pr-8">
            <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
              <Clapperboard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">AI Trailer Generator</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Create professional trailers from your feature film
              </p>
            </div>
          </div>

          {/* Content based on status - Idle state */}
          {status === "idle" && uploadState === "idle" && !selectedFile && (
            <div className="space-y-4">
              {/* Profile Selector */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Trailer Style
                </label>
                {profiles === undefined ? (
                  /* Loading state while profiles are being fetched */
                  <div className={`${inputClasses} flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                      <span className="text-slate-400">Loading styles...</span>
                    </div>
                  </div>
                ) : profiles.length === 0 ? (
                  /* Seeding state - profiles are being created */
                  <div className={`${inputClasses} flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                      <span className="text-slate-400">Setting up trailer styles...</span>
                    </div>
                  </div>
                ) : (
                <button
                  type="button"
                  onClick={() => setShowProfileSelector(!showProfileSelector)}
                  className={`${inputClasses} flex items-center justify-between`}
                >
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-indigo-500" />
                    <span>{selectedProfile?.label || "Select a style..."}</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showProfileSelector ? "rotate-180" : ""}`} />
                </button>
                )}

                {showProfileSelector && profiles && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden">
                    {profiles.map((profile) => (
                      <button
                        key={profile._id}
                        type="button"
                        onClick={() => {
                          setSelectedProfileId(profile._id);
                          setShowProfileSelector(false);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                          selectedProfileId === profile._id ? "bg-indigo-50 dark:bg-indigo-500/10" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              {profile.label}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {profile.description}
                            </p>
                          </div>
                          <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                            {formatDuration(profile.durationTargetSec)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedProfile && !showProfileSelector && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedProfile.description}
                  </p>
                )}
              </div>

              {/* File Upload Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all ${
                  isDragging
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                    : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:border-indigo-500 dark:hover:bg-slate-800/50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={SUPPORTED_FORMATS.join(",")}
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-full bg-indigo-100 p-4 dark:bg-indigo-500/20">
                    <Film className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      Drop your feature film here
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      or click to browse
                    </p>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    MP4, MOV, MXF, ProRes • Max 50GB
                  </p>
                </div>
              </div>

              {errorMessage && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-100 border border-red-300 text-red-600 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="pt-4 border-t border-indigo-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 text-center">
                  Trailer generation typically takes 10-20 minutes for a 2-hour film.
                  Cost: ~$1-1.50 per film (transcription + AI analysis + rendering).
                </p>
              </div>
            </div>
          )}

          {/* File Selected State - Ready to Upload */}
          {status === "idle" && uploadState === "idle" && selectedFile && (
            <div className="space-y-4">
              {/* Selected file preview */}
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="rounded-lg bg-indigo-100 p-3 dark:bg-indigo-500/20">
                  <Film className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-slate-900 dark:text-white">
                    {selectedFile.name}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClearFile}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Profile Selection Summary */}
              {selectedProfile && (
                <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/10">
                  <SlidersHorizontal className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
                      {selectedProfile.label}
                    </p>
                    <p className="text-xs text-indigo-700 dark:text-indigo-300">
                      Target duration: {formatDuration(selectedProfile.durationTargetSec)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowProfileSelector(true)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Profile Selector (if open) */}
              {showProfileSelector && profiles && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                  {profiles.map((profile) => (
                    <button
                      key={profile._id}
                      type="button"
                      onClick={() => {
                        setSelectedProfileId(profile._id);
                        setShowProfileSelector(false);
                      }}
                      className={`w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                        selectedProfileId === profile._id ? "bg-indigo-50 dark:bg-indigo-500/10" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            {profile.label}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {profile.description}
                          </p>
                        </div>
                        <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                          {formatDuration(profile.durationTargetSec)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {errorMessage && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-100 border border-red-300 text-red-600 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Start upload button */}
              <button
                type="button"
                onClick={handleStartFileUpload}
                disabled={!selectedProfileId}
                className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-indigo-500 hover:to-purple-500 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="flex items-center justify-center gap-2">
                  <Clapperboard className="h-5 w-5" />
                  Generate Trailer
                </span>
              </button>

              <div className="pt-4 border-t border-indigo-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 text-center">
                  Your film will be uploaded securely and processed using AI to identify the best moments for your trailer.
                </p>
              </div>
            </div>
          )}

          {/* File Upload Progress State */}
          {(uploadState === "starting" ||
            uploadState === "uploading" ||
            uploadState === "completing") && (
            <div className="space-y-4">
              {/* Upload Header */}
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full border-4 border-indigo-200 dark:border-slate-700" />
                  <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
                  <Upload className="absolute inset-0 m-auto w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {uploadState === "starting"
                      ? "Preparing Upload..."
                      : uploadState === "completing"
                      ? "Finalizing..."
                      : "Uploading..."}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {selectedFile?.name}
                  </p>
                </div>
              </div>

              {/* Upload Progress Bar */}
              <div className="space-y-2">
                <div className="relative">
                  <div className="h-3 bg-indigo-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-300 ease-out bg-gradient-to-r from-indigo-500 to-purple-500"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{Math.round(uploadProgress)}% uploaded</span>
                  <span>
                    {formatFileSize(uploadedBytes)} / {formatFileSize(totalBytes)}
                  </span>
                </div>
                {totalParts > 0 && (
                  <p className="text-xs text-slate-400 text-center">
                    Part {currentPart} of {totalParts}
                  </p>
                )}
              </div>

              {uploadError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-100 border border-red-300 text-red-600 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>
          )}

          {/* Processing State */}
          {(status === "processing" || status === "submitting") && uploadState === "completed" && (
            <div className="py-6">
              {/* Processing Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full border-4 border-indigo-200 dark:border-slate-700" />
                  <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
                  <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    AI Trailer Generation
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {getStepLabel(job?.status)}
                  </p>
                </div>
              </div>

              {/* Processing Progress Bar */}
              <div className="space-y-4">
                <div className="relative">
                  <div className="h-2 bg-indigo-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out"
                      style={{ width: `${job?.progress || 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-xs text-slate-500">
                      {job?.progress || 0}% complete
                    </span>
                    <span className="text-xs text-slate-500">
                      Processing film
                    </span>
                  </div>
                </div>

                {/* Processing Steps */}
                <div className="grid grid-cols-7 gap-1 text-[10px] text-center">
                  {["proxy", "transcribe", "scenes", "analyze", "plan", "render", "done"].map((step, idx) => {
                    const stepThresholds = [10, 25, 40, 55, 70, 90, 100];
                    const isActive = (job?.progress || 0) >= stepThresholds[idx - 1] && (job?.progress || 0) < stepThresholds[idx];
                    const isComplete = (job?.progress || 0) >= stepThresholds[idx];

                    const stepIcons: Record<string, ReactNode> = {
                      proxy: <Film className="w-3.5 h-3.5" />,
                      transcribe: <Mic className="w-3.5 h-3.5" />,
                      scenes: <Eye className="w-3.5 h-3.5" />,
                      analyze: <Search className="w-3.5 h-3.5" />,
                      plan: <FileText className="w-3.5 h-3.5" />,
                      render: <Scissors className="w-3.5 h-3.5" />,
                      done: <Check className="w-3.5 h-3.5" />,
                    };

                    return (
                      <div key={step} className="flex flex-col items-center gap-1">
                        <div
                          className={`w-5 h-5 rounded-full transition-colors flex items-center justify-center ${
                            isActive
                              ? "bg-indigo-500 text-white animate-pulse"
                              : isComplete
                                ? "bg-green-500 text-white"
                                : "bg-indigo-100 text-indigo-300 dark:bg-slate-700 dark:text-slate-500"
                          }`}
                        >
                          {stepIcons[step]}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-slate-500 text-center">
                  Trailer generation typically takes 10-20 minutes depending on film length.
                </p>
              </div>
            </div>
          )}

          {/* Analysis Ready State - Can regenerate plan */}
          {status === "analysis_ready" && (
            <div className="py-6">
              <div className="text-center mb-6">
                <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center">
                  <Search className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  Analysis Complete
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                  Your film has been analyzed. The AI is now generating a timestamp plan for your trailer.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-amber-100 border border-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30">
                <Loader2 className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400" />
                <span className="text-sm text-amber-600 dark:text-amber-400">
                  Generating timestamp plan...
                </span>
              </div>
            </div>
          )}

          {/* Plan Ready State - Ready for render */}
          {status === "plan_ready" && (
            <div className="py-6">
              <div className="text-center mb-6">
                <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center">
                  <FileText className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  Plan Ready
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                  The AI has selected the best moments for your trailer. Rendering will begin shortly.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-green-100 border border-green-300 dark:bg-green-500/10 dark:border-green-500/30">
                <Loader2 className="w-4 h-4 animate-spin text-green-600 dark:text-green-400" />
                <span className="text-sm text-green-600 dark:text-green-400">
                  Starting render process...
                </span>
              </div>
            </div>
          )}

          {/* Completed State */}
          {status === "completed" && (
            <div className="py-6">
              <div className="text-center mb-6">
                <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  Trailer Generated!
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                  Your AI-generated trailer is ready to view and download.
                </p>
              </div>

              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleStartNew}
                  className="px-4 py-2 rounded-lg border border-indigo-300 text-slate-700 hover:bg-indigo-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  Generate Another
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-all"
                >
                  View Trailer
                </button>
              </div>
            </div>
          )}

          {/* Stalled State */}
          {status === "stalled" && (
            <div className="py-6">
              <div className="text-center mb-6">
                <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center">
                  <Clock className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  Job Appears Stalled
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm mb-2">
                  {errorMessage || "No progress updates received for several minutes."}
                </p>
                <p className="text-slate-500 text-xs">
                  This could be due to high server load or a temporary issue.
                </p>
              </div>

              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleStartNew}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  Start Over
                </button>
              </div>
            </div>
          )}

          {/* Failed State */}
          {status === "failed" && (
            <div className="py-8 text-center">
              <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Generation Failed
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-2">
                {errorMessage || "Something went wrong while generating the trailer."}
              </p>
              <p className="text-slate-500 text-xs mb-6">
                Please check the video file and try again.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleStartNew}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
        {/* End Scrollable Content Area */}
      </div>
    </div>
  );
};

export default TrailerGeneratorModal;
