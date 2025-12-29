"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  MessageCircle,
  Send,
  Mic,
  MicOff,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  X,
  Loader2,
  ArrowRight,
} from "lucide-react";

// =============================================================================
// TYPES
// =============================================================================

type FormState = {
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  avatarUrl: string;
  project: {
    title: string;
    logline?: string | null;
    releaseYear?: number | null;
    status?: string | null;
    roleName?: string | null;
    primaryWatchLabel?: string | null;
    primaryWatchUrl?: string | null;
    trailerUrl?: string | null;
  };
  clip: {
    title: string;
    youtubeUrl: string;
  };
};

type SectionKey = "profile" | "featured-project" | "featured-clip";

type SuggestionCard = {
  id: string;
  section: SectionKey;
  field: string;
  title: string;
  description: string;
  placeholder?: string;
  type: string;
  priority: "high" | "medium" | "low";
  prompt: string;
};

type ChatMessage = {
  _id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  actionRequest?: {
    type: string;
    section: string;
    field?: string;
    value?: string;
  };
};

// =============================================================================
// FIELD MAPPING
// =============================================================================

const FIELD_MAPPING: Record<SectionKey, Record<string, { label: string; type: string; required: boolean }>> = {
  profile: {
    displayName: { label: "Your Name", type: "text", required: true },
    headline: { label: "Tagline", type: "text", required: false },
    location: { label: "City/Location", type: "text", required: false },
    avatarUrl: { label: "Profile Photo", type: "url", required: false },
    bio: { label: "About You", type: "textarea", required: false },
  },
  "featured-project": {
    title: { label: "Project Title", type: "text", required: true },
    logline: { label: "Project Description", type: "textarea", required: false },
    releaseYear: { label: "Year", type: "number", required: false },
    status: { label: "Project Status", type: "select", required: false },
    roleName: { label: "Your Role", type: "text", required: false },
    primaryWatchLabel: { label: "Watch Button Text", type: "text", required: false },
    primaryWatchUrl: { label: "Watch Link", type: "url", required: false },
    trailerUrl: { label: "Trailer Link", type: "url", required: false },
  },
  "featured-clip": {
    title: { label: "Clip Name", type: "text", required: true },
    youtubeUrl: { label: "Video URL", type: "url", required: true },
  },
};

// =============================================================================
// SECTION COMPLETION HELPER
// =============================================================================

function getSectionCompletion(form: FormState): Record<SectionKey, { completed: string[]; incomplete: string[]; percentage: number }> {
  const result: Record<SectionKey, { completed: string[]; incomplete: string[]; percentage: number }> = {
    profile: { completed: [], incomplete: [], percentage: 0 },
    "featured-project": { completed: [], incomplete: [], percentage: 0 },
    "featured-clip": { completed: [], incomplete: [], percentage: 0 },
  };

  // Profile section
  const profileFields = FIELD_MAPPING.profile;
  for (const [key, info] of Object.entries(profileFields)) {
    const value = form[key as keyof typeof form];
    if (value && String(value).trim()) {
      result.profile.completed.push(info.label);
    } else {
      result.profile.incomplete.push(info.label);
    }
  }
  result.profile.percentage = Math.round(
    (result.profile.completed.length / Object.keys(profileFields).length) * 100
  );

  // Featured project section
  const projectFields = FIELD_MAPPING["featured-project"];
  for (const [key, info] of Object.entries(projectFields)) {
    const value = form.project[key as keyof typeof form.project];
    if (value && String(value).trim()) {
      result["featured-project"].completed.push(info.label);
    } else {
      result["featured-project"].incomplete.push(info.label);
    }
  }
  result["featured-project"].percentage = Math.round(
    (result["featured-project"].completed.length / Object.keys(projectFields).length) * 100
  );

  // Featured clip section
  const clipFields = FIELD_MAPPING["featured-clip"];
  for (const [key, info] of Object.entries(clipFields)) {
    const value = form.clip[key as keyof typeof form.clip];
    if (value && String(value).trim()) {
      result["featured-clip"].completed.push(info.label);
    } else {
      result["featured-clip"].incomplete.push(info.label);
    }
  }
  result["featured-clip"].percentage = Math.round(
    (result["featured-clip"].completed.length / Object.keys(clipFields).length) * 100
  );

  return result;
}

