"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  X,
  Link as LinkIcon,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  Zap,
  Film,
  Settings,
  Type,
  Sliders,
  Pause,
  Play,
  XCircle,
} from "lucide-react";
import { useGifMemeUpload } from "@/hooks/useGifMemeUpload";

type SourceType = "youtube" | "file";
type OverlayStyleKey = "meme_top_bottom" | "caption_bar" | "subtitle" | "none";

interface GifGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  onJobCreated?: (jobId: string) => void;
}

export function GifGeneratorModal({
  isOpen,
  onClose,
  slug,
  onJobCreated,
}: GifGeneratorModalProps) {
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

  // GIF configuration
  const [gifCount, setGifCount] = useState(5);
  const [maxDuration, setMaxDuration] = useState(6);
  const [targetWidth, setTargetWidth] = useState(480);
  const [frameRate, setFrameRate] = useState(12);
  const [overlayStyle, setOverlayStyle] = useState<OverlayStyleKey>("caption_bar");

  // Get overlay styles from Convex
  const overlayStyles = useQuery(api.gifGenerator.getOverlayStyles);

  // Submit action for YouTube
  const submitGifJob = useAction(api.gifGenerator.submitGifGenerationJob);

  // Upload hook for file uploads
  const gifUpload = useGifMemeUpload({
    jobType: "gif",
    onJobCreated: (jobId) => {
      console.log("GIF upload job created:", jobId);
    },
    onUploadComplete: (jobId) => {
      console.log("GIF upload complete, processing:", jobId);
    },
    onProcessingComplete: (jobId) => {
      console.log("GIF processing complete:", jobId);
      onJobCreated?.(jobId);
      onClose();
    },
    onError: (err, stage) => {
      console.error(`GIF ${stage} error:`, err);
      setError(err);
    },
  });

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setYoutubeUrl("");
      setError(null);
      setShowAdvanced(false);
      setGifCount(5);
      setMaxDuration(6);
      setTargetWidth(480);
      setFrameRate(12);
      setOverlayStyle("caption_bar");
      setSelectedFile(null);
      gifUpload.reset();
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
    const validTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"];
    const maxSize = 500 * 1024 * 1024; // 500MB
    return validTypes.includes(file.type) && file.size <= maxSize;
  };

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    if (!isValidVideoFile(file)) {
      setError("Please select a valid video file (MP4, WebM, MOV, AVI, MKV) under 500MB");
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

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        const result = await submitGifJob({
          slug,
          sourceVideoUrl: youtubeUrl.trim(),
          inputType: sourceType,
          gifCount,
          maxDurationSeconds: maxDuration,
          targetWidth,
          frameRate,
        });

        console.log("GIF job submitted:", result);
        onJobCreated?.(result.jobId);
        onClose();
      } catch (err) {
        console.error("Failed to submit GIF job:", err);
        setError(err instanceof Error ? err.message : "Failed to start GIF generation");
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
      await gifUpload.startUpload(selectedFile, {
        slug,
        gifCount,
        maxDurationSeconds: maxDuration,
        targetWidth,
        frameRate,
        overlayStyle,
      });
    }
  }, [
    sourceType,
    youtubeUrl,
    selectedFile,
    gifCount,
    maxDuration,
    targetWidth,
    frameRate,
    overlayStyle,
    slug,
    submitGifJob,
    gifUpload,
    onJobCreated,
    onClose,
  ]);

  // Check if upload is in progress
  const isUploadInProgress = gifUpload.state !== "idle" && gifUpload.state !== "completed" && gifUpload.state !== "failed";
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
          className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white dark:bg-[#161a24] p-6 text-left shadow-xl border border-slate-200 dark:border-white/10"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                <Zap className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Generate GIFs
                </h2>
                <p className="text-xs text-slate-500 dark:text-white/50">
                  Extract viral moments as GIFs with text overlays
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
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
                  ? "bg-white dark:bg-slate-700 text-red-600 shadow-sm"
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
                  ? "bg-white dark:bg-slate-700 text-red-600 shadow-sm"
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
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/40 dark:focus:border-red-400"
              />
              <p className="mt-1.5 text-[11px] text-slate-400 dark:text-white/40">
                Supports YouTube watch URLs, shorts, and embed links
              </p>
            </div>
          )}
          */}

          {/* File Upload Input */}
          <div className="mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska"
                onChange={handleFileInputChange}
                className="hidden"
              />

              {/* Upload Progress */}
              {isUploadInProgress && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-slate-700 dark:text-white">
                      {gifUpload.state === "creating_job" && "Creating job..."}
                      {gifUpload.state === "starting_upload" && "Starting upload..."}
                      {gifUpload.state === "uploading" && "Uploading video..."}
                      {gifUpload.state === "completing" && "Completing upload..."}
                      {gifUpload.state === "paused" && "Upload paused"}
                    </span>
                    <div className="flex items-center gap-2">
                      {gifUpload.state === "uploading" && (
                        <button
                          type="button"
                          onClick={gifUpload.pauseUpload}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-white/10"
                        >
                          <Pause className="h-4 w-4" />
                        </button>
                      )}
                      {gifUpload.state === "paused" && (
                        <button
                          type="button"
                          onClick={gifUpload.resumeUpload}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-white/10"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={gifUpload.cancelUpload}
                        className="p-1.5 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-500/10"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 rounded-full h-2 dark:bg-white/10">
                    <div
                      className="bg-red-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${gifUpload.progress}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500 dark:text-white/50">
                    <span>
                      {formatFileSize(gifUpload.uploadedBytes)} / {formatFileSize(gifUpload.totalBytes)}
                    </span>
                    <span>{gifUpload.progress}%</span>
                  </div>

                  {gifUpload.state === "uploading" && (
                    <p className="mt-2 text-[11px] text-slate-400 dark:text-white/40">
                      Part {gifUpload.currentPart} of {gifUpload.totalParts}
                    </p>
                  )}
                </div>
              )}

              {/* Processing Progress */}
              {gifUpload.state === "completed" && gifUpload.processingState && gifUpload.processingState !== "completed" && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-white">
                      {gifUpload.processingStep || "Processing video..."}
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 rounded-full h-2 dark:bg-white/10">
                    <div
                      className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${gifUpload.processingProgress}%` }}
                    />
                  </div>

                  <p className="mt-2 text-[11px] text-slate-400 dark:text-white/40">
                    AI is analyzing your video and generating GIFs...
                  </p>
                </div>
              )}

              {/* File Drop Zone */}
              {!isUploadInProgress && !(gifUpload.state === "completed" && gifUpload.processingState && gifUpload.processingState !== "completed") && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                    isDragging
                      ? "border-red-500 bg-red-500/5"
                      : selectedFile
                      ? "border-green-500/50 bg-green-500/5"
                      : "border-slate-200 dark:border-white/10 hover:border-red-500/50 hover:bg-red-500/5"
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
                        MP4, WebM, MOV, AVI, MKV - Max 500MB
                      </p>
                    </>
                  )}
                </div>
              )}
          </div>

          {/* GIF Count */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-700 dark:text-white/70 mb-1.5">
              Number of GIFs to generate
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={10}
                value={gifCount}
                onChange={(e) => setGifCount(parseInt(e.target.value))}
                disabled={isSubmitting}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-white/10 accent-red-500"
              />
              <span className="w-8 text-center text-sm font-medium text-slate-700 dark:text-white">
                {gifCount}
              </span>
            </div>
          </div>

          {/* Overlay Style Selection */}
          <div className="mb-4">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-white/70 mb-1.5">
              <Type className="h-3.5 w-3.5" />
              Text Overlay Style
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "meme_top_bottom", name: "Meme Classic", desc: "Impact font with outline" },
                { key: "caption_bar", name: "Caption Bar", desc: "Modern bottom bar" },
                { key: "subtitle", name: "Subtitle", desc: "Clean subtitles" },
                { key: "none", name: "No Overlay", desc: "Just the GIF" },
              ].map((style) => (
                <button
                  key={style.key}
                  type="button"
                  onClick={() => setOverlayStyle(style.key as OverlayStyleKey)}
                  disabled={isSubmitting}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    overlayStyle === style.key
                      ? "border-red-500 bg-red-500/5 ring-2 ring-red-500/20"
                      : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20"
                  }`}
                >
                  <p className={`text-sm font-medium ${
                    overlayStyle === style.key
                      ? "text-red-600 dark:text-red-400"
                      : "text-slate-700 dark:text-white"
                  }`}>
                    {style.name}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-white/40">
                    {style.desc}
                  </p>
                </button>
              ))}
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
              {/* Max Duration */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-white/70 mb-1.5">
                  Max GIF Duration (seconds)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={2}
                    max={8}
                    value={maxDuration}
                    onChange={(e) => setMaxDuration(parseInt(e.target.value))}
                    disabled={isSubmitting}
                    className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-white/10 accent-red-500"
                  />
                  <span className="w-8 text-center text-sm font-medium text-slate-700 dark:text-white">
                    {maxDuration}s
                  </span>
                </div>
              </div>

              {/* Target Width */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-white/70 mb-1.5">
                  Output Width (pixels)
                </label>
                <select
                  value={targetWidth}
                  onChange={(e) => setTargetWidth(parseInt(e.target.value))}
                  disabled={isSubmitting}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-red-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                >
                  <option value={320}>320px (Small)</option>
                  <option value={480}>480px (Standard)</option>
                  <option value={640}>640px (Large)</option>
                  <option value={720}>720px (HD)</option>
                </select>
              </div>

              {/* Frame Rate */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-white/70 mb-1.5">
                  Frame Rate (FPS)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={20}
                    value={frameRate}
                    onChange={(e) => setFrameRate(parseInt(e.target.value))}
                    disabled={isSubmitting}
                    className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-white/10 accent-red-500"
                  />
                  <span className="w-12 text-center text-sm font-medium text-slate-700 dark:text-white">
                    {frameRate} fps
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-slate-400 dark:text-white/40">
                  10-15 fps is optimal for most GIFs
                </p>
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
              <Film className="h-3.5 w-3.5" />
              How it works
            </h4>
            <ul className="space-y-1.5 text-[11px] text-slate-500 dark:text-white/50">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-3.5 w-3.5 mt-0.5 text-green-500 flex-shrink-0" />
                AI transcribes audio and analyzes for viral moments
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-3.5 w-3.5 mt-0.5 text-green-500 flex-shrink-0" />
                Detects humor, emotion peaks, and shareable content
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-3.5 w-3.5 mt-0.5 text-green-500 flex-shrink-0" />
                Generates GIFs with optimized text overlays
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
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
                <Zap className="h-4 w-4" />
                {sourceType === "file" ? "Upload & Generate" : "Generate"} {gifCount} GIF{gifCount > 1 ? "s" : ""}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

export default GifGeneratorModal;
