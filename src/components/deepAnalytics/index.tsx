"use client";

import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  TrendingUp,
  MousePointerClick,
  Play,
  Share2,
  Users,
  Clock,
  ArrowDown,
  BarChart3,
  Film,
  ChevronDown,
  ChevronUp,
  Target,
  Zap,
  Eye,
  Mail,
} from "lucide-react";

interface DeepAnalyticsProps {
  actorProfileId: Id<"actor_profiles">;
  slug: string;
}

type TimeRange = "7" | "14" | "30" | "90";

export function DeepAnalytics({ actorProfileId, slug }: DeepAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("30");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  // Fetch analytics data
  const overview = useQuery(api.analytics.getOverview, {
    actorProfileId,
    daysBack: parseInt(timeRange),
  });

  const projectAnalytics = useQuery(api.analytics.getProjectAnalytics, {
    actorProfileId,
    daysBack: parseInt(timeRange),
  });

  const deepAnalytics = useQuery(api.deepAnalytics.getDeepAnalyticsOverview, {
    actorProfileId,
    daysBack: parseInt(timeRange),
  });

  const isLoading = overview === undefined || projectAnalytics === undefined;

  // Calculate engagement funnel percentages
  const funnel = deepAnalytics?.engagementFunnel;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-red-500" />
            Deep Analytics
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Granular insights into your public link performance
          </p>
        </div>

        {/* Time Range Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600 dark:text-slate-400">Period:</span>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-red-300 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-red-900/50 dark:bg-slate-900 dark:text-white"
          >
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-200 border-t-red-600" />
        </div>
      ) : (
        <>
          {/* Engagement Funnel */}
          <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-lg dark:border-red-900/50 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <ArrowDown className="h-5 w-5 text-red-500" />
              Engagement Funnel
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              {/* Page Views */}
              <FunnelStep
                icon={<Eye className="h-5 w-5" />}
                label="Page Views"
                value={funnel?.pageViews ?? overview?.pageViews ?? 0}
                percentage={100}
                color="red"
              />

              {/* Scrolled 50% */}
              <FunnelStep
                icon={<ArrowDown className="h-5 w-5" />}
                label="Scrolled 50%"
                value={funnel?.scrolled50 ?? overview?.engagementDepth?.scrollDepth50 ?? 0}
                percentage={funnel?.scrollRate ?? 0}
                color="orange"
              />

              {/* Watched Video */}
              <FunnelStep
                icon={<Play className="h-5 w-5" />}
                label="Watched Video"
                value={funnel?.watchedVideo ?? overview?.videoEngagement?.plays ?? 0}
                percentage={funnel?.videoWatchRate ?? 0}
                color="amber"
              />

              {/* CTA Clicks */}
              <FunnelStep
                icon={<MousePointerClick className="h-5 w-5" />}
                label="CTA Clicks"
                value={funnel?.clicked_cta ?? (overview?.ctaMetrics?.watchCtaClicks ?? 0) + (overview?.ctaMetrics?.getUpdatesClicks ?? 0)}
                percentage={funnel?.ctaClickRate ?? 0}
                color="green"
              />

              {/* Email Captured */}
              <FunnelStep
                icon={<Mail className="h-5 w-5" />}
                label="Email Captured"
                value={funnel?.emailCaptured ?? overview?.emailCaptures ?? 0}
                percentage={funnel?.conversionRate ?? 0}
                color="blue"
              />
            </div>
          </div>

          {/* CTA Performance */}
          <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-lg dark:border-red-900/50 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <MousePointerClick className="h-5 w-5 text-red-500" />
              CTA Performance
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard
                icon={<Play className="h-5 w-5 text-red-500" />}
                label="Watch CTA Clicks"
                value={overview?.ctaMetrics?.watchCtaClicks ?? 0}
                description="Clicks on Watch Now button"
              />
              <MetricCard
                icon={<Mail className="h-5 w-5 text-blue-500" />}
                label="Get Updates Clicks"
                value={overview?.ctaMetrics?.getUpdatesClicks ?? 0}
                description="Clicks on Get Updates button"
              />
              <MetricCard
                icon={<Share2 className="h-5 w-5 text-green-500" />}
                label="Share Clicks"
                value={overview?.ctaMetrics?.shareButtonClicks ?? 0}
                description="Clicks on share button"
              />
              <MetricCard
                icon={<Target className="h-5 w-5 text-purple-500" />}
                label="Social Link Clicks"
                value={overview?.ctaMetrics?.socialLinkClicks ?? 0}
                description="Clicks on social media links"
              />
            </div>
          </div>

          {/* Video Engagement */}
          <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-lg dark:border-red-900/50 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Play className="h-5 w-5 text-red-500" />
              Video Engagement
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <MetricCard
                icon={<Play className="h-5 w-5 text-green-500" />}
                label="Total Plays"
                value={overview?.videoEngagement?.plays ?? 0}
              />
              <MetricCard
                icon={<Clock className="h-5 w-5 text-blue-500" />}
                label="Fullscreen"
                value={overview?.videoEngagement?.fullscreenEnters ?? 0}
              />
              <MetricCard
                icon={<BarChart3 className="h-5 w-5 text-amber-500" />}
                label="Completed (75%+)"
                value={(overview?.videoEngagement?.progress75 ?? 0) + (overview?.videoEngagement?.completed ?? 0)}
              />
              <MetricCard
                icon={<TrendingUp className="h-5 w-5 text-purple-500" />}
                label="Completion Rate"
                value={overview?.videoEngagement?.plays
                  ? Math.round(((overview?.videoEngagement?.completed ?? 0) / overview?.videoEngagement?.plays) * 100)
                  : 0}
                suffix="%"
              />
            </div>

            {/* Progress Bar Breakdown */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">Watch Progress Breakdown</h3>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden flex">
                  <ProgressSegment
                    value={overview?.videoEngagement?.progress25 ?? 0}
                    total={overview?.videoEngagement?.plays ?? 1}
                    color="bg-red-400"
                    label="25%"
                  />
                  <ProgressSegment
                    value={overview?.videoEngagement?.progress50 ?? 0}
                    total={overview?.videoEngagement?.plays ?? 1}
                    color="bg-orange-400"
                    label="50%"
                  />
                  <ProgressSegment
                    value={overview?.videoEngagement?.progress75 ?? 0}
                    total={overview?.videoEngagement?.plays ?? 1}
                    color="bg-amber-400"
                    label="75%"
                  />
                  <ProgressSegment
                    value={overview?.videoEngagement?.completed ?? 0}
                    total={overview?.videoEngagement?.plays ?? 1}
                    color="bg-green-500"
                    label="100%"
                  />
                </div>
              </div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>25%: {overview?.videoEngagement?.progress25 ?? 0}</span>
                <span>50%: {overview?.videoEngagement?.progress50 ?? 0}</span>
                <span>75%: {overview?.videoEngagement?.progress75 ?? 0}</span>
                <span>100%: {overview?.videoEngagement?.completed ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Per-Project Analytics */}
          <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-lg dark:border-red-900/50 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Film className="h-5 w-5 text-red-500" />
              Project Performance
            </h2>

            {projectAnalytics?.projects && projectAnalytics.projects.length > 0 ? (
              <div className="space-y-3">
                {projectAnalytics.projects.map((project) => (
                  <div
                    key={project.projectId}
                    className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedProject(
                        expandedProject === project.projectId ? null : project.projectId
                      )}
                      className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                          <Film className="h-5 w-5 text-red-600 dark:text-red-400" />
                        </div>
                        <div className="text-left">
                          <h3 className="font-medium text-slate-900 dark:text-white">
                            {project.title}
                          </h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {project.totalEngagements} total engagements
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center gap-6 text-sm">
                          <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                            <MousePointerClick className="h-4 w-4" />
                            {project.watchCtaClicks}
                          </span>
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <Play className="h-4 w-4" />
                            {project.videoPlays}
                          </span>
                          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            <Share2 className="h-4 w-4" />
                            {project.shareClicks}
                          </span>
                        </div>
                        {expandedProject === project.projectId ? (
                          <ChevronUp className="h-5 w-5 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                    </button>

                    {expandedProject === project.projectId && (
                      <div className="px-4 pb-4 pt-0 border-t border-slate-200 dark:border-slate-700">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4">
                          <MiniMetric label="Watch CTA" value={project.watchCtaClicks} color="red" />
                          <MiniMetric label="Get Updates" value={project.getUpdatesClicks} color="blue" />
                          <MiniMetric label="Share Clicks" value={project.shareClicks} color="green" />
                          <MiniMetric label="Video Plays" value={project.videoPlays} color="amber" />
                          <MiniMetric label="Video Pauses" value={project.videoPauses} color="orange" />
                          <MiniMetric label="Fullscreen" value={project.fullscreenEnters} color="purple" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <Film className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No project data available yet</p>
                <p className="text-sm">Add projects to see per-project analytics</p>
              </div>
            )}
          </div>

          {/* Engagement Depth */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Scroll Depth */}
            <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-lg dark:border-red-900/50 dark:bg-slate-900">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <ArrowDown className="h-5 w-5 text-red-500" />
                Scroll Depth
              </h2>
              <div className="space-y-3">
                <DepthBar label="25%" value={overview?.engagementDepth?.scrollDepth25 ?? 0} max={overview?.pageViews ?? 1} color="red" />
                <DepthBar label="50%" value={overview?.engagementDepth?.scrollDepth50 ?? 0} max={overview?.pageViews ?? 1} color="orange" />
                <DepthBar label="75%" value={overview?.engagementDepth?.scrollDepth75 ?? 0} max={overview?.pageViews ?? 1} color="amber" />
                <DepthBar label="100%" value={overview?.engagementDepth?.scrollDepth100 ?? 0} max={overview?.pageViews ?? 1} color="green" />
              </div>
            </div>

            {/* Time on Page */}
            <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-lg dark:border-red-900/50 dark:bg-slate-900">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-red-500" />
                Time on Page
              </h2>
              <div className="space-y-3">
                <DepthBar label="30s+" value={overview?.engagementDepth?.timeOnPage30s ?? 0} max={overview?.pageViews ?? 1} color="red" />
                <DepthBar label="60s+" value={overview?.engagementDepth?.timeOnPage60s ?? 0} max={overview?.pageViews ?? 1} color="orange" />
                <DepthBar label="3min+" value={overview?.engagementDepth?.timeOnPage180s ?? 0} max={overview?.pageViews ?? 1} color="green" />
              </div>
            </div>
          </div>

          {/* Insights */}
          {deepAnalytics?.contentInsights?.recommendations?.insights &&
           deepAnalytics.contentInsights.recommendations.insights.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-900/20">
              <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                Insights & Recommendations
              </h2>
              <ul className="space-y-2">
                {deepAnalytics.contentInsights.recommendations.insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2 text-amber-800 dark:text-amber-200">
                    <span className="text-amber-500 mt-1">•</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Helper Components

function FunnelStep({
  icon,
  label,
  value,
  percentage,
  color
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  percentage: number;
  color: string;
}) {
  const colorClasses = {
    red: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    orange: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    green: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  };

  return (
    <div className="text-center">
      <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${colorClasses[color as keyof typeof colorClasses]} mb-2`}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white">{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-1">
        {percentage.toFixed(1)}%
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  description,
  suffix = ""
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  description?: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white">
        {value.toLocaleString()}{suffix}
      </div>
      {description && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{description}</p>
      )}
    </div>
  );
}

function ProgressSegment({
  value,
  total,
  color,
  label
}: {
  value: number;
  total: number;
  color: string;
  label: string;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  if (percentage === 0) return null;

  return (
    <div
      className={`${color} h-full flex items-center justify-center text-xs font-medium text-white`}
      style={{ width: `${percentage}%` }}
      title={`${label}: ${value} (${percentage.toFixed(1)}%)`}
    >
      {percentage > 10 && label}
    </div>
  );
}

function MiniMetric({
  label,
  value,
  color
}: {
  label: string;
  value: number;
  color: string;
}) {
  const colorClasses = {
    red: "text-red-600 dark:text-red-400",
    orange: "text-orange-600 dark:text-orange-400",
    amber: "text-amber-600 dark:text-amber-400",
    green: "text-green-600 dark:text-green-400",
    blue: "text-blue-600 dark:text-blue-400",
    purple: "text-purple-600 dark:text-purple-400",
  };

  return (
    <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
      <div className={`text-lg font-bold ${colorClasses[color as keyof typeof colorClasses]}`}>
        {value}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

function DepthBar({
  label,
  value,
  max,
  color
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  const colorClasses = {
    red: "bg-red-500",
    orange: "bg-orange-500",
    amber: "bg-amber-500",
    green: "bg-green-500",
  };

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-600 dark:text-slate-400">{label}</span>
        <span className="font-medium text-slate-900 dark:text-white">{value} ({percentage.toFixed(1)}%)</span>
      </div>
      <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClasses[color as keyof typeof colorClasses]} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default DeepAnalytics;
