"use client";

import type { FC, ReactNode } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { getSessionId, getUserAgent, getReferrer } from "@/lib/analytics";
import { pushGTMEvent } from "@/lib/gtm";

type Socials = {
  instagram?: string;
  facebook?: string;
  youtube?: string;
  tiktok?: string;
  imdb?: string;
  website?: string;
};

type FollowTheJourneyProps = {
  socials: Socials;
  primaryColor?: string;
  onEmailSignup?: () => void;
  actorProfileId?: string;
};

const SOCIAL_ICONS: Record<string, { icon: ReactNode; label: string; color: string }> = {
  instagram: {
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    ),
    label: "Instagram",
    color: "#E4405F",
  },
  youtube: {
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
    label: "YouTube",
    color: "#FF0000",
  },
  tiktok: {
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </svg>
    ),
    label: "TikTok",
    color: "#000000",
  },
  facebook: {
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
    label: "Facebook",
    color: "#1877F2",
  },
  imdb: {
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14.31 9.588v.005c-.077-.048-.227-.07-.42-.07v4.942c.193 0 .343-.022.42-.068.078-.047.117-.22.117-.52V10.11c0-.307-.039-.475-.117-.522zm-4.376-.038c-.12 0-.18.05-.18.15v4.6c0 .1.06.15.18.15s.18-.05.18-.15V9.7c0-.1-.06-.15-.18-.15zM22 4v16H2V4h20zm-10.91 8.118c0-.614-.206-.923-.623-.923-.417 0-.623.31-.623.923v2.76c0 .614.206.922.623.922.417 0 .623-.308.623-.922v-2.76zm-2.955-2.42h1.183v5.594h-1.183v-5.594zm0 6.01h1.183v.996h-1.183v-.996zm9.68-5.942c.24.153.36.48.36.988v3.488c0 .51-.12.84-.36 1-.242.153-.692.23-1.345.23h-1.7V9.294h1.7c.653 0 1.103.074 1.345.227zm-5.81-.485V15h.943v-5.594h-.943zm-3.95.207c.152.203.228.43.228.68v3.618c0 .254-.077.48-.228.68-.153.2-.36.3-.623.3-.262 0-.47-.1-.623-.3-.152-.2-.228-.426-.228-.68V10.3c0-.25.076-.477.228-.68.152-.203.36-.305.623-.305.263 0 .47.102.623.305z" />
      </svg>
    ),
    label: "IMDb",
    color: "#F5C518",
  },
  website: {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
        />
      </svg>
    ),
    label: "Website",
    color: "#6366F1",
  },
};

export const FollowTheJourney: FC<FollowTheJourneyProps> = ({
  socials,
  primaryColor = "#FF1744",
  onEmailSignup,
  actorProfileId,
}) => {
  const logEvent = useMutation(api.analytics.logEvent);

  const socialLinks = Object.entries(socials)
    .filter(([, url]) => Boolean(url))
    .map(([key, url]) => ({
      key,
      url: url as string,
      ...SOCIAL_ICONS[key],
    }))
    .filter((s) => s.icon);

  const handleSocialClick = (platform: string, url: string) => {
    // Track in GTM
    pushGTMEvent("social_link_clicked", {
      platform,
      url,
    });

    // Track in Convex analytics
    if (actorProfileId) {
      logEvent({
        actorProfileId: actorProfileId as Id<"actor_profiles">,
        eventType: "social_link_clicked",
        sessionId: getSessionId(),
        userAgent: getUserAgent(),
        referrer: getReferrer(),
      }).catch((err) => {
        console.error("Failed to log social link click:", err);
      });
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-semibold text-white mb-2">
        Follow the Journey
      </h3>
      <p className="text-sm text-slate-400 mb-6">
        Stay connected and see what&apos;s next.
      </p>

      {/* Social Links Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {socialLinks.map((social) => (
          <a
            key={social.key}
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition hover:border-white/20 hover:bg-white/10"
            onClick={() => handleSocialClick(social.key, social.url)}
          >
            <span
              className="text-slate-400 transition group-hover:text-white"
              style={{ color: social.color }}
            >
              {social.icon}
            </span>
            <span className="text-sm text-slate-300 group-hover:text-white">
              {social.label}
            </span>
          </a>
        ))}
      </div>

      {/* Email Signup CTA */}
      {onEmailSignup && (
        <div className="border-t border-white/10 pt-6">
          <button
            type="button"
            onClick={onEmailSignup}
            className="w-full flex items-center justify-center gap-2 rounded-full border-2 py-3 text-sm font-semibold text-white transition hover:bg-white/5"
            style={{ borderColor: primaryColor }}
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
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            Get Email Updates
          </button>
        </div>
      )}
    </div>
  );
};

export default FollowTheJourney;
