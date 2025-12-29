/**
 * Video API utility that supports multiple video providers (YouTube and Vimeo)
 * for the hero video player section.
 */

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
    Vimeo: any;
  }
}

export type VideoProvider = 'youtube' | 'vimeo' | null;

export interface VideoInfo {
  provider: VideoProvider;
  id: string | null;
}

interface VimeoOEmbedResponse {
  thumbnail_url?: string;
}

const vimeoThumbnailCache = new Map<string, string | null>();

// YouTube API state
let isYouTubeAPILoaded = false;
let isYouTubeAPILoading = false;
const youtubeCallbacks: (() => void)[] = [];

// Vimeo API state
let isVimeoAPILoaded = false;
let isVimeoAPILoading = false;
const vimeoCallbacks: (() => void)[] = [];

/**
 * Detect the video provider from a URL
 */
export function detectVideoProvider(url: string): VideoProvider {
  if (!url) return null;

  // YouTube patterns
  if (
    url.includes('youtube.com') ||
    url.includes('youtu.be') ||
    // Raw YouTube video ID (11 characters)
    /^[a-zA-Z0-9_-]{11}$/.test(url)
  ) {
    return 'youtube';
  }

  // Vimeo patterns
  if (
    url.includes('vimeo.com') ||
    url.includes('player.vimeo.com')
  ) {
    return 'vimeo';
  }

  return null;
}

/**
 * Extract YouTube video ID from various URL formats
 */
