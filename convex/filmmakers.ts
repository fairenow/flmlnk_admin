import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  action,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Helper: resolve the current user + profile from a slug and auth
async function getOwnedProfileBySlug(
  ctx: QueryCtx | MutationCtx,
  slug: string,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
    .unique();

  if (!user) return null;

  const profile = await ctx.db
    .query("actor_profiles")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();

  if (!profile) return null;
  if (profile.userId !== user._id) return null;

  return { user, profile } as const;
}

const normalizeWithPrefix = (value: string | null | undefined, prefix: string) => {
  if (!value) return undefined;
  const cleaned = value.trim();
  if (!cleaned) return undefined;
  return cleaned.startsWith("http")
    ? cleaned
    : `${prefix}${cleaned.replace(/^@/, "")}`;
};

type GenerationInputs = {
  displayName: string;
  filmTitle: string;
  filmRoleName?: string | null;
  location?: string | null;
};

const defaultGeneratedCopy = (args: GenerationInputs) => ({
  headline: `${args.displayName} • Actor`,
  bio: `${args.displayName} is an actor${
    args.location ? ` based in ${args.location}` : ""
  }.`.trim(),
  filmLogline: `${args.filmTitle} features ${args.displayName}${
    args.filmRoleName ? ` as ${args.filmRoleName}` : ""
  }.`,
  ctaLabel: "Watch the film",
});

async function generateCopyWithOpenAI(
  ctx: ActionCtx,
  args: GenerationInputs,
) {
  const fallback = defaultGeneratedCopy(args);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You write concise actor marketing copy. Respond with JSON only.",
          },
          {
            role: "user",
            content: `Create headline, 2-3 sentence bio, film logline, and CTA label for ${args.displayName}, an actor${
              args.location ? ` in ${args.location}` : ""
            } starring as ${args.filmRoleName ?? "an actor"} in ${args.filmTitle}. Return JSON with keys headline, bio, filmLogline, ctaLabel`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      return fallback;
    }

    const result = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };

    const content = result.choices?.[0]?.message?.content;
    if (!content) return fallback;

    const parsed = JSON.parse(content) as {
      headline?: string;
      bio?: string;
      filmLogline?: string;
      ctaLabel?: string;
    };

    return {
      headline: parsed.headline?.trim() || fallback.headline,
      bio: parsed.bio?.trim() || fallback.bio,
      filmLogline: parsed.filmLogline?.trim() || fallback.filmLogline,
      ctaLabel: parsed.ctaLabel?.trim() || fallback.ctaLabel,
    };
  } catch (error) {
    console.error("OpenAI generation failed", error);
    return fallback;
  }
}

export const generateActorPageFromOnboarding = action({
  args: {
    displayName: v.string(),
    slug: v.string(),
    location: v.optional(v.string()),
    profileImageUrl: v.optional(v.string()),
    filmTitle: v.string(),
    filmStreamingUrl: v.optional(v.string()),
    filmTrailerYoutubeUrl: v.string(),
    filmReleaseYear: v.optional(v.number()),
    filmRoleName: v.optional(v.string()),
    imdbUrl: v.optional(v.string()),
    instagramHandle: v.optional(v.string()),
    tiktokHandle: v.optional(v.string()),
    youtubeHandleOrUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    clipUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<{
    slug: string;
    generated: {
      headline: string;
      bio: string;
      filmLogline: string;
      ctaLabel: string;
    };
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Please sign in to continue.");
    }

    const generated = await generateCopyWithOpenAI(ctx, {
      displayName: args.displayName,
      filmTitle: args.filmTitle,
      filmRoleName: args.filmRoleName,
      location: args.location,
    });

    const result = await ctx.runMutation(api.filmmakers.applyGeneratedActorPage, {
      ...args,
      generated,
    });

    // Trigger automatic clip generation from the trailer URL (5 clips)
    // This runs in the background - failures don't block onboarding
    if (args.filmTrailerYoutubeUrl) {
      try {
        await ctx.runAction(internal.clipGenerator.triggerOnboardingClipGeneration, {
          slug: result.slug,
          sourceVideoUrl: args.filmTrailerYoutubeUrl,
          tokenIdentifier: identity.tokenIdentifier,
        });
      } catch (error) {
        // Log the error but don't fail the onboarding
        console.error("[Onboarding] Failed to trigger clip generation:", error);
      }

      // Also trigger Klap processing for AI clip generation
      try {
        await ctx.runAction(internal.klap.triggerOnboardingKlapGeneration, {
          slug: result.slug,
          sourceVideoUrl: args.filmTrailerYoutubeUrl,
          tokenIdentifier: identity.tokenIdentifier,
        });
      } catch (error) {
        console.error("[Onboarding] Failed to trigger Klap processing:", error);
      }
    }

    // Trigger deep IMDb scraping if URL provided
    if (args.imdbUrl) {
      try {
        await ctx.runAction(internal.profileScraper.deepScrapeForOnboarding, {
          slug: result.slug,
          imdbUrl: args.imdbUrl,
        });
      } catch (error) {
        console.error("[Onboarding] Failed to trigger deep IMDb scraping:", error);
      }
    }

    return result;
  },
});

/**
 * Simplified onboarding completion - 3 step flow.
 * Creates profile and triggers background processes:
 * 1. Firecrawl scraping for IMDb/social URLs
 * 2. Clip generation from trailer
 */
