"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowLeft,
  Download,
  Play,
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
  Sparkles,
  Hash,
  FileText,
  Video,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import { ThumbnailPicker } from "@/components/actor/ThumbnailPicker";
import { HighlightExtractor } from "@/components/actor/HighlightExtractor";
import { useSession } from "@/lib/auth-client";
import { buildSignInUrl } from "@/lib/routes";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

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

export default function ClipDetailPage() {
  const params = useParams();
  const router = useRouter();
  const urlSlug = params.slug as string;
  const clipId = params.clipId as string;

  const { data: sessionData, isLoading: sessionLoading } = useSession();
  const isAuthenticated = Boolean(sessionData?.session);

  // Check onboarding status and verify slug ownership
  const status = useQuery(api.filmmakers.getOnboardingStatus, {});
  const ownerSlug = status?.slug;

  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showThumbnailPicker, setShowThumbnailPicker] = useState(false);
  const [showHighlightExtractor, setShowHighlightExtractor] = useState(false);

  // Redirect to sign in if not authenticated
  useEffect(() => {
    if (!sessionLoading && !isAuthenticated) {
      router.replace(buildSignInUrl({ next: `/dashboard/${urlSlug}/clips/${clipId}` }));
    }
  }, [sessionLoading, isAuthenticated, router, urlSlug, clipId]);

  // If the URL slug doesn't match the user's profile slug, redirect to correct URL
  useEffect(() => {
    if (ownerSlug && urlSlug && ownerSlug !== urlSlug) {
      router.replace(`/dashboard/${ownerSlug}/clips/${clipId}`);
    }
  }, [ownerSlug, urlSlug, router, clipId]);

  const clip = useQuery(
    api.clipGenerator.getGeneratedClipById,
    clipId ? { clipId: clipId as Id<"generated_clips"> } : "skip"
  );

  const deleteClip = useMutation(api.clipGenerator.deleteGeneratedClip);
  const toggleVisibility = useMutation(api.clipGenerator.toggleGeneratedClipVisibility);

  const handleDelete = useCallback(async () => {
    if (!urlSlug || !clip) return;
    if (!confirm("Are you sure you want to delete this clip? This action cannot be undone.")) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteClip({ slug: urlSlug, clipId: clip._id });
      router.push(`/dashboard/${urlSlug}?module=clips-generator`);
    } catch (err) {
      console.error("Failed to delete clip:", err);
      alert(err instanceof Error ? err.message : "Failed to delete clip");
    } finally {
      setIsDeleting(false);
    }
  }, [urlSlug, clip, deleteClip, router]);

  const handleToggleVisibility = useCallback(async () => {
    if (!urlSlug || !clip) return;

    setIsTogglingVisibility(true);
    try {
      await toggleVisibility({
        slug: urlSlug,
        clipId: clip._id,
        isPublic: !clip.isPublic,
      });
    } catch (err) {
      console.error("Failed to toggle visibility:", err);
      alert(err instanceof Error ? err.message : "Failed to toggle visibility");
    } finally {
      setIsTogglingVisibility(false);
    }
  }, [urlSlug, clip, toggleVisibility]);

  const handleCopyUrl = useCallback(() => {
    if (clip?.downloadUrl) {
      navigator.clipboard.writeText(clip.downloadUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  }, [clip?.downloadUrl]);

  if (clip === undefined) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (clip === null) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-black p-6">
        <div className="max-w-4xl mx-auto">
          <Link
            href={`/dashboard/${urlSlug}?module=clips-generator`}
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-white/50 dark:hover:text-white mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Clips
          </Link>
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-black/40">
            <Video className="w-12 h-12 mx-auto text-slate-300 dark:text-white/30 mb-4" />
            <h2 className="text-lg font-semibold text-slate-700 dark:text-white mb-2">
              Clip Not Found
            </h2>
            <p className="text-sm text-slate-500 dark:text-white/50">
              This clip may have been deleted or doesn&apos;t exist.
            </p>
          </div>
        </div>
      </div>
    );
  }

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
            Back to Clips
          </Link>

          <div className="flex items-center gap-2">
            {/* Visibility Toggle */}
            <button
              type="button"
              onClick={handleToggleVisibility}
              disabled={isTogglingVisibility}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                clip.isPublic
                  ? "bg-green-500/10 text-green-600 hover:bg-green-500/20 dark:text-green-400"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
              }`}
            >
              {isTogglingVisibility ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : clip.isPublic ? (
                <Eye className="w-4 h-4" />
              ) : (
                <EyeOff className="w-4 h-4" />
              )}
              {clip.isPublic ? "Public" : "Hidden"}
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
          {/* Main Content - Video Player */}
          <div className="lg:col-span-2 space-y-6">
            {/* Video Player Card */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-white/10 dark:bg-black/40">
              {clip.downloadUrl ? (
                <div className="aspect-[9/16] max-h-[600px] bg-black flex items-center justify-center">
                  <video
                    src={clip.downloadUrl}
                    controls
                    className="w-full h-full object-contain"
                    poster={clip.customThumbnailUrl || clip.thumbnailUrl}
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              ) : (
                <div className="aspect-[9/16] max-h-[600px] bg-slate-900 flex items-center justify-center">
                  <Play className="w-16 h-16 text-white/30" />
                </div>
              )}

              {/* Video Actions */}
              <div className="p-4 border-t border-slate-100 dark:border-white/10">
                <div className="flex items-center justify-between gap-4">
                  <h1 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                    {clip.title}
                  </h1>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowThumbnailPicker(true)}
                      className="p-2 rounded-lg text-slate-400 hover:bg-blue-100 hover:text-blue-600 transition-colors dark:hover:bg-blue-500/20 dark:hover:text-blue-400"
                      title="Change thumbnail"
                    >
                      <Image className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowHighlightExtractor(true)}
                      className="p-2 rounded-lg text-slate-400 hover:bg-amber-100 hover:text-amber-600 transition-colors dark:hover:bg-amber-500/20 dark:hover:text-amber-400"
                      title="Extract highlights"
                    >
                      <Sparkles className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors dark:hover:bg-white/10 dark:hover:text-white"
                      title="Copy video URL"
                    >
                      {copiedUrl ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                    <a
                      href={clip.downloadUrl}
                      download
                      className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors dark:hover:bg-white/10 dark:hover:text-white"
                      title="Download"
                    >
                      <Download className="w-5 h-5" />
                    </a>
                    <a
                      href={clip.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors dark:hover:bg-white/10 dark:hover:text-white"
                      title="Open in new tab"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Transcript Card */}
            {clip.transcript && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-black/40">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-medium text-slate-500 dark:text-white/50 uppercase tracking-wide">
                    Transcript
                  </h3>
                </div>
                <p className="text-sm text-slate-700 dark:text-white/80 leading-relaxed whitespace-pre-wrap">
                  {clip.transcript}
                </p>
              </div>
            )}
          </div>

          {/* Sidebar - Metadata */}
          <div className="space-y-6">
            {/* Viral Score Card */}
            <div className={`rounded-xl border p-5 ${getScoreBgColor(clip.score)}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-medium text-slate-500 dark:text-white/50 uppercase tracking-wide">
                    Viral Score
                  </h3>
                </div>
                <span className={`text-2xl font-bold ${getScoreColor(clip.score)}`}>
                  {clip.score}%
                </span>
              </div>
              <p className={`text-sm font-medium ${getScoreColor(clip.score)}`}>
                {getScoreLabel(clip.score)} Potential
              </p>

              {/* Viral Analysis Details */}
              {clip.viralAnalysis && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10 space-y-3">
                  {clip.viralAnalysis.hookStrength !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 dark:text-white/50">Hook Strength</span>
                      <span className="text-sm font-medium text-slate-700 dark:text-white">
                        {clip.viralAnalysis.hookStrength}%
                      </span>
                    </div>
                  )}
                  {clip.viralAnalysis.retentionScore !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 dark:text-white/50">Retention</span>
                      <span className="text-sm font-medium text-slate-700 dark:text-white">
                        {clip.viralAnalysis.retentionScore}%
                      </span>
                    </div>
                  )}
                  {clip.viralAnalysis.shareabilityScore !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 dark:text-white/50">Shareability</span>
                      <span className="text-sm font-medium text-slate-700 dark:text-white">
                        {clip.viralAnalysis.shareabilityScore}%
                      </span>
                    </div>
                  )}
                  {clip.viralAnalysis.summary && (
                    <p className="text-xs text-slate-600 dark:text-white/60 mt-2">
                      {clip.viralAnalysis.summary}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Clip Details Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-black/40">
              <h3 className="text-sm font-medium text-slate-500 dark:text-white/50 uppercase tracking-wide mb-4">
                Clip Details
              </h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500 dark:text-white/50">Duration</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-white">
                      {formatDuration(clip.duration)}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Video className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500 dark:text-white/50">Time Range</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-white">
                      {formatTimestamp(clip.startTime)} - {formatTimestamp(clip.endTime)}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500 dark:text-white/50">Created</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-white">
                      {formatDate(clip.createdAt)}
                    </p>
                  </div>
                </div>

                {clip.layout && (
                  <div className="flex items-start gap-3">
                    <Image className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500 dark:text-white/50">Layout</p>
                      <p className="text-sm font-medium text-slate-700 dark:text-white capitalize">
                        {clip.layout}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Source Video Card */}
            {(clip.jobVideoTitle || clip.videoTitle) && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-black/40">
                <h3 className="text-sm font-medium text-slate-500 dark:text-white/50 uppercase tracking-wide mb-3">
                  Source Video
                </h3>
                <p className="text-sm text-slate-700 dark:text-white/80">
                  {clip.jobVideoTitle || clip.videoTitle}
                </p>
                {clip.jobSourceUrl && (
                  <a
                    href={clip.jobSourceUrl}
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
            {clip.viralAnalysis?.suggestedHashtags && clip.viralAnalysis.suggestedHashtags.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-black/40">
                <div className="flex items-center gap-2 mb-3">
                  <Hash className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-medium text-slate-500 dark:text-white/50 uppercase tracking-wide">
                    Suggested Hashtags
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {clip.viralAnalysis.suggestedHashtags.map((tag, idx) => (
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

            {/* Description Card */}
            {clip.description && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-black/40">
                <h3 className="text-sm font-medium text-slate-500 dark:text-white/50 uppercase tracking-wide mb-3">
                  Description
                </h3>
                <p className="text-sm text-slate-700 dark:text-white/80">
                  {clip.description}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Thumbnail Picker Modal */}
      {showThumbnailPicker && clip.downloadUrl && urlSlug && (
        <ThumbnailPicker
          isOpen={showThumbnailPicker}
          onClose={() => setShowThumbnailPicker(false)}
          videoUrl={clip.downloadUrl}
          clipId={clip._id}
          clipType="generated"
          onThumbnailSaved={() => setShowThumbnailPicker(false)}
          currentThumbnailUrl={clip.customThumbnailUrl || clip.thumbnailUrl}
        />
      )}

      {/* Highlight Extractor Modal */}
      {showHighlightExtractor && clip.downloadUrl && urlSlug && (
        <HighlightExtractor
          isOpen={showHighlightExtractor}
          onClose={() => setShowHighlightExtractor(false)}
          videoUrl={clip.downloadUrl}
          sourceType="generated_clip"
          sourceId={clip._id}
          sourceTitle={clip.title}
          slug={urlSlug}
          onAssetsSaved={() => setShowHighlightExtractor(false)}
        />
      )}
    </div>
  );
}
