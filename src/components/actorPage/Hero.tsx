"use client";

import type { FC } from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Play, Pause, Volume2, VolumeX, Share2, Link } from "lucide-react";
import { SocialBar } from "./SocialBar";
import {
  getVideoInfo,
  loadYouTubeAPI,
  loadVimeoAPI,
  extractVimeoHash,
  type VideoProvider,
} from "@/utils/videoApi";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
    Vimeo: any;
  }
}

type Socials = {
  instagram?: string;
  facebook?: string;
  youtube?: string;
  tiktok?: string;
  imdb?: string;
  website?: string;
};

type Theme = {
  primaryColor?: string;
  accentColor?: string;
  layoutVariant?: string;
};

type FeaturedProject = {
  title: string;
  logline?: string;
  description?: string;
  releaseYear?: number;
  status?: string;
  matchScore?: number;
  ratingCategory?: string;
  formatTags?: string[];
  primaryWatchLabel?: string;
  primaryWatchUrl?: string;
};

type HeroProps = {
  displayName: string;
  headline?: string;
  location?: string;
  avatarUrl?: string;
  socials: Socials;
  theme: Theme;
  watchCtaLabel?: string;
  watchCtaUrl?: string;
  featuredClipUrl?: string;
  featuredProject?: FeaturedProject | null;
  onConnectClick?: () => void;
  isAuthenticated?: boolean;
  onShowEmailModal?: (show: boolean) => void;
  actorProfileId?: string;
};

// Wrapper interface for unified player controls
interface UnifiedPlayer {
  provider: VideoProvider;
  play: () => void;
  pause: () => void;
  mute: () => void;
  unmute: () => void;
  getCurrentTime: () => number;
  destroy: () => void;
  // Store the underlying player reference
  _player: any;
}

