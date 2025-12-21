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
const adminSiteUrl = process.env.ADMIN_SITE_URL;

// Build trusted origins list with the app URL and common variants
const trustedOriginsList: string[] = [siteUrl];
if (convexSiteUrl) {
  trustedOriginsList.push(convexSiteUrl);
}
// Include admin site URL for cross-subdomain auth
if (adminSiteUrl) {
  trustedOriginsList.push(adminSiteUrl);
}
// Include localhost variants for development
if (process.env.NODE_ENV !== "production" || siteUrl.includes("localhost")) {
  trustedOriginsList.push("http://localhost:3000", "http://localhost:3001");
}

export const authComponent = createClient<DataModel>(components.betterAuth);

// Determine if we're in production (not localhost)
const isProduction = !siteUrl.includes("localhost");

export const createAuth = (
  ctx: GenericCtx<DataModel>,
  { optionsOnly } = { optionsOnly: false },
) => {
  return betterAuth({
    logger: {
      disabled: optionsOnly,
    },
    baseURL: siteUrl,
    trustedOrigins: trustedOriginsList,
    database: authComponent.adapter(ctx),
    // Session cookie configuration for cross-subdomain auth
    session: {
      cookieCache: {
        enabled: true,
      },
      // In production, set cookie domain to .flmlnk.com for subdomain sharing
      // This allows admin.flmlnk.com to read cookies set by flmlnk.com
      ...(isProduction && {
        cookie: {
          domain: ".flmlnk.com",
          secure: true,
          sameSite: "lax" as const,
        },
      }),
    },
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
