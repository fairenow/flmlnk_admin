import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Ensures a Convex `users` record exists for the currently authenticated identity.
 * This is used immediately after Better Auth sign-ups to keep the table in sync.
 * Sends a welcome email to new users.
 */
export const ensureFromAuth = mutation({
  args: {},
  async handler(ctx) {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Please sign in to continue.");
    }

    const authId = identity.tokenIdentifier;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .unique();

    if (existing) {
      return existing._id;
    }

    // Insert the new user
    const userId = await ctx.db.insert("users", {
      authId,
      email: identity.email ?? "",
      name: identity.name ?? undefined,
      imageUrl: identity.pictureUrl ?? undefined,
      role: undefined,
    });

    // Send welcome email to new user
    const userEmail = identity.email;
    if (userEmail) {
      await ctx.scheduler.runAfter(0, internal.email.sendWelcomeEmail, {
        userEmail,
        userName: identity.name ?? undefined,
      });
    }

    // Log user signup event
    await ctx.scheduler.runAfter(0, internal.analytics.logEventInternal, {
      eventType: "user_signup",
    });

    return userId;
  },
});

export const getCurrent = query({
  args: {},
  async handler(ctx) {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    return user ?? null;
  },
});

/**
 * Check if a user is a superadmin by their email.
 * Used by admin portal when auth context is not available.
 */
export const checkSuperadminByEmail = query({
  args: { email: v.string() },
  async handler(ctx, args) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (!user) {
      return { found: false, superadmin: false };
    }

    return { found: true, superadmin: user.superadmin === true };
  },
});

export const updateCurrent = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Please sign in to continue.");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      throw new Error("Account not found. Please sign up first.");
    }

    const email = args.email.trim();
    if (!email) {
      throw new Error("Email is required");
    }

    const name = args.name?.trim() || undefined;
    const imageUrl = args.imageUrl?.trim() || undefined;
    const role = args.role?.trim() || undefined;

    await ctx.db.patch(user._id, {
      email,
      name,
      imageUrl,
      role,
    });

    return { ...user, email, name, imageUrl, role };
  },
});
