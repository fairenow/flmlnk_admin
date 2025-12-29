"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Shield } from "lucide-react";

/**
 * Dashboard landing page - redirects to the admin's profile dashboard.
 */
export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the superadmin's dashboard
    router.replace("/dashboard/flmlnk");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-admin-dark">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-admin-primary-400" />
          <Loader2 className="h-6 w-6 animate-spin text-admin-primary-400" />
        </div>
        <p className="text-sm text-slate-400">Loading dashboard...</p>
      </div>
    </main>
  );
}
