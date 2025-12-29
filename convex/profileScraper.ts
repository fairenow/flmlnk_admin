import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Profile scraper using Firecrawl API.
 * Scrapes IMDb and social profiles to extract user information for backfilling.
 */

interface FilmographyEntry {
  title: string;
  year?: string;
  role?: string;
  posterUrl?: string;
  posterUrlHiRes?: string; // High-resolution version of poster
  imdbTitleId?: string;
  imdbUrl?: string;
  trailerUrl?: string; // Trailer URL from title page
  trailerThumbnail?: string; // Thumbnail for the trailer
}

interface GalleryPhoto {
  url: string;
  urlHiRes: string; // High-resolution version
  caption?: string;
  imdbMediaId?: string; // e.g., rm1234567890
}

/**
 * Deep film details extracted from individual title pages.
 * Used for the top 3 featured films during onboarding.
 */
interface DeepFilmDetails {
  imdbTitleId: string;
  title: string;
  year?: string;
  // Rich content
  tagline?: string; // One-line hook
  plotSummary?: string; // Full plot description
  logline?: string; // Short logline
  // Media
  posterUrl?: string;
  posterUrlHiRes?: string;
  backdropUrl?: string; // Wide banner image
  trailerUrl?: string;
  trailerThumbnail?: string;
  stills?: string[]; // Production stills
  // Metadata
  genres?: string[];
  runtime?: number; // Minutes
  contentRating?: string; // PG-13, R, etc.
  releaseDate?: string;
  // Credits
  director?: string;
  writers?: string[];
  topCast?: string[]; // Top 3-5 cast members
  // The user's specific role
  userRole?: string;
  userCharacter?: string;
  // Ratings & reception
  imdbRating?: number;
  imdbVotes?: number;
  // Production
  productionCompanies?: string[];
  budget?: string;
  boxOffice?: string;
}

/**
 * Enhanced profile data with rich bio information.
 * Extracted from JSON-LD Person schema and page content.
 */
interface DeepProfileData {
  // Basic info
  name?: string;
  imdbId?: string;
  // Rich bio
  bio?: string; // Full biography text
  bioShort?: string; // First paragraph / summary
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string; // If applicable
  // Professional info
  primaryProfession?: string[]; // Actor, Director, Producer, etc.
  knownFor?: string[];
  // Images
  headshotUrl?: string;
  headshotUrlHiRes?: string;
  galleryPhotos?: GalleryPhoto[];
  // Awards & recognition
  awardsHighlight?: string; // e.g., "Oscar Winner", "Emmy Nominee"
  awardsSummary?: { wins: number; nominations: number };
  // Filmography (basic list, top 3 get deep details)
  filmography?: FilmographyEntry[];
  // Top 3 films with deep details
  featuredFilms?: DeepFilmDetails[];
}

interface ScrapedProfileData {
  // From IMDb
  imdb?: {
    name?: string;
    bio?: string;
    knownFor?: string[];
    filmography?: FilmographyEntry[];
    profileImage?: string;
    profileImageHiRes?: string; // High-resolution version of profile image
    galleryPhotos?: GalleryPhoto[]; // Photo gallery from profile
    imdbId?: string; // e.g., nm1234567
  };
  // From social profiles
  socials?: {
    instagram?: {
      bio?: string;
      followerCount?: number;
      posts?: number;
    };
    twitter?: {
      bio?: string;
      followerCount?: number;
    };
    tiktok?: {
      bio?: string;
      followerCount?: number;
    };
    youtube?: {
      channelName?: string;
      subscriberCount?: number;
      description?: string;
    };
  };
}

/**
 * Internal action to scrape profile URLs using Firecrawl.
 * This runs in the background after onboarding completion.
 */
export const scrapeProfileUrls = internalAction({
  args: {
    slug: v.string(),
    imdbUrl: v.optional(v.string()),
    socials: v.optional(v.object({
      instagram: v.optional(v.string()),
      twitter: v.optional(v.string()),
      tiktok: v.optional(v.string()),
      youtube: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log("[ProfileScraper] FIRECRAWL_API_KEY not set, skipping scraping");
      return { success: false, reason: "API key not configured" };
    }

    const scrapedData: ScrapedProfileData = {};

    // Scrape IMDb profile
    if (args.imdbUrl) {
      try {
        console.log(`[ProfileScraper] Scraping IMDb: ${args.imdbUrl}`);
        const imdbData = await scrapeImdbProfile(apiKey, args.imdbUrl);
        if (imdbData) {
          scrapedData.imdb = imdbData;
        }
      } catch (error) {
        console.error("[ProfileScraper] IMDb scraping failed:", error);
      }
    }

    // Scrape social profiles
    if (args.socials) {
      scrapedData.socials = {};

      // Instagram
      if (args.socials.instagram) {
        try {
          const url = args.socials.instagram.startsWith("http")
            ? args.socials.instagram
            : `https://instagram.com/${args.socials.instagram}`;
          console.log(`[ProfileScraper] Scraping Instagram: ${url}`);
          const data = await scrapeSocialProfile(apiKey, url, "instagram");
          if (data) scrapedData.socials.instagram = data;
        } catch (error) {
          console.error("[ProfileScraper] Instagram scraping failed:", error);
        }
      }

      // Twitter
      if (args.socials.twitter) {
        try {
          const url = args.socials.twitter.startsWith("http")
            ? args.socials.twitter
            : `https://twitter.com/${args.socials.twitter}`;
          console.log(`[ProfileScraper] Scraping Twitter: ${url}`);
          const data = await scrapeSocialProfile(apiKey, url, "twitter");
          if (data) scrapedData.socials.twitter = data;
        } catch (error) {
          console.error("[ProfileScraper] Twitter scraping failed:", error);
        }
      }

      // TikTok
      if (args.socials.tiktok) {
        try {
          const url = args.socials.tiktok.startsWith("http")
            ? args.socials.tiktok
            : `https://tiktok.com/@${args.socials.tiktok}`;
          console.log(`[ProfileScraper] Scraping TikTok: ${url}`);
          const data = await scrapeSocialProfile(apiKey, url, "tiktok");
          if (data) scrapedData.socials.tiktok = data;
        } catch (error) {
          console.error("[ProfileScraper] TikTok scraping failed:", error);
        }
      }

      // YouTube
      if (args.socials.youtube) {
        try {
          const url = args.socials.youtube.startsWith("http")
            ? args.socials.youtube
            : `https://youtube.com/@${args.socials.youtube}`;
          console.log(`[ProfileScraper] Scraping YouTube: ${url}`);
          const data = await scrapeSocialProfile(apiKey, url, "youtube");
          if (data) scrapedData.socials.youtube = data;
        } catch (error) {
          console.error("[ProfileScraper] YouTube scraping failed:", error);
        }
      }
    }

    // If we got any useful data, apply it to the profile
    if (scrapedData.imdb || scrapedData.socials) {
      try {
        await ctx.runMutation(internal.profileScraper.applyScrapedData, {
          slug: args.slug,
          scrapedData: JSON.stringify(scrapedData),
        });
        console.log(`[ProfileScraper] Applied scraped data for ${args.slug}`);
      } catch (error) {
        console.error("[ProfileScraper] Failed to apply scraped data:", error);
      }
    }

    return { success: true, scrapedData };
  },
});

/**
 * Internal mutation to apply scraped data to a profile.
 */
export const applyScrapedData = internalMutation({
  args: {
    slug: v.string(),
    scrapedData: v.string(), // JSON string of ScrapedProfileData
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!profile) {
      throw new Error(`Profile not found: ${args.slug}`);
    }

    const data: ScrapedProfileData = JSON.parse(args.scrapedData);
    const updates: Record<string, any> = {};
    let projectsCreated = 0;

    // Apply IMDb data
    if (data.imdb) {
      // Update bio if we scraped one and current is generic
      if (data.imdb.bio && (!profile.bio || profile.bio.includes("is a filmmaker creating"))) {
        updates.bio = data.imdb.bio;
      }

      // Update avatar if we got one from IMDb and user doesn't have one
      // Prefer high-resolution version if available
      if (!profile.avatarUrl) {
        const avatarUrl = data.imdb.profileImageHiRes || data.imdb.profileImage;
        if (avatarUrl) {
          updates.avatarUrl = avatarUrl;
        }
      }

      // Update IMDb ID if we extracted it
      if (data.imdb.imdbId && !profile.imdbId) {
        updates.imdbId = data.imdb.imdbId;
      }

      // Store gallery photos as media assets (if we have storage capability)
      // Note: This stores URLs directly - for full storage, would need to download and store
      if (data.imdb.galleryPhotos && data.imdb.galleryPhotos.length > 0) {
        console.log(`[ProfileScraper] Processing ${data.imdb.galleryPhotos.length} gallery photos`);
        // Gallery photos are logged for now - full implementation would download and store
        // This could be enhanced to use Convex storage in the future
      }

      // Create projects from filmography
      if (data.imdb.filmography && data.imdb.filmography.length > 0) {
        console.log(`[ProfileScraper] Processing ${data.imdb.filmography.length} filmography entries`);

        // Get existing projects to avoid duplicates
        const existingProjects = await ctx.db
          .query("projects")
          .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
          .collect();

        // Create a set of existing IMDb title IDs for quick lookup
        const existingTitleIds = new Set(
          existingProjects
            .filter((p) => p.imdbTitleId)
            .map((p) => p.imdbTitleId)
        );

        // Also track titles without IMDb IDs
        const existingTitles = new Set(
          existingProjects.map((p) => p.title.toLowerCase())
        );

        // Calculate next sort order
        const maxSortOrder = Math.max(0, ...existingProjects.map((p) => p.sortOrder ?? 0));
        let sortOrder = maxSortOrder + 1;

        // Create projects from filmography (limit to first 10)
        const entriesToCreate = data.imdb.filmography.slice(0, 10);

        for (const entry of entriesToCreate) {
          // Skip if we already have this project (by IMDb ID or title)
          if (entry.imdbTitleId && existingTitleIds.has(entry.imdbTitleId)) {
            continue;
          }
          if (existingTitles.has(entry.title.toLowerCase())) {
            continue;
          }

          // Parse release year
          const releaseYear = entry.year ? parseInt(entry.year, 10) : undefined;

          // Prefer high-resolution poster URL if available
          const posterUrl = entry.posterUrlHiRes || entry.posterUrl || "";

          // Create the project
          await ctx.db.insert("projects", {
            actorProfileId: profile._id,
            title: entry.title,
            roleName: entry.role || undefined,
            roleType: entry.role ? "Actor" : undefined,
            posterUrl,
            releaseYear: releaseYear && !isNaN(releaseYear) ? releaseYear : undefined,
            imdbTitleId: entry.imdbTitleId || "",
            // Include trailer URL if we extracted it from structured data
            trailerUrl: entry.trailerUrl || undefined,
            status: "released",
            sortOrder,
            isFeatured: false,
          });

          projectsCreated++;
          sortOrder++;
          existingTitleIds.add(entry.imdbTitleId || "");
          existingTitles.add(entry.title.toLowerCase());
        }

        console.log(`[ProfileScraper] Created ${projectsCreated} projects from filmography`);
      }
    }

    // Apply any updates
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(profile._id, updates);
      console.log(`[ProfileScraper] Updated profile ${args.slug} with:`, Object.keys(updates));
    }

    return { updated: Object.keys(updates), projectsCreated };
  },
});

