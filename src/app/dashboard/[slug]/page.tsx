"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Grid as GridIcon,
  Images,
  LayoutDashboard,
  LayoutList,
  Link as LinkIcon,
  Loader2,
  LogOut,
  Mail,
  Menu,
  MousePointerClick,
  PenSquare,
  PlayCircle,
  QrCode,
  Search,
  Settings,
  Share2,
  Shield,
  Sparkles,
  User,
  Users,
  Wand2,
  X,
  Zap,
} from "lucide-react";

import {
  type ActorEditorDraft,
  type OwnerPageData,
  normalizeOwnerData,
} from "@/components/actor/ActorEditorForm";
import { GeneratedClipsManager } from "@/components/actor/GeneratedClipsManager";
import { GeneratedMemesManager } from "@/components/actor/GeneratedMemesManager";
import { GeneratedGifsManager } from "@/components/actor/GeneratedGifsManager";
import { GeneratedTrailersManager } from "@/components/actor/GeneratedTrailersManager";
import { ImageManager } from "@/components/actor/ImageManager";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { signOut, useSession } from "@/lib/auth-client";
import { buildSignInUrl } from "@/lib/routes";
import { buildPublicPageUrl } from "@/lib/siteUrl";
import { CampaignDashboard } from "@/components/campaigns";
import { SocialPostingDashboard } from "@/components/socialPosting";
import { OverviewBento } from "@/components/overview";
import { BoostModule } from "@/components/boost";
import { DeepAnalytics } from "@/components/admin/DeepAnalytics";
import { AdminEmailCampaigns } from "@/components/admin/AdminEmailCampaigns";
import type { AssetType } from "@/components/overview/types";

// Module types for dynamic content rendering
type DashboardModule = "overview" | "public-links" | "clips-generator" | "image-manager" | "account-settings" | "email-campaigns" | "social-posting" | "boost" | "admin-analytics" | "admin-emails";

type Submission = {
  id: string;
  title: string;
  description: string;
  thumbnail?: string;
  status: "Live" | "Processing";
  createdLabel: string;
  clipCount: number;
  clickCount: number;
  url: string;
};

const formatSlug = (slug?: string) => (slug ? `/f/${slug}` : "");

const buildYouTubeThumbnail = (url?: string) => {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get("v") ?? parsed.pathname.split("/").at(-1);
    if (!id) return undefined;
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  } catch (error) {
    console.error("Invalid YouTube URL", error);
    return undefined;
  }
};

