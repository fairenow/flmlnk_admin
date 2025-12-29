"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { pushGTMEvent } from "@/lib/gtm";

/**
 * Event metadata for granular tracking.
 */
export interface EventMetadata {
  // CTA tracking
  ctaLabel?: string;
  ctaUrl?: string;
  ctaPosition?: "hero" | "footer" | "sidebar" | "modal" | string;
  // Social tracking
  socialPlatform?: "instagram" | "facebook" | "youtube" | "tiktok" | "imdb" | "website" | string;
  socialAction?: "click" | "share" | "follow";
  // Video tracking
  videoProgress?: number;
  videoDuration?: number;
  videoCurrentTime?: number;
  // Navigation tracking
  tabName?: string;
  previousTab?: string;
  // Asset tracking
  assetId?: string;
  assetType?: "clip" | "meme" | "gif" | "trailer" | "poster" | string;
  assetTitle?: string;
  // Scroll tracking
  scrollDepth?: number;
  // Time tracking
  timeOnPage?: number;
  // Device info
  deviceType?: "mobile" | "desktop" | "tablet";
  screenWidth?: number;
  screenHeight?: number;
  // Outbound links
  outboundUrl?: string;
  outboundLabel?: string;
  // Project context (for per-project tracking)
  projectId?: string;
  projectTitle?: string;
}

/**
 * Event types for type safety.
 */
export type EventType =
  // Core events
  | "page_view"
  | "clip_played"
  | "clip_shared"
  | "email_captured"
  | "inquiry_submitted"
  | "comment_submitted"
  // Granular CTA events
  | "watch_cta_clicked"
  | "get_updates_clicked"
  | "social_link_clicked"
  | "share_button_clicked"
  // Navigation events
  | "tab_changed"
  | "filmography_item_clicked"
  | "project_selected"
  // Video engagement events
  | "video_play"
  | "video_pause"
  | "video_mute_toggle"
  | "video_fullscreen"
  | "video_progress_25"
  | "video_progress_50"
  | "video_progress_75"
  | "video_completed"
  // Gallery events
  | "generated_clip_viewed"
  | "generated_clip_played"
  | "processing_clip_viewed"
  | "processing_clip_played"
  // Reels/Clips gallery events
  | "clip_thumbnail_viewed"
  | "clip_fullscreen_opened"
  | "clip_fullscreen_closed"
  | "clip_navigated_next"
  | "clip_navigated_prev"
  | "clip_contribution_clicked"
  // Trailer events
  | "trailer_loaded"
  | "trailer_play"
  | "trailer_share"
  // Film/Project events
  | "film_card_viewed"
  | "film_card_clicked"
  | "film_trailer_clicked"
  | "film_watch_cta_clicked"
  // Hero events
  | "hero_video_autoplay"
  | "hero_video_interaction"
  | "hero_cta_clicked"
  // Contact/Booking events
  | "booking_form_started"
  | "booking_form_submitted"
  | "email_signup_started"
  | "email_signup_completed"
  // Engagement events
  | "scroll_depth_25"
  | "scroll_depth_50"
  | "scroll_depth_75"
  | "scroll_depth_100"
  | "time_on_page_30s"
  | "time_on_page_60s"
  | "time_on_page_180s"
  // Deep Analytics events
  | "asset_impression"
  | "asset_engagement"
  | "social_share_intent"
  | "social_share_completed"
  | "outbound_link_clicked"
  // =========================================================================
  // User Journey Events - Landing, Auth, Onboarding, Dashboard
  // =========================================================================
  // Landing page events
  | "landing_page_view"
  | "landing_hero_view"
  | "landing_features_view"
  | "landing_pricing_view"
  | "landing_case_study_view"
  | "landing_cta_clicked"
  | "landing_nav_clicked"
  | "landing_signup_form_view"
  | "landing_signup_form_started"
  // Auth events
  | "signup_page_view"
  | "signup_form_started"
  | "signup_form_submitted"
  | "signup_google_clicked"
  | "signup_email_sent"
  | "signup_completed"
  | "signin_page_view"
  | "signin_form_started"
  | "signin_form_submitted"
  | "signin_google_clicked"
  | "signin_completed"
  | "signin_failed"
  | "password_reset_requested"
  | "password_reset_completed"
  | "email_verified"
  // Onboarding funnel events
  | "onboarding_started"
  | "onboarding_step_view"
  | "onboarding_step_completed"
  | "onboarding_step_skipped"
  | "onboarding_abandoned"
  | "onboarding_completed"
  | "onboarding_form_field_focused"
  | "onboarding_file_uploaded"
  // Dashboard events
  | "dashboard_page_view"
  | "dashboard_module_clicked"
  | "dashboard_module_view"
  | "dashboard_quick_link_clicked"
  | "dashboard_edit_clicked"
  | "dashboard_public_page_clicked"
  | "dashboard_logout_clicked"
  | "dashboard_asset_generated"
  | "dashboard_asset_downloaded"
  | "dashboard_campaign_created"
  | "dashboard_boost_started"
  | "dashboard_settings_saved";

