import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";
import { Id } from "./_generated/dataModel";

const http = httpRouter();

// =============================================================================
// AUTH DEBUG ENDPOINT
// =============================================================================

/**
 * Debug endpoint to check auth configuration
 * GET /auth/debug
 * Returns environment config and request headers for debugging 403 errors
 */
http.route({
  path: "/auth/debug",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const host = request.headers.get("host");
    const userAgent = request.headers.get("user-agent");

    // Get all headers for debugging
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      // Don't include cookies or auth headers in response for security
      if (!key.toLowerCase().includes("cookie") && !key.toLowerCase().includes("auth")) {
        headers[key] = value;
      }
    });

    const siteUrl = process.env.SITE_URL;
    const convexSiteUrl = process.env.CONVEX_SITE_URL;
    const nodeEnv = process.env.NODE_ENV;

    // Build trusted origins list (same logic as auth.ts)
    const trustedOriginsList: string[] = [];
    if (siteUrl) trustedOriginsList.push(siteUrl);
    if (convexSiteUrl) trustedOriginsList.push(convexSiteUrl);
    if (nodeEnv !== "production" || (siteUrl && siteUrl.includes("localhost"))) {
      trustedOriginsList.push("http://localhost:3000", "http://localhost:3001");
    }

    const debugInfo = {
      timestamp: new Date().toISOString(),
      request: {
        origin,
        referer,
        host,
        userAgent,
        url: request.url,
        headers,
      },
      environment: {
        SITE_URL: siteUrl || "(not set)",
        CONVEX_SITE_URL: convexSiteUrl || "(not set)",
        NODE_ENV: nodeEnv || "(not set)",
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? "(set)" : "(not set)",
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ? "(set)" : "(not set)",
      },
      trustedOriginsList,
      originCheck: {
        requestOrigin: origin,
        isOriginTrusted: origin ? trustedOriginsList.includes(origin) : "no origin header",
      },
    };

    console.log(`[CONVEX AUTH DEBUG] Debug endpoint hit:`, JSON.stringify(debugInfo, null, 2));

    return new Response(JSON.stringify(debugInfo, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

// OPTIONS handler for CORS preflight
http.route({
  path: "/auth/debug",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// Register auth routes
authComponent.registerRoutes(http, createAuth);

// =============================================================================
// HELPER: Verify webhook authentication
// =============================================================================

function verifyWebhookAuth(request: Request): boolean {
  const authHeader = request.headers.get("Authorization") || request.headers.get("X-Webhook-Secret");
  const webhookSecret = process.env.MODAL_WEBHOOK_SECRET;

  if (!webhookSecret) return true; // No secret configured, allow all
  if (authHeader === `Bearer ${webhookSecret}`) return true;
  if (authHeader === webhookSecret) return true;
  return false;
}

// =============================================================================
// CONVEX STORAGE ENDPOINTS (for Modal direct uploads)
// =============================================================================

/**
 * Generate an upload URL for Modal to upload clips directly to Convex storage
 * POST /modal/upload-url
 * Returns: { uploadUrl: string }
 */
http.route({
  path: "/modal/upload-url",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const uploadUrl = await ctx.storage.generateUploadUrl();
      return new Response(JSON.stringify({ uploadUrl }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Generate upload URL error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Get a public URL for a storage ID
 * POST /modal/file-url
 * Body: { storageId: string }
 * Returns: { url: string | null }
 */
http.route({
  path: "/modal/file-url",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { storageId } = body as { storageId: string };

      if (!storageId) {
        return new Response(JSON.stringify({ error: "Missing storageId" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const url = await ctx.storage.getUrl(storageId as Id<"_storage">);
      return new Response(JSON.stringify({ url }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Get file URL error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Create a pending clip record before upload
 * POST /modal/create-clip
 * Body: { externalJobId, clip: { ...metadata without URLs } }
 * Returns: { clipId: string }
 */
http.route({
  path: "/modal/create-clip",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { externalJobId, clip } = body as {
        externalJobId: string;
        clip: {
          externalClipId: string;
          title: string;
          description: string;
          transcript: string;
          duration: number;
          startTime: number;
          endTime: number;
          score: number;
          videoTitle?: string;
          hasFaces?: boolean;
          facePositions?: Array<{ x: number; y: number; width: number; height: number; timestamp: number }>;
          layout?: string;
          captionStyle?: string;
          viralAnalysis?: {
            hookStrength?: number;
            retentionScore?: number;
            shareabilityScore?: number;
            suggestedHashtags?: string[];
            summary?: string;
          };
        };
      };

      if (!externalJobId || !clip) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Create pending clip record
      const clipId = await ctx.runMutation(internal.storage.createPendingClip, {
        externalJobId,
        clip,
      });

      return new Response(JSON.stringify({ success: true, clipId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Create clip error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Update clip with storage IDs after upload completes
 * POST /modal/confirm-clip
 * Body: { clipId: string, storageId: string, thumbnailStorageId?: string }
 * Returns: { success: boolean, url: string, thumbnailUrl?: string }
 */
http.route({
  path: "/modal/confirm-clip",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { clipId, storageId, thumbnailStorageId } = body as {
        clipId: string;
        storageId: string;
        thumbnailStorageId?: string;
      };

      if (!clipId || !storageId) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Update clip with storage IDs
      const result = await ctx.runMutation(internal.storage.updateClipStorage, {
        clipId: clipId as Id<"generated_clips">,
        storageId: storageId as Id<"_storage">,
        thumbnailStorageId: thumbnailStorageId as Id<"_storage"> | undefined,
      });

      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Confirm clip error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Mark clip upload as failed
 * POST /modal/clip-failed
 * Body: { clipId: string, error: string }
 */
http.route({
  path: "/modal/clip-failed",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { clipId, error } = body as { clipId: string; error: string };

      if (!clipId) {
        return new Response(JSON.stringify({ error: "Missing clipId" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      await ctx.runMutation(internal.storage.markClipFailed, {
        clipId: clipId as Id<"generated_clips">,
        error: error || "Unknown error",
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Mark clip failed error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// =============================================================================
// MODAL WEBHOOK ENDPOINTS
// =============================================================================

/**
 * Webhook for Modal to update job progress
 * POST /modal/progress
 * Body: { jobId, externalJobId, status, progress, currentStep, error? }
 */
http.route({
  path: "/modal/progress",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Verify webhook secret
    const authHeader = request.headers.get("Authorization");
    const webhookSecret = process.env.MODAL_WEBHOOK_SECRET;

    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { externalJobId, status, progress, currentStep, error, videoTitle, videoDuration } = body as {
        externalJobId: string;
        status: string;
        progress?: number;
        currentStep?: string;
        error?: string;
        videoTitle?: string;
        videoDuration?: number;
      };

      if (!externalJobId || !status) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Update job progress in database
      // Convert null to undefined since v.optional(v.string()) doesn't accept null
      await ctx.runMutation(internal.clipGenerator.updateJobProgress, {
        externalJobId,
        status,
        progress,
        currentStep,
        errorMessage: error || undefined,
        videoTitle,
        videoDuration,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Modal progress webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Webhook for Modal to save a generated clip
 * POST /modal/clip
 * Body: { externalJobId, clip: { ...clipData } }
 */
http.route({
  path: "/modal/clip",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    const webhookSecret = process.env.MODAL_WEBHOOK_SECRET;

    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { externalJobId, clip } = body as {
        externalJobId: string;
        clip: {
          externalClipId: string;
          title: string;
          description: string;
          transcript: string;
          downloadUrl: string;
          thumbnailUrl?: string;
          duration: number;
          startTime: number;
          endTime: number;
          score: number;
          videoTitle?: string;
          hasFaces?: boolean;
          facePositions?: Array<{ x: number; y: number; width: number; height: number; timestamp: number }>;
          layout?: string;
          captionStyle?: string;
          viralAnalysis?: {
            hookStrength?: number;
            retentionScore?: number;
            shareabilityScore?: number;
            suggestedHashtags?: string[];
            summary?: string;
          };
        };
      };

      if (!externalJobId || !clip) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Save clip to database
      const clipId = await ctx.runMutation(internal.clipGenerator.saveClipFromWebhook, {
        externalJobId,
        clip,
      });

      return new Response(JSON.stringify({ success: true, clipId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Modal clip webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Webhook for Modal to save/retrieve cached transcription
 * POST /modal/transcription
 * Body: { videoHash, sourceVideoUrl, segments, fullText, ... }
 */
http.route({
  path: "/modal/transcription",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    const webhookSecret = process.env.MODAL_WEBHOOK_SECRET;

    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { videoHash, sourceVideoUrl, videoTitle, videoDuration, segments, fullText, language, model } = body as {
        videoHash: string;
        sourceVideoUrl: string;
        videoTitle?: string;
        videoDuration?: number;
        segments: Array<{
          start: number;
          end: number;
          text: string;
          words?: Array<{ word: string; start: number; end: number; confidence?: number }>;
        }>;
        fullText: string;
        language?: string;
        model?: string;
      };

      if (!videoHash || !sourceVideoUrl || !segments || !fullText) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Save transcription to database
      const transcriptionId = await ctx.runMutation(internal.clipGenerator.saveTranscription, {
        videoHash,
        sourceVideoUrl,
        videoTitle,
        videoDuration,
        segments,
        fullText,
        language,
        model,
      });

      return new Response(JSON.stringify({ success: true, transcriptionId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Modal transcription webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Check if transcription exists (for caching)
 * GET /modal/transcription?videoHash=xxx
 */
http.route({
  path: "/modal/transcription",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    const webhookSecret = process.env.MODAL_WEBHOOK_SECRET;

    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const url = new URL(request.url);
      const videoHash = url.searchParams.get("videoHash");

      if (!videoHash) {
        return new Response(JSON.stringify({ error: "Missing videoHash" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Check if transcription exists
      const transcription = await ctx.runQuery(internal.clipGenerator.getTranscriptionByHash, {
        videoHash,
      });

      if (transcription) {
        // Update last used timestamp
        await ctx.runMutation(internal.clipGenerator.updateTranscriptionLastUsed, {
          transcriptionId: transcription._id,
        });

        return new Response(JSON.stringify({ exists: true, transcription }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ exists: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Modal transcription check error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Mark job as complete
 * POST /modal/complete
 * Body: { externalJobId, success, error? }
 */
http.route({
  path: "/modal/complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    const webhookSecret = process.env.MODAL_WEBHOOK_SECRET;

    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { externalJobId, success, error } = body as {
        externalJobId: string;
        success: boolean;
        error?: string;
      };

      if (!externalJobId) {
        return new Response(JSON.stringify({ error: "Missing externalJobId" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Mark job as complete
      // Convert null to undefined since v.optional(v.string()) doesn't accept null
      await ctx.runMutation(internal.clipGenerator.completeJob, {
        externalJobId,
        success,
        errorMessage: error || undefined,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Modal complete webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// =============================================================================
// MEME GENERATION WEBHOOK ENDPOINTS
// =============================================================================

/**
 * Webhook for Modal to update meme job progress
 * POST /modal/meme-progress
 * Body: { externalJobId, status, progress, currentStep, error?, videoTitle?, videoDuration? }
 */
http.route({
  path: "/modal/meme-progress",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { externalJobId, status, progress, currentStep, error, videoTitle, videoDuration } = body as {
        externalJobId: string;
        status: string;
        progress?: number;
        currentStep?: string;
        error?: string;
        videoTitle?: string;
        videoDuration?: number;
      };

      if (!externalJobId || !status) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Update meme job progress in database
      await ctx.runMutation(internal.memeGenerator.updateMemeJobProgress, {
        externalJobId,
        status,
        progress,
        currentStep,
        errorMessage: error || undefined,
        videoTitle,
        videoDuration,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Modal meme progress webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Webhook for Modal to save a candidate frame for meme analysis
 * POST /modal/meme-frame
 * Body: { externalJobId, frame: { timestamp, emotion, memeability, ... } }
 */
http.route({
  path: "/modal/meme-frame",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { externalJobId, frame } = body as {
        externalJobId: string;
        frame: {
          timestamp: number;
          url?: string;
          emotion?: string;
          emotionConfidence?: number;
          action?: string;
          actionConfidence?: number;
          hasFaces?: boolean;
          faceCount?: number;
          sceneDescription?: string;
          potentialTemplates?: string[];
          memeability?: number;
        };
      };

      if (!externalJobId || !frame) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Save candidate frame to database
      const frameId = await ctx.runMutation(internal.memeGenerator.saveCandidateFrameFromModal, {
        externalJobId,
        timestamp: frame.timestamp,
        url: frame.url,
        emotion: frame.emotion,
        emotionConfidence: frame.emotionConfidence,
        action: frame.action,
        actionConfidence: frame.actionConfidence,
        hasFaces: frame.hasFaces,
        faceCount: frame.faceCount,
        sceneDescription: frame.sceneDescription,
        potentialTemplates: frame.potentialTemplates,
        memeability: frame.memeability,
      });

      return new Response(JSON.stringify({ success: true, frameId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Modal meme frame webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Webhook for Modal to save a generated meme
 * POST /modal/meme
 * Body: { externalJobId, meme: { templateType, caption, viralScore, ... } }
 */
http.route({
  path: "/modal/meme",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { externalJobId, meme } = body as {
        externalJobId: string;
        meme: {
          templateType: string;
          templateName?: string;
          frameTimestamp: number;
          frameUrl?: string;
          frameStorageId?: string;
          caption: string;
          captionPosition?: string;
          viralScore?: number;
          sentiment?: string;
          suggestedHashtags?: string[];
          aiReasoning?: string;
          emotion?: string;
          action?: string;
          hasFaces?: boolean;
          faceCount?: number;
        };
      };

      if (!externalJobId || !meme) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Save generated meme to database
      const memeId = await ctx.runMutation(internal.memeGenerator.saveGeneratedMemeFromModal, {
        externalJobId,
        templateType: meme.templateType,
        templateName: meme.templateName,
        frameTimestamp: meme.frameTimestamp,
        frameUrl: meme.frameUrl,
        frameStorageId: meme.frameStorageId as Id<"_storage"> | undefined,
        caption: meme.caption,
        captionPosition: meme.captionPosition,
        viralScore: meme.viralScore,
        sentiment: meme.sentiment,
        suggestedHashtags: meme.suggestedHashtags,
        aiReasoning: meme.aiReasoning,
        emotion: meme.emotion,
        action: meme.action,
        hasFaces: meme.hasFaces,
        faceCount: meme.faceCount,
      });

      return new Response(JSON.stringify({ success: true, memeId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Modal meme webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Mark meme generation job as complete
 * POST /modal/meme-complete
 * Body: { externalJobId, success, error? }
 */
http.route({
  path: "/modal/meme-complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { externalJobId, success, error } = body as {
        externalJobId: string;
        success: boolean;
        error?: string;
      };

      if (!externalJobId) {
        return new Response(JSON.stringify({ error: "Missing externalJobId" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Mark meme job as complete
      await ctx.runMutation(internal.memeGenerator.completeMemeJob, {
        externalJobId,
        success,
        errorMessage: error || undefined,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Modal meme complete webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// =============================================================================
// GIF GENERATION WEBHOOK ENDPOINTS
// =============================================================================

/**
 * Webhook for Modal to update GIF job progress
 * POST /modal/gif-progress
 * Body: { externalJobId, status, progress, currentStep, error?, videoTitle?, videoDuration? }
 */
http.route({
  path: "/modal/gif-progress",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { externalJobId, status, progress, currentStep, error, videoTitle, videoDuration } = body as {
        externalJobId: string;
        status: string;
        progress?: number;
        currentStep?: string;
        error?: string;
        videoTitle?: string;
        videoDuration?: number;
      };

      if (!externalJobId || !status) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Update GIF job progress in database
      await ctx.runMutation(internal.gifGenerator.updateGifJobProgress, {
        externalJobId,
        status,
        progress,
        currentStep,
        errorMessage: error || undefined,
        videoTitle,
        videoDuration,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Modal GIF progress webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Webhook for Modal to save a candidate moment for GIF generation
 * POST /modal/gif-moment
 * Body: { externalJobId, moment: { startTime, endTime, viralScore, ... } }
 */
http.route({
  path: "/modal/gif-moment",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { externalJobId, moment } = body as {
        externalJobId: string;
        moment: {
          startTime: number;
          endTime: number;
          duration: number;
          transcript?: string;
          viralScore: number;
          humorScore?: number;
          emotionalIntensity?: number;
          surpriseScore?: number;
          ctaStrength?: number;
          audioEnergy?: number;
          sentimentValue?: number;
          sentimentMagnitude?: number;
          hasLaughter?: boolean;
          speakerTurns?: number;
          disfluencyCount?: number;
          suggestedOverlayText?: string;
          suggestedOverlayStyle?: string;
          reasoning?: string;
          r2ThumbnailKey?: string;
          thumbnailUrl?: string;
        };
      };

      if (!externalJobId || !moment) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Save candidate moment to database
      const momentId = await ctx.runMutation(internal.gifGenerator.saveCandidateMomentFromModal, {
        externalJobId,
        startTime: moment.startTime,
        endTime: moment.endTime,
        duration: moment.duration,
        transcript: moment.transcript,
        viralScore: moment.viralScore,
        humorScore: moment.humorScore,
        emotionalIntensity: moment.emotionalIntensity,
        surpriseScore: moment.surpriseScore,
        ctaStrength: moment.ctaStrength,
        audioEnergy: moment.audioEnergy,
        sentimentValue: moment.sentimentValue,
        sentimentMagnitude: moment.sentimentMagnitude,
        hasLaughter: moment.hasLaughter,
        speakerTurns: moment.speakerTurns,
        disfluencyCount: moment.disfluencyCount,
        suggestedOverlayText: moment.suggestedOverlayText,
        suggestedOverlayStyle: moment.suggestedOverlayStyle,
        reasoning: moment.reasoning,
        r2ThumbnailKey: moment.r2ThumbnailKey,
        thumbnailUrl: moment.thumbnailUrl,
      });

      return new Response(JSON.stringify({ success: true, momentId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Modal GIF moment webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Webhook for Modal to save a generated GIF
 * POST /modal/gif
 * Body: { externalJobId, gif: { title, startTime, endTime, duration, r2GifKey, ... } }
 */
http.route({
  path: "/modal/gif",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { externalJobId, gif } = body as {
        externalJobId: string;
        gif: {
          title?: string;
          description?: string;
          startTime: number;
          endTime: number;
          duration: number;
          r2GifKey?: string;
          gifUrl?: string;
          r2Mp4Key?: string;
          mp4Url?: string;
          width?: number;
          height?: number;
          fileSize?: number;
          frameRate?: number;
          frameCount?: number;
          overlayText?: string;
          overlayStyle?: string;
          overlayPosition?: string;
          viralScore?: number;
          humorScore?: number;
          emotionalIntensity?: number;
          suggestedHashtags?: string[];
          aiReasoning?: string;
          transcript?: string;
          hasAudioPeak?: boolean;
          hasSentimentSpike?: boolean;
          hasLaughter?: boolean;
          hasKeywords?: string[];
          isSafe?: boolean;
          safetyFlags?: string[];
        };
      };

      if (!externalJobId || !gif) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Save generated GIF to database
      const gifId = await ctx.runMutation(internal.gifGenerator.saveGeneratedGifFromModal, {
        externalJobId,
        title: gif.title,
        description: gif.description,
        startTime: gif.startTime,
        endTime: gif.endTime,
        duration: gif.duration,
        r2GifKey: gif.r2GifKey,
        gifUrl: gif.gifUrl,
        r2Mp4Key: gif.r2Mp4Key,
        mp4Url: gif.mp4Url,
        width: gif.width,
        height: gif.height,
        fileSize: gif.fileSize,
        frameRate: gif.frameRate,
        frameCount: gif.frameCount,
        overlayText: gif.overlayText,
        overlayStyle: gif.overlayStyle,
        overlayPosition: gif.overlayPosition,
        viralScore: gif.viralScore,
        humorScore: gif.humorScore,
        emotionalIntensity: gif.emotionalIntensity,
        suggestedHashtags: gif.suggestedHashtags,
        aiReasoning: gif.aiReasoning,
        transcript: gif.transcript,
        hasAudioPeak: gif.hasAudioPeak,
        hasSentimentSpike: gif.hasSentimentSpike,
        hasLaughter: gif.hasLaughter,
        hasKeywords: gif.hasKeywords,
        isSafe: gif.isSafe,
        safetyFlags: gif.safetyFlags,
      });

      return new Response(JSON.stringify({ success: true, gifId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Modal GIF webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Mark GIF generation job as complete
 * POST /modal/gif-complete
 * Body: { externalJobId, success, error? }
 */
http.route({
  path: "/modal/gif-complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { externalJobId, success, error } = body as {
        externalJobId: string;
        success: boolean;
        error?: string;
      };

      if (!externalJobId) {
        return new Response(JSON.stringify({ error: "Missing externalJobId" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Mark GIF job as complete
      await ctx.runMutation(internal.gifGenerator.completeGifJob, {
        externalJobId,
        success,
        errorMessage: error || undefined,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Modal GIF complete webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// =============================================================================
// YOUTUBE → R2 DOWNLOAD WEBHOOKS (Unified Architecture)
// =============================================================================

/**
 * GIF job YouTube download to R2 complete webhook
 * POST /modal/gif-youtube-download-complete
 * Body: { job_id, success, r2_source_key?, video_title?, video_duration?, error?, error_stage?, webhook_secret? }
 *
 * Called by Modal after YouTube video for GIF generation has been uploaded to R2.
 * On success: Updates GIF job with r2SourceKey and triggers R2-based GIF processing.
 * On failure: Marks GIF job as failed.
 */
http.route({
  path: "/modal/gif-youtube-download-complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const {
        job_id,
        success,
        r2_source_key,
        video_title,
        video_duration,
        error,
        error_stage,
      } = body as {
        job_id: string;
        success: boolean;
        r2_source_key?: string;
        video_title?: string;
        video_duration?: number;
        error?: string;
        error_stage?: string;
      };

      if (!job_id) {
        return new Response(JSON.stringify({ error: "Missing job_id" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      console.log(`GIF YouTube download complete webhook: job=${job_id}, success=${success}`);

      if (success && r2_source_key) {
        // Download succeeded - update job and trigger GIF processing
        await ctx.runMutation(internal.gifGenerator.markGifDownloadComplete, {
          jobId: job_id as Id<"gif_generation_jobs">,
          r2SourceKey: r2_source_key,
          videoTitle: video_title,
          videoDuration: video_duration,
        });

        return new Response(JSON.stringify({
          success: true,
          message: "GIF download complete, processing triggered",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } else {
        // Download failed - mark GIF job as failed
        await ctx.runMutation(internal.gifGenerator.updateGifJobStatus, {
          jobId: job_id as Id<"gif_generation_jobs">,
          status: "failed",
          errorMessage: error || "YouTube download failed",
        });

        return new Response(JSON.stringify({
          success: true,
          message: "GIF job marked as failed",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      console.error("GIF YouTube download complete webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Meme job YouTube download to R2 complete webhook
 * POST /modal/meme-youtube-download-complete
 * Body: { job_id, success, r2_source_key?, video_title?, video_duration?, error?, error_stage?, webhook_secret? }
 *
 * Called by Modal after YouTube video for meme generation has been uploaded to R2.
 * On success: Updates meme job with r2SourceKey and triggers R2-based meme processing.
 * On failure: Marks meme job as failed.
 */
http.route({
  path: "/modal/meme-youtube-download-complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const {
        job_id,
        success,
        r2_source_key,
        video_title,
        video_duration,
        error,
        error_stage,
      } = body as {
        job_id: string;
        success: boolean;
        r2_source_key?: string;
        video_title?: string;
        video_duration?: number;
        error?: string;
        error_stage?: string;
      };

      if (!job_id) {
        return new Response(JSON.stringify({ error: "Missing job_id" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      console.log(`Meme YouTube download complete webhook: job=${job_id}, success=${success}`);

      if (success && r2_source_key) {
        // Download succeeded - update job and trigger meme processing
        await ctx.runMutation(internal.memeGenerator.markMemeDownloadComplete, {
          jobId: job_id as Id<"meme_generation_jobs">,
          r2SourceKey: r2_source_key,
          videoTitle: video_title,
          videoDuration: video_duration,
        });

        return new Response(JSON.stringify({
          success: true,
          message: "Meme download complete, processing triggered",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } else {
        // Download failed - mark meme job as failed
        await ctx.runMutation(internal.memeGenerator.updateMemeJobStatus, {
          jobId: job_id as Id<"meme_generation_jobs">,
          status: "failed",
          errorMessage: error || "YouTube download failed",
        });

        return new Response(JSON.stringify({
          success: true,
          message: "Meme job marked as failed",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      console.error("Meme YouTube download complete webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * YouTube download to R2 complete webhook
 * POST /modal/youtube-download-complete
 * Body: { job_id, success, r2_source_key?, video_title?, video_duration?, error?, error_stage?, webhook_secret? }
 *
 * Called by Modal after YouTube video has been downloaded and uploaded to R2.
 * On success: Updates job with r2SourceKey and triggers R2 processing.
 * On failure: Marks job as failed.
 */
http.route({
  path: "/modal/youtube-download-complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyWebhookAuth(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const {
        job_id,
        success,
        r2_source_key,
        video_title,
        video_duration,
        error,
        error_stage,
      } = body as {
        job_id: string;
        success: boolean;
        r2_source_key?: string;
        video_title?: string;
        video_duration?: number;
        error?: string;
        error_stage?: string;
      };

      if (!job_id) {
        return new Response(JSON.stringify({ error: "Missing job_id" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      console.log(`YouTube download complete webhook: job=${job_id}, success=${success}`);

      if (success && r2_source_key) {
        // Download succeeded - update job and trigger processing
        await ctx.runMutation(internal.processing.markYouTubeDownloadComplete, {
          jobId: job_id as Id<"processing_jobs">,
          r2SourceKey: r2_source_key,
          videoTitle: video_title,
          videoDuration: video_duration,
        });

        return new Response(JSON.stringify({
          success: true,
          message: "Download complete, processing triggered",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } else {
        // Download failed - mark job as failed
        await ctx.runMutation(internal.processing.markYouTubeDownloadFailed, {
          jobId: job_id as Id<"processing_jobs">,
          error: error || "YouTube download failed",
          errorStage: error_stage || "download",
        });

        return new Response(JSON.stringify({
          success: true,
          message: "Job marked as failed",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      console.error("YouTube download complete webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// =============================================================================
// EMAIL CAMPAIGN WEBHOOKS (Resend)
// =============================================================================

/**
 * Verify Resend/Svix webhook signature
 * Resend uses Svix for webhooks - signature is in svix-signature header
 */
async function verifyResendWebhook(
  payload: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  const svixId = headers.get("svix-id");
  const svixTimestamp = headers.get("svix-timestamp");
  const svixSignature = headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.warn("Missing Svix headers for webhook verification");
    return false;
  }

  // Check timestamp is within 5 minutes to prevent replay attacks
  const timestamp = parseInt(svixTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    console.warn("Webhook timestamp too old or in future");
    return false;
  }

  // Construct the signed payload
  const signedPayload = `${svixId}.${svixTimestamp}.${payload}`;

  // The secret from Resend starts with "whsec_" - we need to decode it
  const secretBytes = secret.startsWith("whsec_")
    ? Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(secret);

  // Import the key for HMAC
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Sign the payload
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload)
  );

  // Convert to base64
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));

  // The signature header contains multiple signatures separated by space
  // Each signature is in format "v1,<base64>"
  const signatures = svixSignature.split(" ");
  for (const sig of signatures) {
    const [version, signature] = sig.split(",");
    if (version === "v1" && signature === expectedSignature) {
      return true;
    }
  }

  console.warn("Webhook signature verification failed");
  return false;
}

/**
 * Resend webhook for email events (delivery, open, click, bounce, etc.)
 * POST /resend/webhook
 * Docs: https://resend.com/docs/dashboard/webhooks/event-types
 *
 * Setup instructions:
 * 1. Go to Resend Dashboard > Webhooks
 * 2. Add endpoint: https://your-convex-deployment.convex.site/resend/webhook
 * 3. Select events: email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.complained
 * 4. Copy the signing secret and set RESEND_WEBHOOK_SECRET env var
 */
http.route({
  path: "/resend/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

    // Get raw body for signature verification
    const rawBody = await request.text();

    // Verify signature if secret is configured
    if (webhookSecret) {
      const isValid = await verifyResendWebhook(rawBody, request.headers, webhookSecret);
      if (!isValid) {
        console.error("Resend webhook signature verification failed");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("RESEND_WEBHOOK_SECRET not configured - skipping signature verification");
    }

    try {
      const body = JSON.parse(rawBody);
      const { type, data } = body as {
        type: string;
        data: {
          email_id?: string;
          created_at?: string;
          to?: string[];
          from?: string;
          subject?: string;
          click?: { link?: string };
          bounce?: { type?: string };
        };
      };

      console.log(`Resend webhook: type=${type}, email_id=${data.email_id}`);

      if (!data.email_id) {
        return new Response(JSON.stringify({ success: true, message: "No email_id, ignoring" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Map Resend event types to our internal types
      const eventTypeMap: Record<string, string> = {
        "email.sent": "sent",
        "email.delivered": "delivered",
        "email.opened": "opened",
        "email.clicked": "clicked",
        "email.bounced": "bounced",
        "email.complained": "complained",
        "email.delivery_delayed": "delivery_delayed",
      };

      const eventType = eventTypeMap[type];
      if (!eventType) {
        console.log(`Unknown Resend event type: ${type}`);
        return new Response(JSON.stringify({ success: true, message: "Unknown event type" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Find the recipient by Resend email ID
      const recipientInfo = await ctx.runMutation(internal.campaignMetrics.findRecipientByResendId, {
        resendEmailId: data.email_id,
      });

      if (recipientInfo) {
        // Record the event
        await ctx.runMutation(internal.campaignMetrics.recordCampaignEvent, {
          campaignId: recipientInfo.campaignId,
          recipientId: recipientInfo.recipientId,
          eventType,
          clickUrl: data.click?.link,
          occurredAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
          metadata: {
            bounce_type: data.bounce?.type,
            to: data.to,
            from: data.from,
            subject: data.subject,
          },
        });

        console.log(`Recorded ${eventType} event for campaign ${recipientInfo.campaignId}`);
      } else {
        console.log(`No recipient found for Resend email_id: ${data.email_id}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Resend webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Unsubscribe endpoint - handles one-click unsubscribe from email
 * GET /unsubscribe?token=xxx
 */
http.route({
  path: "/unsubscribe",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const token = url.searchParams.get("token");

      if (!token) {
        return new Response(
          `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Unsubscribe</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background: #0c0911; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .container { text-align: center; padding: 40px; max-width: 400px; }
    h1 { color: #f53c56; }
    a { color: #f53c56; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Invalid Link</h1>
    <p>This unsubscribe link is invalid or has expired.</p>
    <p><a href="https://flmlnk.com">Return to Flmlnk</a></p>
  </div>
</body>
</html>`,
          {
            status: 400,
            headers: { "Content-Type": "text/html" },
          }
        );
      }

      // Process unsubscribe
      try {
        await ctx.runMutation(internal.audienceManagement.unsubscribeByToken, { token });

        return new Response(
          `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Unsubscribed</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background: #0c0911; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .container { text-align: center; padding: 40px; max-width: 400px; }
    h1 { color: #22c55e; }
    a { color: #f53c56; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Successfully Unsubscribed</h1>
    <p>You have been unsubscribed from future emails.</p>
    <p>We're sorry to see you go!</p>
    <p><a href="https://flmlnk.com">Return to Flmlnk</a></p>
  </div>
</body>
</html>`,
          {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }
        );
      } catch (error) {
        return new Response(
          `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Error</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background: #0c0911; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .container { text-align: center; padding: 40px; max-width: 400px; }
    h1 { color: #f53c56; }
    a { color: #f53c56; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Something went wrong</h1>
    <p>We couldn't process your unsubscribe request. Please try again or contact support.</p>
    <p><a href="https://flmlnk.com">Return to Flmlnk</a></p>
  </div>
</body>
</html>`,
          {
            status: 500,
            headers: { "Content-Type": "text/html" },
          }
        );
      }
    } catch (err) {
      console.error("Unsubscribe error:", err);
      return new Response("Internal server error", { status: 500 });
    }
  }),
});

/**
 * One-click unsubscribe POST handler (for List-Unsubscribe-Post header)
 * POST /unsubscribe?token=xxx
 */
http.route({
  path: "/unsubscribe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const token = url.searchParams.get("token");

      if (!token) {
        return new Response(JSON.stringify({ error: "Missing token" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      await ctx.runMutation(internal.audienceManagement.unsubscribeByToken, { token });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("One-click unsubscribe error:", err);
      return new Response(JSON.stringify({ error: "Unsubscribe failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;
