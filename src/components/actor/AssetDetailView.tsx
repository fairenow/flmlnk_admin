"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  ChevronLeft,
  Play,
  Pause,
  Download,
  Eye,
  EyeOff,
  Trash2,
  Clock,
  TrendingUp,
  Heart,
  Copy,
  Check,
  Hash,
  Film,
  Image as ImageIcon,
  Video,
  Loader2,
  MoreHorizontal,
  Sparkles,
  ChevronDown,
  Filter,
  Maximize2,
} from "lucide-react";
import type { AssetType } from "./JobCard";

// Filter options
export type FilterOption = "recent" | "oldest" | "highest" | "lowest";

export const filterLabels: Record<FilterOption, string> = {
  recent: "Most Recent",
  oldest: "Oldest First",
  highest: "Highest Score",
  lowest: "Lowest Score",
};

// Base asset type that all assets share
export type BaseAsset = {
  id: string;
  title: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  score: number;
  isPublic: boolean;
  isFavorite?: boolean;
  createdAt: number;
  duration?: number;
};

// Extended types for specific assets
export type ClipAsset = BaseAsset & {
  type: "clip";
  description?: string;
  transcript?: string;
};

export type MemeAsset = BaseAsset & {
  type: "meme";
  caption: string;
  templateType?: string;
  sentiment?: string;
  suggestedHashtags?: string[];
};

export type GifAsset = BaseAsset & {
  type: "gif";
  overlayText?: string;
  humorScore?: number;
  emotionalIntensity?: number;
  hasLaughter?: boolean;
  hasAudioPeak?: boolean;
  transcript?: string;
  fileSize?: number;
  mp4Url?: string;
};

export type Asset = ClipAsset | MemeAsset | GifAsset;

type AssetDetailViewProps = {
  isOpen: boolean;
  onClose: () => void;
  jobTitle: string;
  jobId: string;
  assetType: AssetType;
  assets: Asset[];
  isLoading?: boolean;
  // Actions
  onToggleVisibility?: (assetId: string, currentIsPublic: boolean) => Promise<void>;
  onToggleFavorite?: (assetId: string, currentIsFavorite: boolean) => Promise<void>;
  onDelete?: (assetId: string) => Promise<void>;
  onDownload?: (assetId: string, url: string) => void;
  // For clips - additional actions
  onChangeThumbnail?: (assetId: string) => void;
  onExtractHighlights?: (assetId: string) => void;
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
  return `${secs}s`;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Viral";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Low";
}

