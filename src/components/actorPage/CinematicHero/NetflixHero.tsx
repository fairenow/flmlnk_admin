"use client";

import React, { useEffect, useRef, useState, useCallback, type FC } from "react";
import { createPortal } from "react-dom";
import { useNetflix } from "./NetflixContext";
import { emojiAnimationService, type EmojiType } from "@/services/EmojiAnimationService";
import { videoPlayerEvents } from "@/utils/videoPlayerEvents";
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

// Wrapper interface for unified player controls
interface UnifiedPlayer {
  provider: VideoProvider;
  play: () => void;
  pause: () => void;
  mute: () => void;
  unmute: () => void;
  getCurrentTime: () => number;
  getDuration: () => Promise<number> | number;
  loadVideoById: (id: string) => void;
  destroy: () => void;
  _player: any;
}

const DEFAULT_MOVIE_URL = "https://tubitv.com/movies/100047430/dangerously-in-love";
const DEFAULT_CTA_LABEL = "Watch Now";

// Icon components
const PlayIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const VolumeXIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
  </svg>
);

const Volume2Icon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
  </svg>
);

const Share2Icon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
  </svg>
);

const NetflixHero: FC = () => {
  const {
    data,
    updateData,
    editMode,
    currentEpisodeIndex,
    setCurrentEpisodeIndex,
    watchProgress: _watchProgress,
    updateWatchProgress,
    setShowEmailModal,
    isAuthenticated,
    // Event tracking callbacks
    onWatchCtaClick,
    onGetUpdatesClick,
    onShareClick,
    onVideoPlay,
    onVideoPause,
    onMuteToggle,
    onFullscreenEnter,
  } = useNetflix();

  // Get video info (provider and ID) - videoId in context can be ID or full URL
  const videoInfo = getVideoInfo(data.hero.videoId);
  const videoProvider = videoInfo.provider;
  const videoId = videoInfo.id || data.hero.videoId; // Fallback to original if it's already a valid ID
  const vimeoHash = videoProvider === 'vimeo' ? extractVimeoHash(data.hero.videoId) : null;

  const mobileVideoRef = useRef<HTMLDivElement>(null);
  const desktopVideoRef = useRef<HTMLDivElement>(null);
  const fullscreenPlayerRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [player, setPlayer] = useState<UnifiedPlayer | null>(null);
  const [fullscreenPlayer, setFullscreenPlayer] = useState<UnifiedPlayer | null>(null);

  // Helper to create a unified player wrapper for YouTube
  const createYouTubeUnifiedPlayer = useCallback((ytPlayer: any): UnifiedPlayer => ({
    provider: 'youtube',
    play: () => ytPlayer.playVideo(),
    pause: () => ytPlayer.pauseVideo(),
    mute: () => ytPlayer.mute(),
    unmute: () => ytPlayer.unMute(),
    getCurrentTime: () => ytPlayer.getCurrentTime() || 0,
    getDuration: () => ytPlayer.getDuration() || 0,
    loadVideoById: (id: string) => ytPlayer.loadVideoById(id),
    destroy: () => ytPlayer.destroy(),
    _player: ytPlayer,
  }), []);

  // Helper to create a unified player wrapper for Vimeo
  const createVimeoUnifiedPlayer = useCallback((vimeoPlayer: any): UnifiedPlayer => {
    let cachedTime = 0;
    let cachedDuration = 0;

    // Keep time updated
    vimeoPlayer.on('timeupdate', (data: { seconds: number }) => {
      cachedTime = data.seconds;
    });
    vimeoPlayer.getDuration().then((d: number) => { cachedDuration = d; });

    return {
      provider: 'vimeo',
      play: () => vimeoPlayer.play(),
      pause: () => vimeoPlayer.pause(),
      mute: () => vimeoPlayer.setMuted(true),
      unmute: () => vimeoPlayer.setMuted(false),
      getCurrentTime: () => cachedTime,
      getDuration: () => Promise.resolve(cachedDuration),
      loadVideoById: (id: string) => vimeoPlayer.loadVideo(id),
      destroy: () => vimeoPlayer.destroy(),
      _player: vimeoPlayer,
    };
  }, []);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isAnimatingEmoji, setIsAnimatingEmoji] = useState(false);
  const [currentEmoji, setCurrentEmoji] = useState<EmojiType | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState(10);
  const [_currentTime, setCurrentTime] = useState(0);
  const [_duration, setDuration] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [showContent, setShowContent] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const [isFullscreenVideo, setIsFullscreenVideo] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get CTA label and URL from context with fallbacks
  const ctaLabel = data.hero.watchCtaLabel || DEFAULT_CTA_LABEL;
  const ctaUrl = data.hero.watchCtaUrl || DEFAULT_MOVIE_URL;

  const handleWatchFullMovie = () => {
    if (isAuthenticated) {
      // Track CTA click before opening URL
      onWatchCtaClick?.(ctaLabel, ctaUrl);
      window.open(ctaUrl, "_blank", "noopener,noreferrer");
    } else {
      // Track get updates click when showing email modal
      onGetUpdatesClick?.();
      setShowEmailModal(true);
    }
  };

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

    // Check initial orientation
    checkOrientation();

    // Listen for orientation changes
    const handleOrientationChange = () => {
      // Small delay to ensure dimensions are updated
      setTimeout(checkOrientation, 100);
    };

    window.addEventListener("orientationchange", handleOrientationChange);
    window.addEventListener("resize", handleOrientationChange);

    return () => {
      window.removeEventListener("orientationchange", handleOrientationChange);
      window.removeEventListener("resize", handleOrientationChange);
    };
  }, []);

  // Auto-enter/exit fullscreen based on landscape orientation on mobile
  useEffect(() => {
    if (isLandscape && !isFullscreenVideo) {
      // Entering landscape mode - auto-enter fullscreen
      onFullscreenEnter?.();
      setIsFullscreenVideo(true);
    } else if (!isLandscape && isFullscreenVideo) {
      // Exiting landscape mode - auto-exit fullscreen
      setIsFullscreenVideo(false);
    }
  }, [isLandscape, isFullscreenVideo, onFullscreenEnter]);

  // Initialize video player (YouTube or Vimeo)
  useEffect(() => {
    if (!videoId) return;

    const initializeYouTubePlayer = () => {
      const isMobileDevice = window.innerWidth < 768;
      const targetRef = isMobileDevice ? mobileVideoRef.current : desktopVideoRef.current;

      if (targetRef && window.YT && !player) {
        new window.YT.Player(targetRef, {
          videoId: videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            showinfo: 0,
            mute: 1,
            loop: 1,
            playlist: videoId,
            origin: typeof window !== 'undefined' ? window.location.origin : '',
          },
          events: {
            onReady: (event: any) => {
              const iframe: HTMLIFrameElement | null = event.target?.getIframe?.();
              if (iframe) {
                iframe.setAttribute("allow", "autoplay; encrypted-media");
                iframe.setAttribute("playsinline", "1");
                iframe.setAttribute("muted", "1");
              }

              event.target.mute?.();
              event.target.playVideo();
              setPlayer(createYouTubeUnifiedPlayer(event.target));
              setIsPlaying(true);
            },
            onStateChange: (event: any) => {
              if (event.data === 1) {
                setIsPlaying(true);
                // Start fade timer for desktop only
                if (window.innerWidth >= 768) {
                  setShowContent(true); // Show content when video starts
                  if (!isHovering) {
                    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
                    fadeTimeoutRef.current = setTimeout(() => {
                      setShowContent(false);
                    }, 3000);
                  }
                }
              } else if (event.data === 2) {
                setIsPlaying(false);
                // Clear fade timer and show content when paused
                if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
                setShowContent(true);
              } else if (event.data === 0) {
                handleVideoEnd();
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

        vimeoPlayer.on('ended', () => {
          handleVideoEnd();
        });
      }
    };

    // Only initialize if not already initialized
    if (!player) {
      if (videoProvider === 'youtube' || !videoProvider) {
        // Default to YouTube for backward compatibility
        loadYouTubeAPI(initializeYouTubePlayer);
      } else if (videoProvider === 'vimeo') {
        loadVimeoAPI(initializeVimeoPlayer);
      }
    }

    return () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, [videoId, videoProvider, vimeoHash, createYouTubeUnifiedPlayer, createVimeoUnifiedPlayer]); // Remove player dependency to prevent re-initialization

  // Clean up player on unmount
  useEffect(() => {
    return () => {
      if (player) {
        player.destroy();
        setPlayer(null);
      }
    };
  }, [player]);

  // Listen for TikTok player events
  useEffect(() => {
    const handleTikTokPlayerOpened = () => {
      if (player && isPlaying) {
        player.pause();
      }
    };

    const handleTikTokPlayerClosed = () => {
      if (player && !isPlaying) {
        player.play();
      }
    };

    videoPlayerEvents.on("tiktok-player-opened", handleTikTokPlayerOpened);
    videoPlayerEvents.on("tiktok-player-closed", handleTikTokPlayerClosed);

    return () => {
      videoPlayerEvents.off("tiktok-player-opened", handleTikTokPlayerOpened);
      videoPlayerEvents.off("tiktok-player-closed", handleTikTokPlayerClosed);
    };
  }, [player, isPlaying]);

  // Handle hover behavior for desktop
  useEffect(() => {
    if (window.innerWidth >= 768) {
      if (isHovering) {
        // Clear fade timeout and show content when hovering
        if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
        setShowContent(true);
      } else if (isPlaying) {
        // Start fade timer when not hovering and video is playing
        if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = setTimeout(() => {
          setShowContent(false);
        }, 3000);
      }
    }
  }, [isHovering, isPlaying]);

  // Ensure autoplay works reliably on mobile (especially after opening the hero)
  useEffect(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    if (!isMobile || !player || isPlaying) return;

    const attemptPlay = async () => {
      try {
        const result = player.play?.();
        if (result && typeof result.then === "function") {
          await result;
        }
      } catch (error) {
        console.warn("Mobile autoplay failed", error);
      }
    };

    attemptPlay();
  }, [player, isPlaying]);

  // Separate useEffect for email modal timer - only for non-authenticated users
  useEffect(() => {
    // Only show email modal if user is not authenticated
    if (!isAuthenticated) {
      const modalTimer = setTimeout(() => {
        setShowEmailModal(true);
      }, 10000);

      return () => {
        clearTimeout(modalTimer);
      };
    }
  }, [isAuthenticated, setShowEmailModal]);

  // Lock scroll when in fullscreen video mode
  useEffect(() => {
    if (isFullscreenVideo) {
      const scrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";

      return () => {
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.style.width = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [isFullscreenVideo]);

  // Create and manage fullscreen player
  useEffect(() => {
    if (isFullscreenVideo && fullscreenPlayerRef.current && !fullscreenPlayer && videoId) {
      // Pause the main player to prevent audio overlap
      if (player) {
        player.pause();
      }

      // Get current time from main player
      const currentTime = player?.getCurrentTime() || 0;

      if ((videoProvider === 'youtube' || !videoProvider) && window.YT) {
        // Create YouTube fullscreen player
        new window.YT.Player(fullscreenPlayerRef.current, {
          videoId: videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            showinfo: 0,
            mute: isMuted ? 1 : 0,
            loop: 1,
            playlist: videoId,
            start: Math.floor(currentTime),
            origin: typeof window !== 'undefined' ? window.location.origin : '',
          },
          events: {
            onReady: (event: any) => {
              const iframe: HTMLIFrameElement | null = event.target?.getIframe?.();
              if (iframe) {
                iframe.setAttribute("allow", "autoplay; encrypted-media");
                iframe.setAttribute("playsinline", "1");
                if (isMuted) {
                  iframe.setAttribute("muted", "1");
                } else {
                  iframe.removeAttribute("muted");
                }
              }

              if (isMuted) {
                event.target.mute?.();
              } else {
                event.target.unMute?.();
              }
              event.target.playVideo();
              setFullscreenPlayer(createYouTubeUnifiedPlayer(event.target));
            }
          }
        });
      } else if (videoProvider === 'vimeo' && window.Vimeo) {
        // Create Vimeo fullscreen player
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
          vimeoPlayer.setCurrentTime(currentTime).then(() => {
            vimeoPlayer.play();
          });
          setFullscreenPlayer(createVimeoUnifiedPlayer(vimeoPlayer));
        });
      }
    } else if (!isFullscreenVideo && fullscreenPlayer) {
      // Sync playback position from fullscreen player back to main player
      const fullscreenTime = fullscreenPlayer.getCurrentTime() || 0;

      // Cleanup fullscreen player
      fullscreenPlayer.destroy();
      setFullscreenPlayer(null);

      // Resume main player from where fullscreen left off
      if (player) {
        // For YouTube, seekTo is available on the underlying player
        if (player.provider === 'youtube' && player._player?.seekTo) {
          player._player.seekTo(fullscreenTime, true);
        } else if (player.provider === 'vimeo' && player._player?.setCurrentTime) {
          player._player.setCurrentTime(fullscreenTime);
        }
        player.play();
      }
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

  const toggleMute = () => {
    const activePlayer = isFullscreenVideo ? fullscreenPlayer : player;
    if (activePlayer) {
      if (isMuted) {
        activePlayer.unmute();
      } else {
        activePlayer.mute();
      }
      const newMutedState = !isMuted;
      setIsMuted(newMutedState);
      // Track mute toggle
      onMuteToggle?.(newMutedState);
    }
  };

  const handlePlayPause = () => {
    if (player) {
      if (isPlaying) {
        player.pause();
        // Track video pause
        onVideoPause?.();
      } else {
        player.play();
        // Track video play
        onVideoPlay?.();
        if (isMuted) {
          player.unmute();
          setIsMuted(false);
          onMuteToggle?.(false);
        }
      }
    }
  };

  const handleEdit = (field: string, value: string) => {
    if (editMode) {
      updateData({
        hero: {
          ...data.hero,
          [field]: value
        }
      });
    }
  };

  const handleEmojiSelect = (emoji: EmojiType) => {
    const animationTriggered = emojiAnimationService.triggerAnimation(emoji);

    if (animationTriggered) {
      // Animation triggered immediately
      setCurrentEmoji(emoji);
      setShowEmojiPicker(false);
      setIsAnimatingEmoji(true);
    }
  };

  // Listen for animation events
  useEffect(() => {
    const handleAnimationEnd = () => {
      setIsAnimatingEmoji(false);
      setCurrentEmoji(null);
    };

    // Set up both event listener and callback for redundancy
    emojiAnimationService.on("animationEnd", handleAnimationEnd);
    emojiAnimationService.setOnAnimationEnd(handleAnimationEnd);

    return () => {
      emojiAnimationService.off("animationEnd", handleAnimationEnd);
    };
  }, []);

  const handleShare = () => {
    // Track share click
    onShareClick?.();
    if (navigator.share) {
      navigator.share({
        title: data.hero.title,
        text: data.hero.description,
        url: window.location.href
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Link copied to clipboard!");
    }
  };

  const emojis: EmojiType[] = ["🌹", "🕷️", "💔", "🚫", "❤️", "🔥"];

  // Track video progress
  useEffect(() => {
    if (player && isPlaying) {
      const interval = setInterval(async () => {
        const time = player.getCurrentTime();
        const dur = await Promise.resolve(player.getDuration());
        setCurrentTime(time);
        setDuration(dur);

        const currentEpisode = data.episodes[currentEpisodeIndex];
        if (currentEpisode && dur > 0) {
          const progress = (time / dur) * 100;
          updateWatchProgress(currentEpisode.id, progress);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [player, isPlaying, currentEpisodeIndex, data.episodes, updateWatchProgress]);

  const handleVideoEnd = () => {
    if (currentEpisodeIndex < data.episodes.length - 1) {
      setShowNextEpisode(true);
      setNextEpisodeCountdown(10);
    }
  };

  useEffect(() => {
    if (showNextEpisode && nextEpisodeCountdown > 0) {
      const timer = setTimeout(() => {
        setNextEpisodeCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (showNextEpisode && nextEpisodeCountdown === 0) {
      playNextEpisode();
    }
  }, [showNextEpisode, nextEpisodeCountdown]);

  const playNextEpisode = () => {
    if (currentEpisodeIndex < data.episodes.length - 1) {
      const nextIndex = currentEpisodeIndex + 1;
      setCurrentEpisodeIndex(nextIndex);
      setShowNextEpisode(false);
      setNextEpisodeCountdown(10);

      if (player) {
        player.loadVideoById(data.episodes[nextIndex].id);
        player.play();
      }
    }
  };


  return (
    <>
      {/* Fullscreen Video Modal - Portal */}
      {isFullscreenVideo && isMounted && createPortal(
        <div className="fixed inset-0 w-screen h-screen z-[9999] bg-black">
          {/* Fullscreen Video Player */}
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
            {isMuted ? <VolumeXIcon className="w-5 h-5 text-white" /> : <Volume2Icon className="w-5 h-5 text-white" />}
          </button>

          {/* Inject styles to force iframe to fill screen */}
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

      {/* Mobile Video Container - Normal view */}
      <div
        className={`md:hidden video-container relative z-10 bg-black ${
          isLandscape ? "h-screen" : "h-[45vh]"
        }`}
      >
        {/* Video Player */}
        <div ref={mobileVideoRef} id="player-mobile" className="absolute inset-0 bg-gray-900" />

        {/* Click overlay for mobile */}
        <div
          onClick={handlePlayPause}
          className="absolute inset-0 z-[15] cursor-pointer"
          aria-label="Click to play/pause video"
        />
      </div>

      {/* Mobile Content Section - Shows below video on mobile */}
      <div className={`md:hidden relative z-10 bg-black p-6 ${isLandscape ? "hidden" : ""}`}>
        {/* Profile Welcome Banner - Mobile */}
        <div className={`mb-4 transition-opacity duration-700 ${
          isPlaying && !isMuted && !showControls ? "opacity-0" : "opacity-100"
        }`}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-carpet-red-800 via-carpet-red-600 to-red-500 rounded-full blur opacity-60"></div>
              <img
                src={data.profile.actor.profileImage}
                alt={data.profile.actor.name}
                className="relative w-12 h-12 rounded-full object-cover border-4 border-black"
              />
            </div>
          </div>
        </div>

        <div className={`space-y-3 transition-opacity duration-1000 ${
          isPlaying && !isMuted && !showControls ? "opacity-0" : "opacity-100"
        }`}>
          {/* Title */}
          <h1 className="text-3xl sm:text-4xl font-bold text-white">
            {data.hero.title}
          </h1>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            <span className="text-green-500 font-semibold">98% Match</span>
            <span className="text-white">{data.hero.year}</span>
            <span className="px-1.5 py-0.5 border border-white/50 text-white text-[10px] sm:text-xs">{data.hero.rating}</span>
            <span className="text-white">{data.hero.episodeCount}</span>
            {data.hero.features.slice(0, 2).map((feature, index) => (
              <span key={index} className="px-1.5 py-0.5 bg-white/20 text-white text-[10px] sm:text-xs rounded">
                {feature}
              </span>
            ))}
          </div>

          {/* Description */}
          <p className="text-base sm:text-lg text-white/90 line-clamp-3">
            {data.hero.description}
          </p>

          {/* Mobile CTA Button */}
          <div className={`-mx-6 mt-4 transition-opacity duration-1000 ${
            isPlaying && !isMuted && !showControls ? "opacity-0" : "opacity-100"
          }`}>
            <button
              onClick={handleWatchFullMovie}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold transition-all shadow-lg shadow-red-900/30 hover:scale-[1.02] active:scale-95 text-base"
            >
              <span>{ctaLabel}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Normal Hero Section - Desktop only */}
      <section
        className={`relative hidden md:block md:h-screen overflow-hidden bg-black ${isFullscreenVideo ? "md:hidden" : ""}`}
        onMouseEnter={() => typeof window !== "undefined" && window.innerWidth >= 768 && setIsHovering(true)}
        onMouseLeave={() => typeof window !== "undefined" && window.innerWidth >= 768 && setIsHovering(false)}
      >

        {/* Desktop Video - Full screen */}
        <div className="hidden md:block absolute inset-0 video-container bg-black">
          <div ref={desktopVideoRef} id="player-desktop" className="absolute inset-0 bg-gray-900" />
          {/* Gradient overlays for desktop */}
          <div className={`absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent pointer-events-none transition-opacity duration-1000 ${
            showContent ? "opacity-100" : "opacity-0"
          }`} />
          <div className={`absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent pointer-events-none transition-opacity duration-1000 ${
            showContent ? "opacity-100" : "opacity-0"
          }`} />

          {/* Click overlay for desktop */}
          <div
            onClick={handlePlayPause}
            className="absolute inset-0 z-[5] cursor-pointer"
            aria-label="Click to play/pause video"
          />
        </div>

      {/* Sound Control */}
      <button
        onClick={toggleMute}
        className="fixed md:absolute top-4 right-4 md:top-6 md:right-6 z-30 p-2 md:p-3 bg-black/60 md:bg-black/50 rounded-full hover:bg-black/70 transition-all duration-300"
      >
        {isMuted ? <VolumeXIcon className="w-4 h-4 md:w-5 md:h-5 text-white" /> : <Volume2Icon className="w-4 h-4 md:w-5 md:h-5 text-white" />}
      </button>


      {/* Next Episode Overlay */}
      {showNextEpisode && currentEpisodeIndex < data.episodes.length - 1 && (
        <div className="absolute inset-0 bg-black/80 z-30 flex items-center justify-center">
          <div className="bg-slate-900 rounded-lg p-8 max-w-lg text-center">
            <h3 className="text-2xl font-bold text-white mb-2">Next Episode</h3>
            <p className="text-lg text-white mb-6">{data.episodes[currentEpisodeIndex + 1].title}</p>
            <div className="text-4xl font-bold text-carpet-red-400 mb-6">{nextEpisodeCountdown}</div>
            <div className="flex gap-4 justify-center">
              <button
                onClick={playNextEpisode}
                className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold rounded shadow-lg shadow-red-900/30 hover:scale-[1.02] active:scale-95 transition-all"
              >
                Play Now
              </button>
              <button
                onClick={() => setShowNextEpisode(false)}
                className="px-6 py-3 bg-slate-700 text-white font-semibold rounded hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Hover zone */}
      <div
        className={`absolute bottom-0 left-0 right-0 h-1/3 z-20 ${
          isLandscape ? "hidden" : ""
        }`}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
      />

      {/* Content */}
        <div className={`relative md:absolute md:inset-0 flex flex-col justify-end p-6 md:p-12 lg:p-16 z-20 ${
          isLandscape ? "hidden" : ""
        }`}>
          {/* Profile Welcome Banner */}
          <div
            className={`mb-6 md:mb-0 md:absolute md:left-12 md:top-12 md:z-30 md:pointer-events-none transition-opacity duration-700 ${
              isPlaying && !isMuted && !showControls ? "opacity-0 md:opacity-100" : "opacity-100"
            } ${
              showContent ? "md:opacity-100" : "md:opacity-0"
            }`}
          >
            <div className="flex items-center gap-3 md:gap-4">
              <div className="relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-carpet-red-800 via-carpet-red-600 to-red-500 rounded-full blur opacity-60"></div>
                <img
                  src={data.profile.actor.profileImage}
                  alt={data.profile.actor.name}
                  className="relative w-12 h-12 md:w-14 md:h-14 rounded-full object-cover border-4 border-black"
                />
              </div>
              <div className="pointer-events-auto hidden md:block">
                <div className="rounded-full border border-white/25 bg-gradient-to-r from-carpet-red-800/90 via-carpet-red-600/90 to-red-500/80 px-4 py-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.45)]">
                  <span className="block text-xs sm:text-sm font-semibold uppercase tracking-wide text-white drop-shadow">
                    Welcome to {data.profile.actor.name}&apos;s Flmlnk page!
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className={`max-w-2xl space-y-3 md:space-y-4 mb-8 md:mb-0 transition-opacity duration-1000 ${
            // Mobile: hide when playing unmuted and not showing controls
            isPlaying && !isMuted && !showControls ? "opacity-0 md:opacity-100" : "opacity-100"
        } ${
          // Desktop: use showContent state
          showContent ? "md:opacity-100" : "md:opacity-0"
        }`}>
          {/* Title */}
          {editMode ? (
            <input
              type="text"
              value={data.hero.title}
              onChange={(e) => handleEdit("title", e.target.value)}
              className="text-4xl md:text-6xl lg:text-7xl font-bold bg-transparent text-white border-2 border-dashed border-carpet-red-400 rounded px-2"
            />
          ) : (
            <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold text-white">
              {data.hero.title}
            </h1>
          )}

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
            <span className="text-green-500 font-semibold">98% Match</span>
            <span className="text-white">{data.hero.year}</span>
            <span className="px-1.5 sm:px-2 py-0.5 border border-white/50 text-white text-[10px] sm:text-xs">{data.hero.rating}</span>
            <span className="text-white">{data.hero.episodeCount}</span>
            {data.hero.features.slice(0, 2).map((feature, index) => (
              <span key={index} className="px-1.5 sm:px-2 py-0.5 bg-white/20 text-white text-[10px] sm:text-xs rounded">
                {feature}
              </span>
            ))}
            {/* Show remaining features on larger screens */}
            {data.hero.features.slice(2).map((feature, index) => (
              <span key={index + 2} className="hidden sm:inline-block px-2 py-0.5 bg-white/20 text-white text-xs rounded">
                {feature}
              </span>
            ))}
          </div>

          {/* Description */}
          {editMode ? (
            <textarea
              value={data.hero.description}
              onChange={(e) => handleEdit("description", e.target.value)}
              className="text-lg md:text-xl text-white/90 max-w-xl bg-transparent border-2 border-dashed border-carpet-red-400 rounded p-2"
              rows={3}
            />
          ) : (
            <p className="text-base sm:text-lg md:text-xl text-white/90 max-w-xl line-clamp-3 md:line-clamp-none">
              {data.hero.description}
            </p>
          )}

          {/* Action Buttons */}
          <div className="relative">
            {/* Mobile Layout - Single CTA Button */}
            <div className={`flex sm:hidden -mx-6 transition-opacity duration-1000 ${
              isPlaying && !isMuted && !showControls ? "opacity-0" : "opacity-100"
            }`}>
              <button
                onClick={handleWatchFullMovie}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold transition-all shadow-lg shadow-red-900/30 hover:scale-[1.02] active:scale-95 text-base"
              >
                <span>{ctaLabel}</span>
              </button>
            </div>

            {/* Desktop Layout - Always visible play/pause button */}
            <div className="hidden sm:flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                onClick={handlePlayPause}
                className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-white text-black font-semibold rounded hover:bg-gray-200 transition-all shadow-lg text-sm sm:text-base"
              >
                {isPlaying ? (
                  <PauseIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <PlayIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
                <span>{isPlaying ? "Pause" : "Play"}</span>
              </button>
              <button
                onClick={handleWatchFullMovie}
                className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold rounded transition-all shadow-lg shadow-red-900/30 hover:scale-[1.02] active:scale-95 text-sm sm:text-base"
              >
                <span>{ctaLabel}</span>
              </button>
            </div>
          </div>

          {/* Desktop Action Buttons - Share and Emoji */}
          <div className="hidden md:flex gap-6 mt-4">
            {/* Share Button */}
            <button
              onClick={handleShare}
              className="flex flex-col items-center gap-1 text-white/80 hover:text-white transition-colors"
            >
              <div className="p-3 rounded-full border-2 border-white/20 hover:border-carpet-red-400 hover:bg-carpet-red-400/10 transition-colors">
                <Share2Icon className="w-5 h-5" />
              </div>
              <span className="text-xs">Share</span>
            </button>

            {/* Emoji Reactions */}
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="flex flex-col items-center gap-1 text-white/80 hover:text-white transition-colors"
              >
                <div className={`p-3 rounded-full border-2 transition-all duration-300 text-2xl ${
                  currentEmoji
                    ? "border-carpet-red-400 bg-carpet-red-400/20 shadow-lg shadow-carpet-red-400/30"
                    : "border-white/20 hover:border-carpet-red-400 hover:bg-carpet-red-400/10"
                } ${isAnimatingEmoji ? "animate-pulse" : ""}`}>
                  {currentEmoji || "😊"}
                </div>
                <span className="text-xs">{isAnimatingEmoji ? "Animating..." : "React"}</span>
              </button>

              {showEmojiPicker && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-sm rounded-lg p-2 flex gap-1 z-50">
                  {emojis.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleEmojiSelect(emoji)}
                      className={`text-2xl p-1 rounded hover:bg-carpet-red-400/20 transition-colors ${
                        currentEmoji === emoji ? "bg-carpet-red-400/30 ring-2 ring-carpet-red-400" : ""
                      } ${isAnimatingEmoji ? "pointer-events-none opacity-50" : ""}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
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

export default NetflixHero;
