import { nextJsHandler } from "@convex-dev/better-auth/nextjs";

// The nextJsHandler proxies auth requests from Next.js to Convex HTTP endpoints.
// We explicitly pass the convexSiteUrl to ensure proper routing in all environments.
// Auto-detection may fail if NEXT_PUBLIC_CONVEX_SITE_URL is not available at runtime.
const convexSiteUrl =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
  process.env.CONVEX_SITE_URL ||
  "https://marvelous-bat-438.convex.site";

// DEBUG: Log the convexSiteUrl being used
console.log(`[AUTH SERVER DEBUG] Resolved convexSiteUrl: ${convexSiteUrl}`);
console.log(`[AUTH SERVER DEBUG] NEXT_PUBLIC_CONVEX_SITE_URL: ${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}`);
console.log(`[AUTH SERVER DEBUG] CONVEX_SITE_URL: ${process.env.CONVEX_SITE_URL}`);

export const { GET, POST } = nextJsHandler({
  convexSiteUrl,
});
