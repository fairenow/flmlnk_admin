"use client";

import type { FC, FormEvent, ChangeEvent, DragEvent, ReactNode } from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import { useAction, useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { X, Wand2, Loader2, AlertCircle, CheckCircle2, Download, Sparkles, RefreshCw, Clock, Image, Upload, Link, Film, Pause, Play, FileText, Search, Users, Scissors, Check, ImagePlus, MessageSquare } from "lucide-react";
import { ThumbnailPicker } from "./ThumbnailPicker";
import { useResumableUpload } from "@/hooks/useResumableUpload";
import { useGifMemeUpload } from "@/hooks/useGifMemeUpload";
import { DurationSelector, type DurationRange } from "./DurationSelector";
import { CaptionStylePicker, type CaptionStyle } from "./CaptionStylePicker";
import { AspectRatioSelector, type AspectRatio } from "./AspectRatioSelector";
import { ToneSelector, type ClipTone } from "./ToneSelector";

type ClipGeneratorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  actorProfileId?: Id<"actor_profiles">;
  onJobCreated?: (jobId: Id<"clip_generation_jobs">) => void;
  onMemeJobCreated?: (jobId: Id<"meme_generation_jobs">) => void;
  onR2JobCreated?: (jobId: Id<"processing_jobs">) => void;
};

type JobStatus = "idle" | "submitting" | "processing" | "completed" | "failed" | "stalled";
type Layout = "standard" | "gaming" | "podcast";
type SourceType = "youtube" | "file";

