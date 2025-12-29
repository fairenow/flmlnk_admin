"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Gift,
  Search,
  Zap,
  Loader2,
  PlayCircle,
  Image,
  Film,
  User,
  CheckCircle,
} from "lucide-react";

export function AdminGiftBoostTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<{
    id: Id<"actor_profiles">;
    name: string;
    slug: string;
  } | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<{
    id: string;
    type: "clip" | "meme" | "gif";
    title: string;
  } | null>(null);
  const [budgetCents, setBudgetCents] = useState(2500);
  const [durationDays, setDurationDays] = useState(7);
  const [reason, setReason] = useState("featured");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Search for profiles
  const allProfiles = useQuery(api.adminEmails.getAllFilmmakersRecipients, {});
  const filteredProfiles = allProfiles?.filter((p) =>
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.slug?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.email?.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 10);

  // Get assets for selected profile
  const clips = useQuery(
    api.generatedClips.getGeneratedClips,
    selectedProfile ? { actorProfileId: selectedProfile.id } : "skip"
  );
  const memes = useQuery(
    api.generatedMemes.getMemes,
    selectedProfile ? { actorProfileId: selectedProfile.id } : "skip"
  );
  const gifs = useQuery(
    api.generatedGifs.getGifs,
    selectedProfile ? { actorProfileId: selectedProfile.id } : "skip"
  );

  const giftBoost = useMutation(api.adminBoost.giftBoostToUser);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile || !selectedAsset) return;

    setIsSubmitting(true);
    try {
      await giftBoost({
        actorProfileId: selectedProfile.id,
        assetId: selectedAsset.id,
        assetType: selectedAsset.type,
        budgetCents,
        durationDays,
        reason,
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setSelectedProfile(null);
        setSelectedAsset(null);
      }, 3000);
    } catch (error) {
      console.error("Failed to gift boost:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
          <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          Boost Gifted Successfully!
        </h3>
        <p className="text-slate-500 dark:text-slate-400">
          ${(budgetCents / 100).toFixed(2)} boost for {durationDays} days
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Step 1: Select Profile */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
          <User className="h-4 w-4" />
          1. Select Filmmaker
        </h3>

        {!selectedProfile ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, slug, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
              />
            </div>

            {searchQuery && filteredProfiles && (
              <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
                {filteredProfiles.map((profile) => (
                  <button
                    key={profile.profileId}
                    type="button"
                    onClick={() =>
                      setSelectedProfile({
                        id: profile.profileId,
                        name: profile.name || "Unknown",
                        slug: profile.slug || "",
                      })
                    }
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <p className="font-medium text-slate-900 dark:text-white">
                      {profile.name}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      @{profile.slug} • {profile.email}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900 dark:text-white">
                {selectedProfile.name}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                @{selectedProfile.slug}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedProfile(null);
                setSelectedAsset(null);
              }}
              className="text-sm text-amber-600 hover:text-amber-700 dark:text-amber-400"
            >
              Change
            </button>
          </div>
        )}
      </div>

      {/* Step 2: Select Asset */}
      {selectedProfile && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4" />
            2. Select Asset to Boost
          </h3>

          {!selectedAsset ? (
            <div className="space-y-4">
              {/* Clips */}
              {clips && clips.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                    <PlayCircle className="h-3 w-3" /> Clips
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {clips.slice(0, 6).map((clip) => (
                      <button
                        key={clip._id}
                        type="button"
                        onClick={() =>
                          setSelectedAsset({
                            id: clip._id,
                            type: "clip",
                            title: clip.title,
                          })
                        }
                        className="aspect-video rounded-lg bg-slate-100 dark:bg-slate-700 overflow-hidden hover:ring-2 hover:ring-amber-500 transition-all"
                      >
                        {clip.thumbnailUrl ? (
                          <img
                            src={clip.thumbnailUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <PlayCircle className="h-6 w-6 text-slate-400" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Memes */}
              {memes && memes.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                    <Image className="h-3 w-3" /> Memes
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {memes.slice(0, 6).map((meme) => (
                      <button
                        key={meme._id}
                        type="button"
                        onClick={() =>
                          setSelectedAsset({
                            id: meme._id,
                            type: "meme",
                            title: meme.caption?.slice(0, 30) || "Meme",
                          })
                        }
                        className="aspect-square rounded-lg bg-slate-100 dark:bg-slate-700 overflow-hidden hover:ring-2 hover:ring-amber-500 transition-all"
                      >
                        {meme.memeUrl ? (
                          <img
                            src={meme.memeUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <Image className="h-6 w-6 text-slate-400" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* GIFs */}
              {gifs && gifs.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                    <Film className="h-3 w-3" /> GIFs
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {gifs.slice(0, 6).map((gif) => (
                      <button
                        key={gif._id}
                        type="button"
                        onClick={() =>
                          setSelectedAsset({
                            id: gif._id,
                            type: "gif",
                            title: gif.title || "GIF",
                          })
                        }
                        className="aspect-square rounded-lg bg-slate-100 dark:bg-slate-700 overflow-hidden hover:ring-2 hover:ring-amber-500 transition-all"
                      >
                        {gif.gifUrl ? (
                          <img
                            src={gif.gifUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <Film className="h-6 w-6 text-slate-400" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(!clips || clips.length === 0) &&
                (!memes || memes.length === 0) &&
                (!gifs || gifs.length === 0) && (
                  <p className="text-center text-slate-500 dark:text-slate-400 py-4">
                    No assets found for this filmmaker
                  </p>
                )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  {selectedAsset.type === "clip" && <PlayCircle className="h-5 w-5 text-amber-600" />}
                  {selectedAsset.type === "meme" && <Image className="h-5 w-5 text-amber-600" />}
                  {selectedAsset.type === "gif" && <Film className="h-5 w-5 text-amber-600" />}
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {selectedAsset.title}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 capitalize">
                    {selectedAsset.type}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="text-sm text-amber-600 hover:text-amber-700 dark:text-amber-400"
              >
                Change
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Configure Boost */}
      {selectedAsset && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
            <Gift className="h-4 w-4" />
            3. Configure Gift
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Budget
              </label>
              <select
                value={budgetCents}
                onChange={(e) => setBudgetCents(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
              >
                <option value={1000}>$10</option>
                <option value={2500}>$25</option>
                <option value={5000}>$50</option>
                <option value={10000}>$100</option>
                <option value={25000}>$250</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Duration
              </label>
              <select
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
              >
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Reason
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
              >
                <option value="featured">Featured Content</option>
                <option value="contest_winner">Contest Winner</option>
                <option value="promotional">Promotional</option>
                <option value="welcome_bonus">Welcome Bonus</option>
                <option value="loyalty_reward">Loyalty Reward</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      {selectedAsset && (
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium shadow-lg shadow-orange-500/30 hover:shadow-xl hover:shadow-orange-500/40 disabled:opacity-50 transition-all"
        >
          {isSubmitting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Gift className="h-5 w-5" />
              Gift ${(budgetCents / 100).toFixed(2)} Boost
            </>
          )}
        </button>
      )}
    </form>
  );
}
