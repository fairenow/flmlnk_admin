# FlmLnk + Convex Starter

This repository boots a Next.js App Router experience with a Convex backend and Better Auth wiring.

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.local.example` to `.env.local` and fill in your environment values (the Convex deployment values are already wired up):
   ```bash
   CONVEX_DEPLOYMENT_KEY="<your deployment key>" # Provided out-of-band
   CONVEX_DEPLOYMENT_URL="https://marvelous-bat-438.convex.cloud"
   CONVEX_SITE_URL="https://marvelous-bat-438.convex.site"

   NEXT_PUBLIC_CONVEX_URL="https://marvelous-bat-438.convex.cloud"
   NEXT_PUBLIC_CONVEX_SITE_URL="https://marvelous-bat-438.convex.site"

   SITE_URL="http://localhost:3000"

   # Uncomment and fill when enabling Google sign-in
   # GOOGLE_CLIENT_ID=""
   # GOOGLE_CLIENT_SECRET=""
   ```
3. Start Convex locally in one terminal:
   ```bash
   npm run convex:dev
   ```
4. Run the Next.js dev server in another terminal:
   ```bash
   npm run dev
   ```

## Convex wiring

- The Convex schema (tables, indexes, and validators) lives at `convex/schema.ts`.
- Start `npm run convex:dev` once to push the schema to your Convex deployment and generate `_generated` types.
- When ready to deploy the backend changes, run `npm run convex:deploy`.

### Tables defined today

- `users` keyed by `authId` for Better Auth identities.
- `actor_profiles` connected to `users`, indexed by `slug` and `userId`.
- `projects` and `clips` tied to each actor profile, plus `fan_emails` captured from fans.
- `page_templates` for layout presets, `boost_campaigns` for paid campaigns, and `analytics_events` for tracked interactions.
- `usage_daily_metrics` snapshot written by the scheduled cron job in `convex/crons.ts`.

## Deploying to Vercel

### Prerequisites

1. A Convex deployment (already configured for this project)
2. A Vercel account

### Environment Variables

Configure the following environment variables in your Vercel project settings:

**Required:**
- `CONVEX_DEPLOYMENT_URL="https://marvelous-bat-438.convex.cloud"`
- `CONVEX_SITE_URL="https://marvelous-bat-438.convex.site"`
- `NEXT_PUBLIC_CONVEX_URL="https://marvelous-bat-438.convex.cloud"`
- `NEXT_PUBLIC_CONVEX_SITE_URL="https://marvelous-bat-438.convex.site"`
- `SITE_URL="https://film.flmlnk.com"`
- `BETTER_AUTH_SECRET` - Generate with: `openssl rand -base64 32` (already generated in .env.local)

**Optional (for Google OAuth):**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### Deploy Steps

1. Push your code to GitHub
2. Import the repository in Vercel
3. Configure environment variables in Vercel project settings (listed above)
4. Set custom domain to `film.flmlnk.com` in Vercel project settings
5. Deploy!

## Notes

- Auth routes live under `app/api/auth/[...betterAuth]/route.ts`.
- Convex functions and schema live in the `convex/` directory; regenerate `_generated` outputs with `npx convex dev`.
- Update the placeholder homepage in `app/page.tsx` as product flows come online.
- TypeScript type checking for Convex functions is handled separately by the Convex CLI to avoid build conflicts.
