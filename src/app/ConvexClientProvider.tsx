"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";

// Note: NEXT_PUBLIC_CONVEX_URL should point to .convex.cloud (not .convex.site)
// The .convex.site URL is only for HTTP endpoints, not the real-time WebSocket connection
const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://marvelous-bat-438.convex.cloud";

const convex = new ConvexReactClient(convexUrl, {
  // Allow queries to run without waiting for auth to resolve
  // This is required for public pages like /f/[slug] to work for unauthenticated users
  expectAuth: false,
});

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      {children}
    </ConvexBetterAuthProvider>
  );
}
