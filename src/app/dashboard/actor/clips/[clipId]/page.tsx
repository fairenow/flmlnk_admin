"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { api } from "@convex/_generated/api";

/**
 * Legacy clip detail route - redirects to new user-specific dashboard path.
 *
 * Old path: /dashboard/actor/clips/[clipId]
 * New path: /dashboard/[slug]/clips/[clipId]
 */
export default function LegacyClipDetailPage() {
  const router = useRouter();
  const params = useParams();
  const clipId = params.clipId as string;

  const status = useQuery(api.filmmakers.getOnboardingStatus, {});
  const ownerSlug = status?.slug;

  // Redirect to user-specific dashboard once we have the slug
  useEffect(() => {
    if (ownerSlug && clipId) {
      router.replace(`/dashboard/${ownerSlug}/clips/${clipId}`);
    }
  }, [ownerSlug, clipId, router]);

  // Show loading state while determining where to redirect
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Redirecting...</p>
      </div>
    </div>
  );
}
