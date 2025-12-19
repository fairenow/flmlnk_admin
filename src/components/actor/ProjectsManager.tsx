"use client";

import React, { useState, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import Image from "next/image";
import { Plus, Trash2, Star, Upload, Link as LinkIcon, GripVertical, X } from "lucide-react";

type Project = {
  _id: Id<"projects">;
  title: string;
  logline?: string | null;
  description?: string | null;
  posterUrl?: string | null;
  posterStorageId?: Id<"_storage"> | null;
  resolvedPosterUrl?: string;
  releaseYear?: number | null;
  roleName?: string | null;
  roleType?: string | null;
  status?: string | null;
  primaryWatchLabel?: string | null;
  primaryWatchUrl?: string | null;
  trailerUrl?: string | null;
  matchScore?: number | null;
  ratingCategory?: string | null;
  formatTags?: string[] | null;
  isFeatured?: boolean | null;
  sortOrder?: number | null;
};

type ProjectsManagerProps = {
  slug: string;
  projects: Project[];
  onProjectsChange?: () => void;
};

const STATUS_OPTIONS = [
  "in-development",
  "pre-production",
  "filming",
  "post-production",
  "festival",
  "released",
];

const RATING_OPTIONS = ["G", "PG", "PG-13", "R", "NC-17", "TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14", "TV-MA", "NR"];

export function ProjectsManager({ slug, projects, onProjectsChange }: ProjectsManagerProps) {
  const [expandedProjectId, setExpandedProjectId] = useState<Id<"projects"> | "new" | null>(null);
  const [newProject, setNewProject] = useState<Partial<Project> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addProject = useMutation(api.filmmakers.addProject);
  const updateProject = useMutation(api.filmmakers.updateProject);
  const deleteProject = useMutation(api.filmmakers.deleteProject);
  const generateUploadUrl = useMutation(api.filmmakers.generatePosterUploadUrl);

  const inputClasses =
    "w-full rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 focus:outline-none transition-colors dark:border-white/10 dark:bg-black/50 dark:text-white dark:placeholder:text-white/40 dark:focus:border-[#f53c56] dark:focus:ring-[#f53c56]/30";
  const textareaClasses = `${inputClasses} min-h-[80px]`;

  const handleStartNewProject = () => {
    setNewProject({
      title: "",
      logline: "",
      description: "",
      posterUrl: "",
      releaseYear: new Date().getFullYear(),
      roleName: "",
      roleType: "",
      status: "in-development",
      primaryWatchLabel: "",
      primaryWatchUrl: "",
      trailerUrl: "",
    });
    setExpandedProjectId("new");
  };

  const handleCancelNew = () => {
    setNewProject(null);
    setExpandedProjectId(null);
  };

  const handlePosterUpload = async (
    file: File,
    _projectId?: Id<"projects">
  ): Promise<{ storageId: Id<"_storage">; url: string } | null> => {
    try {
      setUploading(true);
      setError(null);

      // Get upload URL
      const uploadUrl = await generateUploadUrl();

      // Upload file
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!response.ok) {
        throw new Error("Failed to upload file");
      }

      const { storageId } = await response.json();

      return { storageId, url: uploadUrl };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    projectId?: Id<"projects">
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB");
      return;
    }

    const result = await handlePosterUpload(file, projectId);
    if (result) {
      if (projectId) {
        // Update existing project
        await updateProject({
          slug,
          projectId,
          posterStorageId: result.storageId,
        });
        onProjectsChange?.();
      } else if (newProject) {
        // Update new project draft
        setNewProject((prev) => ({
          ...prev,
          posterStorageId: result.storageId as Id<"_storage">,
          posterUrl: "", // Clear URL if uploading file
        }));
      }
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSaveNewProject = async () => {
    if (!newProject?.title) {
      setError("Project title is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await addProject({
        slug,
        title: newProject.title,
        logline: newProject.logline || undefined,
        description: newProject.description || undefined,
        posterUrl: newProject.posterUrl || undefined,
        posterStorageId: newProject.posterStorageId as Id<"_storage"> | undefined,
        releaseYear: newProject.releaseYear || undefined,
        roleName: newProject.roleName || undefined,
        roleType: newProject.roleType || undefined,
        status: newProject.status || undefined,
        primaryWatchLabel: newProject.primaryWatchLabel || undefined,
        primaryWatchUrl: newProject.primaryWatchUrl || undefined,
        trailerUrl: newProject.trailerUrl || undefined,
        matchScore: newProject.matchScore || undefined,
        ratingCategory: newProject.ratingCategory || undefined,
        formatTags: newProject.formatTags || undefined,
      });

      setNewProject(null);
      setExpandedProjectId(null);
      onProjectsChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProject = async (projectId: Id<"projects">, updates: Partial<Project>) => {
    setSaving(true);
    setError(null);

    try {
      await updateProject({
        slug,
        projectId,
        title: updates.title,
        logline: updates.logline ?? undefined,
        description: updates.description ?? undefined,
        posterUrl: updates.posterUrl ?? undefined,
        releaseYear: updates.releaseYear ?? undefined,
        roleName: updates.roleName ?? undefined,
        roleType: updates.roleType ?? undefined,
        status: updates.status ?? undefined,
        primaryWatchLabel: updates.primaryWatchLabel ?? undefined,
        primaryWatchUrl: updates.primaryWatchUrl ?? undefined,
        trailerUrl: updates.trailerUrl ?? undefined,
        matchScore: updates.matchScore ?? undefined,
        ratingCategory: updates.ratingCategory ?? undefined,
        formatTags: updates.formatTags ?? undefined,
        isFeatured: updates.isFeatured ?? undefined,
      });
      onProjectsChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update project");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async (projectId: Id<"projects">) => {
    if (!confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await deleteProject({ slug, projectId });
      setExpandedProjectId(null);
      onProjectsChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setSaving(false);
    }
  };

  const handleSetFeatured = async (projectId: Id<"projects">) => {
    await handleUpdateProject(projectId, { isFeatured: true });
  };

  return (
    <div className="space-y-4 text-slate-900 dark:text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-white/50">Your Projects</p>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Films & Projects</h3>
          <p className="text-sm text-slate-600 dark:text-white/70">Add unlimited projects to showcase your work</p>
        </div>
        <button
          type="button"
          onClick={handleStartNewProject}
          disabled={newProject !== null}
          className="inline-flex items-center gap-2 rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-400 hover:bg-red-50 disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/40 dark:hover:bg-white/10"
        >
          <Plus className="w-4 h-4" />
          Add Project
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-200 hover:text-red-100"
          >
            <X className="w-4 h-4 inline" />
          </button>
        </div>
      )}

      {/* New Project Form */}
      {newProject && expandedProjectId === "new" && (
        <div className="rounded-2xl border-2 border-dashed border-red-200 bg-white p-6 space-y-4 dark:border-white/15 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-slate-900 dark:text-white">New Project</h4>
            <button
              type="button"
              onClick={handleCancelNew}
              className="text-slate-500 hover:text-slate-700 dark:text-white/60 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <ProjectForm
            project={newProject}
            onChange={setNewProject}
            onFileSelect={(e) => handleFileSelect(e)}
            uploading={uploading}
            inputClasses={inputClasses}
            textareaClasses={textareaClasses}
          />

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCancelNew}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:border-red-400 hover:bg-red-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/30 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveNewProject}
              disabled={saving || !newProject.title}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 dark:bg-[#f53c56] dark:hover:bg-[#e0354d]"
            >
              {saving ? "Saving..." : "Create Project"}
            </button>
          </div>
        </div>
      )}

      {/* Existing Projects */}
      <div className="space-y-3">
        {projects.map((project) => (
          <ProjectCard
            key={project._id}
            project={project}
            isExpanded={expandedProjectId === project._id}
            onToggle={() =>
              setExpandedProjectId(expandedProjectId === project._id ? null : project._id)
            }
            onUpdate={(updates) => handleUpdateProject(project._id, updates)}
            onDelete={() => handleDeleteProject(project._id)}
            onSetFeatured={() => handleSetFeatured(project._id)}
            onFileSelect={(e) => handleFileSelect(e, project._id)}
            uploading={uploading}
            saving={saving}
            inputClasses={inputClasses}
            textareaClasses={textareaClasses}
          />
        ))}

        {projects.length === 0 && !newProject && (
          <div className="rounded-2xl border-2 border-dashed border-red-200 bg-white p-8 text-center text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
            <p>No projects yet. Add your first project to get started.</p>
            <button
              type="button"
              onClick={handleStartNewProject}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-red-600/30 hover:bg-red-500 hover:shadow-red-500/50 transition disabled:opacity-50 dark:bg-gradient-to-r dark:from-black dark:via-[#f53c56] dark:to-[#f53c56] dark:shadow-[#f53c56]/30 dark:hover:shadow-[#f53c56]/50"
            >
              <Plus className="w-4 h-4" />
              Add Your First Project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type ProjectFormProps = {
  project: Partial<Project>;
  onChange: (project: Partial<Project> | ((prev: Partial<Project> | null) => Partial<Project> | null)) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean;
  inputClasses: string;
  textareaClasses: string;
};

function ProjectForm({
  project,
  onChange,
  onFileSelect,
  uploading,
  inputClasses,
  textareaClasses,
}: ProjectFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [posterMode, setPosterMode] = useState<"url" | "upload">(
    project.posterStorageId ? "upload" : "url"
  );

  const handleChange = (key: keyof Project, value: any) => {
    onChange((prev) => prev ? { ...prev, [key]: value } : { [key]: value });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-white/80">Title *</span>
          <input
            type="text"
            value={project.title || ""}
            onChange={(e) => handleChange("title", e.target.value)}
            className={inputClasses}
            placeholder="Project title"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-white/80">Release Year</span>
          <input
            type="number"
            value={project.releaseYear || ""}
            onChange={(e) => handleChange("releaseYear", e.target.value ? Number(e.target.value) : undefined)}
            className={inputClasses}
            placeholder="2024"
          />
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-slate-700 dark:text-white/80">Logline</span>
        <input
          type="text"
          value={project.logline || ""}
          onChange={(e) => handleChange("logline", e.target.value)}
          className={inputClasses}
          placeholder="A one-sentence description of your project"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-slate-700 dark:text-white/80">Description</span>
        <textarea
          value={project.description || ""}
          onChange={(e) => handleChange("description", e.target.value)}
          className={textareaClasses}
          placeholder="Full synopsis or description"
        />
      </label>

      {/* Poster Image Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-700 dark:text-white/80">Movie Poster</span>
          <div className="flex rounded-lg border border-red-200 bg-white overflow-hidden dark:border-white/15 dark:bg-white/5">
            <button
              type="button"
              onClick={() => setPosterMode("url")}
              className={`px-3 py-1 text-xs transition ${posterMode === "url" ? "bg-red-600 text-white dark:bg-[#f53c56]" : "bg-transparent text-slate-600 hover:bg-red-50 dark:text-white/70 dark:hover:bg-white/10"}`}
            >
              <LinkIcon className="w-3 h-3 inline mr-1" />
              URL
            </button>
            <button
              type="button"
              onClick={() => setPosterMode("upload")}
              className={`px-3 py-1 text-xs transition ${posterMode === "upload" ? "bg-red-600 text-white dark:bg-[#f53c56]" : "bg-transparent text-slate-600 hover:bg-red-50 dark:text-white/70 dark:hover:bg-white/10"}`}
            >
              <Upload className="w-3 h-3 inline mr-1" />
              Upload
            </button>
          </div>
        </div>

        {posterMode === "url" ? (
          <input
            type="url"
            value={project.posterUrl || ""}
            onChange={(e) => handleChange("posterUrl", e.target.value)}
            className={inputClasses}
            placeholder="https://example.com/poster.jpg"
          />
        ) : (
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 rounded-lg border border-dashed border-red-300 px-4 py-3 text-sm text-slate-700 hover:border-red-500 hover:text-red-600 disabled:opacity-50 dark:border-white/20 dark:text-white dark:hover:border-[#f53c56] dark:hover:text-[#f53c56]"
            >
              <Upload className="w-4 h-4" />
              {uploading ? "Uploading..." : "Choose Image"}
            </button>
            {(project.resolvedPosterUrl || project.posterStorageId) && (
              <span className="text-xs text-green-400">Image uploaded</span>
            )}
          </div>
        )}

        {/* Poster Preview */}
        {(project.posterUrl || project.resolvedPosterUrl) && (
          <div className="relative w-24 h-36 rounded-lg overflow-hidden bg-slate-100 border border-red-200 dark:bg-white/5 dark:border-white/15">
            <Image
              src={project.resolvedPosterUrl || project.posterUrl || ""}
              alt="Poster preview"
              fill
              className="object-cover"
            />
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-white/80">Your Role</span>
          <input
            type="text"
            value={project.roleName || ""}
            onChange={(e) => handleChange("roleName", e.target.value)}
            className={inputClasses}
            placeholder="Character name"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-white/80">Role Type</span>
          <input
            type="text"
            value={project.roleType || ""}
            onChange={(e) => handleChange("roleType", e.target.value)}
            className={inputClasses}
            placeholder="Lead, Supporting, etc."
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-white/80">Status</span>
          <select
            value={project.status || ""}
            onChange={(e) => handleChange("status", e.target.value)}
            className={inputClasses}
          >
            <option value="">Select status</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-white/80">Watch Button Label</span>
          <input
            type="text"
            value={project.primaryWatchLabel || ""}
            onChange={(e) => handleChange("primaryWatchLabel", e.target.value)}
            className={inputClasses}
            placeholder="Watch on Netflix"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-white/80">Watch Button URL</span>
          <input
            type="url"
            value={project.primaryWatchUrl || ""}
            onChange={(e) => handleChange("primaryWatchUrl", e.target.value)}
            className={inputClasses}
            placeholder="https://netflix.com/..."
          />
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-slate-700 dark:text-white/80">Trailer URL</span>
        <input
          type="url"
          value={project.trailerUrl || ""}
          onChange={(e) => handleChange("trailerUrl", e.target.value)}
          className={inputClasses}
          placeholder="https://youtube.com/watch?v=..."
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-white/80">Rating</span>
          <select
            value={project.ratingCategory || ""}
            onChange={(e) => handleChange("ratingCategory", e.target.value)}
            className={inputClasses}
          >
            <option value="">Select rating</option>
            {RATING_OPTIONS.map((rating) => (
              <option key={rating} value={rating}>
                {rating}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-white/80">Match Score (0-100)</span>
          <input
            type="number"
            min="0"
            max="100"
            value={project.matchScore || ""}
            onChange={(e) => handleChange("matchScore", e.target.value ? Number(e.target.value) : undefined)}
            className={inputClasses}
            placeholder="98"
          />
        </label>
      </div>
    </div>
  );
}

type ProjectCardProps = {
  project: Project;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<Project>) => void;
  onDelete: () => void;
  onSetFeatured: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean;
  saving: boolean;
  inputClasses: string;
  textareaClasses: string;
};

function ProjectCard({
  project,
  isExpanded,
  onToggle,
  onUpdate,
  onDelete,
  onSetFeatured,
  onFileSelect,
  uploading,
  saving,
  inputClasses,
  textareaClasses,
}: ProjectCardProps) {
  const [localProject, setLocalProject] = useState<Partial<Project>>(project);
  const [hasChanges, setHasChanges] = useState(false);

  const _handleLocalChange = (updates: Partial<Project>) => {
    setLocalProject((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onUpdate(localProject);
    setHasChanges(false);
  };

  const handleCancel = () => {
    setLocalProject(project);
    setHasChanges(false);
    onToggle();
  };

  const posterUrl = project.resolvedPosterUrl || project.posterUrl;

  return (
    <div
      className={`rounded-2xl border transition-all ${
        project.isFeatured
          ? "border-red-400 bg-red-50 shadow-lg shadow-red-200/30 dark:border-[#f53c56]/70 dark:bg-[#f53c56]/10 dark:shadow-[#f53c56]/20"
          : "border-red-200 bg-white dark:border-white/10 dark:bg-white/5"
      }`}
    >
      {/* Collapsed View */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex-shrink-0 text-slate-400 dark:text-white/50">
          <GripVertical className="w-5 h-5" />
        </div>

        {/* Poster Thumbnail */}
        <div className="flex-shrink-0 w-12 h-18 rounded-lg overflow-hidden bg-slate-100 border border-red-200 dark:bg-white/5 dark:border-white/15">
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={project.title}
              width={48}
              height={72}
              className="object-cover w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-white/50 text-xs">
              No poster
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-slate-900 dark:text-white truncate">{project.title}</h4>
            {project.isFeatured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 dark:bg-[#f53c56] px-2 py-0.5 text-xs font-medium text-white">
                <Star className="w-3 h-3" fill="currentColor" />
                Featured
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 dark:text-white/70 truncate">
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
                onSetFeatured();
              }}
              className="rounded-full border border-red-300 px-3 py-1 text-xs text-red-700 hover:border-red-500 hover:text-red-600 dark:border-white/15 dark:text-white dark:hover:border-[#f53c56] dark:hover:text-[#f53c56]"
            >
              Set Featured
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded-full p-2 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:text-white/50 dark:hover:bg-red-500/10 dark:hover:text-red-300"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded View */}
      {isExpanded && (
        <div className="border-t border-red-200 p-6 space-y-4 dark:border-white/10">
          <ProjectForm
            project={localProject}
            onChange={(updater) => {
              if (typeof updater === "function") {
                setLocalProject((prev) => {
                  const result = updater(prev);
                  return result || prev;
                });
              } else {
                setLocalProject(updater);
              }
              setHasChanges(true);
            }}
            onFileSelect={onFileSelect}
            uploading={uploading}
            inputClasses={inputClasses}
            textareaClasses={textareaClasses}
          />

          <div className="flex justify-between pt-4 border-t border-red-200 dark:border-white/10">
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-200 dark:hover:bg-red-900/40"
            >
              <Trash2 className="w-4 h-4" />
              Delete Project
            </button>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:border-red-400 hover:bg-red-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/30 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-600/30 hover:bg-red-500 hover:shadow-red-500/50 transition disabled:opacity-60 disabled:cursor-not-allowed dark:bg-gradient-to-r dark:from-black dark:via-[#f53c56] dark:to-[#f53c56] dark:shadow-[#f53c56]/30 dark:hover:shadow-[#f53c56]/50"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectsManager;
