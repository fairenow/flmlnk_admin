"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { useSession } from "@/lib/auth-client";
import { api } from "@convex/_generated/api";
import { buildSignInUrl } from "@/lib/routes";

import { OnboardingShell } from "../components/onboarding/OnboardingShell";
import { useEventTracking } from "@/hooks/useEventTracking";

export default function OnboardingWelcomePage() {
  const router = useRouter();
  const { data: sessionData, isLoading } = useSession();
  const onboardingStatus = useQuery(api.filmmakers.getOnboardingStatus, {});
  const ensureUser = useMutation(api.users.ensureFromAuth);

  const session = sessionData?.session;

  // Ensure user record exists in Convex when authenticated
  // This syncs BetterAuth session with Convex users table
  useEffect(() => {
    if (session && !isLoading) {
      ensureUser().catch((err) => {
        // User might already exist, that's fine
        console.log("ensureUser:", err.message);
      });
    }
  }, [session, isLoading, ensureUser]);

  // Event tracking
  const { trackOnboardingEvent } = useEventTracking({
    enableScrollTracking: false,
    enableTimeTracking: true,
  });

  // Track welcome page view on mount
  useEffect(() => {
    trackOnboardingEvent("step_view", 0, "welcome");
  }, [trackOnboardingEvent]);

  const openSignIn = (redirectTo?: string) => {
    const nextDestination = redirectTo ?? "/onboarding";
    router.push(buildSignInUrl({ next: nextDestination }));
  };

  const hasExistingProfile = Boolean(
    onboardingStatus?.isAuthenticated &&
      onboardingStatus.hasProfile &&
      onboardingStatus.slug,
  );

  const handleStartOnboarding = () => {
    trackOnboardingEvent("started", 0, "welcome");
    trackOnboardingEvent("step_completed", 0, "welcome");
    router.push("/onboarding/01-url");
  };

  if (isLoading) {
    return (
      <OnboardingShell currentStepId="url">
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-[#B91C1C] rounded-full animate-spin" />
          <p className="mt-4 text-sm text-slate-500">Loading...</p>
        </div>
      </OnboardingShell>
    );
  }

  if (!session) {
    return (
      <OnboardingShell currentStepId="url">
        <div className="flex flex-col items-center text-center py-8">
          {/* Icon */}
          <div className="w-16 h-16 rounded-xl bg-[#B91C1C]/10 flex items-center justify-center mb-6">
            <svg
              className="w-8 h-8 text-[#B91C1C]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-semibold text-slate-900 mb-2">
            Create Your Filmmaker Page
          </h1>
          <p className="text-slate-500 mb-8 max-w-sm">
            Set up your professional showcase in 3 simple steps. Sign in to get started.
          </p>

          <button
            type="button"
            onClick={() => openSignIn()}
            className="w-full max-w-xs py-3.5 rounded-lg bg-[#B91C1C] text-white font-medium flex items-center justify-center gap-2 hover:bg-[#991B1B] transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          <p className="mt-8 text-sm text-slate-400">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => openSignIn(onboardingStatus?.slug ? `/f/${onboardingStatus.slug}/editor` : undefined)}
              className="text-[#B91C1C] font-medium hover:underline"
            >
              Sign in
            </button>
          </p>
        </div>
      </OnboardingShell>
    );
  }

  // If authenticated, auto-redirect to first step or editor
  if (hasExistingProfile && onboardingStatus?.slug) {
    return (
      <OnboardingShell currentStepId="url">
        <div className="flex flex-col items-center text-center py-8">
          <div className="w-16 h-16 rounded-xl bg-green-100 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-semibold text-slate-900 mb-2">
            Welcome back!
          </h1>
          <p className="text-slate-500 mb-6">
            Your page is at <span className="font-medium text-slate-700">flmlnk.com/{onboardingStatus.slug}</span>
          </p>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Link
              href={`/f/${onboardingStatus.slug}/editor`}
              className="w-full py-3 rounded-lg bg-[#B91C1C] text-white font-medium text-center hover:bg-[#991B1B] transition-all"
            >
              Go to Editor
            </Link>
            <Link
              href={`/f/${onboardingStatus.slug}`}
              className="w-full py-3 rounded-lg border border-slate-200 text-slate-700 font-medium text-center hover:bg-slate-50 transition-all"
            >
              View Public Page
            </Link>
          </div>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell currentStepId="url">
      <div className="flex flex-col items-center text-center py-8">
        {/* Icon */}
        <div className="w-16 h-16 rounded-xl bg-[#B91C1C]/10 flex items-center justify-center mb-6">
          <svg
            className="w-8 h-8 text-[#B91C1C]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold text-slate-900 mb-2">
          Create Your Filmmaker Page
        </h1>
        <p className="text-slate-500 mb-8 max-w-sm">
          Set up your professional showcase in 3 simple steps
        </p>

        {/* Steps preview */}
        <div className="w-full max-w-sm space-y-3 mb-8 text-left">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
            <div className="w-8 h-8 rounded-full bg-[#B91C1C] text-white flex items-center justify-center text-sm font-medium">1</div>
            <span className="text-sm text-slate-700">Choose your URL</span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-medium">2</div>
            <span className="text-sm text-slate-700">Add your trailer</span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-medium">3</div>
            <span className="text-sm text-slate-700">Connect your profiles</span>
          </div>
        </div>

        <button
          onClick={handleStartOnboarding}
          className="w-full max-w-xs py-3.5 rounded-lg bg-[#B91C1C] text-white font-medium flex items-center justify-center gap-2 hover:bg-[#991B1B] transition-all"
        >
          Get Started
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </OnboardingShell>
  );
}
