"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { OnboardingShell } from "@/app/components/onboarding/OnboardingShell";
import { useOnboarding } from "@/app/onboarding/OnboardingContext";

export default function OnboardingImdbPage() {
  const router = useRouter();
  const { state, setState } = useOnboarding();
  const [imdbUrl, setImdbUrl] = useState(state.imdbUrl ?? "");

  const inputClasses =
    "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#f53c56] focus:ring-2 focus:ring-[#f53c56]/30 focus:outline-none";
  const buttonClasses =
    "inline-flex items-center justify-center rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-red-600/25 transition-transform duration-200 hover:scale-[1.01] hover:bg-red-500 active:scale-95 disabled:opacity-60";

  useEffect(() => {
    setImdbUrl(state.imdbUrl ?? state.socials?.imdb ?? "");
  }, [state.imdbUrl, state.socials?.imdb]);

  const handleContinue = () => {
    setState((prev) => ({
      ...prev,
      imdbUrl: imdbUrl.trim(),
      socials: { ...prev.socials, imdb: imdbUrl.trim() },
    }));
    router.push("/onboarding/03-trailer");
  };

  return (
    <OnboardingShell currentStepId="imdb">
      <div className="mt-6 space-y-6 max-w-xl">
        <div>
          <p className="text-xs text-[#f53c56] font-medium mb-1">Step 2 of 7</p>
          <h1 className="text-2xl font-semibold mb-2">IMDb link</h1>
          <p className="text-sm text-slate-500">
            If you have an IMDb profile, we&apos;ll pull context from it to make the
            generated page feel personal.
          </p>
        </div>

        <div className="grid gap-4">
          <label className="space-y-1 text-sm">
            <span className="text-slate-700">IMDb URL (optional)</span>
            <input
              className={inputClasses}
              value={imdbUrl}
              onChange={(e) => setImdbUrl(e.target.value)}
              placeholder="https://www.imdb.com/name/nm0000000/"
            />
          </label>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/onboarding/01-your-info")}
            className="text-sm font-medium text-slate-500 hover:text-[#f53c56]"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={handleContinue}
            className={buttonClasses}
          >
            Continue →
          </button>
        </div>
      </div>
    </OnboardingShell>
  );
}
