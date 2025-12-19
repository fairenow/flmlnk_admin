"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowLeft,
  Download,
  Clock,
  TrendingUp,
  Eye,
  EyeOff,
  Trash2,
  Loader2,
  ExternalLink,
  Copy,
  CheckCircle2,
  Image,
  Hash,
  Star,
  StarOff,
  MessageSquare,
  Lightbulb,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { buildSignInUrl } from "@/lib/routes";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
}

function getScoreBgColor(score: number): string {
  if (score >= 80) return "bg-green-500/10 border-green-500/30";
  if (score >= 60) return "bg-yellow-500/10 border-yellow-500/30";
  if (score >= 40) return "bg-orange-500/10 border-orange-500/30";
  return "bg-red-500/10 border-red-500/30";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Low";
}

export default function MemeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const urlSlug = params.slug as string;
  const memeId = params.memeId as string;

  const { data: sessionData, isLoading: sessionLoading } = useSession();
  const isAuthenticated = Boolean(sessionData?.session);

  // Check onboarding status and verify slug ownership
  const status = useQuery(api.filmmakers.getOnboardingStatus, {});
  const ownerSlug = status?.slug;

  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);

  // Redirect to sign in if not authenticated
  useEffect(() => {
    if (!sessionLoading && !isAuthenticated) {
      router.replace(buildSignInUrl({ next: `/dashboard/${urlSlug}/memes/${memeId}` }));
    }
  }, [sessionLoading, isAuthenticated, router, urlSlug, memeId]);

  // If the URL slug doesn't match the user's profile slug, redirect to correct URL
  useEffect(() => {
    if (ownerSlug && urlSlug && ownerSlug !== urlSlug) {
      router.replace(`/dashboard/${ownerSlug}/memes/${memeId}`);
    }
  }, [ownerSlug, urlSlug, router, memeId]);

  const meme = useQuery(
    api.memeGenerator.getGeneratedMemeById,
    memeId ? { memeId: memeId as Id<"generated_memes"> } : "skip"
  );

  const deleteMeme = useMutation(api.memeGenerator.deleteMeme);
  const toggleVisibility = useMutation(api.memeGenerator.toggleMemeVisibility);
  const toggleFavorite = useMutation(api.memeGenerator.toggleMemeFavorite);

  const handleDelete = useCallback(async () => {
    if (!urlSlug || !meme) return;
    if (!confirm("Are you sure you want to delete this meme? This action cannot be undone.")) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteMeme({ slug: urlSlug, memeId: meme._id });
      router.push(`/dashboard/${urlSlug}?module=clips-generator`);
    } catch (err) {
      console.error("Failed to delete meme:", err);
      alert(err instanceof Error ? err.message : "Failed to delete meme");
    } finally {
      setIsDeleting(false);
    }
  }, [urlSlug, meme, deleteMeme, router]);

  const handleToggleVisibility = useCallback(async () => {
    if (!urlSlug || !meme) return;

    setIsTogglingVisibility(true);
    try {
      await toggleVisibility({
        slug: urlSlug,
        memeId: meme._id,
        isPublic: !meme.isPublic,
      });
    } catch (err) {
      console.error("Failed to toggle visibility:", err);
      alert(err instanceof Error ? err.message : "Failed to toggle visibility");
    } finally {
      setIsTogglingVisibility(false);
    }
  }, [urlSlug, meme, toggleVisibility]);

  const handleToggleFavorite = useCallback(async () => {
    if (!urlSlug || !meme) return;

    setIsTogglingFavorite(true);
    try {
      await toggleFavorite({
        slug: urlSlug,
        memeId: meme._id,
        isFavorite: !meme.isFavorite,
      });
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
      alert(err instanceof Error ? err.message : "Failed to toggle favorite");
    } finally {
      setIsTogglingFavorite(false);
    }
  }, [urlSlug, meme, toggleFavorite]);

  const handleCopyCaption = useCallback(() => {
    if (meme?.caption) {
      navigator.clipboard.writeText(meme.caption);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
    }
  }, [meme?.caption]);

  if (meme === undefined) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (meme === null) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-black p-6">
        <div className="max-w-4xl mx-auto">
          <Link
            href={`/dashboard/${urlSlug}?module=clips-generator`}
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-white/50 dark:hover:text-white mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Generator
          </Link>
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-black/40">
            <Image className="w-12 h-12 mx-auto text-slate-300 dark:text-white/30 mb-4" />
            <h2 className="text-lg font-semibold text-slate-700 dark:text-white mb-2">
              Meme Not Found
            </h2>
            <p className="text-sm text-slate-500 dark:text-white/50">
              This meme may have been deleted or doesn&apos;t exist.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const primaryFrame = meme.frames?.[0];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href={`/dashboard/${urlSlug}?module=clips-generator`}
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-white/50 dark:hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Generator
          </Link>

          <div className="flex items-center gap-2">
            {/* Favorite Toggle */}
            <button
              type="button"
              onClick={handleToggleFavorite}
              disabled={isTogglingFavorite}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                meme.isFavorite
                  ? "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
              }`}
            >
              {isTogglingFavorite ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : meme.isFavorite ? (
                <Star className="w-4 h-4 fill-current" />
              ) : (
                <StarOff className="w-4 h-4" />
              )}
              {meme.isFavorite ? "Favorited" : "Favorite"}
            </button>

            {/* Visibility Toggle */}
            <button
              type="button"
              onClick={handleToggleVisibility}
              disabled={isTogglingVisibility}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                meme.isPublic
                  ? "bg-green-500/10 text-green-600 hover:bg-green-500/20 dark:text-green-400"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
              }`}
            >
              {isTogglingVisibility ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : meme.isPublic ? (
                <Eye className="w-4 h-4" />
              ) : (
                <EyeOff className="w-4 h-4" />
              )}
              {meme.isPublic ? "Public" : "Hidden"}
            </button>

            {/* Delete */}
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors dark:text-red-400"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content - Meme Image */}
          <div className="lg:col-span-2 space-y-6">
            {/* Meme Image Card */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-white/10 dark:bg-black/40">
              {meme.memeUrl || primaryFrame?.url ? (
                <div className="bg-slate-900 flex items-center justify-center p-4">
                  <img
                    src={meme.memeUrl || primaryFrame?.url}
                    alt={meme.caption}
                    className="max-w-full max-h-[600px] object-contain rounded-lg"
                  />
                </div>
              ) : (
                <div className="aspect-square max-h-[600px] bg-slate-900 flex items-center justify-center">
                  <Image className="w-16 h-16 text-white/30" />
                </div>
              )}

              {/* Meme Actions */}
              <div className="p-4 border-t border-slate-100 dark:border-white/10">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70">
                      {meme.templateName || meme.templateType}
                    </span>
                    {meme.sentiment && (
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                        {meme.sentiment}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(meme.memeUrl || primaryFrame?.url) && (
                      <>
                        <a
                          href={meme.memeUrl || primaryFrame?.url}
                          download
                          className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors dark:hover:bg-white/10 dark:hover:text-white"
                          title="Download"
                        >
                          <Download className="w-5 h-5" />
                        </a>
                        <a
                          href={meme.memeUrl || primaryFrame?.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors dark:hover:bg-white/10 dark:hover:text-white"
                          title="Open in new tab"
                        >
                          <ExternalLink className="w-5 h-5" />
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Caption Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-black/40">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-medium text-slate-500 dark:text-white/50 uppercase tracking-wide">
                    Caption
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCaption}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors dark:hover:bg-white/10 dark:hover:text-white"
                  title="Copy caption"
                >
                  {copiedCaption ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-lg text-slate-900 dark:text-white font-medium leading-relaxed whitespace-pre-wrap">
                {meme.caption}
              </p>
              {meme.captionPosition && (
                <p className="text-xs text-slate-400 dark:text-white/40 mt-2">
                  Position: {meme.captionPosition}
                </p>
              )}
            </div>

            {/* AI Reasoning Card */}
            {meme.aiReasoning && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-black/40">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-medium text-slate-500 dark:text-white/50 uppercase tracking-wide">
                    AI Reasoning
                  </h3>
                </div>
                <p className="text-sm text-slate-700 dark:text-white/80 leading-relaxed">
                  {meme.aiReasoning}
                </p>
              </div>
            )}

            {/* Frames Gallery */}
            {meme.frames && meme.frames.length > 1 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-black/40">
                <h3 className="text-sm font-medium text-slate-500 dark:text-white/50 uppercase tracking-wide mb-4">
                  Source Frames
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {meme.frames.map((frame, idx) => (
                    <div key={idx} className="relative rounded-lg overflow-hidden bg-slate-100 dark:bg-white/5">
                      <img
                        src={frame.url}
                        alt={`Frame ${idx + 1}`}
                        className="w-full h-32 object-cover"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-white/80">
                            {frame.timestamp}s
                          </span>
                          {frame.emotion && (
                            <span className="text-[10px] text-white/80 capitalize">
                              {frame.emotion}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - Metadata */}
          <div className="space-y-6">
            {/* Viral Score Card */}
            {meme.viralScore !== undefined && (
              <div className={`rounded-xl border p-5 ${getScoreBgColor(meme.viralScore)}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-slate-400" />
                    <h3 className="text-sm font-medium text-slate-500 dark:text-white/50 uppercase tracking-wide">
                      Viral Score
                    </h3>
                  </div>
                  <span className={`text-2xl font-bold ${getScoreColor(meme.viralScore)}`}>
                    {meme.viralScore}%
                  </span>
                </div>
                <p className={`text-sm font-medium ${getScoreColor(meme.viralScore)}`}>
                  {getScoreLabel(meme.viralScore)} Potential
                </p>
              </div>
            )}

            {/* Meme Details Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-black/40">
              <h3 className="text-sm font-medium text-slate-500 dark:text-white/50 uppercase tracking-wide mb-4">
                Meme Details
              </h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Image className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500 dark:text-white/50">Template</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-white">
                      {meme.templateName || meme.templateType}
                    </p>
                  </div>
                </div>

                {meme.sentiment && (
                  <div className="flex items-start gap-3">
                    <MessageSquare className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500 dark:text-white/50">Sentiment</p>
                      <p className="text-sm font-medium text-slate-700 dark:text-white capitalize">
                        {meme.sentiment}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500 dark:text-white/50">Created</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-white">
                      {formatDate(meme.createdAt)}
                    </p>
                  </div>
                </div>

                {primaryFrame && (
                  <>
                    {primaryFrame.emotion && (
                      <div className="flex items-start gap-3">
                        <Clock className="w-4 h-4 text-slate-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-slate-500 dark:text-white/50">Detected Emotion</p>
                          <p className="text-sm font-medium text-slate-700 dark:text-white capitalize">
                            {primaryFrame.emotion}
                          </p>
                        </div>
                      </div>
                    )}

                    {primaryFrame.action && (
                      <div className="flex items-start gap-3">
                        <Clock className="w-4 h-4 text-slate-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-slate-500 dark:text-white/50">Detected Action</p>
                          <p className="text-sm font-medium text-slate-700 dark:text-white capitalize">
                            {primaryFrame.action}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Source Video Card */}
            {meme.jobVideoTitle && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-black/40">
                <h3 className="text-sm font-medium text-slate-500 dark:text-white/50 uppercase tracking-wide mb-3">
                  Source Video
                </h3>
                <p className="text-sm text-slate-700 dark:text-white/80">
                  {meme.jobVideoTitle}
                </p>
                {meme.jobSourceUrl && (
                  <a
                    href={meme.jobSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-red-600 hover:text-red-500 dark:text-[#f53c56] dark:hover:text-[#ff6b7a]"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View Original
                  </a>
                )}
              </div>
            )}

            {/* Hashtags Card */}
            {meme.suggestedHashtags && meme.suggestedHashtags.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-black/40">
                <div className="flex items-center gap-2 mb-3">
                  <Hash className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-medium text-slate-500 dark:text-white/50 uppercase tracking-wide">
                    Suggested Hashtags
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {meme.suggestedHashtags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
