"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useSession } from "@/lib/auth-client";
import { Loader2, Shield } from "lucide-react";

interface AdminAuthGuardProps {
  children: React.ReactNode;
}

/**
 * AdminAuthGuard protects routes that require superadmin access.
 *
 * It checks:
 * 1. If the user is authenticated (has a valid session)
 * 2. If the user has superadmin privileges
 *
 * Redirects to:
 * - /signin if not authenticated
 * - /access-denied if authenticated but not a superadmin
 */
export function AdminAuthGuard({ children }: AdminAuthGuardProps) {
  const router = useRouter();
  const { data: sessionData, isPending: sessionLoading } = useSession();
  const isAuthenticated = Boolean(sessionData?.session);

  // Only fetch user when authenticated
  const user = useQuery(
    api.users.getCurrent,
    isAuthenticated ? {} : "skip"
  );

  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Wait for session to load
    if (sessionLoading) return;

    // Not authenticated - redirect to sign in
    if (!isAuthenticated) {
      router.replace("/signin?next=" + encodeURIComponent(window.location.pathname));
      return;
    }

    // Authenticated - wait for user data to load
    if (user === undefined) return;

    // User data loaded but no user found in database
    if (user === null) {
      router.replace("/signin");
      return;
    }

    // Check superadmin status
    if (!user.superadmin) {
      router.replace("/access-denied");
      return;
    }

    // All checks passed - allow access
    setIsChecking(false);
  }, [sessionLoading, isAuthenticated, user, router]);

  // Show loading state while checking auth
  if (isChecking || sessionLoading || (isAuthenticated && user === undefined)) {
    return (
      <div className="min-h-screen bg-admin-dark flex items-center justify-center">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="w-8 h-8 text-admin-primary-400 animate-pulse" />
            <Loader2 className="w-6 h-6 text-admin-primary-400 animate-spin" />
          </div>
          <p className="text-slate-400 text-sm">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
