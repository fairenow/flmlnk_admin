import { v } from "convex/values";
import { query } from "./_generated/server";

import type { ActorPage } from "../types/actorPage";

import type { Doc } from "./_generated/dataModel";

function buildActorPagePayload({
  profile,
  projects,
  clips,
  notableProjects,
  comments,
}: {
  profile: NonNullable<Doc<"actor_profiles">>;
  projects: Array<Doc<"projects">>;
  clips: Array<Doc<"clips">>;
  notableProjects: Array<Doc<"notable_projects">>;
  comments: Array<Doc<"comments">>;
}): ActorPage {
  const platformLinks = profile.platforms?.map((platform) => ({
    key: platform.key,
    label: platform.label,
    url: platform.url ?? "",
  })) ?? [];

  const featuredProject = projects[0];

  const socialLinks = profile.socials ?? {
    imdb: profile.imdbUrl ?? undefined,
  };

  const sortedClips = [...clips].sort((a, b) => {
    const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;

    if (aOrder === bOrder) return 0;
    return aOrder < bOrder ? -1 : 1;
  });

  const heroCtaText =
    featuredProject?.primaryWatchLabel ??
    featuredProject?.watchCtaText ??
    (featuredProject?.tubiUrl ? "Watch on Tubi" : "Watch now");

  const heroCtaUrl =
    featuredProject?.primaryWatchUrl ??
    featuredProject?.watchCtaUrl ??
    featuredProject?.tubiUrl ??
    platformLinks[0]?.url ??
    "";

  return {
    profile: {
      slug: profile.slug,
      displayName: profile.displayName,
      headline: profile.headline ?? "",
      bio: profile.bio ?? "",
      location: profile.location ?? "",
      avatarUrl: profile.avatarUrl ?? null,
      bannerUrl: (profile as { bannerUrl?: string }).bannerUrl ?? null,
      socials: socialLinks,
    },
    featuredProject: {
      title: featuredProject?.title ?? "",
      logline: featuredProject?.logline ?? "",
      description: featuredProject?.description ?? "",
      releaseYear: featuredProject?.releaseYear ?? null,
      status: featuredProject?.status ?? null,
      matchScore: featuredProject?.matchScore ?? null,
      ratingCategory: featuredProject?.ratingCategory ?? null,
      formatTags: featuredProject?.formatTags ?? [],
      posterUrl: featuredProject?.posterUrl ?? null,
      watchCtaText: heroCtaText,
      watchCtaUrl: heroCtaUrl,
      platforms: platformLinks,
    },
    clips: sortedClips.map((clip) => ({
      id: clip._id,
      title: clip.title,
      youtubeUrl: clip.youtubeUrl,
      videoUrl: (clip as { videoUrl?: string }).videoUrl ?? null,
      thumbnailUrl: (clip as { thumbnailUrl?: string }).thumbnailUrl ?? null,
      isFeatured: clip.isFeatured ?? false,
      sortOrder: clip.sortOrder ?? 0,
      deepLinkId:
        clip.deepLinkId ?? `clip-${(clip.sortOrder ?? 0) + 1}`,
    })),
    notableProjects: notableProjects.map((project) => ({
      id: project._id,
      title: project.title,
      posterUrl: project.posterUrl ?? null,
      platformUrl: project.platformUrl ?? null,
      releaseYear: project.releaseYear ?? null,
    })),
    comments: comments.map((comment) => ({
      id: comment._id,
      name: comment.name,
      email: comment.email,
      message: comment.message,
      createdAt: comment.createdAt,
      parentId: comment.parentId ?? null,
      likes: comment.likes,
    })),
    theme: profile.theme ?? {},
    settings: {
      enableComments: (profile as { settings?: { enableComments?: boolean } }).settings?.enableComments ?? false,
      enableEmailCapture: (profile as { settings?: { enableEmailCapture?: boolean } }).settings?.enableEmailCapture ?? false,
      clipSharingEnabled: (profile as { settings?: { clipSharingEnabled?: boolean } }).settings?.clipSharingEnabled ?? true,
    },
  };
}

export const getCurrentActorSnapshot = query({
  args: {},
  async handler(ctx) {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    const actorProfile = user
      ? await ctx.db
          .query("actor_profiles")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .unique()
      : null;

    const projects = actorProfile
      ? await ctx.db
          .query("projects")
          .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfile._id))
          .collect()
      : [];

    const projectsWithClips = await Promise.all(
      projects.map(async (project) => {
        const clips = await ctx.db
          .query("clips")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();

        return { project, clips };
      }),
    );

    return {
      user,
      actorProfile,
      projects: projectsWithClips,
    };
  },
});

export const getActorPageBySlug = query({
  args: { slug: v.string() },
  async handler(ctx, { slug }) {
    const actorProfile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (!actorProfile) {
      return null;
    }

    const [projects, clips, notableProjects, comments] = await Promise.all([
      ctx.db
        .query("projects")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfile._id))
        .collect(),
      ctx.db
        .query("clips")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfile._id))
        .order("asc")
        .collect(),
      ctx.db
        .query("notable_projects")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfile._id))
        .order("asc")
        .collect(),
      ctx.db
        .query("comments")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfile._id))
        .collect(),
    ]);

    return buildActorPagePayload({
      profile: actorProfile,
      projects,
      clips,
      notableProjects,
      comments,
    });
  },
});

export const dumpActorPageForSlug = query({
  args: { slug: v.string() },
  async handler(ctx, { slug }) {
    // Reuse the same lookups as the public filmmaker page to keep output aligned.
    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (!profile) return null;

    const [projects, clips, notableProjects, comments] = await Promise.all([
      ctx.db
        .query("projects")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
        .collect(),
      ctx.db
        .query("clips")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
        .order("asc")
        .collect(),
      ctx.db
        .query("notable_projects")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
        .order("asc")
        .collect(),
      ctx.db
        .query("comments")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
        .collect(),
    ]);

    return buildActorPagePayload({
      profile,
      projects,
      clips,
      notableProjects,
      comments,
    });
  },
});
