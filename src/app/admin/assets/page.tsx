"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import Link from "next/link";
import {
  Image as ImageIcon,
  ChevronLeft,
  Filter,
  Search,
  PlayCircle,
  Sparkles,
  Film,
  Zap,
  Loader2,
  X,
  TrendingUp,
  Calendar,
  Users,
  ArrowUpDown,
} from "lucide-react";

type AssetType = "all" | "clip" | "meme" | "gif";
type SortBy = "recent" | "score" | "viral";

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

export default function AdminAssetsPage() {
  const [assetType, setAssetType] = useState<AssetType>("all");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch assets
  const assets = useQuery(api.analytics.getAllAssetsAdmin, {
    assetType: assetType === "all" ? undefined : assetType,
    userId: selectedUserId ?? undefined,
    sortBy,
    limit: 100,
  });

  // Fetch summary stats
  const summary = useQuery(api.analytics.getAssetSummaryAdmin, {});

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

  const isLoading = assets === undefined || summary === undefined;

  // Filter assets by search query
  const filteredAssets = assets?.filter((asset) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      asset.title.toLowerCase().includes(query) ||
      asset.profileName?.toLowerCase().includes(query) ||
      asset.userName?.toLowerCase().includes(query)
    );
  });

  const selectedUser = users?.find((u) => u._id === selectedUserId);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
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
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 text-white shadow-lg">
                <ImageIcon className="h-6 w-6" />
              </div>
              All Assets
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              View all clips, memes, and GIFs across all users
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative w-full lg:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search assets, users..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500"
            />
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <div className="rounded-2xl border border-purple-200 bg-white p-4 shadow-sm dark:border-purple-900/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <ImageIcon className="h-5 w-5 text-purple-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Total Assets</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {summary?.totalAssets.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <PlayCircle className="h-5 w-5 text-red-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Clips</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {summary?.totalClips.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-white p-4 shadow-sm dark:border-orange-900/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-orange-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Memes</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {summary?.totalMemes.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm dark:border-indigo-900/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <Film className="h-5 w-5 text-indigo-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">GIFs</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {summary?.totalGifs.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm dark:border-amber-900/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-5 w-5 text-amber-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Boosted</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {summary?.activeBoostedCount.toLocaleString() ?? 0}
              </div>
            </div>
          </div>

          {/* Period Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
                <Calendar className="h-4 w-4" />
                Today
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                {summary?.assetsToday.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
                <TrendingUp className="h-4 w-4" />
                This Week
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                {summary?.assetsWeek.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
                <Users className="h-4 w-4" />
                Unique Profiles
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                {summary?.uniqueProfiles.toLocaleString() ?? 0}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-6 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-4">
              {/* Asset Type Filter */}
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600 dark:text-slate-400">Type:</span>
                <div className="flex gap-2">
                  {(["all", "clip", "meme", "gif"] as AssetType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setAssetType(type)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        assetType === type
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                      }`}
                    >
                      {type === "all" ? "All" : type.charAt(0).toUpperCase() + type.slice(1) + "s"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort By */}
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600 dark:text-slate-400">Sort:</span>
                <div className="flex gap-2">
                  {([
                    { value: "recent", label: "Recent" },
                    { value: "score", label: "Score" },
                    { value: "viral", label: "Viral" },
                  ] as { value: SortBy; label: string }[]).map((sort) => (
                    <button
                      key={sort.value}
                      onClick={() => setSortBy(sort.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        sortBy === sort.value
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                      }`}
                    >
                      {sort.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* User Filter */}
              <div ref={userDropdownRef} className="relative">
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedUserId
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
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
                      className="ml-1 p-0.5 rounded hover:bg-purple-200 dark:hover:bg-purple-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </button>

                {showUserDropdown && users && (
                  <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl border border-slate-200 shadow-xl z-50 dark:bg-slate-900 dark:border-slate-700 max-h-60 overflow-y-auto">
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

          {/* Asset Grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredAssets?.length === 0 ? (
              <div className="col-span-full text-center py-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                <ImageIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                <p className="text-slate-500 dark:text-slate-400">No assets found</p>
              </div>
            ) : (
              filteredAssets?.map((asset) => {
                const Icon = ASSET_TYPE_ICONS[asset.type];
                const color = ASSET_TYPE_COLORS[asset.type];
                const score = asset.score ?? asset.viralScore;

                return (
                  <button
                    key={asset._id}
                    onClick={() => setSelectedAsset(asset)}
                    className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition-all hover:border-purple-400 hover:shadow-lg dark:border-slate-700 dark:bg-[#161a24] dark:hover:border-purple-600 text-left"
                  >
                    <div className="relative aspect-[4/3] w-full bg-slate-100 dark:bg-[#1f2533]">
                      {asset.thumbnailUrl ? (
                        <img
                          src={asset.thumbnailUrl}
                          alt={asset.title}
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
                      {/* Score Badge */}
                      {score !== undefined && score > 0 && (
                        <div className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white">
                          {score}
                        </div>
                      )}
                      {/* Boosted Badge */}
                      {asset.boosted && (
                        <div className="absolute right-2 bottom-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                        </div>
                      )}
                      {/* Hover Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                        <div className="scale-0 rounded-full bg-white p-3 transition-transform group-hover:scale-100">
                          <Search className="h-5 w-5 text-purple-500" />
                        </div>
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                        {asset.title}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {asset.profileName || asset.userName}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Asset Detail Modal */}
          {selectedAsset && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    {(() => {
                      const Icon = ASSET_TYPE_ICONS[selectedAsset.type as keyof typeof ASSET_TYPE_ICONS];
                      const color = ASSET_TYPE_COLORS[selectedAsset.type as keyof typeof ASSET_TYPE_COLORS];
                      return <Icon className="h-5 w-5" style={{ color }} />;
                    })()}
                    {selectedAsset.title}
                  </h2>
                  <button
                    onClick={() => setSelectedAsset(null)}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  {/* Asset Preview */}
                  <div className="aspect-video w-full rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                    {selectedAsset.thumbnailUrl ? (
                      <img
                        src={selectedAsset.thumbnailUrl}
                        alt={selectedAsset.title}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        {(() => {
                          const Icon = ASSET_TYPE_ICONS[selectedAsset.type as keyof typeof ASSET_TYPE_ICONS];
                          return <Icon className="h-16 w-16 text-slate-300" />;
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Asset Info Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                      <div className="text-sm text-slate-500 dark:text-slate-400">Type</div>
                      <div className="font-medium text-slate-900 dark:text-white capitalize">
                        {selectedAsset.type}
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                      <div className="text-sm text-slate-500 dark:text-slate-400">Created</div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        {formatDate(selectedAsset.createdAt)}
                      </div>
                    </div>
                  </div>

                  {/* Score */}
                  {(selectedAsset.score || selectedAsset.viralScore) && (
                    <div className="rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 p-4">
                      <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">
                        {selectedAsset.type === "clip" ? "Score" : "Viral Score"}
                      </div>
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {selectedAsset.score ?? selectedAsset.viralScore}
                      </div>
                    </div>
                  )}

                  {/* User Info */}
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                    <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">Created By</div>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">
                          {selectedAsset.profileName || selectedAsset.userName}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {selectedAsset.userEmail}
                          {selectedAsset.profileSlug && ` - @${selectedAsset.profileSlug}`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Boost Status */}
                  {selectedAsset.boosted && (
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <div className="font-medium text-amber-700 dark:text-amber-400">
                          This asset is being boosted
                        </div>
                        <div className="text-sm text-amber-600 dark:text-amber-500">
                          Active promotion campaign
                        </div>
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
