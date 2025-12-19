import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// ============================================
// AUDIENCE TAG QUERIES
// ============================================

/**
 * Get all tags for a profile (creator + site-wide)
 */
export const getAudienceTags = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    // Get creator-specific tags
    const creatorTags = await ctx.db
      .query("audience_tags")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();

    // Get site-wide tags (actorProfileId is null)
    const siteWideTags = await ctx.db
      .query("audience_tags")
      .withIndex("by_tagType", (q) => q.eq("tagType", "site_wide"))
      .collect();

    return [...creatorTags, ...siteWideTags].filter((t) => t.isActive);
  },
});

/**
 * Get subscriber counts for audience selection UI
 */
export const getAudienceStats = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // Get all subscribers for this profile
    const allSubscribers = await ctx.db
      .query("fan_emails")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();

    const activeSubscribers = allSubscribers.filter((s) => !s.unsubscribed && !s.isHardBounce);
    const unsubscribed = allSubscribers.filter((s) => s.unsubscribed);
    const hardBounces = allSubscribers.filter((s) => s.isHardBounce);

    // Data quality metrics
    const withConsent = activeSubscribers.filter((s) => s.consentedAt);
    const withName = activeSubscribers.filter((s) => s.name);
    const recentlyEngaged = activeSubscribers.filter(
      (s) => s.lastEmailOpenedAt && s.lastEmailOpenedAt > Date.now() - 90 * 24 * 60 * 60 * 1000
    );

    return {
      total: allSubscribers.length,
      active: activeSubscribers.length,
      unsubscribed: unsubscribed.length,
      hardBounces: hardBounces.length,
      dataQuality: {
        withConsent: withConsent.length,
        withConsentPercent: activeSubscribers.length
          ? Math.round((withConsent.length / activeSubscribers.length) * 100)
          : 0,
        withName: withName.length,
        withNamePercent: activeSubscribers.length
          ? Math.round((withName.length / activeSubscribers.length) * 100)
          : 0,
        recentlyEngaged: recentlyEngaged.length,
        recentlyEngagedPercent: activeSubscribers.length
          ? Math.round((recentlyEngaged.length / activeSubscribers.length) * 100)
          : 0,
      },
    };
  },
});

/**
 * Get site-wide audience count (all fan_emails across platform)
 */
export const getSiteWideAudienceCount = query({
  args: {},
  async handler(ctx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // Get all fan emails across the platform
    const allFanEmails = await ctx.db.query("fan_emails").collect();

    const active = allFanEmails.filter((f) => !f.unsubscribed && !f.isHardBounce);
    const unsubscribed = allFanEmails.filter((f) => f.unsubscribed);

    return {
      total: allFanEmails.length,
      active: active.length,
      unsubscribed: unsubscribed.length,
    };
  },
});

/**
 * Get detailed fan email list for display in campaign composer
 */
export const getFanEmailsForAudience = query({
  args: {
    actorProfileId: v.optional(v.id("actor_profiles")),
    audienceType: v.string(), // "creator_subscribers" or "site_wide"
    limit: v.optional(v.number()),
  },
  async handler(ctx, { actorProfileId, audienceType, limit = 10 }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { fans: [], total: 0, active: 0 };
    }

    let fanEmails;

    if (audienceType === "creator_subscribers" && actorProfileId) {
      // Get fans for this specific creator
      fanEmails = await ctx.db
        .query("fan_emails")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
        .collect();
    } else {
      // Site-wide: all fan emails
      fanEmails = await ctx.db.query("fan_emails").collect();
    }

    const activeFans = fanEmails.filter((f) => !f.unsubscribed && !f.isHardBounce);

    // Get preview list (most recent fans first)
    const sortedFans = activeFans
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, limit);

    // Map to display format
    const fans = sortedFans.map((f) => ({
      id: f._id,
      email: f.email,
      name: f.name,
      source: f.source,
      createdAt: f.createdAt,
      hasConsent: !!f.consentedAt,
    }));

    return {
      fans,
      total: fanEmails.length,
      active: activeFans.length,
    };
  },
});

