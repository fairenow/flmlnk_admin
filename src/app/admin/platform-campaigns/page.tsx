"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import Link from "next/link";
import {
  Mail,
  Users,
  Clock,
  ChevronLeft,
  Plus,
  Send,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Eye,
  Trash2,
  Edit,
  ChevronDown,
  ChevronUp,
  UserX,
} from "lucide-react";
import { toast } from "sonner";

type ViewMode = "list" | "create" | "view";

const AUDIENCE_TYPES = [
  {
    value: "incomplete_onboarding",
    label: "Incomplete Onboarding",
    description: "Users who signed up but didn't complete profile creation",
  },
  {
    value: "all_users",
    label: "All Users",
    description: "All registered users in the system",
  },
  {
    value: "no_profile",
    label: "No Profile",
    description: "Users who exist in the app but have no actor profile",
  },
];

export default function PlatformCampaignsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedCampaignId, setSelectedCampaignId] = useState<Id<"platform_campaigns"> | null>(null);
  const [expandedCampaign, setExpandedCampaign] = useState<Id<"platform_campaigns"> | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Form state for creating campaigns
  const [formData, setFormData] = useState({
    name: "",
    subject: "",
    htmlContent: "",
    textContent: "",
    fromName: "Flmlnk Team",
    replyTo: "",
    audienceType: "incomplete_onboarding",
  });

  // Queries
  const campaigns = useQuery(api.platformCampaigns.getPlatformCampaigns, { limit: 50 });
  const selectedCampaign = useQuery(
    api.platformCampaigns.getPlatformCampaign,
    selectedCampaignId ? { campaignId: selectedCampaignId } : "skip"
  );
  const audiencePreview = useQuery(api.platformCampaigns.getAudiencePreview, {
    audienceType: formData.audienceType,
  });

  // Mutations
  const createCampaign = useMutation(api.platformCampaigns.createPlatformCampaign);
  const deleteCampaign = useMutation(api.platformCampaigns.deletePlatformCampaign);
  const sendCampaign = useAction(api.platformCampaigns.sendPlatformCampaign);

  const isLoading = campaigns === undefined;

  const handleCreateCampaign = async () => {
    if (!formData.name || !formData.subject || !formData.htmlContent || !formData.textContent) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      await createCampaign({
        name: formData.name,
        subject: formData.subject,
        htmlContent: formData.htmlContent,
        textContent: formData.textContent,
        fromName: formData.fromName,
        replyTo: formData.replyTo || undefined,
        audienceType: formData.audienceType,
      });
      toast.success("Campaign created successfully");
      setViewMode("list");
      setFormData({
        name: "",
        subject: "",
        htmlContent: "",
        textContent: "",
        fromName: "Flmlnk Team",
        replyTo: "",
        audienceType: "incomplete_onboarding",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create campaign");
    }
  };

  const handleDeleteCampaign = async (campaignId: Id<"platform_campaigns">) => {
    if (!confirm("Are you sure you want to delete this campaign?")) return;

    try {
      await deleteCampaign({ campaignId });
      toast.success("Campaign deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete campaign");
    }
  };

  const handleSendCampaign = async (campaignId: Id<"platform_campaigns">) => {
    if (!confirm("Are you sure you want to send this campaign? This cannot be undone.")) return;

    setIsSending(true);
    try {
      const result = await sendCampaign({ campaignId });
      toast.success(`Campaign sent! ${result.sent} delivered, ${result.failed} failed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send campaign");
    } finally {
      setIsSending(false);
    }
  };

  const formatDate = (timestamp: number | undefined) => {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <Edit className="h-3 w-3" /> Draft
          </span>
        );
      case "sending":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <Loader2 className="h-3 w-3 animate-spin" /> Sending
          </span>
        );
      case "sent":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="h-3 w-3" /> Sent
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="h-3 w-3" /> Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {status}
          </span>
        );
    }
  };

  const getAudienceLabel = (type: string) => {
    return AUDIENCE_TYPES.find((a) => a.value === type)?.label || type;
  };

  // Create campaign view
  if (viewMode === "create") {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setViewMode("list")}
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors mb-4"
          >
            <ChevronLeft className="h-4 w-4" /> Back to Campaigns
          </button>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            Create Platform Campaign
          </h1>

          <div className="space-y-6">
            {/* Campaign Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Campaign Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Welcome back campaign"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            {/* Audience Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Audience *
              </label>
              <select
                value={formData.audienceType}
                onChange={(e) => setFormData({ ...formData, audienceType: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {AUDIENCE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {AUDIENCE_TYPES.find((a) => a.value === formData.audienceType)?.description}
              </p>
              {audiencePreview && (
                <div className="mt-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    <Users className="inline h-4 w-4 mr-1" />
                    {audiencePreview.count} recipients will receive this campaign
                  </p>
                  {audiencePreview.sampleEmails.length > 0 && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      Sample: {audiencePreview.sampleEmails.join(", ")}
                      {audiencePreview.count > 5 && "..."}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* From Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  From Name *
                </label>
                <input
                  type="text"
                  value={formData.fromName}
                  onChange={(e) => setFormData({ ...formData, fromName: e.target.value })}
                  placeholder="Flmlnk Team"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Reply-To Email
                </label>
                <input
                  type="email"
                  value={formData.replyTo}
                  onChange={(e) => setFormData({ ...formData, replyTo: e.target.value })}
                  placeholder="support@flmlnk.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Subject Line *
              </label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Complete your Flmlnk profile"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            {/* HTML Content */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                HTML Content *
              </label>
              <textarea
                value={formData.htmlContent}
                onChange={(e) => setFormData({ ...formData, htmlContent: e.target.value })}
                placeholder="<h1>Hello!</h1><p>Your email content here...</p>"
                rows={10}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white font-mono text-sm"
              />
            </div>

            {/* Text Content */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Plain Text Content *
              </label>
              <textarea
                value={formData.textContent}
                onChange={(e) => setFormData({ ...formData, textContent: e.target.value })}
                placeholder="Hello! Your email content here..."
                rows={6}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setViewMode("list")}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCampaign}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Create Campaign
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Campaign list view
  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors mb-4"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Admin
        </Link>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg">
                <Mail className="h-6 w-6" />
              </div>
              Platform Campaigns
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              Send emails to users without profiles (incomplete onboarding, etc.)
            </p>
          </div>

          <button
            onClick={() => setViewMode("create")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Campaign
          </button>
        </div>
      </div>

      {/* Campaign List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : campaigns?.length === 0 ? (
        <div className="text-center py-12">
          <UserX className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">
            No campaigns yet
          </h3>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            Create your first platform campaign to reach users
          </p>
          <button
            onClick={() => setViewMode("create")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Create Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns?.map((campaign) => (
            <div
              key={campaign._id}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 overflow-hidden"
            >
              {/* Campaign Header */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
                    <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-900 dark:text-white">
                      {campaign.name}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {campaign.subject}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {getStatusBadge(campaign.status)}
                  <span className="text-sm text-slate-500 dark:text-slate-400 hidden sm:inline">
                    {getAudienceLabel(campaign.audienceType)}
                  </span>

                  {/* Expand/Collapse Button */}
                  <button
                    onClick={() =>
                      setExpandedCampaign(
                        expandedCampaign === campaign._id ? null : campaign._id
                      )
                    }
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {expandedCampaign === campaign._id ? (
                      <ChevronUp className="h-5 w-5 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-500" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedCampaign === campaign._id && (
                <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                        Total Recipients
                      </p>
                      <p className="text-lg font-semibold text-slate-900 dark:text-white">
                        {campaign.totalRecipients ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                        Sent
                      </p>
                      <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                        {campaign.sentCount ?? 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                        Failed
                      </p>
                      <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                        {campaign.failedCount ?? 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                        Created
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {formatDate(campaign.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {campaign.status === "draft" && (
                      <>
                        <button
                          onClick={() => handleSendCampaign(campaign._id)}
                          disabled={isSending}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors text-sm"
                        >
                          {isSending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          Send Now
                        </button>
                        <button
                          onClick={() => handleDeleteCampaign(campaign._id)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 transition-colors text-sm"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      </>
                    )}
                    {campaign.sentAt && (
                      <span className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                        <Clock className="h-4 w-4" />
                        Sent {formatDate(campaign.sentAt)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
