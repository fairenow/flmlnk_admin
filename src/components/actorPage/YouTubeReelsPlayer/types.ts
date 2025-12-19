// Type definitions for YouTubeReelsPlayer component
import type { Id } from "@convex/_generated/dataModel";

// Clip type from Convex database (matching the schema)
export type Clip = {
  _id: Id<"clips">;
  title: string;
  youtubeUrl: string;
  description?: string;
  deepLinkId?: string;
  duration?: string;
  stripePaymentUrl?: string;
};

export type YouTubeReelsPlayerProps = {
  clips: Clip[];
  slug: string;                    // Actor's slug for URL sharing
  featuredClipId?: Id<"clips">;
  primaryColor?: string;
  onClipShare?: (clipId: Id<"clips">) => void;
};

// YouTube Player types
export type YTPlayerState = {
  UNSTARTED: -1;
  ENDED: 0;
  PLAYING: 1;
  PAUSED: 2;
  BUFFERING: 3;
  CUED: 5;
};

export type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  getPlayerState: () => number;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
};

export type YTPlayerEvent = {
  target: YTPlayer;
  data: number;
};

// Note: Window.YT and Window.onYouTubeIframeAPIReady are already declared
// in @/utils/youtubeApi.ts and ClipsGallery.tsx as type 'any'
