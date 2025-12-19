"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { OnboardingShell } from "@/app/components/onboarding/OnboardingShell";
import { useOnboarding } from "@/app/onboarding/OnboardingContext";

const normalizeHandle = (value: string) => value.replace(/^@+/, "").trim();

export default function OnboardingSocialsPage() {
  const router = useRouter();
  const { state, setState } = useOnboarding();
  const [instagram, setInstagram] = useState(state.socials?.instagram ?? "");
  const [facebook, setFacebook] = useState(state.socials?.facebook ?? "");
  const [tiktok, setTiktok] = useState(state.socials?.tiktok ?? "");
  const [youtube, setYoutube] = useState(state.socials?.youtube ?? "");
  const [imdb, setImdb] = useState(state.socials?.imdb ?? state.imdbUrl ?? "");

  const inputClasses =
    "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#f53c56] focus:ring-2 focus:ring-[#f53c56]/30 focus:outline-none";
  const inputRowClasses =
    "flex items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-within:border-[#f53c56] focus-within:ring-2 focus-within:ring-[#f53c56]/30";
  const buttonClasses =
    "inline-flex items-center justify-center rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-red-600/25 transition-transform duration-200 hover:scale-[1.01] hover:bg-red-500 active:scale-95 disabled:opacity-60";

  useEffect(() => {
    setInstagram(state.socials?.instagram ?? "");
    setFacebook(state.socials?.facebook ?? "");
    setTiktok(state.socials?.tiktok ?? "");
    setYoutube(state.socials?.youtube ?? "");
    setImdb(state.socials?.imdb ?? state.imdbUrl ?? "");
  }, [state.socials, state.imdbUrl]);

  const handleContinue = () => {
    const socials = {
      instagram: normalizeHandle(instagram),
      facebook: normalizeHandle(facebook),
      tiktok: normalizeHandle(tiktok),
      youtube: normalizeHandle(youtube),
      imdb: imdb.trim(),
    };

    setState((prev) => ({
      ...prev,
      socials,
      imdbUrl: socials.imdb,
    }));

    router.push("/onboarding/06-streaming");
  };

  return (
    <OnboardingShell currentStepId="socials">
      <div className="mt-6 space-y-6 max-w-xl">
        <div>
          <p className="text-xs text-[#f53c56] font-medium mb-1">Step 5 of 7</p>
          <h1 className="text-2xl font-semibold mb-2">Social links</h1>
          <p className="text-sm text-slate-500">
            Handles auto-generate into URLs, so feel free to drop them without prefixes.
          </p>
        </div>

        <div className="grid gap-4">
          <label className="space-y-1 text-sm">
            <span className="text-slate-700">Instagram</span>
            <div className={inputRowClasses}>
              <span className="text-sm text-slate-500">instagram.com/</span>
              <input
                className="flex-1 border-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="jordanlee"
              />
            </div>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-700">Facebook</span>
            <div className={inputRowClasses}>
              <span className="text-sm text-slate-500">facebook.com/</span>
              <input
                className="flex-1 border-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                placeholder="jordan.lee"
              />
            </div>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-700">TikTok</span>
            <div className={inputRowClasses}>
              <span className="text-sm text-slate-500">tiktok.com/@</span>
              <input
                className="flex-1 border-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value)}
                placeholder="jordanlee"
              />
            </div>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-700">YouTube</span>
            <div className={inputRowClasses}>
              <span className="text-sm text-slate-500">youtube.com/@</span>
              <input
                className="flex-1 border-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                value={youtube}
                onChange={(e) => setYoutube(e.target.value)}
                placeholder="jordanlee"
              />
            </div>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-700">IMDb link</span>
            <input
              className={inputClasses}
              value={imdb}
              onChange={(e) => setImdb(e.target.value)}
              placeholder="https://www.imdb.com/name/nm0000000/"
            />
          </label>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/onboarding/04-clips")}
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
