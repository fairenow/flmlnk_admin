"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Clock, Video, Image, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";

type JobSummary = {
  _id: Id<"clip_generation_jobs"> | Id<"meme_generation_jobs">;
  videoTitle: string;
  sourceVideoUrl: string;
  status: string;
  clipCount?: number;
  memeCount?: number;
  createdAt: number;
  completedAt?: number;
};

type JobHistoryDropdownProps = {
  jobs: Array<{
    job: JobSummary;
    clipCount?: number;
    memeCount?: number;
  }>;
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
  type: "clips" | "memes";
  isLoading?: boolean;
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
      return <CheckCircle2 className="w-3 h-3 text-green-500" />;
    case "failed":
      return <XCircle className="w-3 h-3 text-red-500" />;
    case "processing":
    case "submitted":
      return <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />;
    default:
      return <Clock className="w-3 h-3 text-slate-400" />;
  }
}

function truncateTitle(title: string, maxLength: number = 40): string {
  if (title.length <= maxLength) return title;
  return title.substring(0, maxLength - 3) + "...";
}

export function JobHistoryDropdown({
  jobs,
  selectedJobId,
  onSelectJob,
  type,
  isLoading,
}: JobHistoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedJob = selectedJobId
    ? jobs.find((j) => j.job._id === selectedJobId)
    : null;

  const totalItems = jobs.reduce(
    (sum, j) => sum + (type === "clips" ? (j.clipCount ?? 0) : (j.memeCount ?? 0)),
    0
  );

  const Icon = type === "clips" ? Video : Image;
  const itemLabel = type === "clips" ? "clips" : "memes";

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-black/20">
        <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
        <span className="text-sm text-slate-500 dark:text-white/50">Loading history...</span>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-black/20">
        <Icon className="w-4 h-4 text-slate-400 dark:text-white/40" />
        <span className="text-sm text-slate-500 dark:text-white/50">No {itemLabel} generated yet</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors dark:border-white/10 dark:bg-black/20 dark:hover:border-white/20"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-slate-500 dark:text-white/50 flex-shrink-0" />
          <span className="text-sm text-slate-700 dark:text-white/80 truncate">
            {selectedJob
              ? truncateTitle(selectedJob.job.videoTitle)
              : `All Jobs (${totalItems} ${itemLabel})`}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {selectedJob && (
            <span className="text-xs text-slate-400 dark:text-white/40">
              {type === "clips" ? selectedJob.clipCount : selectedJob.memeCount} {itemLabel}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden dark:border-white/10 dark:bg-slate-900">
          <div className="max-h-80 overflow-y-auto">
            {/* All Jobs Option */}
            <button
              type="button"
              onClick={() => {
                onSelectJob(null);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors dark:hover:bg-white/5 ${
                !selectedJobId ? "bg-red-50 dark:bg-red-500/10" : ""
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-slate-500 dark:text-white/50" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-white">
                  All Jobs
                </p>
                <p className="text-xs text-slate-500 dark:text-white/50">
                  {totalItems} {itemLabel} from {jobs.length} jobs
                </p>
              </div>
              {!selectedJobId && (
                <CheckCircle2 className="w-4 h-4 text-red-500 flex-shrink-0" />
              )}
            </button>

            <div className="border-t border-slate-100 dark:border-white/5" />

            {/* Individual Jobs - Sorted by createdAt descending (newest first) */}
            {jobs.map((jobData, index) => {
              const itemCount = type === "clips" ? jobData.clipCount : jobData.memeCount;
              const isSelected = selectedJobId === jobData.job._id;

              return (
                <button
                  key={jobData.job._id}
                  type="button"
                  onClick={() => {
                    onSelectJob(jobData.job._id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors dark:hover:bg-white/5 ${
                    isSelected ? "bg-red-50 dark:bg-red-500/10" : ""
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-slate-500 dark:text-white/50">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {getStatusIcon(jobData.job.status)}
                      <p className="text-sm font-medium text-slate-700 dark:text-white truncate">
                        {truncateTitle(jobData.job.videoTitle, 35)}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-white/50">
                      {itemCount} {itemLabel} • {formatDate(jobData.job.createdAt)}
                    </p>
                  </div>
                  {isSelected && (
                    <CheckCircle2 className="w-4 h-4 text-red-500 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default JobHistoryDropdown;
