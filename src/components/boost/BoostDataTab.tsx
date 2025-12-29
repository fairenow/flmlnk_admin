"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { motion } from "framer-motion";
import {
  BarChart3,
  DollarSign,
  Eye,
  MousePointerClick,
  Users,
  TrendingUp,
  Target,
  PlayCircle,
  Sparkles,
  Film,
  Loader2,
  Zap,
  ArrowUpRight,
} from "lucide-react";

interface BoostDataTabProps {
  actorProfileId: Id<"actor_profiles">;
}

const ASSET_TYPE_ICONS = {
  clip: PlayCircle,
  meme: Sparkles,
  gif: Film,
};

const ASSET_TYPE_COLORS = {
  clip: {
    bg: "bg-red-500",
    light: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-600 dark:text-red-400",
  },
  meme: {
    bg: "bg-orange-500",
    light: "bg-orange-100 dark:bg-orange-900/30",
    text: "text-orange-600 dark:text-orange-400",
  },
  gif: {
    bg: "bg-purple-500",
    light: "bg-purple-100 dark:bg-purple-900/30",
    text: "text-purple-600 dark:text-purple-400",
  },
};

export function BoostDataTab({ actorProfileId }: BoostDataTabProps) {
  const assetMetrics = useQuery(api.boost.getBoostMetricsByAsset, { actorProfileId });

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  if (assetMetrics === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (assetMetrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
          <BarChart3 className="h-8 w-8 text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          No performance data yet
        </h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          Once you start boosting assets, their performance metrics will appear here.
        </p>
      </div>
    );
  }

  // Calculate totals
  const totals = assetMetrics.reduce(
    (acc, asset) => ({
      impressions: acc.impressions + asset.totalImpressions,
      clicks: acc.clicks + asset.totalClicks,
      reach: acc.reach + asset.totalReach,
      spent: acc.spent + asset.totalSpentCents,
    }),
    { impressions: 0, clicks: 0, reach: 0, spent: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 dark:border-slate-700 dark:from-blue-900/20 dark:to-indigo-900/20">
          <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
            <Eye className="h-4 w-4" />
            Total Impressions
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {formatNumber(totals.impressions)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-green-50 to-emerald-50 p-4 dark:border-slate-700 dark:from-green-900/20 dark:to-emerald-900/20">
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <MousePointerClick className="h-4 w-4" />
            Total Clicks
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {formatNumber(totals.clicks)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-purple-50 to-pink-50 p-4 dark:border-slate-700 dark:from-purple-900/20 dark:to-pink-900/20">
          <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
            <Users className="h-4 w-4" />
            Total Reach
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {formatNumber(totals.reach)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 dark:border-slate-700 dark:from-amber-900/20 dark:to-orange-900/20">
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
            <DollarSign className="h-4 w-4" />
            Total Spent
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {formatCurrency(totals.spent)}
          </p>
        </div>
      </div>

      {/* Asset Performance Cards */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Performance by Asset
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assetMetrics.map((asset, index) => {
            const AssetIcon = ASSET_TYPE_ICONS[asset.assetType as keyof typeof ASSET_TYPE_ICONS] || Zap;
            const colors = ASSET_TYPE_COLORS[asset.assetType as keyof typeof ASSET_TYPE_COLORS] || ASSET_TYPE_COLORS.meme;

            return (
              <motion.div
                key={`${asset.assetType}:${asset.assetId}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:shadow-lg dark:border-slate-700 dark:bg-[#161a24]"
              >
                {/* Asset Thumbnail */}
                <div className="relative h-40 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                  {asset.assetThumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.assetThumbnail}
                      alt={asset.assetTitle}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <AssetIcon className="h-12 w-12 text-slate-300 dark:text-slate-600" />
                    </div>
                  )}
                  {/* Asset Type Badge */}
                  <div className={`absolute left-3 top-3 flex items-center gap-1 rounded-full ${colors.bg} px-2.5 py-1 text-xs font-medium text-white`}>
                    <AssetIcon className="h-3.5 w-3.5" />
                    <span className="capitalize">{asset.assetType}</span>
                  </div>
                  {/* Active Badge */}
                  {asset.activeCampaigns > 0 && (
                    <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-green-500 px-2.5 py-1">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                      <span className="text-xs font-medium text-white">
                        {asset.activeCampaigns} Active
                      </span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white line-clamp-1">
                    {asset.assetTitle}
                  </h4>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {asset.campaignCount} campaign{asset.campaignCount !== 1 ? "s" : ""}
                  </p>

                  {/* Metrics Grid */}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className={`rounded-lg ${colors.light} p-2.5`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 dark:text-slate-400">Impressions</span>
                        <Eye className={`h-3.5 w-3.5 ${colors.text}`} />
                      </div>
                      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                        {formatNumber(asset.totalImpressions)}
                      </p>
                    </div>
                    <div className={`rounded-lg ${colors.light} p-2.5`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 dark:text-slate-400">Clicks</span>
                        <MousePointerClick className={`h-3.5 w-3.5 ${colors.text}`} />
                      </div>
                      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                        {formatNumber(asset.totalClicks)}
                      </p>
                    </div>
                    <div className={`rounded-lg ${colors.light} p-2.5`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 dark:text-slate-400">CTR</span>
                        <TrendingUp className={`h-3.5 w-3.5 ${colors.text}`} />
                      </div>
                      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                        {asset.avgCtr}%
                      </p>
                    </div>
                    <div className={`rounded-lg ${colors.light} p-2.5`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 dark:text-slate-400">Spent</span>
                        <DollarSign className={`h-3.5 w-3.5 ${colors.text}`} />
                      </div>
                      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                        {formatCurrency(asset.totalSpentCents)}
                      </p>
                    </div>
                  </div>

                  {/* Additional Metrics */}
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <Target className="h-3.5 w-3.5" />
                      CPC: {formatCurrency(asset.avgCpc)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      CPM: {formatCurrency(asset.avgCpm)}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
