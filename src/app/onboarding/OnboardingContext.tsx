"use client";

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type OnboardingState = {
  slug: string;
  displayName: string;
  location?: string;
  avatarFile?: File | null;
  avatarUrl?: string;
  avatarStorageId?: string;

  filmTitle: string;
  filmStreamingUrl: string;
  filmTrailerYoutubeUrl: string;
  filmReleaseYear?: number;
  filmRoleName?: string;

  imdbUrl?: string;
  trailerUrl?: string;
  clipUrls?: string[];
  socials?: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    youtube?: string;
    imdb?: string;
  };
  featuredStreamingUrl?: string;
  websiteUrl?: string;
};

type OnboardingContextValue = {
  state: OnboardingState;
  setState: Dispatch<SetStateAction<OnboardingState>>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const initialState: OnboardingState = {
  slug: "",
  displayName: "",
  location: "",
  avatarFile: null,
  avatarUrl: "",
  avatarStorageId: "",

  filmTitle: "",
  filmStreamingUrl: "",
  filmTrailerYoutubeUrl: "",
  filmReleaseYear: undefined,
  filmRoleName: "",

  imdbUrl: "",
  trailerUrl: "",
  clipUrls: [],
  socials: {},
  featuredStreamingUrl: "",
  websiteUrl: "",
};

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(initialState);

  return (
    <OnboardingContext.Provider value={{ state, setState }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}
