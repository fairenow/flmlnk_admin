import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { internal, components } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ============================================
// ADMIN-ONLY CAMPAIGN QUERIES
// These queries are only accessible from the admin dashboard
// and should not be deployed to the user-facing app
// ============================================

/**
 * Get all betterAuth users for incomplete onboarding audience
 */
export const getBetterAuthUsers = internalQuery({
  args: {},
  async handler(ctx) {
    // Query betterAuth users using the adapter
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      paginationOpts: {
        cursor: null,
        numItems: 10000, // Get all users
      },
    });

    return result.page || [];
  },
});

/**
 * Get recipients for incomplete_onboarding audience type
 * Called by the main campaigns.ts getCampaignRecipients
 */
export const getIncompleteOnboardingRecipients = internalQuery({
  args: {},
  async handler(ctx) {
    // Get all betterAuth users
    const authUsersResult = await ctx.runQuery(
      internal.adminCampaigns.getBetterAuthUsers,
      {}
    );

    // Get all application users (those who have completed at least part of onboarding)
    const appUsers = await ctx.db.query("users").collect();

    // Get all actor profiles to check for completed onboarding
    const actorProfiles = await ctx.db.query("actor_profiles").collect();
    const userIdsWithProfiles = new Set(
      actorProfiles.map((p) => p.userId.toString())
    );

    // Filter to auth users who either:
    // 1. Don't have a corresponding app user entry, OR
    // 2. Have an app user entry but no actor profile (started but didn't complete)
    const incompleteUsers: Array<{
      email: string;
      name?: string;
      authId: string;
      userId?: Id<"users">;
    }> = [];

    for (const authUser of authUsersResult) {
      // Skip if no email
      if (!authUser.email) continue;

      // Check if user exists in app users table
      const appUser = appUsers.find((u) => u.authId === authUser._id);

      if (!appUser) {
        // User signed up via betterAuth but never got to app user creation
        incompleteUsers.push({
          email: authUser.email,
          name: authUser.name || undefined,
          authId: authUser._id,
        });
      } else if (!userIdsWithProfiles.has(appUser._id.toString())) {
        // User exists in app but doesn't have an actor profile
        incompleteUsers.push({
          email: authUser.email,
          name: authUser.name || appUser.name || appUser.displayName || undefined,
          authId: authUser._id,
          userId: appUser._id,
        });
      }
    }

    return incompleteUsers;
  },
});
