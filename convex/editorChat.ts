/**
 * Editor Chat - AI-powered landing page builder assistant
 *
 * This module provides mutations and queries for the chat interface
 * that helps users build their landing pages through natural conversation.
 */

import { v } from "convex/values";
import { mutation, query, action, internalQuery, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

// =============================================================================
// FIELD MAPPING - Technical names to user-friendly labels
// =============================================================================

export const FIELD_MAPPING = {
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
} as const;

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

/**
 * Get or create a chat session for the current user and profile
 */
export const getOrCreateSession = mutation({
  args: {
    slug: v.string(),
    actorProfileId: v.id("actor_profiles"),
    profileContext: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Check for existing active session
    const existingSession = await ctx.db
      .query("editor_chat_sessions")
      .withIndex("by_userId_actorProfile", (q) =>
        q.eq("userId", user._id).eq("actorProfileId", args.actorProfileId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (existingSession) {
      // Update context if provided
      if (args.profileContext) {
        await ctx.db.patch(existingSession._id, {
          profileContext: args.profileContext,
          updatedAt: Date.now(),
        });
      }
      return existingSession._id;
    }

    // Create new session
    const sessionId = await ctx.db.insert("editor_chat_sessions", {
      userId: user._id,
      actorProfileId: args.actorProfileId,
      slug: args.slug,
      status: "active",
      messageCount: 0,
      profileContext: args.profileContext,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Add welcome message
    await ctx.db.insert("editor_chat_messages", {
      sessionId,
      role: "assistant",
      content:
        "Hi! I'm here to help you build your landing page. I can see your current profile and help you fill in missing information. What would you like to work on? You can ask me to help with your bio, add a trailer link, or improve any other section.",
      createdAt: Date.now(),
    });

    await ctx.db.patch(sessionId, {
      messageCount: 1,
      lastMessageAt: Date.now(),
    });

    return sessionId;
  },
});

/**
 * Get chat session with messages
 */
export const getSession = query({
  args: {
    sessionId: v.id("editor_chat_sessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const messages = await ctx.db
      .query("editor_chat_messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();

    return {
      ...session,
      messages,
    };
  },
});

/**
 * Get active session for user and profile
 */
export const getActiveSession = query({
  args: {
    actorProfileId: v.id("actor_profiles"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
      .first();

    if (!user) return null;

    const session = await ctx.db
      .query("editor_chat_sessions")
      .withIndex("by_userId_actorProfile", (q) =>
        q.eq("userId", user._id).eq("actorProfileId", args.actorProfileId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!session) return null;

    const messages = await ctx.db
      .query("editor_chat_messages")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .order("asc")
      .collect();

    return {
      ...session,
      messages,
    };
  },
});

// =============================================================================
// MESSAGE HANDLING
// =============================================================================

/**
 * Add a user message to the chat
 */
export const addUserMessage = mutation({
  args: {
    sessionId: v.id("editor_chat_sessions"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const messageId = await ctx.db.insert("editor_chat_messages", {
      sessionId: args.sessionId,
      role: "user",
      content: args.content,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.sessionId, {
      messageCount: session.messageCount + 1,
      lastMessageAt: Date.now(),
      updatedAt: Date.now(),
    });

    return messageId;
  },
});

/**
 * Add an assistant message to the chat
 */
export const addAssistantMessage = mutation({
  args: {
    sessionId: v.id("editor_chat_sessions"),
    content: v.string(),
    actionRequest: v.optional(
      v.object({
        type: v.string(),
        section: v.string(),
        field: v.optional(v.string()),
        value: v.optional(v.string()),
        url: v.optional(v.string()),
      })
    ),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const messageId = await ctx.db.insert("editor_chat_messages", {
      sessionId: args.sessionId,
      role: "assistant",
      content: args.content,
      actionRequest: args.actionRequest,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.sessionId, {
      messageCount: session.messageCount + 1,
      lastMessageAt: Date.now(),
      updatedAt: Date.now(),
    });

    return messageId;
  },
});

/**
 * Update session section focus
 */
export const updateSessionSection = mutation({
  args: {
    sessionId: v.id("editor_chat_sessions"),
    currentSection: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      currentSection: args.currentSection,
      updatedAt: Date.now(),
    });
  },
});

// =============================================================================
// ACTION QUEUE
// =============================================================================

/**
 * Queue an action to be executed
 */
export const queueAction = mutation({
  args: {
    sessionId: v.id("editor_chat_sessions"),
    messageId: v.optional(v.id("editor_chat_messages")),
    actorProfileId: v.id("actor_profiles"),
    actionType: v.string(),
    section: v.string(),
    field: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const actionId = await ctx.db.insert("editor_action_queue", {
      sessionId: args.sessionId,
      messageId: args.messageId,
      actorProfileId: args.actorProfileId,
      actionType: args.actionType,
      section: args.section,
      field: args.field,
      value: args.value,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return actionId;
  },
});

/**
 * Execute a pending action
 */
export const executeAction = mutation({
  args: {
    actionId: v.id("editor_action_queue"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const action = await ctx.db.get(args.actionId);
    if (!action) {
      throw new Error("Action not found");
    }

    if (action.status !== "pending") {
      throw new Error("Action already processed");
    }

    // Mark as processing
    await ctx.db.patch(args.actionId, {
      status: "processing",
      updatedAt: Date.now(),
    });

    try {
      // Get the profile
      const profile = await ctx.db.get(action.actorProfileId);
      if (!profile) {
        throw new Error("Profile not found");
      }

      // Execute based on action type and section
      if (action.section === "profile") {
        // Update profile field
        const update: Record<string, unknown> = {};
        update[action.field] = action.value;
        await ctx.db.patch(action.actorProfileId, update);
      } else if (
        action.section === "featured-project" ||
        action.section === "featured-clip"
      ) {
        // For project/clip updates, we need to find the featured item
        // This would typically be handled by the frontend calling the existing
        // updateOwnerPage mutation, but we can queue it for later
      }

      await ctx.db.patch(args.actionId, {
        status: "completed",
        executedAt: Date.now(),
        executedBy: "user_confirm",
        updatedAt: Date.now(),
      });

      return { success: true };
    } catch (error) {
      await ctx.db.patch(args.actionId, {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        updatedAt: Date.now(),
      });

      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

/**
 * Get pending actions for a session
 */
export const getPendingActions = query({
  args: {
    sessionId: v.id("editor_chat_sessions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("editor_action_queue")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
  },
});

// =============================================================================
// CHAT ACTION - Calls Modal endpoint
// =============================================================================

// Types for the chat action
type ChatActionResult = {
  success: boolean;
  content?: string;
  actions?: Array<{
    type: string;
    section: string;
    field?: string;
    value?: string;
  }>;
  error?: string;
};

type ModalChatResponse = {
  success: boolean;
  content?: string;
  actions?: Array<{
    type: string;
    section: string;
    field?: string;
    value?: string;
  }>;
  error?: string;
  input_tokens?: number;
  output_tokens?: number;
};

type SessionWithMessages = {
  _id: Id<"editor_chat_sessions">;
  actorProfileId: Id<"actor_profiles">;
  messages: Array<{
    role: string;
    content: string;
  }>;
};

/**
 * Send a chat message and get AI response
 * This is an action because it calls the external Modal API
 */
export const sendMessage = action({
  args: {
    sessionId: v.id("editor_chat_sessions"),
    message: v.string(),
    profileData: v.object({
      profile: v.any(),
      project: v.any(),
      clip: v.any(),
    }),
    currentSection: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ChatActionResult> => {
    // Get chat history
    const session: SessionWithMessages | null = await ctx.runQuery(internal.editorChat.getSessionInternal, {
      sessionId: args.sessionId,
    });

    if (!session) {
      throw new Error("Session not found");
    }

    // Add user message first
    await ctx.runMutation(internal.editorChat.addUserMessageInternal, {
      sessionId: args.sessionId,
      content: args.message,
    });

    // Prepare chat history for Modal
    const chatHistory: Array<{ role: string; content: string }> = session.messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Call Modal endpoint
    const modalUrl = process.env.MODAL_EDITOR_CHAT_ENDPOINT_URL;
    if (!modalUrl) {
      // Fallback: add a placeholder response
      await ctx.runMutation(internal.editorChat.addAssistantMessageInternal, {
        sessionId: args.sessionId,
        content: "I'm currently being set up. Please try again in a moment.",
      });
      return {
        success: false,
        error: "Modal endpoint not configured",
      };
    }

    try {
      const response: Response = await fetch(modalUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: args.sessionId,
          message: args.message,
          profile_data: args.profileData,
          chat_history: chatHistory,
          current_section: args.currentSection,
        }),
      });

      const result: ModalChatResponse = await response.json();

      if (result.success) {
        // Add assistant response
        await ctx.runMutation(internal.editorChat.addAssistantMessageInternal, {
          sessionId: args.sessionId,
          content: result.content || "",
          inputTokens: result.input_tokens,
          outputTokens: result.output_tokens,
        });

        // Queue any actions
        if (result.actions && result.actions.length > 0) {
          for (const actionItem of result.actions) {
            if (actionItem.type === "update_field" && actionItem.field && actionItem.value) {
              await ctx.runMutation(internal.editorChat.queueActionInternal, {
                sessionId: args.sessionId,
                actorProfileId: session.actorProfileId,
                actionType: actionItem.type,
                section: actionItem.section,
                field: actionItem.field,
                value: actionItem.value,
              });
            }
          }
        }

        return {
          success: true,
          content: result.content,
          actions: result.actions || [],
        };
      } else {
        await ctx.runMutation(internal.editorChat.addAssistantMessageInternal, {
          sessionId: args.sessionId,
          content: result.content || "I encountered an issue. Please try again.",
        });

        return {
          success: false,
          error: result.error,
        };
      }
    } catch (error) {
      console.error("Chat action error:", error);

      await ctx.runMutation(internal.editorChat.addAssistantMessageInternal, {
        sessionId: args.sessionId,
        content: "I'm having trouble connecting. Please try again.",
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// =============================================================================
// SUGGESTIONS ACTION - Calls Modal endpoint for AI-powered suggestions
// =============================================================================

type SuggestionItem = {
  id: string;
  section: string;
  field: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  prompt: string;
};

type SuggestionsResult = {
  success: boolean;
  suggestions: SuggestionItem[];
  error?: string;
};

/**
 * Get AI-powered suggestion cards for the current profile state
 * This calls the Modal endpoint for smarter, context-aware suggestions
 */
export const getSuggestions = action({
  args: {
    profileData: v.object({
      profile: v.any(),
      project: v.any(),
      clip: v.any(),
    }),
    currentSection: v.optional(v.string()),
  },
  handler: async (_ctx, args): Promise<SuggestionsResult> => {
    const modalUrl = process.env.MODAL_EDITOR_SUGGESTIONS_ENDPOINT_URL;

    if (!modalUrl) {
      return {
        success: false,
        suggestions: [],
        error: "Suggestions endpoint not configured",
      };
    }

    try {
      const response = await fetch(modalUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profile_data: args.profileData,
          current_section: args.currentSection,
        }),
      });

      const result = await response.json();

      if (result.success) {
        return {
          success: true,
          suggestions: result.suggestions || [],
        };
      } else {
        return {
          success: false,
          suggestions: [],
          error: result.error,
        };
      }
    } catch (error) {
      console.error("Suggestions action error:", error);
      return {
        success: false,
        suggestions: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// =============================================================================
// COMPLETION STATUS ACTION - Calls Modal endpoint for section completion
// =============================================================================

type IncompleteField = {
  label: string;
  hint?: string;
  required: boolean;
};

type SectionStatus = {
  title: string;
  percentage: number;
  completed: string[];
  incomplete: IncompleteField[];
};

type CompletionStatusResult = {
  success: boolean;
  sections: Record<string, SectionStatus>;
  error?: string;
};

/**
 * Get completion status for all sections
 * This calls the Modal endpoint for detailed completion analysis
 */
export const getCompletionStatus = action({
  args: {
    profileData: v.object({
      profile: v.any(),
      project: v.any(),
      clip: v.any(),
    }),
  },
  handler: async (_ctx, args): Promise<CompletionStatusResult> => {
    const modalUrl = process.env.MODAL_EDITOR_COMPLETION_STATUS_ENDPOINT_URL;

    if (!modalUrl) {
      return {
        success: false,
        sections: {},
        error: "Completion status endpoint not configured",
      };
    }

    try {
      const response = await fetch(modalUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profile_data: args.profileData,
        }),
      });

      const result = await response.json();

      if (result.success) {
        return {
          success: true,
          sections: result.sections || {},
        };
      } else {
        return {
          success: false,
          sections: {},
          error: result.error,
        };
      }
    } catch (error) {
      console.error("Completion status action error:", error);
      return {
        success: false,
        sections: {},
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// =============================================================================
// INTERNAL FUNCTIONS (for action to call)
// =============================================================================

export const getSessionInternal = internalQuery({
  args: { sessionId: v.id("editor_chat_sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const messages = await ctx.db
      .query("editor_chat_messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();

    return { ...session, messages };
  },
});

export const addUserMessageInternal = internalMutation({
  args: {
    sessionId: v.id("editor_chat_sessions"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    await ctx.db.insert("editor_chat_messages", {
      sessionId: args.sessionId,
      role: "user",
      content: args.content,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.sessionId, {
      messageCount: session.messageCount + 1,
      lastMessageAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const addAssistantMessageInternal = internalMutation({
  args: {
    sessionId: v.id("editor_chat_sessions"),
    content: v.string(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    await ctx.db.insert("editor_chat_messages", {
      sessionId: args.sessionId,
      role: "assistant",
      content: args.content,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.sessionId, {
      messageCount: session.messageCount + 1,
      lastMessageAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const queueActionInternal = internalMutation({
  args: {
    sessionId: v.id("editor_chat_sessions"),
    actorProfileId: v.id("actor_profiles"),
    actionType: v.string(),
    section: v.string(),
    field: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("editor_action_queue", {
      sessionId: args.sessionId,
      actorProfileId: args.actorProfileId,
      actionType: args.actionType,
      section: args.section,
      field: args.field,
      value: args.value,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
