"use client";

import type { FC, ChangeEvent } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { X, Camera, Check, Loader2, RotateCcw, Play, Pause } from "lucide-react";

type ThumbnailPickerProps = {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string;
  clipId: Id<"generated_clips"> | Id<"clips"> | Id<"processing_clips">;
  clipType: "generated" | "youtube" | "processing";
  onThumbnailSaved?: (thumbnailUrl: string) => void;
  currentThumbnailUrl?: string;
};

/**
 * ThumbnailPicker - A modal component for selecting and saving 9:16 thumbnails from video
 *
 * Features:
 * - Video playback with seek capability
 * - Frame capture at current timestamp
 * - 9:16 aspect ratio crop preview
 * - Upload to Convex storage
 */
export const ThumbnailPicker: FC<ThumbnailPickerProps> = ({
  isOpen,
  onClose,
  videoUrl,
  clipId,
  clipType,
  onThumbnailSaved,
  currentThumbnailUrl,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Convex mutations
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const saveCustomThumbnail = useMutation(api.storage.saveCustomThumbnail);
  const saveClipCustomThumbnail = useMutation(api.storage.saveClipCustomThumbnail);
  const saveProcessingClipCustomThumbnail = useMutation(api.storage.saveProcessingClipCustomThumbnail);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setCapturedFrame(null);
      setError(null);
      setCurrentTime(0);
      setIsPlaying(false);
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

  // Capture current frame as 9:16 thumbnail
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Target dimensions for 9:16 aspect ratio (1080x1920 for high quality)
    const targetWidth = 1080;
    const targetHeight = 1920;
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // Calculate source dimensions to maintain 9:16 crop from center
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // Calculate the crop area from the video
    // For 9:16 from a 16:9 video, we need to crop horizontally
    const targetAspect = 9 / 16;
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
    setCapturedFrame(dataUrl);
    setError(null);
  }, []);

  // Reset captured frame
  const resetCapture = useCallback(() => {
    setCapturedFrame(null);
    setError(null);
  }, []);

  // Save captured frame to Convex storage
  const saveFrame = useCallback(async () => {
    if (!capturedFrame) return;

    setIsSaving(true);
    setError(null);

    try {
      // Convert data URL to blob
      const response = await fetch(capturedFrame);
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
        throw new Error("Failed to upload thumbnail");
      }

      const { storageId } = await uploadResponse.json();

      // Save to appropriate table based on clip type
      let thumbnailUrl: string | null;
      if (clipType === "generated") {
        thumbnailUrl = await saveCustomThumbnail({
          clipId: clipId as Id<"generated_clips">,
          storageId,
          timestamp: currentTime,
        });
      } else if (clipType === "processing") {
        thumbnailUrl = await saveProcessingClipCustomThumbnail({
          clipId: clipId as Id<"processing_clips">,
          storageId,
          timestamp: currentTime,
        });
      } else {
        thumbnailUrl = await saveClipCustomThumbnail({
          clipId: clipId as Id<"clips">,
          storageId,
          timestamp: currentTime,
        });
      }

      if (thumbnailUrl) {
        onThumbnailSaved?.(thumbnailUrl);
      }

      onClose();
    } catch (err) {
      console.error("Error saving thumbnail:", err);
      setError(err instanceof Error ? err.message : "Failed to save thumbnail");
    } finally {
      setIsSaving(false);
    }
  }, [
    capturedFrame,
    currentTime,
    clipId,
    clipType,
    generateUploadUrl,
    saveCustomThumbnail,
    saveClipCustomThumbnail,
    saveProcessingClipCustomThumbnail,
    onThumbnailSaved,
    onClose,
  ]);

  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Select Thumbnail
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Scrub to a frame and capture a 9:16 thumbnail
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
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Video Player Section */}
            <div>
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Video Preview
              </h3>
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
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />

                {/* Capture Button */}
                <button
                  onClick={captureFrame}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                >
                  <Camera className="w-5 h-5" />
                  Capture Frame
                </button>
              </div>
            </div>

            {/* Preview Section */}
            <div>
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                9:16 Thumbnail Preview
              </h3>
              <div className="relative bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden aspect-[9/16] max-h-[400px]">
                {capturedFrame ? (
                  <img
                    src={capturedFrame}
                    alt="Captured thumbnail"
                    className="w-full h-full object-cover"
                  />
                ) : currentThumbnailUrl ? (
                  <div className="relative w-full h-full">
                    <img
                      src={currentThumbnailUrl}
                      alt="Current thumbnail"
                      className="w-full h-full object-cover opacity-50"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-slate-500 dark:text-slate-400 text-sm text-center px-4">
                        Current thumbnail<br />
                        <span className="text-xs">Capture a new frame to replace</span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <p className="text-slate-400 dark:text-slate-500 text-sm text-center px-4">
                      Capture a frame from<br />the video to preview
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              {capturedFrame && (
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={resetCapture}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </button>
                  <button
                    onClick={saveFrame}
                    disabled={isSaving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 disabled:bg-green-400 text-white rounded-lg font-medium transition-colors"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Save Thumbnail
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
      </div>
    </div>
  );
};

export default ThumbnailPicker;
