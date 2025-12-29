"use client";

import { useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { OverviewProvider, useOverview } from "./OverviewContext";
import { BentoCard } from "./BentoCard";
import { TimeRangeSelector } from "./TimeRangeSelector";
import { TrajectoryChart } from "./TrajectoryChart";
import { QuickActionsGrid } from "./QuickActionsGrid";
import { YouTubeChannel } from "./YouTubeChannel";
import { MetricsSummary } from "./MetricsSummary";
import { BoostCard } from "./BoostCard";
import { ConnectionLines } from "./ConnectionLines";
import { FloatingCreateButton } from "./FloatingCreateButton";
import { staggerContainer, staggerItem } from "./animations";
import type { OverviewBentoProps } from "./types";

// Inner component that uses the context
function OverviewBentoInner({
  slug,
  displayName,
  youtubeUrl,
  onNavigateToGenerator,
}: Omit<OverviewBentoProps, "actorProfileId">) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { focusedComponent, setFocusedComponent, reducedMotion } = useOverview();

  // Handle click outside to collapse
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (focusedComponent === "none") return;

      const target = e.target as HTMLElement;
      // Don't collapse if clicking on a bento card or FAB
      if (
        target.closest("[data-bento-card]") ||
        target.closest("[data-fab-menu]")
      ) {
        return;
      }

      setFocusedComponent("none");
    },
    [focusedComponent, setFocusedComponent]
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  // Handle escape key to collapse
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focusedComponent !== "none") {
        setFocusedComponent("none");
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [focusedComponent, setFocusedComponent]);

  // Calculate grid classes based on focused component
  const getGridClasses = () => {
    const base = "grid gap-4 transition-all duration-300";

    // Mobile: always stack
    const mobile = "grid-cols-1";

    // Desktop: depends on focused state
    if (focusedComponent === "none") {
      return `${base} ${mobile} lg:grid-cols-3 lg:grid-rows-[auto_auto]`;
    }

    // When something is expanded, adjust layout
    switch (focusedComponent) {
      case "metrics":
        return `${base} ${mobile} lg:grid-cols-[1.5fr_1fr] lg:grid-rows-[auto_auto]`;
      case "chart":
        return `${base} ${mobile} lg:grid-cols-[1fr_1.5fr] lg:grid-rows-[auto_auto]`;
      case "quickActions":
        return `${base} ${mobile} lg:grid-cols-2 lg:grid-rows-[auto_1.5fr]`;
      case "youtube":
        return `${base} ${mobile} lg:grid-cols-[1fr_1.5fr] lg:grid-rows-[auto_auto]`;
      case "boost":
        // Full width single card when boost is expanded
        return `${base} ${mobile} lg:grid-cols-1`;
      default:
        return `${base} ${mobile} lg:grid-cols-3 lg:grid-rows-[auto_auto]`;
    }
  };

  // Check if boost is expanded (to hide other cards)
  const isBoostExpanded = focusedComponent === "boost";

  return (
    <div className="relative space-y-4" ref={containerRef}>
      {/* Header with Time Range Selector */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Welcome back, {displayName}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Here&apos;s what&apos;s happening with your content
          </p>
        </div>
        <TimeRangeSelector />
      </motion.div>

      {/* Bento Grid */}
      <motion.div
        variants={reducedMotion ? undefined : staggerContainer}
        initial="hidden"
        animate="visible"
        className={getGridClasses()}
        data-bento-card
      >
        {/* Hide other cards when boost is expanded */}
        {!isBoostExpanded && (
          <>
            {/* Metrics Summary - Top Left */}
            <motion.div
              variants={reducedMotion ? undefined : staggerItem}
              className={focusedComponent === "metrics" ? "lg:row-span-2" : ""}
              data-bento-card
            >
              <BentoCard
                id="bento-metrics"
                componentType="metrics"
                expandable={true}
              >
                <MetricsSummary />
              </BentoCard>
            </motion.div>

            {/* Trajectory Chart - Top Right (spans 2 cols normally) */}
            <motion.div
              variants={reducedMotion ? undefined : staggerItem}
              className={`${
                focusedComponent === "none" ? "lg:col-span-2" : ""
              } ${focusedComponent === "chart" ? "lg:row-span-2" : ""}`}
              data-bento-card
            >
              <BentoCard
                id="bento-chart"
                componentType="chart"
                expandable={true}
              >
                <TrajectoryChart />
              </BentoCard>
            </motion.div>

            {/* Quick Actions Grid - Bottom Left */}
            <motion.div
              variants={reducedMotion ? undefined : staggerItem}
              className={`${focusedComponent === "quickActions" ? "lg:col-span-2" : ""}`}
              data-bento-card
            >
              <BentoCard
                id="bento-quick-actions"
                componentType="quickActions"
                expandable={true}
              >
                <QuickActionsGrid
                  slug={slug}
                  onNavigateToGenerator={onNavigateToGenerator}
                />
              </BentoCard>
            </motion.div>
          </>
        )}

        {/* Boost Card - Bottom Center (or full width when expanded) */}
        <motion.div
          variants={reducedMotion ? undefined : staggerItem}
          data-bento-card
          className={isBoostExpanded ? "min-h-[600px]" : ""}
        >
          <BentoCard
            id="bento-boost"
            componentType="boost"
            expandable={true}
            className={isBoostExpanded ? "h-full" : ""}
          >
            <BoostCard />
          </BentoCard>
        </motion.div>

        {/* Hide YouTube when boost is expanded */}
        {!isBoostExpanded && (
          <>
            {/* YouTube Channel - Bottom Right */}
            <motion.div
              variants={reducedMotion ? undefined : staggerItem}
              className={focusedComponent === "youtube" ? "lg:row-span-2" : ""}
              data-bento-card
            >
              <BentoCard
                id="bento-youtube"
                componentType="youtube"
                expandable={true}
                noPadding
              >
                <YouTubeChannel
                  youtubeUrl={youtubeUrl}
                  displayName={displayName}
                />
              </BentoCard>
            </motion.div>
          </>
        )}
      </motion.div>

      {/* Connection Lines Overlay */}
      <ConnectionLines containerRef={containerRef} />

      {/* Floating Action Button */}
      <FloatingCreateButton
        slug={slug}
        onNavigateToGenerator={onNavigateToGenerator}
      />
    </div>
  );
}

// Main export with provider wrapper
export function OverviewBento({
  slug,
  actorProfileId,
  displayName,
  youtubeUrl,
  onNavigateToGenerator,
}: OverviewBentoProps) {
  return (
    <OverviewProvider actorProfileId={actorProfileId}>
      <OverviewBentoInner
        slug={slug}
        displayName={displayName}
        youtubeUrl={youtubeUrl}
        onNavigateToGenerator={onNavigateToGenerator}
      />
    </OverviewProvider>
  );
}
