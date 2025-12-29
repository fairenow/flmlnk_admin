"use client";

import { motion } from "framer-motion";
import { useOverview } from "./OverviewContext";
import type { TimeRange } from "./types";

interface TimeRangeSelectorProps {
  className?: string;
}

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "14d", label: "14d" },
  { value: "30d", label: "30d" },
];

export function TimeRangeSelector({ className = "" }: TimeRangeSelectorProps) {
  const { timeRange, setTimeRange, reducedMotion } = useOverview();

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 ${className}`}
      role="group"
      aria-label="Select time range"
    >
      {TIME_RANGES.map(({ value, label }) => {
        const isActive = timeRange === value;

        return (
          <button
            key={value}
            type="button"
            onClick={() => setTimeRange(value)}
            className={`
              relative rounded-lg px-3 py-1.5 text-xs font-medium
              transition-colors duration-150
              focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2
              ${
                isActive
                  ? "text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }
            `}
            aria-pressed={isActive}
          >
            {/* Background pill animation */}
            {isActive && (
              <motion.div
                layoutId={reducedMotion ? undefined : "timeRangeIndicator"}
                className="absolute inset-0 rounded-lg bg-red-600"
                initial={false}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                }}
              />
            )}
            <span className="relative z-10">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