export const completeSimplifiedOnboarding = action({
  args: {
    displayName: v.string(),
    slug: v.string(),
    filmTitle: v.string(),
    trailerYoutubeUrl: v.optional(v.string()),
    imdbUrl: v.optional(v.string()),
    socials: v.optional(v.object({
      instagram: v.optional(v.string()),
      twitter: v.optional(v.string()),
      tiktok: v.optional(v.string()),
      youtube: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args): Promise<{ slug: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Please sign in to continue.");
    }

    // Generate basic copy
    const headline = `${args.displayName} • Filmmaker`;
    const bio = `${args.displayName} is a filmmaker creating compelling visual stories.`;
    const filmLogline = args.filmTitle
      ? `${args.filmTitle} - a new film by ${args.displayName}.`
      : "";

    // Create the profile using existing mutation
    const result = await ctx.runMutation(api.filmmakers.applySimplifiedOnboarding, {
      displayName: args.displayName,
      slug: args.slug,
      filmTitle: args.filmTitle,
      trailerYoutubeUrl: args.trailerYoutubeUrl ?? "",
      imdbUrl: args.imdbUrl,
      instagramHandle: args.socials?.instagram,
      twitterHandle: args.socials?.twitter,
      tiktokHandle: args.socials?.tiktok,
      youtubeHandle: args.socials?.youtube,
      generated: {
        headline,
        bio,
        filmLogline,
        ctaLabel: "Watch Film",
      },
    });

    // Background process 1: Trigger deep Firecrawl scraping for IMDb profile + top 3 films
    // Uses parallel scraping for profile page + 3 title pages simultaneously
    if (args.imdbUrl) {
      try {
        await ctx.runAction(internal.profileScraper.deepScrapeForOnboarding, {
          slug: result.slug,
          imdbUrl: args.imdbUrl,
        });
      } catch (error) {
        console.error("[Onboarding] Failed to trigger deep profile scraping:", error);
        // Fallback to basic scraping if deep scraping fails
        try {
          await ctx.runAction(internal.profileScraper.scrapeProfileUrls, {
            slug: result.slug,
            imdbUrl: args.imdbUrl,
            socials: args.socials,
          });
        } catch (fallbackError) {
          console.error("[Onboarding] Fallback scraping also failed:", fallbackError);
        }
      }
    } else if (args.socials) {
      // If no IMDb URL but has socials, use basic scraping
      try {
        await ctx.runAction(internal.profileScraper.scrapeProfileUrls, {
          slug: result.slug,
          socials: args.socials,
        });
      } catch (error) {
        console.error("[Onboarding] Failed to trigger social scraping:", error);
      }
    }

    // Background process 2: Trigger clip generation from trailer (Modal)
    if (args.trailerYoutubeUrl) {
      try {
        await ctx.runAction(internal.clipGenerator.triggerOnboardingClipGeneration, {
          slug: result.slug,
          sourceVideoUrl: args.trailerYoutubeUrl,
          tokenIdentifier: identity.tokenIdentifier,
        });
      } catch (error) {
        console.error("[Onboarding] Failed to trigger clip generation:", error);
      }
    }

    // Background process 3: Trigger Klap processing for AI clip generation from trailer
    if (args.trailerYoutubeUrl) {
      try {
        await ctx.runAction(internal.klap.triggerOnboardingKlapGeneration, {
          slug: result.slug,
          sourceVideoUrl: args.trailerYoutubeUrl,
          tokenIdentifier: identity.tokenIdentifier,
        });
      } catch (error) {
        console.error("[Onboarding] Failed to trigger Klap processing:", error);
      }
    }

    return { slug: result.slug };
  },
});

/**
 * Mutation to apply simplified onboarding data to the database.
 */
export const applySimplifiedOnboarding = mutation({
  args: {
    displayName: v.string(),
    slug: v.string(),
    filmTitle: v.string(),
    trailerYoutubeUrl: v.string(),
    imdbUrl: v.optional(v.string()),
    instagramHandle: v.optional(v.string()),
    twitterHandle: v.optional(v.string()),
    tiktokHandle: v.optional(v.string()),
    youtubeHandle: v.optional(v.string()),
    generated: v.object({
      headline: v.string(),
      bio: v.string(),
      filmLogline: v.string(),
      ctaLabel: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Please sign in to continue.");
    }

    const authId = identity.tokenIdentifier;
    const email = identity.email ?? "";
    const name = identity.name ?? args.displayName;

    // Upsert user
    let user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .unique();

    if (!user) {
      const userId = await ctx.db.insert("users", {
        authId,
        email,
        name,
        imageUrl: identity.pictureUrl ?? undefined,
        role: "filmmaker",
      });
      user = await ctx.db.get(userId);
    } else {
      await ctx.db.patch(user._id, {
        email,
        name,
        imageUrl: identity.pictureUrl ?? user.imageUrl,
        role: "filmmaker",
      });
    }

    if (!user) throw new Error("Unable to create your account. Please try again.");

    // Check slug availability
    const existingWithSlug = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (existingWithSlug && existingWithSlug.userId !== user._id) {
      throw new Error("This URL is already taken. Please choose a different one.");
    }

    // Build socials object
    const socials = {
      imdb: normalizeWithPrefix(args.imdbUrl, "https://www.imdb.com/name/"),
      instagram: normalizeWithPrefix(args.instagramHandle, "https://instagram.com/"),
      twitter: normalizeWithPrefix(args.twitterHandle, "https://twitter.com/"),
      tiktok: normalizeWithPrefix(args.tiktokHandle, "https://www.tiktok.com/@"),
      youtube: normalizeWithPrefix(args.youtubeHandle, "https://youtube.com/@"),
    } as const;

    const platforms = [
      { key: "trailer", label: "Trailer", url: args.trailerYoutubeUrl },
    ].filter((p) => Boolean(p.url));

    // Upsert actor_profile
    let profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    const imdbUrl = socials.imdb ?? "";

    if (!profile) {
      const profileId = await ctx.db.insert("actor_profiles", {
        userId: user._id,
        displayName: args.displayName,
        slug: args.slug,
        headline: args.generated.headline,
        bio: args.generated.bio,
        avatarUrl: identity.pictureUrl ?? "",
        location: "",
        imdbId: "",
        imdbUrl,
        socials,
        theme: {
          primaryColor: "#B91C1C",
          accentColor: "#f88958",
          layoutVariant: "filmmaker-default",
        },
        genres: [],
        platforms,
      });
      profile = await ctx.db.get(profileId);
    } else {
      await ctx.db.patch(profile._id, {
        displayName: args.displayName,
        slug: args.slug,
        headline: args.generated.headline,
        bio: args.generated.bio,
        imdbUrl,
        socials,
        platforms,
      });
      profile = await ctx.db.get(profile._id);
    }

    if (!profile) throw new Error("Unable to create your profile. Please try again.");

    // Create/update project
    const existingProjects = await ctx.db
      .query("projects")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
      .collect();

    let projectId;
    if (existingProjects.length === 0) {
      projectId = await ctx.db.insert("projects", {
        actorProfileId: profile._id,
        title: args.filmTitle,
        logline: args.generated.filmLogline,
        description: args.generated.filmLogline,
        posterUrl: "",
        roleName: "Filmmaker",
        roleType: "Director",
        imdbTitleId: "",
        tubiUrl: "",
        primaryWatchLabel: args.generated.ctaLabel,
        status: "in-development",
      });
    } else {
      const primaryProject = existingProjects[0];
      projectId = primaryProject._id;
      await ctx.db.patch(primaryProject._id, {
        title: args.filmTitle,
        logline: args.generated.filmLogline,
        description: args.generated.filmLogline,
      });
    }

    // Create featured clip from trailer
    if (args.trailerYoutubeUrl) {
      const clips = await ctx.db
        .query("clips")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
        .collect();

      if (clips.length === 0) {
        await ctx.db.insert("clips", {
          actorProfileId: profile._id,
          projectId,
          title: `${args.filmTitle} – Trailer`,
          youtubeUrl: args.trailerYoutubeUrl,
          sortOrder: 1,
          isFeatured: true,
        });
      } else {
        const featured = clips.find((c) => c.isFeatured) ?? clips[0];
        await ctx.db.patch(featured._id, {
          youtubeUrl: args.trailerYoutubeUrl,
          title: `${args.filmTitle} – Trailer`,
          isFeatured: true,
        });
      }
    }

    return { slug: profile.slug };
  },
});

export const applyGeneratedActorPage = mutation({
  args: {
    displayName: v.string(),
    slug: v.string(),
    location: v.optional(v.string()),
    profileImageUrl: v.optional(v.string()),
    filmTitle: v.string(),
    filmStreamingUrl: v.optional(v.string()),
    filmTrailerYoutubeUrl: v.string(),
    filmReleaseYear: v.optional(v.number()),
    filmRoleName: v.optional(v.string()),
    imdbUrl: v.optional(v.string()),
    instagramHandle: v.optional(v.string()),
    tiktokHandle: v.optional(v.string()),
    youtubeHandleOrUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    clipUrls: v.optional(v.array(v.string())),
    generated: v.object({
      headline: v.string(),
      bio: v.string(),
      filmLogline: v.string(),
      ctaLabel: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Please sign in to continue.");
    }

    const authId = identity.tokenIdentifier;
    const email = identity.email ?? "";
    const name = identity.name ?? args.displayName;

    let user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .unique();

    if (!user) {
      const userId = await ctx.db.insert("users", {
        authId,
        email,
        name,
        imageUrl: identity.pictureUrl ?? undefined,
        role: "actor",
      });
      user = await ctx.db.get(userId);
    } else {
      await ctx.db.patch(user._id, {
        email,
        name,
        imageUrl: identity.pictureUrl ?? user.imageUrl,
        role: "actor",
      });
    }

    if (!user) throw new Error("Unable to create your account. Please try again.");

    const existingWithSlug = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (existingWithSlug && existingWithSlug.userId !== user._id) {
      throw new Error("This URL is already taken. Please choose a different one.");
    }

    const socials = {
      imdb: normalizeWithPrefix(args.imdbUrl, "https://www.imdb.com/name/"),
      instagram: normalizeWithPrefix(args.instagramHandle, "https://instagram.com/"),
      tiktok: normalizeWithPrefix(args.tiktokHandle, "https://www.tiktok.com/@"),
      youtube: normalizeWithPrefix(args.youtubeHandleOrUrl, "https://youtube.com/@"),
      website: normalizeWithPrefix(args.websiteUrl, ""),
    } as const;

    const platforms = [
      {
        key: "streaming",
        label: args.generated.ctaLabel,
        url: args.filmStreamingUrl,
      },
      { key: "trailer", label: "Trailer", url: args.filmTrailerYoutubeUrl },
    ].filter((p) => Boolean(p.url));

    let profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    const avatarUrl =
      args.profileImageUrl || identity.pictureUrl || profile?.avatarUrl || "";
    const imdbUrl = socials.imdb ?? "";

    if (!profile) {
      const profileId = await ctx.db.insert("actor_profiles", {
        userId: user._id,
        displayName: args.displayName,
        slug: args.slug,
        headline: args.generated.headline,
        bio: args.generated.bio,
        avatarUrl,
        location: args.location ?? "",
        imdbId: "",
        imdbUrl,
        socials,
        theme: {
          primaryColor: "#f53c56",
          accentColor: "#f88958",
          layoutVariant: "actor-default",
        },
        genres: [],
        platforms,
      });
      profile = await ctx.db.get(profileId);
    } else {
      await ctx.db.patch(profile._id, {
        displayName: args.displayName,
        slug: args.slug,
        headline: args.generated.headline,
        bio: args.generated.bio,
        avatarUrl,
        location: args.location ?? profile.location ?? "",
        imdbUrl,
        socials,
        platforms,
      });
      profile = await ctx.db.get(profile._id);
    }

    if (!profile) throw new Error("Unable to create your profile. Please try again.");

    const releaseYear = Number.isFinite(args.filmReleaseYear ?? NaN)
      ? args.filmReleaseYear
      : undefined;
    const normalizedReleaseYear = releaseYear;

    const existingProjects = await ctx.db
      .query("projects")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
      .collect();

    const roleName = args.filmRoleName || "Actor";

    let projectId;
    if (existingProjects.length === 0) {
      projectId = await ctx.db.insert("projects", {
        actorProfileId: profile._id,
        title: args.filmTitle,
        logline: args.generated.filmLogline,
        description: args.generated.filmLogline,
        posterUrl: "",
        releaseYear: normalizedReleaseYear,
        roleName,
        roleType: "Performer",
        imdbTitleId: "",
        tubiUrl: "",
        primaryWatchLabel: args.generated.ctaLabel,
        primaryWatchUrl: args.filmStreamingUrl,
        status: "released",
      });
    } else {
      const primaryProject = existingProjects[0];
      projectId = primaryProject._id;
      await ctx.db.patch(primaryProject._id, {
        title: args.filmTitle,
        logline: args.generated.filmLogline,
        description: args.generated.filmLogline,
        releaseYear: normalizedReleaseYear ?? primaryProject.releaseYear,
        roleName,
        primaryWatchLabel: args.generated.ctaLabel,
        primaryWatchUrl: args.filmStreamingUrl,
      });
    }

    const clips = await ctx.db
      .query("clips")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
      .collect();

    if (clips.length === 0) {
      await ctx.db.insert("clips", {
        actorProfileId: profile._id,
        projectId,
        title: `${args.filmTitle} – Trailer`,
        youtubeUrl: args.filmTrailerYoutubeUrl,
        sortOrder: 1,
        isFeatured: true,
      });
    } else {
      const featured = clips.find((c) => c.isFeatured) ?? clips[0];
      await ctx.db.patch(featured._id, {
        youtubeUrl: args.filmTrailerYoutubeUrl,
        title: `${args.filmTitle} – Trailer`,
        isFeatured: true,
      });
    }

    // Create additional clips from clipUrls (for TikTok-style player)
    if (args.clipUrls && args.clipUrls.length > 0) {
      // Get existing clip URLs to avoid duplicates
      const existingUrls = new Set(clips.map((c) => c.youtubeUrl));
      existingUrls.add(args.filmTrailerYoutubeUrl); // Also check the trailer URL

      let sortOrder = clips.length + 2; // Start after existing clips

      for (const clipUrl of args.clipUrls) {
        // Skip if this URL already exists
        if (existingUrls.has(clipUrl)) continue;

        // Generate a title from the URL or use a default
        const clipNumber = sortOrder - 1;
        const title = `Clip ${clipNumber}`;

        await ctx.db.insert("clips", {
          actorProfileId: profile._id,
          projectId,
          title,
          youtubeUrl: clipUrl,
          sortOrder,
          isFeatured: false,
        });

        existingUrls.add(clipUrl);
        sortOrder++;
      }
    }

    return {
      slug: profile.slug,
      generated: args.generated,
    };
  },
});

/**
 * Owner-only query: fetch the authenticated user's actor page data.
 */
export const getOwnerEditablePage = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      return null;
    }

    const { profile } = owned;

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
      .collect();

    // Sort projects by sortOrder, then by creation time
    const sortedProjects = projects.sort((a, b) => {
      const orderA = a.sortOrder ?? 999;
      const orderB = b.sortOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a._creationTime - b._creationTime;
    });

    // Resolve poster URLs from storage for all projects
    const projectsWithPosterUrls = await Promise.all(
      sortedProjects.map(async (project) => {
        let resolvedPosterUrl = project.posterUrl ?? "";
        if (project.posterStorageId) {
          const storageUrl = await ctx.storage.getUrl(project.posterStorageId);
          if (storageUrl) {
            resolvedPosterUrl = storageUrl;
          }
        }
        return {
          ...project,
          resolvedPosterUrl,
        };
      })
    );

    const clips = await ctx.db
      .query("clips")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
      .collect();

    // Sort clips by sortOrder, then by creation time
    const sortedClips = clips.sort((a, b) => {
      const orderA = a.sortOrder ?? 999;
      const orderB = b.sortOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a._creationTime - b._creationTime;
    });

    const featuredProject = projectsWithPosterUrls.find((p) => p.isFeatured) ?? projectsWithPosterUrls[0] ?? null;
    const featuredClip = sortedClips.find((c) => c.isFeatured) ?? sortedClips[0] ?? null;

    return {
      profile: {
        _id: profile._id,
        userId: profile.userId,
        slug: profile.slug,
        displayName: profile.displayName,
        headline: profile.headline ?? "",
        bio: profile.bio ?? "",
        location: profile.location ?? "",
        avatarUrl: profile.avatarUrl ?? "",
        genres: profile.genres ?? [],
        platforms: profile.platforms ?? [],
        socials: profile.socials ?? {},
      },
      projects: projectsWithPosterUrls,
      clips: sortedClips,
      featuredProject,
      featuredClip,
    };
  },
});

