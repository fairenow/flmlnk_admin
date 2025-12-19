"use client";

import type { FC } from "react";
import { useRef, useEffect, useState, useCallback } from "react";

type VideoBackgroundProps = {
  youtubeUrl?: string;
  posterUrl?: string;
  isPlaying: boolean;
  isMuted: boolean;
  onReady?: () => void;
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

export const VideoBackground: FC<VideoBackgroundProps> = ({
  youtubeUrl,
  posterUrl,
  isPlaying,
  isMuted,
  onReady,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const videoId = youtubeUrl ? extractYouTubeId(youtubeUrl) : null;

  // Post message to YouTube iframe for play/pause control
  const postMessage = useCallback((action: string) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: action, args: [] }),
        "*"
      );
    }
  }, []);

  // Handle play/pause state changes
  useEffect(() => {
    if (!isLoaded || !videoId) return;
    postMessage(isPlaying ? "playVideo" : "pauseVideo");
  }, [isPlaying, isLoaded, videoId, postMessage]);

  // Handle mute state changes
  useEffect(() => {
    if (!isLoaded || !videoId) return;
    postMessage(isMuted ? "mute" : "unMute");
  }, [isMuted, isLoaded, videoId, postMessage]);

  const handleIframeLoad = useCallback(() => {
    setIsLoaded(true);
    onReady?.();
  }, [onReady]);

  // Generate YouTube thumbnail as poster
  const thumbnailUrl = videoId
    ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    : posterUrl;

  // YouTube embed with autoplay and loop (using privacy-enhanced mode)
  const embedUrl = videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&showinfo=0&modestbranding=1&enablejsapi=1&origin=${typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : ""}`
    : null;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Poster/Thumbnail layer (always present as fallback) */}
      {thumbnailUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
          style={{
            backgroundImage: `url(${thumbnailUrl})`,
            opacity: isLoaded ? 0 : 1,
          }}
        />
      )}

      {/* Video layer */}
      {embedUrl && (
        <iframe
          ref={iframeRef}
          src={embedUrl}
          title="Background video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            border: "none",
            width: "177.78vh",
            height: "100vh",
            minWidth: "100vw",
            minHeight: "56.25vw",
          }}
          onLoad={handleIframeLoad}
        />
      )}

      {/* Gradient overlays for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30" />
    </div>
  );
};

export default VideoBackground;
