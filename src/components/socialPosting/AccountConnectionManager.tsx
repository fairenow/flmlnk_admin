"use client";

import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowLeft,
  Instagram,
  Facebook,
  Twitter,
  Youtube,
  Linkedin,
  Link as LinkIcon,
  Unlink,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  Shield,
  Clock,
  Settings,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
} from "lucide-react";

interface AccountConnectionManagerProps {
  actorProfileId: Id<"actor_profiles">;
  onBack: () => void;
}

// Type for connected social account
interface ConnectedSocialAccount {
  _id: Id<"social_accounts">;
  provider: string;
  username?: string;
  displayName?: string;
  profileImageUrl?: string;
  status: string;
  connectedAt: number;
  tokenExpiresAt?: number;
  autoPostEnabled?: boolean;
  pages?: Array<{
    _id: Id<"social_pages">;
    name: string;
    isDefault?: boolean;
  }>;
}

// Platform configuration for display
const platforms = [
  {
    id: "instagram",
    name: "Instagram",
    description: "Business & Creator accounts via Facebook",
    icon: <Instagram className="h-6 w-6" />,
    color: "from-pink-500 to-purple-600",
    bgColor: "bg-gradient-to-br from-pink-500 to-purple-600",
    scopes: ["instagram_basic", "instagram_content_publish", "pages_manage_posts"],
    features: ["Reels", "Stories", "Feed posts", "Carousels"],
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Pages and profile posting",
    icon: <Facebook className="h-6 w-6" />,
    color: "from-blue-600 to-blue-700",
    bgColor: "bg-gradient-to-br from-blue-600 to-blue-700",
    scopes: ["pages_show_list", "pages_manage_posts"],
    features: ["Posts", "Reels", "Stories", "Videos"],
  },
  {
    id: "twitter",
    name: "X (Twitter)",
    description: "Tweet and engage with followers",
    icon: <Twitter className="h-6 w-6" />,
    color: "from-slate-800 to-slate-900",
    bgColor: "bg-gradient-to-br from-slate-800 to-slate-900",
    scopes: ["tweet.read", "tweet.write", "offline.access"],
    features: ["Tweets", "Threads", "Media", "Polls"],
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Short-form video content",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
      </svg>
    ),
    color: "from-black to-gray-900",
    bgColor: "bg-gradient-to-br from-black to-gray-900",
    scopes: ["video.upload", "video.publish"],
    features: ["Videos", "Duets", "Stitches"],
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Video uploads and Shorts",
    icon: <Youtube className="h-6 w-6" />,
    color: "from-red-600 to-red-700",
    bgColor: "bg-gradient-to-br from-red-600 to-red-700",
    scopes: ["youtube.upload", "youtube.readonly"],
    features: ["Videos", "Shorts", "Community posts"],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Professional networking",
    icon: <Linkedin className="h-6 w-6" />,
    color: "from-blue-700 to-blue-800",
    bgColor: "bg-gradient-to-br from-blue-700 to-blue-800",
    scopes: ["w_member_social"],
    features: ["Posts", "Articles", "Documents"],
  },
];

