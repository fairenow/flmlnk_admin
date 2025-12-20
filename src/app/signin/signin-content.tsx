"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useConvex } from "convex/react";
import { api } from "@convex/_generated/api";
import { signIn, useSession } from "@/lib/auth-client";
import { Shield, Loader2 } from "lucide-react";
import { SIGN_IN_PATH } from "@/lib/routes";

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
    <path
      fill="#EA4335"
      d="M12 10.2v3.6h5.1c-.2 1.2-.8 2.1-1.6 2.8l2.6 2c1.5-1.4 2.4-3.5 2.4-6 0-.6-.1-1.2-.2-1.8H12z"
    />
    <path
      fill="#34A853"
      d="M5.3 14.3l-.8.6-2 1.6C4 20 7.7 22 12 22c2.4 0 4.4-.8 5.9-2.4l-2.6-2c-.7.5-1.6.8-2.7.8-2.1 0-3.9-1.4-4.6-3.4z"
    />
    <path
      fill="#4A90E2"
      d="M3 7.5C2.4 8.7 2 10.1 2 11.5s.4 2.8 1 4l3.2-2.5c-.2-.5-.3-1-.3-1.5s.1-1 .3-1.5z"
    />
    <path
      fill="#FBBC05"
      d="M12 4.8c1.3 0 2.5.4 3.4 1.3l2.5-2.4C16.4 2.4 14.4 1.5 12 1.5 7.7 1.5 4 3.5 2.5 7l3.2 2.5C6.1 6.2 8 4.8 12 4.8z"
    />
    <path fill="none" d="M2 2h20v20H2z" />
  </svg>
);

export function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const convex = useConvex();
  const { data: sessionData } = useSession();
  const isAuthenticated = Boolean(sessionData?.session);
  const [isGooglePending, setIsGooglePending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = useMemo(() => searchParams?.get("next") ?? null, [searchParams]);
  const redirectQuery = useMemo(() => {
    const params = searchParams?.toString();
    return params ? `?${params}` : "";
  }, [searchParams]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const redirectAfterSignIn = async () => {
      const status = await convex.query(api.filmmakers.getOnboardingStatus, {});

      if (next) {
        router.push(next);
      } else if (status.hasProfile && status.slug) {
        router.push("/dashboard/actor");
      } else {
        router.push("/dashboard/actor");
      }
    };

    void redirectAfterSignIn();
  }, [convex, isAuthenticated, next, router]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGooglePending(true);
    try {
      await signIn.social({
        provider: "google",
        redirectTo: `${SIGN_IN_PATH}${redirectQuery}`,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to sign in with Google.";
      setError(message);
      setIsGooglePending(false);
    }
  };

  return (
    <div className="min-h-screen bg-admin-dark flex items-center justify-center p-4">
      {/* Background gradient effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-admin-primary-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-admin-accent-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Admin Badge */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex items-center gap-2 px-4 py-2 bg-admin-card border border-admin-primary-500/30 rounded-full">
            <Shield className="w-4 h-4 text-admin-primary-400" />
            <span className="text-sm font-medium text-admin-primary-300 tracking-wider">ADMIN</span>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-admin-card border border-white/10 rounded-2xl p-8 shadow-admin-glow">
          {/* Logo/Brand */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white tracking-tight">
              FLMLNK <span className="text-admin-primary-400">Admin</span>
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              Internal team dashboard
            </p>
          </div>

          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGooglePending}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white hover:bg-gray-50 text-gray-900 font-medium rounded-lg transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isGooglePending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connecting to Google...
                </>
              ) : (
                <>
                  <GoogleIcon />
                  Continue with Google
                </>
              )}
            </button>

            <p className="text-center text-xs text-slate-500 mt-4">
              Access restricted to authorized FLMLNK team members
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6">
          &copy; {new Date().getFullYear()} FLMLNK. Internal use only.
        </p>
      </div>
    </div>
  );
}