export const getOnboardingStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { isAuthenticated: false, hasProfile: false, slug: null, scrapingStatus: null };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) return { isAuthenticated: true, hasProfile: false, slug: null, scrapingStatus: null };

    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    const hasProfile = Boolean(profile && profile.slug);

    return {
      isAuthenticated: true,
      hasProfile,
      slug: hasProfile ? profile!.slug : null,
      scrapingStatus: profile?.scrapingStatus || null,
    };
  },
});

/**
 * Get the scraping status for a profile.
 * Used by the animation component to wait for scraping to complete.
 */
export const getScrapingStatus = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!profile) {
      return {
        status: null as "pending" | "in_progress" | "completed" | "failed" | null,
        startedAt: null as number | null,
        completedAt: null as number | null,
        error: null as string | null,
      };
    }

    return {
      status: profile.scrapingStatus || null,
      startedAt: profile.scrapingStartedAt || null,
      completedAt: profile.scrapingCompletedAt || null,
      error: profile.scrapingError || null,
    };
  },
});

/**
 * Check if a slug is available for use.
 * Returns true if the slug is available, false if already taken.
 */
export const checkSlugAvailability = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const slug = args.slug.toLowerCase().trim();

    // Check minimum length
    if (slug.length < 3) {
      return { available: false, reason: "Username must be at least 3 characters" };
    }

    // Check maximum length
    if (slug.length > 48) {
      return { available: false, reason: "Username must be 48 characters or less" };
    }

    // Check for valid characters (alphanumeric and hyphens only)
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return { available: false, reason: "Only letters, numbers, and hyphens allowed" };
    }

    // Reserved slugs
    const reservedSlugs = [
      "admin", "api", "app", "auth", "dashboard", "edit", "editor",
      "f", "filmmaker", "filmmakers", "help", "home", "login", "logout",
      "onboarding", "profile", "profiles", "settings", "signup", "support",
      "user", "users", "www", "flmlnk"
    ];

    if (reservedSlugs.includes(slug)) {
      return { available: false, reason: "This username is reserved" };
    }

    // Check if slug exists in database
    const existing = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    // If the current user owns this slug, it's available to them
    if (existing) {
      const identity = await ctx.auth.getUserIdentity();
      if (identity) {
        const user = await ctx.db
          .query("users")
          .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
          .unique();

        if (user && existing.userId === user._id) {
          return { available: true, reason: "This is your current username" };
        }
      }
      return { available: false, reason: "Username is already taken" };
    }

    return { available: true, reason: null };
  },
});

