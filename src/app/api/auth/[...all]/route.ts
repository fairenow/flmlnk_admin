// Next.js Route Handler for Better Auth
import { GET as _GET, POST as _POST } from "@/lib/auth-server";
import { NextRequest, NextResponse } from "next/server";

// Debug wrapper to log auth requests and trace 403 errors
function logRequest(method: string, request: NextRequest) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  const cookie = request.headers.get("cookie");

  console.log(`[AUTH DEBUG] ${method} ${url.pathname}${url.search}`);
  console.log(`[AUTH DEBUG] Origin: ${origin}`);
  console.log(`[AUTH DEBUG] Referer: ${referer}`);
  console.log(`[AUTH DEBUG] Host: ${host}`);
  console.log(`[AUTH DEBUG] Has cookies: ${!!cookie}`);
  console.log(`[AUTH DEBUG] NEXT_PUBLIC_CONVEX_SITE_URL: ${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}`);
  console.log(`[AUTH DEBUG] CONVEX_SITE_URL: ${process.env.CONVEX_SITE_URL}`);
  console.log(`[AUTH DEBUG] SITE_URL: ${process.env.SITE_URL}`);
  console.log(`[AUTH DEBUG] NEXT_PUBLIC_SITE_URL: ${process.env.NEXT_PUBLIC_SITE_URL}`);
}

async function logResponse(method: string, response: Response | NextResponse) {
  console.log(`[AUTH DEBUG] ${method} Response status: ${response.status}`);
  if (response.status >= 400) {
    // Clone the response to read the body without consuming it
    const cloned = response.clone();
    try {
      const text = await cloned.text();
      console.log(`[AUTH DEBUG] ${method} Error body: ${text.slice(0, 500)}`);
    } catch {
      console.log(`[AUTH DEBUG] ${method} Could not read error body`);
    }
  }
  return response;
}

export async function GET(request: NextRequest, context: { params: Promise<{ all: string[] }> }) {
  logRequest("GET", request);
  try {
    const response = await _GET(request, context);
    return logResponse("GET", response);
  } catch (error) {
    console.error(`[AUTH DEBUG] GET threw error:`, error);
    throw error;
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ all: string[] }> }) {
  logRequest("POST", request);
  try {
    const response = await _POST(request, context);
    return logResponse("POST", response);
  } catch (error) {
    console.error(`[AUTH DEBUG] POST threw error:`, error);
    throw error;
  }
}
