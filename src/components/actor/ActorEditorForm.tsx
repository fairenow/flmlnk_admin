"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { ChevronDown, ChevronUp, Plus, Trash2, Star } from "lucide-react";
import Image from "next/image";

export const ACTOR_GENRES = [
  "Drama",
  "Comedy",
  "Documentary",
  "Horror",
  "Thriller",
  "Action",
  "Sci-Fi",
  "Romance",
  "Animation",
  "Experimental",
  "Mystery",
  "Western",
];

export const ACTOR_STATUS_OPTIONS = [
  "Announced",
  "Pre-Production",
  "Filming",
  "Post-Production",
  "Released",
];

export type PlatformDraft = {
  key: string;
  label: string;
  url?: string;
};

export type ProfileDraft = {
  _id: Id<"actor_profiles">;
  userId: Id<"users">;
  slug: string;
  displayName: string;
  headline?: string;
  bio?: string;
  location?: string;
  avatarUrl?: string;
  imdbId?: string;
  imdbUrl?: string;
  genres: string[];
  platforms: PlatformDraft[];
};

export type ProjectDraft = {
  _id?: Id<"projects">;
  tempId?: string;
  title: string;
  logline?: string;
  description?: string;
  posterUrl?: string;
  resolvedPosterUrl?: string;
  releaseYear?: number;
  roleName?: string;
  roleType?: string;
  imdbTitleId?: string | null;
  tubiUrl?: string | null;
  primaryWatchLabel?: string | null;
  primaryWatchUrl?: string | null;
  trailerUrl?: string | null;
  status?: string;
  isFeatured?: boolean;
  _delete?: boolean;
};

export type ClipDraft = {
  _id?: Id<"clips">;
  title: string;
  youtubeUrl: string;
  sortOrder: number;
  isFeatured: boolean;
  _delete?: boolean;
  tempId?: string;
  stripePaymentUrl?: string;
};

export type OwnerPageData = {
  profile: ProfileDraft;
  projects: ProjectDraft[];
  clips: ClipDraft[];
  featuredProject: ProjectDraft | null;
};

export type ActorEditorDraft = {
  profile: ProfileDraft;
  projects: ProjectDraft[];
  clips: ClipDraft[];
};

export function normalizeOwnerData(data: OwnerPageData): ActorEditorDraft | null {
  const profile = data.profile;
  const projects = data.projects ?? [];

  if (!profile) return null;

  // If no projects exist, create a default one
  const normalizedProjects: ProjectDraft[] = projects.length > 0
    ? projects.map((project) => ({
        ...project,
        tempId: project._id ? String(project._id) : crypto.randomUUID(),
        logline: project.logline ?? "",
        description: project.description ?? "",
        posterUrl: project.posterUrl ?? "",
        resolvedPosterUrl: project.resolvedPosterUrl ?? "",
        releaseYear: project.releaseYear ?? undefined,
        roleName: project.roleName ?? "",
        roleType: project.roleType ?? "",
        status: project.status ?? "",
        imdbTitleId: project.imdbTitleId ?? null,
        tubiUrl: project.tubiUrl ?? null,
        primaryWatchLabel: project.primaryWatchLabel ?? "",
        primaryWatchUrl: project.primaryWatchUrl ?? "",
        trailerUrl: project.trailerUrl ?? "",
        isFeatured: project.isFeatured ?? false,
      }))
    : [{
        tempId: crypto.randomUUID(),
        title: "",
        logline: "",
        description: "",
        posterUrl: "",
        releaseYear: undefined,
        roleName: "",
        roleType: "",
        status: "",
        imdbTitleId: null,
        tubiUrl: null,
        primaryWatchLabel: "",
        primaryWatchUrl: "",
        trailerUrl: "",
        isFeatured: true,
      }];

  // Ensure at least one project is featured
  const hasFeatured = normalizedProjects.some((p) => p.isFeatured && !p._delete);
  if (!hasFeatured && normalizedProjects.length > 0) {
    normalizedProjects[0].isFeatured = true;
  }

  // Normalize all clips from the data
  const clips = (data.clips ?? []).map((clip) => ({
    ...clip,
    sortOrder: clip.sortOrder ?? 0,
    isFeatured: clip.isFeatured ?? false,
    tempId: clip._id ? String(clip._id) : crypto.randomUUID(),
  }));

  return {
    profile: {
      ...profile,
      headline: profile.headline ?? "",
      bio: profile.bio ?? "",
      location: profile.location ?? "",
      avatarUrl: profile.avatarUrl ?? "",
      imdbId: profile.imdbId ?? "",
      imdbUrl: profile.imdbUrl ?? "",
      genres: profile.genres ?? [],
      platforms: profile.platforms ?? [],
    },
    projects: normalizedProjects,
    clips,
  };
}

