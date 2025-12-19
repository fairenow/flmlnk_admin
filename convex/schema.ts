import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    // External auth identity (Better Auth / Google)
    authId: v.string(), // e.g. Google sub / subject
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    // "actor", "filmmaker", "distributor", "admin", etc.
    role: v.optional(v.string()),
    // Profile fields for social features
    username: v.optional(v.string()), // Unique username
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    website: v.optional(v.string()),
    // Counts (denormalized for performance)
    followerCount: v.optional(v.number()),
    followingCount: v.optional(v.number()),
    totalLikes: v.optional(v.number()),
    // Account type
    isBusinessAccount: v.optional(v.boolean()),
    isVerified: v.optional(v.boolean()),
    // For ad features
    adBalanceCents: v.optional(v.number()),
  })
    .index("by_authId", ["authId"])
    .index("by_username", ["username"]),

  actor_profiles: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
    slug: v.string(), // for /actor/:slug or subdomain mapping
    headline: v.optional(v.string()),
    bio: v.optional(v.string()),
    // Optional avatar URL to allow undefined values
    avatarUrl: v.optional(v.string()),
    avatarStorageId: v.optional(v.string()),
    location: v.optional(v.string()),
    imdbId: v.optional(v.string()),
    imdbUrl: v.optional(v.string()),
    genres: v.optional(v.array(v.string())),
    platforms: v.optional(
      v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          url: v.optional(v.string()),
        }),
      ),
    ),
    theme: v.optional(
      v.object({
        primaryColor: v.optional(v.string()),
        accentColor: v.optional(v.string()),
        layoutVariant: v.optional(v.string()),
      }),
    ),
    socials: v.optional(
      v.object({
        instagram: v.optional(v.string()),
        facebook: v.optional(v.string()),
        youtube: v.optional(v.string()),
        tiktok: v.optional(v.string()),
        imdb: v.optional(v.string()),
        website: v.optional(v.string()),
      }),
    ),
    featuredStreamingUrl: v.optional(v.string()),
  }).index("by_user", ["userId"])
    .index("by_slug", ["slug"]),

  projects: defineTable({
    actorProfileId: v.id("actor_profiles"),
    title: v.string(),
    logline: v.optional(v.string()),
    description: v.optional(v.string()),
    // Poster image - can be URL or uploaded file
    posterUrl: v.optional(v.string()),
    posterStorageId: v.optional(v.id("_storage")),
    releaseYear: v.optional(v.number()),
    roleName: v.optional(v.string()),
    roleType: v.optional(v.string()), // lead, supporting, cameo, etc.
    imdbTitleId: v.optional(v.string()),
    tubiUrl: v.optional(v.string()),

    // NEW: generic hero CTA for editor + public hero button
    primaryWatchLabel: v.optional(v.string()),
    primaryWatchUrl: v.optional(v.string()),
    status: v.optional(v.string()), // released, festival, in-development, etc.
    isFeatured: v.optional(v.boolean()),
    matchScore: v.optional(v.number()),
    ratingCategory: v.optional(v.string()),
    formatTags: v.optional(v.array(v.string())),
    watchCtaText: v.optional(v.string()),
    watchCtaUrl: v.optional(v.string()),
    // Trailer URL for hero rendering
    trailerUrl: v.optional(v.string()),
    // Sort order for display
    sortOrder: v.optional(v.number()),
  }).index("by_actorProfile", ["actorProfileId"]),

  clips: defineTable({
    actorProfileId: v.id("actor_profiles"),
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    youtubeUrl: v.string(),
    deepLinkId: v.optional(v.string()),
    description: v.optional(v.string()),
    // Display ordering on actor page / reels
    sortOrder: v.optional(v.number()),
    isFeatured: v.optional(v.boolean()),
    // Stripe payment link for tips/support
    stripePaymentUrl: v.optional(v.string()),
    // Whether clip is visible on public profile page
    isPublic: v.optional(v.boolean()),
    // Custom 9:16 thumbnail (overrides YouTube's default 16:9)
    customThumbnailStorageId: v.optional(v.id("_storage")),
    customThumbnailUrl: v.optional(v.string()),
    // Timestamp in video (seconds) for auto-generated thumbnail
    thumbnailTimestamp: v.optional(v.number()),
  }).index("by_actorProfile", ["actorProfileId"])
    .index("by_project", ["projectId"]),

  notable_projects: defineTable({
    actorProfileId: v.id("actor_profiles"),
    title: v.string(),
    posterUrl: v.optional(v.string()),
    platformUrl: v.optional(v.string()),
    releaseYear: v.optional(v.number()),
    sortOrder: v.optional(v.number()),
  }).index("by_actorProfile", ["actorProfileId"]),

  comments: defineTable({
    actorProfileId: v.id("actor_profiles"),
    name: v.string(),
    email: v.string(),
    message: v.string(),
    createdAt: v.number(),
    parentId: v.optional(v.id("comments")),
    likes: v.number(),
    isOwner: v.optional(v.boolean()),
  }).index("by_actorProfile", ["actorProfileId"]),

  fan_emails: defineTable({
    actorProfileId: v.id("actor_profiles"),
    email: v.string(),
    name: v.optional(v.string()),
    source: v.optional(v.string()), // page, campaign, QR code, trailer_page, premiere_event, etc.

    // Consent & compliance
    consentedAt: v.optional(v.number()), // Timestamp of explicit opt-in
    consentSource: v.optional(v.string()), // Where consent was given
    consentIpAddress: v.optional(v.string()), // For compliance records
    doubleOptInConfirmedAt: v.optional(v.number()), // For double opt-in flow

    // Unsubscribe support
    unsubscribed: v.optional(v.boolean()),
    unsubscribedAt: v.optional(v.number()),
    unsubscribeToken: v.optional(v.string()), // Unique token for one-click unsubscribe
    unsubscribeReason: v.optional(v.string()), // Optional feedback

    // Engagement metrics
    lastEmailSentAt: v.optional(v.number()),
    lastEmailOpenedAt: v.optional(v.number()),
    lastEmailClickedAt: v.optional(v.number()),
    emailsSentCount: v.optional(v.number()),
    emailsOpenedCount: v.optional(v.number()),
    emailsClickedCount: v.optional(v.number()),

    // Data quality flags
    isVerified: v.optional(v.boolean()), // Email verified (not bounced)
    bounceCount: v.optional(v.number()),
    lastBounceAt: v.optional(v.number()),
    isHardBounce: v.optional(v.boolean()), // Permanent delivery failure

    // Subscriber preferences
    preferredFrequency: v.optional(v.string()), // "all", "weekly", "monthly", "important_only"

    // Timestamps
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("by_actorProfile", ["actorProfileId"])
    .index("by_email", ["email"])
    .index("by_unsubscribeToken", ["unsubscribeToken"])
    .index("by_actorProfile_unsubscribed", ["actorProfileId", "unsubscribed"]),

  // Booking inquiries from contact form
  booking_inquiries: defineTable({
    actorProfileId: v.id("actor_profiles"),
    name: v.string(),
    email: v.string(),
    projectType: v.string(),
    message: v.string(),
    createdAt: v.number(),
    // Track if email notification was sent
    emailSent: v.optional(v.boolean()),
  }).index("by_actorProfile", ["actorProfileId"]),

  page_templates: defineTable({
    key: v.string(), // e.g. "actor-default", "film-launch"
    label: v.string(),
    description: v.optional(v.string()),
    // JSON describing layout blocks for templates
    config: v.object({}),
  }).index("by_key", ["key"]),

  boost_campaigns: defineTable({
    projectId: v.optional(v.id("projects")), // Made optional - can boost videos too
    videoId: v.optional(v.id("videos")), // Can boost videos directly
    // Asset reference (for generated clips/memes/gifs)
    assetId: v.optional(v.string()),
    assetType: v.optional(v.string()), // "clip", "meme", "gif"
    createdByUserId: v.id("users"),
    actorProfileId: v.optional(v.id("actor_profiles")),
    name: v.string(),
    status: v.string(), // draft, pending_payment, active, paused, completed, cancelled
    budgetCents: v.number(),
    dailyBudgetCents: v.optional(v.number()), // Daily budget for recurring charges
    durationDays: v.optional(v.number()), // Campaign duration in days
    platform: v.string(), // meta, google, tiktok, all, etc.
    // Stripe payment integration
    stripeCheckoutSessionId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    paymentStatus: v.optional(v.string()), // pending, paid, failed, refunded
    paidAt: v.optional(v.number()),
    // Spending and metrics
    spentCents: v.optional(v.number()),
    reach: v.optional(v.number()),
    impressions: v.optional(v.number()),
    clicks: v.optional(v.number()),
    conversions: v.optional(v.number()),
    ctr: v.optional(v.number()), // click-through rate
    cpc: v.optional(v.number()), // cost per click (cents)
    cpm: v.optional(v.number()), // cost per mille (cents)
    roi: v.optional(v.number()),
    // Targeting
    targetAudience: v.optional(
      v.object({
        ageRange: v.optional(v.string()),
        gender: v.optional(v.string()),
        interests: v.optional(v.array(v.string())),
      })
    ),
    // Dates
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_video", ["videoId"])
    .index("by_creator", ["createdByUserId"])
    .index("by_status", ["status"])
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_stripeCheckout", ["stripeCheckoutSessionId"]),

  analytics_events: defineTable({
    actorProfileId: v.optional(v.id("actor_profiles")),
    projectId: v.optional(v.id("projects")),
    clipId: v.optional(v.id("clips")),
    eventType: v.string(), // page_view, clip_play, email_submit, etc.
    sessionId: v.string(),
    userAgent: v.optional(v.string()),
    referrer: v.optional(v.string()),
    metadata: v.optional(v.any()),
  }).index("by_actorProfile", ["actorProfileId"])
    .index("by_project", ["projectId"])
    .index("by_clip", ["clipId"]),

  usage_daily_metrics: defineTable({
    // ISO date string, e.g. "2025-11-19"
    day: v.string(),
    users: v.number(),
    actorProfiles: v.number(),
    projects: v.number(),
    createdAt: v.number(), // timestamp (ms)
  }).index("by_day", ["day"]),

  // Daily analytics snapshots per actor profile (aggregated from GA4 + Convex)
  // Clip generation jobs - tracks video processing jobs from Modal
  clip_generation_jobs: defineTable({
    actorProfileId: v.id("actor_profiles"),
    visitorId: v.string(), // unique identifier for this job session
    externalJobId: v.string(), // job_id from Modal
    sourceVideoUrl: v.string(),
    status: v.string(), // pending, downloading, transcribing, analyzing, clipping, uploading, completed, failed
    clipCount: v.number(), // num_clips requested
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    // Progress tracking for real-time updates
    progress: v.optional(v.number()), // 0-100 percentage
    currentStep: v.optional(v.string()), // Current processing step description
    // Video metadata from download
    videoTitle: v.optional(v.string()),
    videoDuration: v.optional(v.number()), // seconds
    // Transcription reference (for caching)
    transcriptionId: v.optional(v.id("transcriptions")),
    // Layout configuration
    layout: v.optional(v.string()), // "gaming", "podcast", "standard"
    // Caption styling
    captionStyle: v.optional(
      v.object({
        highlightColor: v.optional(v.string()),
        fontScale: v.optional(v.number()),
        position: v.optional(v.string()), // "bottom", "center", "top"
      })
    ),
  })
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_externalJobId", ["externalJobId"])
    .index("by_visitorId", ["visitorId"])
    .index("by_status", ["status"]),

  // Transcriptions - cached transcriptions for videos (avoids re-transcribing)
  transcriptions: defineTable({
    // Unique identifier - hash of video URL or video ID
    videoHash: v.string(),
    sourceVideoUrl: v.string(),
    videoTitle: v.optional(v.string()),
    videoDuration: v.optional(v.number()), // seconds
    // Full transcription with word-level timing
    segments: v.array(
      v.object({
        start: v.number(), // seconds
        end: v.number(), // seconds
        text: v.string(),
        words: v.optional(
          v.array(
            v.object({
              word: v.string(),
              start: v.number(),
              end: v.number(),
              confidence: v.optional(v.number()),
            })
          )
        ),
      })
    ),
    // Full text for search
    fullText: v.string(),
    // Metadata
    language: v.optional(v.string()),
    model: v.optional(v.string()), // "whisper-1", etc.
    createdAt: v.number(),
    lastUsedAt: v.number(),
  })
    .index("by_videoHash", ["videoHash"])
    .index("by_sourceUrl", ["sourceVideoUrl"]),

  // Generated clips - AI-generated clips from Modal processing
  generated_clips: defineTable({
    jobId: v.id("clip_generation_jobs"),
    actorProfileId: v.id("actor_profiles"),
    externalClipId: v.string(), // unique clip identifier
    title: v.string(),
    description: v.string(),
    transcript: v.string(),
    // Convex storage - clips stored directly in Convex
    storageId: v.optional(v.id("_storage")), // Convex storage ID
    downloadUrl: v.optional(v.string()), // Generated URL (populated after upload)
    thumbnailStorageId: v.optional(v.id("_storage")), // Thumbnail storage ID (from Modal)
    thumbnailUrl: v.optional(v.string()), // Generated thumbnail URL (from Modal)
    // Custom 9:16 thumbnail (user-selected, takes precedence over Modal-generated)
    customThumbnailStorageId: v.optional(v.id("_storage")),
    customThumbnailUrl: v.optional(v.string()),
    // Timestamp in clip (seconds) used for custom thumbnail extraction
    thumbnailTimestamp: v.optional(v.number()),
    duration: v.number(),
    startTime: v.number(),
    endTime: v.number(),
    score: v.number(), // viral/engagement score 0-100
    videoTitle: v.optional(v.string()), // source video title
    createdAt: v.number(),
    // Processing status
    status: v.optional(v.string()), // "pending", "uploading", "completed", "failed"
    // Face detection results
    hasFaces: v.optional(v.boolean()),
    facePositions: v.optional(
      v.array(
        v.object({
          x: v.number(),
          y: v.number(),
          width: v.number(),
          height: v.number(),
          timestamp: v.number(),
        })
      )
    ),
    // Layout used for this clip
    layout: v.optional(v.string()), // "gaming", "podcast", "standard"
    // Caption style used
    captionStyle: v.optional(v.string()),
    // Viral analysis from GPT-4o
    viralAnalysis: v.optional(
      v.object({
        hookStrength: v.optional(v.number()), // 0-100
        retentionScore: v.optional(v.number()), // 0-100
        shareabilityScore: v.optional(v.number()), // 0-100
        suggestedHashtags: v.optional(v.array(v.string())),
        summary: v.optional(v.string()),
      })
    ),
    // Whether clip is visible on public profile page (defaults to false)
    isPublic: v.optional(v.boolean()),
  })
    .index("by_jobId", ["jobId"])
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_score", ["score"]),

  analytics_snapshots: defineTable({
    actorProfileId: v.id("actor_profiles"),
    slug: v.string(),
    date: v.string(), // YYYY-MM-DD

    // Traffic metrics
    pageViews: v.number(),
    uniqueVisitors: v.number(),
    avgSessionDuration: v.optional(v.number()), // seconds
    bounceRate: v.optional(v.number()), // 0-100

    // Engagement metrics
    clipPlays: v.number(),
    clipShares: v.number(),
    commentCount: v.number(),

    // Conversion metrics
    emailCaptures: v.number(),
    inquiries: v.number(),
    socialClicks: v.optional(v.number()),
    watchCtaClicks: v.optional(v.number()),

    // Source breakdown (from GA4)
    trafficSources: v.optional(
      v.object({
        direct: v.number(),
        organic: v.number(),
        social: v.number(),
        referral: v.number(),
        email: v.number(),
      })
    ),

    // Top referrers
    topReferrers: v.optional(
      v.array(
        v.object({
          referrer: v.string(),
          visitors: v.number(),
        })
      )
    ),

    // Device breakdown
    deviceBreakdown: v.optional(
      v.object({
        mobile: v.number(),
        desktop: v.number(),
        tablet: v.number(),
      })
    ),

    // Data source indicator
    source: v.optional(v.string()), // "ga4", "convex", "both"
    createdAt: v.number(),
  })
    .index("by_profile", ["actorProfileId"])
    .index("by_slug", ["slug"])
    .index("by_date", ["date"])
    .index("by_profile_date", ["actorProfileId", "date"]),

  // Image Manager Projects - Root containers for organizing film assets
  image_manager_projects: defineTable({
    actorProfileId: v.id("actor_profiles"),
    name: v.string(),
    description: v.optional(v.string()),
    // Project type for categorization
    projectType: v.optional(v.string()), // "film", "series", "commercial", "music_video", "personal"
    // Cover/thumbnail for the project
    coverStorageId: v.optional(v.id("_storage")),
    coverUrl: v.optional(v.string()),
    // Status tracking
    status: v.optional(v.string()), // "active", "archived", "completed"
    // Metadata
    releaseYear: v.optional(v.number()),
    genre: v.optional(v.string()),
    // Sort order
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_status", ["status"]),

  // Image Manager Folders - Hierarchical folder structure within projects
  image_manager_folders: defineTable({
    actorProfileId: v.id("actor_profiles"),
    projectId: v.id("image_manager_projects"),
    // Parent folder (null = root level within project)
    parentId: v.optional(v.id("image_manager_folders")),
    name: v.string(),
    // Folder type/purpose for smart organization
    folderType: v.optional(v.string()), // "social_media", "paid_ads", "press_kit", "thumbnails", "bts", "custom"
    // Color coding for visual organization
    color: v.optional(v.string()), // hex color
    icon: v.optional(v.string()), // lucide icon name
    // Description
    description: v.optional(v.string()),
    // Sort order within parent
    sortOrder: v.optional(v.number()),
    // Expanded state for UI persistence
    isExpanded: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_project", ["projectId"])
    .index("by_parent", ["parentId"])
    .index("by_project_parent", ["projectId", "parentId"]),

  // Image Manager Assets - Images organized within folders
  image_manager_assets: defineTable({
    actorProfileId: v.id("actor_profiles"),
    projectId: v.id("image_manager_projects"),
    folderId: v.optional(v.id("image_manager_folders")), // null = project root
    // Asset name and description
    name: v.string(),
    description: v.optional(v.string()),
    // Storage
    storageId: v.id("_storage"),
    url: v.string(),
    // Image dimensions
    width: v.number(),
    height: v.number(),
    aspectRatio: v.string(), // "9:16", "16:9", "1:1", "4:5", etc.
    fileSize: v.optional(v.number()), // bytes
    mimeType: v.optional(v.string()), // "image/png", "image/jpeg"
    // Source tracking (where the image came from)
    sourceType: v.string(), // "auto_capture", "manual_upload", "generated_clip", "youtube_clip", "import"
    sourceId: v.optional(v.string()), // Reference to source video/clip
    sourceTitle: v.optional(v.string()),
    sourceTimestamp: v.optional(v.number()), // Timestamp in video (seconds)
    // Asset purpose/category
    assetCategory: v.string(), // "social_media", "paid_ad", "thumbnail", "press", "behind_scenes", "promotional", "custom"
    // Platform-specific targeting
    targetPlatforms: v.optional(v.array(v.string())), // ["instagram", "facebook", "tiktok", "youtube", "twitter"]
    // Tags for organization
    tags: v.optional(v.array(v.string())),
    // AI-detected features
    hasFaces: v.optional(v.boolean()),
    faceCount: v.optional(v.number()),
    hasText: v.optional(v.boolean()),
    dominantColors: v.optional(v.array(v.string())),
    aiScore: v.optional(v.number()), // 0-100 quality score
    aiDescription: v.optional(v.string()), // AI-generated description
    // Status
    isFavorite: v.optional(v.boolean()),
    isPublic: v.optional(v.boolean()),
    // Sort order
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_project", ["projectId"])
    .index("by_folder", ["folderId"])
    .index("by_project_folder", ["projectId", "folderId"])
    .index("by_category", ["assetCategory"])
    .index("by_profile_category", ["actorProfileId", "assetCategory"]),

  // Auto-capture jobs - Tracks automated frame extraction jobs
  auto_capture_jobs: defineTable({
    actorProfileId: v.id("actor_profiles"),
    projectId: v.id("image_manager_projects"),
    targetFolderId: v.optional(v.id("image_manager_folders")),
    // Source video
    sourceType: v.string(), // "generated_clip", "youtube_url", "uploaded_video"
    sourceId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceTitle: v.optional(v.string()),
    videoDuration: v.optional(v.number()), // seconds
    // Capture configuration
    captureMode: v.string(), // "interval", "smart", "manual_timestamps"
    intervalSeconds: v.optional(v.number()), // For interval mode
    frameCount: v.optional(v.number()), // Target number of frames
    timestamps: v.optional(v.array(v.number())), // Manual timestamps
    aspectRatio: v.string(), // "9:16", "16:9", "1:1", "4:5"
    quality: v.optional(v.string()), // "high", "medium", "low"
    // Job status
    status: v.string(), // "pending", "processing", "completed", "failed"
    progress: v.optional(v.number()), // 0-100
    currentFrame: v.optional(v.number()),
    totalFrames: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    // Results
    capturedCount: v.optional(v.number()),
    // Timestamps
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["status"]),

  // Meme templates - reusable meme format definitions
  meme_templates: defineTable({
    name: v.string(), // e.g., "Reaction Meme", "Expectation vs Reality"
    templateType: v.string(), // "reaction", "before_after", "internal_external", "absurd_visual", "character_voice", "fake_tutorial", "forbidden"
    description: v.string(),
    // Requirements for this template
    requirements: v.object({
      emotions: v.optional(v.array(v.string())), // ["happy", "shocked", "stressed", etc.]
      actions: v.optional(v.array(v.string())), // ["arguing", "sneaking", "falling", etc.]
      frameCount: v.optional(v.number()), // How many frames needed (1, 2, etc.)
      needsExpression: v.optional(v.boolean()), // Requires facial expression
      needsMultipleFrames: v.optional(v.boolean()), // Requires before/after frames
    }),
    // Caption pattern templates
    captionPatterns: v.array(v.string()), // ["Me when…", "My face when…", etc.]
    // Use cases
    useCases: v.optional(v.array(v.string())),
    // Example prompts for AI
    examplePrompts: v.optional(v.array(v.string())),
    // Sort order for display
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_templateType", ["templateType"])
    .index("by_isActive", ["isActive"]),

  // Meme generation jobs - tracks AI meme generation from video frames
  meme_generation_jobs: defineTable({
    actorProfileId: v.id("actor_profiles"),
    // Input type for unified R2 architecture
    inputType: v.optional(v.string()), // "youtube", "local"
    // Source video info
    sourceVideoUrl: v.string(),
    videoTitle: v.optional(v.string()),
    videoDuration: v.optional(v.number()),
    // R2 storage key for source video (unified architecture)
    r2SourceKey: v.optional(v.string()),
    // Movie metadata for context
    movieMetadata: v.optional(
      v.object({
        title: v.optional(v.string()),
        logline: v.optional(v.string()),
        genre: v.optional(v.string()),
        cast: v.optional(v.array(v.string())),
      })
    ),
    // Job configuration
    memeCount: v.number(), // Number of memes to generate
    targetTemplates: v.optional(v.array(v.string())), // Specific template types to use
    // Job status
    status: v.string(), // "pending", "downloading", "uploaded", "processing", "extracting_frames", "analyzing", "generating_captions", "completed", "failed"
    progress: v.optional(v.number()), // 0-100
    currentStep: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    errorStage: v.optional(v.string()), // Stage where error occurred
    // Processing lock (prevents duplicate workers)
    processingLockId: v.optional(v.string()),
    processingStartedAt: v.optional(v.number()),
    // External job tracking
    externalJobId: v.string(),
    // Timestamps
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_externalJobId", ["externalJobId"])
    .index("by_status", ["status"]),

  // Generated memes - AI-generated meme images with captions
  generated_memes: defineTable({
    jobId: v.id("meme_generation_jobs"),
    actorProfileId: v.id("actor_profiles"),
    // Template used
    templateType: v.string(),
    templateName: v.optional(v.string()),
    // Frame info (R2-based)
    frameTimestamp: v.optional(v.number()), // Timestamp in video (seconds)
    frameUrl: v.optional(v.string()), // URL for display
    r2FrameKey: v.optional(v.string()), // R2 key for frame image
    // Frame(s) used - can be single or multiple for before/after memes (legacy)
    frames: v.optional(v.array(
      v.object({
        storageId: v.optional(v.id("_storage")),
        url: v.string(),
        timestamp: v.number(), // Timestamp in video (seconds)
        // AI-detected features
        emotion: v.optional(v.string()),
        action: v.optional(v.string()),
        hasFaces: v.optional(v.boolean()),
        faceCount: v.optional(v.number()),
      })
    )),
    // AI-detected features from frame
    emotion: v.optional(v.string()),
    action: v.optional(v.string()),
    memeabilityScore: v.optional(v.number()),
    // Generated caption
    caption: v.string(),
    captionPosition: v.optional(v.string()), // "top", "bottom", "top_bottom"
    // Final composite meme image
    memeStorageId: v.optional(v.id("_storage")),
    memeUrl: v.optional(v.string()),
    r2MemeKey: v.optional(v.string()), // R2 key for meme image
    // AI analysis
    viralScore: v.optional(v.number()), // 0-100 predicted virality
    sentiment: v.optional(v.string()), // "funny", "relatable", "absurd", etc.
    suggestedHashtags: v.optional(v.array(v.string())),
    aiReasoning: v.optional(v.string()), // Why AI chose this frame/caption
    // User feedback
    isFavorite: v.optional(v.boolean()),
    isPublic: v.optional(v.boolean()),
    userRating: v.optional(v.number()), // 1-5 stars
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_templateType", ["templateType"])
    .index("by_viralScore", ["viralScore"]),

  // Meme upload sessions - Tracks multipart uploads to R2 for meme jobs
  meme_upload_sessions: defineTable({
    jobId: v.id("meme_generation_jobs"),
    // R2 multipart upload details
    r2Key: v.string(), // Target R2 key
    uploadId: v.string(), // R2 multipart upload ID
    partSize: v.number(), // Bytes per part
    totalParts: v.number(),
    // Completed parts - updated incrementally for resume support
    completedParts: v.array(
      v.object({
        partNumber: v.number(),
        etag: v.string(), // Store EXACTLY as returned (may include quotes)
      })
    ),
    bytesUploaded: v.number(),
    totalBytes: v.number(),
    // Session status
    status: v.string(), // "ACTIVE", "COMPLETED", "ABORTED"
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_jobId_status", ["jobId", "status"]),

  // Candidate frames - frames extracted from video for meme analysis
  meme_candidate_frames: defineTable({
    jobId: v.id("meme_generation_jobs"),
    actorProfileId: v.id("actor_profiles"),
    // Frame info
    storageId: v.optional(v.id("_storage")),
    url: v.string(),
    r2FrameKey: v.optional(v.string()), // R2 key for frame image (unified architecture)
    timestamp: v.number(), // Timestamp in video (seconds)
    // AI-detected features
    emotion: v.optional(v.string()), // "happy", "terrified", "smug", "disgusted", etc.
    emotionConfidence: v.optional(v.number()), // 0-1
    action: v.optional(v.string()), // "arguing", "sneaking", "falling", etc.
    actionConfidence: v.optional(v.number()), // 0-1
    // Face detection
    hasFaces: v.optional(v.boolean()),
    faceCount: v.optional(v.number()),
    facePositions: v.optional(
      v.array(
        v.object({
          x: v.number(),
          y: v.number(),
          width: v.number(),
          height: v.number(),
        })
      )
    ),
    // Scene description
    sceneDescription: v.optional(v.string()),
    // Potential template matches
    potentialTemplates: v.optional(v.array(v.string())), // Template types this frame could work with
    // Quality score
    qualityScore: v.optional(v.number()), // 0-100 image quality
    memeability: v.optional(v.number()), // 0-100 how good for memes
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_memeability", ["memeability"]),

  // Media assets - extracted images for social media, thumbnails, etc.
  media_assets: defineTable({
    actorProfileId: v.id("actor_profiles"),
    // Source reference (which video/clip this was extracted from)
    sourceType: v.string(), // "generated_clip", "youtube_clip", "youtube_video"
    sourceId: v.optional(v.string()), // ID of source clip or video URL
    sourceTitle: v.optional(v.string()), // Title of source video/clip
    // Asset metadata
    title: v.optional(v.string()), // User-defined title
    description: v.optional(v.string()), // User-defined description
    timestamp: v.optional(v.number()), // Timestamp in video where extracted (seconds)
    // Storage
    storageId: v.id("_storage"),
    url: v.string(),
    // Image dimensions
    width: v.number(),
    height: v.number(),
    aspectRatio: v.string(), // "9:16", "16:9", "1:1", etc.
    // Categorization
    assetType: v.string(), // "highlight", "thumbnail", "poster", "social"
    tags: v.optional(v.array(v.string())), // User-defined tags for organization
    // AI-detected features (for future AI enhancement)
    hasFaces: v.optional(v.boolean()),
    isAction: v.optional(v.boolean()),
    hasText: v.optional(v.boolean()),
    aiScore: v.optional(v.number()), // 0-100 quality/engagement score
    // Status
    isPublic: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_sourceType", ["sourceType"])
    .index("by_assetType", ["assetType"])
    .index("by_profile_type", ["actorProfileId", "assetType"]),

  // ============================================
  // TABLES FOR TIKTOK-STYLE APP
  // ============================================

  // Videos - TikTok-style video posts (separate from clips/generated_clips)
  videos: defineTable({
    userId: v.id("users"),
    actorProfileId: v.optional(v.id("actor_profiles")), // Optional link to actor profile
    description: v.string(),
    // Video storage
    storageId: v.optional(v.id("_storage")),
    videoUrl: v.optional(v.string()),
    // Thumbnail
    thumbnailStorageId: v.optional(v.id("_storage")),
    thumbnailUrl: v.optional(v.string()),
    // Engagement metrics
    likes: v.number(),
    commentCount: v.number(),
    shares: v.number(),
    views: v.number(),
    // Promotion/boost status
    isPromoted: v.optional(v.boolean()),
    campaignId: v.optional(v.id("boost_campaigns")),
    // Tags and categorization
    tags: v.optional(v.array(v.string())),
    soundId: v.optional(v.id("sounds")),
    // Visibility
    isPublic: v.optional(v.boolean()),
    // Duration in seconds
    duration: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_isPromoted", ["isPromoted"]),

  // Video comments - Comments on video posts (separate from actor profile comments)
  video_comments: defineTable({
    videoId: v.id("videos"),
    userId: v.id("users"),
    text: v.string(),
    likes: v.number(),
    // For nested replies
    parentId: v.optional(v.id("video_comments")),
    createdAt: v.number(),
  })
    .index("by_video", ["videoId"])
    .index("by_user", ["userId"])
    .index("by_parent", ["parentId"]),

  // Video likes - Track who liked what (for toggle functionality)
  video_likes: defineTable({
    videoId: v.id("videos"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_video", ["videoId"])
    .index("by_user", ["userId"])
    .index("by_video_user", ["videoId", "userId"]),

  // Comment likes
  comment_likes: defineTable({
    commentId: v.id("video_comments"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_comment", ["commentId"])
    .index("by_comment_user", ["commentId", "userId"]),

  // Hashtags - Trending tags
  hashtags: defineTable({
    tag: v.string(), // e.g., "viral", "trending"
    videoCount: v.number(),
    viewCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_tag", ["tag"])
    .index("by_videoCount", ["videoCount"]),

  // User hashtag follows
  hashtag_follows: defineTable({
    hashtagId: v.id("hashtags"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_hashtag", ["hashtagId"])
    .index("by_user", ["userId"])
    .index("by_hashtag_user", ["hashtagId", "userId"]),

  // Sounds - Audio tracks for videos
  sounds: defineTable({
    name: v.string(),
    artistName: v.string(),
    artistUserId: v.optional(v.id("users")),
    // Audio storage
    storageId: v.optional(v.id("_storage")),
    audioUrl: v.optional(v.string()),
    duration: v.number(), // seconds
    videoCount: v.number(), // How many videos use this sound
    createdAt: v.number(),
  })
    .index("by_artist", ["artistUserId"])
    .index("by_videoCount", ["videoCount"]),

  // Sound favorites
  sound_favorites: defineTable({
    soundId: v.id("sounds"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_sound", ["soundId"])
    .index("by_user", ["userId"])
    .index("by_sound_user", ["soundId", "userId"]),

  // Notifications
  notifications: defineTable({
    userId: v.id("users"), // Who receives the notification
    type: v.string(), // "like", "comment", "follow", "mention", "campaign", "message"
    fromUserId: v.optional(v.id("users")), // Who triggered it (null for system)
    message: v.string(),
    // Related entities
    videoId: v.optional(v.id("videos")),
    commentId: v.optional(v.id("video_comments")),
    campaignId: v.optional(v.id("boost_campaigns")),
    // Status
    isRead: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_unread", ["userId", "isRead"])
    .index("by_createdAt", ["createdAt"]),

  // Conversations - Direct messaging
  conversations: defineTable({
    // Participants (for 1:1 chats, store both user IDs)
    participantIds: v.array(v.id("users")),
    lastMessageText: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_lastMessage", ["lastMessageAt"]),

  // Conversation participants - For querying conversations by user
  conversation_participants: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    unreadCount: v.number(),
    lastReadAt: v.optional(v.number()),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_user", ["userId"])
    .index("by_user_conversation", ["userId", "conversationId"]),

  // Messages
  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    text: v.string(),
    isRead: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_sender", ["senderId"]),

  // A/B Tests for campaigns
  ab_tests: defineTable({
    campaignId: v.id("boost_campaigns"),
    name: v.string(),
    status: v.string(), // "running", "completed"
    // Variant A
    variantACopy: v.string(),
    variantAImpressions: v.number(),
    variantAClicks: v.number(),
    variantACtr: v.number(),
    variantAConversions: v.number(),
    // Variant B
    variantBCopy: v.string(),
    variantBImpressions: v.number(),
    variantBClicks: v.number(),
    variantBCtr: v.number(),
    variantBConversions: v.number(),
    // Results
    winner: v.optional(v.string()), // "A", "B", or null
    startDate: v.number(),
    endDate: v.optional(v.number()),
  })
    .index("by_campaign", ["campaignId"])
    .index("by_status", ["status"]),

  // User follows - Track follow relationships
  user_follows: defineTable({
    followerId: v.id("users"),
    followingId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_follower", ["followerId"])
    .index("by_following", ["followingId"])
    .index("by_follower_following", ["followerId", "followingId"]),

  // ============================================
  // IMAGE POSTS - For profile images tab
  // ============================================

  image_posts: defineTable({
    userId: v.id("users"),
    actorProfileId: v.optional(v.id("actor_profiles")),
    // Image storage
    storageId: v.id("_storage"),
    imageUrl: v.string(),
    // Metadata
    caption: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    // Dimensions
    width: v.number(),
    height: v.number(),
    aspectRatio: v.string(), // "1:1", "4:5", "16:9", etc.
    // Engagement
    likes: v.number(),
    commentCount: v.number(),
    shares: v.number(),
    // Visibility
    isPublic: v.optional(v.boolean()),
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_createdAt", ["createdAt"]),

  // Image post likes
  image_likes: defineTable({
    imagePostId: v.id("image_posts"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_imagePost", ["imagePostId"])
    .index("by_user", ["userId"])
    .index("by_imagePost_user", ["imagePostId", "userId"]),

  // Image post comments
  image_comments: defineTable({
    imagePostId: v.id("image_posts"),
    userId: v.id("users"),
    text: v.string(),
    likes: v.number(),
    parentId: v.optional(v.id("image_comments")),
    createdAt: v.number(),
  })
    .index("by_imagePost", ["imagePostId"])
    .index("by_user", ["userId"])
    .index("by_parent", ["parentId"]),

  // ============================================
  // BROWSER-FIRST VIDEO PROCESSING (R2 + Modal)
  // ============================================

  // Processing jobs - Video processing jobs using browser-first ingestion
  // User uploads video to R2, Modal processes it
  processing_jobs: defineTable({
    userId: v.id("users"),
    actorProfileId: v.optional(v.id("actor_profiles")),
    // Job status
    status: v.string(), // "CREATED", "UPLOADING", "UPLOADED", "PROCESSING", "READY", "FAILED"
    // Input type
    inputType: v.string(), // "youtube", "local"
    sourceUrl: v.optional(v.string()), // YouTube URL reference (not fetched by backend)
    videoId: v.optional(v.string()), // YouTube video ID if applicable
    title: v.optional(v.string()),
    // R2 storage key for source video
    r2SourceKey: v.optional(v.string()),
    // Processing lock (prevents duplicate workers)
    processingLockId: v.optional(v.string()),
    processingStartedAt: v.optional(v.number()),
    attemptCount: v.number(), // Default: 0
    // Error tracking
    error: v.optional(v.string()),
    errorStage: v.optional(v.string()),
    // Progress tracking for real-time updates
    progress: v.optional(v.number()), // 0-100 percentage
    currentStep: v.optional(v.string()), // Current processing step description
    // Processing configuration
    clipCount: v.optional(v.number()), // Number of clips to generate
    layout: v.optional(v.string()), // "gaming", "podcast", "standard"
    // Clip duration controls
    minClipDuration: v.optional(v.number()), // Min clip length in seconds (default 15)
    maxClipDuration: v.optional(v.number()), // Max clip length in seconds (default 60)
    // Output format
    aspectRatio: v.optional(v.string()), // "9:16", "16:9", "1:1" (default "9:16")
    // Clip tone/style for AI analysis
    clipTone: v.optional(v.string()), // "viral", "educational", "funny", "dramatic", "highlights", "inspirational"
    // Enhanced caption styling
    captionStyle: v.optional(
      v.object({
        highlightColor: v.optional(v.string()), // BGR hex color (e.g., "00FFFF" for cyan)
        fontFamily: v.optional(v.string()), // Font name (e.g., "Arial Black", "Impact")
        fontSize: v.optional(v.string()), // "small", "medium", "large"
        fontScale: v.optional(v.number()), // Legacy: numeric scale factor
        position: v.optional(v.string()), // "bottom", "center", "top"
        style: v.optional(v.string()), // "word-highlight", "karaoke", "static"
        outline: v.optional(v.boolean()), // Show text outline
        shadow: v.optional(v.boolean()), // Show text shadow
      })
    ),
    // Video metadata (populated after upload/analysis)
    videoDuration: v.optional(v.number()), // seconds
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_status", ["status"])
    .index("by_userId_status", ["userId", "status"]),

  // ============================================
  // YOUTUBE URL → R2 → MODAL VIDEO WORKFLOW
  // ============================================

  // New jobs dedicated to the browser-mediated YouTube workflow
  video_jobs: defineTable({
    userId: v.id("users"),
    // Source info
    sourceUrl: v.string(), // Original YouTube URL
    videoId: v.optional(v.string()), // Parsed YouTube ID
    sourceMeta: v.optional(
      v.object({
        title: v.optional(v.string()),
        thumbnailUrl: v.optional(v.string()),
        duration: v.optional(v.number()), // seconds
        authorName: v.optional(v.string()),
      })
    ),
    // Rights attestation
    rightsConfirmedAt: v.optional(v.number()),
    // Upload + processing state machine
    status: v.string(), // CREATED → META_READY → UPLOAD_READY → UPLOADING → UPLOADED → PROCESSING → READY/FAILED
    progress: v.optional(v.number()),
    currentStep: v.optional(v.string()),
    error: v.optional(v.string()),
    errorStage: v.optional(v.string()),
    // R2 linkage
    r2SourceKey: v.optional(v.string()),
    uploadSessionId: v.optional(v.id("video_upload_sessions")),
    // Outputs
    artifactIds: v.optional(v.array(v.id("video_artifacts"))),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_userId_status", ["userId", "status"]),

  // Upload sessions for video_jobs (kept separate from legacy processing uploads)
  video_upload_sessions: defineTable({
    jobId: v.id("video_jobs"),
    // R2 multipart upload details
    r2Key: v.string(), // Target R2 key
    uploadId: v.string(), // R2 multipart upload ID
    partSize: v.number(), // Bytes per part
    totalParts: v.number(),
    // Completed parts - updated incrementally for resume support
    completedParts: v.array(
      v.object({
        partNumber: v.number(),
        etag: v.string(), // Store EXACTLY as returned (may include quotes)
      })
    ),
    bytesUploaded: v.number(),
    totalBytes: v.number(),
    // Session status
    status: v.string(), // "ACTIVE", "COMPLETED", "ABORTED"
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_jobId_status", ["jobId", "status"]),

  // Artifacts generated from video_jobs processing (clips/gifs/etc.)
  video_artifacts: defineTable({
    jobId: v.id("video_jobs"),
    userId: v.id("users"),
    // Artifact metadata
    artifactType: v.string(), // "clip", "gif", "meme", "transcript"
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    duration: v.optional(v.number()), // seconds
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    // R2 storage keys
    r2Key: v.string(),
    r2ThumbKey: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_userId", ["userId"]),

  // Upload sessions - Tracks multipart uploads to R2
  upload_sessions: defineTable({
    jobId: v.id("processing_jobs"),
    // R2 multipart upload details
    r2Key: v.string(), // Target R2 key
    uploadId: v.string(), // R2 multipart upload ID
    partSize: v.number(), // Bytes per part
    totalParts: v.number(),
    // Completed parts - updated incrementally for resume support
    completedParts: v.array(
      v.object({
        partNumber: v.number(),
        etag: v.string(), // Store EXACTLY as returned (may include quotes)
      })
    ),
    bytesUploaded: v.number(),
    totalBytes: v.number(),
    // Session status
    status: v.string(), // "ACTIVE", "COMPLETED", "ABORTED"
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_jobId_status", ["jobId", "status"]),

  // Processing clips - Clips generated from processing jobs
  processing_clips: defineTable({
    jobId: v.id("processing_jobs"),
    userId: v.id("users"),
    actorProfileId: v.optional(v.id("actor_profiles")),
    // Clip metadata
    clipIndex: v.number(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    transcript: v.optional(v.string()),
    // Timing
    startTime: v.number(), // Seconds
    endTime: v.number(), // Seconds
    duration: v.number(), // Seconds
    // R2 storage
    r2ClipKey: v.string(),
    r2ThumbKey: v.optional(v.string()),
    // Scoring
    score: v.optional(v.number()), // 0-100 viral/engagement score
    // Face detection
    hasFaces: v.optional(v.boolean()),
    facePositions: v.optional(
      v.array(
        v.object({
          x: v.number(),
          y: v.number(),
          width: v.number(),
          height: v.number(),
          timestamp: v.number(),
        })
      )
    ),
    // Layout used
    layout: v.optional(v.string()),
    captionStyle: v.optional(v.string()),
    // Viral analysis
    viralAnalysis: v.optional(
      v.object({
        hookStrength: v.optional(v.number()),
        retentionScore: v.optional(v.number()),
        shareabilityScore: v.optional(v.number()),
        suggestedHashtags: v.optional(v.array(v.string())),
        summary: v.optional(v.string()),
      })
    ),
    // Visibility
    isPublic: v.optional(v.boolean()),
    // Custom 9:16 thumbnail (user-selected)
    customThumbnailStorageId: v.optional(v.id("_storage")),
    customThumbnailUrl: v.optional(v.string()),
    // Timestamp in clip (seconds) used for custom thumbnail extraction
    thumbnailTimestamp: v.optional(v.number()),
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_userId", ["userId"])
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_score", ["score"]),

  // Clip timestamps - AI-generated or system-generated timestamps for clipping
  clip_timestamps: defineTable({
    jobId: v.id("processing_jobs"),
    // Timestamps array
    timestamps: v.array(
      v.object({
        start: v.number(), // Seconds
        end: v.number(), // Seconds
        reason: v.optional(v.string()), // Why AI selected this segment
        title: v.optional(v.string()), // Suggested clip title
        score: v.optional(v.number()), // Predicted viral score
      })
    ),
    // Source of timestamps
    source: v.string(), // "equal_segments", "scene_detection", "ai_analysis"
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_jobId", ["jobId"]),

  // ============================================
  // AI EMAIL CRM SYSTEM
  // ============================================

  // Campaign templates - Reusable prompt templates for email generation
  campaign_templates: defineTable({
    // Template identity
    key: v.string(), // e.g., "welcome", "newsletter", "coming_soon", "event", "screening", "trailer_drop", "bts_update", "premiere_reminder"
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(), // "onboarding", "engagement", "announcement", "event", "promotional"

    // Prompt configuration
    systemPrompt: v.string(), // Base system prompt for the AI
    userPromptTemplate: v.string(), // Template with {variables}

    // Available variables for this template
    availableVariables: v.array(v.string()), // e.g., ["creator_name", "movie_title", "tagline", "bio", "location", "release_window", "event_date", "event_time", "event_venue", "cta_url", "trailer_transcript_summary", "clip_highlights", "audience_tagline"]

    // Subject line templates (for A/B testing)
    subjectLineTemplates: v.array(v.string()),

    // Tone/style options
    supportedTones: v.array(v.string()), // "formal", "hype", "heartfelt", "informational", "casual"
    defaultTone: v.string(),

    // Brevity options
    supportedBrevityLevels: v.array(v.string()), // "short", "medium", "detailed"
    defaultBrevity: v.string(),

    // Template metadata
    isActive: v.boolean(),
    isSystemTemplate: v.boolean(), // System templates can't be deleted
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_key", ["key"])
    .index("by_category", ["category"])
    .index("by_isActive", ["isActive"]),

  // Email campaigns - Individual campaign records
  email_campaigns: defineTable({
    actorProfileId: v.id("actor_profiles"),
    createdByUserId: v.id("users"),

    // Campaign identity
    name: v.string(),
    templateKey: v.optional(v.string()), // Reference to campaign_templates.key

    // Campaign status
    status: v.string(), // "draft", "generating", "ready", "scheduled", "sending", "sent", "failed", "cancelled"

    // Content - generated by AI or manually edited
    subject: v.string(),
    preheaderText: v.optional(v.string()), // Preview text in email clients
    htmlContent: v.string(),
    textContent: v.string(),

    // AI generation metadata
    aiGenerated: v.boolean(),
    generationPrompt: v.optional(v.string()), // The actual prompt used
    generationTone: v.optional(v.string()), // "formal", "hype", "heartfelt", "informational"
    generationBrevity: v.optional(v.string()), // "short", "medium", "detailed"

    // Data context used for generation (stored for transparency/debugging)
    dataContext: v.optional(
      v.object({
        creatorName: v.optional(v.string()),
        movieTitle: v.optional(v.string()),
        tagline: v.optional(v.string()),
        bio: v.optional(v.string()),
        location: v.optional(v.string()),
        releaseWindow: v.optional(v.string()),
        eventDate: v.optional(v.string()),
        eventTime: v.optional(v.string()),
        eventVenue: v.optional(v.string()),
        ctaUrl: v.optional(v.string()),
        ctaText: v.optional(v.string()),
        trailerTranscriptSummary: v.optional(v.string()),
        clipHighlights: v.optional(v.array(v.string())),
        audienceTagline: v.optional(v.string()),
        customFields: v.optional(v.any()), // For future extensibility
      })
    ),

    // Audience targeting
    audienceType: v.string(), // "creator_subscribers", "site_wide", "tagged", "custom"
    audienceTags: v.optional(v.array(v.string())), // For tagged audience type
    estimatedRecipientCount: v.optional(v.number()),

    // Sender identity
    senderIdentityId: v.optional(v.id("sender_identities")),
    fromName: v.string(),
    replyTo: v.optional(v.string()),

    // Scheduling
    scheduledAt: v.optional(v.number()), // Unix timestamp for scheduled send
    sentAt: v.optional(v.number()), // When actually sent

    // Metrics (updated after sending)
    recipientCount: v.optional(v.number()),
    deliveredCount: v.optional(v.number()),
    openCount: v.optional(v.number()),
    clickCount: v.optional(v.number()),
    bounceCount: v.optional(v.number()),
    unsubscribeCount: v.optional(v.number()),
    spamCount: v.optional(v.number()),

    // Tracking
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_createdBy", ["createdByUserId"])
    .index("by_status", ["status"])
    .index("by_actorProfile_status", ["actorProfileId", "status"])
    .index("by_scheduledAt", ["scheduledAt"]),

  // Campaign recipients - Track individual email sends
  campaign_recipients: defineTable({
    campaignId: v.id("email_campaigns"),
    fanEmailId: v.id("fan_emails"),

    // Recipient info (denormalized for performance)
    email: v.string(),
    name: v.optional(v.string()),

    // Delivery status
    status: v.string(), // "pending", "sent", "delivered", "bounced", "failed"
    resendEmailId: v.optional(v.string()), // Resend's email ID for tracking

    // Error tracking
    errorMessage: v.optional(v.string()),

    // Engagement tracking
    openedAt: v.optional(v.number()),
    clickedAt: v.optional(v.number()),

    // Timestamps
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_campaign", ["campaignId"])
    .index("by_fanEmail", ["fanEmailId"])
    .index("by_campaign_status", ["campaignId", "status"])
    .index("by_email", ["email"]),

  // Campaign events - Track opens, clicks, bounces, etc.
  campaign_events: defineTable({
    campaignId: v.id("email_campaigns"),
    recipientId: v.optional(v.id("campaign_recipients")),

    // Event details
    eventType: v.string(), // "sent", "delivered", "opened", "clicked", "bounced", "unsubscribed", "complained"

    // Click-specific data
    clickUrl: v.optional(v.string()),

    // Metadata from webhook
    metadata: v.optional(v.any()),

    // Timestamps
    occurredAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_campaign", ["campaignId"])
    .index("by_recipient", ["recipientId"])
    .index("by_campaign_eventType", ["campaignId", "eventType"]),

  // Audience tags - Tag definitions for audience segmentation
  audience_tags: defineTable({
    actorProfileId: v.optional(v.id("actor_profiles")), // null = site-wide tag

    // Tag identity
    name: v.string(),
    slug: v.string(), // URL-safe identifier
    description: v.optional(v.string()),
    color: v.optional(v.string()), // Hex color for UI

    // Tag type
    tagType: v.string(), // "creator", "site_wide", "genre", "geography", "interest", "behavior"

    // Auto-assignment rules (future)
    autoAssignRules: v.optional(
      v.object({
        signupSource: v.optional(v.array(v.string())), // e.g., ["trailer_page", "premiere_event"]
        genre: v.optional(v.array(v.string())),
        location: v.optional(v.array(v.string())),
      })
    ),

    // Counts (denormalized)
    subscriberCount: v.optional(v.number()),

    // Status
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_slug", ["slug"])
    .index("by_tagType", ["tagType"])
    .index("by_actorProfile_slug", ["actorProfileId", "slug"]),

  // Subscriber tags - Many-to-many relationship between fan_emails and audience_tags
  subscriber_tags: defineTable({
    fanEmailId: v.id("fan_emails"),
    tagId: v.id("audience_tags"),

    // Assignment metadata
    assignedAt: v.number(),
    assignedBy: v.optional(v.string()), // "auto", "manual", "import", "signup"
    source: v.optional(v.string()), // More specific source info
  })
    .index("by_fanEmail", ["fanEmailId"])
    .index("by_tag", ["tagId"])
    .index("by_fanEmail_tag", ["fanEmailId", "tagId"]),

  // Sender identities - Per-creator sender configuration
  sender_identities: defineTable({
    actorProfileId: v.id("actor_profiles"),

    // Sender info
    fromName: v.string(), // Display name in "from" field
    replyToEmail: v.optional(v.string()), // Reply-to address

    // Footer/legal
    physicalAddress: v.optional(v.string()), // CAN-SPAM requirement for marketing emails
    customFooterHtml: v.optional(v.string()), // Custom footer content
    customFooterText: v.optional(v.string()),

    // Branding
    logoStorageId: v.optional(v.id("_storage")),
    logoUrl: v.optional(v.string()),
    brandColor: v.optional(v.string()), // Hex color

    // Status
    isDefault: v.boolean(),
    isVerified: v.boolean(), // For future domain verification
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_actorProfile_isDefault", ["actorProfileId", "isDefault"]),

  // Transcript summaries - Cached AI summaries of video transcripts
  transcript_summaries: defineTable({
    // Source reference
    sourceType: v.string(), // "youtube_url", "clip", "generated_clip", "project_trailer"
    sourceId: v.string(), // URL or ID of source
    actorProfileId: v.optional(v.id("actor_profiles")),

    // Original transcript (reference)
    transcriptionId: v.optional(v.id("transcriptions")),

    // AI-generated summaries at different lengths
    shortSummary: v.string(), // 1-2 sentences
    mediumSummary: v.string(), // 3-5 sentences
    detailedSummary: v.optional(v.string()), // Full paragraph

    // Key highlights extracted
    keyHighlights: v.optional(v.array(v.string())), // Bullet points
    quotableLines: v.optional(v.array(v.string())), // Good quotes for marketing

    // Metadata
    transcriptLength: v.optional(v.number()), // Character count of original
    generatedAt: v.number(),
    expiresAt: v.optional(v.number()), // For cache invalidation
  })
    .index("by_sourceId", ["sourceId"])
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_sourceType", ["sourceType"]),

  // ============================================
  // SOCIAL MEDIA POSTING MODULE
  // ============================================

  // Social accounts - OAuth credentials for connected social platforms
  social_accounts: defineTable({
    userId: v.id("users"),
    actorProfileId: v.id("actor_profiles"),

    // Platform identification
    provider: v.string(), // "instagram", "facebook", "twitter", "tiktok", "youtube", "linkedin"
    providerUserId: v.string(), // User ID from the platform

    // OAuth tokens (encrypted)
    accessTokenEncrypted: v.string(),
    refreshTokenEncrypted: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()), // Unix timestamp

    // Scopes granted
    scopes: v.array(v.string()),

    // Account metadata from provider
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    profileImageUrl: v.optional(v.string()),
    followerCount: v.optional(v.number()),

    // Account status
    status: v.string(), // "active", "expired", "revoked", "error"
    lastError: v.optional(v.string()),
    lastErrorAt: v.optional(v.number()),

    // Permissions
    autoPostEnabled: v.optional(v.boolean()), // User explicitly enabled auto-posting

    // Timestamps
    connectedAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    lastRefreshedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_provider", ["provider"])
    .index("by_actorProfile_provider", ["actorProfileId", "provider"])
    .index("by_providerUserId", ["provider", "providerUserId"])
    .index("by_status", ["status"]),

  // Social pages - For Facebook Pages, Instagram Business accounts, LinkedIn Pages, YouTube Channels
  social_pages: defineTable({
    socialAccountId: v.id("social_accounts"),
    actorProfileId: v.id("actor_profiles"),

    // Page/channel identification
    pageId: v.string(), // Platform-specific page/channel ID
    pageType: v.string(), // "facebook_page", "instagram_business", "linkedin_page", "youtube_channel"

    // Page metadata
    name: v.string(),
    username: v.optional(v.string()),
    profileImageUrl: v.optional(v.string()),
    followerCount: v.optional(v.number()),
    category: v.optional(v.string()), // Page category from platform

    // Page-specific token (some platforms require separate page tokens)
    accessTokenEncrypted: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),

    // Status
    isDefault: v.optional(v.boolean()), // Default page for this provider
    status: v.string(), // "active", "expired", "disconnected"

    // Timestamps
    connectedAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_socialAccount", ["socialAccountId"])
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_pageId", ["pageId"])
    .index("by_actorProfile_pageType", ["actorProfileId", "pageType"]),

  // Social posts - Post drafts, scheduled posts, and published posts
  social_posts: defineTable({
    userId: v.id("users"),
    actorProfileId: v.id("actor_profiles"),

    // Post content
    caption: v.string(),
    hashtags: v.optional(v.array(v.string())),
    link: v.optional(v.string()), // film.flmlnk.com/f/{slug} or custom link

    // Asset references
    assetRefs: v.optional(
      v.array(
        v.object({
          type: v.string(), // "image", "video", "clip", "meme"
          sourceTable: v.string(), // "image_manager_assets", "processing_clips", "generated_memes"
          sourceId: v.string(), // ID in the source table
          r2Key: v.optional(v.string()), // R2 storage key
          storageId: v.optional(v.string()), // Convex storage ID
          url: v.optional(v.string()), // Direct URL
          mimeType: v.optional(v.string()),
          duration: v.optional(v.number()), // For videos
          width: v.optional(v.number()),
          height: v.optional(v.number()),
        })
      )
    ),

    // Target platforms and pages
    platforms: v.array(
      v.object({
        provider: v.string(), // "instagram", "facebook", "twitter", "tiktok", "youtube", "linkedin"
        socialAccountId: v.optional(v.id("social_accounts")),
        socialPageId: v.optional(v.id("social_pages")),
        // Platform-specific content variations
        captionOverride: v.optional(v.string()),
        hashtagsOverride: v.optional(v.array(v.string())),
      })
    ),

    // Post status
    status: v.string(), // "draft", "queued", "scheduled", "posting", "posted", "partially_posted", "failed"

    // Scheduling
    scheduledAt: v.optional(v.number()), // Unix timestamp for scheduled post
    postingStartedAt: v.optional(v.number()),
    postedAt: v.optional(v.number()),

    // Platform results (updated after posting)
    platformResults: v.optional(
      v.array(
        v.object({
          provider: v.string(),
          pageId: v.optional(v.string()),
          success: v.boolean(),
          externalPostId: v.optional(v.string()), // Platform's post ID
          externalPostUrl: v.optional(v.string()), // Direct link to post
          error: v.optional(v.string()),
          postedAt: v.optional(v.number()),
        })
      )
    ),

    // AI generation metadata
    aiGenerated: v.optional(v.boolean()),
    generationPrompt: v.optional(v.string()),
    generationTone: v.optional(v.string()), // "hype", "informative", "press", "casual"

    // Content flags
    isSponsoredContent: v.optional(v.boolean()), // Requires branded content tags
    brandedContentTags: v.optional(v.array(v.string())),

    // UTM tracking
    utmSource: v.optional(v.string()),
    utmMedium: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),

    // Retry handling
    retryCount: v.optional(v.number()),
    lastRetryAt: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()), // For preventing duplicate posts

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_status", ["status"])
    .index("by_scheduledAt", ["scheduledAt"])
    .index("by_actorProfile_status", ["actorProfileId", "status"]),

  // Post candidates - AI-suggested posts from assets
  post_candidates: defineTable({
    actorProfileId: v.id("actor_profiles"),

    // Source asset reference
    assetType: v.string(), // "image", "clip", "meme"
    assetSourceTable: v.string(), // "image_manager_assets", "processing_clips", "generated_memes"
    assetSourceId: v.string(),

    // Asset metadata snapshot
    assetTitle: v.optional(v.string()),
    assetDescription: v.optional(v.string()),
    assetThumbnailUrl: v.optional(v.string()),
    assetDuration: v.optional(v.number()), // For videos
    assetAspectRatio: v.optional(v.string()),

    // AI-generated suggestions
    suggestedCaption: v.string(),
    suggestedHashtags: v.array(v.string()),
    suggestedLink: v.optional(v.string()), // film.flmlnk.com/f/{slug}

    // Platform fitness scores (0-100)
    platformFitness: v.object({
      instagram: v.optional(v.number()),
      facebook: v.optional(v.number()),
      twitter: v.optional(v.number()),
      tiktok: v.optional(v.number()),
      youtube: v.optional(v.number()),
      linkedin: v.optional(v.number()),
    }),

    // Content analysis
    contentKeywords: v.optional(v.array(v.string())),
    contentTone: v.optional(v.string()), // "funny", "dramatic", "informative", "emotional"
    contentCategory: v.optional(v.string()), // "behind_scenes", "trailer_clip", "meme", "announcement"

    // AI reasoning
    aiReasoning: v.optional(v.string()), // Why this was suggested

    // Status
    status: v.string(), // "pending", "approved", "rejected", "used"
    usedInPostId: v.optional(v.id("social_posts")),

    // Timestamps
    generatedAt: v.number(),
    reviewedAt: v.optional(v.number()),
  })
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_status", ["status"])
    .index("by_assetSourceId", ["assetSourceTable", "assetSourceId"])
    .index("by_actorProfile_status", ["actorProfileId", "status"]),

  // Social post metrics - Track engagement metrics per post per platform
  social_post_metrics: defineTable({
    socialPostId: v.id("social_posts"),
    provider: v.string(),
    externalPostId: v.string(),

    // Engagement metrics
    impressions: v.optional(v.number()),
    reach: v.optional(v.number()),
    likes: v.optional(v.number()),
    comments: v.optional(v.number()),
    shares: v.optional(v.number()),
    saves: v.optional(v.number()),
    clicks: v.optional(v.number()),
    videoViews: v.optional(v.number()),
    videoWatchTime: v.optional(v.number()), // Seconds

    // Engagement rate (calculated)
    engagementRate: v.optional(v.number()),

    // Platform-specific metrics
    platformSpecificMetrics: v.optional(v.any()),

    // Tracking info
    lastFetchedAt: v.number(),
    fetchCount: v.optional(v.number()),
  })
    .index("by_socialPost", ["socialPostId"])
    .index("by_externalPostId", ["provider", "externalPostId"]),

  // OAuth state - Temporary storage for OAuth flow state
  oauth_states: defineTable({
    userId: v.id("users"),
    actorProfileId: v.id("actor_profiles"),

    // OAuth flow state
    state: v.string(), // Random state parameter
    codeVerifier: v.string(), // PKCE code verifier
    provider: v.string(),
    scopes: v.array(v.string()),

    // Flow metadata
    redirectUri: v.string(),
    initiatedAt: v.number(),
    expiresAt: v.number(), // State expires after 10 minutes
  })
    .index("by_state", ["state"])
    .index("by_userId", ["userId"]),

  // ============================================
  // GIF GENERATOR MODULE
  // ============================================

  // GIF generation jobs - tracks AI GIF generation from video
  gif_generation_jobs: defineTable({
    actorProfileId: v.id("actor_profiles"),
    // Input type for unified R2 architecture
    inputType: v.optional(v.string()), // "youtube", "local", "existing_clip"
    // Source video info
    sourceVideoUrl: v.string(),
    videoTitle: v.optional(v.string()),
    videoDuration: v.optional(v.number()),
    // R2 storage key for source video (unified architecture)
    r2SourceKey: v.optional(v.string()),
    // Reference to existing clip if using clip as source
    sourceClipId: v.optional(v.id("generated_clips")),
    sourceProcessingClipId: v.optional(v.id("processing_clips")),
    // Job configuration
    gifCount: v.number(), // Number of GIFs to generate
    maxDurationSeconds: v.optional(v.number()), // Max GIF duration (default 8s)
    targetWidth: v.optional(v.number()), // Target width (default 480px)
    frameRate: v.optional(v.number()), // Frame rate (default 10-15 fps)
    // Job status
    status: v.string(), // "pending", "downloading", "uploaded", "analyzing", "generating", "completed", "failed"
    progress: v.optional(v.number()), // 0-100
    currentStep: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    errorStage: v.optional(v.string()), // Stage where error occurred
    // Processing lock (prevents duplicate workers)
    processingLockId: v.optional(v.string()),
    processingStartedAt: v.optional(v.number()),
    // External job tracking
    externalJobId: v.string(),
    // Timestamps
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_externalJobId", ["externalJobId"])
    .index("by_status", ["status"]),

  // Generated GIFs - AI-generated GIF files with optional text overlays
  generated_gifs: defineTable({
    jobId: v.id("gif_generation_jobs"),
    actorProfileId: v.id("actor_profiles"),
    // GIF metadata
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    // Timing info from source video
    startTime: v.number(), // Start time in source video (seconds)
    endTime: v.number(), // End time in source video (seconds)
    duration: v.number(), // GIF duration in seconds
    // GIF file info
    r2GifKey: v.optional(v.string()), // R2 key for GIF file
    gifUrl: v.optional(v.string()), // Direct URL for display
    storageId: v.optional(v.id("_storage")), // Convex storage ID (fallback)
    // Alternative formats
    r2Mp4Key: v.optional(v.string()), // R2 key for MP4 fallback
    mp4Url: v.optional(v.string()),
    r2WebpKey: v.optional(v.string()), // R2 key for WebP fallback
    webpUrl: v.optional(v.string()),
    // File dimensions and size
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    fileSize: v.optional(v.number()), // Bytes
    frameRate: v.optional(v.number()),
    frameCount: v.optional(v.number()),
    // Text overlay
    overlayText: v.optional(v.string()), // Caption/overlay text
    overlayStyle: v.optional(v.string()), // "caption_bar", "meme_top_bottom", "subtitle", "none"
    overlayPosition: v.optional(v.string()), // "top", "bottom", "top_bottom", "center"
    // AI analysis results
    viralScore: v.optional(v.number()), // 0-100 predicted virality
    humorScore: v.optional(v.number()), // 0-100 humor rating
    emotionalIntensity: v.optional(v.number()), // 0-100 emotional peak score
    suggestedHashtags: v.optional(v.array(v.string())),
    aiReasoning: v.optional(v.string()), // Why AI selected this moment
    // Transcript snippet for this segment
    transcript: v.optional(v.string()),
    // Detected content features
    hasAudioPeak: v.optional(v.boolean()), // High energy/loudness
    hasSentimentSpike: v.optional(v.boolean()), // Strong sentiment change
    hasLaughter: v.optional(v.boolean()), // Detected laughter
    hasKeywords: v.optional(v.array(v.string())), // Viral keywords found
    // User feedback and curation
    isFavorite: v.optional(v.boolean()),
    isPublic: v.optional(v.boolean()),
    userRating: v.optional(v.number()), // 1-5 stars
    // NSFW/safety filtering
    isSafe: v.optional(v.boolean()),
    safetyFlags: v.optional(v.array(v.string())),
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_viralScore", ["viralScore"]),

  // GIF candidate moments - Detected viral/funny moments before GIF generation
  gif_candidate_moments: defineTable({
    jobId: v.id("gif_generation_jobs"),
    actorProfileId: v.id("actor_profiles"),
    // Timing in source video
    startTime: v.number(), // seconds
    endTime: v.number(), // seconds
    duration: v.number(), // seconds
    // R2 key for preview thumbnail
    r2ThumbnailKey: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    // Transcript for this segment
    transcript: v.optional(v.string()),
    // AI scoring
    viralScore: v.number(), // 0-100 overall viral potential
    humorScore: v.optional(v.number()), // 0-100
    emotionalIntensity: v.optional(v.number()), // 0-100
    surpriseScore: v.optional(v.number()), // 0-100
    ctaStrength: v.optional(v.number()), // 0-100 call-to-action strength
    // Detection signals
    audioEnergy: v.optional(v.number()), // Loudness/energy level
    sentimentValue: v.optional(v.number()), // -1 to 1 sentiment
    sentimentMagnitude: v.optional(v.number()), // Strength of sentiment
    hasLaughter: v.optional(v.boolean()),
    speakerTurns: v.optional(v.number()), // Number of speaker changes
    disfluencyCount: v.optional(v.number()), // "um", "uh", etc.
    // Suggested overlay text
    suggestedOverlayText: v.optional(v.string()),
    suggestedOverlayStyle: v.optional(v.string()),
    // AI reasoning
    reasoning: v.optional(v.string()),
    // Selection status
    isSelected: v.optional(v.boolean()), // User selected for GIF generation
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_viralScore", ["viralScore"]),

  // GIF upload sessions - Tracks multipart uploads to R2 for GIF jobs
  gif_upload_sessions: defineTable({
    jobId: v.id("gif_generation_jobs"),
    // R2 multipart upload details
    r2Key: v.string(), // Target R2 key
    uploadId: v.string(), // R2 multipart upload ID
    partSize: v.number(), // Bytes per part
    totalParts: v.number(),
    // Completed parts - updated incrementally for resume support
    completedParts: v.array(
      v.object({
        partNumber: v.number(),
        etag: v.string(), // Store EXACTLY as returned (may include quotes)
      })
    ),
    bytesUploaded: v.number(),
    totalBytes: v.number(),
    // Session status
    status: v.string(), // "ACTIVE", "COMPLETED", "ABORTED"
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_jobId_status", ["jobId", "status"]),

  // GIF overlay styles - Reusable text overlay presets
  gif_overlay_styles: defineTable({
    name: v.string(), // e.g., "Meme Classic", "Caption Bar", "Subtitle"
    styleKey: v.string(), // "meme_top_bottom", "caption_bar", "subtitle"
    description: v.optional(v.string()),
    // Font settings
    fontFamily: v.string(), // "Impact", "Arial Bold", etc.
    fontSize: v.number(), // Base size in px
    fontWeight: v.optional(v.string()),
    textColor: v.string(), // Hex color
    strokeColor: v.optional(v.string()), // Outline color
    strokeWidth: v.optional(v.number()),
    // Position settings
    position: v.string(), // "top", "bottom", "top_bottom", "center"
    paddingTop: v.optional(v.number()),
    paddingBottom: v.optional(v.number()),
    paddingHorizontal: v.optional(v.number()),
    // Background settings (for caption bar style)
    hasBackground: v.optional(v.boolean()),
    backgroundColor: v.optional(v.string()),
    backgroundOpacity: v.optional(v.number()), // 0-1
    // Preview image
    previewUrl: v.optional(v.string()),
    // Status
    isActive: v.optional(v.boolean()),
    isDefault: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_styleKey", ["styleKey"])
    .index("by_isActive", ["isActive"]),

  // Social posting schedules - Recurring posting windows
  social_posting_schedules: defineTable({
    actorProfileId: v.id("actor_profiles"),

    // Schedule name
    name: v.string(),
    description: v.optional(v.string()),

    // Schedule type
    scheduleType: v.string(), // "one_time", "daily", "weekly", "monthly"

    // Timing
    timezone: v.string(), // e.g., "America/Los_Angeles"
    timeSlots: v.array(
      v.object({
        dayOfWeek: v.optional(v.number()), // 0-6 for weekly, null for daily
        dayOfMonth: v.optional(v.number()), // 1-31 for monthly
        hour: v.number(), // 0-23
        minute: v.number(), // 0-59
      })
    ),

    // Quiet hours (avoid posting during these times)
    quietHours: v.optional(
      v.object({
        startHour: v.number(),
        endHour: v.number(),
      })
    ),

    // Target platforms
    targetPlatforms: v.array(v.string()),

    // Status
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_actorProfile", ["actorProfileId"])
    .index("by_isActive", ["isActive"]),

  // ============================================
  // TRAILER GENERATION PIPELINE
  // ============================================

  // Trailer generation jobs - extends video_jobs for trailer-specific processing
  trailer_jobs: defineTable({
    videoJobId: v.id("video_jobs"), // Parent video job (source file)
    userId: v.id("users"),

    // Processing state
    status: v.string(), // See TRAILER_STATUS enum in trailerJobs.ts
    processingLockId: v.optional(v.string()), // Idempotent lock for Modal worker
    attemptCount: v.optional(v.number()),

    // Analysis outputs
    proxyR2Key: v.optional(v.string()), // 720p proxy for faster analysis
    proxySpecHash: v.optional(v.string()), // Hash of proxy params for cache validation
    transcriptionId: v.optional(v.id("transcriptions")), // Reuse existing transcriptions table
    sceneMapId: v.optional(v.id("trailer_scene_maps")),

    // Synthesis
    selectedProfileId: v.optional(v.id("trailer_profiles")),
    timestampPlanId: v.optional(v.id("trailer_timestamp_plans")),
    textCardPlanId: v.optional(v.id("trailer_text_card_plans")),
    audioPlanId: v.optional(v.id("trailer_audio_plans")),
    effectsPlanId: v.optional(v.id("trailer_effects_plans")), // Phase 6: transitions & speed effects
    overlayPlanId: v.optional(v.id("trailer_overlay_plans")), // Phase 7: branding & overlays
    workflowPlanId: v.optional(v.id("trailer_workflow_plans")), // Phase 8: workflow & previews
    aiSelectionPlanId: v.optional(v.id("trailer_ai_selection_plans")), // Phase 9: AI selection

    // Outputs
    clipIds: v.optional(v.array(v.id("trailer_clips"))),

    // Progress tracking
    progress: v.optional(v.number()), // 0-100
    currentStep: v.optional(v.string()),

    // Timing & errors
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    errorStage: v.optional(v.string()),
  })
    .index("by_videoJob", ["videoJobId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_userId_status", ["userId", "status"]),

  // Trailer archetype profiles (theatrical, teaser, festival, social, etc.)
  trailer_profiles: defineTable({
    key: v.string(), // "theatrical", "teaser", "social_9x16", etc.
    label: v.string(),
    description: v.optional(v.string()),

    // Duration constraints
    durationTargetSec: v.number(),
    durationMinSec: v.optional(v.number()),
    durationMaxSec: v.optional(v.number()),

    // Structure template
    structure: v.optional(v.array(v.string())), // ["cold_open", "premise", "escalation", "montage", "button"]

    // Pacing rules
    avgShotSecStart: v.optional(v.number()), // Shot length at beginning
    avgShotSecEnd: v.optional(v.number()), // Shot length at climax (faster)

    // Content weights for AI selection (0-1)
    dialogueWeight: v.optional(v.number()),
    musicWeight: v.optional(v.number()),
    actionWeight: v.optional(v.number()),

    // Text card styling defaults (for Hollywood-style title cards)
    textCardDefaults: v.optional(
      v.object({
        fontFamily: v.optional(v.string()), // "Bebas Neue", "Helvetica Neue", etc.
        primaryColor: v.optional(v.string()), // "#FFFFFF"
        shadowColor: v.optional(v.string()), // "#000000"
        defaultStyle: v.optional(v.string()), // "bold" | "minimal" | "elegant" | "gritty"
        defaultMotion: v.optional(v.string()), // "fade_up" | "push_in" | "cut" | "typewriter"
      })
    ),

    // Polish options for professional finishing
    polishOptions: v.optional(
      v.object({
        // Film grain for cinematic texture
        filmGrain: v.optional(
          v.object({
            enabled: v.optional(v.boolean()),
            intensity: v.optional(v.number()), // 0-100, 15 is subtle, 30 is noticeable
          })
        ),
        // Letterbox for widescreen cinematic look
        letterbox: v.optional(
          v.object({
            enabled: v.optional(v.boolean()),
            aspectRatio: v.optional(v.string()), // "2.39:1" (scope), "2.35:1", "1.85:1"
          })
        ),
        // Color grading for mood
        colorGrade: v.optional(
          v.object({
            enabled: v.optional(v.boolean()),
            preset: v.optional(v.string()), // "cinematic", "thriller", "drama", "action"
            saturation: v.optional(v.number()), // 0-2, 1 is normal, 0.85 is slightly desaturated
            contrast: v.optional(v.number()), // 0-2, 1 is normal
            vignette: v.optional(v.number()), // 0-1, 0 is none, 0.3 is subtle
          })
        ),
      })
    ),

    // Output specs
    outputVariants: v.array(
      v.object({
        aspectRatio: v.string(), // "16x9", "9x16", "1x1", "4x5"
        resolution: v.string(), // "1080p", "720p", "4k"
        codec: v.optional(v.string()), // "h264", "h265"
        maxBitrate: v.optional(v.number()),
        loudnessNorm: v.optional(v.boolean()), // Mobile-friendly loudness
        burnCaptions: v.optional(v.boolean()), // Baked-in captions for social
      })
    ),

    // Display
    isBuiltIn: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_key", ["key"]),

  // Scene detection results from analysis phase
  trailer_scene_maps: defineTable({
    trailerJobId: v.id("trailer_jobs"),

    // Scene boundaries with metadata
    scenes: v.array(
      v.object({
        sceneIndex: v.number(),
        startTime: v.number(), // seconds
        endTime: v.number(),
        duration: v.number(),

        // Detection signals
        keyframeTimestamps: v.array(v.number()),
        avgMotionIntensity: v.optional(v.number()), // 0-1
        avgAudioIntensity: v.optional(v.number()), // 0-1
        hasFaces: v.optional(v.boolean()),
        hasDialogue: v.optional(v.boolean()),
        dominantColors: v.optional(v.array(v.string())), // hex colors

        // AI-generated metadata
        summary: v.optional(v.string()),
        mood: v.optional(v.string()), // "tense", "romantic", "action", etc.
        importance: v.optional(v.number()), // 0-100 for trailer selection

        // Phase 5: Advanced importance scoring (0-1 scales)
        importanceScores: v.optional(
          v.object({
            emotional: v.number(), // Emotional intensity (faces, expressions, dialogue tone)
            visual: v.number(), // Visual interest (motion, composition, color contrast)
            narrative: v.number(), // Story/dialogue value (dialogue content, character moments)
            combined: v.number(), // Weighted combination of all scores
            priority: v.string(), // "must_include" | "high_priority" | "consider" | "skip"
          })
        ),
      })
    ),

    // Global video metrics
    totalScenes: v.number(),
    avgSceneDuration: v.number(),
    peakIntensityTimestamps: v.optional(v.array(v.number())),

    createdAt: v.number(),
  })
    .index("by_trailerJob", ["trailerJobId"]),

  // Timestamp synthesis plans (AI-generated edit decisions)
  trailer_timestamp_plans: defineTable({
    trailerJobId: v.id("trailer_jobs"),
    profileId: v.id("trailer_profiles"),

    // The actual edit plan
    clips: v.array(
      v.object({
        clipIndex: v.number(),
        sourceStart: v.number(), // seconds in source
        sourceEnd: v.number(),
        targetStart: v.number(), // seconds in output
        targetEnd: v.number(),

        // Edit metadata
        purpose: v.optional(v.string()), // "cold_open", "premise", "escalation", etc.
        transitionIn: v.optional(v.string()), // "cut", "dissolve", "fade"
        transitionOut: v.optional(v.string()),
        audioTreatment: v.optional(v.string()), // "dialogue", "music_only", "sfx"
      })
    ),

    // Plan metadata
    source: v.string(), // "equal_segments", "ai_analysis", "manual"
    targetDurationSec: v.number(),
    actualDurationSec: v.optional(v.number()),

    // GPT-4o reasoning (consider truncating at scale)
    aiReasoning: v.optional(v.string()),
    aiReasoningSummary: v.optional(v.string()), // Truncated version for long-term

    createdAt: v.number(),
  })
    .index("by_trailerJob", ["trailerJobId"])
    .index("by_profile", ["profileId"]),

  // Final rendered trailer clips
  trailer_clips: defineTable({
    trailerJobId: v.id("trailer_jobs"),
    timestampPlanId: v.id("trailer_timestamp_plans"),
    userId: v.id("users"),

    // Variant info
    profileKey: v.string(),
    variantKey: v.string(), // "16x9_1080p", "9x16_720p", etc.

    // Output metadata
    title: v.optional(v.string()),
    duration: v.number(),
    width: v.number(),
    height: v.number(),
    fileSize: v.optional(v.number()),

    // R2 storage
    r2Key: v.string(),
    r2ThumbKey: v.optional(v.string()),

    // Status
    status: v.string(), // "rendering", "uploading", "ready", "failed"

    createdAt: v.number(),
  })
    .index("by_trailerJob", ["trailerJobId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),

  // Cinematic text card plans for Hollywood-style trailer titles
  trailer_text_card_plans: defineTable({
    trailerJobId: v.id("trailer_jobs"),
    profileId: v.id("trailer_profiles"),

    // The text cards to overlay on the trailer
    cards: v.array(
      v.object({
        cardIndex: v.number(),
        atSec: v.number(), // When card appears in trailer timeline
        durationSec: v.number(), // How long visible (typically 1.5-3s)
        text: v.string(), // "THIS WINTER", "ONE CHOICE", etc.
        style: v.string(), // "minimal" | "bold" | "elegant" | "gritty"
        motion: v.string(), // "fade_up" | "push_in" | "cut" | "typewriter"
        fontSize: v.optional(v.number()), // Override default sizing
        position: v.optional(v.string()), // "center" | "lower_third" | "upper"
      })
    ),

    // GPT-4o reasoning for text card choices
    aiReasoning: v.optional(v.string()),

    createdAt: v.number(),
  }).index("by_trailerJob", ["trailerJobId"]),

  // Phase 5: Dialogue analysis for trailer-worthy line selection
  trailer_dialogue_analysis: defineTable({
    trailerJobId: v.id("trailer_jobs"),

    // All scored dialogue lines
    scoredLines: v.array(
      v.object({
        segmentIndex: v.number(),
        text: v.string(),
        startSec: v.number(),
        endSec: v.number(),

        // Scoring
        trailerScore: v.number(), // 0-1 AI score
        quickScore: v.number(), // 0-1 heuristic score
        trailerPurpose: v.optional(v.string()), // hook, stakes, conflict, question, button
        editSuggestion: v.optional(v.string()), // AI-suggested punchier version
      })
    ),

    // Top selected lines for trailer
    selectedLineIndices: v.array(v.number()),

    aiReasoning: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_trailerJob", ["trailerJobId"]),

  // Audio plans for AI-generated music and mixing
  trailer_audio_plans: defineTable({
    trailerJobId: v.id("trailer_jobs"),
    profileId: v.id("trailer_profiles"),

    // Analysis-derived structure
    trailerDurationSec: v.number(),
    risePoints: v.array(v.number()), // Seconds where intensity should build
    impactPoints: v.array(v.number()), // Peak moments for hits/stings
    dialogueWindows: v.array(
      v.object({
        startSec: v.number(),
        endSec: v.number(),
        importance: v.number(), // 0-1, how much to duck music
      })
    ),

    // Music generation
    musicPrompt: v.string(), // Generated prompt for ElevenLabs
    musicStyle: v.string(), // "epic_orchestral" | "tension" | "emotional" | "action"
    musicBpm: v.optional(v.number()), // Target tempo

    // Generated assets
    musicR2Key: v.optional(v.string()), // Path to generated music in R2
    musicDurationSec: v.optional(v.number()),

    // SFX placements (impacts, risers, whooshes, stings)
    sfxPlacements: v.optional(
      v.array(
        v.object({
          sfxIndex: v.number(),
          atSec: v.number(), // When SFX triggers in trailer timeline
          type: v.string(), // "impact" | "riser" | "whoosh" | "sting" | "drone"
          intensity: v.number(), // 0-1, affects volume
          durationSec: v.optional(v.number()), // Duration of effect
          r2Key: v.optional(v.string()), // Path to generated SFX in R2
        })
      )
    ),

    // Mixing parameters
    targetLufs: v.number(), // -14 for web, -24 for theatrical
    dialogueLevelDb: v.number(), // Typically -12 to -6 dB
    musicLevelDb: v.number(), // Typically -18 to -12 dB
    sfxLevelDb: v.optional(v.number()), // Typically -6 to 0 dB

    // Phase 5: Beat sync data from librosa analysis
    beatAnalysis: v.optional(
      v.object({
        tempo: v.number(), // BPM
        beatTimes: v.array(v.number()), // All beat timestamps (seconds)
        downbeatTimes: v.array(v.number()), // First beat of each measure (seconds)
        peakTimes: v.array(v.number()), // Impact/peak moment timestamps
        duration: v.optional(v.number()), // Total music duration
        energyCurve: v.optional(
          v.object({
            times: v.array(v.number()), // Sample timestamps
            values: v.array(v.number()), // Normalized energy values (0-1)
          })
        ),
      })
    ),

    // Phase 5: Beat-aligned cut adjustments
    cutAlignments: v.optional(
      v.array(
        v.object({
          clipIndex: v.number(),
          originalEnd: v.number(), // Original cut time
          alignedEnd: v.number(), // Beat-aligned cut time
          adjustment: v.number(), // Difference in seconds
        })
      )
    ),

    createdAt: v.number(),
  }).index("by_trailerJob", ["trailerJobId"]),

  // Phase 6: Transitions & Speed Effects plans
  trailer_effects_plans: defineTable({
    trailerJobId: v.id("trailer_jobs"),
    profileId: v.id("trailer_profiles"),

    // Transition plan between clips
    transitions: v.array(
      v.object({
        fromClipIndex: v.number(),
        toClipIndex: v.number(),
        transitionType: v.string(), // "crossfade" | "dip_to_black" | "dip_to_white" | "whip_pan" | "zoom_transition" | "wipe_right" | "hard_cut"
        duration: v.number(), // seconds
        offset: v.number(), // seconds from clip end
        isBeatAligned: v.boolean(), // Whether transition aligns with music beat
      })
    ),

    // Speed effect plan
    speedEffects: v.array(
      v.object({
        effectIndex: v.number(),
        effectType: v.string(), // "slow_motion" | "speed_ramp" | "constant_speed"

        // Common fields
        startTime: v.number(), // seconds in trailer timeline
        endTime: v.number(),

        // For slow_motion
        speedFactor: v.optional(v.number()), // 0.25 = 4x slower
        rampInDuration: v.optional(v.number()),
        rampOutDuration: v.optional(v.number()),

        // For speed_ramp
        startSpeed: v.optional(v.number()),
        endSpeed: v.optional(v.number()),
        easing: v.optional(v.string()), // "linear" | "ease_in" | "ease_out" | "ease_in_out"
      })
    ),

    // Flash frame plan
    flashFrames: v.array(
      v.object({
        flashIndex: v.number(),
        timestamp: v.number(), // seconds
        duration: v.number(), // seconds (typically 0.02-0.1)
        color: v.string(), // "white" | "black" | "red" | "blue" | "orange"
        intensity: v.number(), // 0-1 opacity
        fadeIn: v.optional(v.number()), // fade in duration
        fadeOut: v.optional(v.number()), // fade out duration
      })
    ),

    // Summary stats
    totalTransitions: v.number(),
    totalSpeedEffects: v.number(),
    totalFlashFrames: v.number(),

    // AI reasoning for effect choices
    aiReasoning: v.optional(v.string()),

    createdAt: v.number(),
  }).index("by_trailerJob", ["trailerJobId"]),

  // Phase 7: Professional Overlays & Branding
  trailer_overlay_plans: defineTable({
    trailerJobId: v.id("trailer_jobs"),
    profileId: v.id("trailer_profiles"),

    // Logo overlays (studio bumpers, production company logos)
    logos: v.array(
      v.object({
        logoIndex: v.number(),
        logoR2Key: v.string(), // R2 path to logo image
        position: v.string(), // "center" | "top_left" | "bottom_right" etc.
        startTime: v.number(),
        duration: v.number(),
        fadeIn: v.number(),
        fadeOut: v.number(),
        scale: v.number(), // 0-1 relative to video width
        opacity: v.number(), // 0-1
      })
    ),

    // Age rating/content warning
    rating: v.optional(
      v.object({
        ratingCode: v.string(), // "G" | "PG" | "PG-13" | "R" | "NC-17" | "NOT RATED"
        contentDescriptors: v.optional(v.array(v.string())), // ["Violence", "Language"]
        position: v.string(),
        startTime: v.number(),
        duration: v.optional(v.number()), // null = entire video
        backgroundOpacity: v.number(),
      })
    ),

    // Social media watermarks
    socials: v.array(
      v.object({
        socialIndex: v.number(),
        platform: v.string(), // "instagram" | "twitter" | "tiktok" | "youtube"
        handle: v.string(), // "@username"
        position: v.string(),
        startTime: v.optional(v.number()), // null = last 10 seconds
        duration: v.optional(v.number()),
        includeIcon: v.boolean(),
        opacity: v.number(),
      })
    ),

    // Credits text overlays ("From the director of...")
    credits: v.array(
      v.object({
        creditIndex: v.number(),
        text: v.string(),
        position: v.string(),
        startTime: v.number(),
        duration: v.number(),
        style: v.string(), // "elegant" | "bold" | "minimal" | "gritty"
        fadeIn: v.number(),
        fadeOut: v.number(),
      })
    ),

    // End card configuration
    endCard: v.optional(
      v.object({
        title: v.string(),
        subtitle: v.optional(v.string()), // "A Film by..."
        releaseDate: v.optional(v.string()), // "SUMMER 2025"
        tagline: v.optional(v.string()),
        url: v.optional(v.string()), // "www.moviename.com"
        duration: v.number(),
        style: v.string(),
      })
    ),

    // Summary
    totalLogos: v.number(),
    totalSocials: v.number(),
    totalCredits: v.number(),
    hasEndCard: v.boolean(),
    hasRating: v.boolean(),

    createdAt: v.number(),
  }).index("by_trailerJob", ["trailerJobId"]),

  // Phase 8: Professional Workflow Features
  // Workflow plans for preview generation and export management
  trailer_workflow_plans: defineTable({
    trailerJobId: v.id("trailer_jobs"),
    profileId: v.id("trailer_profiles"),

    // Timeline snapshot
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

    // Duration info
    calculatedDuration: v.number(),
    targetDuration: v.number(),

    // References to other plans
    effectsPlanId: v.optional(v.id("trailer_effects_plans")),
    overlayPlanId: v.optional(v.id("trailer_overlay_plans")),
    audioPlanId: v.optional(v.id("trailer_audio_plans")),

    // Preview state
    previewQuality: v.optional(v.string()), // "draft" | "standard" | "high"
    previewR2Key: v.optional(v.string()),
    previewGeneratedAt: v.optional(v.number()),

    // Export state
    exports: v.optional(
      v.array(
        v.object({
          exportIndex: v.number(),
          quality: v.string(), // "web_optimized" | "social_media" | "broadcast" | "theatrical" | "archive"
          format: v.string(), // "mp4" | "mov" | "webm" | "mkv"
          resolution: v.optional(v.string()),
          r2Key: v.string(),
          fileSize: v.number(),
          fileSizeMb: v.number(),
          duration: v.number(),
          createdAt: v.number(),
        })
      )
    ),

    // Recommended export presets for this profile
    recommendedExports: v.array(
      v.object({
        quality: v.string(),
        format: v.string(),
        label: v.string(),
        description: v.string(),
      })
    ),

    // Revision tracking
    revision: v.number(),
    parentRevision: v.optional(v.number()),
    adjustmentsId: v.optional(v.id("trailer_workflow_adjustments")),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_trailerJob", ["trailerJobId"])
    .index("by_revision", ["trailerJobId", "revision"]),

  // Manual adjustments to AI-generated trailer plans
  trailer_workflow_adjustments: defineTable({
    trailerJobId: v.id("trailer_jobs"),
    workflowPlanId: v.id("trailer_workflow_plans"),

    // Clip adjustments
    clipAdjustments: v.array(
      v.object({
        clipIndex: v.number(),
        adjustmentType: v.string(), // "trim" | "move" | "replace" | "delete" | "add"
        // For trim
        newSourceStart: v.optional(v.number()),
        newSourceEnd: v.optional(v.number()),
        // For move
        newTargetStart: v.optional(v.number()),
        // For replace
        newSceneIndex: v.optional(v.number()),
        // For add
        insertAtIndex: v.optional(v.number()),
        sceneIndex: v.optional(v.number()),
        sourceStart: v.optional(v.number()),
        sourceEnd: v.optional(v.number()),
      })
    ),

    // Text card adjustments
    textCardAdjustments: v.array(
      v.object({
        cardIndex: v.number(),
        adjustmentType: v.string(), // "edit" | "delete" | "add" | "move"
        newText: v.optional(v.string()),
        newStyle: v.optional(v.string()),
        newMotion: v.optional(v.string()),
        newPosition: v.optional(v.string()),
        newAtSec: v.optional(v.number()),
        newDurationSec: v.optional(v.number()),
      })
    ),

    // Effect adjustments (transitions, speed, flash)
    effectAdjustments: v.array(
      v.object({
        effectType: v.string(), // "transition" | "speed" | "flash"
        effectIndex: v.number(),
        adjustmentType: v.string(), // "edit" | "delete" | "add"
        // For transitions
        newTransitionType: v.optional(v.string()),
        newDuration: v.optional(v.number()),
        // For speed effects
        newSpeedFactor: v.optional(v.number()),
        // For flash frames
        newFlashColor: v.optional(v.string()),
        newIntensity: v.optional(v.number()),
      })
    ),

    // Audio level adjustments (offsets from AI-determined levels)
    musicLevelDbOffset: v.optional(v.number()),
    dialogueLevelDbOffset: v.optional(v.number()),
    sfxLevelDbOffset: v.optional(v.number()),

    // Overlay toggles
    disableEndCard: v.optional(v.boolean()),
    disableRating: v.optional(v.boolean()),
    customLogoR2Key: v.optional(v.string()),

    // Tracking
    revision: v.number(),
    parentRevision: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    appliedAt: v.optional(v.number()),
  })
    .index("by_trailerJob", ["trailerJobId"])
    .index("by_workflowPlan", ["workflowPlanId"]),

  // Phase 9: AI-Powered Selection Enhancements
  // Stores AI analysis and selection optimization results
  trailer_ai_selection_plans: defineTable({
    trailerJobId: v.id("trailer_jobs"),
    profileId: v.id("trailer_profiles"),

    // Genre detection
    detectedGenre: v.string(), // "action", "horror", "drama", etc.
    genreConfidence: v.number(), // 0-1
    genreConventions: v.object({
      structure: v.array(v.string()),
      openingPace: v.string(),
      climaxPace: v.string(),
      textCardStyle: v.string(),
    }),

    // Audience analysis
    audienceType: v.string(), // "general", "young_adult", "mature", etc.
    audienceAnalysis: v.object({
      topScenes: v.array(v.number()), // Indices of top scenes for audience
      openingScene: v.optional(v.number()),
      climaxScenes: v.array(v.number()),
      toneRecommendation: v.optional(v.string()), // "energetic", "emotional", etc.
      keyDialogue: v.optional(v.array(v.object({
        text: v.string(),
        start: v.number(),
        audienceAppeal: v.string(),
      }))),
    }),

    // Emotional arc analysis
    emotionalArc: v.object({
      peakMoment: v.number(), // Timestamp of peak intensity
      resolutionStart: v.number(), // When resolution begins
      intensityCurve: v.array(v.number()), // 0-1 values
    }),

    // Arc validation
    arcValidation: v.object({
      valid: v.boolean(),
      score: v.number(), // 0-1
      issues: v.array(v.string()),
      suggestions: v.array(v.string()),
    }),

    // Pacing analysis
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

    // Recommended effects based on genre
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

    // Enhancement summary
    enhancementSummary: v.object({
      genreApplied: v.boolean(),
      audienceOptimized: v.boolean(),
      arcOptimized: v.boolean(),
      pacingOptimized: v.boolean(),
      variantsGenerated: v.number(),
    }),

    createdAt: v.number(),
  }).index("by_trailerJob", ["trailerJobId"]),

  // A/B test variants for trailers
  trailer_ab_variants: defineTable({
    trailerJobId: v.id("trailer_jobs"),
    selectionPlanId: v.id("trailer_ai_selection_plans"),

    // Variant info
    variantId: v.string(), // "control", "variant_1", etc.
    variantName: v.string(), // "Control (Original)", "Action Focus", etc.
    isControl: v.boolean(),

    // Variant configuration
    emphasis: v.string(), // "action", "character", "mystery", "dialogue"
    pacingModifier: v.number(), // 0.8-1.2
    textCardVariant: v.string(), // "bold", "elegant", "minimal"
    musicStyle: v.string(), // "energetic", "emotional", "tension"

    // Generated outputs
    clipR2Key: v.optional(v.string()), // R2 path to variant video
    thumbnailR2Key: v.optional(v.string()),
    duration: v.optional(v.number()),

    // Performance tracking (for A/B testing)
    impressions: v.optional(v.number()),
    views: v.optional(v.number()),
    completionRate: v.optional(v.number()), // % watched to end
    engagementScore: v.optional(v.number()), // Calculated engagement
    clickThroughRate: v.optional(v.number()), // CTR if used in ads

    // Status
    status: v.string(), // "pending", "rendering", "ready", "winner", "loser"

    createdAt: v.number(),
    renderedAt: v.optional(v.number()),
  })
    .index("by_trailerJob", ["trailerJobId"])
    .index("by_selectionPlan", ["selectionPlanId"])
    .index("by_status", ["status"]),
});
