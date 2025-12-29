"use client";

import type { FC, ChangeEvent } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  X,
  Camera,
  Loader2,
  Trash2,
  Download,
  Play,
  Pause,
  Image,
  Save,
  Sparkles,
} from "lucide-react";

type ExtractedFrame = {
  id: string;
  dataUrl: string;
  timestamp: number;
  width: number;
  height: number;
};

type HighlightExtractorProps = {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string;
  sourceType: "generated_clip" | "youtube_clip" | "youtube_video";
  sourceId?: string;
  sourceTitle?: string;
  slug: string;
  onAssetsSaved?: (count: number) => void;
};

/**
 * HighlightExtractor - Extract multiple 9:16 frames from video for social media
 *
 * Features:
 * - Video playback with timeline scrubber
 * - Multi-frame capture at different timestamps
 * - Automatic 9:16 center-crop
 * - Batch upload to Convex storage
 * - Preview grid of extracted frames
 */
export const HighlightExtractor: FC<HighlightExtractorProps> = ({
  isOpen,
  onClose,
  videoUrl,
  sourceType,
  sourceId,
  sourceTitle,
  slug,
  onAssetsSaved,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [extractedFrames, setExtractedFrames] = useState<ExtractedFrame[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savingProgress, setSavingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Convex mutations
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  // Type will be available after Convex regenerates types with mediaAssets module
  const createAssetsBatch = useMutation((api as any).mediaAssets.createAssetsBatch);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setExtractedFrames([]);
      setError(null);
      setCurrentTime(0);
      setIsPlaying(false);
      setSavingProgress(0);
    }
  }, [isOpen]);

  // Update time display as video plays
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  // Handle video metadata load
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  // Handle seek via slider
  const handleSeek = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  // Get dimensions based on aspect ratio
  const getTargetDimensions = useCallback((ratio: "9:16" | "1:1" | "16:9") => {
    switch (ratio) {
      case "9:16":
        return { width: 1080, height: 1920 };
      case "1:1":
        return { width: 1080, height: 1080 };
      case "16:9":
        return { width: 1920, height: 1080 };
    }
  }, []);

  // Capture current frame
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width: targetWidth, height: targetHeight } = getTargetDimensions(aspectRatio);
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // Calculate source dimensions to maintain crop from center
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    const targetAspect = targetWidth / targetHeight;
    const videoAspect = videoWidth / videoHeight;

    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = videoWidth;
    let sourceHeight = videoHeight;

    if (videoAspect > targetAspect) {
      // Video is wider than target - crop horizontally (center crop)
      sourceWidth = videoHeight * targetAspect;
      sourceX = (videoWidth - sourceWidth) / 2;
    } else {
      // Video is taller than target - crop vertically (center crop)
      sourceHeight = videoWidth / targetAspect;
      sourceY = (videoHeight - sourceHeight) / 2;
    }

    // Draw the cropped frame to canvas
    ctx.drawImage(
      video,
      sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, targetWidth, targetHeight
    );

    // Convert to data URL
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

    const newFrame: ExtractedFrame = {
      id: `frame-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      dataUrl,
      timestamp: currentTime,
      width: targetWidth,
      height: targetHeight,
    };

    setExtractedFrames((prev) => [...prev, newFrame]);
    setError(null);
  }, [currentTime, aspectRatio, getTargetDimensions]);

  // Remove a frame
  const removeFrame = useCallback((frameId: string) => {
    setExtractedFrames((prev) => prev.filter((f) => f.id !== frameId));
  }, []);

  // Clear all frames
  const clearAllFrames = useCallback(() => {
    setExtractedFrames([]);
  }, []);

  // Save all frames to Convex
  const saveAllFrames = useCallback(async () => {
    if (extractedFrames.length === 0) return;

    setIsSaving(true);
    setError(null);
    setSavingProgress(0);

    try {
      const assetsToCreate: {
        storageId: Id<"_storage">;
        sourceType: string;
        sourceId?: string;
        sourceTitle?: string;
        title?: string;
        timestamp?: number;
        width: number;
        height: number;
        aspectRatio: string;
        assetType: string;
      }[] = [];

      // Upload each frame
      for (let i = 0; i < extractedFrames.length; i++) {
        const frame = extractedFrames[i];
        setSavingProgress(Math.round(((i + 0.5) / extractedFrames.length) * 100));

        // Convert data URL to blob
        const response = await fetch(frame.dataUrl);
        const blob = await response.blob();

        // Get upload URL from Convex
        const uploadUrl = await generateUploadUrl();

        // Upload to Convex storage
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": blob.type },
          body: blob,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Failed to upload frame ${i + 1}`);
        }

        const { storageId } = await uploadResponse.json();

        assetsToCreate.push({
          storageId,
          sourceType,
          sourceId,
          sourceTitle,
          title: `Highlight ${i + 1}`,
          timestamp: frame.timestamp,
          width: frame.width,
          height: frame.height,
          aspectRatio,
          assetType: "highlight",
        });

        setSavingProgress(Math.round(((i + 1) / extractedFrames.length) * 100));
      }

      // Batch create assets
      await createAssetsBatch({
        slug,
        assets: assetsToCreate,
      });

      onAssetsSaved?.(extractedFrames.length);
      onClose();
    } catch (err) {
      console.error("Error saving frames:", err);
      setError(err instanceof Error ? err.message : "Failed to save frames");
    } finally {
      setIsSaving(false);
    }
  }, [
    extractedFrames,
    sourceType,
    sourceId,
    sourceTitle,
    aspectRatio,
    slug,
    generateUploadUrl,
    createAssetsBatch,
    onAssetsSaved,
    onClose,
  ]);

  // Download all frames as individual files
  const downloadAllFrames = useCallback(() => {
    extractedFrames.forEach((frame, index) => {
      const link = document.createElement("a");
      link.href = frame.dataUrl;
      link.download = `highlight-${index + 1}-${aspectRatio.replace(":", "x")}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }, [extractedFrames, aspectRatio]);

  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-6xl w-full mx-4 max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Extract Highlights
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Capture multiple frames for social media content
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Video Player Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Video Preview
                </h3>
                {/* Aspect Ratio Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Format:</span>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as "9:16" | "1:1" | "16:9")}
                    className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    <option value="9:16">9:16 (Stories/Reels)</option>
                    <option value="1:1">1:1 (Square)</option>
                    <option value="16:9">16:9 (Landscape)</option>
                  </select>
                </div>
              </div>

              <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  crossOrigin="anonymous"
                  playsInline
                />

                {/* Crop overlay preview */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div
                    className="border-2 border-amber-400/50 border-dashed"
                    style={{
                      aspectRatio: aspectRatio.replace(":", "/"),
                      height: aspectRatio === "16:9" ? "100%" : "90%",
                    }}
                  />
                </div>
              </div>

              {/* Video Controls */}
              <div className="mt-4 space-y-3">
                {/* Play/Pause Button */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                    ) : (
                      <Play className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                    )}
                  </button>
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* Timeline Slider */}
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />

                {/* Capture Button */}
                <button
                  onClick={captureFrame}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
                >
                  <Camera className="w-5 h-5" />
                  Capture Frame ({aspectRatio})
                </button>
              </div>
            </div>

            {/* Captured Frames Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Captured Frames ({extractedFrames.length})
                </h3>
                {extractedFrames.length > 0 && (
                  <button
                    onClick={clearAllFrames}
                    className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear All
                  </button>
                )}
              </div>

              {extractedFrames.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600">
                  <Image className="w-12 h-12 text-slate-400 mb-3" />
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                    No frames captured yet
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Scrub to a moment and click Capture Frame
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 max-h-[400px] overflow-y-auto p-1">
                  {extractedFrames.map((frame, index) => (
                    <div
                      key={frame.id}
                      className="relative group rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800"
                      style={{ aspectRatio: aspectRatio.replace(":", "/") }}
                    >
                      <img
                        src={frame.dataUrl}
                        alt={`Frame ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      {/* Overlay */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          onClick={() => removeFrame(frame.id)}
                          className="p-2 bg-red-500 rounded-full text-white hover:bg-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {/* Timestamp Badge */}
                      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white">
                        {formatTime(frame.timestamp)}
                      </div>
                      {/* Index Badge */}
                      <div className="absolute top-1 right-1 w-5 h-5 bg-amber-500 rounded-full text-[10px] text-white flex items-center justify-center font-medium">
                        {index + 1}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              {extractedFrames.length > 0 && (
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={downloadAllFrames}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download All
                  </button>
                  <button
                    onClick={saveAllFrames}
                    disabled={isSaving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 disabled:bg-green-400 text-white rounded-lg font-medium transition-colors"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving... {savingProgress}%
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save to Assets
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Hidden canvas for frame capture */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Footer with source info */}
        {sourceTitle && (
          <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Source: <span className="text-slate-700 dark:text-slate-300">{sourceTitle}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HighlightExtractor;
