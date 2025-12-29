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
 * 1. If the user is authenticated (has a valid session from flmlnk.com)
 * 2. If the user has superadmin privileges (checked by email)
 *
 * Redirects to:
 * - /signin if not authenticated
 * - /access-denied if authenticated but not a superadmin
 */
export function AdminAuthGuard({ children }: AdminAuthGuardProps) {
  const router = useRouter();
  const { data: sessionData, isPending: sessionLoading } = useSession();
  const isAuthenticated = Boolean(sessionData?.session);
  const userEmail = sessionData?.user?.email;

  // Check superadmin status by email (works without Convex auth context)
  const superadminCheck = useQuery(
    api.users.checkSuperadminByEmail,
    userEmail ? { email: userEmail } : "skip"
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

    // Authenticated but no email in session
    if (!userEmail) {
      router.replace("/signin");
      return;
    }

    // Wait for superadmin check to complete
    if (superadminCheck === undefined) return;

    // User not found in database
    if (!superadminCheck.found) {
      router.replace("/access-denied");
      return;
    }

    // Check superadmin status
    if (!superadminCheck.superadmin) {
      router.replace("/access-denied");
      return;
    }

    // All checks passed - allow access
    setIsChecking(false);
  }, [sessionLoading, isAuthenticated, userEmail, superadminCheck, router]);

  // Show loading state while checking auth
  if (isChecking || sessionLoading || (isAuthenticated && superadminCheck === undefined)) {
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
