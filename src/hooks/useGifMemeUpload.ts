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
 * Job type for the upload
 */
export type JobType = "gif" | "meme";

/**
 * Options for the GIF/Meme upload hook
 */
export interface UseGifMemeUploadOptions {
  jobType: JobType;
  onJobCreated?: (jobId: string) => void;
  onUploadComplete?: (jobId: string) => void;
  onProcessingComplete?: (jobId: string) => void;
  onError?: (error: string, stage: string) => void;
}

/**
 * Return type for the hook
 */
export interface UseGifMemeUploadReturn {
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
  jobId: Id<"gif_generation_jobs"> | Id<"meme_generation_jobs"> | null;
  sessionId: Id<"gif_upload_sessions"> | Id<"meme_upload_sessions"> | null;

  // Processing status (after upload)
  processingState: string | null;
  processingProgress: number;
  processingStep: string | null;

  // Actions
  startUpload: (file: File, options: GifMemeUploadJobOptions) => Promise<void>;
  pauseUpload: () => void;
  resumeUpload: () => Promise<void>;
  cancelUpload: () => Promise<void>;
  reset: () => void;
}

/**
 * Options for creating a GIF/Meme job
 */
export interface GifMemeUploadJobOptions {
  slug: string;
  // GIF-specific options
  gifCount?: number;
  maxDurationSeconds?: number;
  targetWidth?: number;
  frameRate?: number;
  overlayStyle?: string;
  // Meme-specific options
  memeCount?: number;
  targetTemplates?: string[];
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
 * Hook for uploading videos for GIF or Meme generation via R2
 */
export function useGifMemeUpload(
  options: UseGifMemeUploadOptions
): UseGifMemeUploadReturn {
  const { jobType, onJobCreated, onUploadComplete, onProcessingComplete, onError } = options;

  // State
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [currentPart, setCurrentPart] = useState(0);
  const [totalParts, setTotalParts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorStage, setErrorStage] = useState<string | null>(null);

  // Job info - using any to handle both job types
  const [jobId, setJobId] = useState<Id<"gif_generation_jobs"> | Id<"meme_generation_jobs"> | null>(null);
  const [sessionId, setSessionId] = useState<Id<"gif_upload_sessions"> | Id<"meme_upload_sessions"> | null>(null);

  // Internal refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileRef = useRef<File | null>(null);
  const partUrlsRef = useRef<Array<{ partNumber: number; url: string }>>([]);
  const uploadedPartsRef = useRef<Set<number>>(new Set());
  const isPausedRef = useRef(false);
  const r2KeyRef = useRef<string | null>(null);
  const uploadIdRef = useRef<string | null>(null);
  const slugRef = useRef<string | null>(null);
  const jobOptionsRef = useRef<GifMemeUploadJobOptions | null>(null);

  // Convex hooks - R2 actions (shared infrastructure)
  const r2CreateMultipart = useAction(api.r2.r2CreateMultipart);
  const r2SignParts = useAction(api.r2.r2SignParts);
  const r2CompleteMultipart = useAction(api.r2.r2CompleteMultipart);
  const r2AbortMultipart = useAction(api.r2.r2AbortMultipart);

  // GIF-specific hooks
  const createGifUploadJob = useAction(api.gifGenerator.createGifUploadJob);
  const saveGifUploadSession = useMutation(api.gifGenerator.saveGifUploadSession);
  const reportGifUploadedPart = useMutation(api.gifGenerator.reportGifUploadedPart);
  const markGifUploadComplete = useMutation(api.gifGenerator.markGifUploadComplete);
  const abortGifUploadSession = useMutation(api.gifGenerator.abortGifUploadSession);

  // Meme-specific hooks
  const createMemeUploadJob = useAction(api.memeGenerator.createMemeUploadJob);
  const saveMemeUploadSession = useMutation(api.memeGenerator.saveMemeUploadSession);
  const reportMemeUploadedPart = useMutation(api.memeGenerator.reportMemeUploadedPart);
  const markMemeUploadComplete = useMutation(api.memeGenerator.markMemeUploadComplete);
  const abortMemeUploadSession = useMutation(api.memeGenerator.abortMemeUploadSession);

  // Real-time subscription to GIF job status
  const gifJob = useQuery(
    api.gifGenerator.getGifJob,
    jobType === "gif" && jobId ? { jobId: jobId as Id<"gif_generation_jobs"> } : "skip"
  );

  // Real-time subscription to Meme job status
  const memeJob = useQuery(
    api.memeGenerator.getMemeJob,
    jobType === "meme" && jobId ? { jobId: jobId as Id<"meme_generation_jobs"> } : "skip"
  );

  // Get the active job based on type
  const activeJob = jobType === "gif" ? gifJob : memeJob;

  // Update processing state from job subscription
  const processingState = activeJob?.status ?? null;
  const processingProgress = activeJob?.progress ?? 0;
  const processingStep = activeJob?.currentStep ?? null;

  // Handle job status changes
  useEffect(() => {
    if (!activeJob) return;

    if (activeJob.status === "completed") {
      if (jobId) {
        onProcessingComplete?.(jobId as string);
      }
    } else if (activeJob.status === "failed" && state !== "failed") {
      setError(activeJob.errorMessage || "Processing failed");
      setErrorStage(activeJob.errorStage || "processing");
      onError?.(activeJob.errorMessage || "Processing failed", activeJob.errorStage || "processing");
    }
  }, [activeJob?.status, jobId, state, onProcessingComplete, onError]);

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
            return await uploadPartViaProxy(url, partNumber, chunk, signal);
          }

