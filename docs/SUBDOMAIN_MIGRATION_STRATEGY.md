# Subdomain Migration Strategy: actors.flmlnk.com → film.flmlnk.com

## Executive Summary

This document outlines the migration plan to transition from `actors.flmlnk.com` to `film.flmlnk.com` as the primary subdomain. This change supports a broader use case beyond actor profiles, positioning the platform for filmmakers, distributors, and general film content.

---

## Current State Analysis

### Current Domain Configuration
| Subdomain | Current Use | Status |
|-----------|-------------|--------|
| `actors.flmlnk.com` | Primary application subdomain | Active - needs migration |
| `film.flmlnk.com` | Footer links (Terms, Privacy, Cookies) | Already exists |
| `flmlnk.com` | Base domain (email sender, documentation) | No change needed |

### URL Structure
- **Current pattern**: `https://actors.flmlnk.com/f/{slug}`
- **New pattern**: `https://film.flmlnk.com/f/{slug}`

---

## Impact Assessment

### 1. No Database Schema Changes Required ✅

The Convex database schema stores **relative slugs**, not full URLs. This is excellent for migration:

```typescript
// convex/schema.ts:18
slug: v.string(), // for /actor/:slug or subdomain mapping
```

**Why this is good:**
- All URL generation happens dynamically via `buildPublicPageUrl(slug)`
- Changing `SITE_URL` environment variable automatically updates all generated URLs
- No data migration or database changes needed

### 2. Affected Files & Locations

#### A. Environment Variables (Critical)

| Variable | Current Value | New Value | Location |
|----------|---------------|-----------|----------|
| `SITE_URL` | `https://actors.flmlnk.com` | `https://film.flmlnk.com` | Vercel + Convex |
| `NEXT_PUBLIC_SITE_URL` | (if set) | Update to new domain | Vercel |

**Files referencing these:**
- `convex/auth.ts` - Auth callback URLs
- `convex/auth.config.ts` - OAuth configuration
- `src/lib/auth-client.ts` - Client-side auth
- `src/lib/siteUrl.ts` - URL generation

#### B. Code Changes Required

| File | Line(s) | Change Description |
|------|---------|-------------------|
| `README.md` | 65, 77 | Update documentation references |
| `DEPLOYMENT_SETUP.md` | 17, 19, 44, 90, 92 | Update deployment docs |
| `.env.example` | 11 | Update example SITE_URL |
| `.env.local.example` | 11 | Update example SITE_URL |

#### C. Footer Links (Already Using film.flmlnk.com)

These files already point to `film.flmlnk.com`:
- `netflix/NetflixFooter.tsx` - Lines 57, 71-73
- `src/components/actorPage/Footer.tsx` - Line 50

**No changes needed here** - they're already correct!

#### D. Email Configuration

| Reference | File | Impact |
|-----------|------|--------|
| `inquiries@flmlnk.com` | `convex/email.ts:24,52,196` | No change (uses base domain) |
| `support@flmlnk.com` | privacy/terms pages | No change (uses base domain) |
| Footer link in emails | `convex/email.ts:170` | Consider updating to film.flmlnk.com |

### 3. External Services Impact

| Service | Impact | Action Required |
|---------|--------|-----------------|
| **Vercel** | Domain configuration | Add `film.flmlnk.com` as primary |
| **Convex** | SITE_URL env variable | Update via `npx convex env set` |
| **Google OAuth** | Authorized redirect URIs | Add new callback URL |
| **Resend (Email)** | Domain verification | Verify `film.flmlnk.com` if using for sending |
| **DNS Provider** | CNAME record | Create CNAME for `film` subdomain |

---

## Link Compatibility & SEO Impact

### Existing Links Analysis

| Link Type | Example | Impact |
|-----------|---------|--------|
| Actor profile URLs | `actors.flmlnk.com/f/johnsmith` | **WILL BREAK** without redirect |
| Deep links to clips | `actors.flmlnk.com/f/slug?clip=abc123` | **WILL BREAK** without redirect |
| Shared social links | Various | **WILL BREAK** without redirect |
| Email CTA links | In sent booking notifications | May not be recoverable |

### Redirect Strategy (Critical)

To preserve existing links, implement 301 redirects:

```javascript
// next.config.mjs - Add redirects
async redirects() {
  return [
    {
      source: '/:path*',
      has: [{ type: 'host', value: 'actors.flmlnk.com' }],
      destination: 'https://film.flmlnk.com/:path*',
      permanent: true, // 301 redirect for SEO
    },
  ];
}
```

**Alternative approach - Vercel Configuration:**
```json
// vercel.json
{
  "redirects": [
    {
      "source": "/(.*)",
      "destination": "https://film.flmlnk.com/$1",
      "permanent": true
    }
  ]
}
```

---

## Migration Checklist

### Phase 1: Preparation
- [ ] **Backup current deployment** (document all env vars)
- [ ] **DNS Setup**: Create CNAME record `film` → Vercel deployment
- [ ] **Verify film.flmlnk.com** currently points to correct location
- [ ] **Document all existing actor profile URLs** for testing

