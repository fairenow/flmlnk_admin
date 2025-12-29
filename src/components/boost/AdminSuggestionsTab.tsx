"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Sparkles,
  Zap,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  TrendingUp,
  PlayCircle,
  Image,
  Film,
  CheckCircle,
  XCircle,
} from "lucide-react";

export function AdminSuggestionsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedSuggestion, setSelectedSuggestion] = useState<Id<"admin_boost_suggestions"> | null>(null);
  const [boostBudget, setBoostBudget] = useState(2500); // $25 default
  const [boostDuration, setBoostDuration] = useState(7);

  const suggestions = useQuery(api.adminBoost.getBoostSuggestions, {
    status: statusFilter,
    limit: 30,
  });

  const reviewSuggestion = useMutation(api.adminBoost.reviewBoostSuggestion);
  const createBoost = useMutation(api.adminBoost.createBoostFromSuggestion);

  const handleApprove = async (suggestionId: Id<"admin_boost_suggestions">) => {
    await reviewSuggestion({
      suggestionId,
      action: "approved",
    });
  };

  const handleReject = async (
    suggestionId: Id<"admin_boost_suggestions">,
    reason: string
  ) => {
    await reviewSuggestion({
      suggestionId,
      action: "rejected",
      rejectionReason: reason,
    });
  };

  const handleCreateBoost = async () => {
    if (!selectedSuggestion) return;
    await createBoost({
      suggestionId: selectedSuggestion,
      budgetCents: boostBudget,
      durationDays: boostDuration,
    });
    setSelectedSuggestion(null);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "clip":
        return <PlayCircle className="h-4 w-4" />;
      case "meme":
        return <Image className="h-4 w-4" />;
      case "gif":
        return <Film className="h-4 w-4" />;
      default:
        return <Sparkles className="h-4 w-4" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30";
    if (score >= 60) return "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30";
    return "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800";
  };

  if (!suggestions) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2">
        {["pending", "approved", "rejected", "boosted"].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize transition-all ${
              statusFilter === status
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Suggestions List */}
      {suggestions.length === 0 ? (
        <div className="text-center py-12">
          <Sparkles className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">
            No {statusFilter} suggestions
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion._id}
              className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
            >
              {/* Thumbnail */}
              <div className="w-20 h-20 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {suggestion.assetThumbnail ? (
                  <img
                    src={suggestion.assetThumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  getTypeIcon(suggestion.assetType)
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    suggestion.assetType === "clip" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                    suggestion.assetType === "meme" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
                    "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400"
                  }`}>
                    {getTypeIcon(suggestion.assetType)}
                    {suggestion.assetType}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${getScoreColor(suggestion.score)}`}>
                    <TrendingUp className="h-3 w-3" />
                    {suggestion.score}
                  </span>
                </div>

                <h4 className="font-medium text-slate-900 dark:text-white truncate">
                  {suggestion.assetTitle || "Untitled Asset"}
                </h4>

                <div className="flex items-center gap-2 mt-1 text-sm text-slate-500 dark:text-slate-400">
                  <span>{suggestion.profileName}</span>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  <span>{suggestion.userName}</span>
                </div>

                {suggestion.reason && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                    {suggestion.reason}
                  </p>
                )}

                {suggestion.status !== "pending" && (
                  <div className="mt-2 flex items-center gap-1 text-xs">
                    {suggestion.status === "approved" && (
                      <>
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        <span className="text-green-600 dark:text-green-400">Approved</span>
                      </>
                    )}
                    {suggestion.status === "rejected" && (
                      <>
                        <XCircle className="h-3 w-3 text-red-500" />
                        <span className="text-red-600 dark:text-red-400">Rejected</span>
                      </>
                    )}
                    {suggestion.status === "boosted" && (
                      <>
                        <Zap className="h-3 w-3 text-amber-500" />
                        <span className="text-amber-600 dark:text-amber-400">Boosted</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              {suggestion.status === "pending" && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleApprove(suggestion._id)}
                    className="p-2 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 transition-colors"
                    title="Approve"
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleReject(suggestion._id, "Not suitable for boost")}
                    className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 transition-colors"
                    title="Reject"
                  >
                    <ThumbsDown className="h-4 w-4" />
                  </button>
                </div>
              )}

              {suggestion.status === "approved" && (
                <div className="flex-shrink-0">
                  <button
                    onClick={() => setSelectedSuggestion(suggestion._id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 transition-colors"
                  >
                    <Zap className="h-4 w-4" />
                    Create Boost
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Boost Creation Modal */}
      {selectedSuggestion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Create Boost from Suggestion
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Budget
                </label>
                <select
                  value={boostBudget}
                  onChange={(e) => setBoostBudget(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
                >
                  <option value={1000}>$10</option>
                  <option value={2500}>$25</option>
                  <option value={5000}>$50</option>
                  <option value={10000}>$100</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Duration
                </label>
                <select
                  value={boostDuration}
                  onChange={(e) => setBoostDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
                >
                  <option value={3}>3 days</option>
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setSelectedSuggestion(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBoost}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600"
              >
                <Zap className="h-4 w-4" />
                Create Boost
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
