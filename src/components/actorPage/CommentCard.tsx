"use client";

import type { FC } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { useState, useCallback } from "react";

type Reply = {
  _id: Id<"comments">;
  name: string;
  message: string;
  createdAt: number;
  likes: number;
};

type CommentCardProps = {
  id: Id<"comments">;
  name: string;
  message: string;
  createdAt: number;
  likes: number;
  replies?: Reply[];
  primaryColor?: string;
  onLike: (_commentId: Id<"comments">) => void;
  onReply: (_commentId: Id<"comments">, _replyToName: string) => void;
  isLiking?: boolean;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years}y ago`;
  if (months > 0) return `${months}mo ago`;
  if (weeks > 0) return `${weeks}w ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function generateAvatarColor(name: string): string {
  const colors = [
    "#FF1744", // carpet-red-500
    "#DC143C", // carpet-red-600
    "#fbbf24", // amber
    "#34d399", // emerald
    "#60a5fa", // blue
    "#a78bfa", // violet
    "#f472b6", // pink
    "#22d3ee", // cyan
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export const CommentCard: FC<CommentCardProps> = ({
  id,
  name,
  message,
  createdAt,
  likes,
  replies = [],
  primaryColor = "#FF1744",
  onLike,
  onReply,
  isLiking = false,
}) => {
  const [showReplies, setShowReplies] = useState(true);
  const [localLikes, setLocalLikes] = useState(likes);
  const [hasLiked, setHasLiked] = useState(false);

  const avatarColor = generateAvatarColor(name);
  const initials = getInitials(name);
  const timeAgo = formatTimeAgo(createdAt);

  const handleLike = useCallback(() => {
    if (!hasLiked && !isLiking) {
      setLocalLikes((prev) => prev + 1);
      setHasLiked(true);
      onLike(id);
    }
  }, [hasLiked, isLiking, onLike, id]);

  const handleReply = useCallback(() => {
    onReply(id, name);
  }, [onReply, id, name]);

  const toggleReplies = useCallback(() => {
    setShowReplies((prev) => !prev);
  }, []);

  return (
    <div className="group">
      {/* Main Comment */}
      <div className="flex gap-3">
        {/* Avatar */}
        <div
          className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white"
          style={{ backgroundColor: avatarColor }}
        >
          {initials}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-white">{name}</span>
            <span className="text-xs text-slate-500">{timeAgo}</span>
          </div>

          {/* Message */}
          <p className="mt-1 text-slate-300 text-sm whitespace-pre-wrap break-words">
            {message}
          </p>

          {/* Actions */}
          <div className="mt-2 flex items-center gap-4">
            {/* Like button */}
            <button
              type="button"
              onClick={handleLike}
              disabled={hasLiked || isLiking}
              className={`
                flex items-center gap-1.5 text-xs transition
                ${hasLiked ? "text-red-400" : "text-slate-500 hover:text-red-400"}
                disabled:cursor-not-allowed
              `}
            >
              <svg
                className="w-4 h-4"
                fill={hasLiked ? "currentColor" : "none"}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
              <span>{localLikes > 0 ? localLikes : "Like"}</span>
            </button>

            {/* Reply button */}
            <button
              type="button"
              onClick={handleReply}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white transition"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                />
              </svg>
              <span>Reply</span>
            </button>

            {/* Toggle replies */}
            {replies.length > 0 && (
              <button
                type="button"
                onClick={toggleReplies}
                className="text-xs transition"
                style={{ color: primaryColor }}
              >
                {showReplies
                  ? `Hide ${replies.length} ${replies.length === 1 ? "reply" : "replies"}`
                  : `Show ${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {showReplies && replies.length > 0 && (
        <div className="mt-4 ml-12 space-y-4 border-l-2 border-white/10 pl-4">
          {replies.map((reply) => {
            const replyInitials = getInitials(reply.name);
            const replyColor = generateAvatarColor(reply.name);
            const replyTimeAgo = formatTimeAgo(reply.createdAt);

            return (
              <div key={reply._id} className="flex gap-3">
                {/* Reply Avatar */}
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                  style={{ backgroundColor: replyColor }}
                >
                  {replyInitials}
                </div>

                {/* Reply Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white text-sm">
                      {reply.name}
                    </span>
                    <span className="text-xs text-slate-500">{replyTimeAgo}</span>
                  </div>
                  <p className="mt-1 text-slate-300 text-sm whitespace-pre-wrap break-words">
                    {reply.message}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CommentCard;
