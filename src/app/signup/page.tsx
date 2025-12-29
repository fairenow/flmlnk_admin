"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState, useTransition } from "react";
import { useMutation } from "convex/react";
import { signIn, signUp, sendVerificationEmail } from "@/lib/auth-client";
import { api } from "@convex/_generated/api";
import { buildSignInUrl } from "@/lib/routes";
import { OnboardingRightHero } from "../components/onboarding/OnboardingRightHero";
import { useEventTracking } from "@/hooks/useEventTracking";

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

export default function SignupPage() {
  const _router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isGooglePending, setIsGooglePending] = useState(false);
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [formStarted, setFormStarted] = useState(false);
  const _ensureUser = useMutation(api.users.ensureFromAuth);

  // Event tracking
  const { trackAuthEvent } = useEventTracking({
    enableScrollTracking: true,
    enableTimeTracking: true,
  });

  // Track page view on mount
  useEffect(() => {
    trackAuthEvent("signup_page_view");
  }, [trackAuthEvent]);

  // Track form field focus
  const handleFormFieldFocus = useCallback(() => {
    if (!formStarted) {
      setFormStarted(true);
      trackAuthEvent("signup_form_started", "email");
    }
  }, [formStarted, trackAuthEvent]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    trackAuthEvent("signup_form_submitted", "email");

    if (!acceptedTerms) {
      setError("Please accept the terms to continue.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await signUp.email({
          email,
          password,
          name: email.split("@")[0],
        });

        if (result.error) {
          setError(result.error.message ?? "Unable to create account.");
          return;
        }

        // Show verification message instead of redirecting
        trackAuthEvent("signup_email_sent", "email");
        setShowVerificationMessage(true);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to create account.";
        setError(message);
      }
    });
  };

  const handleResendVerification = async () => {
    setIsResending(true);
    try {
      await sendVerificationEmail({
        email,
      });
    } catch {
      // Silently fail - the email might already be sent
    } finally {
      setIsResending(false);
    }
  };

  const handleGoogleSignIn = async () => {
    trackAuthEvent("signup_google_clicked", "google");
    setError(null);
    setIsGooglePending(true);
    try {
      await signIn.social({
        provider: "google",
        redirectTo: "/onboarding",
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
      <div className="w-full lg:w-[50%] bg-white flex flex-col [color-scheme:light]">
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
              Your Film.
              <br />
              Front and Center.
              <br />
              <span className="text-carpet-red-500">Always.</span>
            </h1>
            <p className="text-sm text-slate-500 mb-6">
              Join thousands of creators showcasing their work on professional,
              streaming-ready pages built to get your story seen.
            </p>

            {showVerificationMessage ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-md p-4">
                  <div className="flex items-start gap-3">
                    <svg
                      className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    <div>
                      <p className="text-green-800 text-sm font-medium">
                        Check your email!
                      </p>
                      <p className="text-green-700 text-sm mt-1">
                        We&apos;ve sent a verification link to <strong>{email}</strong>.
                        Click the link to verify your email and complete your registration.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
                  <p className="text-slate-600 text-xs">
                    Didn&apos;t receive the email? Check your spam folder or{" "}
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={isResending}
                      className="text-carpet-red-500 font-medium hover:underline disabled:opacity-50"
                    >
                      {isResending ? "Sending..." : "resend verification email"}
                    </button>
                    .
                  </p>
                </div>

                <p className="text-xs text-slate-500">
                  Wrong email?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setShowVerificationMessage(false);
                      setEmail("");
                      setPassword("");
                    }}
                    className="text-carpet-red-500 font-medium hover:underline"
                  >
                    Try again
                  </button>
                </p>
              </div>
            ) : (
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

                <div className="relative text-center text-xs text-slate-400">
                  <span className="absolute left-0 top-1/2 h-px w-full bg-slate-200 -z-10" />
                  <span className="relative inline-block bg-white px-3">or</span>
                </div>

                <form className="space-y-3" onSubmit={handleSubmit}>
                  <div>
                    <input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={handleFormFieldFocus}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-carpet-red-500 focus:ring-1 focus:ring-carpet-red-500"
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="password"
                      placeholder="Create a password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={handleFormFieldFocus}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-carpet-red-500 focus:ring-1 focus:ring-carpet-red-500"
                      required
                    />
                  </div>
                  <label className="flex items-start gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-[2px] h-3.5 w-3.5 rounded border-slate-300 bg-white text-carpet-red-500"
                    />
                    <span>
                      I agree to FLMLNK&apos;s{" "}
                      <Link href="/terms" className="underline hover:text-carpet-red-500">
                        Terms of Service
                      </Link>{" "}
                      and{" "}
                      <Link href="/privacy" className="underline hover:text-carpet-red-500">
                        Privacy Policy
                      </Link>
                      .
                    </span>
                  </label>
                  {error && <p className="text-xs text-red-500">{error}</p>}

                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full rounded-md bg-gradient-to-r from-black via-carpet-red-600 to-carpet-red-500 py-2.5 text-sm font-medium text-white shadow-md disabled:opacity-60"
                  >
                    {isPending ? "Creating your account..." : "Create my free account →"}
                  </button>
                </form>

                <p className="text-xs text-slate-500 mt-2">
                  Already have an account?{" "}
                  <Link href={buildSignInUrl()} className="text-carpet-red-500 font-medium">
                    Sign in
                  </Link>
                </p>
              </div>
            )}
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
