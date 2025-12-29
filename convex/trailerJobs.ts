/**
 * Trailer generation job management.
 * Handles job lifecycle, claiming, and status transitions.
 */

import { v } from "convex/values";
import {
  QueryCtx,
  MutationCtx,
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";

// ============================================
// STATUS ENUM
// ============================================

export const TRAILER_STATUS = {
  // Ingest phase
  CREATED: "CREATED",
  UPLOADING: "UPLOADING",
  UPLOADED: "UPLOADED",

  // Analysis phase
  CLAIMED: "CLAIMED", // Modal worker has locked the job
  PROXY_GENERATING: "PROXY_GENERATING",
  TRANSCRIBING: "TRANSCRIBING",
  SCENE_DETECTING: "SCENE_DETECTING",
  CLASSIFYING_EARLY: "CLASSIFYING_EARLY", // Early film identity classification (first 60s)
  ANALYZING: "ANALYZING", // Additional AI passes (scene scoring, dialogue selection)
  CLASSIFYING_FULL: "CLASSIFYING_FULL", // Full film identity classification
  ANALYSIS_READY: "ANALYSIS_READY", // Scene map + transcript + identity complete

  // Synthesis phase (can re-run without re-analyzing)
  PLANNING: "PLANNING", // GPT-4o generating timestamp plan
  PLAN_READY: "PLAN_READY", // Ready for render or user review

  // Audio phase (optional, for profiles with music)
  AUDIO_PLANNING: "AUDIO_PLANNING", // Analyzing for rise/impact points
  MUSIC_GENERATING: "MUSIC_GENERATING", // ElevenLabs music generation
  SFX_GENERATING: "SFX_GENERATING", // ElevenLabs SFX (impacts, risers, whooshes)
  TITLE_CARDS: "TITLE_CARDS", // Generating designed title card clips with dark backgrounds
  VO_GENERATING: "VO_GENERATING", // ElevenLabs TTS voiceover generation (if enabled by genre)
  AUDIO_READY: "AUDIO_READY", // Music and SFX generated and ready
  MIXING: "MIXING", // Mixing dialogue + music + SFX layers

  // Render phase
  RENDERING: "RENDERING",
  POLISHING: "POLISHING", // Applying film grain, letterbox, color grade
  UPLOADING_OUTPUTS: "UPLOADING_OUTPUTS",

  // Terminal states
  READY: "READY",
  FAILED: "FAILED",
} as const;

export type TrailerStatus = (typeof TRAILER_STATUS)[keyof typeof TRAILER_STATUS];

// ============================================
// CONCURRENCY LIMITS
// ============================================

export const LIMITS = {
  // Max concurrent render jobs downloading masters per user
  maxConcurrentRenderPerUser: 2,

  // Max concurrent analysis jobs per worker
  maxConcurrentAnalysisPerWorker: 4,

  // Max total active render downloads across all users
  maxGlobalRenderDownloads: 10,
} as const;

// ============================================
// HELPERS
// ============================================

async function getUserFromIdentity(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
    .unique();

  if (!user) {
    throw new Error("User not found");
  }

  return user._id;
}

// ============================================
// QUERIES
// ============================================

/**
 * Get a trailer job by ID (for authenticated user)
 */
export const getTrailerJob = query({
  args: { jobId: v.id("trailer_jobs") },
  handler: async (ctx, args) => {
    const userId = await getUserFromIdentity(ctx);
    const job = await ctx.db.get(args.jobId);

    if (!job || job.userId !== userId) return null;
    return job;
  },
});

/**
 * List trailer jobs for the current user (includes first clip thumbnail for display)
 */
export const listTrailerJobs = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserFromIdentity(ctx);

    let jobs: Doc<"trailer_jobs">[];

    if (args.status) {
      jobs = await ctx.db
        .query("trailer_jobs")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", userId).eq("status", args.status!)
        )
        .collect();
    } else {
      jobs = await ctx.db
        .query("trailer_jobs")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
    }

    // Sort by createdAt descending
    jobs = jobs.sort((a, b) => b.createdAt - a.createdAt);

    if (args.limit) {
      jobs = jobs.slice(0, args.limit);
    }

    // For completed jobs, fetch the first clip to get thumbnail info
    const jobsWithThumbnails = await Promise.all(
      jobs.map(async (job) => {
        if (job.status === "READY") {
          // Get first clip (prefer 16:9 variant)
          const clips = await ctx.db
            .query("trailer_clips")
            .withIndex("by_trailerJob", (q) => q.eq("trailerJobId", job._id))
            .collect();

          const preferredClip = clips.find((c) => c.variantKey?.includes("16x9")) || clips[0];

          return {
            ...job,
            thumbnailR2Key: preferredClip?.r2ThumbKey || null,
            clipCount: clips.length,
          };
        }
        return {
          ...job,
          thumbnailR2Key: null,
          clipCount: 0,
        };
      })
    );

    return jobsWithThumbnails;
  },
});

/**
 * Get job with all related data (scene map, plan, clips)
 */
export const getTrailerJobWithDetails = query({
  args: { jobId: v.id("trailer_jobs") },
  handler: async (ctx, args) => {
    const userId = await getUserFromIdentity(ctx);
    const job = await ctx.db.get(args.jobId);

    if (!job || job.userId !== userId) return null;

    // Fetch related data
    const [sceneMap, timestampPlan, profile, clips] = await Promise.all([
      job.sceneMapId ? ctx.db.get(job.sceneMapId) : null,
      job.timestampPlanId ? ctx.db.get(job.timestampPlanId) : null,
      job.selectedProfileId ? ctx.db.get(job.selectedProfileId) : null,
      ctx.db
        .query("trailer_clips")
        .withIndex("by_trailerJob", (q) => q.eq("trailerJobId", args.jobId))
        .collect(),
    ]);

    return {
      job,
      sceneMap,
      timestampPlan,
      profile,
      clips,
    };
  },
});

// ============================================
// INTERNAL QUERIES (for Modal workers)
// ============================================

/**
 * List jobs pending processing (for Modal polling)
 */
export const listPendingJobs = internalQuery({
  args: {
    status: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let jobs = await ctx.db
      .query("trailer_jobs")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();

    // Sort by createdAt ascending (oldest first)
    jobs = jobs.sort((a, b) => a.createdAt - b.createdAt);

    if (args.limit) {
      jobs = jobs.slice(0, args.limit);
    }

    return jobs;
  },
});

/**
 * Get job by ID (internal, no auth check)
 */
export const getTrailerJobInternal = internalQuery({
  args: { jobId: v.id("trailer_jobs") },
  handler: async (ctx, args) => ctx.db.get(args.jobId),
});

/**
 * Count active render jobs for a user (for concurrency limiting)
 */
export const countActiveRenderJobsForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const renderingJobs = await ctx.db
      .query("trailer_jobs")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", TRAILER_STATUS.RENDERING)
      )
      .collect();

    const uploadingJobs = await ctx.db
      .query("trailer_jobs")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", TRAILER_STATUS.UPLOADING_OUTPUTS)
      )
      .collect();

    return renderingJobs.length + uploadingJobs.length;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new trailer job from an existing video_job
 */
