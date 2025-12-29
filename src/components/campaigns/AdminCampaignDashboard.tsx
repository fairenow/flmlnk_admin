"use client";

import { useState, type ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
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
  Globe,
  Sparkles,
  Loader2,
  FileText,
  Filter,
  ChevronDown,
  Trash2,
  Calendar,
  ArrowLeft,
} from "lucide-react";

type ViewMode = "list" | "compose" | "metrics";

interface AdminCampaignDashboardProps {
  adminEmail: string;
  onBack?: () => void;
}

export function AdminCampaignDashboard({ adminEmail, onBack }: AdminCampaignDashboardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedCampaignId, setSelectedCampaignId] = useState<Id<"admin_email_campaigns"> | null>(null);
  const [audienceType, setAudienceType] = useState<string>("all_filmmakers");
  const [showFilters, setShowFilters] = useState(false);

  // Fetch admin campaigns
  const campaigns = useQuery(api.adminEmails.getCampaigns, { adminEmail });
  const audiencePreview = useQuery(api.adminEmails.getAudiencePreview, {
    adminEmail,
    audienceType,
  });

  // Mutations
  const createCampaign = useMutation(api.adminEmails.createCampaign);
  const deleteCampaign = useMutation(api.adminEmails.deleteCampaign);
  const cancelCampaign = useMutation(api.adminEmails.cancelCampaign);

  const handleNewCampaign = () => {
    setSelectedCampaignId(null);
    setViewMode("compose");
  };

  const handleEditCampaign = (campaignId: Id<"admin_email_campaigns">) => {
    setSelectedCampaignId(campaignId);
    setViewMode("compose");
  };

  const handleViewMetrics = (campaignId: Id<"admin_email_campaigns">) => {
    setSelectedCampaignId(campaignId);
    setViewMode("metrics");
  };

  const handleBack = () => {
    setViewMode("list");
    setSelectedCampaignId(null);
  };

  const handleDeleteCampaign = async (campaignId: Id<"admin_email_campaigns">) => {
    if (confirm("Are you sure you want to delete this draft campaign?")) {
      await deleteCampaign({ adminEmail, campaignId });
    }
  };

  const handleCancelCampaign = async (campaignId: Id<"admin_email_campaigns">) => {
    if (confirm("Are you sure you want to cancel this campaign?")) {
      await cancelCampaign({ adminEmail, campaignId });
    }
  };

  if (viewMode === "compose") {
    return (
      <AdminCampaignComposer
        adminEmail={adminEmail}
        campaignId={selectedCampaignId}
        onBack={handleBack}
      />
    );
  }

  if (viewMode === "metrics" && selectedCampaignId) {
    return (
      <AdminCampaignMetrics
        adminEmail={adminEmail}
        campaignId={selectedCampaignId}
        onBack={handleBack}
      />
    );
  }

  const draftCount = campaigns?.filter(c => c.status === "draft").length ?? 0;
  const scheduledCount = campaigns?.filter(c => c.status === "scheduled").length ?? 0;
  const sentCount = campaigns?.filter(c => c.status === "sent").length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-carpet-red-800 via-carpet-red-600 to-red-500 p-4 sm:p-6 text-white shadow-lg shadow-red-950/40 ring-1 ring-red-300/30">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="h-4 w-4 text-red-200" />
              <p className="text-xs uppercase tracking-[0.25em] text-red-100">Platform Campaigns</p>
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Email All Users</h2>
            <p className="mt-1 text-sm text-red-100/90">
              Send platform-wide campaigns to filmmakers, incomplete signups, or fan subscribers
            </p>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <div className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-2">
              <Users className="h-4 w-4" />
              <span className="text-sm font-medium">
                {audiencePreview?.count ?? 0} Recipients
              </span>
            </div>
            <button
              onClick={handleNewCampaign}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-red-600 font-medium hover:bg-red-50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Campaign
            </button>
          </div>
        </div>
      </div>

      {/* Audience Selector */}
      <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Target Audience</h3>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
          >
            <Filter className="h-3 w-3" />
            Filters
            <ChevronDown className={`h-3 w-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all_filmmakers", label: "All Filmmakers", icon: Users },
            { id: "incomplete_onboarding", label: "Incomplete Signups", icon: Clock },
            { id: "fan_subscribers", label: "Fan Subscribers", icon: Mail },
          ].map((audience) => (
            <button
              key={audience.id}
              onClick={() => setAudienceType(audience.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                audienceType === audience.id
                  ? "bg-red-600 text-white shadow-md"
                  : "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300"
              }`}
            >
              <audience.icon className="h-4 w-4" />
              {audience.label}
              {audienceType === audience.id && audiencePreview && (
                <span className="ml-1 text-xs opacity-80">({audiencePreview.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="h-5 w-5 text-red-500" />}
          label="Total Reach"
          value={audiencePreview?.count ?? 0}
          subtext="Unique recipients"
        />
        <StatCard
          icon={<FileText className="h-5 w-5 text-amber-500" />}
          label="Drafts"
          value={draftCount}
        />
        <StatCard
          icon={<Clock className="h-5 w-5 text-blue-500" />}
          label="Scheduled"
          value={scheduledCount}
        />
        <StatCard
          icon={<Send className="h-5 w-5 text-green-500" />}
          label="Sent"
          value={sentCount}
        />
      </div>

      {/* Campaign List */}
      <div className="rounded-3xl border border-red-200 bg-white shadow-lg shadow-red-200/50 dark:border-red-900/50 dark:bg-[#0f1219] dark:shadow-red-950/30 overflow-hidden">
        <div className="px-6 py-4 border-b border-red-100 dark:border-red-900/50">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Platform Campaigns</h3>
        </div>

        {!campaigns ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-red-500" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12">
            <Globe className="h-12 w-12 text-red-300 dark:text-red-800 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 mb-4">No platform campaigns yet</p>
            <button
              onClick={handleNewCampaign}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white font-medium shadow-md shadow-red-950/30 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create First Campaign
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
                onDelete={() => handleDeleteCampaign(campaign._id)}
                onCancel={() => handleCancelCampaign(campaign._id)}
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
  onDelete,
  onCancel,
}: {
  campaign: {
    _id: Id<"admin_email_campaigns">;
    name: string;
    subject: string;
    status: string;
    audienceType: string;
    createdAt: number;
    sentAt?: number;
    scheduledFor?: number;
    recipientCount?: number;
    openedCount?: number;
    clickedCount?: number;
    creatorName?: string;
  };
  onEdit: () => void;
  onViewMetrics: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const getStatusIcon = () => {
    switch (campaign.status) {
      case "draft":
        return <FileText className="h-4 w-4 text-slate-400" />;
      case "scheduled":
        return <Clock className="h-4 w-4 text-blue-400" />;
      case "sending":
        return <Loader2 className="h-4 w-4 text-red-400 animate-spin" />;
      case "sent":
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case "cancelled":
        return <XCircle className="h-4 w-4 text-red-400" />;
      default:
        return <Mail className="h-4 w-4 text-slate-400" />;
    }
  };

  const getAudienceLabel = () => {
    switch (campaign.audienceType) {
      case "all_filmmakers":
        return "All Filmmakers";
      case "incomplete_onboarding":
        return "Incomplete Signups";
      case "fan_subscribers":
        return "Fan Subscribers";
      default:
        return campaign.audienceType;
    }
  };

  const openRate = campaign.recipientCount && campaign.openedCount
    ? Math.round((campaign.openedCount / campaign.recipientCount) * 100)
    : null;

  const clickRate = campaign.recipientCount && campaign.clickedCount
    ? Math.round((campaign.clickedCount / campaign.recipientCount) * 100)
    : null;

  return (
    <div className="px-6 py-4 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <h4 className="font-medium text-slate-900 dark:text-white truncate">{campaign.name}</h4>
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <span className="truncate">{campaign.subject}</span>
                <span className="text-red-400">•</span>
                <span className="text-red-600 dark:text-red-400 text-xs">{getAudienceLabel()}</span>
              </div>
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

          <div className="text-sm text-slate-500 dark:text-slate-400 capitalize">{campaign.status}</div>

          <div className="flex items-center gap-2">
            {campaign.status === "sent" ? (
              <button
                onClick={onViewMetrics}
                className="px-3 py-1.5 rounded-full border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-800/50 text-sm transition-colors"
              >
                View Report
              </button>
            ) : campaign.status === "draft" ? (
              <>
                <button
                  onClick={onEdit}
                  className="px-3 py-1.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-sm shadow-sm shadow-red-950/30 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={onDelete}
                  className="p-1.5 rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : campaign.status === "scheduled" ? (
              <>
                <button
                  onClick={onEdit}
                  className="px-3 py-1.5 rounded-full border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100 text-sm transition-colors"
                >
                  View
                </button>
                <button
                  onClick={onCancel}
                  className="px-3 py-1.5 rounded-full text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 text-sm transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// Placeholder components - will be expanded
function AdminCampaignComposer({
  adminEmail,
  campaignId,
  onBack,
}: {
  adminEmail: string;
  campaignId: Id<"admin_email_campaigns"> | null;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [audienceType, setAudienceType] = useState("all_filmmakers");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createCampaign = useMutation(api.adminEmails.createCampaign);
  const campaign = useQuery(
    api.adminEmails.getCampaign,
    campaignId ? { adminEmail, campaignId } : "skip"
  );
  const audiencePreview = useQuery(api.adminEmails.getAudiencePreview, {
    adminEmail,
    audienceType,
  });

  // Load existing campaign data
  useState(() => {
    if (campaign) {
      setName(campaign.name);
      setSubject(campaign.subject);
      setBodyHtml(campaign.bodyHtml);
      setAudienceType(campaign.audienceType);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !subject || !bodyHtml) return;

    setIsSubmitting(true);
    try {
      await createCampaign({
        adminEmail,
        name,
        subject,
        bodyHtml,
        audienceType,
        fromName: "FLMLNK Team",
      });
      onBack();
    } catch (error) {
      console.error("Failed to create campaign:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            {campaignId ? "Edit Campaign" : "New Platform Campaign"}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Create a campaign to reach {audiencePreview?.count ?? 0} recipients
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-[#0f1219]">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Campaign Details</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Campaign Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., December Newsletter"
                className="w-full px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Big news for filmmakers!"
                className="w-full px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Target Audience
              </label>
              <select
                value={audienceType}
                onChange={(e) => setAudienceType(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all_filmmakers">All Filmmakers ({audiencePreview?.count ?? 0})</option>
                <option value="incomplete_onboarding">Incomplete Signups</option>
                <option value="fan_subscribers">Fan Subscribers</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email Body (HTML)
              </label>
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                placeholder="<h1>Hello {{name}}</h1><p>Your message here...</p>"
                rows={10}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-mono text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-500 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Save Draft
          </button>
        </div>
      </form>
    </div>
  );
}

function AdminCampaignMetrics({
  adminEmail,
  campaignId,
  onBack,
}: {
  adminEmail: string;
  campaignId: Id<"admin_email_campaigns">;
  onBack: () => void;
}) {
  const campaign = useQuery(api.adminEmails.getCampaign, { adminEmail, campaignId });
  const sends = useQuery(api.adminEmails.getCampaignSends, { adminEmail, campaignId, limit: 100 });

  if (!campaign) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-red-500" />
      </div>
    );
  }

  const openRate = campaign.recipientCount && campaign.openedCount
    ? Math.round((campaign.openedCount / campaign.recipientCount) * 100)
    : 0;

  const clickRate = campaign.recipientCount && campaign.clickedCount
    ? Math.round((campaign.clickedCount / campaign.recipientCount) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{campaign.name}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{campaign.subject}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Send className="h-5 w-5 text-blue-500" />}
          label="Sent"
          value={campaign.recipientCount ?? 0}
        />
        <StatCard
          icon={<CheckCircle className="h-5 w-5 text-green-500" />}
          label="Delivered"
          value={campaign.deliveredCount ?? 0}
        />
        <StatCard
          icon={<Eye className="h-5 w-5 text-red-500" />}
          label="Open Rate"
          value={`${openRate}%`}
          subtext={`${campaign.openedCount ?? 0} opens`}
        />
        <StatCard
          icon={<MousePointerClick className="h-5 w-5 text-amber-500" />}
          label="Click Rate"
          value={`${clickRate}%`}
          subtext={`${campaign.clickedCount ?? 0} clicks`}
        />
      </div>

      <div className="rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-[#0f1219]">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent Activity</h3>
        {!sends ? (
          <Loader2 className="h-5 w-5 animate-spin text-red-500" />
        ) : sends.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">No sends recorded yet</p>
        ) : (
          <div className="space-y-2">
            {sends.slice(0, 10).map((send) => (
              <div key={send._id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{send.recipientEmail}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{send.recipientName}</p>
                </div>
                <div className="flex items-center gap-2">
                  {send.openedAt && <Eye className="h-4 w-4 text-red-500" />}
                  {send.clickedAt && <MousePointerClick className="h-4 w-4 text-amber-500" />}
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    send.status === "delivered" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                    send.status === "opened" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                    send.status === "clicked" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  }`}>
                    {send.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
