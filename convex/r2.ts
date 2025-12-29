/**
 * R2 Storage Actions
 *
 * Handles multipart uploads to Cloudflare R2 for browser-first video ingestion.
 * Uses AWS SDK (S3-compatible) for R2 operations.
 *
 * Architecture:
 * - Actions handle R2 network I/O (create multipart, sign URLs, complete)
 * - Mutations handle DB state (see processing.ts)
 * - UI uploads parts directly to R2 using presigned URLs
 */

// IMPORTANT: Import polyfill BEFORE AWS SDK to ensure DOMParser is available
// This is required because Convex runtime doesn't have DOMParser
import "./domParserPolyfill";

import { v } from "convex/values";
import { action, internalQuery, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  ListPartsCommand,
  type ListPartsCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// =============================================================================
// R2 CLIENT INITIALIZATION
// =============================================================================

/**
 * Create an S3 client configured for Cloudflare R2.
 * Uses environment variables for credentials.
 * Configured for Convex runtime (no DOMParser).
 */
function getR2Client(): S3Client {
  const endpoint = process.env.R2_ENDPOINT_URL;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials not configured. Set R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
    );
  }

  const client = new S3Client({
    region: "auto", // R2 uses 'auto' region
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true, // Required for R2 compatibility
    // Disable automatic checksums for R2 CORS compatibility
    // AWS SDK v3.400+ enables checksums by default which causes CORS issues
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return client;
}

function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error("R2_BUCKET_NAME not configured");
  }
  return bucket;
}

// =============================================================================
// INTERNAL QUERIES (for actions to read DB)
// =============================================================================

/**
 * Get a processing job by ID.
 */
