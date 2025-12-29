import { v } from "convex/values";
import {
  mutation,
  action,
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ============================================
// PLATFORM CONFIGURATION
// ============================================

export const PLATFORM_CONFIG = {
  instagram: {
    name: "Instagram",
    authUrl: "https://www.facebook.com/v18.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
    scopes: [
      "instagram_basic",
      "instagram_content_publish",
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
    ],
    usePKCE: false, // Facebook uses standard OAuth
  },
  facebook: {
    name: "Facebook",
    authUrl: "https://www.facebook.com/v18.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
    scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
    usePKCE: false,
  },
  twitter: {
    name: "X (Twitter)",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    usePKCE: true,
  },
  tiktok: {
    name: "TikTok",
    authUrl: "https://www.tiktok.com/v2/auth/authorize",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["video.upload", "video.publish", "user.info.basic"],
    usePKCE: true,
  },
  youtube: {
    name: "YouTube",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
    usePKCE: true,
  },
  linkedin: {
    name: "LinkedIn",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["r_liteprofile", "w_member_social"],
    usePKCE: false,
  },
};

type Provider = keyof typeof PLATFORM_CONFIG;

// Helper to get the correct environment variable names for OAuth credentials
function getOAuthCredentialEnvVars(provider: string): { clientIdVar: string; clientSecretVar: string } {
  // YouTube OAuth uses Google's OAuth system, so we use GOOGLE_* credentials
  if (provider === "youtube") {
    return {
      clientIdVar: "GOOGLE_CLIENT_ID",
      clientSecretVar: "GOOGLE_CLIENT_SECRET",
    };
  }
  return {
    clientIdVar: `${provider.toUpperCase()}_CLIENT_ID`,
    clientSecretVar: `${provider.toUpperCase()}_CLIENT_SECRET`,
  };
}

// ============================================
// CRYPTO UTILITIES
// ============================================

/**
 * Generate a random string for state/verifier
 */
function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

/**
 * Generate PKCE code verifier
 */
function generateCodeVerifier(): string {
  return generateRandomString(64);
}

/**
 * Generate PKCE code challenge from verifier
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64URLEncode(new Uint8Array(digest));
}

/**
 * Base64 URL encode
 */
function base64URLEncode(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Encrypt a token for storage
 */
function encryptToken(token: string, secret: string): string {
  // Simple XOR encryption with secret - in production, use proper encryption
  // This is a placeholder for proper KMS or envelope encryption
  const encoder = new TextEncoder();
  const tokenBytes = encoder.encode(token);
  const secretBytes = encoder.encode(secret);
  const encrypted = new Uint8Array(tokenBytes.length);

  for (let i = 0; i < tokenBytes.length; i++) {
    encrypted[i] = tokenBytes[i] ^ secretBytes[i % secretBytes.length];
  }

  return base64URLEncode(encrypted);
}

/**
 * Decrypt a token from storage
 */
function decryptToken(encrypted: string, secret: string): string {
  // Reverse the XOR encryption
  const decoder = new TextDecoder();
  const encryptedBytes = base64URLDecode(encrypted);
  const secretBytes = new TextEncoder().encode(secret);
  const decrypted = new Uint8Array(encryptedBytes.length);

  for (let i = 0; i < encryptedBytes.length; i++) {
    decrypted[i] = encryptedBytes[i] ^ secretBytes[i % secretBytes.length];
  }

  return decoder.decode(decrypted);
}

function base64URLDecode(str: string): Uint8Array {
  const padded = str + "===".slice(0, (4 - (str.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ============================================
// OAUTH FLOW - INITIATE
// ============================================

/**
 * Initiate OAuth flow for a platform
 */
export const initiateOAuth = action({
  args: {
    actorProfileId: v.id("actor_profiles"),
    provider: v.string(),
  },
  returns: v.object({
    authUrl: v.string(),
    state: v.string(),
  }),
  async handler(ctx, { actorProfileId, provider }) {
    const providerKey = provider as Provider;
    const config = PLATFORM_CONFIG[providerKey];

    if (!config) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Get environment variables (YouTube uses Google OAuth credentials)
    const envVars = getOAuthCredentialEnvVars(provider);
    const clientId = process.env[envVars.clientIdVar];
    const redirectUri =
      process.env.SITE_URL + "/api/social/callback" ||
      "https://flmlnk.com/api/social/callback";

    if (!clientId) {
      throw new Error(`${config.name} is not configured. Missing client ID.`);
    }

    // Generate state and code verifier
    const state = generateRandomString(32);
    const codeVerifier = generateCodeVerifier();

    // Store OAuth state
    await ctx.runMutation(internal.socialPostingOAuth.storeOAuthState, {
      actorProfileId,
      state,
      codeVerifier,
      provider,
      scopes: config.scopes,
      redirectUri,
    });

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      scope: config.scopes.join(" "),
    });

    // Add PKCE if supported
    if (config.usePKCE) {
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", "S256");
    }

    // Platform-specific parameters
    if (provider === "twitter") {
      // Twitter requires these additional params
    } else if (provider === "tiktok") {
      params.set("client_key", clientId);
      params.delete("client_id");
    } else if (provider === "youtube") {
      params.set("access_type", "offline");
      params.set("prompt", "consent");
    }

    const authUrl = `${config.authUrl}?${params.toString()}`;

    return { authUrl, state };
  },
});

/**
 * Store OAuth state for verification
 */
export const storeOAuthState = internalMutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    state: v.string(),
    codeVerifier: v.string(),
    provider: v.string(),
    scopes: v.array(v.string()),
    redirectUri: v.string(),
  },
  async handler(ctx, args) {
    // Get user ID from profile
    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile) {
      throw new Error("Profile not found");
    }

    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes

    // Delete any existing state for this user/provider
    const existing = await ctx.db
      .query("oauth_states")
      .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
      .filter((q) => q.eq(q.field("provider"), args.provider))
      .collect();

    for (const state of existing) {
      await ctx.db.delete(state._id);
    }

    // Store new state
    await ctx.db.insert("oauth_states", {
      userId: profile.userId,
      actorProfileId: args.actorProfileId,
      state: args.state,
      codeVerifier: args.codeVerifier,
      provider: args.provider,
      scopes: args.scopes,
      redirectUri: args.redirectUri,
      initiatedAt: now,
      expiresAt,
    });
  },
});