export const updateOwnerPage = mutation({
  args: {
    slug: v.string(),
    profile: v.object({
      displayName: v.string(),
      headline: v.optional(v.string()),
      bio: v.optional(v.string()),
      location: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      genres: v.optional(v.array(v.string())),
      platforms: v.optional(
        v.array(
          v.object({
            key: v.string(),
            label: v.string(),
            url: v.optional(v.string()),
          }),
        ),
      ),
    }),
    featuredProject: v.object({
      _id: v.id("projects"),
      title: v.string(),
      logline: v.optional(v.string()),
      description: v.optional(v.string()),
      releaseYear: v.optional(v.number()),
      roleName: v.optional(v.string()),
      status: v.optional(v.string()),
      primaryWatchLabel: v.optional(v.string()),
      primaryWatchUrl: v.optional(v.string()),
      trailerUrl: v.optional(v.string()),
    }),
    featuredClip: v.object({
      _id: v.id("clips"),
      title: v.string(),
      youtubeUrl: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("You don't have permission to edit this page.");
    }

    const { profile } = owned;
    const featuredProject = await ctx.db.get(args.featuredProject._id);
    if (!featuredProject || featuredProject.actorProfileId !== profile._id) {
      throw new Error("This project doesn't belong to your profile.");
    }

    await ctx.db.patch(profile._id, {
      displayName: args.profile.displayName,
      headline: args.profile.headline ?? undefined,
      bio: args.profile.bio ?? undefined,
      location: args.profile.location ?? undefined,
      ...(args.profile.avatarUrl ? { avatarUrl: args.profile.avatarUrl } : {}),
      genres: args.profile.genres ?? [],
      platforms: args.profile.platforms ?? [],
    });

    await ctx.db.patch(featuredProject._id, {
      title: args.featuredProject.title,
      logline: args.featuredProject.logline ?? undefined,
      description: args.featuredProject.description ?? undefined,
      releaseYear: args.featuredProject.releaseYear ?? undefined,
      roleName: args.featuredProject.roleName ?? undefined,
      status: args.featuredProject.status ?? undefined,
      primaryWatchLabel: args.featuredProject.primaryWatchLabel ?? undefined,
      primaryWatchUrl: args.featuredProject.primaryWatchUrl ?? undefined,
      trailerUrl: args.featuredProject.trailerUrl ?? undefined,
    });

    // Update featured clip
    const featuredClip = await ctx.db.get(args.featuredClip._id);
    if (!featuredClip || featuredClip.actorProfileId !== profile._id) {
      throw new Error("This clip doesn't belong to your profile.");
    }

    await ctx.db.patch(featuredClip._id, {
      title: args.featuredClip.title,
      youtubeUrl: args.featuredClip.youtubeUrl,
    });

    return { ok: true } as const;
  },
});

/**
 * Update social media links for the user's actor profile.
 */
export const updateProfileSocials = mutation({
  args: {
    slug: v.string(),
    socials: v.object({
      instagram: v.optional(v.string()),
      facebook: v.optional(v.string()),
      youtube: v.optional(v.string()),
      tiktok: v.optional(v.string()),
      imdb: v.optional(v.string()),
      website: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("You don't have permission to edit this page.");
    }

    const { profile } = owned;

    // Normalize social media URLs
    const socials = {
      instagram: normalizeWithPrefix(args.socials.instagram, "https://instagram.com/"),
      facebook: normalizeWithPrefix(args.socials.facebook, "https://facebook.com/"),
      youtube: normalizeWithPrefix(args.socials.youtube, "https://youtube.com/@"),
      tiktok: normalizeWithPrefix(args.socials.tiktok, "https://www.tiktok.com/@"),
      imdb: normalizeWithPrefix(args.socials.imdb, "https://www.imdb.com/name/"),
      website: normalizeWithPrefix(args.socials.website, ""),
    };

    await ctx.db.patch(profile._id, { socials });

    return { ok: true } as const;
  },
});

/**
 * Public query: fetch filmmaker page data by slug.
 * Returns structured data for the templatized actor page.
 */
export const getPublicBySlug = query({
  args: { slug: v.string() },
  async handler(ctx, { slug }) {
    const identity = await ctx.auth.getUserIdentity();

    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (!profile) return null;

    const owner = await ctx.db.get(profile.userId);

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
      .collect();

    // Sort projects by sortOrder, then by creation time
    const sortedProjects = projects.sort((a, b) => {
      const orderA = a.sortOrder ?? 999;
      const orderB = b.sortOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a._creationTime - b._creationTime;
    });

    // Resolve poster URLs from storage for all projects
    const projectsWithPosterUrls = await Promise.all(
      sortedProjects.map(async (project) => {
        let resolvedPosterUrl = project.posterUrl ?? "";
        if (project.posterStorageId) {
          const storageUrl = await ctx.storage.getUrl(project.posterStorageId);
          if (storageUrl) {
            resolvedPosterUrl = storageUrl;
          }
        }
        return {
          ...project,
          resolvedPosterUrl,
        };
      })
    );

    const clips = await ctx.db
      .query("clips")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
      .order("asc")
      .collect();

    // Filter to only public clips (isPublic === true or undefined for backwards compatibility)
    const publicClips = clips.filter((c) => c.isPublic !== false);

    // Sort clips by sortOrder, then by creation time
    const sortedClips = publicClips.sort((a, b) => {
      const orderA = a.sortOrder ?? 999;
      const orderB = b.sortOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a._creationTime - b._creationTime;
    });

    // Determine featured project (first with isFeatured flag, or first in list)
    const featuredProject =
      projectsWithPosterUrls.find((p) => p.isFeatured) ?? projectsWithPosterUrls[0] ?? null;

    // Determine featured clip (first with isFeatured flag, or first by sortOrder)
    const featuredClip =
      sortedClips.find((c) => c.isFeatured) ?? sortedClips[0] ?? null;

    let isOwner = false;

    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
        .unique();

      if (user && profile.userId === user._id) {
        isOwner = true;
      }
    }

    return {
      profile: {
        ...profile,
        socials: profile.socials ?? {},
        theme: profile.theme ?? {
          primaryColor: "#f53c56",
          accentColor: "#f88958",
          layoutVariant: "actor-default",
        },
      },
      featuredProject,
      featuredClip,
      projects: projectsWithPosterUrls,
      clips: sortedClips,
      isOwner,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
    };
  },
});

/**
 * Generate a secure unsubscribe token.
 */
function generateUnsubscribeToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Submit a fan email from the public page modal.
 */
export const submitFanEmail = mutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    name: v.optional(v.string()),
    email: v.string(),
    source: v.optional(v.string()),
  },
  async handler(ctx, args) {
    // Check if this email already exists for this profile
    const existing = await ctx.db
      .query("fan_emails")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", args.actorProfileId),
      )
      .filter((q) => q.eq(q.field("email"), args.email))
      .first();

    if (existing) {
      // Update name if provided
      if (args.name && args.name !== existing.name) {
        await ctx.db.patch(existing._id, { name: args.name });
      }
      // Ensure existing entries have an unsubscribe token
      if (!existing.unsubscribeToken) {
        await ctx.db.patch(existing._id, { unsubscribeToken: generateUnsubscribeToken() });
      }
      return { ok: true, isNew: false };
    }

    await ctx.db.insert("fan_emails", {
      actorProfileId: args.actorProfileId,
      email: args.email,
      name: args.name,
      source: args.source ?? "modal",
      unsubscribeToken: generateUnsubscribeToken(),
    });

    // Log email capture event
    await ctx.scheduler.runAfter(0, internal.analytics.logEventInternal, {
      actorProfileId: args.actorProfileId,
      eventType: "email_captured",
    });

    return { ok: true, isNew: true };
  },
});

