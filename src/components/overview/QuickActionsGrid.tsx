"use client";

import { useMemo, useCallback, useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { motion } from "framer-motion";
import {
  PlayCircle,
  Sparkles,
  Film,
  Download,
  Share2,
  ExternalLink,
  Loader2,
  Plus,
} from "lucide-react";
import { useOverview } from "./OverviewContext";
import {
  staggerContainer,
  assetGridItemVariants,
  flyInVariants,
  rippleVariants,
} from "./animations";
import type { AssetType, AssetReference, QuickAsset } from "./types";

const ASSET_TYPE_ICONS = {
  clip: PlayCircle,
  meme: Sparkles,
  gif: Film,
};

const ASSET_TYPE_LABELS = {
  clip: "Clip",
  meme: "Meme",
  gif: "GIF",
};

const ASSET_TYPE_COLORS = {
  clip: "#dc2626",
  meme: "#ea580c",
  gif: "#9333ea",
};

interface AssetCardProps {
  asset: QuickAsset;
  onHover: (asset: AssetReference | null) => void;
  isHighlighted: boolean;
  isNew: boolean;
  isExpanded: boolean;
}

function AssetCard({ asset, onHover, isHighlighted, isNew, isExpanded }: AssetCardProps) {
  const Icon = ASSET_TYPE_ICONS[asset.type];
  const { reducedMotion } = useOverview();

  const handleMouseEnter = useCallback(() => {
    onHover({
      id: asset._id,
      type: asset.type,
      createdAt: asset.createdAt,
      title: asset.title,
      thumbnailUrl: asset.thumbnailUrl,
    });
  }, [asset, onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  return (
    <motion.div
      id={`asset-${asset._id}`}
      variants={reducedMotion ? undefined : isNew ? flyInVariants : assetGridItemVariants}
      initial={isNew ? "initial" : "hidden"}
      animate={isNew ? "animate" : "visible"}
      whileHover="hover"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`group relative overflow-hidden rounded-xl border bg-slate-50 transition-colors dark:bg-[#161a24] ${
        isHighlighted
          ? "border-red-500 ring-2 ring-red-500/30"
          : "border-red-200 hover:border-red-400 dark:border-red-900/30 dark:hover:border-red-700"
      }`}
    >
      {/* Ripple effect for new assets */}
      {isNew && (
        <motion.div
          variants={rippleVariants}
          initial="initial"
          animate="animate"
          className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500"
        />
      )}

      {/* Thumbnail */}
      <div className="relative aspect-[4/3] w-full bg-slate-100 dark:bg-[#1f2533]">
        {asset.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.thumbnailUrl}
            alt={asset.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-4">
            {/* Light mode placeholder */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/black_flmlnk.png"
              alt="Placeholder"
              className="h-12 w-12 object-contain opacity-30 dark:hidden"
            />
            {/* Dark mode placeholder */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/white_flmlnk.png"
              alt="Placeholder"
              className="hidden h-12 w-12 object-contain opacity-30 dark:block"
            />
          </div>
        )}

        {/* Type badge - only show when expanded */}
        {isExpanded && (
          <div
            className="absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white shadow-sm"
            style={{ backgroundColor: ASSET_TYPE_COLORS[asset.type] }}
          >
            <Icon className="h-3 w-3" />
            {ASSET_TYPE_LABELS[asset.type]}
          </div>
        )}

        {/* Score badge - only show when expanded */}
        {isExpanded &&
          (asset.score ?? asset.viralScore) !== undefined &&
          (asset.score ?? asset.viralScore)! > 0 && (
            <div className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white">
              {asset.score ?? asset.viralScore}
            </div>
          )}

        {/* Hover overlay with actions - only show when expanded */}
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50"
          >
            <motion.button
              type="button"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="rounded-full bg-white p-2 text-slate-900 shadow-lg transition hover:bg-red-100"
              title="Download"
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="h-4 w-4" />
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="rounded-full bg-white p-2 text-slate-900 shadow-lg transition hover:bg-red-100"
              title="Share"
              onClick={(e) => e.stopPropagation()}
            >
              <Share2 className="h-4 w-4" />
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="rounded-full bg-white p-2 text-slate-900 shadow-lg transition hover:bg-red-100"
              title="Open"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-4 w-4" />
            </motion.button>
          </motion.div>
        )}

        {/* Highlight glow effect */}
        {isHighlighted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pointer-events-none absolute inset-0 bg-red-500/20"
          />
        )}
      </div>

      {/* Title */}
      <div className="p-2">
        <p className="truncate text-xs font-medium text-slate-900 dark:text-white">
          {asset.title}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
          {new Date(asset.createdAt).toLocaleDateString()}
        </p>
      </div>
    </motion.div>
  );
}

