"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export type VideoJobStatus =
  | "CREATED"
  | "META_READY"
  | "UPLOAD_READY"
  | "UPLOADING"
  | "UPLOADED"
  | "PROCESSING"
  | "READY"
  | "FAILED";

export interface UseVideoJobUploadReturn {
  state: "idle" | "starting" | "uploading" | "completing" | "completed" | "failed";
  progress: number;
  uploadedBytes: number;
  totalBytes: number;
  error: string | null;
  sessionId: Id<"video_upload_sessions"> | null;
  jobStatus: VideoJobStatus | null;
  jobProgress: number;
  startUpload: (file: File, jobId: Id<"video_jobs">) => Promise<void>;
}

const MAX_CONCURRENT = 3;
const RETRIES = 3;

export function useVideoJobUpload(jobId: Id<"video_jobs"> | null): UseVideoJobUploadReturn {
  const [state, setState] = useState<UseVideoJobUploadReturn["state"]>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<Id<"video_upload_sessions"> | null>(null);

  const uploadedPartsRef = useRef<Set<number>>(new Set());
  const partUrlsRef = useRef<Array<{ partNumber: number; url: string }>>([]);

  const r2CreateMultipart = useAction(api.r2.r2CreateMultipart);
  const r2SignParts = useAction(api.r2.r2SignParts);
  const r2Complete = useAction(api.r2.r2CompleteMultipart);

  const saveSession = useMutation(api.videoJobsDb.saveVideoUploadSession);
  const reportPart = useMutation(api.videoJobsDb.reportVideoUploadedPart);
  const markComplete = useMutation(api.videoJobsDb.markVideoUploadComplete);

  const job = useQuery(api.videoJobsDb.getVideoJob, jobId ? { jobId } : "skip");
  const jobStatus = job?.status ?? null;
  const jobProgress = job?.progress ?? 0;

  useEffect(() => {
    if (jobStatus === "FAILED") {
      setState("failed");
      setError(job?.error || "Job failed");
    }
  }, [jobStatus, job?.error]);

  const uploadPart = useCallback(
    async (url: string, chunk: Blob, partNumber: number, signal: AbortSignal) => {
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < RETRIES; attempt++) {
        try {
          const res = await fetch(url, { method: "PUT", body: chunk, signal });
          if (!res.ok) throw new Error(`Upload failed with status ${res.status}`);
          const etag = res.headers.get("ETag") || `"part-${partNumber}"`;
          return etag;
        } catch (err) {
          if (signal.aborted) throw err;
          lastError = err as Error;
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
      throw lastError || new Error("Upload failed");
    },
    []
  );

  const ensurePartUrls = useCallback(
    async (session: Id<"video_upload_sessions">, totalParts: number) => {
      const missing: number[] = [];
      for (let i = 1; i <= totalParts; i++) {
        if (!partUrlsRef.current.find((p) => p.partNumber === i)) missing.push(i);
      }

      if (!missing.length) return;

      for (let i = 0; i < missing.length; i += 20) {
        const batch = missing.slice(i, i + 20);
        const urls = await r2SignParts({
          sessionId: session,
          startPart: batch[0],
          endPart: batch[batch.length - 1],
        });
        partUrlsRef.current.push(...urls);
      }
    },
    [r2SignParts]
  );

  const startUpload = useCallback(
    async (file: File, activeJobId: Id<"video_jobs">) => {
      setError(null);
      setState("starting");
      setTotalBytes(file.size);

      const controller = new AbortController();

      // Step 1: create multipart upload + first URLs
      const init = await r2CreateMultipart({
        jobId: activeJobId,
        filename: file.name,
        totalBytes: file.size,
        mimeType: file.type || "video/mp4",
      });

      partUrlsRef.current = init.partUrls;

      // Step 2: persist session
      const newSessionId = await saveSession({
        jobId: activeJobId,
        r2Key: init.r2Key,
        uploadId: init.uploadId,
        partSize: init.partSize,
        totalParts: init.totalParts,
        totalBytes: file.size,
      });
      setSessionId(newSessionId);

      await ensurePartUrls(newSessionId, init.totalParts);

      setState("uploading");

      const totalParts = init.totalParts;
      const partSize = init.partSize;

      const uploadQueue = Array.from({ length: totalParts }, (_, idx) => idx + 1);

      const worker = async () => {
        while (uploadQueue.length) {
          if (controller.signal.aborted) return;
          const partNumber = uploadQueue.shift();
          if (!partNumber) return;

          const start = (partNumber - 1) * partSize;
          const end = Math.min(start + partSize, file.size);
          const chunk = file.slice(start, end);
          const url = partUrlsRef.current.find((p) => p.partNumber === partNumber)?.url;
          if (!url) {
            throw new Error(`Missing presigned URL for part ${partNumber}`);
          }

          const etag = await uploadPart(url, chunk, partNumber, controller.signal);

          await reportPart({
            sessionId: newSessionId,
            partNumber,
            etag,
            partBytes: chunk.size,
          });

          uploadedPartsRef.current.add(partNumber);
          const uploaded = Array.from(uploadedPartsRef.current).reduce((acc, part) => {
            if (part === totalParts) {
              const lastSize = file.size - (totalParts - 1) * partSize;
              return acc + lastSize;
            }
            return acc + partSize;
          }, 0);
          setUploadedBytes(uploaded);
          setProgress(Math.round((uploaded / file.size) * 100));
        }
      };

      const workers = Array.from({ length: Math.min(MAX_CONCURRENT, totalParts) }, () =>
        worker()
      );
      await Promise.all(workers);

      if (controller.signal.aborted) return;

      setState("completing");

      const result = await r2Complete({ sessionId: newSessionId });
      await markComplete({ sessionId: newSessionId, r2Key: result.r2Key });

      setState("completed");
    },
    [ensurePartUrls, markComplete, r2Complete, r2CreateMultipart, reportPart, saveSession, uploadPart]
  );

  return {
    state,
    progress,
    uploadedBytes,
    totalBytes,
    error,
    sessionId,
    jobStatus,
    jobProgress,
    startUpload,
  };
}

