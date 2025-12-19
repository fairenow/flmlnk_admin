# Authentication and route access

This document summarizes how authentication, onboarding, and route protection work across the app.

## Stack overview
- **Better Auth + Convex** powers identity: the Next.js API route at `/api/auth/[...all]` forwards all GET/POST requests to the Better Auth handler configured with the Convex adapter. 【F:src/lib/auth-server.ts†L1-L4】【F:convex/auth.ts†L10-L34】
- The React auth client is created with Better Auth and the Convex plugin, using the fully qualified `baseURL` for server and browser contexts. 【F:src/lib/auth-client.ts†L1-L22】
- Middleware currently allows every request to pass through; no paths are blocked at the edge. 【F:middleware.ts†L1-L13】

## New user flow
1. **Signup form** at `/signup` calls `signUp.email` with email/password and mirrors the identity into the Convex `users` table via `users.ensureFromAuth`. On success the user is sent to onboarding. 【F:src/app/signup/page.tsx†L18-L71】
2. **Onboarding entry** (`/onboarding`) checks session state; unauthenticated visitors are prompted to sign in with Google. 【F:src/app/onboarding/page.tsx†L11-L53】
3. **Profile creation** finishes with the `filmmakers.completeOnboarding` mutation, which requires authentication, upserts the `users` row, enforces slug uniqueness, and seeds the initial profile/project/clip records before returning the slug. 【F:convex/filmmakers.ts†L257-L455】

## Returning user flow
- **Signin page** (`/signin`) reads onboarding status to decide where to send the user after Google sign-in: dashboard if a profile exists, onboarding otherwise, or a custom `next`/`fromSlug` redirect when provided. 【F:src/app/signin/signin-content.tsx†L16-L73】
- **Onboarding re-entry**: authenticated users with an existing profile see a shortcut card linking to the dashboard. 【F:src/app/onboarding/page.tsx†L16-L40】【F:src/app/onboarding/page.tsx†L61-L73】
- **Dashboard** loads owner data from Convex; if the session is missing it redirects to `/signin?next=/dashboard/actor`. 【F:src/app/dashboard/actor/page.tsx†L12-L34】

## Convex auth expectations
- Mutations/queries that write or return owner data require an authenticated identity via `ctx.auth.getUserIdentity()` and will throw or return null when missing: `users.ensureFromAuth`, `filmmakers.getOwnerEditablePage`, `filmmakers.updateOwnerPage`, `filmmakers.completeOnboarding`, and `devDebug.getCurrentActorSnapshot`. 【F:convex/users.ts†L8-L30】【F:convex/filmmakers.ts†L7-L203】【F:convex/filmmakers.ts†L257-L455】【F:convex/devDebug.ts†L115-L163】
- Public-facing reads skip auth: `filmmakers.getPublicBySlug`, `devDebug.getActorPageBySlug`, and `devDebug.dumpActorPageForSlug`. 【F:convex/filmmakers.ts†L137-L186】【F:convex/devDebug.ts†L39-L87】【F:convex/devDebug.ts†L89-L133】

## Route access summary
| Path | Protection behavior |
| --- | --- |
| `/` | Public marketing shell. |
| `/signup` | Public form; successful signup signs in and redirects to onboarding. 【F:src/app/signup/page.tsx†L18-L71】 |
| `/signin` | Public; after sign-in redirects based on onboarding status or query params. 【F:src/app/signin/signin-content.tsx†L16-L73】 |
| `/onboarding` | Publicly reachable UI; gated actions require being signed in (prompt shown when unauthenticated). 【F:src/app/onboarding/page.tsx†L11-L53】 |
| `/dashboard/actor` | Client-side guard: redirects unauthenticated users to `/signin?next=/dashboard/actor`. 【F:src/app/dashboard/actor/page.tsx†L12-L34】 |
| `/f/[slug]` | Public filmmaker page; offers owner dashboard link when the signed-in user matches the profile. 【F:src/app/f/[slug]/page.tsx†L1-L74】 |
| `/dev/actor-snapshot` | Dev-only helper; hidden in production, otherwise requires sign-in to view. 【F:src/app/dev/actor-snapshot/page.tsx†L1-L36】 |
| `API /api/auth/[...all]` | Better Auth handler for all auth routes. 【F:src/lib/auth-server.ts†L1-L4】 |
| `Convex functions` | Auth required for owner mutations/queries noted above; public reads otherwise. 【F:convex/filmmakers.ts†L1-L186】【F:convex/devDebug.ts†L4-L133】 |
