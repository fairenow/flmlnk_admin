"use client";

import type { FC, FormEvent } from "react";
import { useState, useCallback } from "react";

type DirectBookingFormProps = {
  actorName: string;
  primaryColor?: string;
  onSubmit?: (_data: {
    name: string;
    email: string;
    projectType: string;
    message: string;
  }) => void | Promise<void>;
};

const PROJECT_TYPES = [
  "Feature Film",
  "Short Film",
  "TV/Streaming Series",
  "Commercial",
  "Theater Production",
  "Voice Over",
  "Other",
];

export const DirectBookingForm: FC<DirectBookingFormProps> = ({
  actorName,
  primaryColor = "#FF1744",
  onSubmit,
}) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [projectType, setProjectType] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

    if (!projectType) {
      newErrors.projectType = "Please select a project type";
    }

    if (!message.trim()) {
      newErrors.message = "Message is required";
    } else if (message.trim().length < 10) {
      newErrors.message = "Please provide more details about your project";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, email, projectType, message]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      setIsSubmitting(true);
      try {
        await onSubmit?.({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          projectType,
          message: message.trim(),
        });
        setIsSubmitted(true);
      } catch (error) {
        console.error("Failed to submit inquiry:", error);
        setErrors({
          submit: "Failed to send inquiry. Please try again.",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [validate, onSubmit, name, email, projectType, message]
  );

  if (isSubmitted) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: `${primaryColor}20` }}
        >
          <svg
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{ color: primaryColor }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Inquiry Submitted!</h3>
        <p className="text-slate-400">
          Thank you for your interest in working with {actorName}. We&apos;ll be
          in touch soon.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-semibold text-white mb-2">
        Direct Booking Inquiry
      </h3>
      <p className="text-sm text-slate-400 mb-6">
        Interested in booking {actorName} for your project? Fill out the form
        below.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label
            htmlFor="booking-name"
            className="block text-sm font-medium text-slate-300 mb-1"
          >
            Your Name
          </label>
          <input
            id="booking-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Smith"
            className={`
              w-full rounded-lg border bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500
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
            htmlFor="booking-email"
            className="block text-sm font-medium text-slate-300 mb-1"
          >
            Email Address
          </label>
          <input
            id="booking-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="john@production.com"
            className={`
              w-full rounded-lg border bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500
              focus:outline-none focus:ring-2 transition
              ${errors.email ? "border-red-500 focus:ring-red-500/50" : "border-white/10 focus:ring-white/20"}
            `}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-400">{errors.email}</p>
          )}
        </div>

        {/* Project Type */}
        <div>
          <label
            htmlFor="booking-project-type"
            className="block text-sm font-medium text-slate-300 mb-1"
          >
            Project Type
          </label>
          <select
            id="booking-project-type"
            value={projectType}
            onChange={(e) => setProjectType(e.target.value)}
            className={`
              w-full rounded-lg border bg-white/5 px-4 py-2.5 text-sm text-white
              focus:outline-none focus:ring-2 transition appearance-none cursor-pointer
              ${errors.projectType ? "border-red-500 focus:ring-red-500/50" : "border-white/10 focus:ring-white/20"}
              ${!projectType ? "text-slate-500" : ""}
            `}
          >
            <option value="" className="bg-[#0c0911]">
              Select project type...
            </option>
            {PROJECT_TYPES.map((type) => (
              <option key={type} value={type} className="bg-[#0c0911]">
                {type}
              </option>
            ))}
          </select>
          {errors.projectType && (
            <p className="mt-1 text-xs text-red-400">{errors.projectType}</p>
          )}
        </div>

        {/* Message */}
        <div>
          <label
            htmlFor="booking-message"
            className="block text-sm font-medium text-slate-300 mb-1"
          >
            Project Details
          </label>
          <textarea
            id="booking-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us about your project, role, timeline, and budget..."
            rows={4}
            className={`
              w-full rounded-lg border bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500
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
          className="w-full rounded-full py-3 text-sm font-semibold text-white transition hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 bg-gradient-to-r from-carpet-red-800/90 via-carpet-red-600/90 to-red-500/80"
        >
          {isSubmitting ? "Sending..." : "Submit Inquiry"}
        </button>

        {errors.submit && (
          <p className="mt-2 text-center text-sm text-red-400">{errors.submit}</p>
        )}
      </form>
    </div>
  );
};

export default DirectBookingForm;