/**
 * Bulk import fan emails for a user. Looks up the actor_profile by userId.
 * Skips duplicate emails and generates unsubscribe tokens for each.
 */
export const bulkImportFanEmails = mutation({
  args: {
    userId: v.id("users"),
    fans: v.array(
      v.object({
        name: v.string(),
        email: v.string(),
      })
    ),
    source: v.optional(v.string()),
  },
  async handler(ctx, args) {
    // Find the actor_profile for this user
    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!profile) {
      throw new Error(`No actor_profile found for userId: ${args.userId}`);
    }

    let imported = 0;
    let skipped = 0;

    for (const fan of args.fans) {
      // Check if this email already exists for this profile
      const existing = await ctx.db
        .query("fan_emails")
        .withIndex("by_actorProfile", (q) =>
          q.eq("actorProfileId", profile._id)
        )
        .filter((q) => q.eq(q.field("email"), fan.email))
        .first();

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.db.insert("fan_emails", {
        actorProfileId: profile._id,
        email: fan.email,
        name: fan.name,
        source: args.source ?? "bulk_import",
        unsubscribeToken: generateUnsubscribeToken(),
        createdAt: Date.now(),
      });
      imported++;
    }

    return { imported, skipped, total: args.fans.length };
  },
});

/**
 * Mutation called from the final onboarding step.
 * Creates/updates the user, actor_profile, primary project, and featured clip.
 */