// ============================================
// OAUTH FLOW - CALLBACK
// ============================================

// Type for OAuth state from database
type OAuthStateDoc = {
  _id: Id<"oauth_states">;
  _creationTime: number;
  userId: Id<"users">;
  actorProfileId: Id<"actor_profiles">;
  state: string;
  codeVerifier: string;
  provider: string;
  scopes: string[];
  redirectUri: string;
  initiatedAt: number;
  expiresAt: number;
} | null;

// Return type for handleOAuthCallback
type OAuthCallbackResult = {
  success: boolean;
  provider?: string;
  userSlug?: string;
  error?: string;
};

/**
 * Handle OAuth callback
 */
export const handleOAuthCallback = action({
  args: {
    code: v.string(),
    state: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    provider: v.optional(v.string()),
    userSlug: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  async handler(ctx, { code, state }): Promise<{
    success: boolean;
    provider?: string;
    userSlug?: string;
    error?: string;
  }> {
    // Get stored state
    const oauthState: {
      _id: Id<"oauth_states">;
      _creationTime: number;
      state: string;
      provider: string;
      userId: Id<"users">;
      actorProfileId: Id<"actor_profiles">;
      codeVerifier: string;
      scopes: string[];
      redirectUri: string;
      expiresAt: number;
    } | null = await ctx.runQuery(internal.socialPostingOAuth.getOAuthState, { state });

    if (!oauthState) {
      return { success: false, error: "Invalid or expired state" };
    }

    if (oauthState.expiresAt < Date.now()) {
      await ctx.runMutation(internal.socialPostingOAuth.deleteOAuthState, { state });
      return { success: false, error: "OAuth state expired" };
    }

    const provider = oauthState.provider as Provider;
    const config = PLATFORM_CONFIG[provider];

    if (!config) {
      return { success: false, error: "Invalid provider" };
    }

    // Get credentials (YouTube uses Google OAuth credentials)
    const envVars = getOAuthCredentialEnvVars(provider);
    const clientId = process.env[envVars.clientIdVar];
    const clientSecret = process.env[envVars.clientSecretVar];
    const encryptionSecret = process.env.TOKEN_ENCRYPTION_SECRET || "default-secret-change-me";

    if (!clientId || !clientSecret) {
      return { success: false, error: `${config.name} credentials not configured` };
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await exchangeCodeForTokens({
        provider,
        code,
        codeVerifier: oauthState.codeVerifier,
        redirectUri: oauthState.redirectUri,
        clientId,
        clientSecret,
        config,
      });

      if (!tokenResponse.access_token) {
        return { success: false, error: "Failed to get access token" };
      }

      // Get user info from provider
      const userInfo = await fetchProviderUserInfo(provider, tokenResponse.access_token);

      // Encrypt tokens
      const accessTokenEncrypted = encryptToken(tokenResponse.access_token, encryptionSecret);
      const refreshTokenEncrypted = tokenResponse.refresh_token
        ? encryptToken(tokenResponse.refresh_token, encryptionSecret)
        : undefined;

      // Calculate token expiration
      const tokenExpiresAt = tokenResponse.expires_in
        ? Date.now() + tokenResponse.expires_in * 1000
        : undefined;

      // Store the account
      await ctx.runMutation(internal.socialPostingOAuth.createOrUpdateSocialAccount, {
        userId: oauthState.userId,
        actorProfileId: oauthState.actorProfileId,
        provider,
        providerUserId: userInfo.id,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenExpiresAt,
        scopes: oauthState.scopes,
        username: userInfo.username,
        displayName: userInfo.displayName,
        profileImageUrl: userInfo.profileImageUrl,
        followerCount: userInfo.followerCount,
      });

      // For Facebook/Instagram, also fetch and store pages
      if (provider === "facebook" || provider === "instagram") {
        await fetchAndStoreFacebookPages(
          ctx as any,
          tokenResponse.access_token,
          oauthState.actorProfileId,
          encryptionSecret
        );
      }

      // For YouTube, fetch and store channels
      if (provider === "youtube") {
        await fetchAndStoreYouTubeChannel(
          ctx as any,
          tokenResponse.access_token,
          oauthState.actorProfileId,
          encryptionSecret
        );
      }

      // Delete the OAuth state
      await ctx.runMutation(internal.socialPostingOAuth.deleteOAuthState, { state });

      // Get the user slug for redirect
      const userSlug: string | null = await ctx.runQuery(internal.socialPostingOAuth.getActorProfileSlug, {
        actorProfileId: oauthState.actorProfileId,
      });

      return { success: true, provider, userSlug: userSlug ?? undefined };
    } catch (error) {
      console.error("OAuth callback error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "OAuth callback failed",
      };
    }
  },
});

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens({
  provider,
  code,
  codeVerifier,
  redirectUri,
  clientId,
  clientSecret,
  config,
}: {
  provider: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  config: (typeof PLATFORM_CONFIG)[keyof typeof PLATFORM_CONFIG];
}): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  };

  // Platform-specific token request
  if (provider === "twitter") {
    params.client_id = clientId;
    params.code_verifier = codeVerifier;
  } else if (provider === "tiktok") {
    params.client_key = clientId;
    params.client_secret = clientSecret;
  } else {
    params.client_id = clientId;
    params.client_secret = clientSecret;
  }

  if (config.usePKCE) {
    params.code_verifier = codeVerifier;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  // Twitter uses Basic auth
  if (provider === "twitter") {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Token exchange failed for ${provider}:`, errorText);
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch user info from provider
 */
async function fetchProviderUserInfo(
  provider: string,
  accessToken: string
): Promise<{
  id: string;
  username?: string;
  displayName?: string;
  profileImageUrl?: string;
  followerCount?: number;
}> {
  let url: string;
  let headers: Record<string, string> = {};

  switch (provider) {
    case "twitter":
      url = "https://api.twitter.com/2/users/me?user.fields=profile_image_url,public_metrics";
      headers["Authorization"] = `Bearer ${accessToken}`;
      break;

    case "facebook":
      url = `https://graph.facebook.com/v18.0/me?fields=id,name,picture&access_token=${accessToken}`;
      break;

    case "instagram":
      url = `https://graph.facebook.com/v18.0/me?fields=id,name,picture&access_token=${accessToken}`;
      break;

    case "tiktok":
      url =
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count";
      headers["Authorization"] = `Bearer ${accessToken}`;
      break;

    case "youtube":
      url =
        "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true";
      headers["Authorization"] = `Bearer ${accessToken}`;
      break;

    case "linkedin":
      url = "https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)";
      headers["Authorization"] = `Bearer ${accessToken}`;
      break;

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`User info fetch failed for ${provider}:`, errorText);
    throw new Error(`Failed to fetch user info: ${response.status}`);
  }

  const data = await response.json();

  // Normalize response
  switch (provider) {
    case "twitter":
      return {
        id: data.data.id,
        username: data.data.username,
        displayName: data.data.name,
        profileImageUrl: data.data.profile_image_url,
        followerCount: data.data.public_metrics?.followers_count,
      };

    case "facebook":
    case "instagram":
      return {
        id: data.id,
        displayName: data.name,
        profileImageUrl: data.picture?.data?.url,
      };

    case "tiktok":
      return {
        id: data.data.user.open_id,
        displayName: data.data.user.display_name,
        profileImageUrl: data.data.user.avatar_url,
        followerCount: data.data.user.follower_count,
      };

    case "youtube":
      const channel = data.items?.[0];
      return {
        id: channel?.id,
        displayName: channel?.snippet?.title,
        profileImageUrl: channel?.snippet?.thumbnails?.default?.url,
        followerCount: parseInt(channel?.statistics?.subscriberCount || "0"),
      };

    case "linkedin":
      return {
        id: data.id,
        displayName: `${data.localizedFirstName} ${data.localizedLastName}`,
      };

    default:
      return { id: data.id };
  }
}

