"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import Link from "next/link";
import {
  BarChart3,
  ChevronLeft,
  Filter,
  Search,
  Users,
  Eye,
  Play,
  Mail,
  MessageSquare,
  MapPin,
  Film,
  Video,
  Loader2,
  X,
  UserCircle,
  FileVideo,
  TrendingUp,
  Activity,
  UserCheck,
  Inbox,
  Share2,
  MousePointer,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  PieChart as PieChartIcon,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from "recharts";

type FilmCountFilter = "one" | "multiple" | undefined;
type TabType = "overview" | "engagement" | "emails" | "pages" | "events";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#22c55e", "#14b8a6"];

export default function AdminAnalyticsPage() {
  const [daysBack, setDaysBack] = useState(30);
  const [cityFilter, setCityFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [hasTrailerFilter, setHasTrailerFilter] = useState<boolean | undefined>(undefined);
  const [filmCountFilter, setFilmCountFilter] = useState<FilmCountFilter>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<Id<"actor_profiles"> | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const searchRef = useRef<HTMLDivElement>(null);

  // Fetch site-wide stats
  const siteStats = useQuery(api.analytics.getSiteWideStatsAdmin, {});

  // Fetch daily trends
  const dailyTrends = useQuery(api.analytics.getDailyTrendsAdmin, { daysBack });

  // Fetch event types breakdown
  const eventBreakdown = useQuery(api.analytics.getEventTypesBreakdownAdmin, { daysBack });

  // Fetch engagement levels
  const engagementLevels = useQuery(api.analytics.getUserEngagementLevelsAdmin, { daysBack });

  // Fetch fan email analytics
  const fanEmailAnalytics = useQuery(api.analytics.getFanEmailAnalyticsAdmin, { daysBack });

  // Fetch page-by-page analytics
  const pageAnalytics = useQuery(api.analytics.getPageByPageAnalyticsAdmin, { daysBack });

  // Fetch analytics with filters (existing)
  const analytics = useQuery(api.analytics.getDeepAnalyticsAdmin, {
    daysBack,
    city: cityFilter || undefined,
    state: stateFilter || undefined,
    country: countryFilter || undefined,
    hasTrailer: hasTrailerFilter,
    filmCount: filmCountFilter,
  });

  // Fetch search results
  const searchResults = useQuery(
    api.analytics.searchUsersAndFilmsAdmin,
    searchQuery.length >= 2 ? { query: searchQuery } : "skip"
  );

  // Fetch profile detail when selected
  const profileDetail = useQuery(
    api.analytics.getProfileAnalyticsAdmin,
    selectedProfileId ? { profileId: selectedProfileId, daysBack } : "skip"
  );

  // Handle click outside search dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isLoading = siteStats === undefined;

  const clearFilters = () => {
    setCityFilter("");
    setStateFilter("");
    setCountryFilter("");
    setHasTrailerFilter(undefined);
    setFilmCountFilter(undefined);
  };

  const hasActiveFilters = cityFilter || stateFilter || countryFilter || hasTrailerFilter !== undefined || filmCountFilter;

  // Tab content
  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <BarChart3 className="h-4 w-4" /> },
    { key: "engagement", label: "Engagement", icon: <Activity className="h-4 w-4" /> },
    { key: "emails", label: "Fan Emails", icon: <Mail className="h-4 w-4" /> },
    { key: "pages", label: "Pages", icon: <Eye className="h-4 w-4" /> },
    { key: "events", label: "Events", icon: <MousePointer className="h-4 w-4" /> },
  ];

  // Format event type for display
  const formatEventType = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Engagement level colors
  const engagementColors = {
    high: "#22c55e",
    medium: "#eab308",
    low: "#f97316",
    inactive: "#94a3b8",
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
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
                <BarChart3 className="h-6 w-6" />
              </div>
              Deep Analytics
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              Comprehensive platform analytics and insights
            </p>
          </div>

          {/* Search Bar */}
          <div ref={searchRef} className="relative w-full lg:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchDropdown(e.target.value.length >= 2);
              }}
              onFocus={() => setShowSearchDropdown(searchQuery.length >= 2)}
              placeholder="Search users or films..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500"
            />

            {/* Search Dropdown */}
            {showSearchDropdown && searchResults && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-xl z-50 dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
                {searchResults.users.length === 0 && searchResults.films.length === 0 && searchResults.profiles?.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 dark:text-slate-400">
                    No results found
                  </div>
                ) : (
                  <>
                    {searchResults.users.length > 0 && (
                      <div className="p-2">
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2 py-1">
                          Users
                        </div>
                        {searchResults.users.map((user) => (
                          <button
                            key={user._id}
                            onClick={() => {
                              setShowSearchDropdown(false);
                              setSearchQuery(user.name || "");
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
                          >
                            <UserCircle className="h-5 w-5 text-slate-400" />
                            <div>
                              <div className="text-sm font-medium text-slate-900 dark:text-white">
                                {user.name}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {user.email}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults.profiles && searchResults.profiles.length > 0 && (
                      <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2 py-1">
                          Profiles
                        </div>
                        {searchResults.profiles.map((profile) => (
                          <button
                            key={profile._id}
                            onClick={() => {
                              setSelectedProfileId(profile._id as Id<"actor_profiles">);
                              setShowSearchDropdown(false);
                              setSearchQuery(profile.displayName);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
                          >
                            <Users className="h-5 w-5 text-indigo-500" />
                            <div>
                              <div className="text-sm font-medium text-slate-900 dark:text-white">
                                {profile.displayName}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                @{profile.slug} - {profile.userName}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults.films.length > 0 && (
                      <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2 py-1">
                          Films
                        </div>
                        {searchResults.films.map((film) => (
                          <button
                            key={film._id}
                            onClick={() => {
                              setShowSearchDropdown(false);
                              setSearchQuery(film.title);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
                          >
                            <FileVideo className="h-5 w-5 text-purple-500" />
                            <div>
                              <div className="text-sm font-medium text-slate-900 dark:text-white">
                                {film.title}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                by {film.profileName}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Profile Detail Modal */}
      {selectedProfileId && profileDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {profileDetail.profile.displayName}
              </h2>
              <button
                onClick={() => setSelectedProfileId(null)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Profile</div>
                  <div className="font-medium text-slate-900 dark:text-white">@{profileDetail.profile.slug}</div>
                  {profileDetail.profile.location && (
                    <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      <MapPin className="h-3 w-3 inline mr-1" />
                      {profileDetail.profile.location}
                    </div>
                  )}
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                  <div className="text-sm text-slate-500 dark:text-slate-400">User</div>
                  <div className="font-medium text-slate-900 dark:text-white">{profileDetail.user.name}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">{profileDetail.user.email}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {profileDetail.metrics.pageViews}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Page Views</div>
                </div>
                <div className="text-center p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {profileDetail.metrics.clipPlays}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Clip Plays</div>
                </div>
                <div className="text-center p-4 rounded-xl bg-green-50 dark:bg-green-900/20">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {profileDetail.metrics.inquiries}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Inquiries</div>
                </div>
              </div>
              {profileDetail.projects.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Films ({profileDetail.projects.length})</h3>
                  <div className="space-y-2">
                    {profileDetail.projects.map((project) => (
                      <div key={project._id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                        {project.posterUrl ? (
                          <img src={project.posterUrl} alt={project.title} className="w-10 h-14 rounded object-cover" />
                        ) : (
                          <div className="w-10 h-14 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                            <Film className="h-5 w-5 text-slate-400" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">{project.title}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {project.hasTrailer ? "Has trailer" : "No trailer"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Time Range & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Time Range Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500 dark:text-slate-400">Time Range:</span>
          <select
            value={daysBack}
            onChange={(e) => setDaysBack(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <StatCard
                  label="Total Users"
                  value={siteStats?.users.total ?? 0}
                  subValue={`+${siteStats?.users.thisMonth ?? 0} this month`}
                  icon={<Users className="h-5 w-5 text-indigo-500" />}
                  color="indigo"
                />
                <StatCard
                  label="Active Accounts"
                  value={siteStats?.users.activeAccounts ?? 0}
                  subValue="In last 30 days"
                  icon={<UserCheck className="h-5 w-5 text-green-500" />}
                  color="green"
                />
                <StatCard
                  label="Profiles"
                  value={siteStats?.profiles.total ?? 0}
                  subValue={`+${siteStats?.profiles.thisMonth ?? 0} this month`}
                  icon={<UserCircle className="h-5 w-5 text-purple-500" />}
                  color="purple"
                />
                <StatCard
                  label="Fan Emails"
                  value={siteStats?.fanEmails.total ?? 0}
                  subValue={`${siteStats?.fanEmails.active ?? 0} active`}
                  icon={<Mail className="h-5 w-5 text-blue-500" />}
                  color="blue"
                />
                <StatCard
                  label="Total Events"
                  value={siteStats?.events.total ?? 0}
                  subValue={`${siteStats?.events.thisMonth ?? 0} this month`}
                  icon={<Activity className="h-5 w-5 text-amber-500" />}
                  color="amber"
                />
                <StatCard
                  label="Inquiries"
                  value={siteStats?.bookingInquiries.total ?? 0}
                  subValue={`+${siteStats?.bookingInquiries.thisMonth ?? 0} this month`}
                  icon={<Inbox className="h-5 w-5 text-rose-500" />}
                  color="rose"
                />
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Daily Activity Trend */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-indigo-500" />
                    Daily Activity Trend
                  </h3>
                  {dailyTrends?.trends && (
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={dailyTrends.trends}>
                        <defs>
                          <linearGradient id="pageViewGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="clipPlayedGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 12 }}
                          tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1e293b",
                            border: "none",
                            borderRadius: "8px",
                            color: "#fff",
                          }}
                          labelFormatter={(value) => new Date(value).toLocaleDateString()}
                        />
                        <Area
                          type="monotone"
                          dataKey="page_view"
                          stroke="#6366f1"
                          fill="url(#pageViewGradient)"
                          strokeWidth={2}
                          name="Page Views"
                        />
                        <Area
                          type="monotone"
                          dataKey="clip_played"
                          stroke="#22c55e"
                          fill="url(#clipPlayedGradient)"
                          strokeWidth={2}
                          name="Clip Plays"
                        />
                        <Legend />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Event Types Breakdown */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <PieChartIcon className="h-5 w-5 text-purple-500" />
                    Event Types Breakdown
                  </h3>
                  {eventBreakdown?.breakdown && (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={eventBreakdown.breakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          fill="#8884d8"
                          paddingAngle={2}
                          dataKey="count"
                          nameKey="type"
                          label={({ type, percent }) => `${formatEventType(type)} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {eventBreakdown.breakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name) => [value, formatEventType(name as string)]}
                          contentStyle={{
                            backgroundColor: "#1e293b",
                            border: "none",
                            borderRadius: "8px",
                            color: "#fff",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Content Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-6 border border-indigo-100 dark:border-indigo-900/50">
                  <div className="flex items-center justify-between mb-4">
                    <Film className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                      {siteStats?.content.projects ?? 0}
                    </span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-300 font-medium">Total Projects</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {siteStats?.content.projectsWithTrailer ?? 0} with trailers
                  </div>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-6 border border-green-100 dark:border-green-900/50">
                  <div className="flex items-center justify-between mb-4">
                    <Video className="h-8 w-8 text-green-600 dark:text-green-400" />
                    <span className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {siteStats?.content.clips ?? 0}
                    </span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-300 font-medium">Total Clips</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Uploaded by users</div>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-6 border border-amber-100 dark:border-amber-900/50">
                  <div className="flex items-center justify-between mb-4">
                    <MessageSquare className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                    <span className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                      {siteStats?.bookingInquiries.total ?? 0}
                    </span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-300 font-medium">Booking Inquiries</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    +{siteStats?.bookingInquiries.thisWeek ?? 0} this week
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ENGAGEMENT TAB */}
          {activeTab === "engagement" && engagementLevels && (
            <div className="space-y-6">
              {/* Engagement Level Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                    Engagement Level Distribution
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "High", value: engagementLevels.levelCounts.high, color: engagementColors.high },
                          { name: "Medium", value: engagementLevels.levelCounts.medium, color: engagementColors.medium },
                          { name: "Low", value: engagementLevels.levelCounts.low, color: engagementColors.low },
                          { name: "Inactive", value: engagementLevels.levelCounts.inactive, color: engagementColors.inactive },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {[
                          { name: "High", value: engagementLevels.levelCounts.high, color: engagementColors.high },
                          { name: "Medium", value: engagementLevels.levelCounts.medium, color: engagementColors.medium },
                          { name: "Low", value: engagementLevels.levelCounts.low, color: engagementColors.low },
                          { name: "Inactive", value: engagementLevels.levelCounts.inactive, color: engagementColors.inactive },
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Engagement Level Summary Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-4 border border-green-100 dark:border-green-900/50">
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {engagementLevels.levelCounts.high}
                    </div>
                    <div className="text-slate-700 dark:text-slate-300 font-medium">High Engagement</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Score ≥ 100</div>
                  </div>
                  <div className="rounded-xl bg-yellow-50 dark:bg-yellow-900/20 p-4 border border-yellow-100 dark:border-yellow-900/50">
                    <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                      {engagementLevels.levelCounts.medium}
                    </div>
                    <div className="text-slate-700 dark:text-slate-300 font-medium">Medium Engagement</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Score 20-99</div>
                  </div>
                  <div className="rounded-xl bg-orange-50 dark:bg-orange-900/20 p-4 border border-orange-100 dark:border-orange-900/50">
                    <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                      {engagementLevels.levelCounts.low}
                    </div>
                    <div className="text-slate-700 dark:text-slate-300 font-medium">Low Engagement</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Score 1-19</div>
                  </div>
                  <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-4 border border-slate-200 dark:border-slate-700">
                    <div className="text-3xl font-bold text-slate-600 dark:text-slate-400">
                      {engagementLevels.levelCounts.inactive}
                    </div>
                    <div className="text-slate-700 dark:text-slate-300 font-medium">Inactive</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Score = 0</div>
                  </div>
                </div>
              </div>

              {/* Top Engaged Profiles */}
              <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Top Engaged Profiles
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Profile
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Score
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Page Views
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Clip Plays
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Emails
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Level
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {engagementLevels.topEngaged.map((profile) => (
                        <tr key={profile.profileId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 dark:text-white">{profile.displayName}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">@{profile.slug}</div>
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-900 dark:text-white">
                            {profile.engagementScore}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">
                            {profile.pageViews}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">
                            {profile.clipPlays}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">
                            {profile.totalFanEmails}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                profile.engagementLevel === "high"
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  : profile.engagementLevel === "medium"
                                  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                  : profile.engagementLevel === "low"
                                  ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                              }`}
                            >
                              {profile.engagementLevel.charAt(0).toUpperCase() + profile.engagementLevel.slice(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* FAN EMAILS TAB */}
          {activeTab === "emails" && fanEmailAnalytics && (
            <div className="space-y-6">
              {/* Email Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Total Emails"
                  value={fanEmailAnalytics.totals.total}
                  icon={<Mail className="h-5 w-5 text-blue-500" />}
                  color="blue"
                />
                <StatCard
                  label="Active Subscribers"
                  value={fanEmailAnalytics.totals.active}
                  subValue={`${Math.round((fanEmailAnalytics.totals.active / Math.max(fanEmailAnalytics.totals.total, 1)) * 100)}% of total`}
                  icon={<UserCheck className="h-5 w-5 text-green-500" />}
                  color="green"
                />
                <StatCard
                  label="Unsubscribed"
                  value={fanEmailAnalytics.totals.unsubscribed}
                  icon={<X className="h-5 w-5 text-red-500" />}
                  color="red"
                />
                <StatCard
                  label="Recent Signups"
                  value={fanEmailAnalytics.totals.recentSignups}
                  subValue={`Last ${daysBack} days`}
                  icon={<TrendingUp className="h-5 w-5 text-purple-500" />}
                  color="purple"
                />
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Daily Email Signups */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                    Daily Email Signups
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={fanEmailAnalytics.dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1e293b",
                          border: "none",
                          borderRadius: "8px",
                          color: "#fff",
                        }}
                        labelFormatter={(value) => new Date(value).toLocaleDateString()}
                      />
                      <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Signups" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Source Breakdown */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                    Signup Sources
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={Object.entries(fanEmailAnalytics.sourceBreakdown).map(([source, count]) => ({
                          name: source,
                          value: count,
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {Object.entries(fanEmailAnalytics.sourceBreakdown).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Profiles by Email Count */}
              <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Top Profiles by Email Count
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Profile
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Total
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Active
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Unsubscribed
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {fanEmailAnalytics.byProfile.map((profile) => (
                        <tr key={profile.profileId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 dark:text-white">{profile.profileName}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">@{profile.slug}</div>
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-900 dark:text-white">
                            {profile.count}
                          </td>
                          <td className="px-4 py-3 text-center text-green-600 dark:text-green-400">
                            {profile.active}
                          </td>
                          <td className="px-4 py-3 text-center text-red-600 dark:text-red-400">
                            {profile.unsubscribed}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* PAGES TAB */}
          {activeTab === "pages" && pageAnalytics && (
            <div className="space-y-6">
              {/* Page Stats Summary */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <StatCard
                  label="Total Page Views"
                  value={pageAnalytics.totals.pageViews}
                  icon={<Eye className="h-5 w-5 text-indigo-500" />}
                  color="indigo"
                />
                <StatCard
                  label="Unique Visitors"
                  value={pageAnalytics.totals.uniqueVisitors}
                  icon={<Users className="h-5 w-5 text-purple-500" />}
                  color="purple"
                />
                <StatCard
                  label="Clip Plays"
                  value={pageAnalytics.totals.clipPlays}
                  icon={<Play className="h-5 w-5 text-green-500" />}
                  color="green"
                />
                <StatCard
                  label="Email Captures"
                  value={pageAnalytics.totals.emailCaptures}
                  icon={<Mail className="h-5 w-5 text-blue-500" />}
                  color="blue"
                />
                <StatCard
                  label="Inquiries"
                  value={pageAnalytics.totals.inquiries}
                  icon={<MessageSquare className="h-5 w-5 text-amber-500" />}
                  color="amber"
                />
                <StatCard
                  label="Total Fan Emails"
                  value={pageAnalytics.totals.totalFanEmails}
                  icon={<Inbox className="h-5 w-5 text-rose-500" />}
                  color="rose"
                />
              </div>

              {/* Page by Page Table */}
              <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Page by Page Analytics ({pageAnalytics.pages.length} profiles)
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Profile
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Views
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Visitors
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Plays
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Emails
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Conv. Rate
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Projects
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {pageAnalytics.pages.map((page) => (
                        <tr key={page.profileId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectedProfileId(page.profileId as Id<"actor_profiles">)}
                              className="text-left hover:text-indigo-600 dark:hover:text-indigo-400"
                            >
                              <div className="font-medium text-slate-900 dark:text-white">{page.displayName}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                @{page.slug} • {page.ownerEmail}
                              </div>
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center font-medium text-slate-900 dark:text-white">
                            {page.pageViews}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">
                            {page.uniqueVisitors}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">
                            {page.clipPlays}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="text-slate-900 dark:text-white">{page.totalFanEmails}</div>
                            <div className="text-xs text-green-600 dark:text-green-400">{page.activeFanEmails} active</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-medium ${page.conversionRate >= 5 ? "text-green-600" : page.conversionRate >= 1 ? "text-amber-600" : "text-slate-500"}`}>
                              {page.conversionRate}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">
                            {page.projectCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* EVENTS TAB */}
          {activeTab === "events" && eventBreakdown && (
            <div className="space-y-6">
              {/* Event Type Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {eventBreakdown.breakdown.slice(0, 8).map((event, index) => (
                  <div
                    key={event.type}
                    className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {formatEventType(event.type)}
                      </span>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                      {event.count.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {((event.count / eventBreakdown.total) * 100).toFixed(1)}% of total
                    </div>
                  </div>
                ))}
              </div>

              {/* Event Distribution Bar Chart */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  Event Distribution
                </h3>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={eventBreakdown.breakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis
                      dataKey="type"
                      type="category"
                      tick={{ fontSize: 12 }}
                      tickFormatter={formatEventType}
                      width={120}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1e293b",
                        border: "none",
                        borderRadius: "8px",
                        color: "#fff",
                      }}
                      formatter={(value, name) => [value, formatEventType(name as string)]}
                    />
                    <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]}>
                      {eventBreakdown.breakdown.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  subValue,
  icon,
  color,
}: {
  label: string;
  value: number;
  subValue?: string;
  icon: React.ReactNode;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    indigo: "border-indigo-200 dark:border-indigo-900/50",
    green: "border-green-200 dark:border-green-900/50",
    purple: "border-purple-200 dark:border-purple-900/50",
    blue: "border-blue-200 dark:border-blue-900/50",
    amber: "border-amber-200 dark:border-amber-900/50",
    rose: "border-rose-200 dark:border-rose-900/50",
    red: "border-red-200 dark:border-red-900/50",
  };

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-900 ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white">
        {value.toLocaleString()}
      </div>
      {subValue && (
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subValue}</div>
      )}
    </div>
  );
}
