import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/**
 * Get all comments for an actor profile (public).
 * Returns top-level comments with nested replies.
 */
export const getByActorProfile = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", actorProfileId)
      )
      .order("desc")
      .collect();

    // Separate top-level and replies
    const topLevel = comments.filter((c) => !c.parentId);
    const replies = comments.filter((c) => c.parentId);

    // Build nested structure
    const commentsWithReplies = topLevel.map((comment) => ({
      ...comment,
      replies: replies
        .filter((r) => r.parentId === comment._id)
        .sort((a, b) => a.createdAt - b.createdAt),
    }));

    return commentsWithReplies;
  },
});

/**
 * Get comment count for an actor profile (for tab badge).
 */
export const getCount = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", actorProfileId)
      )
      .collect();

    return comments.length;
  },
});

/**
 * Submit a new comment (requires email verification).
 */
export const submit = mutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    name: v.string(),
    email: v.string(),
    message: v.string(),
    parentId: v.optional(v.id("comments")),
  },
  async handler(ctx, args) {
    // Validate that the actor profile exists
    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile) {
      throw new Error("Actor profile not found");
    }

    // If replying, validate parent comment exists
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.actorProfileId !== args.actorProfileId) {
        throw new Error("Parent comment not found");
      }
    }

    // Basic content validation
    const trimmedMessage = args.message.trim();
    if (trimmedMessage.length < 2) {
      throw new Error("Comment must be at least 2 characters");
    }
    if (trimmedMessage.length > 2000) {
      throw new Error("Comment must be less than 2000 characters");
    }

    const identity = await ctx.auth.getUserIdentity();
    let isOwner = false;

    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
        .unique();

      if (user && profile.userId === user._id) {
        isOwner = true;
      }
    }

    const commentId = await ctx.db.insert("comments", {
      actorProfileId: args.actorProfileId,
      name: args.name.trim(),
      email: args.email.trim().toLowerCase(),
      message: trimmedMessage,
      createdAt: Date.now(),
      parentId: args.parentId,
      likes: 0,
      isOwner,
    });

    // Log comment event
    await ctx.scheduler.runAfter(0, internal.analytics.logEventInternal, {
      actorProfileId: args.actorProfileId,
      eventType: "comment_submitted",
    });

    // Send email notifications
    // Get the profile owner's info for notifications
    const user = await ctx.db.get(profile.userId);
    if (user && user.email) {
      // Don't notify if the commenter is the page owner
      if (!isOwner) {
        // Notify page owner about the new comment
        await ctx.scheduler.runAfter(0, internal.email.sendCommentNotification, {
          ownerEmail: user.email,
          ownerName: user.name || profile.displayName,
          pageName: profile.displayName,
          pageSlug: profile.slug,
          commenterName: args.name.trim(),
          commenterEmail: args.email.trim().toLowerCase(),
          commentMessage: trimmedMessage,
          isReply: !!args.parentId,
          parentCommenterName: undefined,
        });
      }

      // If this is a reply, notify the original commenter
      if (args.parentId) {
        const parentComment = await ctx.db.get(args.parentId);
        if (parentComment && parentComment.email !== args.email.trim().toLowerCase()) {
          await ctx.scheduler.runAfter(0, internal.email.sendReplyNotification, {
            recipientEmail: parentComment.email,
            recipientName: parentComment.name,
            pageName: profile.displayName,
            pageSlug: profile.slug,
            replierName: args.name.trim(),
            replyMessage: trimmedMessage,
            originalComment: parentComment.message,
          });
        }
      }
    }

    return { commentId };
  },
});

/**
 * Like a comment.
 */
export const like = mutation({
  args: {
    commentId: v.id("comments"),
  },
  async handler(ctx, { commentId }) {
    const comment = await ctx.db.get(commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }

    await ctx.db.patch(commentId, {
      likes: (comment.likes ?? 0) + 1,
    });

    return { ok: true };
  },
});

/**
 * Unlike a comment (decrement likes, minimum 0).
 */
export const unlike = mutation({
  args: {
    commentId: v.id("comments"),
  },
  async handler(ctx, { commentId }) {
    const comment = await ctx.db.get(commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }

    await ctx.db.patch(commentId, {
      likes: Math.max(0, (comment.likes ?? 0) - 1),
    });

    return { ok: true };
  },
});