export function AccountConnectionManager({
  actorProfileId,
  onBack,
}: AccountConnectionManagerProps) {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch connected accounts
  const connectedPlatforms = useQuery(api.socialPosting.getConnectedPlatforms, { actorProfileId });

  // Actions and mutations
  const initiateOAuth = useAction(api.socialPostingOAuth.initiateOAuth);
  const disconnectAccount = useMutation(api.socialPosting.disconnectAccount);
  const toggleAutoPost = useMutation(api.socialPosting.toggleAutoPost);

  const handleConnect = async (provider: string) => {
    setConnecting(provider);
    setError(null);

    try {
      const result = await initiateOAuth({ actorProfileId, provider });
      // Redirect to OAuth consent page
      window.location.href = result.authUrl;
    } catch (err) {
      console.error("OAuth initiation error:", err);
      setError(err instanceof Error ? err.message : "Failed to start authentication");
      setConnecting(null);
    }
  };

  const handleDisconnect = async (accountId: Id<"social_accounts">) => {
    if (!confirm("Are you sure you want to disconnect this account?")) {
      return;
    }

    try {
      await disconnectAccount({ socialAccountId: accountId });
    } catch (err) {
      console.error("Disconnect error:", err);
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    }
  };

  const handleToggleAutoPost = async (accountId: Id<"social_accounts">, enabled: boolean) => {
    try {
      await toggleAutoPost({ socialAccountId: accountId, enabled });
    } catch (err) {
      console.error("Toggle auto-post error:", err);
    }
  };

  // Get connected account for a platform
  const getConnectedAccount = (platformId: string): ConnectedSocialAccount | undefined => {
    return (connectedPlatforms as ConnectedSocialAccount[] | undefined)?.find((a: ConnectedSocialAccount) => a.provider === platformId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Connected Accounts
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage your social media connections
          </p>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 dark:bg-red-900/20 dark:border-red-900/50">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Security note */}
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 dark:bg-blue-900/20 dark:border-blue-900/50">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-blue-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
              Secure OAuth Connection
            </p>
            <p className="text-sm text-blue-600 dark:text-blue-400/80 mt-1">
              We use OAuth 2.0 with PKCE to securely connect to your accounts. Your passwords are never stored,
              and you can revoke access at any time through each platform&apos;s settings.
            </p>
          </div>
        </div>
      </div>

      {/* Platform list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {platforms.map((platform) => {
          const connectedAccount = getConnectedAccount(platform.id);
          const isConnected = !!connectedAccount;
          const isConnecting = connecting === platform.id;

          return (
            <div
              key={platform.id}
              className={`rounded-2xl border p-6 transition-all ${
                isConnected
                  ? "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-900/20"
                  : "border-red-200 bg-white dark:border-red-900/50 dark:bg-[#0f1219]"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`${platform.bgColor} p-3 rounded-xl text-white`}>
                    {platform.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">
                      {platform.name}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      {platform.description}
                    </p>
                  </div>
                </div>

                {isConnected ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <LinkIcon className="h-5 w-5 text-slate-400" />
                )}
              </div>

              {/* Features */}
              <div className="mt-4 flex flex-wrap gap-2">
                {platform.features.map((feature) => (
                  <span
                    key={feature}
                    className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                  >
                    {feature}
                  </span>
                ))}
              </div>

              {/* Connected account details */}
              {isConnected && connectedAccount && (
                <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-900/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {connectedAccount.profileImageUrl ? (
                        <img
                          src={connectedAccount.profileImageUrl}
                          alt=""
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {connectedAccount.displayName || connectedAccount.username}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Connected {new Date(connectedAccount.connectedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div
                      className={`px-2 py-1 rounded-full text-xs ${
                        connectedAccount.status === "active"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}
                    >
                      {connectedAccount.status}
                    </div>
                  </div>

                  {/* Token expiration warning */}
                  {connectedAccount.tokenExpiresAt && (
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-slate-500 dark:text-slate-400">
                        Token expires{" "}
                        {new Date(connectedAccount.tokenExpiresAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}

                  {/* Connected pages */}
                  {connectedAccount.pages && connectedAccount.pages.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                        Connected pages:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {connectedAccount.pages.map((page) => (
                          <span
                            key={page._id}
                            className={`px-2 py-1 rounded-full text-xs ${
                              page.isDefault
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                            }`}
                          >
                            {page.name}
                            {page.isDefault && " (default)"}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Auto-post toggle */}
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        Auto-post enabled
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        handleToggleAutoPost(
                          connectedAccount._id,
                          !connectedAccount.autoPostEnabled
                        )
                      }
                      className={`transition-colors ${
                        connectedAccount.autoPostEnabled
                          ? "text-green-500"
                          : "text-slate-400"
                      }`}
                    >
                      {connectedAccount.autoPostEnabled ? (
                        <ToggleRight className="h-8 w-8" />
                      ) : (
                        <ToggleLeft className="h-8 w-8" />
                      )}
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => handleConnect(platform.id)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reconnect
                    </button>
                    <button
                      onClick={() => handleDisconnect(connectedAccount._id)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 transition-colors"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      Disconnect
                    </button>
                  </div>
                </div>
              )}

              {/* Connect button */}
              {!isConnected && (
                <div className="mt-4 pt-4 border-t border-red-100 dark:border-red-900/50">
                  <button
                    onClick={() => handleConnect(platform.id)}
                    disabled={isConnecting}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-colors ${
                      isConnecting
                        ? "bg-slate-100 text-slate-400 dark:bg-slate-800 cursor-not-allowed"
                        : `${platform.bgColor} text-white hover:opacity-90`
                    }`}
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <LinkIcon className="h-4 w-4" />
                        Connect {platform.name}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Scopes info */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 dark:bg-slate-900/50 dark:border-slate-800">
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
          Permissions We Request
        </h4>
        <div className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
          <p>• Read your basic profile information</p>
          <p>• Post content on your behalf (with your approval)</p>
          <p>• Access your pages/channels for posting</p>
          <p>• View engagement metrics on posted content</p>
        </div>
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          We never read your private messages, contacts, or other personal data. You can revoke access
          at any time through each platform&apos;s settings.
        </p>
      </div>
    </div>
  );
}