export const completeOnboarding = mutation({
  args: {
    slug: v.string(),
    displayName: v.string(),
    role: v.string(), // "filmmaker" | "actor" | "distributor"
    genres: v.array(v.string()),
    video: v.object({
      url: v.string(),
      title: v.string(),
      synopsis: v.optional(v.string()),
    }),
    platforms: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        url: v.optional(v.string()),
      }),
    ),
  },
  async handler(ctx, args) {
    // Require an authenticated identity (Better Auth / Convex auth).
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Please sign in to continue.");
    }

    const authId = identity.tokenIdentifier;
    const email = identity.email ?? "";
    const name = identity.name ?? args.displayName;

    // Upsert user
    let user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .unique();

    let userId;
    if (!user) {
      userId = await ctx.db.insert("users", {
        authId,
        email,
        name,
        imageUrl: identity.pictureUrl ?? undefined,
        role: args.role,
      });
      user = await ctx.db.get(userId);
    } else {
      userId = user._id;
      await ctx.db.patch(userId, {
        email,
        name,
        imageUrl: identity.pictureUrl ?? user.imageUrl,
        role: args.role,
      });
    }

    // Ensure slug uniqueness
    const existingWithSlug = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (existingWithSlug && existingWithSlug.userId !== userId) {
      throw new Error("This URL is already taken. Please choose a different one.");
    }

    // Upsert actor_profile
    let profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const headline =
      args.role === "actor"
        ? "Actor • Demo Reels & Performances"
        : "Filmmaker • Films & Original Stories";

    if (!profile) {
      const profileId = await ctx.db.insert("actor_profiles", {
        userId,
        displayName: args.displayName,
        slug: args.slug,
        headline,
        bio: "",
        avatarUrl: identity.pictureUrl ?? "",
        location: "",
        imdbId: "",
        imdbUrl: "",
        theme: {
          primaryColor: "#f53c56",
          accentColor: "#f88958",
          layoutVariant:
            args.role === "actor" ? "actor-default" : "filmmaker-default",
        },
        genres: args.genres,
        platforms: args.platforms,
      });
      profile = await ctx.db.get(profileId);
    } else {
      await ctx.db.patch(profile._id, {
        displayName: args.displayName,
        slug: args.slug,
        headline,
        genres: args.genres,
        platforms: args.platforms,
      });
      profile = await ctx.db.get(profile._id);
    }

    if (!profile) throw new Error("Unable to create your profile. Please try again.");

    // Upsert primary project
    const existingProjects = await ctx.db
      .query("projects")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
      .collect();

    const projectTitle =
      args.role === "actor" ? args.video.title || "Demo Reel" : args.video.title;

    let projectId;
    if (existingProjects.length === 0) {
      projectId = await ctx.db.insert("projects", {
        actorProfileId: profile._id,
        title: projectTitle,
        logline:
          args.role === "actor"
            ? "A curated reel showcasing performance highlights."
            : args.video.synopsis ?? "",
        description: args.video.synopsis ?? "",
        posterUrl: "",
        releaseYear: undefined,
        roleName: args.role === "actor" ? "Actor" : "Director",
        roleType: args.role === "actor" ? "Performer" : "Director",
        imdbTitleId: "",
        tubiUrl: "",
        primaryWatchLabel:
          args.platforms[0]?.label ??
          (args.platforms[0]?.url ? "Watch now" : ""),
        primaryWatchUrl: args.platforms[0]?.url ?? "",
        status: "in-development",
      });
    } else {
      const primaryProject = existingProjects[0];
      projectId = primaryProject._id;
      await ctx.db.patch(primaryProject._id, {
        title: projectTitle,
        logline:
          args.role === "actor"
            ? "A curated reel showcasing performance highlights."
            : args.video.synopsis ?? primaryProject.logline,
        description: args.video.synopsis ?? primaryProject.description,
        primaryWatchLabel:
          primaryProject.primaryWatchLabel ??
          primaryProject.watchCtaText ??
          (args.platforms[0]?.label ? `Watch on ${args.platforms[0].label}` : ""),
        primaryWatchUrl:
          primaryProject.primaryWatchUrl ??
          primaryProject.watchCtaUrl ??
          primaryProject.tubiUrl ??
          args.platforms[0]?.url ??
          "",
      });
    }

    // Insert featured clip
    const clips = await ctx.db
      .query("clips")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
      .collect();

    if (clips.length === 0) {
      await ctx.db.insert("clips", {
        actorProfileId: profile._id,
        projectId,
        title:
          args.role === "actor"
            ? `${args.displayName} – Demo Reel`
            : args.video.title,
        youtubeUrl: args.video.url,
        sortOrder: 1,
        isFeatured: true,
      });
    } else {
      const featured = clips.find((c) => c.isFeatured) ?? clips[0];
      await ctx.db.patch(featured._id, {
        youtubeUrl: args.video.url,
        title:
          args.role === "actor"
            ? `${args.displayName} – Demo Reel`
            : args.video.title,
        isFeatured: true,
      });
    }

    return {
      slug: profile.slug,
    };
  },
});

