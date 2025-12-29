"use client";

import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { ReactNode, useCallback, useMemo } from "react";
import { useSession } from "@/lib/auth-client";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Convex site URL for fetching auth tokens
const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

function useAuth() {
  const { data: session, isPending } = useSession();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!session) {
        return null;
      }

      // Don't try to fetch token if we don't have the Convex site URL
      if (!CONVEX_SITE_URL) {
        console.warn("NEXT_PUBLIC_CONVEX_SITE_URL not configured");
        return null;
      }

      try {
        // Fetch token from Convex site's auth endpoint
        // The session cookie is shared across subdomains, so this should work
        const response = await fetch(`${CONVEX_SITE_URL}/auth/session`, {
          method: "GET",
          credentials: "include", // Include cookies for cross-origin request
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          console.warn("Failed to fetch Convex auth token:", response.status);
          return null;
        }

        const data = await response.json();
        return data.token ?? null;
      } catch (error) {
        console.warn("Error fetching Convex auth token:", error);
        return null;
      }
    },
    [session]
  );

  return useMemo(
    () => ({
      isLoading: isPending,
      isAuthenticated: !!session,
      fetchAccessToken,
    }),
    [isPending, session, fetchAccessToken]
  );
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
