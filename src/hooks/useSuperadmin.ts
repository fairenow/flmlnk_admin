"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Hook to check if the current user is a superadmin.
 * Used to conditionally show admin-only features in the dashboard.
 */
export function useSuperadmin() {
  const user = useQuery(api.users.getCurrent, {});

  return {
    isSuperadmin: user?.superadmin === true,
    isLoading: user === undefined,
    user,
  };
}