/**
 * Get subscribers with filtering options
 */
export const getSubscribers = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
    includeUnsubscribed: v.optional(v.boolean()),
    tagId: v.optional(v.id("audience_tags")),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  async handler(ctx, { actorProfileId, includeUnsubscribed, tagId, limit = 50, offset = 0 }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { subscribers: [], total: 0 };
    }

    // Verify ownership
    const profile = await ctx.db.get(actorProfileId);
    if (!profile) {
      return { subscribers: [], total: 0 };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    if (!user || profile.userId !== user._id) {
      return { subscribers: [], total: 0 };
    }

    // Get subscribers
    let subscribers = await ctx.db
      .query("fan_emails")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();

    // Filter
    if (!includeUnsubscribed) {
      subscribers = subscribers.filter((s) => !s.unsubscribed);
    }

    // If tag filter, get subscribers with that tag
    if (tagId) {
      const subscriberTags = await ctx.db
        .query("subscriber_tags")
        .withIndex("by_tag", (q) => q.eq("tagId", tagId))
        .collect();

      const taggedEmailIds = new Set(subscriberTags.map((st) => st.fanEmailId));
      subscribers = subscribers.filter((s) => taggedEmailIds.has(s._id));
    }

    const total = subscribers.length;

    // Paginate
    const paginatedSubscribers = subscribers.slice(offset, offset + limit);

    // Get tags for each subscriber
    const subscribersWithTags = await Promise.all(
      paginatedSubscribers.map(async (subscriber) => {
        const tags = await ctx.db
          .query("subscriber_tags")
          .withIndex("by_fanEmail", (q) => q.eq("fanEmailId", subscriber._id))
          .collect();

        const tagDetails = await Promise.all(
          tags.map(async (st) => {
            const tag = await ctx.db.get(st.tagId);
            return tag ? { id: tag._id, name: tag.name, color: tag.color } : null;
          })
        );

        return {
          ...subscriber,
          tags: tagDetails.filter(Boolean),
        };
      })
    );

    return {
      subscribers: subscribersWithTags,
      total,
    };
  },
});

// ============================================
// AUDIENCE TAG MUTATIONS
// ============================================

/**
 * Create a new audience tag
 */
export const createAudienceTag = mutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    tagType: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Verify ownership
    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile) {
      throw new Error("Profile not found");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    if (!user || profile.userId !== user._id) {
      throw new Error("Not authorized");
    }

    // Generate slug
    const slug = args.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Check for duplicate slug
    const existing = await ctx.db
      .query("audience_tags")
      .withIndex("by_actorProfile_slug", (q) =>
        q.eq("actorProfileId", args.actorProfileId).eq("slug", slug)
      )
      .first();

    if (existing) {
      throw new Error("A tag with this name already exists");
    }

    const tagId = await ctx.db.insert("audience_tags", {
      actorProfileId: args.actorProfileId,
      name: args.name,
      slug,
      description: args.description,
      color: args.color || "#f53c56",
      tagType: args.tagType || "creator",
      isActive: true,
      subscriberCount: 0,
      createdAt: Date.now(),
    });

    return { tagId };
  },
});

/**
 * Update an audience tag
 */
export const updateAudienceTag = mutation({
  args: {
    tagId: v.id("audience_tags"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const tag = await ctx.db.get(args.tagId);
    if (!tag) {
      throw new Error("Tag not found");
    }

    // Verify ownership if it's a creator tag
    if (tag.actorProfileId) {
      const profile = await ctx.db.get(tag.actorProfileId);
      if (!profile) {
        throw new Error("Profile not found");
      }

      const user = await ctx.db
        .query("users")
        .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
        .first();

      if (!user || profile.userId !== user._id) {
        throw new Error("Not authorized");
      }
    }

    const updates: Partial<Doc<"audience_tags">> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      updates.name = args.name;
      updates.slug = args.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }
    if (args.description !== undefined) updates.description = args.description;
    if (args.color !== undefined) updates.color = args.color;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.tagId, updates);

    return { success: true };
  },
});