// Supported video formats for local upload
const SUPPORTED_FORMATS = [
  "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
  "video/x-matroska", "video/mxf", "application/mxf", "video/mpeg",
  "video/mp2t", "video/x-m4v",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB

// Job is considered stalled if no progress updates for 5 minutes
const STALE_JOB_THRESHOLD_MS = 5 * 60 * 1000;
// Maximum time a job can be processing before we consider it failed (15 minutes)
const MAX_JOB_DURATION_MS = 15 * 60 * 1000;

export const ClipGeneratorModal: FC<ClipGeneratorModalProps> = ({
  isOpen,
  onClose,
  slug,
  actorProfileId,
  onJobCreated,
  onMemeJobCreated,
  onR2JobCreated,
}) => {
  // Source type toggle (YouTube URL vs Local File)
  // NOTE: YouTube URL option temporarily disabled - defaulting to file upload
  const [sourceType, setSourceType] = useState<SourceType>("file");

  // YouTube URL mode state
  const [videoUrl, setVideoUrl] = useState("");
  const [clipCount, setClipCount] = useState(5);
  const [layout, setLayout] = useState<Layout>("standard");
  const [status, setStatus] = useState<JobStatus>("idle");

  // Advanced clip generation controls
  const [durationRange, setDurationRange] = useState<DurationRange>({ min: 15, max: 60 });
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [clipTone, setClipTone] = useState<ClipTone>("viral");
  // Full video mode - process without clipping, just add captions/format
  const [fullVideoMode, setFullVideoMode] = useState(false);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>({
    highlightColor: "00FFFF",
    fontFamily: "Arial Black",
    fontSize: "medium",
    position: "center",
    style: "word-highlight",
    outline: true,
    shadow: true,
  });
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentJobId, setCurrentJobId] = useState<Id<"clip_generation_jobs"> | null>(null);
  const [currentMemeJobId, setCurrentMemeJobId] = useState<Id<"meme_generation_jobs"> | null>(null);
  const [currentYouTubeR2JobId, setCurrentYouTubeR2JobId] = useState<Id<"processing_jobs"> | null>(null);
  const [lastProgressTime, setLastProgressTime] = useState<number | null>(null);
  const [jobStartTime, setJobStartTime] = useState<number | null>(null);
  const lastProgressRef = useRef<number | null>(null);
  const [thumbnailPickerClip, setThumbnailPickerClip] = useState<{
    clipId: Id<"generated_clips"> | Id<"processing_clips">;
    downloadUrl: string;
    thumbnailUrl?: string;
    clipType: "generated" | "processing";
  } | null>(null);

  // Local file upload mode state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resumable upload hook for local files (standard, gaming, podcast layouts)
  const {
    state: uploadState,
    progress: uploadProgress,
    uploadedBytes,
    totalBytes,
    currentPart,
    totalParts,
    error: uploadError,
    jobId: r2JobId,
    processingState,
    processingProgress,
    processingStep,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    reset: resetUpload,
  } = useResumableUpload({
    onJobCreated: onR2JobCreated,
    onUploadComplete: (jobId) => {
      console.log("Upload complete, processing started:", jobId);
    },
    onProcessingComplete: (jobId) => {
      console.log("Processing complete:", jobId);
    },
    onError: (err, stage) => {
      console.error(`Upload error at ${stage}:`, err);
      setErrorMessage(err);
    },
  });

  // Meme upload hook for local files (meme layout)
  const {
    state: memeUploadState,
    progress: memeUploadProgress,
    uploadedBytes: memeUploadedBytes,
    totalBytes: memeTotalBytes,
    currentPart: memeCurrentPart,
    totalParts: memeTotalParts,
    error: memeUploadError,
    jobId: memeR2JobId,
    processingState: memeProcessingState,
    processingProgress: memeProcessingProgress,
    processingStep: memeProcessingStep,
    startUpload: startMemeUpload,
    pauseUpload: pauseMemeUpload,
    resumeUpload: resumeMemeUpload,
    cancelUpload: cancelMemeUpload,
    reset: resetMemeUpload,
  } = useGifMemeUpload({
    jobType: "meme",
    onJobCreated: (jobId) => {
      console.log("Meme upload job created:", jobId);
      onMemeJobCreated?.(jobId as Id<"meme_generation_jobs">);
    },
    onUploadComplete: (jobId) => {
      console.log("Meme upload complete, processing started:", jobId);
    },
    onProcessingComplete: (jobId) => {
      console.log("Meme processing complete:", jobId);
    },
    onError: (err, stage) => {
      console.error(`Meme upload error at ${stage}:`, err);
      setErrorMessage(err);
    },
  });

  // Determine which upload state to use based on layout
  const activeUploadState = layout === "meme" ? memeUploadState : uploadState;
  const activeUploadProgress = layout === "meme" ? memeUploadProgress : uploadProgress;
  const activeUploadedBytes = layout === "meme" ? memeUploadedBytes : uploadedBytes;
  const activeTotalBytes = layout === "meme" ? memeTotalBytes : totalBytes;
  const activeCurrentPart = layout === "meme" ? memeCurrentPart : currentPart;
  const activeTotalParts = layout === "meme" ? memeTotalParts : totalParts;
  const activeUploadError = layout === "meme" ? memeUploadError : uploadError;
  const activeProcessingState = layout === "meme" ? memeProcessingState : processingState;
  const activeProcessingProgress = layout === "meme" ? memeProcessingProgress : processingProgress;
  const activeProcessingStep = layout === "meme" ? memeProcessingStep : processingStep;

  // R2 job clips with signed URLs
  const [r2Clips, setR2Clips] = useState<Array<{
    _id: string;
    title?: string;
    description?: string;
    duration: number;
    score?: number;
    clipUrl: string | null;
    thumbUrl: string | null;
    r2ClipKey?: string;
  }> | null>(null);
  const [r2ClipsLoading, setR2ClipsLoading] = useState(false);
  const getClipsWithUrls = useAction(api.processing.getJobClipsWithUrls);

  // Clip generation hooks (legacy)
  const submitJob = useAction(api.clipGenerator.submitClipGenerationJob);
  const cancelJob = useMutation(api.clipGenerator.cancelJob);

  // Meme generation hooks (legacy - direct Modal call, uses yt-dlp)
  const submitMemeJob = useAction(api.memeGenerator.submitMemeGenerationJob);
  const cancelMemeJob = useMutation(api.memeGenerator.cancelMemeJob);

  // Klap API for YouTube clip generation (handles YouTube download internally)
  const submitToKlap = useAction(api.klap.submitToKlap);

  // Processing job creation
  const createProcessingJob = useMutation(api.processing.createJob);

  // YouTube download state
  const [isDownloadingYouTube, setIsDownloadingYouTube] = useState(false);
  const [youtubeDownloadProgress, setYoutubeDownloadProgress] = useState(0);

  // Real-time subscription to clip job status
  const job = useQuery(
    api.clipGenerator.getJob,
    currentJobId ? { jobId: currentJobId } : "skip"
  );

  // Real-time subscription to generated clips
  const clips = useQuery(
    api.clipGenerator.getClipsByJob,
    currentJobId ? { jobId: currentJobId } : "skip"
  );

  // Real-time subscription to meme job status
  const memeJob = useQuery(
    api.memeGenerator.getMemeJob,
    currentMemeJobId ? { jobId: currentMemeJobId } : "skip"
  );

  // Real-time subscription to generated memes
  const memes = useQuery(
    api.memeGenerator.getMemesByJob,
    currentMemeJobId ? { jobId: currentMemeJobId } : "skip"
  );

  // Real-time subscription to YouTube R2 job status (unified R2 flow)
  const youtubeR2Job = useQuery(
    api.processing.getJob,
    currentYouTubeR2JobId ? { jobId: currentYouTubeR2JobId } : "skip"
  );

  // Real-time subscription to processing clips (for Klap/YouTube R2 jobs)
  // Note: getJobClips is a query (not action) so it works with useQuery for real-time updates
  // URLs are fetched separately via getClipsWithUrls action when job completes
  const processingClipsData = useQuery(
    api.processing.getJobClips,
    currentYouTubeR2JobId ? { jobId: currentYouTubeR2JobId } : "skip"
  );

  // Use the appropriate job based on layout and job type
  // For non-meme YouTube URLs, we now use the unified R2 flow
  const activeJob = currentYouTubeR2JobId
    ? youtubeR2Job
    : layout === "meme"
      ? memeJob
      : job;

  // Use processing clips for Klap jobs, memes for meme jobs, else legacy clips
  // For YouTube R2 jobs: prefer r2Clips (which has URLs) when available, otherwise use processingClipsData
  const activeResults = currentYouTubeR2JobId
    ? (r2Clips || processingClipsData)
    : layout === "meme"
      ? memes
      : clips;

  // Track progress updates to detect stalled jobs
  useEffect(() => {
    if (activeJob && activeJob.progress !== undefined) {
      const currentProgress = activeJob.progress;
      if (lastProgressRef.current !== currentProgress) {
        lastProgressRef.current = currentProgress;
        setLastProgressTime(Date.now());
      }
    }
  }, [activeJob?.progress]);

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
    if (activeJob) {
      // Handle both "completed" (legacy) and "READY" (processing_jobs) statuses
      if (activeJob.status === "completed" || activeJob.status === "READY") {
        setStatus("completed");
      } else if (activeJob.status === "failed" || activeJob.status === "FAILED") {
        setStatus("failed");
        setErrorMessage(activeJob.errorMessage || activeJob.error || "Job failed. Please check the video URL and try again.");
      } else if (["pending", "downloading", "transcribing", "analyzing", "clipping", "uploading", "processing", "submitted", "extracting_frames", "generating_captions", "CREATED", "UPLOADING", "UPLOADED", "DOWNLOADING", "PROCESSING"].includes(activeJob.status)) {
        // Only update to processing if not already stalled
        if (status !== "stalled") {
          setStatus("processing");
        }
        // If we receive updates after being stalled, recover
        if (status === "stalled" && activeJob.progress !== undefined && activeJob.progress > (lastProgressRef.current || 0)) {
          setStatus("processing");
          setErrorMessage("");
        }
      }
    }
  }, [activeJob, status]);

  // Fetch R2 clips with signed URLs when processing completes
  // Works for both local file uploads (r2JobId) and YouTube URL submissions (currentYouTubeR2JobId)
  useEffect(() => {
    const fetchR2Clips = async () => {
      // Determine which job ID to use for fetching clips
      const jobIdToFetch = currentYouTubeR2JobId || r2JobId;
      const jobStatus = currentYouTubeR2JobId
        ? youtubeR2Job?.status
        : processingState;

      if (jobIdToFetch && (jobStatus === "READY") && !r2Clips && !r2ClipsLoading) {
        setR2ClipsLoading(true);
        try {
          const result = await getClipsWithUrls({ jobId: jobIdToFetch });
          if (result.clips && result.clips.length > 0) {
            setR2Clips(result.clips);
          }
        } catch (err) {
          console.error("Failed to fetch R2 clips with URLs:", err);
        } finally {
          setR2ClipsLoading(false);
        }
      }
    };
    fetchR2Clips();
  }, [r2JobId, currentYouTubeR2JobId, youtubeR2Job?.status, processingState, r2Clips, r2ClipsLoading, getClipsWithUrls]);

  const isValidYouTubeUrl = useCallback((url: string): boolean => {
    const patterns = [
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
      /^https?:\/\/youtu\.be\/[\w-]+/,
      /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
    ];
    return patterns.some((pattern) => pattern.test(url));
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (!videoUrl.trim()) {
        setErrorMessage("Please enter a YouTube URL");
        return;
      }

      if (!isValidYouTubeUrl(videoUrl)) {
        setErrorMessage("Please enter a valid YouTube URL");
        return;
      }

      setStatus("submitting");
      setErrorMessage("");
      setJobStartTime(Date.now());
      setLastProgressTime(Date.now());
      lastProgressRef.current = null;

      try {
        // KLAP API FLOW - Klap handles YouTube download and clip generation
        setIsDownloadingYouTube(true);
        setYoutubeDownloadProgress(5);

        // Step 1: Create a processing job
        // For YouTube/Klap: we fetch ALL clips (no clip count limit)
        const jobId = await createProcessingJob({
          inputType: "youtube",
          sourceUrl: videoUrl.trim(),
          actorProfileId,
          // clipCount not specified for YouTube - Klap generates all available clips
          layout,
          // Advanced options (only for non-meme layouts)
          ...(layout !== "meme" && {
            minClipDuration: durationRange.min,
            maxClipDuration: durationRange.max,
            aspectRatio,
            clipTone,
            fullVideoMode,
            captionStyle: {
              highlightColor: captionStyle.highlightColor,
              fontFamily: captionStyle.fontFamily,
              fontSize: captionStyle.fontSize,
              position: captionStyle.position,
              style: captionStyle.style,
              outline: captionStyle.outline,
              shadow: captionStyle.shadow,
            },
          }),
        });

        setYoutubeDownloadProgress(10);

        // Step 2: Submit to Klap API for clip generation
        // Klap will: download YouTube video → analyze → generate clips → return URLs
        // Use high maxClipCount to fetch ALL clips generated by Klap
        const klapResult = await submitToKlap({
          jobId,
          videoUrl: videoUrl.trim(),
          maxDuration: durationRange.max || 60,
          maxClipCount: 99, // Fetch all clips - Klap typically generates 5-15 clips
          language: "en",
        });

        if (!klapResult.success) {
          throw new Error(klapResult.error || "Failed to start video processing");
        }

        setYoutubeDownloadProgress(20);
        setIsDownloadingYouTube(false);

        // Step 3: Track the job - Klap polling will update job status automatically
        // Job status updates will be reflected via the real-time subscription
        setCurrentYouTubeR2JobId(jobId);
        setCurrentJobId(null);
        setCurrentMemeJobId(null);
        setStatus("processing");

        // Progress will continue via real-time job updates from Convex (Klap polling)
      } catch (err) {
        setIsDownloadingYouTube(false);
        setYoutubeDownloadProgress(0);
        setStatus("failed");
        const errorMsg = err instanceof Error ? err.message : "Failed to submit job";
        // Provide more helpful error messages for common issues
        if (errorMsg.includes("Modal API error") || errorMsg.includes("OpenAI API error")) {
          setErrorMessage("The generation service is temporarily unavailable. Please try again in a few minutes.");
        } else if (errorMsg.includes("Unauthorized")) {
          setErrorMessage("Authentication error. Please refresh the page and try again.");
        } else if (errorMsg.includes("network") || errorMsg.includes("fetch")) {
          setErrorMessage("Network error. Please check your connection and try again.");
        } else if (errorMsg.includes("OPENAI_API_KEY")) {
          setErrorMessage("Meme generation requires OpenAI API configuration. Please contact support.");
        } else {
          setErrorMessage(errorMsg);
        }
      }
    },
    [videoUrl, layout, slug, actorProfileId, submitToKlap, createProcessingJob, isValidYouTubeUrl, durationRange, aspectRatio, clipTone, fullVideoMode, captionStyle]
  );

  const handleClose = useCallback(() => {
    // Allow closing if not actively submitting, uploading, or downloading YouTube
    if (status === "submitting" || uploadState === "uploading" || memeUploadState === "uploading" || isDownloadingYouTube) {
      return;
    }
    // Reset YouTube mode state
    setVideoUrl("");
    setClipCount(5);
    setLayout("standard");
    setStatus("idle");
    setErrorMessage("");
    setCurrentJobId(null);
    setCurrentMemeJobId(null);
    setCurrentYouTubeR2JobId(null);
    setLastProgressTime(null);
    setJobStartTime(null);
    lastProgressRef.current = null;
    // Reset YouTube download state
    setIsDownloadingYouTube(false);
    setYoutubeDownloadProgress(0);
    // Reset file upload state
    setSelectedFile(null);
    setSourceType("youtube");
    // Reset advanced options
    setFullVideoMode(false);
    // Reset R2 clips state
    setR2Clips(null);
    setR2ClipsLoading(false);
    resetUpload();
    resetMemeUpload();
    onClose();
  }, [onClose, status, uploadState, memeUploadState, isDownloadingYouTube, resetUpload, resetMemeUpload]);

  const handleStartNew = useCallback(() => {
    // Reset YouTube mode state
    setVideoUrl("");
    setClipCount(5);
    setLayout("standard");
    setStatus("idle");
    setErrorMessage("");
    setCurrentJobId(null);
    setCurrentMemeJobId(null);
    setCurrentYouTubeR2JobId(null);
    setLastProgressTime(null);
    setJobStartTime(null);
    lastProgressRef.current = null;
    setThumbnailPickerClip(null);
    // Reset YouTube download state
    setIsDownloadingYouTube(false);
    setYoutubeDownloadProgress(0);
    // Reset file upload state
    setSelectedFile(null);
    setSourceType("youtube");
    // Reset advanced options
    setFullVideoMode(false);
    // Reset R2 clips state
    setR2Clips(null);
    setR2ClipsLoading(false);
    resetUpload();
    resetMemeUpload();
  }, [resetUpload, resetMemeUpload]);

  const handleCancelJob = useCallback(async () => {
    try {
      if (currentMemeJobId) {
        await cancelMemeJob({ slug, jobId: currentMemeJobId });
      } else if (currentJobId) {
        await cancelJob({ slug, jobId: currentJobId });
      } else {
        return;
      }
      setStatus("failed");
      setErrorMessage("Job cancelled by user.");
    } catch (err) {
      console.error("Failed to cancel job:", err);
      // Even if cancel fails, allow user to start fresh
      setStatus("failed");
      setErrorMessage("Could not cancel job on server, but you can start a new one.");
    }
  }, [currentJobId, currentMemeJobId, slug, cancelJob, cancelMemeJob]);

  const handleRetryJob = useCallback(() => {
    // Keep the video URL but reset everything else
    const savedUrl = videoUrl;
    handleStartNew();
    setVideoUrl(savedUrl);
  }, [videoUrl, handleStartNew]);

  // File upload handlers
  const validateFile = useCallback((file: File): string | null => {
    const isSupportedType = SUPPORTED_FORMATS.includes(file.type);
    const isMxfExtension = file.name.toLowerCase().endsWith('.mxf');
    if (!isSupportedType && !isMxfExtension) {
      return "Unsupported format. Supported: MP4, MOV, MXF, AVI, WebM, MKV, MPEG.";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "File too large. Maximum size is 10GB.";
    }
    if (file.size < 1024 * 1024) {
      return "File too small. Minimum size is 1MB.";
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
    if (!selectedFile) return;

    if (layout === "meme") {
      // Use meme upload flow for meme layout
      await startMemeUpload(selectedFile, {
        slug,
        memeCount: clipCount,
      });
    } else {
      // Use standard R2 upload flow for other layouts with advanced options
      await startUpload(selectedFile, {
        title: selectedFile.name,
        clipCount,
        layout,
        actorProfileId,
        // Advanced options
        minClipDuration: durationRange.min,
        maxClipDuration: durationRange.max,
        aspectRatio,
        clipTone,
        fullVideoMode,
        captionStyle: {
          highlightColor: captionStyle.highlightColor,
          fontFamily: captionStyle.fontFamily,
          fontSize: captionStyle.fontSize,
          position: captionStyle.position,
          style: captionStyle.style,
          outline: captionStyle.outline,
          shadow: captionStyle.shadow,
        },
      });
    }
  }, [selectedFile, clipCount, layout, actorProfileId, slug, startUpload, startMemeUpload, durationRange, aspectRatio, clipTone, fullVideoMode, captionStyle]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Helper to get step label
  const getStepLabel = (stepStatus: string | undefined): string => {
    switch (stepStatus) {
      case "pending":
        return "Initializing...";
      case "downloading":
        return "Downloading video...";
      case "transcribing":
        return "Transcribing audio with AI...";
      case "analyzing":
        return layout === "meme" ? "Analyzing frames with AI vision..." : "Analyzing content for viral clips...";
      case "extracting_frames":
        return "Extracting video frames...";
      case "generating_captions":
        return "Generating meme captions with AI...";
      case "clipping":
        return "Generating video clips...";
      case "uploading":
        return "Uploading to cloud...";
      case "completed":
        return "Complete!";
      case "failed":
        return "Processing failed";
      default:
        return activeJob?.currentStep || "Processing...";
    }
  };

  if (!isOpen) return null;

  const inputClasses =
    "w-full rounded-lg border border-red-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 focus:outline-none transition-colors dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-red-200 dark:border-slate-700">
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
            <div className="p-2 rounded-lg bg-red-600">
              <Wand2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">AI Clip Generator</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Generate highlights from your videos
              </p>
            </div>
          </div>

          {/* Content based on status - Idle state for YouTube mode */}
          {status === "idle" && activeUploadState === "idle" && !selectedFile && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Source Type Toggle */}
              <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setSourceType("youtube")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    sourceType === "youtube"
                      ? "bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <Link className="w-4 h-4" />
                  YouTube URL
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType("file")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    sourceType === "file"
                      ? "bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  Upload File
                </button>
              </div>

              {/* YouTube URL Input */}
              {sourceType === "youtube" && (
                <div>
                  <label
                    htmlFor="video-url"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                  >
                    YouTube Video URL
                  </label>
                  <input
                    type="url"
                    id="video-url"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    className={inputClasses}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Paste a YouTube video URL to extract AI-powered highlights
                  </p>
                </div>
              )}

              {/* File Upload Drop Zone */}
              {sourceType === "file" && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                    isDragging
                      ? "border-red-500 bg-red-50 dark:bg-red-500/10"
                      : "border-slate-300 hover:border-red-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:border-red-500 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={SUPPORTED_FORMATS.join(",")}
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-full bg-red-100 p-3 dark:bg-red-500/20">
                      <Upload className="h-6 w-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        Drop your video here
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        or click to browse
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      MP4, MOV, MXF, AVI, WebM, MKV • Max 10GB
                    </p>
                  </div>
                </div>
              )}

              {/* For YouTube mode: only show layout (all clips are fetched automatically) */}
              {/* For File mode: show both clip count and layout */}
              <div className={sourceType === "youtube" ? "" : "grid grid-cols-2 gap-4"}>
                {sourceType === "file" && (
                  <div>
                    <label
                      htmlFor="clip-count"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
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
                )}

                <div>
                  <label
                    htmlFor="layout"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                  >
                    Video Layout
                  </label>
                  <select
                    id="layout"
                    value={layout}
                    onChange={(e) => setLayout(e.target.value as Layout)}
                    className={inputClasses}
                  >
                    <option value="standard">Standard (9:16)</option>
                    <option value="gaming">Gaming (Facecam)</option>
                    <option value="podcast">Podcast (Split)</option>
                  </select>
                </div>
              </div>

              {/* Advanced Options */}
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="w-full flex items-center justify-between py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Advanced Options
                  </span>
                  <span className="text-xs text-slate-500">
                    {showAdvancedOptions ? "Hide" : "Show"}
                  </span>
                </button>

                {showAdvancedOptions && (
                  <div className="space-y-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    {/* Full Video Mode Toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Full Video Mode
                        </label>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Process entire video without clipping
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFullVideoMode(!fullVideoMode)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
                          fullVideoMode ? "bg-red-600" : "bg-slate-200 dark:bg-slate-600"
                        }`}
                        role="switch"
                        aria-checked={fullVideoMode}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            fullVideoMode ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {fullVideoMode && (
                      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30">
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Full video mode will add captions and apply format changes to the entire video without creating clips.
                        </p>
                      </div>
                    )}

                    {!fullVideoMode && (
                      <>
                        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                          <DurationSelector
                            value={durationRange}
                            onChange={setDurationRange}
                          />
                        </div>

                        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                          <ToneSelector
                            value={clipTone}
                            onChange={setClipTone}
                          />
                        </div>
                      </>
                    )}

                    <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                      <AspectRatioSelector
                        value={aspectRatio}
                        onChange={setAspectRatio}
                      />
                    </div>

                    <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                      <CaptionStylePicker
                        value={captionStyle}
                        onChange={setCaptionStyle}
                      />
                    </div>
                  </div>
                )}
              </div>

              {errorMessage && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-100 border border-red-300 text-red-600 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit button - YouTube mode */}
              {sourceType === "youtube" && (
                <>
                  <div className="pt-2">
                    <button
                      type="submit"
                      className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-500 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Generate Clips
                    </button>
                  </div>

                  <div className="pt-4 border-t border-red-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500 text-center">
                      Processing typically takes 3-6 minutes depending on video length. You'll be notified when clips are ready.
                    </p>
                  </div>
                </>
              )}
            </form>
          )}

          {/* File Selected State - Ready to Upload */}
          {status === "idle" && activeUploadState === "idle" && selectedFile && (
            <div className="space-y-4">
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

              {/* Options */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="file-clip-count"
                    className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Number of Clips
                  </label>
                  <select
                    id="file-clip-count"
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
                    htmlFor="file-layout"
                    className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Video Layout
                  </label>
                  <select
                    id="file-layout"
                    value={layout}
                    onChange={(e) => setLayout(e.target.value as Layout)}
                    className={inputClasses}
                  >
                    <option value="standard">Standard (9:16)</option>
                    <option value="gaming">Gaming (Facecam)</option>
                    <option value="podcast">Podcast (Split)</option>
                  </select>
                </div>
              </div>

              {/* Advanced Options */}
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="w-full flex items-center justify-between py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Advanced Options
                  </span>
                  <span className="text-xs text-slate-500">
                    {showAdvancedOptions ? "Hide" : "Show"}
                  </span>
                </button>

                {showAdvancedOptions && (
                  <div className="space-y-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    {/* Full Video Mode Toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Full Video Mode
                        </label>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Process entire video without clipping
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFullVideoMode(!fullVideoMode)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
                          fullVideoMode ? "bg-red-600" : "bg-slate-200 dark:bg-slate-600"
                        }`}
                        role="switch"
                        aria-checked={fullVideoMode}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            fullVideoMode ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {fullVideoMode && (
                      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30">
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Full video mode will add captions and apply format changes to the entire video without creating clips.
                        </p>
                      </div>
                    )}

                    {!fullVideoMode && (
                      <>
                        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                          <DurationSelector
                            value={durationRange}
                            onChange={setDurationRange}
                          />
                        </div>

                        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                          <ToneSelector
                            value={clipTone}
                            onChange={setClipTone}
                          />
                        </div>
                      </>
                    )}

                    <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                      <AspectRatioSelector
                        value={aspectRatio}
                        onChange={setAspectRatio}
                      />
                    </div>

                    <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                      <CaptionStylePicker
                        value={captionStyle}
                        onChange={setCaptionStyle}
                      />
                    </div>
                  </div>
                )}
              </div>

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
                className="w-full rounded-lg bg-red-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:bg-red-500 hover:shadow-xl"
              >
                <span className="flex items-center justify-center gap-2">
                  <Upload className="h-5 w-5" />
                  Start Upload &amp; Process
                </span>
              </button>

              <div className="pt-4 border-t border-red-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 text-center">
                  File will be uploaded securely and processed for viral clip extraction.
                </p>
              </div>
            </div>
          )}

          {/* File Upload Progress State */}
          {(activeUploadState === "creating_job" ||
            activeUploadState === "starting_upload" ||
            activeUploadState === "uploading" ||
            activeUploadState === "completing" ||
            activeUploadState === "paused") && (
            <div className="space-y-4">
              {/* Upload Header */}
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full border-4 border-red-200 dark:border-slate-700" />
                  <div
                    className={`absolute inset-0 rounded-full border-4 border-red-500 border-t-transparent ${
                      activeUploadState === "paused" ? "" : "animate-spin"
                    }`}
                  />
                  <Upload className="absolute inset-0 m-auto w-5 h-5 text-red-500 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {activeUploadState === "paused"
                      ? "Upload Paused"
                      : activeUploadState === "creating_job"
                      ? "Creating Job..."
                      : activeUploadState === "starting_upload"
                      ? "Preparing Upload..."
                      : activeUploadState === "completing"
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
                  <div className="h-3 bg-red-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ease-out ${
                        activeUploadState === "paused"
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${activeUploadProgress}%` }}
                    />
                  </div>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{Math.round(activeUploadProgress)}% uploaded</span>
                  <span>
                    {formatFileSize(activeUploadedBytes)} / {formatFileSize(activeTotalBytes)}
                  </span>
                </div>
                {activeTotalParts > 0 && (
                  <p className="text-xs text-slate-400 text-center">
                    Part {activeCurrentPart} of {activeTotalParts}
                  </p>
                )}
              </div>

              {/* Control Buttons */}
              <div className="flex justify-center gap-3 pt-2">
                {activeUploadState === "uploading" && (
                  <button
                    type="button"
                    onClick={layout === "meme" ? pauseMemeUpload : pauseUpload}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-400 dark:hover:bg-amber-500/10 transition-colors"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                )}
                {activeUploadState === "paused" && (
                  <button
                    type="button"
                    onClick={layout === "meme" ? resumeMemeUpload : resumeUpload}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    Resume
                  </button>
                )}
                {(activeUploadState === "uploading" || activeUploadState === "paused") && (
                  <button
                    type="button"
                    onClick={() => {
                      if (layout === "meme") {
                        cancelMemeUpload();
                      } else {
                        cancelUpload();
                      }
                      handleClearFile();
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                )}
              </div>

              {activeUploadError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-100 border border-red-300 text-red-600 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{activeUploadError}</span>
                </div>
              )}
            </div>
          )}

          {/* R2 Processing State - Upload complete, processing in Modal */}
          {activeUploadState === "completed" && activeProcessingState && activeProcessingState !== "READY" && activeProcessingState !== "FAILED" && activeProcessingState !== "completed" && (
            <div className="py-6">
              {/* Processing Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full border-4 border-red-200 dark:border-slate-700" />
                  <div className="absolute inset-0 rounded-full border-4 border-red-500 border-t-transparent animate-spin" />
                  <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-red-500 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {layout === "meme" ? "AI Meme Generation" : "AI Processing"}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {activeProcessingStep || (layout === "meme" ? "Generating viral meme captions..." : "Analyzing video for viral clips...")}
                  </p>
                </div>
              </div>

              {/* Processing Progress Bar */}
              <div className="space-y-4">
                <div className="relative">
                  <div className="h-2 bg-red-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 transition-all duration-500 ease-out"
                      style={{ width: `${activeProcessingProgress || 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-xs text-slate-500">
                      {activeProcessingProgress || 0}% complete
                    </span>
                    <span className="text-xs text-slate-500">
                      {layout === "meme" ? "Generating memes" : "Processing video"}
                    </span>
                  </div>
                </div>

                {/* Processing Steps */}
                <div className="grid grid-cols-6 gap-1 text-[10px] text-center">
                  {["download", "transcribe", "analyze", "faces", "clips", "done"].map((step, idx) => {
                    const stepThresholds = [5, 15, 30, 45, 55, 100];
                    const isActive = (activeProcessingProgress || 0) >= stepThresholds[idx - 1] && (activeProcessingProgress || 0) < stepThresholds[idx];
                    const isComplete = (activeProcessingProgress || 0) >= stepThresholds[idx];

                    const stepIcons: Record<string, ReactNode> = {
                      download: <Download className="w-3.5 h-3.5" />,
                      transcribe: <FileText className="w-3.5 h-3.5" />,
                      analyze: <Search className="w-3.5 h-3.5" />,
                      faces: <Users className="w-3.5 h-3.5" />,
                      clips: <Scissors className="w-3.5 h-3.5" />,
                      done: <Check className="w-3.5 h-3.5" />,
                    };

                    return (
                      <div key={step} className="flex flex-col items-center gap-1">
                        <div
                          className={`w-5 h-5 rounded-full transition-colors flex items-center justify-center ${
                            isActive
                              ? "bg-red-500 text-white animate-pulse"
                              : isComplete
                                ? "bg-green-500 text-white"
                                : "bg-red-100 text-red-300 dark:bg-slate-700 dark:text-slate-500"
                          }`}
                        >
                          {stepIcons[step]}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-slate-500 text-center">
                  {layout === "meme"
                    ? "Meme generation typically takes 1-3 minutes."
                    : "Processing typically takes 3-6 minutes depending on video length."}
                </p>
              </div>
            </div>
          )}

          {/* R2 Processing Completed State */}
          {activeUploadState === "completed" && (activeProcessingState === "READY" || activeProcessingState === "completed") && (r2JobId || memeR2JobId) && (
            <div className="py-6">
              <div className="text-center mb-6">
                <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  {r2Clips?.length || 0} Clips Generated!
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                  Your AI-generated clips are ready to view and download.
                </p>
              </div>

              {/* R2 Clips Loading */}
              {r2ClipsLoading && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-red-500" />
                  <span className="text-sm text-slate-500">Loading clips...</span>
                </div>
              )}

              {/* R2 Clips Preview */}
              {r2Clips && r2Clips.length > 0 && (
                <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                  {r2Clips.slice(0, 5).map((clip, idx) => (
                    <div
                      key={clip._id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-red-50 border border-red-200 dark:bg-slate-800/50 dark:border-slate-700"
                    >
                      <div className="w-8 h-8 rounded bg-red-600 flex items-center justify-center text-white text-xs font-bold">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900 dark:text-white truncate">
                          {clip.title || `Clip ${idx + 1}`}
                        </p>
                        <p className="text-xs text-slate-500">
                          Score: {clip.score || 0}% • {Math.round(clip.duration)}s
                        </p>
                      </div>
                      {/* Download button with signed URL */}
                      {clip.clipUrl && (
                        <a
                          href={clip.clipUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700 transition-colors"
                          title="Download clip"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                      {/* Fallback icon when no URL yet */}
                      {!clip.clipUrl && clip.r2ClipKey && (
                        <div className="flex items-center gap-1 p-1.5">
                          <Film className="w-4 h-4 text-slate-400" />
                        </div>
                      )}
                    </div>
                  ))}
                  {r2Clips.length > 5 && (
                    <p className="text-[10px] text-slate-500 text-center pt-2">
                      Showing 5 of {r2Clips.length} clips
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleStartNew}
                  className="px-4 py-2 rounded-lg border border-red-300 text-slate-700 hover:bg-red-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  Generate More
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-500 transition-all"
                >
                  View All Clips
                </button>
              </div>
            </div>
          )}

          {/* R2 Processing Failed State */}
          {activeUploadState === "completed" && (activeProcessingState === "FAILED" || activeProcessingState === "failed") && (
            <div className="py-8 text-center">
              <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Processing Failed
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-2">
                {activeUploadError || "Something went wrong while processing the video."}
              </p>
              <p className="text-slate-500 text-xs mb-6">
                Please try uploading again or use a different video file.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleStartNew}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-500 transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* File Upload Failed State */}
          {activeUploadState === "failed" && (
            <div className="py-8 text-center">
              <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Upload Failed
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-2">
                {activeUploadError || "Something went wrong during upload."}
              </p>
              <p className="text-slate-500 text-xs mb-6">
                Please check your connection and try again.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleStartNew}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  Start Fresh
                </button>
                {selectedFile && (
                  <button
                    type="button"
                    onClick={handleStartFileUpload}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-500 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                  </button>
                )}
              </div>
            </div>
          )}

          {/* YouTube Download Progress - Browser-first flow */}
          {isDownloadingYouTube && (
            <div className="py-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full border-4 border-red-200 dark:border-slate-700" />
                  <div className="absolute inset-0 rounded-full border-4 border-red-500 border-t-transparent animate-spin" />
                  <Download className="absolute inset-0 m-auto w-5 h-5 text-red-500 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Downloading YouTube Video
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {youtubeDownloadProgress < 10
                      ? "Getting video info..."
                      : youtubeDownloadProgress < 80
                        ? "Downloading video..."
                        : youtubeDownloadProgress < 90
                          ? "Preparing file..."
                          : "Starting upload..."}
                  </p>
                </div>
              </div>
              <div className="relative">
                <div className="h-2 bg-red-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 transition-all duration-500 ease-out"
                    style={{ width: `${youtubeDownloadProgress}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-xs text-slate-500">
                    {Math.round(youtubeDownloadProgress)}% complete
                  </span>
                </div>
              </div>
            </div>
          )}

          {(status === "submitting" || status === "processing") && !isDownloadingYouTube && (
            <div className="py-6">
              {/* Progress Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full border-4 border-red-200 dark:border-slate-700" />
                  <div className="absolute inset-0 rounded-full border-4 border-red-500 border-t-transparent animate-spin" />
                  <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-red-500 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {status === "submitting" ? "Submitting..." : layout === "meme" ? "AI Meme Generation" : "AI Processing"}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {getStepLabel(activeJob?.status)}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              {activeJob && (
                <div className="space-y-4">
                  <div className="relative">
                    <div className="h-2 bg-red-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500 transition-all duration-500 ease-out"
                        style={{ width: `${activeJob.progress || 0}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-xs text-slate-500">
                        {activeJob.progress || 0}% complete
                      </span>
                      {activeJob.videoTitle && (
                        <span className="text-xs text-slate-500 truncate max-w-[200px]">
                          {activeJob.videoTitle}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Processing Steps - Different for meme vs clip generation */}
                  {layout === "meme" ? (
                    <div className="grid grid-cols-5 gap-1 text-[10px] text-center">
                      {["downloading", "extracting_frames", "analyzing", "generating_captions", "completed"].map((step, idx) => {
                        const stepProgress = (idx + 1) * 20;
                        const isActive = activeJob.status === step;
                        const isComplete = (activeJob.progress || 0) >= stepProgress;

                        const stepIcons: Record<string, ReactNode> = {
                          downloading: <Download className="w-3.5 h-3.5" />,
                          extracting_frames: <ImagePlus className="w-3.5 h-3.5" />,
                          analyzing: <Search className="w-3.5 h-3.5" />,
                          generating_captions: <MessageSquare className="w-3.5 h-3.5" />,
                          completed: <Check className="w-3.5 h-3.5" />,
                        };

                        return (
                          <div key={step} className="flex flex-col items-center gap-1">
                            <div
                              className={`w-5 h-5 rounded-full transition-colors flex items-center justify-center ${
                                isActive
                                  ? "bg-red-500 text-white animate-pulse"
                                  : isComplete
                                    ? "bg-green-500 text-white"
                                    : "bg-red-100 text-red-300 dark:bg-slate-700 dark:text-slate-500"
                              }`}
                            >
                              {stepIcons[step]}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-6 gap-1 text-[10px] text-center">
                      {["downloading", "transcribing", "analyzing", "clipping", "uploading", "completed"].map((step, idx) => {
                        const stepProgress = (idx + 1) * 16.67;
                        const isActive = activeJob.status === step;
                        const isComplete = (activeJob.progress || 0) >= stepProgress;

                        const stepIcons: Record<string, ReactNode> = {
                          downloading: <Download className="w-3.5 h-3.5" />,
                          transcribing: <FileText className="w-3.5 h-3.5" />,
                          analyzing: <Search className="w-3.5 h-3.5" />,
                          clipping: <Scissors className="w-3.5 h-3.5" />,
                          uploading: <Upload className="w-3.5 h-3.5" />,
                          completed: <Check className="w-3.5 h-3.5" />,
                        };

                        return (
                          <div key={step} className="flex flex-col items-center gap-1">
                            <div
                              className={`w-5 h-5 rounded-full transition-colors flex items-center justify-center ${
                                isActive
                                  ? "bg-red-500 text-white animate-pulse"
                                  : isComplete
                                    ? "bg-green-500 text-white"
                                    : "bg-red-100 text-red-300 dark:bg-slate-700 dark:text-slate-500"
                              }`}
                            >
                              {stepIcons[step]}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Results Generated Counter */}
                  {activeResults && activeResults.length > 0 && (
                    <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-green-100 border border-green-300 dark:bg-green-500/10 dark:border-green-500/30">
                      <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm text-green-600 dark:text-green-400">
                        {activeResults.length} {layout === "meme" ? "meme" : "clip"}{activeResults.length !== 1 ? "s" : ""} generated
                      </span>
                    </div>
                  )}

                  <p className="text-xs text-slate-500 text-center">
                    {layout === "meme"
                      ? "Meme generation typically takes 1-3 minutes. Progress updates in real-time."
                      : "Processing typically takes 3-6 minutes. Progress updates in real-time."}
                  </p>
                </div>
              )}

              {!activeJob && (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </div>
              )}

              {/* Cancel button for processing jobs */}
              {status === "processing" && (
                <div className="mt-4 pt-4 border-t border-red-200 dark:border-slate-800 flex justify-center">
                  <button
                    type="button"
                    onClick={handleCancelJob}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                  >
                    Cancel and start over
                  </button>
                </div>
              )}
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
                  You can wait, retry, or cancel the job.
                </p>
              </div>

              {/* Show any results that were generated before stalling */}
              {activeResults && activeResults.length > 0 && (
                <div className="mb-6 p-3 rounded-lg bg-green-100 border border-green-300 dark:bg-green-500/10 dark:border-green-500/30">
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm text-green-600 dark:text-green-400">
                      {activeResults.length} {layout === "meme" ? "meme" : "clip"}{activeResults.length !== 1 ? "s" : ""} generated so far
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleCancelJob}
                  className="px-4 py-2 rounded-lg border border-red-300 text-slate-700 hover:bg-red-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel Job
                </button>
                <button
                  type="button"
                  onClick={handleRetryJob}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </button>
              </div>
            </div>
          )}

          {status === "completed" && (
            <div className="py-6">
              <div className="text-center mb-6">
                <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  {activeResults?.length || 0} {layout === "meme" ? "Memes" : "Clips"} Generated!
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                  {layout === "meme"
                    ? "Your AI-generated memes are ready with viral captions."
                    : "Your AI-generated clips are now ready to view and download."}
                </p>
              </div>

              {/* Results Preview */}
              {layout === "meme" && memes && memes.length > 0 && (
                <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                  {memes.slice(0, 5).map((meme, idx) => (
                    <div
                      key={meme._id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-red-50 border border-red-200 dark:bg-slate-800/50 dark:border-slate-700"
                    >
                      <div className="w-8 h-8 rounded bg-red-600 flex items-center justify-center text-white text-xs font-bold">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900 dark:text-white truncate">{meme.caption}</p>
                        <p className="text-xs text-slate-500">
                          {meme.templateName || meme.templateType} • Score: {meme.viralScore || 0}%
                        </p>
                      </div>
                      {meme.memeUrl && (
                        <a
                          href={meme.memeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-500 text-center pt-2">
                    {memes.length > 5 ? `Showing 5 of ${memes.length} memes` : "All memes generated"}
                  </p>
                </div>
              )}

              {/* Clips Preview with Thumbnail Selection */}
              {layout !== "meme" && activeResults && activeResults.length > 0 && (
                <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                  {activeResults.slice(0, 5).map((clip, idx) => {
                    // Handle both legacy clips (downloadUrl) and processing clips (clipUrl)
                    const videoUrl = "downloadUrl" in clip ? clip.downloadUrl : ("clipUrl" in clip ? clip.clipUrl : null);
                    const thumbUrl = "customThumbnailUrl" in clip ? clip.customThumbnailUrl : ("thumbUrl" in clip ? clip.thumbUrl : null);

                    return (
                      <div
                        key={clip._id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-red-50 border border-red-200 dark:bg-slate-800/50 dark:border-slate-700"
                      >
                        <div className="w-8 h-8 rounded bg-red-600 flex items-center justify-center text-white text-xs font-bold">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-900 dark:text-white truncate">{clip.title}</p>
                          <p className="text-xs text-slate-500">
                            Score: {clip.score}% • {Math.round(clip.duration || 0)}s
                          </p>
                        </div>
                        {/* Set Thumbnail Button */}
                        {videoUrl && (
                          <button
                            type="button"
                            onClick={() => setThumbnailPickerClip({
                              clipId: clip._id,
                              downloadUrl: videoUrl,
                              thumbnailUrl: thumbUrl || undefined,
                              clipType: currentYouTubeR2JobId ? "processing" : "generated",
                            })}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-100 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-blue-500/20 transition-colors"
                            title="Set thumbnail"
                          >
                            <Image className="w-4 h-4" />
                          </button>
                        )}
                        {videoUrl && (
                          <a
                            href={videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-slate-500 text-center pt-2">
                    Click the image icon to set a custom 9:16 thumbnail for each clip
                  </p>
                </div>
              )}

              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleStartNew}
                  className="px-4 py-2 rounded-lg border border-red-300 text-slate-700 hover:bg-red-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  Generate More
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-500 transition-all"
                >
                  {layout === "meme" ? "View All Memes" : "View All Clips"}
                </button>
              </div>
            </div>
          )}

          {status === "failed" && (
            <div className="py-8 text-center">
              <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Generation Failed
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-2">
                {errorMessage || "Something went wrong while generating clips."}
              </p>
              <p className="text-slate-500 text-xs mb-6">
                Please check the video URL and try again.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleStartNew}
                  className="px-4 py-2 rounded-lg border border-red-300 text-slate-700 hover:bg-red-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  Start Fresh
                </button>
                {videoUrl && (
                  <button
                    type="button"
                    onClick={handleRetryJob}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-500 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry Same Video
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        {/* End Scrollable Content Area */}
      </div>

      {/* Thumbnail Picker Modal */}
      {thumbnailPickerClip && (
        <ThumbnailPicker
          isOpen={!!thumbnailPickerClip}
          onClose={() => setThumbnailPickerClip(null)}
          videoUrl={thumbnailPickerClip.downloadUrl}
          clipId={thumbnailPickerClip.clipId}
          clipType={thumbnailPickerClip.clipType}
          onThumbnailSaved={() => setThumbnailPickerClip(null)}
          currentThumbnailUrl={thumbnailPickerClip.thumbnailUrl}
        />
      )}
    </div>
  );
};

export default ClipGeneratorModal;