const uploadToBucket = async (
  ctx: MutationCtx,
  _bucket: "profile_images" | "posters",
  file: ArrayBuffer,
) => {
  // Convex storage doesn't have buckets - all files go to the same storage
  // The bucket parameter is kept for API compatibility but is unused
  // Use type assertion because store() is available at runtime but not in MutationCtx types
  const storageId = await (ctx.storage as unknown as { store: (blob: Blob) => Promise<Id<"_storage">> }).store(new Blob([file]));
  const url = await ctx.storage.getUrl(storageId);
  return { storageId, url } as const;
};

export const uploadAvatar = mutation({
  args: {
    file: v.bytes(),
  },
  async handler(ctx, { file }) {
    return uploadToBucket(ctx, "profile_images", file);
  },
});

export const uploadBanner = mutation({
  args: {
    file: v.bytes(),
  },
  async handler(ctx, { file }) {
    return uploadToBucket(ctx, "profile_images", file);
  },
});

export const uploadPoster = mutation({
  args: {
    file: v.bytes(),
  },
  async handler(ctx, { file }) {
    return uploadToBucket(ctx, "posters", file);
  },
});

/**
 * Generate an upload URL for poster images.
 */
export const generatePosterUploadUrl = mutation({
  args: {},
  async handler(ctx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Add a new project for the authenticated user's actor profile.
 */
export const addProject = mutation({
  args: {
    slug: v.string(),
    title: v.string(),
    logline: v.optional(v.string()),
    description: v.optional(v.string()),
    posterUrl: v.optional(v.string()),
    posterStorageId: v.optional(v.id("_storage")),
    releaseYear: v.optional(v.number()),
    roleName: v.optional(v.string()),
    roleType: v.optional(v.string()),
    status: v.optional(v.string()),
    primaryWatchLabel: v.optional(v.string()),
    primaryWatchUrl: v.optional(v.string()),
    matchScore: v.optional(v.number()),
    ratingCategory: v.optional(v.string()),
    formatTags: v.optional(v.array(v.string())),
    trailerUrl: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("You don't have permission to add projects to this page.");
    }

    const { profile } = owned;

    // Get existing projects to determine sort order
    const existingProjects = await ctx.db
      .query("projects")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
      .collect();

    const maxSortOrder = Math.max(0, ...existingProjects.map((p) => p.sortOrder ?? 0));

    const projectId = await ctx.db.insert("projects", {
      actorProfileId: profile._id,
      title: args.title,
      logline: args.logline,
      description: args.description,
      posterUrl: args.posterUrl ?? "",
      posterStorageId: args.posterStorageId,
      releaseYear: args.releaseYear,
      roleName: args.roleName,
      roleType: args.roleType,
      status: args.status ?? "in-development",
      primaryWatchLabel: args.primaryWatchLabel,
      primaryWatchUrl: args.primaryWatchUrl,
      matchScore: args.matchScore,
      ratingCategory: args.ratingCategory,
      formatTags: args.formatTags,
      trailerUrl: args.trailerUrl,
      sortOrder: maxSortOrder + 1,
      isFeatured: existingProjects.length === 0, // First project is featured by default
    });

    return { projectId };
  },
});

/**
 * Update an existing project.
 */
export const updateProject = mutation({
  args: {
    slug: v.string(),
    projectId: v.id("projects"),
    title: v.optional(v.string()),
    logline: v.optional(v.string()),
    description: v.optional(v.string()),
    posterUrl: v.optional(v.string()),
    posterStorageId: v.optional(v.id("_storage")),
    releaseYear: v.optional(v.number()),
    roleName: v.optional(v.string()),
    roleType: v.optional(v.string()),
    status: v.optional(v.string()),
    primaryWatchLabel: v.optional(v.string()),
    primaryWatchUrl: v.optional(v.string()),
    matchScore: v.optional(v.number()),
    ratingCategory: v.optional(v.string()),
    formatTags: v.optional(v.array(v.string())),
    trailerUrl: v.optional(v.string()),
    isFeatured: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("You don't have permission to update projects on this page.");
    }

    const { profile } = owned;
    const project = await ctx.db.get(args.projectId);

    if (!project || project.actorProfileId !== profile._id) {
      throw new Error("Project not found.");
    }

    // Build update object with only provided fields
    const updates: Record<string, any> = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.logline !== undefined) updates.logline = args.logline;
    if (args.description !== undefined) updates.description = args.description;
    if (args.posterUrl !== undefined) updates.posterUrl = args.posterUrl;
    if (args.posterStorageId !== undefined) updates.posterStorageId = args.posterStorageId;
    if (args.releaseYear !== undefined) updates.releaseYear = args.releaseYear;
    if (args.roleName !== undefined) updates.roleName = args.roleName;
    if (args.roleType !== undefined) updates.roleType = args.roleType;
    if (args.status !== undefined) updates.status = args.status;
    if (args.primaryWatchLabel !== undefined) updates.primaryWatchLabel = args.primaryWatchLabel;
    if (args.primaryWatchUrl !== undefined) updates.primaryWatchUrl = args.primaryWatchUrl;
    if (args.matchScore !== undefined) updates.matchScore = args.matchScore;
    if (args.ratingCategory !== undefined) updates.ratingCategory = args.ratingCategory;
    if (args.formatTags !== undefined) updates.formatTags = args.formatTags;
    if (args.trailerUrl !== undefined) updates.trailerUrl = args.trailerUrl;
    if (args.sortOrder !== undefined) updates.sortOrder = args.sortOrder;

    // Handle setting a project as featured (unset others)
    if (args.isFeatured === true) {
      const allProjects = await ctx.db
        .query("projects")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
        .collect();

      for (const p of allProjects) {
        if (p._id !== args.projectId && p.isFeatured) {
          await ctx.db.patch(p._id, { isFeatured: false });
        }
      }
      updates.isFeatured = true;
    } else if (args.isFeatured === false) {
      updates.isFeatured = false;
    }

    await ctx.db.patch(args.projectId, updates);

    return { ok: true };
  },
});

/**
 * Delete a project.
 */
