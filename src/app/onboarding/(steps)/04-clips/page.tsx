"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { OnboardingShell } from "@/app/components/onboarding/OnboardingShell";
import { useOnboarding } from "@/app/onboarding/OnboardingContext";

export default function OnboardingClipsPage() {
  const router = useRouter();
  const { state, setState } = useOnboarding();
  const [clipInput, setClipInput] = useState("");
  const [clipUrls, setClipUrls] = useState<string[]>(state.clipUrls ?? []);

  const inputClasses =
    "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#f53c56] focus:ring-2 focus:ring-[#f53c56]/30 focus:outline-none";
  const buttonClasses =
    "inline-flex items-center justify-center rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-red-600/25 transition-transform duration-200 hover:scale-[1.01] hover:bg-red-500 active:scale-95 disabled:opacity-60";

  useEffect(() => {
    setClipUrls(state.clipUrls ?? []);
  }, [state.clipUrls]);

  const addClip = () => {
    const next = clipInput.trim();
    if (!next) return;
    setClipUrls((prev) => Array.from(new Set([...prev, next])));
    setClipInput("");
  };

  const removeClip = (url: string) => {
    setClipUrls((prev) => prev.filter((item) => item !== url));
  };

  const handleContinue = () => {
    setState((prev) => ({ ...prev, clipUrls }));
    router.push("/onboarding/05-socials");
  };

  return (
    <OnboardingShell currentStepId="clips">
      <div className="mt-6 space-y-6 max-w-xl">
        <div>
          <p className="text-xs text-[#f53c56] font-medium mb-1">Step 4 of 7</p>
          <h1 className="text-2xl font-semibold mb-2">Clips (optional)</h1>
          <p className="text-sm text-slate-500">
            Add YouTube clips to feature in your TikTok-style video player. These will appear in the Clips section of your Flmlnk page.
          </p>
        </div>

        <div className="grid gap-4">
          <label className="space-y-1 text-sm">
            <span className="text-slate-700">Add YouTube URL</span>
            <div className="flex gap-2">
              <input
                className={inputClasses}
                value={clipInput}
                onChange={(e) => setClipInput(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
              />
              <button
                type="button"
                onClick={addClip}
                className="rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-red-600/25 transition hover:translate-y-[-1px] hover:bg-red-500"
              >
                Add
              </button>
            </div>
            <p className="text-xs text-slate-500">Paste YouTube links one at a time. They&apos;ll appear in your swipeable clips gallery.</p>
          </label>

          {clipUrls.length > 0 && (
            <div className="rounded-md border border-slate-200 p-3 space-y-2">
              {clipUrls.map((url) => (
                <div
                  key={url}
                  className="flex items-center justify-between rounded border border-slate-100 px-3 py-2 text-xs"
                >
                  <span className="truncate pr-3 text-slate-700">{url}</span>
                  <button
                    type="button"
                    onClick={() => removeClip(url)}
                    className="text-[#f53c56] font-semibold"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/onboarding/03-trailer")}
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
