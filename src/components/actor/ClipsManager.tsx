"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Plus, Trash2, X, Video, GripVertical } from "lucide-react";
import { getVideoInfo, getVideoThumbnailUrl } from "@/utils/videoApi";

type Clip = {
  _id: Id<"clips">;
  title: string;
  youtubeUrl: string;
  description?: string | null;
  sortOrder?: number | null;
  isFeatured?: boolean | null;
};

type ClipsManagerProps = {
  slug: string;
  clips: Clip[];
  onClipsChange?: () => void;
};

export function ClipsManager({ slug, clips, onClipsChange }: ClipsManagerProps) {
  const [showNewClipForm, setShowNewClipForm] = useState(false);
  const [newClip, setNewClip] = useState({ title: "", youtubeUrl: "" });
  const [editingClipId, setEditingClipId] = useState<Id<"clips"> | null>(null);
  const [editingClip, setEditingClip] = useState<{ title: string; youtubeUrl: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string | null>>({});

  const addClip = useMutation(api.filmmakers.addClip);
  const updateClip = useMutation(api.filmmakers.updateClip);
  const deleteClip = useMutation(api.filmmakers.deleteClip);

  const inputClasses =
    "w-full rounded-lg border border-red-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 focus:outline-none transition-colors dark:border-white/10 dark:bg-black/40 dark:text-white dark:placeholder:text-white/40 dark:focus:border-[#f53c56] dark:focus:ring-[#f53c56]/30";

  // Check if URL is a valid video URL (YouTube or Vimeo)
  const isValidVideoUrl = useCallback((url: string): boolean => {
    const { provider, id } = getVideoInfo(url);
    return provider !== null && id !== null;
  }, []);

  const requestThumbnail = useCallback(
    async (videoUrl: string) => {
      if (!videoUrl || thumbnailCache[videoUrl] !== undefined) return;
      if (!isValidVideoUrl(videoUrl)) {
        setThumbnailCache((prev) => ({ ...prev, [videoUrl]: null }));
        return;
      }

      try {
        const thumbnail = await getVideoThumbnailUrl(videoUrl);
        setThumbnailCache((prev) => ({ ...prev, [videoUrl]: thumbnail ?? null }));
      } catch (err) {
        console.error('Failed to load video thumbnail', err);
        setThumbnailCache((prev) => ({ ...prev, [videoUrl]: null }));
      }
    },
    [thumbnailCache, isValidVideoUrl],
  );

  useEffect(() => {
    if (newClip.youtubeUrl) {
      requestThumbnail(newClip.youtubeUrl.trim());
    }
  }, [newClip.youtubeUrl, requestThumbnail]);

  useEffect(() => {
    clips
      .filter((clip) => !clip.isFeatured)
      .forEach((clip) => {
        requestThumbnail(clip.youtubeUrl);
      });
  }, [clips, requestThumbnail]);

  // Get display info for the video provider
  const getVideoProviderLabel = (url: string): string | null => {
    const { provider } = getVideoInfo(url);
    if (provider === 'youtube') return 'YouTube';
    if (provider === 'vimeo') return 'Vimeo';
    return null;
  };

  const handleAddClip = async () => {
    if (!newClip.title.trim() || !newClip.youtubeUrl.trim()) {
      setError("Title and video URL are required");
      return;
    }

    if (!isValidVideoUrl(newClip.youtubeUrl)) {
      setError("Please enter a valid YouTube or Vimeo URL");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await addClip({
        slug,
        title: newClip.title.trim(),
        youtubeUrl: newClip.youtubeUrl.trim(),
      });

      setNewClip({ title: "", youtubeUrl: "" });
      setShowNewClipForm(false);
      onClipsChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add clip");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateClip = async (clipId: Id<"clips">) => {
    if (!editingClip?.title.trim() || !editingClip?.youtubeUrl.trim()) {
      setError("Title and video URL are required");
      return;
    }

    if (!isValidVideoUrl(editingClip.youtubeUrl)) {
      setError("Please enter a valid YouTube or Vimeo URL");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateClip({
        slug,
        clipId,
        title: editingClip.title.trim(),
        youtubeUrl: editingClip.youtubeUrl.trim(),
      });

      setEditingClipId(null);
      setEditingClip(null);
      onClipsChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update clip");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClip = async (clipId: Id<"clips">) => {
    if (!confirm("Are you sure you want to delete this clip?")) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await deleteClip({ slug, clipId });
      onClipsChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete clip");
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (clip: Clip) => {
    setEditingClipId(clip._id);
    setEditingClip({ title: clip.title, youtubeUrl: clip.youtubeUrl });
  };

  const cancelEditing = () => {
    setEditingClipId(null);
    setEditingClip(null);
  };

  // Filter out the featured clip (it's managed separately)
  const nonFeaturedClips = clips.filter((c) => !c.isFeatured);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 dark:text-white/50">Add YouTube or Vimeo clips to showcase your work</p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewClipForm(true)}
          disabled={showNewClipForm}
          className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 transition hover:border-red-500 hover:text-red-600 disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-[#f53c56] dark:hover:text-[#f53c56]"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Clip
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* New Clip Form */}
      {showNewClipForm && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 space-y-3 dark:border-[#f53c56]/30 dark:bg-[#f53c56]/5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-900 dark:text-white">Add New Clip</span>
            <button
              type="button"
              onClick={() => {
                setShowNewClipForm(false);
                setNewClip({ title: "", youtubeUrl: "" });
              }}
              className="text-slate-500 hover:text-slate-700 dark:text-white/50 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Clip title (e.g., 'Scene from The Movie')"
              value={newClip.title}
              onChange={(e) => setNewClip((prev) => ({ ...prev, title: e.target.value }))}
              className={inputClasses}
            />
            <input
              type="url"
              placeholder="YouTube or Vimeo URL"
              value={newClip.youtubeUrl}
              onChange={(e) => setNewClip((prev) => ({ ...prev, youtubeUrl: e.target.value }))}
              className={inputClasses}
            />
          </div>

          {newClip.youtubeUrl && isValidVideoUrl(newClip.youtubeUrl) && (
            <div className="flex items-center gap-3">
              <div className="w-20 h-12 rounded border border-red-200 bg-white overflow-hidden dark:border-white/10">
                <img
                  src={thumbnailCache[newClip.youtubeUrl] ?? "/white.png"}
                  alt="Video thumbnail"
                  className="w-full h-full object-contain bg-white"
                />
              </div>
              <span className="text-xs text-slate-500 dark:text-white/50">
                {getVideoProviderLabel(newClip.youtubeUrl)} video
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowNewClipForm(false);
                setNewClip({ title: "", youtubeUrl: "" });
              }}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-red-50 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddClip}
              disabled={saving || !newClip.title || !newClip.youtubeUrl}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50 dark:bg-[#f53c56] dark:hover:bg-[#e0354d]"
            >
              {saving ? "Adding..." : "Add Clip"}
            </button>
          </div>
        </div>
      )}

      {/* Clips List */}
      <div className="space-y-2">
        {nonFeaturedClips.map((clip) => (
          <div
            key={clip._id}
            className="rounded-xl border border-red-200 bg-white overflow-hidden dark:border-white/10 dark:bg-black/20"
          >
            {editingClipId === clip._id ? (
              /* Editing Mode */
              <div className="p-4 space-y-3">
                <input
                  type="text"
                  value={editingClip?.title ?? ""}
                  onChange={(e) =>
                    setEditingClip((prev) => prev ? { ...prev, title: e.target.value } : null)
                  }
                  className={inputClasses}
                  placeholder="Clip title"
                />
                <input
                  type="url"
                  value={editingClip?.youtubeUrl ?? ""}
                  onChange={(e) =>
                    setEditingClip((prev) => prev ? { ...prev, youtubeUrl: e.target.value } : null)
                  }
                  className={inputClasses}
                  placeholder="YouTube or Vimeo URL"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-red-50 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateClip(clip._id)}
                    disabled={saving}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50 dark:bg-[#f53c56] dark:hover:bg-[#e0354d]"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              /* Display Mode */
              <div className="flex items-center gap-3 p-3">
                <div className="flex-shrink-0 text-slate-300 dark:text-white/30">
                  <GripVertical className="w-4 h-4" />
                </div>

                {/* Thumbnail */}
                <div className="flex-shrink-0 w-16 h-10 rounded overflow-hidden border border-red-200 bg-white dark:border-white/10">
                  <img
                    src={thumbnailCache[clip.youtubeUrl] ?? "/white.png"}
                    alt={clip.title}
                    className="w-full h-full object-contain bg-white"
                  />
                </div>

                {/* Title */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{clip.title}</p>
                  <p className="text-[11px] text-slate-400 dark:text-white/40 truncate">{clip.youtubeUrl}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEditing(clip)}
                    className="rounded-lg px-2 py-1 text-[11px] text-slate-500 hover:bg-red-50 hover:text-red-700 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteClip(clip._id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:text-white/40 dark:hover:bg-red-500/20 dark:hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {nonFeaturedClips.length === 0 && !showNewClipForm && (
          <div className="rounded-xl border border-dashed border-red-200 bg-white p-6 text-center dark:border-white/20 dark:bg-transparent">
            <Video className="w-8 h-8 mx-auto text-slate-300 dark:text-white/30 mb-2" />
            <p className="text-sm text-slate-500 dark:text-white/50">No clips yet</p>
            <p className="text-xs text-slate-400 dark:text-white/30 mt-1">Add YouTube or Vimeo clips to showcase more of your work</p>
            <button
              type="button"
              onClick={() => setShowNewClipForm(true)}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-500 dark:bg-[#f53c56] dark:hover:bg-[#e0354d]"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Your First Clip
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ClipsManager;
