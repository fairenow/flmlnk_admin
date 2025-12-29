"use client";

import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

// For cross-subdomain auth (e.g., admin.flmlnk.com using flmlnk.com as auth server),
// use NEXT_PUBLIC_AUTH_URL to point to the main auth server.
// Falls back to NEXT_PUBLIC_SITE_URL or current origin for single-domain setups.
const getAuthBaseURL = () => {
  // Prioritize explicit auth URL for cross-subdomain setups
  if (process.env.NEXT_PUBLIC_AUTH_URL) {
    return process.env.NEXT_PUBLIC_AUTH_URL;
  }
  // Fall back to site URL
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  // Last resort: current origin (only works for same-origin auth)
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return undefined;
};

export const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
  plugins: [convexClient()],
});

export const {
  useSession,
  signIn,
  signOut,
  signUp,
  forgetPassword,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
} = authClient;
