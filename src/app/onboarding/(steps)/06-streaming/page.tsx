"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { OnboardingShell } from "@/app/components/onboarding/OnboardingShell";
import { useOnboarding } from "@/app/onboarding/OnboardingContext";

export default function OnboardingStreamingPage() {
  const router = useRouter();
  const { state, setState } = useOnboarding();
  const [streamingUrl, setStreamingUrl] = useState(
    state.featuredStreamingUrl || state.filmStreamingUrl,
  );

  const inputClasses =
    "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#f53c56] focus:ring-2 focus:ring-[#f53c56]/30 focus:outline-none";
  const buttonClasses =
    "inline-flex items-center justify-center rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-red-600/25 transition-transform duration-200 hover:scale-[1.01] hover:bg-red-500 active:scale-95 disabled:opacity-60";

  useEffect(() => {
    setStreamingUrl(state.featuredStreamingUrl || state.filmStreamingUrl);
  }, [state.featuredStreamingUrl, state.filmStreamingUrl]);

  const handleContinue = () => {
    setState((prev) => ({
      ...prev,
      featuredStreamingUrl: streamingUrl.trim(),
      filmStreamingUrl: streamingUrl.trim(),
    }));
    router.push("/onboarding/07-generate");
  };

  return (
    <OnboardingShell currentStepId="streaming">
      <div className="mt-6 space-y-6 max-w-xl">
        <div>
          <p className="text-xs text-[#f53c56] font-medium mb-1">Step 6 of 7</p>
          <h1 className="text-2xl font-semibold mb-2">Where can we watch?</h1>
          <p className="text-sm text-slate-500">
            Add the streaming link you want as the primary CTA on your Flmlnk page.
          </p>
        </div>

        <div className="grid gap-4">
          <label className="space-y-1 text-sm">
            <span className="text-slate-700">Streaming URL <span className="text-slate-400 font-normal">(optional)</span></span>
            <input
              className={inputClasses}
              value={streamingUrl}
              onChange={(e) => setStreamingUrl(e.target.value)}
              placeholder="https://netflix.com/..."
            />
          </label>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/onboarding/05-socials")}
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