type ActorEditorFormProps = {
  draft: ActorEditorDraft;
  setDraft: Dispatch<SetStateAction<ActorEditorDraft | null>>;
  customGenre: string;
  setCustomGenre: Dispatch<SetStateAction<string>>;
  genreOptions?: string[];
  statusOptions?: string[];
  className?: string;
  variant?: "dashboard" | "onboarding";
  showSlugField?: boolean;
  allowClipRemoval?: boolean;
  slugLockedLabel?: string;
  showFeaturedWarning?: boolean;
};

const sectionBase = "space-y-4 rounded-2xl border-2 border-slate-600 bg-red-50 p-4 shadow-sm";
const inputBase =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#f53c56] focus:ring-2 focus:ring-[#f53c56]/30 focus:outline-none";
const textareaBase = `${inputBase} min-h-[100px]`;
const headingText = {
  dashboard: {
    profileTitle: "Identity & Bio",
    profileSubtitle: "Profile basics",
    profileDescription: "",
    projectTitle: "Showcase the main project",
    projectSubtitle: "Primary project",
    clipsTitle: "Clips & reels",
    clipsSubtitle: "Spotlight your best work",
  },
  onboarding: {
    profileTitle: "Identity & bio",
    profileSubtitle: "Profile basics",
    profileDescription:
      "This is how your FLMLNK page will look. Make any edits you need, then finish onboarding to access your dashboard.",
    projectTitle: "Showcase the main project",
    projectSubtitle: "Primary project",
    clipsTitle: "Clips & reels",
    clipsSubtitle: "Add at least one clip to feature your work.",
  },
};

