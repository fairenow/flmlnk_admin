"use client";

import React from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { motion } from "framer-motion";
import {
  Eye,
  PlayCircle,
  Mail,
  MousePointer,
  Loader2,
} from "lucide-react";
import { useOverview } from "./OverviewContext";
import { metricCardVariants } from "./animations";

/**
 * Formats a number with K suffix for thousands (e.g., 14504 → "14K", 659 → "659")
 */
function formatCompactNumber(value: number): string {
  if (value >= 1000) {
    return `${Math.round(value / 1000)}K`;
  }
  return value.toString();
}

interface MetricItemProps {
  icon: React.ElementType;
  label: string;
  shortLabel?: string;
  value: number | string;
  change?: number;
  color: string;
  onClick?: () => void;
  compact?: boolean;
}

function MetricItem({
  icon: Icon,
  label,
  shortLabel,
  value,
  change,
  color,
  onClick,
  compact = false,
}: MetricItemProps) {
  const { reducedMotion } = useOverview();

  if (compact) {
    return (
      <motion.button
        type="button"
        variants={reducedMotion ? undefined : metricCardVariants}
        initial="idle"
        whileHover="hover"
        whileTap="active"
        onClick={onClick}
        className="flex flex-1 flex-col items-center justify-center rounded-lg border border-red-200/50 bg-slate-50/50 p-1.5 text-center transition-colors hover:bg-red-50/50 dark:border-red-900/30 dark:bg-slate-800/50 dark:hover:bg-red-900/20"
        title={label}
      >
        <Icon className="mb-0.5 h-3.5 w-3.5" style={{ color }} />
        <p className="text-base font-bold text-slate-900 dark:text-white">
          {typeof value === "number" ? formatCompactNumber(value) : value}
        </p>
        <p className="whitespace-nowrap text-[8px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {shortLabel || label}
        </p>
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      variants={reducedMotion ? undefined : metricCardVariants}
      initial="idle"
      whileHover="hover"
      whileTap="active"
      onClick={onClick}
      className="flex flex-1 items-center gap-2 rounded-xl border border-red-200/50 bg-slate-50/50 p-2.5 text-left transition-colors hover:bg-red-50/50 dark:border-red-900/30 dark:bg-slate-800/50 dark:hover:bg-red-900/20"
    >
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="text-xl font-bold text-slate-900 dark:text-white">
          {typeof value === "number" ? formatCompactNumber(value) : value}
        </p>
        {change !== undefined && change !== 0 && (
          <span
            className={`text-[10px] font-semibold ${
              change > 0 ? "text-green-600" : "text-red-500"
            }`}
          >
            {change > 0 ? "+" : ""}
            {change}% vs prev period
          </span>
        )}
      </div>
    </motion.button>
  );
}

export function MetricsSummary() {
  const { timeRange, actorProfileId, focusedComponent, setChartMetric } = useOverview();
  const isExpanded = focusedComponent === "metrics";

  // Fetch overview metrics
  const metrics = useQuery(
    api.overview.getMetricsSummary,
    actorProfileId ? { actorProfileId, timeRange } : "skip"
  );

  const isLoading = metrics === undefined;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-red-500" />
      </div>
    );
  }

  const metricItems = [
    {
      icon: Eye,
      label: "Page Views",
      shortLabel: "Views",
      value: metrics?.pageViews ?? 0,
      change: metrics?.pageViewsChange,
      color: "#dc2626",
      chartMetric: "pageViews" as const,
    },
    {
      icon: PlayCircle,
      label: "Clip Plays",
      shortLabel: "Plays",
      value: metrics?.clipPlays ?? 0,
      change: metrics?.clipPlaysChange,
      color: "#ea580c",
      chartMetric: "clipPlays" as const,
    },
    {
      icon: Mail,
      label: "Email Signups",
      shortLabel: "Emails",
      value: metrics?.emailCaptures ?? 0,
      change: metrics?.emailCapturesChange,
      color: "#2563eb",
      chartMetric: "engagement" as const,
    },
    {
      icon: MousePointer,
      label: "Link Clicks",
      shortLabel: "Clicks",
      value: metrics?.linkClicks ?? 0,
      change: metrics?.linkClicksChange,
      color: "#16a34a",
      chartMetric: "engagement" as const,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
        Key Metrics
      </h3>

      <div
        className={`grid flex-1 gap-2 ${
          isExpanded
            ? "grid-cols-2"
            : "grid-cols-2"
        }`}
      >
        {metricItems.map((item) => (
          <MetricItem
            key={item.label}
            icon={item.icon}
            label={item.label}
            shortLabel={item.shortLabel}
            value={item.value}
            change={isExpanded ? item.change : undefined}
            color={item.color}
            onClick={() => setChartMetric(item.chartMetric)}
            compact={false}
          />
        ))}
      </div>

      {/* Expanded view shows additional info */}
      {isExpanded && metrics && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-xl bg-gradient-to-r from-red-50 to-orange-50 p-4 dark:from-red-900/20 dark:to-orange-900/20"
        >
          <h4 className="mb-2 text-sm font-medium text-slate-900 dark:text-white">
            Period Summary
          </h4>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Your content reached{" "}
            <span className="font-semibold text-red-600 dark:text-red-400">
              {((metrics.pageViews ?? 0) + (metrics.clipPlays ?? 0)).toLocaleString()}
            </span>{" "}
            total views in the last {timeRange}. Keep creating engaging content to grow your
            audience!
          </p>
        </motion.div>
      )}
    </div>
  );
}
