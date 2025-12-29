"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Zap,
  TrendingUp,
  Users,
  Calendar,
  Check,
  PlayCircle,
  Sparkles,
  Film,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CreditCard,
} from "lucide-react";
import type { AssetType } from "./types";

interface BoostModalProps {
  isOpen: boolean;
  onClose: () => void;
  actorProfileId: Id<"actor_profiles">;
}

interface BoostableAsset {
  _id: string;
  type: AssetType;
  title: string;
  thumbnailUrl?: string;
  score?: number;
}

// Impression rate: $1 = 50-100 impressions (we use 75 as middle estimate)
const IMPRESSIONS_PER_DOLLAR_MIN = 50;
const IMPRESSIONS_PER_DOLLAR_MAX = 100;
const IMPRESSIONS_PER_DOLLAR_AVG = 75;

const ASSET_TYPE_ICONS = {
  clip: PlayCircle,
  meme: Sparkles,
  gif: Film,
};

const ASSET_TYPE_COLORS = {
  clip: "#dc2626",
  meme: "#ea580c",
  gif: "#9333ea",
};

const DURATION_OPTIONS = [
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
];

const DAILY_BUDGET_PRESETS = [5, 10, 25, 50, 100];

export function BoostModal({ isOpen, onClose, actorProfileId }: BoostModalProps) {
  const [step, setStep] = useState<"select" | "configure">("select");
  const [selectedAsset, setSelectedAsset] = useState<BoostableAsset | null>(null);
  const [dailyBudget, setDailyBudget] = useState(10);
  const [durationDays, setDurationDays] = useState(7);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for assets fetched via action
  const [recentAssets, setRecentAssets] = useState<BoostableAsset[] | undefined>(
    undefined
  );
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);

  // Action for fetching assets with signed URLs
  const getRecentAssetsWithSignedUrls = useAction(
    api.overview.getRecentAssetsWithSignedUrls
  );

  // Fetch boostable assets with signed URLs when modal opens
  useEffect(() => {
    if (!actorProfileId || !isOpen) {
      return;
    }

    let cancelled = false;
    setIsLoadingAssets(true);

    getRecentAssetsWithSignedUrls({
      actorProfileId,
      timeRange: "30d",
      limit: 20,
    })
      .then((assets) => {
        if (!cancelled) {
          setRecentAssets(
            assets.map((a) => ({
              _id: a._id,
              type: a.type as AssetType,
              title: a.title,
              thumbnailUrl: a.thumbnailUrl ?? undefined,
              score: a.score ?? a.viralScore,
            }))
          );
          setIsLoadingAssets(false);
        }
      })
      .catch((error) => {
        console.error("Failed to fetch boostable assets:", error);
        if (!cancelled) {
          setRecentAssets([]);
          setIsLoadingAssets(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [actorProfileId, isOpen, getRecentAssetsWithSignedUrls]);

  // Create pending boost campaign and checkout session
  const createPendingCampaign = useMutation(api.boost.createPendingBoostCampaign);
  const createCheckoutSession = useAction(api.boost.createBoostCheckoutSession);

  // Calculate estimates
  const estimates = useMemo(() => {
    const totalBudget = dailyBudget * durationDays;
    const impressionsMin = totalBudget * IMPRESSIONS_PER_DOLLAR_MIN;
    const impressionsMax = totalBudget * IMPRESSIONS_PER_DOLLAR_MAX;
    const impressionsAvg = totalBudget * IMPRESSIONS_PER_DOLLAR_AVG;
    // Estimate clicks as ~2-3% CTR
    const clicksMin = Math.floor(impressionsMin * 0.02);
    const clicksMax = Math.floor(impressionsMax * 0.03);

    return {
      totalBudget,
      impressionsMin,
      impressionsMax,
      impressionsAvg,
      clicksMin,
      clicksMax,
      dailyImpressionsAvg: Math.floor(impressionsAvg / durationDays),
    };
  }, [dailyBudget, durationDays]);

  const handleClose = useCallback(() => {
    setStep("select");
    setSelectedAsset(null);
    setDailyBudget(10);
    setDurationDays(7);
    onClose();
  }, [onClose]);

  const handleAssetSelect = useCallback((asset: BoostableAsset) => {
    setSelectedAsset(asset);
    setStep("configure");
  }, []);

  const handleBack = useCallback(() => {
    setStep("select");
  }, []);

  const handleStartBoost = useCallback(async () => {
    if (!selectedAsset) return;
    setIsSubmitting(true);
    try {
      // Step 1: Create pending campaign
      const campaign = await createPendingCampaign({
        actorProfileId,
        assetId: selectedAsset._id,
        assetType: selectedAsset.type,
        dailyBudgetCents: dailyBudget * 100, // Convert to cents
        durationDays,
      });

      // Step 2: Create Stripe checkout session
      const baseUrl = window.location.origin;
      const { checkoutUrl } = await createCheckoutSession({
        campaignId: campaign.campaignId,
        successUrl: `${baseUrl}/dashboard?boost=success`,
        cancelUrl: `${baseUrl}/dashboard?boost=cancelled`,
      });

      // Step 3: Redirect to Stripe checkout
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("Failed to create boost campaign:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to start boost";
      if (errorMessage.includes("not configured")) {
        alert("Payment system is not configured. Please contact support.");
      } else {
        alert("Failed to start boost. Please try again.");
      }
      setIsSubmitting(false);
    }
  }, [selectedAsset, actorProfileId, dailyBudget, durationDays, createPendingCampaign, createCheckoutSession]);

  // Format number with K/M suffix
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="relative mx-4 max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-red-200 bg-white shadow-2xl dark:border-red-900/40 dark:bg-[#11141b]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-red-100 px-6 py-4 dark:border-red-900/30">
            <div className="flex items-center gap-3">
              {step === "configure" && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">
                  {step === "select" ? "Boost an Asset" : "Configure Boost"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {step === "select"
                    ? "Select content to promote"
                    : "Set your budget and duration"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[calc(85vh-140px)] overflow-y-auto p-6">
            <AnimatePresence mode="wait">
              {step === "select" ? (
                <motion.div
                  key="select"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  {/* Asset Grid */}
                  {isLoadingAssets ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-red-500" />
                    </div>
                  ) : !recentAssets || recentAssets.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                        <Sparkles className="h-7 w-7 text-slate-400" />
                      </div>
                      <p className="font-medium text-slate-700 dark:text-slate-300">
                        No assets to boost yet
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Generate some clips, memes, or GIFs first
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {recentAssets.map((asset) => {
                        const Icon = ASSET_TYPE_ICONS[asset.type];
                        const color = ASSET_TYPE_COLORS[asset.type];
                        return (
                          <motion.button
                            key={asset._id}
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() =>
                              handleAssetSelect({
                                _id: asset._id,
                                type: asset.type,
                                title: asset.title,
                                thumbnailUrl: asset.thumbnailUrl,
                                score: asset.score ?? asset.viralScore,
                              })
                            }
                            className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition-colors hover:border-red-300 dark:border-slate-700 dark:bg-[#161a24] dark:hover:border-red-700"
                          >
                            {/* Thumbnail */}
                            <div className="relative aspect-[4/3] w-full bg-slate-100 dark:bg-[#1f2533]">
                              {asset.thumbnailUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={asset.thumbnailUrl}
                                  alt={asset.title}
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <Icon
                                    className="h-8 w-8 opacity-30"
                                    style={{ color }}
                                  />
                                </div>
                              )}

                              {/* Type badge */}
                              <div
                                className="absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                                style={{ backgroundColor: color }}
                              >
                                <Icon className="h-3 w-3" />
                              </div>

                              {/* Score badge */}
                              {(asset.score ?? asset.viralScore) !== undefined &&
                                (asset.score ?? asset.viralScore)! > 0 && (
                                  <div className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white">
                                    {asset.score ?? asset.viralScore}
                                  </div>
                                )}

                              {/* Hover overlay */}
                              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                                <div className="scale-0 rounded-full bg-white p-2 transition-transform group-hover:scale-100">
                                  <Zap className="h-4 w-4 text-amber-500" />
                                </div>
                              </div>
                            </div>

                            {/* Title */}
                            <div className="p-2">
                              <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">
                                {asset.title}
                              </p>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="configure"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  {/* Selected Asset Preview */}
                  {selectedAsset && (
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-[#161a24]">
                      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-700">
                        {selectedAsset.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selectedAsset.thumbnailUrl}
                            alt={selectedAsset.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            {(() => {
                              const Icon = ASSET_TYPE_ICONS[selectedAsset.type];
                              return <Icon className="h-5 w-5 text-slate-400" />;
                            })()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                          {selectedAsset.title}
                        </p>
                        <p className="text-xs capitalize text-slate-500">
                          {selectedAsset.type}
                        </p>
                      </div>
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                      </div>
                    </div>
                  )}

                  {/* Daily Budget */}
                  <div>
                    <label className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <span>Daily Budget</span>
                    </label>

                    {/* Budget Slider */}
                    <div className="mb-4">
                      <div className="relative mb-2">
                        <input
                          type="range"
                          min="1"
                          max="200"
                          step="1"
                          value={dailyBudget}
                          onChange={(e) => setDailyBudget(Number(e.target.value))}
                          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 dark:bg-slate-700 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">$1</span>
                        <div className="rounded-full bg-slate-100 px-4 py-1.5 dark:bg-slate-800">
                          <span className="text-lg font-bold text-slate-900 dark:text-white">
                            ${dailyBudget}
                          </span>
                          <span className="text-sm text-slate-500">/day</span>
                        </div>
                        <span className="text-xs text-slate-500">$200</span>
                      </div>
                    </div>

                    {/* Quick presets */}
                    <div className="flex flex-wrap gap-2">
                      {DAILY_BUDGET_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setDailyBudget(preset)}
                          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                            dailyBudget === preset
                              ? "bg-red-500 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          }`}
                        >
                          ${preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Duration */}
                  <div>
                    <label className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <Calendar className="h-4 w-4" />
                      <span>Duration</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {DURATION_OPTIONS.map((option) => (
                        <button
                          key={option.days}
                          type="button"
                          onClick={() => setDurationDays(option.days)}
                          className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                            durationDays === option.days
                              ? "border-red-500 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-900/20 dark:text-red-400"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-[#161a24] dark:text-slate-300 dark:hover:border-slate-600"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Estimated Performance */}
                  <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 dark:border-blue-900/40 dark:from-blue-900/20 dark:to-indigo-900/20">
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-blue-900 dark:text-blue-300">
                      <TrendingUp className="h-4 w-4" />
                      Estimated Performance
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                          <Users className="h-3.5 w-3.5" />
                          Impressions
                        </div>
                        <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                          {formatNumber(estimates.impressionsMin)} - {formatNumber(estimates.impressionsMax)}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                          <ChevronRight className="h-3.5 w-3.5" />
                          Est. Clicks
                        </div>
                        <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                          {formatNumber(estimates.clicksMin)} - {formatNumber(estimates.clicksMax)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 border-t border-blue-200 pt-3 dark:border-blue-800">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">
                          Total campaign cost
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          ${estimates.totalBudget}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                        <span>~{formatNumber(estimates.dailyImpressionsAvg)} impressions/day</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          {step === "configure" && (
            <div className="border-t border-slate-200 px-6 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={handleStartBoost}
                disabled={isSubmitting || !selectedAsset}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-3 font-semibold text-white shadow-lg shadow-orange-500/30 transition-all hover:from-amber-500 hover:to-orange-600 hover:shadow-orange-500/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Preparing checkout...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="h-5 w-5" />
                    Continue to Payment - ${estimates.totalBudget}
                  </>
                )}
              </button>
              <p className="mt-2 text-center text-xs text-slate-500">
                Secure payment via Stripe. Cancel anytime.
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
