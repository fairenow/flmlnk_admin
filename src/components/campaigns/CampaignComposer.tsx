"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowLeft,
  Sparkles,
  Send,
  Save,
  Eye,
  Loader2,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Mail,
  Users,
  Edit3,
  Wand2,
  Film,
  FileText,
  Zap,
  Database,
  RefreshCw,
} from "lucide-react";

interface CampaignComposerProps {
  actorProfileId: Id<"actor_profiles">;
  campaignId?: Id<"email_campaigns"> | null;
  templateKey?: string | null;
  onBack: () => void;
}

export function CampaignComposer({
  actorProfileId,
  campaignId,
  templateKey,
  onBack,
}: CampaignComposerProps) {
  // State
  const [campaignName, setCampaignName] = useState("");
  const [subject, setSubject] = useState("");
  const [preheaderText, setPreheaderText] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [textContent, setTextContent] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(templateKey || "");
  const [selectedTone, setSelectedTone] = useState("casual");
  const [selectedBrevity, setSelectedBrevity] = useState("medium");
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | null>(null);
  const [audienceType, setAudienceType] = useState("creator_subscribers");
  const [alternateSubjects, setAlternateSubjects] = useState<string[]>([]);
  const [showDataSummary, setShowDataSummary] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);
  const [showAudienceList, setShowAudienceList] = useState(false);
  const [savedCampaignId, setSavedCampaignId] = useState<Id<"email_campaigns"> | null>(campaignId ?? null);

  // Queries
  const templates = useQuery(api.campaignTemplates.getActiveTemplates, {});
  const existingCampaign = useQuery(
    api.campaigns.getCampaign,
    savedCampaignId ? { campaignId: savedCampaignId } : "skip"
  );
  const dataContextQuery = useQuery(api.campaignGeneration.getDataContextForCampaign, {
    actorProfileId,
    projectId: selectedProjectId ?? undefined,
  });
  const audienceStats = useQuery(api.audienceManagement.getAudienceStats, {
    actorProfileId,
  });
  const siteWideStats = useQuery(api.audienceManagement.getSiteWideAudienceCount, {});
  const incompleteOnboardingStats = useQuery(api.audienceManagement.getIncompleteOnboardingCount, {});
  const fanEmailsPreview = useQuery(api.audienceManagement.getFanEmailsForAudience, {
    actorProfileId,
    audienceType,
    limit: 5,
  });

  // Mutations & Actions
  const createCampaign = useMutation(api.campaigns.createCampaign);
  const updateCampaign = useMutation(api.campaigns.updateCampaign);
  const generateDraft = useAction(api.campaignGeneration.generateCampaignDraft);
  const sendCampaignNow = useAction(api.campaigns.sendCampaignNow);
  const sendTestEmailAction = useAction(api.campaigns.sendTestEmail);

  // Load existing campaign data
  useEffect(() => {
    if (existingCampaign) {
      setCampaignName(existingCampaign.name);
      setSubject(existingCampaign.subject);
      setPreheaderText(existingCampaign.preheaderText || "");
      setHtmlContent(existingCampaign.htmlContent);
      setTextContent(existingCampaign.textContent);
      setSelectedTemplate(existingCampaign.templateKey || "");
      setSelectedTone(existingCampaign.generationTone || "casual");
      setSelectedBrevity(existingCampaign.generationBrevity || "medium");
      setAudienceType(existingCampaign.audienceType);
      setHasGenerated(true);
    }
  }, [existingCampaign]);

  // Auto-generate when template is selected and data is ready
  useEffect(() => {
    if (
      templateKey &&
      !campaignId &&
      !hasGenerated &&
      dataContextQuery?.context &&
      templates?.length
    ) {
      // Auto-generate on initial load with template
      handleGenerate();
    }
  }, [templateKey, campaignId, hasGenerated, dataContextQuery, templates]);

  const currentTemplate = templates?.find((t) => t.key === selectedTemplate);
  const context = dataContextQuery?.context;

  const handleGenerate = async () => {
    if (!selectedTemplate) {
      setError("Please select a template");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateDraft({
        actorProfileId,
        templateKey: selectedTemplate,
        projectId: selectedProjectId ?? undefined,
        tone: selectedTone,
        brevity: selectedBrevity,
      });

      setSubject(result.subject);
      setPreheaderText(result.preheaderText);
      setHtmlContent(result.htmlContent);
      setTextContent(result.textContent);
      setAlternateSubjects(result.alternateSubjects);
      setHasGenerated(true);

      if (!campaignName && currentTemplate) {
        setCampaignName(`${currentTemplate.name} - ${new Date().toLocaleDateString()}`);
      }

      setSuccessMessage("Email generated from your profile data!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate content");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!campaignName || !subject || !textContent) {
      setError("Please fill in all required fields");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (savedCampaignId) {
        await updateCampaign({
          campaignId: savedCampaignId,
          name: campaignName,
          subject,
          preheaderText,
          htmlContent,
          textContent,
          audienceType,
        });
      } else {
        const result = await createCampaign({
          actorProfileId,
          name: campaignName,
          templateKey: selectedTemplate || undefined,
          subject,
          preheaderText,
          htmlContent,
          textContent,
          aiGenerated: true,
          generationTone: selectedTone,
          generationBrevity: selectedBrevity,
          audienceType,
        });
        // Set the saved campaign ID so Send Now becomes available
        setSavedCampaignId(result.campaignId);
      }

      setSuccessMessage("Campaign saved! You can now send it.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save campaign");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail || !savedCampaignId) {
      setError("Please save the campaign and enter a test email");
      return;
    }

    try {
      await sendTestEmailAction({ campaignId: savedCampaignId, testEmail });
      setSuccessMessage(`Test email sent to ${testEmail}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send test email");
    }
  };

  const handleSend = async () => {
    if (!savedCampaignId) {
      setError("Please save the campaign first");
      return;
    }

    if (!confirm(`Send this campaign to ${audienceStats?.active || 0} subscribers?`)) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      await sendCampaignNow({ campaignId: savedCampaignId });
      setSuccessMessage("Campaign sent successfully!");
      setTimeout(() => {
        onBack();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send campaign");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Campaigns
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving || !hasGenerated}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-800/50 transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Draft
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || !savedCampaignId}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium shadow-md shadow-red-950/30 transition-colors disabled:opacity-50"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send Now
          </button>
        </div>
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
          {/* Data Context Summary */}
          <div className="rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-white p-4 shadow-sm dark:border-red-900/50 dark:from-red-900/20 dark:to-[#0f1219]">
            <button
              onClick={() => setShowDataSummary(!showDataSummary)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Your Data Context
                </span>
              </div>
              {showDataSummary ? (
                <ChevronUp className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {/* Quick stats */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <CheckCircle className={`h-3 w-3 ${context?.creatorName ? "text-green-500" : "text-slate-300"}`} />
                Profile info
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <CheckCircle className={`h-3 w-3 ${dataContextQuery?.dataQuality?.hasProject ? "text-green-500" : "text-slate-300"}`} />
                Project data
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <CheckCircle className={`h-3 w-3 ${dataContextQuery?.dataQuality?.hasTranscriptSummary ? "text-green-500" : "text-slate-300"}`} />
                Trailer analysis
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <Users className="h-3 w-3 text-blue-500" />
                {context?.subscriberCount || 0} subscribers
              </div>
            </div>

            {showDataSummary && context && (
              <div className="mt-4 pt-4 border-t border-red-100 dark:border-red-900/50 space-y-3 text-sm">
                {context.creatorName && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Creator:</span>
                    <span className="ml-2 text-slate-900 dark:text-white">{context.creatorName}</span>
                  </div>
                )}
                {context.movieTitle && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Film:</span>
                    <span className="ml-2 text-slate-900 dark:text-white">{context.movieTitle}</span>
                  </div>
                )}
                {context.tagline && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Tagline:</span>
                    <span className="ml-2 text-slate-900 dark:text-white line-clamp-2">{context.tagline}</span>
                  </div>
                )}
                {context.bio && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Bio:</span>
                    <span className="ml-2 text-slate-900 dark:text-white line-clamp-2">{context.bio}</span>
                  </div>
                )}
                {context.trailerTranscriptSummary && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Trailer Summary:</span>
                    <span className="ml-2 text-slate-900 dark:text-white line-clamp-3">{context.trailerTranscriptSummary}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Campaign Name */}
          <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Campaign Name
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Auto-generated from template..."
              className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:placeholder-slate-500 dark:focus:ring-0"
            />
          </div>

          {/* Template Selection */}
          <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Email Template
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => {
                setSelectedTemplate(e.target.value);
                setHasGenerated(false);
              }}
              className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:focus:ring-0"
            >
              <option value="">Select a template...</option>
              {templates?.map((template) => (
                <option key={template._id} value={template.key}>
                  {template.name}
                </option>
              ))}
            </select>
            {currentTemplate && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{currentTemplate.description}</p>
            )}
          </div>

          {/* Project Selection */}
          {dataContextQuery?.availableProjects && dataContextQuery.availableProjects.length > 1 && (
            <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Film className="h-4 w-4 inline mr-1" />
                Focus Project
              </label>
              <select
                value={selectedProjectId || ""}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value ? e.target.value as Id<"projects"> : null);
                  setHasGenerated(false);
                }}
                className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:focus:ring-0"
              >
                <option value="">Featured project (auto)</option>
                {dataContextQuery.availableProjects.map((project) => (
                  <option key={project._id} value={project._id}>
                    {project.title} {project.isFeatured && "⭐"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tone & Brevity */}
          <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Tone
                </label>
                <select
                  value={selectedTone}
                  onChange={(e) => {
                    setSelectedTone(e.target.value);
                    setHasGenerated(false);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:focus:ring-0"
                >
                  <option value="casual">Casual</option>
                  <option value="formal">Formal</option>
                  <option value="hype">Hype</option>
                  <option value="heartfelt">Heartfelt</option>
                  <option value="informational">Informational</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Length
                </label>
                <select
                  value={selectedBrevity}
                  onChange={(e) => {
                    setSelectedBrevity(e.target.value);
                    setHasGenerated(false);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:focus:ring-0"
                >
                  <option value="short">Short</option>
                  <option value="medium">Medium</option>
                  <option value="detailed">Detailed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !selectedTemplate}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-medium shadow-md shadow-red-950/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Generating from your data...
              </>
            ) : hasGenerated ? (
              <>
                <RefreshCw className="h-5 w-5" />
                Regenerate Email
              </>
            ) : (
              <>
                <Zap className="h-5 w-5" />
                Generate AI Email
              </>
            )}
          </button>

          {/* Audience */}
          <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <Users className="h-4 w-4 inline mr-1" />
              Audience
            </label>
            <select
              value={audienceType}
              onChange={(e) => setAudienceType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:focus:ring-0"
            >
              <option value="creator_subscribers">My Fans ({audienceStats?.active || 0})</option>
              <option value="site_wide">Site-Wide Audience ({siteWideStats?.active || 0})</option>
              <option value="all_filmmakers">All Filmmakers (Platform Users)</option>
              {incompleteOnboardingStats?.count !== undefined && incompleteOnboardingStats.count > 0 && (
                <option value="incomplete_onboarding">
                  Incomplete Onboarding ({incompleteOnboardingStats.count})
                </option>
              )}
            </select>

            {audienceType === "all_filmmakers" && (
              <div className="mt-2 p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                <p className="text-xs text-indigo-700 dark:text-indigo-300">
                  This will send to all registered filmmakers on the platform who have created a profile.
                </p>
              </div>
            )}

            {audienceType === "incomplete_onboarding" && (
              <div className="mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  This will send to users who signed up but haven&apos;t completed the onboarding process
                  (no profile created yet).
                </p>
              </div>
            )}

            {/* Audience Preview */}
            {fanEmailsPreview && fanEmailsPreview.active > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setShowAudienceList(!showAudienceList)}
                  className="flex items-center justify-between w-full text-left text-xs"
                >
                  <span className="text-slate-500 dark:text-slate-400">
                    {fanEmailsPreview.active} active recipient{fanEmailsPreview.active !== 1 ? "s" : ""}
                  </span>
                  {showAudienceList ? (
                    <ChevronUp className="h-3 w-3 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-slate-400" />
                  )}
                </button>

                {showAudienceList && (
                  <div className="mt-2 space-y-1">
                    {fanEmailsPreview.fans.map((fan) => (
                      <div
                        key={fan.id}
                        className="flex items-center justify-between py-1.5 px-2 rounded bg-slate-50 dark:bg-slate-800/50 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="h-3 w-3 text-slate-400 flex-shrink-0" />
                          <span className="text-slate-700 dark:text-slate-300 truncate">
                            {fan.name || fan.email}
                          </span>
                        </div>
                        {fan.source && (
                          <span className="text-slate-400 text-[10px] flex-shrink-0 ml-2">
                            {fan.source}
                          </span>
                        )}
                      </div>
                    ))}
                    {fanEmailsPreview.active > 5 && (
                      <div className="text-center text-xs text-slate-400 pt-1">
                        +{fanEmailsPreview.active - 5} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {fanEmailsPreview && fanEmailsPreview.active === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                No fans yet. Share your page to grow your audience!
              </p>
            )}
          </div>
        </div>

        {/* Right Panel - Content Editor */}
        <div className="lg:col-span-2 space-y-4">
          {/* Subject Line */}
          <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-[#0f1219]">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={isGenerating ? "Generating..." : "Select a template to generate..."}
              className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:placeholder-slate-500 dark:focus:ring-0"
            />
            {alternateSubjects.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Alternative options:</p>
                <div className="flex flex-wrap gap-2">
                  {alternateSubjects.map((alt, i) => (
                    <button
                      key={i}
                      onClick={() => setSubject(alt)}
                      className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:border-red-800 dark:text-red-200 transition-colors"
                    >
                      {alt}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Preview/Edit Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(false)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                !showPreview
                  ? "bg-red-600 text-white shadow-md shadow-red-950/30"
                  : "border border-red-200 bg-white text-slate-700 hover:bg-red-50 dark:border-red-900/50 dark:bg-[#161a24] dark:text-slate-300 dark:hover:bg-red-900/30"
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
                  : "border border-red-200 bg-white text-slate-700 hover:bg-red-50 dark:border-red-900/50 dark:bg-[#161a24] dark:text-slate-300 dark:hover:bg-red-900/30"
              }`}
            >
              <Eye className="h-4 w-4 inline mr-2" />
              Preview
            </button>
          </div>

          {/* Content Editor / Preview */}
          <div className="rounded-2xl border border-red-200 bg-white shadow-sm dark:border-red-900/50 dark:bg-[#0f1219] overflow-hidden">
            {!hasGenerated && !isGenerating ? (
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                  <Sparkles className="h-8 w-8 text-red-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  Ready to Generate
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-4">
                  Select a template and click &quot;Generate AI Email&quot; to create personalized content
                  using your profile, film, and audience data.
                </p>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Database className="h-3 w-3" /> Profile data
                  </span>
                  <span className="flex items-center gap-1">
                    <Film className="h-3 w-3" /> Film info
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Trailer analysis
                  </span>
                </div>
              </div>
            ) : isGenerating ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-10 w-10 animate-spin text-red-500 mb-4" />
                <p className="text-slate-600 dark:text-slate-300">Generating personalized email...</p>
                <p className="text-sm text-slate-400 mt-1">Using your profile, film, and audience data</p>
              </div>
            ) : showPreview ? (
              <div className="p-4">
                <div className="bg-white rounded-lg overflow-hidden max-h-[600px] overflow-y-auto border border-slate-200">
                  <div
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                    className="email-preview"
                  />
                </div>
              </div>
            ) : (
              <div className="p-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Email Content
                </label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  rows={20}
                  className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 font-mono text-sm placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:placeholder-slate-500 dark:focus:ring-0"
                  placeholder="Your email content will appear here..."
                />
              </div>
            )}
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
                  className="flex-1 px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:bg-[#161a24] dark:text-white dark:placeholder-slate-500 dark:focus:ring-0"
                />
                <button
                  onClick={handleSendTest}
                  className="px-4 py-2 rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-800/50 transition-colors"
                >
                  Send Test
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