/**
 * Fetch and store Facebook Pages (for Facebook/Instagram posting)
 */
async function fetchAndStoreFacebookPages(
  ctx: { runMutation: <T>(fn: unknown, args: unknown) => Promise<T> },
  accessToken: string,
  actorProfileId: Id<"actor_profiles">,
  encryptionSecret: string
) {
  try {
    // Fetch user's pages
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,picture,category,instagram_business_account&access_token=${accessToken}`
    );

    if (!pagesResponse.ok) {
      console.error("Failed to fetch Facebook pages");
      return;
    }

    const pagesData = await pagesResponse.json();
    const pages = pagesData.data || [];

    // Get the social account we just created
    const account = await ctx.runMutation<{ _id: Id<"social_accounts"> } | null>(
      internal.socialPostingOAuth.getLatestSocialAccount, {
        actorProfileId,
        provider: "facebook",
      }
    );

    if (!account) return;

    for (const page of pages) {
      // Store Facebook Page
      const pageTokenEncrypted = encryptToken(page.access_token, encryptionSecret);

      await ctx.runMutation(internal.socialPostingOAuth.createSocialPage, {
        socialAccountId: account._id,
        actorProfileId,
        pageId: page.id,
        pageType: "facebook_page",
        name: page.name,
        profileImageUrl: page.picture?.data?.url,
        category: page.category,
        accessTokenEncrypted: pageTokenEncrypted,
      });

      // If page has connected Instagram Business account, store that too
      if (page.instagram_business_account) {
        const igResponse = await fetch(
          `https://graph.facebook.com/v18.0/${page.instagram_business_account.id}?fields=id,username,name,profile_picture_url,followers_count&access_token=${page.access_token}`
        );

        if (igResponse.ok) {
          const igData = await igResponse.json();

          await ctx.runMutation(internal.socialPostingOAuth.createSocialPage, {
            socialAccountId: account._id,
            actorProfileId,
            pageId: igData.id,
            pageType: "instagram_business",
            name: igData.name || igData.username,
            username: igData.username,
            profileImageUrl: igData.profile_picture_url,
            followerCount: igData.followers_count,
            accessTokenEncrypted: pageTokenEncrypted, // Use page token for IG API
          });
        }
      }
    }
  } catch (error) {
    console.error("Error fetching Facebook pages:", error);
  }
}

