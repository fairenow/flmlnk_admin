"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  X,
  Link as LinkIcon,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Film,
  Sliders,
  Type,
  Pause,
  Play,
  XCircle,
  MessageSquare,
  Smile,
  Zap,
  Users,
  Brain,
  Hand,
  Presentation,
} from "lucide-react";
import { useGifMemeUpload } from "@/hooks/useGifMemeUpload";

type SourceType = "youtube" | "file";

// Meme template types from backend
type MemeTemplateKey =
  | "reaction"
  | "before_after"
  | "internal_external"
  | "absurd_visual"
  | "character_voice"
  | "fake_tutorial"
  | "forbidden";

interface MemeGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  actorProfileId?: Id<"actor_profiles">;
  onJobCreated?: (jobId: Id<"meme_generation_jobs">) => void;
}

// Template definitions with icons and descriptions
const MEME_TEMPLATE_OPTIONS: Array<{
  key: MemeTemplateKey;
  name: string;
  description: string;
  icon: typeof Smile;
  examples: string[];
}> = [
  {
    key: "reaction",
    name: "Reaction",
    description: "Strong facial expressions for relatable situations",
    icon: Smile,
    examples: ["Me when...", "My face when..."],
  },
  {
    key: "before_after",
    name: "Before/After",
    description: "Two frames showing change or contrast",
    icon: Zap,
    examples: ["How it started / How it's going", "Expectation / Reality"],
  },
  {
    key: "internal_external",
    name: "Brain vs Me",
    description: "Internal dialogue memes",
    icon: Brain,
    examples: ["My brain when...", "My last brain cell..."],
  },
  {
    key: "absurd_visual",
    name: "Absurd Visual",
    description: "Strange frames with relatable captions",
    icon: Sparkles,
    examples: ["Day X of...", "Me trying to..."],
  },
  {
    key: "character_voice",
    name: "Character Voice",
    description: "Build memes around recognizable characters",
    icon: Users,
    examples: ["[Character] energy", "POV: [Character] is your..."],
  },
  {
    key: "fake_tutorial",
    name: "Fake Tutorial",
    description: "Presentation or teaching moment memes",
    icon: Presentation,
    examples: ["How to [bad advice]", "A guide to ruining your..."],
  },
  {
    key: "forbidden",
    name: "Forbidden",
    description: "Character about to do something they shouldn't",
    icon: Hand,
    examples: ["The forbidden [object]", "They told me not to..."],
  },
];

