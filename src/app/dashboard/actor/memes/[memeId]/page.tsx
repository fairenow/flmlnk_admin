"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { api } from "@convex/_generated/api";

/**
 * Legacy meme detail route - redirects to new user-specific dashboard path.
 *
 * Old path: /dashboard/actor/memes/[memeId]
 * New path: /dashboard/[slug]/memes/[memeId]
 */
export default function LegacyMemeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const memeId = params.memeId as string;

  const status = useQuery(api.filmmakers.getOnboardingStatus, {});
  const ownerSlug = status?.slug;

  // Redirect to user-specific dashboard once we have the slug
  useEffect(() => {
    if (ownerSlug && memeId) {
      router.replace(`/dashboard/${ownerSlug}/memes/${memeId}`);
    }
  }, [ownerSlug, memeId, router]);

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
