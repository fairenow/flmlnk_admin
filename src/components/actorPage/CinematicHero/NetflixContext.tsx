"use client";

import { createContext, useContext, useState, useCallback, type ReactNode, type FC } from "react";
import type { Id } from "@convex/_generated/dataModel";

export type HeroData = {
  videoId: string;
  title: string;
  description: string;
  year: string;
  rating: string;
  episodeCount: string;
  features: string[];
  watchCtaLabel?: string;
  watchCtaUrl?: string;
};

export type Episode = {
  id: string;
  title: string;
  thumbnail?: string;
};

export type PastProject = {
  id: string;
  title: string;
  year: string;
  role: string;
  type: 'film' | 'television' | 'theater';
  imageUrl: string;
  tubiUrl?: string;
};

export type ProfileData = {
  actor: {
    profileImage: string;
    name: string;
    bio: string[];
    philosophy: string;
  };
  pastProjects?: PastProject[];
};

export type NetflixData = {
  hero: HeroData;
  episodes: Episode[];
  profile: ProfileData;
};

type WatchProgress = Record<string, number>;

type NetflixContextValue = {
  data: NetflixData;
  updateData: (updates: Partial<NetflixData>) => void;
  editMode: boolean;
  currentEpisodeIndex: number;
  setCurrentEpisodeIndex: (index: number) => void;
  watchProgress: WatchProgress;
  updateWatchProgress: (episodeId: string, progress: number) => void;
  setShowEmailModal: (show: boolean) => void;
  setOnEmailSignupSuccess: (callback: (() => void) | null) => void;
  isAuthenticated: boolean;
  userName: string;
  userEmail: string;
  actorProfileId?: Id<"actor_profiles">;
  // Event tracking callbacks
  onWatchCtaClick?: (label: string, url: string) => void;
  onGetUpdatesClick?: () => void;
  onShareClick?: () => void;
  onVideoPlay?: () => void;
  onVideoPause?: () => void;
  onMuteToggle?: (isMuted: boolean) => void;
  onFullscreenEnter?: () => void;
};

const NetflixContext = createContext<NetflixContextValue | null>(null);

export function useNetflix(): NetflixContextValue {
  const context = useContext(NetflixContext);
  if (!context) {
    throw new Error("useNetflix must be used within a NetflixProvider");
  }
  return context;
}

type NetflixProviderProps = {
  children: ReactNode;
  videoId: string;
  title: string;
  description?: string;
  year?: string | number | null;
  rating?: string | null;
  episodeCount?: string;
  features?: string[];
  episodes?: Episode[];
  profileImage?: string;
  profileName: string;
  profileBio?: string[];
  profilePhilosophy?: string;
  pastProjects?: PastProject[];
  editMode?: boolean;
  isAuthenticated: boolean;
  userName?: string;
  userEmail?: string;
  onShowEmailModal: (show: boolean) => void;
  watchCtaLabel?: string;
  watchCtaUrl?: string;
  actorProfileId?: Id<"actor_profiles">;
  // Event tracking callbacks
  onWatchCtaClick?: (label: string, url: string) => void;
  onGetUpdatesClick?: () => void;
  onShareClick?: () => void;
  onVideoPlay?: () => void;
  onVideoPause?: () => void;
  onMuteToggle?: (isMuted: boolean) => void;
  onFullscreenEnter?: () => void;
};

export const NetflixProvider: FC<NetflixProviderProps> = ({
  children,
  videoId,
  title,
  description = "",
  year,
  rating,
  episodeCount = "1 Season",
  features = [],
  episodes = [],
  profileImage = "",
  profileName,
  profileBio = [],
  profilePhilosophy = "",
  pastProjects = [],
  editMode = false,
  isAuthenticated,
  userName = "",
  userEmail = "",
  onShowEmailModal,
  watchCtaLabel,
  watchCtaUrl,
  actorProfileId,
  // Event tracking callbacks
  onWatchCtaClick,
  onGetUpdatesClick,
  onShareClick,
  onVideoPlay,
  onVideoPause,
  onMuteToggle,
  onFullscreenEnter,
}) => {
  const [data, setData] = useState<NetflixData>({
    hero: {
      videoId,
      title,
      description,
      year: year?.toString() ?? new Date().getFullYear().toString(),
      rating: rating ?? "TV-MA",
      episodeCount,
      features,
      watchCtaLabel,
      watchCtaUrl,
    },
    episodes: episodes.length > 0 ? episodes : [{ id: videoId, title }],
    profile: {
      actor: {
        profileImage,
        name: profileName,
        bio: profileBio,
        philosophy: profilePhilosophy,
      },
      pastProjects,
    },
  });

  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);
  const [watchProgress, setWatchProgress] = useState<WatchProgress>({});
  const [_emailSignupCallback, setEmailSignupCallback] = useState<(() => void) | null>(null);

  const updateData = useCallback((updates: Partial<NetflixData>) => {
    setData((prev) => ({
      ...prev,
      ...updates,
      hero: updates.hero ? { ...prev.hero, ...updates.hero } : prev.hero,
      profile: updates.profile ? { ...prev.profile, ...updates.profile } : prev.profile,
    }));
  }, []);

  const updateWatchProgress = useCallback((episodeId: string, progress: number) => {
    setWatchProgress((prev) => ({
      ...prev,
      [episodeId]: progress,
    }));
  }, []);

  const handleSetOnEmailSignupSuccess = useCallback((callback: (() => void) | null) => {
    setEmailSignupCallback(() => callback);
  }, []);

  const value: NetflixContextValue = {
    data,
    updateData,
    editMode,
    currentEpisodeIndex,
    setCurrentEpisodeIndex,
    watchProgress,
    updateWatchProgress,
    setShowEmailModal: onShowEmailModal,
    setOnEmailSignupSuccess: handleSetOnEmailSignupSuccess,
    isAuthenticated,
    userName,
    userEmail,
    actorProfileId,
    // Event tracking callbacks
    onWatchCtaClick,
    onGetUpdatesClick,
    onShareClick,
    onVideoPlay,
    onVideoPause,
    onMuteToggle,
    onFullscreenEnter,
  };

  return (
    <NetflixContext.Provider value={value}>
      {children}
    </NetflixContext.Provider>
  );
};

export default NetflixContext;