export const deleteProject = mutation({
  args: {
    slug: v.string(),
    projectId: v.id("projects"),
  },
  async handler(ctx, args) {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("You don't have permission to delete this project.");
    }

    const { profile } = owned;
    const project = await ctx.db.get(args.projectId);

    if (!project || project.actorProfileId !== profile._id) {
      throw new Error("Project not found.");
    }

    // Delete associated clips first
    const clips = await ctx.db
      .query("clips")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const clip of clips) {
      await ctx.db.delete(clip._id);
    }

    // Delete the poster from storage if it exists
    if (project.posterStorageId) {
      await ctx.storage.delete(project.posterStorageId);
    }

    // Delete the project
    await ctx.db.delete(args.projectId);

    // If this was the featured project, set another one as featured
    if (project.isFeatured) {
      const remainingProjects = await ctx.db
        .query("projects")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
        .collect();

      if (remainingProjects.length > 0) {
        await ctx.db.patch(remainingProjects[0]._id, { isFeatured: true });
      }
    }

    return { ok: true };
  },
});

/**
 * Reorder projects by updating their sortOrder.
 */
export const reorderProjects = mutation({
  args: {
    slug: v.string(),
    projectIds: v.array(v.id("projects")),
  },
  async handler(ctx, args) {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("You don't have permission to reorder projects.");
    }

    const { profile } = owned;

    // Update sort order for each project
    for (let i = 0; i < args.projectIds.length; i++) {
      const project = await ctx.db.get(args.projectIds[i]);
      if (project && project.actorProfileId === profile._id) {
        await ctx.db.patch(args.projectIds[i], { sortOrder: i + 1 });
      }
    }

    return { ok: true };
  },
});

/**
 * Dev-only seed helper for Robert Q page (unchanged).
 */
export const seedRobertQ = mutation({
  args: {},
  async handler(ctx) {
    const existing = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", "robertq"))
      .unique();

    if (existing) return existing._id;

    const userId = await ctx.db.insert("users", {
      authId: "dev-robertq",
      email: "robertq@example.com",
      name: "Robert Q. Jackson",
      imageUrl: "",
      role: "filmmaker",
    });

    const actorProfileId = await ctx.db.insert("actor_profiles", {
      userId,
      displayName: "Robert Q. Jackson",
      slug: "robertq",
      headline: "Award-winning Director & Storyteller",
      bio: "Robert Q. Jackson is a visionary filmmaker whose work bridges grounded realism with high-stakes drama.",
      avatarUrl: "",
      location: "Detroit, MI",
      imdbId: "",
      imdbUrl: "",
      theme: {
        primaryColor: "#f53c56",
        accentColor: "#f88958",
        layoutVariant: "filmmaker-default",
      },
      genres: ["Drama", "Thriller"],
      platforms: [
        { key: "netflix", label: "Netflix", url: "https://www.netflix.com" },
        { key: "tubi", label: "Tubi", url: "https://tubitv.com" },
        { key: "youtube", label: "YouTube", url: "https://youtube.com" },
        { key: "festivals", label: "Film Festivals", url: "" },
      ],
    });

    const projectId = await ctx.db.insert("projects", {
      actorProfileId,
      title: "The City God Forgot",
      logline:
        "In a city on the brink, one man’s faith and ambition collide with the forces consuming his community.",
      description: "",
      posterUrl: "",
      releaseYear: 2024,
      roleName: "Writer / Director",
      roleType: "Director",
      imdbTitleId: "",
      tubiUrl: "",
      status: "released",
    });

    await ctx.db.insert("clips", {
      actorProfileId,
      projectId,
      title: "Official Trailer – The City God Forgot",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      sortOrder: 1,
      isFeatured: true,
    });

    return actorProfileId;
  },
});

/**
 * Add a new clip to the actor's profile.
 */
export const addClip = mutation({
  args: {
    slug: v.string(),
    title: v.string(),
    youtubeUrl: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    stripePaymentUrl: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  async handler(ctx, args) {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("You don't have permission to add clips to this page.");
    }

    const { profile } = owned;

    // Get existing clips to determine sort order
    const existingClips = await ctx.db
      .query("clips")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
      .collect();

    const maxSortOrder = Math.max(0, ...existingClips.map((c) => c.sortOrder ?? 0));

    const clipId = await ctx.db.insert("clips", {
      actorProfileId: profile._id,
      title: args.title,
      youtubeUrl: args.youtubeUrl,
      description: args.description,
      sortOrder: args.sortOrder ?? maxSortOrder + 1,
      stripePaymentUrl: args.stripePaymentUrl,
      isPublic: args.isPublic ?? true, // Default to public for manually added clips
    });

    return { clipId };
  },
});

/**
 * Update an existing clip.
 */
export const updateClip = mutation({
  args: {
    slug: v.string(),
    clipId: v.id("clips"),
    title: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    stripePaymentUrl: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  async handler(ctx, args) {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("You don't have permission to update clips on this page.");
    }

    const { profile } = owned;
    const clip = await ctx.db.get(args.clipId);

    if (!clip || clip.actorProfileId !== profile._id) {
      throw new Error("Clip not found.");
    }

    // Build update object with only provided fields
    const updates: Record<string, string | number | boolean | undefined> = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.youtubeUrl !== undefined) updates.youtubeUrl = args.youtubeUrl;
    if (args.description !== undefined) updates.description = args.description;
    if (args.sortOrder !== undefined) updates.sortOrder = args.sortOrder;
    if (args.stripePaymentUrl !== undefined) updates.stripePaymentUrl = args.stripePaymentUrl;
    if (args.isPublic !== undefined) updates.isPublic = args.isPublic;

    await ctx.db.patch(args.clipId, updates);

    return { ok: true };
  },
});

/**
 * Delete a clip.
 */
export const deleteClip = mutation({
  args: {
    slug: v.string(),
    clipId: v.id("clips"),
  },
  async handler(ctx, args) {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("You don't have permission to delete this clip.");
    }

    const { profile } = owned;
    const clip = await ctx.db.get(args.clipId);

    if (!clip || clip.actorProfileId !== profile._id) {
      throw new Error("Clip not found.");
    }

    await ctx.db.delete(args.clipId);

    return { ok: true };
  },
});

/**
 * Reorder clips by updating their sortOrder.
 */
export const reorderClips = mutation({
  args: {
    slug: v.string(),
    clipIds: v.array(v.id("clips")),
  },
  async handler(ctx, args) {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) {
      throw new Error("You don't have permission to reorder clips.");
    }

    const { profile } = owned;

    // Update sort order for each clip
    for (let i = 0; i < args.clipIds.length; i++) {
      const clip = await ctx.db.get(args.clipIds[i]);
      if (clip && clip.actorProfileId === profile._id) {
        await ctx.db.patch(args.clipIds[i], { sortOrder: i + 1 });
      }
    }

    return { ok: true };
  },
});
