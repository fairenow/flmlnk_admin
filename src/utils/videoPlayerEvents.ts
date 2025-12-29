type VideoPlayerEventType =
  | "tiktok-player-opened"
  | "tiktok-player-closed"
  | "video-play"
  | "video-pause"
  | "video-end";

type EventCallback = () => void;

class VideoPlayerEvents {
  private listeners: Map<VideoPlayerEventType, Set<EventCallback>> = new Map();

  on(event: VideoPlayerEventType, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: VideoPlayerEventType, callback: EventCallback): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(callback);
    }
  }

  emit(event: VideoPlayerEventType): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((callback) => callback());
    }
  }
}

export const videoPlayerEvents = new VideoPlayerEvents();
