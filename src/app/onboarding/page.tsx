"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const { data: sessionData, isPending } = useSession();
  const isAuthenticated = Boolean(sessionData?.session);

  useEffect(() => {
    if (isPending) return;

    if (isAuthenticated) {
      // Admin users go directly to dashboard
      router.replace("/dashboard/actor");
    } else {
      // Not authenticated - go to signin
      router.replace("/signin");
    }
  }, [isAuthenticated, isPending, router]);

  return (
    <div className="min-h-screen bg-admin-dark flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-admin-primary-400 animate-spin mx-auto mb-4" />
        <p className="text-slate-400 text-sm">Redirecting...</p>
      </div>
    </div>
  );
}
