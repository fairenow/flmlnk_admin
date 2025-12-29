"use client";

import type { FC, FormEvent, MouseEvent } from "react";
import { useState, useCallback, useRef, useEffect } from "react";

type CommentEmailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (_data: { name: string; email: string; message: string }) => void;
  primaryColor?: string;
  isSubmitting?: boolean;
  replyingTo?: string; // Name of user being replied to
};

export const CommentEmailModal: FC<CommentEmailModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  primaryColor = "#FF1744",
  isSubmitting = false,
  replyingTo,
}) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const nameRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus name input when modal opens
  useEffect(() => {
    if (isOpen && nameRef.current) {
      nameRef.current.focus();
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Prevent scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

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
    (e: FormEvent) => {
      e.preventDefault();
      if (validate() && !isSubmitting) {
        onSubmit({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          message: message.trim(),
        });
      }
    },
    [validate, isSubmitting, onSubmit, name, email, message]
  );

  const handleBackdropClick = useCallback(
    (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  const title = replyingTo ? `Reply to ${replyingTo}` : "Leave a Comment";
  const subtitle = replyingTo
    ? "Your reply will be posted publicly."
    : "Share your thoughts or support for this actor.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-md rounded-2xl bg-[#0c0911] border border-white/10 p-6 shadow-2xl"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label
              htmlFor="comment-name"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Your Name
            </label>
            <input
              ref={nameRef}
              id="comment-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              className={`
                w-full rounded-lg border bg-white/5 px-4 py-3 text-white placeholder-slate-500
                focus:outline-none focus:ring-2 transition
                ${errors.name ? "border-red-500 focus:ring-red-500/50" : "border-white/10 focus:ring-white/20"}
              `}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-400">{errors.name}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="comment-email"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Your Email
            </label>
            <input
              id="comment-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              className={`
                w-full rounded-lg border bg-white/5 px-4 py-3 text-white placeholder-slate-500
                focus:outline-none focus:ring-2 transition
                ${errors.email ? "border-red-500 focus:ring-red-500/50" : "border-white/10 focus:ring-white/20"}
              `}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-400">{errors.email}</p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Your email will not be displayed publicly.
            </p>
          </div>

          {/* Message */}
          <div>
            <label
              htmlFor="comment-message"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Your Message
            </label>
            <textarea
              id="comment-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Share your thoughts..."
              rows={4}
              className={`
                w-full rounded-lg border bg-white/5 px-4 py-3 text-white placeholder-slate-500
                focus:outline-none focus:ring-2 transition resize-none
                ${errors.message ? "border-red-500 focus:ring-red-500/50" : "border-white/10 focus:ring-white/20"}
              `}
            />
            {errors.message && (
              <p className="mt-1 text-xs text-red-400">{errors.message}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full py-3 text-sm font-semibold text-white transition hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{ backgroundColor: primaryColor }}
          >
            {isSubmitting ? "Posting..." : replyingTo ? "Post Reply" : "Post Comment"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CommentEmailModal;
