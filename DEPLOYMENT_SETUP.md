# Deployment Setup Guide

## Critical Environment Variables

For the authentication to work properly, the following environment variables **MUST** be set in your deployment environment:

### Vercel/Next.js Environment Variables

Add these in your Vercel dashboard (Settings → Environment Variables):

```bash
# Convex URLs (already in .env.example)
NEXT_PUBLIC_CONVEX_URL=https://marvelous-bat-438.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://marvelous-bat-438.convex.site

# CRITICAL: Set this to your actual domain!
# For production: https://film.flmlnk.com
# For preview deployments: Use the preview URL
SITE_URL=https://film.flmlnk.com

# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=<your-generated-secret>

# REQUIRED: Convex Deploy Key for auto-deployment during build
# Get this from Convex Dashboard → Settings → Deploy Keys → Production Deploy Key
CONVEX_DEPLOY_KEY=<your-convex-production-deploy-key>
```

**Important**: The build script now automatically deploys Convex functions before building Next.js:
```json
"build": "npx convex deploy && next build"
```
This requires `CONVEX_DEPLOY_KEY` to be set in Vercel.

### Convex Environment Variables

Set these using `npx convex env set` command:

```bash
# Generate a secure secret
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"

# Set your production site URL
npx convex env set SITE_URL "https://film.flmlnk.com"
```

## Common Issues

### 403 Error on Signup

**Cause**: Missing or incorrect `SITE_URL` or `BETTER_AUTH_SECRET` environment variables.

**Solution**:
1. Verify `SITE_URL` matches your actual domain (not localhost)
2. Ensure `BETTER_AUTH_SECRET` is set in both Vercel and Convex environments
3. Redeploy after setting environment variables

### Could not find public function

**Error**: `Could not find public function for 'users:ensureFromAuth'`

**Cause**: Convex functions haven't been deployed to match your code.

**Solution**:
1. Ensure `CONVEX_DEPLOY_KEY` is set in Vercel environment variables
2. Redeploy in Vercel - the build script will auto-deploy Convex functions
3. Alternatively, deploy manually: `npx convex deploy` (requires `.env.local` with `CONVEX_DEPLOYMENT_KEY`)

### Middleware Configuration

The middleware has been simplified to a pass-through because:
- Middleware is **optional** for Better Auth + Convex
- The previous `convexAuthNextjsMiddleware` was interfering with auth requests
- Route protection should be done at the page/component level, not middleware

## Verification Steps

1. Check Vercel environment variables are set
2. Run `npx convex env list` to verify Convex variables
3. Ensure the deployed site uses the correct `SITE_URL`
4. Test signup functionality

## Development vs Production

### Development (localhost:3000)
```bash
SITE_URL=http://localhost:3000
```

### Production (film.flmlnk.com)
```bash
SITE_URL=https://film.flmlnk.com
```

Make sure to set the correct value for each environment!
