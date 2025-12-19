"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import {
  Zap,
  DollarSign,
  Eye,
  Users,
  Clock,
  ChevronLeft,
  Filter,
  Image as ImageIcon,
  Video,
  FileImage,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Calendar,
  BarChart3,
} from "lucide-react";

type StatusFilter = "all" | "active" | "completed" | "pending_payment" | "paused" | "cancelled";

export default function AdminBoostPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Fetch all boost campaigns
  const campaigns = useQuery(api.boost.getAllBoostCampaignsAdmin, {
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
  });

  // Fetch summary stats
  const summary = useQuery(api.boost.getBoostSummaryAdmin, {});

  const isLoading = campaigns === undefined || summary === undefined;

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const formatDate = (timestamp: number | undefined) => {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getAssetIcon = (type: string | undefined) => {
    switch (type) {
      case "clip":
        return <Video className="h-4 w-4" />;
      case "meme":
        return <ImageIcon className="h-4 w-4" />;
      case "gif":
        return <FileImage className="h-4 w-4" />;
      default:
        return <Zap className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string, paymentStatus?: string) => {
    if (status === "active") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle className="h-3 w-3" /> Active
        </span>
      );
    }
    if (status === "completed") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          <CheckCircle className="h-3 w-3" /> Completed
        </span>
      );
    }
    if (status === "pending_payment") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <AlertCircle className="h-3 w-3" /> Pending Payment
        </span>
      );
    }
    if (status === "paused") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          <Clock className="h-3 w-3" /> Paused
        </span>
      );
    }
    if (status === "cancelled" || paymentStatus === "failed") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <XCircle className="h-3 w-3" /> {status === "cancelled" ? "Cancelled" : "Failed"}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        {status}
      </span>
    );
  };

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors mb-4"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Admin
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg">
                <Zap className="h-6 w-6" />
              </div>
              Boost Campaigns
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              View all boost campaigns across all users
            </p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm dark:border-amber-900/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="h-5 w-5 text-amber-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Total Campaigns</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {summary?.totalCampaigns.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-green-200 bg-white p-4 shadow-sm dark:border-green-900/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Active</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {summary?.activeCampaigns.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm dark:border-blue-900/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-5 w-5 text-blue-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Total Spent</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatCurrency(summary?.totalSpentCents ?? 0)}
              </div>
            </div>
            <div className="rounded-2xl border border-purple-200 bg-white p-4 shadow-sm dark:border-purple-900/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="h-5 w-5 text-purple-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Impressions</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {summary?.totalImpressions.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm dark:border-indigo-900/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-5 w-5 text-indigo-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Unique Users</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {summary?.uniqueUsers.toLocaleString() ?? 0}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <span className="text-sm text-slate-600 dark:text-slate-400">Filter by status:</span>
            </div>
            <div className="flex gap-2">
              {(["all", "active", "completed", "pending_payment", "paused", "cancelled"] as StatusFilter[]).map(
                (status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      statusFilter === status
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                    }`}
                  >
                    {status === "all" ? "All" : status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Campaign Cards */}
          <div className="space-y-4">
            {campaigns?.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                <Zap className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                <p className="text-slate-500 dark:text-slate-400">No campaigns found</p>
              </div>
            ) : (
              campaigns?.map((campaign) => (
                <div
                  key={campaign._id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* Asset Thumbnail */}
                    <div className="flex-shrink-0">
                      {campaign.assetThumbnail ? (
                        <img
                          src={campaign.assetThumbnail}
                          alt={campaign.name}
                          className="w-24 h-24 lg:w-20 lg:h-20 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="w-24 h-24 lg:w-20 lg:h-20 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                          {getAssetIcon(campaign.assetType || undefined)}
                        </div>
                      )}
                    </div>

                    {/* Campaign Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {getStatusBadge(campaign.status, campaign.paymentStatus || undefined)}
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {getAssetIcon(campaign.assetType || undefined)}
                          {campaign.assetType || "Unknown"}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                          {campaign.platform || "All Platforms"}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                        {campaign.name}
                      </h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-slate-600 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {campaign.userName}
                        </span>
                        <span className="flex items-center gap-1">
                          Film: {campaign.filmName}
                        </span>
                        {campaign.profileSlug && (
                          <span className="flex items-center gap-1">
                            <Link
                              href={`/f/${campaign.profileSlug}`}
                              className="text-amber-600 hover:underline dark:text-amber-400"
                              target="_blank"
                            >
                              @{campaign.profileSlug}
                            </Link>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                      <div className="text-center">
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Budget</div>
                        <div className="text-lg font-semibold text-slate-900 dark:text-white">
                          {formatCurrency(campaign.budgetCents)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Spent</div>
                        <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                          {formatCurrency(campaign.spentCents)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Impressions</div>
                        <div className="text-lg font-semibold text-slate-900 dark:text-white">
                          {campaign.impressions.toLocaleString()}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Clicks</div>
                        <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                          {campaign.clicks.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Duration Info */}
                    <div className="flex-shrink-0 text-right">
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Duration</div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white">
                        {campaign.durationDays || "—"} days
                      </div>
                      {campaign.status === "active" && campaign.daysRemaining !== null && (
                        <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                          {campaign.daysRemaining} days left
                        </div>
                      )}
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        <Calendar className="h-3 w-3 inline mr-1" />
                        {formatDate(campaign.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
