"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type {
  OverviewState,
  TimeRange,
  FocusedComponent,
  AssetReference,
  ConnectionLine,
  ChartMetric,
} from "./types";
import type { Id } from "@convex/_generated/dataModel";

const OverviewContext = createContext<OverviewState | undefined>(undefined);

interface OverviewProviderProps {
  children: ReactNode;
  actorProfileId: Id<"actor_profiles"> | null;
}

export const OverviewProvider: React.FC<OverviewProviderProps> = ({
  children,
  actorProfileId,
}) => {
  // Core state
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [focusedComponent, setFocusedComponent] =
    useState<FocusedComponent>("none");
  const [hoveredAsset, setHoveredAsset] = useState<AssetReference | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [activeConnections, setActiveConnections] = useState<ConnectionLine[]>(
    []
  );
  const [chartMetric, setChartMetric] = useState<ChartMetric>("pageViews");
  const [fabExpanded, setFabExpanded] = useState(false);
  const [newAssetAnimation, setNewAssetAnimation] =
    useState<AssetReference | null>(null);

  // Reduced motion detection
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, []);

  // Close FAB when clicking outside
  useEffect(() => {
    if (!fabExpanded) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-fab-menu]")) {
        setFabExpanded(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [fabExpanded]);

  // Connection management
  const addConnection = useCallback((connection: ConnectionLine) => {
    setActiveConnections((prev) => {
      // Avoid duplicates
      if (prev.some((c) => c.id === connection.id)) return prev;
      return [...prev, connection];
    });
  }, []);

  const clearConnections = useCallback(() => {
    setActiveConnections([]);
  }, []);

  // New asset animation trigger
  const triggerNewAssetAnimation = useCallback((asset: AssetReference) => {
    setNewAssetAnimation(asset);
    // Clear after animation completes
    setTimeout(() => setNewAssetAnimation(null), 2000);
  }, []);

  // Handle focus component with click-outside support
  const handleSetFocusedComponent = useCallback(
    (component: FocusedComponent) => {
      setFocusedComponent((prev) => (prev === component ? "none" : component));
    },
    []
  );

  // Clear connections when hover states change
  useEffect(() => {
    if (!hoveredAsset && !hoveredDate) {
      clearConnections();
    }
  }, [hoveredAsset, hoveredDate, clearConnections]);

  const value = useMemo<OverviewState>(
    () => ({
      timeRange,
      setTimeRange,
      focusedComponent,
      setFocusedComponent: handleSetFocusedComponent,
      hoveredAsset,
      setHoveredAsset,
      hoveredDate,
      setHoveredDate,
      activeConnections,
      addConnection,
      clearConnections,
      chartMetric,
      setChartMetric,
      fabExpanded,
      setFabExpanded,
      newAssetAnimation,
      triggerNewAssetAnimation,
      reducedMotion,
      actorProfileId,
    }),
    [
      timeRange,
      focusedComponent,
      handleSetFocusedComponent,
      hoveredAsset,
      hoveredDate,
      activeConnections,
      addConnection,
      clearConnections,
      chartMetric,
      fabExpanded,
      newAssetAnimation,
      triggerNewAssetAnimation,
      reducedMotion,
      actorProfileId,
    ]
  );

  return (
    <OverviewContext.Provider value={value}>
      {children}
    </OverviewContext.Provider>
  );
};

export const useOverview = (): OverviewState => {
  const context = useContext(OverviewContext);
  if (!context) {
    throw new Error("useOverview must be used within OverviewProvider");
  }
  return context;
};

// Custom hook for checking if an asset should be highlighted
export const useAssetHighlight = (assetDate: number): boolean => {
  const { hoveredDate } = useOverview();

  return useMemo(() => {
    if (!hoveredDate) return false;
    const assetDateStr = new Date(assetDate).toISOString().split("T")[0];
    return assetDateStr === hoveredDate;
  }, [hoveredDate, assetDate]);
};

// Custom hook for checking if a date should be highlighted on chart
export const useDateHighlight = (): string | null => {
  const { hoveredAsset } = useOverview();

  return useMemo(() => {
    if (!hoveredAsset) return null;
    return new Date(hoveredAsset.createdAt).toISOString().split("T")[0];
  }, [hoveredAsset]);
};
