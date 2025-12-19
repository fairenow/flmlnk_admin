# Public actor page flow

## Route and data source
- **Route:** `/f/[slug]` in `src/app/f/[slug]/page.tsx` renders the public actor/filmmaker page via a client component that reads the slug from `useParams`.
- **Convex query:** `filmmakers.getPublicBySlug` (from `convex/filmmakers.ts`) is invoked with the slug to fetch page data.

## Query behavior
- Looks up the actor profile by slug using the `actor_profiles.by_slug` index; returns `null` when no profile is found.
- Loads all projects for the profile through the `projects.by_actorProfile` index (no ordering enforced).
- Loads all clips for the profile through the `clips.by_actorProfile` index, ordered ascending (Convex default order, effectively by creation time).
- Returns `{ profile, projects, clips }`, leaving presentation logic to the client (e.g., choosing featured items).

## UI usage in `page.tsx`
- **Feature selection:** The first project in `projects` is treated as the featured project; the first clip marked `isFeatured` (or the first clip) becomes the featured trailer.
- **Hero copy:** `profile.displayName` is the page title; `featuredProject.title`, `featuredProject.logline`, and `featuredProject.releaseYear` populate the hero section alongside `profile.genres` chips.
- **Platforms:** `profile.platforms` renders “Watch on” buttons with external links using each entry’s `label`, `key` (for color), and optional `url`.
- **Trailer card:** The featured clip’s `title` and `youtubeUrl` drive the trailer call-to-action; absence of a clip shows a “Video coming soon” placeholder.
- **About section:** `profile.bio` and `profile.location` populate the bio and “Based in …” text when present.
- **Filmography list:** Every project renders `title`, `logline`, `releaseYear`, `roleName`, and `status`; missing projects display a “Filmography coming soon.” fallback.
- **Footer:** Displays `flmlnk.com/{slug}` using the route parameter for the vanity URL line.

## Debugging
- Run `npx convex run devDebug:dumpActorPageForSlug '{"slug":"ramon1"}'` to print the same profile, projects, and clips payload used by the public page for a given slug. The query lives in `convex/devDebug.ts` and uses the same lookups as `filmmakers.getPublicBySlug`.
