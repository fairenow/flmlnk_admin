"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import type { BackgroundJob } from "../../convex/backgroundJobs";

interface JobNotificationContextType {
  activeJobs: BackgroundJob[];
  recentJobs: BackgroundJob[];
}

const JobNotificationContext = createContext<
  JobNotificationContextType | undefined
>(undefined);

// Job type labels for notifications
const JOB_TYPE_LABELS: Record<string, string> = {
  clip: "Clip",
  gif: "GIF",
  meme: "Meme",
};

// Terminal statuses that trigger notifications
const COMPLETED_STATUSES = ["READY", "completed"];
const FAILED_STATUSES = ["FAILED", "failed"];

export function JobNotificationProvider({ children }: { children: ReactNode }) {
  // Track which jobs we've already notified about
  const notifiedJobsRef = useRef<Set<string>>(new Set());

  // Subscribe to all jobs from the last 24 hours
  const allJobs = useQuery(api.backgroundJobs.getAllJobs, {
    maxAgeHours: 24,
  });

  // Get active jobs for context consumers
  const activeJobs =
    allJobs?.filter(
      (job) =>
        !COMPLETED_STATUSES.includes(job.status) &&
        !FAILED_STATUSES.includes(job.status)
    ) ?? [];

  // Get recent completed/failed jobs
  const recentJobs = allJobs?.slice(0, 10) ?? [];

  // Effect to show toast notifications when jobs complete
  useEffect(() => {
    if (!allJobs) return;

    for (const job of allJobs) {
      // Skip if already notified
      if (notifiedJobsRef.current.has(job._id)) continue;

      const typeLabel = JOB_TYPE_LABELS[job.type] || job.type;
      const count =
        job.type === "clip"
          ? job.clipCount
          : job.type === "gif"
            ? job.gifCount
            : job.memeCount;
      const countText = count ? ` (${count})` : "";

      // Check for completion
      if (COMPLETED_STATUSES.includes(job.status)) {
        notifiedJobsRef.current.add(job._id);
        toast.success(`${typeLabel} generation complete${countText}`, {
          description: job.title
            ? `"${job.title}" is ready`
            : `Your ${typeLabel.toLowerCase()}s are ready to view`,
          duration: 5000,
        });
      }

      // Check for failure
      if (FAILED_STATUSES.includes(job.status)) {
        notifiedJobsRef.current.add(job._id);
        toast.error(`${typeLabel} generation failed`, {
          description: job.error || "An unexpected error occurred",
          duration: 8000,
        });
      }
    }
  }, [allJobs]);

  // Initialize notified jobs with already-completed jobs on first load
  useEffect(() => {
    if (!allJobs) return;

    // On first render, mark all already-completed jobs as notified
    // so we don't show stale notifications
    const initialNotified = new Set<string>();
    for (const job of allJobs) {
      if (
        COMPLETED_STATUSES.includes(job.status) ||
        FAILED_STATUSES.includes(job.status)
      ) {
        initialNotified.add(job._id);
      }
    }

    // Only set once on mount
    if (notifiedJobsRef.current.size === 0 && initialNotified.size > 0) {
      notifiedJobsRef.current = initialNotified;
    }
  }, [allJobs]);

  return (
    <JobNotificationContext.Provider value={{ activeJobs, recentJobs }}>
      {children}
    </JobNotificationContext.Provider>
  );
}

export function useJobNotifications() {
  const context = useContext(JobNotificationContext);
  if (context === undefined) {
    throw new Error(
      "useJobNotifications must be used within a JobNotificationProvider"
    );
  }
  return context;
}
