import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Middleware is optional for Better Auth + Convex.
// This lightweight version allows all requests to pass through.
// Add route protection logic here if needed in the future.
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  // Only run on routes that need protection (currently none)
  // Explicitly exclude static files, images, and API routes
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"]
};
