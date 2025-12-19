"use client";

import type { FC, FormEvent } from "react";
import type { Id, Doc } from "@convex/_generated/dataModel";
import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Heart, MessageCircle, CheckCircle, AlertCircle, User } from "lucide-react";
import { signIn, useSession } from "@/lib/auth-client";

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
    <path
      fill="#EA4335"
      d="M12 10.2v3.6h5.1c-.2 1.2-.8 2.1-1.6 2.8l2.6 2c1.5-1.4 2.4-3.5 2.4-6 0-.6-.1-1.2-.2-1.8H12z"
    />
    <path
      fill="#34A853"
      d="M5.3 14.3l-.8.6-2 1.6C4 20 7.7 22 12 22c2.4 0 4.4-.8 5.9-2.4l-2.6-2c-.7.5-1.6.8-2.7.8-2.1 0-3.9-1.4-4.6-3.4z"
    />
    <path
      fill="#4A90E2"
      d="M3 7.5C2.4 8.7 2 10.1 2 11.5s.4 2.8 1 4l3.2-2.5c-.2-.5-.3-1-.3-1.5s.1-1 .3-1.5z"
    />
    <path
      fill="#FBBC05"
      d="M12 4.8c1.3 0 2.5.4 3.4 1.3l2.5-2.4C16.4 2.4 14.4 1.5 12 1.5 7.7 1.5 4 3.5 2.5 7l3.2 2.5C6.1 6.2 8 4.8 12 4.8z"
    />
    <path fill="none" d="M2 2h20v20H2z" />
  </svg>
);

type CommentWithOwner = Doc<"comments"> & { isOwner?: boolean };
type Comment = CommentWithOwner & { replies: CommentWithOwner[] };

type InlineCommentFormProps = {
  initialName: string;
  initialEmail: string;
  primaryColor: string;
  onSubmit: (data: { name: string; email: string; message: string }) => Promise<boolean>;
  onCancel?: () => void;
  isSubmitting: boolean;
  autoFocus?: boolean;
  placeholder?: string;
};

const InlineCommentForm: FC<InlineCommentFormProps> = ({
  initialName,
  initialEmail,
  primaryColor,
  onSubmit,
  onCancel,
  isSubmitting,
  autoFocus = false,
  placeholder,
}) => {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  useEffect(() => {
    setEmail(initialEmail);
  }, [initialEmail]);

  useEffect(() => {
    if (autoFocus && nameRef.current) {
      nameRef.current.focus();
    }
  }, [autoFocus]);

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Please enter a valid email";
    }

    if (!message.trim()) {
      newErrors.message = "Message is required";
    } else if (message.trim().length < 2) {
      newErrors.message = "Message must be at least 2 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, email, message]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!validate() || isSubmitting) {
        return;
      }

      const success = await onSubmit({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        message: message.trim(),
      });

      if (success) {
        setMessage("");
      }
    },
    [validate, isSubmitting, onSubmit, name, email, message]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-300 mb-1" htmlFor="comment-name">
            Name
          </label>
          <input
            ref={nameRef}
            id="comment-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 bg-gray-950 text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition ${errors.name ? "border-red-500 focus:ring-red-500/40" : "border-gray-800 focus:ring-gray-700"}`}
            placeholder="Your name"
          />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </div>
        <div>
          <label className="block text-sm text-gray-300 mb-1" htmlFor="comment-email">
            Email
          </label>
          <input
            id="comment-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 bg-gray-950 text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition ${errors.email ? "border-red-500 focus:ring-red-500/40" : "border-gray-800 focus:ring-gray-700"}`}
            placeholder="you@example.com"
          />
          {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
          <p className="text-xs text-gray-500 mt-1">Your email will not be displayed publicly.</p>
        </div>
      </div>
      <div>
        <label className="block text-sm text-gray-300 mb-1" htmlFor="comment-message">
          Message
        </label>
        <textarea
          id="comment-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`w-full rounded-lg border px-3 py-2 bg-gray-950 text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition resize-none ${errors.message ? "border-red-500 focus:ring-red-500/40" : "border-gray-800 focus:ring-gray-700"}`}
          placeholder={placeholder || "Share your thoughts..."}
          rows={3}
        />
        {errors.message && <p className="text-xs text-red-400 mt-1">{errors.message}</p>}
      </div>
      <div className="flex items-center gap-3 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed bg-gradient-to-r from-carpet-red-800/90 via-carpet-red-600/90 to-red-500/80"
        >
          {isSubmitting ? "Posting..." : "Post"}
        </button>
      </div>
    </form>
  );
};

type CommentsSectionProps = {
  actorProfileId: Id<"actor_profiles">;
  actorName: string;
  primaryColor?: string;
  isOwner?: boolean;
  ownerName?: string | null;
  ownerEmail?: string | null;
};

