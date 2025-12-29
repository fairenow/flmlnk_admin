"use client";

import type { FC, MouseEvent, TouchEvent as ReactTouchEvent } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Play, X, VolumeX, Volume2, Share2, ChevronUp, ChevronDown, DollarSign } from "lucide-react";

type Clip = {
  _id: Id<"clips">;
  title: string;
  youtubeUrl: string;
  description?: string;
  deepLinkId?: string;
  duration?: string;
  customThumbnailUrl?: string; // Custom 9:16 thumbnail (overrides YouTube default)
};

type ClipsGalleryProps = {
  clips: Clip[];
  slug: string;
  featuredClipId?: Id<"clips">;
  primaryColor?: string;
  onClipShare?: (_clipId: Id<"clips">) => void;
};

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Hardcoded Stripe payment link for all clips
const STRIPE_PAYMENT_URL = "https://buy.stripe.com/bJe4gz9Qf82zcp3aOSew803";

function _getThumbnailUrl(youtubeUrl: string, quality: "mq" | "hq" | "maxres" = "maxres"): string {
  const videoId = extractYouTubeId(youtubeUrl);
  if (!videoId) return "";
  const qualityMap = {
    mq: "mqdefault",
    hq: "hqdefault",
    maxres: "maxresdefault",
  };
  return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}.jpg`;
}

// Get all thumbnail URLs for fallback
function getThumbnailUrls(youtubeUrl: string): string[] {
  const videoId = extractYouTubeId(youtubeUrl);
  if (!videoId) return [];
  // Return thumbnails in order of preference (best to worst quality)
  return [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/default.jpg`,
  ];
}

