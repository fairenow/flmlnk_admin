"use client";

import { useState, type ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowLeft,
  Users,
  Tag,
  Plus,
  Search,
  Mail,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  MoreVertical,
  UserPlus,
  Filter,
  Download,
  Trash2,
} from "lucide-react";

interface AudienceManagerProps {
  actorProfileId: Id<"actor_profiles">;
  onBack: () => void;
}

export function AudienceManager({ actorProfileId, onBack }: AudienceManagerProps) {
  const [activeTab, setActiveTab] = useState<"subscribers" | "tags">("subscribers");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<Id<"audience_tags"> | null>(null);
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#f53c56");

  // Queries
  const audienceStats = useQuery(api.audienceManagement.getAudienceStats, { actorProfileId });
  const subscribersData = useQuery(api.audienceManagement.getSubscribers, {
    actorProfileId,
    includeUnsubscribed: false,
    tagId: selectedTagId ?? undefined,
    limit: 100,
  });
  const tags = useQuery(api.audienceManagement.getAudienceTags, { actorProfileId });

  // Mutations
  const createTag = useMutation(api.audienceManagement.createAudienceTag);
  const deleteTag = useMutation(api.audienceManagement.deleteAudienceTag);
  const addTagToSubscriber = useMutation(api.audienceManagement.addTagToSubscriber);
  const removeTagFromSubscriber = useMutation(api.audienceManagement.removeTagFromSubscriber);

  const filteredSubscribers = subscribersData?.subscribers.filter(
    (sub) =>
      sub.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      await createTag({
        actorProfileId,
        name: newTagName,
        color: newTagColor,
      });
      setNewTagName("");
      setShowAddTag(false);
    } catch (error) {
      console.error("Failed to create tag:", error);
    }
  };

  const handleDeleteTag = async (tagId: Id<"audience_tags">) => {
    if (!confirm("Are you sure you want to delete this tag?")) return;

    try {
      await deleteTag({ tagId });
      if (selectedTagId === tagId) {
        setSelectedTagId(null);
      }
    } catch (error) {
      console.error("Failed to delete tag:", error);
    }
  };

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
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="h-6 w-6 text-red-500" />
              Audience Manager
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              {audienceStats?.active || 0} active subscribers
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="h-5 w-5 text-blue-500" />}
          label="Total"
          value={audienceStats?.total || 0}
        />
        <StatCard
          icon={<CheckCircle className="h-5 w-5 text-green-500" />}
          label="Active"
          value={audienceStats?.active || 0}
        />
        <StatCard
          icon={<XCircle className="h-5 w-5 text-red-500" />}
          label="Unsubscribed"
          value={audienceStats?.unsubscribed || 0}
        />
        <StatCard
          icon={<AlertCircle className="h-5 w-5 text-amber-500" />}
          label="Hard Bounces"
          value={audienceStats?.hardBounces || 0}
        />
      </div>

      {/* Data Quality */}
      {audienceStats?.dataQuality && (
        <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Data Quality</h3>
          <div className="grid grid-cols-3 gap-4">
            <QualityIndicator
              label="With Consent"
              value={audienceStats.dataQuality.withConsentPercent}
              good={audienceStats.dataQuality.withConsentPercent > 80}
            />
            <QualityIndicator
              label="With Name"
              value={audienceStats.dataQuality.withNamePercent}
              good={audienceStats.dataQuality.withNamePercent > 50}
            />
            <QualityIndicator
              label="Recently Engaged"
              value={audienceStats.dataQuality.recentlyEngagedPercent}
              good={audienceStats.dataQuality.recentlyEngagedPercent > 20}
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-red-200 dark:border-red-900/50">
        <button
          onClick={() => setActiveTab("subscribers")}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === "subscribers"
              ? "border-red-500 text-red-600 dark:text-red-400"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <Users className="h-4 w-4 inline mr-2" />
          Subscribers
        </button>
        <button
          onClick={() => setActiveTab("tags")}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === "tags"
              ? "border-red-500 text-red-600 dark:text-red-400"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <Tag className="h-4 w-4 inline mr-2" />
          Tags
        </button>
      </div>

      {activeTab === "subscribers" ? (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search subscribers..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-red-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:placeholder-slate-500 dark:focus:ring-0"
              />
            </div>
            <select
              value={selectedTagId || ""}
              onChange={(e) => setSelectedTagId(e.target.value ? e.target.value as Id<"audience_tags"> : null)}
              className="px-4 py-2 rounded-lg border border-red-200 bg-white text-slate-900 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:focus:ring-0"
            >
              <option value="">All subscribers</option>
              {tags?.map((tag) => (
                <option key={tag._id} value={tag._id}>
                  {tag.name} ({tag.subscriberCount || 0})
                </option>
              ))}
            </select>
          </div>

          {/* Subscriber List */}
          <div className="rounded-2xl border border-red-200 bg-white shadow-sm dark:border-red-900/50 dark:bg-[#0f1219] overflow-hidden">
            {!subscribersData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-red-500" />
              </div>
            ) : filteredSubscribers?.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-red-300 dark:text-red-800 mx-auto mb-4" />
                <p className="text-slate-500 dark:text-slate-400">No subscribers found</p>
              </div>
            ) : (
              <div className="divide-y divide-red-100 dark:divide-red-900/50">
                {filteredSubscribers?.map((subscriber) => (
                  <SubscriberRow
                    key={subscriber._id}
                    subscriber={subscriber}
                    allTags={tags || []}
                    onAddTag={(tagId) =>
                      addTagToSubscriber({ fanEmailId: subscriber._id, tagId })
                    }
                    onRemoveTag={(tagId) =>
                      removeTagFromSubscriber({ fanEmailId: subscriber._id, tagId })
                    }
                  />
                ))}
              </div>
            )}
            {subscribersData && (
              <div className="px-4 py-3 bg-red-50 border-t border-red-200 text-sm text-slate-600 dark:bg-red-900/20 dark:border-red-900/50 dark:text-slate-400">
                Showing {filteredSubscribers?.length} of {subscribersData.total} subscribers
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Add Tag Button */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddTag(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium shadow-md shadow-red-950/30 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Tag
            </button>
          </div>

          {/* Add Tag Form */}
          {showAddTag && (
            <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
              <div className="flex gap-4">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Tag name..."
                  className="flex-1 px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:placeholder-slate-500 dark:focus:ring-0"
                />
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-red-200 bg-white cursor-pointer dark:border-red-900/50 dark:bg-[#161a24]"
                />
                <button
                  onClick={handleCreateTag}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white shadow-sm shadow-red-950/30 transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowAddTag(false)}
                  className="px-4 py-2 rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-800/50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Tags List */}
          <div className="rounded-2xl border border-red-200 bg-white shadow-sm dark:border-red-900/50 dark:bg-[#0f1219] overflow-hidden">
            {!tags ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-red-500" />
              </div>
            ) : tags.length === 0 ? (
              <div className="text-center py-12">
                <Tag className="h-12 w-12 text-red-300 dark:text-red-800 mx-auto mb-4" />
                <p className="text-slate-500 dark:text-slate-400">No tags created yet</p>
              </div>
            ) : (
              <div className="divide-y divide-red-100 dark:divide-red-900/50">
                {tags.map((tag) => (
                  <div
                    key={tag._id}
                    className="px-4 py-3 flex items-center justify-between hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: tag.color || "#f53c56" }}
                      />
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">{tag.name}</div>
                        {tag.description && (
                          <div className="text-sm text-slate-500 dark:text-slate-400">{tag.description}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {tag.subscriberCount || 0} subscribers
                      </span>
                      <button
                        onClick={() => handleDeleteTag(tag._id)}
                        className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white">{value.toLocaleString()}</div>
    </div>
  );
}

function QualityIndicator({
  label,
  value,
  good,
}: {
  label: string;
  value: number;
  good: boolean;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className={good ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}>{value}%</span>
      </div>
      <div className="h-2 bg-red-100 dark:bg-red-900/30 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${good ? "bg-green-500" : "bg-amber-500"}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function SubscriberRow({
  subscriber,
  allTags,
  onAddTag,
  onRemoveTag,
}: {
  subscriber: {
    _id: Id<"fan_emails">;
    email: string;
    name?: string;
    source?: string;
    consentedAt?: number;
    lastEmailOpenedAt?: number;
    tags: Array<{ id: Id<"audience_tags">; name: string; color?: string } | null>;
  };
  allTags: Array<{ _id: Id<"audience_tags">; name: string; color?: string }>;
  onAddTag: (tagId: Id<"audience_tags">) => void;
  onRemoveTag: (tagId: Id<"audience_tags">) => void;
}) {
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  const subscriberTagIds = new Set(subscriber.tags.filter(Boolean).map((t) => t!.id));
  const availableTags = allTags.filter((t) => !subscriberTagIds.has(t._id));

  return (
    <div className="px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
            <Mail className="h-4 w-4 text-red-500 dark:text-red-400" />
          </div>
          <div>
            <div className="font-medium text-slate-900 dark:text-white">{subscriber.name || subscriber.email}</div>
            {subscriber.name && (
              <div className="text-sm text-slate-500 dark:text-slate-400">{subscriber.email}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Tags */}
          <div className="flex gap-1">
            {subscriber.tags.filter(Boolean).map((tag) => (
              <span
                key={tag!.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: `${tag!.color || "#f53c56"}20`, color: tag!.color || "#f53c56" }}
              >
                {tag!.name}
                <button
                  onClick={() => onRemoveTag(tag!.id)}
                  className="hover:opacity-70"
                >
                  <XCircle className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>

          {/* Add Tag */}
          <div className="relative">
            <button
              onClick={() => setShowTagDropdown(!showTagDropdown)}
              className="p-1 text-slate-400 hover:text-red-500 transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
            {showTagDropdown && availableTags.length > 0 && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg border border-red-200 shadow-lg z-10 dark:bg-[#161a24] dark:border-red-900/50">
                {availableTags.map((tag) => (
                  <button
                    key={tag._id}
                    onClick={() => {
                      onAddTag(tag._id);
                      setShowTagDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-red-50 dark:text-slate-300 dark:hover:bg-red-900/30 flex items-center gap-2"
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tag.color || "#f53c56" }}
                    />
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            {subscriber.consentedAt ? (
              <span className="text-green-500" title="Has consent">
                <CheckCircle className="h-3 w-3" />
              </span>
            ) : (
              <span className="text-amber-500" title="No consent">
                <AlertCircle className="h-3 w-3" />
              </span>
            )}
            {subscriber.source && <span>{subscriber.source}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