export const Hero: FC<HeroProps> = ({
  displayName,
  headline,
  location,
  avatarUrl: _avatarUrl,
  socials,
  theme,
  watchCtaLabel,
  watchCtaUrl,
  featuredClipUrl,
  featuredProject,
  onConnectClick,
  isAuthenticated = false,
  onShowEmailModal,
  actorProfileId,
}) => {
  const primaryColor = theme.primaryColor ?? "#FF1744";
  const hasWatchCta = watchCtaUrl && watchCtaUrl !== "#";

  // Get video info (provider and ID)
  const videoInfo = featuredClipUrl ? getVideoInfo(featuredClipUrl) : { provider: null, id: null };
  const videoProvider = videoInfo.provider;
  const videoId = videoInfo.id;
  const vimeoHash = featuredClipUrl && videoProvider === 'vimeo' ? extractVimeoHash(featuredClipUrl) : null;

  // Player refs
  const mobileVideoRef = useRef<HTMLDivElement>(null);
  const desktopVideoRef = useRef<HTMLDivElement>(null);
  const fullscreenPlayerRef = useRef<HTMLDivElement>(null);

  // State
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [player, setPlayer] = useState<UnifiedPlayer | null>(null);
  const [fullscreenPlayer, setFullscreenPlayer] = useState<UnifiedPlayer | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [showContent, setShowContent] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isFullscreenVideo, setIsFullscreenVideo] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to create a unified player wrapper for YouTube
  const createYouTubeUnifiedPlayer = useCallback((ytPlayer: any): UnifiedPlayer => ({
    provider: 'youtube',
    play: () => ytPlayer.playVideo(),
    pause: () => ytPlayer.pauseVideo(),
    mute: () => ytPlayer.mute(),
    unmute: () => ytPlayer.unMute(),
    getCurrentTime: () => ytPlayer.getCurrentTime() || 0,
    destroy: () => ytPlayer.destroy(),
    _player: ytPlayer,
  }), []);

  // Helper to create a unified player wrapper for Vimeo
  const createVimeoUnifiedPlayer = useCallback((vimeoPlayer: any): UnifiedPlayer => ({
    provider: 'vimeo',
    play: () => vimeoPlayer.play(),
    pause: () => vimeoPlayer.pause(),
    mute: () => vimeoPlayer.setMuted(true),
    unmute: () => vimeoPlayer.setMuted(false),
    getCurrentTime: () => {
      // Vimeo getCurrentTime returns a promise, so we store last known time
      let currentTime = 0;
      vimeoPlayer.getCurrentTime().then((t: number) => { currentTime = t; });
      return currentTime;
    },
    destroy: () => vimeoPlayer.destroy(),
    _player: vimeoPlayer,
  }), []);

  // Track if component is mounted (for portal)
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // Detect orientation changes
  useEffect(() => {
    const checkOrientation = () => {
      const isMobile = window.innerWidth < 768;
      const isLandscapeMode = isMobile && window.innerHeight < window.innerWidth;
      setIsLandscape(isLandscapeMode);
    };

    checkOrientation();

    const handleOrientationChange = () => {
      setTimeout(checkOrientation, 100);
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, []);

  // Initialize video player (YouTube or Vimeo)
  useEffect(() => {
    if (!videoId || !videoProvider) return;

    const initializeYouTubePlayer = () => {
      const isMobileDevice = window.innerWidth < 768;
      const targetRef = isMobileDevice ? mobileVideoRef.current : desktopVideoRef.current;

      if (targetRef && window.YT && !player) {
        const _newPlayer = new window.YT.Player(targetRef, {
          videoId: videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            showinfo: 0,
            mute: 1,
            loop: 1,
            playlist: videoId,
            origin: typeof window !== 'undefined' ? window.location.origin : '',
          },
          events: {
            onReady: (event: any) => {
              event.target.playVideo();
              setPlayer(createYouTubeUnifiedPlayer(event.target));
              setIsPlaying(true);
            },
            onStateChange: (event: any) => {
              if (event.data === 1) {
                setIsPlaying(true);
                // Start fade timer for desktop only
                if (window.innerWidth >= 768) {
                  setShowContent(true);
                  if (!isHovering) {
                    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
                    fadeTimeoutRef.current = setTimeout(() => {
                      setShowContent(false);
                    }, 3000);
                  }
                }
              } else if (event.data === 2) {
                setIsPlaying(false);
                if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
                setShowContent(true);
              }
            }
          }
        });
      }
    };

    const initializeVimeoPlayer = () => {
      const isMobileDevice = window.innerWidth < 768;
      const targetRef = isMobileDevice ? mobileVideoRef.current : desktopVideoRef.current;

      if (targetRef && window.Vimeo && !player) {
        // Build Vimeo player options
        const vimeoOptions: Record<string, any> = {
          id: videoId,
          autoplay: true,
          muted: true,
          loop: true,
          controls: false,
          background: true,
          transparent: false,
          responsive: false,
          dnt: true,
          width: window.innerWidth,
          height: window.innerHeight,
        };

        // Add hash for private/unlisted videos
        if (vimeoHash) {
          vimeoOptions.h = vimeoHash;
        }

        const vimeoPlayer = new window.Vimeo.Player(targetRef, vimeoOptions);

        vimeoPlayer.on('loaded', () => {
          vimeoPlayer.play();
          setPlayer(createVimeoUnifiedPlayer(vimeoPlayer));
          setIsPlaying(true);
        });

        vimeoPlayer.on('play', () => {
          setIsPlaying(true);
          // Start fade timer for desktop only
          if (window.innerWidth >= 768) {
            setShowContent(true);
            if (!isHovering) {
              if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
              fadeTimeoutRef.current = setTimeout(() => {
                setShowContent(false);
              }, 3000);
            }
          }
        });

        vimeoPlayer.on('pause', () => {
          setIsPlaying(false);
          if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
          setShowContent(true);
        });
      }
    };

    if (!player) {
      if (videoProvider === 'youtube') {
        loadYouTubeAPI(initializeYouTubePlayer);
      } else if (videoProvider === 'vimeo') {
        loadVimeoAPI(initializeVimeoPlayer);
      }
    }

    return () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, [videoId, videoProvider, vimeoHash, player, isHovering, createYouTubeUnifiedPlayer, createVimeoUnifiedPlayer]);

  // Clean up player on unmount
  useEffect(() => {
    return () => {
      if (player) {
        player.destroy();
        setPlayer(null);
      }
    };
  }, [player]);

  // Ensure autoplay works reliably on mobile (especially after opening the hero)
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (!isMobile || !player || isPlaying) return;

    const attemptPlay = async () => {
      try {
        const result = player.play?.();
        if (result && typeof result.then === 'function') {
          await result;
        }
      } catch (error) {
        console.warn('Mobile autoplay failed', error);
      }
    };

    attemptPlay();
  }, [player, isPlaying]);

  // Handle hover behavior for desktop
  useEffect(() => {
    if (window.innerWidth >= 768) {
      if (isHovering) {
        if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
        setShowContent(true);
      } else if (isPlaying) {
        if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = setTimeout(() => {
          setShowContent(false);
        }, 3000);
      }
    }
  }, [isHovering, isPlaying]);

  // Auto-show email modal after 10 seconds for non-authenticated users
  useEffect(() => {
    if (!isAuthenticated && onShowEmailModal) {
      const timer = setTimeout(() => {
        onShowEmailModal(true);
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, onShowEmailModal]);

  // Lock scroll when in fullscreen video mode
  useEffect(() => {
    if (isFullscreenVideo) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';

      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isFullscreenVideo]);

  // Create and manage fullscreen player
  useEffect(() => {
    if (isFullscreenVideo && fullscreenPlayerRef.current && !fullscreenPlayer && videoId && videoProvider) {
      const currentTime = player?.getCurrentTime() || 0;

      if (videoProvider === 'youtube' && window.YT) {
        const _newPlayer = new window.YT.Player(fullscreenPlayerRef.current, {
          videoId: videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            showinfo: 0,
            mute: isMuted ? 1 : 0,
            loop: 1,
            playlist: videoId,
            start: Math.floor(currentTime),
            origin: typeof window !== 'undefined' ? window.location.origin : '',
          },
          events: {
            onReady: (event: any) => {
              event.target.playVideo();
              setFullscreenPlayer(createYouTubeUnifiedPlayer(event.target));
            }
          }
        });
      } else if (videoProvider === 'vimeo' && window.Vimeo) {
        const vimeoOptions: Record<string, any> = {
          id: videoId,
          autoplay: true,
          muted: isMuted,
          loop: true,
          controls: false,
          background: true,
          transparent: false,
          responsive: false,
          dnt: true,
          width: window.innerWidth,
          height: window.innerHeight,
        };

        if (vimeoHash) {
          vimeoOptions.h = vimeoHash;
        }

        const vimeoPlayer = new window.Vimeo.Player(fullscreenPlayerRef.current, vimeoOptions);

        vimeoPlayer.on('loaded', () => {
          // Seek to current time
          vimeoPlayer.setCurrentTime(currentTime).then(() => {
            vimeoPlayer.play();
          });
          setFullscreenPlayer(createVimeoUnifiedPlayer(vimeoPlayer));
        });
      }
    } else if (!isFullscreenVideo && fullscreenPlayer) {
      fullscreenPlayer.destroy();
      setFullscreenPlayer(null);
    }
  }, [isFullscreenVideo, videoId, videoProvider, vimeoHash, isMuted, player, fullscreenPlayer, createYouTubeUnifiedPlayer, createVimeoUnifiedPlayer]);

  // Cleanup fullscreen player on unmount
  useEffect(() => {
    return () => {
      if (fullscreenPlayer) {
        fullscreenPlayer.destroy();
      }
    };
  }, [fullscreenPlayer]);

  const toggleMute = useCallback(() => {
    const activePlayer = isFullscreenVideo ? fullscreenPlayer : player;
    if (activePlayer) {
      if (isMuted) {
        activePlayer.unmute();
      } else {
        activePlayer.mute();
      }
      setIsMuted(!isMuted);
    }
  }, [isMuted, player, fullscreenPlayer, isFullscreenVideo]);

  const handlePlayPause = useCallback(() => {
    if (player) {
      if (isPlaying) {
        player.pause();
      } else {
        player.play();
        if (isMuted) {
          player.unmute();
          setIsMuted(false);
        }
      }
    }
  }, [player, isPlaying, isMuted]);

  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({
        title: featuredProject?.title || displayName,
        text: featuredProject?.logline || headline || '',
        url: window.location.href
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  }, [featuredProject, displayName, headline]);

  const hasVideo = Boolean(videoId);

  // Get metadata for display
  const matchScore = featuredProject?.matchScore ?? 98;
  const year = featuredProject?.releaseYear ?? new Date().getFullYear();
  const rating = featuredProject?.ratingCategory ?? "TV-MA";
  const formatTags = featuredProject?.formatTags ?? ["HD"];
  const projectTitle = featuredProject?.title;
  const projectDescription = featuredProject?.logline || featuredProject?.description;

  return (
    <>
      {/* Fullscreen Video Modal - Portal */}
      {isFullscreenVideo && isMounted && hasVideo && createPortal(
        <div className="fixed inset-0 w-screen h-screen z-[9999] bg-black">
          <div
            ref={fullscreenPlayerRef}
            id="player-fullscreen"
            className="absolute inset-0 w-full h-full"
          />

          {/* Close Button */}
          <button
            onClick={() => setIsFullscreenVideo(false)}
            className="absolute top-4 right-4 z-[100] text-white p-3 rounded-full bg-black/70 hover:bg-black/90 transition-colors"
            aria-label="Exit fullscreen"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Mute Button */}
          <button
            onClick={toggleMute}
            className="absolute top-4 left-4 z-[100] p-3 bg-black/70 rounded-full hover:bg-black/90 transition-colors"
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
          </button>

          <style dangerouslySetInnerHTML={{__html: `
            #player-fullscreen iframe {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 100vw !important;
              height: 100vh !important;
              max-width: 100vw !important;
              max-height: 100vh !important;
            }
          `}} />
        </div>,
        document.body
      )}

      {/* Mobile Video Container - Scrolls with page */}
      {hasVideo && (
        <div
          className={`md:hidden video-container relative z-10 bg-black ${
            isLandscape ? 'h-screen' : 'h-[45vh]'
          }`}
        >
          <div ref={mobileVideoRef} id="player-mobile" className="absolute inset-0 bg-gray-900" />

          {/* Fullscreen Button - Shows in landscape when playing */}
          {isLandscape && isPlaying && (
            <button
              onClick={() => setIsFullscreenVideo(true)}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[30] bg-black/80 backdrop-blur-sm text-white px-8 py-4 rounded-full font-semibold flex items-center gap-3 hover:bg-black/90 transition-all transform hover:scale-105 shadow-2xl border border-white/30"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              <span>Watch in Fullscreen</span>
            </button>
          )}

          {/* Click overlay for mobile */}
          <div
            onClick={handlePlayPause}
            className="absolute inset-0 z-[15] cursor-pointer"
            aria-label="Click to play/pause video"
          />
        </div>
      )}

      {/* Hero Section */}
      <section
        className={`relative bg-black ${hasVideo ? 'md:min-h-screen' : 'min-h-[60vh]'} ${isFullscreenVideo ? 'hidden' : ''} overflow-x-hidden md:overflow-hidden`}
        onMouseEnter={() => typeof window !== 'undefined' && window.innerWidth >= 768 && setIsHovering(true)}
        onMouseLeave={() => typeof window !== 'undefined' && window.innerWidth >= 768 && setIsHovering(false)}
      >
        {/* Desktop Video - Full screen */}
        {hasVideo && (
          <div className="hidden md:block absolute inset-0 video-container bg-black">
            <div ref={desktopVideoRef} id="player-desktop" className="absolute inset-0 bg-gray-900" />
            {/* Gradient overlays for desktop */}
            <div className={`absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent pointer-events-none transition-opacity duration-1000 ${
              showContent ? 'opacity-100' : 'opacity-0'
            }`} />
            <div className={`absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent pointer-events-none transition-opacity duration-1000 ${
              showContent ? 'opacity-100' : 'opacity-0'
            }`} />

            {/* Click overlay for desktop */}
            <div
              onClick={handlePlayPause}
              className="absolute inset-0 z-[5] cursor-pointer"
              aria-label="Click to play/pause video"
            />
          </div>
        )}

        {/* Static Background (no video) */}
        {!hasVideo && (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, ${primaryColor}15 0%, #000 60%, #000 100%)`,
            }}
          />
        )}

        {/* Sound Control */}
        {hasVideo && (
          <button
            onClick={toggleMute}
            className="fixed md:absolute top-4 right-4 md:top-6 md:right-6 z-30 p-2 md:p-3 bg-black/60 md:bg-black/50 rounded-full hover:bg-black/70 transition-all duration-300"
          >
            {isMuted ? <VolumeX className="w-4 h-4 md:w-5 md:h-5 text-white" /> : <Volume2 className="w-4 h-4 md:w-5 md:h-5 text-white" />}
          </button>
        )}

        {/* Hover zone */}
        {hasVideo && (
          <div
            className={`absolute bottom-0 left-0 right-0 h-1/3 z-20 ${
              isLandscape ? 'hidden' : ''
            }`}
            onMouseEnter={() => setShowControls(true)}
            onMouseLeave={() => setShowControls(false)}
          />
        )}

        {/* Content */}
        <div className={`relative md:absolute md:inset-0 flex flex-col justify-end p-6 md:p-12 lg:p-16 z-20 ${
          isLandscape ? 'hidden' : ''
        }`}>
          <div className={`max-w-2xl space-y-3 md:space-y-4 mb-8 md:mb-0 transition-opacity duration-1000 ${
            hasVideo && isPlaying && !isMuted && !showControls ? 'opacity-0 md:opacity-100' : 'opacity-100'
          } ${
            hasVideo ? (showContent ? 'md:opacity-100' : 'md:opacity-0') : ''
          }`}>
            {/* Title */}
            <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold text-white">
              {projectTitle || displayName}
            </h1>

            {/* Metadata - Netflix style */}
            {hasVideo && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                <span className="text-green-500 font-semibold">{matchScore}% Match</span>
                <span className="text-white">{year}</span>
                <span className="px-1.5 sm:px-2 py-0.5 border border-white/50 text-white text-[10px] sm:text-xs">{rating}</span>
                {formatTags.slice(0, 4).map((tag, index) => (
                  <span key={index} className="px-1.5 sm:px-2 py-0.5 bg-white/20 text-white text-[10px] sm:text-xs rounded">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Headline for non-video hero */}
            {!hasVideo && headline && (
              <p className="mt-2 text-lg text-slate-200">{headline}</p>
            )}

            {/* Description */}
            {projectDescription && (
              <p className="text-base sm:text-lg md:text-xl text-white/90 max-w-xl line-clamp-3 md:line-clamp-none">
                {projectDescription}
              </p>
            )}

            {/* Location */}
            {location && !hasVideo && (
              <p className="mt-1 flex items-center gap-1 text-sm text-slate-300">
                <span className="text-xs">📍</span>
                {location}
              </p>
            )}

            {/* Social Bar for non-video hero */}
            {!hasVideo && (
              <SocialBar
                socials={socials}
                iconSize="md"
                className="justify-start"
                actorProfileId={actorProfileId}
              />
            )}

            {/* Action Buttons */}
            <div className="relative">
              {/* Mobile Layout - Single CTA Button */}
              {hasVideo && (
                <div className={`flex sm:hidden -mx-6 transition-opacity duration-1000 ${
                  isPlaying && !isMuted && !showControls ? 'opacity-0' : 'opacity-100'
                }`}>
                  <button
                    onClick={() => hasWatchCta ? window.open(watchCtaUrl, '_blank') : onConnectClick?.()}
                    className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold transition-all shadow-lg shadow-red-900/30 hover:scale-[1.02] active:scale-95 text-base"
                  >
                    <Link className="w-5 h-5" />
                    <span>{hasWatchCta ? (watchCtaLabel || 'Watch Now') : 'Get Updates'}</span>
                  </button>
                </div>
              )}

              {/* Desktop Layout */}
              <div className={`${hasVideo ? 'hidden sm:flex' : 'flex'} flex-col sm:flex-row gap-2 sm:gap-3`}>
                {hasVideo && (
                  <button
                    onClick={handlePlayPause}
                    className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-white text-black font-semibold rounded hover:bg-gray-200 transition-all shadow-lg text-sm sm:text-base"
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" />
                    ) : (
                      <Play className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" />
                    )}
                    <span>{isPlaying ? 'Pause' : 'Play'}</span>
                  </button>
                )}

                {hasWatchCta && (
                  <a
                    href={watchCtaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 font-semibold rounded transition-all shadow-lg shadow-red-900/30 hover:scale-[1.02] active:scale-95 text-sm sm:text-base text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600"
                  >
                    <Link className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>{watchCtaLabel || 'Watch Now'}</span>
                  </a>
                )}

                {onConnectClick && (
                  <button
                    type="button"
                    onClick={onConnectClick}
                    className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded border border-white/20 bg-white/10 text-white font-medium backdrop-blur-sm transition hover:bg-white/20 text-sm sm:text-base"
                  >
                    Get Updates
                  </button>
                )}
              </div>
            </div>

            {/* Desktop Action Buttons - Share */}
            {hasVideo && (
              <div className="hidden md:flex gap-6 mt-4">
                <button
                  onClick={handleShare}
                  className="flex flex-col items-center gap-1 text-white/80 hover:text-white transition-colors"
                >
                  <div className="p-3 rounded-full border-2 border-white/20 hover:border-white/40 transition-colors">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <span className="text-xs">Share</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CSS for video player sizing - ensures video fills the hero section (YouTube and Vimeo) */}
      <style jsx global>{`
        .video-container {
          overflow: hidden;
        }

        #player-mobile,
        #player-desktop {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        /* YouTube iframe styling */
        #player-mobile > iframe,
        #player-desktop > iframe {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 300%;
          height: 300%;
          min-width: 100%;
          min-height: 100%;
          transform: translate(-50%, -50%);
          object-fit: cover;
        }

        /* Vimeo player wrapper styling - Vimeo SDK creates nested divs */
        #player-mobile > div,
        #player-desktop > div,
        #player-mobile > div > div,
        #player-desktop > div > div {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        /* Vimeo iframe inside wrapper */
        #player-mobile > div > iframe,
        #player-desktop > div > iframe,
        #player-mobile > div > div > iframe,
        #player-desktop > div > div > iframe {
          position: absolute !important;
          top: 50% !important;
          left: 50% !important;
          width: 177.78vh !important;
          height: 100vh !important;
          min-width: 100vw !important;
          min-height: 56.25vw !important;
          transform: translate(-50%, -50%) !important;
          object-fit: cover !important;
        }

        @media (min-width: 768px) {
          #player-desktop > iframe {
            width: 177.78vh;
            height: 100vh;
            min-width: 100vw;
            min-height: 56.25vw;
          }
        }

        @media (max-width: 767px) {
          #player-mobile > iframe {
            width: 177.78vh;
            height: 100vh;
            min-width: 100vw;
            min-height: 56.25vw;
          }
        }

        /* Fullscreen Vimeo styling */
        #player-fullscreen > div {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          padding: 0 !important;
        }

        #player-fullscreen > div > iframe {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
        }
      `}</style>
    </>
  );
};

export default Hero;