// Component to handle YouTube thumbnail with fallback quality levels
// Supports custom 9:16 thumbnail that takes precedence over YouTube thumbnails
function YouTubeThumbnail({
  youtubeUrl,
  alt,
  className,
  customThumbnailUrl
}: {
  youtubeUrl: string;
  alt: string;
  className?: string;
  customThumbnailUrl?: string;
}) {
  const thumbnailUrls = getThumbnailUrls(youtubeUrl);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [customError, setCustomError] = useState(false);

  const handleError = useCallback(() => {
    // Try next quality level
    if (currentIndex < thumbnailUrls.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setHasError(true);
    }
  }, [currentIndex, thumbnailUrls.length]);

  // If custom thumbnail provided and hasn't errored, use it
  if (customThumbnailUrl && !customError) {
    return (
      <img
        src={customThumbnailUrl}
        alt={alt}
        className={className}
        onError={() => setCustomError(true)}
      />
    );
  }

  if (hasError || thumbnailUrls.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 ${className || ""}`}>
        <svg
          className="w-12 h-12 text-slate-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={thumbnailUrls[currentIndex]}
      alt={alt}
      className={className}
      onError={handleError}
    />
  );
}

export const ClipsGallery: FC<ClipsGalleryProps> = ({
  clips,
  slug,
  featuredClipId,
  primaryColor = "#FF1744",
  onClipShare,
}) => {
  const [copiedId, setCopiedId] = useState<Id<"clips"> | null>(null);
  const [fullscreenClipIndex, setFullscreenClipIndex] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [_isPlaying, setIsPlaying] = useState(false);
  const [showContribOptions, setShowContribOptions] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const playerRef = useRef<any>(null);
  const touchStartY = useRef<number>(0);
  const touchStartX = useRef<number>(0);

  // Filter out the featured clip if shown separately
  const galleryClips = featuredClipId
    ? clips.filter((c) => c._id !== featuredClipId)
    : clips;

  const currentClip = fullscreenClipIndex !== null ? galleryClips[fullscreenClipIndex] : null;

  // Mount check for portal
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // Lock body scroll when fullscreen
  useEffect(() => {
    if (fullscreenClipIndex !== null) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.classList.add('video-player-open');

      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        document.body.classList.remove('video-player-open');
        window.scrollTo(0, scrollY);
      };
    }
  }, [fullscreenClipIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (fullscreenClipIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goToPrevClip();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        goToNextClip();
      } else if (e.key === 'Escape') {
        closeFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenClipIndex, galleryClips.length]);

  const handleShare = useCallback(
    async (e: MouseEvent, clip: Clip) => {
      e.preventDefault();
      e.stopPropagation();

      const deepLink = clip.deepLinkId ?? clip._id;
      const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/f/${slug}?clip=${deepLink}`;

      try {
        if (navigator.share) {
          await navigator.share({
            title: clip.title,
            text: clip.description || '',
            url: shareUrl
          });
        } else {
          await navigator.clipboard.writeText(shareUrl);
          setCopiedId(clip._id);
          setTimeout(() => setCopiedId(null), 2000);
        }
        onClipShare?.(clip._id);
      } catch {
        // Fallback
        try {
          await navigator.clipboard.writeText(shareUrl);
          setCopiedId(clip._id);
          setTimeout(() => setCopiedId(null), 2000);
        } catch {
          // Ignore
        }
      }
    },
    [slug, onClipShare]
  );

  const openFullscreen = useCallback((index: number) => {
    setFullscreenClipIndex(index);
    setIsPlaying(true);
  }, []);

  const closeFullscreen = useCallback(() => {
    setFullscreenClipIndex(null);
    setIsPlaying(false);
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
  }, []);

  const goToNextClip = useCallback(() => {
    if (fullscreenClipIndex !== null && fullscreenClipIndex < galleryClips.length - 1) {
      setFullscreenClipIndex(fullscreenClipIndex + 1);
    }
  }, [fullscreenClipIndex, galleryClips.length]);

  const goToPrevClip = useCallback(() => {
    if (fullscreenClipIndex !== null && fullscreenClipIndex > 0) {
      setFullscreenClipIndex(fullscreenClipIndex - 1);
    }
  }, [fullscreenClipIndex]);

  // Touch handlers for swipe
  const handleTouchStart = useCallback((e: ReactTouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: ReactTouchEvent) => {
    const touchEndY = e.changedTouches[0].clientY;
    const touchEndX = e.changedTouches[0].clientX;
    const diffY = touchStartY.current - touchEndY;
    const diffX = Math.abs(touchStartX.current - touchEndX);

    // Only trigger swipe if vertical movement is greater than horizontal
    if (Math.abs(diffY) > 50 && diffX < 100) {
      if (diffY > 0) {
        goToNextClip();
      } else {
        goToPrevClip();
      }
    } else if (Math.abs(diffY) < 10 && diffX < 10) {
      // Tap to toggle play/pause (handled elsewhere)
    }
  }, [goToNextClip, goToPrevClip]);

  if (galleryClips.length === 0) return null;

  return (
    <>
      {/* Fullscreen Player - Portal */}
      {fullscreenClipIndex !== null && currentClip && isMounted && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
          style={{ touchAction: 'none' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Video Player */}
          <div className="relative w-full h-full max-w-md mx-auto">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${extractYouTubeId(currentClip.youtubeUrl)}?autoplay=1&mute=${isMuted ? 1 : 0}&playsinline=1&controls=1&modestbranding=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''}`}
              title={currentClip.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />

            {/* Gradient overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent pointer-events-none" />
          </div>

          {/* Close Button - Top Right */}
          <button
            onClick={closeFullscreen}
            className="absolute top-4 right-4 z-[100] p-3 bg-black/70 rounded-full hover:bg-black/90 transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {/* Mute Button - Top Left */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="absolute top-4 left-4 z-[100] p-3 bg-black/70 rounded-full hover:bg-black/90 transition-colors"
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
          </button>

          {/* Navigation Indicators */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-[100]">
            <button
              onClick={goToPrevClip}
              disabled={fullscreenClipIndex === 0}
              className={`p-2 rounded-full bg-black/50 ${fullscreenClipIndex === 0 ? 'opacity-30' : 'hover:bg-black/70'}`}
            >
              <ChevronUp className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={goToNextClip}
              disabled={fullscreenClipIndex === galleryClips.length - 1}
              className={`p-2 rounded-full bg-black/50 ${fullscreenClipIndex === galleryClips.length - 1 ? 'opacity-30' : 'hover:bg-black/70'}`}
            >
              <ChevronDown className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Video Info - Bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 z-[50]">
            <h3 className="text-white text-lg md:text-xl font-bold mb-1">{currentClip.title}</h3>
            {currentClip.description && (
              <p className="text-gray-300 text-sm line-clamp-2">{currentClip.description}</p>
            )}
          </div>

          {/* Action Buttons - Right Side */}
          <div className="absolute right-4 bottom-24 flex flex-col gap-4 z-[100]">
            {/* Share Button */}
            <button
              onClick={(e) => handleShare(e, currentClip)}
              className="p-3 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
            >
              <Share2 className="w-6 h-6 text-white" />
            </button>

            {/* Contribution Button */}
            <div className="relative">
              <button
                onClick={() => setShowContribOptions(!showContribOptions)}
                className="p-3 rounded-full hover:bg-black/70 transition-colors"
                style={{ backgroundColor: showContribOptions ? primaryColor : 'rgba(0,0,0,0.5)' }}
              >
                <DollarSign className="w-6 h-6 text-white" />
              </button>
              {showContribOptions && (
                <div className="absolute bottom-full right-0 mb-2 flex flex-col gap-2">
                  {['$1', '$5', '$10', '$25'].map((amount) => (
                    <a
                      key={amount}
                      href={STRIPE_PAYMENT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-white text-black rounded-full text-sm font-semibold hover:bg-gray-200 transition-colors whitespace-nowrap"
                    >
                      {amount}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Clip Counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] px-3 py-1 bg-black/50 rounded-full text-white text-sm">
            {fullscreenClipIndex + 1} / {galleryClips.length}
          </div>
        </div>,
        document.body
      )}

      {/* Grid Gallery */}
      <section className="bg-black text-white py-8 md:py-16 px-4 md:px-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-white">Clips & Reels</h2>
            <span className="text-sm text-gray-500">
              {galleryClips.length} video{galleryClips.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {galleryClips.map((clip, index) => {
              const isCopied = copiedId === clip._id;

              return (
                <div
                  key={clip._id}
                  className="group relative overflow-hidden rounded-lg cursor-pointer aspect-[9/16] bg-gray-900"
                  onClick={() => openFullscreen(index)}
                >
                  {/* Thumbnail - prefers custom 9:16 thumbnail */}
                  <YouTubeThumbnail
                    youtubeUrl={clip.youtubeUrl}
                    alt={clip.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    customThumbnailUrl={clip.customThumbnailUrl}
                  />

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  {/* Play Button */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div
                      className="w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <Play className="w-5 h-5 md:w-7 md:h-7 text-white ml-1" fill="currentColor" />
                    </div>
                  </div>

                  {/* Duration Badge */}
                  {clip.duration && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/80 rounded text-xs text-white">
                      {clip.duration}
                    </div>
                  )}

                  {/* Match Score / Year (mimicking Netflix) */}
                  <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="flex items-center gap-2 text-xs mb-1">
                      <span className="text-green-500 font-semibold">98% Match</span>
                      <span className="text-gray-400">2025</span>
                    </div>
                    <h3 className="text-white text-sm font-semibold line-clamp-1">{clip.title}</h3>
                  </div>

                  {/* Watch & Support Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openFullscreen(index);
                    }}
                    className="absolute bottom-3 left-3 right-3 py-2 rounded-md font-semibold text-sm text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-carpet-red-800/90 via-carpet-red-600/90 to-red-500/80"
                  >
                    Watch & Support
                  </button>

                  {/* Share Button */}
                  <button
                    onClick={(e) => handleShare(e, clip)}
                    className={`absolute top-2 left-2 p-2 rounded-full transition-all duration-200 opacity-0 group-hover:opacity-100 ${
                      isCopied ? 'bg-green-500' : 'bg-black/50 hover:bg-black/70'
                    }`}
                  >
                    {isCopied ? (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <Share2 className="w-4 h-4 text-white" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
};

export default ClipsGallery;
