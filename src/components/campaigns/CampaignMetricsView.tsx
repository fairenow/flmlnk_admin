"use client";

import { type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowLeft,
  Mail,
  Users,
  Eye,
  MousePointerClick,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Clock,
  Download,
  ExternalLink,
  Loader2,
} from "lucide-react";

interface CampaignMetricsViewProps {
  campaignId: Id<"email_campaigns">;
  onBack: () => void;
}

export function CampaignMetricsView({ campaignId, onBack }: CampaignMetricsViewProps) {
  const metrics = useQuery(api.campaignMetrics.getCampaignMetrics, { campaignId });
  const csvData = useQuery(api.campaignMetrics.exportCampaignMetrics, { campaignId });

  const handleExportCsv = () => {
    if (!csvData) return;

    const blob = new Blob([csvData], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-${campaignId}-metrics.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!metrics) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{metrics.campaignName}</h2>
            <p className="text-slate-500 dark:text-slate-400">
              Sent {metrics.sentAt ? new Date(metrics.sentAt).toLocaleString() : "Not sent"}
            </p>
          </div>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={!csvData}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-800/50 transition-colors disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard
          icon={<Users className="h-5 w-5 text-blue-500" />}
          label="Recipients"
          value={metrics.totalRecipients}
          sublabel={`${metrics.delivered} delivered`}
        />
        <MetricCard
          icon={<Eye className="h-5 w-5 text-green-500" />}
          label="Opened"
          value={metrics.opened}
          sublabel={`${metrics.openRate}% open rate`}
          highlight={metrics.openRate > 20}
        />
        <MetricCard
          icon={<MousePointerClick className="h-5 w-5 text-purple-500" />}
          label="Clicked"
          value={metrics.clicked}
          sublabel={`${metrics.clickRate}% click rate`}
          highlight={metrics.clickRate > 2}
        />
        <MetricCard
          icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
          label="Bounced"
          value={metrics.bounced}
          sublabel={`${metrics.bounceRate}% bounce rate`}
          warning={metrics.bounceRate > 5}
        />
        <MetricCard
          icon={<XCircle className="h-5 w-5 text-red-500" />}
          label="Unsubscribed"
          value={metrics.unsubscribed}
          sublabel={`${metrics.unsubscribeRate}%`}
          warning={metrics.unsubscribeRate > 1}
        />
      </div>

      {/* Performance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Engagement Funnel */}
        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-red-500" />
            Engagement Funnel
          </h3>
          <div className="space-y-4">
            <FunnelBar label="Sent" value={metrics.sent} max={metrics.totalRecipients} color="blue" />
            <FunnelBar label="Delivered" value={metrics.delivered} max={metrics.totalRecipients} color="green" />
            <FunnelBar label="Opened" value={metrics.opened} max={metrics.totalRecipients} color="purple" />
            <FunnelBar label="Clicked" value={metrics.clicked} max={metrics.totalRecipients} color="red" />
          </div>
        </div>

        {/* Click Breakdown */}
        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <MousePointerClick className="h-5 w-5 text-red-500" />
            Link Clicks
          </h3>
          {metrics.clicksByUrl.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 text-sm">No clicks recorded yet</p>
          ) : (
            <div className="space-y-3">
              {metrics.clicksByUrl.slice(0, 5).map((click, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <ExternalLink className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-600 dark:text-slate-300 truncate">{click.url}</span>
                  </div>
                  <span className="text-sm font-medium text-slate-900 dark:text-white ml-2">{click.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      {metrics.timeline.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-red-500" />
            Activity Timeline
          </h3>
          <div className="h-48 flex items-end gap-1">
            {metrics.timeline.map((point, i) => {
              const maxValue = Math.max(...metrics.timeline.map((t) => t.opens + t.clicks));
              const height = maxValue > 0 ? ((point.opens + point.clicks) / maxValue) * 100 : 0;

              return (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-gradient-to-t from-red-600 to-red-400 rounded-t"
                    style={{ height: `${height}%`, minHeight: point.opens + point.clicks > 0 ? "4px" : "0" }}
                  />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    {new Date(point.timestamp).getHours()}:00
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delivery Status */}
      <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Delivery Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">{metrics.delivered}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Delivered</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">{metrics.bounced}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Bounced</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-500" />
            <div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">{metrics.failed}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Failed</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-red-500" />
            <div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">{metrics.complained}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Spam Reports</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sublabel,
  highlight,
  warning,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  sublabel?: string;
  highlight?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-[#0f1219] ${
        warning
          ? "border-amber-300 dark:border-amber-700"
          : highlight
          ? "border-green-300 dark:border-green-700"
          : "border-red-200 dark:border-red-900/50"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white">{value.toLocaleString()}</div>
      {sublabel && (
        <div
          className={`text-xs mt-1 ${
            warning ? "text-amber-600 dark:text-amber-400" : highlight ? "text-green-600 dark:text-green-400" : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {sublabel}
        </div>
      )}
    </div>
  );
}

function FunnelBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: "blue" | "green" | "purple" | "red";
}) {
  const percentage = max > 0 ? (value / max) * 100 : 0;

  const colorClasses = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    purple: "bg-purple-500",
    red: "bg-red-500",
  };

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-slate-900 dark:text-white font-medium">{value.toLocaleString()}</span>
      </div>
      <div className="h-2 bg-red-100 dark:bg-red-900/30 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClasses[color]} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