export const getProcessingJob = internalQuery({
  args: { jobId: v.id("processing_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

/**
 * Get a GIF generation job by ID.
 */
export const getGifGenerationJob = internalQuery({
  args: { jobId: v.id("gif_generation_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

/**
 * Get a meme generation job by ID.
 */
export const getMemeGenerationJob = internalQuery({
  args: { jobId: v.id("meme_generation_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

/**
 * Get an upload session by ID.
 */
export const getUploadSession = internalQuery({
  args: { sessionId: v.id("upload_sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

/**
 * Get a video upload session by ID.
 */
export const getVideoUploadSession = internalQuery({
  args: { sessionId: v.id("video_upload_sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

/**
 * Get a video job by ID.
 */
export const getVideoJob = internalQuery({
  args: { jobId: v.id("video_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

/**
 * Get any job by ID (supports all job types).
 * Used by r2CreateMultipart to look up jobs without knowing the table type.
 */
export const getAnyJobById = internalQuery({
  args: {
    jobId: v.union(
      v.id("processing_jobs"),
      v.id("gif_generation_jobs"),
      v.id("meme_generation_jobs"),
      v.id("video_jobs")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

/**
 * Get any upload session by ID (supports all upload session types).
 * Used by r2SignParts, r2CompleteMultipart, r2AbortMultipart.
 */
export const getAnyUploadSession = internalQuery({
  args: {
    sessionId: v.union(
      v.id("upload_sessions"),
      v.id("video_upload_sessions"),
      v.id("gif_upload_sessions"),
      v.id("meme_upload_sessions")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

// =============================================================================
// R2 ACTIONS
// =============================================================================

/**
 * Create a multipart upload session in R2.
 * Returns uploadId and first batch of presigned part URLs.
 *
 * Flow:
 * 1. UI calls this action with job info
 * 2. Action creates multipart upload in R2
 * 3. Action generates presigned URLs for first batch of parts
 * 4. UI then calls saveUploadSession mutation to persist state
 */
export const r2CreateMultipart = action({
  args: {
    // Accept processing_jobs, gif_generation_jobs, or meme_generation_jobs IDs
    jobId: v.union(
      v.id("processing_jobs"),
      v.id("gif_generation_jobs"),
      v.id("meme_generation_jobs"),
      v.id("video_jobs")
    ),
    filename: v.string(),
    totalBytes: v.number(),
    mimeType: v.string(),
  },
  handler: async (ctx, args): Promise<{
    uploadId: string;
    r2Key: string;
    partSize: number;
    totalParts: number;
    partUrls: Array<{ partNumber: number; url: string }>;
  }> => {
    // Verify job exists and get user info based on job type
    // Use the unified query that accepts all job ID types
    const job = await ctx.runQuery(internal.r2.getAnyJobById, {
      jobId: args.jobId,
    });

    if (!job) {
      throw new Error(`Job not found: ${args.jobId}`);
    }

    // Determine user namespace based on job type
    // processing_jobs and video_jobs have userId, gif/meme jobs have actorProfileId
    let userNamespace: string | null = null;
    if ("userId" in job && job.userId) {
      userNamespace = job.userId as string;
    } else if ("actorProfileId" in job && job.actorProfileId) {
      userNamespace = job.actorProfileId as string;
    }

    if (!userNamespace) {
      throw new Error(`Job has no user namespace: ${args.jobId}`);
    }

    // Verify caller is job owner (auth check)
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const client = getR2Client();
    const bucket = getR2Bucket();

    // Generate R2 key with user namespace (userId for processing_jobs, actorProfileId for gif/meme jobs)
    const r2Key = `users/${userNamespace}/jobs/${args.jobId}/source/${args.filename}`;

    // Part size: 10MB (minimum for S3/R2 multipart is 5MB, except last part)
    const partSize = 10 * 1024 * 1024; // 10MB
    const totalParts = Math.ceil(args.totalBytes / partSize);

    // Create multipart upload
    const createCommand = new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: r2Key,
      ContentType: args.mimeType,
    });

    let createResponse;
    try {
      createResponse = await client.send(createCommand);

      // Log the full response for debugging
      console.log("CreateMultipartUpload response:", JSON.stringify({
        UploadId: createResponse.UploadId,
        Bucket: createResponse.Bucket,
        Key: createResponse.Key,
        $metadata: createResponse.$metadata,
        // Check if there are any other properties
        allKeys: Object.keys(createResponse),
      }, null, 2));
    } catch (error) {
      // Log detailed error information
      const errorDetails = {
        name: (error as Error).name,
        message: (error as Error).message,
        // AWS SDK errors often have additional properties
        code: (error as Record<string, unknown>).Code || (error as Record<string, unknown>).$fault,
        requestId: (error as Record<string, unknown>).$metadata,
      };
      console.error("CreateMultipartUpload error:", JSON.stringify(errorDetails, null, 2));
      throw new Error(`R2 CreateMultipartUpload failed: ${(error as Error).message}`);
    }

    const uploadId = createResponse.UploadId;

    if (!uploadId) {
      // Log what we actually received to help diagnose
      console.error("No UploadId in response. Full response object:",
        JSON.stringify(createResponse, null, 2));
      throw new Error(
        `Failed to create multipart upload: no uploadId returned. ` +
        `Response keys: ${Object.keys(createResponse).join(", ")}. ` +
        `$metadata httpStatusCode: ${createResponse.$metadata?.httpStatusCode}`
      );
    }

    // Generate presigned URLs for first batch of parts (up to 20)
    const batchSize = Math.min(20, totalParts);
    const partUrls = await generatePartUrls(
      client,
      bucket,
      r2Key,
      uploadId,
      1,
      batchSize
    );

    return {
      uploadId,
      r2Key,
      partSize,
      totalParts,
      partUrls,
    };
  },
});

/**
 * Sign additional part URLs for large files.
 * Call this when you need more presigned URLs during upload.
 */
export const r2SignParts = action({
  args: {
    sessionId: v.union(
      v.id("upload_sessions"),
      v.id("video_upload_sessions"),
      v.id("gif_upload_sessions"),
      v.id("meme_upload_sessions")
    ),
    startPart: v.number(),
    endPart: v.number(),
  },
  handler: async (
    ctx,
    args
  ): Promise<Array<{ partNumber: number; url: string }>> => {
    // Get session from DB using unified query
    const session = await ctx.runQuery(internal.r2.getAnyUploadSession, {
      sessionId: args.sessionId,
    });

    if (!session) {
      throw new Error(`Upload session not found: ${args.sessionId}`);
    }

    if (session.status !== "ACTIVE") {
      throw new Error(`Upload session is not active: ${session.status}`);
    }

    const client = getR2Client();
    const bucket = getR2Bucket();

    // Generate presigned URLs for requested range
    const partUrls = await generatePartUrls(
      client,
      bucket,
      session.r2Key,
      session.uploadId,
      args.startPart,
      args.endPart
    );

    return partUrls;
  },
});

/**
 * Complete a multipart upload after all parts are uploaded.
 * Assembles the parts into a single object in R2.
 *
 * IMPORTANT: Uses ListPartsCommand to fetch actual ETags from R2 instead of
 * relying on client-reported ETags. This is necessary because browsers may not
 * be able to read the ETag header from presigned URL responses due to CORS
 * restrictions (R2 may not expose ETag in Access-Control-Expose-Headers).
 */
export const r2CompleteMultipart = action({
  args: {
    sessionId: v.union(
      v.id("upload_sessions"),
      v.id("video_upload_sessions"),
      v.id("gif_upload_sessions"),
      v.id("meme_upload_sessions")
    ),
  },
  handler: async (ctx, args): Promise<{ r2Key: string; location: string }> => {
    // Get session from DB using unified query
    const session = await ctx.runQuery(internal.r2.getAnyUploadSession, {
      sessionId: args.sessionId,
    });

    if (!session) {
      throw new Error(`Upload session not found: ${args.sessionId}`);
    }

    if (session.status !== "ACTIVE") {
      throw new Error(`Upload session is not active: ${session.status}`);
    }

    // Verify all parts are uploaded (based on client tracking)
    if (session.completedParts.length !== session.totalParts) {
      throw new Error(
        `Not all parts uploaded: ${session.completedParts.length}/${session.totalParts}`
      );
    }

    const client = getR2Client();
    const bucket = getR2Bucket();

    // Fetch actual parts from R2 using ListParts
    // This is necessary because browsers may not be able to read ETag headers
    // from presigned URL responses due to CORS restrictions
    const actualParts: Array<{ PartNumber: number; ETag: string }> = [];
    let partMarker: string | undefined = undefined;

    do {
      const listResponse: ListPartsCommandOutput = await client.send(
        new ListPartsCommand({
          Bucket: bucket,
          Key: session.r2Key,
          UploadId: session.uploadId,
          PartNumberMarker: partMarker,
        })
      );

      if (listResponse.Parts) {
        for (const part of listResponse.Parts) {
          if (part.PartNumber && part.ETag) {
            actualParts.push({
              PartNumber: part.PartNumber,
              ETag: part.ETag,
            });
          }
        }
      }

      // Handle pagination if there are more parts
      if (listResponse.IsTruncated && listResponse.NextPartNumberMarker) {
        partMarker = String(listResponse.NextPartNumberMarker);
      } else {
        partMarker = undefined;
      }
    } while (partMarker);

    // Verify we found all expected parts
    if (actualParts.length !== session.totalParts) {
      console.error(
        `Part count mismatch: R2 has ${actualParts.length} parts, expected ${session.totalParts}`
      );
      throw new Error(
        `Part count mismatch: R2 has ${actualParts.length} parts, expected ${session.totalParts}. ` +
        `Some parts may not have uploaded successfully.`
      );
    }

    // Sort parts by part number (required for completion)
    actualParts.sort((a, b) => a.PartNumber - b.PartNumber);

    // Log if client ETags differed (helps diagnose CORS issues)
    const clientEtags = session.completedParts
      .sort((a: { partNumber: number; etag: string }, b: { partNumber: number; etag: string }) => a.partNumber - b.partNumber)
      .map((p: { partNumber: number; etag: string }) => p.etag);
    const r2Etags = actualParts.map(p => p.ETag);
    const etagsDiffer = clientEtags.some((clientEtag: string, i: number) => {
      // Normalize ETags for comparison (remove quotes)
      const normalizedClient = clientEtag.replace(/"/g, "");
      const normalizedR2 = r2Etags[i]?.replace(/"/g, "") || "";
      return normalizedClient !== normalizedR2;
    });

    if (etagsDiffer) {
      console.warn(
        `Client ETags differ from R2 ETags (CORS may not expose ETag header). ` +
        `Using R2 ETags for completion. Client: ${JSON.stringify(clientEtags)}, R2: ${JSON.stringify(r2Etags)}`
      );
    }

    // Complete multipart upload using actual ETags from R2
    const completeCommand = new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: session.r2Key,
      UploadId: session.uploadId,
      MultipartUpload: {
        Parts: actualParts,
      },
    });

    const response = await client.send(completeCommand);

    return {
      r2Key: session.r2Key,
      location: response.Location || `${bucket}/${session.r2Key}`,
    };
  },
});

/**
 * Abort a multipart upload (cleanup on failure/cancellation).
 */
export const r2AbortMultipart = action({
  args: {
    sessionId: v.union(
      v.id("upload_sessions"),
      v.id("video_upload_sessions"),
      v.id("gif_upload_sessions"),
      v.id("meme_upload_sessions")
    ),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    // Get session from DB using unified query
    const session = await ctx.runQuery(internal.r2.getAnyUploadSession, {
      sessionId: args.sessionId,
    });

    if (!session) {
      // Already cleaned up
      return { success: true };
    }

    const client = getR2Client();
    const bucket = getR2Bucket();

    try {
      const abortCommand = new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: session.r2Key,
        UploadId: session.uploadId,
      });

      await client.send(abortCommand);
      return { success: true };
    } catch (error) {
      // Upload may already be completed or aborted
      console.error("Failed to abort multipart upload:", error);
      return { success: false };
    }
  },
});

/**
 * Generate a presigned URL for downloading a file from R2.
 * Used for serving clips to users.
 */
export const r2GetSignedUrl = action({
  args: {
    r2Key: v.string(),
    expiresIn: v.optional(v.number()), // Seconds, default 1 hour
  },
  handler: async (ctx, args): Promise<{ url: string; expiresAt: number }> => {
    const client = getR2Client();
    const bucket = getR2Bucket();

    const expiresIn = args.expiresIn || 3600; // 1 hour default

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: args.r2Key,
    });

    const url = await getSignedUrl(client, command, { expiresIn });
    const expiresAt = Date.now() + expiresIn * 1000;

    return { url, expiresAt };
  },
});

/**
 * Batch generate signed URLs for multiple clips.
 * More efficient than calling r2GetSignedUrl multiple times.
 */
export const r2GetSignedUrls = action({
  args: {
    r2Keys: v.array(
      v.object({
        id: v.string(), // Clip ID or identifier
        clipKey: v.string(), // R2 key for clip
        thumbKey: v.optional(v.string()), // R2 key for thumbnail
      })
    ),
    expiresIn: v.optional(v.number()), // Seconds, default 1 hour
  },
  handler: async (
    ctx,
    args
  ): Promise<
    Array<{
      id: string;
      clipUrl: string;
      thumbUrl: string | null;
      expiresAt: number;
    }>
  > => {
    const client = getR2Client();
    const bucket = getR2Bucket();

    const expiresIn = args.expiresIn || 3600; // 1 hour default
    const expiresAt = Date.now() + expiresIn * 1000;

    const results = await Promise.all(
      args.r2Keys.map(async (item) => {
        const clipCommand = new GetObjectCommand({
          Bucket: bucket,
          Key: item.clipKey,
        });
        const clipUrl = await getSignedUrl(client, clipCommand, { expiresIn });

        let thumbUrl: string | null = null;
        if (item.thumbKey) {
          const thumbCommand = new GetObjectCommand({
            Bucket: bucket,
            Key: item.thumbKey,
          });
          thumbUrl = await getSignedUrl(client, thumbCommand, { expiresIn });
        }

        return {
          id: item.id,
          clipUrl,
          thumbUrl,
          expiresAt,
        };
      })
    );

    return results;
  },
});

/**
 * Internal version of r2GetSignedUrls for use by other actions.
 * Same functionality but callable from internal actions.
 */
export const r2GetSignedUrlsInternal = internalAction({
  args: {
    r2Keys: v.array(
      v.object({
        id: v.string(), // Clip ID or identifier
        clipKey: v.string(), // R2 key for clip
        thumbKey: v.optional(v.string()), // R2 key for thumbnail
      })
    ),
    expiresIn: v.optional(v.number()), // Seconds, default 1 hour
  },
  handler: async (
    ctx,
    args
  ): Promise<
    Array<{
      id: string;
      clipUrl: string;
      thumbUrl: string | null;
      expiresAt: number;
    }>
  > => {
    const client = getR2Client();
    const bucket = getR2Bucket();

    const expiresIn = args.expiresIn || 3600; // 1 hour default
    const expiresAt = Date.now() + expiresIn * 1000;

    const results = await Promise.all(
      args.r2Keys.map(async (item) => {
        const clipCommand = new GetObjectCommand({
          Bucket: bucket,
          Key: item.clipKey,
        });
        const clipUrl = await getSignedUrl(client, clipCommand, { expiresIn });

        let thumbUrl: string | null = null;
        if (item.thumbKey) {
          const thumbCommand = new GetObjectCommand({
            Bucket: bucket,
            Key: item.thumbKey,
          });
          thumbUrl = await getSignedUrl(client, thumbCommand, { expiresIn });
        }

        return {
          id: item.id,
          clipUrl,
          thumbUrl,
          expiresAt,
        };
      })
    );

    return results;
  },
});

/**
 * Internal version of r2GetSignedUrls for GIFs.
 * Generates signed URLs for GIF, MP4, and WebP files stored in R2.
 */
export const r2GetGifSignedUrlsInternal = internalAction({
  args: {
    r2Keys: v.array(
      v.object({
        id: v.string(), // GIF ID or identifier
        gifKey: v.optional(v.string()), // R2 key for GIF
        mp4Key: v.optional(v.string()), // R2 key for MP4
        webpKey: v.optional(v.string()), // R2 key for WebP
      })
    ),
    expiresIn: v.optional(v.number()), // Seconds, default 1 hour
  },
  handler: async (
    ctx,
    args
  ): Promise<
    Array<{
      id: string;
      gifUrl: string | null;
      mp4Url: string | null;
      webpUrl: string | null;
      expiresAt: number;
    }>
  > => {
    const client = getR2Client();
    const bucket = getR2Bucket();

    const expiresIn = args.expiresIn || 3600; // 1 hour default
    const expiresAt = Date.now() + expiresIn * 1000;

    const results = await Promise.all(
      args.r2Keys.map(async (item) => {
        let gifUrl: string | null = null;
        let mp4Url: string | null = null;
        let webpUrl: string | null = null;

        if (item.gifKey) {
          const gifCommand = new GetObjectCommand({
            Bucket: bucket,
            Key: item.gifKey,
          });
          gifUrl = await getSignedUrl(client, gifCommand, { expiresIn });
        }

        if (item.mp4Key) {
          const mp4Command = new GetObjectCommand({
            Bucket: bucket,
            Key: item.mp4Key,
          });
          mp4Url = await getSignedUrl(client, mp4Command, { expiresIn });
        }

        if (item.webpKey) {
          const webpCommand = new GetObjectCommand({
            Bucket: bucket,
            Key: item.webpKey,
          });
          webpUrl = await getSignedUrl(client, webpCommand, { expiresIn });
        }

        return {
          id: item.id,
          gifUrl,
          mp4Url,
          webpUrl,
          expiresAt,
        };
      })
    );

    return results;
  },
});

/**
 * Internal version of r2GetSignedUrls for Memes.
 * Generates signed URLs for meme and frame images stored in R2.
 */
export const r2GetMemeSignedUrlsInternal = internalAction({
  args: {
    r2Keys: v.array(
      v.object({
        id: v.string(), // Meme ID or identifier
        memeKey: v.optional(v.string()), // R2 key for meme image
        frameKey: v.optional(v.string()), // R2 key for frame image
      })
    ),
    expiresIn: v.optional(v.number()), // Seconds, default 1 hour
  },
  handler: async (
    ctx,
    args
  ): Promise<
    Array<{
      id: string;
      memeUrl: string | null;
      frameUrl: string | null;
      expiresAt: number;
    }>
  > => {
    const client = getR2Client();
    const bucket = getR2Bucket();

    const expiresIn = args.expiresIn || 3600; // 1 hour default
    const expiresAt = Date.now() + expiresIn * 1000;

    const results = await Promise.all(
      args.r2Keys.map(async (item) => {
        let memeUrl: string | null = null;
        let frameUrl: string | null = null;

        if (item.memeKey) {
          const memeCommand = new GetObjectCommand({
            Bucket: bucket,
            Key: item.memeKey,
          });
          memeUrl = await getSignedUrl(client, memeCommand, { expiresIn });
        }

        if (item.frameKey) {
          const frameCommand = new GetObjectCommand({
            Bucket: bucket,
            Key: item.frameKey,
          });
          frameUrl = await getSignedUrl(client, frameCommand, { expiresIn });
        }

        return {
          id: item.id,
          memeUrl,
          frameUrl,
          expiresAt,
        };
      })
    );

    return results;
  },
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate presigned URLs for uploading parts.
 */
async function generatePartUrls(
  client: S3Client,
  bucket: string,
  key: string,
  uploadId: string,
  startPart: number,
  endPart: number
): Promise<Array<{ partNumber: number; url: string }>> {
  const urls: Array<{ partNumber: number; url: string }> = [];

  for (let partNumber = startPart; partNumber <= endPart; partNumber++) {
    const command = new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    // Presigned URLs valid for 1 hour
    const url = await getSignedUrl(client, command, { expiresIn: 3600 });

    urls.push({ partNumber, url });
  }

  return urls;
}

// =============================================================================
// YOUTUBE VIDEO URL FETCHING (Browser-First Flow)
// =============================================================================

/**
 * Extract YouTube video ID from various URL formats.
 */
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Get YouTube video download URL via RapidAPI.
 * Returns a direct download URL that the browser can fetch.
 *
 * This enables the browser-first flow:
 * 1. Browser calls this action to get download URL
 * 2. Browser fetches video from the URL
 * 3. Browser uploads video to R2 using resumable upload
 * 4. Modal processes video from R2
 */
export const getYouTubeDownloadUrl = action({
  args: {
    videoUrl: v.string(),
    quality: v.optional(v.string()), // "high", "medium", "low"
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    downloadUrl?: string;
    title?: string;
    duration?: number;
    thumbnail?: string;
    contentType?: string;
    error?: string;
  }> => {
    // Verify authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { success: false, error: "Not authenticated" };
    }

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    const rapidApiHost = process.env.RAPIDAPI_HOST || "ytstream-download-youtube-videos.p.rapidapi.com";

    if (!rapidApiKey) {
      return { success: false, error: "YouTube API not configured" };
    }

    // Extract video ID
    const videoId = extractYouTubeVideoId(args.videoUrl);
    if (!videoId) {
      return { success: false, error: "Invalid YouTube URL" };
    }

    try {
      // Call RapidAPI to get video info
      const response = await fetch(
        `https://${rapidApiHost}/dl?id=${videoId}`,
        {
          method: "GET",
          headers: {
            "X-RapidAPI-Key": rapidApiKey,
            "X-RapidAPI-Host": rapidApiHost,
          },
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `API error: ${response.status}`
        };
      }

      const data = await response.json();

      if (data.status !== "OK" && data.status !== "ok") {
        return {
          success: false,
          error: data.msg || "Failed to get video info"
        };
      }

      // Extract metadata
      const title = data.title || "YouTube Video";
      const duration = data.lengthSeconds ? parseInt(data.lengthSeconds) : undefined;

      // Get thumbnail
      let thumbnail: string | undefined;
      const thumbnails = data.thumbnail || data.thumbnails;
      if (Array.isArray(thumbnails) && thumbnails.length > 0) {
        const best = thumbnails.reduce((a: any, b: any) =>
          (a.width || 0) > (b.width || 0) ? a : b
        );
        thumbnail = best.url;
      } else if (typeof thumbnails === "string") {
        thumbnail = thumbnails;
      }

      // Get formats
      const formats = data.formats || data.adaptiveFormats || [];
      const streamingFormats = data.streamingData?.formats || [];
      const adaptiveFormats = data.streamingData?.adaptiveFormats || [];
      const allFormats = [...formats, ...streamingFormats, ...adaptiveFormats];

      if (allFormats.length === 0) {
        return { success: false, error: "No download formats available" };
      }

      // Quality mapping
      const qualityMap: Record<string, number> = {
        high: 1080,
        medium: 720,
        low: 480,
      };
      const targetHeight = qualityMap[args.quality || "medium"] || 720;

      // Find best format with both video and audio
      let bestFormat = null;
      let bestVideoOnly = null;

      for (const fmt of allFormats) {
        const height = fmt.height || 0;
        const hasVideo = fmt.hasVideo !== false && (fmt.mimeType?.includes("video") || fmt.qualityLabel);
        const hasAudio = fmt.hasAudio !== false && (fmt.mimeType?.includes("audio") || fmt.audioQuality);

        if (hasVideo && hasAudio && fmt.url) {
          // Prefer combined video+audio formats
          if (!bestFormat || Math.abs(height - targetHeight) < Math.abs((bestFormat.height || 0) - targetHeight)) {
            bestFormat = fmt;
          }
        } else if (hasVideo && fmt.url && !bestVideoOnly) {
          // Track video-only as fallback
          if (!bestVideoOnly || Math.abs(height - targetHeight) < Math.abs((bestVideoOnly.height || 0) - targetHeight)) {
            bestVideoOnly = fmt;
          }
        }
      }

      // Use combined format if available, otherwise video-only
      const selectedFormat = bestFormat || bestVideoOnly;

      if (!selectedFormat || !selectedFormat.url) {
        return { success: false, error: "No suitable download URL found" };
      }

      return {
        success: true,
        downloadUrl: selectedFormat.url,
        title,
        duration,
        thumbnail,
        contentType: selectedFormat.mimeType || "video/mp4",
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMsg };
    }
  },
});

/**
 * Trigger Modal to download YouTube video to R2.
 * This bypasses CORS issues by doing the download server-side.
 *
 * Flow:
 * 1. Client calls this action with YouTube URL and job ID
 * 2. This action calls Modal's YouTube download endpoint
 * 3. Modal downloads video via RapidAPI (server-side, no CORS)
 * 4. Modal uploads to R2
 * 5. Modal calls Convex webhook to update job with r2SourceKey
 * 6. Job proceeds to processing
 */
export const triggerYouTubeDownloadToR2 = action({
  args: {
    jobId: v.id("processing_jobs"),
    videoUrl: v.string(),
    quality: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> => {
    // Verify authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { success: false, error: "Not authenticated" };
    }

    // Get the job to verify ownership and get user ID
    const job = await ctx.runQuery(internal.processing.getJobInternal, {
      jobId: args.jobId,
    });

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    // Get user to verify ownership
    const user = await ctx.runQuery(internal.processing.getUserByAuthId, {
      authId: identity.tokenIdentifier,
    });

    if (!user || job.userId !== user._id) {
      return { success: false, error: "Not authorized" };
    }

    // Get Modal endpoint URL
    const modalYouTubeEndpoint = process.env.MODAL_YOUTUBE_DOWNLOAD_ENDPOINT_URL
      || "https://fairenow--flmlnk-video-processor-download-youtube-r2-wit-d5d030.modal.run";
    const webhookSecret = process.env.MODAL_WEBHOOK_SECRET;

    try {
      // Update job status to indicate download is starting
      await ctx.runMutation(internal.processing.updateJobStatus, {
        jobId: args.jobId,
        status: "DOWNLOADING",
        currentStep: "Downloading YouTube video...",
        progress: 5,
      });

      // Call Modal endpoint to start download
      const response = await fetch(modalYouTubeEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: args.jobId,
          video_url: args.videoUrl,
          user_id: user._id,
          quality: args.quality || "medium",
          webhook_secret: webhookSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Modal responded with ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      if (result.status === "error") {
        throw new Error(result.message || "Modal returned error");
      }

      return {
        success: true,
        message: "YouTube download started - video will be processed automatically",
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";

      // Mark job as failed
      await ctx.runMutation(internal.processing.markJobFailed, {
        jobId: args.jobId,
        error: `YouTube download failed: ${errorMsg}`,
        errorStage: "download",
      });

      return { success: false, error: errorMsg };
    }
  },
});