export const createTrailerJob = mutation({
  args: {
    videoJobId: v.id("video_jobs"),
    profileId: v.optional(v.id("trailer_profiles")),
  },
  handler: async (ctx, args) => {
    const userId = await getUserFromIdentity(ctx);

    // Verify video job exists and belongs to user
    const videoJob = await ctx.db.get(args.videoJobId);
    if (!videoJob || videoJob.userId !== userId) {
      throw new Error("Video job not found");
    }

    // Verify video is uploaded
    if (videoJob.status !== "UPLOADED" && videoJob.status !== "READY") {
      throw new Error("Video must be uploaded before creating trailer job");
    }

    const now = Date.now();

    const jobId = await ctx.db.insert("trailer_jobs", {
      videoJobId: args.videoJobId,
      userId,
      status: TRAILER_STATUS.CREATED,
      selectedProfileId: args.profileId,
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return jobId;
  },
});

/**
 * Select a profile for an existing trailer job
 */
export const selectProfile = mutation({
  args: {
    jobId: v.id("trailer_jobs"),
    profileId: v.id("trailer_profiles"),
  },
  handler: async (ctx, args) => {
    const userId = await getUserFromIdentity(ctx);
    const job = await ctx.db.get(args.jobId);

    if (!job || job.userId !== userId) {
      throw new Error("Job not found");
    }

    // Can only change profile before rendering starts
    if (
      job.status === TRAILER_STATUS.RENDERING ||
      job.status === TRAILER_STATUS.UPLOADING_OUTPUTS ||
      job.status === TRAILER_STATUS.READY
    ) {
      throw new Error("Cannot change profile after rendering starts");
    }

    await ctx.db.patch(args.jobId, {
      selectedProfileId: args.profileId,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Start processing a trailer job (user-initiated)
 */
export const startProcessing = mutation({
  args: { jobId: v.id("trailer_jobs") },
  handler: async (ctx, args) => {
    const userId = await getUserFromIdentity(ctx);
    const job = await ctx.db.get(args.jobId);

    if (!job || job.userId !== userId) {
      throw new Error("Job not found");
    }

    if (job.status !== TRAILER_STATUS.CREATED) {
      throw new Error(`Cannot start processing from status ${job.status}`);
    }

    await ctx.db.patch(args.jobId, {
      status: TRAILER_STATUS.UPLOADED, // Ready for Modal to pick up
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Regenerate plan from existing analysis (skip re-analysis)
 */
export const regeneratePlan = mutation({
  args: {
    jobId: v.id("trailer_jobs"),
    profileId: v.optional(v.id("trailer_profiles")),
  },
  handler: async (ctx, args) => {
    const userId = await getUserFromIdentity(ctx);
    const job = await ctx.db.get(args.jobId);

    if (!job || job.userId !== userId) {
      throw new Error("Job not found");
    }

    // Can only regenerate if analysis is complete
    if (
      job.status !== TRAILER_STATUS.ANALYSIS_READY &&
      job.status !== TRAILER_STATUS.PLAN_READY &&
      job.status !== TRAILER_STATUS.READY
    ) {
      throw new Error("Analysis must be complete before regenerating plan");
    }

    const updates: Partial<Doc<"trailer_jobs">> = {
      status: TRAILER_STATUS.ANALYSIS_READY, // Reset to trigger planning
      timestampPlanId: undefined, // Clear existing plan
      clipIds: undefined, // Clear existing clips
      updatedAt: Date.now(),
    };

    if (args.profileId) {
      updates.selectedProfileId = args.profileId;
    }

    await ctx.db.patch(args.jobId, updates);

    return { success: true };
  },
});

// ============================================
// INTERNAL MUTATIONS (for Modal workers)
// ============================================

/**
 * Claim a job for processing (idempotent locking)
 */
export const claimJob = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    workerId: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return { claimed: false, reason: "Job not found" };

    // Check if already claimed by another worker
    if (
      job.processingLockId &&
      job.processingLockId !== args.workerId &&
      job.status !== TRAILER_STATUS.UPLOADED &&
      job.status !== TRAILER_STATUS.ANALYSIS_READY
    ) {
      return { claimed: false, reason: "Already claimed by another worker" };
    }

    // Check if in claimable state
    const claimableStatuses: TrailerStatus[] = [
      TRAILER_STATUS.UPLOADED,
      TRAILER_STATUS.ANALYSIS_READY,
    ];
    if (!claimableStatuses.includes(job.status as TrailerStatus)) {
      return { claimed: false, reason: `Invalid status: ${job.status}` };
    }

    // For render jobs, check concurrency limits
    if (job.status === TRAILER_STATUS.ANALYSIS_READY) {
      const activeRenderCount = await ctx.db
        .query("trailer_jobs")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", job.userId).eq("status", TRAILER_STATUS.RENDERING)
        )
        .collect();

      if (activeRenderCount.length >= LIMITS.maxConcurrentRenderPerUser) {
        return { claimed: false, reason: "User has too many active render jobs" };
      }
    }

    // Claim the job
    const newStatus =
      job.status === TRAILER_STATUS.UPLOADED
        ? TRAILER_STATUS.CLAIMED
        : TRAILER_STATUS.PLANNING;

    await ctx.db.patch(args.jobId, {
      processingLockId: args.workerId,
      status: newStatus,
      attemptCount: (job.attemptCount || 0) + 1,
      updatedAt: Date.now(),
    });

    return { claimed: true, previousStatus: job.status };
  },
});

/**
 * Update job status (for progress tracking)
 */
export const updateJobStatus = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    status: v.string(),
    progress: v.optional(v.number()),
    currentStep: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Partial<Doc<"trailer_jobs">> = {
      status: args.status,
      updatedAt: Date.now(),
    };

    if (args.progress !== undefined) {
      updates.progress = args.progress;
    }
    if (args.currentStep !== undefined) {
      updates.currentStep = args.currentStep;
    }

    await ctx.db.patch(args.jobId, updates);
  },
});

/**
 * Set proxy R2 key after generation
 */
export const setProxyKey = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    proxyR2Key: v.string(),
    proxySpecHash: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      proxyR2Key: args.proxyR2Key,
      proxySpecHash: args.proxySpecHash,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Set transcription ID after transcription
 */
export const setTranscriptionId = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    transcriptionId: v.id("transcriptions"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      transcriptionId: args.transcriptionId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Create scene map and link to job
 */
export const createSceneMap = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    scenes: v.array(
      v.object({
        sceneIndex: v.number(),
        startTime: v.number(),
        endTime: v.number(),
        duration: v.number(),
        keyframeTimestamps: v.array(v.number()),
        avgMotionIntensity: v.optional(v.number()),
        avgAudioIntensity: v.optional(v.number()),
        hasFaces: v.optional(v.boolean()),
        hasDialogue: v.optional(v.boolean()),
        dominantColors: v.optional(v.array(v.string())),
        summary: v.optional(v.string()),
        mood: v.optional(v.string()),
        importance: v.optional(v.number()),
      })
    ),
    totalScenes: v.number(),
    avgSceneDuration: v.number(),
    peakIntensityTimestamps: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const sceneMapId = await ctx.db.insert("trailer_scene_maps", {
      trailerJobId: args.jobId,
      scenes: args.scenes,
      totalScenes: args.totalScenes,
      avgSceneDuration: args.avgSceneDuration,
      peakIntensityTimestamps: args.peakIntensityTimestamps,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.jobId, {
      sceneMapId,
      status: TRAILER_STATUS.ANALYSIS_READY,
      updatedAt: Date.now(),
    });

    return sceneMapId;
  },
});

/**
 * Create timestamp plan and link to job
 */
export const createTimestampPlan = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    profileId: v.id("trailer_profiles"),
    clips: v.array(
      v.object({
        clipIndex: v.number(),
        sourceStart: v.number(),
        sourceEnd: v.number(),
        targetStart: v.number(),
        targetEnd: v.number(),
        purpose: v.optional(v.string()),
        transitionIn: v.optional(v.string()),
        transitionOut: v.optional(v.string()),
        audioTreatment: v.optional(v.string()),
      })
    ),
    source: v.string(),
    targetDurationSec: v.number(),
    actualDurationSec: v.optional(v.number()),
    aiReasoning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Truncate reasoning for summary
    const aiReasoningSummary = args.aiReasoning
      ? args.aiReasoning.slice(0, 500) + (args.aiReasoning.length > 500 ? "..." : "")
      : undefined;

    const planId = await ctx.db.insert("trailer_timestamp_plans", {
      trailerJobId: args.jobId,
      profileId: args.profileId,
      clips: args.clips,
      source: args.source,
      targetDurationSec: args.targetDurationSec,
      actualDurationSec: args.actualDurationSec,
      aiReasoning: args.aiReasoning,
      aiReasoningSummary,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.jobId, {
      timestampPlanId: planId,
      status: TRAILER_STATUS.PLAN_READY,
      updatedAt: Date.now(),
    });

    return planId;
  },
});

/**
 * Create text card plan for cinematic title cards
 */
export const createTextCardPlan = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    profileId: v.id("trailer_profiles"),
    cards: v.array(
      v.object({
        cardIndex: v.number(),
        atSec: v.number(),
        durationSec: v.number(),
        text: v.string(),
        style: v.string(),
        motion: v.string(),
        fontSize: v.optional(v.number()),
        position: v.optional(v.string()),
        purpose: v.optional(v.string()), // "hook", "stakes", "button", etc.
      })
    ),
    aiReasoning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const planId = await ctx.db.insert("trailer_text_card_plans", {
      trailerJobId: args.jobId,
      profileId: args.profileId,
      cards: args.cards,
      aiReasoning: args.aiReasoning,
      createdAt: Date.now(),
    });

    // Link text card plan to job
    await ctx.db.patch(args.jobId, {
      textCardPlanId: planId,
      updatedAt: Date.now(),
    });

    return planId;
  },
});

