"use client";

import React, { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  FolderTree,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Trash2,
  Plus,
  Search,
  Grid,
  List,
  Download,
  Star,
  StarOff,
  X,
  Check,
  Camera,
  Video,
  Upload,
  ArrowLeft,
  Share2,
  Megaphone,
  Newspaper,
  Clapperboard,
  Loader2,
  Clock,
  Film,
  Sparkles,
} from "lucide-react";

// Types
type Project = {
  _id: Id<"image_manager_projects">;
  name: string;
  description?: string;
  projectType?: string;
  coverUrl?: string;
  status?: string;
  releaseYear?: number;
  genre?: string;
  createdAt: number;
};

type ImageFolder = {
  _id: Id<"image_manager_folders">;
  projectId: Id<"image_manager_projects">;
  parentId?: Id<"image_manager_folders">;
  name: string;
  folderType?: string;
  color?: string;
  icon?: string;
  isExpanded?: boolean;
  assetCount?: number;
};

type Asset = {
  _id: Id<"image_manager_assets">;
  projectId: Id<"image_manager_projects">;
  folderId?: Id<"image_manager_folders">;
  name: string;
  description?: string;
  url: string;
  width: number;
  height: number;
  aspectRatio: string;
  sourceType: string;
  sourceTitle?: string;
  sourceTimestamp?: number;
  assetCategory: string;
  tags?: string[];
  isFavorite?: boolean;
  isPublic?: boolean;
  createdAt: number;
};

type ProjectWithDetails = Project & {
  folders: ImageFolder[];
  rootAssetCount: number;
  totalAssets: number;
};

type ImageManagerProps = {
  slug: string;
};

// Icon mapping for folder types
const folderIcons: Record<string, React.ReactNode> = {
  social_media: <Share2 className="h-4 w-4" />,
  paid_ads: <Megaphone className="h-4 w-4" />,
  press_kit: <Newspaper className="h-4 w-4" />,
  thumbnails: <ImageIcon className="h-4 w-4" />,
  bts: <Camera className="h-4 w-4" />,
  custom: <Folder className="h-4 w-4" />,
};

