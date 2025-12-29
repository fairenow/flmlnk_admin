"use client";

import type { FC, TouchEvent as ReactTouchEvent, WheelEvent } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Play, X, VolumeX, Volume2, Share2, ChevronUp, ChevronDown, DollarSign, Pause } from "lucide-react";
import { loadYouTubeAPI } from "@/utils/youtubeApi";
import { videoPlayerEvents } from "@/utils/videoPlayerEvents";
import type { Clip, YouTubeReelsPlayerProps, YTPlayer, YTPlayerEvent } from "./types";

// Constants
const PLAYER_CONTAINER_ID = "youtube-reels-player";
const TAP_THRESHOLD = 8; // px
const DEFAULT_STRIPE_URL = "https://buy.stripe.com/bJe4gz9Qf82zcp3aOSew803";
const CONTRIBUTION_AMOUNTS = [1, 5, 10, 25];

// Extract YouTube video ID from URL
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

// Thumbnail component with fallback
function YouTubeThumbnail({
  youtubeUrl,
  alt,
  className
}: {
  youtubeUrl: string;
  alt: string;
  className?: string;
}) {
  const videoId = extractYouTubeId(youtubeUrl);
  const thumbnailUrls = videoId ? [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/default.jpg`,
  ] : [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasError, setHasError] = useState(false);

  const handleError = useCallback(() => {
    if (currentIndex < thumbnailUrls.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setHasError(true);
    }
  }, [currentIndex, thumbnailUrls.length]);

  if (hasError || thumbnailUrls.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 ${className || ""}`}>
        <svg className="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

export const YouTubeReelsPlayer: FC<YouTubeReelsPlayerProps> = ({
  clips,
  slug,
  featuredClipId,
  primaryColor = "#FF1744",
  onClipShare,
  onClipView,
  onClipPlay,
  onFullscreenOpen,
  onFullscreenClose,
  onNavigateNext,
  onNavigatePrev,
  onContributionClick,
  onVideoPlay,
  onVideoPause,
  onMuteToggle,
}) => {
  // Filter out the featured clip if shown separately
  const galleryClips = featuredClipId
    ? clips.filter((c) => c._id !== featuredClipId)
    : clips;

  // State Management
  const [currentClipIndex, setCurrentClipIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [showContributionOptions, setShowContributionOptions] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [isMobileView, setIsMobileView] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [copiedClipId, setCopiedClipId] = useState<Id<"clips"> | null>(null);
  const [isYouTubeReady, setIsYouTubeReady] = useState(false);

  // Refs for Performance
  const playerRef = useRef<YTPlayer | null>(null);
  const isPlayerReadyRef = useRef(false);
  const pendingVideoIdRef = useRef<string | null>(null);
  const touchStartY = useRef<number>(0);
  const touchEndY = useRef<number>(0);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const wheelDeltaRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const scrollYRef = useRef(0);
  const hasProcessedInitialClipRef = useRef(false);
  const touchHandledRef = useRef(false);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  // Get current clip
  const currentClip = currentClipIndex !== null ? galleryClips[currentClipIndex] : null;

  // Calculate swipe threshold based on viewport height
  const swipeThreshold = viewportHeight
    ? Math.min(viewportHeight * 0.08, 72)
    : 64;

  // Get clip identifier for URL (deepLinkId or _id)
  const getClipIdentifier = useCallback((clip: Clip): string => {
    return clip.deepLinkId ?? clip._id;
  }, []);

  // Create YouTube player
  const createPlayer = useCallback((videoId: string) => {
    if (!window.YT || !window.YT.Player) {
      console.error("YouTube API not loaded");
      return;
    }

    const container = document.getElementById(PLAYER_CONTAINER_ID);
    if (!container) {
      console.error("Player container not found");
      return;
    }

    // Destroy existing player if any
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch {
        // Ignore
      }
      playerRef.current = null;
      isPlayerReadyRef.current = false;
    }

    const playerConfig = {
      height: "100%",
      width: "100%",
      videoId,
      playerVars: {
        autoplay: 1,
        controls: 0,
        loop: 1,
        playlist: videoId,
        playsinline: 1,
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
        mute: 1,
        fs: 0,
        iv_load_policy: 3,
        disablekb: 1,
        origin: typeof window !== "undefined" ? window.location.origin : "",
      },
      events: {
        onReady: (event: YTPlayerEvent) => {
          isPlayerReadyRef.current = true;

          // IMPORTANT: Must mute BEFORE playing for autoplay to work on modern browsers
          // Browsers require videos to be muted for autoplay policy compliance
          if (isMuted) {
            event.target.mute();
          }

          // Now attempt to play after ensuring mute state
          event.target.playVideo();

          // Handle unmute case after play starts
          if (!isMuted) {
            event.target.unMute();
          }

          // Load pending video if queued
          if (pendingVideoIdRef.current) {
            event.target.loadVideoById(pendingVideoIdRef.current);
            pendingVideoIdRef.current = null;
          }
        },
        onStateChange: (event: YTPlayerEvent) => {
          switch (event.data) {
            case window.YT.PlayerState.PLAYING:
              setIsVideoPaused(false);
              videoPlayerEvents.emit("video-play");
              break;
            case window.YT.PlayerState.PAUSED:
              setIsVideoPaused(true);
              videoPlayerEvents.emit("video-pause");
              break;
            case window.YT.PlayerState.UNSTARTED:
            case window.YT.PlayerState.BUFFERING:
            case window.YT.PlayerState.CUED:
              // Force playback if YouTube pauses unexpectedly after a few seconds
              setIsVideoPaused(false);
              event.target.playVideo();
              break;
            case window.YT.PlayerState.ENDED:
              videoPlayerEvents.emit("video-end");
              // Auto-advance to next video
              setCurrentClipIndex((prev) =>
                prev !== null ? (prev + 1) % galleryClips.length : 0
              );
              break;
          }
        },
        onError: () => {
          console.error("YouTube player error");
        },
      },
    };

    playerRef.current = new window.YT.Player(PLAYER_CONTAINER_ID, playerConfig);
  }, [isMuted, galleryClips.length]);

  // Load video into existing player or create new one
  const loadVideo = useCallback((index: number) => {
    if (index < 0 || index >= galleryClips.length) return;

    const videoId = extractYouTubeId(galleryClips[index].youtubeUrl);
    if (!videoId) return;

    if (playerRef.current && isPlayerReadyRef.current) {
      playerRef.current.loadVideoById(videoId);
      playerRef.current.playVideo();
    } else if (!playerRef.current) {
      createPlayer(videoId);
    } else {
      // Player exists but not ready - queue the video
      pendingVideoIdRef.current = videoId;
    }
  }, [galleryClips, createPlayer]);

  // Handle clip click from grid
  const handleClipClick = useCallback((index: number) => {
    setCurrentClipIndex(index);
    setIsPlaying(true);
    setShowContributionOptions(false);

    // Update URL with clip parameter
    const clip = galleryClips[index];
    const clipId = getClipIdentifier(clip);
    const newParams = new URLSearchParams(window.location.search);
    newParams.set("clip", clipId);
    const newUrl = `/f/${slug}?${newParams.toString()}`;
    window.history.pushState(null, "", newUrl);

    // Track clip events
    onFullscreenOpen?.(clip._id, clip.title);
    onClipPlay?.(clip._id, clip.title);

    // Emit event
    videoPlayerEvents.emit("tiktok-player-opened");

    // Load YouTube API if not ready
    if (!isYouTubeReady) {
      loadYouTubeAPI(() => {
        setIsYouTubeReady(true);
      });
    }
  }, [galleryClips, slug, getClipIdentifier, isYouTubeReady, onFullscreenOpen, onClipPlay]);

  // Close player
  const closePlayer = useCallback(() => {
    setIsPlaying(false);
    setCurrentClipIndex(null);
    setShowContributionOptions(false);

    // Remove clip parameter from URL
    const newParams = new URLSearchParams(window.location.search);
    newParams.delete("clip");
    const newUrl = newParams.toString()
      ? `/f/${slug}?${newParams.toString()}`
      : `/f/${slug}`;
    window.history.replaceState(null, "", newUrl);

    // Track fullscreen close
    onFullscreenClose?.();

    // Destroy player
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch {
        // Ignore
      }
      playerRef.current = null;
      isPlayerReadyRef.current = false;
    }

    // Emit event
    videoPlayerEvents.emit("tiktok-player-closed");
  }, [slug, onFullscreenClose]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (!playerRef.current) return;

    if (isVideoPaused) {
      playerRef.current.playVideo();
      onVideoPlay?.();
    } else {
      playerRef.current.pauseVideo();
      onVideoPause?.();
    }
  }, [isVideoPaused, onVideoPlay, onVideoPause]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (playerRef.current) {
      if (isMuted) {
        playerRef.current.unMute();
      } else {
        playerRef.current.mute();
      }
    }
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    onMuteToggle?.(newMutedState);
  }, [isMuted, onMuteToggle]);

  // Navigate to next/previous video
  const navigateToVideo = useCallback((direction: "next" | "previous") => {
    if (isTransitioningRef.current || currentClipIndex === null) return;

    const targetIndex = direction === "next"
      ? (currentClipIndex + 1) % galleryClips.length
      : (currentClipIndex - 1 + galleryClips.length) % galleryClips.length;

    isTransitioningRef.current = true;

    // Update state
    setCurrentClipIndex(targetIndex);

    // Update URL with new clip
    const clip = galleryClips[targetIndex];
    const clipId = getClipIdentifier(clip);
    const newParams = new URLSearchParams(window.location.search);
    newParams.set("clip", clipId);
    const newUrl = `/f/${slug}?${newParams.toString()}`;
    window.history.replaceState(null, "", newUrl);

    // Track navigation and play events
    if (direction === "next") {
      onNavigateNext?.(clip._id, clip.title);
    } else {
      onNavigatePrev?.(clip._id, clip.title);
    }
    onClipPlay?.(clip._id, clip.title);

    // Load new video
    const videoId = extractYouTubeId(clip.youtubeUrl);
    if (videoId && playerRef.current && isPlayerReadyRef.current) {
      playerRef.current.loadVideoById(videoId);
    }

    // Reset transition lock after a short delay
    setTimeout(() => {
      isTransitioningRef.current = false;
    }, 300);
  }, [currentClipIndex, galleryClips, slug, getClipIdentifier, onNavigateNext, onNavigatePrev, onClipPlay]);

  // Initialize viewport and mount
  useEffect(() => {
    loadYouTubeAPI(() => setIsYouTubeReady(true));

    setIsMounted(true);

    const updateViewport = () => {
      setViewportHeight(window.innerHeight);
      setIsMobileView(window.innerWidth < 768);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);

    return () => {
      setIsMounted(false);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  // Effect to load video after portal renders and YouTube API is ready
  useEffect(() => {
    if (!isPlaying || currentClipIndex === null || !isYouTubeReady) return;

    // Wait for next tick to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      loadVideo(currentClipIndex);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [isPlaying, currentClipIndex, isYouTubeReady, loadVideo]);

  // URL query parameter handling - Auto-open shared clip (runs once on mount)
  useEffect(() => {
    // Only process URL param once and only if player isn't already open
    if (hasProcessedInitialClipRef.current || isPlaying) return;
    if (galleryClips.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const clipParam = params.get("clip");
    if (clipParam) {
      const clipIndex = galleryClips.findIndex(
        (c) => c.deepLinkId === clipParam || c._id === clipParam
      );
      if (clipIndex !== -1) {
        hasProcessedInitialClipRef.current = true;
        // Use setTimeout to avoid state updates during render
        setTimeout(() => {
          handleClipClick(clipIndex);
        }, 0);
      }
    }
  }, [galleryClips, isPlaying, handleClipClick]);

  // Lock body scroll when playing
  useEffect(() => {
    if (isPlaying) {
      scrollYRef.current = window.scrollY;

      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollYRef.current}px`;
      document.body.style.width = "100%";
      document.body.style.height = "100vh";

      document.documentElement.style.overflow = "hidden";
      document.documentElement.style.position = "fixed";

      return () => {
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        document.body.style.height = "";

        document.documentElement.style.overflow = "";
        document.documentElement.style.position = "";

        window.scrollTo(0, scrollYRef.current);
      };
    }
  }, [isPlaying]);

  // Keyboard navigation
  useEffect(() => {
    if (!isPlaying) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateToVideo("previous");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        navigateToVideo("next");
      } else if (e.key === "Escape") {
        closePlayer();
      } else if (e.key === " ") {
        e.preventDefault();
        togglePlayPause();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, navigateToVideo, closePlayer, togglePlayPause]);

  // Touch handlers
  const handleTouchStart = useCallback((e: ReactTouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: ReactTouchEvent) => {
    touchEndY.current = e.touches[0].clientY;
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const distanceY = touchEndY.current - touchStartY.current;
    const distanceX = Math.abs(touchEndX.current - touchStartX.current);

    // Check if it's a tap
    if (Math.abs(distanceY) < TAP_THRESHOLD && distanceX < TAP_THRESHOLD) {
      togglePlayPause();
      return;
    }

    // Check for swipe
    if (Math.abs(distanceY) > swipeThreshold) {
      navigateToVideo(distanceY < 0 ? "next" : "previous");
    }
  }, [swipeThreshold, togglePlayPause, navigateToVideo]);

  // Wheel handler for desktop
  const handleWheel = useCallback((e: WheelEvent) => {
    if (isTransitioningRef.current) return;

    wheelDeltaRef.current += e.deltaY;

    if (Math.abs(wheelDeltaRef.current) > 100) {
      navigateToVideo(wheelDeltaRef.current > 0 ? "next" : "previous");
      wheelDeltaRef.current = 0;
    }
  }, [navigateToVideo]);

  // Share handler
  const handleShare = useCallback(async (clip: Clip) => {
    const clipId = getClipIdentifier(clip);
    const shareUrl = `${window.location.origin}/f/${slug}?clip=${clipId}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: clip.title,
          text: clip.description || "",
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setCopiedClipId(clip._id);
        setTimeout(() => setCopiedClipId(null), 2000);
      }
      onClipShare?.(clip._id);
    } catch {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopiedClipId(clip._id);
        setTimeout(() => setCopiedClipId(null), 2000);
      } catch {
        // Ignore
      }
    }
  }, [slug, getClipIdentifier, onClipShare]);

  // Contribution handler
  const handleContribution = useCallback(() => {
    const stripeUrl = currentClip?.stripePaymentUrl || DEFAULT_STRIPE_URL;
    if (currentClip) {
      onContributionClick?.(currentClip._id);
    }
    window.open(stripeUrl, "_blank", "noopener,noreferrer");
  }, [currentClip, onContributionClick]);

  if (galleryClips.length === 0) return null;

  return (
    <>
      {/* Fullscreen Player Overlay */}
      {isPlaying && currentClip && isMounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black">
          {/* Close Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (touchHandledRef.current) {
                touchHandledRef.current = false;
                return;
              }
              closePlayer();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              e.preventDefault();
              touchHandledRef.current = true;
              closePlayer();
            }}
            className="absolute top-4 right-4 z-[100] p-3 bg-black/70 rounded-full hover:bg-black/90 transition-colors"
            aria-label="Close player"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {/* Mute Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (touchHandledRef.current) {
                touchHandledRef.current = false;
                return;
              }
              toggleMute();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              e.preventDefault();
              touchHandledRef.current = true;
              toggleMute();
            }}
            className="absolute top-4 left-4 z-[100] p-3 bg-black/70 rounded-full hover:bg-black/90 transition-colors"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5 text-white" />
            ) : (
              <Volume2 className="w-5 h-5 text-white" />
            )}
          </button>

          {/* Video Counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] px-3 py-1 bg-black/50 rounded-full text-white text-sm">
            {currentClipIndex !== null ? currentClipIndex + 1 : 0} / {galleryClips.length}
          </div>

          {/* YouTube Player Container */}
          <div
            ref={playerContainerRef}
            id={PLAYER_CONTAINER_ID}
            className="absolute inset-0 z-[20]"
            style={{
              pointerEvents: "none",
            }}
          />

          {/* Pause Indicator */}
          {isVideoPaused && (
            <div className="absolute inset-0 z-[15] flex items-center justify-center pointer-events-none">
              <div className="w-20 h-20 rounded-full bg-black/50 flex items-center justify-center">
                <Pause className="w-10 h-10 text-white" fill="currentColor" />
              </div>
            </div>
          )}

          {/* Touch/Click Layer */}
          <div
            className="absolute inset-0 z-[60]"
            style={{ touchAction: "pan-y" }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={!isMobileView ? togglePlayPause : undefined}
            onWheel={handleWheel}
          />

          {/* Desktop Navigation Arrows */}
          {!isMobileView && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-[70]">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigateToVideo("previous");
                }}
                className="p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                aria-label="Previous video"
              >
                <ChevronUp className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigateToVideo("next");
                }}
                className="p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                aria-label="Next video"
              >
                <ChevronDown className="w-6 h-6 text-white" />
              </button>
            </div>
          )}

          {/* Video Info - Bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 z-[50] pointer-events-none"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}
          >
            <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 md:p-6">
              {currentClip.duration && (
                <div className="flex items-center gap-2 text-sm mb-2">
                  <span className="text-gray-400 border border-gray-500 px-1 text-xs">{currentClip.duration}</span>
                </div>
              )}
              <h3 className="text-white text-lg md:text-xl font-bold mb-1">{currentClip.title}</h3>
              {currentClip.description && (
                <p className="text-gray-300 text-sm line-clamp-2">{currentClip.description}</p>
              )}
            </div>
          </div>

          {/* Contribution Buttons - Right Side */}
          <div
            className="absolute right-4 bottom-32 flex flex-col gap-4 z-[80]"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
          >
            {/* Share Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (touchHandledRef.current) {
                  touchHandledRef.current = false;
                  return;
                }
                handleShare(currentClip);
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                e.preventDefault();
                touchHandledRef.current = true;
                handleShare(currentClip);
              }}
              className="p-3 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
              aria-label="Share video"
            >
              {copiedClipId === currentClip._id ? (
                <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <Share2 className="w-6 h-6 text-white" />
              )}
            </button>

            {/* Contribution Button */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (touchHandledRef.current) {
                    touchHandledRef.current = false;
                    return;
                  }
                  setShowContributionOptions(!showContributionOptions);
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  touchHandledRef.current = true;
                  setShowContributionOptions(!showContributionOptions);
                }}
                className="p-3 rounded-full hover:bg-black/70 transition-colors"
                style={{ backgroundColor: showContributionOptions ? primaryColor : "rgba(0,0,0,0.5)" }}
                aria-label="Support creator"
              >
                <DollarSign className="w-6 h-6 text-white" />
              </button>
              {showContributionOptions && (
                <div className="absolute bottom-full right-0 mb-2 flex flex-col gap-2">
                  {CONTRIBUTION_AMOUNTS.map((amount) => (
                    <button
                      key={amount}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (touchHandledRef.current) {
                          touchHandledRef.current = false;
                          return;
                        }
                        handleContribution();
                      }}
                      onTouchEnd={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        touchHandledRef.current = true;
                        handleContribution();
                      }}
                      className="px-4 py-2 bg-white text-black rounded-full text-sm font-semibold hover:bg-gray-200 transition-colors whitespace-nowrap"
                    >
                      ${amount}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Grid Gallery */}
      <section className="bg-black text-white py-8 md:py-16 px-4 md:px-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-white">
              <span className="sr-only">Video </span>Clips & Reels
            </h2>
            <span className="text-sm text-gray-500">
              {galleryClips.length} video{galleryClips.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {galleryClips.map((clip, index) => (
              <div
                key={clip._id}
                className="group relative overflow-hidden rounded-lg cursor-pointer aspect-[9/16] bg-gray-900"
                onClick={() => handleClipClick(index)}
              >
                {/* Thumbnail */}
                <YouTubeThumbnail
                  youtubeUrl={clip.youtubeUrl}
                  alt={clip.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
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

                {/* Info Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <h3 className="text-white text-sm font-semibold line-clamp-1">{clip.title}</h3>
                </div>

                {/* Watch & Support Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClipClick(index);
                  }}
                  className="absolute bottom-3 left-3 right-3 py-2 rounded-md font-semibold text-sm text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}cc)`,
                  }}
                >
                  Watch & Support
                </button>

                {/* Share Button on Thumbnail */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShare(clip);
                  }}
                  className={`absolute top-2 left-2 p-2 rounded-full transition-all duration-200 opacity-0 group-hover:opacity-100 ${
                    copiedClipId === clip._id ? "bg-green-500" : "bg-black/50 hover:bg-black/70"
                  }`}
                  aria-label={`Share ${clip.title}`}
                >
                  {copiedClipId === clip._id ? (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <Share2 className="w-4 h-4 text-white" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};

export default YouTubeReelsPlayer;
