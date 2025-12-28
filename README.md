# FlmLnk Admin Portal

This is the **admin site** for the FlmLnk platform. It provides administrative capabilities for managing users, campaigns, analytics, content generation, and platform-wide operations.

## Architecture Overview

### Shared Infrastructure, Separate Concerns

The admin portal shares the same **Convex** and **Modal** infrastructure as the main user-facing site (`flmlnk`), but maintains strict separation through admin-specific implementations:

| Layer | Shared | Admin-Specific |
|-------|--------|----------------|
| **Convex Backend** | Same deployment & database | Admin-prefixed tables, queries, and mutations |
| **Modal Functions** | Same Modal project | Admin-specific service functions |
| **Authentication** | Same auth system | Admin role validation & permissions |

### Why This Approach?

1. **Single Source of Truth**: Both sites read from the same database, ensuring data consistency
2. **No User Impact**: Admin operations use dedicated tables/queries (e.g., `admin_analytics`, `adminGetUsers`) to avoid affecting user-side performance or functionality
3. **Centralized Deployment**: Convex and Modal projects are built and deployed from the **main user repository** (`flmlnk`), with admin additions included there
4. **Clear Boundaries**: Admin services are namespaced to prevent accidental cross-contamination

### Admin-Specific Components

The following are built as admin-specific implementations in the shared Convex/Modal projects:

- **Emails**: Admin email campaigns, platform announcements, user notifications
- **Boosts**: Campaign management, boost approval/rejection, analytics
- **Analytics**: Platform-wide metrics, user behavior analysis, deep analytics
- **Generation**: Admin content generation tools and templates
- **User Management**: User lookup, moderation, support tools

### For the User-Side Team

When working on the main `flmlnk` repository, be aware that:

1. **Convex schema** (`convex/schema.ts`) includes admin tables - these are prefixed with `admin_` or clearly documented
2. **Convex functions** may include admin-specific files (e.g., `convex/admin/`) - these should not be modified without admin team coordination
3. **Modal functions** may include admin endpoints - similarly namespaced and separated
4. **Deployments** of Convex and Modal affect both user and admin sites - coordinate releases accordingly

---

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

## Convex Wiring

> **Important**: The Convex backend is managed in the **main user repository** (`flmlnk`). This admin site connects to the same Convex deployment but does not manage the schema directly.

### Local Development

- This project syncs types from the shared Convex deployment using `npm run convex:dev`
- **Do not modify** `convex/schema.ts` here - changes should be made in the main `flmlnk` repository
- The `_generated` types are pulled from the shared deployment

### Adding Admin Features

When you need new admin functionality:

1. **Schema changes**: Add admin-prefixed tables in the main `flmlnk` repo's `convex/schema.ts`
2. **Queries/Mutations**: Create admin-specific functions in `convex/admin/` directory in the main repo
3. **Deploy**: Run `npm run convex:deploy` from the main `flmlnk` repository
4. **Sync**: Run `npm run convex:dev` here to pull updated types

### Table Architecture

**Shared Tables** (read-only from admin, defined in main repo):
- `users` - User accounts and auth identities
- `actor_profiles` - Creator profiles
- `projects` and `clips` - User content
- `fan_emails` - Fan subscriptions
- `boost_campaigns` - User-created campaigns
- `analytics_events` - User-side event tracking

**Admin-Specific Tables** (managed via main repo, used by admin):
- `admin_campaigns` - Platform-wide email campaigns
- `admin_analytics_*` - Admin analytics and reporting
- `admin_audit_log` - Admin action logging
- Additional admin tables as needed (prefixed with `admin_`)

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

## Modal Integration

> **Important**: Like Convex, Modal functions are managed in the **main user repository** (`flmlnk`).

### Admin Modal Services

Admin-specific Modal functions should be created in the main repo with clear namespacing:

- `admin_email_service.py` - Bulk email sending, campaign management
- `admin_generation_service.py` - Admin content generation tools
- `admin_analytics_service.py` - Heavy analytics processing

### Calling Modal from Admin

This admin site calls the same Modal endpoints as the user site. Admin functions are distinguished by:
1. Function naming (prefixed with `admin_`)
2. Admin authentication validation within the function
3. Separate rate limits and quotas where applicable

---

## Notes

- **Auth routes** live under `app/api/auth/[...betterAuth]/route.ts`
- **Convex functions** are managed in the main `flmlnk` repo - run `npx convex dev` here only to sync types
- **Modal functions** are similarly managed in the main `flmlnk` repo
- **Admin permissions** should be validated on both the frontend and in Convex/Modal functions
- TypeScript type checking for Convex functions is handled separately by the Convex CLI to avoid build conflicts

## Related Repositories

- **flmlnk** (main user site) - Contains the source of truth for Convex schema and Modal functions
- **flmlnk_admin** (this repo) - Admin frontend that consumes the shared backend
