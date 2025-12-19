"use client";

import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

export const authClient = createAuthClient({
  // Default to the current origin so client-side auth actions like signOut
  // work even when NEXT_PUBLIC_ADMIN_SITE_URL isn't configured (e.g. local dev).
  // Prioritize ADMIN_SITE_URL for admin project, fallback to SITE_URL, then current origin
  baseURL:
    process.env.NEXT_PUBLIC_ADMIN_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : undefined),
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
