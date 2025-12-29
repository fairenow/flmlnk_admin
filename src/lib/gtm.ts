/**
 * GTM is now initialized at the root layout level (src/app/layout.tsx).
 * This file provides utilities for pushing events to the dataLayer.
 */

declare global {
  interface Window {
    dataLayer: Array<Record<string, unknown>>;
    __gtmSlug?: string;
  }
}

/**
 * Set the current actor slug context for page-owner tracking.
 * Call this on actor profile pages to associate events with the profile.
 */
export function setActorSlugContext(slug: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (!slug || window.__gtmSlug === slug) {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: "gtm.slug_view",
    actor_slug: slug,
  });

  window.__gtmSlug = slug;
}

/**
 * @deprecated Use setActorSlugContext instead. GTM script is now loaded at root.
 * Kept for backward compatibility.
 */
export function injectGTMForSlug(slug: string) {
  setActorSlugContext(slug);
}

/**
 * Push a custom event to Google Tag Manager dataLayer.
 * Events will include actor_slug if set via setActorSlugContext.
 */
export function pushGTMEvent(
  eventName: string,
  data: Record<string, unknown> = {},
) {
  if (typeof window === "undefined") {
    return;
  }

  window.dataLayer = window.dataLayer || [];

  // Include actor_slug context if available (for page-owner analytics)
  const eventData: Record<string, unknown> = {
    event: eventName,
    ...data,
  };

  // Add actor_slug to events on actor pages for segmentation
  if (window.__gtmSlug && !data.actor_slug) {
    eventData.actor_slug = window.__gtmSlug;
  }

  window.dataLayer.push(eventData);
}

/**
 * Push a page view event (for SPA navigation tracking).
 */
export function pushPageView(pagePath?: string, pageTitle?: string) {
  pushGTMEvent("page_view", {
    page_path: pagePath ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
    page_title: pageTitle ?? (typeof document !== "undefined" ? document.title : undefined),
  });
}