/**
 * Create audio plan for AI-generated music and mixing
 */
export const createAudioPlan = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    profileId: v.id("trailer_profiles"),
    trailerDurationSec: v.number(),
    risePoints: v.array(v.number()),
    impactPoints: v.array(v.number()),
    dialogueWindows: v.array(
      v.object({
        startSec: v.number(),
        endSec: v.number(),
        importance: v.number(),
      })
    ),
    musicPrompt: v.string(),
    musicStyle: v.string(),
    musicBpm: v.optional(v.number()),
    targetLufs: v.number(),
    dialogueLevelDb: v.number(),
    musicLevelDb: v.number(),
  },
  handler: async (ctx, args) => {
    const planId = await ctx.db.insert("trailer_audio_plans", {
      trailerJobId: args.jobId,
      profileId: args.profileId,
      trailerDurationSec: args.trailerDurationSec,
      risePoints: args.risePoints,
      impactPoints: args.impactPoints,
      dialogueWindows: args.dialogueWindows,
      musicPrompt: args.musicPrompt,
      musicStyle: args.musicStyle,
      musicBpm: args.musicBpm,
      targetLufs: args.targetLufs,
      dialogueLevelDb: args.dialogueLevelDb,
      musicLevelDb: args.musicLevelDb,
      createdAt: Date.now(),
    });

    // Link audio plan to job and update status
    await ctx.db.patch(args.jobId, {
      audioPlanId: planId,
      status: TRAILER_STATUS.AUDIO_PLANNING,
      updatedAt: Date.now(),
    });

    return planId;
  },
});

/**
 * Create film identity classification result
 */
export const createFilmIdentity = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    primaryGenre: v.string(),
    secondaryGenres: v.array(v.string()),
    tone: v.string(),
    themes: v.array(v.string()),
    message: v.optional(v.string()),
    archetype: v.optional(v.string()),
    spoilerSensitivity: v.number(),
    confidence: v.number(),
    evidence: v.array(
      v.object({
        type: v.string(),
        timestamp: v.optional(v.number()),
        note: v.string(),
        signalStrength: v.number(),
      })
    ),
    classificationStage: v.string(),
    extractedSignals: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Check if there's already an identity for this job
    const existing = await ctx.db
      .query("trailer_film_identities")
      .withIndex("by_trailerJob", (q) => q.eq("trailerJobId", args.jobId))
      .first();

    if (existing) {
      // Update existing identity
      await ctx.db.patch(existing._id, {
        primaryGenre: args.primaryGenre,
        secondaryGenres: args.secondaryGenres,
        tone: args.tone,
        themes: args.themes,
        message: args.message,
        archetype: args.archetype,
        spoilerSensitivity: args.spoilerSensitivity,
        confidence: args.confidence,
        evidence: args.evidence,
        classificationStage: args.classificationStage,
        extractedSignals: args.extractedSignals
          ? {
              transcriptSignals: args.extractedSignals.transcript,
              visualSignals: args.extractedSignals.visual,
              audioSignals: args.extractedSignals.audio,
              structuralSignals: args.extractedSignals.structural,
            }
          : undefined,
        updatedAt: Date.now(),
      });

      return existing._id;
    }

    // Create new identity
    const identityId = await ctx.db.insert("trailer_film_identities", {
      trailerJobId: args.jobId,
      primaryGenre: args.primaryGenre,
      secondaryGenres: args.secondaryGenres,
      tone: args.tone,
      themes: args.themes,
      message: args.message,
      archetype: args.archetype,
      spoilerSensitivity: args.spoilerSensitivity,
      confidence: args.confidence,
      evidence: args.evidence,
      classificationStage: args.classificationStage,
      extractedSignals: args.extractedSignals
        ? {
            transcriptSignals: args.extractedSignals.transcript,
            visualSignals: args.extractedSignals.visual,
            audioSignals: args.extractedSignals.audio,
            structuralSignals: args.extractedSignals.structural,
          }
        : undefined,
      createdAt: Date.now(),
    });

    // Link to job
    await ctx.db.patch(args.jobId, {
      filmIdentityId: identityId,
      updatedAt: Date.now(),
    });

    return identityId;
  },
});

/**
 * Create or update narration plan for a trailer job
 */