export function extractYouTubeId(url: string): string | null {
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

/**
 * Extract Vimeo video ID from various URL formats
 * Supports:
 * - https://vimeo.com/123456789
 * - https://vimeo.com/channels/channelname/123456789
 * - https://vimeo.com/groups/groupname/videos/123456789
 * - https://player.vimeo.com/video/123456789
 * - https://vimeo.com/123456789?h=abcdefghij (private videos with hash)
 * - https://vimeo.com/123456789/abcdefghij (unlisted videos)
 * - Raw numeric ID
 */
export function extractVimeoId(url: string): string | null {
  // Check for raw numeric ID
  if (/^\d+$/.test(url)) {
    return url;
  }

  const patterns = [
    // Standard vimeo.com/ID format
    /vimeo\.com\/(\d+)/,
    // Player embed format
    /player\.vimeo\.com\/video\/(\d+)/,
    // Channels, groups, album formats
    /vimeo\.com\/(?:channels|groups|album)\/[^/]+\/(?:videos\/)?(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Extract the hash parameter for private/unlisted Vimeo videos
 */
export function extractVimeoHash(url: string): string | null {
  // Check for ?h= parameter
  const hashParamMatch = url.match(/[?&]h=([a-zA-Z0-9]+)/);
  if (hashParamMatch) return hashParamMatch[1];

  // Check for /ID/hash format (unlisted videos)
  const unlistedMatch = url.match(/vimeo\.com\/\d+\/([a-zA-Z0-9]+)/);
  if (unlistedMatch) return unlistedMatch[1];

  return null;
}

/**
 * Get video info (provider and ID) from a URL
 */
export function getVideoInfo(url: string): VideoInfo {
  const provider = detectVideoProvider(url);

  if (provider === 'youtube') {
    return { provider, id: extractYouTubeId(url) };
  }

  if (provider === 'vimeo') {
    return { provider, id: extractVimeoId(url) };
  }

  return { provider: null, id: null };
}

/**
 * Fetch Vimeo thumbnail URL using the public oEmbed endpoint.
 */
export async function getVimeoThumbnailUrl(videoUrl: string): Promise<string | null> {
  if (!videoUrl) return null;

  const cacheKey = videoUrl;
  if (vimeoThumbnailCache.has(cacheKey)) {
    return vimeoThumbnailCache.get(cacheKey) ?? null;
  }

  try {
    const response = await fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch Vimeo metadata: ${response.status}`);
    }

    const data = (await response.json()) as VimeoOEmbedResponse;
    const thumbnailUrl = data.thumbnail_url ?? null;

    vimeoThumbnailCache.set(cacheKey, thumbnailUrl);
    return thumbnailUrl;
  } catch (error) {
    console.error('Error fetching Vimeo thumbnail', error);
    vimeoThumbnailCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Get a video thumbnail URL for supported providers.
 */
export async function getVideoThumbnailUrl(videoUrl: string): Promise<string | null> {
  const { provider } = getVideoInfo(videoUrl);

  if (provider === 'youtube') {
    const id = extractYouTubeId(videoUrl);
    return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
  }

  if (provider === 'vimeo') {
    return getVimeoThumbnailUrl(videoUrl);
  }

  return null;
}

/**
 * Load YouTube IFrame API
 */
export function loadYouTubeAPI(callback: () => void): void {
  if (typeof window === 'undefined') return;

  // If API is already loaded, call callback immediately
  if (isYouTubeAPILoaded && window.YT && window.YT.Player) {
    callback();
    return;
  }

  // Add callback to queue
  youtubeCallbacks.push(callback);

  // If already loading, just wait
  if (isYouTubeAPILoading) {
    return;
  }

  // Start loading
  isYouTubeAPILoading = true;

  // Set up the global callback
  window.onYouTubeIframeAPIReady = () => {
    isYouTubeAPILoaded = true;
    isYouTubeAPILoading = false;
    // Execute all queued callbacks
    youtubeCallbacks.forEach((cb) => cb());
    youtubeCallbacks.length = 0;
  };

  // Load the script
  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  script.async = true;
  document.head.appendChild(script);
}

/**
 * Load Vimeo Player API
 */
export function loadVimeoAPI(callback: () => void): void {
  if (typeof window === 'undefined') return;

  // If API is already loaded, call callback immediately
  if (isVimeoAPILoaded && window.Vimeo && window.Vimeo.Player) {
    callback();
    return;
  }

  // Add callback to queue
  vimeoCallbacks.push(callback);

  // If already loading, just wait
  if (isVimeoAPILoading) {
    return;
  }

  // Check if script already exists
  if (document.querySelector('script[src*="player.vimeo.com/api/player.js"]')) {
    // Script exists, wait for it to load
    const checkInterval = setInterval(() => {
      if (window.Vimeo && window.Vimeo.Player) {
        clearInterval(checkInterval);
        isVimeoAPILoaded = true;
        isVimeoAPILoading = false;
        vimeoCallbacks.forEach((cb) => cb());
        vimeoCallbacks.length = 0;
      }
    }, 100);
    return;
  }

  // Start loading
  isVimeoAPILoading = true;

  // Load the script
  const script = document.createElement("script");
  script.src = "https://player.vimeo.com/api/player.js";
  script.async = true;
  script.onload = () => {
    isVimeoAPILoaded = true;
    isVimeoAPILoading = false;
    // Execute all queued callbacks
    vimeoCallbacks.forEach((cb) => cb());
    vimeoCallbacks.length = 0;
  };
  script.onerror = () => {
    isVimeoAPILoading = false;
    console.error('Failed to load Vimeo Player API');
  };
  document.head.appendChild(script);
}

/**
 * Load the appropriate video API based on the provider
 */
export function loadVideoAPI(provider: VideoProvider, callback: () => void): void {
  if (provider === 'youtube') {
    loadYouTubeAPI(callback);
  } else if (provider === 'vimeo') {
    loadVimeoAPI(callback);
  }
}

/**
 * Create a Vimeo player configuration object
 */
export interface VimeoPlayerOptions {
  id: string;
  hash?: string | null;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  background?: boolean;
  responsive?: boolean;
  dnt?: boolean; // Do Not Track
}

export function getVimeoPlayerConfig(options: VimeoPlayerOptions): Record<string, any> {
  const config: Record<string, any> = {
    id: options.id,
    autoplay: options.autoplay ?? true,
    muted: options.muted ?? true,
    loop: options.loop ?? true,
    controls: options.controls ?? false,
    background: options.background ?? true,
    responsive: options.responsive ?? true,
    dnt: options.dnt ?? true,
  };

  // Add hash for private/unlisted videos
  if (options.hash) {
    config.h = options.hash;
  }

  return config;
}

/**
 * Create YouTube player configuration object (playerVars)
 */
export interface YouTubePlayerOptions {
  videoId: string;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
}

export function getYouTubePlayerConfig(options: YouTubePlayerOptions): Record<string, any> {
  return {
    autoplay: options.autoplay ?? true ? 1 : 0,
    controls: options.controls ?? false ? 1 : 0,
    disablekb: 1,
    fs: 0,
    modestbranding: 1,
    playsinline: 1,
    showinfo: 0,
    mute: options.muted ?? true ? 1 : 0,
    loop: options.loop ?? true ? 1 : 0,
    playlist: options.videoId, // Required for looping
    origin: typeof window !== 'undefined' ? window.location.origin : '',
  };
}
