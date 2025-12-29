"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

type BadgeTone = "info" | "success" | "warning" | "danger" | "muted";

function StatusBadge({ label, tone = "info" }: { label: string; tone?: BadgeTone }) {
  const toneClasses: Record<BadgeTone, string> = {
    info: "bg-slate-100 text-slate-700",
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-rose-100 text-rose-800",
    muted: "bg-slate-50 text-slate-400",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 rounded-full bg-slate-200">
      <div
        className="h-2 rounded-full bg-red-500 transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export default function YouTubeUploadPage() {
  const createJob = useAction(api.videoJobs.createJobFromYouTubeUrl);
  const confirmRights = useAction(api.videoJobs.confirmVideoRights);
  const importVideo = useAction(api.videoJobs.importYouTubeVideo);

  const [youtubeUrl, setYouTubeUrl] = useState("");
  const [jobId, setJobId] = useState<Id<"video_jobs"> | null>(null);
  const [meta, setMeta] = useState<{ title?: string; thumbnailUrl?: string } | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const job = useQuery(api.videoJobsDb.getVideoJob, jobId ? { jobId } : "skip");

  useEffect(() => {
    if (job?.rightsConfirmedAt) {
      setRightsConfirmed(true);
    }
  }, [job?.rightsConfirmedAt]);

  const handleCreate = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setCreating(true);
      try {
        const result = await createJob({ youtubeUrl });
        setJobId(result.jobId);
        setMeta(result.meta);
        setRightsConfirmed(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create job";
        setError(message);
      } finally {
        setCreating(false);
      }
    },
    [createJob, youtubeUrl]
  );

  const handleRightsToggle = useCallback(async () => {
    if (!jobId) return;
    try {
      await confirmRights({ jobId });
      setRightsConfirmed(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to confirm rights";
      setError(message);
    }
  }, [confirmRights, jobId]);

  const nextAction = useMemo(() => {
    if (!jobId) {
      return {
        title: "Create a job",
        detail: "Paste a YouTube URL and click Create job to fetch metadata.",
        tone: "info" as const,
      };
    }

    if (!rightsConfirmed) {
      return {
        title: "Confirm rights",
        detail: "Check the rights box before pulling the YouTube bytes.",
        tone: "warning" as const,
      };
    }

    if (job?.status === "UPLOADING") {
      return {
        title: "Importing",
        detail: "Keep this tab open while we download from YouTube and push to R2.",
        tone: "info" as const,
      };
    }

    if (job?.status === "UPLOADED" || job?.status === "PROCESSING") {
      return {
        title: "Processing",
        detail: "Upload finished. The backend will process and prepare the video.",
        tone: "success" as const,
      };
    }

    if (job?.status === "FAILED") {
      return {
        title: "Import failed",
        detail: job.error || "Retry the import. If it keeps failing, check the Convex logs.",
        tone: "danger" as const,
      };
    }

    return {
      title: "Import from YouTube",
      detail: "Click Import to download the source video in your browser and upload it to R2.",
      tone: "info" as const,
    };
  }, [job?.error, job?.status, jobId, rightsConfirmed]);

  const handleImport = useCallback(async () => {
    if (!jobId || !rightsConfirmed) return;
    setError(null);
    setImporting(true);
    try {
      await importVideo({ jobId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      setError(message);
    } finally {
      setImporting(false);
    }
  }, [importVideo, jobId, rightsConfirmed]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          YouTube URL → Browser Upload → R2 → Modal
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Paste a YouTube link, confirm rights, upload the source bytes from your browser,
          and hand the job off to processing.
        </p>
      </div>

      <form onSubmit={handleCreate} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium text-slate-800">YouTube URL</label>
        <input
          value={youtubeUrl}
          onChange={(e) => setYouTubeUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="w-full rounded-md border border-slate-200 px-4 py-2 text-sm shadow-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
        />
        <button
          type="submit"
          disabled={creating || !youtubeUrl}
          className="rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {creating ? "Fetching metadata..." : "Create job"}
        </button>
      </form>

      {meta && (
        <div className="flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          {meta.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meta.thumbnailUrl} alt={meta.title || "Thumbnail"} className="h-24 w-40 rounded-md object-cover" />
          ) : null}
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">{meta.title || "YouTube video"}</p>
            {jobId ? <StatusBadge label={`Job ${jobId}`} /> : null}
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">What to do next</p>
            <p className="text-xs text-slate-600">{nextAction.detail}</p>
          </div>
          <StatusBadge label={nextAction.title} tone={nextAction.tone} />
        </div>

        <div className="flex items-center gap-3">
          <input
            id="rights"
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-red-500 focus:ring-red-400"
            disabled={!jobId || rightsConfirmed}
            checked={rightsConfirmed}
            onChange={handleRightsToggle}
          />
          <label htmlFor="rights" className="text-sm text-slate-800">
            I have the rights to upload and process this video.
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Browser import</p>
            <p className="text-xs text-slate-600">
              We will download the YouTube video in-browser and upload it directly to R2. Keep this
              tab open until the import completes.
            </p>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              disabled={!jobId || !rightsConfirmed || importing || job?.status === "UPLOADING"}
              onClick={handleImport}
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {importing || job?.status === "UPLOADING" ? "Importing from YouTube..." : "Import from YouTube"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-md bg-slate-50 p-3">
            <div className="flex items-center justify-between text-sm text-slate-800">
              <span>Import status</span>
              <StatusBadge
                label={job?.status ?? "Not started"}
                tone={
                  job?.status === "FAILED"
                    ? "danger"
                    : job?.status === "UPLOADED" || job?.status === "READY"
                      ? "success"
                      : job?.status
                        ? "info"
                        : "muted"
                }
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Downloaded & uploaded</span>
              <span>{job?.progress ? `${job.progress}%` : "0%"}</span>
            </div>
            <ProgressBar value={job?.progress ?? 0} />
            {job?.status === "FAILED" && job.error ? (
              <p className="text-xs text-rose-600">{job.error}</p>
            ) : (
              <p className="text-xs text-slate-600">We stream YouTube bytes straight to R2—no manual file picking.</p>
            )}
          </div>

          <div className="space-y-2 rounded-md bg-slate-50 p-3 text-sm text-slate-800">
            <div className="flex items-center justify-between">
              <span>Job status</span>
              <StatusBadge
                label={job?.status ?? "Not started"}
                tone={
                  job?.status === "READY"
                    ? "success"
                    : job?.status === "FAILED"
                      ? "danger"
                      : job?.status
                        ? "info"
                        : "muted"
                }
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Processing progress</span>
              <span>{job?.progress ?? 0}%</span>
            </div>
            <ProgressBar value={job?.progress ?? 0} />
            <p className="text-xs text-slate-600">
              {job?.status === "READY"
                ? "Processing finished."
                : job?.status === "FAILED"
                  ? "Processing failed. Check Convex logs for details."
                  : "Waiting for processing after import completes."}
            </p>
          </div>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}

