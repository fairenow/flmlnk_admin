import { NextRequest, NextResponse } from "next/server";
import { fetchAction } from "convex/nextjs";
import { api } from "@convex/_generated/api";

/**
 * OAuth callback handler for social media platforms
 *
 * This route handles the redirect from social media platforms after OAuth consent.
 * It extracts the authorization code and state, then calls the Convex action
 * to exchange the code for tokens.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle OAuth errors - redirect to actor dashboard as fallback
  if (error) {
    console.error("OAuth error:", error, errorDescription);
    return NextResponse.redirect(
      new URL(
        `/dashboard/actor?social_error=${encodeURIComponent(errorDescription || error)}`,
        request.url
      )
    );
  }

  // Validate required parameters
  if (!code || !state) {
    console.error("Missing code or state in OAuth callback");
    return NextResponse.redirect(
      new URL("/dashboard/actor?social_error=Missing+authorization+parameters", request.url)
    );
  }

  try {
    // Call Convex action to handle the OAuth callback
    const result = await fetchAction(api.socialPostingOAuth.handleOAuthCallback, {
      code,
      state,
    });

    if (result.success) {
      // Redirect to dashboard with success message
      // Use the userSlug if available, otherwise fall back to generic dashboard
      const dashboardPath = result.userSlug
        ? `/dashboard/${encodeURIComponent(result.userSlug)}`
        : '/dashboard/actor';
      return NextResponse.redirect(
        new URL(
          `${dashboardPath}?social_connected=${encodeURIComponent(result.provider || "platform")}`,
          request.url
        )
      );
    } else {
      // Redirect with error - try to get a reasonable dashboard path
      return NextResponse.redirect(
        new URL(
          `/dashboard/actor?social_error=${encodeURIComponent(result.error || "Connection failed")}`,
          request.url
        )
      );
    }
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      new URL(
        `/dashboard/actor?social_error=${encodeURIComponent(
          error instanceof Error ? error.message : "Unknown error"
        )}`,
        request.url
      )
    );
  }
}
