"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";

import { api } from "@convex/_generated/api";
import { useOnboarding } from "@/app/onboarding/OnboardingContext";
import FilmGenerationAnimation from "@/components/FilmGenerationAnimation";

export default function OnboardingGeneratePage() {
  const router = useRouter();
  const { state, setState } = useOnboarding();
  const assembleActorPage = useAction(api.filmmakers.generateActorPageFromOnboarding);
  const generateUploadUrl = useAction(api.files.generateUploadUrl);
  const getFileUrl = useAction(api.files.getFileUrl);

  const [error, setError] = useState<string | null>(null);
  const [animationComplete, setAnimationComplete] = useState(false);
  const generationResultRef = useRef<{ slug: string } | null>(null);
  const generationCompleteRef = useRef(false);

  // Handle animation completion - redirect if generation is also done
  const handleAnimationComplete = useCallback(() => {
    setAnimationComplete(true);
    if (generationCompleteRef.current && generationResultRef.current) {
      router.push(`/onboarding/editor?slug=${encodeURIComponent(generationResultRef.current.slug)}`);
    }
  }, [router]);

  // Run generation in background
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const streamingUrl = state.featuredStreamingUrl || state.filmStreamingUrl || "";
        const trailerUrl = state.trailerUrl || state.filmTrailerYoutubeUrl;

        if (!state.displayName || !state.slug || !state.filmTitle || !trailerUrl) {
          throw new Error("Please complete your basic info and add a trailer before continuing.");
        }

        let avatarUrl: string | undefined = state.avatarUrl || undefined;

        if (state.avatarFile && !state.avatarStorageId) {
          const blobEndpoint = process.env.NEXT_PUBLIC_BLOB_UPLOAD_URL;
          const file = state.avatarFile;
          if (blobEndpoint) {
            const body = new FormData();
            body.append("file", file);
            const response = await fetch(blobEndpoint, {
              method: "POST",
              body,
            });
            if (!response.ok) {
              throw new Error("Image upload failed");
            }
            const data = (await response.json()) as { url?: string };
            avatarUrl = data?.url;
          }

          if (!avatarUrl) {
            const { url } = await generateUploadUrl();
            const res = await fetch(url, { method: "POST", body: file });
            if (!res.ok) {
              throw new Error("Image upload failed");
            }
            const json = (await res.json()) as { storageId: string };

            // Convex upload only returns storageId, need to resolve the URL separately
            const { url: resolvedUrl } = await getFileUrl({ storageId: json.storageId });
            avatarUrl = resolvedUrl ?? undefined;

            setState((prev) => ({
              ...prev,
              avatarUrl: resolvedUrl ?? "",
              avatarStorageId: json.storageId,
            }));
          }
        }

        const socials = state.socials ?? {};

        const result = await assembleActorPage({
          displayName: state.displayName,
          slug: state.slug,
          location: state.location,
          profileImageUrl: avatarUrl,
          filmTitle: state.filmTitle,
          filmStreamingUrl: streamingUrl,
          filmTrailerYoutubeUrl: trailerUrl,
          filmReleaseYear: state.filmReleaseYear ?? undefined,
          filmRoleName: state.filmRoleName || undefined,
          imdbUrl: state.imdbUrl || socials.imdb,
          instagramHandle: socials.instagram,
          tiktokHandle: socials.tiktok,
          youtubeHandleOrUrl: socials.youtube,
          websiteUrl: state.websiteUrl,
          clipUrls: state.clipUrls && state.clipUrls.length > 0 ? state.clipUrls : undefined,
        });

        if (cancelled) return;

        // Store result and mark generation complete
        generationResultRef.current = result;
        generationCompleteRef.current = true;

        // If animation already finished, redirect now
        if (animationComplete) {
          router.push(`/onboarding/editor?slug=${encodeURIComponent(result.slug)}`);
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? "Something went wrong.");
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [
    animationComplete,
    assembleActorPage,
    generateUploadUrl,
    getFileUrl,
    router,
    setState,
    state.avatarFile,
    state.avatarStorageId,
    state.avatarUrl,
    state.clipUrls,
    state.displayName,
    state.featuredStreamingUrl,
    state.filmReleaseYear,
    state.filmRoleName,
    state.filmStreamingUrl,
    state.filmTitle,
    state.filmTrailerYoutubeUrl,
    state.imdbUrl,
    state.location,
    state.slug,
    state.socials,
    state.trailerUrl,
    state.websiteUrl,
  ]);

  // Show error state if there's an error
  if (error) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center overflow-hidden">
        <div className="text-center text-white p-8 max-w-md">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-carpet-red-900 text-carpet-red-400 text-3xl">
            !
          </div>
          <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => router.back()}
            className="px-6 py-2 bg-carpet-red-500 text-white rounded-lg hover:bg-carpet-red-600 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Show the film generation animation
  return <FilmGenerationAnimation onComplete={handleAnimationComplete} />;
}
