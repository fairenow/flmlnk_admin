"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useSession } from "@/lib/auth-client";
import { api } from "@convex/_generated/api";
import { buildSignInUrl } from "@/lib/routes";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { OnboardingShell } from "../components/onboarding/OnboardingShell";

export default function OnboardingWelcomePage() {
  const router = useRouter();
  const { data: sessionData, isLoading } = useSession();
  const onboardingStatus = useQuery(api.filmmakers.getOnboardingStatus, {});

  const session = sessionData?.session;

  const openSignIn = (redirectTo?: string) => {
    const nextDestination = redirectTo ?? "/onboarding";
    router.push(buildSignInUrl({ next: nextDestination }));
  };

  const hasExistingProfile = Boolean(
    onboardingStatus?.isAuthenticated &&
      onboardingStatus.hasProfile &&
      onboardingStatus.slug,
  );

  if (isLoading) {
    return (
      <OnboardingShell currentStepId="your-info">
        <div className="mt-10 space-y-2">
          <p className="text-sm text-slate-500">Checking authentication…</p>
        </div>
      </OnboardingShell>
    );
  }

  if (!session) {
    return (
    <OnboardingShell currentStepId="your-info">
      <div className="mt-10 flex justify-center">
        <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to start</h1>
          <p className="mt-2 text-sm text-slate-600">
            Actor onboarding takes a few quick steps. Sign in to save your progress.
          </p>
            <button
              type="button"
              onClick={() => openSignIn()}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-red-600/25 transition-transform duration-200 hover:scale-[1.01] hover:bg-red-500 active:scale-95"
            >
              Sign in with Google
            </button>
          </div>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell currentStepId="your-info">
      {hasExistingProfile && onboardingStatus?.slug && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              We found your FLMLNK page at <code>/f/{onboardingStatus.slug}</code>.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              href="/dashboard/actor"
              className="inline-flex items-center justify-center rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
            >
              Go to your dashboard
            </Link>
          </CardFooter>
        </Card>
      )}
      <div className="mt-10 space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Begin onboarding</h1>
        <p className="text-sm text-slate-500 max-w-md">
          A streamlined 7-step flow to capture your essentials, then we&apos;ll auto-generate your page before the editor.
        </p>
        <button
          onClick={() => router.push("/onboarding/01-your-info")}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-red-600/25 transition-transform duration-200 hover:scale-[1.01] hover:bg-red-500 active:scale-95"
        >
          Create Project
        </button>

        <div className="text-xs text-slate-500 mt-4">
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => openSignIn(onboardingStatus?.slug ? "/dashboard/actor" : undefined)}
            className="text-[#f53c56] font-medium"
          >
            Sign in
          </button>
        </div>
      </div>
    </OnboardingShell>
  );
}
