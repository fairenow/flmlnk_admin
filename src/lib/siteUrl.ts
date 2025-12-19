export function getPublicSiteUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return (
    process.env.NEXT_PUBLIC_ADMIN_SITE_URL ||
    process.env.ADMIN_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "http://localhost:3000"
  );
}

export function buildPublicPageUrl(slug: string, params?: Record<string, string | number>) {
  const siteUrl = getPublicSiteUrl();
  const query = params
    ? `?${new URLSearchParams(
        Object.entries(params).map(([key, value]) => [key, String(value)]),
      )}`
    : "";

  return `${siteUrl}/f/${slug}${query}`;
}