// =============================================================================
// SUGGESTION CARDS HELPER
// =============================================================================

function getSuggestionCards(form: FormState, currentSection?: SectionKey): SuggestionCard[] {
  const cards: SuggestionCard[] = [];
  const sections = currentSection ? [currentSection] : (["profile", "featured-project", "featured-clip"] as SectionKey[]);

  for (const section of sections) {
    const fields = FIELD_MAPPING[section];
    let data: Record<string, unknown>;

    if (section === "profile") {
      data = {
        displayName: form.displayName,
        headline: form.headline,
        bio: form.bio,
        location: form.location,
        avatarUrl: form.avatarUrl,
      };
    } else if (section === "featured-project") {
      data = form.project as unknown as Record<string, unknown>;
    } else {
      data = form.clip as unknown as Record<string, unknown>;
    }

    for (const [key, info] of Object.entries(fields)) {
      const value = data[key];
      if (!value || !String(value).trim()) {
        const card: SuggestionCard = {
          id: `${section}_${key}`,
          section,
          field: key,
          title: `Add ${info.label}`,
          description: `Help me add my ${info.label.toLowerCase()}`,
          type: info.type,
          priority: info.required ? "high" : "medium",
          prompt: info.type === "url"
            ? `I have a URL for ${info.label.toLowerCase()}`
            : info.type === "textarea"
              ? `Help me write my ${info.label.toLowerCase()}`
              : `Help me add my ${info.label.toLowerCase()}`,
        };
        cards.push(card);
      }
    }
  }

  // Sort by priority
  return cards.sort((a, b) => {
    const priority = { high: 0, medium: 1, low: 2 };
    return priority[a.priority] - priority[b.priority];
  }).slice(0, 6);
}

// =============================================================================
// SECTION CHECKLIST COMPONENT
// =============================================================================