/**
 * Convert IMDb image URL to high-resolution version.
 * IMDb uses patterns like _V1_UX100_ or _V1_SY300_ that can be modified.
 *
 * @param url - Original IMDb image URL
 * @param width - Desired width (default 1200 for high-res)
 * @returns High-resolution image URL
 */
function convertToHighResolution(url: string | undefined, width: number = 1200): string | undefined {
  if (!url) return undefined;

  // Pattern: _V1_UX###_ or _V1_SX###_ or _V1_UY###_ or _V1_SY###_
  // Also handles: _V1_QL75_UX###_ and similar variations
  const resPattern = /_V1_(?:QL\d+_)?(?:U[XY]|S[XY])?\d+_?/gi;

  if (resPattern.test(url)) {
    // Replace with high-resolution version
    return url.replace(resPattern, `_V1_UX${width}_`);
  }

  // If URL ends with .jpg or .png but has _V1 somewhere, try adding resolution
  if (url.includes('_V1') && !url.includes('_V1_')) {
    return url.replace('_V1', `_V1_UX${width}_`);
  }

  return url;
}

/**
 * Scrape gallery photos from an IMDb name page.
 * Gallery photos are typically found in the Photos section.
 */
function extractGalleryPhotos(html: string, imdbId?: string): GalleryPhoto[] {
  const photos: GalleryPhoto[] = [];

  // Look for photo gallery section - IMDb often embeds photo URLs in data attributes or links
  // Pattern 1: Look for media viewer links with image references
  const mediaPatterns = [
    // Pattern: href="/name/nm.../mediaviewer/rm..." with image
    /href="[^"]*\/mediaviewer\/(rm\d+)[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/gi,
    // Pattern: data-src or src with IMDb image URLs
    /<img[^>]*(?:data-src|src)="(https:\/\/m\.media-amazon\.com\/images[^"]+)"[^>]*>/gi,
    // Pattern: Photos section with thumbnails
    /class="[^"]*photo[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/gi,
  ];

  // Extract unique image URLs
  const seenUrls = new Set<string>();

  for (const pattern of mediaPatterns) {
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      // Determine which group has the URL
      const mediaId = match[1]?.startsWith('rm') ? match[1] : undefined;
      const url = match[2] || match[1];

      // Skip if not a valid IMDb image URL or already seen
      if (!url || !url.includes('media-amazon.com/images') || seenUrls.has(url)) {
        continue;
      }

      // Skip tiny thumbnails (less than 50px typically)
      if (/_V1_(?:QL\d+_)?(?:U[XY]|S[XY])([1-4]\d)_/i.test(url)) {
        continue;
      }

      seenUrls.add(url);

      photos.push({
        url,
        urlHiRes: convertToHighResolution(url, 1200) || url,
        imdbMediaId: mediaId,
      });

      // Limit to 20 gallery photos
      if (photos.length >= 20) break;
    }

    if (photos.length >= 20) break;
  }

  // Also try to extract from JSON-LD or structured data
  const jsonLdMatch = html.match(/"image":\s*\[([^\]]+)\]/);
  if (jsonLdMatch && photos.length < 20) {
    const imageUrls = jsonLdMatch[1].match(/"(https:\/\/[^"]+)"/g);
    if (imageUrls) {
      for (const urlMatch of imageUrls) {
        const url = urlMatch.replace(/"/g, '');
        if (!seenUrls.has(url) && url.includes('media-amazon.com')) {
          seenUrls.add(url);
          photos.push({
            url,
            urlHiRes: convertToHighResolution(url, 1200) || url,
          });
          if (photos.length >= 20) break;
        }
      }
    }
  }

  console.log(`[ProfileScraper] Extracted ${photos.length} gallery photos`);
  return photos;
}

/**
 * Scrape an IMDb profile page.
 */
