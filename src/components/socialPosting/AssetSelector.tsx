"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Image as ImageIcon,
  Video,
  Sparkles,
  X,
  Check,
  Loader2,
  Search,
  Grid,
  List,
  Clock,
  Play,
} from "lucide-react";

// Asset type returned from the Convex query
export interface UnifiedAsset {
  id: string;
  type: "image" | "clip" | "meme";
  sourceTable: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  url?: string;
  duration?: number;
  aspectRatio?: string;
  score?: number;
  createdAt: number;
  r2Key?: string;
  storageId?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

// Asset reference to be stored in social_posts
export interface AssetRef {
  type: string;
  sourceTable: string;
  sourceId: string;
  r2Key?: string;
  storageId?: string;
  url?: string;
  mimeType?: string;
  duration?: number;
  width?: number;
  height?: number;
}

interface AssetSelectorProps {
  actorProfileId: Id<"actor_profiles">;
  selectedAsset: AssetRef | null;
  onSelectAsset: (asset: AssetRef | null) => void;
  onClose: () => void;
}

type AssetFilter = "all" | "image" | "clip" | "meme";
type ViewMode = "grid" | "list";

export function AssetSelector({
  actorProfileId,
  selectedAsset,
  onSelectAsset,
  onClose,
}: AssetSelectorProps) {
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch assets from Convex
  const assets = useQuery(api.socialPosting.getAssetsForSelector, {
    actorProfileId,
    assetType: filter,
    limit: 100,
  });

  // Filter assets by search query
  const filteredAssets = assets?.filter((asset) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      asset.title.toLowerCase().includes(query) ||
      asset.description?.toLowerCase().includes(query)
    );
  });

  const handleSelectAsset = (asset: UnifiedAsset) => {
    const assetRef: AssetRef = {
      type: asset.type === "clip" ? "video" : asset.type,
      sourceTable: asset.sourceTable,
      sourceId: asset.id,
      url: asset.url || asset.thumbnailUrl,
      r2Key: asset.r2Key,
      storageId: asset.storageId,
      mimeType: asset.mimeType || (asset.type === "clip" ? "video/mp4" : "image/jpeg"),
      duration: asset.duration,
      width: asset.width,
      height: asset.height,
    };

    // Toggle selection - if same asset is clicked, deselect
    if (selectedAsset?.sourceId === asset.id) {
      onSelectAsset(null);
    } else {
      onSelectAsset(assetRef);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[85vh] bg-white dark:bg-[#0f1219] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Select Asset
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filters & Search */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 space-y-4">
          {/* Asset type tabs */}
          <div className="flex gap-2">
            {[
              { key: "all", label: "All", icon: Grid },
              { key: "image", label: "Images", icon: ImageIcon },
              { key: "clip", label: "Clips", icon: Video },
              { key: "meme", label: "Memes", icon: Sparkles },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setFilter(key as AssetFilter)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === key
                    ? "bg-red-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Search & View toggle */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search assets..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-red-900"
              />
            </div>
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 ${
                  viewMode === "grid"
                    ? "bg-slate-200 dark:bg-slate-700"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <Grid className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 ${
                  viewMode === "list"
                    ? "bg-slate-200 dark:bg-slate-700"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <List className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Asset grid/list */}
        <div className="flex-1 overflow-y-auto p-4">
          {!assets ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-red-500" />
            </div>
          ) : filteredAssets && filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500 dark:text-slate-400">
              <ImageIcon className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-sm">No assets found</p>
              <p className="text-xs mt-1">
                {searchQuery
                  ? "Try a different search term"
                  : "Generate some clips or memes first"}
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredAssets?.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  isSelected={selectedAsset?.sourceId === asset.id}
                  onSelect={() => handleSelectAsset(asset)}
                  formatDuration={formatDuration}
                  formatDate={formatDate}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAssets?.map((asset) => (
                <AssetListItem
                  key={asset.id}
                  asset={asset}
                  isSelected={selectedAsset?.sourceId === asset.id}
                  onSelect={() => handleSelectAsset(asset)}
                  formatDuration={formatDuration}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {selectedAsset
              ? "1 asset selected"
              : `${filteredAssets?.length || 0} assets available`}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onClose}
              disabled={!selectedAsset}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Confirm Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Grid card component
function AssetCard({
  asset,
  isSelected,
  onSelect,
  formatDuration,
  formatDate,
}: {
  asset: UnifiedAsset;
  isSelected: boolean;
  onSelect: () => void;
  formatDuration: (seconds?: number) => string;
  formatDate: (timestamp: number) => string;
}) {
  const typeIcon = {
    image: <ImageIcon className="h-3 w-3" />,
    clip: <Video className="h-3 w-3" />,
    meme: <Sparkles className="h-3 w-3" />,
  };

  const typeColor = {
    image: "bg-blue-500",
    clip: "bg-purple-500",
    meme: "bg-orange-500",
  };

  return (
    <button
      onClick={onSelect}
      className={`group relative aspect-[9/16] rounded-xl overflow-hidden border-2 transition-all ${
        isSelected
          ? "border-red-500 ring-2 ring-red-200 dark:ring-red-900"
          : "border-transparent hover:border-slate-300 dark:hover:border-slate-600"
      }`}
    >
      {/* Thumbnail */}
      {asset.thumbnailUrl ? (
        <img
          src={asset.thumbnailUrl}
          alt={asset.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
          {asset.type === "clip" ? (
            <Video className="h-8 w-8 text-slate-400" />
          ) : (
            <ImageIcon className="h-8 w-8 text-slate-400" />
          )}
        </div>
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Type badge */}
      <div
        className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs ${typeColor[asset.type]}`}
      >
        {typeIcon[asset.type]}
        <span className="capitalize">{asset.type}</span>
      </div>

      {/* Duration badge for clips */}
      {asset.type === "clip" && asset.duration && (
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs">
          <Play className="h-3 w-3" />
          {formatDuration(asset.duration)}
        </div>
      )}

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
          <Check className="h-4 w-4 text-white" />
        </div>
      )}

      {/* Title on hover */}
      <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-xs text-white font-medium truncate">{asset.title}</p>
        <p className="text-xs text-white/60 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDate(asset.createdAt)}
        </p>
      </div>

      {/* Score badge if available */}
      {asset.score !== undefined && (
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-green-500/80 text-white text-xs font-medium">
          {asset.score}
        </div>
      )}
    </button>
  );
}

// List item component
function AssetListItem({
  asset,
  isSelected,
  onSelect,
  formatDuration,
  formatDate,
}: {
  asset: UnifiedAsset;
  isSelected: boolean;
  onSelect: () => void;
  formatDuration: (seconds?: number) => string;
  formatDate: (timestamp: number) => string;
}) {
  const typeIcon = {
    image: <ImageIcon className="h-4 w-4" />,
    clip: <Video className="h-4 w-4" />,
    meme: <Sparkles className="h-4 w-4" />,
  };

  const typeColor = {
    image: "text-blue-500",
    clip: "text-purple-500",
    meme: "text-orange-500",
  };

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-4 p-3 rounded-xl border transition-all ${
        isSelected
          ? "border-red-500 bg-red-50 dark:bg-red-900/20"
          : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
      }`}
    >
      {/* Thumbnail */}
      <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
        {asset.thumbnailUrl ? (
          <img
            src={asset.thumbnailUrl}
            alt={asset.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
            {typeIcon[asset.type]}
          </div>
        )}
        {asset.type === "clip" && asset.duration && (
          <div className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/60 text-white text-[10px]">
            {formatDuration(asset.duration)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 text-left min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
          {asset.title}
        </p>
        <div className="flex items-center gap-3 mt-1">
          <span className={`flex items-center gap-1 text-xs ${typeColor[asset.type]}`}>
            {typeIcon[asset.type]}
            <span className="capitalize">{asset.type}</span>
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatDate(asset.createdAt)}
          </span>
          {asset.score !== undefined && (
            <span className="text-xs text-green-600 dark:text-green-400">
              Score: {asset.score}
            </span>
          )}
        </div>
      </div>

      {/* Selection indicator */}
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          isSelected
            ? "border-red-500 bg-red-500"
            : "border-slate-300 dark:border-slate-600"
        }`}
      >
        {isSelected && <Check className="h-3 w-3 text-white" />}
      </div>
    </button>
  );
}
