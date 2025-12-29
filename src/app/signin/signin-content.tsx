"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useConvex } from "convex/react";
import { api } from "@convex/_generated/api";
import { signIn, useSession } from "@/lib/auth-client";
import { SIGN_IN_PATH } from "@/lib/routes";
import { OnboardingRightHero } from "../components/onboarding/OnboardingRightHero";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isGooglePending, setIsGooglePending] = useState(false);
  const [isPending, startTransition] = useTransition();
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
        router.push("/onboarding");
      }
    };

    void redirectAfterSignIn();
  }, [convex, isAuthenticated, next, router]);

  const handleEmailSignIn = async (event: FormEvent) => {
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
        // If successful, the useEffect will handle the redirect
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to sign in.";
        setError(message);
      }
    });
  };

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
    <div className="min-h-screen bg-[#05040A] text-slate-900 flex">
      {/* LEFT */}
      <div className="w-full lg:w-[50%] bg-white flex flex-col">
        <header className="px-8 pt-8 pb-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/black_flmlnk.png"
              alt="FLMLNK logo"
              width={120}
              height={32}
            />
          </Link>
        </header>

        <main className="flex-1 px-8 pb-10 flex items-center">
          <div className="w-full max-w-md">
            <h1 className="text-4xl md:text-[2.6rem] font-semibold leading-tight mb-3">
              Welcome Back.
              <br />
              Your Story
              <br />
              <span className="text-carpet-red-500">Awaits.</span>
            </h1>
            <p className="text-sm text-slate-500 mb-6">
              Pick up where you left off showcasing your work on professional,
              streaming-ready pages built to get your story seen.
            </p>

            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGooglePending || isPending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
              >
                <GoogleIcon />
                {isGooglePending ? "Connecting to Google…" : "Continue with Google"}
              </button>

              {!isAuthenticated && (
                <>
                  <div className="relative text-center text-xs text-slate-400">
                    <span className="absolute left-0 top-1/2 h-px w-full bg-slate-200 -z-10" />
                    <span className="relative inline-block bg-white px-3">or</span>
                  </div>

                  <form className="space-y-3" onSubmit={handleEmailSignIn}>
                    <div>
                      <input
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#f53c56] focus:ring-2 focus:ring-[#f53c56]/30 focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <input
                        type="password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#f53c56] focus:ring-2 focus:ring-[#f53c56]/30 focus:outline-none"
                        required
                      />
                    </div>
                    <div className="flex justify-end">
                      <Link
                        href="/forgot-password"
                        className="text-xs text-carpet-red-500 hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <button
                      type="submit"
                      disabled={isPending}
                      className="w-full rounded-md bg-gradient-to-r from-black via-carpet-red-600 to-carpet-red-500 py-2.5 text-sm font-medium text-white shadow-md disabled:opacity-60"
                    >
                      {isPending ? "Signing in..." : "Sign In →"}
                    </button>
                  </form>

                  <p className="text-xs text-slate-500">
                    New here?{" "}
                    <Link href="/signup" className="text-carpet-red-500 font-medium">
                      Create your page
                    </Link>
                    .
                  </p>
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* RIGHT */}
      <div className="hidden lg:flex w-[50%] bg-gradient-to-br from-[#05040A] via-[#120014] to-[#190015] items-center justify-center">
        <OnboardingRightHero />
      </div>
    </div>
  );
}
