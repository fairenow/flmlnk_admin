"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Upload state
 */
export type UploadState =
  | "idle"
  | "creating_job"
  | "starting_upload"
  | "uploading"
  | "completing"
  | "completed"
  | "failed"
  | "paused";

/**
 * Job processing state
 */
export type ProcessingState =
  | "CREATED"
  | "UPLOADING"
  | "UPLOADED"
  | "PROCESSING"
  | "READY"
  | "FAILED";

/**
 * Options for the resumable upload hook
 */
export interface UseResumableUploadOptions {
  onJobCreated?: (jobId: Id<"processing_jobs">) => void;
  onUploadComplete?: (jobId: Id<"processing_jobs">) => void;
  onProcessingComplete?: (jobId: Id<"processing_jobs">) => void;
  onError?: (error: string, stage: string) => void;
}

/**
 * Return type for the hook
 */
export interface UseResumableUploadReturn {
  // State
  state: UploadState;
  progress: number; // 0-100
  uploadedBytes: number;
  totalBytes: number;
  currentPart: number;
  totalParts: number;
  error: string | null;
  errorStage: string | null;

  // Job info
  jobId: Id<"processing_jobs"> | null;
  sessionId: Id<"upload_sessions"> | null;

  // Processing status (after upload)
  processingState: ProcessingState | null;
  processingProgress: number;
  processingStep: string | null;

  // Actions
  startUpload: (file: File, options?: UploadJobOptions) => Promise<void>;
  pauseUpload: () => void;
  resumeUpload: () => Promise<void>;
  cancelUpload: () => Promise<void>;
  reset: () => void;
}

/**
 * Options for creating a job
 */
export interface UploadJobOptions {
  title?: string;
  clipCount?: number;
  layout?: string;
  captionStyle?: {
    highlightColor?: string;
    fontFamily?: string;
    fontSize?: string;
    fontScale?: number;
    position?: string;
    style?: string;
    outline?: boolean;
    shadow?: boolean;
  };
  actorProfileId?: Id<"actor_profiles">;
  // Advanced options
  minClipDuration?: number;
  maxClipDuration?: number;
  aspectRatio?: string;
  clipTone?: string;
  // Full video mode - skip clipping, just add captions/format
  fullVideoMode?: boolean;
}

// Constants
const PART_SIZE = 10 * 1024 * 1024; // 10MB per part
const MAX_CONCURRENT_UPLOADS = 3;
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 1000;

// Convex HTTP endpoint for upload proxy (CORS fallback)
const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_URL?.replace(".cloud", ".site") || "";
const UPLOAD_PROXY_URL = `${CONVEX_SITE_URL}/r2/upload-part`;

/**
 * Hook for resumable multipart uploads to R2
 */
