"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import {
  TrendingUp,
  Users,
  PlayCircle,
  Sparkles,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { useOverview, useDateHighlight } from "./OverviewContext";
import type { ChartMetric } from "./types";

interface MetricOption {
  value: ChartMetric;
  label: string;
  icon: React.ElementType;
  description: string;
  color: string;
}

const METRIC_OPTIONS: MetricOption[] = [
  {
    value: "pageViews",
    label: "Page Views",
    icon: Users,
    description: "Daily visitors to your page",
    color: "#dc2626",
  },
  {
    value: "clipPlays",
    label: "Clip Plays",
    icon: PlayCircle,
    description: "Video plays across all clips",
    color: "#ea580c",
  },
  {
    value: "engagement",
    label: "Total Engagement",
    icon: TrendingUp,
    description: "Plays + shares + comments",
    color: "#16a34a",
  },
  {
    value: "assetGeneration",
    label: "Assets Created",
    icon: Sparkles,
    description: "Clips, memes, and GIFs generated",
    color: "#9333ea",
  },
];

// Custom tooltip component
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-red-200 bg-white px-3 py-2 shadow-lg dark:border-red-900/50 dark:bg-slate-900"
    >
      <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
      </p>
      {payload.map((entry: any, index: number) => (
        <p
          key={index}
          className="text-sm font-semibold"
          style={{ color: entry.color }}
        >
          {entry.name}: {entry.value?.toLocaleString() ?? 0}
        </p>
      ))}
    </motion.div>
  );
}

