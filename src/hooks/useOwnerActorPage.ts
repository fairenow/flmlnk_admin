"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

import { useSession } from "@/lib/auth-client";

export function useOwnerActorPage(slug?: string | null) {
  const { data: sessionData, isLoading: sessionLoading } = useSession();
  const data = useQuery(
    api.filmmakers.getOwnerEditablePage,
    slug ? { slug } : undefined,
  );

  const authenticatedUserId =
    sessionData?.session?.userId ?? sessionData?.session?.user?.id;

  const loading = sessionLoading || data === undefined;
  const isOwner = Boolean(
    data?.profile && authenticatedUserId && data.profile.userId === authenticatedUserId,
  );

  return {
    data: data ?? null,
    loading,
    isOwner,
    slug: data?.profile?.slug ?? null,
  } as const;
}
