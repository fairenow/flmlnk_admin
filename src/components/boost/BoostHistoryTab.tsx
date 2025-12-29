"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { motion } from "framer-motion";
import {
  Clock,
  DollarSign,
  Eye,
  MousePointerClick,
  Users,
  Calendar,
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  Sparkles,
  Film,
  Loader2,
  Zap,
} from "lucide-react";

interface BoostHistoryTabProps {
  actorProfileId: Id<"actor_profiles">;
}

const STATUS_CONFIG = {
  active: {
    label: "Active",
    icon: PlayCircle,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    borderColor: "border-green-200 dark:border-green-800",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  paused: {
    label: "Paused",
    icon: PauseCircle,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    borderColor: "border-amber-200 dark:border-amber-800",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    borderColor: "border-red-200 dark:border-red-800",
  },
  pending_payment: {
    label: "Pending Payment",
    icon: Clock,
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-100 dark:bg-slate-800",
    borderColor: "border-slate-200 dark:border-slate-700",
  },
  draft: {
    label: "Draft",
    icon: Clock,
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-100 dark:bg-slate-800",
    borderColor: "border-slate-200 dark:border-slate-700",
  },
};

const ASSET_TYPE_ICONS = {
  clip: PlayCircle,
  meme: Sparkles,
  gif: Film,
};

const ASSET_TYPE_COLORS = {
  clip: "bg-red-500",
  meme: "bg-orange-500",
  gif: "bg-purple-500",
};

export function BoostHistoryTab({ actorProfileId }: BoostHistoryTabProps) {
  const campaigns = useQuery(api.boost.getBoostCampaignHistory, { actorProfileId });

  const formatDate = (timestamp: number | undefined) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  if (campaigns === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
          <Zap className="h-8 w-8 text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          No boost campaigns yet
        </h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          Start boosting your content to reach more viewers. Your campaign history will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {campaigns.map((campaign, index) => {
        const statusConfig = STATUS_CONFIG[campaign.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.draft;
        const StatusIcon = statusConfig.icon;
        const AssetIcon = campaign.assetType ? ASSET_TYPE_ICONS[campaign.assetType as keyof typeof ASSET_TYPE_ICONS] : Zap;
        const assetBgColor = campaign.assetType ? ASSET_TYPE_COLORS[campaign.assetType as keyof typeof ASSET_TYPE_COLORS] : "bg-amber-500";

        return (
          <motion.div
            key={campaign._id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`group relative overflow-hidden rounded-2xl border ${statusConfig.borderColor} bg-white p-4 transition-all hover:shadow-lg dark:bg-[#161a24]`}
          >
            <div className="flex flex-col gap-4 sm:flex-row">
              {/* Asset Thumbnail */}
              <div className="relative h-32 w-full flex-shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-24 sm:w-32 dark:bg-slate-800">
                {campaign.assetThumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={campaign.assetThumbnail}
                    alt={campaign.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <AssetIcon className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                  </div>
                )}
                {/* Asset Type Badge */}
                {campaign.assetType && (
                  <div className={`absolute left-2 top-2 flex items-center gap-1 rounded-full ${assetBgColor} px-2 py-0.5 text-xs font-medium text-white`}>
                    <AssetIcon className="h-3 w-3" />
                    <span className="capitalize">{campaign.assetType}</span>
                  </div>
                )}
                {/* Status Badge */}
                <div className={`absolute right-2 top-2 flex items-center gap-1 rounded-full ${statusConfig.bgColor} px-2 py-0.5`}>
                  {campaign.status === "active" && (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                  )}
                  <span className={`text-xs font-medium ${statusConfig.color}`}>
                    {statusConfig.label}
                  </span>
                </div>
              </div>

              {/* Campaign Details */}
              <div className="flex flex-1 flex-col justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white line-clamp-1">
                    {campaign.name}
                  </h4>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(campaign.startDate)}
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5" />
                      {formatCurrency(campaign.budgetCents)} total
                    </span>
                    {campaign.daysRemaining !== null && campaign.status === "active" && (
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <Clock className="h-3.5 w-3.5" />
                        {campaign.daysRemaining} days left
                      </span>
                    )}
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Eye className="h-3 w-3" />
                      Impressions
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {formatNumber(campaign.impressions)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <MousePointerClick className="h-3 w-3" />
                      Clicks
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {formatNumber(campaign.clicks)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Users className="h-3 w-3" />
                      Reach
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {formatNumber(campaign.reach)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <DollarSign className="h-3 w-3" />
                      Spent
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {formatCurrency(campaign.spentCents)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