interface QuickActionsGridProps {
  slug: string;
  onNavigateToGenerator?: (type: AssetType) => void;
}

export function QuickActionsGrid({
  slug: _slug,
  onNavigateToGenerator,
}: QuickActionsGridProps) {
  const {
    timeRange,
    actorProfileId,
    setHoveredAsset,
    hoveredDate,
    newAssetAnimation,
    focusedComponent,
    reducedMotion,
  } = useOverview();

  const isExpanded = focusedComponent === "quickActions";

  // State for assets fetched via action
  const [recentAssets, setRecentAssets] = useState<QuickAsset[] | undefined>(
    undefined
  );
  const [isLoading, setIsLoading] = useState(true);

  // Action for fetching assets with signed URLs
  const getRecentAssetsWithSignedUrls = useAction(
    api.overview.getRecentAssetsWithSignedUrls
  );

  // Fetch recent assets with signed URLs
  useEffect(() => {
    if (!actorProfileId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getRecentAssetsWithSignedUrls({
      actorProfileId,
      timeRange,
      limit: isExpanded ? 12 : 6,
    })
      .then((assets) => {
        if (!cancelled) {
          setRecentAssets(assets as QuickAsset[]);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        console.error("Failed to fetch recent assets:", error);
        if (!cancelled) {
          setRecentAssets([]);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [actorProfileId, timeRange, isExpanded, getRecentAssetsWithSignedUrls]);

  // Check which assets should be highlighted based on hovered date
  const highlightedAssetIds = useMemo(() => {
    if (!hoveredDate || !recentAssets) return new Set<string>();

    const ids = new Set<string>();
    for (const asset of recentAssets) {
      const assetDate = new Date(asset.createdAt).toISOString().split("T")[0];
      if (assetDate === hoveredDate) {
        ids.add(asset._id);
      }
    }
    return ids;
  }, [hoveredDate, recentAssets]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-red-500" />
      </div>
    );
  }

  if (!recentAssets || recentAssets.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-8 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-200">
          <Sparkles className="h-7 w-7" />
        </div>
        <p className="text-sm font-medium text-slate-900 dark:text-white">
          No assets yet
        </p>
        <p className="mt-1 max-w-[200px] text-xs text-slate-600 dark:text-slate-400">
          Generate your first clips, memes, or GIFs to see them here.
        </p>
        {onNavigateToGenerator && (
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToGenerator("clip");
            }}
            className="mt-4 flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-red-600/25 hover:bg-red-500"
          >
            <Plus className="h-4 w-4" />
            Generate Assets
          </motion.button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
          Recent Assets
        </h3>
        {onNavigateToGenerator && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToGenerator("clip");
            }}
            className="text-xs font-medium text-red-600 hover:text-red-500 dark:text-red-400"
          >
            View all →
          </button>
        )}
      </div>

      <motion.div
        variants={reducedMotion ? undefined : staggerContainer}
        initial="hidden"
        animate="visible"
        className={`grid flex-1 gap-3 ${
          isExpanded
            ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
            : "grid-cols-2 sm:grid-cols-3"
        }`}
      >
        {recentAssets.map((asset) => (
          <AssetCard
            key={asset._id}
            asset={asset}
            onHover={setHoveredAsset}
            isHighlighted={highlightedAssetIds.has(asset._id)}
            isNew={newAssetAnimation?.id === asset._id}
            isExpanded={isExpanded}
          />
        ))}
      </motion.div>
    </div>
  );
}