/**
 * Fetch and store YouTube channel after OAuth
 */
async function fetchAndStoreYouTubeChannel(
  ctx: { runMutation: <T>(fn: unknown, args: unknown) => Promise<T> },
  accessToken: string,
  actorProfileId: Id<"actor_profiles">,
  encryptionSecret: string
) {
  try {
    // Fetch user's YouTube channels
    const channelsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!channelsResponse.ok) {
      console.error("Failed to fetch YouTube channels");
      return;
    }

    const channelsData = await channelsResponse.json();
    const channels = channelsData.items || [];

    if (channels.length === 0) {
      console.log("No YouTube channels found for this account");
      return;
    }

    // Get the social account we just created
    const account = await ctx.runMutation<{ _id: Id<"social_accounts"> } | null>(
      internal.socialPostingOAuth.getLatestSocialAccount, {
        actorProfileId,
        provider: "youtube",
      }
    );

    if (!account) return;

    // Store each YouTube channel as a social_page
    for (const channel of channels) {
      const channelTokenEncrypted = encryptToken(accessToken, encryptionSecret);

      await ctx.runMutation(internal.socialPostingOAuth.createSocialPage, {
        socialAccountId: account._id,
        actorProfileId,
        pageId: channel.id,
        pageType: "youtube_channel",
        name: channel.snippet?.title || "YouTube Channel",
        username: channel.snippet?.customUrl?.replace("@", ""),
        profileImageUrl: channel.snippet?.thumbnails?.default?.url,
        followerCount: parseInt(channel.statistics?.subscriberCount || "0"),
        category: "YouTube Channel",
        accessTokenEncrypted: channelTokenEncrypted,
      });
    }
  } catch (error) {
    console.error("Error fetching YouTube channels:", error);
  }
}

