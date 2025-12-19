"use client";

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Id } from "@convex/_generated/dataModel";

// Types for actor page data
interface ActorProfile {
  _id: Id<"actor_profiles">;
  displayName: string;
  headline?: string;
  location?: string;
  bio?: string;
  avatarUrl?: string;
  slug: string;
  socials: {
    instagram?: string;
    facebook?: string;
    youtube?: string;
    tiktok?: string;
    imdb?: string;
    website?: string;
  };
  theme: {
    primaryColor?: string;
    accentColor?: string;
    layoutVariant?: string;
  };
  genres?: string[];
}

interface FeaturedProject {
  _id: Id<"projects">;
  title: string;
  logline?: string;
  description?: string;
  posterUrl?: string;
  releaseYear?: number;
  roleName?: string;
  status?: string;
  matchScore?: number;
  ratingCategory?: string;
  formatTags?: string[];
  primaryWatchLabel?: string;
  primaryWatchUrl?: string;
}

interface Project {
  _id: Id<"projects">;
  title: string;
  logline?: string;
  posterUrl?: string;
  releaseYear?: number;
  roleName?: string;
  status?: string;
  primaryWatchUrl?: string;
  primaryWatchLabel?: string;
}

interface Clip {
  _id: Id<"clips">;
  title: string;
  youtubeUrl: string;
  description?: string;
  deepLinkId?: string;
  duration?: string;
}

interface ActorPageContextType {
  // Profile data (from Convex)
  profile: ActorProfile | null;
  featuredProject: FeaturedProject | null;
  featuredClip: Clip | null;
  projects: Project[];
  clips: Clip[];
  isOwner: boolean;

  // UI State
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  showEmailModal: boolean;
  setShowEmailModal: (show: boolean) => void;
  showContent: boolean;
  setShowContent: (show: boolean) => void;
  isFullscreenVideo: boolean;
  setIsFullscreenVideo: (fullscreen: boolean) => void;

  // Authentication (localStorage-based for email modal)
  isAuthenticated: boolean;
  userName: string;
  userEmail: string;
  setAuthUser: (name: string, email: string) => void;
  logout: () => void;
}

const ActorPageContext = createContext<ActorPageContextType | undefined>(undefined);

interface ActorPageProviderProps {
  children: ReactNode;
  profile: ActorProfile | null;
  featuredProject: FeaturedProject | null;
  featuredClip: Clip | null;
  projects: Project[];
  clips: Clip[];
  isOwner: boolean;
}

export const ActorPageProvider: React.FC<ActorPageProviderProps> = ({
  children,
  profile,
  featuredProject,
  featuredClip,
  projects,
  clips,
  isOwner,
}) => {
  // UI State
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showContent, setShowContent] = useState(true);
  const [isFullscreenVideo, setIsFullscreenVideo] = useState(false);

  // Authentication state - Load from localStorage on mount
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const auth = localStorage.getItem('flmlnk_auth');
      if (auth) {
        try {
          const parsed = JSON.parse(auth);
          return parsed.isAuthenticated || false;
        } catch {
          return false;
        }
      }
    }
    return false;
  });

  const [userName, setUserName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const auth = localStorage.getItem('flmlnk_auth');
      if (auth) {
        try {
          const parsed = JSON.parse(auth);
          return parsed.userName || '';
        } catch {
          return '';
        }
      }
    }
    return '';
  });

  const [userEmail, setUserEmail] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const auth = localStorage.getItem('flmlnk_auth');
      if (auth) {
        try {
          const parsed = JSON.parse(auth);
          return parsed.userEmail || '';
        } catch {
          return '';
        }
      }
    }
    return '';
  });

  // Set auth user and save to localStorage
  const setAuthUser = (name: string, email: string) => {
    const authData = {
      isAuthenticated: true,
      userName: name,
      userEmail: email
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem('flmlnk_auth', JSON.stringify(authData));
    }

    setIsAuthenticated(true);
    setUserName(name);
    setUserEmail(email);
  };

  // Logout and clear localStorage
  const logout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('flmlnk_auth');
    }

    setIsAuthenticated(false);
    setUserName('');
    setUserEmail('');
  };

  // Auto-show email modal after 10 seconds for non-authenticated users
  useEffect(() => {
    if (!isAuthenticated && profile) {
      const timer = setTimeout(() => {
        setShowEmailModal(true);
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, profile]);

  return (
    <ActorPageContext.Provider value={{
      profile,
      featuredProject,
      featuredClip,
      projects,
      clips,
      isOwner,
      isMuted,
      setIsMuted,
      isPlaying,
      setIsPlaying,
      showEmailModal,
      setShowEmailModal,
      showContent,
      setShowContent,
      isFullscreenVideo,
      setIsFullscreenVideo,
      isAuthenticated,
      userName,
      userEmail,
      setAuthUser,
      logout,
    }}>
      {children}
    </ActorPageContext.Provider>
  );
};

export const useActorPage = () => {
  const context = useContext(ActorPageContext);
  if (!context) {
    throw new Error('useActorPage must be used within ActorPageProvider');
  }
  return context;
};

export default ActorPageContext;
