"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  Zap,
  DollarSign,
  Eye,
  MousePointer,
  TrendingUp,
  Clock,
  Filter,
  ChevronDown,
  ChevronUp,
  Play,
  Image,
  Film,
} from "lucide-react";
import { useState } from "react";

interface AdminBoostTrackingProps {
  adminEmail: string;
}

type StatusFilter = "" | "active" | "pending" | "completed" | "paused" | "cancelled";
type SortBy = "recent" | "budget" | "impressions";

export function AdminBoostTracking({ adminEmail }: AdminBoostTrackingProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [expandedSection, setExpandedSection] = useState<string | null>("campaigns");

  const analytics = useQuery(api.adminPortal.getBoostAnalytics, { adminEmail });
  const campaigns = useQuery(api.adminPortal.getAllBoostCampaigns, {
    adminEmail,
    status: statusFilter || undefined,
    sortBy,
    limit: 50,
  });

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
      pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
      completed: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
      paused: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400",
      cancelled: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
    };
    return styles[status] || styles.pending;
  };

  const getAssetIcon = (type: string | null) => {
    switch (type) {
      case "clip":
        return <Play className="h-4 w-4" />;
      case "meme":
        return <Image className="h-4 w-4" />;
      case "gif":
        return <Film className="h-4 w-4" />;
      default:
        return <Zap className="h-4 w-4" />;
    }
  };

  if (!analytics) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-3 text-slate-400">
          <Zap className="h-5 w-5 animate-pulse" />
          <span>Loading boost data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-carpet-red-800 via-carpet-red-600 to-red-500 p-6 text-white shadow-lg shadow-red-950/40">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-red-100">Admin Boost Tracking</p>
            <h2 className="text-2xl font-semibold tracking-tight">Boost Campaigns</h2>
            <p className="mt-1 text-sm text-red-100/90">
              Track all user boost submissions and campaign performance
            </p>
          </div>
        </div>
      </div>

      {/* Analytics Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Zap}
          label="Total Campaigns"
          value={analytics.totalCampaigns}
          subtext={`${analytics.activeCampaigns} active`}
        />
        <StatCard
          icon={DollarSign}
          label="Total Revenue"
          value={formatCurrency(analytics.totalRevenueCents)}
          subtext={`${formatCurrency(analytics.timeStats.revenueThisMonth)} this month`}
          isText
        />
        <StatCard
          icon={Eye}
          label="Impressions"
          value={analytics.totalImpressions.toLocaleString()}
          subtext={`${analytics.avgCTR}% CTR`}
          isText
        />
        <StatCard
          icon={MousePointer}
          label="Total Clicks"
          value={analytics.totalClicks.toLocaleString()}
          subtext={`${analytics.paidCampaigns} paid`}
          isText
        />
      </div>

      {/* Asset Type Breakdown */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-red-200 dark:border-white/10 bg-red-50 dark:bg-white/5 p-4 text-center">
          <Play className="h-6 w-6 text-red-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{analytics.byAssetType.clip}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">Clip Boosts</p>
        </div>
        <div className="rounded-xl border border-red-200 dark:border-white/10 bg-red-50 dark:bg-white/5 p-4 text-center">
          <Image className="h-6 w-6 text-red-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{analytics.byAssetType.meme}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">Meme Boosts</p>
        </div>
        <div className="rounded-xl border border-red-200 dark:border-white/10 bg-red-50 dark:bg-white/5 p-4 text-center">
          <Film className="h-6 w-6 text-red-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{analytics.byAssetType.gif}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">GIF Boosts</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 outline-none dark:border-red-900/50 dark:bg-slate-800 dark:text-white"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 outline-none dark:border-red-900/50 dark:bg-slate-800 dark:text-white"
          >
            <option value="recent">Most Recent</option>
            <option value="budget">Highest Budget</option>
            <option value="impressions">Most Impressions</option>
          </select>
        </div>
      </div>

      {/* Campaigns List */}
      <div
        className="rounded-2xl border border-red-300 bg-white dark:border-red-900/50 dark:bg-[#0f1219] overflow-hidden cursor-pointer shadow-lg"
        onClick={() => toggleSection("campaigns")}
      >
        <div className="flex items-center justify-between p-4 border-b border-red-200 dark:border-red-900/50">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Zap className="h-5 w-5 text-red-500" />
            Boost Campaigns ({campaigns?.length || 0})
          </h3>
          {expandedSection === "campaigns" ? (
            <ChevronUp className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          )}
        </div>
        {expandedSection === "campaigns" && campaigns && (
          <div className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-red-200 dark:border-white/10">
                    <th className="pb-3 pr-4">Asset</th>
                    <th className="pb-3 px-2">Creator</th>
                    <th className="pb-3 px-2">Status</th>
                    <th className="pb-3 px-2 text-right">Budget</th>
                    <th className="pb-3 px-2 text-right">Impressions</th>
                    <th className="pb-3 px-2 text-right">Clicks</th>
                    <th className="pb-3 pl-2 text-right">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100 dark:divide-white/5">
                  {campaigns.map((campaign) => (
                    <tr key={campaign._id} className="hover:bg-red-50 dark:hover:bg-white/5">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          {campaign.assetThumbnail ? (
                            <img
                              src={campaign.assetThumbnail}
                              alt={campaign.name}
                              className="h-10 w-10 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                              {getAssetIcon(campaign.assetType)}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white line-clamp-1">
                              {campaign.name}
                            </p>
                            <p className="text-xs text-slate-400 flex items-center gap-1">
                              {getAssetIcon(campaign.assetType)}
                              {campaign.assetType || "Unknown"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <p className="font-medium text-slate-900 dark:text-white">{campaign.profileName}</p>
                        <p className="text-xs text-slate-400">{campaign.creatorEmail}</p>
                      </td>
                      <td className="py-3 px-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(campaign.status)}`}>
                          {campaign.status}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right text-slate-900 dark:text-white">
                        {formatCurrency(campaign.budgetCents)}
                      </td>
                      <td className="py-3 px-2 text-right text-slate-600 dark:text-slate-300">
                        {campaign.impressions.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-right text-slate-600 dark:text-slate-300">
                        {campaign.clicks.toLocaleString()}
                      </td>
                      <td className="py-3 pl-2 text-right text-slate-500 dark:text-slate-400 text-xs">
                        {new Date(campaign.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {campaigns.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  No boost campaigns found
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Time Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-red-200 dark:border-white/10 bg-red-50 dark:bg-white/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-red-500" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Today</p>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{analytics.timeStats.campaignsToday} campaigns</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{formatCurrency(analytics.timeStats.revenueToday)} revenue</p>
        </div>
        <div className="rounded-xl border border-red-200 dark:border-white/10 bg-red-50 dark:bg-white/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-red-500" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">This Week</p>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{analytics.timeStats.campaignsThisWeek} campaigns</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{formatCurrency(analytics.timeStats.revenueThisWeek)} revenue</p>
        </div>
        <div className="rounded-xl border border-red-200 dark:border-white/10 bg-red-50 dark:bg-white/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-red-500" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">This Month</p>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{analytics.timeStats.campaignsThisMonth} campaigns</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{formatCurrency(analytics.timeStats.revenueThisMonth)} revenue</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  isText = false,
}: {
  icon: typeof Zap;
  label: string;
  value: number | string;
  subtext: string;
  isText?: boolean;
}) {
  return (
    <div className="rounded-xl border border-red-200 dark:border-white/10 bg-red-50 dark:bg-white/5 p-4">
      <Icon className="h-6 w-6 text-red-500 mb-2" />
      <p className="text-2xl font-bold text-slate-900 dark:text-white">
        {isText ? value : (value as number).toLocaleString()}
      </p>
      <p className="text-sm font-medium text-slate-700 dark:text-white">{label}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{subtext}</p>
    </div>
  );
}