// ============================================
// INTERNAL MUTATIONS & QUERIES
// ============================================

export const getOAuthState = internalQuery({
  args: {
    state: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id("oauth_states"),
      _creationTime: v.number(),
      state: v.string(),
      provider: v.string(),
      userId: v.id("users"),
      actorProfileId: v.id("actor_profiles"),
      codeVerifier: v.string(),
      scopes: v.array(v.string()),
      redirectUri: v.string(),
      expiresAt: v.number(),
    }),
    v.null()
  ),
  async handler(ctx, { state }) {
    return ctx.db
      .query("oauth_states")
      .withIndex("by_state", (q) => q.eq("state", state))
      .first();
  },
});

export const getActorProfileSlug = internalQuery({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  returns: v.union(v.string(), v.null()),
  async handler(ctx, { actorProfileId }) {
    const actorProfile = await ctx.db.get(actorProfileId);
    return actorProfile?.slug ?? null;
  },
});

export const deleteOAuthState = internalMutation({
  args: {
    state: v.string(),
  },
  async handler(ctx, { state }) {
    const oauthState = await ctx.db
      .query("oauth_states")
      .withIndex("by_state", (q) => q.eq("state", state))
      .first();

    if (oauthState) {
      await ctx.db.delete(oauthState._id);
    }
  },
});

