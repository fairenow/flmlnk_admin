"use client";

import type { FC, MouseEvent, TouchEvent as ReactTouchEvent } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Play, X, VolumeX, Volume2, Share2, ChevronUp, ChevronDown } from "lucide-react";

type GeneratedClip = {
  _id: Id<"generated_clips">;
  title: string;
  description: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  customThumbnailUrl?: string; // User-selected 9:16 thumbnail (takes precedence)
  duration: number;
  score: number;
};

// Processing clips from uploads
type ProcessingClip = {
  _id: string;
  title?: string;
  description?: string;
  duration: number;
  score?: number;
  clipUrl: string | null;
  thumbUrl: string | null;
  customThumbnailUrl?: string;
  createdAt: number;
};

// Unified clip type for display
type UnifiedClip = {
  id: string;
  type: "generated" | "processing";
  title: string;
  description: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  duration: number;
  score: number;
  createdAt: number;
};

/**
 * Get the best thumbnail URL for a clip.
 * Prefers customThumbnailUrl (9:16) over thumbnailUrl.
 */
function getClipThumbnailUrl(clip: GeneratedClip): string | undefined {
  return clip.customThumbnailUrl || clip.thumbnailUrl;
}

/**
 * Get the best thumbnail URL for a unified clip.
 */
function getUnifiedClipThumbnailUrl(clip: UnifiedClip): string | undefined {
  return clip.thumbnailUrl;
}

