"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { buildSignInUrl } from "@/lib/routes";

import { OnboardingProgress } from "./OnboardingProgress";
import type { OnboardingStepId } from "@/app/onboarding/steps";

interface OnboardingShellProps {
  children: ReactNode;
  currentStepId?: OnboardingStepId;
  showBackButton?: boolean;
  onBack?: () => void;
}

export function OnboardingShell({
  children,
  currentStepId,
  showBackButton = false,
  onBack,
}: OnboardingShellProps) {
  const router = useRouter();

  const handleSignInClick = () => {
    router.push(buildSignInUrl({ next: "/onboarding" }));
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      {/* Header */}
      <header className="w-full border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <img
              src="/black_flmlnk.png"
              alt="FLMLNK logo"
              width={100}
              height={28}
            />
          </Link>
          <button
            type="button"
            onClick={handleSignInClick}
            className="text-sm font-medium text-slate-500 hover:text-[#B91C1C] transition-colors"
          >
            Sign in
          </button>
        </div>
      </header>

      {/* Progress bar */}
      <div className="w-full border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <OnboardingProgress currentStepId={currentStepId} />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 w-full">
        <div className="max-w-lg mx-auto px-6 py-8">
          {/* Back button */}
          {showBackButton && onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          )}

          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-100">
        <div className="max-w-3xl mx-auto px-6 py-4 text-xs text-slate-400 text-center">
          © {new Date().getFullYear()} FLMLNK. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
