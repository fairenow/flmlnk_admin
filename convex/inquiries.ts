import { mutation, query, internalMutation, action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

/**
 * Submit a booking inquiry from the contact form.
 * Stores the inquiry and triggers an email notification to the page owner.
 */
export const submitBookingInquiry = mutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    name: v.string(),
    email: v.string(),
    projectType: v.string(),
    message: v.string(),
  },
  async handler(ctx, args) {
    // Validate the actor profile exists
    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile) {
      throw new Error("Profile not found. Please try again later.");
    }

    // Get the owner's user record to get their email
    const owner = await ctx.db.get(profile.userId);
    if (!owner) {
      throw new Error("Unable to send your message. Please try again later.");
    }

    // Store the inquiry
    const inquiryId = await ctx.db.insert("booking_inquiries", {
      actorProfileId: args.actorProfileId,
      name: args.name.trim(),
      email: args.email.trim().toLowerCase(),
      projectType: args.projectType,
      message: args.message.trim(),
      createdAt: Date.now(),
      emailSent: false,
    });

    // Check if this is the first inquiry for this profile
    const existingInquiries = await ctx.db
      .query("booking_inquiries")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.actorProfileId))
      .collect();

    const isFirstInquiry = existingInquiries.length === 1; // Just the one we inserted

    // Schedule the email notification to be sent
    await ctx.scheduler.runAfter(0, internal.email.sendInquiryNotification, {
      inquiryId,
      ownerEmail: owner.email,
      ownerName: owner.name ?? profile.displayName,
      actorName: profile.displayName,
      inquirerName: args.name.trim(),
      inquirerEmail: args.email.trim().toLowerCase(),
      projectType: args.projectType,
      message: args.message.trim(),
    });

    // Send first inquiry celebration if this is their first!
    if (isFirstInquiry) {
      await ctx.scheduler.runAfter(500, internal.email.sendFirstInquiryCelebration, {
        ownerEmail: owner.email,
        ownerName: owner.name ?? profile.displayName,
        inquirerName: args.name.trim(),
        projectType: args.projectType,
      });
    }

    // Log inquiry event
    await ctx.scheduler.runAfter(0, internal.analytics.logEventInternal, {
      actorProfileId: args.actorProfileId,
      eventType: "inquiry_submitted",
    });

    return { ok: true, inquiryId };
  },
});

/**
 * Get all booking inquiries for an actor profile (owner only).
 */
export const getByActorProfile = query({
  args: { actorProfileId: v.id("actor_profiles") },
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

    // Get all inquiries for this profile, sorted by newest first
    const inquiries = await ctx.db
      .query("booking_inquiries")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();

    return inquiries.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Mark an inquiry's email as sent (called after successful email delivery).
 * Internal mutation to be called from the email action.
 */
export const markEmailSent = internalMutation({
  args: { inquiryId: v.id("booking_inquiries") },
  async handler(ctx, { inquiryId }) {
    await ctx.db.patch(inquiryId, { emailSent: true });
  },
});

/**
 * Get email delivery status summary for an actor profile.
 * Useful for diagnosing email delivery issues.
 */
export const getEmailDeliveryStatus = query({
  args: { actorProfileId: v.id("actor_profiles") },
  async handler(ctx, { actorProfileId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // Verify the user owns this profile
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

    // Get all inquiries for this profile
    const inquiries = await ctx.db
      .query("booking_inquiries")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();

    const totalInquiries = inquiries.length;
    const emailsSent = inquiries.filter((i) => i.emailSent === true).length;
    const emailsPending = inquiries.filter((i) => i.emailSent !== true).length;

    // Get the most recent inquiries with their status
    const recentInquiries = inquiries
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
      .map((i) => ({
        id: i._id,
        name: i.name,
        email: i.email,
        projectType: i.projectType,
        createdAt: new Date(i.createdAt).toISOString(),
        emailSent: i.emailSent ?? false,
      }));

    return {
      ownerEmail: user.email,
      totalInquiries,
      emailsSent,
      emailsPending,
      recentInquiries,
      troubleshooting: emailsPending > 0
        ? [
            "Some emails were not sent. Possible causes:",
            "1. RESEND_API_KEY not set in Convex environment",
            "2. Domain 'flmlnk.com' not verified in Resend",
            "3. Resend API rate limits or errors",
            "Run 'npx convex env get RESEND_API_KEY' to check if API key is set",
          ]
        : ["All emails have been sent successfully!"],
    };
  },
});

/**
 * Retry sending email notification for a specific inquiry.
 * Requires the user to own the actor profile associated with the inquiry.
 */
export const retryEmailNotification = action({
  args: { inquiryId: v.id("booking_inquiries") },
  async handler(ctx, { inquiryId }): Promise<{ success: boolean; error?: string }> {
    // Get the inquiry details
    const inquiry = await ctx.runQuery(api.inquiries.getInquiryForRetry, {
      inquiryId,
    });

    if (!inquiry) {
      return { success: false, error: "Inquiry not found or access denied" };
    }

    if (inquiry.emailSent) {
      return { success: false, error: "Email was already sent for this inquiry" };
    }

    // Retry sending the email
    const result: { success: boolean; error?: string } = await ctx.runAction(internal.email.sendInquiryNotification, {
      inquiryId,
      ownerEmail: inquiry.ownerEmail,
      ownerName: inquiry.ownerName,
      actorName: inquiry.actorName,
      inquirerName: inquiry.name,
      inquirerEmail: inquiry.email,
      projectType: inquiry.projectType,
      message: inquiry.message,
    });

    return result;
  },
});

/**
 * Internal query to get inquiry details for retry (with owner verification).
 */
export const getInquiryForRetry = query({
  args: { inquiryId: v.id("booking_inquiries") },
  async handler(ctx, { inquiryId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // Get the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return null;
    }

    // Get the inquiry
    const inquiry = await ctx.db.get(inquiryId);
    if (!inquiry) {
      return null;
    }

    // Get the actor profile and verify ownership
    const profile = await ctx.db.get(inquiry.actorProfileId);
    if (!profile || profile.userId !== user._id) {
      return null;
    }

    return {
      ...inquiry,
      ownerEmail: user.email,
      ownerName: user.name ?? profile.displayName,
      actorName: profile.displayName,
    };
  },
});
