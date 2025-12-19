"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

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

export default function OnboardingReviewPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-black text-white flex items-center justify-center">
          <p className="text-sm text-slate-300">Preparing your page…</p>
        </main>
      }
    >
      <OnboardingReviewPageContent />
    </Suspense>
  );
}

function OnboardingReviewPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const slugParam = params.get("slug");
  const onboardingStatus = useQuery(api.filmmakers.getOnboardingStatus, {});
  const slug = slugParam ?? onboardingStatus?.slug ?? "";

  const editorData = useQuery(
    api.filmmakers.getOwnerEditablePage,
    slug ? { slug } : "skip",
  );
  const updateOwnerPage = useMutation(api.filmmakers.updateOwnerPage);

  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local editable state
  const [form, setForm] = useState<FormState | null>(null);

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

  const isOwnerMissing = editorData === null;

  const handleSave = async (goToDashboard: boolean) => {
    if (!form || !editorData?.featuredProject || !editorData?.featuredClip) {
      return;
    }
    setSaving(true);
    setError(null);
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
        },
        featuredClip: {
          _id: editorData.featuredClip._id,
          title: form.clip.title,
          youtubeUrl: form.clip.youtubeUrl,
        },
      });

      if (goToDashboard) {
        router.push("/dashboard/actor");
      } else {
        router.push(`/f/${slug}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : null;
      setError(message ?? "Something went wrong saving your page.");
    } finally {
      setSaving(false);
    }
  };

  if (!slug) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-slate-300">
          Missing slug. Return to onboarding to restart.
        </p>
      </main>
    );
  }

  if (isOwnerMissing) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="space-y-3 text-center">
          <h1 className="text-xl font-semibold">Sign in to finish your page</h1>
          <p className="text-sm text-slate-400">
            We couldn&apos;t match this page to your account. Please sign in again.
          </p>
        </div>
      </main>
    );
  }

  if (editorData === undefined || !form) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-slate-300">Preparing your page…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#05040A] text-white">
      <header className="border-b border-white/5 bg-black/60 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Step 3 · Finalize your page
            </p>
            <h1 className="text-sm md:text-base font-semibold">
              Review &amp; polish your FLMLNK page
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setMode((m) => (m === "edit" ? "preview" : "edit"))
              }
              className="hidden md:inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200 hover:border-white/30"
            >
              {mode === "edit" ? "Preview" : "Edit"} mode
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(false)}
              className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:border-white/30 hover:bg-white/10 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(true)}
              className="inline-flex items-center rounded-full bg-[#f53c56] px-3 py-1.5 text-xs font-medium hover:bg-[#ff4b6a] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Dashboard"}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-red-950/70 border border-red-600/40 text-red-100 text-xs px-4 py-2">
          <div className="max-w-6xl mx-auto">{error}</div>
        </div>
      )}

      <section className="max-w-6xl mx-auto px-4 py-6 md:py-10 grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* LEFT: editor form */}
        <div className={mode === "preview" ? "hidden md:block" : ""}>
          {/* Profile */}
          <div className="space-y-4 rounded-2xl bg-[#0b0912] border border-white/5 p-4 mb-4">
            <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-slate-400">
              Profile
            </h2>
            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="text-slate-300">Display name</span>
                <input
                  className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-xs"
                  value={form.displayName}
                  onChange={(e) =>
                    setForm((f) => f && { ...f, displayName: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-300">Headline</span>
                <input
                  className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-xs"
                  value={form.headline}
                  onChange={(e) =>
                    setForm((f) => f && { ...f, headline: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-300">Location</span>
                <input
                  className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-xs"
                  value={form.location}
                  onChange={(e) =>
                    setForm((f) => f && { ...f, location: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-300">Bio</span>
                <textarea
                  className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-xs min-h-[80px]"
                  value={form.bio}
                  onChange={(e) =>
                    setForm((f) => f && { ...f, bio: e.target.value })
                  }
                />
              </label>
            </div>
          </div>

          {/* Featured project */}
          <div className="space-y-4 rounded-2xl bg-[#0b0912] border border-white/5 p-4 mb-4">
            <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-slate-400">
              Featured project
            </h2>
            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="text-slate-300">Title</span>
                <input
                  className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-xs"
                  value={form.project.title}
                  onChange={(e) =>
                    setForm((f) =>
                      f && { ...f, project: { ...f.project, title: e.target.value } },
                    )
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-300">Logline</span>
                <textarea
                  className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-xs min-h-[60px]"
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
                <label className="block space-y-1 flex-1">
                  <span className="text-slate-300">Release year</span>
                  <input
                    type="number"
                    className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-xs"
                    value={form.project.releaseYear ?? ""}
                    onChange={(e) =>
                      setForm((f) =>
                        f && {
                          ...f,
                          project: {
                            ...f.project,
                            releaseYear: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          },
                        },
                      )
                    }
                  />
                </label>
                <label className="block space-y-1 flex-1">
                  <span className="text-slate-300">Role</span>
                  <input
                    className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-xs"
                    value={form.project.roleName ?? ""}
                    onChange={(e) =>
                      setForm((f) =>
                        f && {
                          ...f,
                          project: {
                            ...f.project,
                            roleName: e.target.value,
                          },
                        },
                      )
                    }
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-slate-300">Hero CTA label</span>
                <input
                  className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-xs"
                  placeholder="Watch on Netflix"
                  value={form.project.primaryWatchLabel ?? ""}
                  onChange={(e) =>
                    setForm((f) =>
                      f && {
                        ...f,
                        project: {
                          ...f.project,
                          primaryWatchLabel: e.target.value,
                        },
                      },
                    )
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-300">Hero CTA URL</span>
                <input
                  className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-xs"
                  placeholder="https://netflix.com/..."
                  value={form.project.primaryWatchUrl ?? ""}
                  onChange={(e) =>
                    setForm((f) =>
                      f && {
                        ...f,
                        project: {
                          ...f.project,
                          primaryWatchUrl: e.target.value,
                        },
                      },
                    )
                  }
                />
              </label>
            </div>
          </div>

          {/* Featured clip */}
          <div className="space-y-4 rounded-2xl bg-[#0b0912] border border-white/5 p-4 mb-16">
            <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-slate-400">
              Featured clip
            </h2>
            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="text-slate-300">Clip title</span>
                <input
                  className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-xs"
                  value={form.clip.title}
                  onChange={(e) =>
                    setForm((f) =>
                      f && { ...f, clip: { ...f.clip, title: e.target.value } },
                    )
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-300">YouTube URL</span>
                <input
                  className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-xs"
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
          </div>
        </div>

        {/* RIGHT: simple preview shell using same layout vibe as /f/[slug] */}
        <div className={mode === "edit" ? "hidden md:block" : ""}>
          <div className="rounded-3xl overflow-hidden border border-white/5 bg-[#05040A]">
            {/* You can import and reuse the actual page component if you refactor it into a shared component.
                For now, keep this as a light-weight approximation. */}
            <div className="p-4 border-b border-white/5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Live preview
              </p>
              <p className="text-xs text-slate-400">
                This is a preview of how your page will appear at{" "}
                <span className="font-mono text-slate-300">flmlnk.com/{slug}</span>
              </p>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Filmmaker
                </p>
                <h2 className="text-2xl font-semibold">
                  {form.displayName || "Your name"}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {form.headline || "Your headline will appear here."}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Featured project
                </p>
                <h3 className="text-lg font-semibold">
                  {form.project.title || "Project title"}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {form.project.logline || "Your logline will go here."}
                </p>
              </div>
              <div className="rounded-2xl bg-black border border-white/10 p-4 text-xs text-slate-300 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Official trailer
                  </p>
                  <p className="text-xs">
                    {form.clip.title || "Clip title"}
                  </p>
                </div>
                <button className="inline-flex items-center rounded-full bg-[#f53c56] px-3 py-1 text-[11px] font-medium">
                  {form.project.primaryWatchLabel || "Watch trailer"}
                </button>
              </div>
            </div>
          </div>

        </div>
      </section>

        <div className="max-w-6xl mx-auto px-4 pb-8">
          <div className="flex flex-col md:flex-row md:justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(false)}
              className="w-full md:w-auto inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white hover:border-white/30 hover:bg-white/10 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(true)}
              className="w-full md:w-auto inline-flex items-center justify-center rounded-full bg-[#f53c56] px-4 py-2 text-xs font-medium hover:bg-[#ff4b6a] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Dashboard"}
            </button>
          </div>
        </div>
    </main>
  );
}