export function useResumableUpload(
  options: UseResumableUploadOptions = {}
): UseResumableUploadReturn {
  // State
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [currentPart, setCurrentPart] = useState(0);
  const [totalParts, setTotalParts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorStage, setErrorStage] = useState<string | null>(null);

  // Job info
  const [jobId, setJobId] = useState<Id<"processing_jobs"> | null>(null);
  const [sessionId, setSessionId] = useState<Id<"upload_sessions"> | null>(null);

  // Internal refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileRef = useRef<File | null>(null);
  const partUrlsRef = useRef<Array<{ partNumber: number; url: string }>>([]);
  const uploadedPartsRef = useRef<Set<number>>(new Set());
  const isPausedRef = useRef(false);
  const r2KeyRef = useRef<string | null>(null);

  // Convex hooks
  const createJob = useMutation(api.processing.createJob);
  const r2CreateMultipart = useAction(api.r2.r2CreateMultipart);
  const r2SignParts = useAction(api.r2.r2SignParts);
  const r2CompleteMultipart = useAction(api.r2.r2CompleteMultipart);
  const r2AbortMultipart = useAction(api.r2.r2AbortMultipart);
  const saveUploadSession = useMutation(api.processing.saveUploadSession);
  const reportUploadedPart = useMutation(api.processing.reportUploadedPart);
  const markUploadComplete = useMutation(api.processing.markUploadComplete);
  const abortUploadSession = useMutation(api.processing.abortUploadSession);

  // Real-time subscription to job status
  const job = useQuery(
    api.processing.getJob,
    jobId ? { jobId } : "skip"
  );

  // Update processing state from job subscription
  const processingState = job?.status as ProcessingState | null;
  const processingProgress = job?.progress ?? 0;
  const processingStep = job?.currentStep ?? null;

  // Handle job status changes
  useEffect(() => {
    if (!job) return;

    if (job.status === "READY") {
      options.onProcessingComplete?.(job._id);
    } else if (job.status === "FAILED" && state !== "failed") {
      setError(job.error || "Processing failed");
      setErrorStage(job.errorStage || "processing");
      options.onError?.(job.error || "Processing failed", job.errorStage || "processing");
    }
  }, [job?.status, job?._id, job?.error, job?.errorStage, state, options]);

  /**
   * Upload a single part via the Convex proxy (CORS fallback)
   */
  const uploadPartViaProxy = useCallback(
    async (
      url: string,
      partNumber: number,
      chunk: Blob,
      signal: AbortSignal
    ): Promise<string> => {
      const response = await fetch(UPLOAD_PROXY_URL, {
        method: "POST",
        body: chunk,
        signal,
        headers: {
          "X-Upload-Url": url,
          "X-Part-Number": partNumber.toString(),
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Proxy upload failed: ${response.status}`);
      }

      const data = await response.json();
      return data.etag || `"part-${partNumber}"`;
    },
    []
  );

  /**
   * Upload a single part with retry logic
   * First tries direct upload to R2, falls back to proxy if CORS fails
   */
  const uploadPart = useCallback(
    async (
      url: string,
      partNumber: number,
      chunk: Blob,
      signal: AbortSignal
    ): Promise<string> => {
      let lastError: Error | null = null;
      let useProxy = false;

      for (let attempt = 0; attempt < RETRY_COUNT; attempt++) {
        try {
          if (useProxy && UPLOAD_PROXY_URL) {
            // Use proxy for this and all subsequent attempts
            return await uploadPartViaProxy(url, partNumber, chunk, signal);
          }

          // Try direct upload to R2
          const response = await fetch(url, {
            method: "PUT",
            body: chunk,
            signal,
          });

          if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
          }

          // Get ETag from response headers (store exactly as returned)
          const etag = response.headers.get("ETag") || `"part-${partNumber}"`;
          return etag;
        } catch (err) {
          if (signal.aborted) throw err;
          lastError = err as Error;

          // Check if this is a CORS error (TypeError with "Failed to fetch" message)
          // or network error - switch to proxy for all future attempts
          const isCorsOrNetworkError =
            err instanceof TypeError ||
            (err instanceof Error && err.message.includes("Failed to fetch"));

          if (isCorsOrNetworkError && UPLOAD_PROXY_URL && !useProxy) {
            console.warn(
              `Direct R2 upload failed (likely CORS), switching to proxy for part ${partNumber}`
            );
            useProxy = true;
            // Don't wait, immediately retry with proxy
            continue;
          }

          if (attempt < RETRY_COUNT - 1) {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          }
        }
      }

      throw lastError || new Error("Upload failed after retries");
    },
    [uploadPartViaProxy]
  );

  /**
   * Upload all remaining parts
   */
  const uploadRemainingParts = useCallback(
    async (
      file: File,
      sessionIdVal: Id<"upload_sessions">,
      partUrls: Array<{ partNumber: number; url: string }>,
      signal: AbortSignal
    ) => {
      const totalPartsCount = Math.ceil(file.size / PART_SIZE);
      let uploadedBytesCount = uploadedPartsRef.current.size * PART_SIZE;

      // Get parts that haven't been uploaded yet
      const remainingParts = partUrls.filter(
        (p) => !uploadedPartsRef.current.has(p.partNumber)
      );

      // Upload in batches for concurrency control
      for (let i = 0; i < remainingParts.length; i += MAX_CONCURRENT_UPLOADS) {
        if (signal.aborted || isPausedRef.current) break;

        const batch = remainingParts.slice(i, i + MAX_CONCURRENT_UPLOADS);

        await Promise.all(
          batch.map(async ({ partNumber, url }) => {
            if (signal.aborted || isPausedRef.current) return;

            // Calculate chunk boundaries
            const start = (partNumber - 1) * PART_SIZE;
            const end = Math.min(start + PART_SIZE, file.size);
            const chunk = file.slice(start, end);
            const chunkSize = end - start;

            // Upload the part
            const etag = await uploadPart(url, partNumber, chunk, signal);

            // Report success to Convex
            await reportUploadedPart({
              sessionId: sessionIdVal,
              partNumber,
              etag,
              partBytes: chunkSize,
            });

            // Update local state
            uploadedPartsRef.current.add(partNumber);
            uploadedBytesCount += chunkSize;
            setUploadedBytes(uploadedBytesCount);
            setCurrentPart(uploadedPartsRef.current.size);
            setProgress(Math.round((uploadedBytesCount / file.size) * 100));
          })
        );
      }
    },
    [uploadPart, reportUploadedPart]
  );

  /**
   * Start a new upload
   */
  const startUpload = useCallback(
    async (file: File, uploadOptions: UploadJobOptions = {}) => {
      try {
        // Reset state
        setError(null);
        setErrorStage(null);
        setProgress(0);
        setUploadedBytes(0);
        setTotalBytes(file.size);
        setCurrentPart(0);
        setTotalParts(Math.ceil(file.size / PART_SIZE));
        uploadedPartsRef.current = new Set();
        isPausedRef.current = false;
        fileRef.current = file;

        // Create abort controller
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        // Step 1: Create job
        setState("creating_job");
        const newJobId = await createJob({
          inputType: "local",
          title: uploadOptions.title || file.name,
          clipCount: uploadOptions.clipCount,
          layout: uploadOptions.layout,
          captionStyle: uploadOptions.captionStyle,
          actorProfileId: uploadOptions.actorProfileId,
          // Advanced options
          minClipDuration: uploadOptions.minClipDuration,
          maxClipDuration: uploadOptions.maxClipDuration,
          aspectRatio: uploadOptions.aspectRatio,
          clipTone: uploadOptions.clipTone,
          fullVideoMode: uploadOptions.fullVideoMode,
        });
        setJobId(newJobId);
        options.onJobCreated?.(newJobId);

        if (signal.aborted) return;

        // Step 2: Create multipart upload
        setState("starting_upload");
        const multipartResult = await r2CreateMultipart({
          jobId: newJobId,
          filename: file.name,
          totalBytes: file.size,
          mimeType: file.type || "video/mp4",
        });

        r2KeyRef.current = multipartResult.r2Key;
        partUrlsRef.current = multipartResult.partUrls;
        setTotalParts(multipartResult.totalParts);

        if (signal.aborted) return;

        // Step 3: Save upload session
        const newSessionId = await saveUploadSession({
          jobId: newJobId,
          r2Key: multipartResult.r2Key,
          uploadId: multipartResult.uploadId,
          partSize: multipartResult.partSize,
          totalParts: multipartResult.totalParts,
          totalBytes: file.size,
        });
        setSessionId(newSessionId);

        if (signal.aborted) return;

        // Step 4: Upload parts
        setState("uploading");

        // Get more part URLs if needed
        if (multipartResult.totalParts > multipartResult.partUrls.length) {
          const additionalUrls = await r2SignParts({
            sessionId: newSessionId,
            startPart: multipartResult.partUrls.length + 1,
            endPart: multipartResult.totalParts,
          });
          partUrlsRef.current = [...partUrlsRef.current, ...additionalUrls];
        }

        await uploadRemainingParts(file, newSessionId, partUrlsRef.current, signal);

        if (signal.aborted || isPausedRef.current) return;

        // Step 5: Complete multipart upload
        setState("completing");
        await r2CompleteMultipart({ sessionId: newSessionId });

        // Step 6: Mark upload complete (triggers Modal processing)
        await markUploadComplete({
          sessionId: newSessionId,
          r2Key: multipartResult.r2Key,
        });

        setState("completed");
        setProgress(100);
        options.onUploadComplete?.(newJobId);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Upload failed";
        setError(errorMsg);
        setErrorStage("upload");
        setState("failed");
        options.onError?.(errorMsg, "upload");
      }
    },
    [
      createJob,
      r2CreateMultipart,
      saveUploadSession,
      r2SignParts,
      uploadRemainingParts,
      r2CompleteMultipart,
      markUploadComplete,
      options,
    ]
  );

  /**
   * Pause the upload
   */
  const pauseUpload = useCallback(() => {
    isPausedRef.current = true;
    setState("paused");
  }, []);

  /**
   * Resume a paused upload
   */
  const resumeUpload = useCallback(async () => {
    if (!fileRef.current || !sessionId) {
      setError("No upload to resume");
      return;
    }

    try {
      isPausedRef.current = false;
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      setState("uploading");

      // Get fresh part URLs for remaining parts
      const remainingPartNumbers = [];
      for (let i = 1; i <= totalParts; i++) {
        if (!uploadedPartsRef.current.has(i)) {
          remainingPartNumbers.push(i);
        }
      }

      if (remainingPartNumbers.length > 0) {
        const freshUrls = await r2SignParts({
          sessionId,
          startPart: remainingPartNumbers[0],
          endPart: remainingPartNumbers[remainingPartNumbers.length - 1],
        });
        partUrlsRef.current = freshUrls;
      }

      await uploadRemainingParts(
        fileRef.current,
        sessionId,
        partUrlsRef.current,
        signal
      );

      if (signal.aborted || isPausedRef.current) return;

      // Complete the upload
      setState("completing");
      await r2CompleteMultipart({ sessionId });
      await markUploadComplete({
        sessionId,
        r2Key: r2KeyRef.current!,
      });

      setState("completed");
      setProgress(100);
      if (jobId) {
        options.onUploadComplete?.(jobId);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Resume failed";
      setError(errorMsg);
      setErrorStage("upload");
      setState("failed");
      options.onError?.(errorMsg, "upload");
    }
  }, [
    sessionId,
    totalParts,
    r2SignParts,
    uploadRemainingParts,
    r2CompleteMultipart,
    markUploadComplete,
    jobId,
    options,
  ]);

  /**
   * Cancel and abort the upload
   */
  const cancelUpload = useCallback(async () => {
    abortControllerRef.current?.abort();
    isPausedRef.current = false;

    if (sessionId) {
      try {
        await r2AbortMultipart({ sessionId });
        await abortUploadSession({ sessionId, error: "Cancelled by user" });
      } catch (err) {
        console.error("Error aborting upload:", err);
      }
    }

    setState("idle");
    setProgress(0);
    setUploadedBytes(0);
    setError(null);
    setErrorStage(null);
  }, [sessionId, r2AbortMultipart, abortUploadSession]);

  /**
   * Reset all state
   */
  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    isPausedRef.current = false;
    fileRef.current = null;
    partUrlsRef.current = [];
    uploadedPartsRef.current = new Set();
    r2KeyRef.current = null;

    setState("idle");
    setProgress(0);
    setUploadedBytes(0);
    setTotalBytes(0);
    setCurrentPart(0);
    setTotalParts(0);
    setError(null);
    setErrorStage(null);
    setJobId(null);
    setSessionId(null);
  }, []);

  return {
    state,
    progress,
    uploadedBytes,
    totalBytes,
    currentPart,
    totalParts,
    error,
    errorStage,
    jobId,
    sessionId,
    processingState,
    processingProgress,
    processingStep,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    reset,
  };
}

export default useResumableUpload;
