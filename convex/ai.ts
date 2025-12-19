import { action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const composeActorPage = action({
  args: {
    displayName: v.string(),
    imdbUrl: v.optional(v.string()),
    socials: v.optional(v.any()),
    streamingUrl: v.optional(v.string()),
    trailerUrl: v.optional(v.string()),
    clips: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    let imdbBio = "";

    if (args.imdbUrl) {
      const scrape = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: `Extract a succinct actor biography from this page. Return 3-4 sentences max.\n${args.imdbUrl}`,
          },
        ],
      });

      imdbBio = scrape.choices[0]?.message?.content ?? "";
    }

    const bio = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: `Create an actor's professional biography given:
Name: ${args.displayName}
IMDb Bio Extract: ${imdbBio}`,
        },
      ],
    });

    const headline = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Create a short 1-sentence headline for an actor's page:
Name: ${args.displayName}`,
        },
      ],
    });

    return {
      bio: bio.choices[0]?.message?.content ?? "",
      headline: headline.choices[0]?.message?.content ?? "",
    };
  },
});

// Internal mutation used after AI generation
export const seedAIProfile = internalMutation({
  args: {
    profileId: v.id("actor_profiles"),
    bio: v.string(),
    headline: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.profileId, {
      bio: args.bio,
      headline: args.headline,
    });
  },
});
