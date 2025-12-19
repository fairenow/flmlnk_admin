/**
 * Client-side analytics utilities for tracking events to Convex.
 */

const SESSION_ID_KEY = "flmlnk_session_id";
const SESSION_EXPIRY_KEY = "flmlnk_session_expiry";
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Generate a unique session ID.
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomPart}`;
}

/**
 * Get or create a session ID for analytics tracking.
 * Sessions expire after 30 minutes of inactivity.
 */
export function getSessionId(): string {
  if (typeof window === "undefined") {
    return `server-${Date.now()}`;
  }

  try {
    const existingId = sessionStorage.getItem(SESSION_ID_KEY);
    const expiryStr = sessionStorage.getItem(SESSION_EXPIRY_KEY);
    const now = Date.now();

    // Check if we have a valid, non-expired session
    if (existingId && expiryStr) {
      const expiry = parseInt(expiryStr, 10);
      if (now < expiry) {
        // Refresh the expiry time
        sessionStorage.setItem(
          SESSION_EXPIRY_KEY,
          (now + SESSION_DURATION_MS).toString()
        );
        return existingId;
      }
    }

    // Create a new session
    const newId = generateSessionId();
    sessionStorage.setItem(SESSION_ID_KEY, newId);
    sessionStorage.setItem(
      SESSION_EXPIRY_KEY,
      (now + SESSION_DURATION_MS).toString()
    );
    return newId;
  } catch {
    // Fallback if sessionStorage is not available
    return generateSessionId();
  }
}

/**
 * Get the user agent string for analytics.
 */
export function getUserAgent(): string | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }
  return navigator.userAgent;
}

/**
 * Get the referrer URL for analytics.
 */
export function getReferrer(): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  return document.referrer || undefined;
}