/**
 * Generate or retrieve a session ID for analytics tracking.
 */
function getSessionId(): string {
  if (typeof window === "undefined") {
    return `ssr-${Date.now()}`;
  }

  const storageKey = "flmlnk_session_id";
  const sessionExpiryKey = "flmlnk_session_expiry";
  const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

  const existingSession = sessionStorage.getItem(storageKey);
  const expiry = sessionStorage.getItem(sessionExpiryKey);

  // Check if session is still valid
  if (existingSession && expiry && Date.now() < parseInt(expiry, 10)) {
    // Extend session
    sessionStorage.setItem(sessionExpiryKey, String(Date.now() + SESSION_DURATION));
    return existingSession;
  }

  // Create new session
  const newSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  sessionStorage.setItem(storageKey, newSessionId);
  sessionStorage.setItem(sessionExpiryKey, String(Date.now() + SESSION_DURATION));
  return newSessionId;
}

/**
 * Get device type based on screen width.
 */
function getDeviceType(): "mobile" | "desktop" | "tablet" {
  if (typeof window === "undefined") return "desktop";
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

/**
 * Hook configuration options.
 */
interface UseEventTrackingOptions {
  actorProfileId?: Id<"actor_profiles">;
  projectId?: Id<"projects">;
  clipId?: Id<"clips">;
  slug?: string;
  enableScrollTracking?: boolean;
  enableTimeTracking?: boolean;
}

/**
 * Hook for tracking user events with granular metadata.
 * Sends events to both Convex (for internal analytics) and GTM.
 */
export function useEventTracking(options: UseEventTrackingOptions = {}) {
  const {
    actorProfileId,
    projectId,
    clipId,
    slug,
    enableScrollTracking = false,
    enableTimeTracking = false,
  } = options;

  const logEventMutation = useMutation(api.analytics.logEvent);
  const sessionId = useRef(getSessionId());
  const pageStartTime = useRef(Date.now());

  // Scroll tracking state
  const scrollMilestones = useRef<Set<number>>(new Set());

  // Time tracking state
  const timeMilestones = useRef<Set<number>>(new Set());

  /**
   * Core event tracking function.
   * Supports per-call projectId override via metadata.projectId
   *
   * NOTE: For public page events (CTAs, video engagement, etc.), we require
   * actorProfileId to be set. Events without actorProfileId won't appear
   * in the profile's analytics dashboard.
   */
  const trackEvent = useCallback(
    async (eventType: EventType, metadata?: EventMetadata) => {
      console.log(`[Analytics] trackEvent called:`, { eventType, actorProfileId, metadata });
      const enrichedMetadata: EventMetadata = {
        ...metadata,
        deviceType: metadata?.deviceType || getDeviceType(),
        screenWidth: typeof window !== "undefined" ? window.innerWidth : undefined,
        screenHeight: typeof window !== "undefined" ? window.innerHeight : undefined,
      };

      // Use metadata.projectId as override if provided (for per-project tracking)
      const effectiveProjectId = metadata?.projectId
        ? (metadata.projectId as Id<"projects">)
        : projectId;

      // Log to Convex
      try {
        console.log(`[Analytics] Calling Convex logEvent mutation:`, { actorProfileId, eventType });
        await logEventMutation({
          actorProfileId,
          projectId: effectiveProjectId,
          clipId,
          eventType,
          sessionId: sessionId.current,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          referrer: typeof document !== "undefined" ? document.referrer : undefined,
          metadata: enrichedMetadata,
        });
        console.log(`[Analytics] Convex logEvent success:`, { eventType });
      } catch (error) {
        console.error("[Analytics] Failed to log event to Convex:", error);
      }

      // Also push to GTM for external analytics
      pushGTMEvent(eventType, {
        slug,
        projectId: effectiveProjectId,
        ...enrichedMetadata,
      });
    },
    [logEventMutation, actorProfileId, projectId, clipId, slug]
  );

  /**
   * Check if we have an actorProfileId set for tracking.
   * Useful for components that need to wait for profile data before tracking.
   */
  const isTrackingReady = Boolean(actorProfileId);

  // =========================================================================
  // Granular tracking functions
  // =========================================================================

  /**
   * Track CTA button clicks with optional project context.
   * Requires actorProfileId to be set for analytics attribution.
   */
  const trackCtaClick = useCallback(
    (
      ctaType: "watch" | "get_updates" | "share",
      ctaLabel?: string,
      ctaUrl?: string,
      projectContext?: { projectId?: string; projectTitle?: string }
    ) => {
      console.log(`[Analytics] trackCtaClick called:`, { ctaType, actorProfileId, ctaLabel, ctaUrl });
      // Skip Convex logging if no actorProfileId (events won't show in dashboard)
      if (!actorProfileId) {
        console.log(`[Analytics] Skipping CTA ${ctaType} tracking - no actorProfileId`);
        // Still push to GTM for external analytics
        const eventType = ctaType === "watch"
          ? "watch_cta_clicked"
          : ctaType === "get_updates"
          ? "get_updates_clicked"
          : "share_button_clicked";
        pushGTMEvent(eventType, {
          slug,
          ctaLabel,
          ctaUrl,
          ctaPosition: "hero",
          ...projectContext,
        });
        return;
      }

      const eventType = ctaType === "watch"
        ? "watch_cta_clicked"
        : ctaType === "get_updates"
        ? "get_updates_clicked"
        : "share_button_clicked";

      trackEvent(eventType, {
        ctaLabel,
        ctaUrl,
        ctaPosition: "hero",
        projectId: projectContext?.projectId,
        projectTitle: projectContext?.projectTitle,
      });
    },
    [trackEvent, actorProfileId, slug]
  );

  /**
   * Track social link clicks.
   */
  const trackSocialClick = useCallback(
    (platform: string, url?: string) => {
      trackEvent("social_link_clicked", {
        socialPlatform: platform,
        socialAction: "click",
        outboundUrl: url,
      });
    },
    [trackEvent]
  );

  /**
   * Track tab navigation.
   */
  const trackTabChange = useCallback(
    (newTab: string, previousTab?: string) => {
      trackEvent("tab_changed", {
        tabName: newTab,
        previousTab,
      });
    },
    [trackEvent]
  );

  /**
   * Track video events with optional project context.
   * Requires actorProfileId to be set for analytics attribution.
   */
  const trackVideoEvent = useCallback(
    (
      action: "play" | "pause" | "mute_toggle" | "fullscreen" | "progress" | "completed",
      progress?: number,
      duration?: number,
      currentTime?: number,
      projectContext?: { projectId?: string; projectTitle?: string }
    ) => {
      console.log(`[Analytics] trackVideoEvent called:`, { action, actorProfileId });
      let eventType: EventType;

      switch (action) {
        case "play":
          eventType = "video_play";
          break;
        case "pause":
          eventType = "video_pause";
          break;
        case "mute_toggle":
          eventType = "video_mute_toggle";
          break;
        case "fullscreen":
          eventType = "video_fullscreen";
          break;
        case "completed":
          eventType = "video_completed";
          break;
        case "progress":
          if (progress && progress >= 75) {
            eventType = "video_progress_75";
          } else if (progress && progress >= 50) {
            eventType = "video_progress_50";
          } else if (progress && progress >= 25) {
            eventType = "video_progress_25";
          } else {
            return; // Don't track progress below 25%
          }
          break;
        default:
          return;
      }

      // Skip Convex logging if no actorProfileId (events won't show in dashboard)
      if (!actorProfileId) {
        console.debug(`[Analytics] Skipping video ${action} tracking - no actorProfileId`);
        // Still push to GTM for external analytics
        pushGTMEvent(eventType, {
          slug,
          videoProgress: progress,
          videoDuration: duration,
          videoCurrentTime: currentTime,
          ...projectContext,
        });
        return;
      }

      trackEvent(eventType, {
        videoProgress: progress,
        videoDuration: duration,
        videoCurrentTime: currentTime,
        projectId: projectContext?.projectId,
        projectTitle: projectContext?.projectTitle,
      });
    },
    [trackEvent, actorProfileId, slug]
  );

  /**
   * Track clip/asset views and plays.
   */
  const trackAssetEvent = useCallback(
    (
      action: "impression" | "engagement" | "viewed" | "played",
      assetType: "generated_clip" | "processing_clip" | "clip" | "meme" | "gif" | "trailer",
      assetId?: string,
      assetTitle?: string
    ) => {
      let eventType: EventType;

      if (action === "impression") {
        eventType = "asset_impression";
      } else if (action === "engagement") {
        eventType = "asset_engagement";
      } else if (assetType === "generated_clip") {
        eventType = action === "viewed" ? "generated_clip_viewed" : "generated_clip_played";
      } else if (assetType === "processing_clip") {
        eventType = action === "viewed" ? "processing_clip_viewed" : "processing_clip_played";
      } else {
        eventType = action === "viewed" ? "asset_impression" : "asset_engagement";
      }

      trackEvent(eventType, {
        assetId,
        assetType,
        assetTitle,
      });
    },
    [trackEvent]
  );

  /**
   * Track filmography/project selection.
   */
  const trackProjectSelect = useCallback(
    (selectedProjectId: string, projectTitle?: string) => {
      trackEvent("project_selected", {
        assetId: selectedProjectId,
        assetType: "project",
        assetTitle: projectTitle,
      });
    },
    [trackEvent]
  );

  /**
   * Track outbound link clicks.
   */
  const trackOutboundClick = useCallback(
    (url: string, label?: string) => {
      trackEvent("outbound_link_clicked", {
        outboundUrl: url,
        outboundLabel: label,
      });
    },
    [trackEvent]
  );

  /**
   * Track clip gallery interactions (reels, clips, etc.)
   */
  const trackClipEvent = useCallback(
    (
      action: "view" | "play" | "share" | "fullscreen_open" | "fullscreen_close" | "navigate_next" | "navigate_prev" | "contribution",
      clipId?: string,
      clipTitle?: string,
      clipType?: "clip" | "reel" | "generated_clip" | "processing_clip"
    ) => {
      let eventType: EventType;

      switch (action) {
        case "view":
          eventType = clipType === "generated_clip" ? "generated_clip_viewed" :
                      clipType === "processing_clip" ? "processing_clip_viewed" : "clip_thumbnail_viewed";
          break;
        case "play":
          eventType = clipType === "generated_clip" ? "generated_clip_played" :
                      clipType === "processing_clip" ? "processing_clip_played" : "clip_played";
          break;
        case "share":
          eventType = "clip_shared";
          break;
        case "fullscreen_open":
          eventType = "clip_fullscreen_opened";
          break;
        case "fullscreen_close":
          eventType = "clip_fullscreen_closed";
          break;
        case "navigate_next":
          eventType = "clip_navigated_next";
          break;
        case "navigate_prev":
          eventType = "clip_navigated_prev";
          break;
        case "contribution":
          eventType = "clip_contribution_clicked";
          break;
        default:
          return;
      }

      trackEvent(eventType, {
        assetId: clipId,
        assetType: clipType || "clip",
        assetTitle: clipTitle,
      });
    },
    [trackEvent]
  );

  /**
   * Track trailer interactions.
   */
  const trackTrailerEvent = useCallback(
    (
      action: "load" | "play" | "share",
      trailerId?: string,
      trailerTitle?: string,
      projectContext?: { projectId?: string; projectTitle?: string }
    ) => {
      const eventType = action === "load" ? "trailer_loaded" :
                        action === "play" ? "trailer_play" : "trailer_share";

      trackEvent(eventType, {
        assetId: trailerId,
        assetType: "trailer",
        assetTitle: trailerTitle,
        projectId: projectContext?.projectId,
        projectTitle: projectContext?.projectTitle,
      });
    },
    [trackEvent]
  );

  /**
   * Track film/project card interactions.
   * Requires actorProfileId to be set for analytics attribution.
   */
  const trackFilmEvent = useCallback(
    (
      action: "view" | "click" | "trailer_click" | "watch_cta",
      projectId: string,
      projectTitle?: string,
      ctaUrl?: string
    ) => {
      const eventType = action === "view" ? "film_card_viewed" :
                        action === "click" ? "film_card_clicked" :
                        action === "trailer_click" ? "film_trailer_clicked" : "film_watch_cta_clicked";

      // Skip Convex logging if no actorProfileId (events won't show in dashboard)
      if (!actorProfileId) {
        console.debug(`[Analytics] Skipping film ${action} tracking - no actorProfileId`);
        // Still push to GTM for external analytics
        pushGTMEvent(eventType, {
          slug,
          assetId: projectId,
          assetType: "project",
          assetTitle: projectTitle,
          ctaUrl,
          projectId,
          projectTitle,
        });
        return;
      }

      trackEvent(eventType, {
        assetId: projectId,
        assetType: "project",
        assetTitle: projectTitle,
        ctaUrl,
        projectId,
        projectTitle,
      });
    },
    [trackEvent, actorProfileId, slug]
  );

  /**
   * Track booking/contact form interactions.
   */
  const trackBookingEvent = useCallback(
    (
      action: "form_started" | "form_submitted" | "email_started" | "email_completed",
      formType?: string
    ) => {
      const eventType = action === "form_started" ? "booking_form_started" :
                        action === "form_submitted" ? "booking_form_submitted" :
                        action === "email_started" ? "email_signup_started" : "email_signup_completed";

      trackEvent(eventType, {
        ctaLabel: formType,
      });
    },
    [trackEvent]
  );

  /**
   * Track hero section interactions.
   */
  const trackHeroEvent = useCallback(
    (
      action: "autoplay" | "interaction" | "cta_click",
      ctaLabel?: string,
      ctaUrl?: string,
      projectContext?: { projectId?: string; projectTitle?: string }
    ) => {
      const eventType = action === "autoplay" ? "hero_video_autoplay" :
                        action === "interaction" ? "hero_video_interaction" : "hero_cta_clicked";

      trackEvent(eventType, {
        ctaLabel,
        ctaUrl,
        ctaPosition: "hero",
        projectId: projectContext?.projectId,
        projectTitle: projectContext?.projectTitle,
      });
    },
    [trackEvent]
  );

  // =========================================================================
  // User Journey Tracking Functions
  // =========================================================================

  /**
   * Track landing page interactions.
   */
  const trackLandingEvent = useCallback(
    (
      action: "page_view" | "hero_view" | "features_view" | "pricing_view" | "case_study_view" | "cta_clicked" | "nav_clicked" | "signup_form_view" | "signup_form_started",
      ctaLabel?: string,
      sectionId?: string
    ) => {
      const eventTypeMap: Record<string, EventType> = {
        page_view: "landing_page_view",
        hero_view: "landing_hero_view",
        features_view: "landing_features_view",
        pricing_view: "landing_pricing_view",
        case_study_view: "landing_case_study_view",
        cta_clicked: "landing_cta_clicked",
        nav_clicked: "landing_nav_clicked",
        signup_form_view: "landing_signup_form_view",
        signup_form_started: "landing_signup_form_started",
      };

      trackEvent(eventTypeMap[action], {
        ctaLabel,
        ctaPosition: sectionId,
      });
    },
    [trackEvent]
  );

  /**
   * Track authentication events (signup, signin, password reset).
   */
  const trackAuthEvent = useCallback(
    (
      action: "signup_page_view" | "signup_form_started" | "signup_form_submitted" | "signup_google_clicked" | "signup_email_sent" | "signup_completed" |
              "signin_page_view" | "signin_form_started" | "signin_form_submitted" | "signin_google_clicked" | "signin_completed" | "signin_failed" |
              "password_reset_requested" | "password_reset_completed" | "email_verified",
      method?: "email" | "google",
      errorMessage?: string
    ) => {
      trackEvent(action as EventType, {
        ctaLabel: method,
        outboundLabel: errorMessage,
      });
    },
    [trackEvent]
  );

  /**
   * Track onboarding funnel progress.
   */
  const trackOnboardingEvent = useCallback(
    (
      action: "started" | "step_view" | "step_completed" | "step_skipped" | "abandoned" | "completed" | "field_focused" | "file_uploaded",
      stepNumber?: number,
      stepName?: string,
      fieldName?: string
    ) => {
      const eventTypeMap: Record<string, EventType> = {
        started: "onboarding_started",
        step_view: "onboarding_step_view",
        step_completed: "onboarding_step_completed",
        step_skipped: "onboarding_step_skipped",
        abandoned: "onboarding_abandoned",
        completed: "onboarding_completed",
        field_focused: "onboarding_form_field_focused",
        file_uploaded: "onboarding_file_uploaded",
      };

      trackEvent(eventTypeMap[action], {
        tabName: stepName,
        assetId: stepNumber?.toString(),
        ctaLabel: fieldName,
      });
    },
    [trackEvent]
  );

  /**
   * Track dashboard interactions.
   */
  const trackDashboardEvent = useCallback(
    (
      action: "page_view" | "module_clicked" | "module_view" | "quick_link_clicked" | "edit_clicked" | "public_page_clicked" | "logout_clicked" |
              "asset_generated" | "asset_downloaded" | "campaign_created" | "boost_started" | "settings_saved",
      moduleName?: string,
      assetType?: string,
      assetId?: string
    ) => {
      const eventTypeMap: Record<string, EventType> = {
        page_view: "dashboard_page_view",
        module_clicked: "dashboard_module_clicked",
        module_view: "dashboard_module_view",
        quick_link_clicked: "dashboard_quick_link_clicked",
        edit_clicked: "dashboard_edit_clicked",
        public_page_clicked: "dashboard_public_page_clicked",
        logout_clicked: "dashboard_logout_clicked",
        asset_generated: "dashboard_asset_generated",
        asset_downloaded: "dashboard_asset_downloaded",
        campaign_created: "dashboard_campaign_created",
        boost_started: "dashboard_boost_started",
        settings_saved: "dashboard_settings_saved",
      };

      trackEvent(eventTypeMap[action], {
        tabName: moduleName,
        assetType,
        assetId,
      });
    },
    [trackEvent]
  );

  // =========================================================================
  // Automatic scroll tracking
  // =========================================================================
  useEffect(() => {
    if (!enableScrollTracking || typeof window === "undefined") return;

    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = Math.round((scrollTop / docHeight) * 100);

      const milestones = [25, 50, 75, 100];
      for (const milestone of milestones) {
        if (scrollPercent >= milestone && !scrollMilestones.current.has(milestone)) {
          scrollMilestones.current.add(milestone);
          trackEvent(`scroll_depth_${milestone}` as EventType, {
            scrollDepth: milestone,
          });
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [enableScrollTracking, trackEvent]);

  // =========================================================================
  // Automatic time on page tracking
  // =========================================================================
  useEffect(() => {
    if (!enableTimeTracking || typeof window === "undefined") return;

    const milestones = [
      { seconds: 30, event: "time_on_page_30s" as EventType },
      { seconds: 60, event: "time_on_page_60s" as EventType },
      { seconds: 180, event: "time_on_page_180s" as EventType },
    ];

    const intervals = milestones.map(({ seconds, event }) => {
      return setTimeout(() => {
        if (!timeMilestones.current.has(seconds)) {
          timeMilestones.current.add(seconds);
          trackEvent(event, {
            timeOnPage: seconds,
          });
        }
      }, seconds * 1000);
    });

    return () => intervals.forEach(clearTimeout);
  }, [enableTimeTracking, trackEvent]);

  // =========================================================================
  // Reset tracking on unmount
  // =========================================================================
  useEffect(() => {
    return () => {
      scrollMilestones.current.clear();
      timeMilestones.current.clear();
    };
  }, []);

  return {
    trackEvent,
    trackCtaClick,
    trackSocialClick,
    trackTabChange,
    trackVideoEvent,
    trackAssetEvent,
    trackProjectSelect,
    trackOutboundClick,
    trackClipEvent,
    trackTrailerEvent,
    trackFilmEvent,
    trackBookingEvent,
    trackHeroEvent,
    // User journey tracking
    trackLandingEvent,
    trackAuthEvent,
    trackOnboardingEvent,
    trackDashboardEvent,
    sessionId: sessionId.current,
    // Flag to check if tracking is ready (actorProfileId is set)
    isTrackingReady,
  };
}

export default useEventTracking;
