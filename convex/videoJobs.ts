"use node";

/**
 * Video jobs actions that require Node.js runtime.
 * Mutations and queries are in videoJobsDb.ts.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { ActionCtx, action, internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import "./domParserPolyfill";

const STATUS = {
  CREATED: "CREATED",
  META_READY: "META_READY",
  UPLOAD_READY: "UPLOAD_READY",
  UPLOADING: "UPLOADING",
  UPLOADED: "UPLOADED",
  PROCESSING: "PROCESSING",
  READY: "READY",
  FAILED: "FAILED",
} as const;

const DEFAULT_IMPORT_PART_SIZE = 8 * 1024 * 1024; // 8MB

function getR2Client(): S3Client {
  const endpoint = process.env.R2_ENDPOINT_URL;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials not configured. Set R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
    );
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
    // Disable automatic checksums for R2 CORS compatibility
    // AWS SDK v3.400+ enables checksums by default which causes CORS issues
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error("R2_BUCKET_NAME not configured");
  }
  return bucket;
}

function parseYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"].includes(
      parsed.hostname
    );
  } catch {
    return false;
  }
}

async function getUserFromIdentity(ctx: ActionCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.runQuery(internal.videoJobsDb.getCurrentUserForAction);
  if (!user) {
    throw new Error("User not found");
  }

  return user._id;
}

export const createJobFromYouTubeUrl = action({
  args: { youtubeUrl: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{
    jobId: Id<"video_jobs">;
    meta: {
      title?: string;
      thumbnailUrl?: string;
      duration?: number;
      authorName?: string;
    };
  }> => {
    const userId = await getUserFromIdentity(ctx);

    if (!isYouTubeUrl(args.youtubeUrl)) {
      throw new Error("Only YouTube URLs are supported");
    }

    const videoId = parseYouTubeId(args.youtubeUrl);
    if (!videoId) {
      throw new Error("Unable to parse YouTube video ID");
    }

    let meta: {
      title?: string;
      thumbnailUrl?: string;
      duration?: number;
      authorName?: string;
    } = {};

    try {
      const response = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(args.youtubeUrl)}&format=json`
      );

      if (response.ok) {
        const data = (await response.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };

        meta = {
          title: data.title,
          thumbnailUrl: data.thumbnail_url,
          authorName: data.author_name,
        };
      }
    } catch (error) {
      console.warn("Failed to fetch YouTube oEmbed metadata", error);
    }

    const jobId = (await ctx.runMutation(
      internal.videoJobsDb.createVideoJobRecord,
      {
        userId,
        youtubeUrl: args.youtubeUrl,
        videoId,
        meta,
      }
    )) as Id<"video_jobs">;

    return { jobId, meta };
  },
});

// Multiple Piped API instances for fallback
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
  "https://pipedapi.in.projectsegfau.lt",
];

async function fetchBestStream(videoId: string): Promise<{
  url: string;
  contentLength?: number;
  mimeType: string;
}> {
  const errors: string[] = [];

  for (const baseUrl of PIPED_INSTANCES) {
    try {
      const apiUrl = `${baseUrl}/streams/${videoId}`;
      const res = await fetch(apiUrl);

      if (!res.ok) {
        errors.push(`${baseUrl}: status ${res.status}`);
        continue;
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        errors.push(`${baseUrl}: non-JSON response`);
        continue;
      }

      const data = (await res.json()) as {
        error?: string;
        message?: string;
        videoStreams?: Array<{ url: string; mimeType?: string; contentLength?: string }>;
        audioStreams?: Array<{ url: string; mimeType?: string; contentLength?: string }>;
      };

      if (data.error || data.message) {
        errors.push(`${baseUrl}: ${data.error || data.message}`);
        continue;
      }

      const candidates = data.videoStreams || [];
      const mp4 = candidates.find((s) => s.mimeType?.includes("mp4")) || candidates[0];

      if (!mp4?.url) {
        errors.push(`${baseUrl}: no streams available`);
        continue;
      }

      return {
        url: mp4.url,
        mimeType: mp4.mimeType || "video/mp4",
        contentLength: mp4.contentLength ? Number(mp4.contentLength) : undefined,
      };
    } catch (err) {
      errors.push(`${baseUrl}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  throw new Error(
    `Failed to resolve stream from all Piped instances. The video may be unavailable or restricted. Errors: ${errors.join("; ")}`
  );
}

export const importYouTubeVideo = action({
  args: { jobId: v.id("video_jobs") },
  handler: async (ctx, args) => {
    const userId = await getUserFromIdentity(ctx);
    const job = await ctx.runQuery(internal.videoJobsDb.getVideoJobInternal, {
      jobId: args.jobId,
    });

    if (!job || job.userId !== userId) {
      throw new Error("Job not found");
    }

    if (!job.rightsConfirmedAt) {
      throw new Error("Confirm rights before importing the video");
    }

    if (job.status !== STATUS.UPLOAD_READY && job.status !== STATUS.UPLOADING) {
      throw new Error(`Job is not ready for ingestion (status: ${job.status})`);
    }

    const videoId = parseYouTubeId(job.sourceUrl);
    if (!videoId) {
      throw new Error("Unable to parse YouTube video ID from the source URL");
    }

    const r2 = getR2Client();
    const bucket = getR2Bucket();
    const r2Key = `youtube/${videoId}/${job._id}.mp4`;

    await ctx.runMutation(internal.videoJobsDb.setVideoJobUploading, { jobId: job._id });

    const streamInfo = await fetchBestStream(videoId);
    const response = await fetch(streamInfo.url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download YouTube stream (status ${response.status})`);
    }

    const upload = await r2.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: r2Key,
        ContentType: streamInfo.mimeType,
      })
    );

    const uploadId = upload.UploadId;
    if (!uploadId) throw new Error("Failed to start multipart upload");

    const parts: Array<{ ETag: string; PartNumber: number }> = [];
    let partBuffer = Buffer.alloc(0);
    let partNumber = 1;
    let uploadedBytes = 0;
    const totalBytes = streamInfo.contentLength;

    const nodeStream = Readable.fromWeb(response.body as unknown as NodeReadableStream);

    const flushPart = async (final = false) => {
      if (!partBuffer.length) return;
      const result = await r2.send(
        new UploadPartCommand({
          Bucket: bucket,
          Key: r2Key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: partBuffer,
        })
      );

      if (!result.ETag) {
        throw new Error(`Missing ETag for uploaded part ${partNumber}`);
      }

      parts.push({ ETag: result.ETag, PartNumber: partNumber });
      uploadedBytes += partBuffer.length;
      partBuffer = Buffer.alloc(0);
      partNumber += 1;

      if (totalBytes) {
        const progress = Math.round((uploadedBytes / totalBytes) * 100);
        await ctx.runMutation(internal.videoJobsDb.updateVideoJobProgress, {
          jobId: job._id,
          progress,
        });
      }
    };

    try {
      for await (const chunk of nodeStream) {
        const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        partBuffer = Buffer.concat([partBuffer, bufferChunk]);

        if (partBuffer.length >= DEFAULT_IMPORT_PART_SIZE) {
          await flushPart();
        }
      }

      await flushPart(true);

      await r2.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: r2Key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        })
      );

      await ctx.runMutation(internal.videoJobsDb.markVideoJobUploaded, {
        jobId: job._id,
        r2Key,
      });
    } catch (error) {
      await ctx.runMutation(internal.videoJobsDb.markVideoJobFailed, {
        jobId: job._id,
        error: error instanceof Error ? error.message : "Unknown import error",
        stage: "import",
      });

      if (uploadId) {
        await r2.send(
          new AbortMultipartUploadCommand({ Bucket: bucket, Key: r2Key, UploadId: uploadId })
        );
      }
      throw error;
    }
  },
});

export const confirmVideoRights = action({
  args: { jobId: v.id("video_jobs") },
  handler: async (ctx, args): Promise<{ status: string }> => {
    const userId = await getUserFromIdentity(ctx);

    return ctx.runMutation(internal.videoJobsDb.confirmVideoRightsInternal, {
      jobId: args.jobId,
      userId,
    });
  },
});

/**
 * Internal action to call Modal trailer processing endpoint.
 * Triggered after a trailer_jobs entry is created and ready for processing.
 */
export const callModalTrailerEndpoint = internalAction({
  args: { trailerJobId: v.id("trailer_jobs") },
  handler: async (ctx, args) => {
    const modalTrailerEndpoint = process.env.MODAL_TRAILER_R2_ENDPOINT_URL;
    const webhookSecret = process.env.MODAL_WEBHOOK_SECRET;

    if (!modalTrailerEndpoint) {
      console.error("MODAL_TRAILER_R2_ENDPOINT_URL not configured");
      throw new Error(
        "Trailer processing endpoint not configured. Please set MODAL_TRAILER_R2_ENDPOINT_URL environment variable."
      );
    }

    try {
      console.log(`[${args.trailerJobId}] Calling Modal trailer endpoint: ${modalTrailerEndpoint}`);

      const response = await fetch(modalTrailerEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: args.trailerJobId,
          webhook_secret: webhookSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Modal returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`[${args.trailerJobId}] Modal trailer response:`, result);

      return result;
    } catch (error) {
      console.error(`[${args.trailerJobId}] Failed to trigger trailer processing:`, error);
      throw error;
    }
  },
});
