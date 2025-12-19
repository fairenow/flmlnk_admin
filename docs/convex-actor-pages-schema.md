# Convex actor pages schema

This document summarizes how Convex models actor pages today, including onboarding writes and the public page query.
The canonical payload shape shared between frontend and backend lives in `types/actorPage.ts` and mirrors the "ActorPage"
JSON contract (profile metadata, featuredProject, clips, notableProjects, comments, theme, and settings fields).

## Table: actor_profiles

Fields:
- `userId`: `Id<"users">`
- `displayName`: `string`
- `slug`: `string`
- `headline`: `string?`
- `bio`: `string?`
- `avatarUrl`: `string?`
- `location`: `string?`
- `imdbId`: `string?`
- `imdbUrl`: `string?`
- `theme`: `object? { primaryColor?: string, accentColor?: string, layoutVariant?: string }`
- `genres`: `string[]?`
- `platforms`: `Array<{ key: string; label: string; url?: string }>?`

Indexes:
- `by_user` on `userId`
- `by_slug` on `slug`

Usage:
- Created or updated during onboarding via `filmmakers.completeOnboarding`, which rejects slugs already claimed by another user and stores genre and platform selections.
- Queried for the public page slug route (`filmmakers.getPublicBySlug`, used by `app/f/[slug]/page.tsx`).
- Queried for developer snapshots (`devDebug.getCurrentActorSnapshot`) and usage metrics aggregation.

## Table: projects

Fields:
- `actorProfileId`: `Id<"actor_profiles">`
- `title`: `string`
- `logline`: `string?`
- `description`: `string?`
- `posterUrl`: `string?`
- `releaseYear`: `number?`
- `roleName`: `string?`
- `roleType`: `string?`
- `imdbTitleId`: `string?`
- `tubiUrl`: `string?`
- `status`: `string?`

Indexes:
- `by_actorProfile` on `actorProfileId`

Usage:
- Onboarding upserts the primary project for the actor/filmmaker and seeds default logline/role metadata based on the selected role.
- Included in the public page payload returned by `filmmakers.getPublicBySlug` and displayed as the filmography list.
- Queried with clips in `devDebug.getCurrentActorSnapshot`; included in daily metrics counts.

## Table: clips

Fields:
- `actorProfileId`: `Id<"actor_profiles">`
- `projectId`: `Id<"projects">?`
- `title`: `string`
- `youtubeUrl`: `string`
- `sortOrder`: `number?`
- `isFeatured`: `boolean?`

Indexes:
- `by_actorProfile` on `actorProfileId`
- `by_project` on `projectId`

Usage:
- Onboarding inserts or updates a featured clip tied to the primary project; subsequent onboarding runs repoint the featured clip and URL.
- Public slug queries fetch all clips for the profile to surface a featured trailer link and counts.
- Developer snapshot query loads clips per project for debugging.

## Table: analytics_events

Fields:
- `actorProfileId`: `Id<"actor_profiles">?`
- `projectId`: `Id<"projects">?`
- `clipId`: `Id<"clips">?`
- `eventType`: `string`
- `sessionId`: `string`
- `userAgent`: `string?`
- `referrer`: `string?`

Indexes:
- `by_actorProfile` on `actorProfileId`
- `by_project` on `projectId`
- `by_clip` on `clipId`

Usage:
- Table exists for tracking public-page interactions (page views, clip plays, email submissions), though no write/query code is present yet in this repo.

## Table: usage_daily_metrics

Fields:
- `day`: `string` (ISO date)
- `users`: `number`
- `actorProfiles`: `number`
- `projects`: `number`
- `createdAt`: `number`

Indexes:
- `by_day` on `day`

Usage:
- Internal cron mutation `usageMetrics.dailySnapshot` counts total users, actor profiles, and projects for the given day.

## Onboarding flow

1. The onboarding UI collects name/slug, role, genres, video info, and platform links in React context (`app/onboarding/OnboardingContext.tsx`).
2. The final step (`app/onboarding/assembling/page.tsx`) calls `filmmakers.completeOnboarding` with that state.
3. `completeOnboarding` upserts the `users` row from auth identity, ensures slug uniqueness, then upserts `actor_profiles`, the primary `projects` row, and a featured `clips` row before redirecting to `/f/{slug}`.

## Public actor page routing

- The public route is `/f/[slug]` (`app/f/[slug]/page.tsx`). It invokes `filmmakers.getPublicBySlug`, which fetches the actor profile by slug, projects indexed by `actorProfileId`, and clips indexed by the same (ordered ascending). The client code highlights the first project, picks the first `isFeatured` clip (or first clip) as the trailer, and renders profile bio/location, genre chips, platform buttons, and filmography metadata.
- See `docs/actor-public-page-flow.md` for a detailed walk-through of the query and UI field usage.
