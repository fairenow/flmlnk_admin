# Actor onboarding to project creation flow

## Client entry points
- The onboarding wizard is defined in `src/app/onboarding/steps.ts` with three data steps (`you`, `flagship`, `links`) plus an `assembling` screen.
- Users supply the slug on the You step (`src/app/onboarding/you/page.tsx`) along with display name, location, and optional headshot upload.
- The flagship film step gathers a streaming link + YouTube trailer, then the links step captures IMDb and social handles. Handles preview into URLs client-side.
- The `assembling` step (`src/app/onboarding/assembling/page.tsx`) calls the Convex action `filmmakers.generateActorPageFromOnboarding`, which triggers OpenAI copy generation before redirecting to `/onboarding/review?slug={slug}`.

## Server-side action + mutation
- `filmmakers.generateActorPageFromOnboarding` (action) validates auth, calls OpenAI for headline/bio/logline/CTA copy, then delegates to `filmmakers.applyGeneratedActorPage`.
- Slug handling: `applyGeneratedActorPage` checks `actor_profiles.by_slug` and rejects duplicates owned by other users.
- `actor_profiles`: upserts by `userId` with generated headline/bio, optional avatar/location, social URLs, and a platform set containing the streaming CTA + trailer link.
- `projects`: reuses or inserts the first project for the profile, populating the generated logline, release year, role name, and CTA link.
- `clips`: reuses or inserts a featured clip pointing at the provided trailer YouTube URL.
- Return value includes the slug and generated copy payload so the client can continue to the review/editor step.

## Slug generation and assumptions
- Slugs remain user-provided and are sanitized client-side but only enforced for uniqueness in the mutation.
- One `actor_profiles` row per user is assumed because the mutation always queries by `userId` and patches or inserts a single record.
- The onboarding flow assumes one primary project per profile (the first `projects` row is reused and updated on subsequent runs) and one featured clip that is inserted or updated every time onboarding completes.
