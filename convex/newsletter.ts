import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";

/**
 * Generate a secure unsubscribe token.
 * Uses a combination of random values to create a unique token.
 */
function generateUnsubscribeToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Get all fan emails for a page owner's profile.
 */
export const getFanEmails = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    // Verify the user owns this profile
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return [];
    }

    const profile = await ctx.db.get(actorProfileId);
    if (!profile || profile.userId !== user._id) {
      return [];
    }

    const fanEmails = await ctx.db
      .query("fan_emails")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();

    return fanEmails.map((f) => ({
      _id: f._id,
      email: f.email,
      name: f.name,
      source: f.source,
      createdAt: f._creationTime,
    }));
  },
});

/**
 * Get fan email count for display.
 */
export const getFanEmailCount = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return 0;
    }

    // Verify the user owns this profile
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return 0;
    }

    const profile = await ctx.db.get(actorProfileId);
    if (!profile || profile.userId !== user._id) {
      return 0;
    }

    const fanEmails = await ctx.db
      .query("fan_emails")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();

    return fanEmails.length;
  },
});

// Type definitions to break circular inference
type NewsletterResult =
  | { success: false; error: string; sent?: number }
  | { success: true; sent: number; failed: number; total: number };

type ProfileInfo = { displayName: string; slug: string } | null;

type FanInfo = {
  _id: import("./_generated/dataModel").Id<"fan_emails">;
  email: string;
  name: string | undefined;
  unsubscribeToken: string | undefined;
};

/**
 * Send a newsletter to all fans of a page.
 */
export const sendNewsletter = action({
  args: {
    actorProfileId: v.id("actor_profiles"),
    subject: v.string(),
    content: v.string(),
    ctaText: v.optional(v.string()),
    ctaUrl: v.optional(v.string()),
  },
  async handler(ctx, args): Promise<NewsletterResult> {
    // Verify ownership and get profile info
    const profileInfo: ProfileInfo = await ctx.runQuery(api.newsletter.getProfileForNewsletter, {
      actorProfileId: args.actorProfileId,
    });

    if (!profileInfo) {
      return { success: false, error: "Profile not found or access denied" };
    }

    // Get all fan emails (already filtered for unsubscribed)
    const fans: FanInfo[] = await ctx.runQuery(api.newsletter.getAllFansInternal, {
      actorProfileId: args.actorProfileId,
    });

    if (fans.length === 0) {
      return { success: false, error: "No fans to send to", sent: 0 };
    }

    let sent = 0;
    let failed = 0;

    // Send to each fan
    for (const fan of fans) {
      try {
        // Ensure fan has an unsubscribe token (for legacy entries)
        let unsubscribeToken = fan.unsubscribeToken;
        if (!unsubscribeToken) {
          const token = await ctx.runMutation(internal.newsletter.ensureUnsubscribeToken, {
            fanEmailId: fan._id,
          });
          unsubscribeToken = token ?? undefined;
        }

        await ctx.runAction(internal.email.sendFanNewsletter, {
          senderName: profileInfo.displayName,
          senderPageSlug: profileInfo.slug,
          recipientEmail: fan.email,
          recipientName: fan.name,
          subject: args.subject,
          content: args.content,
          ctaText: args.ctaText,
          ctaUrl: args.ctaUrl,
          unsubscribeToken: unsubscribeToken || undefined,
        });
        sent++;
      } catch (error) {
        console.error(`Failed to send to ${fan.email}:`, error);
        failed++;
      }
    }

    return {
      success: true,
      sent,
      failed,
      total: fans.length,
    };
  },
});

/**
 * Internal query to get profile info for newsletter sending.
 */
export const getProfileForNewsletter = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return null;
    }

    const profile = await ctx.db.get(actorProfileId);
    if (!profile || profile.userId !== user._id) {
      return null;
    }

    return {
      displayName: profile.displayName,
      slug: profile.slug,
    };
  },
});

/**
 * Internal query to get all fans for a profile.
 * Filters out unsubscribed fans and includes info needed for unsubscribe links.
 */
export const getAllFansInternal = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const fanEmails = await ctx.db
      .query("fan_emails")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();

    // Filter out unsubscribed fans
    return fanEmails
      .filter((f) => !f.unsubscribed)
      .map((f) => ({
        _id: f._id,
        email: f.email,
        name: f.name,
        unsubscribeToken: f.unsubscribeToken,
      }));
  },
});

// Type definitions for sendTestNewsletter
type TestNewsletterResult =
  | { success: false; error: string }
  | { success: true; message: string };

type ProfileWithOwnerInfo = {
  displayName: string;
  slug: string;
  ownerEmail: string;
  ownerName: string;
} | null;

