"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Youtube, Play, Link2 } from "lucide-react";
import { useOverview } from "./OverviewContext";
import { youtubeThumbnailVariants, playButtonVariants } from "./animations";

interface YouTubeChannelProps {
  youtubeUrl?: string;
  displayName: string;
}

interface ParsedYouTube {
  channelUrl: string;
  thumbnailUrl: string;
  type: "channel" | "video" | "user";
  displayId: string;
}

function parseYouTubeUrl(url: string): ParsedYouTube | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    if (hostname.includes("youtube.com")) {
      const pathname = parsed.pathname;

      // Channel URL: youtube.com/channel/CHANNEL_ID
      if (pathname.startsWith("/channel/")) {
        const channelId = pathname.split("/")[2];
        return {
          channelUrl: url,
          thumbnailUrl: "",
          type: "channel",
          displayId: channelId,
        };
      }

      // Handle URL: youtube.com/@username
      if (pathname.startsWith("/@")) {
        const handle = pathname.slice(2).split("/")[0];
        return {
          channelUrl: `https://youtube.com/@${handle}`,
          thumbnailUrl: "",
          type: "user",
          displayId: `@${handle}`,
        };
      }

      // Video URL: youtube.com/watch?v=VIDEO_ID
      if (pathname === "/watch") {
        const videoId = parsed.searchParams.get("v");
        if (videoId) {
          return {
            channelUrl: url,
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
            type: "video",
            displayId: videoId,
          };
        }
      }

      // Shorts URL: youtube.com/shorts/VIDEO_ID
      if (pathname.startsWith("/shorts/")) {
        const videoId = pathname.split("/")[2];
        return {
          channelUrl: url,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
          type: "video",
          displayId: videoId,
        };
      }
    }

    // Short URL: youtu.be/VIDEO_ID
    if (hostname === "youtu.be") {
      const videoId = parsed.pathname.slice(1);
      return {
        channelUrl: `https://youtube.com/watch?v=${videoId}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        type: "video",
        displayId: videoId,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function YouTubeChannel({
  youtubeUrl,
  displayName,
}: YouTubeChannelProps) {
  const { focusedComponent, reducedMotion } = useOverview();
  const isExpanded = focusedComponent === "youtube";

  const parsed = useMemo(
    () => (youtubeUrl ? parseYouTubeUrl(youtubeUrl) : null),
    [youtubeUrl]
  );

  // Handle click to switch chart to referrals
  const handleClick = () => {
    if (parsed) {
      window.open(parsed.channelUrl, "_blank", "noopener,noreferrer");
    }
  };

  if (!parsed) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-200">
          <Youtube className="h-7 w-7" />
        </div>
        <p className="text-sm font-medium text-slate-900 dark:text-white">
          No YouTube linked
        </p>
        <p className="mt-1 max-w-[180px] text-xs text-slate-600 dark:text-slate-400">
          Add your YouTube URL in Account Settings to display your channel here
        </p>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <Link2 className="h-3.5 w-3.5" />
          <span>Link your channel</span>
        </div>
      </div>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      variants={reducedMotion ? undefined : youtubeThumbnailVariants}
      initial="idle"
      whileHover="hover"
      className="group relative block h-full w-full overflow-hidden text-left"
    >
      {/* Thumbnail area */}
      <div className="relative h-full w-full bg-slate-100 dark:bg-[#1f2533]">
        {parsed.thumbnailUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={parsed.thumbnailUrl}
              alt={`${displayName} YouTube`}
              className="h-full w-full object-cover"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                if (img.src.includes("maxresdefault")) {
                  img.src = img.src.replace("maxresdefault", "hqdefault");
                }
              }}
            />

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

            {/* Play button overlay */}
            <motion.div
              variants={reducedMotion ? undefined : playButtonVariants}
              initial="idle"
              whileHover="hover"
              animate={isExpanded ? "pulse" : "idle"}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/50 transition-transform group-hover:scale-110">
                <Play className="h-8 w-8 fill-current pl-1" />
              </div>
            </motion.div>
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-red-500 to-red-700 p-6 text-white">
            <Youtube className="h-16 w-16 opacity-90" />
            <p className="mt-3 text-lg font-bold">{parsed.displayId}</p>
            <p className="mt-1 text-sm opacity-80">YouTube Channel</p>
          </div>
        )}

        {/* YouTube badge */}
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-md">
          <Youtube className="h-3.5 w-3.5" />
          YouTube
        </div>

        {/* Info bar at bottom */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-4">
          <div>
            <p className="font-semibold text-white drop-shadow-lg">
              {displayName}
            </p>
            <p className="text-xs text-white/80">
              {parsed.type === "video" ? "Featured Video" : "YouTube Channel"}
            </p>
          </div>
          <motion.div
            whileHover={{ scale: 1.1 }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition group-hover:bg-white group-hover:text-red-600"
          >
            <ExternalLink className="h-5 w-5" />
          </motion.div>
        </div>
      </div>

      {/* Expanded state: show additional info */}
      {isExpanded && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-6 pt-20"
        >
          <p className="text-sm text-white/90">
            Click to visit your YouTube {parsed.type === "video" ? "video" : "channel"} page.
            Share your content and grow your audience!
          </p>
        </motion.div>
      )}
    </motion.button>
  );
}
