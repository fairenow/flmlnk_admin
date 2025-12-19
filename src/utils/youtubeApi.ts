declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

let isAPILoaded = false;
let isAPILoading = false;
const callbacks: (() => void)[] = [];

export function loadYouTubeAPI(callback: () => void): void {
  // Guard against environments where the DOM isn't available (e.g. SSR)
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  // If API is already loaded, call callback immediately
  if (isAPILoaded && window.YT) {
    callback();
    return;
  }

  // Add callback to queue
  callbacks.push(callback);

  // If already loading, just wait
  if (isAPILoading) {
    return;
  }

  // Start loading
  isAPILoading = true;

  // Set up the global callback
  window.onYouTubeIframeAPIReady = () => {
    isAPILoaded = true;
    isAPILoading = false;
    // Execute all queued callbacks
    callbacks.forEach((cb) => cb());
    callbacks.length = 0;
  };

  // Load the script
  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  script.async = true;
  document.head.appendChild(script);
}

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
