"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Bell,
  Zap,
  Star,
  Eye,
  Flag,
  Loader2,
  PlayCircle,
  Image,
  Film,
  CheckCircle,
  Clock,
} from "lucide-react";

export function AdminSubmissionsTab() {
  const [showReviewed, setShowReviewed] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);

  const notifications = useQuery(api.adminBoost.getSubmissionNotifications, {
    reviewed: showReviewed,
    type: typeFilter,
    limit: 50,
  });

  const reviewNotification = useMutation(api.adminBoost.reviewSubmissionNotification);

  const handleAction = async (
    notificationId: Id<"admin_submission_notifications">,
    action: string
  ) => {
    await reviewNotification({
      notificationId,
      action,
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "clip":
        return <PlayCircle className="h-4 w-4" />;
      case "meme":
        return <Image className="h-4 w-4" />;
      case "gif":
        return <Film className="h-4 w-4" />;
      case "trailer":
        return <Film className="h-4 w-4" />;
      default:
        return <Star className="h-4 w-4" />;
    }
  };

  if (!notifications) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowReviewed(false)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              !showReviewed
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400"
            }`}
          >
            <span className="flex items-center gap-1">
              <Bell className="h-3 w-3" />
              New
            </span>
          </button>
          <button
            onClick={() => setShowReviewed(true)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              showReviewed
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400"
            }`}
          >
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Reviewed
            </span>
          </button>
        </div>

        <select
          value={typeFilter ?? ""}
          onChange={(e) => setTypeFilter(e.target.value || undefined)}
          className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="">All Types</option>
          <option value="clip">Clips</option>
          <option value="meme">Memes</option>
          <option value="gif">GIFs</option>
          <option value="trailer">Trailers</option>
        </select>
      </div>

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">
            {showReviewed ? "No reviewed submissions" : "No new submissions"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification._id}
              className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
            >
              {/* Thumbnail */}
              <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {notification.thumbnailUrl ? (
                  <img
                    src={notification.thumbnailUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  getTypeIcon(notification.type)
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    notification.type === "clip" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                    notification.type === "meme" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
                    notification.type === "gif" ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" :
                    "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                  }`}>
                    {getTypeIcon(notification.type)}
                    {notification.type}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(notification.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <h4 className="font-medium text-slate-900 dark:text-white truncate">
                  {notification.title || "Untitled"}
                </h4>

                <div className="flex items-center gap-2 mt-1 text-sm text-slate-500 dark:text-slate-400">
                  <span>{notification.profileName}</span>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  <span>{notification.userEmail}</span>
                </div>

                {notification.reviewed && notification.action && (
                  <div className="mt-2 flex items-center gap-1 text-xs">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-green-600 dark:text-green-400">
                      {notification.action}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              {!notification.reviewed && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleAction(notification._id, "boosted")}
                    className="p-2 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 transition-colors"
                    title="Boost"
                  >
                    <Zap className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleAction(notification._id, "featured")}
                    className="p-2 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 transition-colors"
                    title="Feature"
                  >
                    <Star className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleAction(notification._id, "ignored")}
                    className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 transition-colors"
                    title="Ignore"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleAction(notification._id, "flagged")}
                    className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 transition-colors"
                    title="Flag"
                  >
                    <Flag className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
