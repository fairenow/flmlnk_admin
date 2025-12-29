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
  // Step 1: Name and URL
  slug: string;
  displayName: string;

  // Step 2: Trailer
  filmTitle: string;
  trailerYoutubeUrl: string;
  trailerFile?: File | null;
  trailerStorageId?: string;

  // Step 3: Socials
  imdbUrl?: string;
  socials?: {
    instagram?: string;
    twitter?: string;
    tiktok?: string;
    youtube?: string;
  };
};

type OnboardingContextValue = {
  state: OnboardingState;
  setState: Dispatch<SetStateAction<OnboardingState>>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const initialState: OnboardingState = {
  // Step 1
  slug: "",
  displayName: "",

  // Step 2
  filmTitle: "",
  trailerYoutubeUrl: "",
  trailerFile: null,
  trailerStorageId: "",

  // Step 3
  imdbUrl: "",
  socials: {},
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
