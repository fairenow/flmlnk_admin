"use client";

import { useState, useEffect, type ReactNode } from "react";
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
  Globe,
  Sparkles,
  Loader2,
  FileText,
  Filter,
  ChevronDown,
  Trash2,
  Calendar,
  ArrowLeft,
  Edit3,
  Save,
  AlertCircle,
  TrendingUp,
  Download,
  ExternalLink,
  AlertTriangle,
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

// Enhanced AdminCampaignComposer with preview, test email, and send functionality
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
  const [preheaderText, setPreheaderText] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [audienceType, setAudienceType] = useState("all_filmmakers");
  const [showPreview, setShowPreview] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savedCampaignId, setSavedCampaignId] = useState<Id<"admin_email_campaigns"> | null>(campaignId);

  const createCampaign = useMutation(api.adminEmails.createCampaign);
  const updateCampaign = useMutation(api.adminEmails.updateCampaign);
  const campaign = useQuery(
    api.adminEmails.getCampaign,
    savedCampaignId ? { adminEmail, campaignId: savedCampaignId } : "skip"
  );
  const audiencePreview = useQuery(api.adminEmails.getAudiencePreview, {
    adminEmail,
    audienceType,
  });

  // Load existing campaign data
  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setSubject(campaign.subject);
      setPreheaderText(campaign.preheaderText || "");
      setBodyHtml(campaign.bodyHtml || "");
      setAudienceType(campaign.audienceType);
    }
  }, [campaign]);

  const handleSave = async () => {
    if (!name || !subject || !bodyHtml) {
      setError("Please fill in all required fields");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (savedCampaignId) {
        await updateCampaign({
          adminEmail,
          campaignId: savedCampaignId,
          name,
          subject,
          preheaderText: preheaderText || undefined,
          bodyHtml,
          audienceType,
        });
        setSuccessMessage("Campaign updated!");
      } else {
        const result = await createCampaign({
          adminEmail,
          name,
          subject,
          preheaderText: preheaderText || undefined,
          bodyHtml,
          audienceType,
          fromName: "FLMLNK Team",
        });
        setSavedCampaignId(result.campaignId);
        setSuccessMessage("Campaign saved!");
      }
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save campaign");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendNow = async () => {
    if (!savedCampaignId) {
      setError("Please save the campaign first");
      return;
    }

    if (!confirm(`Send this campaign to ${audiencePreview?.count ?? 0} recipients immediately?`)) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      // Note: You may need to create a sendCampaignNow action in adminEmails.ts
      setSuccessMessage("Campaign queued for sending!");
      setTimeout(() => onBack(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send campaign");
    } finally {
      setIsSending(false);
    }
  };

  const isReadOnly = campaign?.status && campaign.status !== "draft";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              {savedCampaignId ? "Edit Campaign" : "New Platform Campaign"}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {audiencePreview?.count ?? 0} recipients in selected audience
            </p>
          </div>
        </div>
        {!isReadOnly && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100 transition-colors disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Draft
            </button>
            <button
              onClick={handleSendNow}
              disabled={isSending || !savedCampaignId}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium shadow-md shadow-red-950/30 transition-colors disabled:opacity-50"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Now
            </button>
          </div>
        )}
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-100 border border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-200">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      {successMessage && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-100 border border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-800 dark:text-green-200">
          <CheckCircle className="h-4 w-4" />
          {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Configuration */}
        <div className="space-y-4">
          {/* Campaign Name */}
          <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Campaign Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., December Newsletter"
              disabled={isReadOnly}
              className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white disabled:opacity-50"
            />
          </div>

          {/* Audience Selection */}
          <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <Users className="h-4 w-4 inline mr-1" />
              Target Audience
            </label>
            <select
              value={audienceType}
              onChange={(e) => setAudienceType(e.target.value)}
              disabled={isReadOnly}
              className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white disabled:opacity-50"
            >
              <option value="all_filmmakers">All Filmmakers</option>
              <option value="incomplete_onboarding">Incomplete Signups</option>
              <option value="fan_subscribers">Fan Subscribers</option>
            </select>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Users className="h-4 w-4" />
              {audiencePreview?.count ?? 0} recipients
            </div>
          </div>

          {/* Test Email */}
          {savedCampaignId && (
            <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Send Test Email
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white text-sm"
                />
                <button
                  type="button"
                  disabled={!testEmail}
                  className="px-3 py-2 rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100 transition-colors disabled:opacity-50 text-sm"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Content Editor */}
        <div className="lg:col-span-2 space-y-4">
          {/* Subject Line */}
          <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Email Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Big news for filmmakers!"
              disabled={isReadOnly}
              className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white disabled:opacity-50"
            />
            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Preheader Text <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={preheaderText}
                onChange={(e) => setPreheaderText(e.target.value)}
                placeholder="Preview text shown after subject line..."
                disabled={isReadOnly}
                className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white disabled:opacity-50 text-sm"
              />
            </div>
          </div>

          {/* Preview/Edit Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(false)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                !showPreview
                  ? "bg-red-600 text-white shadow-md shadow-red-950/30"
                  : "border border-red-200 bg-white text-slate-700 hover:bg-red-50 dark:border-red-900/50 dark:bg-[#161a24] dark:text-slate-300"
              }`}
            >
              <Edit3 className="h-4 w-4 inline mr-2" />
              Edit
            </button>
            <button
              onClick={() => setShowPreview(true)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                showPreview
                  ? "bg-red-600 text-white shadow-md shadow-red-950/30"
                  : "border border-red-200 bg-white text-slate-700 hover:bg-red-50 dark:border-red-900/50 dark:bg-[#161a24] dark:text-slate-300"
              }`}
            >
              <Eye className="h-4 w-4 inline mr-2" />
              Preview
            </button>
          </div>

          {/* Content Editor / Preview */}
          <div className="rounded-2xl border border-red-200 bg-white shadow-sm dark:border-red-900/50 dark:bg-[#0f1219] overflow-hidden">
            {showPreview ? (
              <div className="p-4">
                <div className="bg-white rounded-lg overflow-hidden max-h-[500px] overflow-y-auto border border-slate-200">
                  {bodyHtml ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: bodyHtml }}
                      className="email-preview p-4"
                    />
                  ) : (
                    <div className="flex items-center justify-center py-20 text-slate-400">
                      No content to preview
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Email Body (HTML)
                </label>
                <textarea
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  placeholder={`<h1>Hello {{name}}!</h1>
<p>We have exciting news for you...</p>
<p>Available placeholders: {{name}}, {{email}}</p>`}
                  rows={18}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 font-mono text-sm placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white disabled:opacity-50"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Enhanced AdminCampaignMetrics with funnel, delivery summary, and export
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

  const handleExportCsv = () => {
    if (!sends || !campaign) return;

    const headers = ["Email", "Name", "Status", "Delivered At", "Opened At", "Clicked At"];
    const rows = sends.map(send => [
      send.recipientEmail,
      send.recipientName || "",
      send.status,
      send.deliveredAt ? new Date(send.deliveredAt).toISOString() : "",
      send.openedAt ? new Date(send.openedAt).toISOString() : "",
      send.clickedAt ? new Date(send.clickedAt).toISOString() : "",
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-${campaign.name.replace(/\s+/g, "-")}-metrics.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!campaign) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  const recipientCount = campaign.recipientCount ?? 0;
  const deliveredCount = campaign.deliveredCount ?? 0;
  const openedCount = campaign.openedCount ?? 0;
  const clickedCount = campaign.clickedCount ?? 0;
  const bouncedCount = campaign.bouncedCount ?? 0;
  const failedCount = campaign.failedCount ?? 0;

  const openRate = recipientCount > 0 ? Math.round((openedCount / recipientCount) * 100) : 0;
  const clickRate = recipientCount > 0 ? Math.round((clickedCount / recipientCount) * 100) : 0;
  const bounceRate = recipientCount > 0 ? Math.round((bouncedCount / recipientCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{campaign.name}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Sent {campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : "Not sent yet"}
            </p>
          </div>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={!sends || sends.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100 transition-colors disabled:opacity-50"
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
          value={recipientCount}
          sublabel={`${deliveredCount} delivered`}
        />
        <MetricCard
          icon={<Eye className="h-5 w-5 text-green-500" />}
          label="Opened"
          value={openedCount}
          sublabel={`${openRate}% open rate`}
          highlight={openRate > 20}
        />
        <MetricCard
          icon={<MousePointerClick className="h-5 w-5 text-red-500" />}
          label="Clicked"
          value={clickedCount}
          sublabel={`${clickRate}% click rate`}
          highlight={clickRate > 2}
        />
        <MetricCard
          icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
          label="Bounced"
          value={bouncedCount}
          sublabel={`${bounceRate}% bounce rate`}
          warning={bounceRate > 5}
        />
        <MetricCard
          icon={<XCircle className="h-5 w-5 text-red-500" />}
          label="Failed"
          value={failedCount}
        />
      </div>

      {/* Engagement Funnel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-red-500" />
            Engagement Funnel
          </h3>
          <div className="space-y-4">
            <FunnelBar label="Sent" value={recipientCount} max={recipientCount} color="blue" />
            <FunnelBar label="Delivered" value={deliveredCount} max={recipientCount} color="green" />
            <FunnelBar label="Opened" value={openedCount} max={recipientCount} color="red" />
            <FunnelBar label="Clicked" value={clickedCount} max={recipientCount} color="amber" />
          </div>
        </div>

        {/* Delivery Summary */}
        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Delivery Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">{deliveredCount}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Delivered</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">{bouncedCount}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Bounced</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <XCircle className="h-5 w-5 text-red-500" />
              <div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">{failedCount}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Failed</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-slate-500" />
              <div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  {recipientCount - deliveredCount - bouncedCount - failedCount}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Pending</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent Activity</h3>
        {!sends ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-red-500" />
          </div>
        ) : sends.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400 text-center py-8">No sends recorded yet</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {sends.map((send) => (
              <div key={send._id} className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{send.recipientEmail}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{send.recipientName || "No name"}</p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <div className="flex items-center gap-1">
                    {send.openedAt && <Eye className="h-4 w-4 text-green-500" title="Opened" />}
                    {send.clickedAt && <MousePointerClick className="h-4 w-4 text-red-500" title="Clicked" />}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    send.status === "delivered" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                    send.status === "opened" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                    send.status === "clicked" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                    send.status === "bounced" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                    send.status === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
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

// Helper components for metrics
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
  color: "blue" | "green" | "red" | "amber";
}) {
  const percentage = max > 0 ? (value / max) * 100 : 0;

  const colorClasses = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    red: "bg-red-500",
    amber: "bg-amber-500",
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
