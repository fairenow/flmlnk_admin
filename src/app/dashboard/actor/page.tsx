"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { api } from "@convex/_generated/api";
import { useSession } from "@/lib/auth-client";
import { buildSignInUrl } from "@/lib/routes";

/**
 * Legacy dashboard route - redirects to new user-specific dashboard path.
 *
 * Old path: /dashboard/actor
 * New path: /dashboard/[slug] (e.g., /dashboard/john-doe)
 *
 * This page exists for backwards compatibility and redirects authenticated
 * users to their personalized dashboard URL.
 */
export default function LegacyActorDashboardPage() {
  const router = useRouter();
  const { data: sessionData, isLoading: sessionLoading } = useSession();
  const status = useQuery(api.filmmakers.getOnboardingStatus, {});

  const isAuthenticated = Boolean(sessionData?.session);
  const ownerSlug = status?.slug;

  // Redirect to sign in if not authenticated
  useEffect(() => {
    if (!sessionLoading && !isAuthenticated) {
      router.replace(buildSignInUrl({ next: "/dashboard/actor" }));
    }
  }, [sessionLoading, isAuthenticated, router]);

  // If user doesn't have a profile, redirect to onboarding
  useEffect(() => {
    if (status && !status.hasProfile) {
      router.replace("/onboarding");
    }
  }, [router, status]);

  // Redirect to user-specific dashboard once we have the slug
  useEffect(() => {
    if (ownerSlug) {
      router.replace(`/dashboard/${ownerSlug}`);
    }
  }, [ownerSlug, router]);

  // Show loading state while determining where to redirect
  return (
    <main className="flex min-h-screen items-center justify-center bg-white text-slate-700 dark:bg-flmlnk-dark dark:text-slate-200">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Redirecting to your dashboard...</p>
      </div>
    </main>
  );
}
