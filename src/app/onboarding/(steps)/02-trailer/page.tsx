"use client";

import { useEffect, useState, useMemo, ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import { OnboardingShell } from "@/app/components/onboarding/OnboardingShell";
import { useOnboarding } from "@/app/onboarding/OnboardingContext";
import { isValidYouTubeUrl, extractYouTubeVideoId } from "@/lib/youtubeClientDownload";

type InputMode = "youtube" | "upload";

export default function OnboardingTrailerPage() {
  const router = useRouter();
  const { state, setState } = useOnboarding();

  const [inputMode, setInputMode] = useState<InputMode>("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState(state.trailerYoutubeUrl);
  const [filmTitle, setFilmTitle] = useState(state.filmTitle);
  const [uploadedFile, setUploadedFile] = useState<File | null>(state.trailerFile ?? null);
  const [urlTouched, setUrlTouched] = useState(false);

  // Validate YouTube URL
  const isYoutubeValid = useMemo(() => {
    if (!youtubeUrl) return false;
    return isValidYouTubeUrl(youtubeUrl);
  }, [youtubeUrl]);

  const videoId = useMemo(() => {
    if (!isYoutubeValid) return null;
    return extractYouTubeVideoId(youtubeUrl);
  }, [youtubeUrl, isYoutubeValid]);

  // Sync with context state
  useEffect(() => {
    setYoutubeUrl(state.trailerYoutubeUrl);
    setFilmTitle(state.filmTitle);
    setUploadedFile(state.trailerFile ?? null);
  }, [state.trailerYoutubeUrl, state.filmTitle, state.trailerFile]);

  const handleUrlChange = (value: string) => {
    setUrlTouched(true);
    setYoutubeUrl(value);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setInputMode("upload");
    }
  };

  const clearFile = () => {
    setUploadedFile(null);
    setInputMode("youtube");
  };

  const canContinue = useMemo(() => {
    if (!filmTitle.trim()) return false;
    if (inputMode === "youtube") {
      return isYoutubeValid;
    }
    return uploadedFile !== null;
  }, [filmTitle, inputMode, isYoutubeValid, uploadedFile]);

  const handleContinue = () => {
    if (!canContinue) return;

    setState((prev) => ({
      ...prev,
      filmTitle: filmTitle.trim(),
      trailerYoutubeUrl: inputMode === "youtube" ? youtubeUrl.trim() : "",
      trailerFile: inputMode === "upload" ? uploadedFile : null,
    }));

    router.push("/onboarding/03-socials");
  };

  const handleBack = () => {
    router.push("/onboarding/01-url");
  };

  const handleSkip = () => {
    router.push("/onboarding/03-socials");
  };

  return (
    <OnboardingShell currentStepId="trailer" showBackButton onBack={handleBack}>
      <div className="flex flex-col">
        {/* Title */}
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">
          Upload your film or trailer
        </h1>
        <p className="text-slate-500 mb-8">
          Share your work with audiences worldwide
        </p>

        {/* Form */}
        <div className="space-y-6">
          {/* Video Content Input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Video Content
            </label>

            {/* YouTube URL Input */}
            {inputMode === "youtube" && !uploadedFile && (
              <div className="space-y-2">
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full pl-10 pr-12 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/20 focus:outline-none transition-all"
                  />
                  {urlTouched && youtubeUrl && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      {isYoutubeValid ? (
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

                {/* Upload button alternative */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:border-slate-300 cursor-pointer transition-all">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload file instead
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Validation message */}
            {urlTouched && youtubeUrl && (
              <p className={`mt-2 text-sm flex items-center gap-1.5 ${isYoutubeValid ? "text-green-600" : "text-red-500"}`}>
                {isYoutubeValid ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Valid Youtube video detected
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Please enter a valid YouTube URL
                  </>
                )}
              </p>
            )}

            {/* Uploaded file display */}
            {uploadedFile && (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#B91C1C]/10 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-[#B91C1C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 truncate max-w-[200px]">
                      {uploadedFile.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {(uploadedFile.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* YouTube Video Preview */}
          {isYoutubeValid && videoId && (
            <div className="space-y-2">
              <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title="Video preview"
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setYoutubeUrl("");
                  setUrlTouched(false);
                }}
                className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                Change video
              </button>
            </div>
          )}

          {/* Film Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Film/Project Title
            </label>
            <input
              type="text"
              value={filmTitle}
              onChange={(e) => setFilmTitle(e.target.value)}
              placeholder="My Independent Film"
              className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/20 focus:outline-none transition-all"
            />
          </div>

          {/* Synopsis (Optional) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Synopsis or director&apos;s statement{" "}
              <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              placeholder="A compelling story about..."
              rows={3}
              className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/20 focus:outline-none transition-all resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4">
            <button
              type="button"
              onClick={handleSkip}
              className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              I&apos;ll add this later
            </button>

            <button
              type="button"
              onClick={handleContinue}
              disabled={!canContinue}
              className="px-6 py-3 rounded-lg bg-[#B91C1C] text-white font-medium flex items-center gap-2 hover:bg-[#991B1B] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Continue
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}