export function ActorEditorForm({
  draft,
  setDraft,
  customGenre,
  setCustomGenre,
  genreOptions = ACTOR_GENRES,
  statusOptions = ACTOR_STATUS_OPTIONS,
  className,
  variant = "dashboard",
  showSlugField = false,
  allowClipRemoval = true,
  slugLockedLabel = "Slug locked",
  showFeaturedWarning = true,
}: ActorEditorFormProps) {
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  const profile = draft.profile;
  const visibleProjects = useMemo(
    () => (draft.projects ?? []).filter((project) => !project._delete),
    [draft.projects],
  );

  const visibleClips = useMemo(
    () => (draft.clips ?? []).filter((clip) => !clip._delete),
    [draft.clips],
  );

  const hasFeaturedClip = visibleClips.some((clip) => clip.isFeatured);
  const hasFeaturedProject = visibleProjects.some((project) => project.isFeatured);

  const handleProfileChange = (
    key: keyof ProfileDraft,
    value: string | string[] | PlatformDraft[],
  ) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            profile: {
              ...prev.profile,
              [key]: value,
            },
          }
        : prev,
    );
  };

  const handleProjectChange = (
    tempId: string,
    key: keyof ProjectDraft,
    value: string | number | boolean | null | undefined,
  ) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        projects: prev.projects.map((project) =>
          project.tempId === tempId
            ? { ...project, [key]: value }
            : project,
        ),
      };
    });
  };

  const addProject = () => {
    const newProject: ProjectDraft = {
      tempId: crypto.randomUUID(),
      title: "",
      logline: "",
      description: "",
      posterUrl: "",
      releaseYear: undefined,
      roleName: "",
      roleType: "",
      status: "",
      imdbTitleId: null,
      tubiUrl: null,
      primaryWatchLabel: "",
      primaryWatchUrl: "",
      trailerUrl: "",
      isFeatured: visibleProjects.length === 0,
    };
    setDraft((prev) => (prev ? { ...prev, projects: [...prev.projects, newProject] } : prev));
    setExpandedProjectId(newProject.tempId);
  };

  const removeProject = (tempId: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const updatedProjects = prev.projects.map((project) => {
        if (project.tempId !== tempId) return project;
        return { ...project, _delete: true, isFeatured: false };
      });
      // If we deleted the featured project, make the first remaining one featured
      const remainingProjects = updatedProjects.filter((p) => !p._delete);
      const hasFeatured = remainingProjects.some((p) => p.isFeatured);
      if (!hasFeatured && remainingProjects.length > 0) {
        const firstRemaining = remainingProjects[0];
        return {
          ...prev,
          projects: updatedProjects.map((p) =>
            p.tempId === firstRemaining.tempId ? { ...p, isFeatured: true } : p
          ),
        };
      }
      return { ...prev, projects: updatedProjects };
    });
    if (expandedProjectId === tempId) {
      setExpandedProjectId(null);
    }
  };

  const setFeaturedProject = (tempId: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        projects: prev.projects.map((project) => ({
          ...project,
          isFeatured: project.tempId === tempId && !project._delete,
        })),
      };
    });
  };

  const toggleProjectExpanded = (tempId: string) => {
    setExpandedProjectId((prev) => (prev === tempId ? null : tempId));
  };

  const handleClipChange = (tempId: string, updates: Partial<ClipDraft>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        clips: prev.clips.map((clip) =>
          clip.tempId === tempId
            ? {
                ...clip,
                ...updates,
              }
            : clip,
        ),
      };
    });
  };

  const addClip = () => {
    const newClip: ClipDraft = {
      tempId: crypto.randomUUID(),
      title: "",
      youtubeUrl: "",
      sortOrder: draft?.clips.length ?? 0,
      isFeatured: false,
    };
    setDraft((prev) => (prev ? { ...prev, clips: [...prev.clips, newClip] } : prev));
  };

  const removeClip = (tempId: string) => {
    if (!allowClipRemoval) return;
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        clips: prev.clips.map((clip) => {
          if (clip.tempId !== tempId) return clip;
          if (!clip._id) {
            return { ...clip, _delete: true };
          }
          return { ...clip, _delete: true, isFeatured: false };
        }),
      };
    });
  };

  const setFeaturedClip = (tempId: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        clips: prev.clips.map((clip) => ({
          ...clip,
          isFeatured: clip.tempId === tempId && !clip._delete,
        })),
      };
    });
  };

  const addPlatform = () => {
    const id = `platform-${Date.now()}`;
    handleProfileChange("platforms", [...(profile.platforms ?? []), { key: id, label: "", url: "" }]);
  };

  const removePlatform = (key: string) => {
    handleProfileChange(
      "platforms",
      (profile.platforms ?? []).filter((platform) => platform.key !== key),
    );
  };

  const toggleGenre = (genre: string) => {
    const exists = profile.genres.includes(genre);
    handleProfileChange(
      "genres",
      exists ? (profile.genres ?? []).filter((g) => g !== genre) : [...(profile.genres ?? []), genre],
    );
  };

  const addCustomGenre = () => {
    if (!customGenre.trim()) return;
    if (profile.genres.includes(customGenre.trim())) return;
    handleProfileChange("genres", [...(profile.genres ?? []), customGenre.trim()]);
    setCustomGenre("");
  };

  const sectionHeading = headingText[variant];

  return (
    <div className={className ?? "space-y-6"}>
      <div className={sectionBase}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{sectionHeading.profileSubtitle}</p>
            <h3 className="text-lg font-semibold text-slate-900">{sectionHeading.profileTitle}</h3>
            {sectionHeading.profileDescription && (
              <p className="text-sm text-slate-600">{sectionHeading.profileDescription}</p>
            )}
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{slugLockedLabel}</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-700">Display name *</span>
            <input
              type="text"
              value={profile.displayName}
              onChange={(e) => handleProfileChange("displayName", e.target.value)}
              className={inputBase}
              placeholder="Your name"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-700">Headline</span>
            <input
              type="text"
              value={profile.headline}
              onChange={(e) => handleProfileChange("headline", e.target.value)}
              className={inputBase}
              placeholder="Actor • Voiceover • Dancer"
            />
          </label>
        </div>
        <label className="space-y-1 text-sm">
          <span className="text-slate-700">Bio</span>
          <textarea
            value={profile.bio}
            onChange={(e) => handleProfileChange("bio", e.target.value)}
            className={textareaBase}
            placeholder="Tell the story you want casting to know."
          />
        </label>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-slate-700">Location</span>
            <input
              type="text"
              value={profile.location}
              onChange={(e) => handleProfileChange("location", e.target.value)}
              className={inputBase}
              placeholder="Los Angeles, CA"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-700">Avatar URL</span>
            <input
              type="url"
              value={profile.avatarUrl}
              onChange={(e) => handleProfileChange("avatarUrl", e.target.value)}
              className={inputBase}
              placeholder="https://..."
            />
          </label>
          {showSlugField && (
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">Slug (read-only)</span>
              <input
                type="text"
                value={profile.slug}
                readOnly
                className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500"
              />
            </label>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-700">IMDb ID</span>
            <input
              type="text"
              value={profile.imdbId}
              onChange={(e) => handleProfileChange("imdbId", e.target.value)}
              className={inputBase}
              placeholder="nm1234567"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-700">IMDb URL</span>
            <input
              type="url"
              value={profile.imdbUrl}
              onChange={(e) => handleProfileChange("imdbUrl", e.target.value)}
              className={inputBase}
              placeholder="https://www.imdb.com/name/..."
            />
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-600">Genres</p>
              <p className="text-sm text-slate-700">Pick everything that fits.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customGenre}
                onChange={(e) => setCustomGenre(e.target.value)}
                placeholder="Add custom genre"
                className={`${inputBase} w-40`}
              />
              <button
                type="button"
                onClick={addCustomGenre}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 transition hover:border-[#f53c56]"
              >
                Add
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {genreOptions.map((genre) => {
              const active = profile.genres.includes(genre);
              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() => toggleGenre(genre)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                    active
                      ? "border-[#ff4d79] bg-[#fff5f6] text-[#d6003d]"
                      : "border-slate-200 bg-white text-slate-900 hover:border-[#f53c56]"
                  }`}
                >
                  {genre}
                </button>
              );
            })}
          </div>
          {profile.genres.length > 0 && (
            <p className="text-xs text-slate-600">{profile.genres.length} genre(s) selected</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-600">Platforms</p>
              <p className="text-sm text-slate-700">Add where people can find you.</p>
            </div>
            <button
              type="button"
              onClick={addPlatform}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 transition hover:border-[#f53c56]"
            >
              Add platform
            </button>
          </div>
          <div className="space-y-3">
            {profile.platforms.map((platform) => (
              <div
                key={platform.key}
                className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-2"
              >
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700">Label</span>
                  <input
                    type="text"
                    value={platform.label}
                    onChange={(e) =>
                      handleProfileChange(
                        "platforms",
                        profile.platforms.map((p) =>
                          p.key === platform.key ? { ...p, label: e.target.value } : p,
                        ),
                      )
                    }
                    className={inputBase}
                    placeholder="Netflix"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700">URL</span>
                  <input
                    type="url"
                    value={platform.url ?? ""}
                    onChange={(e) =>
                      handleProfileChange(
                        "platforms",
                        profile.platforms.map((p) =>
                          p.key === platform.key ? { ...p, url: e.target.value } : p,
                        ),
                      )
                    }
                    className={inputBase}
                    placeholder="https://..."
                  />
                </label>
                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removePlatform(platform.key)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-900 transition hover:border-[#f53c56]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {profile.platforms.length === 0 && (
              <p className="text-sm text-slate-600">No platforms yet. Add Netflix, Tubi, YouTube, and more.</p>
            )}
          </div>
        </div>
      </div>

      <div className={sectionBase}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-600">{sectionHeading.projectSubtitle}</p>
            <h3 className="text-lg font-semibold">{sectionHeading.projectTitle}</h3>
            <p className="text-sm text-slate-600">Add multiple projects. The featured project displays in your hero section.</p>
          </div>
          <button
            type="button"
            onClick={addProject}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 transition hover:border-[#f53c56] hover:text-[#f53c56]"
          >
            <Plus className="h-4 w-4" />
            Add Project
          </button>
        </div>

        {!hasFeaturedProject && visibleProjects.length > 0 && (
          <p className="text-xs text-amber-600">Select one project to feature in your hero section.</p>
        )}

        <div className="space-y-3">
          {visibleProjects.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center">
              <p className="text-sm text-slate-500">No projects yet. Add your first project to get started.</p>
              <button
                type="button"
                onClick={addProject}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#f53c56] px-4 py-2 text-sm font-medium text-white hover:bg-[#e0354d]"
              >
                <Plus className="h-4 w-4" />
                Add Your First Project
              </button>
            </div>
          )}

          {visibleProjects.map((project, idx) => {
            const isExpanded = expandedProjectId === project.tempId;
            const posterUrl = project.resolvedPosterUrl || project.posterUrl;

            return (
              <div
                key={project.tempId}
                className={`rounded-xl border transition-all ${
                  project.isFeatured
                    ? "border-[#f53c56] bg-[#fff5f6]"
                    : "border-slate-200 bg-white"
                }`}
              >
                {/* Collapsed Header */}
                <div
                  className="flex cursor-pointer items-center gap-3 p-4"
                  onClick={() => toggleProjectExpanded(project.tempId!)}
                >
                  {/* Poster Thumbnail */}
                  <div className="relative h-16 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-200">
                    {posterUrl ? (
                      <Image
                        src={posterUrl}
                        alt={project.title || "Project poster"}
                        fill
                        className="object-cover"
                        sizes="48px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                        No poster
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate font-semibold text-slate-900">
                        {project.title || `Project ${idx + 1}`}
                      </h4>
                      {project.isFeatured && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#f53c56] px-2 py-0.5 text-xs font-medium text-white">
                          <Star className="h-3 w-3" fill="currentColor" />
                          Featured
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-slate-500">
                      {project.releaseYear && `${project.releaseYear} • `}
                      {project.roleName || "No role specified"}
                      {project.status && ` • ${project.status}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {!project.isFeatured && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFeaturedProject(project.tempId!);
                        }}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-[#f53c56] hover:text-[#f53c56]"
                      >
                        Set Featured
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeProject(project.tempId!);
                      }}
                      className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Form */}
                {isExpanded && (
                  <div className="space-y-4 border-t border-slate-200 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        <span className="text-slate-700">Title *</span>
                        <input
                          type="text"
                          value={project.title}
                          onChange={(e) => handleProjectChange(project.tempId!, "title", e.target.value)}
                          className={inputBase}
                          placeholder="Project title"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-slate-700">Logline</span>
                        <input
                          type="text"
                          value={project.logline ?? ""}
                          onChange={(e) => handleProjectChange(project.tempId!, "logline", e.target.value)}
                          className={inputBase}
                          placeholder="A one-sentence hook"
                        />
                      </label>
                    </div>
                    <label className="block space-y-1 text-sm">
                      <span className="text-slate-700">Description</span>
                      <textarea
                        value={project.description ?? ""}
                        onChange={(e) => handleProjectChange(project.tempId!, "description", e.target.value)}
                        className={textareaBase}
                        placeholder="Brief summary or synopsis"
                      />
                    </label>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        <span className="text-slate-700">Poster URL</span>
                        <input
                          type="url"
                          value={project.posterUrl ?? ""}
                          onChange={(e) => handleProjectChange(project.tempId!, "posterUrl", e.target.value)}
                          className={inputBase}
                          placeholder="https://..."
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-slate-700">Release year</span>
                        <input
                          type="number"
                          value={project.releaseYear ?? ""}
                          onChange={(e) =>
                            handleProjectChange(
                              project.tempId!,
                              "releaseYear",
                              e.target.value ? Number.parseInt(e.target.value, 10) : undefined,
                            )
                          }
                          className={inputBase}
                          placeholder="2024"
                        />
                      </label>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <label className="space-y-1 text-sm">
                        <span className="text-slate-700">Role name</span>
                        <input
                          type="text"
                          value={project.roleName ?? ""}
                          onChange={(e) => handleProjectChange(project.tempId!, "roleName", e.target.value)}
                          className={inputBase}
                          placeholder="Character"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-slate-700">Role type</span>
                        <input
                          type="text"
                          value={project.roleType ?? ""}
                          onChange={(e) => handleProjectChange(project.tempId!, "roleType", e.target.value)}
                          className={inputBase}
                          placeholder="Lead, Supporting, Cameo"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-slate-700">Status</span>
                        <select
                          value={project.status ?? ""}
                          onChange={(e) => handleProjectChange(project.tempId!, "status", e.target.value)}
                          className={inputBase}
                        >
                          <option value="">Select status</option>
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        <span className="text-slate-700">Hero CTA label</span>
                        <input
                          type="text"
                          value={project.primaryWatchLabel ?? ""}
                          onChange={(e) => handleProjectChange(project.tempId!, "primaryWatchLabel", e.target.value)}
                          className={inputBase}
                          placeholder="Watch on Netflix"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-slate-700">Hero CTA URL</span>
                        <input
                          type="url"
                          value={project.primaryWatchUrl ?? ""}
                          onChange={(e) => handleProjectChange(project.tempId!, "primaryWatchUrl", e.target.value)}
                          className={inputBase}
                          placeholder="https://netflix.com/..."
                        />
                      </label>
                    </div>
                    <p className="text-xs text-slate-600">Shown on the hero project button for your public page.</p>
                    <label className="block space-y-1 text-sm">
                      <span className="text-slate-700">Trailer URL (YouTube or Vimeo)</span>
                      <input
                        type="url"
                        value={project.trailerUrl ?? ""}
                        onChange={(e) => handleProjectChange(project.tempId!, "trailerUrl", e.target.value)}
                        className={inputBase}
                        placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..."
                      />
                      <p className="text-xs text-slate-500">This trailer will play in your hero section when this project is selected.</p>
                    </label>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        <span className="text-slate-700">IMDb title ID</span>
                        <input
                          type="text"
                          value={project.imdbTitleId ?? ""}
                          onChange={(e) => handleProjectChange(project.tempId!, "imdbTitleId", e.target.value)}
                          className={inputBase}
                          placeholder="tt1234567"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-slate-700">Tubi URL</span>
                        <input
                          type="url"
                          value={project.tubiUrl ?? ""}
                          onChange={(e) => handleProjectChange(project.tempId!, "tubiUrl", e.target.value)}
                          className={inputBase}
                          placeholder="https://tubitv.com/..."
                        />
                      </label>
                    </div>
                    <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                      {!project.isFeatured && (
                        <button
                          type="button"
                          onClick={() => setFeaturedProject(project.tempId!)}
                          className="inline-flex items-center gap-2 rounded-lg border border-[#f53c56] px-4 py-2 text-sm font-medium text-[#f53c56] hover:bg-[#fff5f6]"
                        >
                          <Star className="h-4 w-4" />
                          Set as Featured
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeProject(project.tempId!)}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Project
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={sectionBase}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-600">{sectionHeading.clipsSubtitle}</p>
            <h3 className="text-lg font-semibold">{sectionHeading.clipsTitle}</h3>
          </div>
          <button
            type="button"
            onClick={addClip}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 transition hover:border-[#f53c56]"
          >
            Add clip
          </button>
        </div>
        <div className="space-y-4">
          {visibleClips.length === 0 && (
            <p className="text-sm text-slate-600">No clips yet. Add your reels or performances.</p>
          )}
          {visibleClips.map((clip, idx) => (
            <div key={clip.tempId} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-700">Clip {idx + 1}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFeaturedClip(clip.tempId!)}
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      clip.isFeatured
                        ? "bg-[#ff4d79] text-white"
                        : "border border-slate-200 bg-white text-slate-800 hover:border-[#f53c56]"
                    }`}
                  >
                    {clip.isFeatured ? "Featured" : "Mark featured"}
                  </button>
                  {allowClipRemoval && (
                    <button
                      type="button"
                      onClick={() => removeClip(clip.tempId!)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-900 transition hover:border-[#f53c56]"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700">Title</span>
                  <input
                    type="text"
                    value={clip.title}
                    onChange={(e) => handleClipChange(clip.tempId!, { title: e.target.value })}
                    className={inputBase}
                    placeholder="Clip title"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700">Video URL</span>
                  <input
                    type="url"
                    value={clip.youtubeUrl}
                    onChange={(e) => handleClipChange(clip.tempId!, { youtubeUrl: e.target.value })}
                    className={inputBase}
                    placeholder="YouTube or Vimeo URL"
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700">Sort order</span>
                  <input
                    type="number"
                    value={clip.sortOrder}
                    onChange={(e) =>
                      handleClipChange(clip.tempId!, {
                        sortOrder: Number.parseInt(e.target.value || "0", 10),
                      })
                    }
                    className={inputBase}
                  />
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                  <input
                    id={`featured-${clip.tempId}`}
                    type="checkbox"
                    checked={clip.isFeatured}
                    onChange={() => setFeaturedClip(clip.tempId!)}
                    className="h-4 w-4 accent-[#ff4d79]"
                  />
                  <label htmlFor={`featured-${clip.tempId}`} className="cursor-pointer">
                    Feature this clip
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
        {!hasFeaturedClip && visibleClips.length > 0 && showFeaturedWarning && (
          <p className="text-xs text-amber-300">Pick one clip to feature on your page.</p>
        )}
      </div>
    </div>
  );
}

export default ActorEditorForm;
