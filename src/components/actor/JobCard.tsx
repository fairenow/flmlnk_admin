"use client";

import React from "react";
import {
  Video,
  Image as ImageIcon,
  Film,
  Clock,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";

// Asset type definition
export type AssetType = "clips" | "memes" | "gifs";

// Job card data structure
export type JobCardData = {
  id: string;
  title: string;
  sourceUrl?: string;
  status: string;
  assetCount: number;
  publicCount: number;
  createdAt: number;
  completedAt?: number;
  thumbnailUrl?: string;
  // Preview thumbnails for the job (up to 4)
  previewThumbnails?: string[];
  // Average score across all assets
  averageScore?: number;
};

type JobCardProps = {
  job: JobCardData;
  assetType: AssetType;
  isSelected?: boolean;
  onClick: () => void;
  onMenuClick?: (e: React.MouseEvent) => void;
  showMenu?: boolean;
};

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    case "failed":
      return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    case "processing":
    case "submitted":
    case "pending":
    case "downloading":
    case "analyzing":
    case "generating":
    case "extracting_frames":
    case "generating_captions":
      return <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-slate-400" />;
  }
}

function getAssetIcon(type: AssetType) {
  switch (type) {
    case "clips":
      return Video;
    case "memes":
      return ImageIcon;
    case "gifs":
      return Film;
  }
}

function getAssetLabel(type: AssetType, count: number): string {
  if (type === "clips") return count === 1 ? "clip" : "clips";
  if (type === "memes") return count === 1 ? "meme" : "memes";
  return count === 1 ? "GIF" : "GIFs";
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

export function JobCard({
  job,
  assetType,
  isSelected = false,
  onClick,
  onMenuClick,
  showMenu = false,
}: JobCardProps) {
  const AssetIcon = getAssetIcon(assetType);
  const assetLabel = getAssetLabel(assetType, job.assetCount);

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border bg-white transition-all duration-200 cursor-pointer hover:shadow-lg dark:bg-black/20 ${
        isSelected
          ? "border-red-500 ring-2 ring-red-500/20 dark:border-red-500 dark:ring-red-500/20"
          : "border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20"
      }`}
      onClick={onClick}
    >
      {/* Thumbnail Preview Area */}
      <div className="relative aspect-video bg-slate-100 dark:bg-slate-800 overflow-hidden">
        {job.previewThumbnails && job.previewThumbnails.length > 0 ? (
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5">
            {job.previewThumbnails.slice(0, 4).map((thumb, idx) => (
              <div
                key={idx}
                className="relative overflow-hidden bg-slate-200 dark:bg-slate-700"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumb}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
            {/* Fill empty slots if less than 4 */}
            {Array.from({ length: Math.max(0, 4 - (job.previewThumbnails?.length || 0)) }).map(
              (_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="relative overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center"
                >
                  <AssetIcon className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                </div>
              )
            )}
          </div>
        ) : job.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.thumbnailUrl}
            alt={job.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <AssetIcon className="w-12 h-12 text-slate-300 dark:text-slate-600" />
          </div>
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5 text-white text-sm font-medium">
            View {job.assetCount} {assetLabel}
            <ChevronRight className="w-4 h-4" />
          </span>
        </div>

        {/* Status Badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm">
          {getStatusIcon(job.status)}
          <span className="text-[10px] font-medium text-white capitalize">
            {job.status}
          </span>
        </div>

        {/* Asset Count Badge */}
        <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm">
          <span className="text-[10px] font-medium text-white">
            {job.assetCount} {assetLabel}
          </span>
        </div>

        {/* Menu Button (optional) */}
        {showMenu && onMenuClick && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMenuClick(e);
            }}
            className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/60 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/80 transition-colors opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Job Info */}
      <div className="p-3">
        <h3 className="text-sm font-medium text-slate-900 dark:text-white line-clamp-1 mb-1">
          {job.title}
        </h3>

        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2 text-slate-500 dark:text-white/50">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(job.createdAt)}
            </span>
            {job.averageScore !== undefined && job.averageScore > 0 && (
              <span className={`font-medium ${getScoreColor(job.averageScore)}`}>
                {Math.round(job.averageScore)}% avg
              </span>
            )}
          </div>

          {/* Visibility Status */}
          <div className="flex items-center gap-1">
            {job.publicCount > 0 ? (
              <span className="inline-flex items-center gap-0.5 text-green-500">
                <Eye className="w-3 h-3" />
                {job.publicCount}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-slate-400 dark:text-white/40">
                <EyeOff className="w-3 h-3" />
                Hidden
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default JobCard;
