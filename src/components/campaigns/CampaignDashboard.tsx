"use client";

import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Mail,
  Plus,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  MousePointerClick,
  Users,
  Sparkles,
  ChevronRight,
  MoreVertical,
  Calendar,
  AlertCircle,
  Loader2,
  FileText,
  Globe,
} from "lucide-react";
import { CampaignComposer } from "./CampaignComposer";
import { CampaignMetricsView } from "./CampaignMetricsView";
import { AudienceManager } from "./AudienceManager";
import { AdminCampaignDashboard } from "./AdminCampaignDashboard";
import { useSuperadmin } from "@/hooks/useSuperadmin";

interface CampaignDashboardProps {
  actorProfileId: Id<"actor_profiles">;
}

type ViewMode = "list" | "compose" | "metrics" | "audience";
type CampaignTab = "my-campaigns" | "platform-campaigns";

export function CampaignDashboard({ actorProfileId }: CampaignDashboardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedCampaignId, setSelectedCampaignId] = useState<Id<"email_campaigns"> | null>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CampaignTab>("my-campaigns");
  const { isSuperadmin } = useSuperadmin();

  // Fetch campaigns
  const campaigns = useQuery(api.campaigns.getCampaigns, { actorProfileId });
  const templates = useQuery(api.campaignTemplates.getActiveTemplates, {});
  const audienceStats = useQuery(api.audienceManagement.getAudienceStats, { actorProfileId });

  const handleNewCampaign = (templateKey?: string) => {
    setSelectedTemplateKey(templateKey || null);
    setSelectedCampaignId(null);
    setViewMode("compose");
  };

  const handleEditCampaign = (campaignId: Id<"email_campaigns">) => {
    setSelectedCampaignId(campaignId);
    setViewMode("compose");
  };

  const handleViewMetrics = (campaignId: Id<"email_campaigns">) => {
    setSelectedCampaignId(campaignId);
    setViewMode("metrics");
  };

  const handleBack = () => {
    setViewMode("list");
    setSelectedCampaignId(null);
    setSelectedTemplateKey(null);
  };

  if (viewMode === "compose") {
    return (
      <CampaignComposer
        actorProfileId={actorProfileId}
        campaignId={selectedCampaignId}
        templateKey={selectedTemplateKey}
        onBack={handleBack}
      />
    );
  }

  if (viewMode === "metrics" && selectedCampaignId) {
    return (
      <CampaignMetricsView
        campaignId={selectedCampaignId}
        onBack={handleBack}
      />
    );
  }

  if (viewMode === "audience") {
    return (
      <AudienceManager
        actorProfileId={actorProfileId}
        onBack={handleBack}
      />
    );
  }

  // Show Platform Campaigns tab for superadmins
  if (activeTab === "platform-campaigns" && isSuperadmin) {
    return (
      <div className="space-y-6">
        {/* Tab Navigation for Superadmins */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("my-campaigns")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "my-campaigns"
                ? "bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Mail className="h-4 w-4" />
            My Campaigns
          </button>
          <button
            onClick={() => setActiveTab("platform-campaigns")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "platform-campaigns"
                ? "bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Globe className="h-4 w-4" />
            Platform Campaigns
          </button>
        </div>
        <AdminCampaignDashboard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation for Superadmins */}
      {isSuperadmin && (
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("my-campaigns")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "my-campaigns"
                ? "bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Mail className="h-4 w-4" />
            My Campaigns
          </button>
          <button
            onClick={() => setActiveTab("platform-campaigns")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "platform-campaigns"
                ? "bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Globe className="h-4 w-4" />
            Platform Campaigns
          </button>
        </div>
      )}

      {/* Header */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-carpet-red-800 via-carpet-red-600 to-red-500 p-4 sm:p-6 text-white shadow-lg shadow-red-950/40 ring-1 ring-red-300/30">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.25em] text-red-100">Email Campaigns</p>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">AI-Powered Email Marketing</h2>
            <p className="mt-1 text-sm text-red-100/90">
              Create personalized campaigns for your audience with AI-generated content
            </p>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <button
              onClick={() => setViewMode("audience")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
            >
              <Users className="h-4 w-4" />
              Audience ({audienceStats?.active || 0})
            </button>
            <button
              onClick={() => handleNewCampaign()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-red-600 font-medium hover:bg-red-50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Campaign
            </button>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="h-5 w-5 text-blue-500" />}
          label="Subscribers"
          value={audienceStats?.active || 0}
          subtext={`${audienceStats?.dataQuality?.withConsentPercent || 0}% with consent`}
        />
        <StatCard
          icon={<Send className="h-5 w-5 text-green-500" />}
          label="Campaigns Sent"
          value={campaigns?.filter(c => c.status === "sent").length || 0}
        />
        <StatCard
          icon={<FileText className="h-5 w-5 text-amber-500" />}
          label="Drafts"
          value={campaigns?.filter(c => c.status === "draft").length || 0}
        />
        <StatCard
          icon={<Clock className="h-5 w-5 text-purple-500" />}
          label="Scheduled"
          value={campaigns?.filter(c => c.status === "scheduled").length || 0}
        />
      </div>

      {/* Template Quick Start */}
      <div className="rounded-3xl border border-red-300 bg-white p-6 shadow-lg shadow-red-200/50 dark:border-red-900/50 dark:bg-[#0f1219] dark:shadow-red-950/30">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-red-500" />
          Quick Start Templates
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {templates?.slice(0, 8).map((template) => (
            <button
              key={template._id}
              onClick={() => handleNewCampaign(template.key)}
              className="text-left p-4 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 hover:border-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:border-red-900/50 dark:hover:border-red-700 transition-all group"
            >
              <div className="font-medium text-slate-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                {template.name}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                {template.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Campaign List */}
      <div className="rounded-3xl border border-red-300 bg-white shadow-lg shadow-red-200/50 dark:border-red-900/50 dark:bg-[#0f1219] dark:shadow-red-950/30 overflow-hidden">
        <div className="px-6 py-4 border-b border-red-200 dark:border-red-900/50">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Your Campaigns</h3>
        </div>

        {!campaigns ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-red-500" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12">
            <Mail className="h-12 w-12 text-red-300 dark:text-red-800 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 mb-4">No campaigns yet</p>
            <button
              onClick={() => handleNewCampaign()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white font-medium shadow-md shadow-red-950/30 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Your First Campaign
            </button>
          </div>
        ) : (
          <div className="divide-y divide-red-100 dark:divide-red-900/50">
            {campaigns.map((campaign) => (
              <CampaignRow
                key={campaign._id}
                campaign={campaign}
                onEdit={() => handleEditCampaign(campaign._id)}
                onViewMetrics={() => handleViewMetrics(campaign._id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtext,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  subtext?: string;
}) {
  return (
    <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <span className="text-slate-500 dark:text-slate-400 text-sm">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
      {subtext && <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtext}</div>}
    </div>
  );
}

function CampaignRow({
  campaign,
  onEdit,
  onViewMetrics,
}: {
  campaign: {
    _id: Id<"email_campaigns">;
    name: string;
    subject: string;
    status: string;
    createdAt: number;
    sentAt?: number;
    scheduledAt?: number;
    recipientCount?: number;
    openCount?: number;
    clickCount?: number;
  };
  onEdit: () => void;
  onViewMetrics: () => void;
}) {
  const getStatusIcon = () => {
    switch (campaign.status) {
      case "draft":
        return <FileText className="h-4 w-4 text-slate-400" />;
      case "scheduled":
        return <Clock className="h-4 w-4 text-purple-400" />;
      case "sending":
        return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
      case "sent":
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-400" />;
      default:
        return <Mail className="h-4 w-4 text-slate-400" />;
    }
  };

  const getStatusLabel = () => {
    switch (campaign.status) {
      case "draft":
        return "Draft";
      case "scheduled":
        return `Scheduled for ${new Date(campaign.scheduledAt!).toLocaleDateString()}`;
      case "sending":
        return "Sending...";
      case "sent":
        return `Sent ${new Date(campaign.sentAt!).toLocaleDateString()}`;
      case "failed":
        return "Failed";
      default:
        return campaign.status;
    }
  };

  const openRate = campaign.recipientCount && campaign.openCount
    ? Math.round((campaign.openCount / campaign.recipientCount) * 100)
    : null;

  const clickRate = campaign.recipientCount && campaign.clickCount
    ? Math.round((campaign.clickCount / campaign.recipientCount) * 100)
    : null;

  return (
    <div className="px-6 py-4 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <h4 className="font-medium text-slate-900 dark:text-white truncate">{campaign.name}</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{campaign.subject}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 ml-4">
          {/* Metrics for sent campaigns */}
          {campaign.status === "sent" && (
            <div className="hidden md:flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <Users className="h-4 w-4" />
                <span>{campaign.recipientCount || 0}</span>
              </div>
              {openRate !== null && (
                <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                  <Eye className="h-4 w-4" />
                  <span>{openRate}%</span>
                </div>
              )}
              {clickRate !== null && (
                <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                  <MousePointerClick className="h-4 w-4" />
                  <span>{clickRate}%</span>
                </div>
              )}
            </div>
          )}

          <div className="text-sm text-slate-500 dark:text-slate-400">{getStatusLabel()}</div>

          <div className="flex items-center gap-2">
            {campaign.status === "sent" ? (
              <button
                onClick={onViewMetrics}
                className="px-3 py-1.5 rounded-full border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-800/50 text-sm transition-colors"
              >
                View Report
              </button>
            ) : (
              <button
                onClick={onEdit}
                className="px-3 py-1.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-sm shadow-sm shadow-red-950/30 transition-colors"
              >
                {campaign.status === "draft" ? "Edit" : "View"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