          const response = await fetch(url, {
            method: "PUT",
            body: chunk,
            signal,
          });

          if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
          }

          // Get ETag from response headers
          const etag = response.headers.get("ETag") || `"part-${partNumber}"`;
          return etag;
        } catch (err) {
          if (signal.aborted) throw err;
          lastError = err as Error;

          // Check if this is a CORS error - switch to proxy
          const isCorsOrNetworkError =
            err instanceof TypeError ||
            (err instanceof Error && err.message.includes("Failed to fetch"));

          if (isCorsOrNetworkError && UPLOAD_PROXY_URL && !useProxy) {
            console.warn(
              `Direct R2 upload failed (likely CORS), switching to proxy for part ${partNumber}`
            );
            useProxy = true;
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
      currentSessionId: string,
      partUrls: Array<{ partNumber: number; url: string }>,
      signal: AbortSignal
    ) => {
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

            // Report success to Convex based on job type
            if (jobType === "gif") {
              await reportGifUploadedPart({
                sessionId: currentSessionId as Id<"gif_upload_sessions">,
                partNumber,
                etag,
                partBytes: chunkSize,
              });
            } else {
              await reportMemeUploadedPart({
                sessionId: currentSessionId as Id<"meme_upload_sessions">,
                partNumber,
                etag,
                partBytes: chunkSize,
              });
            }

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
    [jobType, uploadPart, reportGifUploadedPart, reportMemeUploadedPart]
  );

  /**
   * Start a new upload
   */
  const startUpload = useCallback(
    async (file: File, uploadOptions: GifMemeUploadJobOptions) => {
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
        slugRef.current = uploadOptions.slug;
        jobOptionsRef.current = uploadOptions;

        // Create abort controller
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        // Step 1: Create job
        setState("creating_job");
        let newJobId: string;

        if (jobType === "gif") {
          const result = await createGifUploadJob({
            slug: uploadOptions.slug,
            title: file.name,
            gifCount: uploadOptions.gifCount || 5,
            maxDurationSeconds: uploadOptions.maxDurationSeconds,
            targetWidth: uploadOptions.targetWidth,
            frameRate: uploadOptions.frameRate,
          });
          newJobId = result.jobId;
          setJobId(newJobId as Id<"gif_generation_jobs">);
        } else {
          const result = await createMemeUploadJob({
            slug: uploadOptions.slug,
            title: file.name,
            memeCount: uploadOptions.memeCount || 5,
            targetTemplates: uploadOptions.targetTemplates,
          });
          newJobId = result.jobId;
          setJobId(newJobId as Id<"meme_generation_jobs">);
        }

        onJobCreated?.(newJobId);

        if (signal.aborted) return;

        // Step 2: Create multipart upload in R2
        setState("starting_upload");

        // Create multipart upload in R2 using the GIF/Meme job ID
        // The r2CreateMultipart action accepts processing_jobs, gif_generation_jobs, and meme_generation_jobs IDs
        const multipartResult = await r2CreateMultipart({
          jobId: newJobId as Id<"gif_generation_jobs"> | Id<"meme_generation_jobs">,
          filename: file.name,
          totalBytes: file.size,
          mimeType: file.type || "video/mp4",
        });

        r2KeyRef.current = multipartResult.r2Key;
        uploadIdRef.current = multipartResult.uploadId;
        partUrlsRef.current = multipartResult.partUrls;
        setTotalParts(multipartResult.totalParts);

        if (signal.aborted) return;

        // Step 3: Save upload session
        let newSessionId: string;
        if (jobType === "gif") {
          newSessionId = await saveGifUploadSession({
            jobId: newJobId as Id<"gif_generation_jobs">,
            r2Key: multipartResult.r2Key,
            uploadId: multipartResult.uploadId,
            partSize: multipartResult.partSize,
            totalParts: multipartResult.totalParts,
            totalBytes: file.size,
          });
          setSessionId(newSessionId as Id<"gif_upload_sessions">);
        } else {
          newSessionId = await saveMemeUploadSession({
            jobId: newJobId as Id<"meme_generation_jobs">,
            r2Key: multipartResult.r2Key,
            uploadId: multipartResult.uploadId,
            partSize: multipartResult.partSize,
            totalParts: multipartResult.totalParts,
            totalBytes: file.size,
          });
          setSessionId(newSessionId as Id<"meme_upload_sessions">);
        }

        if (signal.aborted) return;

        // Step 4: Upload parts
        setState("uploading");

        // Get more part URLs if needed
        if (multipartResult.totalParts > multipartResult.partUrls.length) {
          // We need to get additional signed URLs - use the session ID
          // For now, sign parts using the generic r2SignParts with a workaround
          // The session ID is stored, we can use it to get more URLs
          const additionalUrls = await r2SignParts({
            sessionId: newSessionId as unknown as Id<"upload_sessions">,
            startPart: multipartResult.partUrls.length + 1,
            endPart: multipartResult.totalParts,
          });
          partUrlsRef.current = [...partUrlsRef.current, ...additionalUrls];
        }

        await uploadRemainingParts(file, newSessionId, partUrlsRef.current, signal);

        if (signal.aborted || isPausedRef.current) return;

        // Step 5: Complete multipart upload
        setState("completing");
        await r2CompleteMultipart({ sessionId: newSessionId as unknown as Id<"upload_sessions"> });

        // Step 6: Mark upload complete (triggers Modal processing)
        if (jobType === "gif") {
          await markGifUploadComplete({
            sessionId: newSessionId as Id<"gif_upload_sessions">,
            r2Key: multipartResult.r2Key,
          });
        } else {
          await markMemeUploadComplete({
            sessionId: newSessionId as Id<"meme_upload_sessions">,
            r2Key: multipartResult.r2Key,
          });
        }

        setState("completed");
        setProgress(100);
        onUploadComplete?.(newJobId);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Upload failed";
        setError(errorMsg);
        setErrorStage("upload");
        setState("failed");
        onError?.(errorMsg, "upload");
      }
    },
    [
      jobType,
      createGifUploadJob,
      createMemeUploadJob,
      r2CreateMultipart,
      saveGifUploadSession,
      saveMemeUploadSession,
      r2SignParts,
      uploadRemainingParts,
      r2CompleteMultipart,
      markGifUploadComplete,
      markMemeUploadComplete,
      onJobCreated,
      onUploadComplete,
      onError,
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
          sessionId: sessionId as unknown as Id<"upload_sessions">,
          startPart: remainingPartNumbers[0],
          endPart: remainingPartNumbers[remainingPartNumbers.length - 1],
        });
        partUrlsRef.current = freshUrls;
      }

      await uploadRemainingParts(
        fileRef.current,
        sessionId as string,
        partUrlsRef.current,
        signal
      );

      if (signal.aborted || isPausedRef.current) return;

      // Complete the upload
      setState("completing");
      await r2CompleteMultipart({ sessionId: sessionId as unknown as Id<"upload_sessions"> });

      if (jobType === "gif") {
        await markGifUploadComplete({
          sessionId: sessionId as Id<"gif_upload_sessions">,
          r2Key: r2KeyRef.current!,
        });
      } else {
        await markMemeUploadComplete({
          sessionId: sessionId as Id<"meme_upload_sessions">,
          r2Key: r2KeyRef.current!,
        });
      }

      setState("completed");
      setProgress(100);
      if (jobId) {
        onUploadComplete?.(jobId as string);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Resume failed";
      setError(errorMsg);
      setErrorStage("upload");
      setState("failed");
      onError?.(errorMsg, "upload");
    }
  }, [
    sessionId,
    totalParts,
    jobType,
    jobId,
    r2SignParts,
    uploadRemainingParts,
    r2CompleteMultipart,
    markGifUploadComplete,
    markMemeUploadComplete,
    onUploadComplete,
    onError,
  ]);

  /**
   * Cancel and abort the upload
   */
  const cancelUpload = useCallback(async () => {
    abortControllerRef.current?.abort();
    isPausedRef.current = false;

    if (sessionId) {
      try {
        await r2AbortMultipart({ sessionId: sessionId as unknown as Id<"upload_sessions"> });

        if (jobType === "gif") {
          await abortGifUploadSession({
            sessionId: sessionId as Id<"gif_upload_sessions">,
            error: "Cancelled by user",
          });
        } else {
          await abortMemeUploadSession({
            sessionId: sessionId as Id<"meme_upload_sessions">,
            error: "Cancelled by user",
          });
        }
      } catch (err) {
        console.error("Error aborting upload:", err);
      }
    }

    setState("idle");
    setProgress(0);
    setUploadedBytes(0);
    setError(null);
    setErrorStage(null);
  }, [sessionId, jobType, r2AbortMultipart, abortGifUploadSession, abortMemeUploadSession]);

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
    uploadIdRef.current = null;
    slugRef.current = null;
    jobOptionsRef.current = null;

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

export default useGifMemeUpload;
