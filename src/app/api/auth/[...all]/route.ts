// Next.js Route Handler for Better Auth
import { GET as _GET, POST as _POST } from "@/lib/auth-server";
import { NextRequest, NextResponse } from "next/server";

// Allowed origins for CORS - these are the domains that can make cross-origin requests
const ALLOWED_ORIGINS = [
  "https://www.flmlnk.com",
  "https://flmlnk.com",
  "https://admin.flmlnk.com",
  "https://actors.flmlnk.com",
  "https://flmlnk-convex-complete.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

// Helper to get CORS headers based on request origin
function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

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

// Helper to add CORS headers to a response
async function addCorsHeaders(request: NextRequest, response: Response | NextResponse): Promise<NextResponse> {
  const corsHeaders = getCorsHeaders(request);

  // Clone the response and add CORS headers
  const newHeaders = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });

  // Read the body if present
  const body = response.body;

  return new NextResponse(body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  logRequest("OPTIONS", request);
  const corsHeaders = getCorsHeaders(request);

  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ all: string[] }> }) {
  logRequest("GET", request);
  try {
    const response = await _GET(request, context);
    await logResponse("GET", response);
    return addCorsHeaders(request, response);
  } catch (error) {
    console.error(`[AUTH DEBUG] GET threw error:`, error);
    throw error;
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ all: string[] }> }) {
  logRequest("POST", request);
  try {
    const response = await _POST(request, context);
    await logResponse("POST", response);
    return addCorsHeaders(request, response);
  } catch (error) {
    console.error(`[AUTH DEBUG] POST threw error:`, error);
    throw error;
  }
}