type GeneratedClipsGalleryProps = {
  clips: GeneratedClip[];
  processingClips?: ProcessingClip[];
  slug: string;
  primaryColor?: string;
  onClipShare?: (_clipId: Id<"generated_clips">) => void;
  // Event tracking callbacks
  onClipView?: (clipId: string, clipTitle: string, clipType: "generated" | "processing") => void;
  onClipPlay?: (clipId: string, clipTitle: string, clipType: "generated" | "processing") => void;
  onFullscreenOpen?: (clipId: string, clipTitle: string, clipType: "generated" | "processing") => void;
  onFullscreenClose?: () => void;
  onNavigateNext?: (clipId: string, clipTitle: string) => void;
  onNavigatePrev?: (clipId: string, clipTitle: string) => void;
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export const GeneratedClipsGallery: FC<GeneratedClipsGalleryProps> = ({
  clips,
  processingClips = [],
  slug,
  primaryColor = "#FF1744",
  onClipShare,
  onClipView,
  onClipPlay,
  onFullscreenOpen,
  onFullscreenClose,
  onNavigateNext,
  onNavigatePrev,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fullscreenClipIndex, setFullscreenClipIndex] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartY = useRef<number>(0);
  const touchStartX = useRef<number>(0);

  // Merge generated and processing clips into a unified list
  const unifiedClips = useMemo((): UnifiedClip[] => {
    const allClips: UnifiedClip[] = [];

    // Add generated clips
    for (const clip of clips) {
      allClips.push({
        id: clip._id,
        type: "generated",
        title: clip.title,
        description: clip.description || "",
        downloadUrl: clip.downloadUrl,
        thumbnailUrl: clip.customThumbnailUrl || clip.thumbnailUrl,
        duration: clip.duration,
        score: clip.score,
        createdAt: Date.now(), // Generated clips don't have createdAt exposed
      });
    }

    // Add processing clips (uploaded clips)
    for (const clip of processingClips) {
      if (clip.clipUrl) { // Only include clips with valid URLs
        allClips.push({
          id: clip._id,
          type: "processing",
          title: clip.title || "Uploaded Clip",
          description: clip.description || "",
          downloadUrl: clip.clipUrl,
          thumbnailUrl: clip.customThumbnailUrl || clip.thumbUrl || undefined,
          duration: clip.duration,
          score: clip.score || 0,
          createdAt: clip.createdAt,
        });
      }
    }

    // Sort by score descending (highest score first)
    return allClips.sort((a, b) => b.score - a.score);
  }, [clips, processingClips]);

  const currentClip = fullscreenClipIndex !== null ? unifiedClips[fullscreenClipIndex] : null;

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
  }, [fullscreenClipIndex, unifiedClips.length]);

  const handleShare = useCallback(
    async (e: MouseEvent, clip: UnifiedClip) => {
      e.preventDefault();
      e.stopPropagation();

      const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/f/${slug}?tab=clips`;

      try {
        if (navigator.share) {
          await navigator.share({
            title: clip.title,
            text: clip.description || '',
            url: shareUrl
          });
        } else {
          await navigator.clipboard.writeText(shareUrl);
          setCopiedId(clip.id);
          setTimeout(() => setCopiedId(null), 2000);
        }
        if (clip.type === "generated") {
          onClipShare?.(clip.id as Id<"generated_clips">);
        }
      } catch {
        try {
          await navigator.clipboard.writeText(shareUrl);
          setCopiedId(clip.id);
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
    const clip = unifiedClips[index];
    onFullscreenOpen?.(clip.id, clip.title, clip.type);
    onClipPlay?.(clip.id, clip.title, clip.type);
  }, [unifiedClips, onFullscreenOpen, onClipPlay]);

  const closeFullscreen = useCallback(() => {
    setFullscreenClipIndex(null);
    if (videoRef.current) {
      videoRef.current.pause();
    }
    onFullscreenClose?.();
  }, [onFullscreenClose]);

  const goToNextClip = useCallback(() => {
    if (fullscreenClipIndex !== null && fullscreenClipIndex < unifiedClips.length - 1) {
      const nextIndex = fullscreenClipIndex + 1;
      setFullscreenClipIndex(nextIndex);
      const nextClip = unifiedClips[nextIndex];
      onNavigateNext?.(nextClip.id, nextClip.title);
      onClipPlay?.(nextClip.id, nextClip.title, nextClip.type);
    }
  }, [fullscreenClipIndex, unifiedClips, onNavigateNext, onClipPlay]);

  const goToPrevClip = useCallback(() => {
    if (fullscreenClipIndex !== null && fullscreenClipIndex > 0) {
      const prevIndex = fullscreenClipIndex - 1;
      setFullscreenClipIndex(prevIndex);
      const prevClip = unifiedClips[prevIndex];
      onNavigatePrev?.(prevClip.id, prevClip.title);
      onClipPlay?.(prevClip.id, prevClip.title, prevClip.type);
    }
  }, [fullscreenClipIndex, unifiedClips, onNavigatePrev, onClipPlay]);

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

    if (Math.abs(diffY) > 50 && diffX < 100) {
      if (diffY > 0) {
        goToNextClip();
      } else {
        goToPrevClip();
      }
    }
  }, [goToNextClip, goToPrevClip]);

  if (unifiedClips.length === 0) return null;

  return (
    <>
      {/* Fullscreen Player - Portal */}
      {fullscreenClipIndex !== null && currentClip && currentClip.downloadUrl && isMounted && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
          style={{ touchAction: 'none' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Video Player */}
          <div className="relative w-full h-full max-w-md mx-auto flex items-center justify-center">
            <video
              ref={videoRef}
              src={currentClip.downloadUrl}
              className="max-w-full max-h-full object-contain"
              autoPlay
              playsInline
              muted={isMuted}
              controls
              loop
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
              disabled={fullscreenClipIndex === unifiedClips.length - 1}
              className={`p-2 rounded-full bg-black/50 ${fullscreenClipIndex === unifiedClips.length - 1 ? 'opacity-30' : 'hover:bg-black/70'}`}
            >
              <ChevronDown className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Video Info - Bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 z-[50]">
            <div className="flex items-center gap-2 mb-1">
              <Image src="/flmlnk_icon.png" alt="Flmlnk" width={16} height={16} className="w-4 h-4" />
              <span className="text-xs text-red-400 font-medium">Flmlnk Reels</span>
            </div>
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
          </div>

          {/* Clip Counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] px-3 py-1 bg-black/50 rounded-full text-white text-sm">
            {fullscreenClipIndex + 1} / {unifiedClips.length}
          </div>
        </div>,
        document.body
      )}

      {/* Grid Gallery */}
      <section className="bg-black text-white py-8 md:py-16 px-4 md:px-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Image src="/flmlnk_icon.png" alt="Flmlnk" width={20} height={20} className="w-5 h-5" />
              <h2 className="text-2xl md:text-3xl font-bold text-white">Flmlnk Reels</h2>
            </div>
            <span className="text-sm text-gray-500">
              {unifiedClips.length} clip{unifiedClips.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {unifiedClips.map((clip, index) => {
              const isCopied = copiedId === clip.id;
              const thumbnailUrl = getUnifiedClipThumbnailUrl(clip);

              return (
                <div
                  key={clip.id}
                  className="group relative overflow-hidden rounded-lg cursor-pointer aspect-[9/16] bg-gray-900"
                  onClick={() => openFullscreen(index)}
                >
                  {/* Thumbnail */}
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt={clip.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                      <Play className="w-12 h-12 text-slate-600" />
                    </div>
                  )}

                  {/* Flmlnk Icon Overlay - shown for all clips (generated and uploaded) */}
                  <div className="absolute top-2 right-2">
                    <Image src="/flmlnk_icon.png" alt="Flmlnk" width={24} height={24} className="w-6 h-6 drop-shadow-lg" />
                  </div>

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
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/80 rounded text-xs text-white">
                    {formatDuration(clip.duration)}
                  </div>

                  {/* Match Score */}
                  <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="flex items-center gap-2 text-xs mb-1">
                      <span className="text-green-500 font-semibold">{clip.score}% Score</span>
                    </div>
                    <h3 className="text-white text-sm font-semibold line-clamp-1">{clip.title}</h3>
                  </div>

                  {/* Watch Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openFullscreen(index);
                    }}
                    className="absolute bottom-3 left-3 right-3 py-2 rounded-md font-semibold text-sm text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}cc)`
                    }}
                  >
                    Watch
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

export default GeneratedClipsGallery;
