"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  BarChart3,
  Users,
  UserX,
  Activity,
  TrendingUp,
  Eye,
  Mail,
  Zap,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";

interface DeepAnalyticsProps {
  adminEmail: string;
}

export function DeepAnalytics({ adminEmail }: DeepAnalyticsProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>("overview");
  const [daysBack, setDaysBack] = useState(30);

  const siteStats = useQuery(api.adminPortal.getSiteWideStats, { adminEmail });
  const pageAnalytics = useQuery(api.adminPortal.getPageByPageAnalytics, {
    adminEmail,
    daysBack,
    limit: 20,
  });
  const engagement = useQuery(api.adminPortal.getUserEngagementLevels, {
    adminEmail,
    daysBack,
  });

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (!siteStats) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-3 text-slate-400">
          <BarChart3 className="h-5 w-5 animate-pulse" />
          <span>Loading analytics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-pink-600 via-pink-500 to-rose-500 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-pink-100">Deep Analytics</p>
            <h2 className="text-2xl font-semibold tracking-tight">Platform Overview</h2>
            <p className="mt-1 text-sm text-pink-100/90">
              User counts, signups, engagement levels, and page-by-page analytics
            </p>
          </div>
          <select
            value={daysBack}
            onChange={(e) => setDaysBack(Number(e.target.value))}
            className="rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white outline-none"
          >
            <option value={7} className="text-slate-900">Last 7 days</option>
            <option value={30} className="text-slate-900">Last 30 days</option>
            <option value={90} className="text-slate-900">Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Overview Stats */}
      <div
        className="rounded-2xl border border-pink-500/20 bg-white/5 overflow-hidden cursor-pointer"
        onClick={() => toggleSection("overview")}
      >
        <div className="flex items-center justify-between p-4 border-b border-pink-500/10">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-pink-400" />
            User Statistics
          </h3>
          {expandedSection === "overview" ? (
            <ChevronUp className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          )}
        </div>
        {expandedSection === "overview" && (
          <div className="p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Users}
              label="Total Users"
              value={siteStats.users.total}
              subtext={`+${siteStats.users.thisWeek} this week`}
            />
            <StatCard
              icon={FileText}
              label="With Profiles"
              value={siteStats.users.withProfiles}
              subtext={`${Math.round((siteStats.users.withProfiles / siteStats.users.total) * 100)}% completion`}
            />
            <StatCard
              icon={UserX}
              label="Without Profiles"
              value={siteStats.users.withoutProfiles}
              subtext="Incomplete onboarding"
              variant="warning"
            />
            <StatCard
              icon={Zap}
              label="Active (30d)"
              value={siteStats.users.activeAccounts}
              subtext="Had recent activity"
              variant="success"
            />
          </div>
        )}
      </div>

      {/* Profiles & Content */}
      <div
        className="rounded-2xl border border-pink-500/20 bg-white/5 overflow-hidden cursor-pointer"
        onClick={() => toggleSection("content")}
      >
        <div className="flex items-center justify-between p-4 border-b border-pink-500/10">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-pink-400" />
            Content & Profiles
          </h3>
          {expandedSection === "content" ? (
            <ChevronUp className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          )}
        </div>
        {expandedSection === "content" && (
          <div className="p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Users}
              label="Total Profiles"
              value={siteStats.profiles.total}
              subtext={`+${siteStats.profiles.thisWeek} this week`}
            />
            <StatCard
              icon={FileText}
              label="Projects"
              value={siteStats.content.projects}
              subtext={`${siteStats.content.projectsWithTrailer} with trailers`}
            />
            <StatCard
              icon={Mail}
              label="Fan Emails"
              value={siteStats.fanEmails.total}
              subtext={`${siteStats.fanEmails.active} active`}
            />
            <StatCard
              icon={Eye}
              label="Total Events"
              value={siteStats.events.total}
              subtext={`${siteStats.events.thisWeek} this week`}
            />
          </div>
        )}
      </div>

      {/* Engagement Levels */}
      {engagement && (
        <div
          className="rounded-2xl border border-pink-500/20 bg-white/5 overflow-hidden cursor-pointer"
          onClick={() => toggleSection("engagement")}
        >
          <div className="flex items-center justify-between p-4 border-b border-pink-500/10">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-pink-400" />
              Engagement Levels
            </h3>
            {expandedSection === "engagement" ? (
              <ChevronUp className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            )}
          </div>
          {expandedSection === "engagement" && (
            <div className="p-4">
              <div className="grid gap-4 sm:grid-cols-4 mb-6">
                <EngagementBar label="High" count={engagement.levelCounts.high} color="emerald" />
                <EngagementBar label="Medium" count={engagement.levelCounts.medium} color="amber" />
                <EngagementBar label="Low" count={engagement.levelCounts.low} color="orange" />
                <EngagementBar label="Inactive" count={engagement.levelCounts.inactive} color="slate" />
              </div>
              {engagement.topEngaged.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-400 mb-3">Top Engaged Profiles</p>
                  <div className="space-y-2">
                    {engagement.topEngaged.slice(0, 5).map((profile: { profileId: string; displayName: string; slug: string; engagementScore: number; pageViews: number }) => (
                      <div
                        key={profile.profileId}
                        className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                      >
                        <div>
                          <p className="font-medium text-white">{profile.displayName}</p>
                          <p className="text-xs text-slate-400">/{profile.slug}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-pink-400">{profile.engagementScore} pts</p>
                          <p className="text-xs text-slate-400">{profile.pageViews} views</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Page by Page Analytics */}
      {pageAnalytics && (
        <div
          className="rounded-2xl border border-pink-500/20 bg-white/5 overflow-hidden cursor-pointer"
          onClick={() => toggleSection("pages")}
        >
          <div className="flex items-center justify-between p-4 border-b border-pink-500/10">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Eye className="h-5 w-5 text-pink-400" />
              Page Analytics ({pageAnalytics.period})
            </h3>
            {expandedSection === "pages" ? (
              <ChevronUp className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            )}
          </div>
          {expandedSection === "pages" && (
            <div className="p-4">
              {/* Totals */}
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-6">
                <MiniStat label="Page Views" value={pageAnalytics.totals.pageViews} />
                <MiniStat label="Unique Visitors" value={pageAnalytics.totals.uniqueVisitors} />
                <MiniStat label="Clip Plays" value={pageAnalytics.totals.clipPlays} />
                <MiniStat label="Emails Captured" value={pageAnalytics.totals.emailCaptures} />
                <MiniStat label="Inquiries" value={pageAnalytics.totals.inquiries} />
                <MiniStat label="Fan Emails" value={pageAnalytics.totals.totalFanEmails} />
              </div>

              {/* Pages Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-white/10">
                      <th className="pb-3 pr-4">Profile</th>
                      <th className="pb-3 px-2 text-right">Views</th>
                      <th className="pb-3 px-2 text-right">Visitors</th>
                      <th className="pb-3 px-2 text-right">Clips</th>
                      <th className="pb-3 px-2 text-right">Emails</th>
                      <th className="pb-3 pl-2 text-right">Conv %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pageAnalytics.pages.map((page: { profileId: string; displayName: string; ownerEmail?: string; pageViews: number; uniqueVisitors: number; clipPlays: number; emailCaptures: number; conversionRate: number }) => (
                      <tr key={page.profileId} className="hover:bg-white/5">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-white">{page.displayName}</p>
                          <p className="text-xs text-slate-400">{page.ownerEmail}</p>
                        </td>
                        <td className="py-3 px-2 text-right text-white">{page.pageViews}</td>
                        <td className="py-3 px-2 text-right text-slate-300">{page.uniqueVisitors}</td>
                        <td className="py-3 px-2 text-right text-slate-300">{page.clipPlays}</td>
                        <td className="py-3 px-2 text-right text-slate-300">{page.emailCaptures}</td>
                        <td className="py-3 pl-2 text-right">
                          <span className={`${page.conversionRate > 5 ? 'text-emerald-400' : page.conversionRate > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                            {page.conversionRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  variant = "default",
}: {
  icon: typeof Users;
  label: string;
  value: number;
  subtext: string;
  variant?: "default" | "warning" | "success";
}) {
  const colors = {
    default: "text-pink-400",
    warning: "text-amber-400",
    success: "text-emerald-400",
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <Icon className={`h-6 w-6 ${colors[variant]} mb-2`} />
      <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
      <p className="text-sm font-medium text-white">{label}</p>
      <p className="text-xs text-slate-400">{subtext}</p>
    </div>
  );
}

function EngagementBar({ label, count, color }: { label: string; count: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    orange: "bg-orange-500",
    slate: "bg-slate-500",
  };

  return (
    <div className="text-center">
      <div className={`h-2 rounded-full ${colorMap[color]} mb-2`} />
      <p className="text-xl font-bold text-white">{count}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center p-3 rounded-lg bg-white/5 border border-white/10">
      <p className="text-lg font-bold text-white">{value.toLocaleString()}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
