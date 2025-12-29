"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useParams, useSearchParams, useRouter } from "next/navigation";

import { useSession } from "@/lib/auth-client";
import { injectGTMForSlug, pushGTMEvent } from "@/lib/gtm";
import { buildSignInUrl } from "@/lib/routes";

import {
  Hero,
  CinematicHero,
  AboutSection,
  FilmographySlider,
  GeneratedClipsGallery,
  YouTubeReelsPlayer,
  FanEmailModal,
  ContactSection,
  Footer,
  TabNavigation,
  CommentsSection,
  type TabKey,
} from "@/components/actorPage";

export default function FilmmakerPublicPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.slug;
  const clipParam = searchParams.get("clip");
  const tabParam = searchParams.get("tab") as TabKey | null;

  const data = useQuery(api.filmmakers.getPublicBySlug, { slug });
  const publicGeneratedClips = useQuery(api.clipGenerator.getPublicGeneratedClips, { slug });
  const commentCount = useQuery(
    api.comments.getCount,
    data?.profile?._id ? { actorProfileId: data.profile._id } : "skip"
  );
  const { data: sessionData } = useSession();

  // Fetch public processing clips (uploaded clips) with signed URLs
  const getPublicProcessingClips = useAction(api.processing.getPublicProcessingClipsWithUrls);
  const [publicProcessingClips, setPublicProcessingClips] = useState<Array<{
    _id: string;
    title?: string;
    description?: string;
    duration: number;
    score?: number;
    clipUrl: string | null;
    thumbUrl: string | null;
    customThumbnailUrl?: string;
    createdAt: number;
  }>>([]);
  const [processingClipsLoaded, setProcessingClipsLoaded] = useState(false);

  // Fetch processing clips on mount
  useEffect(() => {
    if (slug && !processingClipsLoaded) {
      getPublicProcessingClips({ slug, expiresIn: 3600 })
        .then((result) => {
          if (!result.error && result.clips) {
            setPublicProcessingClips(result.clips);
          }
          setProcessingClipsLoaded(true);
        })
        .catch((err) => {
          console.error("Failed to fetch public processing clips:", err);
          setProcessingClipsLoaded(true);
        });
    }
  }, [slug, getPublicProcessingClips, processingClipsLoaded]);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(tabParam || "about");
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | null>(null);

  // Sync tab with URL
  useEffect(() => {
    if (tabParam && ["about", "comments", "films", "clips", "contact"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // Update URL when tab changes
  const handleTabChange = useCallback(
    (tab: TabKey) => {
      setActiveTab(tab);
      const newParams = new URLSearchParams(searchParams.toString());
      if (tab === "about") {
        newParams.delete("tab");
      } else {
        newParams.set("tab", tab);
      }
      const newUrl = newParams.toString()
        ? `/f/${slug}?${newParams.toString()}`
        : `/f/${slug}`;
      router.push(newUrl, { scroll: false });
      pushGTMEvent("tab_change", { slug, tab });
    },
    [searchParams, slug, router]
  );

  // Inject GTM and track page view
  useEffect(() => {
    injectGTMForSlug(slug);
    pushGTMEvent("page_view", { slug });
  }, [slug]);

  // Handle clip deep link
  useEffect(() => {
    if (clipParam && data?.clips) {
      setActiveTab("clips");
      setTimeout(() => {
        const clipsSection = document.getElementById("clips-gallery");
        if (clipsSection) {
          clipsSection.scrollIntoView({ behavior: "smooth" });
        }
      }, 100);
    }
  }, [clipParam, data?.clips]);

  const handleConnectClick = useCallback(() => {
    setShowEmailModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowEmailModal(false);
  }, []);

  const handleClipShare = useCallback(() => {
    pushGTMEvent("clip_share", {
      slug,
      clipId: data?.featuredClip?._id,
      clipTitle: data?.featuredClip?.title,
    });
  }, [slug, data?.featuredClip]);

  const handleGalleryClipShare = useCallback(
    (clipId: string) => {
      const clip = data?.clips.find((c: Doc<"clips">) => c._id === clipId);
      pushGTMEvent("clip_share", {
        slug,
        clipId,
        clipTitle: clip?.title,
      });
    },
    [slug, data?.clips]
  );

  // Compute active project and clip based on selection
  // NOTE: This useMemo must be called before any early returns to satisfy React's Rules of Hooks
  const activeHeroData = useMemo(() => {
    // Return null values if data is not available yet
    if (!data) {
      return { project: null, clip: null, trailerUrl: null };
    }
    const { projects, clips, featuredProject, featuredClip } = data;
    // If a project is selected, find it and its trailer
    if (selectedProjectId) {
      const selectedProject = projects.find((p: any) => p._id === selectedProjectId);
      if (selectedProject) {
        // Find a clip that belongs to this project
        const projectClip = clips.find((c: Doc<"clips">) => c.projectId === selectedProjectId);
        return {
          project: selectedProject,
          clip: projectClip || null,
          // Use project's trailerUrl as fallback if no clip exists
          trailerUrl: selectedProject.trailerUrl || null,
        };
      }
    }
    // Default to featured project with its associated clip for autoplay
    // First, try to find a clip that belongs to the featured project
    let clipForHero = null;
    if (featuredProject) {
      // Look for a featured clip that belongs to the featured project
      const projectFeaturedClip = clips.find(
        (c: Doc<"clips">) => c.projectId === featuredProject._id && c.isFeatured
      );
      if (projectFeaturedClip) {
        clipForHero = projectFeaturedClip;
      } else {
        // Fall back to any clip from the featured project
        const anyProjectClip = clips.find(
          (c: Doc<"clips">) => c.projectId === featuredProject._id
        );
        if (anyProjectClip) {
          clipForHero = anyProjectClip;
        }
      }
    }
    // If no clip found for the featured project, use the general featured clip
    if (!clipForHero) {
      clipForHero = featuredClip;
    }
    return {
      project: featuredProject,
      clip: clipForHero,
      // Use featured project's trailerUrl as fallback if no clip exists
      trailerUrl: featuredProject?.trailerUrl || null,
    };
  }, [selectedProjectId, data]);

  // Handler for selecting a project from the Films tab
  // NOTE: This useCallback must be called before any early returns to satisfy React's Rules of Hooks
  const handleSelectProject = useCallback((projectId: Id<"projects">) => {
    setSelectedProjectId(projectId);
    // Scroll to top to see the hero with the new trailer
    window.scrollTo({ top: 0, behavior: "smooth" });
    pushGTMEvent("select_project_trailer", { slug, projectId });
  }, [slug]);

  if (data === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </main>
    );
  }

  if (data === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Page not found</h1>
          <p className="text-sm text-gray-400">
            We couldn&apos;t find a page at{" "}
            <span className="font-mono">{slug}</span>.
          </p>
        </div>
      </main>
    );
  }

  const { profile, projects, clips, isOwner, ownerName, ownerEmail: profileOwnerEmail } = data;
  const isAuthenticated = Boolean(sessionData?.session);
  const ownerDisplayName = ownerName ?? profile.displayName;
  const ownerEmail = profileOwnerEmail ?? sessionData?.session?.user?.email ?? sessionData?.user?.email ?? null;

  const watchCtaLabel = activeHeroData.project?.primaryWatchLabel ?? "Watch Now";
  const watchCtaUrl =
    activeHeroData.project?.primaryWatchUrl ?? activeHeroData.clip?.youtubeUrl ?? "";

  // Determine if we should use cinematic layout
  const layoutVariant = profile.theme.layoutVariant ?? "actor-default";
  const useCinematicLayout = layoutVariant === "cinematic";

  // Prepare notable projects from projects for the About section
  // Use resolvedPosterUrl which includes uploaded images from storage
  const notableProjects = projects.map((p: any) => ({
    _id: p._id,
    title: p.title,
    posterUrl: p.resolvedPosterUrl || p.posterUrl,
    platformUrl: p.primaryWatchUrl,
    releaseYear: p.releaseYear,
    roleName: p.roleName,
    type: 'film' as const,
  }));

  // Render content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "about":
        return (
          <AboutSection
            displayName={profile.displayName}
            avatarUrl={profile.avatarUrl}
            bio={profile.bio}
            location={profile.location}
            socials={profile.socials}
            primaryColor={profile.theme.primaryColor}
            genres={profile.genres}
            notableProjects={notableProjects}
          />
        );

      case "comments":
        return (
          <CommentsSection
            actorProfileId={profile._id}
            actorName={profile.displayName}
            primaryColor={profile.theme.primaryColor}
            isOwner={isOwner}
            ownerName={ownerDisplayName}
            ownerEmail={ownerEmail}
          />
        );

      case "films":
        return (
          <FilmographySlider
            projects={projects}
            clips={clips}
            primaryColor={profile.theme.primaryColor}
            selectedProjectId={selectedProjectId}
            onSelectProject={handleSelectProject}
          />
        );

      case "clips":
        return (
          <div id="clips-gallery">
            <YouTubeReelsPlayer
              clips={clips}
              slug={slug}
              featuredClipId={data.featuredClip?._id}
              primaryColor={profile.theme.primaryColor}
              onClipShare={handleGalleryClipShare}
            />
            {/* AI Generated & Uploaded Clips Section */}
            {((publicGeneratedClips && publicGeneratedClips.length > 0) || publicProcessingClips.length > 0) && (
              <GeneratedClipsGallery
                clips={publicGeneratedClips || []}
                processingClips={publicProcessingClips}
                slug={slug}
                primaryColor={profile.theme.primaryColor}
              />
            )}
          </div>
        );

      case "contact":
        return (
          <ContactSection
            displayName={profile.displayName}
            socials={profile.socials}
            actorProfileId={profile._id}
            primaryColor={profile.theme.primaryColor}
            onConnectClick={handleConnectClick}
          />
        );

      default:
        return null;
    }
  };

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Owner/Auth controls */}
      {!isOwner && !isAuthenticated ? (
        <div className="fixed bottom-6 right-6 z-50">
          <Link
            href={buildSignInUrl({ fromSlug: slug, next: "/dashboard/actor" })}
            className="rounded-full border border-white/10 bg-black/60 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-black/40 backdrop-blur hover:border-white/30 transition"
          >
            Sign in to edit
          </Link>
        </div>
      ) : null}

      {/* Hero Section - Cinematic or Standard */}
      {useCinematicLayout ? (
        <CinematicHero
          key={selectedProjectId || "default"} // Force re-mount when project changes
          displayName={profile.displayName}
          avatarUrl={profile.avatarUrl}
          slug={slug}
          theme={profile.theme}
          featuredProject={
            activeHeroData.project
              ? {
                  title: activeHeroData.project.title,
                  logline: activeHeroData.project.logline,
                  description: activeHeroData.project.description,
                  releaseYear: activeHeroData.project.releaseYear,
                  status: activeHeroData.project.status,
                  matchScore: activeHeroData.project.matchScore,
                  ratingCategory: activeHeroData.project.ratingCategory,
                  formatTags: activeHeroData.project.formatTags,
                  primaryWatchLabel: activeHeroData.project.primaryWatchLabel,
                  primaryWatchUrl: activeHeroData.project.primaryWatchUrl,
                }
              : null
          }
          featuredClipUrl={activeHeroData.clip?.youtubeUrl || activeHeroData.trailerUrl || undefined}
          posterUrl={(activeHeroData.project as any)?.resolvedPosterUrl || activeHeroData.project?.posterUrl}
          onShare={handleClipShare}
          isAuthenticated={isAuthenticated}
          onShowEmailModal={setShowEmailModal}
          actorProfileId={profile._id}
        />
      ) : (
        <Hero
          key={selectedProjectId || "default"} // Force re-mount when project changes
          displayName={profile.displayName}
          headline={profile.headline}
          location={profile.location}
          avatarUrl={profile.avatarUrl}
          socials={profile.socials}
          theme={profile.theme}
          watchCtaLabel={watchCtaLabel}
          watchCtaUrl={watchCtaUrl}
          featuredClipUrl={activeHeroData.clip?.youtubeUrl || activeHeroData.trailerUrl || undefined}
          featuredProject={
            activeHeroData.project
              ? {
                  title: activeHeroData.project.title,
                  logline: activeHeroData.project.logline,
                  description: activeHeroData.project.description,
                  releaseYear: activeHeroData.project.releaseYear,
                  status: activeHeroData.project.status,
                  matchScore: activeHeroData.project.matchScore,
                  ratingCategory: activeHeroData.project.ratingCategory,
                  formatTags: activeHeroData.project.formatTags,
                  primaryWatchLabel: activeHeroData.project.primaryWatchLabel,
                  primaryWatchUrl: activeHeroData.project.primaryWatchUrl,
                }
              : null
          }
          onConnectClick={handleConnectClick}
          isAuthenticated={isAuthenticated}
          onShowEmailModal={setShowEmailModal}
          actorProfileId={profile._id}
        />
      )}

      {/* Tab Navigation */}
      <TabNavigation
        activeTab={activeTab}
        onTabChange={handleTabChange}
        primaryColor={profile.theme.primaryColor}
        commentCount={commentCount ?? 0}
      />

      {/* Tab Content */}
      <div className="min-h-[60vh]">{renderTabContent()}</div>

      {/* Footer */}
      <Footer />

      {/* Fan Email Modal */}
      <FanEmailModal
        isOpen={showEmailModal}
        onClose={handleCloseModal}
        actorProfileId={profile._id}
        actorName={profile.displayName}
        primaryColor={profile.theme.primaryColor}
      />
    </main>
  );
}
