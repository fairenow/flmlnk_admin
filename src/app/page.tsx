"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Loader2, Shield } from "lucide-react";

/**
 * Root page that redirects users based on authentication status.
 * - Authenticated users -> /dashboard
 * - Unauthenticated users -> /signin
 */
export default function HomePage() {
  const router = useRouter();
  const { data: sessionData, isPending } = useSession();

  useEffect(() => {
    if (isPending) return;

    if (sessionData?.session) {
      // User is authenticated, redirect to dashboard
      router.replace("/dashboard");
    } else {
      // User is not authenticated, redirect to sign in
      router.replace("/signin");
    }
  }, [sessionData, isPending, router]);

  // Show loading state while checking auth
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#05040A]">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-indigo-400" />
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
        </div>
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    </main>
  );
}