export function MemeGeneratorModal({
  isOpen,
  onClose,
  slug,
  actorProfileId,
  onJobCreated,
}: MemeGeneratorModalProps) {
  // Source selection state
  // NOTE: YouTube URL option temporarily disabled - defaulting to file upload
  const [sourceType, setSourceType] = useState<SourceType>("file");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Meme configuration
  const [memeCount, setMemeCount] = useState(5);
  const [selectedTemplates, setSelectedTemplates] = useState<MemeTemplateKey[]>([]);
  const [captionStyle, setCaptionStyle] = useState<"auto" | "top" | "bottom" | "top_bottom">("auto");

  // Submit action for YouTube
  const submitMemeJob = useAction(api.memeGenerator.submitMemeGenerationJob);

  // Upload hook for file uploads
  const memeUpload = useGifMemeUpload({
    jobType: "meme",
    onJobCreated: (jobId) => {
      console.log("Meme upload job created:", jobId);
    },
    onUploadComplete: (jobId) => {
      console.log("Meme upload complete, processing:", jobId);
    },
    onProcessingComplete: (jobId) => {
      console.log("Meme processing complete:", jobId);
      onJobCreated?.(jobId as Id<"meme_generation_jobs">);
      onClose();
    },
    onError: (err, stage) => {
      console.error(`Meme ${stage} error:`, err);
      setError(err);
    },
  });

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setYoutubeUrl("");
      setError(null);
      setShowAdvanced(false);
      setMemeCount(5);
      setSelectedTemplates([]);
      setCaptionStyle("auto");
      setSelectedFile(null);
      memeUpload.reset();
    }
  }, [isOpen]);

  // URL validation
  const isValidYoutubeUrl = (url: string): boolean => {
    const patterns = [
      /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=)[\w-]+/,
      /^(https?:\/\/)?(www\.)?(youtu\.be\/)[\w-]+/,
      /^(https?:\/\/)?(www\.)?(youtube\.com\/shorts\/)[\w-]+/,
      /^(https?:\/\/)?(www\.)?(youtube\.com\/embed\/)[\w-]+/,
    ];
    return patterns.some((pattern) => pattern.test(url));
  };

  // File validation
  const isValidVideoFile = (file: File): boolean => {
    const validTypes = [
      "video/mp4", "video/webm", "video/quicktime",
      "video/x-msvideo", "video/x-matroska", "video/mxf",
      "application/mxf", "video/mpeg", "video/mp2t", "video/x-m4v",
    ];
    const maxSize = 10 * 1024 * 1024 * 1024; // 10GB
    const isSupportedType = validTypes.includes(file.type);
    const isMxfExtension = file.name.toLowerCase().endsWith('.mxf');
    return (isSupportedType || isMxfExtension) && file.size <= maxSize && file.size >= 1024 * 1024;
  };

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    if (!isValidVideoFile(file)) {
      setError("Please select a valid video file (MP4, WebM, MOV, AVI, MKV, MXF) between 1MB and 10GB");
      return;
    }
    setSelectedFile(file);
    setError(null);
  }, []);

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  // Toggle template selection
  const toggleTemplate = useCallback((key: MemeTemplateKey) => {
    setSelectedTemplates((prev) => {
      if (prev.includes(key)) {
        return prev.filter((t) => t !== key);
      }
      return [...prev, key];
    });
  }, []);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const handleSubmit = useCallback(async () => {
    if (sourceType === "youtube") {
      if (!youtubeUrl.trim()) {
        setError("Please enter a YouTube URL");
        return;
      }

      if (!isValidYoutubeUrl(youtubeUrl)) {
        setError("Please enter a valid YouTube URL");
        return;
      }

      setError(null);
      setIsSubmitting(true);

      try {
        const result = await submitMemeJob({
          slug,
          sourceVideoUrl: youtubeUrl.trim(),
          memeCount,
          targetTemplates: selectedTemplates.length > 0 ? selectedTemplates : undefined,
        });

        console.log("Meme job submitted:", result);
        onJobCreated?.(result.jobId);
        onClose();
      } catch (err) {
        console.error("Failed to submit meme job:", err);
        setError(err instanceof Error ? err.message : "Failed to start meme generation");
      } finally {
        setIsSubmitting(false);
      }
    } else if (sourceType === "file") {
      if (!selectedFile) {
        setError("Please select a video file");
        return;
      }

      setError(null);

      // Start the upload using the hook
      await memeUpload.startUpload(selectedFile, {
        slug,
        memeCount,
        targetTemplates: selectedTemplates.length > 0 ? selectedTemplates : undefined,
      });
    }
  }, [
    sourceType,
    youtubeUrl,
    selectedFile,
    memeCount,
    selectedTemplates,
    slug,
    submitMemeJob,
    memeUpload,
    onJobCreated,
    onClose,
  ]);

  // Check if upload is in progress
  const isUploadInProgress = memeUpload.state !== "idle" && memeUpload.state !== "completed" && memeUpload.state !== "failed";
  const isProcessing = isSubmitting || isUploadInProgress;

  const handleClose = useCallback(() => {
    if (!isProcessing) {
      onClose();
      setError(null);
    }
  }, [isProcessing, onClose]);

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white dark:bg-[#161a24] p-6 text-left shadow-xl border border-slate-200 dark:border-white/10 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20">
                <Sparkles className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Generate Memes
                </h2>
                <p className="text-xs text-slate-500 dark:text-white/50">
                  Create viral memes with AI-generated captions
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={isProcessing}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Source Type Tabs - YouTube option temporarily disabled
          <div className="flex gap-2 mb-4 p-1 rounded-xl bg-slate-100 dark:bg-white/5">
            <button
              type="button"
              onClick={() => setSourceType("youtube")}
              disabled={isProcessing}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                sourceType === "youtube"
                  ? "bg-white dark:bg-slate-700 text-amber-600 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              } disabled:opacity-50`}
            >
              <LinkIcon className="h-4 w-4" />
              YouTube URL
            </button>
            <button
              type="button"
              onClick={() => setSourceType("file")}
              disabled={isProcessing}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                sourceType === "file"
                  ? "bg-white dark:bg-slate-700 text-amber-600 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              } disabled:opacity-50`}
            >
              <Upload className="h-4 w-4" />
              Upload Video
            </button>
          </div>
          */}

          {/* YouTube URL Input - temporarily disabled
          {sourceType === "youtube" && (
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 dark:text-white/70 mb-1.5">
                YouTube Video URL
              </label>
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => {
                  setYoutubeUrl(e.target.value);
                  setError(null);
                }}
                placeholder="https://www.youtube.com/watch?v=..."
                disabled={isSubmitting}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/40 dark:focus:border-amber-400"
              />
              <p className="mt-1.5 text-[11px] text-slate-400 dark:text-white/40">
                Paste any YouTube video URL to extract meme-worthy frames
              </p>
            </div>
          )}
          */}

          {/* File Upload Input */}
          <div className="mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,.mxf"
                onChange={handleFileInputChange}
                className="hidden"
              />

              {/* Upload Progress */}
              {isUploadInProgress && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-slate-700 dark:text-white">
                      {memeUpload.state === "creating_job" && "Creating job..."}
                      {memeUpload.state === "starting_upload" && "Starting upload..."}
                      {memeUpload.state === "uploading" && "Uploading video..."}
                      {memeUpload.state === "completing" && "Completing upload..."}
                      {memeUpload.state === "paused" && "Upload paused"}
                    </span>
                    <div className="flex items-center gap-2">
                      {memeUpload.state === "uploading" && (
                        <button
                          type="button"
                          onClick={memeUpload.pauseUpload}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-white/10"
                        >
                          <Pause className="h-4 w-4" />
                        </button>
                      )}
                      {memeUpload.state === "paused" && (
                        <button
                          type="button"
                          onClick={memeUpload.resumeUpload}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-white/10"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={memeUpload.cancelUpload}
                        className="p-1.5 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-500/10"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 rounded-full h-2 dark:bg-white/10">
                    <div
                      className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${memeUpload.progress}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500 dark:text-white/50">
                    <span>
                      {formatFileSize(memeUpload.uploadedBytes)} / {formatFileSize(memeUpload.totalBytes)}
                    </span>
                    <span>{memeUpload.progress}%</span>
                  </div>

                  {memeUpload.state === "uploading" && (
                    <p className="mt-2 text-[11px] text-slate-400 dark:text-white/40">
                      Part {memeUpload.currentPart} of {memeUpload.totalParts}
                    </p>
                  )}
                </div>
              )}

              {/* Processing Progress */}
              {memeUpload.state === "completed" && memeUpload.processingState && memeUpload.processingState !== "completed" && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-white">
                      {memeUpload.processingStep || "Processing video..."}
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 rounded-full h-2 dark:bg-white/10">
                    <div
                      className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${memeUpload.processingProgress}%` }}
                    />
                  </div>

                  <p className="mt-2 text-[11px] text-slate-400 dark:text-white/40">
                    AI is analyzing frames and generating viral captions...
                  </p>
                </div>
              )}

              {/* File Drop Zone */}
              {!isUploadInProgress && !(memeUpload.state === "completed" && memeUpload.processingState && memeUpload.processingState !== "completed") && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                    isDragging
                      ? "border-amber-500 bg-amber-500/5"
                      : selectedFile
                      ? "border-green-500/50 bg-green-500/5"
                      : "border-slate-200 dark:border-white/10 hover:border-amber-500/50 hover:bg-amber-500/5"
                  }`}
                >
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <Film className="h-8 w-8 text-green-500" />
                      <div className="text-left">
                        <p className="text-sm font-medium text-slate-700 dark:text-white truncate max-w-[200px]">
                          {selectedFile.name}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-white/40">
                          {formatFileSize(selectedFile.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-500/10"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 mx-auto text-slate-400 dark:text-white/30 mb-3" />
                      <p className="text-sm font-medium text-slate-700 dark:text-white mb-1">
                        {isDragging ? "Drop your video here" : "Click or drag video file"}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-white/40">
                        MP4, WebM, MOV, AVI, MKV, MXF - Max 10GB
                      </p>
                    </>
                  )}
                </div>
              )}
          </div>

          {/* Meme Count */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-700 dark:text-white/70 mb-1.5">
              Number of memes to generate
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={10}
                value={memeCount}
                onChange={(e) => setMemeCount(parseInt(e.target.value))}
                disabled={isProcessing}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-white/10 accent-amber-500"
              />
              <span className="w-8 text-center text-sm font-medium text-slate-700 dark:text-white">
                {memeCount}
              </span>
            </div>
          </div>

          {/* Template Selection */}
          <div className="mb-4">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-white/70 mb-2">
              <MessageSquare className="h-3.5 w-3.5" />
              Meme Templates
              <span className="text-slate-400 dark:text-white/40 font-normal">(optional - AI picks best if none selected)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {MEME_TEMPLATE_OPTIONS.map((template) => {
                const Icon = template.icon;
                const isSelected = selectedTemplates.includes(template.key);
                return (
                  <button
                    key={template.key}
                    type="button"
                    onClick={() => toggleTemplate(template.key)}
                    disabled={isProcessing}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-amber-500 bg-amber-500/5 ring-2 ring-amber-500/20"
                        : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`h-4 w-4 ${isSelected ? "text-amber-500" : "text-slate-400 dark:text-white/40"}`} />
                      <p className={`text-sm font-medium ${
                        isSelected
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-slate-700 dark:text-white"
                      }`}>
                        {template.name}
                      </p>
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-white/40 line-clamp-1">
                      {template.examples[0]}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Advanced Settings Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/70 mb-4"
          >
            <Sliders className="h-3.5 w-3.5" />
            Advanced Settings
            <span className={`transform transition-transform ${showAdvanced ? "rotate-180" : ""}`}>
              &#9662;
            </span>
          </button>

          {/* Advanced Settings */}
          {showAdvanced && (
            <div className="space-y-4 mb-4 p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              {/* Caption Position */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-white/70 mb-2">
                  <Type className="h-3.5 w-3.5" />
                  Caption Position
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "auto", name: "Auto (AI picks)", desc: "Best for each meme" },
                    { key: "top", name: "Top Only", desc: "Classic top caption" },
                    { key: "bottom", name: "Bottom Only", desc: "Standard meme format" },
                    { key: "top_bottom", name: "Top & Bottom", desc: "Two-part caption" },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setCaptionStyle(option.key as typeof captionStyle)}
                      disabled={isProcessing}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        captionStyle === option.key
                          ? "border-amber-500 bg-amber-500/5 ring-1 ring-amber-500/20"
                          : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20"
                      }`}
                    >
                      <p className={`text-xs font-medium ${
                        captionStyle === option.key
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-slate-700 dark:text-white"
                      }`}>
                        {option.name}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-white/40">
                        {option.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Info Box */}
          <div className="mb-6 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-4">
            <h4 className="text-xs font-medium text-slate-700 dark:text-white/70 mb-2 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              How meme generation works
            </h4>
            <ul className="space-y-1.5 text-[11px] text-slate-500 dark:text-white/50">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-3.5 w-3.5 mt-0.5 text-green-500 flex-shrink-0" />
                AI extracts frames and analyzes facial expressions & actions
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-3.5 w-3.5 mt-0.5 text-green-500 flex-shrink-0" />
                Matches frames to viral meme templates (reaction, before/after, etc.)
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-3.5 w-3.5 mt-0.5 text-green-500 flex-shrink-0" />
                Generates captions optimized for engagement and shareability
              </li>
            </ul>
          </div>

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              isProcessing ||
              (sourceType === "youtube" && !youtubeUrl.trim()) ||
              (sourceType === "file" && !selectedFile)
            }
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-medium text-white transition-all hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting generation...
              </>
            ) : isUploadInProgress ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate {memeCount} Meme{memeCount > 1 ? "s" : ""}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

export default MemeGeneratorModal;
