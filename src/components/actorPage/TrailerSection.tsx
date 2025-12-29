"use client";

import type { FC } from "react";
import { useState, useCallback } from "react";

type TrailerSectionProps = {
  clipTitle: string;
  youtubeUrl: string;
  description?: string;
  slug: string;
  clipId?: string;
  onPlay?: () => void;
  onShare?: () => void;
  // Event tracking callbacks
  onTrailerLoad?: (trailerId: string, trailerTitle: string) => void;
  onTrailerPlay?: (trailerId: string, trailerTitle: string) => void;
  onTrailerShare?: (trailerId: string, trailerTitle: string) => void;
};

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export const TrailerSection: FC<TrailerSectionProps> = ({
  clipTitle,
  youtubeUrl,
  description,
  slug,
  clipId,
  onPlay,
  onShare,
  onTrailerLoad,
  onTrailerPlay,
  onTrailerShare,
}) => {
  const [copied, setCopied] = useState(false);
  const videoId = extractYouTubeId(youtubeUrl);

  const shareUrl = clipId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/f/${slug}?clip=${clipId}`
    : `${typeof window !== "undefined" ? window.location.origin : ""}/f/${slug}`;

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onShare?.();
      if (clipId) {
        onTrailerShare?.(clipId, clipTitle);
      }
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onShare?.();
      if (clipId) {
        onTrailerShare?.(clipId, clipTitle);
      }
    }
  }, [shareUrl, onShare, clipId, clipTitle, onTrailerShare]);

  const handleIframeLoad = useCallback(() => {
    onPlay?.();
    if (clipId) {
      onTrailerLoad?.(clipId, clipTitle);
      onTrailerPlay?.(clipId, clipTitle);
    }
  }, [onPlay, clipId, clipTitle, onTrailerLoad, onTrailerPlay]);

  if (!videoId) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-10">
        <div className="overflow-hidden rounded-2xl bg-[#15111c] shadow-2xl">
          <div className="flex aspect-video items-center justify-center bg-black/50 text-sm text-slate-400">
            Video coming soon
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <div className="overflow-hidden rounded-2xl bg-[#15111c] shadow-2xl">
        {/* Video Embed */}
        <div className="relative aspect-video bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?modestbranding=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''}`}
            title={clipTitle}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
            onLoad={handleIframeLoad}
          />
        </div>

        {/* Info bar */}
        <div className="flex flex-col gap-3 border-t border-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Featured Clip
            </p>
            <p className="text-sm font-medium text-white">{clipTitle}</p>
            {description && (
              <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/10"
          >
            {copied ? (
              <>
                <span>✓</span>
                Copied!
              </>
            ) : (
              <>
                <span>↗</span>
                Share Clip
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
};

export default TrailerSection;