async function scrapeImdbProfile(apiKey: string, url: string) {
  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown", "html"],
      waitFor: 3000,
      timeout: 30000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Firecrawl API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  const markdown = result.data?.markdown || "";
  const html = result.data?.html || "";

  // Extract data from IMDb page
  const data: ScrapedProfileData["imdb"] = {};

  // Extract IMDb ID from URL (nm1234567)
  const imdbIdMatch = url.match(/\/name\/(nm\d+)/);
  if (imdbIdMatch) {
    data.imdbId = imdbIdMatch[1];
  }

  // Try to extract name from meta or title
  const nameMatch = markdown.match(/^#\s*(.+)/m) || html.match(/<title>(.+?) - IMDb/);
  if (nameMatch) {
    data.name = nameMatch[1].trim();
  }

  // Try to extract bio/mini bio - multiple patterns
  const bioPatterns = [
    /Mini Bio[:\s]*\n(.+?)(?:\n\n|\n#)/s,
    /Overview[:\s]*\n(.+?)(?:\n\n|\n#)/s,
    /Biography[:\s]*\n(.+?)(?:\n\n|\n#)/s,
  ];
  for (const pattern of bioPatterns) {
    const bioMatch = markdown.match(pattern);
    if (bioMatch) {
      data.bio = bioMatch[1].trim().slice(0, 500);
      break;
    }
  }

  // Try to extract "Known For" titles with more details
  const knownForMatch = markdown.match(/Known For(.+?)(?:##|$)/s);
  if (knownForMatch) {
    const titles = knownForMatch[1].match(/\*\*(.+?)\*\*/g);
    if (titles) {
      data.knownFor = titles.map((t: string) => t.replace(/\*\*/g, "")).slice(0, 5);
    }
  }

  // Extract profile image - multiple patterns
  const imgPatterns = [
    /poster"?\s*content="([^"]+)"/,
    /og:image"?\s*content="([^"]+)"/,
    /image_src"?\s*href="([^"]+)"/,
    /"primaryImage":\s*\{\s*"url":\s*"([^"]+)"/,
  ];
  for (const pattern of imgPatterns) {
    const imgMatch = html.match(pattern);
    if (imgMatch) {
      data.profileImage = imgMatch[1];
      // Also generate high-resolution version
      data.profileImageHiRes = convertToHighResolution(imgMatch[1], 1200);
      break;
    }
  }

  // Extract gallery photos from the profile page
  data.galleryPhotos = extractGalleryPhotos(html, data.imdbId);

  // Extract filmography from markdown - look for film/TV entries
  data.filmography = [];

  // Pattern for filmography entries: look for titles with years and roles
  // Common formats: "Title (2023) ... Role/Character"
  const filmographyPatterns = [
    // Format: **Title** (Year) - Role
    /\*\*([^*]+)\*\*\s*\((\d{4})\)[^\n]*?(?:as|\.{3})\s*([^\n\[\(]+)/gi,
    // Format: [Title](url) (Year) ... Role
    /\[([^\]]+)\]\([^)]*\/title\/(tt\d+)[^)]*\)\s*\(?(\d{4})?\)?[^\n]*?(?:as|\.{3})\s*([^\n\[\(]+)/gi,
    // Format: Title (Year) character
    /([A-Z][^(\n]+)\s*\((\d{4})\)\s+([A-Z][^(\n]*?)(?:\n|$)/g,
  ];

  // Also extract from structured data in HTML (JSON-LD)
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([^<]+)<\/script>/gi);
  if (jsonLdMatch) {
    for (const jsonScript of jsonLdMatch) {
      try {
        const jsonContent = jsonScript.replace(/<script[^>]*>|<\/script>/gi, "");
        const jsonData = JSON.parse(jsonContent);

        // Look for filmography in @graph or directly
        const items = jsonData["@graph"] || [jsonData];
        for (const item of items) {
          if (item["@type"] === "Movie" || item["@type"] === "TVSeries") {
            const posterUrl = item.image?.url || item.image;
            const entry: FilmographyEntry = {
              title: item.name || "",
              year: item.datePublished?.slice(0, 4) || item.releaseDate?.slice(0, 4),
              posterUrl,
              posterUrlHiRes: convertToHighResolution(posterUrl, 800),
              imdbUrl: item.url,
              // Extract trailer if available in structured data
              trailerUrl: item.trailer?.url || item.trailer?.contentUrl,
            };
            // Extract title ID from URL
            if (entry.imdbUrl) {
              const titleIdMatch = entry.imdbUrl.match(/\/title\/(tt\d+)/);
              if (titleIdMatch) {
                entry.imdbTitleId = titleIdMatch[1];
              }
            }
            if (entry.title) {
              data.filmography.push(entry);
            }
          }
        }
      } catch {
        // JSON parse error, continue
      }
    }
  }

  // Also try to extract from "Known For" section with images
  // IMDb often shows poster images next to Known For titles
  const knownForSection = html.match(/Known For[\s\S]*?<\/section>/i);
  if (knownForSection) {
    // Look for title links with poster images
    const titleMatches = knownForSection[0].matchAll(
      /href="\/title\/(tt\d+)[^"]*"[^>]*>[^<]*<img[^>]*src="([^"]+)"[^>]*>[\s\S]*?<[^>]*>([^<]+)<[\s\S]*?\((\d{4})\)/gi
    );
    for (const match of titleMatches) {
      const existing = data.filmography.find(f => f.imdbTitleId === match[1]);
      const posterUrl = match[2];
      if (!existing) {
        data.filmography.push({
          title: match[3].trim(),
          year: match[4],
          imdbTitleId: match[1],
          posterUrl,
          posterUrlHiRes: convertToHighResolution(posterUrl, 800),
          imdbUrl: `https://www.imdb.com/title/${match[1]}/`,
        });
      } else if (!existing.posterUrl) {
        existing.posterUrl = posterUrl;
        existing.posterUrlHiRes = convertToHighResolution(posterUrl, 800);
      }
    }
  }

  // Alternative: Parse filmography from markdown sections
  const filmographySections = markdown.match(/(?:Filmography|Credits|Actor|Actress|Director|Producer)[\s\S]*?(?=##|$)/gi);
  if (filmographySections) {
    for (const section of filmographySections) {
      // Match entries like: "Title (2023) ... Character Name"
      const entries = section.matchAll(/\[([^\]]+)\]\(([^)]*\/title\/(tt\d+)[^)]*)\)[^\n]*\((\d{4})\)[^\n]*(?:\.{3}|as)\s*([^\n\[\]]+)?/gi);
      for (const entry of entries) {
        const existing = data.filmography.find(f => f.imdbTitleId === entry[3]);
        if (!existing && data.filmography.length < 20) {
          data.filmography.push({
            title: entry[1].trim(),
            year: entry[4],
            role: entry[5]?.trim(),
            imdbTitleId: entry[3],
            imdbUrl: `https://www.imdb.com/title/${entry[3]}/`,
          });
        } else if (existing && !existing.role && entry[5]) {
          existing.role = entry[5].trim();
        }
      }
    }
  }

  // Limit to 20 most relevant entries
  if (data.filmography.length > 20) {
    data.filmography = data.filmography.slice(0, 20);
  }

  console.log(`[ProfileScraper] Extracted ${data.filmography.length} filmography entries from IMDb`);

  return Object.keys(data).length > 0 ? data : null;
}

/**
 * Scrape a social media profile page.
 */
async function scrapeSocialProfile(apiKey: string, url: string, platform: string) {
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        waitFor: 5000,
        timeout: 30000,
      }),
    });

    if (!response.ok) {
      console.log(`[ProfileScraper] ${platform} scrape returned ${response.status}`);
      return null;
    }

    const result = await response.json();
    const markdown = result.data?.markdown || "";

    // Extract basic info based on platform
    const data: Record<string, any> = {};

    // Try to extract bio from markdown
    const bioPatterns = [
      /Bio[:\s]*\n(.+?)(?:\n\n|\n#)/s,
      /About[:\s]*\n(.+?)(?:\n\n|\n#)/s,
      /Description[:\s]*\n(.+?)(?:\n\n|\n#)/s,
    ];

    for (const pattern of bioPatterns) {
      const match = markdown.match(pattern);
      if (match) {
        data.bio = match[1].trim().slice(0, 300);
        break;
      }
    }

    // Try to extract follower count
    const followerMatch = markdown.match(/(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)\s*(?:followers?|subscribers?)/i);
    if (followerMatch) {
      const countStr = followerMatch[1].replace(/,/g, "");
      let count = parseFloat(countStr);
      if (countStr.includes("K")) count *= 1000;
      if (countStr.includes("M")) count *= 1000000;
      if (countStr.includes("B")) count *= 1000000000;
      data.followerCount = Math.round(count);
    }

    return Object.keys(data).length > 0 ? data : null;
  } catch (error) {
    console.error(`[ProfileScraper] Error scraping ${platform}:`, error);
    return null;
  }
}

/**
 * Scrape an IMDb title page to extract trailer URLs and additional images.
 */
async function scrapeImdbTitlePage(apiKey: string, titleId: string): Promise<{
  trailerUrl?: string;
  trailerThumbnail?: string;
  additionalImages?: string[];
} | null> {
  const url = `https://www.imdb.com/title/${titleId}/`;

  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["html"],
        waitFor: 3000,
        timeout: 30000,
      }),
    });

    if (!response.ok) {
      console.log(`[ProfileScraper] Title page scrape returned ${response.status}`);
      return null;
    }

    const result = await response.json();
    const html = result.data?.html || "";

    const data: {
      trailerUrl?: string;
      trailerThumbnail?: string;
      additionalImages?: string[];
    } = {};

    // Extract trailer URL from various patterns
    // Pattern 1: JSON-LD structured data with trailer
    const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([^<]+)<\/script>/gi);
    if (jsonLdMatch) {
      for (const jsonScript of jsonLdMatch) {
        try {
          const jsonContent = jsonScript.replace(/<script[^>]*>|<\/script>/gi, "");
          const jsonData = JSON.parse(jsonContent);

          // Look for trailer in VideoObject
          if (jsonData.trailer?.url || jsonData.trailer?.contentUrl) {
            data.trailerUrl = jsonData.trailer.url || jsonData.trailer.contentUrl;
            data.trailerThumbnail = jsonData.trailer.thumbnailUrl;
          }

          // Also check for embedded video
          if (jsonData["@type"] === "VideoObject" || jsonData.video) {
            const video = jsonData["@type"] === "VideoObject" ? jsonData : jsonData.video;
            if (!data.trailerUrl && video.contentUrl) {
              data.trailerUrl = video.contentUrl;
              data.trailerThumbnail = video.thumbnailUrl;
            }
          }
        } catch {
          // JSON parse error, continue
        }
      }
    }

    // Pattern 2: Look for video player embed URLs
    const videoPatterns = [
      // IMDb video player
      /data-video="([^"]+)"/gi,
      // Embedded video URLs
      /"playbackURLs":\s*\[\s*\{\s*"url":\s*"([^"]+)"/gi,
      // Video thumbnail reference
      /videoPoster":\s*"([^"]+)"/gi,
    ];

    for (const pattern of videoPatterns) {
      const match = html.match(pattern);
      if (match && !data.trailerUrl) {
        const extracted = match[1];
        if (extracted && (extracted.includes('imdb') || extracted.includes('video'))) {
          data.trailerUrl = extracted;
        }
      }
    }

    // Pattern 3: Look for YouTube trailer embeds
    const youtubeMatch = html.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/i);
    if (youtubeMatch && !data.trailerUrl) {
      data.trailerUrl = `https://www.youtube.com/watch?v=${youtubeMatch[1]}`;
    }

    // Extract additional images (stills, posters)
    const additionalImages: string[] = [];
    const imageMatches = html.matchAll(/<img[^>]*src="(https:\/\/m\.media-amazon\.com\/images\/[^"]+)"[^>]*>/gi);
    const seenUrls = new Set<string>();

    for (const match of imageMatches) {
      const imgUrl = match[1];
      // Skip tiny thumbnails and duplicates
      if (seenUrls.has(imgUrl) || /_V1_(?:QL\d+_)?(?:U[XY]|S[XY])([1-4]\d)_/i.test(imgUrl)) {
        continue;
      }
      seenUrls.add(imgUrl);

      // Convert to high-resolution
      const hiResUrl = convertToHighResolution(imgUrl, 1200);
      if (hiResUrl) {
        additionalImages.push(hiResUrl);
      }

      if (additionalImages.length >= 10) break;
    }

    if (additionalImages.length > 0) {
      data.additionalImages = additionalImages;
    }

    console.log(`[ProfileScraper] Extracted trailer from ${titleId}: ${data.trailerUrl ? 'found' : 'not found'}, ${additionalImages.length} images`);
    return Object.keys(data).length > 0 ? data : null;
  } catch (error) {
    console.error(`[ProfileScraper] Error scraping title page ${titleId}:`, error);
    return null;
  }
}

/**
 * Internal action to scrape a single IMDb title page for trailer and images.
 * Can be called on-demand for specific projects.
 */
export const scrapeTitlePage = internalAction({
  args: {
    slug: v.string(),
    imdbTitleId: v.string(),
    projectId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log("[ProfileScraper] FIRECRAWL_API_KEY not set, skipping title scrape");
      return { success: false, reason: "API key not configured" };
    }

    const data = await scrapeImdbTitlePage(apiKey, args.imdbTitleId);
    if (!data) {
      return { success: false, reason: "No data extracted" };
    }

    // Update the project with trailer URL if we found one
    if (data.trailerUrl && args.projectId) {
      await ctx.runMutation(internal.profileScraper.updateProjectTrailer, {
        projectId: args.projectId,
        trailerUrl: data.trailerUrl,
      });
    }

    return { success: true, data };
  },
});

/**
 * Internal mutation to update a project's trailer URL.
 */
export const updateProjectTrailer = internalMutation({
  args: {
    projectId: v.string(),
    trailerUrl: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the project by ID string and update
    const projects = await ctx.db
      .query("projects")
      .collect();

    const project = projects.find(p => p._id.toString() === args.projectId);
    if (project && !project.trailerUrl) {
      await ctx.db.patch(project._id, {
        trailerUrl: args.trailerUrl,
      });
      console.log(`[ProfileScraper] Updated project ${project.title} with trailer URL`);
    }
  },
});

// =============================================================================
// DEEP SCRAPING FOR ONBOARDING
// =============================================================================

/**
 * Deep scrape an IMDb profile page using JSON-LD structured data.
 * Extracts rich bio information, birth details, awards, and profession info.
 */
async function scrapeImdbProfileDeep(apiKey: string, url: string): Promise<DeepProfileData | null> {
  console.log(`[DeepScraper] Starting deep profile scrape: ${url}`);

  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html"],
        waitFor: 8000, // Wait longer for IMDb's JS-heavy pages
        timeout: 60000,
        actions: [
          { type: "wait", milliseconds: 3000 }, // Additional wait for dynamic content
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[DeepScraper] Profile scrape failed: ${response.status} - ${error}`);
      return null;
    }

    const result = await response.json();
    const markdown = result.data?.markdown || "";
    const html = result.data?.html || "";

    console.log(`[DeepScraper] Received: markdown=${markdown.length} chars, html=${html.length} chars`);

    // Debug: Log first 500 chars to see what we're getting
    if (markdown.length > 0) {
      console.log(`[DeepScraper] Markdown preview: ${markdown.slice(0, 500)}...`);
    }

    const data: DeepProfileData = {};

    // Extract IMDb ID from URL
    const imdbIdMatch = url.match(/\/name\/(nm\d+)/);
    if (imdbIdMatch) {
      data.imdbId = imdbIdMatch[1];
    }

    // ==========================================================================
    // METHOD 1: EXTRACT FROM JSON-LD (Most reliable if present)
    // ==========================================================================
    // Use a more robust regex that handles newlines and special chars
    const jsonLdRegex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jsonLdMatch;
    let foundJsonLd = false;

    while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
      try {
        const jsonContent = jsonLdMatch[1].trim();
        console.log(`[DeepScraper] Found JSON-LD block (${jsonContent.length} chars)`);

        const jsonData = JSON.parse(jsonContent);
        console.log(`[DeepScraper] Parsed JSON-LD type: ${jsonData["@type"]}`);

        // Look for Person schema
        if (jsonData["@type"] === "Person") {
          foundJsonLd = true;
          data.name = jsonData.name;
          data.bio = jsonData.description;
          data.birthDate = jsonData.birthDate;
          data.birthPlace = jsonData.birthPlace?.name || jsonData.birthPlace;
          data.deathDate = jsonData.deathDate;
          console.log(`[DeepScraper] JSON-LD Person: ${data.name}, bio=${data.bio?.length || 0} chars`);

          if (jsonData.image) {
            const imgUrl = typeof jsonData.image === 'string' ? jsonData.image : jsonData.image.url;
            data.headshotUrl = imgUrl;
            data.headshotUrlHiRes = convertToHighResolution(imgUrl, 1200);
          }

          if (jsonData.jobTitle) {
            data.primaryProfession = Array.isArray(jsonData.jobTitle)
              ? jsonData.jobTitle
              : [jsonData.jobTitle];
          }
        }

        // Look for ItemList (filmography)
        if (jsonData["@type"] === "ItemList" && jsonData.itemListElement) {
          console.log(`[DeepScraper] Found ItemList with ${jsonData.itemListElement.length} items`);
          data.filmography = [];
          for (const item of jsonData.itemListElement.slice(0, 20)) {
            const work = item.item || item;
            if (work.name) {
              const entry: FilmographyEntry = {
                title: work.name,
                year: work.datePublished?.slice(0, 4),
                imdbUrl: work.url,
                posterUrl: work.image?.url || work.image,
              };
              if (entry.posterUrl) {
                entry.posterUrlHiRes = convertToHighResolution(entry.posterUrl, 800);
              }
              if (work.url) {
                const titleMatch = work.url.match(/\/title\/(tt\d+)/);
                if (titleMatch) entry.imdbTitleId = titleMatch[1];
              }
              data.filmography.push(entry);
            }
          }
        }
      } catch (e) {
        console.log(`[DeepScraper] JSON-LD parse error: ${e}`);
      }
    }

    // ==========================================================================
    // METHOD 2: EXTRACT FROM HTML PATTERNS (Fallback)
    // ==========================================================================
    if (!data.name) {
      // Try title tag
      const titleMatch = html.match(/<title>([^<]+?)\s*-\s*IMDb/i) ||
                         markdown.match(/^#\s*(.+)/m);
      if (titleMatch) {
        data.name = titleMatch[1].trim();
        console.log(`[DeepScraper] Name from title: ${data.name}`);
      }
    }

    // Extract headshot from meta tags or img tags
    if (!data.headshotUrl) {
      const imgPatterns = [
        /property="og:image"\s+content="([^"]+)"/i,
        /content="([^"]+)"\s+property="og:image"/i,
        /name="poster"\s+content="([^"]+)"/i,
        /"primaryImage"[^}]*"url"\s*:\s*"([^"]+)"/i,
        /class="[^"]*primary[^"]*photo[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i,
      ];

      for (const pattern of imgPatterns) {
        const match = html.match(pattern);
        if (match && match[1].includes('media-amazon.com')) {
          data.headshotUrl = match[1];
          data.headshotUrlHiRes = convertToHighResolution(match[1], 1200);
          console.log(`[DeepScraper] Headshot from HTML pattern`);
          break;
        }
      }
    }

    // ==========================================================================
    // METHOD 3: EXTRACT FROM MARKDOWN (Most reliable for text content)
    // ==========================================================================
    if (!data.bio && markdown.length > 100) {
      // IMDb bio patterns in markdown
      const bioPatterns = [
        /(?:Overview|Biography|Mini Bio)[:\s]*\n+([^\n#*]+(?:\n[^\n#*]+)*)/i,
        /(?:known for|best known)[^.]*\.\s*([^#*]+)/i,
        /^([A-Z][^#\n]{100,500})/m, // First substantial paragraph
      ];

      for (const pattern of bioPatterns) {
        const match = markdown.match(pattern);
        if (match && match[1].length > 50) {
          const bioText = match[1].replace(/\s+/g, ' ').trim().slice(0, 1500);
          data.bio = bioText;
          data.bioShort = bioText.split(/[.!?]\s/)[0] + '.';
          console.log(`[DeepScraper] Bio from markdown: ${bioText.length} chars`);
          break;
        }
      }
    }

    // ==========================================================================
    // METHOD 4: EXTRACT FILMOGRAPHY FROM MARKDOWN
    // ==========================================================================
    if (!data.filmography || data.filmography.length === 0) {
      data.filmography = [];

      // Pattern: [Title](url) or **Title** (Year)
      const filmPatterns = [
        /\[([^\]]+)\]\(\/title\/(tt\d+)[^)]*\)(?:[^\n]*\((\d{4})\))?/gi,
        /\*\*([^*]+)\*\*[^\n]*\((\d{4})\)/gi,
      ];

      for (const pattern of filmPatterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(markdown)) !== null && data.filmography.length < 20) {
          const matchTitle = match[1];
          const matchId = match[2];
          const matchYear = match[3];
          const existing = data.filmography.find(f =>
            f.title.toLowerCase() === matchTitle.toLowerCase() ||
            f.imdbTitleId === matchId
          );

          if (!existing) {
            data.filmography.push({
              title: matchTitle.trim(),
              imdbTitleId: matchId?.startsWith('tt') ? matchId : undefined,
              year: matchYear || matchId,
              imdbUrl: matchId?.startsWith('tt') ? `https://www.imdb.com/title/${matchId}/` : undefined,
            });
          }
        }
      }
      console.log(`[DeepScraper] Filmography from markdown: ${data.filmography.length} entries`);
    }

    // ==========================================================================
    // METHOD 5: EXTRACT KNOWN FOR SECTION
    // ==========================================================================
    if (data.filmography.length === 0) {
      // Look for "Known For" section in HTML with images
      const knownForMatch = html.match(/Known\s*(?:For|for)[\s\S]{0,500}?<\/section>/i) ||
                           html.match(/data-testid="known-for"[\s\S]*?<\/section>/i);

      if (knownForMatch) {
        const section = knownForMatch[0];
        // Extract title links with poster images
        const titlePattern = /href="\/title\/(tt\d+)[^"]*"[\s\S]*?(?:src|data-src)="([^"]+)"[\s\S]*?>([^<]{2,50})</gi;

        let match: RegExpExecArray | null;
        while ((match = titlePattern.exec(section)) !== null && data.filmography.length < 10) {
          const titleId = match[1];
          const posterUrl = match[2];
          const titleName = match[3];
          if (!data.filmography.find(f => f.imdbTitleId === titleId)) {
            data.filmography.push({
              imdbTitleId: titleId,
              posterUrl: posterUrl,
              posterUrlHiRes: convertToHighResolution(posterUrl, 800),
              title: titleName.trim(),
              imdbUrl: `https://www.imdb.com/title/${titleId}/`,
            });
          }
        }
        console.log(`[DeepScraper] Known For entries: ${data.filmography.length}`);
      }
    }

    // ==========================================================================
    // METHOD 6: EXTRACT AWARDS
    // ==========================================================================
    const awardsPatterns = [
      /(\d+)\s*wins?\s*(?:&|and)\s*(\d+)\s*nominations?/i,
      /Won\s+(\d+)\s+(?:Oscar|Academy Award)/i,
    ];

    for (const pattern of awardsPatterns) {
      const match = (markdown + html).match(pattern);
      if (match) {
        if (match[2]) {
          data.awardsSummary = { wins: parseInt(match[1]), nominations: parseInt(match[2]) };
        }

        if (/Oscar\s*Winner|Academy\s*Award\s*Winner/i.test(markdown + html)) {
          data.awardsHighlight = "Academy Award Winner";
        } else if (/Emmy\s*Winner/i.test(markdown + html)) {
          data.awardsHighlight = "Emmy Winner";
        } else if (/Golden\s*Globe\s*Winner/i.test(markdown + html)) {
          data.awardsHighlight = "Golden Globe Winner";
        }
        break;
      }
    }

    // Extract gallery photos
    data.galleryPhotos = extractGalleryPhotos(html, data.imdbId);

    // Final summary
    console.log(`[DeepScraper] Profile extraction complete:`);
    console.log(`  - Name: ${data.name || 'NOT FOUND'}`);
    console.log(`  - Bio: ${data.bio?.length || 0} chars`);
    console.log(`  - Headshot: ${data.headshotUrl ? 'YES' : 'NO'}`);
    console.log(`  - Filmography: ${data.filmography?.length || 0} entries`);
    console.log(`  - Gallery photos: ${data.galleryPhotos?.length || 0}`);

    return Object.keys(data).length > 1 ? data : null; // Need more than just imdbId
  } catch (error) {
    console.error(`[DeepScraper] Error in profile scrape:`, error);
    return null;
  }
}