export default function UserDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const urlSlug = params.slug as string;

  // Social connection notification state
  const [socialNotification, setSocialNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Boost payment notification state
  const [boostNotification, setBoostNotification] = useState<{
    type: 'success' | 'cancelled';
    message: string;
  } | null>(null);

  // Handle social connection callback notifications
  useEffect(() => {
    const socialConnected = searchParams.get('social_connected');
    const socialError = searchParams.get('social_error');

    if (socialConnected) {
      const platformNames: Record<string, string> = {
        youtube: 'YouTube',
        twitter: 'X (Twitter)',
        instagram: 'Instagram',
        facebook: 'Facebook',
        tiktok: 'TikTok',
        linkedin: 'LinkedIn',
      };
      const platformName = platformNames[socialConnected.toLowerCase()] || socialConnected;
      setSocialNotification({
        type: 'success',
        message: `${platformName} connected successfully!`,
      });

      // Clear the URL params without triggering a navigation
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('social_connected');
      window.history.replaceState({}, '', newUrl.toString());

      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => setSocialNotification(null), 5000);
      return () => clearTimeout(timer);
    }

    if (socialError) {
      setSocialNotification({
        type: 'error',
        message: `Connection failed: ${socialError}`,
      });

      // Clear the URL params without triggering a navigation
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('social_error');
      window.history.replaceState({}, '', newUrl.toString());

      // Auto-dismiss after 8 seconds for errors
      const timer = setTimeout(() => setSocialNotification(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // Handle boost payment callback notifications
  useEffect(() => {
    const boostStatus = searchParams.get('boost');

    if (boostStatus === 'success') {
      setBoostNotification({
        type: 'success',
        message: 'Your boost campaign is now active! Your content will start reaching more viewers.',
      });

      // Clear the URL params without triggering a navigation
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('boost');
      newUrl.searchParams.delete('session_id');
      window.history.replaceState({}, '', newUrl.toString());

      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => setBoostNotification(null), 5000);
      return () => clearTimeout(timer);
    }

    if (boostStatus === 'cancelled') {
      setBoostNotification({
        type: 'cancelled',
        message: 'Boost payment was cancelled. You can try again anytime.',
      });

      // Clear the URL params without triggering a navigation
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('boost');
      window.history.replaceState({}, '', newUrl.toString());

      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => setBoostNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const { data: sessionData, isPending: sessionLoading } = useSession();
  const userEmail = sessionData?.user?.email;

  // Check if user is superadmin for showing admin modules
  const superadminCheck = useQuery(
    api.users.checkSuperadminByEmail,
    userEmail ? { email: userEmail } : "skip"
  );
  const isSuperadmin = superadminCheck?.superadmin === true;

  const status = useQuery(api.filmmakers.getOnboardingStatus, {});
  const ownerSlug = status?.slug;

  // Build the dashboard path using the slug from URL
  const dashboardPath = `/dashboard/${urlSlug}`;

  const editorHref = urlSlug
    ? `/onboarding/editor?slug=${encodeURIComponent(urlSlug)}`
    : "/onboarding";
  const data = useQuery(
    api.filmmakers.getOwnerEditablePage,
    urlSlug ? { slug: urlSlug } : "skip",
  );
  const userDetails = useQuery(api.users.getCurrent, {});
  const updateUser = useMutation(api.users.updateCurrent);
  const updateSocials = useMutation(api.filmmakers.updateProfileSocials);

  const [draft, setDraft] = useState<ActorEditorDraft | null>(null);
  const [activeModule, setActiveModule] = useState<DashboardModule>("overview");
  const [assetType, setAssetType] = useState<"clips" | "memes" | "gifs" | "trailers">("memes");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    email: "",
    imageUrl: "",
    role: "",
  });
  const [socialsForm, setSocialsForm] = useState({
    instagram: "",
    facebook: "",
    youtube: "",
    tiktok: "",
    imdb: "",
    website: "",
  });
  const [settingsStatus, setSettingsStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const isAuthenticated = Boolean(sessionData?.session);

  // Get the actor profile ID for passing to child components
  const actorProfileId = data?.profile?._id as Id<"actor_profiles"> | undefined;

  // Redirect to sign in if not authenticated
  useEffect(() => {
    if (!sessionLoading && !isAuthenticated) {
      router.replace(buildSignInUrl({ next: dashboardPath }));
    }
  }, [sessionLoading, isAuthenticated, router, dashboardPath]);

  // If user doesn't have a profile and is not a superadmin, redirect to onboarding
  // Superadmins can access the dashboard without having a filmmaker profile
  useEffect(() => {
    if (status && !status.hasProfile && !isSuperadmin) {
      router.replace("/onboarding");
    }
  }, [router, status, isSuperadmin]);

  // If the URL slug doesn't match the user's profile slug, redirect to correct URL
  // Superadmins can view any profile's dashboard
  useEffect(() => {
    if (ownerSlug && urlSlug && ownerSlug !== urlSlug && !isSuperadmin) {
      // User is trying to access another user's dashboard - redirect to their own
      router.replace(`/dashboard/${ownerSlug}`);
    }
  }, [ownerSlug, urlSlug, router, isSuperadmin]);

  useEffect(() => {
    if (!status?.hasProfile || !urlSlug) return;

    if (data?.profile) {
      setDraft(normalizeOwnerData(data as OwnerPageData));
    } else if (data === null) {
      setDraft(null);
    }
  }, [data, urlSlug, status?.hasProfile]);

  useEffect(() => {
    if (userDetails === undefined) return;

    if (!userDetails) {
      setSettingsForm({
        name: "",
        email: "",
        imageUrl: "",
        role: "",
      });
      return;
    }

    setSettingsForm({
      name: userDetails.name ?? "",
      email: userDetails.email,
      imageUrl: userDetails.imageUrl ?? "",
      role: userDetails.role ?? "",
    });
  }, [userDetails]);

  // Initialize socials form from profile data
  useEffect(() => {
    if (!data?.profile?.socials) return;

    const socials = data.profile.socials;
    // Extract handles from full URLs for display
    const extractHandle = (url: string | undefined, prefix: string) => {
      if (!url) return "";
      if (url.startsWith(prefix)) {
        return url.slice(prefix.length).replace(/^@/, "");
      }
      return url;
    };

    setSocialsForm({
      instagram: extractHandle(socials.instagram, "https://instagram.com/"),
      facebook: extractHandle(socials.facebook, "https://facebook.com/"),
      youtube: extractHandle(socials.youtube, "https://youtube.com/@"),
      tiktok: extractHandle(socials.tiktok, "https://www.tiktok.com/@"),
      imdb: socials.imdb ?? "",
      website: socials.website ?? "",
    });
  }, [data?.profile?.socials]);

  const loadingOwnerData = status?.hasProfile
    ? urlSlug
      ? data === undefined
      : true
    : false;
  const loading = sessionLoading || status === undefined || loadingOwnerData;

  const publishedProjects = (draft?.projects ?? []).filter((project) => !project._delete);
  const publishedClips = (draft?.clips ?? []).filter((clip) => !clip._delete);

  const publicUrl = draft?.profile ? buildPublicPageUrl(draft.profile.slug) : "";

  const submissions: Submission[] = useMemo(
    () =>
      publishedClips.map((clip, index) => ({
        id: clip._id ?? clip.tempId ?? `clip-${index}`,
        title: clip.title || "Untitled clip",
        description: clip.youtubeUrl,
        thumbnail: buildYouTubeThumbnail(clip.youtubeUrl),
        status: "Live",
        createdLabel: "Added to your reel",
        clipCount: 1,
        clickCount: 0,
        url: clip.youtubeUrl,
      })),
    [publishedClips],
  );

  const filteredSubmissions = submissions.filter((submission) =>
    `${submission.title} ${submission.description}`.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const totalSubmissions = submissions.length;
  const totalClicks = draft?.profile ? draft.profile.platforms.length : 0;
  const completedJobs = publishedProjects.length;
  const processingCount = Math.max(0, (draft?.clips?.length ?? 0) - publishedClips.length);
  // Reserved for upgrade banner in future
  const _shouldShowUpgrade = (draft?.profile?.platforms.length ?? 0) < 2;

  if (!isAuthenticated && !loading) {
    return null;
  }

  // Skip this check for superadmins - they can access dashboard without a profile
  if (status && !status.hasProfile && !isSuperadmin) {
    return null;
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-slate-700 dark:bg-flmlnk-dark dark:text-slate-200">
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading your dashboard...</p>
      </main>
    );
  }

  // For superadmins without a profile, show admin-only dashboard
  if (!data || !data.profile || !draft) {
    if (isSuperadmin && userEmail) {
      return (
        <main className="min-h-screen bg-white text-slate-800 dark:bg-flmlnk-dark dark:text-slate-100">
          <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="pb-6">
              <p className="text-xs uppercase tracking-[0.25em] text-pink-600 dark:text-pink-200">Admin Portal</p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Welcome, Admin
              </h1>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div
                className="cursor-pointer rounded-3xl border border-pink-300 bg-pink-50 p-6 shadow-lg transition hover:border-pink-400 hover:shadow-xl dark:border-pink-900/50 dark:bg-pink-900/20"
                onClick={() => setActiveModule("admin-analytics")}
              >
                <div className="flex items-center gap-3 mb-4">
                  <BarChart3 className="h-8 w-8 text-pink-600 dark:text-pink-400" />
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Deep Analytics</h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  View platform-wide statistics, user engagement, and page-by-page analytics.
                </p>
              </div>
              <div
                className="cursor-pointer rounded-3xl border border-pink-300 bg-pink-50 p-6 shadow-lg transition hover:border-pink-400 hover:shadow-xl dark:border-pink-900/50 dark:bg-pink-900/20"
                onClick={() => setActiveModule("admin-emails")}
              >
                <div className="flex items-center gap-3 mb-4">
                  <Users className="h-8 w-8 text-pink-600 dark:text-pink-400" />
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">All Filmmakers</h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  View all registered users and filmmakers for email campaigns.
                </p>
              </div>
            </div>

            {/* Render admin modules when selected */}
            <div className="mt-8">
              {activeModule === "admin-analytics" && (
                <DeepAnalytics adminEmail={userEmail} />
              )}
              {activeModule === "admin-emails" && (
                <AdminEmailCampaigns adminEmail={userEmail} />
              )}
            </div>
          </div>
        </main>
      );
    }

    return (
      <main className="min-h-screen bg-white text-slate-800 dark:bg-flmlnk-dark dark:text-slate-100">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-red-600 dark:text-red-200">FLMLNK page</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            We couldn&apos;t find your Flmlnk page yet.
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Start onboarding to claim your URL and publish your first page.
          </p>
          <Link
            href="/onboarding"
            className="rounded-full bg-gradient-to-r from-carpet-red-700 via-carpet-red-500 to-red-500 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-red-900/40 transition hover:translate-y-[-1px]"
          >
            Start onboarding
          </Link>
        </div>
      </main>
    );
  }

  // Legacy metrics - now handled by OverviewBento component
  const _metrics = [
    {
      label: "Total submissions",
      value: totalSubmissions,
      helper: "Clips pulled from your page",
      icon: BarChart3,
    },
    {
      label: "Total clicks",
      value: totalClicks,
      helper: "Platform links clicked",
      icon: MousePointerClick,
    },
    {
      label: "Completed jobs",
      value: completedJobs,
      helper: "Projects published",
      icon: BadgeCheck,
    },
    {
      label: "Processing",
      value: processingCount,
      helper: "Queued for updates",
      icon: Clock3,
    },
  ];

  const handleCopyLink = async (id: string, url: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const settingsLoading = userDetails === undefined;

  const handleSettingsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!settingsForm.email.trim()) {
      setSettingsError("Email is required.");
      return;
    }

    setSettingsError(null);
    setSettingsStatus("saving");

    try {
      // Update user account settings
      await updateUser({
        email: settingsForm.email.trim(),
        name: settingsForm.name.trim() || undefined,
        imageUrl: settingsForm.imageUrl.trim() || undefined,
        role: settingsForm.role.trim() || undefined,
      });

      // Update social media links if we have a profile slug
      if (urlSlug) {
        await updateSocials({
          slug: urlSlug,
          socials: {
            instagram: socialsForm.instagram.trim() || undefined,
            facebook: socialsForm.facebook.trim() || undefined,
            youtube: socialsForm.youtube.trim() || undefined,
            tiktok: socialsForm.tiktok.trim() || undefined,
            imdb: socialsForm.imdb.trim() || undefined,
            website: socialsForm.website.trim() || undefined,
          },
        });
      }

      setSettingsStatus("saved");
      setTimeout(() => setSettingsStatus("idle"), 2000);
    } catch (error) {
      console.error("Failed to update user settings", error);
      setSettingsStatus("error");
      setSettingsError("We couldn't save your changes. Please try again.");
    }
  };

  const handleResetSettings = () => {
    if (!userDetails) return;

    setSettingsForm({
      name: userDetails.name ?? "",
      email: userDetails.email,
      imageUrl: userDetails.imageUrl ?? "",
      role: userDetails.role ?? "",
    });

    // Reset socials form to original profile values
    if (data?.profile?.socials) {
      const socials = data.profile.socials;
      const extractHandle = (url: string | undefined, prefix: string) => {
        if (!url) return "";
        if (url.startsWith(prefix)) {
          return url.slice(prefix.length).replace(/^@/, "");
        }
        return url;
      };
      setSocialsForm({
        instagram: extractHandle(socials.instagram, "https://instagram.com/"),
        facebook: extractHandle(socials.facebook, "https://facebook.com/"),
        youtube: extractHandle(socials.youtube, "https://youtube.com/@"),
        tiktok: extractHandle(socials.tiktok, "https://www.tiktok.com/@"),
        imdb: socials.imdb ?? "",
        website: socials.website ?? "",
      });
    } else {
      setSocialsForm({
        instagram: "",
        facebook: "",
        youtube: "",
        tiktok: "",
        imdb: "",
        website: "",
      });
    }

    setSettingsError(null);
    setSettingsStatus("idle");
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Failed to sign out", error);
    } finally {
      router.push("/");
    }
  };

    return (
      <main className="relative min-h-screen overflow-x-hidden bg-white text-slate-800 dark:bg-flmlnk-dark dark:text-slate-100">
        <div className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-70 overflow-hidden">
          <div className="absolute -left-32 top-0 h-72 w-72 rounded-full bg-red-200/40 blur-[140px] dark:bg-red-900/30" />
          <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-red-100/30 blur-[160px] dark:bg-red-700/20" />
        </div>

        {/* Social Connection Notification Banner */}
        {socialNotification && (
          <div
            className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 transform transition-all duration-300 ${
              socialNotification.type === 'success'
                ? 'bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-700'
                : 'bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-700'
            } rounded-xl border px-4 py-3 shadow-lg max-w-md`}
          >
            <div className="flex items-center gap-3">
              {socialNotification.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              )}
              <p
                className={`text-sm font-medium ${
                  socialNotification.type === 'success'
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-red-800 dark:text-red-200'
                }`}
              >
                {socialNotification.message}
              </p>
              <button
                type="button"
                onClick={() => setSocialNotification(null)}
                className={`ml-2 flex-shrink-0 rounded-full p-1 transition-colors ${
                  socialNotification.type === 'success'
                    ? 'hover:bg-green-200 dark:hover:bg-green-800'
                    : 'hover:bg-red-200 dark:hover:bg-red-800'
                }`}
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Boost Payment Notification Banner */}
        {boostNotification && (
          <div
            className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 transform transition-all duration-300 ${
              boostNotification.type === 'success'
                ? 'bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-700'
                : 'bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-700'
            } rounded-xl border px-4 py-3 shadow-lg max-w-md`}
          >
            <div className="flex items-center gap-3">
              {boostNotification.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              )}
              <p
                className={`text-sm font-medium ${
                  boostNotification.type === 'success'
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-amber-800 dark:text-amber-200'
                }`}
              >
                {boostNotification.message}
              </p>
              <button
                type="button"
                onClick={() => setBoostNotification(null)}
                className={`ml-2 flex-shrink-0 rounded-full p-1 transition-colors ${
                  boostNotification.type === 'success'
                    ? 'hover:bg-green-200 dark:hover:bg-green-800'
                    : 'hover:bg-amber-200 dark:hover:bg-amber-800'
                }`}
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 w-full overflow-x-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-red-600 dark:text-red-200">FLMLNK dashboard</p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Welcome back, {draft.profile.displayName}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-red-300 bg-white text-red-600 shadow-md shadow-red-200/30 transition hover:border-red-400 hover:bg-red-50 dark:border-red-900/50 dark:bg-red-900/30 dark:text-red-100 dark:shadow-red-950/40 dark:hover:border-red-800 dark:hover:bg-red-800/40 lg:hidden"
              aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
            >
              {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
            {isSidebarOpen && (
              <button
                type="button"
                className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
                aria-label="Close dashboard menu"
                onClick={() => setIsSidebarOpen(false)}
              />
            )}

            <aside
              className={`flex flex-col rounded-3xl border border-red-300 bg-white p-5 text-slate-800 shadow-xl shadow-red-200/30 transition dark:border-red-900/40 dark:bg-gradient-to-b dark:from-[#1b1f27] dark:via-[#11141b] dark:to-[#0c0f15] dark:text-white dark:shadow-red-950/30 lg:sticky lg:top-6 lg:block lg:h-[calc(100vh-7.5rem)] lg:overflow-y-auto ${
                isSidebarOpen
                  ? "fixed inset-y-4 left-4 right-4 z-40 max-h-[calc(100vh-2rem)] overflow-y-auto"
                  : "hidden"
              } lg:relative`}
            >
              <div className="flex items-center gap-3 rounded-2xl bg-red-100 p-4 ring-1 ring-red-300 dark:bg-red-900/20 dark:ring-red-900/50">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-200 text-red-600 dark:bg-red-800/30 dark:text-red-100">
                  <LayoutDashboard className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{draft.profile.displayName}</p>
                  <p className="text-xs text-red-600 dark:text-red-200">{formatSlug(draft.profile.slug)}</p>
                </div>
              </div>

              <div className="space-y-2 mt-6">
                {[
                  { label: "Overview", module: "overview" as DashboardModule, icon: LayoutDashboard },
                  { label: "Boost", module: "boost" as DashboardModule, icon: Zap },
                  { label: "Asset Generator", module: "clips-generator" as DashboardModule, icon: Wand2 },
                  { label: "Image Manager", module: "image-manager" as DashboardModule, icon: Images },
                  { label: "Email Campaigns", module: "email-campaigns" as DashboardModule, icon: Mail },
                  { label: "Social Posting", module: "social-posting" as DashboardModule, icon: Share2 },
                  { label: "Public Links", module: "public-links" as DashboardModule, icon: LinkIcon },
                  { label: "Account Settings", module: "account-settings" as DashboardModule, icon: Settings },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setActiveModule(item.module);
                      setIsSidebarOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      activeModule === item.module
                        ? "border-red-500 bg-red-100 text-red-700 dark:bg-red-600/30 dark:text-white"
                        : "border-red-200 bg-red-50 text-slate-700 hover:border-red-300 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-white dark:hover:border-red-700/60 dark:hover:bg-red-900/30"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </span>
                    {activeModule === item.module && <Sparkles className="h-4 w-4 text-amber-500 dark:text-amber-200" />}
                  </button>
                ))}
              </div>

              {/* Admin Modules - Only visible to superadmins */}
              {isSuperadmin && (
                <div className="space-y-2 mt-6">
                  <div className="flex items-center gap-2 px-2">
                    <Shield className="h-4 w-4 text-pink-400" />
                    <p className="text-xs uppercase tracking-[0.2em] text-pink-400 font-semibold">Admin</p>
                  </div>
                  {[
                    { label: "Deep Analytics", module: "admin-analytics" as DashboardModule, icon: BarChart3 },
                    { label: "All Filmmakers", module: "admin-emails" as DashboardModule, icon: Users },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        setActiveModule(item.module);
                        setIsSidebarOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                        activeModule === item.module
                          ? "border-pink-500 bg-pink-100 text-pink-700 dark:bg-pink-600/30 dark:text-white"
                          : "border-pink-200 bg-pink-50 text-slate-700 hover:border-pink-300 hover:bg-pink-100 dark:border-pink-900/40 dark:bg-pink-900/20 dark:text-white dark:hover:border-pink-700/60 dark:hover:bg-pink-900/30"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </span>
                      {activeModule === item.module && <Sparkles className="h-4 w-4 text-amber-500 dark:text-amber-200" />}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-3 rounded-2xl border border-red-300 bg-red-50 p-4 mt-6 dark:border-red-900/50 dark:bg-red-900/20">
                <p className="text-xs uppercase tracking-[0.2em] text-red-600 dark:text-red-200">Quick links</p>
                <div className="flex flex-col gap-2 text-sm">
                  <Link
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-3 py-2 font-medium text-white shadow-md shadow-red-950/30 transition hover:bg-red-500"
                  >
                    <ExternalLink className="h-4 w-4" /> View public page
                  </Link>
                  <Link
                    href={editorHref}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-red-300 bg-white px-3 py-2 font-medium text-red-700 transition hover:border-red-400 hover:bg-red-50 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100 dark:hover:border-red-700 dark:hover:bg-red-800/50"
                  >
                    <PenSquare className="h-4 w-4" /> Open builder
                  </Link>
                </div>
              </div>

              {/* Logout Button - at bottom of sidebar */}
              <div className="mt-auto pt-6">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition hover:border-red-400 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-100 dark:hover:border-red-700/60 dark:hover:bg-red-900/30"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            </aside>

          <section className="space-y-6 min-w-0 overflow-x-hidden">
            {/* ============ OVERVIEW MODULE ============ */}
            {activeModule === "overview" && actorProfileId && (
              <OverviewBento
                slug={urlSlug}
                actorProfileId={actorProfileId}
                displayName={draft.profile.displayName}
                youtubeUrl={data?.profile?.socials?.youtube}
                onNavigateToGenerator={(_type: AssetType) => {
                  setActiveModule("clips-generator");
                }}
              />
            )}

            {/* ============ PUBLIC LINKS MODULE ============ */}
            {activeModule === "public-links" && (
              <div className="rounded-3xl border border-red-300 bg-white p-6 shadow-lg shadow-red-200/50 dark:border-red-900/50 dark:bg-[#0f1219] dark:shadow-red-950/30"
            >
              <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-red-600 dark:text-red-200">Public links</p>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Share your live page</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-200">
                    Keep your clips aligned with the look and feel of your page. Toggle between list and grid views.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <div className="relative w-full sm:w-auto">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-red-400 dark:text-red-200/70" />
                    <input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search clips"
                      className="w-full rounded-full border border-red-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 shadow-inner outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:focus:bg-[#1c202a] dark:focus:ring-0 sm:w-64"
                    />
                  </div>
                  <button className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-red-800 bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-red-950/30 transition hover:bg-red-500 sm:w-auto">
                    <Download className="h-4 w-4" /> Export CSV
                  </button>
                  <div className="hidden items-center gap-2 rounded-full border border-red-300 bg-white p-1 shadow-sm shadow-red-200/30 dark:border-red-900/50 dark:bg-[#161a24] dark:shadow-red-950/30 sm:flex">
                    <button
                      type="button"
                      onClick={() => setViewMode("list")}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
                        viewMode === "list" ? "bg-red-600 text-white shadow" : "text-slate-500 dark:text-slate-300"
                      }`}
                    >
                      <LayoutList className="h-4 w-4" /> List
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("grid")}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
                        viewMode === "grid" ? "bg-red-600 text-white shadow" : "text-slate-500 dark:text-slate-300"
                      }`}
                    >
                      <GridIcon className="h-4 w-4" /> Grid
                    </button>
                  </div>
                </div>
              </div>

              {filteredSubmissions.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-red-300 bg-white p-10 text-center text-slate-600 dark:border-red-900/60 dark:bg-[#161a24] dark:text-slate-200">
                  <QrCode className="h-10 w-10 text-red-400 dark:text-red-200" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">No submissions match your filters</p>
                  <p className="text-xs text-slate-500 dark:text-slate-300">Adjust your search to see your clips again.</p>
                </div>
              ) : viewMode === "list" ? (
                <div className="space-y-4">
                  {filteredSubmissions.map((submission) => (
                    <div
                      key={submission.id}
                      className="flex flex-col gap-4 rounded-2xl border border-red-300 bg-white p-4 shadow-sm shadow-red-200/50 dark:border-red-900/40 dark:bg-[#11141b] dark:shadow-red-950/30 md:flex-row"
                    >
                      <div className="h-32 w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-[#1f2533] md:h-24 md:w-40">
                        {submission.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={submission.thumbnail}
                            alt={submission.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-red-400 dark:text-red-200">
                            <PlayCircle className="h-8 w-8" />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-400/40 dark:text-emerald-100">
                              {submission.status}
                            </span>
                            <p className="text-sm uppercase tracking-[0.12em] text-slate-500 dark:text-slate-200">{submission.createdLabel}</p>
                          </div>
                          <p className="text-lg font-semibold text-slate-900 dark:text-white">{submission.title}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-200">{submission.description}</p>
                        </div>

                        <div className="flex flex-col gap-2 md:items-end">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
                            <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700 shadow-sm shadow-red-200/30 dark:bg-red-900/30 dark:text-red-100 dark:shadow-red-950/20">
                              {submission.clipCount} clips
                            </span>
                            <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700 shadow-sm shadow-red-200/30 dark:bg-red-900/30 dark:text-red-100 dark:shadow-red-950/20">
                              {submission.clickCount} clicks
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopyLink(submission.id, submission.url)}
                              className="inline-flex items-center gap-2 rounded-full border border-red-800 bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-red-950/30 transition hover:bg-red-500"
                            >
                              <Copy className="h-4 w-4" /> {copiedId === submission.id ? "Copied" : "Copy link"}
                            </button>
                            <Link
                              href={submission.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 shadow-sm shadow-red-200/30 transition hover:border-red-400 hover:bg-red-50 dark:border-red-900/50 dark:bg-[#161a24] dark:text-red-100 dark:shadow-red-950/30 dark:hover:border-red-800 dark:hover:bg-[#1c202a]"
                            >
                              <ExternalLink className="h-4 w-4" /> Open source
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredSubmissions.map((submission) => (
                    <div
                      key={submission.id}
                      className="flex h-full flex-col overflow-hidden rounded-2xl border border-red-300 bg-white shadow-sm shadow-red-200/50 dark:border-red-900/40 dark:bg-[#11141b] dark:shadow-red-950/30"
                    >
                      <div className="relative h-40 w-full bg-slate-100 dark:bg-[#1f2533]">
                        {submission.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={submission.thumbnail}
                            alt={submission.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-red-400 dark:text-red-200">
                            <PlayCircle className="h-10 w-10" />
                          </div>
                        )}
                        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-400/40 dark:text-emerald-100">
                          <BadgeCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-200" /> {submission.status}
                        </div>
                        <div className="absolute right-3 top-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyLink(submission.id, submission.url)}
                            className="rounded-full bg-red-600 p-2 text-white shadow-sm shadow-red-950/30 transition hover:bg-red-500"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <Link
                            href={submission.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full bg-red-600 p-2 text-white shadow-sm shadow-red-950/30 transition hover:bg-red-500"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col gap-3 p-4">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{submission.title}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-200">{submission.description}</p>
                        <div className="mt-auto flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
                          <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700 shadow-sm shadow-red-200/30 dark:bg-red-900/30 dark:text-red-100 dark:shadow-red-950/20">
                            {submission.clipCount} clips
                          </span>
                          <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700 shadow-sm shadow-red-200/30 dark:bg-red-900/30 dark:text-red-100 dark:shadow-red-950/20">
                            {submission.clickCount} clicks
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </div>
            )}

            {/* ============ ASSET GENERATOR MODULE ============ */}
            {activeModule === "clips-generator" && (
              <div className="space-y-6">
                {/* Header */}
                <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-carpet-red-800 via-carpet-red-600 to-red-500 p-4 sm:p-6 text-white shadow-lg shadow-red-950/40 ring-1 ring-red-300/30">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-[0.25em] text-red-100">Asset Generator</p>
                      <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Generate viral clips, memes, and GIFs</h2>
                      <p className="mt-1 text-sm text-red-100/90">
                        Our AI analyzes your videos and extracts the most engaging moments as clips, memes, and shareable GIFs.
                      </p>
                    </div>
                    <div className="flex h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white/20">
                      <Wand2 className="h-6 w-6 sm:h-7 sm:w-7" />
                    </div>
                  </div>
                </div>

                {/* Asset Type Tabs */}
                <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/50 w-fit">
                  <button
                    type="button"
                    onClick={() => setAssetType("memes")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      assetType === "memes"
                        ? "bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      Memes
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssetType("clips")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      assetType === "clips"
                        ? "bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <PlayCircle className="w-4 h-4" />
                      Clips
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssetType("gifs")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      assetType === "gifs"
                        ? "bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M8 12h4M8 16h2M16 8v8" />
                      </svg>
                      GIFs
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssetType("trailers")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      assetType === "trailers"
                        ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="M2 8h20M8 4v4M16 4v4" />
                      </svg>
                      Trailers
                    </span>
                  </button>
                </div>

                {/* Clips Manager */}
                {assetType === "clips" && (
                  <div className="rounded-3xl border border-red-300 bg-white p-6 shadow-lg shadow-red-200/50 dark:border-red-900/50 dark:bg-[#0f1219] dark:shadow-red-950/30">
                    {urlSlug && (
                      <GeneratedClipsManager slug={urlSlug} actorProfileId={actorProfileId} />
                    )}
                  </div>
                )}

                {/* Memes Manager */}
                {assetType === "memes" && (
                  <div className="rounded-3xl border border-red-300 bg-white p-6 shadow-lg shadow-red-200/50 dark:border-red-900/50 dark:bg-[#0f1219] dark:shadow-red-950/30">
                    {urlSlug && (
                      <GeneratedMemesManager slug={urlSlug} />
                    )}
                  </div>
                )}

                {/* GIFs Manager */}
                {assetType === "gifs" && (
                  <div className="rounded-3xl border border-red-300 bg-white p-6 shadow-lg shadow-red-200/50 dark:border-red-900/50 dark:bg-[#0f1219] dark:shadow-red-950/30">
                    {urlSlug && (
                      <GeneratedGifsManager slug={urlSlug} />
                    )}
                  </div>
                )}

                {/* Trailers Manager */}
                {assetType === "trailers" && (
                  <div className="rounded-3xl border border-indigo-300 bg-white p-6 shadow-lg shadow-indigo-200/50 dark:border-indigo-900/50 dark:bg-[#0f1219] dark:shadow-indigo-950/30">
                    {urlSlug && (
                      <GeneratedTrailersManager slug={urlSlug} actorProfileId={actorProfileId} />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ============ IMAGE MANAGER MODULE ============ */}
            {activeModule === "image-manager" && (
              <div className="space-y-6">
                {/* Header */}
                <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-carpet-red-800 via-carpet-red-600 to-red-500 p-6 text-white shadow-lg shadow-red-950/40 ring-1 ring-red-300/30">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-red-100">Image Manager</p>
                      <h2 className="text-2xl font-semibold tracking-tight">Organize your film project assets</h2>
                      <p className="mt-1 text-sm text-red-100/90">
                        Create projects, capture frames from videos, and manage your social media and ad assets.
                      </p>
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                      <Images className="h-7 w-7" />
                    </div>
                  </div>
                </div>

                {/* Image Manager Component */}
                <div className="rounded-3xl border border-red-300 bg-white p-6 shadow-lg shadow-red-200/50 dark:border-red-900/50 dark:bg-[#0f1219] dark:shadow-red-950/30">
                  {urlSlug && (
                    <ImageManager slug={urlSlug} />
                  )}
                </div>
              </div>
            )}

            {/* ============ ACCOUNT SETTINGS MODULE ============ */}
            {activeModule === "account-settings" && (
              <div className="space-y-4 rounded-3xl border border-red-300 bg-white p-6 shadow-lg shadow-red-200/50 dark:border-red-900/50 dark:bg-[#0f1219] dark:shadow-red-950/30">
                <div className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-red-600 dark:text-red-200">Account settings</p>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Manage your profile details</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-200">
                      These fields map directly to your app.users record and keep your account details up to date.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                    {settingsStatus === "saved" ? (
                      <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-emerald-700 ring-1 ring-emerald-400/40 dark:text-emerald-100">
                        Saved
                      </span>
                    ) : settingsStatus === "saving" ? (
                      <span className="flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-red-700 ring-1 ring-red-300 dark:bg-red-900/40 dark:text-red-100 dark:ring-red-800">
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                      </span>
                    ) : null}
                  </div>
                </div>

                {settingsLoading ? (
                  <p className="text-sm text-slate-500 dark:text-slate-300">Loading your account...</p>
                ) : !userDetails ? (
                  <p className="text-sm text-red-600 dark:text-red-200">
                    We couldn&apos;t load your account details. Please refresh and try again.
                  </p>
                ) : (
                  <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSettingsSubmit}>
                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-600 dark:text-red-200">
                        <User className="h-4 w-4" /> Full name
                      </span>
                      <input
                        value={settingsForm.name}
                        onChange={(event) =>
                          setSettingsForm((prev) => ({ ...prev, name: event.target.value }))
                        }
                        placeholder="Your name"
                        className="w-full rounded-2xl border border-red-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:focus:bg-[#1c202a] dark:focus:ring-0"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-600 dark:text-red-200">
                        <Mail className="h-4 w-4" /> Email
                      </span>
                      <input
                        required
                        type="email"
                        value={settingsForm.email}
                        onChange={(event) =>
                          setSettingsForm((prev) => ({ ...prev, email: event.target.value }))
                        }
                        placeholder="your@email.com"
                        className="w-full rounded-2xl border border-red-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:focus:bg-[#1c202a] dark:focus:ring-0"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-600 dark:text-red-200">
                        <Shield className="h-4 w-4" /> Role
                      </span>
                      <input
                        value={settingsForm.role}
                        onChange={(event) =>
                          setSettingsForm((prev) => ({ ...prev, role: event.target.value }))
                        }
                        placeholder="actor, admin, filmmaker"
                        className="w-full rounded-2xl border border-red-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:focus:bg-[#1c202a] dark:focus:ring-0"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-600 dark:text-red-200">
                        Image URL
                      </span>
                      <input
                        value={settingsForm.imageUrl}
                        onChange={(event) =>
                          setSettingsForm((prev) => ({ ...prev, imageUrl: event.target.value }))
                        }
                        placeholder="https://example.com/avatar.jpg"
                        className="w-full rounded-2xl border border-red-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:focus:bg-[#1c202a] dark:focus:ring-0"
                      />
                    </label>

                    {/* Social Media Links Section */}
                    <div className="md:col-span-2 pt-4 pb-2">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-red-200 dark:bg-red-900/50" />
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600 dark:text-red-200">Social Links</span>
                        <div className="h-px flex-1 bg-red-200 dark:bg-red-900/50" />
                      </div>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 text-center">
                        Add your social media handles. Handles auto-generate into full URLs.
                      </p>
                    </div>

                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-600 dark:text-red-200">
                        Instagram
                      </span>
                      <div className="flex items-center rounded-2xl border border-red-300 bg-white px-3 py-2 text-sm shadow-inner focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:focus-within:bg-[#1c202a] dark:focus-within:ring-0">
                        <span className="text-slate-500 dark:text-slate-400 text-sm">instagram.com/</span>
                        <input
                          value={socialsForm.instagram}
                          onChange={(event) =>
                            setSocialsForm((prev) => ({ ...prev, instagram: event.target.value }))
                          }
                          placeholder="yourhandle"
                          className="flex-1 border-none bg-transparent text-sm text-slate-900 outline-none dark:text-white"
                        />
                      </div>
                    </label>

                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-600 dark:text-red-200">
                        Facebook
                      </span>
                      <div className="flex items-center rounded-2xl border border-red-300 bg-white px-3 py-2 text-sm shadow-inner focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:focus-within:bg-[#1c202a] dark:focus-within:ring-0">
                        <span className="text-slate-500 dark:text-slate-400 text-sm">facebook.com/</span>
                        <input
                          value={socialsForm.facebook}
                          onChange={(event) =>
                            setSocialsForm((prev) => ({ ...prev, facebook: event.target.value }))
                          }
                          placeholder="yourpage"
                          className="flex-1 border-none bg-transparent text-sm text-slate-900 outline-none dark:text-white"
                        />
                      </div>
                    </label>

                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-600 dark:text-red-200">
                        TikTok
                      </span>
                      <div className="flex items-center rounded-2xl border border-red-300 bg-white px-3 py-2 text-sm shadow-inner focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:focus-within:bg-[#1c202a] dark:focus-within:ring-0">
                        <span className="text-slate-500 dark:text-slate-400 text-sm">tiktok.com/@</span>
                        <input
                          value={socialsForm.tiktok}
                          onChange={(event) =>
                            setSocialsForm((prev) => ({ ...prev, tiktok: event.target.value }))
                          }
                          placeholder="yourhandle"
                          className="flex-1 border-none bg-transparent text-sm text-slate-900 outline-none dark:text-white"
                        />
                      </div>
                    </label>

                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-600 dark:text-red-200">
                        YouTube
                      </span>
                      <div className="flex items-center rounded-2xl border border-red-300 bg-white px-3 py-2 text-sm shadow-inner focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:focus-within:bg-[#1c202a] dark:focus-within:ring-0">
                        <span className="text-slate-500 dark:text-slate-400 text-sm">youtube.com/@</span>
                        <input
                          value={socialsForm.youtube}
                          onChange={(event) =>
                            setSocialsForm((prev) => ({ ...prev, youtube: event.target.value }))
                          }
                          placeholder="yourchannel"
                          className="flex-1 border-none bg-transparent text-sm text-slate-900 outline-none dark:text-white"
                        />
                      </div>
                    </label>

                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-600 dark:text-red-200">
                        IMDb
                      </span>
                      <input
                        value={socialsForm.imdb}
                        onChange={(event) =>
                          setSocialsForm((prev) => ({ ...prev, imdb: event.target.value }))
                        }
                        placeholder="https://www.imdb.com/name/nm0000000/"
                        className="w-full rounded-2xl border border-red-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:focus:bg-[#1c202a] dark:focus:ring-0"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-600 dark:text-red-200">
                        Website
                      </span>
                      <input
                        value={socialsForm.website}
                        onChange={(event) =>
                          setSocialsForm((prev) => ({ ...prev, website: event.target.value }))
                        }
                        placeholder="https://yourwebsite.com"
                        className="w-full rounded-2xl border border-red-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:focus:bg-[#1c202a] dark:focus:ring-0"
                      />
                    </label>

                    <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-2">
                      {settingsError ? (
                        <p className="text-sm text-red-600 dark:text-red-200">{settingsError}</p>
                      ) : (
                        <p className="text-xs text-slate-500 dark:text-slate-300">
                          Update and save to sync changes to your Convex user record.
                        </p>
                      )}

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleResetSettings}
                          disabled={settingsStatus === "saving"}
                          className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/50 dark:text-red-100 dark:hover:border-red-700 dark:hover:bg-red-900/40"
                        >
                          Reset
                        </button>
                        <button
                          type="submit"
                          disabled={settingsStatus === "saving"}
                          className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-red-950/30 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {settingsStatus === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
                          Save changes
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ============ EMAIL CAMPAIGNS MODULE ============ */}
            {activeModule === "email-campaigns" && actorProfileId && (
              <CampaignDashboard actorProfileId={actorProfileId} />
            )}

            {/* ============ SOCIAL POSTING MODULE ============ */}
            {activeModule === "social-posting" && actorProfileId && (
              <SocialPostingDashboard actorProfileId={actorProfileId} />
            )}

            {/* ============ BOOST MODULE ============ */}
            {activeModule === "boost" && actorProfileId && (
              <BoostModule actorProfileId={actorProfileId} />
            )}

            {/* ============ ADMIN: DEEP ANALYTICS MODULE ============ */}
            {activeModule === "admin-analytics" && isSuperadmin && userEmail && (
              <DeepAnalytics adminEmail={userEmail} />
            )}

            {/* ============ ADMIN: ALL FILMMAKERS EMAIL MODULE ============ */}
            {activeModule === "admin-emails" && isSuperadmin && userEmail && (
              <AdminEmailCampaigns adminEmail={userEmail} />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
