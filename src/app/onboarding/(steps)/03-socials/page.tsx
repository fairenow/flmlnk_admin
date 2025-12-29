"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";

import { OnboardingShell } from "@/app/components/onboarding/OnboardingShell";
import { useOnboarding } from "@/app/onboarding/OnboardingContext";
import { api } from "../../../../../convex/_generated/api";
import FilmGenerationAnimation from "@/components/FilmGenerationAnimation";

export default function OnboardingSocialsPage() {
  const router = useRouter();
  const { state, setState } = useOnboarding();

  const [imdbUrl, setImdbUrl] = useState(state.imdbUrl ?? "");
  const [instagram, setInstagram] = useState(state.socials?.instagram ?? "");
  const [twitter, setTwitter] = useState(state.socials?.twitter ?? "");
  const [tiktok, setTiktok] = useState(state.socials?.tiktok ?? "");
  const [youtube, setYoutube] = useState(state.socials?.youtube ?? "");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store the result slug for navigation after animation
  const resultSlugRef = useRef<string | null>(null);

  const completeOnboarding = useAction(api.filmmakers.completeSimplifiedOnboarding);

  // Sync with context state
  useEffect(() => {
    setImdbUrl(state.imdbUrl ?? "");
    setInstagram(state.socials?.instagram ?? "");
    setTwitter(state.socials?.twitter ?? "");
    setTiktok(state.socials?.tiktok ?? "");
    setYoutube(state.socials?.youtube ?? "");
  }, [state.imdbUrl, state.socials]);

  const handleBack = () => {
    // Save current state before going back
    setState((prev) => ({
      ...prev,
      imdbUrl,
      socials: { instagram, twitter, tiktok, youtube },
    }));
    router.push("/onboarding/02-trailer");
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    setError(null);

    // Show the animation immediately while backend processes start
    setShowAnimation(true);

    try {
      // Save to context
      setState((prev) => ({
        ...prev,
        imdbUrl,
        socials: { instagram, twitter, tiktok, youtube },
      }));

      // Submit to backend - this triggers background processes (IMDb scraping, clip generation, Klap)
      // These run asynchronously while the animation plays
      const result = await completeOnboarding({
        displayName: state.displayName,
        slug: state.slug,
        filmTitle: state.filmTitle || "My Film",
        trailerYoutubeUrl: state.trailerYoutubeUrl || "",
        imdbUrl: imdbUrl || undefined,
        socials: {
          instagram: instagram || undefined,
          twitter: twitter || undefined,
          tiktok: tiktok || undefined,
          youtube: youtube || undefined,
        },
      });

      // Store the slug for navigation after animation completes
      resultSlugRef.current = result.slug;
    } catch (err) {
      console.error("Onboarding completion failed:", err);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setIsSubmitting(false);
      setShowAnimation(false);
    }
  };

  // Handle animation completion - navigate to editor
  const handleAnimationComplete = () => {
    const slug = resultSlugRef.current || state.slug;
    router.push(`/f/${slug}/editor`);
  };

  // Validate IMDb URL format
  const isImdbValid = !imdbUrl || imdbUrl.includes("imdb.com/name/") || imdbUrl.includes("imdb.com/title/");

  // Show the cinematic animation while processing
  // Pass the slug so the animation can wait for scraping to complete
  if (showAnimation) {
    const slugToWatch = resultSlugRef.current || state.slug;
    return <FilmGenerationAnimation onComplete={handleAnimationComplete} slug={slugToWatch} />;
  }

  return (
    <OnboardingShell currentStepId="socials" showBackButton onBack={handleBack}>
      <div className="flex flex-col">
        {/* Title */}
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">
          Connect your profiles
        </h1>
        <p className="text-slate-500 mb-8">
          Add your social handles and IMDb to complete your filmmaker profile
        </p>

        {/* Form */}
        <div className="space-y-6">
          {/* IMDb URL */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              IMDb Profile URL
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <svg className="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 3H4a1 1 0 00-1 1v16a1 1 0 001 1h16a1 1 0 001-1v-9h-3v7H5V5h8V3z" />
                  <path d="M16 3h5v5h-2V5.414l-6.293 6.293-1.414-1.414L17.586 4H15V2h5v1z" />
                </svg>
              </div>
              <input
                type="url"
                value={imdbUrl}
                onChange={(e) => setImdbUrl(e.target.value)}
                placeholder="https://www.imdb.com/name/nm..."
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/20 focus:outline-none transition-all"
              />
            </div>
            {imdbUrl && !isImdbValid && (
              <p className="mt-2 text-sm text-red-500">
                Please enter a valid IMDb profile URL
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400">
              We&apos;ll use this to import your filmography automatically
            </p>
          </div>

          {/* Social Handles */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-700">
              Social Media Handles
            </h3>

            {/* Instagram */}
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-500">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </div>
              <input
                type="text"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value.replace(/^@/, ""))}
                placeholder="username"
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/20 focus:outline-none transition-all"
              />
            </div>

            {/* Twitter/X */}
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </div>
              <input
                type="text"
                value={twitter}
                onChange={(e) => setTwitter(e.target.value.replace(/^@/, ""))}
                placeholder="username"
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/20 focus:outline-none transition-all"
              />
            </div>

            {/* TikTok */}
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
                </svg>
              </div>
              <input
                type="text"
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value.replace(/^@/, ""))}
                placeholder="username"
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/20 focus:outline-none transition-all"
              />
            </div>

            {/* YouTube */}
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-red-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </div>
              <input
                type="text"
                value={youtube}
                onChange={(e) => setYoutube(e.target.value.replace(/^@/, ""))}
                placeholder="channel name or @handle"
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/20 focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Info box */}
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-700">
              <strong>What happens next:</strong> We&apos;ll automatically generate clips from your trailer
              and import data from your IMDb profile to complete your filmmaker page.
            </p>
          </div>

          {/* Error display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Complete button */}
          <button
            type="button"
            onClick={handleComplete}
            disabled={isSubmitting || !isImdbValid}
            className="w-full py-3.5 rounded-lg bg-[#B91C1C] text-white font-medium flex items-center justify-center gap-2 hover:bg-[#991B1B] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creating your page...
              </>
            ) : (
              <>
                Complete Setup
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </OnboardingShell>
  );
}