/**
 * Deep scrape an IMDb title page to extract comprehensive film details.
 * Extracts plot, tagline, credits, ratings, and media.
 * Uses multiple extraction methods with fallbacks for reliability.
 */
async function scrapeImdbTitlePageDeep(
  apiKey: string,
  titleId: string,
  userRole?: string
): Promise<DeepFilmDetails | null> {
  const url = `https://www.imdb.com/title/${titleId}/`;
  console.log(`[DeepScraper] Starting deep title scrape: ${url}`);

  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html"],
        waitFor: 10000, // Wait longer for IMDb's JS-heavy pages
        timeout: 90000,
        actions: [
          { type: "wait", milliseconds: 5000 }, // Additional wait for dynamic content
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DeepScraper] Title page scrape failed: ${response.status} - ${errorText}`);
      return null;
    }

    const result = await response.json();
    const markdown = result.data?.markdown || "";
    const html = result.data?.html || "";

    console.log(`[DeepScraper] Title ${titleId}: markdown=${markdown.length} chars, html=${html.length} chars`);

    // Debug: Log first 300 chars to see what we're getting
    if (markdown.length > 0) {
      console.log(`[DeepScraper] Title markdown preview: ${markdown.slice(0, 300)}...`);
    }

    const data: DeepFilmDetails = {
      imdbTitleId: titleId,
      title: "",
    };

    // ==========================================================================
    // METHOD 1: EXTRACT FROM JSON-LD (Movie/TVSeries schema) - Most reliable
    // ==========================================================================
    const jsonLdRegex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jsonLdMatch;
    let foundJsonLd = false;

    while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
      try {
        const jsonContent = jsonLdMatch[1].trim();
        console.log(`[DeepScraper] Found title JSON-LD block (${jsonContent.length} chars)`);

        const jsonData = JSON.parse(jsonContent);
        console.log(`[DeepScraper] Title JSON-LD type: ${jsonData["@type"]}`);

        if (jsonData["@type"] === "Movie" || jsonData["@type"] === "TVSeries" || jsonData["@type"] === "TVEpisode") {
          foundJsonLd = true;
          data.title = jsonData.name || "";
          data.plotSummary = jsonData.description;
          data.releaseDate = jsonData.datePublished;
          data.year = jsonData.datePublished?.slice(0, 4);
          data.contentRating = jsonData.contentRating;

          console.log(`[DeepScraper] JSON-LD extracted: "${data.title}" (${data.year})`);

          // Genres
          if (jsonData.genre) {
            data.genres = Array.isArray(jsonData.genre) ? jsonData.genre : [jsonData.genre];
          }

          // Duration
          if (jsonData.duration) {
            const durationMatch = jsonData.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
            if (durationMatch) {
              data.runtime = (parseInt(durationMatch[1] || "0") * 60) + parseInt(durationMatch[2] || "0");
            }
          }

          // Poster
          if (jsonData.image) {
            data.posterUrl = typeof jsonData.image === 'string' ? jsonData.image : jsonData.image.url;
            data.posterUrlHiRes = convertToHighResolution(data.posterUrl, 1200);
          }

          // Trailer
          if (jsonData.trailer) {
            data.trailerUrl = jsonData.trailer.url || jsonData.trailer.contentUrl;
            data.trailerThumbnail = jsonData.trailer.thumbnailUrl;
          }

          // Ratings
          if (jsonData.aggregateRating) {
            data.imdbRating = parseFloat(jsonData.aggregateRating.ratingValue);
            data.imdbVotes = parseInt(jsonData.aggregateRating.ratingCount);
          }

          // Director
          if (jsonData.director) {
            const directors = Array.isArray(jsonData.director) ? jsonData.director : [jsonData.director];
            data.director = directors.map((d: any) => d.name || d).filter(Boolean).join(", ");
          }

          // Writers
          if (jsonData.creator || jsonData.author) {
            const writers = jsonData.creator || jsonData.author;
            const writerList = Array.isArray(writers) ? writers : [writers];
            data.writers = writerList
              .filter((w: any) => w["@type"] === "Person" || typeof w === 'string')
              .map((w: any) => w.name || w)
              .slice(0, 3);
          }

          // Top cast
          if (jsonData.actor) {
            const actors = Array.isArray(jsonData.actor) ? jsonData.actor : [jsonData.actor];
            data.topCast = actors.slice(0, 5).map((a: any) => a.name || a).filter(Boolean);
          }

          // Production companies
          if (jsonData.productionCompany) {
            const companies = Array.isArray(jsonData.productionCompany)
              ? jsonData.productionCompany
              : [jsonData.productionCompany];
            data.productionCompanies = companies.map((c: any) => c.name || c).slice(0, 3);
          }
        }
      } catch (e) {
        console.log(`[DeepScraper] Title JSON-LD parse error: ${e}`);
      }
    }

    // ==========================================================================
    // METHOD 2: EXTRACT FROM HTML PATTERNS (Fallbacks)
    // ==========================================================================

    // Title from HTML if not found
    if (!data.title) {
      const titlePatterns = [
        /<title>([^<]+?)\s*(?:\(\d{4}\))?\s*-\s*IMDb/i,
        /<h1[^>]*data-testid="hero__pageTitle"[^>]*>([^<]+)</i,
        /<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</i,
        /property="og:title"\s+content="([^"]+)"/i,
      ];

      for (const pattern of titlePatterns) {
        const match = html.match(pattern);
        if (match && match[1].length > 1) {
          data.title = match[1].replace(/\s*\(\d{4}\).*/, '').trim();
          console.log(`[DeepScraper] Title from HTML pattern: ${data.title}`);
          break;
        }
      }
    }

    // Year from HTML if not found
    if (!data.year) {
      const yearPatterns = [
        /<a[^>]*href="[^"]*releaseinfo[^"]*"[^>]*>(\d{4})</i,
        /class="[^"]*release[^"]*"[^>]*>(\d{4})</i,
        /\((\d{4})\)/,
      ];

      for (const pattern of yearPatterns) {
        const match = (html + markdown).match(pattern);
        if (match) {
          data.year = match[1];
          console.log(`[DeepScraper] Year from HTML pattern: ${data.year}`);
          break;
        }
      }
    }

    // Rating from HTML if not found
    if (!data.imdbRating) {
      const ratingPatterns = [
        /data-testid="hero-rating-bar__aggregate-rating__score"[^>]*>[\s\S]*?<span[^>]*>(\d+\.?\d*)</i,
        /"ratingValue":\s*"?(\d+\.?\d*)"?/i,
        /(\d+\.?\d*)\s*\/\s*10/i,
      ];

      for (const pattern of ratingPatterns) {
        const match = (html + markdown).match(pattern);
        if (match) {
          const rating = parseFloat(match[1]);
          if (rating > 0 && rating <= 10) {
            data.imdbRating = rating;
            console.log(`[DeepScraper] Rating from HTML pattern: ${data.imdbRating}`);
            break;
          }
        }
      }
    }

    // Poster from HTML if not found
    if (!data.posterUrl) {
      const posterPatterns = [
        /property="og:image"\s+content="([^"]+)"/i,
        /content="([^"]+)"\s+property="og:image"/i,
        /<img[^>]*class="[^"]*poster[^"]*"[^>]*src="([^"]+)"/i,
        /data-testid="hero-media__poster"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i,
      ];

      for (const pattern of posterPatterns) {
        const match = html.match(pattern);
        if (match && match[1].includes('media-amazon.com')) {
          data.posterUrl = match[1];
          data.posterUrlHiRes = convertToHighResolution(match[1], 1200);
          console.log(`[DeepScraper] Poster from HTML pattern`);
          break;
        }
      }
    }

    // ==========================================================================
    // METHOD 3: EXTRACT FROM MARKDOWN (Plot, summary)
    // ==========================================================================
    if (!data.plotSummary && markdown.length > 100) {
      const plotPatterns = [
        /(?:Plot|Synopsis|Storyline|Summary)[:\s]*\n+([^\n#*]+(?:\n[^\n#*]+)*)/i,
        /^([A-Z][^#\n]{100,500})/m, // First substantial paragraph
      ];

      for (const pattern of plotPatterns) {
        const match = markdown.match(pattern);
        if (match && match[1].length > 50) {
          const plotText = match[1].replace(/\s+/g, ' ').trim().slice(0, 1000);
          data.plotSummary = plotText;
          console.log(`[DeepScraper] Plot from markdown: ${plotText.length} chars`);
          break;
        }
      }
    }

    // Genres from markdown if not found
    if (!data.genres || data.genres.length === 0) {
      const genreMatch = markdown.match(/(?:Genres?|Categories)[:\s]*([^\n]+)/i);
      if (genreMatch) {
        const genreList = genreMatch[1].split(/[,|•·]/).map((g: string) => g.trim()).filter((g: string) => g.length > 2);
        data.genres = genreList;
        console.log(`[DeepScraper] Genres from markdown: ${genreList.join(', ')}`);
      }
    }

    // Runtime from markdown if not found
    if (!data.runtime) {
      const runtimeMatch = (markdown + html).match(/(\d+)\s*(?:h|hr|hour)(?:\s*(\d+)\s*(?:m|min))?/i) ||
                          (markdown + html).match(/(\d+)\s*(?:m|min)(?:utes?)?/i);
      if (runtimeMatch) {
        if (runtimeMatch[2]) {
          data.runtime = parseInt(runtimeMatch[1]) * 60 + parseInt(runtimeMatch[2]);
        } else {
          const mins = parseInt(runtimeMatch[1]);
          data.runtime = mins > 300 ? Math.floor(mins / 60) : mins; // Handle if hours were matched as minutes
        }
        console.log(`[DeepScraper] Runtime from markdown: ${data.runtime} minutes`);
      }
    }

    // ==========================================================================
    // METHOD 4: EXTRACT CREDITS FROM HTML/MARKDOWN
    // ==========================================================================
    if (!data.director) {
      const directorPatterns = [
        /Director[s]?[:\s]*([A-Z][^\n<]+)/i,
        /Directed\s+by[:\s]*([A-Z][^\n<]+)/i,
        /<a[^>]*href="[^"]*\/name\/[^"]*"[^>]*>([^<]+)<\/a>[\s\S]*?Director/i,
      ];

      for (const pattern of directorPatterns) {
        const match = (html + markdown).match(pattern);
        if (match && match[1].length > 2) {
          data.director = match[1].replace(/\s+/g, ' ').trim().slice(0, 100);
          console.log(`[DeepScraper] Director from pattern: ${data.director}`);
          break;
        }
      }
    }

    if (!data.topCast || data.topCast.length === 0) {
      // Try to find cast from Stars section
      const starsMatch = (markdown + html).match(/Stars?[:\s]*([^\n]+)/i);
      if (starsMatch) {
        const castList = starsMatch[1]
          .split(/[,|•·]/)
          .map((s: string) => s.replace(/\[.*?\]/g, '').trim())
          .filter((s: string) => s.length > 2 && s.length < 50)
          .slice(0, 5);
        data.topCast = castList;
        console.log(`[DeepScraper] Cast from pattern: ${castList.join(', ')}`);
      }
    }

    // ==========================================================================
    // METHOD 5: EXTRACT TAGLINE (One-liner hook)
    // ==========================================================================
    const taglinePatterns = [
      /<span[^>]*data-testid="plot-tagline"[^>]*>([^<]+)</i,
      /Taglines?[:\s]*([^<\n]+)/i,
      /"tagline":\s*"([^"]+)"/i,
    ];

    for (const pattern of taglinePatterns) {
      const match = (html + markdown).match(pattern);
      if (match && match[1].length > 5 && match[1].length < 200) {
        data.tagline = match[1].trim();
        console.log(`[DeepScraper] Tagline found: ${data.tagline}`);
        break;
      }
    }

    // Create logline from tagline or first sentence of plot
    if (data.tagline) {
      data.logline = data.tagline;
    } else if (data.plotSummary) {
      data.logline = data.plotSummary.split(/[.!?]\s/)[0] + '.';
    }

    // ==========================================================================
    // METHOD 6: EXTRACT BOX OFFICE / BUDGET
    // ==========================================================================
    const budgetMatch = (html + markdown).match(/Budget[:\s]*\$?([\d,]+(?:\.\d+)?(?:\s*(?:million|billion))?)/i);
    if (budgetMatch) {
      data.budget = budgetMatch[1];
    }

    const boxOfficeMatch = (html + markdown).match(/(?:Box\s*Office|Gross|Worldwide)[:\s]*\$?([\d,]+(?:\.\d+)?(?:\s*(?:million|billion))?)/i);
    if (boxOfficeMatch) {
      data.boxOffice = boxOfficeMatch[1];
    }

    // ==========================================================================
    // METHOD 7: EXTRACT STILLS / PRODUCTION IMAGES
    // ==========================================================================
    data.stills = [];
    const imageMatches = html.matchAll(/<img[^>]*(?:src|data-src)="(https:\/\/m\.media-amazon\.com\/images\/[^"]+)"[^>]*>/gi);
    const seenUrls = new Set<string>();

    for (const match of imageMatches) {
      const imgUrl = match[1];
      if (seenUrls.has(imgUrl)) continue;

      // Skip tiny images (less than 60px)
      if (/_V1_(?:QL\d+_)?(?:U[XY]|S[XY])([1-5]\d)_/i.test(imgUrl)) continue;
      // Skip if it's the same as poster
      if (data.posterUrl && imgUrl.split('_V1')[0] === data.posterUrl.split('_V1')[0]) continue;

      seenUrls.add(imgUrl);
      const hiResUrl = convertToHighResolution(imgUrl, 1200);
      if (hiResUrl) {
        data.stills.push(hiResUrl);
      }

      if (data.stills.length >= 5) break;
    }

    // ==========================================================================
    // METHOD 8: EXTRACT BACKDROP IMAGE (Wide banner)
    // ==========================================================================
    const backdropPatterns = [
      /"backgroundImage":\s*"url\(([^)]+)\)"/i,
      /data-testid="hero-image"[^>]*src="([^"]+)"/i,
      /class="[^"]*hero[^"]*backdrop[^"]*"[^>]*src="([^"]+)"/i,
    ];

    for (const pattern of backdropPatterns) {
      const match = html.match(pattern);
      if (match && match[1].includes('media-amazon.com')) {
        data.backdropUrl = convertToHighResolution(match[1], 1920);
        break;
      }
    }

    // ==========================================================================
    // METHOD 9: TITLE FROM MARKDOWN (Final fallback)
    // ==========================================================================
    if (!data.title && markdown.length > 10) {
      const titleMatch = markdown.match(/^#\s*(.+)/m);
      if (titleMatch) {
        data.title = titleMatch[1].replace(/\s*\(\d{4}\).*/, '').trim();
        console.log(`[DeepScraper] Title from markdown header: ${data.title}`);
      }
    }

    // Set user's role if provided
    if (userRole) {
      data.userRole = userRole;
    }

    // Final summary
    console.log(`[DeepScraper] Title extraction complete:`);
    console.log(`  - Title: ${data.title || 'NOT FOUND'}`);
    console.log(`  - Year: ${data.year || 'NOT FOUND'}`);
    console.log(`  - Rating: ${data.imdbRating || 'NOT FOUND'}`);
    console.log(`  - Plot: ${data.plotSummary?.length || 0} chars`);
    console.log(`  - Poster: ${data.posterUrl ? 'YES' : 'NO'}`);
    console.log(`  - Director: ${data.director || 'NOT FOUND'}`);
    console.log(`  - Stills: ${data.stills?.length || 0}`);
    console.log(`  - JSON-LD found: ${foundJsonLd}`);

    return data.title ? data : null;
  } catch (error) {
    console.error(`[DeepScraper] Error scraping title ${titleId}:`, error);
    return null;
  }
}

/**
 * Update scraping status on a profile.
 */
export const updateScrapingStatus = internalMutation({
  args: {
    slug: v.string(),
    status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!profile) {
      console.log(`[ScrapingStatus] Profile not found: ${args.slug}`);
      return;
    }

    const updates: Record<string, unknown> = {
      scrapingStatus: args.status,
    };

    if (args.status === "in_progress") {
      updates.scrapingStartedAt = Date.now();
    } else if (args.status === "completed" || args.status === "failed") {
      updates.scrapingCompletedAt = Date.now();
    }

    if (args.error) {
      updates.scrapingError = args.error;
    }

    await ctx.db.patch(profile._id, updates);
    console.log(`[ScrapingStatus] Updated ${args.slug} status to: ${args.status}`);
  },
});

/**
 * Deep scrape for onboarding - scrapes profile page first, then top 3 films in parallel.
 * This provides rich data for the user's initial profile setup.
 * Updates scraping status so the frontend can wait for completion.
 */
export const deepScrapeForOnboarding = internalAction({
  args: {
    slug: v.string(),
    imdbUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log("[DeepScraper] FIRECRAWL_API_KEY not set, skipping deep scrape");
      // Mark as completed anyway so animation doesn't wait forever
      await ctx.runMutation(internal.profileScraper.updateScrapingStatus, {
        slug: args.slug,
        status: "completed",
        error: "API key not configured",
      });
      return { success: false, reason: "API key not configured" };
    }

    // Mark scraping as in progress
    await ctx.runMutation(internal.profileScraper.updateScrapingStatus, {
      slug: args.slug,
      status: "in_progress",
    });

    console.log(`[DeepScraper] Starting deep onboarding scrape for ${args.slug}`);
    const startTime = Date.now();

    try {
      // Phase 1: Deep scrape the profile page
      const profileData = await scrapeImdbProfileDeep(apiKey, args.imdbUrl);
      if (!profileData) {
        console.log("[DeepScraper] Failed to scrape profile page");
        await ctx.runMutation(internal.profileScraper.updateScrapingStatus, {
          slug: args.slug,
          status: "failed",
          error: "Profile scrape failed - no data extracted",
        });
        return { success: false, reason: "Profile scrape failed" };
      }

      console.log(`[DeepScraper] Profile scraped in ${Date.now() - startTime}ms`);

      // Phase 2: Get top 3 films with IMDb IDs for deep scraping
      const filmsToScrape = (profileData.filmography || [])
        .filter(f => f.imdbTitleId)
        .slice(0, 3);

      if (filmsToScrape.length > 0) {
        console.log(`[DeepScraper] Scraping ${filmsToScrape.length} title pages in parallel...`);

        // Scrape all title pages in parallel
        const titlePromises = filmsToScrape.map(film =>
          scrapeImdbTitlePageDeep(apiKey, film.imdbTitleId!, film.role)
        );

        const titleResults = await Promise.all(titlePromises);

        // Filter out nulls and add to profile data
        profileData.featuredFilms = titleResults.filter((r): r is DeepFilmDetails => r !== null);

        console.log(`[DeepScraper] Scraped ${profileData.featuredFilms.length} title pages`);
      }

      const totalTime = Date.now() - startTime;
      console.log(`[DeepScraper] Deep scrape completed in ${totalTime}ms`);

      // Apply the deep scraped data to the profile
      await ctx.runMutation(internal.profileScraper.applyDeepScrapedData, {
        slug: args.slug,
        deepData: JSON.stringify(profileData),
      });
      console.log(`[DeepScraper] Applied deep scraped data for ${args.slug}`);

      // Mark scraping as completed
      await ctx.runMutation(internal.profileScraper.updateScrapingStatus, {
        slug: args.slug,
        status: "completed",
      });

      return {
        success: true,
        profileName: profileData.name,
        filmsScraped: profileData.featuredFilms?.length || 0,
        photosExtracted: profileData.galleryPhotos?.length || 0,
        timeMs: totalTime,
      };
    } catch (error) {
      console.error("[DeepScraper] Error during deep scrape:", error);
      await ctx.runMutation(internal.profileScraper.updateScrapingStatus, {
        slug: args.slug,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return { success: false, reason: "Scraping error" };
    }
  },
});

/**
 * Apply deep scraped data to a profile and create rich projects.
 */
export const applyDeepScrapedData = internalMutation({
  args: {
    slug: v.string(),
    deepData: v.string(), // JSON string of DeepProfileData
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("actor_profiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!profile) {
      throw new Error(`Profile not found: ${args.slug}`);
    }

    const data: DeepProfileData = JSON.parse(args.deepData);
    const updates: Record<string, unknown> = {};
    let projectsCreated = 0;
    let projectsUpdated = 0;

    // ==========================================================================
    // UPDATE PROFILE
    // ==========================================================================

    // Update bio - prefer the deep scraped bio
    if (data.bio && (!profile.bio || profile.bio.includes("is a filmmaker creating") || profile.bio.length < 50)) {
      updates.bio = data.bioShort || data.bio.slice(0, 500);
    }

    // Update avatar with high-res headshot
    if (!profile.avatarUrl && (data.headshotUrlHiRes || data.headshotUrl)) {
      updates.avatarUrl = data.headshotUrlHiRes || data.headshotUrl;
    }

    // Update IMDb ID
    if (data.imdbId && !profile.imdbId) {
      updates.imdbId = data.imdbId;
    }

    // Update headline with awards or profession
    if (!profile.headline) {
      if (data.awardsHighlight) {
        updates.headline = data.awardsHighlight;
      } else if (data.primaryProfession && data.primaryProfession.length > 0) {
        updates.headline = data.primaryProfession.slice(0, 2).join(" • ");
      }
    }

    // ==========================================================================
    // CREATE/UPDATE PROJECTS FROM FEATURED FILMS (Deep scraped)
    // ==========================================================================

    if (data.featuredFilms && data.featuredFilms.length > 0) {
      console.log(`[DeepScraper] Processing ${data.featuredFilms.length} featured films with deep data`);

      const existingProjects = await ctx.db
        .query("projects")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
        .collect();

      const existingByTitleId = new Map(
        existingProjects.filter(p => p.imdbTitleId).map(p => [p.imdbTitleId, p])
      );

      let sortOrder = Math.max(0, ...existingProjects.map(p => p.sortOrder ?? 0)) + 1;

      for (const film of data.featuredFilms) {
        const existing = existingByTitleId.get(film.imdbTitleId);

        if (existing) {
          // Update existing project with deep data
          const projectUpdates: Record<string, unknown> = {};

          if (!existing.logline && film.logline) projectUpdates.logline = film.logline;
          if (!existing.description && film.plotSummary) projectUpdates.description = film.plotSummary;
          if (!existing.posterUrl && film.posterUrlHiRes) projectUpdates.posterUrl = film.posterUrlHiRes;
          if (!existing.trailerUrl && film.trailerUrl) projectUpdates.trailerUrl = film.trailerUrl;
          if (!existing.roleName && film.userRole) projectUpdates.roleName = film.userRole;

          if (Object.keys(projectUpdates).length > 0) {
            await ctx.db.patch(existing._id, projectUpdates);
            projectsUpdated++;
          }
        } else {
          // Create new project with deep data
          await ctx.db.insert("projects", {
            actorProfileId: profile._id,
            title: film.title,
            logline: film.logline,
            description: film.plotSummary,
            posterUrl: film.posterUrlHiRes || film.posterUrl || "",
            trailerUrl: film.trailerUrl,
            releaseYear: film.year ? parseInt(film.year, 10) : undefined,
            roleName: film.userRole || film.userCharacter,
            roleType: film.userRole ? "Actor" : undefined,
            imdbTitleId: film.imdbTitleId,
            status: "released",
            sortOrder,
            isFeatured: projectsCreated < 3, // Feature top 3
          });
          projectsCreated++;
          sortOrder++;
        }
      }
    }

    // ==========================================================================
    // CREATE REMAINING PROJECTS FROM FILMOGRAPHY (Basic data)
    // ==========================================================================

    if (data.filmography && data.filmography.length > 0) {
      const existingProjects = await ctx.db
        .query("projects")
        .withIndex("by_actorProfile", (q) => q.eq("actorProfileId", profile._id))
        .collect();

      const existingTitleIds = new Set(existingProjects.filter(p => p.imdbTitleId).map(p => p.imdbTitleId));
      const existingTitles = new Set(existingProjects.map(p => p.title.toLowerCase()));

      let sortOrder = Math.max(0, ...existingProjects.map(p => p.sortOrder ?? 0)) + 1;

      // Only create up to 7 more (10 total with 3 featured)
      const remainingFilms = data.filmography
        .filter(f => !existingTitleIds.has(f.imdbTitleId) && !existingTitles.has(f.title.toLowerCase()))
        .slice(0, 7);

      for (const film of remainingFilms) {
        await ctx.db.insert("projects", {
          actorProfileId: profile._id,
          title: film.title,
          posterUrl: film.posterUrlHiRes || film.posterUrl || "",
          releaseYear: film.year ? parseInt(film.year, 10) : undefined,
          roleName: film.role,
          roleType: film.role ? "Actor" : undefined,
          imdbTitleId: film.imdbTitleId || "",
          trailerUrl: film.trailerUrl,
          status: "released",
          sortOrder,
          isFeatured: false,
        });
        projectsCreated++;
        sortOrder++;
      }
    }

    // Apply profile updates
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(profile._id, updates);
      console.log(`[DeepScraper] Updated profile ${args.slug} with:`, Object.keys(updates));
    }

    console.log(`[DeepScraper] Created ${projectsCreated} projects, updated ${projectsUpdated} projects`);

    return {
      updated: Object.keys(updates),
      projectsCreated,
      projectsUpdated,
      featuredFilms: data.featuredFilms?.length || 0,
    };
  },
});