export const createOrUpdateSocialAccount = internalMutation({
  args: {
    userId: v.id("users"),
    actorProfileId: v.id("actor_profiles"),
    provider: v.string(),
    providerUserId: v.string(),
    accessTokenEncrypted: v.string(),
    refreshTokenEncrypted: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    scopes: v.array(v.string()),
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    profileImageUrl: v.optional(v.string()),
    followerCount: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const now = Date.now();

    // Check if account already exists
    const existing = await ctx.db
      .query("social_accounts")
      .withIndex("by_providerUserId", (q) =>
        q.eq("provider", args.provider).eq("providerUserId", args.providerUserId)
      )
      .first();

    if (existing) {
      // Update existing account
      await ctx.db.patch(existing._id, {
        accessTokenEncrypted: args.accessTokenEncrypted,
        refreshTokenEncrypted: args.refreshTokenEncrypted,
        tokenExpiresAt: args.tokenExpiresAt,
        scopes: args.scopes,
        username: args.username,
        displayName: args.displayName,
        profileImageUrl: args.profileImageUrl,
        followerCount: args.followerCount,
        status: "active",
        lastError: undefined,
        lastErrorAt: undefined,
        lastRefreshedAt: now,
      });
      return { _id: existing._id };
    }

    // Create new account
    const accountId = await ctx.db.insert("social_accounts", {
      userId: args.userId,
      actorProfileId: args.actorProfileId,
      provider: args.provider,
      providerUserId: args.providerUserId,
      accessTokenEncrypted: args.accessTokenEncrypted,
      refreshTokenEncrypted: args.refreshTokenEncrypted,
      tokenExpiresAt: args.tokenExpiresAt,
      scopes: args.scopes,
      username: args.username,
      displayName: args.displayName,
      profileImageUrl: args.profileImageUrl,
      followerCount: args.followerCount,
      status: "active",
      connectedAt: now,
    });

    return { _id: accountId };
  },
});

export const getLatestSocialAccount = internalMutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    provider: v.string(),
  },
  async handler(ctx, { actorProfileId, provider }) {
    return ctx.db
      .query("social_accounts")
      .withIndex("by_actorProfile_provider", (q) =>
        q.eq("actorProfileId", actorProfileId).eq("provider", provider)
      )
      .order("desc")
      .first();
  },
});

export const createSocialPage = internalMutation({
  args: {
    socialAccountId: v.id("social_accounts"),
    actorProfileId: v.id("actor_profiles"),
    pageId: v.string(),
    pageType: v.string(),
    name: v.string(),
    username: v.optional(v.string()),
    profileImageUrl: v.optional(v.string()),
    followerCount: v.optional(v.number()),
    category: v.optional(v.string()),
    accessTokenEncrypted: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const now = Date.now();

    // Check if page already exists
    const existing = await ctx.db
      .query("social_pages")
      .withIndex("by_pageId", (q) => q.eq("pageId", args.pageId))
      .first();

    if (existing) {
      // Update existing page
      await ctx.db.patch(existing._id, {
        name: args.name,
        username: args.username,
        profileImageUrl: args.profileImageUrl,
        followerCount: args.followerCount,
        category: args.category,
        accessTokenEncrypted: args.accessTokenEncrypted,
        tokenExpiresAt: args.tokenExpiresAt,
        status: "active",
      });
      return { _id: existing._id };
    }

    // Create new page
    const pageId = await ctx.db.insert("social_pages", {
      socialAccountId: args.socialAccountId,
      actorProfileId: args.actorProfileId,
      pageId: args.pageId,
      pageType: args.pageType,
      name: args.name,
      username: args.username,
      profileImageUrl: args.profileImageUrl,
      followerCount: args.followerCount,
      category: args.category,
      accessTokenEncrypted: args.accessTokenEncrypted,
      tokenExpiresAt: args.tokenExpiresAt,
      status: "active",
      connectedAt: now,
    });

    return { _id: pageId };
  },
});

// ============================================
// TOKEN REFRESH
// ============================================

/**
 * Refresh tokens for an account
 */