// Category colors
const categoryColors: Record<string, string> = {
  social_media: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  paid_ad: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  thumbnail: "bg-green-500/20 text-green-400 border-green-500/30",
  press: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  behind_scenes: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  promotional: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  custom: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

// ============================================================================
// NEW PROJECT MODAL
// ============================================================================
function NewProjectModal({
  isOpen,
  onClose,
  slug,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  onSuccess?: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectType, setProjectType] = useState("film");
  const [isCreating, setIsCreating] = useState(false);

  const createProject = useMutation(api.imageManager.createProject);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await createProject({
        slug,
        name: name.trim(),
        description: description.trim() || undefined,
        projectType,
      });
      onSuccess?.();
      onClose();
      setName("");
      setDescription("");
      setProjectType("film");
    } catch (err) {
      console.error("Failed to create project:", err);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            New Project
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Film Project"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Project Type
            </label>
            <select
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="film">Feature Film</option>
              <option value="series">TV Series</option>
              <option value="commercial">Commercial</option>
              <option value="music_video">Music Video</option>
              <option value="personal">Personal Project</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of your project..."
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isCreating}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Project
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// NEW FOLDER MODAL
// ============================================================================
function NewFolderModal({
  isOpen,
  onClose,
  slug,
  projectId,
  parentId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  projectId: Id<"image_manager_projects">;
  parentId?: Id<"image_manager_folders">;
  onSuccess?: () => void;
}) {
  const [name, setName] = useState("");
  const [folderType, setFolderType] = useState("custom");
  const [isCreating, setIsCreating] = useState(false);

  const createFolder = useMutation(api.imageManager.createFolder);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await createFolder({
        slug,
        projectId,
        parentId,
        name: name.trim(),
        folderType,
      });
      onSuccess?.();
      onClose();
      setName("");
      setFolderType("custom");
    } catch (err) {
      console.error("Failed to create folder:", err);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            New Folder
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Folder Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Folder"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Folder Type
            </label>
            <select
              value={folderType}
              onChange={(e) => setFolderType(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="custom">Custom</option>
              <option value="social_media">Social Media</option>
              <option value="paid_ads">Paid Ads</option>
              <option value="thumbnails">Thumbnails</option>
              <option value="press_kit">Press Kit</option>
              <option value="bts">Behind the Scenes</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isCreating}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FolderPlus className="h-4 w-4" />
                  Create Folder
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// AUTO CAPTURE MODAL
// ============================================================================
function AutoCaptureModal({
  isOpen,
  onClose,
  slug,
  projectId,
  folderId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  projectId: Id<"image_manager_projects">;
  folderId?: Id<"image_manager_folders">;
  onSuccess?: (assetIds: Id<"image_manager_assets">[]) => void;
}) {
  const [sourceType, setSourceType] = useState<"generated_clip" | "youtube_url">("generated_clip");
  const [selectedClipId, setSelectedClipId] = useState<Id<"generated_clips"> | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [captureMode, _setCaptureMode] = useState<"interval" | "smart">("interval");
  const [frameCount, setFrameCount] = useState(5);
  const [_intervalSeconds, _setIntervalSeconds] = useState(10);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [assetCategory, setAssetCategory] = useState("social_media");

  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedFrames, setCapturedFrames] = useState<Array<{ blob: Blob; timestamp: number; dataUrl: string }>>([]);
  const [currentStep, setCurrentStep] = useState<"config" | "capturing" | "preview">("config");
  const [progress, setProgress] = useState(0);

  const _videoRef = useRef<HTMLVideoElement>(null);
  const _canvasRef = useRef<HTMLCanvasElement>(null);

  const generatedClips = useQuery(api.clipGenerator.getGeneratedClipsByProfile, { slug });
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const createAssetsBatch = useMutation(api.imageManager.createAssetsBatch);

  const selectedClip = generatedClips?.find((c) => c._id === selectedClipId);

  // Aspect ratio dimensions
  const aspectRatioDimensions: Record<string, { width: number; height: number }> = {
    "9:16": { width: 1080, height: 1920 },
    "16:9": { width: 1920, height: 1080 },
    "1:1": { width: 1080, height: 1080 },
    "4:5": { width: 1080, height: 1350 },
  };

  const handleStartCapture = async () => {
    if (sourceType === "generated_clip" && !selectedClip?.downloadUrl) {
      alert("Please select a clip with a video URL");
      return;
    }

    setCurrentStep("capturing");
    setIsCapturing(true);
    setCapturedFrames([]);
    setProgress(0);

    const videoUrl = sourceType === "generated_clip"
      ? selectedClip?.downloadUrl
      : youtubeUrl;

    if (!videoUrl) return;

    try {
      // Create a video element to load the video
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = videoUrl;
      video.muted = true;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Failed to load video"));
      });

      const duration = video.duration;
      const frames: Array<{ blob: Blob; timestamp: number; dataUrl: string }> = [];

      // Calculate timestamps based on capture mode
      const timestamps: number[] = [];
      if (captureMode === "interval") {
        const interval = duration / (frameCount + 1);
        for (let i = 1; i <= frameCount; i++) {
          timestamps.push(interval * i);
        }
      } else {
        // Smart mode: capture at interesting points (for now, evenly distributed)
        const interval = duration / (frameCount + 1);
        for (let i = 1; i <= frameCount; i++) {
          timestamps.push(interval * i);
        }
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context");

      const targetDims = aspectRatioDimensions[aspectRatio];
      canvas.width = targetDims.width;
      canvas.height = targetDims.height;

      for (let i = 0; i < timestamps.length; i++) {
        const timestamp = timestamps[i];

        // Seek to timestamp
        video.currentTime = timestamp;
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
        });

        // Calculate crop dimensions to maintain aspect ratio
        const videoAspect = video.videoWidth / video.videoHeight;
        const targetAspect = targetDims.width / targetDims.height;

        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = video.videoWidth;
        let sourceHeight = video.videoHeight;

        if (videoAspect > targetAspect) {
          // Video is wider - crop sides
          sourceWidth = video.videoHeight * targetAspect;
          sourceX = (video.videoWidth - sourceWidth) / 2;
        } else {
          // Video is taller - crop top/bottom
          sourceHeight = video.videoWidth / targetAspect;
          sourceY = (video.videoHeight - sourceHeight) / 2;
        }

        // Draw the frame
        ctx.drawImage(
          video,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          targetDims.width,
          targetDims.height
        );

        // Convert to blob
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => {
              if (b) resolve(b);
              else reject(new Error("Failed to create blob"));
            },
            "image/png",
            1.0
          );
        });

        const dataUrl = canvas.toDataURL("image/png");
        frames.push({ blob, timestamp, dataUrl });

        setProgress(((i + 1) / timestamps.length) * 100);
      }

      setCapturedFrames(frames);
      setCurrentStep("preview");
    } catch (err) {
      console.error("Capture failed:", err);
      alert("Failed to capture frames. Make sure the video is accessible.");
      setCurrentStep("config");
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSaveFrames = async () => {
    if (capturedFrames.length === 0) return;

    setIsCapturing(true);
    try {
      const assets: Array<{
        name: string;
        storageId: Id<"_storage">;
        width: number;
        height: number;
        aspectRatio: string;
        fileSize: number;
        mimeType: string;
        sourceType: string;
        sourceId?: string;
        sourceTitle?: string;
        sourceTimestamp: number;
        assetCategory: string;
      }> = [];

      for (let i = 0; i < capturedFrames.length; i++) {
        const frame = capturedFrames[i];

        // Get upload URL
        const uploadUrl = await generateUploadUrl();

        // Upload the blob
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "image/png" },
          body: frame.blob,
        });

        if (!response.ok) throw new Error("Upload failed");

        const { storageId } = await response.json();
        const targetDims = aspectRatioDimensions[aspectRatio];

        assets.push({
          name: `Frame ${i + 1} - ${formatTimestamp(frame.timestamp)}`,
          storageId,
          width: targetDims.width,
          height: targetDims.height,
          aspectRatio,
          fileSize: frame.blob.size,
          mimeType: "image/png",
          sourceType: sourceType === "generated_clip" ? "generated_clip" : "youtube_url",
          sourceId: sourceType === "generated_clip" ? selectedClipId?.toString() : youtubeUrl,
          sourceTitle: sourceType === "generated_clip" ? selectedClip?.title : "YouTube Video",
          sourceTimestamp: frame.timestamp,
          assetCategory,
        });

        setProgress(((i + 1) / capturedFrames.length) * 100);
      }

      const assetIds = await createAssetsBatch({
        slug,
        projectId,
        folderId,
        assets,
      });

      onSuccess?.(assetIds);
      onClose();
      resetState();
    } catch (err) {
      console.error("Save failed:", err);
      alert("Failed to save frames");
    } finally {
      setIsCapturing(false);
    }
  };

  const resetState = () => {
    setCurrentStep("config");
    setCapturedFrames([]);
    setProgress(0);
    setSelectedClipId(null);
    setYoutubeUrl("");
  };

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 p-6 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30">
              <Camera className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Auto Capture Frames
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {currentStep === "config" && "Configure capture settings"}
                {currentStep === "capturing" && "Extracting frames..."}
                {currentStep === "preview" && "Review captured frames"}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              onClose();
              resetState();
            }}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {currentStep === "config" && (
            <div className="space-y-6">
              {/* Source Selection */}
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Video Source
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSourceType("generated_clip")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                      sourceType === "generated_clip"
                        ? "border-red-500 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-900/20 dark:text-red-400"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Sparkles className="h-4 w-4" />
                    Generated Clips
                  </button>
                  <button
                    onClick={() => setSourceType("youtube_url")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                      sourceType === "youtube_url"
                        ? "border-red-500 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-900/20 dark:text-red-400"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Video className="h-4 w-4" />
                    Video URL
                  </button>
                </div>
              </div>

              {/* Source-specific input */}
              {sourceType === "generated_clip" ? (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Select Clip
                  </label>
                  <select
                    value={selectedClipId || ""}
                    onChange={(e) => setSelectedClipId(e.target.value as Id<"generated_clips">)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">Select a clip...</option>
                    {generatedClips?.map((clip) => (
                      <option key={clip._id} value={clip._id}>
                        {clip.title} ({Math.round(clip.duration)}s)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Video URL
                  </label>
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              )}

              {/* Capture Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Number of Frames
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={frameCount}
                    onChange={(e) => setFrameCount(parseInt(e.target.value) || 5)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Aspect Ratio
                  </label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="9:16">9:16 (Stories/Reels)</option>
                    <option value="16:9">16:9 (YouTube)</option>
                    <option value="1:1">1:1 (Square)</option>
                    <option value="4:5">4:5 (Instagram)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Asset Category
                </label>
                <select
                  value={assetCategory}
                  onChange={(e) => setAssetCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="social_media">Social Media</option>
                  <option value="paid_ad">Paid Ads</option>
                  <option value="thumbnail">Thumbnails</option>
                  <option value="press">Press Kit</option>
                  <option value="promotional">Promotional</option>
                  <option value="behind_scenes">Behind the Scenes</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>
          )}

          {currentStep === "capturing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-red-500" />
              <p className="mt-4 text-lg font-medium text-slate-900 dark:text-white">
                Capturing frames...
              </p>
              <div className="mt-4 h-2 w-64 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full bg-red-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {Math.round(progress)}% complete
              </p>
            </div>
          )}

          {currentStep === "preview" && (
            <div>
              <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                {capturedFrames.length} frames captured. Click save to add them to your project.
              </p>
              <div className="grid max-h-96 grid-cols-3 gap-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                {capturedFrames.map((frame, i) => (
                  <div
                    key={i}
                    className="group relative overflow-hidden rounded-lg bg-slate-900"
                  >
                    <img
                      src={frame.dataUrl}
                      alt={`Frame ${i + 1}`}
                      className="aspect-[9/16] w-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <p className="text-xs font-medium text-white">
                        {formatTimestamp(frame.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-slate-200 p-6 dark:border-slate-700">
          {currentStep === "config" && (
            <>
              <button
                onClick={() => {
                  onClose();
                  resetState();
                }}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleStartCapture}
                disabled={(sourceType === "generated_clip" && !selectedClipId) || (sourceType === "youtube_url" && !youtubeUrl)}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Camera className="h-4 w-4" />
                Start Capture
              </button>
            </>
          )}

          {currentStep === "preview" && (
            <>
              <button
                onClick={() => setCurrentStep("config")}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Recapture
              </button>
              <button
                onClick={handleSaveFrames}
                disabled={isCapturing}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCapturing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Save {capturedFrames.length} Frames
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// UPLOAD MODAL
// ============================================================================
function UploadModal({
  isOpen,
  onClose,
  slug,
  projectId,
  folderId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  projectId: Id<"image_manager_projects">;
  folderId?: Id<"image_manager_folders">;
  onSuccess?: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [assetCategory, setAssetCategory] = useState("social_media");
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const createAsset = useMutation(api.imageManager.createAsset);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const imageFiles = selectedFiles.filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...imageFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setProgress(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Get dimensions
        const dimensions = await getImageDimensions(file);

        // Get upload URL
        const uploadUrl = await generateUploadUrl();

        // Upload file
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!response.ok) throw new Error("Upload failed");

        const { storageId } = await response.json();
        const aspectRatio = getAspectRatioLabel(dimensions.width, dimensions.height);

        await createAsset({
          slug,
          projectId,
          folderId,
          name: file.name.replace(/\.[^/.]+$/, ""),
          storageId,
          width: dimensions.width,
          height: dimensions.height,
          aspectRatio,
          fileSize: file.size,
          mimeType: file.type,
          sourceType: "manual_upload",
          assetCategory,
        });

        setProgress(((i + 1) / files.length) * 100);
      }

      onSuccess?.();
      onClose();
      setFiles([]);
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Failed to upload files");
    } finally {
      setIsUploading(false);
    }
  };

  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const getAspectRatioLabel = (width: number, height: number): string => {
    const ratio = width / height;
    if (Math.abs(ratio - 9 / 16) < 0.1) return "9:16";
    if (Math.abs(ratio - 16 / 9) < 0.1) return "16:9";
    if (Math.abs(ratio - 1) < 0.1) return "1:1";
    if (Math.abs(ratio - 4 / 5) < 0.1) return "4:5";
    return `${width}:${height}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 p-6 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Upload Images
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Drop Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center transition-colors hover:border-red-500 hover:bg-red-50/50 dark:border-slate-600 dark:bg-slate-800/50 dark:hover:border-red-500 dark:hover:bg-red-900/10"
          >
            <Upload className="mx-auto h-10 w-10 text-slate-400" />
            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              Click to upload or drag and drop
            </p>
            <p className="mt-1 text-xs text-slate-500">
              PNG, JPG, GIF up to 10MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="max-h-40 space-y-2 overflow-y-auto">
              {files.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <ImageIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                      {file.name}
                    </span>
                  </div>
                  <button
                    onClick={() => removeFile(i)}
                    className="flex-shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Category */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Asset Category
            </label>
            <select
              value={assetCategory}
              onChange={(e) => setAssetCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="social_media">Social Media</option>
              <option value="paid_ad">Paid Ads</option>
              <option value="thumbnail">Thumbnails</option>
              <option value="press">Press Kit</option>
              <option value="promotional">Promotional</option>
              <option value="behind_scenes">Behind the Scenes</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {/* Progress */}
          {isUploading && (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full bg-red-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-center text-xs text-slate-500">
                Uploading {Math.round(progress)}%
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 p-6 dark:border-slate-700">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={files.length === 0 || isUploading}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload {files.length} {files.length === 1 ? "File" : "Files"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FOLDER TREE ITEM
// ============================================================================
function FolderTreeItem({
  folder,
  folders,
  selectedFolderId,
  onSelect,
  onToggleExpand,
  depth = 0,
}: {
  folder: ImageFolder;
  folders: ImageFolder[];
  selectedFolderId?: Id<"image_manager_folders">;
  onSelect: (folderId: Id<"image_manager_folders">) => void;
  onToggleExpand: (folderId: Id<"image_manager_folders">) => void;
  depth?: number;
}) {
  const childFolders = folders.filter((f) => f.parentId === folder._id);
  const hasChildren = childFolders.length > 0;
  const isSelected = selectedFolderId === folder._id;
  const isExpanded = folder.isExpanded;

  return (
    <div>
      <button
        onClick={() => onSelect(folder._id)}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
          isSelected
            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(folder._id);
            }}
            className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        {isExpanded ? (
          <FolderOpen className="h-4 w-4 flex-shrink-0 text-amber-500" />
        ) : (
          folderIcons[folder.folderType || "custom"] || (
            <Folder className="h-4 w-4 flex-shrink-0 text-amber-500" />
          )
        )}
        <span className="flex-1 truncate">{folder.name}</span>
        {(folder.assetCount ?? 0) > 0 && (
          <span className="flex-shrink-0 rounded-full bg-slate-200 px-1.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
            {folder.assetCount}
          </span>
        )}
      </button>

      {hasChildren && isExpanded && (
        <div>
          {childFolders.map((child) => (
            <FolderTreeItem
              key={child._id}
              folder={child}
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ASSET CARD
// ============================================================================
function AssetCard({
  asset,
  isSelected,
  onSelect,
  onToggleFavorite,
  onDelete,
  onDownload,
}: {
  asset: Asset;
  isSelected: boolean;
  onSelect: (id: Id<"image_manager_assets">, multiSelect: boolean) => void;
  onToggleFavorite: (id: Id<"image_manager_assets">) => void;
  onDelete: (id: Id<"image_manager_assets">) => void;
  onDownload: (asset: Asset) => void;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border transition-all ${
        isSelected
          ? "border-red-500 ring-2 ring-red-500/20"
          : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
      }`}
    >
      {/* Image */}
      <div className="relative aspect-square bg-slate-100 dark:bg-slate-800">
        <img
          src={asset.url}
          alt={asset.name}
          className="h-full w-full object-cover"
        />

        {/* Selection Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(asset._id, e.shiftKey);
          }}
          className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border-2 transition-all ${
            isSelected
              ? "border-red-500 bg-red-500 text-white"
              : "border-white/80 bg-black/30 text-white opacity-0 group-hover:opacity-100"
          }`}
        >
          {isSelected && <Check className="h-4 w-4" />}
        </button>

        {/* Favorite Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(asset._id);
          }}
          className={`absolute right-2 top-2 rounded-full p-1.5 transition-all ${
            asset.isFavorite
              ? "bg-yellow-500 text-white"
              : "bg-black/30 text-white opacity-0 group-hover:opacity-100 hover:bg-yellow-500"
          }`}
        >
          {asset.isFavorite ? (
            <Star className="h-4 w-4 fill-current" />
          ) : (
            <StarOff className="h-4 w-4" />
          )}
        </button>

        {/* Hover Actions */}
        <div className="absolute bottom-2 left-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload(asset);
            }}
            className="flex-1 rounded-lg bg-black/60 px-2 py-1.5 text-xs font-medium text-white backdrop-blur-sm hover:bg-black/80"
          >
            <Download className="mx-auto h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(asset._id);
            }}
            className="rounded-lg bg-red-500/80 px-2 py-1.5 text-white backdrop-blur-sm hover:bg-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="truncate text-sm font-medium text-slate-900 dark:text-white">
          {asset.name}
        </h3>
        <div className="mt-1 flex items-center gap-2">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${categoryColors[asset.assetCategory] || categoryColors.custom}`}>
            {asset.assetCategory.replace("_", " ")}
          </span>
          <span className="text-xs text-slate-500">
            {asset.aspectRatio}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PROJECT VIEW
// ============================================================================
function ProjectView({
  slug,
  project,
  onBack,
}: {
  slug: string;
  project: ProjectWithDetails;
  onBack: () => void;
}) {
  const [selectedFolderId, setSelectedFolderId] = useState<Id<"image_manager_folders"> | undefined>();
  const [selectedAssets, setSelectedAssets] = useState<Set<Id<"image_manager_assets">>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showAutoCaptureModal, setShowAutoCaptureModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"folders" | "assets">("folders");

  const assets = useQuery(api.imageManager.getAssets, {
    slug,
    projectId: project._id,
    folderId: selectedFolderId,
    category: filterCategory || undefined,
  });

  const updateFolder = useMutation(api.imageManager.updateFolder);
  const updateAsset = useMutation(api.imageManager.updateAsset);
  const deleteAsset = useMutation(api.imageManager.deleteAsset);

  const rootFolders = project.folders.filter((f) => !f.parentId);

  const handleToggleExpand = async (folderId: Id<"image_manager_folders">) => {
    const folder = project.folders.find((f) => f._id === folderId);
    if (!folder) return;

    await updateFolder({
      slug,
      folderId,
      isExpanded: !folder.isExpanded,
    });
  };

  const handleSelectAsset = (id: Id<"image_manager_assets">, multiSelect: boolean) => {
    setSelectedAssets((prev) => {
      const newSet = new Set(multiSelect ? prev : []);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleToggleFavorite = async (id: Id<"image_manager_assets">) => {
    const asset = assets?.find((a) => a._id === id);
    if (!asset) return;

    await updateAsset({
      slug,
      assetId: id,
      isFavorite: !asset.isFavorite,
    });
  };

  const handleDeleteAsset = async (id: Id<"image_manager_assets">) => {
    if (!confirm("Are you sure you want to delete this asset?")) return;
    await deleteAsset({ slug, assetId: id });
    setSelectedAssets((prev) => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  };

  const handleDownload = async (asset: Asset) => {
    const link = document.createElement("a");
    link.href = asset.url;
    link.download = `${asset.name}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredAssets = assets?.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header - Mobile stacked, Desktop horizontal */}
      <div className="border-b border-slate-200 pb-4 dark:border-slate-700">
        {/* Desktop Layout */}
        <div className="hidden md:flex md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {project.name}
              </h2>
              <p className="text-sm text-slate-500">
                {project.totalAssets} assets • {project.folders.length} folders
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAutoCaptureModal(true)}
              className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              <Camera className="h-4 w-4" />
              Auto Capture
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              <Upload className="h-4 w-4" />
              Upload
            </button>
          </div>
        </div>

        {/* Mobile Layout - Stacked */}
        <div className="flex flex-col gap-3 md:hidden">
          {/* Back button and folder name */}
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {project.name}
            </h2>
          </div>

          {/* Stats */}
          <p className="text-sm text-slate-500 pl-1">
            {project.totalAssets} assets • {project.folders.length} folders
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAutoCaptureModal(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              <Camera className="h-4 w-4" />
              Auto Capture
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              <Upload className="h-4 w-4" />
              Upload
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Toggle Tabs - Folders/Assets */}
      <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/50 w-full mt-4 md:hidden">
        <button
          type="button"
          onClick={() => setMobileView("folders")}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mobileView === "folders"
              ? "bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <Folder className="w-4 h-4" />
            Folders
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMobileView("assets")}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mobileView === "assets"
              ? "bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <ImageIcon className="w-4 h-4" />
            Assets
          </span>
        </button>
      </div>

      <div className="flex flex-1 gap-6 pt-4 overflow-hidden">
        {/* Sidebar - Folder Tree (hidden on mobile unless folders tab selected) */}
        <div className={`${mobileView === "folders" ? "flex" : "hidden"} md:flex w-full md:w-64 flex-shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50 flex-col`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Folders
            </h3>
            <button
              onClick={() => setShowNewFolderModal(true)}
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>

          {/* All Assets */}
          <button
            onClick={() => {
              setSelectedFolderId(undefined);
              setMobileView("assets");
            }}
            className={`mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
              selectedFolderId === undefined
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            <FolderTree className="h-4 w-4" />
            <span className="flex-1">All Assets</span>
            <span className="rounded-full bg-slate-200 px-1.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
              {project.totalAssets}
            </span>
          </button>

          {/* Root Level */}
          <button
            onClick={() => {
              setSelectedFolderId(null as unknown as Id<"image_manager_folders">);
              setMobileView("assets");
            }}
            className={`mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
              selectedFolderId === null
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            <Folder className="h-4 w-4 text-amber-500" />
            <span className="flex-1">Root</span>
            <span className="rounded-full bg-slate-200 px-1.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
              {project.rootAssetCount}
            </span>
          </button>

          {/* Folder Tree */}
          <div className="space-y-0.5">
            {rootFolders.map((folder) => (
              <FolderTreeItem
                key={folder._id}
                folder={folder}
                folders={project.folders}
                selectedFolderId={selectedFolderId}
                onSelect={(folderId) => {
                  setSelectedFolderId(folderId);
                  setMobileView("assets");
                }}
                onToggleExpand={handleToggleExpand}
              />
            ))}
          </div>
        </div>

        {/* Main Content (hidden on mobile unless assets tab selected) */}
        <div className={`${mobileView === "assets" ? "flex" : "hidden"} md:flex flex-1 overflow-hidden flex-col`}>
          {/* Toolbar */}
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search assets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full md:w-64 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Filter */}
              <select
                value={filterCategory || ""}
                onChange={(e) => setFilterCategory(e.target.value || null)}
                className="w-full md:w-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="">All Categories</option>
                <option value="social_media">Social Media</option>
                <option value="paid_ad">Paid Ads</option>
                <option value="thumbnail">Thumbnails</option>
                <option value="press">Press Kit</option>
                <option value="behind_scenes">Behind the Scenes</option>
                <option value="promotional">Promotional</option>
              </select>
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800 self-end md:self-auto">
              <button
                onClick={() => setViewMode("grid")}
                className={`rounded-md p-1.5 ${
                  viewMode === "grid"
                    ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`rounded-md p-1.5 ${
                  viewMode === "list"
                    ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Asset Grid/List */}
          <div className="flex-1 overflow-y-auto">
            {!filteredAssets || filteredAssets.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 md:p-12 dark:border-slate-700 dark:bg-slate-800/30">
                <ImageIcon className="h-12 w-12 text-slate-300 dark:text-slate-600" />
                <h3 className="mt-4 text-lg font-medium text-slate-700 dark:text-slate-300">
                  No assets yet
                </h3>
                <p className="mt-1 text-sm text-slate-500 text-center">
                  Use Auto Capture to extract frames or upload images
                </p>
                <div className="mt-4 flex flex-col gap-2 w-full md:flex-row md:w-auto">
                  <button
                    onClick={() => setShowAutoCaptureModal(true)}
                    className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400"
                  >
                    <Camera className="h-4 w-4" />
                    Auto Capture
                  </button>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    <Upload className="h-4 w-4" />
                    Upload
                  </button>
                </div>
              </div>
            ) : (
              <div className={viewMode === "grid" ? "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" : "space-y-2"}>
                {filteredAssets.map((asset) => (
                  <AssetCard
                    key={asset._id}
                    asset={asset}
                    isSelected={selectedAssets.has(asset._id)}
                    onSelect={handleSelectAsset}
                    onToggleFavorite={handleToggleFavorite}
                    onDelete={handleDeleteAsset}
                    onDownload={handleDownload}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <NewFolderModal
        isOpen={showNewFolderModal}
        onClose={() => setShowNewFolderModal(false)}
        slug={slug}
        projectId={project._id}
        parentId={selectedFolderId}
      />

      <AutoCaptureModal
        isOpen={showAutoCaptureModal}
        onClose={() => setShowAutoCaptureModal(false)}
        slug={slug}
        projectId={project._id}
        folderId={selectedFolderId}
      />

      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        slug={slug}
        projectId={project._id}
        folderId={selectedFolderId}
      />
    </div>
  );
}

// ============================================================================
// MAIN IMAGE MANAGER COMPONENT
// ============================================================================
export function ImageManager({ slug }: ImageManagerProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"image_manager_projects"> | null>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);

  const projects = useQuery(api.imageManager.getProjects, { slug });
  const selectedProject = useQuery(
    api.imageManager.getProject,
    selectedProjectId ? { slug, projectId: selectedProjectId } : "skip"
  );
  const stats = useQuery(api.imageManager.getStats, { slug });
  const deleteProject = useMutation(api.imageManager.deleteProject);

  const handleDeleteProject = async (projectId: Id<"image_manager_projects">) => {
    if (!confirm("Are you sure you want to delete this project and all its contents?")) return;
    await deleteProject({ slug, projectId });
    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
    }
  };

  // Show project view if a project is selected
  if (selectedProjectId && selectedProject) {
    return (
      <ProjectView
        slug={slug}
        project={selectedProject}
        onBack={() => setSelectedProjectId(null)}
      />
    );
  }

  // Project list view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Image Manager
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Organize and manage your film project assets
          </p>
        </div>
        <button
          onClick={() => setShowNewProjectModal(true)}
          className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                <Film className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {stats.totalProjects}
                </p>
                <p className="text-sm text-slate-500">Projects</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <ImageIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {stats.totalAssets}
                </p>
                <p className="text-sm text-slate-500">Assets</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                <Star className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {stats.favoriteAssets}
                </p>
                <p className="text-sm text-slate-500">Favorites</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                <Clapperboard className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {stats.activeProjects}
                </p>
                <p className="text-sm text-slate-500">Active</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Projects Grid */}
      {!projects || projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-12 dark:border-slate-700 dark:bg-slate-800/30">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/30">
            <Film className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
            No projects yet
          </h3>
          <p className="mt-1 text-center text-sm text-slate-500">
            Create a project to start organizing your film assets
          </p>
          <button
            onClick={() => setShowNewProjectModal(true)}
            className="mt-4 flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700"
          >
            <Plus className="h-4 w-4" />
            Create Your First Project
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project._id}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:border-red-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:hover:border-red-800"
            >
              {/* Cover Image */}
              <div className="relative h-32 bg-gradient-to-br from-red-500 to-red-700">
                {project.coverUrl || project.firstAssetUrl ? (
                  <img
                    src={project.coverUrl || project.firstAssetUrl!}
                    alt={project.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Film className="h-12 w-12 text-white/30" />
                  </div>
                )}

                {/* Status Badge */}
                <div className="absolute right-3 top-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                    project.status === "active"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
                      : project.status === "archived"
                      ? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400"
                  }`}>
                    {project.status || "active"}
                  </span>
                </div>

                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteProject(project._id);
                  }}
                  className="absolute left-3 top-3 rounded-full bg-black/30 p-1.5 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <button
                onClick={() => setSelectedProjectId(project._id)}
                className="block w-full p-4 text-left"
              >
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {project.name}
                </h3>
                {project.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                    {project.description}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Folder className="h-3.5 w-3.5" />
                    {project.projectType || "film"}
                  </span>
                  {project.releaseYear && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {project.releaseYear}
                    </span>
                  )}
                </div>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* New Project Modal */}
      <NewProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        slug={slug}
      />
    </div>
  );
}
