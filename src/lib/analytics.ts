/**
 * Client-side analytics utilities for session tracking.
 * Used to populate sessionId, userAgent, and referrer for Convex analytics events.
 */

const SESSION_STORAGE_KEY = "flmlnk_session_id";

/**
 * Generate a unique session ID.
 * Uses a combination of timestamp and random string for uniqueness.
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomPart}`;
}

/**
 * Get or create a session ID for the current browser session.
 * The session ID persists in sessionStorage, so it remains consistent
 * across page navigations within the same browser session.
 */
export function getSessionId(): string {
  if (typeof window === "undefined") {
    return `server-${Date.now()}`;
  }

  try {
    let sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionId) {
      sessionId = generateSessionId();
      sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }
    return sessionId;
  } catch {
    // sessionStorage may be unavailable (e.g., private browsing mode)
    return generateSessionId();
  }
}

/**
 * Get the user agent string for analytics tracking.
 */
export function getUserAgent(): string | undefined {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return undefined;
  }
  return navigator.userAgent;
}

/**
 * Get the referrer URL for analytics tracking.
 */
export function getReferrer(): string | undefined {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return undefined;
  }
  return document.referrer || undefined;
}

/**
 * Get all session tracking data in one call.
 * Convenient for passing to Convex logEvent calls.
 */
export function getSessionData() {
  return {
    sessionId: getSessionId(),
    userAgent: getUserAgent(),
    referrer: getReferrer(),
  };
}
