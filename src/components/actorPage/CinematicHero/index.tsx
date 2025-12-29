"use client";

import type { FC } from "react";
import { NetflixProvider } from "./NetflixContext";
import NetflixHero from "./NetflixHero";
import { extractYouTubeId } from "@/utils/youtubeApi";

// Re-export new components for external use
export { default as NetflixGrid } from "./NetflixGrid";
export { default as NetflixMoreLikeThis } from "./NetflixMoreLikeThis";
export { useNetflix, type PastProject } from "./NetflixContext";

type Theme = {
  primaryColor?: string;
  accentColor?: string;
  layoutVariant?: string;
};

type FeaturedProject = {
  title: string;
  logline?: string;
  description?: string;
  releaseYear?: number | null;
  status?: string | null;
  matchScore?: number | null;
  ratingCategory?: string | null;
  formatTags?: string[];
  primaryWatchLabel?: string;
  primaryWatchUrl?: string;
};

type CinematicHeroProps = {
  displayName: string;
  avatarUrl?: string;
  slug: string;
  theme: Theme;
  featuredProject?: FeaturedProject | null;
  featuredClipUrl?: string;
  posterUrl?: string;
  onShare?: () => void;
  isAuthenticated?: boolean;
  onShowEmailModal?: (show: boolean) => void;
  actorProfileId?: string;
};

export const CinematicHero: FC<CinematicHeroProps> = ({
  displayName,
  avatarUrl,
  slug,
  theme: _theme,
  featuredProject,
  featuredClipUrl,
  posterUrl: _posterUrl,
  onShare: _onShare,
  isAuthenticated = false,
  onShowEmailModal = () => {},
  actorProfileId,
}) => {
  // Extract video ID from YouTube URL
  const videoId = featuredClipUrl ? extractYouTubeId(featuredClipUrl) : null;

  // Get movie/project info for display
  const title = featuredProject?.title ?? displayName;
  const description = featuredProject?.logline ?? featuredProject?.description ?? "";

  // Build features array from project data
  const features: string[] = [];
  if (featuredProject?.formatTags) {
    features.push(...featuredProject.formatTags.slice(0, 4));
  }
  if (featuredProject?.status) {
    features.push(featuredProject.status);
  }

  // If no video ID, show a fallback
  if (!videoId) {
    return (
      <section className="relative h-screen min-h-[600px] w-full overflow-hidden bg-black flex items-center justify-center">
        <div className="text-center text-white/60">
          <p className="text-lg">No featured video available</p>
        </div>
      </section>
    );
  }

  return (
    <NetflixProvider
      videoId={videoId}
      title={title}
      description={description}
      year={featuredProject?.releaseYear}
      rating={featuredProject?.ratingCategory}
      episodeCount={featuredProject?.status ?? "Feature Film"}
      features={features}
      profileImage={avatarUrl}
      profileName={displayName}
      editMode={false}
      isAuthenticated={isAuthenticated}
      onShowEmailModal={onShowEmailModal}
      watchCtaLabel={featuredProject?.primaryWatchLabel}
      watchCtaUrl={featuredProject?.primaryWatchUrl}
      actorProfileId={actorProfileId}
      slug={slug}
    >
      <NetflixHero />
    </NetflixProvider>
  );
};

export default CinematicHero;
