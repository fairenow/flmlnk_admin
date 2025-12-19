"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { motion } from "framer-motion";
import {
  Zap,
  History,
  BarChart3,
  Plus,
  Loader2,
} from "lucide-react";
import { BoostHistoryTab } from "./BoostHistoryTab";
import { BoostDataTab } from "./BoostDataTab";
import { BoostCreateTab } from "./BoostCreateTab";

type TabType = "history" | "data" | "create";

interface BoostModuleProps {
  actorProfileId: Id<"actor_profiles">;
}

export function BoostModule({ actorProfileId }: BoostModuleProps) {
  const [activeTab, setActiveTab] = useState<TabType>("history");

  // Fetch active campaigns count for badge
  const activeCampaigns = useQuery(
    api.overview.getActiveBoostCampaigns,
    { actorProfileId }
  );

  const isLoading = activeCampaigns === undefined;
  const activeCount = activeCampaigns?.length ?? 0;

  const tabs = [
    { id: "history" as const, label: "History", icon: History },
    { id: "data" as const, label: "Data", icon: BarChart3 },
    { id: "create" as const, label: "New Boost", icon: Plus },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 p-4 sm:p-6 text-white shadow-lg shadow-orange-950/40 ring-1 ring-orange-300/30">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.25em] text-orange-100">Boost Manager</p>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Amplify Your Content</h2>
            <p className="mt-1 text-sm text-orange-100/90">
              Boost your best clips, memes, and GIFs to reach more viewers across platforms.
            </p>
          </div>
          <div className="flex items-center gap-4">
            {activeCount > 0 && (
              <div className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                <span className="text-sm font-medium">
                  {activeCount} Active Campaign{activeCount !== 1 ? "s" : ""}
                </span>
              </div>
            )}
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white/20">
              <Zap className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-3xl border border-red-300 bg-white shadow-lg shadow-red-200/50 dark:border-red-900/50 dark:bg-[#0f1219] dark:shadow-red-950/30">
        {/* Tab Navigation */}
        <div className="border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-1 p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className="absolute inset-0 rounded-xl bg-amber-100 dark:bg-amber-900/30"
                    style={{ zIndex: -1 }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
          ) : (
            <>
              {activeTab === "history" && (
                <BoostHistoryTab actorProfileId={actorProfileId} />
              )}
              {activeTab === "data" && (
                <BoostDataTab actorProfileId={actorProfileId} />
              )}
              {activeTab === "create" && (
                <BoostCreateTab actorProfileId={actorProfileId} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
