"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { OnboardingShell } from "@/app/components/onboarding/OnboardingShell";
import { useOnboarding } from "@/app/onboarding/OnboardingContext";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export default function OnboardingYourInfoPage() {
  const router = useRouter();
  const { state, setState } = useOnboarding();
  const [displayName, setDisplayName] = useState(state.displayName);
  const [slug, setSlug] = useState(state.slug);
  const [location, setLocation] = useState(state.location ?? "");
  const [selectedFile, setSelectedFile] = useState<File | null>(
    state.avatarFile ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  const inputClasses =
    "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#f53c56] focus:ring-2 focus:ring-[#f53c56]/30 focus:outline-none";
  const buttonClasses =
    "inline-flex items-center justify-center rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-red-600/25 transition-transform duration-200 hover:scale-[1.01] hover:bg-red-500 active:scale-95 disabled:opacity-60";

  useEffect(() => {
    if (!state.slug && displayName) {
      setSlug(slugify(displayName));
    }
  }, [displayName, state.slug]);

  useEffect(() => {
    setDisplayName(state.displayName);
    setSlug(state.slug);
    setLocation(state.location ?? "");
    setSelectedFile(state.avatarFile ?? null);
  }, [state.avatarFile, state.displayName, state.slug, state.location]);

  const previewImage = useMemo(() => {
    if (selectedFile) return URL.createObjectURL(selectedFile);
    if (state.avatarUrl) return state.avatarUrl;
    return "";
  }, [selectedFile, state.avatarUrl]);

  const handleContinue = async () => {
    setError(null);
    if (!displayName.trim()) {
      setError("Add your display name to continue.");
      return;
    }
    if (!slug.trim()) {
      setError("Choose a URL for your page.");
      return;
    }

    setState((prev) => ({
      ...prev,
      displayName: displayName.trim(),
      slug: slugify(slug.trim()),
      location: location.trim(),
      avatarFile: selectedFile ?? null,
      avatarUrl: selectedFile ? "" : prev.avatarUrl,
    }));

    router.push("/onboarding/02-imdb");
  };

  return (
    <OnboardingShell currentStepId="your-info">
      <div className="mt-6 space-y-6 max-w-xl">
        <div>
          <p className="text-xs text-[#f53c56] font-medium mb-1">Step 1 of 7</p>
          <h1 className="text-2xl font-semibold mb-2">Tell us about you</h1>
          <p className="text-sm text-slate-500">
            We&apos;ll create your FLMLNK page URL and use your headshot across the
            experience.
          </p>
        </div>

        <div className="grid gap-4">
          <label className="space-y-1 text-sm">
            <span className="text-slate-700">Display name</span>
            <input
              className={inputClasses}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jordan Lee"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-700">Page URL</span>
            <div className="flex items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-within:border-[#f53c56] focus-within:ring-2 focus-within:ring-[#f53c56]/30">
              <span className="text-sm text-slate-500">flmlnk.com/f/</span>
              <input
                className="flex-1 border-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="jordanlee"
              />
            </div>
            <p className="text-xs text-slate-500">We&apos;ll check availability when you submit.</p>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-700">Location (optional)</span>
            <input
              className={inputClasses}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Atlanta, GA"
            />
          </label>

          <div className="space-y-2">
            <p className="text-sm text-slate-700">Profile image</p>
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 overflow-hidden rounded-full bg-slate-100 border border-slate-200">
                {previewImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewImage}
                    alt="Profile preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-lg">🎬</div>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-[#f53c56] hover:text-[#f53c56] focus-within:border-[#f53c56] focus-within:ring-2 focus-within:ring-[#f53c56]/30">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedFile(file);
                    }
                  }}
                />
                Upload headshot
              </label>
            </div>
            <p className="text-xs text-slate-500">Works with Vercel Blob or our built-in storage.</p>
          </div>
        </div>

        {error && <p className="text-xs text-[#f53c56]">{error}</p>}

        <div className="pt-2">
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
