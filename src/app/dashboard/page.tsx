"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Shield } from "lucide-react";

/**
 * Admin dashboard landing page.
 * Redirects to the admin section since this portal is for superadmins only.
 */
export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to admin section for superadmins
    router.replace("/admin/analytics");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-admin-dark">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-admin-primary-400" />
          <Loader2 className="h-6 w-6 animate-spin text-admin-primary-400" />
        </div>
        <p className="text-sm text-slate-400">Loading admin dashboard...</p>
      </div>
    </main>
  );
}
