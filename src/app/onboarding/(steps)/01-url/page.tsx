"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";

import { OnboardingShell } from "@/app/components/onboarding/OnboardingShell";
import { useOnboarding } from "@/app/onboarding/OnboardingContext";
import { api } from "../../../../../convex/_generated/api";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export default function OnboardingUrlPage() {
  const router = useRouter();
  const { state, setState } = useOnboarding();
  const [displayName, setDisplayName] = useState(state.displayName);
  const [slug, setSlug] = useState(state.slug);
  const [slugTouched, setSlugTouched] = useState(false);

  // Check slug availability in real-time
  const slugCheck = useQuery(
    api.filmmakers.checkSlugAvailability,
    slug.length >= 3 ? { slug } : "skip"
  );

  // Auto-generate slug from display name if slug hasn't been manually edited
  useEffect(() => {
    if (!slugTouched && displayName) {
      setSlug(slugify(displayName));
    }
  }, [displayName, slugTouched]);

  // Sync with context state
  useEffect(() => {
    setDisplayName(state.displayName);
    if (state.slug) {
      setSlug(state.slug);
    }
  }, [state.displayName, state.slug]);

  const handleSlugChange = (value: string) => {
    setSlugTouched(true);
    setSlug(slugify(value));
  };

  const isSlugValid = slug.length >= 3 && slugCheck?.available === true;
  const showSlugStatus = slug.length >= 3 && slugCheck !== undefined;

  const handleContinue = () => {
    if (!displayName.trim()) return;
    if (!isSlugValid) return;

    setState((prev) => ({
      ...prev,
      displayName: displayName.trim(),
      slug: slug.trim(),
    }));

    router.push("/onboarding/02-trailer");
  };

  return (
    <OnboardingShell currentStepId="url">
      <div className="flex flex-col items-center text-center">
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

        {/* Title */}
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">
          Choose Your Filmmaker URL
        </h1>
        <p className="text-slate-500 mb-8">
          This will be your professional showcase address on FLMLNK
        </p>

        {/* Form */}
        <div className="w-full space-y-6">
          {/* Display Name */}
          <div className="text-left">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/20 focus:outline-none transition-all"
            />
          </div>

          {/* URL Input */}
          <div className="text-left">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Your URL
            </label>
            <div className="relative">
              <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden focus-within:border-[#B91C1C] focus-within:ring-2 focus-within:ring-[#B91C1C]/20 transition-all">
                <span className="pl-4 pr-1 text-slate-400 text-sm whitespace-nowrap">
                  flmlnk.com/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="username"
                  className="flex-1 px-1 py-3 bg-transparent text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
                {showSlugStatus && (
                  <span className="pr-4">
                    {slugCheck?.available ? (
                      <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </span>
                )}
              </div>
            </div>
            {/* Status message */}
            {showSlugStatus && (
              <p className={`mt-2 text-sm flex items-center gap-1.5 ${slugCheck?.available ? "text-green-600" : "text-red-500"}`}>
                {slugCheck?.available ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Username is available!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {slugCheck?.reason}
                  </>
                )}
              </p>
            )}
          </div>

          {/* URL Preview */}
          {slug && (
            <div className="bg-[#B91C1C]/5 rounded-lg p-4 text-left">
              <p className="text-sm text-slate-600 mb-1">Your URL will be:</p>
              <p className="text-[#B91C1C] font-medium">flmlnk.com/{slug}</p>
            </div>
          )}

          {/* Tips */}
          <div className="bg-slate-50 rounded-lg p-4 text-left">
            <p className="text-sm font-medium text-amber-600 mb-2 flex items-center gap-2">
              <span>Tips for choosing a username:</span>
            </p>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>• Use your real name or a professional alias</li>
              <li>• Keep it simple and memorable</li>
              <li>• Avoid numbers and special characters</li>
              <li>• Make it easy to type and share</li>
            </ul>
          </div>

          {/* Continue button */}
          <button
            type="button"
            onClick={handleContinue}
            disabled={!displayName.trim() || !isSlugValid}
            className="w-full py-3.5 rounded-lg bg-[#B91C1C] text-white font-medium flex items-center justify-center gap-2 hover:bg-[#991B1B] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Continue
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </OnboardingShell>
  );
}