export function TrajectoryChart() {
  const {
    timeRange,
    chartMetric,
    setChartMetric,
    setHoveredDate,
    actorProfileId,
    focusedComponent,
  } = useOverview();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const highlightedDate = useDateHighlight();

  const isExpanded = focusedComponent === "chart";

  // Fetch chart data based on selected metric
  const chartData = useQuery(
    api.overview.getChartData,
    chartMetric !== "assetGeneration" && actorProfileId
      ? { actorProfileId, timeRange }
      : "skip"
  );

  // Fetch asset generation stats separately
  const assetStats = useQuery(
    api.overview.getAssetGenerationStats,
    chartMetric === "assetGeneration" && actorProfileId
      ? { actorProfileId, timeRange }
      : "skip"
  );

  const currentOption = METRIC_OPTIONS.find((o) => o.value === chartMetric)!;

  const isLoading =
    chartMetric === "assetGeneration"
      ? assetStats === undefined
      : chartData === undefined;

  const data = useMemo(() => {
    if (chartMetric === "assetGeneration") {
      return assetStats ?? [];
    }
    return chartData ?? [];
  }, [chartMetric, chartData, assetStats]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    if (data.length === 0) return { total: 0, average: 0, trend: 0 };

    if (chartMetric === "assetGeneration") {
      const assetData = data as Array<{ total: number }>;
      const total = assetData.reduce((sum, d) => sum + (d.total ?? 0), 0);
      return {
        total,
        average: Math.round(total / assetData.length) || 0,
        trend: 0,
      };
    }

    const metricData = data as Array<{ pageViews?: number; clipPlays?: number; engagement?: number }>;
    const getValue = (d: typeof metricData[0]) => {
      switch (chartMetric) {
        case "pageViews": return d.pageViews ?? 0;
        case "clipPlays": return d.clipPlays ?? 0;
        case "engagement": return d.engagement ?? 0;
        default: return 0;
      }
    };

    const total = metricData.reduce((sum, d) => sum + getValue(d), 0);
    const average = Math.round(total / metricData.length) || 0;

    // Calculate trend (compare recent half to previous half)
    const midpoint = Math.floor(metricData.length / 2);
    const recentData = metricData.slice(midpoint);
    const previousData = metricData.slice(0, midpoint);
    const recentSum = recentData.reduce((sum, d) => sum + getValue(d), 0);
    const previousSum = previousData.reduce((sum, d) => sum + getValue(d), 0);
    const trend = previousSum > 0 ? Math.round(((recentSum - previousSum) / previousSum) * 100) : 0;

    return { total, average, trend };
  }, [data, chartMetric]);

  // Handle chart hover for cross-linking
  const handleMouseMove = useCallback(
    (state: any) => {
      if (state?.activePayload?.[0]?.payload?.date) {
        setHoveredDate(state.activePayload[0].payload.date);
      }
    },
    [setHoveredDate]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredDate(null);
  }, [setHoveredDate]);

  const dataKey = chartMetric === "assetGeneration" ? "total" : chartMetric;

  return (
    <div className="flex h-full flex-col">
      {/* Header with dropdown */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsDropdownOpen(!isDropdownOpen);
            }}
            className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition hover:border-red-400 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white"
          >
            <currentOption.icon
              className="h-4 w-4"
              style={{ color: currentOption.color }}
            />
            {currentOption.label}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatePresence>
            {isDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-red-200 bg-white p-1 shadow-lg dark:border-red-900/50 dark:bg-[#161a24]"
                onClick={(e) => e.stopPropagation()}
              >
                {METRIC_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setChartMetric(option.value);
                      setIsDropdownOpen(false);
                    }}
                    className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-red-50 dark:hover:bg-red-900/20 ${
                      option.value === chartMetric
                        ? "bg-red-50 dark:bg-red-900/20"
                        : ""
                    }`}
                  >
                    <option.icon
                      className="mt-0.5 h-4 w-4 flex-shrink-0"
                      style={{ color: option.color }}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {option.label}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {option.description}
                      </p>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Total: </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {summaryStats.total.toLocaleString()}
            </span>
          </div>
          {summaryStats.trend !== 0 && (
            <div
              className={`flex items-center gap-1 ${
                summaryStats.trend > 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              <TrendingUp
                className={`h-3 w-3 ${summaryStats.trend < 0 ? "rotate-180" : ""}`}
              />
              <span className="font-medium">
                {summaryStats.trend > 0 ? "+" : ""}
                {summaryStats.trend}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className={isExpanded ? "h-[300px]" : "h-[180px]"}>
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-red-500" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Sparkles className="mb-2 h-8 w-8 text-red-300 dark:text-red-700" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No data available for this period
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Activity will appear here as your page gets traffic
            </p>
          </div>
        ) : chartMetric === "assetGeneration" ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
            <BarChart
              data={data}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <defs>
                <linearGradient id="clipGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#dc2626" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity={0.4} />
                </linearGradient>
                <linearGradient id="memeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ea580c" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#ea580c" stopOpacity={0.4} />
                </linearGradient>
                <linearGradient id="gifGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9333ea" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#9333ea" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.3} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#64748b" }}
                stroke="#94a3b8"
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                stroke="#94a3b8"
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              {isExpanded && <Legend />}
              <Bar
                dataKey="clips"
                name="Clips"
                fill="url(#clipGradient)"
                stackId="a"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="memes"
                name="Memes"
                fill="url(#memeGradient)"
                stackId="a"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="gifs"
                name="GIFs"
                fill="url(#gifGradient)"
                stackId="a"
                radius={[4, 4, 0, 0]}
              />
              {highlightedDate && (
                <ReferenceLine
                  x={data.find((d: any) => d.date === highlightedDate)?.label}
                  stroke="#dc2626"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
            <AreaChart
              data={data}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <defs>
                <linearGradient id={`gradient-${chartMetric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={currentOption.color} stopOpacity={0.6} />
                  <stop offset="95%" stopColor={currentOption.color} stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.3} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#64748b" }}
                stroke="#94a3b8"
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                stroke="#94a3b8"
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey={dataKey}
                name={currentOption.label}
                stroke={currentOption.color}
                strokeWidth={3}
                fill={`url(#gradient-${chartMetric})`}
                dot={false}
                activeDot={{
                  r: 6,
                  stroke: currentOption.color,
                  strokeWidth: 2,
                  fill: "#fff",
                }}
              />
              {highlightedDate && (
                <ReferenceLine
                  x={data.find((d: any) => d.date === highlightedDate)?.label}
                  stroke="#dc2626"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
