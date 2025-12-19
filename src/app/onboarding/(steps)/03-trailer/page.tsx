"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { OnboardingShell } from "@/app/components/onboarding/OnboardingShell";
import { useOnboarding } from "@/app/onboarding/OnboardingContext";

export default function OnboardingTrailerPage() {
  const router = useRouter();
  const { state, setState } = useOnboarding();
  const [filmTitle, setFilmTitle] = useState(state.filmTitle);
  const [trailerUrl, setTrailerUrl] = useState(
    state.trailerUrl || state.filmTrailerYoutubeUrl,
  );
  const [filmRoleName, setFilmRoleName] = useState(state.filmRoleName || "");
  const [filmReleaseYear, setFilmReleaseYear] = useState<string>(
    state.filmReleaseYear?.toString() ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  const inputClasses =
    "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#f53c56] focus:ring-2 focus:ring-[#f53c56]/30 focus:outline-none";
  const buttonClasses =
    "inline-flex items-center justify-center rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-red-600/25 transition-transform duration-200 hover:scale-[1.01] hover:bg-red-500 active:scale-95 disabled:opacity-60";

  useEffect(() => {
    setFilmTitle(state.filmTitle);
    setTrailerUrl(state.trailerUrl || state.filmTrailerYoutubeUrl);
    setFilmRoleName(state.filmRoleName || "");
    setFilmReleaseYear(state.filmReleaseYear?.toString() ?? "");
  }, [
    state.filmTitle,
    state.trailerUrl,
    state.filmTrailerYoutubeUrl,
    state.filmRoleName,
    state.filmReleaseYear,
  ]);

  const handleContinue = () => {
    setError(null);
    if (!filmTitle.trim() || !trailerUrl.trim()) {
      setError("Add your flagship title and trailer link.");
      return;
    }

    setState((prev) => ({
      ...prev,
      filmTitle: filmTitle.trim(),
      filmTrailerYoutubeUrl: trailerUrl.trim(),
      trailerUrl: trailerUrl.trim(),
      filmRoleName: filmRoleName.trim(),
      filmReleaseYear: filmReleaseYear ? Number(filmReleaseYear) : undefined,
    }));

    router.push("/onboarding/04-clips");
  };

  return (
    <OnboardingShell currentStepId="trailer">
      <div className="mt-6 space-y-6 max-w-xl">
        <div>
          <p className="text-xs text-[#f53c56] font-medium mb-1">Step 3 of 7</p>
          <h1 className="text-2xl font-semibold mb-2">Flagship trailer</h1>
          <p className="text-sm text-slate-500">
            Share the title and trailer link for the film you want featured.
          </p>
        </div>

        <div className="grid gap-4">
          <label className="space-y-1 text-sm">
            <span className="text-slate-700">Film title</span>
            <input
              className={inputClasses}
              value={filmTitle}
              onChange={(e) => setFilmTitle(e.target.value)}
              placeholder="The City God Forgot"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-700">Trailer link</span>
            <input
              className={inputClasses}
              value={trailerUrl}
              onChange={(e) => setTrailerUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">Role (optional)</span>
              <input
                className={inputClasses}
                value={filmRoleName}
                onChange={(e) => setFilmRoleName(e.target.value)}
                placeholder="Detective Jordan"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-slate-700">Release year (optional)</span>
              <input
                className={inputClasses}
                value={filmReleaseYear}
                onChange={(e) => setFilmReleaseYear(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                maxLength={4}
                placeholder="2024"
              />
            </label>
          </div>
        </div>

        {error && <p className="text-xs text-[#f53c56]">{error}</p>}

        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/onboarding/02-imdb")}
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
