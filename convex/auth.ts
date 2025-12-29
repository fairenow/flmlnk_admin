import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { components, internal } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth } from "better-auth";
import { GenericMutationCtx } from "convex/server";

// Type for Better Auth email callback parameters
type EmailCallbackParams = {
  user: { email: string; name?: string | null };
  url: string;
  token: string;
};

const siteUrl = process.env.SITE_URL!;
const convexSiteUrl = process.env.CONVEX_SITE_URL;

// Production domains that need cross-origin access to auth endpoints
const PRODUCTION_ORIGINS = [
  "https://www.flmlnk.com",
  "https://flmlnk.com",
  "https://admin.flmlnk.com",
  "https://actors.flmlnk.com",
  "https://flmlnk-convex-complete.vercel.app",
];

// Build trusted origins list with the app URL and common variants
// This ensures auth works across different environments and proxy configurations
const trustedOriginsList: string[] = [siteUrl];
if (convexSiteUrl) {
  trustedOriginsList.push(convexSiteUrl);
}
// Add production domains
PRODUCTION_ORIGINS.forEach((origin) => {
  if (!trustedOriginsList.includes(origin)) {
    trustedOriginsList.push(origin);
  }
});
// Include localhost variants for development
if (process.env.NODE_ENV !== "production" || siteUrl.includes("localhost")) {
  trustedOriginsList.push("http://localhost:3000", "http://localhost:3001");
}

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (
  ctx: GenericCtx<DataModel>,
  { optionsOnly } = { optionsOnly: false },
) => {
  // Determine cookie domain for session sharing across subdomains
  const isProduction = siteUrl.includes("flmlnk.com");
  const cookieDomain = isProduction ? ".flmlnk.com" : undefined;

  return betterAuth({
    logger: {
      disabled: optionsOnly,
    },
    baseURL: siteUrl,
    trustedOrigins: trustedOriginsList,
    session: {
      cookieCache: {
        enabled: true,
      },
      cookie: {
        domain: cookieDomain, // Shared across *.flmlnk.com in production
        secure: isProduction,
        sameSite: "lax",
      },
    },
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url, token }: EmailCallbackParams) => {
        // Schedule the password reset email action
        // Cast ctx to mutation context since this is called during mutations
        const mutationCtx = ctx as unknown as GenericMutationCtx<DataModel>;
        await mutationCtx.scheduler.runAfter(0, internal.email.sendPasswordResetEmail, {
          email: user.email,
          url,
          token,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url, token }: EmailCallbackParams) => {
        // Schedule the email sending action
        // Cast ctx to mutation context since this is called during mutations
        const mutationCtx = ctx as unknown as GenericMutationCtx<DataModel>;
        await mutationCtx.scheduler.runAfter(0, internal.email.sendVerificationEmail, {
          email: user.email,
          url,
          token,
        });
      },
    },
    plugins: [
      convex(),
    ],
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    },
  });
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});
