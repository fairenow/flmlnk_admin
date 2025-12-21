"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useConvex } from "convex/react";
import { api } from "@convex/_generated/api";
import { signIn, useSession } from "@/lib/auth-client";
import { Shield, Loader2 } from "lucide-react";

export function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const convex = useConvex();
  const { data: sessionData } = useSession();
  const isAuthenticated = Boolean(sessionData?.session);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = useMemo(() => searchParams?.get("next") ?? null, [searchParams]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const redirectAfterSignIn = async () => {
      const status = await convex.query(api.filmmakers.getOnboardingStatus, {});

      if (next) {
        router.push(next);
      } else if (status.hasProfile && status.slug) {
        router.push("/dashboard");
      } else {
        router.push("/dashboard");
      }
    };

    void redirectAfterSignIn();
  }, [convex, isAuthenticated, next, router]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsPending(true);

    try {
      // Determine the callback URL - use next param or default to dashboard
      const callbackURL = next || "/dashboard";

      await signIn.social({
        provider: "google",
        callbackURL,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to sign in with Google.";
      setError(message);
      setIsPending(false);
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
              disabled={isPending}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white hover:bg-gray-50 text-gray-800 font-medium rounded-lg transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Sign in with Google
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