export const refreshAccountTokens = internalAction({
  args: {
    accountId: v.id("social_accounts"),
  },
  async handler(ctx, { accountId }) {
    const account = await ctx.runQuery(internal.socialPosting.getSocialAccountById, { accountId });

    if (!account || !account.refreshTokenEncrypted) {
      return { success: false, error: "No refresh token available" };
    }

    const provider = account.provider as Provider;
    const config = PLATFORM_CONFIG[provider];

    if (!config) {
      return { success: false, error: "Unsupported provider" };
    }

    const envVars = getOAuthCredentialEnvVars(provider);
    const clientId = process.env[envVars.clientIdVar];
    const clientSecret = process.env[envVars.clientSecretVar];
    const encryptionSecret = process.env.TOKEN_ENCRYPTION_SECRET || "default-secret-change-me";

    if (!clientId || !clientSecret) {
      return { success: false, error: "Provider credentials not configured" };
    }

    try {
      const refreshToken = decryptToken(account.refreshTokenEncrypted, encryptionSecret);

      const params: Record<string, string> = {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
      };

      // Platform-specific refresh
      if (provider !== "twitter") {
        params.client_secret = clientSecret;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
      };

      if (provider === "twitter") {
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        headers["Authorization"] = `Basic ${credentials}`;
      }

      const response = await fetch(config.tokenUrl, {
        method: "POST",
        headers,
        body: new URLSearchParams(params),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Token refresh failed for ${provider}:`, errorText);

        // Mark account as expired
        await ctx.runMutation(internal.socialPostingOAuth.markAccountExpired, {
          accountId,
          error: `Token refresh failed: ${response.status}`,
        });

        return { success: false, error: "Token refresh failed" };
      }

      const tokenData = await response.json();

      // Update tokens
      const accessTokenEncrypted = encryptToken(tokenData.access_token, encryptionSecret);
      const refreshTokenEncrypted = tokenData.refresh_token
        ? encryptToken(tokenData.refresh_token, encryptionSecret)
        : account.refreshTokenEncrypted;

      const tokenExpiresAt = tokenData.expires_in
        ? Date.now() + tokenData.expires_in * 1000
        : undefined;

      await ctx.runMutation(internal.socialPostingOAuth.updateAccountTokens, {
        accountId,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenExpiresAt,
      });

      return { success: true };
    } catch (error) {
      console.error("Token refresh error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

export const markAccountExpired = internalMutation({
  args: {
    accountId: v.id("social_accounts"),
    error: v.string(),
  },
  async handler(ctx, { accountId, error }) {
    await ctx.db.patch(accountId, {
      status: "expired",
      lastError: error,
      lastErrorAt: Date.now(),
    });
  },
});

export const updateAccountTokens = internalMutation({
  args: {
    accountId: v.id("social_accounts"),
    accessTokenEncrypted: v.string(),
    refreshTokenEncrypted: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
  },
  async handler(ctx, args) {
    await ctx.db.patch(args.accountId, {
      accessTokenEncrypted: args.accessTokenEncrypted,
      refreshTokenEncrypted: args.refreshTokenEncrypted,
      tokenExpiresAt: args.tokenExpiresAt,
      status: "active",
      lastRefreshedAt: Date.now(),
      lastError: undefined,
      lastErrorAt: undefined,
    });
  },
});

// Type for social account from query
interface SocialAccountData {
  _id: Id<"social_accounts">;
  accessTokenEncrypted: string;
  tokenExpiresAt?: number;
}

/**
 * Get decrypted token for posting (internal use only)
 */
export const getDecryptedToken = internalAction({
  args: {
    accountId: v.id("social_accounts"),
  },
  returns: v.string(),
  async handler(ctx, { accountId }): Promise<string> {
    const account = await ctx.runQuery(internal.socialPosting.getSocialAccountById, { accountId }) as SocialAccountData | null;

    if (!account) {
      throw new Error("Account not found");
    }

    // Check if token is expired
    if (account.tokenExpiresAt && account.tokenExpiresAt < Date.now()) {
      // Try to refresh
      const refreshResult = await ctx.runAction(internal.socialPostingOAuth.refreshAccountTokens, {
        accountId,
      }) as { success: boolean; error?: string };

      if (!refreshResult.success) {
        throw new Error(`Token expired and refresh failed: ${refreshResult.error}`);
      }

      // Fetch updated account
      const updatedAccount = await ctx.runQuery(internal.socialPosting.getSocialAccountById, {
        accountId,
      }) as SocialAccountData | null;
      if (!updatedAccount) {
        throw new Error("Account not found after refresh");
      }

      const encryptionSecret = process.env.TOKEN_ENCRYPTION_SECRET || "default-secret-change-me";
      return decryptToken(updatedAccount.accessTokenEncrypted, encryptionSecret);
    }

    const encryptionSecret = process.env.TOKEN_ENCRYPTION_SECRET || "default-secret-change-me";
    return decryptToken(account.accessTokenEncrypted, encryptionSecret);
  },
});
