"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { useSession } from "@/lib/auth-client";

import { ProjectsManager } from "@/components/actor/ProjectsManager";
import { ClipsManager } from "@/components/actor/ClipsManager";
import { GeneratedClipsManager } from "@/components/actor/GeneratedClipsManager";
import { buildPublicPageUrl } from "@/lib/siteUrl";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { EditorChatInterface } from "@/components/editor/EditorChatInterface";

// Types copied from onboarding review flow
type Platform = { key: string; label: string; url?: string | null };
type FeaturedProject = {
  _id: Id<"projects">;
  title: string;
  logline?: string | null;
  description?: string | null;
  releaseYear?: number | null;
  roleName?: string | null;
  status?: string | null;
  primaryWatchLabel?: string | null;
  primaryWatchUrl?: string | null;
  trailerUrl?: string | null;
};
type FeaturedClip = {
  _id: Id<"clips">;
  title: string;
  youtubeUrl: string;
};
type FormState = {
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  avatarUrl: string;
  genres: string[];
  platforms: Platform[];
  project: FeaturedProject;
  clip: FeaturedClip;
};

export default function OnboardingEditorPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white text-slate-800 dark:bg-[#05040A] dark:text-white flex items-center justify-center">
          <p className="text-sm text-slate-600 dark:text-slate-300">Loading editor…</p>
        </main>
      }
    >
      <OnboardingEditorPageContent />
    </Suspense>
  );
}

function OnboardingEditorPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const slugParam = params.get("slug");
  const { data: sessionData, isLoading: sessionLoading } = useSession();
  const onboardingStatus = useQuery(api.filmmakers.getOnboardingStatus, {});
  const slug = slugParam ?? onboardingStatus?.slug ?? "";

  // Ensure user record exists in Convex
  const ensureUser = useMutation(api.users.ensureFromAuth);
  const [userEnsured, setUserEnsured] = useState(false);

  // Ensure user exists when authenticated
  useEffect(() => {
    if (sessionData?.session && !sessionLoading && !userEnsured) {
      ensureUser()
        .then(() => setUserEnsured(true))
        .catch((err) => {
          // User might already exist, that's fine
          console.log("ensureUser:", err.message);
          setUserEnsured(true);
        });
    }
  }, [sessionData, sessionLoading, ensureUser, userEnsured]);

  const editorData = useQuery(
    api.filmmakers.getOwnerEditablePage,
    slug && userEnsured ? { slug } : "skip",
  );
  const updateOwnerPage = useMutation(api.filmmakers.updateOwnerPage);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(["profile"]) // Profile expanded by default
  );

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);
  const labelTextClasses = "text-slate-700 dark:text-white/80 text-sm md:text-xs font-semibold";
  const inputClasses =
    "w-full rounded-xl border border-red-300 bg-white px-4 py-3 text-base md:rounded-lg md:px-3 md:py-2.5 md:text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 focus:outline-none transition-colors dark:border-white/10 dark:bg-black/50 dark:text-white dark:placeholder:text-white/40 dark:focus:border-[#f53c56] dark:focus:ring-[#f53c56]/30";
  const textareaClasses = `${inputClasses} min-h-[96px] md:min-h-[80px]`;

  const editorSections = useMemo(() => {
    if (!form) return [];

    const sections: { key: string; content: React.ReactNode; title: string }[] = [
      {
        key: "profile",
        title: "Profile",
        content: (
          <EditorCard title="Profile" isExpanded={expandedSections.has("profile")} onToggle={() => toggleSection("profile")}>
            <div className="space-y-4 text-sm">
              <label className="block space-y-1.5">
                <span className={labelTextClasses}>Display name</span>
                <input
                  className={inputClasses}
                  value={form.displayName}
                  onChange={(e) =>
                    setForm((f) => f && { ...f, displayName: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelTextClasses}>Headline</span>
                <input
                  className={inputClasses}
                  value={form.headline}
                  onChange={(e) =>
                    setForm((f) => f && { ...f, headline: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelTextClasses}>Location</span>
                <input
                  className={inputClasses}
                  value={form.location}
                  onChange={(e) =>
                    setForm((f) => f && { ...f, location: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelTextClasses}>Avatar image URL</span>
                <input
                  className={inputClasses}
                  placeholder="https://..."
                  value={form.avatarUrl}
                  onChange={(e) =>
                    setForm((f) => f && { ...f, avatarUrl: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelTextClasses}>Bio</span>
                <textarea
                  className={textareaClasses}
                  value={form.bio}
                  onChange={(e) =>
                    setForm((f) => f && { ...f, bio: e.target.value })
                  }
                />
              </label>
            </div>
          </EditorCard>
        ),
      },
      {
        key: "featured-project",
        title: "Featured project",
        content: (
          <EditorCard title="Featured project" isExpanded={expandedSections.has("featured-project")} onToggle={() => toggleSection("featured-project")}>
            <div className="space-y-4 text-sm">
              <label className="block space-y-1.5">
                <span className={labelTextClasses}>Title</span>
                <input
                  className={inputClasses}
                  value={form.project.title}
                  onChange={(e) =>
                    setForm((f) =>
                      f && { ...f, project: { ...f.project, title: e.target.value } },
                    )
                  }
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelTextClasses}>Logline</span>
                <textarea
                  className={textareaClasses}
                  value={form.project.logline ?? ""}
                  onChange={(e) =>
                    setForm((f) =>
                      f && {
                        ...f,
                        project: { ...f.project, logline: e.target.value },
                      },
                    )
                  }
                />
              </label>
              <div className="flex gap-3">
                <label className="flex-1 space-y-1.5">
                  <span className={labelTextClasses}>Release year</span>
                  <input
                    className={inputClasses}
                    placeholder="2024"
                    value={form.project.releaseYear ?? ""}
                    onChange={(e) =>
                      setForm((f) =>
                        f && {
                          ...f,
                          project: {
                            ...f.project,
                            releaseYear: e.target.value
                              ? Number.parseInt(e.target.value, 10)
                              : null,
                          },
                        },
                      )
                    }
                  />
                </label>
                <label className="flex-1 space-y-1.5">
                  <span className={labelTextClasses}>Status</span>
                  <input
                    className={inputClasses}
                    placeholder="In post-production"
                    value={form.project.status ?? ""}
                    onChange={(e) =>
                      setForm((f) =>
                        f && {
                          ...f,
                          project: { ...f.project, status: e.target.value },
                        },
                      )
                    }
                  />
                </label>
              </div>
              <div className="flex gap-3">
                <label className="flex-1 space-y-1.5">
                  <span className={labelTextClasses}>Role</span>
                  <input
                    className={inputClasses}
                    placeholder="Director"
                    value={form.project.roleName ?? ""}
                    onChange={(e) =>
                      setForm((f) =>
                        f && {
                          ...f,
                          project: { ...f.project, roleName: e.target.value },
                        },
                      )
                    }
                  />
                </label>
                <label className="flex-1 space-y-1.5">
                  <span className={labelTextClasses}>Hero CTA label</span>
                  <input
                    className={inputClasses}
                    placeholder="Watch on Netflix"
                    value={form.project.primaryWatchLabel ?? ""}
                    onChange={(e) =>
                      setForm((f) =>
                        f && {
                          ...f,
                          project: { ...f.project, primaryWatchLabel: e.target.value },
                        },
                      )
                    }
                  />
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className={labelTextClasses}>Hero CTA URL</span>
                <input
                  className={inputClasses}
                  placeholder="https://netflix.com/..."
                  value={form.project.primaryWatchUrl ?? ""}
                  onChange={(e) =>
                    setForm((f) =>
                      f && {
                        ...f,
                        project: { ...f.project, primaryWatchUrl: e.target.value },
                      },
                    )
                  }
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelTextClasses}>Trailer URL</span>
                <input
                  className={inputClasses}
                  placeholder="https://youtube.com/watch?v=..."
                  value={form.project.trailerUrl ?? ""}
                  onChange={(e) =>
                    setForm((f) =>
                      f && {
                        ...f,
                        project: { ...f.project, trailerUrl: e.target.value },
                      },
                    )
                  }
                />
              </label>
            </div>
          </EditorCard>
        ),
      },
      {
        key: "featured-clip",
        title: "Featured clip",
        content: (
          <EditorCard title="Featured clip" isExpanded={expandedSections.has("featured-clip")} onToggle={() => toggleSection("featured-clip")}>
            <div className="space-y-4 text-sm">
              <label className="block space-y-1.5">
                <span className={labelTextClasses}>Clip title</span>
                <input
                  className={inputClasses}
                  value={form.clip.title}
                  onChange={(e) =>
                    setForm((f) =>
                      f && { ...f, clip: { ...f.clip, title: e.target.value } },
                    )
                  }
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelTextClasses}>YouTube URL</span>
                <input
                  className={inputClasses}
                  value={form.clip.youtubeUrl}
                  onChange={(e) =>
                    setForm((f) =>
                      f && {
                        ...f,
                        clip: { ...f.clip, youtubeUrl: e.target.value },
                      },
                    )
                  }
                />
              </label>
            </div>
          </EditorCard>
        ),
      },
    ];

    if (slug && editorData?.clips) {
      sections.push({
        key: "all-clips",
        title: "All Clips",
        content: (
          <EditorCard title="All Clips" isExpanded={expandedSections.has("all-clips")} onToggle={() => toggleSection("all-clips")}>
            <ClipsManager slug={slug} clips={editorData.clips} />
          </EditorCard>
        ),
      });
    }

    if (slug) {
      sections.push({
        key: "ai-clips",
        title: "AI Generated Clips",
        content: (
          <EditorCard title="AI Generated Clips" isExpanded={expandedSections.has("ai-clips")} onToggle={() => toggleSection("ai-clips")}>
            <GeneratedClipsManager slug={slug} />
          </EditorCard>
        ),
      });
    }

    if (slug && editorData?.projects) {
      sections.push({
        key: "all-projects",
        title: "All Projects",
        content: (
          <EditorCard title="All Projects" isExpanded={expandedSections.has("all-projects")} onToggle={() => toggleSection("all-projects")}>
            <ProjectsManager slug={slug} projects={editorData.projects} />
          </EditorCard>
        ),
      });
    }

    return sections;
  }, [editorData, expandedSections, form, inputClasses, labelTextClasses, slug, textareaClasses, toggleSection]);

  useEffect(() => {
    if (
      editorData &&
      editorData.profile &&
      editorData.featuredProject &&
      editorData.featuredClip &&
      !form
    ) {
      const { profile, featuredProject, featuredClip } = editorData;
      setForm({
        displayName: profile.displayName,
        headline: profile.headline ?? "",
        bio: profile.bio ?? "",
        location: profile.location ?? "",
        avatarUrl: profile.avatarUrl ?? "",
        genres: profile.genres ?? [],
        platforms: profile.platforms ?? [],
        project: featuredProject,
        clip: featuredClip,
      });
    }
  }, [editorData, form]);

  useEffect(() => {
    if (activeSectionIndex >= editorSections.length) {
      setActiveSectionIndex(Math.max(0, editorSections.length - 1));
    }
  }, [activeSectionIndex, editorSections.length]);

  const isOwnerMissing = editorData === null;

  const handleSave = async (destination: "dashboard" | "stay") => {
    if (!form || !editorData?.featuredProject || !editorData?.featuredClip) {
      return;
    }
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await updateOwnerPage({
        slug,
        profile: {
          displayName: form.displayName,
          headline: form.headline || undefined,
          bio: form.bio || undefined,
          location: form.location || undefined,
          avatarUrl: form.avatarUrl || undefined,
          genres: form.genres,
          platforms: form.platforms,
        },
        featuredProject: {
          _id: editorData.featuredProject._id,
          title: form.project.title,
          logline: form.project.logline ?? undefined,
          description: form.project.description ?? undefined,
          releaseYear: form.project.releaseYear ?? undefined,
          roleName: form.project.roleName ?? undefined,
          status: form.project.status ?? undefined,
          primaryWatchLabel: form.project.primaryWatchLabel ?? undefined,
          primaryWatchUrl: form.project.primaryWatchUrl ?? undefined,
          trailerUrl: form.project.trailerUrl ?? undefined,
        },
        featuredClip: {
          _id: editorData.featuredClip._id,
          title: form.clip.title,
          youtubeUrl: form.clip.youtubeUrl,
        },
      });

      setPreviewKey(Date.now());

      if (destination === "dashboard") {
        router.push("/dashboard/actor");
      } else {
        setStatus("Saved");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : null;
      setError(message ?? "Something went wrong saving your page.");
    } finally {
      setSaving(false);
    }
  };

  // Handler for AI chat to update form fields
  const handleChatUpdateField = useCallback(
    (section: "profile" | "featured-project" | "featured-clip", field: string, value: string) => {
      if (!form) return;

      if (section === "profile") {
        // Update profile fields
        setForm((f) => {
          if (!f) return f;
          const updates: Partial<FormState> = {};
          if (field === "displayName") updates.displayName = value;
          else if (field === "headline") updates.headline = value;
          else if (field === "bio") updates.bio = value;
          else if (field === "location") updates.location = value;
          else if (field === "avatarUrl") updates.avatarUrl = value;
          return { ...f, ...updates };
        });
      } else if (section === "featured-project") {
        // Update project fields
        setForm((f) => {
          if (!f) return f;
          const projectUpdates: Partial<FeaturedProject> = {};
          if (field === "title") projectUpdates.title = value;
          else if (field === "logline") projectUpdates.logline = value;
          else if (field === "releaseYear") projectUpdates.releaseYear = value ? parseInt(value, 10) : null;
          else if (field === "status") projectUpdates.status = value;
          else if (field === "roleName") projectUpdates.roleName = value;
          else if (field === "primaryWatchLabel") projectUpdates.primaryWatchLabel = value;
          else if (field === "primaryWatchUrl") projectUpdates.primaryWatchUrl = value;
          else if (field === "trailerUrl") projectUpdates.trailerUrl = value;
          return { ...f, project: { ...f.project, ...projectUpdates } };
        });
      } else if (section === "featured-clip") {
        // Update clip fields
        setForm((f) => {
          if (!f) return f;
          const clipUpdates: Partial<FeaturedClip> = {};
          if (field === "title") clipUpdates.title = value;
          else if (field === "youtubeUrl") clipUpdates.youtubeUrl = value;
          return { ...f, clip: { ...f.clip, ...clipUpdates } };
        });
      }
    },
    [form]
  );

  // Show loading while ensuring user exists
  if (!userEnsured || sessionLoading) {
    return (
      <main className="min-h-screen bg-white text-slate-800 dark:bg-[#05040A] dark:text-white flex items-center justify-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">Loading…</p>
      </main>
    );
  }

  if (!slug) {
    return (
      <main className="min-h-screen bg-white text-slate-800 dark:bg-[#05040A] dark:text-white flex items-center justify-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Missing slug. Return to onboarding to restart.
        </p>
      </main>
    );
  }

  if (isOwnerMissing) {
    return (
      <main className="min-h-screen bg-white text-slate-800 dark:bg-[#05040A] dark:text-white flex items-center justify-center">
        <div className="space-y-3 text-center">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Sign in to finish your page</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            We couldn&apos;t match this page to your account. Please sign in again.
          </p>
        </div>
      </main>
    );
  }

  if (editorData === undefined || !form) {
    return (
      <main className="min-h-screen bg-white text-slate-800 dark:bg-[#05040A] dark:text-white flex items-center justify-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">Loading editor…</p>
      </main>
    );
  }


  const renderSaveButtons = (className = "flex gap-3") => (
    <div className={className}>
      <button
        type="button"
        disabled={saving}
        onClick={() => handleSave("stay")}
        className="inline-flex items-center justify-center rounded-full border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:border-red-400 hover:bg-red-50 transition disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/30 dark:hover:bg-white/10"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => handleSave("dashboard")}
        className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-600/30 hover:bg-red-500 hover:shadow-red-500/50 transition disabled:opacity-60"
      >
        {saving ? "Saving…" : "Dashboard"}
      </button>
    </div>
  );

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-white text-slate-800 dark:bg-[#05040A] dark:text-white">
      {/* Background gradient effects - matching how-it-works */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_15%_20%,rgba(220,20,60,0.05),transparent_45%),radial-gradient(circle_at_85%_10%,rgba(220,20,60,0.03),transparent_40%)] dark:bg-[radial-gradient(circle_at_15%_20%,rgba(255,23,68,0.15),transparent_45%),radial-gradient(circle_at_85%_10%,rgba(220,20,60,0.12),transparent_40%),radial-gradient(circle_at_50%_80%,rgba(0,0,0,0.3),transparent_35%)]" />
      <div className="absolute inset-0 pointer-events-none hidden dark:block bg-[linear-gradient(120deg,rgba(255,23,68,0.06),transparent_35%),linear-gradient(320deg,rgba(0,0,0,0.2),transparent_35%)]" />

      <header className="relative z-10 border-b border-red-200 bg-white/80 backdrop-blur-md dark:border-white/10 dark:bg-black/40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-red-600 dark:text-[#f53c56]">
              Finalize your page
            </p>
            <h1 className="text-sm md:text-base font-semibold text-slate-900 dark:text-white">
              Edit your FLMLNK page
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {status && (
              <span className="text-[11px] text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-1 rounded-full dark:text-emerald-300/80 dark:bg-emerald-900/30 dark:border-emerald-600/40">
                {status}
              </span>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave("stay")}
              className="inline-flex items-center rounded-full border border-red-300 bg-white px-4 py-2 text-xs font-medium text-red-700 hover:border-red-400 hover:bg-red-50 transition disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/30 dark:hover:bg-white/10"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave("dashboard")}
              className="inline-flex items-center rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-red-600/30 hover:bg-red-500 hover:shadow-red-500/50 transition disabled:opacity-60"
            >
              {saving ? "Saving…" : "Dashboard"}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="relative z-10 bg-red-100 border-b border-red-300 text-red-700 text-xs px-4 py-2 dark:bg-red-950/70 dark:border-red-600/40 dark:text-red-100">
          <div className="max-w-6xl mx-auto">{error}</div>
        </div>
      )}

      <section className="relative z-10 max-w-6xl mx-auto px-4 py-6 md:py-10 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="md:hidden mb-4 px-1">
          <div className="mx-auto w-full max-w-xl rounded-full border border-red-200 bg-white p-1 shadow-lg shadow-red-200/30 dark:border-white/15 dark:bg-white/5 dark:shadow-black/30">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("edit")}
                className={`rounded-full px-4 py-3 text-base font-semibold transition-colors ${
                  activeTab === "edit"
                    ? "bg-red-100 text-red-700 shadow-inner shadow-red-200/30 dark:bg-white/20 dark:text-white dark:shadow-black/30"
                    : "text-slate-500 dark:text-white/70"
                }`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`rounded-full px-4 py-3 text-base font-semibold transition-colors ${
                  activeTab === "preview"
                    ? "bg-red-100 text-red-700 shadow-inner shadow-red-200/30 dark:bg-white/20 dark:text-white dark:shadow-black/30"
                    : "text-slate-500 dark:text-white/70"
                }`}
              >
                Preview
              </button>
            </div>
          </div>
        </div>

        {/* LEFT: editor form */}
        <div
          className={`space-y-5 ${
            activeTab === "edit" ? "block" : "hidden"
          } md:block`}
        >
          <div className="space-y-5 hidden md:block">
            {editorSections.map((section) => (
              <React.Fragment key={section.key}>{section.content}</React.Fragment>
            ))}
            {renderSaveButtons()}
          </div>

          <div className="space-y-4 md:hidden">
            <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-lg shadow-red-200/30 flex flex-col gap-3 dark:border-white/10 dark:bg-white/5 dark:shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500 dark:text-white/60">
                    Section {activeSectionIndex + 1} of {editorSections.length}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {editorSections[activeSectionIndex]?.title}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSectionIndex((index) => Math.max(0, index - 1))}
                    disabled={activeSectionIndex === 0}
                    className="inline-flex items-center rounded-full border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 transition hover:border-red-400 hover:bg-red-50 disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/30 dark:hover:bg-white/10"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveSectionIndex((index) =>
                        Math.min(editorSections.length - 1, index + 1),
                      )
                    }
                    disabled={activeSectionIndex === editorSections.length - 1}
                    className="inline-flex items-center rounded-full border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 transition hover:border-red-400 hover:bg-red-50 disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/30 dark:hover:bg-white/10"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {editorSections.map((section, index) => (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => setActiveSectionIndex(index)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] transition border ${
                      index === activeSectionIndex
                        ? "border-red-400 bg-red-100 text-red-700 dark:border-[#f53c56]/60 dark:bg-[#f53c56]/20 dark:text-white"
                        : "border-red-200 bg-white text-slate-500 hover:border-red-300 hover:bg-red-50 dark:border-white/15 dark:bg-white/5 dark:text-white/70 dark:hover:border-white/30 dark:hover:bg-white/10"
                    }`}
                  >
                    {index + 1}. {section.title}
                  </button>
                ))}
              </div>
            </div>

            {editorSections[activeSectionIndex]?.content}

            {renderSaveButtons("flex gap-3")}
          </div>
        </div>

        {/* RIGHT: live preview */}
        <div
          className={`space-y-4 ${
            activeTab === "preview" ? "block" : "hidden"
          } md:block`}
        >
          <section className="rounded-3xl border border-red-200 bg-white shadow-lg shadow-red-200/30 dark:border-white/10 dark:bg-gradient-to-br dark:from-black dark:via-[#1a0f1f] dark:to-[#2b0f1f] dark:shadow-[0_0_60px_rgba(255,23,68,0.15)]">
            <div className="flex items-center justify-between border-b border-red-200 px-5 py-4 dark:border-white/10">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-white/60">Live preview</p>
                <p className="text-sm text-slate-500 dark:text-white/60">Matches your published page hero.</p>
              </div>
              <Link
                href={buildPublicPageUrl(slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700 transition hover:border-red-400 hover:bg-red-50 dark:border-white/15 dark:bg-white/5 dark:text-white/80 dark:hover:border-white/30"
              >
                Open
              </Link>
            </div>
            <div className="relative aspect-[4/5] overflow-hidden rounded-b-3xl bg-black">
              <iframe
                key={previewKey}
                src={buildPublicPageUrl(slug, { ts: previewKey })}
                className="h-full w-full border-0"
                title="Public page preview"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </section>

          <div className="rounded-2xl border border-red-200 bg-white p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-gradient-to-br dark:from-black dark:via-[#0f0a16] dark:to-[#1a0f1f] dark:text-white/60">
            <p className="font-semibold text-slate-900 dark:text-white mb-2">Finish up here</p>
            <p className="leading-relaxed">
              Save to refresh the live preview, or use Dashboard to save and
              jump into your dashboard experience.
            </p>
          </div>
        </div>
      </section>

      {/* AI Chat Interface */}
      {editorData?.profile?._id && (
        <EditorChatInterface
          slug={slug}
          actorProfileId={editorData.profile._id}
          form={{
            displayName: form.displayName,
            headline: form.headline,
            bio: form.bio,
            location: form.location,
            avatarUrl: form.avatarUrl,
            project: form.project,
            clip: form.clip,
          }}
          onUpdateField={handleChatUpdateField}
        />
      )}
    </main>
  );
}

function EditorCard({
  title,
  children,
  isExpanded = true,
  onToggle,
}: {
  title: string;
  children: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
}) {
  const isCollapsible = onToggle !== undefined;

  return (
    <div className="rounded-2xl border border-red-200 bg-white shadow-lg shadow-red-200/30 dark:border-white/10 dark:bg-gradient-to-br dark:from-black dark:via-[#0f0a16] dark:to-[#1a0f1f] dark:shadow-[0_0_40px_rgba(0,0,0,0.35)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        disabled={!isCollapsible}
        className={`w-full flex items-center justify-between p-5 ${isExpanded ? "pb-0" : ""} ${isCollapsible ? "cursor-pointer hover:bg-red-50/50 dark:hover:bg-white/5 transition-colors" : "cursor-default"}`}
      >
        <h2 className="text-sm md:text-xs font-semibold tracking-[0.3em] uppercase text-red-600 dark:text-[#f53c56]">
          {title}
        </h2>
        {isCollapsible && (
          <svg
            className={`w-5 h-5 text-red-500 dark:text-[#f53c56] transition-transform duration-200 ${isExpanded ? "rotate-180" : "rotate-0"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      <div
        className={`transition-all duration-200 ease-in-out ${isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"}`}
      >
        <div className="p-5 pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}