export const createNarrationPlan = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    profileId: v.optional(v.id("trailer_profiles")),
    narrationEnabled: v.boolean(),
    policyReason: v.string(),
    template: v.string(),
    voicePersona: v.string(),
    script: v.array(
      v.object({
        lineIndex: v.number(),
        text: v.string(),
        startSec: v.number(),
        endSec: v.number(),
        purpose: v.string(),
      })
    ),
    timingAnchors: v.array(
      v.object({
        anchorType: v.string(),
        atSec: v.number(),
        description: v.string(),
      })
    ),
    totalVoDuration: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if there's already a narration plan for this job
    const existing = await ctx.db
      .query("trailer_narration_plans")
      .withIndex("by_trailerJob", (q) => q.eq("trailerJobId", args.jobId))
      .first();

    if (existing) {
      // Update existing plan
      await ctx.db.patch(existing._id, {
        profileId: args.profileId,
        narrationEnabled: args.narrationEnabled,
        policyReason: args.policyReason,
        template: args.template,
        voicePersona: args.voicePersona,
        script: args.script,
        timingAnchors: args.timingAnchors,
        totalVoDuration: args.totalVoDuration,
      });

      return existing._id;
    }

    // Create new narration plan
    const planId = await ctx.db.insert("trailer_narration_plans", {
      trailerJobId: args.jobId,
      profileId: args.profileId,
      narrationEnabled: args.narrationEnabled,
      policyReason: args.policyReason,
      template: args.template,
      voicePersona: args.voicePersona,
      script: args.script,
      timingAnchors: args.timingAnchors,
      totalVoDuration: args.totalVoDuration,
      createdAt: Date.now(),
    });

    // Link to job
    await ctx.db.patch(args.jobId, {
      narrationPlanId: planId,
      updatedAt: Date.now(),
    });

    return planId;
  },
});

/**
 * Update narration plan with generated VO audio
 */
export const updateNarrationPlanAudio = internalMutation({
  args: {
    planId: v.id("trailer_narration_plans"),
    audioR2Key: v.string(),
    audioDurationSec: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.planId, {
      audioR2Key: args.audioR2Key,
      audioDurationSec: args.audioDurationSec,
    });
  },
});

/**
 * Update audio plan with generated music info
 */