export const CommentsSection: FC<CommentsSectionProps> = ({
  actorProfileId,
  actorName,
  primaryColor = "#FF1744",
  isOwner = false,
  ownerName,
  ownerEmail,
}) => {
  const [replyingTo, setReplyingTo] = useState<{
    id: Id<"comments">;
    name: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [ownerMessage, setOwnerMessage] = useState("");
  const ownerComposerRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const COMMENTS_PER_PAGE = 5;
  const [visibleCount, setVisibleCount] = useState(COMMENTS_PER_PAGE);

  // Auth state from localStorage
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [isGooglePending, setIsGooglePending] = useState(false);

  // Session hook for Google auth
  const { data: sessionData } = useSession();
  const isGoogleAuthenticated = Boolean(sessionData?.session);

  // Load auth state on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = localStorage.getItem('flmlnk_auth');
      if (auth) {
        try {
          const parsed = JSON.parse(auth);
          setIsAuthenticated(parsed.isAuthenticated || false);
          setUserName(parsed.userName || '');
          setUserEmail(parsed.userEmail || '');
        } catch {
          // Invalid JSON, ignore
        }
      }
    }
  }, []);

  // Queries
  const comments = useQuery(api.comments.getByActorProfile, { actorProfileId });

  // Mutations
  const submitComment = useMutation(api.comments.submit);
  const likeComment = useMutation(api.comments.like);
  const unlikeComment = useMutation(api.comments.unlike);

  const handleGoogleSignIn = useCallback(async () => {
    setIsGooglePending(true);
    try {
      await signIn.social({
        provider: "google",
        redirectTo: window.location.href,
      });
    } catch (err) {
      console.error("Failed to sign in with Google:", err);
      setIsGooglePending(false);
    }
  }, []);

  const handleOpenComposer = useCallback(() => {
    setReplyingTo(null);
    if (isOwner) {
      setOwnerMessage("");
      setTimeout(() => ownerComposerRef.current?.focus(), 50);
    } else {
      if (composerRef.current) {
        composerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        const input = composerRef.current.querySelector("input");
        if (input instanceof HTMLInputElement) {
          setTimeout(() => input.focus(), 200);
        }
      }
    }
  }, [isOwner]);

  const handleReply = useCallback((commentId: Id<"comments">, replyToName: string) => {
    setReplyingTo({ id: commentId, name: replyToName });
    if (isOwner) {
      setOwnerMessage("");
      setTimeout(() => ownerComposerRef.current?.focus(), 50);
    } else {
      const replyForm = document.getElementById(`reply-form-${commentId}`);
      if (replyForm) {
        replyForm.scrollIntoView({ behavior: "smooth", block: "start" });
        const input = replyForm.querySelector("input");
        if (input instanceof HTMLInputElement) {
          setTimeout(() => input.focus(), 200);
        }
      }
    }
  }, [isOwner]);

  const handleLike = useCallback(
    async (commentId: Id<"comments">) => {
      try {
        const hasLiked = likedComments.has(commentId);
        if (hasLiked) {
          await unlikeComment({ commentId });
        } else {
          await likeComment({ commentId });
        }

        setLikedComments((prev) => {
          const newSet = new Set(prev);
          if (hasLiked) {
            newSet.delete(commentId);
          } else {
            newSet.add(commentId);
          }
          return newSet;
        });
      } catch (error) {
        console.error("Failed to like comment:", error);
      }
    },
    [likeComment, likedComments, unlikeComment]
  );

  const handleSubmit = useCallback(
    async (data: { name: string; email: string; message: string }) => {
      setIsSubmitting(true);
      try {
        await submitComment({
          actorProfileId,
          name: data.name,
          email: data.email,
          message: data.message,
          parentId: replyingTo?.id,
        });

        // Save auth state
        if (typeof window !== 'undefined') {
          localStorage.setItem('flmlnk_auth', JSON.stringify({
            isAuthenticated: true,
            userName: data.name,
            userEmail: data.email
          }));
          setIsAuthenticated(true);
          setUserName(data.name);
          setUserEmail(data.email);
        }

        setReplyingTo(null);
        return true;
      } catch (error) {
        console.error("Failed to submit comment:", error);
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [submitComment, actorProfileId, replyingTo]
  );

  const isLoading = comments === undefined;

  useEffect(() => {
    if (comments) {
      setVisibleCount((prev) => {
        const next = Math.max(COMMENTS_PER_PAGE, prev);
        return Math.min(next, comments.length);
      });
    }
  }, [comments, COMMENTS_PER_PAGE]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  useEffect(() => {
    if (isOwner) {
      setIsAuthenticated(true);
      setUserName(ownerName || actorName);
    }
  }, [isOwner, ownerName, actorName]);

  const handleOwnerSubmit = useCallback(async () => {
    if (!ownerMessage.trim()) {
      return;
    }

    const resolvedName = ownerName || actorName || "Owner";
    const resolvedEmail = ownerEmail || "owner@flmlnk.com";

    const success = await handleSubmit({
      name: resolvedName,
      email: resolvedEmail,
      message: ownerMessage,
    });

    if (success) {
      setOwnerMessage("");
    }
  }, [handleSubmit, ownerEmail, ownerMessage, ownerName, actorName]);

  const displayedComments = comments?.slice(0, visibleCount) || [];

  return (
    <section className="bg-black text-white py-8 md:py-16 px-4 md:px-6 lg:px-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white">Comments</h2>
            <p className="mt-1 text-gray-400">
              Share your thoughts about {actorName}&apos;s work
            </p>
          </div>
          {isOwner ? (
            <button
              type="button"
              onClick={handleOpenComposer}
              className="px-6 py-3 rounded-lg font-semibold text-white transition-all hover:opacity-90 shadow-lg bg-gradient-to-r from-carpet-red-800/90 via-carpet-red-600/90 to-red-500/80"
            >
              Respond as Owner
            </button>
          ) : !isGoogleAuthenticated && !isAuthenticated ? (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGooglePending}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold border border-gray-600 bg-white text-gray-900 shadow-lg transition hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <GoogleIcon />
              {isGooglePending ? "Connecting..." : "Sign in with Google"}
            </button>
          ) : null}
        </div>

        {!isOwner && (
          <div
            ref={composerRef}
            className="mb-8 border border-gray-800 rounded-xl p-4 md:p-6 bg-gray-900/40"
          >
            <div className="mb-3">
              <p className="text-white font-semibold">Start the conversation</p>
              <p className="text-gray-400 text-sm">Your comment will appear below.</p>
            </div>
            <InlineCommentForm
              initialName={userName}
              initialEmail={userEmail}
              primaryColor={primaryColor}
              isSubmitting={isSubmitting}
              onSubmit={(data) => {
                setReplyingTo(null);
                return handleSubmit(data);
              }}
            />
          </div>
        )}

        {/* Auth Status Banner */}
        {isAuthenticated ? (
          <div className="mb-6 p-4 rounded-lg border border-green-500/30 bg-green-500/10 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div>
              <p className="text-green-400 font-medium">Signed in as {userName}</p>
              <p className="text-green-400/70 text-sm">Your comments will be verified</p>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 rounded-lg border border-red-500/30 bg-red-500/10 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-red-400 font-medium">Sign up to leave verified comments</p>
              <p className="text-red-400/70 text-sm">Join the community and share your thoughts</p>
            </div>
          </div>
        )}

        {isOwner && (
          <div className="mb-8 border border-gray-800 rounded-xl p-4 bg-gray-900/40">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${primaryColor}30` }}
              >
                <User className="w-5 h-5" style={{ color: primaryColor }} />
              </div>
              <div>
                <p className="text-white font-semibold flex items-center gap-2">
                  {ownerName || actorName}
                  <svg
                    className="w-4 h-4 text-yellow-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="text-xs text-yellow-300/80 uppercase tracking-wide">Page Owner</span>
                </p>
                <p className="text-gray-400 text-sm">Replying publicly as the page owner</p>
              </div>
            </div>
            {replyingTo && (
              <div className="mb-3 text-sm text-gray-300 flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-gray-400" />
                <span>Replying to {replyingTo.name}</span>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
            <div className="space-y-3">
              <textarea
                ref={ownerComposerRef}
                value={ownerMessage}
                onChange={(e) => setOwnerMessage(e.target.value)}
                placeholder={replyingTo ? `Reply to ${replyingTo.name}` : "Share an update with your fans"}
                className="w-full rounded-lg border border-gray-800 bg-gray-950 px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-[var(--owner-accent)]"
                style={{ ["--owner-accent" as string]: primaryColor }}
                rows={3}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleOwnerSubmit}
                  disabled={isSubmitting || ownerMessage.trim().length < 2}
                  className="px-4 py-2 rounded-lg font-semibold text-white disabled:opacity-60 bg-gradient-to-r from-carpet-red-800/90 via-carpet-red-600/90 to-red-500/80"
                >
                  {isSubmitting ? "Posting..." : replyingTo ? "Post Reply" : "Post Comment"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Comments List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3 text-gray-400">
              <svg
                className="animate-spin h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Loading comments...</span>
            </div>
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mb-4">
              <MessageCircle className="w-10 h-10 text-gray-500" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No comments yet</h3>
            <p className="text-gray-400 mb-6 max-w-md">
              Be the first to share your thoughts about {actorName}&apos;s work!
            </p>
            <button
              type="button"
              onClick={handleOpenComposer}
              className="px-8 py-3 rounded-lg font-semibold text-white transition-all hover:scale-105 shadow-lg bg-gradient-to-r from-carpet-red-800/90 via-carpet-red-600/90 to-red-500/80"
            >
              Write the First Comment
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedComments.map((comment: Comment) => {
              const isLiked = likedComments.has(comment._id);
              return (
                <div
                  key={comment._id}
                  className="bg-gray-900/50 rounded-xl p-4 md:p-6 border border-gray-800 hover:border-gray-700 transition-colors"
                >
                  {/* Comment Header */}
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${primaryColor}30` }}
                    >
                      <User className="w-5 h-5" style={{ color: primaryColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white flex items-center gap-1">
                          {comment.name}
                          {comment.isOwner && (
                            <svg
                              className="w-4 h-4 text-yellow-400"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          )}
                        </span>
                        <span className="text-gray-500 text-sm">
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Comment Body */}
                  <p className="text-gray-300 mb-4 whitespace-pre-wrap">{comment.message}</p>

                  {/* Comment Actions */}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => handleLike(comment._id)}
                      className="flex items-center gap-1.5 text-sm transition-colors group"
                    >
                      <Heart
                        className={`w-4 h-4 transition-all ${
                          isLiked
                            ? 'fill-current'
                            : 'group-hover:scale-110'
                        }`}
                        style={{ color: isLiked ? primaryColor : '#9ca3af' }}
                      />
                      <span className={isLiked ? '' : 'text-gray-400'} style={{ color: isLiked ? primaryColor : undefined }}>
                        {comment.likes || 0}
                      </span>
                    </button>
                    <button
                      onClick={() => handleReply(comment._id, comment.name)}
                      className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Reply</span>
                    </button>
                  </div>

                  {/* Replies */}
                  {comment.replies && comment.replies.length > 0 && (
                    <div className="mt-4 ml-8 md:ml-12 space-y-3 border-l-2 border-gray-800 pl-4">
                      {comment.replies.map((reply) => {
                        const replyLiked = likedComments.has(reply._id);

                        return (
                          <div key={reply._id} className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: `${primaryColor}30` }}
                            >
                              <User className="w-3 h-3" style={{ color: primaryColor }} />
                            </div>
                            <span className="font-medium text-white text-sm flex items-center gap-1">
                              {reply.name}
                              {reply.isOwner && (
                                <svg
                                  className="w-3.5 h-3.5 text-yellow-400"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              )}
                            </span>
                            <span className="text-gray-500 text-xs">
                              {formatDate(reply.createdAt)}
                            </span>
                          </div>
                          <p className="text-gray-300 text-sm">{reply.message}</p>
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            <button
                              onClick={() => handleLike(reply._id)}
                              className="flex items-center gap-1.5 transition-colors hover:text-white"
                            >
                              <Heart
                                className={`w-4 h-4 transition-all ${replyLiked ? 'fill-current' : ''}`}
                                style={{ color: replyLiked ? primaryColor : undefined }}
                              />
                              <span className={replyLiked ? '' : 'text-gray-400'}>
                                {reply.likes || 0}
                              </span>
                            </button>
                            <button
                              onClick={() => handleReply(reply._id, reply.name)}
                              className="flex items-center gap-1.5 hover:text-white"
                            >
                              <MessageCircle className="w-4 h-4" />
                              <span>Reply</span>
                            </button>
                          </div>
                          {replyingTo?.id === reply._id && !isOwner && (
                            <div
                              id={`reply-form-${reply._id}`}
                              className="mt-3 ml-7"
                            >
                              <InlineCommentForm
                                initialName={userName}
                                initialEmail={userEmail}
                                primaryColor={primaryColor}
                                isSubmitting={isSubmitting}
                                placeholder={`Reply to ${reply.name}`}
                                onSubmit={handleSubmit}
                                onCancel={() => setReplyingTo(null)}
                                autoFocus
                              />
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                  {replyingTo?.id === comment._id && !isOwner && (
                    <div
                      id={`reply-form-${comment._id}`}
                      className="mt-4 ml-8 md:ml-12"
                    >
                      <InlineCommentForm
                        initialName={userName}
                        initialEmail={userEmail}
                        primaryColor={primaryColor}
                        isSubmitting={isSubmitting}
                        placeholder={`Reply to ${comment.name}`}
                        onSubmit={handleSubmit}
                        onCancel={() => setReplyingTo(null)}
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {comments && visibleCount < comments.length && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + COMMENTS_PER_PAGE)}
                  className="px-5 py-2 rounded-lg text-white bg-gray-800 hover:bg-gray-700"
                >
                  Load more comments
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default CommentsSection;
