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
  Share2,
  Mail,
  MessageSquare,
  MapPin,
  Film,
  Video,
  Loader2,
  X,
  UserCircle,
  FileVideo,
} from "lucide-react";

type FilmCountFilter = "one" | "multiple" | undefined;

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
  const searchRef = useRef<HTMLDivElement>(null);

  // Fetch analytics with filters
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

  const isLoading = analytics === undefined;

  const clearFilters = () => {
    setCityFilter("");
    setStateFilter("");
    setCountryFilter("");
    setHasTrailerFilter(undefined);
    setFilmCountFilter(undefined);
  };

  const hasActiveFilters = cityFilter || stateFilter || countryFilter || hasTrailerFilter !== undefined || filmCountFilter;

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
              Overview of analytics across all users
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
                    {/* Users */}
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

                    {/* Profiles */}
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

                    {/* Films */}
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

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Filters</span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {/* Time Range */}
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Time Range</label>
            <select
              value={daysBack}
              onChange={(e) => setDaysBack(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
          </div>

          {/* City Filter */}
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">City</label>
            <input
              type="text"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              placeholder="Any city"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* State Filter */}
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">State</label>
            <input
              type="text"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              placeholder="Any state"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Country Filter */}
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Country</label>
            <input
              type="text"
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              placeholder="Any country"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Trailer Filter */}
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Trailer</label>
            <select
              value={hasTrailerFilter === undefined ? "" : hasTrailerFilter.toString()}
              onChange={(e) => setHasTrailerFilter(e.target.value === "" ? undefined : e.target.value === "true")}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Any</option>
              <option value="true">Has trailer</option>
              <option value="false">No trailer</option>
            </select>
          </div>

          {/* Film Count Filter */}
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Films</label>
            <select
              value={filmCountFilter || ""}
              onChange={(e) => setFilmCountFilter(e.target.value as FilmCountFilter || undefined)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Any</option>
              <option value="one">One film</option>
              <option value="multiple">Multiple films</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <div className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm dark:border-indigo-900/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-5 w-5 text-indigo-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Profiles</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {analytics?.totalProfiles.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-purple-200 bg-white p-4 shadow-sm dark:border-purple-900/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="h-5 w-5 text-purple-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Page Views</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {analytics?.pageViews.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-green-200 bg-white p-4 shadow-sm dark:border-green-900/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <Play className="h-5 w-5 text-green-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Clip Plays</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {analytics?.clipPlays.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm dark:border-blue-900/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-5 w-5 text-blue-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Email Captures</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {analytics?.emailCaptures.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm dark:border-amber-900/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-5 w-5 text-amber-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Inquiries</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {analytics?.inquiries.toLocaleString() ?? 0}
              </div>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
              <div className="text-sm text-slate-500 dark:text-slate-400">Clip Shares</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                {analytics?.clipShares.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
              <div className="text-sm text-slate-500 dark:text-slate-400">Comments</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                {analytics?.comments.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
              <div className="text-sm text-slate-500 dark:text-slate-400">Unique Sessions</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                {analytics?.uniqueSessions.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
              <div className="text-sm text-slate-500 dark:text-slate-400">Total Events</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                {analytics?.totalEvents.toLocaleString() ?? 0}
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Users ({analytics?.users?.length ?? 0})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Films
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Trailer
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Visitors
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {analytics?.users?.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                        No users match the current filters
                      </td>
                    </tr>
                  ) : (
                    analytics?.users?.map((user) => (
                      <tr key={user.profileId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3">
                          <div>
                            <div className="font-medium text-slate-900 dark:text-white">{user.displayName}</div>
                            <div className="text-sm text-slate-500 dark:text-slate-400">
                              {user.userEmail} - @{user.slug}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                            {user.location ? (
                              <>
                                <MapPin className="h-3 w-3" />
                                {user.location}
                              </>
                            ) : (
                              "—"
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            <Film className="h-3 w-3" />
                            {user.filmCount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {user.hasTrailer ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              <Video className="h-3 w-3" />
                              Yes
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-500">
                              No
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-medium text-slate-900 dark:text-white">
                            {user.uniqueVisitors}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setSelectedProfileId(user.profileId)}
                            className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                          >
                            View details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