function getSentimentColor(sentiment: string): string {
  switch (sentiment?.toLowerCase()) {
    case "funny":
      return "bg-amber-500/20 text-amber-300 ring-amber-500/30";
    case "relatable":
      return "bg-blue-500/20 text-blue-300 ring-blue-500/30";
    case "absurd":
      return "bg-purple-500/20 text-purple-300 ring-purple-500/30";
    case "wholesome":
      return "bg-pink-500/20 text-pink-300 ring-pink-500/30";
    case "sarcastic":
      return "bg-orange-500/20 text-orange-300 ring-orange-500/30";
    default:
      return "bg-slate-500/20 text-slate-300 ring-slate-500/30";
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function AssetDetailView({
  isOpen,
  onClose,
  jobTitle,
  jobId,
  assetType,
  assets,
  isLoading = false,
  onToggleVisibility,
  onToggleFavorite,
  onDelete,
  onDownload,
  onChangeThumbnail,
  onExtractHighlights,
}: AssetDetailViewProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [filterOption, setFilterOption] = useState<FilterOption>("recent");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [togglingVisibilityId, setTogglingVisibilityId] = useState<string | null>(null);
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sort assets based on filter
  const sortedAssets = React.useMemo(() => {
    const sorted = [...assets];
    switch (filterOption) {
      case "recent":
        return sorted.sort((a, b) => b.createdAt - a.createdAt);
      case "oldest":
        return sorted.sort((a, b) => a.createdAt - b.createdAt);
      case "highest":
        return sorted.sort((a, b) => b.score - a.score);
      case "lowest":
        return sorted.sort((a, b) => a.score - b.score);
      default:
        return sorted;
    }
  }, [assets, filterOption]);

  const selectedAsset = selectedAssetId
    ? sortedAssets.find((a) => a.id === selectedAssetId)
    : null;

  // Close filter menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowFilterMenu(false);
    if (showFilterMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showFilterMenu]);

  // Close asset menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    if (activeMenuId) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [activeMenuId]);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedAssetId) {
          setSelectedAssetId(null);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, selectedAssetId, onClose]);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedAssetId(null);
      setActiveMenuId(null);
      setShowFilterMenu(false);
    }
  }, [isOpen]);

  const handleToggleVisibility = useCallback(
    async (assetId: string, currentIsPublic: boolean) => {
      if (!onToggleVisibility) return;
      setTogglingVisibilityId(assetId);
      try {
        await onToggleVisibility(assetId, currentIsPublic);
      } finally {
        setTogglingVisibilityId(null);
      }
    },
    [onToggleVisibility]
  );

  const handleToggleFavorite = useCallback(
    async (assetId: string, currentIsFavorite: boolean) => {
      if (!onToggleFavorite) return;
      setTogglingFavoriteId(assetId);
      try {
        await onToggleFavorite(assetId, currentIsFavorite);
      } finally {
        setTogglingFavoriteId(null);
      }
    },
    [onToggleFavorite]
  );

  const handleDelete = useCallback(
    async (assetId: string) => {
      if (!onDelete) return;
      if (!confirm("Are you sure you want to delete this?")) return;
      setDeletingId(assetId);
      try {
        await onDelete(assetId);
        if (selectedAssetId === assetId) {
          setSelectedAssetId(null);
        }
      } finally {
        setDeletingId(null);
      }
    },
    [onDelete, selectedAssetId]
  );

  const handleCopy = useCallback(async (text: string, assetId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(assetId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  const toggleVideoPlayback = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const getAssetIcon = () => {
    switch (assetType) {
      case "clips":
        return Video;
      case "memes":
        return ImageIcon;
      case "gifs":
        return Film;
    }
  };

  const AssetIcon = getAssetIcon();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative ml-auto w-full max-w-4xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={selectedAssetId ? () => setSelectedAssetId(null) : onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              {selectedAssetId ? (
                <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-white/70" />
              ) : (
                <X className="w-5 h-5 text-slate-600 dark:text-white/70" />
              )}
            </button>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-1">
                {selectedAsset ? selectedAsset.title : jobTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-white/50">
                {selectedAsset
                  ? `Viewing ${assetType.slice(0, -1)}`
                  : `${sortedAssets.length} ${assetType}`}
              </p>
            </div>
          </div>

          {/* Filter (only in list view) */}
          {!selectedAssetId && sortedAssets.length > 1 && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFilterMenu(!showFilterMenu);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 dark:border-white/15 dark:bg-white/5 dark:text-white"
              >
                <Filter className="w-3.5 h-3.5" />
                {filterLabels[filterOption]}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showFilterMenu && (
                <div
                  className="absolute top-full right-0 mt-1 w-40 rounded-lg bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-20"
                  onClick={(e) => e.stopPropagation()}
                >
                  {(Object.keys(filterLabels) as FilterOption[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setFilterOption(option);
                        setShowFilterMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition ${
                        filterOption === option
                          ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                          : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      {filterLabels[option]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
            </div>
          ) : selectedAsset ? (
            /* Single Asset Detail View */
            <div className="p-4">
              {/* Media Preview */}
              <div className="relative aspect-video bg-slate-900 rounded-xl overflow-hidden mb-4">
                {selectedAsset.type === "clip" && selectedAsset.mediaUrl ? (
                  <>
                    <video
                      ref={videoRef}
                      src={selectedAsset.mediaUrl}
                      poster={selectedAsset.thumbnailUrl}
                      className="w-full h-full object-contain"
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                      controls
                    />
                  </>
                ) : selectedAsset.mediaUrl || selectedAsset.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedAsset.mediaUrl || selectedAsset.thumbnailUrl}
                    alt={selectedAsset.title}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <AssetIcon className="w-16 h-16 text-slate-600" />
                  </div>
                )}
              </div>

              {/* Asset Info */}
              <div className="space-y-4">
                {/* Title & Score */}
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {selectedAsset.title}
                  </h3>
                  {selectedAsset.score > 0 && (
                    <span
                      className={`inline-flex items-center gap-1 text-sm font-medium ${getScoreColor(
                        selectedAsset.score
                      )}`}
                    >
                      <TrendingUp className="w-4 h-4" />
                      {selectedAsset.score}% {getScoreLabel(selectedAsset.score)}
                    </span>
                  )}
                </div>

                {/* Type-specific content */}
                {selectedAsset.type === "meme" && (
                  <>
                    {/* Caption */}
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-white/5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-slate-700 dark:text-white/80">
                          {selectedAsset.caption}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleCopy(selectedAsset.caption, selectedAsset.id)}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-white"
                        >
                          {copiedId === selectedAsset.id ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Sentiment */}
                    {selectedAsset.sentiment && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 dark:text-white/50">Tone:</span>
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ring-1 ${getSentimentColor(
                            selectedAsset.sentiment
                          )}`}
                        >
                          {selectedAsset.sentiment}
                        </span>
                      </div>
                    )}

                    {/* Hashtags */}
                    {selectedAsset.suggestedHashtags && selectedAsset.suggestedHashtags.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 dark:text-white/50 mb-2">
                          Suggested Hashtags
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selectedAsset.suggestedHashtags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-0.5 text-xs text-slate-600 dark:text-white/70 bg-slate-100 dark:bg-white/10 px-2 py-1 rounded-full"
                            >
                              <Hash className="w-3 h-3" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {selectedAsset.type === "gif" && (
                  <>
                    {/* Overlay Text */}
                    {selectedAsset.overlayText && (
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-white/5">
                        <p className="text-sm text-slate-700 dark:text-white/80">
                          {selectedAsset.overlayText}
                        </p>
                      </div>
                    )}

                    {/* Scores */}
                    <div className="flex items-center gap-4">
                      {selectedAsset.humorScore !== undefined && selectedAsset.humorScore > 0 && (
                        <span className="text-sm text-slate-600 dark:text-white/70">
                          Humor:{" "}
                          <span className={getScoreColor(selectedAsset.humorScore)}>
                            {selectedAsset.humorScore}%
                          </span>
                        </span>
                      )}
                      {selectedAsset.emotionalIntensity !== undefined &&
                        selectedAsset.emotionalIntensity > 0 && (
                          <span className="text-sm text-slate-600 dark:text-white/70">
                            Emotional:{" "}
                            <span className={getScoreColor(selectedAsset.emotionalIntensity)}>
                              {selectedAsset.emotionalIntensity}%
                            </span>
                          </span>
                        )}
                    </div>

                    {/* Features */}
                    <div className="flex flex-wrap gap-2">
                      {selectedAsset.hasLaughter && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30">
                          Laughter Detected
                        </span>
                      )}
                      {selectedAsset.hasAudioPeak && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/30">
                          Audio Peak
                        </span>
                      )}
                    </div>

                    {/* File Size */}
                    {selectedAsset.fileSize && (
                      <p className="text-xs text-slate-500 dark:text-white/50">
                        Size: {formatFileSize(selectedAsset.fileSize)}
                      </p>
                    )}
                  </>
                )}

                {selectedAsset.type === "clip" && (
                  <>
                    {/* Duration */}
                    {selectedAsset.duration && (
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-white/70">
                        <Clock className="w-4 h-4" />
                        {formatDuration(selectedAsset.duration)}
                      </div>
                    )}

                    {/* Description */}
                    {selectedAsset.description && (
                      <p className="text-sm text-slate-600 dark:text-white/70">
                        {selectedAsset.description}
                      </p>
                    )}

                    {/* Transcript */}
                    {selectedAsset.transcript && (
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-white/5">
                        <p className="text-xs text-slate-500 dark:text-white/50 mb-1">Transcript</p>
                        <p className="text-sm text-slate-700 dark:text-white/80 italic">
                          "{selectedAsset.transcript}"
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-4 border-t border-slate-200 dark:border-white/10">
                  {/* Visibility */}
                  <button
                    type="button"
                    onClick={() =>
                      handleToggleVisibility(selectedAsset.id, selectedAsset.isPublic)
                    }
                    disabled={togglingVisibilityId === selectedAsset.id}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                      selectedAsset.isPublic
                        ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-500/20 dark:text-green-400"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-white/70"
                    }`}
                  >
                    {togglingVisibilityId === selectedAsset.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : selectedAsset.isPublic ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                    {selectedAsset.isPublic ? "Public" : "Hidden"}
                  </button>

                  {/* Favorite (for memes and gifs) */}
                  {(selectedAsset.type === "meme" || selectedAsset.type === "gif") &&
                    onToggleFavorite && (
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleFavorite(selectedAsset.id, selectedAsset.isFavorite ?? false)
                        }
                        disabled={togglingFavoriteId === selectedAsset.id}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                          selectedAsset.isFavorite
                            ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-500/20 dark:text-red-400"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-white/70"
                        }`}
                      >
                        {togglingFavoriteId === selectedAsset.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Heart
                            className={`w-4 h-4 ${selectedAsset.isFavorite ? "fill-current" : ""}`}
                          />
                        )}
                        Favorite
                      </button>
                    )}

                  {/* Download */}
                  {selectedAsset.mediaUrl && (
                    <a
                      href={selectedAsset.mediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/20 transition"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                  )}

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedAsset.id)}
                    disabled={deletingId === selectedAsset.id}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200 dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/30 transition ml-auto"
                  >
                    {deletingId === selectedAsset.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Asset Grid View */
            <div className="p-4">
              {sortedAssets.length === 0 ? (
                <div className="text-center py-12">
                  <AssetIcon className="w-12 h-12 mx-auto text-slate-300 dark:text-white/30 mb-3" />
                  <p className="text-sm text-slate-500 dark:text-white/50">
                    No {assetType} in this job
                  </p>
                </div>
              ) : (
                <div
                  className={`grid gap-4 ${
                    assetType === "clips"
                      ? "grid-cols-2 sm:grid-cols-3"
                      : "grid-cols-2 sm:grid-cols-3"
                  }`}
                >
                  {sortedAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white cursor-pointer transition-all hover:shadow-lg hover:border-slate-300 dark:border-white/10 dark:bg-black/20 dark:hover:border-white/20"
                      onClick={() => setSelectedAssetId(asset.id)}
                    >
                      {/* Thumbnail */}
                      <div
                        className={`relative bg-slate-100 dark:bg-slate-800 ${
                          assetType === "clips" ? "aspect-[9/16]" : "aspect-square"
                        }`}
                      >
                        {asset.thumbnailUrl || asset.mediaUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={asset.thumbnailUrl || asset.mediaUrl}
                            alt={asset.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <AssetIcon className="w-8 h-8 text-slate-400 dark:text-slate-600" />
                          </div>
                        )}

                        {/* Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                        {/* Play Button Overlay (for clips) */}
                        {assetType === "clips" && asset.mediaUrl && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-10 h-10 rounded-full bg-red-500/90 flex items-center justify-center">
                              <Play className="w-4 h-4 text-white ml-0.5" fill="currentColor" />
                            </div>
                          </div>
                        )}

                        {/* Top badges */}
                        <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full backdrop-blur-sm ${
                              asset.isPublic
                                ? "bg-green-500/80 text-white"
                                : "bg-black/50 text-white/70"
                            }`}
                          >
                            {asset.isPublic ? "Public" : "Hidden"}
                          </span>
                          {asset.isFavorite && (
                            <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                          )}
                        </div>

                        {/* Duration badge (for clips and gifs) */}
                        {asset.duration && (
                          <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] text-white bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded">
                            <Clock className="w-3 h-3" />
                            {formatDuration(asset.duration)}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-2">
                        <h4 className="text-xs font-medium text-slate-900 dark:text-white line-clamp-1 mb-1">
                          {asset.title}
                        </h4>
                        <div className="flex items-center justify-between text-[10px]">
                          {asset.score > 0 && (
                            <span
                              className={`flex items-center gap-0.5 ${getScoreColor(asset.score)}`}
                            >
                              <TrendingUp className="w-3 h-3" />
                              {asset.score}%
                            </span>
                          )}
                          {asset.type === "meme" && asset.sentiment && (
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ring-1 ${getSentimentColor(
                                asset.sentiment
                              )}`}
                            >
                              {asset.sentiment}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

export default AssetDetailView;
