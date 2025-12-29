"use client";

import type { FC } from "react";
import { useState, useCallback } from "react";

type ActionButtonsProps = {
  watchCtaLabel?: string;
  watchCtaUrl?: string;
  slug: string;
  primaryColor?: string;
  onShare?: () => void;
};

export const ActionButtons: FC<ActionButtonsProps> = ({
  watchCtaLabel = "Watch Full Movie Now!",
  watchCtaUrl,
  slug,
  primaryColor = "#FF1744",
  onShare,
}) => {
  const [copied, setCopied] = useState(false);
  const [showReactions, setShowReactions] = useState(false);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/f/${slug}`
      : `/f/${slug}`;

  const handleShare = useCallback(async () => {
    try {
      // Try native share first on mobile
      if (navigator.share) {
        await navigator.share({
          title: "Check this out!",
          url: shareUrl,
        });
        onShare?.();
        return;
      }

      // Fallback to clipboard
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onShare?.();
    } catch {
      // Final fallback
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onShare?.();
    }
  }, [shareUrl, onShare]);

  const handleReact = useCallback(() => {
    setShowReactions((prev) => !prev);
  }, []);

  const hasWatchUrl = watchCtaUrl && watchCtaUrl !== "#";

  return (
    <div className="flex flex-col gap-4">
      {/* Primary CTA - Watch Button */}
      {hasWatchUrl && (
        <a
          href={watchCtaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:scale-105 hover:shadow-xl md:text-base"
          style={{ backgroundColor: primaryColor }}
        >
          {watchCtaLabel}
        </a>
      )}

      {/* Secondary Actions - Share & React */}
      <div className="flex items-center gap-3">
        {/* Share Button */}
        <button
          type="button"
          onClick={handleShare}
          className="group flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white shadow-lg backdrop-blur transition hover:bg-white/10"
          aria-label="Share"
        >
          {copied ? (
            <CheckIcon className="h-5 w-5 text-green-400" />
          ) : (
            <ShareIcon className="h-5 w-5 transition group-hover:scale-110" />
          )}
        </button>
        <span className="text-xs text-white/60">Share</span>

        {/* React Button */}
        <div className="relative">
          <button
            type="button"
            onClick={handleReact}
            className="group flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white shadow-lg backdrop-blur transition hover:bg-white/10"
            aria-label="React"
          >
            <EmojiIcon className="h-5 w-5 transition group-hover:scale-110" />
          </button>

          {/* Reaction Picker Popup */}
          {showReactions && (
            <div className="absolute bottom-full left-0 mb-2 flex gap-1 rounded-full bg-black/80 p-2 shadow-xl backdrop-blur">
              {["👍", "❤️", "🔥", "😮", "👏"].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-lg transition hover:scale-125 hover:bg-white/10"
                  onClick={() => setShowReactions(false)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="text-xs text-white/60">React</span>
      </div>
    </div>
  );
};

const ShareIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
    />
  </svg>
);

const CheckIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const EmojiIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

export default ActionButtons;
