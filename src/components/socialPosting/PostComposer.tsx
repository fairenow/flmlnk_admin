"use client";

import { useState, useEffect, type ReactNode } from "react";
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
  Sparkles,
  Clock,
  Send,
  Save,
  Loader2,
  Image as ImageIcon,
  Video,
  Link as LinkIcon,
  Hash,
  AlertCircle,
  CheckCircle,
  X,
  Plus,
  Calendar,
  Eye,
  Trash2,
  ImagePlus,
  Play,
} from "lucide-react";
import { AssetSelector, type AssetRef as SelectorAssetRef } from "./AssetSelector";

interface PostComposerProps {
  actorProfileId: Id<"actor_profiles">;
  postId: Id<"social_posts"> | null;
  onBack: () => void;
}

// Type for connected platform/account
interface ConnectedAccount {
  _id: Id<"social_accounts">;
  provider: string;
  displayName?: string;
  username?: string;
  profileImageUrl?: string;
  pages?: Array<{
    _id: Id<"social_pages">;
    name: string;
    isDefault?: boolean;
  }>;
}

// Type for asset reference
interface AssetRef {
  type: string;
  sourceTable: string;
  sourceId: string;
  url?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  duration?: number;
  r2Key?: string;
  storageId?: string;
  width?: number;
  height?: number;
}

// Type for platform selection
interface PlatformSelection {
  provider: string;
  socialAccountId?: Id<"social_accounts">;
  socialPageId?: Id<"social_pages">;
}

// Platform icons
const platformIcons: Record<string, ReactNode> = {
  instagram: <Instagram className="h-5 w-5" />,
  facebook: <Facebook className="h-5 w-5" />,
  twitter: <Twitter className="h-5 w-5" />,
  tiktok: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  ),
  youtube: <Youtube className="h-5 w-5" />,
  linkedin: <Linkedin className="h-5 w-5" />,
};

// Character limits per platform
const characterLimits: Record<string, number> = {
  twitter: 280,
  instagram: 2200,
  facebook: 63206,
  tiktok: 150,
  youtube: 5000,
  linkedin: 3000,
};

