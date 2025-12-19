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

const adminSiteUrl = process.env.ADMIN_SITE_URL;
const siteUrl = process.env.SITE_URL!;
const convexSiteUrl = process.env.CONVEX_SITE_URL;

// Use ADMIN_SITE_URL as primary for this admin project, fallback to SITE_URL
const baseUrl = adminSiteUrl || siteUrl;

// DEBUG: Log environment variables on module load
console.log(`[CONVEX AUTH DEBUG] ADMIN_SITE_URL: ${adminSiteUrl}`);
console.log(`[CONVEX AUTH DEBUG] SITE_URL: ${siteUrl}`);
console.log(`[CONVEX AUTH DEBUG] CONVEX_SITE_URL: ${convexSiteUrl}`);
console.log(`[CONVEX AUTH DEBUG] baseUrl: ${baseUrl}`);
console.log(`[CONVEX AUTH DEBUG] NODE_ENV: ${process.env.NODE_ENV}`);

// Build trusted origins list with both the app URL and common variants
// This ensures auth works across different environments and proxy configurations
const trustedOriginsList: string[] = [baseUrl];
// Add both ADMIN_SITE_URL and SITE_URL to trusted origins if they differ
if (adminSiteUrl && adminSiteUrl !== baseUrl) {
  trustedOriginsList.push(adminSiteUrl);
}
if (siteUrl && siteUrl !== baseUrl) {
  trustedOriginsList.push(siteUrl);
}
if (convexSiteUrl) {
  trustedOriginsList.push(convexSiteUrl);
}
// Include localhost variants for development
if (process.env.NODE_ENV !== "production" || siteUrl.includes("localhost")) {
  trustedOriginsList.push("http://localhost:3000", "http://localhost:3001");
}

// DEBUG: Log the final trusted origins list
console.log(`[CONVEX AUTH DEBUG] trustedOriginsList: ${JSON.stringify(trustedOriginsList)}`);

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (
  ctx: GenericCtx<DataModel>,
  { optionsOnly } = { optionsOnly: false },
) => {
  return betterAuth({
    logger: {
      disabled: optionsOnly,
    },
    baseURL: baseUrl,
    trustedOrigins: trustedOriginsList,
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
