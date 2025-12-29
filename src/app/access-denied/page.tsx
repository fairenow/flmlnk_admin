"use client";

import Link from "next/link";
import { ShieldX, ArrowLeft } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function AccessDeniedPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/signin");
  };

  return (
    <div className="min-h-screen bg-admin-dark flex items-center justify-center p-4">
      {/* Background gradient effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-admin-accent-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md text-center">
        {/* Icon */}
        <div className="flex items-center justify-center mb-8">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center">
            <ShieldX className="w-10 h-10 text-red-400" />
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-admin-card border border-white/10 rounded-2xl p-8 shadow-admin-glow">
          <h1 className="text-2xl font-bold text-white mb-4">
            Access Denied
          </h1>
          <p className="text-slate-400 mb-6">
            You don&apos;t have permission to access the FLMLNK Admin portal.
            This area is restricted to authorized administrators only.
          </p>

          <div className="space-y-3">
            <button
              onClick={handleSignOut}
              className="w-full py-3 px-4 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium rounded-lg transition-all border border-red-500/30"
            >
              Sign out and try different account
            </button>

            <Link
              href="https://flmlnk.com"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-admin-surface hover:bg-white/10 text-slate-300 font-medium rounded-lg transition-all border border-white/10"
            >
              <ArrowLeft className="w-4 h-4" />
              Go to FLMLNK main site
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6">
          If you believe this is an error, please contact your administrator.
        </p>
      </div>
    </div>
  );
}