### Phase 2: Configuration Updates
- [ ] **Update Vercel domains**: Add `film.flmlnk.com` as primary domain
- [ ] **Update Vercel environment variables**:
  - Set `SITE_URL=https://film.flmlnk.com`
  - Set `NEXT_PUBLIC_SITE_URL=https://film.flmlnk.com` (if used)
- [ ] **Update Convex environment variables**:
  ```bash
  npx convex env set SITE_URL "https://film.flmlnk.com"
  ```

### Phase 3: OAuth Provider Updates
- [ ] **Google Cloud Console**:
  - Add `https://film.flmlnk.com` to authorized JavaScript origins
  - Add `https://film.flmlnk.com/api/auth/callback/google` to redirect URIs
- [ ] **Any other OAuth providers** - update similarly

### Phase 4: Code Updates
- [ ] Update `README.md` - replace `actors.flmlnk.com` references
- [ ] Update `DEPLOYMENT_SETUP.md` - replace `actors.flmlnk.com` references
- [ ] Update `.env.example` and `.env.local.example`
- [ ] Optional: Update email footer link in `convex/email.ts`

### Phase 5: Redirect Implementation
- [ ] **Keep actors.flmlnk.com domain active**
- [ ] **Configure 301 redirects** from old domain to new
- [ ] **Test all redirect scenarios**:
  - Home page
  - Profile pages `/f/{slug}`
  - Deep links with query params
  - Static pages (privacy, terms)

### Phase 6: Testing
- [ ] Test new user signup flow
- [ ] Test OAuth login flow
- [ ] Test profile creation and URL generation
- [ ] Test share functionality (URLs use new domain)
- [ ] Test email notifications (booking inquiries)
- [ ] Test redirect from old domain
- [ ] Test SEO - verify 301 redirects work

### Phase 7: Monitoring
- [ ] Monitor for 404 errors
- [ ] Check analytics for redirect traffic
- [ ] Verify Google indexing transition (Search Console)

---

## Rollback Plan

If issues arise:

1. **Revert Vercel environment variables** back to `actors.flmlnk.com`
2. **Revert Convex environment**:
   ```bash
   npx convex env set SITE_URL "https://actors.flmlnk.com"
   ```
3. **Remove redirects** (if causing issues)
4. **Update OAuth providers** back to old domain

---

## Timeline Estimate

| Phase | Tasks |
|-------|-------|
| **Phase 1** | Preparation & DNS |
| **Phase 2** | Configuration updates |
| **Phase 3** | OAuth provider updates |
| **Phase 4** | Code updates |
| **Phase 5** | Redirect implementation |
| **Phase 6** | Testing |
| **Phase 7** | Monitoring |

---

## Files to Modify Summary

### Code Changes (4 files)
1. `README.md` - Documentation
2. `DEPLOYMENT_SETUP.md` - Deployment docs
3. `.env.example` - Example environment
4. `.env.local.example` - Local example environment

### Configuration Changes (External)
1. Vercel Dashboard - Domain & environment variables
2. Convex Dashboard - Environment variables
3. Google Cloud Console - OAuth configuration
4. DNS Provider - CNAME record

### Database Changes
**None required** - slugs are stored relatively

---

## Technical Notes

### Why the Migration is Low-Risk

1. **Dynamic URL Generation**: All URLs are built at runtime via `buildPublicPageUrl()`:
   ```typescript
   // src/lib/siteUrl.ts
   export function buildPublicPageUrl(slug: string, params?) {
     const siteUrl = getPublicSiteUrl(); // Uses SITE_URL env var
     return `${siteUrl}/f/${slug}${query}`;
   }
   ```

2. **No Hardcoded Production URLs**: The codebase doesn't hardcode `actors.flmlnk.com` in application logic - only in documentation.

3. **Footer Already Correct**: The Footer components already use `film.flmlnk.com` for Terms/Privacy links.

4. **Schema Designed for Flexibility**: The `slug` field comment in schema.ts indicates subdomain mapping was anticipated.

### Potential Gotchas

1. **OAuth Callbacks**: Must update Google OAuth before deployment or signups will fail
2. **Old Shared Links**: Social shares and bookmarks will need redirects
3. **Email Links Already Sent**: Booking notification emails already sent cannot be updated
4. **SEO Impact**: Even with 301 redirects, expect temporary ranking fluctuation

---

## Questions to Resolve Before Migration

1. **Timeline**: When should this migration happen?
2. **Traffic Analysis**: How much traffic is coming to `actors.flmlnk.com`?
3. **Branding**: Should any UI text change (e.g., "actor page" → "profile page")?
4. **Email Sender**: Should email sender change from `inquiries@flmlnk.com`?
5. **Old Domain**: How long to maintain `actors.flmlnk.com` redirects?

---

## Conclusion

The migration from `actors.flmlnk.com` to `film.flmlnk.com` is straightforward due to the well-architected codebase:

- ✅ No database changes required
- ✅ Only 4 code files need updates (all documentation)
- ✅ Environment variable changes handle URL generation
- ✅ Footer links already use the new domain
- ⚠️ OAuth providers need updating
- ⚠️ 301 redirects critical for link preservation