function SectionChecklist({
  form,
  currentSection,
  onSelectSection,
}: {
  form: FormState;
  currentSection?: SectionKey;
  onSelectSection: (section: SectionKey) => void;
}) {
  const completion = getSectionCompletion(form);
  const [isExpanded, setIsExpanded] = useState(true);

  const sections: { key: SectionKey; title: string }[] = [
    { key: "profile", title: "Profile" },
    { key: "featured-project", title: "Featured Project" },
    { key: "featured-clip", title: "Featured Clip" },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#f53c56]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
            Sections to Complete
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-white/40" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/40" />
        )}
      </button>

      {isExpanded && (
        <div className="p-3 pt-0 space-y-2">
          {sections.map((section) => {
            const sectionCompletion = completion[section.key];
            const isComplete = sectionCompletion.percentage === 100;
            const isSelected = currentSection === section.key;

            return (
              <button
                key={section.key}
                onClick={() => onSelectSection(section.key)}
                className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                  isSelected
                    ? "bg-[#f53c56]/20 border border-[#f53c56]/40"
                    : "hover:bg-white/5 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  {isComplete ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Circle className="w-4 h-4 text-white/30" />
                  )}
                  <span className="text-sm text-white/80">{section.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isComplete ? "bg-emerald-400" : "bg-[#f53c56]"
                      }`}
                      style={{ width: `${sectionCompletion.percentage}%` }}
                    />
                  </div>
                  <span className="text-xs text-white/40 w-8 text-right">
                    {sectionCompletion.percentage}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ACTION CARDS COMPONENT
// =============================================================================

function ActionCards({
  suggestions,
  onCardClick,
  isLoading,
}: {
  suggestions: SuggestionCard[];
  onCardClick: (prompt: string) => void;
  isLoading: boolean;
}) {
  if (suggestions.length === 0) {
    return (
      <div className="text-center py-4 text-white/40 text-sm">
        All fields are complete! Great job!
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {suggestions.slice(0, 4).map((card) => (
        <button
          key={card.id}
          onClick={() => onCardClick(card.prompt)}
          disabled={isLoading}
          className={`p-3 rounded-lg text-left transition-all group ${
            card.priority === "high"
              ? "bg-[#f53c56]/10 border border-[#f53c56]/30 hover:border-[#f53c56]/50"
              : "bg-white/5 border border-white/10 hover:border-white/20"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white/90 truncate">
                {card.title}
              </p>
              <p className="text-xs text-white/50 mt-0.5 line-clamp-2">
                {card.description}
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/60 flex-shrink-0 mt-0.5" />
          </div>
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// CHAT MESSAGES COMPONENT
// =============================================================================

function ChatMessages({ messages }: { messages: ChatMessage[] }) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {messages.map((message) => (
        <div
          key={message._id}
          className={`flex ${
            message.role === "user" ? "justify-end" : "justify-start"
          }`}
        >
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
              message.role === "user"
                ? "bg-[#f53c56] text-white rounded-br-md"
                : "bg-white/10 text-white/90 rounded-bl-md"
            }`}
          >
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            {message.actionRequest && (
              <div className="mt-2 p-2 rounded-lg bg-black/20 border border-white/10">
                <p className="text-xs text-white/60">
                  Action: Update {message.actionRequest.section} → {message.actionRequest.field}
                </p>
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}

// =============================================================================
// CHAT INPUT COMPONENT WITH VOICE INPUT
// =============================================================================

// Type declaration for Web Speech API (not fully typed in lib.dom.d.ts)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [interimTranscript, setInterimTranscript] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Check for browser support on mount
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setIsSupported(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading && !disabled) {
        onSubmit();
      }
    }
  };

  const startRecording = useCallback(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      console.error("Speech recognition not supported");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsRecording(true);
      setInterimTranscript("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      // Append final transcript to current value
      if (finalTranscript) {
        const separator = value.trim() ? " " : "";
        onChange(value + separator + finalTranscript.trim());
      }

      // Show interim transcript for visual feedback
      setInterimTranscript(interimText);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      setIsRecording(false);
      setInterimTranscript("");

      // Handle specific errors
      if (event.error === "not-allowed") {
        alert("Microphone access denied. Please allow microphone access in your browser settings.");
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimTranscript("");
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (error) {
      console.error("Failed to start speech recognition:", error);
      setIsRecording(false);
    }
  }, [value, onChange]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
    setInterimTranscript("");
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="border-t border-white/10 p-3">
      {/* Interim transcript display */}
      {interimTranscript && (
        <div className="mb-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <p className="text-sm text-white/60 italic">{interimTranscript}</p>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || "Ask me to help with your page..."}
            disabled={isLoading || isRecording || disabled}
            className="w-full min-h-[40px] max-h-[120px] resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-[#f53c56]/50 focus:ring-1 focus:ring-[#f53c56]/30 focus:outline-none disabled:opacity-50"
            rows={1}
          />
        </div>
        {isSupported && (
          <button
            onClick={toggleRecording}
            disabled={isLoading}
            className={`p-2.5 rounded-xl transition-all ${
              isRecording
                ? "bg-red-500 text-white animate-pulse"
                : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
            } disabled:opacity-50`}
            title={isRecording ? "Stop recording" : "Start voice input"}
          >
            {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
        )}
        <button
          onClick={onSubmit}
          disabled={!value.trim() || isLoading || isRecording || disabled}
          className="p-2.5 rounded-xl bg-[#f53c56] text-white hover:bg-[#f53c56]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Recording indicator */}
      {isRecording && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-red-400">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span>Listening... Speak now</span>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN CHAT INTERFACE COMPONENT
// =============================================================================

export function EditorChatInterface({
  slug,
  actorProfileId,
  form,
  onUpdateField,
}: {
  slug: string;
  actorProfileId: Id<"actor_profiles">;
  form: FormState;
  onUpdateField: (section: SectionKey, field: string, value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSection, setCurrentSection] = useState<SectionKey | undefined>();
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);

  // Convex queries and mutations
  const getOrCreateSession = useMutation(api.editorChat.getOrCreateSession);
  const activeSession = useQuery(api.editorChat.getActiveSession, { actorProfileId });
  const sendMessage = useAction(api.editorChat.sendMessage);
  const pendingActions = useQuery(
    api.editorChat.getPendingActions,
    activeSession ? { sessionId: activeSession._id } : "skip"
  );
  const executeAction = useMutation(api.editorChat.executeAction);
  const updateSessionSection = useMutation(api.editorChat.updateSessionSection);

  // Sync messages from server
  useEffect(() => {
    if (activeSession?.messages) {
      setLocalMessages(activeSession.messages as ChatMessage[]);
    }
  }, [activeSession?.messages]);

  // Initialize session when opened
  useEffect(() => {
    if (isOpen && !activeSession) {
      const profileData = JSON.stringify({
        profile: {
          displayName: form.displayName,
          headline: form.headline,
          bio: form.bio,
          location: form.location,
          avatarUrl: form.avatarUrl,
        },
        project: form.project,
        clip: form.clip,
      });

      getOrCreateSession({
        slug,
        actorProfileId,
        profileContext: profileData,
      });
    }
  }, [isOpen, activeSession, slug, actorProfileId, form, getOrCreateSession]);

  // Update section on server when changed
  useEffect(() => {
    if (activeSession && currentSection) {
      updateSessionSection({
        sessionId: activeSession._id,
        currentSection,
      });
    }
  }, [activeSession, currentSection, updateSessionSection]);

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || !activeSession || isLoading) return;

    const message = inputValue.trim();
    setInputValue("");
    setIsLoading(true);

    // Optimistically add user message
    const tempUserMessage: ChatMessage = {
      _id: `temp-${Date.now()}`,
      role: "user",
      content: message,
      createdAt: Date.now(),
    };
    setLocalMessages((prev) => [...prev, tempUserMessage]);

    try {
      const result = await sendMessage({
        sessionId: activeSession._id,
        message,
        profileData: {
          profile: {
            displayName: form.displayName,
            headline: form.headline,
            bio: form.bio,
            location: form.location,
            avatarUrl: form.avatarUrl,
          },
          project: form.project,
          clip: form.clip,
        },
        currentSection,
      });

      if (result.success && result.content) {
        // Add assistant message
        const assistantMessage: ChatMessage = {
          _id: `temp-assistant-${Date.now()}`,
          role: "assistant",
          content: result.content,
          createdAt: Date.now(),
        };
        setLocalMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, activeSession, isLoading, sendMessage, form, currentSection]);

  const handleCardClick = useCallback((prompt: string) => {
    setInputValue(prompt);
  }, []);

  const handleExecuteAction = useCallback(
    async (actionId: Id<"editor_action_queue">) => {
      const action = pendingActions?.find((a) => a._id === actionId);
      if (!action) return;

      try {
        await executeAction({ actionId });
        // Apply the change locally
        onUpdateField(action.section as SectionKey, action.field, action.value);
      } catch (error) {
        console.error("Failed to execute action:", error);
      }
    },
    [executeAction, onUpdateField, pendingActions]
  );

  const suggestions = getSuggestionCards(form, currentSection);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[#f53c56] px-5 py-3 text-white shadow-lg shadow-[#f53c56]/30 hover:bg-[#f53c56]/90 transition-all hover:scale-105"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="font-medium">AI Assistant</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] h-[600px] flex flex-col rounded-2xl border border-white/10 bg-gradient-to-br from-[#1a0f1f] via-[#0f0a16] to-black shadow-2xl shadow-black/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#f53c56] to-[#d62a45] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">AI Page Builder</h3>
            <p className="text-xs text-white/50">I'll help you build your page</p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5 text-white/60" />
        </button>
      </div>

      {/* Section Checklist */}
      <div className="p-3 border-b border-white/5">
        <SectionChecklist
          form={form}
          currentSection={currentSection}
          onSelectSection={setCurrentSection}
        />
      </div>

      {/* Chat Messages */}
      <ChatMessages messages={localMessages} />

      {/* Pending Actions */}
      {pendingActions && pendingActions.length > 0 && (
        <div className="px-3 pb-2 space-y-2">
          {pendingActions.map((action) => (
            <div
              key={action._id}
              className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30"
            >
              <div className="text-xs text-white/80">
                Update {action.field} to "{action.value.slice(0, 30)}..."
              </div>
              <button
                onClick={() => handleExecuteAction(action._id)}
                className="px-3 py-1 text-xs font-medium rounded-full bg-emerald-500 text-white hover:bg-emerald-400 transition-colors"
              >
                Apply
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Action Cards */}
      <div className="p-3 border-t border-white/5">
        <p className="text-xs text-white/40 mb-2">Quick actions:</p>
        <ActionCards
          suggestions={suggestions}
          onCardClick={handleCardClick}
          isLoading={isLoading}
        />
      </div>

      {/* Chat Input */}
      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSendMessage}
        isLoading={isLoading}
        disabled={!activeSession}
        placeholder={!activeSession ? "Connecting..." : undefined}
      />
    </div>
  );
}

export default EditorChatInterface;
