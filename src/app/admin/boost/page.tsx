"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
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
  Grid,
  List,
  Search,
  PlayCircle,
  Sparkles,
  Film,
  MousePointer,
  X,
} from "lucide-react";

type StatusFilter = "all" | "active" | "completed" | "pending_payment" | "paused" | "cancelled";
type ViewMode = "grid" | "list";

const ASSET_TYPE_ICONS = {
  clip: PlayCircle,
  meme: Sparkles,
  gif: Film,
};

const ASSET_TYPE_COLORS = {
  clip: "#dc2626",
  meme: "#ea580c",
  gif: "#9333ea",
};

export default function AdminBoostPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch all boost campaigns
  const campaigns = useQuery(api.boost.getAllBoostCampaignsAdmin, {
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
  });

  // Fetch summary stats
  const summary = useQuery(api.boost.getBoostSummaryAdmin, {});

  // Fetch users for filtering
  const users = useQuery(api.analytics.getAllUsersAdmin, {});

  // Handle click outside dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isLoading = campaigns === undefined || summary === undefined;

  // Filter campaigns
  const filteredCampaigns = campaigns?.filter((campaign) => {
    // Filter by user
    if (selectedUserId && campaign.userId !== selectedUserId) return false;
    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        campaign.name.toLowerCase().includes(query) ||
        campaign.userName?.toLowerCase().includes(query) ||
        campaign.profileName?.toLowerCase().includes(query) ||
        campaign.filmName?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const selectedUser = users?.find((u) => u._id === selectedUserId);

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
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
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

          {/* Search and View Toggle */}
          <div className="flex items-center gap-3">
            <div className="relative w-full lg:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search campaigns..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2.5 transition-colors ${
                  viewMode === "grid"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <Grid className="h-5 w-5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2.5 transition-colors ${
                  viewMode === "list"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <List className="h-5 w-5" />
              </button>
            </div>
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
          <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-6 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-4">
              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600 dark:text-slate-400">Status:</span>
              </div>
              <div className="flex flex-wrap gap-2">
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

              {/* User Filter */}
              <div ref={userDropdownRef} className="relative ml-auto">
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedUserId
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                  }`}
                >
                  <Users className="h-4 w-4" />
                  {selectedUser ? selectedUser.name : "All Users"}
                  {selectedUserId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedUserId(null);
                      }}
                      className="ml-1 p-0.5 rounded hover:bg-amber-200 dark:hover:bg-amber-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </button>

                {showUserDropdown && users && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl border border-slate-200 shadow-xl z-50 dark:bg-slate-900 dark:border-slate-700 max-h-60 overflow-y-auto">
                    <button
                      onClick={() => {
                        setSelectedUserId(null);
                        setShowUserDropdown(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      All Users
                    </button>
                    {users.map((user) => (
                      <button
                        key={user._id}
                        onClick={() => {
                          setSelectedUserId(user._id);
                          setShowUserDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <div className="font-medium text-slate-900 dark:text-white">{user.name}</div>
                        <div className="text-xs text-slate-500">{user.email}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Campaign Display */}
          {filteredCampaigns?.length === 0 ? (
            <div className="text-center py-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
              <Zap className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <p className="text-slate-500 dark:text-slate-400">No campaigns found</p>
            </div>
          ) : viewMode === "grid" ? (
            /* Grid View - Similar to Asset Generator Cards */
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {filteredCampaigns?.map((campaign) => {
                const assetType = campaign.assetType as keyof typeof ASSET_TYPE_ICONS | undefined;
                const Icon = assetType ? ASSET_TYPE_ICONS[assetType] : Zap;
                const color = assetType ? ASSET_TYPE_COLORS[assetType] : "#f59e0b";

                return (
                  <button
                    key={campaign._id}
                    onClick={() => setSelectedCampaign(campaign)}
                    className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition-all hover:border-amber-400 hover:shadow-lg dark:border-slate-700 dark:bg-[#161a24] dark:hover:border-amber-600 text-left"
                  >
                    <div className="relative aspect-[4/3] w-full bg-slate-100 dark:bg-[#1f2533]">
                      {campaign.assetThumbnail ? (
                        <img
                          src={campaign.assetThumbnail}
                          alt={campaign.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Icon className="h-8 w-8 opacity-30" style={{ color }} />
                        </div>
                      )}
                      {/* Asset Type Badge */}
                      <div
                        className="absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: color }}
                      >
                        <Icon className="h-3 w-3" />
                      </div>
                      {/* Status Badge */}
                      <div className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold ${
                        campaign.status === "active"
                          ? "bg-green-500 text-white"
                          : campaign.status === "completed"
                          ? "bg-blue-500 text-white"
                          : campaign.status === "pending_payment"
                          ? "bg-amber-500 text-white"
                          : "bg-slate-500 text-white"
                      }`}>
                        {campaign.status === "active" ? "Active" : campaign.status === "completed" ? "Done" : campaign.status === "pending_payment" ? "Pending" : campaign.status.charAt(0).toUpperCase()}
                      </div>
                      {/* Hover Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                        <div className="scale-0 rounded-full bg-white p-3 transition-transform group-hover:scale-100">
                          <Zap className="h-5 w-5 text-amber-500" />
                        </div>
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                        {campaign.name}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {campaign.userName}
                      </p>
                      <div className="flex items-center justify-between mt-2 text-xs">
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          {formatCurrency(campaign.budgetCents)}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {campaign.impressions.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* List View - Original Card Layout */
            <div className="space-y-4">
              {filteredCampaigns?.map((campaign) => (
                <div
                  key={campaign._id}
                  onClick={() => setSelectedCampaign(campaign)}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 hover:shadow-md transition-shadow cursor-pointer"
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
                              onClick={(e) => e.stopPropagation()}
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
              ))}
            </div>
          )}

          {/* Campaign Detail Modal */}
          {selectedCampaign && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-500" />
                    {selectedCampaign.name}
                  </h2>
                  <button
                    onClick={() => setSelectedCampaign(null)}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  {/* Asset Preview */}
                  <div className="aspect-video w-full rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                    {selectedCampaign.assetThumbnail ? (
                      <img
                        src={selectedCampaign.assetThumbnail}
                        alt={selectedCampaign.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Zap className="h-16 w-16 text-slate-300" />
                      </div>
                    )}
                  </div>

                  {/* Status & Type Row */}
                  <div className="flex flex-wrap gap-2">
                    {getStatusBadge(selectedCampaign.status, selectedCampaign.paymentStatus || undefined)}
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      {getAssetIcon(selectedCampaign.assetType || undefined)}
                      {selectedCampaign.assetType || "Unknown"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                      {selectedCampaign.platform || "All Platforms"}
                    </span>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-xs text-green-600 dark:text-green-400 mb-1">
                        <DollarSign className="h-3 w-3" />
                        Budget
                      </div>
                      <div className="text-xl font-bold text-green-700 dark:text-green-400">
                        {formatCurrency(selectedCampaign.budgetCents)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-xs text-blue-600 dark:text-blue-400 mb-1">
                        <DollarSign className="h-3 w-3" />
                        Spent
                      </div>
                      <div className="text-xl font-bold text-blue-700 dark:text-blue-400">
                        {formatCurrency(selectedCampaign.spentCents)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-purple-50 dark:bg-purple-900/20 p-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-xs text-purple-600 dark:text-purple-400 mb-1">
                        <Eye className="h-3 w-3" />
                        Impressions
                      </div>
                      <div className="text-xl font-bold text-purple-700 dark:text-purple-400">
                        {selectedCampaign.impressions.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-xs text-amber-600 dark:text-amber-400 mb-1">
                        <MousePointer className="h-3 w-3" />
                        Clicks
                      </div>
                      <div className="text-xl font-bold text-amber-700 dark:text-amber-400">
                        {selectedCampaign.clicks.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* User Info */}
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                    <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">Created By</div>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">
                          {selectedCampaign.profileName || selectedCampaign.userName}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {selectedCampaign.userEmail}
                          {selectedCampaign.profileSlug && ` - @${selectedCampaign.profileSlug}`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Duration & Dates */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                      <div className="text-sm text-slate-500 dark:text-slate-400">Duration</div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        {selectedCampaign.durationDays || "—"} days
                        {selectedCampaign.status === "active" && selectedCampaign.daysRemaining !== null && (
                          <span className="text-amber-600 dark:text-amber-400 text-sm ml-2">
                            ({selectedCampaign.daysRemaining} left)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                      <div className="text-sm text-slate-500 dark:text-slate-400">Created</div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        {formatDate(selectedCampaign.createdAt)}
                      </div>
                    </div>
                  </div>

                  {/* Film Info */}
                  {selectedCampaign.filmName && (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                      <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Film</div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        {selectedCampaign.filmName}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
