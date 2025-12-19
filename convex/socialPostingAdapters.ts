import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ============================================
// TYPES
// ============================================

interface AssetRef {
  type: string;
  sourceTable: string;
  sourceId: string;
  r2Key?: string;
  storageId?: string;
  url?: string;
  mimeType?: string;
  duration?: number;
  width?: number;
  height?: number;
}

interface PostResult {
  success: boolean;
  externalPostId?: string;
  externalPostUrl?: string;
  error?: string;
}

interface MetricsResult {
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  videoViews?: number;
  videoWatchTime?: number;
  engagementRate?: number;
}

// ============================================
// MAIN POSTING ACTION
// ============================================

/**
 * Post to a social media provider
 */
export const postToProvider = internalAction({
  args: {
    postId: v.id("social_posts"),
    provider: v.string(),
    socialAccountId: v.optional(v.id("social_accounts")),
    socialPageId: v.optional(v.id("social_pages")),
    caption: v.string(),
    hashtags: v.array(v.string()),
    link: v.optional(v.string()),
    assetRefs: v.array(
      v.object({
        type: v.string(),
        sourceTable: v.string(),
        sourceId: v.string(),
        r2Key: v.optional(v.string()),
        storageId: v.optional(v.string()),
        url: v.optional(v.string()),
        mimeType: v.optional(v.string()),
        duration: v.optional(v.number()),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
      })
    ),
    isSponsoredContent: v.optional(v.boolean()),
  },
  async handler(ctx, args): Promise<PostResult> {
    const {
      provider,
      socialAccountId,
      socialPageId,
      caption,
      hashtags,
      link,
      assetRefs,
      isSponsoredContent,
    } = args;

    if (!socialAccountId) {
      return { success: false, error: "No social account specified" };
    }

    // Get access token
    let accessToken: string;
    try {
      accessToken = await ctx.runAction(internal.socialPostingOAuth.getDecryptedToken, {
        accountId: socialAccountId,
      });
    } catch (error) {
      return {
        success: false,
        error: `Authentication failed: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }

    // Build full caption with hashtags and link
    const fullCaption = buildCaption(caption, hashtags, link);

    // Get media URLs
    const mediaUrls = await resolveMediaUrls(ctx, assetRefs);

    // Route to provider-specific handler
    switch (provider) {
      case "twitter":
        return postToTwitter(accessToken, fullCaption, mediaUrls);

      case "facebook":
        return postToFacebook(ctx as any, accessToken, socialPageId, fullCaption, mediaUrls);

      case "instagram":
        return postToInstagram(ctx as any, accessToken, socialPageId, fullCaption, mediaUrls);

      case "tiktok":
        return postToTikTok(accessToken, fullCaption, mediaUrls);

      case "youtube":
        return postToYouTube(accessToken, fullCaption, mediaUrls);

      case "linkedin":
        return postToLinkedIn(accessToken, fullCaption, mediaUrls, isSponsoredContent);

      default:
        return { success: false, error: `Unsupported provider: ${provider}` };
    }
  },
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Build full caption with hashtags and link
 */
function buildCaption(
  caption: string,
  hashtags: string[],
  link?: string
): string {
  let fullCaption = caption;

  // Add hashtags
  if (hashtags.length > 0) {
    const hashtagString = hashtags
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
      .join(" ");
    fullCaption += `\n\n${hashtagString}`;
  }

  // Add link
  if (link) {
    fullCaption += `\n\n${link}`;
  }

  return fullCaption;
}

/**
 * Resolve media URLs from asset refs
 */
async function resolveMediaUrls(
  _ctx: unknown,
  assetRefs: AssetRef[]
): Promise<Array<{ url: string; type: string; mimeType?: string; duration?: number }>> {
  const urls: Array<{ url: string; type: string; mimeType?: string; duration?: number }> = [];

  for (const ref of assetRefs) {
    let url = ref.url;

    // If no direct URL, try to resolve from storage
    if (!url && ref.r2Key) {
      // Generate R2 URL
      const r2Bucket = process.env.R2_PUBLIC_BUCKET_URL;
      if (r2Bucket) {
        url = `${r2Bucket}/${ref.r2Key}`;
      }
    }

    if (url) {
      urls.push({
        url,
        type: ref.type,
        mimeType: ref.mimeType,
        duration: ref.duration,
      });
    }
  }

  return urls;
}

// ============================================
// TWITTER/X ADAPTER
// ============================================

async function postToTwitter(
  accessToken: string,
  caption: string,
  mediaUrls: Array<{ url: string; type: string; mimeType?: string }>
): Promise<PostResult> {
  try {
    let mediaIds: string[] = [];

    // Upload media first if present
    if (mediaUrls.length > 0) {
      for (const media of mediaUrls) {
        const mediaId = await uploadTwitterMedia(accessToken, media.url, media.type);
        if (mediaId) {
          mediaIds.push(mediaId);
        }
      }
    }

    // Create tweet
    const tweetData: { text: string; media?: { media_ids: string[] } } = {
      text: caption.substring(0, 280), // Twitter character limit
    };

    if (mediaIds.length > 0) {
      tweetData.media = { media_ids: mediaIds };
    }

    const response = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tweetData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Twitter post error:", errorText);
      return { success: false, error: `Twitter API error: ${response.status}` };
    }

    const result = await response.json();

    return {
      success: true,
      externalPostId: result.data.id,
      externalPostUrl: `https://twitter.com/i/status/${result.data.id}`,
    };
  } catch (error) {
    console.error("Twitter post error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Upload media to Twitter
 */
async function uploadTwitterMedia(
  accessToken: string,
  mediaUrl: string,
  mediaType: string
): Promise<string | null> {
  try {
    // Download media
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      console.error("Failed to download media for Twitter upload");
      return null;
    }

    const mediaBuffer = await mediaResponse.arrayBuffer();
    const base64Media = Buffer.from(mediaBuffer).toString("base64");

    // Determine media category
    const mediaCategory = mediaType === "video" ? "tweet_video" : "tweet_image";

    // Initialize upload
    const initParams = new URLSearchParams({
      command: "INIT",
      media_type: mediaType === "video" ? "video/mp4" : "image/jpeg",
      media_category: mediaCategory,
      total_bytes: mediaBuffer.byteLength.toString(),
    });

    const initResponse = await fetch(
      `https://upload.twitter.com/1.1/media/upload.json?${initParams}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!initResponse.ok) {
      console.error("Twitter media init failed");
      return null;
    }

    const initResult = await initResponse.json();
    const mediaId = initResult.media_id_string;

    // Append media (chunked for large files)
    const chunkSize = 5 * 1024 * 1024; // 5MB chunks
    const chunks = Math.ceil(mediaBuffer.byteLength / chunkSize);

    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, mediaBuffer.byteLength);
      const chunk = Buffer.from(mediaBuffer.slice(start, end)).toString("base64");

      const appendParams = new URLSearchParams({
        command: "APPEND",
        media_id: mediaId,
        segment_index: i.toString(),
      });

      const formData = new FormData();
      formData.append("media_data", chunk);

      await fetch(`https://upload.twitter.com/1.1/media/upload.json?${appendParams}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });
    }

    // Finalize upload
    const finalizeParams = new URLSearchParams({
      command: "FINALIZE",
      media_id: mediaId,
    });

    const finalizeResponse = await fetch(
      `https://upload.twitter.com/1.1/media/upload.json?${finalizeParams}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!finalizeResponse.ok) {
      console.error("Twitter media finalize failed");
      return null;
    }

    return mediaId;
  } catch (error) {
    console.error("Twitter media upload error:", error);
    return null;
  }
}

// ============================================
// FACEBOOK ADAPTER
// ============================================

async function postToFacebook(
  ctx: { runQuery: <T>(fn: unknown, args: unknown) => Promise<T> },
  accessToken: string,
  socialPageId: Id<"social_pages"> | undefined,
  caption: string,
  mediaUrls: Array<{ url: string; type: string; mimeType?: string }>
): Promise<PostResult> {
  try {
    // Get page info and token
    let pageId: string;
    let pageToken = accessToken;

    if (socialPageId) {
      const page = (await ctx.runQuery(internal.socialPosting.getSocialPageById, {
        pageId: socialPageId,
      })) as { pageId: string; accessTokenEncrypted?: string } | null;

      if (!page) {
        return { success: false, error: "Facebook page not found" };
      }

      pageId = page.pageId;

      // Use page token if available
      if (page.accessTokenEncrypted) {
        const encryptionSecret = process.env.TOKEN_ENCRYPTION_SECRET || "default-secret-change-me";
        // In production, decrypt the page token
        // pageToken = decryptToken(page.accessTokenEncrypted, encryptionSecret);
      }
    } else {
      return { success: false, error: "No Facebook page specified" };
    }

    // Determine post type
    const hasVideo = mediaUrls.some((m) => m.type === "video");
    const hasImage = mediaUrls.some((m) => m.type === "image");

    if (hasVideo) {
      // Video post (Reel)
      const videoUrl = mediaUrls.find((m) => m.type === "video")?.url;
      if (!videoUrl) {
        return { success: false, error: "Video URL not found" };
      }

      // Start video upload
      const initResponse = await fetch(
        `https://graph.facebook.com/v18.0/${pageId}/video_reels`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            upload_phase: "start",
            access_token: pageToken,
          }),
        }
      );

      if (!initResponse.ok) {
        const error = await initResponse.text();
        return { success: false, error: `Video init failed: ${error}` };
      }

      const initResult = await initResponse.json();
      const videoId = initResult.video_id;

      // Upload video
      const videoResponse = await fetch(videoUrl);
      const videoBuffer = await videoResponse.arrayBuffer();

      const uploadResponse = await fetch(initResult.upload_url, {
        method: "POST",
        headers: {
          Authorization: `OAuth ${pageToken}`,
          file_url: videoUrl,
        },
        body: Buffer.from(videoBuffer),
      });

      if (!uploadResponse.ok) {
        return { success: false, error: "Video upload failed" };
      }

      // Finish upload
      const finishResponse = await fetch(
        `https://graph.facebook.com/v18.0/${pageId}/video_reels`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            upload_phase: "finish",
            video_id: videoId,
            description: caption,
            access_token: pageToken,
          }),
        }
      );

      if (!finishResponse.ok) {
        const error = await finishResponse.text();
        return { success: false, error: `Video finish failed: ${error}` };
      }

      const finishResult = await finishResponse.json();

      return {
        success: true,
        externalPostId: finishResult.id || videoId,
        externalPostUrl: `https://www.facebook.com/${pageId}/posts/${finishResult.id || videoId}`,
      };
    } else if (hasImage) {
      // Photo post
      const imageUrl = mediaUrls.find((m) => m.type === "image")?.url;

      const response = await fetch(
        `https://graph.facebook.com/v18.0/${pageId}/photos`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: imageUrl,
            message: caption,
            access_token: pageToken,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Photo post failed: ${error}` };
      }

      const result = await response.json();

      return {
        success: true,
        externalPostId: result.post_id || result.id,
        externalPostUrl: `https://www.facebook.com/${pageId}/posts/${result.post_id || result.id}`,
      };
    } else {
      // Text-only post
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${pageId}/feed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: caption,
            access_token: pageToken,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Text post failed: ${error}` };
      }

      const result = await response.json();

      return {
        success: true,
        externalPostId: result.id,
        externalPostUrl: `https://www.facebook.com/${pageId}/posts/${result.id}`,
      };
    }
  } catch (error) {
    console.error("Facebook post error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================
// INSTAGRAM ADAPTER
// ============================================

async function postToInstagram(
  ctx: { runQuery: <T>(fn: unknown, args: unknown) => Promise<T> },
  accessToken: string,
  socialPageId: Id<"social_pages"> | undefined,
  caption: string,
  mediaUrls: Array<{ url: string; type: string; mimeType?: string; duration?: number }>
): Promise<PostResult> {
  try {
    if (!socialPageId) {
      return { success: false, error: "No Instagram account specified" };
    }

    const page = (await ctx.runQuery(internal.socialPosting.getSocialPageById, {
      pageId: socialPageId,
    })) as { pageId: string; accessTokenEncrypted?: string } | null;

    if (!page) {
      return { success: false, error: "Instagram account not found" };
    }

    const igAccountId = page.pageId;

    // Get page token (Instagram uses Facebook Page token)
    let pageToken = accessToken;
    if (page.accessTokenEncrypted) {
      // In production, decrypt
    }

    const hasVideo = mediaUrls.some((m) => m.type === "video");

    if (hasVideo) {
      // Reel post
      const videoMedia = mediaUrls.find((m) => m.type === "video");
      if (!videoMedia?.url) {
        return { success: false, error: "Video URL not found" };
      }

      // Create media container
      const containerResponse = await fetch(
        `https://graph.facebook.com/v18.0/${igAccountId}/media`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            media_type: "REELS",
            video_url: videoMedia.url,
            caption: caption.substring(0, 2200), // Instagram caption limit
            access_token: pageToken,
          }),
        }
      );

      if (!containerResponse.ok) {
        const error = await containerResponse.text();
        return { success: false, error: `Container creation failed: ${error}` };
      }

      const containerResult = await containerResponse.json();
      const containerId = containerResult.id;

      // Wait for container to be ready (Instagram processes async)
      let containerReady = false;
      let attempts = 0;
      const maxAttempts = 30;

      while (!containerReady && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const statusResponse = await fetch(
          `https://graph.facebook.com/v18.0/${containerId}?fields=status_code&access_token=${pageToken}`
        );

        if (statusResponse.ok) {
          const statusResult = await statusResponse.json();
          if (statusResult.status_code === "FINISHED") {
            containerReady = true;
          } else if (statusResult.status_code === "ERROR") {
            return { success: false, error: "Media processing failed" };
          }
        }

        attempts++;
      }

      if (!containerReady) {
        return { success: false, error: "Media processing timeout" };
      }

      // Publish the container
      const publishResponse = await fetch(
        `https://graph.facebook.com/v18.0/${igAccountId}/media_publish`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            creation_id: containerId,
            access_token: pageToken,
          }),
        }
      );

      if (!publishResponse.ok) {
        const error = await publishResponse.text();
        return { success: false, error: `Publish failed: ${error}` };
      }

      const publishResult = await publishResponse.json();

      return {
        success: true,
        externalPostId: publishResult.id,
        externalPostUrl: `https://www.instagram.com/reel/${publishResult.id}`,
      };
    } else {
      // Image post
      const imageMedia = mediaUrls.find((m) => m.type === "image");
      if (!imageMedia?.url) {
        return { success: false, error: "Image URL not found" };
      }

      // Create media container
      const containerResponse = await fetch(
        `https://graph.facebook.com/v18.0/${igAccountId}/media`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image_url: imageMedia.url,
            caption: caption.substring(0, 2200),
            access_token: pageToken,
          }),
        }
      );

      if (!containerResponse.ok) {
        const error = await containerResponse.text();
        return { success: false, error: `Container creation failed: ${error}` };
      }

      const containerResult = await containerResponse.json();

      // Publish the container
      const publishResponse = await fetch(
        `https://graph.facebook.com/v18.0/${igAccountId}/media_publish`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            creation_id: containerResult.id,
            access_token: pageToken,
          }),
        }
      );

      if (!publishResponse.ok) {
        const error = await publishResponse.text();
        return { success: false, error: `Publish failed: ${error}` };
      }

      const publishResult = await publishResponse.json();

      return {
        success: true,
        externalPostId: publishResult.id,
        externalPostUrl: `https://www.instagram.com/p/${publishResult.id}`,
      };
    }
  } catch (error) {
    console.error("Instagram post error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================
// TIKTOK ADAPTER
// ============================================

async function postToTikTok(
  accessToken: string,
  caption: string,
  mediaUrls: Array<{ url: string; type: string; mimeType?: string }>
): Promise<PostResult> {
  try {
    const videoMedia = mediaUrls.find((m) => m.type === "video");
    if (!videoMedia?.url) {
      return { success: false, error: "TikTok requires a video" };
    }

    // Initialize video upload
    const initResponse = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          post_info: {
            title: caption.substring(0, 150), // TikTok title limit
            privacy_level: "PUBLIC_TO_EVERYONE",
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: "PULL_FROM_URL",
            video_url: videoMedia.url,
          },
        }),
      }
    );

    if (!initResponse.ok) {
      const error = await initResponse.text();
      return { success: false, error: `TikTok init failed: ${error}` };
    }

    const initResult = await initResponse.json();

    if (initResult.error?.code) {
      return { success: false, error: `TikTok error: ${initResult.error.message}` };
    }

    // TikTok processes async - return publish_id
    // In production, you'd poll for status or use webhooks
    return {
      success: true,
      externalPostId: initResult.data?.publish_id,
      // TikTok doesn't provide direct URL until fully processed
    };
  } catch (error) {
    console.error("TikTok post error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================
// YOUTUBE ADAPTER
// ============================================

async function postToYouTube(
  accessToken: string,
  caption: string,
  mediaUrls: Array<{ url: string; type: string; mimeType?: string }>
): Promise<PostResult> {
  try {
    const videoMedia = mediaUrls.find((m) => m.type === "video");
    if (!videoMedia?.url) {
      return { success: false, error: "YouTube requires a video" };
    }

    // Download video
    const videoResponse = await fetch(videoMedia.url);
    if (!videoResponse.ok) {
      return { success: false, error: "Failed to download video" };
    }

    const videoBuffer = await videoResponse.arrayBuffer();

    // Extract title and description from caption
    const lines = caption.split("\n");
    const title = lines[0].substring(0, 100); // YouTube title limit
    const description = lines.slice(1).join("\n");

    // Create video metadata
    const metadata = {
      snippet: {
        title,
        description,
        categoryId: "22", // People & Blogs
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    };

    // Initialize resumable upload
    const initResponse = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "video/mp4",
          "X-Upload-Content-Length": videoBuffer.byteLength.toString(),
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initResponse.ok) {
      const error = await initResponse.text();
      return { success: false, error: `YouTube init failed: ${error}` };
    }

    const uploadUrl = initResponse.headers.get("Location");
    if (!uploadUrl) {
      return { success: false, error: "No upload URL received" };
    }

    // Upload video
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": videoBuffer.byteLength.toString(),
      },
      body: Buffer.from(videoBuffer),
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      return { success: false, error: `YouTube upload failed: ${error}` };
    }

    const uploadResult = await uploadResponse.json();

    return {
      success: true,
      externalPostId: uploadResult.id,
      externalPostUrl: `https://www.youtube.com/watch?v=${uploadResult.id}`,
    };
  } catch (error) {
    console.error("YouTube post error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================
// LINKEDIN ADAPTER
// ============================================

async function postToLinkedIn(
  accessToken: string,
  caption: string,
  mediaUrls: Array<{ url: string; type: string; mimeType?: string }>,
  isSponsoredContent?: boolean
): Promise<PostResult> {
  try {
    // Get user URN
    const meResponse = await fetch("https://api.linkedin.com/v2/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!meResponse.ok) {
      return { success: false, error: "Failed to get LinkedIn profile" };
    }

    const meResult = await meResponse.json();
    const personUrn = `urn:li:person:${meResult.id}`;

    const hasImage = mediaUrls.some((m) => m.type === "image");

    if (hasImage) {
      // Image post
      const imageMedia = mediaUrls.find((m) => m.type === "image");

      // Register upload
      const registerResponse = await fetch(
        "https://api.linkedin.com/v2/assets?action=registerUpload",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
              owner: personUrn,
              serviceRelationships: [
                {
                  relationshipType: "OWNER",
                  identifier: "urn:li:userGeneratedContent",
                },
              ],
            },
          }),
        }
      );

      if (!registerResponse.ok) {
        const error = await registerResponse.text();
        return { success: false, error: `LinkedIn register failed: ${error}` };
      }

      const registerResult = await registerResponse.json();
      const uploadUrl =
        registerResult.value.uploadMechanism[
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
        ].uploadUrl;
      const asset = registerResult.value.asset;

      // Download and upload image
      const imageResponse = await fetch(imageMedia!.url);
      const imageBuffer = await imageResponse.arrayBuffer();

      await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "image/jpeg",
        },
        body: Buffer.from(imageBuffer),
      });

      // Create post with image
      const postResponse = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author: personUrn,
          lifecycleState: "PUBLISHED",
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: {
                text: caption.substring(0, 3000), // LinkedIn limit
              },
              shareMediaCategory: "IMAGE",
              media: [
                {
                  status: "READY",
                  media: asset,
                },
              ],
            },
          },
          visibility: {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
          },
        }),
      });

      if (!postResponse.ok) {
        const error = await postResponse.text();
        return { success: false, error: `LinkedIn post failed: ${error}` };
      }

      const postResult = await postResponse.json();

      return {
        success: true,
        externalPostId: postResult.id,
        externalPostUrl: `https://www.linkedin.com/feed/update/${postResult.id}`,
      };
    } else {
      // Text-only post
      const postResponse = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author: personUrn,
          lifecycleState: "PUBLISHED",
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: {
                text: caption.substring(0, 3000),
              },
              shareMediaCategory: "NONE",
            },
          },
          visibility: {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
          },
        }),
      });

      if (!postResponse.ok) {
        const error = await postResponse.text();
        return { success: false, error: `LinkedIn post failed: ${error}` };
      }

      const postResult = await postResponse.json();

      return {
        success: true,
        externalPostId: postResult.id,
        externalPostUrl: `https://www.linkedin.com/feed/update/${postResult.id}`,
      };
    }
  } catch (error) {
    console.error("LinkedIn post error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================
// METRICS FETCHING
// ============================================

export const fetchMetrics = internalAction({
  args: {
    provider: v.string(),
    socialAccountId: v.id("social_accounts"),
    externalPostId: v.string(),
  },
  async handler(ctx, { provider, socialAccountId, externalPostId }): Promise<MetricsResult | null> {
    // Get access token
    let accessToken: string;
    try {
      accessToken = await ctx.runAction(internal.socialPostingOAuth.getDecryptedToken, {
        accountId: socialAccountId,
      });
    } catch (error) {
      console.error("Failed to get token for metrics:", error);
      return null;
    }

    switch (provider) {
      case "twitter":
        return fetchTwitterMetrics(accessToken, externalPostId);
      case "facebook":
        return fetchFacebookMetrics(accessToken, externalPostId);
      case "instagram":
        return fetchInstagramMetrics(accessToken, externalPostId);
      case "youtube":
        return fetchYouTubeMetrics(accessToken, externalPostId);
      default:
        return null;
    }
  },
});

async function fetchTwitterMetrics(
  accessToken: string,
  tweetId: string
): Promise<MetricsResult | null> {
  try {
    const response = await fetch(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) return null;

    const result = await response.json();
    const metrics = result.data?.public_metrics;

    if (!metrics) return null;

    return {
      likes: metrics.like_count,
      comments: metrics.reply_count,
      shares: metrics.retweet_count + metrics.quote_count,
      impressions: metrics.impression_count,
    };
  } catch (error) {
    console.error("Twitter metrics error:", error);
    return null;
  }
}

async function fetchFacebookMetrics(
  accessToken: string,
  postId: string
): Promise<MetricsResult | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${postId}?fields=insights.metric(post_impressions,post_reactions_by_type_total,post_clicks)&access_token=${accessToken}`
    );

    if (!response.ok) return null;

    const result = await response.json();
    const insights = result.insights?.data || [];

    const impressions = insights.find((i: { name: string }) => i.name === "post_impressions");
    const reactions = insights.find(
      (i: { name: string }) => i.name === "post_reactions_by_type_total"
    );
    const clicks = insights.find((i: { name: string }) => i.name === "post_clicks");

    return {
      impressions: impressions?.values?.[0]?.value,
      likes: reactions?.values?.[0]?.value?.like,
      clicks: clicks?.values?.[0]?.value,
    };
  } catch (error) {
    console.error("Facebook metrics error:", error);
    return null;
  }
}

async function fetchInstagramMetrics(
  accessToken: string,
  mediaId: string
): Promise<MetricsResult | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}/insights?metric=impressions,reach,likes,comments,shares,saved&access_token=${accessToken}`
    );

    if (!response.ok) return null;

    const result = await response.json();
    const data = result.data || [];

    const metricsMap: Record<string, number> = {};
    for (const metric of data) {
      metricsMap[metric.name] = metric.values?.[0]?.value;
    }

    return {
      impressions: metricsMap.impressions,
      reach: metricsMap.reach,
      likes: metricsMap.likes,
      comments: metricsMap.comments,
      shares: metricsMap.shares,
      saves: metricsMap.saved,
    };
  } catch (error) {
    console.error("Instagram metrics error:", error);
    return null;
  }
}

async function fetchYouTubeMetrics(
  accessToken: string,
  videoId: string
): Promise<MetricsResult | null> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) return null;

    const result = await response.json();
    const video = result.items?.[0];
    const stats = video?.statistics;

    if (!stats) return null;

    return {
      likes: parseInt(stats.likeCount || "0"),
      comments: parseInt(stats.commentCount || "0"),
      videoViews: parseInt(stats.viewCount || "0"),
      // YouTube doesn't directly provide impressions via this API
      // Would need YouTube Analytics API for detailed metrics
    };
  } catch (error) {
    console.error("YouTube metrics error:", error);
    return null;
  }
}
