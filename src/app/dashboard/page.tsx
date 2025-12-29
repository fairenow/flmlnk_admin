"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2, Shield } from "lucide-react";

import { api } from "@convex/_generated/api";

/**
 * Main admin dashboard landing page.
 *
 * Redirects authenticated superadmins to their personalized dashboard URL
 * based on their filmmaker profile slug.
 *
 * Note: AdminAuthGuard in the layout already ensures the user is:
 * 1. Authenticated
 * 2. A superadmin
 */
export default function DashboardPage() {
  const router = useRouter();
  const status = useQuery(api.filmmakers.getOnboardingStatus, {});
  const ownerSlug = status?.slug;

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
    <main className="flex min-h-screen items-center justify-center bg-admin-dark">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-admin-primary-400" />
          <Loader2 className="h-6 w-6 animate-spin text-admin-primary-400" />
        </div>
        <p className="text-sm text-slate-400">Loading your dashboard...</p>
      </div>
    </main>
  );
}
