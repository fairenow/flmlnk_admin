import type { Id } from "@convex/_generated/dataModel";

// Time range options for analytics filtering
export type TimeRange = "7d" | "14d" | "30d";

// Asset types for cross-component linking
export type AssetType = "clip" | "meme" | "gif" | "trailer";

// Asset reference for hover linking
export interface AssetReference {
  id: string;
  type: AssetType;
  createdAt: number;
  title?: string;
  thumbnailUrl?: string;
}

// Chart data point structure
export interface ChartDataPoint {
  date: string; // ISO date string YYYY-MM-DD
  label: string; // Formatted label (e.g., "Dec 15")
  timestamp: number;
  pageViews: number;
  clipPlays: number;
  engagement: number;
  conversions: number;
}

// Asset generation stats for stacked bar chart
export interface AssetGenerationPoint {
  date: string;
  label: string;
  clips: number;
  memes: number;
  gifs: number;
  total: number;
}

// Connection line for visual connections
export interface ConnectionLine {
  id: string;
  fromElement: string; // DOM element ID
  toElement: string; // DOM element ID
  type: "asset-date" | "metric-chart" | "youtube-metric";
  intensity: number; // 0-1 for animation intensity
}

// Bento card expansion state
export type FocusedComponent =
  | "none"
  | "metrics"
  | "chart"
  | "quickActions"
  | "youtube"
  | "boost";

// Chart metric types
export type ChartMetric = "pageViews" | "clipPlays" | "engagement" | "assetGeneration";

// Quick asset for the grid
export interface QuickAsset {
  _id: string;
  type: AssetType;
  title: string;
  thumbnailUrl?: string;
  createdAt: number;
  score?: number;
  viralScore?: number;
}

// Main context state interface
export interface OverviewState {
  // Time context (shared across all components)
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;

  // Expansion/focus state
  focusedComponent: FocusedComponent;
  setFocusedComponent: (component: FocusedComponent) => void;

  // Asset hover state (for cross-linking)
  hoveredAsset: AssetReference | null;
  setHoveredAsset: (asset: AssetReference | null) => void;

  // Chart hover state (for highlighting assets by date)
  hoveredDate: string | null; // ISO date string
  setHoveredDate: (date: string | null) => void;

  // Active connections (for SVG overlay)
  activeConnections: ConnectionLine[];
  addConnection: (connection: ConnectionLine) => void;
  clearConnections: () => void;

  // Chart display mode
  chartMetric: ChartMetric;
  setChartMetric: (metric: ChartMetric) => void;

  // FAB state
  fabExpanded: boolean;
  setFabExpanded: (expanded: boolean) => void;

  // New asset animation trigger
  newAssetAnimation: AssetReference | null;
  triggerNewAssetAnimation: (asset: AssetReference) => void;

  // Accessibility
  reducedMotion: boolean;

  // Actor profile ID for queries
  actorProfileId: Id<"actor_profiles"> | null;
}

// Props for the main OverviewBento component
export interface OverviewBentoProps {
  slug: string;
  actorProfileId: Id<"actor_profiles">;
  displayName: string;
  youtubeUrl?: string;
  onNavigateToGenerator?: (type: AssetType) => void;
}
