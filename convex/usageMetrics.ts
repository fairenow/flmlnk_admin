import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

function isoDayFromTimestamp(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Internal mutation invoked by a cron job to snapshot simple usage metrics.
 */
export const dailySnapshot = internalMutation({
  args: {
    // optional override for testing
    now: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const now = args.now ?? Date.now();
    const day = isoDayFromTimestamp(now);

    // Count users
    const users = await ctx.db.query("users").collect();
    const actorProfiles = await ctx.db.query("actor_profiles").collect();
    const projects = await ctx.db.query("projects").collect();

    const usersCount = users.length;
    const actorProfileCount = actorProfiles.length;
    const projectsCount = projects.length;

    // Upsert metric for this day
    const existing = await ctx.db
      .query("usage_daily_metrics")
      .withIndex("by_day", (q) => q.eq("day", day))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        users: usersCount,
        actorProfiles: actorProfileCount,
        projects: projectsCount,
      });
    } else {
      await ctx.db.insert("usage_daily_metrics", {
        day,
        users: usersCount,
        actorProfiles: actorProfileCount,
        projects: projectsCount,
        createdAt: now,
      });
    }

    return {
      day,
      users: usersCount,
      actorProfiles: actorProfileCount,
      projects: projectsCount,
    };
  },
});
