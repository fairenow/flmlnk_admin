export type EmojiType = "🌹" | "🕷️" | "💔" | "🚫" | "❤️" | "🔥";

type AnimationEventCallback = () => void;

class EmojiAnimationServiceClass {
  private isAnimating = false;
  private eventListeners: Map<string, Set<AnimationEventCallback>> = new Map();
  private onAnimationEndCallback: AnimationEventCallback | null = null;

  triggerAnimation(emoji: EmojiType): boolean {
    if (this.isAnimating) {
      return false;
    }

    this.isAnimating = true;

    // Create and animate emoji elements
    this.createEmojiAnimation(emoji);

    return true;
  }

  private createEmojiAnimation(emoji: EmojiType): void {
    // Create a container for the animation
    const container = document.createElement("div");
    container.className = "emoji-animation-container";
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 9999;
      overflow: hidden;
    `;

    // Create multiple emoji elements
    const emojiCount = 15;
    for (let i = 0; i < emojiCount; i++) {
      const emojiEl = document.createElement("div");
      emojiEl.textContent = emoji;
      emojiEl.style.cssText = `
        position: absolute;
        font-size: ${24 + Math.random() * 24}px;
        left: ${Math.random() * 100}vw;
        top: 100vh;
        opacity: 0;
        animation: emojiFloat 2s ease-out forwards;
        animation-delay: ${Math.random() * 0.5}s;
      `;
      container.appendChild(emojiEl);
    }

    // Add keyframes if not already added
    if (!document.getElementById("emoji-animation-styles")) {
      const style = document.createElement("style");
      style.id = "emoji-animation-styles";
      style.textContent = `
        @keyframes emojiFloat {
          0% {
            opacity: 1;
            transform: translateY(0) rotate(0deg) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-100vh) rotate(360deg) scale(0.5);
          }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(container);

    // Remove container and trigger end callback after animation
    setTimeout(() => {
      container.remove();
      this.isAnimating = false;
      this.emit("animationEnd");
      if (this.onAnimationEndCallback) {
        this.onAnimationEndCallback();
      }
    }, 2500);
  }

  on(event: string, callback: AnimationEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: string, callback: AnimationEventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  private emit(event: string): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => callback());
    }
  }

  setOnAnimationEnd(callback: AnimationEventCallback | null): void {
    this.onAnimationEndCallback = callback;
  }
}

export const emojiAnimationService = new EmojiAnimationServiceClass();