export const updateAudioPlanMusic = internalMutation({
  args: {
    planId: v.id("trailer_audio_plans"),
    musicR2Key: v.string(),
    musicDurationSec: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.planId, {
      musicR2Key: args.musicR2Key,
      musicDurationSec: args.musicDurationSec,
    });

    // Get the associated job and update status
    const plan = await ctx.db.get(args.planId);
    if (plan) {
      await ctx.db.patch(plan.trailerJobId, {
        status: TRAILER_STATUS.AUDIO_READY,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Update audio plan with SFX placements and generated assets
 */
export const updateAudioPlanSfx = internalMutation({
  args: {
    planId: v.id("trailer_audio_plans"),
    sfxPlacements: v.array(
      v.object({
        sfxIndex: v.number(),
        atSec: v.number(),
        type: v.string(),
        intensity: v.number(),
        durationSec: v.optional(v.number()),
        r2Key: v.optional(v.string()),
      })
    ),
    sfxLevelDb: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.planId, {
      sfxPlacements: args.sfxPlacements,
      sfxLevelDb: args.sfxLevelDb,
    });
  },
});

/**
 * Create rendered trailer clip
 */
export const createTrailerClip = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    timestampPlanId: v.id("trailer_timestamp_plans"),
    userId: v.id("users"),
    profileKey: v.string(),
    variantKey: v.string(),
    title: v.optional(v.string()),
    duration: v.number(),
    width: v.number(),
    height: v.number(),
    fileSize: v.optional(v.number()),
    r2Key: v.string(),
    r2ThumbKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clipId = await ctx.db.insert("trailer_clips", {
      trailerJobId: args.jobId,
      timestampPlanId: args.timestampPlanId,
      userId: args.userId,
      profileKey: args.profileKey,
      variantKey: args.variantKey,
      title: args.title,
      duration: args.duration,
      width: args.width,
      height: args.height,
      fileSize: args.fileSize,
      r2Key: args.r2Key,
      r2ThumbKey: args.r2ThumbKey,
      status: "ready",
      createdAt: Date.now(),
    });

    // Add clip to job's clipIds array
    const job = await ctx.db.get(args.jobId);
    if (job) {
      const clipIds = job.clipIds || [];
      clipIds.push(clipId);
      await ctx.db.patch(args.jobId, {
        clipIds,
        updatedAt: Date.now(),
      });
    }

    return clipId;
  },
});

/**
 * Mark job as complete
 */
export const completeJob = internalMutation({
  args: { jobId: v.id("trailer_jobs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: TRAILER_STATUS.READY,
      processingLockId: undefined,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Mark job as failed
 */
export const failJob = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    error: v.string(),
    errorStage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: TRAILER_STATUS.FAILED,
      error: args.error,
      errorStage: args.errorStage,
      processingLockId: undefined,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Release lock without changing status (for graceful worker shutdown)
 */
export const releaseLock = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    workerId: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return { released: false };

    // Only release if this worker owns the lock
    if (job.processingLockId !== args.workerId) {
      return { released: false, reason: "Lock owned by different worker" };
    }

    // Reset to previous claimable state
    const resetStatus =
      job.sceneMapId ? TRAILER_STATUS.ANALYSIS_READY : TRAILER_STATUS.UPLOADED;

    await ctx.db.patch(args.jobId, {
      processingLockId: undefined,
      status: resetStatus,
      updatedAt: Date.now(),
    });

    return { released: true };
  },
});

// ============================================
// HTTP ACTIONS (for Modal workers via HTTP API)
// ============================================

import { action } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Verify webhook secret for Modal authentication
 */
function verifyWebhookSecret(providedSecret: string | undefined): void {
  const expectedSecret = process.env.MODAL_WEBHOOK_SECRET;
  if (expectedSecret && providedSecret !== expectedSecret) {
    throw new Error("Invalid webhook secret");
  }
}

/**
 * HTTP action to claim a trailer job
 */
export const httpClaimJob = action({
  args: {
    jobId: v.string(),
    workerId: v.string(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ claimed: boolean; reason?: string; previousStatus?: string }> => {
    verifyWebhookSecret(args.webhookSecret);

    return ctx.runMutation(internal.trailerJobs.claimJob, {
      jobId: args.jobId as Id<"trailer_jobs">,
      workerId: args.workerId,
    });
  },
});

/**
 * HTTP action to update job status
 */
export const httpUpdateStatus = action({
  args: {
    jobId: v.string(),
    status: v.string(),
    progress: v.optional(v.number()),
    currentStep: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    verifyWebhookSecret(args.webhookSecret);

    await ctx.runMutation(internal.trailerJobs.updateJobStatus, {
      jobId: args.jobId as Id<"trailer_jobs">,
      status: args.status,
      progress: args.progress,
      currentStep: args.currentStep,
    });
  },
});

/**
 * HTTP action to set proxy key
 */
export const httpSetProxyKey = action({
  args: {
    jobId: v.string(),
    proxyR2Key: v.string(),
    proxySpecHash: v.string(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    verifyWebhookSecret(args.webhookSecret);

    await ctx.runMutation(internal.trailerJobs.setProxyKey, {
      jobId: args.jobId as Id<"trailer_jobs">,
      proxyR2Key: args.proxyR2Key,
      proxySpecHash: args.proxySpecHash,
    });
  },
});

/**
 * HTTP action to set transcription ID
 */
export const httpSetTranscriptionId = action({
  args: {
    jobId: v.string(),
    transcriptionId: v.string(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    verifyWebhookSecret(args.webhookSecret);

    await ctx.runMutation(internal.trailerJobs.setTranscriptionId, {
      jobId: args.jobId as Id<"trailer_jobs">,
      transcriptionId: args.transcriptionId as Id<"transcriptions">,
    });
  },
});

/**
 * HTTP action to create scene map
 */
export const httpCreateSceneMap = action({
  args: {
    jobId: v.string(),
    scenes: v.array(
      v.object({
        sceneIndex: v.number(),
        startTime: v.number(),
        endTime: v.number(),
        duration: v.number(),
        keyframeTimestamps: v.array(v.number()),
        avgMotionIntensity: v.optional(v.number()),
        avgAudioIntensity: v.optional(v.number()),
        hasFaces: v.optional(v.boolean()),
        hasDialogue: v.optional(v.boolean()),
        dominantColors: v.optional(v.array(v.string())),
        summary: v.optional(v.string()),
        mood: v.optional(v.string()),
        importance: v.optional(v.number()),
      })
    ),
    totalScenes: v.number(),
    avgSceneDuration: v.number(),
    peakIntensityTimestamps: v.optional(v.array(v.number())),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ sceneMapId: Id<"trailer_scene_maps"> }> => {
    verifyWebhookSecret(args.webhookSecret);

    const sceneMapId = await ctx.runMutation(internal.trailerJobs.createSceneMap, {
      jobId: args.jobId as Id<"trailer_jobs">,
      scenes: args.scenes,
      totalScenes: args.totalScenes,
      avgSceneDuration: args.avgSceneDuration,
      peakIntensityTimestamps: args.peakIntensityTimestamps,
    });

    return { sceneMapId };
  },
});

/**
 * HTTP action to create timestamp plan
 */
export const httpCreateTimestampPlan = action({
  args: {
    jobId: v.string(),
    profileId: v.string(),
    clips: v.array(
      v.object({
        clipIndex: v.number(),
        sourceStart: v.number(),
        sourceEnd: v.number(),
        targetStart: v.number(),
        targetEnd: v.number(),
        purpose: v.optional(v.string()),
        transitionIn: v.optional(v.string()),
        transitionOut: v.optional(v.string()),
        audioTreatment: v.optional(v.string()),
      })
    ),
    source: v.string(),
    targetDurationSec: v.number(),
    actualDurationSec: v.optional(v.number()),
    aiReasoning: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ planId: Id<"trailer_timestamp_plans"> }> => {
    verifyWebhookSecret(args.webhookSecret);

    const planId = await ctx.runMutation(internal.trailerJobs.createTimestampPlan, {
      jobId: args.jobId as Id<"trailer_jobs">,
      profileId: args.profileId as Id<"trailer_profiles">,
      clips: args.clips,
      source: args.source,
      targetDurationSec: args.targetDurationSec,
      actualDurationSec: args.actualDurationSec,
      aiReasoning: args.aiReasoning,
    });

    return { planId };
  },
});

/**
 * HTTP action to create text card plan
 */
export const httpCreateTextCardPlan = action({
  args: {
    jobId: v.string(),
    profileId: v.string(),
    cards: v.array(
      v.object({
        cardIndex: v.number(),
        atSec: v.number(),
        durationSec: v.number(),
        text: v.string(),
        style: v.string(),
        motion: v.string(),
        fontSize: v.optional(v.number()),
        position: v.optional(v.string()),
        purpose: v.optional(v.string()), // "hook", "stakes", "button", etc.
      })
    ),
    aiReasoning: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ planId: Id<"trailer_text_card_plans"> }> => {
    verifyWebhookSecret(args.webhookSecret);

    const planId = await ctx.runMutation(internal.trailerJobs.createTextCardPlan, {
      jobId: args.jobId as Id<"trailer_jobs">,
      profileId: args.profileId as Id<"trailer_profiles">,
      cards: args.cards,
      aiReasoning: args.aiReasoning,
    });

    return { planId };
  },
});

/**
 * HTTP action to create audio plan
 */
export const httpCreateAudioPlan = action({
  args: {
    jobId: v.string(),
    profileId: v.string(),
    trailerDurationSec: v.number(),
    risePoints: v.array(v.number()),
    impactPoints: v.array(v.number()),
    dialogueWindows: v.array(
      v.object({
        startSec: v.number(),
        endSec: v.number(),
        importance: v.number(),
      })
    ),
    musicPrompt: v.string(),
    musicStyle: v.string(),
    musicBpm: v.optional(v.number()),
    targetLufs: v.number(),
    dialogueLevelDb: v.number(),
    musicLevelDb: v.number(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ planId: Id<"trailer_audio_plans"> }> => {
    verifyWebhookSecret(args.webhookSecret);

    const planId = await ctx.runMutation(internal.trailerJobs.createAudioPlan, {
      jobId: args.jobId as Id<"trailer_jobs">,
      profileId: args.profileId as Id<"trailer_profiles">,
      trailerDurationSec: args.trailerDurationSec,
      risePoints: args.risePoints,
      impactPoints: args.impactPoints,
      dialogueWindows: args.dialogueWindows,
      musicPrompt: args.musicPrompt,
      musicStyle: args.musicStyle,
      musicBpm: args.musicBpm,
      targetLufs: args.targetLufs,
      dialogueLevelDb: args.dialogueLevelDb,
      musicLevelDb: args.musicLevelDb,
    });

    return { planId };
  },
});

/**
 * HTTP action to create film identity classification
 */
export const httpCreateFilmIdentity = action({
  args: {
    jobId: v.string(),
    primaryGenre: v.string(),
    secondaryGenres: v.array(v.string()),
    tone: v.string(),
    themes: v.array(v.string()),
    message: v.optional(v.string()),
    archetype: v.optional(v.string()),
    spoilerSensitivity: v.number(),
    confidence: v.number(),
    evidence: v.array(
      v.object({
        type: v.string(),
        timestamp: v.optional(v.number()),
        note: v.string(),
        signalStrength: v.number(),
      })
    ),
    classificationStage: v.string(),
    extractedSignals: v.optional(v.any()),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ identityId: Id<"trailer_film_identities"> }> => {
    verifyWebhookSecret(args.webhookSecret);

    const identityId = await ctx.runMutation(
      internal.trailerJobs.createFilmIdentity,
      {
        jobId: args.jobId as Id<"trailer_jobs">,
        primaryGenre: args.primaryGenre,
        secondaryGenres: args.secondaryGenres,
        tone: args.tone,
        themes: args.themes,
        message: args.message,
        archetype: args.archetype,
        spoilerSensitivity: args.spoilerSensitivity,
        confidence: args.confidence,
        evidence: args.evidence,
        classificationStage: args.classificationStage,
        extractedSignals: args.extractedSignals,
      }
    );

    return { identityId };
  },
});

/**
 * HTTP action to create narration plan
 */
export const httpCreateNarrationPlan = action({
  args: {
    jobId: v.string(),
    profileId: v.optional(v.string()),
    narrationEnabled: v.boolean(),
    policyReason: v.string(),
    template: v.string(),
    voicePersona: v.string(),
    script: v.array(
      v.object({
        lineIndex: v.number(),
        text: v.string(),
        startSec: v.number(),
        endSec: v.number(),
        purpose: v.string(),
      })
    ),
    timingAnchors: v.array(
      v.object({
        anchorType: v.string(),
        atSec: v.number(),
        description: v.string(),
      })
    ),
    totalVoDuration: v.number(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ planId: Id<"trailer_narration_plans"> }> => {
    verifyWebhookSecret(args.webhookSecret);

    const planId = await ctx.runMutation(
      internal.trailerJobs.createNarrationPlan,
      {
        jobId: args.jobId as Id<"trailer_jobs">,
        profileId: args.profileId
          ? (args.profileId as Id<"trailer_profiles">)
          : undefined,
        narrationEnabled: args.narrationEnabled,
        policyReason: args.policyReason,
        template: args.template,
        voicePersona: args.voicePersona,
        script: args.script,
        timingAnchors: args.timingAnchors,
        totalVoDuration: args.totalVoDuration,
      }
    );

    return { planId };
  },
});

/**
 * HTTP action to update narration plan with generated VO audio
 */
export const httpUpdateNarrationPlanAudio = action({
  args: {
    planId: v.string(),
    audioR2Key: v.string(),
    audioDurationSec: v.number(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    verifyWebhookSecret(args.webhookSecret);

    await ctx.runMutation(internal.trailerJobs.updateNarrationPlanAudio, {
      planId: args.planId as Id<"trailer_narration_plans">,
      audioR2Key: args.audioR2Key,
      audioDurationSec: args.audioDurationSec,
    });

    return { success: true };
  },
});

/**
 * HTTP action to update audio plan with generated music
 */
export const httpUpdateAudioPlanMusic = action({
  args: {
    planId: v.string(),
    musicR2Key: v.string(),
    musicDurationSec: v.number(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    verifyWebhookSecret(args.webhookSecret);

    await ctx.runMutation(internal.trailerJobs.updateAudioPlanMusic, {
      planId: args.planId as Id<"trailer_audio_plans">,
      musicR2Key: args.musicR2Key,
      musicDurationSec: args.musicDurationSec,
    });

    return { success: true };
  },
});

/**
 * HTTP action to update audio plan with SFX placements
 */
export const httpUpdateAudioPlanSfx = action({
  args: {
    planId: v.string(),
    sfxPlacements: v.array(
      v.object({
        sfxIndex: v.number(),
        atSec: v.number(),
        type: v.string(),
        intensity: v.number(),
        durationSec: v.optional(v.number()),
        r2Key: v.optional(v.string()),
      })
    ),
    sfxLevelDb: v.optional(v.number()),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    verifyWebhookSecret(args.webhookSecret);

    await ctx.runMutation(internal.trailerJobs.updateAudioPlanSfx, {
      planId: args.planId as Id<"trailer_audio_plans">,
      sfxPlacements: args.sfxPlacements,
      sfxLevelDb: args.sfxLevelDb,
    });

    return { success: true };
  },
});

/**
 * HTTP action to create trailer clip
 */
export const httpCreateTrailerClip = action({
  args: {
    jobId: v.string(),
    timestampPlanId: v.string(),
    userId: v.string(),
    profileKey: v.string(),
    variantKey: v.string(),
    duration: v.number(),
    width: v.number(),
    height: v.number(),
    r2Key: v.string(),
    title: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    r2ThumbKey: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ clipId: Id<"trailer_clips"> }> => {
    verifyWebhookSecret(args.webhookSecret);

    const clipId = await ctx.runMutation(internal.trailerJobs.createTrailerClip, {
      jobId: args.jobId as Id<"trailer_jobs">,
      timestampPlanId: args.timestampPlanId as Id<"trailer_timestamp_plans">,
      userId: args.userId as Id<"users">,
      profileKey: args.profileKey,
      variantKey: args.variantKey,
      duration: args.duration,
      width: args.width,
      height: args.height,
      r2Key: args.r2Key,
      title: args.title,
      fileSize: args.fileSize,
      r2ThumbKey: args.r2ThumbKey,
    });

    return { clipId };
  },
});

/**
 * HTTP action to complete job
 */
export const httpCompleteJob = action({
  args: {
    jobId: v.string(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    verifyWebhookSecret(args.webhookSecret);

    await ctx.runMutation(internal.trailerJobs.completeJob, {
      jobId: args.jobId as Id<"trailer_jobs">,
    });

    return { success: true };
  },
});

/**
 * HTTP action to fail job
 */
export const httpFailJob = action({
  args: {
    jobId: v.string(),
    error: v.string(),
    errorStage: v.string(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    verifyWebhookSecret(args.webhookSecret);

    await ctx.runMutation(internal.trailerJobs.failJob, {
      jobId: args.jobId as Id<"trailer_jobs">,
      error: args.error,
      errorStage: args.errorStage,
    });

    return { success: true };
  },
});

/**
 * HTTP action to get job details (including video job and profile)
 */
export const httpGetJobDetails = action({
  args: {
    jobId: v.string(),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    videoJob: Doc<"video_jobs"> | null;
    profile: Doc<"trailer_profiles"> | null;
  } & Doc<"trailer_jobs">> => {
    verifyWebhookSecret(args.webhookSecret);

    const job: Doc<"trailer_jobs"> | null = await ctx.runQuery(internal.trailerJobs.getTrailerJobInternal, {
      jobId: args.jobId as Id<"trailer_jobs">,
    });

    if (!job) {
      throw new Error("Job not found");
    }

    // Get related data
    const videoJob: Doc<"video_jobs"> | null = await ctx.runQuery(internal.videoJobsDb.getVideoJobInternal, {
      jobId: job.videoJobId,
    });

    let profile: Doc<"trailer_profiles"> | null = null;
    if (job.selectedProfileId) {
      profile = await ctx.runQuery(internal.trailerProfiles.getProfileInternal, {
        profileId: job.selectedProfileId,
      });
    }

    return {
      ...job,
      videoJob,
      profile,
    };
  },
});

// ============================================
// PHASE 6: EFFECTS PLAN
// ============================================

/**
 * Create effects plan (Phase 6: transitions, speed effects, flash frames)
 */
export const createEffectsPlan = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    profileId: v.id("trailer_profiles"),
    transitions: v.array(
      v.object({
        fromClipIndex: v.number(),
        toClipIndex: v.number(),
        transitionType: v.string(),
        duration: v.number(),
        offset: v.number(),
        isBeatAligned: v.boolean(),
      })
    ),
    speedEffects: v.array(
      v.object({
        effectIndex: v.number(),
        effectType: v.string(),
        startTime: v.number(),
        endTime: v.number(),
        speedFactor: v.optional(v.number()),
        rampInDuration: v.optional(v.number()),
        rampOutDuration: v.optional(v.number()),
        startSpeed: v.optional(v.number()),
        endSpeed: v.optional(v.number()),
        easing: v.optional(v.string()),
      })
    ),
    flashFrames: v.array(
      v.object({
        flashIndex: v.number(),
        timestamp: v.number(),
        duration: v.number(),
        color: v.string(),
        intensity: v.number(),
        fadeIn: v.optional(v.number()),
        fadeOut: v.optional(v.number()),
      })
    ),
    totalTransitions: v.number(),
    totalSpeedEffects: v.number(),
    totalFlashFrames: v.number(),
    aiReasoning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const planId = await ctx.db.insert("trailer_effects_plans", {
      trailerJobId: args.jobId,
      profileId: args.profileId,
      transitions: args.transitions,
      speedEffects: args.speedEffects,
      flashFrames: args.flashFrames,
      totalTransitions: args.totalTransitions,
      totalSpeedEffects: args.totalSpeedEffects,
      totalFlashFrames: args.totalFlashFrames,
      aiReasoning: args.aiReasoning,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.jobId, {
      effectsPlanId: planId,
      updatedAt: Date.now(),
    });

    return planId;
  },
});

/**
 * HTTP action to create effects plan
 */
export const httpCreateEffectsPlan = action({
  args: {
    jobId: v.string(),
    profileId: v.string(),
    transitions: v.array(
      v.object({
        fromClipIndex: v.number(),
        toClipIndex: v.number(),
        transitionType: v.string(),
        duration: v.number(),
        offset: v.number(),
        isBeatAligned: v.boolean(),
      })
    ),
    speedEffects: v.array(
      v.object({
        effectIndex: v.number(),
        effectType: v.string(),
        startTime: v.number(),
        endTime: v.number(),
        speedFactor: v.optional(v.number()),
        rampInDuration: v.optional(v.number()),
        rampOutDuration: v.optional(v.number()),
        startSpeed: v.optional(v.number()),
        endSpeed: v.optional(v.number()),
        easing: v.optional(v.string()),
      })
    ),
    flashFrames: v.array(
      v.object({
        flashIndex: v.number(),
        timestamp: v.number(),
        duration: v.number(),
        color: v.string(),
        intensity: v.number(),
        fadeIn: v.optional(v.number()),
        fadeOut: v.optional(v.number()),
      })
    ),
    totalTransitions: v.number(),
    totalSpeedEffects: v.number(),
    totalFlashFrames: v.number(),
    aiReasoning: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ planId: Id<"trailer_effects_plans"> }> => {
    verifyWebhookSecret(args.webhookSecret);

    const planId = await ctx.runMutation(internal.trailerJobs.createEffectsPlan, {
      jobId: args.jobId as Id<"trailer_jobs">,
      profileId: args.profileId as Id<"trailer_profiles">,
      transitions: args.transitions,
      speedEffects: args.speedEffects,
      flashFrames: args.flashFrames,
      totalTransitions: args.totalTransitions,
      totalSpeedEffects: args.totalSpeedEffects,
      totalFlashFrames: args.totalFlashFrames,
      aiReasoning: args.aiReasoning,
    });

    return { planId };
  },
});

// ============================================
// PHASE 8: WORKFLOW PLAN
// ============================================

/**
 * Create workflow plan (Phase 8: timeline snapshot, previews, exports)
 */
export const createWorkflowPlan = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    profileId: v.id("trailer_profiles"),
    clips: v.array(
      v.object({
        clipIndex: v.number(),
        sceneIndex: v.number(),
        sourceStart: v.number(),
        sourceEnd: v.number(),
        targetStart: v.number(),
        targetEnd: v.number(),
        userModified: v.optional(v.boolean()),
        userAdded: v.optional(v.boolean()),
      })
    ),
    textCards: v.array(
      v.object({
        cardIndex: v.number(),
        atSec: v.number(),
        durationSec: v.number(),
        text: v.string(),
        style: v.string(),
        motion: v.string(),
        position: v.string(),
        userModified: v.optional(v.boolean()),
        userAdded: v.optional(v.boolean()),
      })
    ),
    calculatedDuration: v.number(),
    targetDuration: v.number(),
    effectsPlanId: v.optional(v.id("trailer_effects_plans")),
    overlayPlanId: v.optional(v.id("trailer_overlay_plans")),
    audioPlanId: v.optional(v.id("trailer_audio_plans")),
    previewQuality: v.optional(v.string()),
    previewR2Key: v.optional(v.string()),
    recommendedExports: v.array(
      v.object({
        quality: v.string(),
        format: v.string(),
        label: v.string(),
        description: v.string(),
      })
    ),
    revision: v.number(),
    parentRevision: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const planId = await ctx.db.insert("trailer_workflow_plans", {
      trailerJobId: args.jobId,
      profileId: args.profileId,
      clips: args.clips,
      textCards: args.textCards,
      calculatedDuration: args.calculatedDuration,
      targetDuration: args.targetDuration,
      effectsPlanId: args.effectsPlanId,
      overlayPlanId: args.overlayPlanId,
      audioPlanId: args.audioPlanId,
      previewQuality: args.previewQuality,
      previewR2Key: args.previewR2Key,
      previewGeneratedAt: args.previewR2Key ? now : undefined,
      recommendedExports: args.recommendedExports,
      revision: args.revision,
      parentRevision: args.parentRevision,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.jobId, {
      workflowPlanId: planId,
      updatedAt: now,
    });

    return planId;
  },
});

/**
 * HTTP action to create workflow plan
 */
export const httpCreateWorkflowPlan = action({
  args: {
    jobId: v.string(),
    profileId: v.string(),
    clips: v.array(
      v.object({
        clipIndex: v.number(),
        sceneIndex: v.number(),
        sourceStart: v.number(),
        sourceEnd: v.number(),
        targetStart: v.number(),
        targetEnd: v.number(),
        userModified: v.optional(v.boolean()),
        userAdded: v.optional(v.boolean()),
      })
    ),
    textCards: v.array(
      v.object({
        cardIndex: v.number(),
        atSec: v.number(),
        durationSec: v.number(),
        text: v.string(),
        style: v.string(),
        motion: v.string(),
        position: v.string(),
        userModified: v.optional(v.boolean()),
        userAdded: v.optional(v.boolean()),
      })
    ),
    calculatedDuration: v.number(),
    targetDuration: v.number(),
    effectsPlanId: v.optional(v.string()),
    overlayPlanId: v.optional(v.string()),
    audioPlanId: v.optional(v.string()),
    previewQuality: v.optional(v.string()),
    previewR2Key: v.optional(v.string()),
    recommendedExports: v.array(
      v.object({
        quality: v.string(),
        format: v.string(),
        label: v.string(),
        description: v.string(),
      })
    ),
    revision: v.number(),
    parentRevision: v.optional(v.number()),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ planId: Id<"trailer_workflow_plans"> }> => {
    verifyWebhookSecret(args.webhookSecret);

    const planId = await ctx.runMutation(internal.trailerJobs.createWorkflowPlan, {
      jobId: args.jobId as Id<"trailer_jobs">,
      profileId: args.profileId as Id<"trailer_profiles">,
      clips: args.clips,
      textCards: args.textCards,
      calculatedDuration: args.calculatedDuration,
      targetDuration: args.targetDuration,
      effectsPlanId: args.effectsPlanId ? (args.effectsPlanId as Id<"trailer_effects_plans">) : undefined,
      overlayPlanId: args.overlayPlanId ? (args.overlayPlanId as Id<"trailer_overlay_plans">) : undefined,
      audioPlanId: args.audioPlanId ? (args.audioPlanId as Id<"trailer_audio_plans">) : undefined,
      previewQuality: args.previewQuality,
      previewR2Key: args.previewR2Key,
      recommendedExports: args.recommendedExports,
      revision: args.revision,
      parentRevision: args.parentRevision,
    });

    return { planId };
  },
});

// ============================================
// PHASE 9: AI SELECTION PLAN
// ============================================

/**
 * Create AI selection plan (Phase 9: genre optimization, audience analysis, arc validation)
 */
export const createAISelectionPlan = internalMutation({
  args: {
    jobId: v.id("trailer_jobs"),
    profileId: v.id("trailer_profiles"),
    detectedGenre: v.string(),
    genreConfidence: v.number(),
    genreConventions: v.object({
      structure: v.array(v.string()),
      openingPace: v.string(),
      climaxPace: v.string(),
      textCardStyle: v.string(),
    }),
    audienceType: v.string(),
    audienceAnalysis: v.object({
      topScenes: v.array(v.number()),
      openingScene: v.optional(v.number()),
      climaxScenes: v.array(v.number()),
      toneRecommendation: v.optional(v.string()),
      keyDialogue: v.optional(v.array(v.object({
        text: v.string(),
        start: v.number(),
        audienceAppeal: v.string(),
      }))),
    }),
    emotionalArc: v.object({
      peakMoment: v.number(),
      resolutionStart: v.number(),
      intensityCurve: v.array(v.number()),
    }),
    arcValidation: v.object({
      valid: v.boolean(),
      score: v.number(),
      issues: v.array(v.string()),
      suggestions: v.array(v.string()),
    }),
    pacingAnalysis: v.object({
      valid: v.boolean(),
      avgDuration: v.number(),
      minDuration: v.number(),
      maxDuration: v.number(),
      totalDuration: v.number(),
      cutsPerMinute: v.number(),
      accelerating: v.boolean(),
      issues: v.array(v.string()),
      suggestions: v.array(v.string()),
    }),
    recommendedEffects: v.object({
      transitions: v.array(v.string()),
      useFlashFrames: v.boolean(),
      useSlowMotion: v.boolean(),
      letterbox: v.optional(v.string()),
      textCardStyle: v.string(),
      textCardFrequency: v.number(),
      shotAcceleration: v.boolean(),
      musicSyncImportance: v.number(),
    }),
    enhancementSummary: v.object({
      genreApplied: v.boolean(),
      audienceOptimized: v.boolean(),
      arcOptimized: v.boolean(),
      pacingOptimized: v.boolean(),
      variantsGenerated: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const planId = await ctx.db.insert("trailer_ai_selection_plans", {
      trailerJobId: args.jobId,
      profileId: args.profileId,
      detectedGenre: args.detectedGenre,
      genreConfidence: args.genreConfidence,
      genreConventions: args.genreConventions,
      audienceType: args.audienceType,
      audienceAnalysis: args.audienceAnalysis,
      emotionalArc: args.emotionalArc,
      arcValidation: args.arcValidation,
      pacingAnalysis: args.pacingAnalysis,
      recommendedEffects: args.recommendedEffects,
      enhancementSummary: args.enhancementSummary,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.jobId, {
      aiSelectionPlanId: planId,
      updatedAt: Date.now(),
    });

    return planId;
  },
});

/**
 * HTTP action to create AI selection plan
 */
export const httpCreateAISelectionPlan = action({
  args: {
    jobId: v.string(),
    profileId: v.string(),
    detectedGenre: v.string(),
    genreConfidence: v.number(),
    genreConventions: v.object({
      structure: v.array(v.string()),
      openingPace: v.string(),
      climaxPace: v.string(),
      textCardStyle: v.string(),
    }),
    audienceType: v.string(),
    audienceAnalysis: v.object({
      topScenes: v.array(v.number()),
      openingScene: v.optional(v.number()),
      climaxScenes: v.array(v.number()),
      toneRecommendation: v.optional(v.string()),
      keyDialogue: v.optional(v.array(v.object({
        text: v.string(),
        start: v.number(),
        audienceAppeal: v.string(),
      }))),
    }),
    emotionalArc: v.object({
      peakMoment: v.number(),
      resolutionStart: v.number(),
      intensityCurve: v.array(v.number()),
    }),
    arcValidation: v.object({
      valid: v.boolean(),
      score: v.number(),
      issues: v.array(v.string()),
      suggestions: v.array(v.string()),
    }),
    pacingAnalysis: v.object({
      valid: v.boolean(),
      avgDuration: v.number(),
      minDuration: v.number(),
      maxDuration: v.number(),
      totalDuration: v.number(),
      cutsPerMinute: v.number(),
      accelerating: v.boolean(),
      issues: v.array(v.string()),
      suggestions: v.array(v.string()),
    }),
    recommendedEffects: v.object({
      transitions: v.array(v.string()),
      useFlashFrames: v.boolean(),
      useSlowMotion: v.boolean(),
      letterbox: v.optional(v.string()),
      textCardStyle: v.string(),
      textCardFrequency: v.number(),
      shotAcceleration: v.boolean(),
      musicSyncImportance: v.number(),
    }),
    enhancementSummary: v.object({
      genreApplied: v.boolean(),
      audienceOptimized: v.boolean(),
      arcOptimized: v.boolean(),
      pacingOptimized: v.boolean(),
      variantsGenerated: v.number(),
    }),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ planId: Id<"trailer_ai_selection_plans"> }> => {
    verifyWebhookSecret(args.webhookSecret);

    const planId = await ctx.runMutation(internal.trailerJobs.createAISelectionPlan, {
      jobId: args.jobId as Id<"trailer_jobs">,
      profileId: args.profileId as Id<"trailer_profiles">,
      detectedGenre: args.detectedGenre,
      genreConfidence: args.genreConfidence,
      genreConventions: args.genreConventions,
      audienceType: args.audienceType,
      audienceAnalysis: args.audienceAnalysis,
      emotionalArc: args.emotionalArc,
      arcValidation: args.arcValidation,
      pacingAnalysis: args.pacingAnalysis,
      recommendedEffects: args.recommendedEffects,
      enhancementSummary: args.enhancementSummary,
    });

    return { planId };
  },
});