export function PostComposer({ actorProfileId, postId, onBack }: PostComposerProps) {
  // State
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [newHashtag, setNewHashtag] = useState("");
  const [link, setLink] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [isSponsoredContent, setIsSponsoredContent] = useState(false);
  const [tone, setTone] = useState<string>("casual");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePreview, setActivePreview] = useState<string | null>(null);
  // Asset selector state
  const [selectedAsset, setSelectedAsset] = useState<AssetRef | null>(null);
  const [showAssetSelector, setShowAssetSelector] = useState(false);

  // Queries
  const post = useQuery(
    api.socialPosting.getPost,
    postId ? { postId } : "skip"
  );
  const connectedPlatforms = useQuery(api.socialPosting.getConnectedPlatforms, { actorProfileId });

  // Actions & mutations
  const createPost = useMutation(api.socialPosting.createPost);
  const updatePost = useMutation(api.socialPosting.updatePost);
  const schedulePost = useMutation(api.socialPosting.schedulePost);
  const queuePost = useMutation(api.socialPosting.queuePost);
  const deletePost = useMutation(api.socialPosting.deletePost);
  const generateCopy = useAction(api.socialPostingAI.generatePostCopy);

  // Load existing post data
  useEffect(() => {
    if (post) {
      setCaption(post.caption);
      setHashtags(post.hashtags || []);
      setLink(post.link || "");
      setSelectedPlatforms(post.platforms.map((p: PlatformSelection) => p.provider));
      setIsSponsoredContent(post.isSponsoredContent || false);
      if (post.scheduledAt) {
        setScheduledAt(new Date(post.scheduledAt).toISOString().slice(0, 16));
      }
      // Load existing asset if present
      if (post.assetRefs && post.assetRefs.length > 0) {
        const existingAsset = post.assetRefs[0];
        setSelectedAsset({
          type: existingAsset.type,
          sourceTable: existingAsset.sourceTable,
          sourceId: existingAsset.sourceId,
          url: existingAsset.url,
          r2Key: existingAsset.r2Key,
          storageId: existingAsset.storageId,
          mimeType: existingAsset.mimeType,
          duration: existingAsset.duration,
          width: existingAsset.width,
          height: existingAsset.height,
        });
      }
    }
  }, [post]);

  // Set first platform as active preview
  useEffect(() => {
    if (selectedPlatforms.length > 0 && !activePreview) {
      setActivePreview(selectedPlatforms[0]);
    }
  }, [selectedPlatforms, activePreview]);

  const handlePlatformToggle = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const handleAddHashtag = () => {
    const tag = newHashtag.trim().replace(/^#/, "");
    if (tag && !hashtags.includes(tag)) {
      setHashtags((prev) => [...prev, tag]);
      setNewHashtag("");
    }
  };

  const handleRemoveHashtag = (tag: string) => {
    setHashtags((prev) => prev.filter((t) => t !== tag));
  };

  const handleGenerateAI = async () => {
    if (selectedPlatforms.length === 0) {
      setError("Please select at least one platform");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateCopy({
        actorProfileId,
        targetPlatforms: selectedPlatforms,
        tone,
      });

      if (result.success && result.caption) {
        setCaption(result.caption);
        if (result.hashtags) {
          setHashtags(result.hashtags);
        }
      } else {
        setError(result.error || "Failed to generate content");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate content");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!caption.trim()) {
      setError("Please enter a caption");
      return;
    }

    if (selectedPlatforms.length === 0) {
      setError("Please select at least one platform");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const platforms = selectedPlatforms.map((provider) => {
        const account = (connectedPlatforms as ConnectedAccount[] | undefined)?.find((a: ConnectedAccount) => a.provider === provider);
        return {
          provider,
          socialAccountId: account?._id,
          socialPageId: account?.pages?.find((p: { _id: Id<"social_pages">; name: string; isDefault?: boolean }) => p.isDefault)?._id,
        };
      });

      // Prepare asset refs if an asset is selected
      const assetRefs = selectedAsset
        ? [
            {
              type: selectedAsset.type,
              sourceTable: selectedAsset.sourceTable,
              sourceId: selectedAsset.sourceId,
              r2Key: selectedAsset.r2Key,
              storageId: selectedAsset.storageId,
              url: selectedAsset.url,
              mimeType: selectedAsset.mimeType,
              duration: selectedAsset.duration,
              width: selectedAsset.width,
              height: selectedAsset.height,
            },
          ]
        : undefined;

      if (postId) {
        await updatePost({
          postId,
          caption,
          hashtags,
          link: link || undefined,
          platforms,
          isSponsoredContent,
          assetRefs,
        });
      } else {
        await createPost({
          actorProfileId,
          caption,
          hashtags,
          link: link || undefined,
          platforms,
          isSponsoredContent,
          aiGenerated: false,
          assetRefs,
        });
      }

      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSchedule = async () => {
    if (!caption.trim()) {
      setError("Please enter a caption");
      return;
    }

    if (!scheduledAt) {
      setError("Please select a scheduled time");
      return;
    }

    const scheduledTime = new Date(scheduledAt).getTime();
    if (scheduledTime <= Date.now()) {
      setError("Scheduled time must be in the future");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      let targetPostId = postId;

      const platforms = selectedPlatforms.map((provider) => {
        const account = (connectedPlatforms as ConnectedAccount[] | undefined)?.find((a: ConnectedAccount) => a.provider === provider);
        return {
          provider,
          socialAccountId: account?._id,
          socialPageId: account?.pages?.find((p: { _id: Id<"social_pages">; name: string; isDefault?: boolean }) => p.isDefault)?._id,
        };
      });

      // Prepare asset refs if an asset is selected
      const assetRefs = selectedAsset
        ? [
            {
              type: selectedAsset.type,
              sourceTable: selectedAsset.sourceTable,
              sourceId: selectedAsset.sourceId,
              r2Key: selectedAsset.r2Key,
              storageId: selectedAsset.storageId,
              url: selectedAsset.url,
              mimeType: selectedAsset.mimeType,
              duration: selectedAsset.duration,
              width: selectedAsset.width,
              height: selectedAsset.height,
            },
          ]
        : undefined;

      if (!targetPostId) {
        const result = await createPost({
          actorProfileId,
          caption,
          hashtags,
          link: link || undefined,
          platforms,
          isSponsoredContent,
          aiGenerated: false,
          assetRefs,
        });
        targetPostId = result.postId;
      } else {
        await updatePost({
          postId: targetPostId,
          caption,
          hashtags,
          link: link || undefined,
          platforms,
          isSponsoredContent,
          assetRefs,
        });
      }

      await schedulePost({
        postId: targetPostId!,
        scheduledAt: scheduledTime,
      });

      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePostNow = async () => {
    if (!caption.trim()) {
      setError("Please enter a caption");
      return;
    }

    if (selectedPlatforms.length === 0) {
      setError("Please select at least one platform");
      return;
    }

    setIsPosting(true);
    setError(null);

    try {
      let targetPostId = postId;

      const platforms = selectedPlatforms.map((provider) => {
        const account = (connectedPlatforms as ConnectedAccount[] | undefined)?.find((a: ConnectedAccount) => a.provider === provider);
        return {
          provider,
          socialAccountId: account?._id,
          socialPageId: account?.pages?.find((p: { _id: Id<"social_pages">; name: string; isDefault?: boolean }) => p.isDefault)?._id,
        };
      });

      // Prepare asset refs if an asset is selected
      const assetRefs = selectedAsset
        ? [
            {
              type: selectedAsset.type,
              sourceTable: selectedAsset.sourceTable,
              sourceId: selectedAsset.sourceId,
              r2Key: selectedAsset.r2Key,
              storageId: selectedAsset.storageId,
              url: selectedAsset.url,
              mimeType: selectedAsset.mimeType,
              duration: selectedAsset.duration,
              width: selectedAsset.width,
              height: selectedAsset.height,
            },
          ]
        : undefined;

      if (!targetPostId) {
        const result = await createPost({
          actorProfileId,
          caption,
          hashtags,
          link: link || undefined,
          platforms,
          isSponsoredContent,
          aiGenerated: false,
          assetRefs,
        });
        targetPostId = result.postId;
      } else {
        await updatePost({
          postId: targetPostId,
          caption,
          hashtags,
          link: link || undefined,
          platforms,
          isSponsoredContent,
          assetRefs,
        });
      }

      await queuePost({ postId: targetPostId! });

      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setIsPosting(false);
    }
  };

  const handleDelete = async () => {
    if (!postId) return;

    if (!confirm("Are you sure you want to delete this post?")) {
      return;
    }

    try {
      await deletePost({ postId });
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  // Build full caption for preview
  const fullCaption =
    caption +
    (hashtags.length > 0 ? `\n\n${hashtags.map((t) => `#${t}`).join(" ")}` : "") +
    (link ? `\n\n${link}` : "");

  const currentLimit = activePreview ? characterLimits[activePreview] || 5000 : 5000;
  const isOverLimit = fullCaption.length > currentLimit;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              {postId ? "Edit Post" : "Create Post"}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Compose and publish to multiple platforms
            </p>
          </div>
        </div>

        {postId && post?.status === "draft" && (
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor panel */}
        <div className="space-y-6">
          {/* Platform selection */}
          <div className="rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-[#0f1219]">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">
              Select Platforms
            </h3>
            <div className="flex flex-wrap gap-3">
              {(connectedPlatforms as ConnectedAccount[] | undefined)?.map((account: ConnectedAccount) => (
                <button
                  key={account._id}
                  onClick={() => handlePlatformToggle(account.provider)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                    selectedPlatforms.includes(account.provider)
                      ? "bg-red-600 text-white"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {platformIcons[account.provider]}
                  <span className="text-sm capitalize">{account.provider}</span>
                  {selectedPlatforms.includes(account.provider) && (
                    <CheckCircle className="h-4 w-4" />
                  )}
                </button>
              ))}
            </div>
            {(!connectedPlatforms || connectedPlatforms.length === 0) && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No accounts connected.{" "}
                <button onClick={onBack} className="text-red-600 hover:underline">
                  Connect accounts first
                </button>
              </p>
            )}
          </div>

          {/* Caption editor */}
          <div className="rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-[#0f1219]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Caption</h3>
              <div className="flex items-center gap-2">
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="text-sm rounded-lg border border-slate-200 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="casual">Casual</option>
                  <option value="hype">Hype</option>
                  <option value="informative">Informative</option>
                  <option value="press">Press</option>
                  <option value="heartfelt">Heartfelt</option>
                </select>
                <button
                  onClick={handleGenerateAI}
                  disabled={isGenerating || selectedPlatforms.length === 0}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  AI Generate
                </button>
              </div>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write your caption..."
              rows={6}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-red-900"
            />
            <div className="flex items-center justify-between mt-2">
              <span
                className={`text-sm ${
                  isOverLimit ? "text-red-500" : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {fullCaption.length} / {currentLimit}
              </span>
            </div>
          </div>

          {/* Asset Selector */}
          <div className="rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-[#0f1219]">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
              <ImagePlus className="h-4 w-4" />
              Media Asset
            </h3>
            {selectedAsset ? (
              <div className="relative">
                {/* Selected asset preview */}
                <div className="relative aspect-[9/16] max-w-[200px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                  {selectedAsset.url ? (
                    selectedAsset.type === "video" ? (
                      <div className="relative w-full h-full bg-slate-900">
                        <video
                          src={selectedAsset.url}
                          className="w-full h-full object-cover"
                          muted
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="h-8 w-8 text-white" />
                        </div>
                        {selectedAsset.duration && (
                          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs">
                            {Math.floor(selectedAsset.duration / 60)}:{String(Math.floor(selectedAsset.duration % 60)).padStart(2, "0")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <img
                        src={selectedAsset.url}
                        alt="Selected asset"
                        className="w-full h-full object-cover"
                      />
                    )
                  ) : (
                    <div className="w-full h-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                      <Video className="h-8 w-8 text-slate-400" />
                    </div>
                  )}
                </div>
                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setShowAssetSelector(true)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 text-sm transition-colors"
                  >
                    <ImagePlus className="h-4 w-4" />
                    Change
                  </button>
                  <button
                    onClick={() => setSelectedAsset(null)}
                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/30 text-sm transition-colors"
                  >
                    <X className="h-4 w-4" />
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAssetSelector(true)}
                className="w-full flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-red-400 hover:text-red-500 dark:border-slate-600 dark:text-slate-400 dark:hover:border-red-600 dark:hover:text-red-400 transition-colors"
              >
                <ImagePlus className="h-10 w-10" />
                <div className="text-center">
                  <p className="text-sm font-medium">Add Media</p>
                  <p className="text-xs mt-1">Select a clip, meme, or image</p>
                </div>
              </button>
            )}
          </div>

          {/* Hashtags */}
          <div className="rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-[#0f1219]">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Hashtags
            </h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {hashtags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-sm"
                >
                  #{tag}
                  <button
                    onClick={() => handleRemoveHashtag(tag)}
                    className="hover:text-red-900 dark:hover:text-red-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newHashtag}
                onChange={(e) => setNewHashtag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddHashtag()}
                placeholder="Add hashtag..."
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
              <button
                onClick={handleAddHashtag}
                className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Link */}
          <div className="rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-[#0f1219]">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Link
            </h3>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://flmlnk.com/f/your-film"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          {/* Sponsored content toggle */}
          <div className="rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-[#0f1219]">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Sponsored Content
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Enable if this is a paid partnership or sponsored post
                </p>
              </div>
              <input
                type="checkbox"
                checked={isSponsoredContent}
                onChange={(e) => setIsSponsoredContent(e.target.checked)}
                className="rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
            </label>
          </div>

          {/* Schedule */}
          <div className="rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-[#0f1219]">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Schedule (Optional)
            </h3>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </div>

        {/* Preview panel */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-[#0f1219]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Preview
              </h3>
              {selectedPlatforms.length > 1 && (
                <div className="flex gap-1">
                  {selectedPlatforms.map((platform) => (
                    <button
                      key={platform}
                      onClick={() => setActivePreview(platform)}
                      className={`p-2 rounded-lg transition-colors ${
                        activePreview === platform
                          ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                          : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      {platformIcons[platform]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {activePreview ? (
              <PlatformPreview
                platform={activePreview}
                caption={fullCaption}
                characterLimit={characterLimits[activePreview]}
                asset={selectedAsset}
              />
            ) : (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                Select a platform to preview
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handlePostNow}
              disabled={isPosting || isSaving || !caption.trim() || selectedPlatforms.length === 0}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium shadow-lg shadow-red-950/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPosting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
              Post Now
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleSchedule}
                disabled={isSaving || !caption.trim() || !scheduledAt || selectedPlatforms.length === 0}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-purple-900/30 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Clock className="h-4 w-4" />
                Schedule
              </button>

              <button
                onClick={handleSaveDraft}
                disabled={isSaving || !caption.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Draft
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Asset Selector Modal */}
      {showAssetSelector && (
        <AssetSelector
          actorProfileId={actorProfileId}
          selectedAsset={selectedAsset}
          onSelectAsset={(asset) => {
            setSelectedAsset(asset);
          }}
          onClose={() => setShowAssetSelector(false)}
        />
      )}
    </div>
  );
}

function PlatformPreview({
  platform,
  caption,
  characterLimit,
  asset,
}: {
  platform: string;
  caption: string;
  characterLimit: number;
  asset: AssetRef | null;
}) {
  const truncatedCaption =
    caption.length > characterLimit ? caption.slice(0, characterLimit - 3) + "..." : caption;
  const isOverLimit = caption.length > characterLimit;

  // Platform-specific preview styles
  const previewStyles: Record<string, { bg: string; text: string; accent: string }> = {
    instagram: {
      bg: "bg-white dark:bg-black",
      text: "text-slate-900 dark:text-white",
      accent: "text-blue-500",
    },
    facebook: {
      bg: "bg-white dark:bg-[#242526]",
      text: "text-slate-900 dark:text-white",
      accent: "text-blue-600",
    },
    twitter: {
      bg: "bg-white dark:bg-black",
      text: "text-slate-900 dark:text-white",
      accent: "text-blue-500",
    },
    tiktok: {
      bg: "bg-black",
      text: "text-white",
      accent: "text-pink-500",
    },
    youtube: {
      bg: "bg-white dark:bg-[#0f0f0f]",
      text: "text-slate-900 dark:text-white",
      accent: "text-red-600",
    },
    linkedin: {
      bg: "bg-white dark:bg-[#1b1f23]",
      text: "text-slate-900 dark:text-white",
      accent: "text-blue-700",
    },
  };

  const styles = previewStyles[platform] || previewStyles.twitter;

  return (
    <div className={`rounded-xl ${styles.bg} border border-slate-200 dark:border-slate-700 overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="w-10 h-10 rounded-full bg-red-200 dark:bg-red-800" />
        <div>
          <p className={`text-sm font-semibold ${styles.text}`}>Your Name</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">@username • Just now</p>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <p className={`text-sm ${styles.text} whitespace-pre-wrap`}>
          {truncatedCaption}
        </p>
      </div>

      {/* Asset Preview */}
      {asset && asset.url && (
        <div className="px-4 pb-4">
          <div className="relative rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
            {asset.type === "video" ? (
              <div className="relative aspect-[9/16] max-h-[300px]">
                <video
                  src={asset.url}
                  className="w-full h-full object-cover"
                  muted
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Play className="h-10 w-10 text-white" />
                </div>
                {asset.duration && (
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs">
                    {Math.floor(asset.duration / 60)}:{String(Math.floor(asset.duration % 60)).padStart(2, "0")}
                  </div>
                )}
              </div>
            ) : (
              <img
                src={asset.url}
                alt="Post media"
                className="w-full max-h-[300px] object-contain"
              />
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 pb-4">
        {isOverLimit && (
          <div className="flex items-center gap-2 text-xs text-red-500 mb-2">
            <AlertCircle className="h-3.5 w-3.5" />
            Caption exceeds {platform} limit by {caption.length - characterLimit} characters
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{caption.length} / {characterLimit}</span>
          <span className="capitalize flex items-center gap-1">
            {platformIcons[platform]}
            {platform}
          </span>
        </div>
      </div>
    </div>
  );
}
