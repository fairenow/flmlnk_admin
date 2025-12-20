"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useConvex } from "convex/react";
import { api } from "@convex/_generated/api";
import { authClient, useSession } from "@/lib/auth-client";
import { Shield, Loader2, Mail, CheckCircle } from "lucide-react";

export function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const convex = useConvex();
  const { data: sessionData } = useSession();
  const isAuthenticated = Boolean(sessionData?.session);
  const [email, setEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const next = useMemo(() => searchParams?.get("next") ?? null, [searchParams]);

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

  const handleSendMagicLink = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      const result = await authClient.signIn.magicLink({
        email,
        callbackURL: "/signin",
      });

      if (result.error) {
        setError(result.error.message ?? "Unable to send magic link.");
        setIsPending(false);
        return;
      }

      setMagicLinkSent(true);
      setIsPending(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to send magic link.";
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

          {magicLinkSent ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="w-16 h-16 bg-admin-primary-500/20 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-admin-primary-400" />
                </div>
                <div className="text-center">
                  <h2 className="text-xl font-semibold text-white mb-2">Check your email</h2>
                  <p className="text-slate-400 text-sm">
                    We sent a magic link to<br />
                    <span className="text-white font-medium">{email}</span>
                  </p>
                </div>
              </div>

              <p className="text-center text-xs text-slate-500">
                Click the link in your email to sign in. The link expires in 10 minutes.
              </p>

              <button
                type="button"
                onClick={() => {
                  setMagicLinkSent(false);
                  setEmail("");
                }}
                className="w-full py-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSendMagicLink} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-admin-surface border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-admin-primary-500 focus:ring-2 focus:ring-admin-primary-500/20 focus:outline-none transition-all"
                    required
                    autoFocus
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isPending || !email}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-admin-primary-600 to-admin-primary-500 hover:from-admin-primary-500 hover:to-admin-primary-400 text-white font-medium rounded-lg transition-all shadow-lg shadow-admin-primary-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-5 h-5" />
                    Send Magic Link
                  </>
                )}
              </button>

              <p className="text-center text-xs text-slate-500 mt-4">
                Access restricted to authorized FLMLNK team members
              </p>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6">
          &copy; {new Date().getFullYear()} FLMLNK. Internal use only.
        </p>
      </div>
    </div>
  );
}