/**
 * Send a test newsletter to the page owner.
 */
export const sendTestNewsletter = action({
  args: {
    actorProfileId: v.id("actor_profiles"),
    subject: v.string(),
    content: v.string(),
    ctaText: v.optional(v.string()),
    ctaUrl: v.optional(v.string()),
  },
  async handler(ctx, args): Promise<TestNewsletterResult> {
    // Verify ownership and get profile info
    const profileInfo: ProfileWithOwnerInfo = await ctx.runQuery(api.newsletter.getProfileWithOwner, {
      actorProfileId: args.actorProfileId,
    });

    if (!profileInfo) {
      return { success: false, error: "Profile not found or access denied" };
    }

    try {
      await ctx.runAction(internal.email.sendFanNewsletter, {
        senderName: profileInfo.displayName,
        senderPageSlug: profileInfo.slug,
        recipientEmail: profileInfo.ownerEmail,
        recipientName: profileInfo.ownerName,
        subject: `[TEST] ${args.subject}`,
        content: args.content,
        ctaText: args.ctaText,
        ctaUrl: args.ctaUrl,
      });

      return { success: true, message: `Test email sent to ${profileInfo.ownerEmail}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Internal query to get profile with owner info.
 */
export const getProfileWithOwner = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return null;
    }

    const profile = await ctx.db.get(actorProfileId);
    if (!profile || profile.userId !== user._id) {
      return null;
    }

    return {
      displayName: profile.displayName,
      slug: profile.slug,
      ownerEmail: user.email,
      ownerName: user.name || profile.displayName,
    };
  },
});

/**
 * Unsubscribe a fan email using their unique token.
 * This is a public mutation that can be called from an unsubscribe page.
 */
export const unsubscribeByToken = mutation({
  args: {
    token: v.string(),
  },
  async handler(ctx, { token }) {
    if (!token || token.length < 10) {
      return { success: false, error: "Invalid unsubscribe token" };
    }

    const fanEmail = await ctx.db
      .query("fan_emails")
      .withIndex("by_unsubscribeToken", (q) => q.eq("unsubscribeToken", token))
      .unique();

    if (!fanEmail) {
      return { success: false, error: "Unsubscribe link is invalid or expired" };
    }

    if (fanEmail.unsubscribed) {
      return { success: true, message: "You are already unsubscribed" };
    }

    await ctx.db.patch(fanEmail._id, { unsubscribed: true });

    return { success: true, message: "You have been successfully unsubscribed" };
  },
});

/**
 * Get unsubscribe status by token (for confirmation pages).
 */
export const getUnsubscribeStatus = query({
  args: {
    token: v.string(),
  },
  async handler(ctx, { token }) {
    if (!token || token.length < 10) {
      return { valid: false, unsubscribed: false };
    }

    const fanEmail = await ctx.db
      .query("fan_emails")
      .withIndex("by_unsubscribeToken", (q) => q.eq("unsubscribeToken", token))
      .unique();

    if (!fanEmail) {
      return { valid: false, unsubscribed: false };
    }

    return {
      valid: true,
      unsubscribed: fanEmail.unsubscribed || false,
      email: fanEmail.email.replace(/(.{2})(.*)(@.*)/, "$1***$3"), // Mask email
    };
  },
});

/**
 * Internal mutation to ensure a fan email has an unsubscribe token.
 * Called before sending newsletters to generate tokens for legacy entries.
 */
export const ensureUnsubscribeToken = internalMutation({
  args: {
    fanEmailId: v.id("fan_emails"),
  },
  async handler(ctx, { fanEmailId }) {
    const fanEmail = await ctx.db.get(fanEmailId);
    if (!fanEmail) {
      return null;
    }

    if (fanEmail.unsubscribeToken) {
      return fanEmail.unsubscribeToken;
    }

    const token = generateUnsubscribeToken();
    await ctx.db.patch(fanEmailId, { unsubscribeToken: token });
    return token;
  },
});

/**
 * Resubscribe a previously unsubscribed fan email.
 */
export const resubscribeByToken = mutation({
  args: {
    token: v.string(),
  },
  async handler(ctx, { token }) {
    if (!token || token.length < 10) {
      return { success: false, error: "Invalid token" };
    }

    const fanEmail = await ctx.db
      .query("fan_emails")
      .withIndex("by_unsubscribeToken", (q) => q.eq("unsubscribeToken", token))
      .unique();

    if (!fanEmail) {
      return { success: false, error: "Invalid token" };
    }

    if (!fanEmail.unsubscribed) {
      return { success: true, message: "You are already subscribed" };
    }

    await ctx.db.patch(fanEmail._id, { unsubscribed: false });

    return { success: true, message: "You have been successfully resubscribed" };
  },
});
