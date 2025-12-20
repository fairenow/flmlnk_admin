"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useConvex } from "convex/react";
import { api } from "@convex/_generated/api";
import { signIn, useSession } from "@/lib/auth-client";
import { Shield, Mail, ArrowRight, Loader2 } from "lucide-react";

// Superadmin email - the only allowed user for this admin dashboard
const SUPERADMIN_EMAIL = "flmlnk2025@gmail.com";

export function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const convex = useConvex();
  const { data: sessionData } = useSession();
  const isAuthenticated = Boolean(sessionData?.session);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"email" | "password">("email");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  const handleEmailCheck = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (email.toLowerCase() !== SUPERADMIN_EMAIL.toLowerCase()) {
      setError("Access denied. This admin dashboard is restricted to authorized personnel only.");
      return;
    }

    setStep("password");
  };

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const result = await signIn.email({
          email,
          password,
        });

        if (result.error) {
          setError(result.error.message ?? "Unable to sign in.");
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to sign in.";
        setError(message);
      }
    });
  };

  return (
    <div className="min-h-screen bg-admin-dark flex items-center justify-center p-4">
      {/* Background gradient effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-admin-primary-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-admin-accent-500/10 rounded-full blur-3xl" />
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

          {step === "email" ? (
            <form onSubmit={handleEmailCheck} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                  Admin Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    id="email"
                    type="email"
                    placeholder="Enter your admin email"
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
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-admin-primary-600 to-admin-primary-500 hover:from-admin-primary-500 hover:to-admin-primary-400 text-white font-medium rounded-lg transition-all shadow-lg shadow-admin-primary-500/25"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="p-3 bg-admin-primary-500/10 border border-admin-primary-500/30 rounded-lg mb-4">
                <p className="text-sm text-admin-primary-300">
                  Signing in as <span className="font-medium">{email}</span>
                </p>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-admin-surface border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-admin-primary-500 focus:ring-2 focus:ring-admin-primary-500/20 focus:outline-none transition-all"
                  required
                  autoFocus
                />
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-admin-primary-600 to-admin-primary-500 hover:from-admin-primary-500 hover:to-admin-primary-400 text-white font-medium rounded-lg transition-all shadow-lg shadow-admin-primary-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setError(null);
                  setPassword("");
                }}
                className="w-full py-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
              >
                Use a different email
              </button>
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
