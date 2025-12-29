"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { buildSignInUrl } from "@/lib/routes";

import { OnboardingProgress } from "./OnboardingProgress";
import { OnboardingRightHero } from "./OnboardingRightHero";
import type { OnboardingStepId } from "@/app/onboarding/steps";

interface OnboardingShellProps {
  children: ReactNode;
  currentStepId?: OnboardingStepId;
}

export function OnboardingShell({ children, currentStepId }: OnboardingShellProps) {
  const router = useRouter();

  const handleSignInClick = () => {
    router.push(buildSignInUrl({ next: "/onboarding" }));
  };

  return (
    <div className="min-h-screen bg-[#05040A] text-slate-900 flex">
      {/* LEFT SIDE */}
      <div className="w-full lg:w-[50%] bg-white flex flex-col">
        <header className="px-8 pt-8 pb-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <img
              src="/black_flmlnk.png"
              alt="FLMLNK logo"
              width={120}
              height={32}
            />
          </Link>
          <button
            type="button"
            onClick={handleSignInClick}
            className="text-sm font-medium text-slate-600 hover:text-[#f53c56]"
          >
            Sign in
          </button>
        </header>

        <main className="flex-1 flex flex-col px-8 pb-10 max-w-xl">
          <div className="mb-6 hidden md:block">
            <OnboardingProgress currentStepId={currentStepId} />
          </div>
          {children}
        </main>

        <footer className="px-8 py-6 text-xs text-slate-400">
          © {new Date().getFullYear()} FLMLNK. All rights reserved.
        </footer>
      </div>

      {/* RIGHT SIDE */}
      <div className="hidden lg:flex w-[50%] bg-gradient-to-br from-[#05040A] via-[#120014] to-[#190015] items-center justify-center">
        <OnboardingRightHero />
      </div>
    </div>
  );
}
