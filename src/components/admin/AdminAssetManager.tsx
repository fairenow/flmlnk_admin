"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  Layers,
  Play,
  Image,
  Film,
  Video,
  Clock,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { useState } from "react";

interface AdminAssetManagerProps {
  adminEmail: string;
}

type AssetTab = "clips" | "memes" | "gifs";

export function AdminAssetManager({ adminEmail }: AdminAssetManagerProps) {
  const [activeTab, setActiveTab] = useState<AssetTab>("clips");
  const [expandedSection, setExpandedSection] = useState<string | null>("assets");

  const summary = useQuery(api.adminPortal.getAssetsSummary, { adminEmail });
  const clips = useQuery(api.adminPortal.getAllGeneratedClips, { adminEmail, limit: 50 });
  const memes = useQuery(api.adminPortal.getAllGeneratedMemes, { adminEmail, limit: 50 });
  const gifs = useQuery(api.adminPortal.getAllGeneratedGifs, { adminEmail, limit: 50 });

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (!summary) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-3 text-slate-400">
          <Layers className="h-5 w-5 animate-pulse" />
          <span>Loading assets...</span>
        </div>
      </div>
    );
  }

  const currentAssets = activeTab === "clips" ? clips : activeTab === "memes" ? memes : gifs;
  const currentSummary = activeTab === "clips" ? summary.clips : activeTab === "memes" ? summary.memes : summary.gifs;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-carpet-red-800 via-carpet-red-600 to-red-500 p-6 text-white shadow-lg shadow-red-950/40">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-red-100">Admin Asset Manager</p>
            <h2 className="text-2xl font-semibold tracking-tight">Generated Assets</h2>
            <p className="mt-1 text-sm text-red-100/90">
              View all generated clips, memes, and GIFs across all users
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Play}
          label="Total Clips"
          value={summary.clips.total}
          subtext={`${summary.clips.thisWeek} this week`}
          active={activeTab === "clips"}
          onClick={() => setActiveTab("clips")}
        />
        <StatCard
          icon={Image}
          label="Total Memes"
          value={summary.memes.total}
          subtext={`${summary.memes.thisWeek} this week`}
          active={activeTab === "memes"}
          onClick={() => setActiveTab("memes")}
        />
        <StatCard
          icon={Film}
          label="Total GIFs"
          value={summary.gifs.total}
          subtext={`${summary.gifs.thisWeek} this week`}
          active={activeTab === "gifs"}
          onClick={() => setActiveTab("gifs")}
        />
        <StatCard
          icon={Video}
          label="Trailers"
          value={summary.trailers.total}
          subtext={`${summary.trailers.processing} processing`}
        />
      </div>

      {/* Time Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-red-200 dark:border-white/10 bg-red-50 dark:bg-white/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-red-500" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Today</p>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">Clips: {summary.clips.today}</span>
            <span className="text-slate-600 dark:text-slate-400">Memes: {summary.memes.today}</span>
            <span className="text-slate-600 dark:text-slate-400">GIFs: {summary.gifs.today}</span>
          </div>
        </div>
        <div className="rounded-xl border border-red-200 dark:border-white/10 bg-red-50 dark:bg-white/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-red-500" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">This Week</p>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">Clips: {summary.clips.thisWeek}</span>
            <span className="text-slate-600 dark:text-slate-400">Memes: {summary.memes.thisWeek}</span>
            <span className="text-slate-600 dark:text-slate-400">GIFs: {summary.gifs.thisWeek}</span>
          </div>
        </div>
        <div className="rounded-xl border border-red-200 dark:border-white/10 bg-red-50 dark:bg-white/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-red-500" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">This Month</p>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">Clips: {summary.clips.thisMonth}</span>
            <span className="text-slate-600 dark:text-slate-400">Memes: {summary.memes.thisMonth}</span>
            <span className="text-slate-600 dark:text-slate-400">GIFs: {summary.gifs.thisMonth}</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-red-200 dark:border-red-900/50">
        {[
          { id: "clips" as AssetTab, label: "Clips", icon: Play, count: summary.clips.total },
          { id: "memes" as AssetTab, label: "Memes", icon: Image, count: summary.memes.total },
          { id: "gifs" as AssetTab, label: "GIFs", icon: Film, count: summary.gifs.total },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-red-500 text-red-600 dark:text-red-400"
                : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            <span className="rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Assets List */}
      <div
        className="rounded-2xl border border-red-300 bg-white dark:border-red-900/50 dark:bg-[#0f1219] overflow-hidden cursor-pointer shadow-lg"
        onClick={() => toggleSection("assets")}
      >
        <div className="flex items-center justify-between p-4 border-b border-red-200 dark:border-red-900/50">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="h-5 w-5 text-red-500" />
            {activeTab === "clips" ? "Generated Clips" : activeTab === "memes" ? "Generated Memes" : "Generated GIFs"} ({currentAssets?.length || 0})
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{currentSummary.profilesUsing} profiles using</span>
            {expandedSection === "assets" ? (
              <ChevronUp className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            )}
          </div>
        </div>
        {expandedSection === "assets" && (
          <div className="p-4">
            {activeTab === "clips" && clips && (
              <ClipsTable clips={clips} />
            )}
            {activeTab === "memes" && memes && (
              <MemesGrid memes={memes} />
            )}
            {activeTab === "gifs" && gifs && (
              <GifsGrid gifs={gifs} />
            )}
          </div>
        )}
      </div>

      {/* Trailer Jobs Status */}
      <div className="rounded-2xl border border-red-300 bg-white dark:border-red-900/50 dark:bg-[#0f1219] p-4 shadow-lg">
        <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
          <Video className="h-5 w-5 text-red-500" />
          Trailer Processing Queue
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.trailers.pending}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Pending</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/50">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{summary.trailers.processing}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Processing</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/50">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.trailers.completed}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Completed</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  active = false,
  onClick,
}: {
  icon: typeof Layers;
  label: string;
  value: number;
  subtext: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-xl border p-4 transition ${
        onClick ? "cursor-pointer" : ""
      } ${
        active
          ? "border-red-500 bg-red-100 dark:bg-red-900/30"
          : "border-red-200 dark:border-white/10 bg-red-50 dark:bg-white/5 hover:border-red-300 dark:hover:border-red-800"
      }`}
      onClick={onClick}
    >
      <Icon className={`h-6 w-6 mb-2 ${active ? "text-red-600 dark:text-red-400" : "text-red-500"}`} />
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value.toLocaleString()}</p>
      <p className="text-sm font-medium text-slate-700 dark:text-white">{label}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{subtext}</p>
    </div>
  );
}

type ClipRecord = {
  _id: string;
  title: string;
  status: string;
  thumbnailUrl?: string | null;
  videoUrl?: string;
  duration?: number;
  createdAt: number;
  profileName?: string;
  profileSlug?: string;
  userName?: string;
  userEmail?: string;
};

function ClipsTable({ clips }: { clips: ClipRecord[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-red-200 dark:border-white/10">
            <th className="pb-3 pr-4">Clip</th>
            <th className="pb-3 px-2">Profile</th>
            <th className="pb-3 px-2">Status</th>
            <th className="pb-3 px-2 text-right">Duration</th>
            <th className="pb-3 pl-2 text-right">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-red-100 dark:divide-white/5">
          {clips.map((clip) => (
            <tr key={clip._id} className="hover:bg-red-50 dark:hover:bg-white/5">
              <td className="py-3 pr-4">
                <div className="flex items-center gap-3">
                  {clip.thumbnailUrl ? (
                    <img
                      src={clip.thumbnailUrl}
                      alt={clip.title}
                      className="h-10 w-16 rounded object-cover"
                    />
                  ) : (
                    <div className="h-10 w-16 rounded bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <Play className="h-4 w-4 text-red-500" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white line-clamp-1">{clip.title}</p>
                    {clip.videoUrl && (
                      <a
                        href={clip.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" /> View
                      </a>
                    )}
                  </div>
                </div>
              </td>
              <td className="py-3 px-2">
                <p className="font-medium text-slate-900 dark:text-white">{clip.profileName}</p>
                <p className="text-xs text-slate-400">{clip.userEmail}</p>
              </td>
              <td className="py-3 px-2">
                <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                  clip.status === "ready"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                }`}>
                  {clip.status}
                </span>
              </td>
              <td className="py-3 px-2 text-right text-slate-600 dark:text-slate-300">
                {clip.duration ? `${Math.round(clip.duration)}s` : "-"}
              </td>
              <td className="py-3 pl-2 text-right text-slate-500 dark:text-slate-400 text-xs">
                {new Date(clip.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {clips.length === 0 && (
        <div className="text-center py-8 text-slate-400">No clips found</div>
      )}
    </div>
  );
}

