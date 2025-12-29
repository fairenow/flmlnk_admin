/**
 * Client-Side YouTube Download via Cobalt.tools
 *
 * Downloads YouTube videos directly in the browser using Cobalt's API.
 * This bypasses server-side bot detection by using the user's browser.
 *
 * Flow:
 * 1. Call Cobalt API to get direct download URL
 * 2. Fetch video as blob in browser
 * 3. Return as File object for upload to R2
 */

export interface CobaltResponse {
  status: "stream" | "redirect" | "picker" | "error";
  url?: string;
  urls?: Array<{ url: string; quality: string }>;
  error?: string;
  filename?: string;
}

export interface DownloadProgress {
  phase: "resolving" | "downloading" | "complete" | "error";
  progress: number; // 0-100
  bytesDownloaded?: number;
  totalBytes?: number;
  error?: string;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

/**
 * Get download URL from Cobalt API
 */
async function getCobaltDownloadUrl(
  youtubeUrl: string,
  quality: "720" | "1080" | "480" = "720"
): Promise<{ url: string; filename: string }> {
  // Cobalt API endpoint
  const COBALT_API = "https://api.cobalt.tools/";

  const response = await fetch(COBALT_API, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: youtubeUrl,
      vQuality: quality,
      filenamePattern: "basic", // Use video title as filename
      isAudioOnly: false,
      isNoTTWatermark: true,
      isTTFullAudio: false,
      disableMetadata: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cobalt API error: ${response.status} - ${errorText}`);
  }

  const data: CobaltResponse = await response.json();

  if (data.status === "error") {
    throw new Error(data.error || "Unknown Cobalt error");
  }

  if (data.status === "stream" || data.status === "redirect") {
    if (!data.url) {
      throw new Error("No download URL in Cobalt response");
    }
    return {
      url: data.url,
      filename: data.filename || "video.mp4",
    };
  }

  if (data.status === "picker" && data.urls && data.urls.length > 0) {
    // Multiple quality options - pick the first one (usually best)
    return {
      url: data.urls[0].url,
      filename: data.filename || "video.mp4",
    };
  }

  throw new Error(`Unexpected Cobalt response status: ${data.status}`);
}

/**
 * Download video from URL as a blob with progress tracking
 */
async function downloadVideoBlob(
  url: string,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const contentLength = response.headers.get("content-length");
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

  if (!response.body) {
    throw new Error("No response body");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesDownloaded = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    chunks.push(value);
    bytesDownloaded += value.length;

    if (onProgress) {
      const progress = totalBytes > 0 ? (bytesDownloaded / totalBytes) * 100 : 0;
      onProgress({
        phase: "downloading",
        progress: Math.round(progress),
        bytesDownloaded,
        totalBytes: totalBytes || undefined,
      });
    }
  }

  return new Blob(chunks, { type: "video/mp4" });
}

/**
 * Download YouTube video client-side and return as File object
 *
 * @param youtubeUrl - YouTube URL (watch, shorts, embed formats supported)
 * @param quality - Video quality: "480", "720", or "1080"
 * @param onProgress - Optional progress callback
 * @returns File object ready for upload
 */
export async function downloadYouTubeVideo(
  youtubeUrl: string,
  quality: "720" | "1080" | "480" = "720",
  onProgress?: ProgressCallback
): Promise<File> {
  try {
    // Phase 1: Get download URL from Cobalt
    if (onProgress) {
      onProgress({ phase: "resolving", progress: 0 });
    }

    const { url, filename } = await getCobaltDownloadUrl(youtubeUrl, quality);

    // Phase 2: Download video
    if (onProgress) {
      onProgress({ phase: "downloading", progress: 0 });
    }

    const blob = await downloadVideoBlob(url, onProgress);

    // Create File object
    const file = new File([blob], filename.endsWith(".mp4") ? filename : `${filename}.mp4`, {
      type: "video/mp4",
    });

    if (onProgress) {
      onProgress({ phase: "complete", progress: 100 });
    }

    return file;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (onProgress) {
      onProgress({
        phase: "error",
        progress: 0,
        error: errorMessage,
      });
    }

    throw error;
  }
}

/**
 * Validate YouTube URL format
 */
export function isValidYouTubeUrl(url: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/v\/[\w-]+/,
  ];

  return patterns.some((pattern) => pattern.test(url));
}

/**
 * Extract video ID from YouTube URL
 */
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}