/**
 * Delete an audience tag
 */
export const deleteAudienceTag = mutation({
  args: {
    tagId: v.id("audience_tags"),
  },
  async handler(ctx, { tagId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const tag = await ctx.db.get(tagId);
    if (!tag) {
      throw new Error("Tag not found");
    }

    // Verify ownership if it's a creator tag
    if (tag.actorProfileId) {
      const profile = await ctx.db.get(tag.actorProfileId);
      if (!profile) {
        throw new Error("Profile not found");
      }

      const user = await ctx.db
        .query("users")
        .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
        .first();

      if (!user || profile.userId !== user._id) {
        throw new Error("Not authorized");
      }
    }

    // Delete all subscriber-tag relationships
    const subscriberTags = await ctx.db
      .query("subscriber_tags")
      .withIndex("by_tag", (q) => q.eq("tagId", tagId))
      .collect();

    for (const st of subscriberTags) {
      await ctx.db.delete(st._id);
    }

    // Delete the tag
    await ctx.db.delete(tagId);

    return { success: true };
  },
});

// ============================================
// SUBSCRIBER TAG MANAGEMENT
// ============================================

/**
 * Add a tag to a subscriber
 */
export const addTagToSubscriber = mutation({
  args: {
    fanEmailId: v.id("fan_emails"),
    tagId: v.id("audience_tags"),
    source: v.optional(v.string()),
  },
  async handler(ctx, { fanEmailId, tagId, source }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Verify ownership
    const fanEmail = await ctx.db.get(fanEmailId);
    if (!fanEmail) {
      throw new Error("Subscriber not found");
    }

    const profile = await ctx.db.get(fanEmail.actorProfileId);
    if (!profile) {
      throw new Error("Profile not found");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    if (!user || profile.userId !== user._id) {
      throw new Error("Not authorized");
    }

    // Check if already tagged
    const existing = await ctx.db
      .query("subscriber_tags")
      .withIndex("by_fanEmail_tag", (q) => q.eq("fanEmailId", fanEmailId).eq("tagId", tagId))
      .first();

    if (existing) {
      return { success: true, message: "Already tagged" };
    }

    // Add the tag
    await ctx.db.insert("subscriber_tags", {
      fanEmailId,
      tagId,
      assignedAt: Date.now(),
      assignedBy: "manual",
      source,
    });

    // Update tag subscriber count
    const tag = await ctx.db.get(tagId);
    if (tag) {
      await ctx.db.patch(tagId, {
        subscriberCount: (tag.subscriberCount || 0) + 1,
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/**
 * Remove a tag from a subscriber
 */
export const removeTagFromSubscriber = mutation({
  args: {
    fanEmailId: v.id("fan_emails"),
    tagId: v.id("audience_tags"),
  },
  async handler(ctx, { fanEmailId, tagId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Verify ownership
    const fanEmail = await ctx.db.get(fanEmailId);
    if (!fanEmail) {
      throw new Error("Subscriber not found");
    }

    const profile = await ctx.db.get(fanEmail.actorProfileId);
    if (!profile) {
      throw new Error("Profile not found");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    if (!user || profile.userId !== user._id) {
      throw new Error("Not authorized");
    }

    // Find and delete the tag relationship
    const subscriberTag = await ctx.db
      .query("subscriber_tags")
      .withIndex("by_fanEmail_tag", (q) => q.eq("fanEmailId", fanEmailId).eq("tagId", tagId))
      .first();

    if (subscriberTag) {
      await ctx.db.delete(subscriberTag._id);

      // Update tag subscriber count
      const tag = await ctx.db.get(tagId);
      if (tag && tag.subscriberCount) {
        await ctx.db.patch(tagId, {
          subscriberCount: Math.max(0, tag.subscriberCount - 1),
          updatedAt: Date.now(),
        });
      }
    }

    return { success: true };
  },
});

/**
 * Bulk add tags to subscribers
 */
export const bulkAddTagToSubscribers = mutation({
  args: {
    fanEmailIds: v.array(v.id("fan_emails")),
    tagId: v.id("audience_tags"),
  },
  async handler(ctx, { fanEmailIds, tagId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    let added = 0;
    const now = Date.now();

    for (const fanEmailId of fanEmailIds) {
      // Check if already tagged
      const existing = await ctx.db
        .query("subscriber_tags")
        .withIndex("by_fanEmail_tag", (q) => q.eq("fanEmailId", fanEmailId).eq("tagId", tagId))
        .first();

      if (!existing) {
        await ctx.db.insert("subscriber_tags", {
          fanEmailId,
          tagId,
          assignedAt: now,
          assignedBy: "manual",
          source: "bulk_add",
        });
        added++;
      }
    }

    // Update tag subscriber count
    const tag = await ctx.db.get(tagId);
    if (tag) {
      await ctx.db.patch(tagId, {
        subscriberCount: (tag.subscriberCount || 0) + added,
        updatedAt: now,
      });
    }

    return { success: true, added };
  },
});

// ============================================
// SENDER IDENTITY MANAGEMENT
// ============================================

/**
 * Get sender identities for a profile
 */
export const getSenderIdentities = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  async handler(ctx, { actorProfileId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    return ctx.db
      .query("sender_identities")
      .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", actorProfileId))
      .collect();
  },
});

/**
 * Create or update sender identity
 */
export const upsertSenderIdentity = mutation({
  args: {
    actorProfileId: v.id("actor_profiles"),
    senderIdentityId: v.optional(v.id("sender_identities")),
    fromName: v.string(),
    replyToEmail: v.optional(v.string()),
    physicalAddress: v.optional(v.string()),
    customFooterHtml: v.optional(v.string()),
    customFooterText: v.optional(v.string()),
    brandColor: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Verify ownership
    const profile = await ctx.db.get(args.actorProfileId);
    if (!profile) {
      throw new Error("Profile not found");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    if (!user || profile.userId !== user._id) {
      throw new Error("Not authorized");
    }

    const now = Date.now();

    // If setting as default, unset other defaults
    if (args.isDefault) {
      const existingIdentities = await ctx.db
        .query("sender_identities")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", args.actorProfileId))
        .collect();

      for (const existing of existingIdentities) {
        if (existing.isDefault && existing._id !== args.senderIdentityId) {
          await ctx.db.patch(existing._id, { isDefault: false, updatedAt: now });
        }
      }
    }

    if (args.senderIdentityId) {
      // Update existing
      await ctx.db.patch(args.senderIdentityId, {
        fromName: args.fromName,
        replyToEmail: args.replyToEmail,
        physicalAddress: args.physicalAddress,
        customFooterHtml: args.customFooterHtml,
        customFooterText: args.customFooterText,
        brandColor: args.brandColor,
        isDefault: args.isDefault ?? false,
        updatedAt: now,
      });

      return { senderIdentityId: args.senderIdentityId };
    } else {
      // Create new
      const senderIdentityId = await ctx.db.insert("sender_identities", {
        actorProfileId: args.actorProfileId,
        fromName: args.fromName,
        replyToEmail: args.replyToEmail,
        physicalAddress: args.physicalAddress,
        customFooterHtml: args.customFooterHtml,
        customFooterText: args.customFooterText,
        brandColor: args.brandColor,
        isDefault: args.isDefault ?? true, // First one is default
        isVerified: false,
        createdAt: now,
      });

      return { senderIdentityId };
    }
  },
});

/**
 * Delete a sender identity
 */
export const deleteSenderIdentity = mutation({
  args: {
    senderIdentityId: v.id("sender_identities"),
  },
  async handler(ctx, { senderIdentityId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const senderIdentity = await ctx.db.get(senderIdentityId);
    if (!senderIdentity) {
      throw new Error("Sender identity not found");
    }

    // Verify ownership
    const profile = await ctx.db.get(senderIdentity.actorProfileId);
    if (!profile) {
      throw new Error("Profile not found");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    if (!user || profile.userId !== user._id) {
      throw new Error("Not authorized");
    }

    await ctx.db.delete(senderIdentityId);

    return { success: true };
  },
});

// ============================================
// SUBSCRIBER CONSENT MANAGEMENT
// ============================================

/**
 * Record subscriber consent
 */
export const recordConsent = internalMutation({
  args: {
    fanEmailId: v.id("fan_emails"),
    consentSource: v.string(),
    ipAddress: v.optional(v.string()),
  },
  async handler(ctx, { fanEmailId, consentSource, ipAddress }) {
    const now = Date.now();

    await ctx.db.patch(fanEmailId, {
      consentedAt: now,
      consentSource,
      consentIpAddress: ipAddress,
      updatedAt: now,
    });
  },
});

/**
 * Record double opt-in confirmation
 */
export const confirmDoubleOptIn = mutation({
  args: {
    token: v.string(),
  },
  async handler(ctx, { token }) {
    const fanEmail = await ctx.db
      .query("fan_emails")
      .withIndex("by_unsubscribeToken", (q) => q.eq("unsubscribeToken", token))
      .first();

    if (!fanEmail) {
      throw new Error("Invalid token");
    }

    const now = Date.now();

    await ctx.db.patch(fanEmail._id, {
      doubleOptInConfirmedAt: now,
      isVerified: true,
      updatedAt: now,
    });

    return { success: true };
  },
});

/**
 * Handle unsubscribe request
 */
export const unsubscribe = mutation({
  args: {
    token: v.string(),
    reason: v.optional(v.string()),
  },
  async handler(ctx, { token, reason }) {
    const fanEmail = await ctx.db
      .query("fan_emails")
      .withIndex("by_unsubscribeToken", (q) => q.eq("unsubscribeToken", token))
      .first();

    if (!fanEmail) {
      throw new Error("Invalid token");
    }

    const now = Date.now();

    await ctx.db.patch(fanEmail._id, {
      unsubscribed: true,
      unsubscribedAt: now,
      unsubscribeReason: reason,
      updatedAt: now,
    });

    return { success: true };
  },
});

/**
 * Handle unsubscribe by token (internal - for webhook)
 */
export const unsubscribeByToken = internalMutation({
  args: {
    token: v.string(),
  },
  async handler(ctx, { token }) {
    const fanEmail = await ctx.db
      .query("fan_emails")
      .withIndex("by_unsubscribeToken", (q) => q.eq("unsubscribeToken", token))
      .first();

    if (!fanEmail) {
      throw new Error("Invalid token");
    }

    const now = Date.now();

    await ctx.db.patch(fanEmail._id, {
      unsubscribed: true,
      unsubscribedAt: now,
      updatedAt: now,
    });

    return { success: true };
  },
});

/**
 * Resubscribe a previously unsubscribed email
 */
export const resubscribe = mutation({
  args: {
    fanEmailId: v.id("fan_emails"),
  },
  async handler(ctx, { fanEmailId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const fanEmail = await ctx.db.get(fanEmailId);
    if (!fanEmail) {
      throw new Error("Subscriber not found");
    }

    // Verify ownership
    const profile = await ctx.db.get(fanEmail.actorProfileId);
    if (!profile) {
      throw new Error("Profile not found");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    if (!user || profile.userId !== user._id) {
      throw new Error("Not authorized");
    }

    const now = Date.now();

    await ctx.db.patch(fanEmailId, {
      unsubscribed: false,
      unsubscribedAt: undefined,
      unsubscribeReason: undefined,
      consentedAt: now,
      consentSource: "resubscribe",
      updatedAt: now,
    });

    return { success: true };
  },
});