type MemeRecord = {
  _id: string;
  caption?: string;
  imageUrl?: string | null;
  templateName?: string;
  createdAt: number;
  profileName?: string;
  profileSlug?: string;
  userName?: string;
  userEmail?: string;
};

function MemesGrid({ memes }: { memes: MemeRecord[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {memes.map((meme) => (
        <div key={meme._id} className="rounded-lg border border-red-200 dark:border-white/10 overflow-hidden bg-white dark:bg-slate-900">
          {meme.imageUrl ? (
            <img
              src={meme.imageUrl}
              alt={meme.caption || "Meme"}
              className="w-full h-32 object-cover"
            />
          ) : (
            <div className="w-full h-32 bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <Image className="h-8 w-8 text-red-500" />
            </div>
          )}
          <div className="p-3">
            <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-2">{meme.caption || "No caption"}</p>
            <p className="text-xs text-slate-400 mt-1">{meme.profileName}</p>
            <p className="text-xs text-slate-400">{new Date(meme.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
      ))}
      {memes.length === 0 && (
        <div className="col-span-full text-center py-8 text-slate-400">No memes found</div>
      )}
    </div>
  );
}

type GifRecord = {
  _id: string;
  title?: string;
  gifUrl?: string | null;
  duration?: number;
  createdAt: number;
  profileName?: string;
  profileSlug?: string;
  userName?: string;
  userEmail?: string;
};

function GifsGrid({ gifs }: { gifs: GifRecord[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {gifs.map((gif) => (
        <div key={gif._id} className="rounded-lg border border-red-200 dark:border-white/10 overflow-hidden bg-white dark:bg-slate-900">
          {gif.gifUrl ? (
            <img
              src={gif.gifUrl}
              alt={gif.title || "GIF"}
              className="w-full h-32 object-cover"
            />
          ) : (
            <div className="w-full h-32 bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <Film className="h-8 w-8 text-red-500" />
            </div>
          )}
          <div className="p-3">
            <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-1">{gif.title || "Untitled GIF"}</p>
            <p className="text-xs text-slate-400 mt-1">{gif.profileName}</p>
            <div className="flex justify-between items-center mt-1">
              <p className="text-xs text-slate-400">{gif.duration ? `${Math.round(gif.duration)}s` : "-"}</p>
              <p className="text-xs text-slate-400">{new Date(gif.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      ))}
      {gifs.length === 0 && (
        <div className="col-span-full text-center py-8 text-slate-400">No GIFs found</div>
      )}
    </div>
  );
}
