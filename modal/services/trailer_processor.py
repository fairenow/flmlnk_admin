"""
Trailer Processor - Feature Film to Trailer Pipeline

This module handles the full trailer generation pipeline:
1. Proxy generation (720p for faster analysis)
2. Audio extraction + transcription
3. Scene detection
4. AI timestamp synthesis (GPT-4o) with text cards
5. Audio planning and music generation (ElevenLabs)
6. Trailer rendering (ffmpeg) with text card overlays
7. Audio mixing (dialogue + music)
8. Output upload to R2
"""

import os
import hashlib
import subprocess
import json
import tempfile
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field
from pathlib import Path

# Gemini fallback configuration
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

# Local imports
from services.storage import R2Storage
from services.transcription import TranscriptionService
from services.music_generator import (
    ElevenLabsMusicGenerator,
    analyze_for_music_points,
    determine_music_mood,
)
from services.audio_mixer import (
    TrailerAudioMixer,
    get_target_lufs_for_profile,
    get_mixing_levels_for_profile,
)
from services.sfx_generator import (
    ElevenLabsSFXGenerator,
    plan_sfx_placements,
    get_sfx_generation_requests,
)
from services.video_effects import (
    VideoEffects,
    get_polish_options_for_profile,
    should_apply_polish,
)
from services.editing_intelligence import (
    SceneImportanceScorer,
    DialogueSelectionAI,
    BeatSyncEditor,
    create_editing_intelligence,
)
from services.transitions import (
    TransitionRenderer,
    TransitionType,
    ClipTransition,
)
from services.speed_effects import (
    SpeedRamper,
    SlowMotionMoment,
    SpeedRamp,
    EasingType,
)
from services.flash_frames import (
    FlashFrameRenderer,
    FlashConfig,
    FlashColor,
)
from services.overlays import (
    OverlayRenderer,
    LogoConfig,
    AgeRatingConfig,
    SocialHandleConfig,
    EndCardConfig,
    CreditsConfig,
    AgeRating,
)
from services.workflow import (
    WorkflowManager,
    PreviewQuality,
    ExportQuality,
    ExportFormat,
    ClipAdjustment,
    TextCardAdjustment,
)
from services.ai_selection import (
    AISelectionEnhancer,
    AudienceType,
    Genre,
)


@dataclass
class TrailerProcessorResult:
    """Result of trailer processing."""
    success: bool
    job_id: str
    clips: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None
    error_stage: Optional[str] = None
    video_duration: Optional[float] = None


@dataclass
class SceneInfo:
    """Information about a detected scene."""
    scene_index: int
    start_time: float
    end_time: float
    duration: float
    keyframe_timestamps: List[float]
    avg_motion_intensity: Optional[float] = None
    avg_audio_intensity: Optional[float] = None
    has_faces: Optional[bool] = None
    has_dialogue: Optional[bool] = None
    dominant_colors: Optional[List[str]] = None
    summary: Optional[str] = None
    mood: Optional[str] = None
    importance: Optional[int] = None


class TrailerConvexClient:
    """
    Convex client for trailer job operations.

    Uses the Convex HTTP API to call trailer-specific actions.
    """

    def __init__(self):
        import httpx
        self.convex_url = os.environ.get("CONVEX_URL")
        self.webhook_secret = os.environ.get("MODAL_WEBHOOK_SECRET")

        if not self.convex_url:
            raise RuntimeError("CONVEX_URL not configured")

        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self):
        import httpx
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=60.0)
        return self._client

    async def _call_action(self, path: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Call a Convex action via HTTP API."""
        client = await self._get_client()
        url = f"{self.convex_url}/api/action"

        if self.webhook_secret:
            args["webhookSecret"] = self.webhook_secret

        body = {"path": path, "args": args}

        response = await client.post(
            url,
            json=body,
            headers={"Content-Type": "application/json"},
        )

        if response.status_code != 200:
            raise RuntimeError(f"Convex action failed: {response.status_code} - {response.text}")

        result = response.json()
        if result.get("status") == "error":
            return {"success": False, "reason": result.get("errorMessage", "Unknown error")}

        return result.get("value", result)

    async def claim_trailer_job(self, job_id: str, worker_id: str) -> Dict[str, Any]:
        """Claim a trailer job for processing."""
        return await self._call_action(
            "trailerJobs:httpClaimJob",
            {"jobId": job_id, "workerId": worker_id},
        )

    async def update_status(
        self,
        job_id: str,
        status: str,
        progress: Optional[int] = None,
        current_step: Optional[str] = None,
    ) -> None:
        """Update job status and progress."""
        args: Dict[str, Any] = {"jobId": job_id, "status": status}
        if progress is not None:
            args["progress"] = progress
        if current_step is not None:
            args["currentStep"] = current_step

        await self._call_action("trailerJobs:httpUpdateStatus", args)

    async def set_proxy_key(
        self, job_id: str, proxy_r2_key: str, proxy_spec_hash: str
    ) -> None:
        """Set proxy R2 key after generation."""
        await self._call_action(
            "trailerJobs:httpSetProxyKey",
            {"jobId": job_id, "proxyR2Key": proxy_r2_key, "proxySpecHash": proxy_spec_hash},
        )

    async def set_transcription_id(self, job_id: str, transcription_id: str) -> None:
        """Set transcription ID."""
        await self._call_action(
            "trailerJobs:httpSetTranscriptionId",
            {"jobId": job_id, "transcriptionId": transcription_id},
        )

    async def create_scene_map(
        self,
        job_id: str,
        scenes: List[Dict[str, Any]],
        total_scenes: int,
        avg_scene_duration: float,
        peak_intensity_timestamps: Optional[List[float]] = None,
    ) -> str:
        """Create scene map and link to job."""
        result = await self._call_action(
            "trailerJobs:httpCreateSceneMap",
            {
                "jobId": job_id,
                "scenes": scenes,
                "totalScenes": total_scenes,
                "avgSceneDuration": avg_scene_duration,
                "peakIntensityTimestamps": peak_intensity_timestamps,
            },
        )
        return result.get("sceneMapId", "")

    async def create_timestamp_plan(
        self,
        job_id: str,
        profile_id: str,
        clips: List[Dict[str, Any]],
        source: str,
        target_duration_sec: float,
        actual_duration_sec: Optional[float] = None,
        ai_reasoning: Optional[str] = None,
    ) -> str:
        """Create timestamp plan and link to job."""
        args: Dict[str, Any] = {
            "jobId": job_id,
            "profileId": profile_id,
            "clips": clips,
            "source": source,
            "targetDurationSec": target_duration_sec,
        }
        if actual_duration_sec is not None:
            args["actualDurationSec"] = actual_duration_sec
        if ai_reasoning is not None:
            args["aiReasoning"] = ai_reasoning

        result = await self._call_action("trailerJobs:httpCreateTimestampPlan", args)
        # Log if error occurred
        if result.get("success") is False:
            print(f"[{job_id}] Convex error in create_timestamp_plan: {result.get('reason', 'Unknown')}")
        return result.get("planId", "")

    async def create_text_card_plan(
        self,
        job_id: str,
        profile_id: str,
        cards: List[Dict[str, Any]],
        ai_reasoning: Optional[str] = None,
    ) -> str:
        """Create text card plan and link to job."""
        args: Dict[str, Any] = {
            "jobId": job_id,
            "profileId": profile_id,
            "cards": cards,
        }
        if ai_reasoning is not None:
            args["aiReasoning"] = ai_reasoning

        result = await self._call_action("trailerJobs:httpCreateTextCardPlan", args)
        # Log if error occurred
        if result.get("success") is False:
            print(f"[{job_id}] Convex error in create_text_card_plan: {result.get('reason', 'Unknown')}")
        return result.get("planId", "")

    async def create_audio_plan(
        self,
        job_id: str,
        profile_id: str,
        trailer_duration_sec: float,
        rise_points: List[float],
        impact_points: List[float],
        dialogue_windows: List[Dict[str, Any]],
        music_prompt: str,
        music_style: str,
        target_lufs: float,
        dialogue_level_db: float,
        music_level_db: float,
        music_bpm: Optional[int] = None,
    ) -> str:
        """Create audio plan for music generation and mixing."""
        args: Dict[str, Any] = {
            "jobId": job_id,
            "profileId": profile_id,
            "trailerDurationSec": trailer_duration_sec,
            "risePoints": rise_points,
            "impactPoints": impact_points,
            "dialogueWindows": dialogue_windows,
            "musicPrompt": music_prompt,
            "musicStyle": music_style,
            "targetLufs": target_lufs,
            "dialogueLevelDb": dialogue_level_db,
            "musicLevelDb": music_level_db,
        }
        if music_bpm is not None:
            args["musicBpm"] = music_bpm

        result = await self._call_action("trailerJobs:httpCreateAudioPlan", args)
        if result.get("success") is False:
            print(f"[{job_id}] Convex error in create_audio_plan: {result.get('reason', 'Unknown')}")
        return result.get("planId", "")

    async def update_audio_plan_music(
        self,
        plan_id: str,
        music_r2_key: str,
        music_duration_sec: float,
    ) -> bool:
        """Update audio plan with generated music info."""
        args: Dict[str, Any] = {
            "planId": plan_id,
            "musicR2Key": music_r2_key,
            "musicDurationSec": music_duration_sec,
        }

        result = await self._call_action("trailerJobs:httpUpdateAudioPlanMusic", args)
        return result.get("success", False)

    async def update_audio_plan_sfx(
        self,
        plan_id: str,
        sfx_placements: List[Dict[str, Any]],
        sfx_level_db: float = -6,
    ) -> bool:
        """Update audio plan with SFX placement data.

        Args:
            plan_id: The audio plan ID
            sfx_placements: List of SFX placement objects with type, atSec, r2Key
            sfx_level_db: SFX level in dB (-6 to 0 typical)

        Returns:
            True if successful
        """
        args: Dict[str, Any] = {
            "planId": plan_id,
            "sfxPlacements": sfx_placements,
            "sfxLevelDb": sfx_level_db,
        }

        result = await self._call_action("trailerJobs:httpUpdateAudioPlanSfx", args)
        return result.get("success", False)

    async def create_effects_plan(
        self,
        job_id: str,
        profile_id: str,
        effects_plan: Dict[str, Any],
    ) -> str:
        """Create Phase 6 effects plan (transitions, speed effects, flash frames).

        Args:
            job_id: The trailer job ID
            profile_id: The trailer profile ID
            effects_plan: Dict containing transitions, speedEffects, flashFrames

        Returns:
            The created plan ID
        """
        args: Dict[str, Any] = {
            "jobId": job_id,
            "profileId": profile_id,
            "transitions": effects_plan.get("transitions", []),
            "speedEffects": effects_plan.get("speedEffects", []),
            "flashFrames": effects_plan.get("flashFrames", []),
            "totalTransitions": effects_plan.get("totalTransitions", 0),
            "totalSpeedEffects": effects_plan.get("totalSpeedEffects", 0),
            "totalFlashFrames": effects_plan.get("totalFlashFrames", 0),
        }

        result = await self._call_action("trailerJobs:httpCreateEffectsPlan", args)
        if result.get("success") is False:
            print(f"[{job_id}] Convex error in create_effects_plan: {result.get('reason', 'Unknown')}")
        return result.get("planId", "")

    async def create_overlay_plan(
        self,
        job_id: str,
        profile_id: str,
        overlay_plan: Dict[str, Any],
    ) -> str:
        """Create Phase 7 overlay plan (logos, ratings, socials, end cards).

        Args:
            job_id: The trailer job ID
            profile_id: The trailer profile ID
            overlay_plan: Dict containing logos, rating, socials, credits, endCard

        Returns:
            The created plan ID
        """
        args: Dict[str, Any] = {
            "jobId": job_id,
            "profileId": profile_id,
            "logos": overlay_plan.get("logos", []),
            "rating": overlay_plan.get("rating"),
            "socials": overlay_plan.get("socials", []),
            "credits": overlay_plan.get("credits", []),
            "endCard": overlay_plan.get("end_card"),
            "totalLogos": len(overlay_plan.get("logos", [])),
            "totalSocials": len(overlay_plan.get("socials", [])),
            "totalCredits": len(overlay_plan.get("credits", [])),
            "hasEndCard": overlay_plan.get("end_card") is not None,
            "hasRating": overlay_plan.get("rating") is not None,
        }

        result = await self._call_action("trailerJobs:httpCreateOverlayPlan", args)
        if result.get("success") is False:
            print(f"[{job_id}] Convex error in create_overlay_plan: {result.get('reason', 'Unknown')}")
        return result.get("planId", "")

    async def create_workflow_plan(
        self,
        job_id: str,
        profile_id: str,
        workflow_plan: Dict[str, Any],
    ) -> str:
        """Create Phase 8 workflow plan for preview/export management.

        Args:
            job_id: The trailer job ID
            profile_id: The trailer profile ID
            workflow_plan: Dict containing clips, textCards, exports, etc.

        Returns:
            The created plan ID
        """
        args: Dict[str, Any] = {
            "jobId": job_id,
            "profileId": profile_id,
            "clips": workflow_plan.get("clips", []),
            "textCards": workflow_plan.get("textCards", []),
            "calculatedDuration": workflow_plan.get("calculatedDuration", 0),
            "targetDuration": workflow_plan.get("targetDuration", 120),
            "effectsPlanId": workflow_plan.get("effectsPlanId"),
            "overlayPlanId": workflow_plan.get("overlayPlanId"),
            "audioPlanId": workflow_plan.get("audioPlanId"),
            "recommendedExports": workflow_plan.get("recommendedExports", []),
            "revision": workflow_plan.get("revision", 1),
        }

        result = await self._call_action("trailerJobs:httpCreateWorkflowPlan", args)
        if result.get("success") is False:
            print(f"[{job_id}] Convex error in create_workflow_plan: {result.get('reason', 'Unknown')}")
        return result.get("planId", "")

    async def update_workflow_preview(
        self,
        plan_id: str,
        preview_quality: str,
        preview_r2_key: str,
    ) -> bool:
        """Update workflow plan with generated preview info.

        Args:
            plan_id: The workflow plan ID
            preview_quality: Quality level used ("draft", "standard", "high")
            preview_r2_key: R2 path to preview video

        Returns:
            True if successful
        """
        args: Dict[str, Any] = {
            "planId": plan_id,
            "previewQuality": preview_quality,
            "previewR2Key": preview_r2_key,
        }

        result = await self._call_action("trailerJobs:httpUpdateWorkflowPreview", args)
        return result.get("success", False)

    async def add_workflow_export(
        self,
        plan_id: str,
        export_data: Dict[str, Any],
    ) -> bool:
        """Add an export to the workflow plan.

        Args:
            plan_id: The workflow plan ID
            export_data: Export metadata (quality, format, r2Key, etc.)

        Returns:
            True if successful
        """
        args: Dict[str, Any] = {
            "planId": plan_id,
            "export": export_data,
        }

        result = await self._call_action("trailerJobs:httpAddWorkflowExport", args)
        return result.get("success", False)

    async def create_ai_selection_plan(
        self,
        job_id: str,
        profile_id: str,
        selection_plan: Dict[str, Any],
    ) -> str:
        """Create Phase 9 AI selection plan.

        Args:
            job_id: The trailer job ID
            profile_id: The trailer profile ID
            selection_plan: Dict containing AI selection analysis results

        Returns:
            The created plan ID
        """
        args: Dict[str, Any] = {
            "jobId": job_id,
            "profileId": profile_id,
            "detectedGenre": selection_plan.get("detectedGenre", "drama"),
            "genreConfidence": selection_plan.get("genreConfidence", 0),
            "genreConventions": selection_plan.get("genreConventions", {}),
            "audienceType": selection_plan.get("audienceType", "general"),
            "audienceAnalysis": selection_plan.get("audienceAnalysis", {}),
            "emotionalArc": selection_plan.get("emotionalArc", {}),
            "arcValidation": selection_plan.get("arcValidation", {}),
            "pacingAnalysis": selection_plan.get("pacingAnalysis", {}),
            "recommendedEffects": selection_plan.get("recommendedEffects", {}),
            "enhancementSummary": selection_plan.get("enhancementSummary", {}),
        }

        result = await self._call_action("trailerJobs:httpCreateAISelectionPlan", args)
        if result.get("success") is False:
            print(f"[{job_id}] Convex error in create_ai_selection_plan: {result.get('reason', 'Unknown')}")
        return result.get("planId", "")

    async def create_ab_variant(
        self,
        job_id: str,
        selection_plan_id: str,
        variant: Dict[str, Any],
    ) -> str:
        """Create an A/B test variant record.

        Args:
            job_id: The trailer job ID
            selection_plan_id: The AI selection plan ID
            variant: Variant configuration dict

        Returns:
            The created variant ID
        """
        args: Dict[str, Any] = {
            "jobId": job_id,
            "selectionPlanId": selection_plan_id,
            "variantId": variant.get("variant_id", "control"),
            "variantName": variant.get("variant_name", "Control"),
            "isControl": variant.get("is_control", True),
            "emphasis": variant.get("emphasis", "balanced"),
            "pacingModifier": variant.get("pacing_modifier", 1.0),
            "textCardVariant": variant.get("text_card_variant", "original"),
            "musicStyle": variant.get("music_style", "original"),
            "status": "pending",
        }

        result = await self._call_action("trailerJobs:httpCreateABVariant", args)
        return result.get("variantId", "")

    async def create_trailer_clip(
        self,
        job_id: str,
        timestamp_plan_id: str,
        user_id: str,
        profile_key: str,
        variant_key: str,
        duration: float,
        width: int,
        height: int,
        r2_key: str,
        title: Optional[str] = None,
        file_size: Optional[int] = None,
        r2_thumb_key: Optional[str] = None,
    ) -> str:
        """Create trailer clip record."""
        args: Dict[str, Any] = {
            "jobId": job_id,
            "timestampPlanId": timestamp_plan_id,
            "userId": user_id,
            "profileKey": profile_key,
            "variantKey": variant_key,
            "duration": duration,
            "width": width,
            "height": height,
            "r2Key": r2_key,
        }
        if title is not None:
            args["title"] = title
        if file_size is not None:
            args["fileSize"] = file_size
        if r2_thumb_key is not None:
            args["r2ThumbKey"] = r2_thumb_key

        result = await self._call_action("trailerJobs:httpCreateTrailerClip", args)
        return result.get("clipId", "")

    async def complete_job(self, job_id: str) -> None:
        """Mark job as complete."""
        await self._call_action("trailerJobs:httpCompleteJob", {"jobId": job_id})

    async def fail_job(self, job_id: str, error: str, error_stage: str) -> None:
        """Mark job as failed."""
        await self._call_action(
            "trailerJobs:httpFailJob",
            {"jobId": job_id, "error": error, "errorStage": error_stage},
        )

    async def get_job_details(self, job_id: str) -> Dict[str, Any]:
        """Get job details including video job info."""
        return await self._call_action(
            "trailerJobs:httpGetJobDetails",
            {"jobId": job_id},
        )

    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


class TrailerProcessor:
    """
    Processes feature films into trailer cuts.

    This processor handles the full pipeline from source video
    to rendered trailer outputs.
    """

    # Proxy generation spec (for cache hash)
    PROXY_SPEC = {
        "resolution": "1280x720",
        "bitrate": "2M",
        "codec": "libx264",
        "preset": "fast",
    }

    def __init__(self, job_id: str, temp_dir: str):
        self.job_id = job_id
        self.temp_dir = temp_dir
        self.worker_id = f"trailer-worker-{os.getpid()}"

        # Initialize services
        self.convex = TrailerConvexClient()
        self.r2 = R2Storage()
        self.transcription = TranscriptionService()
        self.music_generator = ElevenLabsMusicGenerator()
        self.sfx_generator = ElevenLabsSFXGenerator()
        self.audio_mixer = TrailerAudioMixer(job_id=job_id)
        self.video_effects = VideoEffects(job_id=job_id)

        # Phase 5: Advanced editing intelligence
        self.scene_scorer = SceneImportanceScorer(job_id=job_id)
        self.dialogue_ai = DialogueSelectionAI(job_id=job_id)
        self.beat_sync = BeatSyncEditor(job_id=job_id)

        # Phase 6: Transitions & Speed Effects
        self.transition_renderer = TransitionRenderer()
        self.speed_ramper = SpeedRamper()
        self.flash_renderer = FlashFrameRenderer()

        # Phase 7: Professional Overlays & Branding
        self.overlay_renderer = OverlayRenderer()

        # Phase 8: Professional Workflow Features
        self.workflow_manager = WorkflowManager(job_id=job_id, temp_dir=temp_dir)

        # Phase 9: AI-Powered Selection Enhancements
        self.ai_selection_enhancer = AISelectionEnhancer(job_id=job_id)

        # Paths (set during processing)
        self.source_path: Optional[str] = None
        self.proxy_path: Optional[str] = None
        self.audio_path: Optional[str] = None
        self.music_path: Optional[str] = None
        self.sfx_files: Dict[str, str] = {}  # sfx_type -> local file path

        # Phase 5: Analysis results
        self.beat_analysis: Optional[Dict[str, Any]] = None
        self.scored_scenes: Optional[List[Dict[str, Any]]] = None
        self.selected_dialogue: Optional[List[Dict[str, Any]]] = None

        # Phase 6: Effects plan
        self.effects_plan: Optional[Dict[str, Any]] = None

        # Phase 7: Overlay plan
        self.overlay_plan: Optional[Dict[str, Any]] = None

        # Phase 8: Workflow plan
        self.workflow_plan: Optional[Dict[str, Any]] = None

        # Phase 9: AI selection plan
        self.ai_selection_plan: Optional[Dict[str, Any]] = None

        # Job data (set after claiming)
        self.job_data: Optional[Dict[str, Any]] = None
        self.video_job_data: Optional[Dict[str, Any]] = None

    def cleanup(self):
        """Clean up temporary files."""
        import shutil
        for path in [self.source_path, self.proxy_path, self.audio_path, self.music_path]:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

        # Clean SFX files
        for sfx_path in self.sfx_files.values():
            if sfx_path and os.path.exists(sfx_path):
                try:
                    os.remove(sfx_path)
                except Exception:
                    pass

        # Clean temp directory
        job_temp = os.path.join(self.temp_dir, self.job_id)
        if os.path.exists(job_temp):
            try:
                shutil.rmtree(job_temp)
            except Exception:
                pass

    @staticmethod
    def compute_proxy_spec_hash() -> str:
        """Compute hash of proxy spec for cache validation."""
        spec_str = json.dumps(TrailerProcessor.PROXY_SPEC, sort_keys=True)
        return hashlib.sha256(spec_str.encode()).hexdigest()[:16]

    async def process(self) -> TrailerProcessorResult:
        """
        Run the full trailer processing pipeline.

        Returns:
            TrailerProcessorResult with success/failure and clip data
        """
        try:
            # Step 1: Claim job
            print(f"[{self.job_id}] Claiming job...")
            claim_result = await self.convex.claim_trailer_job(self.job_id, self.worker_id)

            if not claim_result.get("claimed"):
                return TrailerProcessorResult(
                    success=False,
                    job_id=self.job_id,
                    error=claim_result.get("reason", "Failed to claim job"),
                    error_stage="claim",
                )

            # Get job details
            self.job_data = await self.convex.get_job_details(self.job_id)
            self.video_job_data = self.job_data.get("videoJob", {})

            # Debug: log what we received from Convex
            print(f"[{self.job_id}] job_data keys: {list(self.job_data.keys())}")
            print(f"[{self.job_id}] selectedProfileId: {self.job_data.get('selectedProfileId', 'NOT SET')}")
            print(f"[{self.job_id}] userId: {self.job_data.get('userId', 'NOT SET')}")
            profile_doc = self.job_data.get("profile")
            if profile_doc:
                print(f"[{self.job_id}] profile._id: {profile_doc.get('_id', 'NOT SET')}, key: {profile_doc.get('key', 'NOT SET')}")
            else:
                print(f"[{self.job_id}] WARNING: No profile document in job_data!")

            r2_source_key = self.video_job_data.get("r2SourceKey")
            if not r2_source_key:
                raise ValueError("No R2 source key found for video job")

            # Step 2: Download source / generate proxy
            print(f"[{self.job_id}] Preparing video...")
            await self._prepare_video(r2_source_key)

            # Step 3: Transcribe
            print(f"[{self.job_id}] Transcribing...")
            await self.convex.update_status(
                self.job_id, "TRANSCRIBING", progress=20, current_step="Transcribing audio..."
            )
            transcript = await self._transcribe()

            # Step 4: Scene detection
            print(f"[{self.job_id}] Detecting scenes...")
            await self.convex.update_status(
                self.job_id, "SCENE_DETECTING", progress=40, current_step="Detecting scenes..."
            )
            scenes = await self._detect_scenes()

            # Step 5: Phase 5 - Score scenes with AI
            print(f"[{self.job_id}] Scoring scenes with AI...")
            await self.convex.update_status(
                self.job_id, "SCENE_SCORING", progress=45, current_step="Analyzing scene importance..."
            )
            transcript_segments = transcript.get("segments", [])
            self.scored_scenes = await self.scene_scorer.score_all_scenes(
                scenes=[self._scene_to_dict(s) for s in scenes],
                transcript_segments=transcript_segments,
            )

            # Step 5b: Phase 5 - Select trailer-worthy dialogue
            print(f"[{self.job_id}] Selecting trailer-worthy dialogue...")
            await self.convex.update_status(
                self.job_id, "DIALOGUE_SELECTING", progress=50, current_step="Selecting dialogue..."
            )
            profile = self.job_data.get("profile", {})
            target_duration = profile.get("durationTargetSec", 120)
            self.selected_dialogue = await self.dialogue_ai.select_trailer_lines(
                transcript_segments=transcript_segments,
                max_lines=8 if target_duration >= 60 else 4,
                trailer_duration_sec=target_duration,
            )

            # Step 5c: Create scene map with importance scores
            print(f"[{self.job_id}] Creating scene map...")
            avg_duration = sum(s.duration for s in scenes) / len(scenes) if scenes else 0
            await self.convex.create_scene_map(
                job_id=self.job_id,
                scenes=self.scored_scenes,  # Use scored scenes with importanceScores
                total_scenes=len(scenes),
                avg_scene_duration=avg_duration,
            )

            # At this point, job is ANALYSIS_READY
            # The job can be paused here for user review, or continue to planning

            # Step 6: Generate timestamp plan
            print(f"[{self.job_id}] Generating timestamp plan...")
            await self.convex.update_status(
                self.job_id, "PLANNING", progress=60, current_step="AI generating edit plan..."
            )

            profile = self.job_data.get("profile", {})
            plan = await self._generate_timestamp_plan(
                transcript, scenes, profile,
                scored_scenes=self.scored_scenes,
                selected_dialogue=self.selected_dialogue,
            )

            # Step 6b: Phase 9 - AI Selection Enhancement (optional)
            enable_ai_enhancement = self.job_data.get("enableAIEnhancement", True)
            if enable_ai_enhancement:
                print(f"[{self.job_id}] Enhancing selection with AI...")
                await self.convex.update_status(
                    self.job_id, "AI_ENHANCING", progress=61,
                    current_step="AI enhancing clip selection..."
                )
                plan, text_cards = await self._enhance_selection_with_ai(
                    scenes, transcript, plan, profile
                )

            # Step 7: Audio planning (optional - if ElevenLabs API key is configured)
            audio_plan = None
            sfx_placements = []
            if os.environ.get("ELEVENLABS_API_KEY"):
                print(f"[{self.job_id}] Planning audio...")
                await self.convex.update_status(
                    self.job_id, "AUDIO_PLANNING", progress=62, current_step="Planning audio..."
                )
                audio_plan = await self._generate_audio_plan(plan, profile, transcript)

                # Step 8: Generate music
                if audio_plan:
                    print(f"[{self.job_id}] Generating music...")
                    await self.convex.update_status(
                        self.job_id, "MUSIC_GENERATING", progress=65, current_step="Generating music..."
                    )
                    await self._generate_music(audio_plan)

                    # Step 8b: Phase 5 - Analyze music for beat sync
                    print(f"[{self.job_id}] Analyzing music beats for sync...")
                    await self.convex.update_status(
                        self.job_id, "BEAT_ANALYZING", progress=67, current_step="Analyzing music beats..."
                    )
                    self.beat_analysis = await self._analyze_music_beats()

                    # Step 8c: Phase 5 - Align cuts to music beats
                    if self.beat_analysis:
                        print(f"[{self.job_id}] Aligning cuts to music beats...")
                        aligned_clips = await self.beat_sync.align_cuts_to_beats(
                            clips=plan.get("clips", []),
                            beat_analysis=self.beat_analysis,
                            alignment_mode="downbeat",  # Align to downbeats for natural feel
                        )
                        plan["clips"] = aligned_clips
                        print(f"[{self.job_id}] Beat-aligned {sum(1 for c in aligned_clips if c.get('beat_aligned'))} clips")

                    # Step 8d: Generate SFX (impacts, risers, whooshes)
                    print(f"[{self.job_id}] Generating SFX...")
                    await self.convex.update_status(
                        self.job_id, "SFX_GENERATING", progress=68, current_step="Generating sound effects..."
                    )
                    sfx_placements = await self._generate_sfx(audio_plan, plan)
            else:
                print(f"[{self.job_id}] Skipping audio generation (no ELEVENLABS_API_KEY)")

            # Step 8e: Phase 6 - Generate effects plan (transitions, speed effects, flash frames)
            print(f"[{self.job_id}] Generating effects plan...")
            await self.convex.update_status(
                self.job_id, "EFFECTS_PLANNING", progress=69, current_step="Planning transitions & effects..."
            )
            self.effects_plan = await self._generate_effects_plan(plan, profile)

            # Step 9: Render trailer
            print(f"[{self.job_id}] Rendering trailer...")
            await self.convex.update_status(
                self.job_id, "RENDERING", progress=70, current_step="Rendering trailer..."
            )

            clips = await self._render_trailer(plan, profile)

            # Step 9b: Apply polish effects (film grain, letterbox, color grade)
            polish_options = get_polish_options_for_profile(profile)
            if should_apply_polish(polish_options):
                print(f"[{self.job_id}] Applying polish effects...")
                await self.convex.update_status(
                    self.job_id, "POLISHING", progress=80, current_step="Applying polish effects..."
                )
                clips = await self._apply_polish(clips, polish_options)

            # Step 9c: Phase 7 - Apply overlays and branding
            branding = self.job_data.get("branding", {})
            if branding:
                print(f"[{self.job_id}] Applying overlays and branding...")
                await self.convex.update_status(
                    self.job_id, "BRANDING", progress=82, current_step="Applying branding overlays..."
                )
                clips = await self._apply_overlays(clips, profile, branding)

            # Step 10: Mix audio (if music or SFX was generated)
            if audio_plan and (self.music_path or sfx_placements):
                print(f"[{self.job_id}] Mixing audio...")
                await self.convex.update_status(
                    self.job_id, "MIXING", progress=85, current_step="Mixing audio..."
                )
                clips = await self._mix_audio(clips, audio_plan, sfx_placements)

            # Step 10b: Phase 8 - Create workflow plan
            print(f"[{self.job_id}] Creating workflow plan...")
            await self.convex.update_status(
                self.job_id, "WORKFLOW_PLANNING", progress=87,
                current_step="Creating workflow plan..."
            )
            self.workflow_plan = await self._create_workflow_plan(
                profile, plan, text_cards, audio_plan
            )

            # Step 10c: Phase 8 - Generate preview (optional based on settings)
            generate_preview = self.job_data.get("generatePreview", True)
            if generate_preview and clips:
                print(f"[{self.job_id}] Generating preview...")
                await self.convex.update_status(
                    self.job_id, "PREVIEW_GENERATING", progress=88,
                    current_step="Generating preview..."
                )
                await self._generate_and_upload_preview(clips, profile)

            # Step 11: Upload outputs
            print(f"[{self.job_id}] Uploading outputs...")
            await self.convex.update_status(
                self.job_id, "UPLOADING_OUTPUTS", progress=90, current_step="Uploading trailer..."
            )

            uploaded_clips = await self._upload_clips(clips)

            # Step 12: Complete job
            await self.convex.complete_job(self.job_id)

            return TrailerProcessorResult(
                success=True,
                job_id=self.job_id,
                clips=uploaded_clips,
                video_duration=self._get_video_duration(),
            )

        except Exception as e:
            print(f"[{self.job_id}] Error: {e}")
            import traceback
            traceback.print_exc()

            error_stage = getattr(self, "_current_stage", "unknown")
            try:
                await self.convex.fail_job(self.job_id, str(e), error_stage)
            except Exception:
                pass

            return TrailerProcessorResult(
                success=False,
                job_id=self.job_id,
                error=str(e),
                error_stage=error_stage,
            )

        finally:
            await self.convex.close()

    async def _prepare_video(self, r2_source_key: str):
        """Download source and generate proxy if needed."""
        self._current_stage = "prepare_video"

        job_temp = os.path.join(self.temp_dir, self.job_id)
        os.makedirs(job_temp, exist_ok=True)

        # Check if proxy already exists and is valid
        existing_proxy_key = self.job_data.get("proxyR2Key")
        existing_proxy_hash = self.job_data.get("proxySpecHash")
        current_hash = self.compute_proxy_spec_hash()

        if existing_proxy_key and existing_proxy_hash == current_hash:
            # Use existing proxy
            print(f"[{self.job_id}] Using cached proxy: {existing_proxy_key}")
            self.proxy_path = os.path.join(job_temp, "proxy.mp4")
            await self.r2.download_file(existing_proxy_key, self.proxy_path)
        else:
            # Download source and generate proxy
            print(f"[{self.job_id}] Downloading source: {r2_source_key}")
            await self.convex.update_status(
                self.job_id, "PROXY_GENERATING", progress=5, current_step="Downloading source..."
            )

            self.source_path = os.path.join(job_temp, "source.mp4")
            await self.r2.download_file(r2_source_key, self.source_path)

            # Generate proxy
            print(f"[{self.job_id}] Generating 720p proxy...")
            await self.convex.update_status(
                self.job_id, "PROXY_GENERATING", progress=10, current_step="Generating proxy..."
            )

            self.proxy_path = os.path.join(job_temp, "proxy.mp4")
            await self._generate_proxy()

            # Upload proxy to R2
            proxy_r2_key = f"trailers/{self.job_id}/proxy.mp4"
            await self.r2.upload_file(self.proxy_path, proxy_r2_key)
            await self.convex.set_proxy_key(self.job_id, proxy_r2_key, current_hash)

        # Extract audio for transcription
        self.audio_path = os.path.join(job_temp, "audio.mp3")
        await self._extract_audio()

    async def _generate_proxy(self):
        """Generate 720p proxy for faster analysis."""
        spec = self.PROXY_SPEC
        cmd = [
            "ffmpeg", "-y",
            "-i", self.source_path,
            "-vf", f"scale={spec['resolution'].split('x')[0]}:-2",
            "-c:v", spec["codec"],
            "-preset", spec["preset"],
            "-b:v", spec["bitrate"],
            "-c:a", "aac",
            "-b:a", "128k",
            self.proxy_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)

    async def _extract_audio(self):
        """Extract audio track for transcription."""
        source = self.proxy_path or self.source_path
        cmd = [
            "ffmpeg", "-y",
            "-i", source,
            "-vn",
            "-acodec", "libmp3lame",
            "-ar", "16000",
            "-ac", "1",
            "-b:a", "64k",
            self.audio_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)

    async def _transcribe(self) -> Dict[str, Any]:
        """Transcribe audio and cache result."""
        self._current_stage = "transcribe"

        result = await self.transcription.transcribe(self.audio_path)

        # TODO: Save transcription to Convex and get ID
        # await self.convex.set_transcription_id(self.job_id, transcription_id)

        return result

    async def _detect_scenes(self) -> List[SceneInfo]:
        """Detect scene boundaries using ffmpeg."""
        self._current_stage = "scene_detection"

        video_path = self.proxy_path or self.source_path

        # Use ffmpeg scene detection
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "frame=pts_time,pict_type",
            "-of", "json",
            video_path,
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"ffprobe failed: {result.stderr}")

        # Parse keyframes
        data = json.loads(result.stdout)
        keyframes = []
        for frame in data.get("frames", []):
            if frame.get("pict_type") == "I":
                pts = float(frame.get("pts_time", 0))
                keyframes.append(pts)

        # Get video duration
        duration = self._get_video_duration()

        # Create scenes from keyframe intervals
        scenes = []
        for i in range(len(keyframes)):
            start = keyframes[i]
            end = keyframes[i + 1] if i + 1 < len(keyframes) else duration

            # Skip very short scenes
            if end - start < 0.5:
                continue

            scenes.append(SceneInfo(
                scene_index=len(scenes),
                start_time=start,
                end_time=end,
                duration=end - start,
                keyframe_timestamps=[start],
            ))

        print(f"[{self.job_id}] Detected {len(scenes)} scenes")
        return scenes

    async def _generate_timestamp_plan(
        self,
        transcript: Dict[str, Any],
        scenes: List[SceneInfo],
        profile: Dict[str, Any],
        scored_scenes: Optional[List[Dict[str, Any]]] = None,
        selected_dialogue: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Use GPT-4o to generate optimal timestamp plan.

        Args:
            transcript: Transcription result with segments
            scenes: List of SceneInfo objects
            profile: Trailer profile settings
            scored_scenes: Phase 5 - Scenes with importanceScores
            selected_dialogue: Phase 5 - Pre-selected trailer-worthy dialogue
        """
        self._current_stage = "planning"

        import openai
        client = openai.AsyncOpenAI()

        # Prepare scene summaries - use scored scenes if available
        if scored_scenes:
            scene_data = [
                {
                    "index": s.get("sceneIndex", i),
                    "start": s.get("startTime", 0),
                    "end": s.get("endTime", 0),
                    "duration": s.get("duration", 0),
                    "importance": s.get("importanceScores", {}),
                }
                for i, s in enumerate(scored_scenes)
            ]
        else:
            scene_data = [
                {
                    "index": s.scene_index,
                    "start": s.start_time,
                    "end": s.end_time,
                    "duration": s.duration,
                }
                for s in scenes
            ]

        # Get transcript text
        transcript_text = transcript.get("text", "")[:10000]  # Limit size

        target_duration = profile.get("durationTargetSec", 120)
        structure = profile.get("structure", ["hook", "premise", "button"])

        # Check if this profile should use text cards (non-social profiles)
        profile_key = profile.get("key", "theatrical")
        use_text_cards = profile_key not in ["social_vertical", "social_square"]
        text_card_defaults = profile.get("textCardDefaults", {})
        default_style = text_card_defaults.get("defaultStyle", "bold")
        default_motion = text_card_defaults.get("defaultMotion", "fade_up")

        # Phase 5: Include selected dialogue in prompt
        dialogue_section = ""
        if selected_dialogue:
            dialogue_lines = [
                {
                    "text": d.get("text", ""),
                    "start": d.get("start", 0),
                    "end": d.get("end", 0),
                    "purpose": d.get("trailer_purpose", "general"),
                    "score": d.get("trailer_score", 0.5),
                }
                for d in selected_dialogue[:10]  # Top 10 lines
            ]
            dialogue_section = f"""
## PRE-SELECTED TRAILER DIALOGUE (AI-scored for impact)
These lines have been pre-analyzed as trailer-worthy. Prioritize using them:
{json.dumps(dialogue_lines, indent=2)}
"""

        # Phase 5: Include importance scores guidance
        importance_section = ""
        if scored_scenes:
            high_priority = [
                s for s in scored_scenes
                if s.get("importanceScores", {}).get("priority") in ["must_include", "high_priority"]
            ]
            if high_priority:
                importance_section = f"""
## HIGH-PRIORITY SCENES (Phase 5 AI Analysis)
These scenes scored highest for trailer impact. Consider including them:
- Must Include: {len([s for s in high_priority if s.get('importanceScores', {}).get('priority') == 'must_include'])} scenes
- High Priority: {len([s for s in high_priority if s.get('importanceScores', {}).get('priority') == 'high_priority'])} scenes

Scene indices with highest combined scores (emotional + visual + narrative):
{json.dumps([{'index': s.get('sceneIndex'), 'combined': s.get('importanceScores', {}).get('combined', 0)} for s in sorted(high_priority, key=lambda x: x.get('importanceScores', {}).get('combined', 0), reverse=True)[:10]], indent=2)}
"""

        text_card_instructions = ""
        text_card_output = ""
        if use_text_cards:
            text_card_instructions = f"""
## CINEMATIC TEXT CARDS
Also generate Hollywood-style text cards for this trailer.

TEXT CARD GUIDELINES:
- Use 1-4 word phrases that CREATE ANTICIPATION for the next beat
- Cards should land on impact moments (scene transitions, music hits)
- Common patterns:
  * Opening: "THIS [SEASON]", "FROM [STUDIO/CREATOR]"
  * Build: "ONE [NOUN]", "A [ADJECTIVE] [NOUN]"
  * Stakes: "[EVERYTHING/NOTHING] [AT STAKE]", "WILL [QUESTION]"
  * Button: Title card, release date, "COMING SOON"
- Space cards at least 8-15 seconds apart (don't overwhelm)
- 5-8 cards total for a 2-minute trailer, 2-4 for shorter trailers
- Use UPPERCASE for maximum impact
- Default style: "{default_style}", default motion: "{default_motion}"
"""
            text_card_output = """,
  "textCards": [
    {{
      "cardIndex": 0,
      "atSec": 0.0,
      "durationSec": 2.5,
      "text": "THIS WINTER",
      "style": "minimal",
      "motion": "fade_up",
      "position": "center"
    }},
    {{
      "cardIndex": 1,
      "atSec": 18.0,
      "durationSec": 2.0,
      "text": "ONE DECISION",
      "style": "bold",
      "motion": "push_in",
      "position": "center"
    }}
  ]"""

        prompt = f"""You are a professional Hollywood trailer editor. Generate an optimal timestamp plan for a cinematic trailer.

## Video Duration
{self._get_video_duration():.1f} seconds

## Available Scenes (with Phase 5 importance scores if available)
{json.dumps(scene_data[:50], indent=2)}
{importance_section}
## Transcript (first 10000 chars)
{transcript_text}
{dialogue_section}
## Target Profile
- Duration: {target_duration} seconds
- Structure: {' → '.join(structure)}
- Profile: {profile_key}
{text_card_instructions}
## Output Format
Return a JSON object with:
{{
  "clips": [
    {{
      "clipIndex": 0,
      "sourceStart": 45.2,
      "sourceEnd": 52.8,
      "purpose": "cold_open",
      "transitionOut": "cut"
    }}
  ]{text_card_output},
  "reasoning": "Brief explanation of edit decisions"
}}

Rules:
1. Total clip duration should be close to {target_duration} seconds
2. Follow the structure template
3. Build tension progressively
4. Avoid spoilers
5. Use interesting dialogue and visual moments
6. Text cards should feel EPIC and ANTICIPATORY, not descriptive

Return ONLY valid JSON."""

        plan_content = None
        openai_error = None

        # Try OpenAI first
        try:
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.7,
            )
            plan_content = response.choices[0].message.content
        except Exception as e:
            openai_error = str(e)
            print(f"[{self.job_id}] OpenAI timestamp plan failed: {e}")

        # Try Gemini fallback
        if plan_content is None and GEMINI_API_KEY:
            print(f"[{self.job_id}] Trying Gemini fallback for timestamp plan...")
            try:
                async with httpx.AsyncClient(timeout=60.0) as http_client:
                    response = await http_client.post(
                        f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
                        headers={"Content-Type": "application/json"},
                        json={
                            "contents": [{"parts": [{"text": prompt}]}],
                            "generationConfig": {
                                "temperature": 0.7,
                                "maxOutputTokens": 4000,
                            },
                        },
                    )
                    if response.status_code == 200:
                        result = response.json()
                        candidates = result.get("candidates", [])
                        if candidates:
                            content = candidates[0].get("content", {})
                            parts = content.get("parts", [])
                            if parts:
                                plan_content = parts[0].get("text", "").strip()
                                # Extract JSON from markdown if needed
                                if "```json" in plan_content:
                                    plan_content = plan_content.split("```json")[1].split("```")[0]
                                elif "```" in plan_content:
                                    plan_content = plan_content.split("```")[1].split("```")[0]
                    else:
                        print(f"[{self.job_id}] Gemini API error: {response.status_code}")
            except Exception as e:
                print(f"[{self.job_id}] Gemini timestamp plan also failed: {e}")

        if plan_content is None:
            raise Exception(f"Both APIs failed for timestamp plan. OpenAI: {openai_error}")

        plan = json.loads(plan_content)

        # Compute targetStart/targetEnd for each clip (timeline in final output)
        # These fields are required by the Convex schema
        clips = plan.get("clips", [])
        target_time = 0.0
        for clip in clips:
            clip_duration = clip.get("sourceEnd", 0) - clip.get("sourceStart", 0)
            clip["targetStart"] = target_time
            clip["targetEnd"] = target_time + clip_duration
            target_time += clip_duration

        # Calculate actual duration
        actual_duration = sum(
            c.get("sourceEnd", 0) - c.get("sourceStart", 0)
            for c in clips
        )

        # Save plan to Convex and update local job_data with the plan ID
        # Try to get profile_id from job_data, falling back to the profile document's _id
        profile_id = self.job_data.get("selectedProfileId", "")
        if not profile_id:
            # Fallback: get _id from the profile document if it exists
            profile_doc = self.job_data.get("profile", {})
            if profile_doc and profile_doc.get("_id"):
                profile_id = profile_doc["_id"]
                print(f"[{self.job_id}] Using profile _id from profile document: {profile_id}")

        if profile_id:
            print(f"[{self.job_id}] Creating timestamp plan with profile_id: {profile_id}, {len(clips)} clips")
            try:
                plan_id = await self.convex.create_timestamp_plan(
                    job_id=self.job_id,
                    profile_id=profile_id,
                    clips=clips,
                    source="ai_analysis",
                    target_duration_sec=target_duration,
                    actual_duration_sec=actual_duration,
                    ai_reasoning=plan.get("reasoning"),
                )
                # Store the plan ID in job_data so _upload_clips can use it
                if plan_id:
                    self.job_data["timestampPlanId"] = plan_id
                    print(f"[{self.job_id}] Stored timestampPlanId: {plan_id}")
                else:
                    print(f"[{self.job_id}] WARNING: create_timestamp_plan returned empty plan_id")
            except Exception as e:
                print(f"[{self.job_id}] ERROR: create_timestamp_plan failed: {e}")

            # Save text cards if generated (for non-social profiles)
            text_cards = plan.get("textCards", [])
            if text_cards:
                print(f"[{self.job_id}] Creating text card plan with {len(text_cards)} cards")
                try:
                    text_card_plan_id = await self.convex.create_text_card_plan(
                        job_id=self.job_id,
                        profile_id=profile_id,
                        cards=text_cards,
                        ai_reasoning=plan.get("reasoning"),
                    )
                    if text_card_plan_id:
                        self.job_data["textCardPlanId"] = text_card_plan_id
                        print(f"[{self.job_id}] Stored textCardPlanId: {text_card_plan_id}")
                    else:
                        print(f"[{self.job_id}] WARNING: create_text_card_plan returned empty plan_id")
                except Exception as e:
                    print(f"[{self.job_id}] ERROR: create_text_card_plan failed: {e}")
        else:
            print(f"[{self.job_id}] WARNING: No profile_id available - timestamp plan will NOT be saved!")
            print(f"[{self.job_id}] job_data keys: {list(self.job_data.keys())}")

        return plan

    async def _render_trailer(
        self, plan: Dict[str, Any], profile: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Render trailer using ffmpeg concat."""
        self._current_stage = "render"

        clips = plan.get("clips", [])
        if not clips:
            raise ValueError("No clips in timestamp plan")

        job_temp = os.path.join(self.temp_dir, self.job_id)
        video_path = self.source_path or self.proxy_path

        # Get output variants from profile
        variants = profile.get("outputVariants", [
            {"aspectRatio": "16x9", "resolution": "1080p"}
        ])

        rendered_clips = []

        for variant in variants:
            aspect = variant.get("aspectRatio", "16x9")
            resolution = variant.get("resolution", "1080p")
            variant_key = f"{aspect}_{resolution}"

            # Calculate dimensions
            dims = self._get_dimensions(aspect, resolution)

            # Create concat file
            concat_path = os.path.join(job_temp, f"concat_{variant_key}.txt")
            segment_paths = []

            for i, clip in enumerate(clips):
                start = clip.get("sourceStart", 0)
                end = clip.get("sourceEnd", start + 5)
                segment_path = os.path.join(job_temp, f"segment_{i}_{variant_key}.mp4")

                # Extract segment
                cmd = [
                    "ffmpeg", "-y",
                    "-ss", str(start),
                    "-i", video_path,
                    "-t", str(end - start),
                    "-vf", f"scale={dims['width']}:{dims['height']}:force_original_aspect_ratio=decrease,pad={dims['width']}:{dims['height']}:(ow-iw)/2:(oh-ih)/2",
                    "-c:v", "libx264",
                    "-preset", "fast",
                    "-c:a", "aac",
                    segment_path,
                ]
                subprocess.run(cmd, check=True, capture_output=True)
                segment_paths.append(segment_path)

            # Write concat file
            with open(concat_path, "w") as f:
                for seg in segment_paths:
                    f.write(f"file '{seg}'\n")

            # Concat segments
            output_path = os.path.join(job_temp, f"trailer_{variant_key}.mp4")
            cmd = [
                "ffmpeg", "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", concat_path,
                "-c", "copy",
                output_path,
            ]
            subprocess.run(cmd, check=True, capture_output=True)

            # Get file size
            file_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0

            rendered_clips.append({
                "variant_key": variant_key,
                "profile_key": profile.get("key", "default"),
                "path": output_path,
                "width": dims["width"],
                "height": dims["height"],
                "duration": sum(c.get("sourceEnd", 0) - c.get("sourceStart", 0) for c in clips),
                "file_size": file_size,
            })

            # Cleanup segments
            for seg in segment_paths:
                try:
                    os.remove(seg)
                except Exception:
                    pass

        # Apply text card overlays if present (for non-social profiles)
        text_cards = plan.get("textCards", [])
        if text_cards:
            print(f"[{self.job_id}] Applying {len(text_cards)} text cards to rendered clips")
            for clip in rendered_clips:
                base_path = clip["path"]
                titled_path = base_path.replace(".mp4", "_titled.mp4")

                success = self._render_text_cards_overlay(
                    text_cards=text_cards,
                    video_path=base_path,
                    output_path=titled_path,
                    width=clip["width"],
                    height=clip["height"],
                )

                if success:
                    # Update file size and path to titled version
                    clip["path"] = titled_path
                    clip["file_size"] = os.path.getsize(titled_path) if os.path.exists(titled_path) else 0
                    print(f"[{self.job_id}] Applied text cards to {clip['variant_key']}")
                    # Clean up base version
                    try:
                        os.remove(base_path)
                    except Exception:
                        pass
                else:
                    print(f"[{self.job_id}] WARNING: Text card overlay failed for {clip['variant_key']}, using base version")

        return rendered_clips

    def _render_text_cards_overlay(
        self,
        text_cards: List[Dict[str, Any]],
        video_path: str,
        output_path: str,
        width: int,
        height: int,
    ) -> bool:
        """Render text cards as overlay on video using FFmpeg drawtext.

        Supports Hollywood-style animations including:
        - fade_up: Classic fade in with upward motion
        - push_in: Scale up slightly while fading in
        - slide_left: Slide in from left edge
        - slide_right: Slide in from right edge
        - zoom_in: Scale from small to full size
        - typewriter: Instant reveal with fade in
        - cut: Hard cut on/off

        Args:
            text_cards: List of text card objects with atSec, durationSec, text, style, motion
            video_path: Path to input video
            output_path: Path for output video with text overlays
            width: Video width for positioning
            height: Video height for positioning

        Returns:
            True if successful, False otherwise
        """
        if not text_cards:
            return False

        # Font configurations per style with enhanced shadow/glow settings
        font_configs = {
            "minimal": {
                "size": 72,
                "fontfile": "DejaVuSans.ttf",
                "shadow_x": 2,
                "shadow_y": 2,
                "shadow_alpha": 0.6,
            },
            "bold": {
                "size": 96,
                "fontfile": "DejaVuSans-Bold.ttf",
                "shadow_x": 4,
                "shadow_y": 4,
                "shadow_alpha": 0.8,
            },
            "elegant": {
                "size": 80,
                "fontfile": "DejaVuSerif.ttf",
                "shadow_x": 2,
                "shadow_y": 2,
                "shadow_alpha": 0.5,
            },
            "gritty": {
                "size": 88,
                "fontfile": "DejaVuSans-Bold.ttf",
                "shadow_x": 5,
                "shadow_y": 5,
                "shadow_alpha": 0.9,
            },
        }

        # Build drawtext filters for each card
        filters = []
        for card in text_cards:
            at_sec = card.get("atSec", 0)
            duration = card.get("durationSec", 2.5)
            text = card.get("text", "").replace("'", "'\\''").replace(":", "\\:")
            style = card.get("style", "bold")
            motion = card.get("motion", "fade_up")
            position = card.get("position", "center")

            cfg = font_configs.get(style, font_configs["bold"])
            base_fontsize = card.get("fontSize", cfg["size"])

            # Base position calculations
            if position == "lower_third":
                base_y = "h*0.75-text_h/2"
            elif position == "upper":
                base_y = "h*0.25-text_h/2"
            else:  # center
                base_y = "(h-text_h)/2"

            base_x = "(w-text_w)/2"

            # Timing calculations
            end_sec = at_sec + duration
            fade_in_duration = 0.4
            fade_out_duration = 0.3
            fade_in_end = at_sec + fade_in_duration
            fade_out_start = end_sec - fade_out_duration

            # Build motion-specific expressions
            if motion == "fade_up":
                # Fade in while moving up 20 pixels, hold, fade out
                y_offset = 20
                alpha_expr = self._build_fade_alpha(at_sec, end_sec, fade_in_duration, fade_out_duration)
                # Y moves from base_y+offset to base_y during fade in
                y_expr = (
                    f"if(between(t,{at_sec},{fade_in_end}),"
                    f"{base_y}+{y_offset}*(1-(t-{at_sec})/{fade_in_duration}),"
                    f"{base_y})"
                )
                x_expr = base_x
                fontsize_expr = str(base_fontsize)

            elif motion == "push_in":
                # Scale from 90% to 100% while fading in (cinematic zoom feel)
                alpha_expr = self._build_fade_alpha(at_sec, end_sec, fade_in_duration, fade_out_duration)
                # Font scales from 90% to 100% during fade in
                fontsize_expr = (
                    f"if(between(t,{at_sec},{fade_in_end}),"
                    f"{base_fontsize}*(0.9+0.1*(t-{at_sec})/{fade_in_duration}),"
                    f"{base_fontsize})"
                )
                x_expr = base_x
                y_expr = base_y

            elif motion == "slide_left":
                # Slide in from left edge
                alpha_expr = self._build_fade_alpha(at_sec, end_sec, fade_in_duration, fade_out_duration)
                # X moves from -text_w to center during fade in
                x_expr = (
                    f"if(between(t,{at_sec},{fade_in_end}),"
                    f"-text_w+({base_x}+text_w)*(t-{at_sec})/{fade_in_duration},"
                    f"{base_x})"
                )
                y_expr = base_y
                fontsize_expr = str(base_fontsize)

            elif motion == "slide_right":
                # Slide in from right edge
                alpha_expr = self._build_fade_alpha(at_sec, end_sec, fade_in_duration, fade_out_duration)
                # X moves from w to center during fade in
                x_expr = (
                    f"if(between(t,{at_sec},{fade_in_end}),"
                    f"w-({base_x}+text_w)*(t-{at_sec})/{fade_in_duration},"
                    f"{base_x})"
                )
                y_expr = base_y
                fontsize_expr = str(base_fontsize)

            elif motion == "zoom_in":
                # Scale from 50% to 100% with alpha fade (dramatic reveal)
                alpha_expr = self._build_fade_alpha(at_sec, end_sec, fade_in_duration, fade_out_duration)
                fontsize_expr = (
                    f"if(between(t,{at_sec},{fade_in_end}),"
                    f"{base_fontsize}*(0.5+0.5*(t-{at_sec})/{fade_in_duration}),"
                    f"{base_fontsize})"
                )
                x_expr = base_x
                y_expr = base_y

            elif motion == "typewriter":
                # Instant appear with fast fade in, no fade out
                alpha_expr = (
                    f"if(between(t,{at_sec},{at_sec + 0.2}),"
                    f"(t-{at_sec})/0.2,"
                    f"if(between(t,{at_sec},{end_sec}),1,0))"
                )
                x_expr = base_x
                y_expr = base_y
                fontsize_expr = str(base_fontsize)

            else:  # cut - instant on/off (hard cut style)
                alpha_expr = f"if(between(t,{at_sec},{end_sec}),1,0)"
                x_expr = base_x
                y_expr = base_y
                fontsize_expr = str(base_fontsize)

            # Build drawtext filter with dynamic expressions
            shadow_x = cfg.get("shadow_x", 3)
            shadow_y = cfg.get("shadow_y", 3)
            shadow_alpha = cfg.get("shadow_alpha", 0.8)

            filter_str = (
                f"drawtext=text='{text}':"
                f"fontfile=/usr/share/fonts/truetype/dejavu/{cfg['fontfile']}:"
                f"fontsize='{fontsize_expr}':"
                f"fontcolor=white:"
                f"shadowcolor=black@{shadow_alpha}:shadowx={shadow_x}:shadowy={shadow_y}:"
                f"x='{x_expr}':y='{y_expr}':"
                f"alpha='{alpha_expr}'"
            )
            filters.append(filter_str)

        if not filters:
            return False

        filter_complex = ",".join(filters)

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vf", filter_complex,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-c:a", "copy",
            output_path,
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"[{self.job_id}] FFmpeg text overlay error: {result.stderr}")
                return False
            return True
        except Exception as e:
            print(f"[{self.job_id}] Text card overlay failed: {e}")
            return False

    def _build_fade_alpha(
        self,
        start: float,
        end: float,
        fade_in_duration: float = 0.4,
        fade_out_duration: float = 0.3,
    ) -> str:
        """Build FFmpeg alpha expression for fade in/out.

        Args:
            start: Start time in seconds
            end: End time in seconds
            fade_in_duration: Fade in duration in seconds
            fade_out_duration: Fade out duration in seconds

        Returns:
            FFmpeg expression string for alpha
        """
        fade_in_end = start + fade_in_duration
        fade_out_start = end - fade_out_duration

        return (
            f"if(between(t,{start},{fade_in_end}),"
            f"(t-{start})/{fade_in_duration},"
            f"if(between(t,{fade_out_start},{end}),"
            f"({end}-t)/{fade_out_duration},"
            f"if(between(t,{start},{end}),1,0)))"
        )

    async def _apply_polish(
        self,
        clips: List[Dict[str, Any]],
        polish_options: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Apply professional polish effects to rendered clips.

        Args:
            clips: List of rendered clip dicts with path, variant_key, etc.
            polish_options: Polish options from profile (filmGrain, letterbox, colorGrade)

        Returns:
            Clips with paths updated to polished versions.
        """
        self._current_stage = "polishing"

        polished_clips = []

        for clip in clips:
            base_path = clip["path"]
            polished_path = base_path.replace(".mp4", "_polished.mp4")

            success = self.video_effects.apply_polish(
                input_path=base_path,
                output_path=polished_path,
                width=clip["width"],
                height=clip["height"],
                polish_options=polish_options,
            )

            if success and os.path.exists(polished_path):
                # Update clip with polished path
                clip["path"] = polished_path
                clip["file_size"] = os.path.getsize(polished_path)
                print(f"[{self.job_id}] Applied polish to {clip['variant_key']}")
                # Clean up base version
                try:
                    os.remove(base_path)
                except Exception:
                    pass
            else:
                print(f"[{self.job_id}] Polish failed for {clip['variant_key']}, using original")

            polished_clips.append(clip)

        return polished_clips

    async def _generate_audio_plan(
        self,
        plan: Dict[str, Any],
        profile: Dict[str, Any],
        transcript: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Generate audio plan for music and mixing.

        Analyzes the timestamp plan to identify rise points, impact points,
        and dialogue windows for music generation and mixing.
        """
        self._current_stage = "audio_planning"

        try:
            clips = plan.get("clips", [])
            text_cards = plan.get("textCards", [])

            if not clips:
                print(f"[{self.job_id}] No clips in plan, skipping audio planning")
                return None

            # Calculate total duration from clips
            total_duration = sum(
                c.get("sourceEnd", 0) - c.get("sourceStart", 0)
                for c in clips
            )

            # Analyze for music points
            transcript_segments = transcript.get("segments", [])
            analysis = analyze_for_music_points(
                clips=clips,
                text_cards=text_cards,
                transcript_segments=transcript_segments,
            )

            # Determine music mood from profile
            profile_key = profile.get("key", "theatrical")
            structure = profile.get("structure", [])
            mood = determine_music_mood(profile_key, structure)

            # Build music prompt
            music_prompt = self.music_generator.build_trailer_prompt(
                duration_sec=total_duration,
                rise_points=analysis["rise_points"],
                impact_points=analysis["impact_points"],
                mood=mood,
            )

            # Get mixing levels for profile
            target_lufs = get_target_lufs_for_profile(profile_key)
            mixing_levels = get_mixing_levels_for_profile(profile_key)

            # Create audio plan in Convex
            profile_id = self.job_data.get("selectedProfileId", "")
            if not profile_id:
                profile_doc = self.job_data.get("profile", {})
                profile_id = profile_doc.get("_id", "")

            audio_plan = {
                "trailerDurationSec": total_duration,
                "risePoints": analysis["rise_points"],
                "impactPoints": analysis["impact_points"],
                "dialogueWindows": analysis["dialogue_windows"],
                "musicPrompt": music_prompt,
                "musicStyle": mood,
                "targetLufs": target_lufs,
                "dialogueLevelDb": mixing_levels["dialogue_level_db"],
                "musicLevelDb": mixing_levels["music_level_db"],
            }

            if profile_id:
                plan_id = await self.convex.create_audio_plan(
                    job_id=self.job_id,
                    profile_id=profile_id,
                    trailer_duration_sec=total_duration,
                    rise_points=analysis["rise_points"],
                    impact_points=analysis["impact_points"],
                    dialogue_windows=analysis["dialogue_windows"],
                    music_prompt=music_prompt,
                    music_style=mood,
                    target_lufs=target_lufs,
                    dialogue_level_db=mixing_levels["dialogue_level_db"],
                    music_level_db=mixing_levels["music_level_db"],
                )
                if plan_id:
                    self.job_data["audioPlanId"] = plan_id
                    print(f"[{self.job_id}] Created audio plan: {plan_id}")

            return audio_plan

        except Exception as e:
            print(f"[{self.job_id}] Audio planning failed: {e}")
            import traceback
            traceback.print_exc()
            return None

    async def _generate_music(self, audio_plan: Dict[str, Any]) -> bool:
        """Generate music using ElevenLabs.

        Downloads the generated music and stores it locally for mixing.
        """
        self._current_stage = "music_generating"

        try:
            duration = audio_plan.get("trailerDurationSec", 120)
            prompt = audio_plan.get("musicPrompt", "")
            style = audio_plan.get("musicStyle", "epic_orchestral")

            if not prompt:
                print(f"[{self.job_id}] No music prompt, skipping generation")
                return False

            print(f"[{self.job_id}] Generating {duration:.0f}s of {style} music...")

            # Generate music
            audio_bytes = await self.music_generator.generate_trailer_music(
                prompt=prompt,
                duration_sec=duration,
                style=style,
            )

            if not audio_bytes:
                print(f"[{self.job_id}] Music generation returned empty")
                return False

            # Save to temp file
            job_temp = os.path.join(self.temp_dir, self.job_id)
            os.makedirs(job_temp, exist_ok=True)
            self.music_path = os.path.join(job_temp, "music.mp3")

            with open(self.music_path, "wb") as f:
                f.write(audio_bytes)

            print(f"[{self.job_id}] Generated music: {len(audio_bytes)} bytes")

            # Upload music to R2 for archival
            music_r2_key = f"trailers/{self.job_id}/audio/music.mp3"
            await self.r2.upload_file(self.music_path, music_r2_key, content_type="audio/mpeg")

            # Update audio plan with music info
            audio_plan_id = self.job_data.get("audioPlanId", "")
            if audio_plan_id:
                await self.convex.update_audio_plan_music(
                    plan_id=audio_plan_id,
                    music_r2_key=music_r2_key,
                    music_duration_sec=duration,
                )

            return True

        except Exception as e:
            print(f"[{self.job_id}] Music generation failed: {e}")
            import traceback
            traceback.print_exc()
            return False

    async def _analyze_music_beats(self) -> Optional[Dict[str, Any]]:
        """Phase 5: Analyze generated music for beat positions.

        Uses librosa to detect beats, downbeats, and energy curves
        for beat-synchronized editing.

        Returns:
            Beat analysis dict with tempo, beat_times, downbeat_times, peak_times
        """
        self._current_stage = "beat_analyzing"

        if not self.music_path or not os.path.exists(self.music_path):
            print(f"[{self.job_id}] No music file for beat analysis")
            return None

        try:
            # Use the BeatSyncEditor to analyze music
            beat_analysis = await self.beat_sync.analyze_music_beats(
                music_path=self.music_path,
                target_fps=30.0,  # Standard video frame rate
            )

            print(
                f"[{self.job_id}] Beat analysis: tempo={beat_analysis.get('tempo', 0):.1f} BPM, "
                f"{len(beat_analysis.get('beat_times', []))} beats, "
                f"{len(beat_analysis.get('downbeat_times', []))} downbeats"
            )

            # Store in audio plan if we have one
            audio_plan_id = self.job_data.get("audioPlanId", "")
            if audio_plan_id:
                # Update audio plan with beat analysis
                # Note: This would need a new Convex action to update beat analysis
                pass  # TODO: Implement Convex update for beat analysis

            return beat_analysis

        except Exception as e:
            print(f"[{self.job_id}] Beat analysis failed: {e}")
            import traceback
            traceback.print_exc()
            return None

    async def _generate_sfx(
        self,
        audio_plan: Dict[str, Any],
        plan: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Generate sound effects for the trailer.

        Plans SFX placements based on impact points, text cards, and transitions,
        then generates unique SFX using ElevenLabs.

        Returns:
            List of SFX placement dicts with local file paths
        """
        self._current_stage = "sfx_generating"

        try:
            # Get data for SFX planning
            impact_points = audio_plan.get("impactPoints", [])
            text_cards = plan.get("textCards", [])
            clips = plan.get("clips", [])
            trailer_duration = audio_plan.get("trailerDurationSec", 120)

            # Calculate clip transition timestamps
            clip_transitions = []
            current_time = 0.0
            for clip in clips:
                clip_duration = clip.get("sourceEnd", 0) - clip.get("sourceStart", 0)
                current_time += clip_duration
                clip_transitions.append(current_time)

            # Plan SFX placements
            sfx_placements = plan_sfx_placements(
                impact_points=impact_points,
                text_cards=text_cards,
                clip_transitions=clip_transitions,
                trailer_duration=trailer_duration,
            )

            if not sfx_placements:
                print(f"[{self.job_id}] No SFX placements planned")
                return []

            print(f"[{self.job_id}] Planned {len(sfx_placements)} SFX placements")

            # Get unique SFX generation requests
            generation_requests = get_sfx_generation_requests(sfx_placements)

            if not generation_requests:
                print(f"[{self.job_id}] No SFX to generate")
                return []

            print(f"[{self.job_id}] Generating {len(generation_requests)} unique SFX types...")

            # Generate SFX
            results = await self.sfx_generator.generate_batch(generation_requests)

            # Save generated SFX to temp files and R2
            job_temp = os.path.join(self.temp_dir, self.job_id, "sfx")
            os.makedirs(job_temp, exist_ok=True)

            # Map type -> local file path for generated SFX
            type_to_path = {}
            sfx_r2_keys = {}  # type -> r2_key

            for result in results:
                if not result.get("success"):
                    print(f"[{self.job_id}] SFX generation failed for {result.get('type')}: {result.get('error')}")
                    continue

                sfx_type = result["type"]
                audio_bytes = result.get("audio_bytes")
                if not audio_bytes:
                    continue

                # Save to temp file
                local_path = os.path.join(job_temp, f"{sfx_type}.mp3")
                with open(local_path, "wb") as f:
                    f.write(audio_bytes)

                type_to_path[sfx_type] = local_path
                self.sfx_files[sfx_type] = local_path

                # Upload to R2 for archival
                r2_key = f"trailers/{self.job_id}/audio/sfx_{sfx_type}.mp3"
                await self.r2.upload_file(local_path, r2_key, content_type="audio/mpeg")
                sfx_r2_keys[sfx_type] = r2_key

                print(f"[{self.job_id}] Generated SFX '{sfx_type}': {len(audio_bytes)} bytes")

            # Build final placements with file paths and R2 keys
            final_placements = []
            for placement in sfx_placements:
                sfx_type = placement["type"]
                if sfx_type in type_to_path:
                    final_placements.append({
                        **placement,
                        "path": type_to_path[sfx_type],
                        "r2Key": sfx_r2_keys.get(sfx_type),
                    })

            print(f"[{self.job_id}] Generated {len(final_placements)} SFX placements with files")

            # Update Convex audio plan with SFX data
            audio_plan_id = self.job_data.get("audioPlanId", "")
            if audio_plan_id and final_placements:
                # Prepare placements for Convex (without local path)
                convex_placements = [
                    {
                        "sfxIndex": p["sfxIndex"],
                        "atSec": p["atSec"],
                        "type": p["type"],
                        "intensity": p["intensity"],
                        "durationSec": p.get("durationSec"),
                        "r2Key": p.get("r2Key"),
                    }
                    for p in final_placements
                ]
                await self.convex.update_audio_plan_sfx(
                    plan_id=audio_plan_id,
                    sfx_placements=convex_placements,
                    sfx_level_db=-6,
                )

            return final_placements

        except Exception as e:
            print(f"[{self.job_id}] SFX generation failed: {e}")
            import traceback
            traceback.print_exc()
            return []

        finally:
            # Close the SFX generator client
            await self.sfx_generator.close()

    async def _mix_audio(
        self,
        clips: List[Dict[str, Any]],
        audio_plan: Dict[str, Any],
        sfx_placements: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """Mix generated music and SFX with dialogue in rendered clips.

        Args:
            clips: List of rendered clip dicts with path, variant_key, etc.
            audio_plan: Audio plan with mixing levels and dialogue windows
            sfx_placements: Optional list of SFX placements with local file paths

        Returns:
            Clips with paths updated to mixed versions.
        """
        self._current_stage = "mixing"

        has_music = self.music_path and os.path.exists(self.music_path)
        has_sfx = sfx_placements and len(sfx_placements) > 0

        if not has_music and not has_sfx:
            print(f"[{self.job_id}] No music or SFX available for mixing")
            return clips

        mixed_clips = []

        for clip in clips:
            base_path = clip["path"]
            mixed_path = base_path.replace(".mp4", "_mixed.mp4")

            # Use multi-track mixer if we have SFX, otherwise use simpler mixer
            if has_sfx:
                success = self.audio_mixer.mix_trailer_audio_with_sfx(
                    video_with_dialogue=base_path,
                    music_path=self.music_path if has_music else None,
                    sfx_paths=sfx_placements,
                    output_path=mixed_path,
                    dialogue_level_db=audio_plan.get("dialogueLevelDb", -12),
                    music_level_db=audio_plan.get("musicLevelDb", -18),
                    sfx_level_db=audio_plan.get("sfxLevelDb", -6),
                    target_lufs=audio_plan.get("targetLufs", -14),
                    dialogue_windows=audio_plan.get("dialogueWindows", []),
                )
            else:
                # No SFX, use simpler music+dialogue mixer
                success = self.audio_mixer.mix_trailer_audio(
                    video_with_dialogue=base_path,
                    music_path=self.music_path,
                    output_path=mixed_path,
                    dialogue_level_db=audio_plan.get("dialogueLevelDb", -12),
                    music_level_db=audio_plan.get("musicLevelDb", -18),
                    target_lufs=audio_plan.get("targetLufs", -14),
                    dialogue_windows=audio_plan.get("dialogueWindows", []),
                )

            if success:
                # Update clip with mixed path
                clip["path"] = mixed_path
                clip["file_size"] = os.path.getsize(mixed_path) if os.path.exists(mixed_path) else 0
                print(f"[{self.job_id}] Mixed audio for {clip['variant_key']}")
                # Clean up unmixed version
                try:
                    os.remove(base_path)
                except Exception:
                    pass
            else:
                print(f"[{self.job_id}] Audio mixing failed for {clip['variant_key']}, using original")

            mixed_clips.append(clip)

        return mixed_clips

    async def _upload_clips(self, clips: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Upload rendered clips to R2 and create records."""
        self._current_stage = "upload"

        uploaded = []
        plan_id = self.job_data.get("timestampPlanId", "")
        user_id = self.job_data.get("userId", "")

        # Warn if required IDs are missing - this would prevent clip records from being created
        if not plan_id:
            print(f"[{self.job_id}] WARNING: timestampPlanId missing from job_data - clip records will not be created!")
        if not user_id:
            print(f"[{self.job_id}] WARNING: userId missing from job_data - clip records will not be created!")

        for clip in clips:
            variant_key = clip["variant_key"]
            r2_key = f"trailers/{self.job_id}/output/{variant_key}.mp4"
            r2_thumb_key = f"trailers/{self.job_id}/output/{variant_key}_thumb.jpg"

            # Generate thumbnail from the rendered video
            thumb_path = self._generate_thumbnail(clip["path"], clip["duration"])

            # Upload video to R2
            await self.r2.upload_file(clip["path"], r2_key)
            print(f"[{self.job_id}] Uploaded {variant_key} to R2: {r2_key}")

            # Upload thumbnail to R2
            if thumb_path and os.path.exists(thumb_path):
                await self.r2.upload_file(thumb_path, r2_thumb_key, content_type="image/jpeg")
                print(f"[{self.job_id}] Uploaded thumbnail to R2: {r2_thumb_key}")
                # Clean up local thumbnail
                try:
                    os.remove(thumb_path)
                except Exception:
                    pass
            else:
                r2_thumb_key = None
                print(f"[{self.job_id}] WARNING: Failed to generate thumbnail for {variant_key}")

            # Create clip record in Convex
            if plan_id and user_id:
                clip_id = await self.convex.create_trailer_clip(
                    job_id=self.job_id,
                    timestamp_plan_id=plan_id,
                    user_id=user_id,
                    profile_key=clip["profile_key"],
                    variant_key=variant_key,
                    duration=clip["duration"],
                    width=clip["width"],
                    height=clip["height"],
                    r2_key=r2_key,
                    file_size=clip.get("file_size"),
                    r2_thumb_key=r2_thumb_key,
                )
                print(f"[{self.job_id}] Created clip record: {clip_id}")
            else:
                clip_id = ""
                print(f"[{self.job_id}] SKIPPED clip record creation (missing plan_id={plan_id!r} or user_id={user_id!r})")

            uploaded.append({
                "clip_id": clip_id,
                "variant_key": variant_key,
                "r2_key": r2_key,
                "r2_thumb_key": r2_thumb_key,
                "width": clip["width"],
                "height": clip["height"],
                "duration": clip["duration"],
            })

        # Summary log
        clips_with_records = sum(1 for u in uploaded if u.get("clip_id"))
        print(f"[{self.job_id}] Upload complete: {len(uploaded)} clips uploaded to R2, {clips_with_records} clip records created in DB")
        return uploaded

    def _generate_thumbnail(self, video_path: str, duration: float) -> Optional[str]:
        """Generate a thumbnail from the rendered video at ~25% mark."""
        try:
            # Extract frame at 25% into the video for a representative thumbnail
            seek_time = duration * 0.25 if duration > 0 else 1.0

            # Output path for thumbnail
            thumb_path = video_path.replace(".mp4", "_thumb.jpg")

            cmd = [
                "ffmpeg", "-y",
                "-ss", str(seek_time),
                "-i", video_path,
                "-vframes", "1",
                "-q:v", "2",  # High quality JPEG
                thumb_path,
            ]

            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode == 0 and os.path.exists(thumb_path):
                print(f"[{self.job_id}] Generated thumbnail at {seek_time:.1f}s: {thumb_path}")
                return thumb_path
            else:
                print(f"[{self.job_id}] ffmpeg thumbnail failed: {result.stderr}")
                return None
        except Exception as e:
            print(f"[{self.job_id}] Thumbnail generation error: {e}")
            return None

    def _get_video_duration(self) -> float:
        """Get video duration using ffprobe."""
        video_path = self.proxy_path or self.source_path
        if not video_path:
            return 0

        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json",
            video_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            return float(data.get("format", {}).get("duration", 0))
        return 0

    def _scene_to_dict(self, scene: SceneInfo) -> Dict[str, Any]:
        """Convert SceneInfo to dict for Convex."""
        return {
            "sceneIndex": scene.scene_index,
            "startTime": scene.start_time,
            "endTime": scene.end_time,
            "duration": scene.duration,
            "keyframeTimestamps": scene.keyframe_timestamps,
            "avgMotionIntensity": scene.avg_motion_intensity,
            "avgAudioIntensity": scene.avg_audio_intensity,
            "hasFaces": scene.has_faces,
            "hasDialogue": scene.has_dialogue,
            "dominantColors": scene.dominant_colors,
            "summary": scene.summary,
            "mood": scene.mood,
            "importance": scene.importance,
        }

    def _get_dimensions(self, aspect: str, resolution: str) -> Dict[str, int]:
        """Get pixel dimensions from aspect ratio and resolution."""
        base_heights = {"720p": 720, "1080p": 1080, "4k": 2160}
        aspect_ratios = {"16x9": 16/9, "9x16": 9/16, "1x1": 1, "4x5": 4/5}

        base_height = base_heights.get(resolution, 1080)
        ratio = aspect_ratios.get(aspect, 16/9)

        if ratio >= 1:
            width = int(base_height * ratio)
            height = base_height
        else:
            width = base_height
            height = int(width / ratio)

        # Ensure even dimensions
        width = width - (width % 2)
        height = height - (height % 2)

        return {"width": width, "height": height}

    async def _generate_effects_plan(
        self,
        plan: Dict[str, Any],
        profile: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate Phase 6 effects plan: transitions, speed effects, and flash frames.

        This uses scene analysis and beat data to create intelligent effect choices.
        """
        self._current_stage = "effects_planning"

        clips = plan.get("clips", [])
        beat_times = []
        if self.beat_analysis:
            beat_times = self.beat_analysis.get("beatTimes", [])

        # Get trailer duration from plan
        trailer_duration = plan.get("actualDurationSec", 0)
        if not trailer_duration and clips:
            last_clip = clips[-1]
            trailer_duration = last_clip.get("targetEnd", last_clip.get("target_end", 0))

        # Build scene data for effect planning
        scenes_for_effects = []
        for i, clip in enumerate(clips):
            scene = {
                "index": i,
                "start": clip.get("targetStart", clip.get("target_start", 0)),
                "end": clip.get("targetEnd", clip.get("target_end", 0)),
                "importance": 0.5,  # Default
                "emotion": "neutral",
            }

            # Get importance from scored scenes if available
            if self.scored_scenes:
                source_start = clip.get("sourceStart", clip.get("source_start", 0))
                for scored in self.scored_scenes:
                    if abs(scored.get("startTime", 0) - source_start) < 1.0:
                        importance_scores = scored.get("importanceScores", {})
                        scene["importance"] = importance_scores.get("combined", 0.5)
                        scene["emotion"] = scored.get("mood", "neutral")
                        break

            scenes_for_effects.append(scene)

        # 1. Generate transition plan
        print(f"[{self.job_id}] Generating transition plan...")
        transition_plan = self.transition_renderer.create_transition_plan(
            scenes=scenes_for_effects,
            beat_times=beat_times
        )

        # 2. Generate speed effect plan
        print(f"[{self.job_id}] Generating speed effects plan...")
        speed_plan = self.speed_ramper.create_speed_effect_plan(
            scenes=scenes_for_effects,
            beat_times=beat_times
        )

        # 3. Generate flash frame plan
        print(f"[{self.job_id}] Generating flash frame plan...")
        flash_frames = self.flash_renderer.create_flash_plan(
            scenes=scenes_for_effects,
            beat_times=beat_times,
            trailer_duration=trailer_duration
        )

        # Convert to Convex-compatible format
        transitions_data = [
            {
                "fromClipIndex": t["from_scene"],
                "toClipIndex": t["to_scene"],
                "transitionType": t["transition_type"],
                "duration": t["duration"],
                "offset": t.get("offset", 0),
                "isBeatAligned": t.get("is_beat_aligned", False),
            }
            for t in transition_plan
        ]

        speed_effects_data = [
            {
                "effectIndex": i,
                "effectType": s["type"],
                "startTime": s.get("timestamp", s.get("start_time", 0)),
                "endTime": s.get("timestamp", s.get("start_time", 0)) + s.get("duration", s.get("end_time", 0) - s.get("start_time", 0)),
                "speedFactor": s.get("speed_factor"),
                "rampInDuration": s.get("ramp_in"),
                "rampOutDuration": s.get("ramp_out"),
                "startSpeed": s.get("start_speed"),
                "endSpeed": s.get("end_speed"),
                "easing": s.get("easing"),
            }
            for i, s in enumerate(speed_plan)
        ]

        flash_frames_data = [
            {
                "flashIndex": i,
                "timestamp": f.timestamp,
                "duration": f.duration,
                "color": f.color.value,
                "intensity": f.intensity,
                "fadeIn": f.fade_in if f.fade_in > 0 else None,
                "fadeOut": f.fade_out if f.fade_out > 0 else None,
            }
            for i, f in enumerate(flash_frames)
        ]

        effects_plan = {
            "transitions": transitions_data,
            "speedEffects": speed_effects_data,
            "flashFrames": flash_frames_data,
            "totalTransitions": len(transitions_data),
            "totalSpeedEffects": len(speed_effects_data),
            "totalFlashFrames": len(flash_frames_data),
        }

        # Log summary
        print(f"[{self.job_id}] Effects plan: {len(transitions_data)} transitions, "
              f"{len(speed_effects_data)} speed effects, {len(flash_frames_data)} flash frames")

        # Save to Convex
        profile_id = self.job_data.get("selectedProfileId") or profile.get("_id")
        if profile_id:
            try:
                await self.convex.create_effects_plan(
                    job_id=self.job_id,
                    profile_id=profile_id,
                    effects_plan=effects_plan,
                )
                print(f"[{self.job_id}] Effects plan saved to Convex")
            except Exception as e:
                print(f"[{self.job_id}] Warning: Could not save effects plan: {e}")

        return effects_plan

    async def _apply_overlays(
        self,
        clips: List[Dict[str, Any]],
        profile: Dict[str, Any],
        branding: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Apply Phase 7 overlays: logos, ratings, socials, credits, end cards.

        Args:
            clips: List of rendered clip dicts with paths
            profile: Trailer profile settings
            branding: User's branding settings

        Returns:
            Updated clips list with overlays applied
        """
        self._current_stage = "branding"

        if not branding:
            print(f"[{self.job_id}] No branding data, skipping overlays")
            return clips

        # Get trailer duration from first clip
        trailer_duration = clips[0].get("duration", 60) if clips else 60

        # Create overlay plan
        overlay_plan = self.overlay_renderer.create_overlay_plan(
            profile=profile,
            branding=branding,
            trailer_duration=trailer_duration
        )

        self.overlay_plan = overlay_plan

        # Check if any overlays to apply
        has_overlays = (
            overlay_plan.get("logos") or
            overlay_plan.get("rating") or
            overlay_plan.get("socials") or
            overlay_plan.get("credits") or
            overlay_plan.get("end_card")
        )

        if not has_overlays:
            print(f"[{self.job_id}] No overlays configured, skipping")
            return clips

        # Log overlay summary
        summary_parts = []
        if overlay_plan.get("logos"):
            summary_parts.append(f"{len(overlay_plan['logos'])} logos")
        if overlay_plan.get("rating"):
            summary_parts.append(f"rating ({overlay_plan['rating'].get('ratingCode', 'N/A')})")
        if overlay_plan.get("socials"):
            summary_parts.append(f"{len(overlay_plan['socials'])} social handles")
        if overlay_plan.get("credits"):
            summary_parts.append(f"{len(overlay_plan['credits'])} credits")
        if overlay_plan.get("end_card"):
            summary_parts.append("end card")

        print(f"[{self.job_id}] Applying overlays: {', '.join(summary_parts)}")

        # Apply overlays to each clip
        processed_clips = []
        for clip in clips:
            clip_path = clip.get("path")
            if not clip_path or not os.path.exists(clip_path):
                processed_clips.append(clip)
                continue

            # Create output path for overlaid version
            output_path = clip_path.replace(".mp4", "_branded.mp4")

            # Apply all overlays
            success = self.overlay_renderer.apply_all_overlays(
                input_path=clip_path,
                output_path=output_path,
                overlay_plan=overlay_plan
            )

            if success and os.path.exists(output_path):
                # Update clip with new path
                clip["path"] = output_path
                # Update duration if end card was added
                if overlay_plan.get("end_card"):
                    clip["duration"] = clip.get("duration", 0) + overlay_plan["end_card"].get("duration", 5)
                print(f"[{self.job_id}] Applied overlays to {clip.get('variant_key', 'clip')}")
            else:
                print(f"[{self.job_id}] Warning: Failed to apply overlays to {clip.get('variant_key', 'clip')}")

            processed_clips.append(clip)

        # Save overlay plan to Convex
        profile_id = self.job_data.get("selectedProfileId") or profile.get("_id")
        if profile_id:
            try:
                await self.convex.create_overlay_plan(
                    job_id=self.job_id,
                    profile_id=profile_id,
                    overlay_plan=overlay_plan,
                )
                print(f"[{self.job_id}] Overlay plan saved to Convex")
            except Exception as e:
                print(f"[{self.job_id}] Warning: Could not save overlay plan: {e}")

        return processed_clips

    async def _create_workflow_plan(
        self,
        profile: Dict[str, Any],
        plan: Dict[str, Any],
        text_cards: List[Dict[str, Any]],
        audio_plan: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Create Phase 8 workflow plan for preview/export management.

        Args:
            profile: Trailer profile settings
            plan: Timestamp plan with clips
            text_cards: Text cards from plan
            audio_plan: Audio plan (may be None)

        Returns:
            Workflow plan dict
        """
        self._current_stage = "workflow_planning"

        # Format clips for storage
        formatted_clips = []
        for i, clip in enumerate(plan.get("clips", [])):
            formatted_clips.append({
                "clipIndex": i,
                "sceneIndex": clip.get("sceneIndex", i),
                "sourceStart": clip.get("sourceStart", 0),
                "sourceEnd": clip.get("sourceEnd", 0),
                "targetStart": clip.get("targetStart", 0),
                "targetEnd": clip.get("targetEnd", 0),
                "userModified": clip.get("userModified", False),
                "userAdded": clip.get("userAdded", False),
            })

        # Format text cards for storage
        formatted_cards = []
        for card in text_cards:
            formatted_cards.append({
                "cardIndex": card.get("cardIndex", 0),
                "atSec": card.get("atSec", 0),
                "durationSec": card.get("durationSec", 2.0),
                "text": card.get("text", ""),
                "style": card.get("style", "bold"),
                "motion": card.get("motion", "fade_up"),
                "position": card.get("position", "center"),
                "userModified": card.get("userModified", False),
                "userAdded": card.get("userAdded", False),
            })

        # Create the workflow plan using the WorkflowManager
        workflow_plan = self.workflow_manager.create_workflow_plan(
            profile=profile,
            clips=formatted_clips,
            text_cards=formatted_cards,
            effects_plan=self.effects_plan,
        )

        # Add references to other plans
        if audio_plan:
            workflow_plan["audioPlanId"] = audio_plan.get("_id")
        if self.overlay_plan:
            workflow_plan["overlayPlanId"] = self.overlay_plan.get("_id")
        if self.effects_plan:
            workflow_plan["effectsPlanId"] = self.effects_plan.get("_id")

        # Save to Convex
        profile_id = self.job_data.get("selectedProfileId") or profile.get("_id")
        if profile_id:
            try:
                plan_id = await self.convex.create_workflow_plan(
                    job_id=self.job_id,
                    profile_id=profile_id,
                    workflow_plan=workflow_plan,
                )
                workflow_plan["_id"] = plan_id
                print(f"[{self.job_id}] Workflow plan saved to Convex: {plan_id}")
            except Exception as e:
                print(f"[{self.job_id}] Warning: Could not save workflow plan: {e}")

        return workflow_plan

    async def _generate_and_upload_preview(
        self,
        clips: List[Dict[str, Any]],
        profile: Dict[str, Any],
    ) -> Optional[str]:
        """
        Generate and upload a preview version of the trailer.

        Args:
            clips: List of rendered clips with paths
            profile: Trailer profile settings

        Returns:
            R2 key for the preview, or None if failed
        """
        self._current_stage = "preview_generation"

        # Get the first clip as the source (the main rendered trailer)
        source_clip = None
        for clip in clips:
            if clip.get("path") and os.path.exists(clip.get("path", "")):
                source_clip = clip
                break

        if not source_clip:
            print(f"[{self.job_id}] No valid clips found for preview")
            return None

        source_path = source_clip["path"]

        # Determine preview quality based on profile
        profile_key = profile.get("key", "theatrical")
        if profile_key in ["social_vertical", "social_square"]:
            # Social profiles get standard quality preview
            quality = PreviewQuality.STANDARD
        else:
            # Theatrical profiles get high quality preview for client review
            quality = PreviewQuality.HIGH

        # Generate preview path
        preview_path = os.path.join(
            self.job_temp if hasattr(self, 'job_temp') else self.temp_dir,
            f"preview_{quality.value}.mp4"
        )

        try:
            # Generate preview with watermark
            await self.workflow_manager.generate_preview(
                source_path=source_path,
                output_path=preview_path,
                quality=quality,
                watermark_text="PREVIEW - NOT FINAL",
            )

            if not os.path.exists(preview_path):
                print(f"[{self.job_id}] Preview generation failed - no output file")
                return None

            # Upload to R2
            preview_r2_key = f"trailers/{self.job_id}/preview_{quality.value}.mp4"
            await self.r2.upload_file(preview_path, preview_r2_key)

            print(f"[{self.job_id}] Preview uploaded to R2: {preview_r2_key}")

            # Update workflow plan with preview info
            if self.workflow_plan and self.workflow_plan.get("_id"):
                try:
                    await self.convex.update_workflow_preview(
                        plan_id=self.workflow_plan["_id"],
                        preview_quality=quality.value,
                        preview_r2_key=preview_r2_key,
                    )
                except Exception as e:
                    print(f"[{self.job_id}] Warning: Could not update preview info: {e}")

            return preview_r2_key

        except Exception as e:
            print(f"[{self.job_id}] Preview generation failed: {e}")
            return None

        finally:
            # Cleanup preview file
            if os.path.exists(preview_path):
                try:
                    os.remove(preview_path)
                except Exception:
                    pass

    async def _export_final_output(
        self,
        clip_path: str,
        quality: ExportQuality,
        format: ExportFormat,
        custom_resolution: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Export final trailer with specified quality settings.

        Args:
            clip_path: Path to the rendered trailer
            quality: Export quality preset
            format: Output format
            custom_resolution: Optional resolution override

        Returns:
            Export metadata dict
        """
        self._current_stage = "final_export"

        # Generate output path
        output_filename = f"export_{quality.value}.{format.value}"
        output_path = os.path.join(
            self.job_temp if hasattr(self, 'job_temp') else self.temp_dir,
            output_filename
        )

        try:
            # Export using workflow manager
            export_result = await self.workflow_manager.export_final(
                source_path=clip_path,
                output_path=output_path,
                quality=quality,
                format=format,
                custom_resolution=custom_resolution,
            )

            # Upload to R2
            export_r2_key = f"trailers/{self.job_id}/exports/{output_filename}"
            await self.r2.upload_file(output_path, export_r2_key)

            # Add R2 key to result
            export_result["r2Key"] = export_r2_key
            export_result["createdAt"] = int(import_time_module().time() * 1000)

            print(f"[{self.job_id}] Export uploaded: {export_r2_key}")

            # Update workflow plan with export info
            if self.workflow_plan and self.workflow_plan.get("_id"):
                try:
                    await self.convex.add_workflow_export(
                        plan_id=self.workflow_plan["_id"],
                        export_data=export_result,
                    )
                except Exception as e:
                    print(f"[{self.job_id}] Warning: Could not add export to workflow: {e}")

            return export_result

        except Exception as e:
            print(f"[{self.job_id}] Export failed: {e}")
            raise

        finally:
            # Cleanup export file
            if os.path.exists(output_path):
                try:
                    os.remove(output_path)
                except Exception:
                    pass

    async def _enhance_selection_with_ai(
        self,
        scenes: List[Dict[str, Any]],
        transcript: Dict[str, Any],
        plan: Dict[str, Any],
        profile: Dict[str, Any],
    ) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """
        Apply Phase 9 AI selection enhancements to clip selection.

        Args:
            scenes: All detected scenes
            transcript: Full transcription
            plan: Generated timestamp plan with clips
            profile: Trailer profile settings

        Returns:
            Tuple of (enhanced plan, enhanced text cards)
        """
        self._current_stage = "ai_enhancement"

        clips = plan.get("clips", [])
        text_cards = plan.get("textCards", [])

        # Get configuration from job data
        audience_type = self.job_data.get("targetAudience")
        genre_override = self.job_data.get("genre")
        generate_variants = self.job_data.get("generateABVariants", False)

        # Convert scenes to dict format if needed
        scene_dicts = []
        for scene in scenes:
            if isinstance(scene, SceneInfo):
                scene_dicts.append({
                    "sceneIndex": scene.scene_index,
                    "startTime": scene.start_time,
                    "endTime": scene.end_time,
                    "duration": scene.duration,
                    "avgMotionIntensity": scene.avg_motion_intensity,
                    "avgAudioIntensity": scene.avg_audio_intensity,
                    "hasFaces": scene.has_faces,
                    "hasDialogue": scene.has_dialogue,
                    "dominantColors": scene.dominant_colors,
                    "mood": scene.mood,
                    "importanceScores": {},
                })
            else:
                scene_dicts.append(scene)

        # Merge scored scenes data
        if self.scored_scenes:
            for scored in self.scored_scenes:
                idx = scored.get("sceneIndex", -1)
                for scene in scene_dicts:
                    if scene.get("sceneIndex") == idx:
                        scene["importanceScores"] = scored.get("importanceScores", {})
                        break

        try:
            # Run AI enhancement
            enhanced_result = await self.ai_selection_enhancer.enhance_selection(
                scenes=scene_dicts,
                transcript=transcript,
                clips=clips,
                text_cards=text_cards,
                profile=profile,
                beat_analysis=self.beat_analysis,
                audience_type=audience_type,
                genre_override=genre_override,
                generate_variants=generate_variants,
            )

            # Get enhanced clips
            enhanced_clips = enhanced_result.get("enhanced_clips", clips)

            # Update plan with enhanced clips
            plan["clips"] = enhanced_clips
            plan["ai_enhanced"] = True
            plan["detected_genre"] = enhanced_result.get("detected_genre")
            plan["genre_confidence"] = enhanced_result.get("genre_confidence")

            # Create selection plan document for storage
            selection_plan = self.ai_selection_enhancer.create_selection_plan(enhanced_result)
            self.ai_selection_plan = selection_plan

            # Save to Convex
            profile_id = self.job_data.get("selectedProfileId") or profile.get("_id")
            if profile_id:
                try:
                    plan_id = await self.convex.create_ai_selection_plan(
                        job_id=self.job_id,
                        profile_id=profile_id,
                        selection_plan=selection_plan,
                    )
                    selection_plan["_id"] = plan_id
                    print(f"[{self.job_id}] AI selection plan saved: {plan_id}")

                    # Save A/B variants if generated
                    variants = enhanced_result.get("variants", [])
                    if variants and plan_id:
                        for variant in variants:
                            await self.convex.create_ab_variant(
                                job_id=self.job_id,
                                selection_plan_id=plan_id,
                                variant=variant,
                            )
                        print(f"[{self.job_id}] Created {len(variants)} A/B variants")

                except Exception as e:
                    print(f"[{self.job_id}] Warning: Could not save AI selection plan: {e}")

            # Log enhancement summary
            summary = enhanced_result.get("enhancement_summary", {})
            print(f"[{self.job_id}] AI Enhancement complete:")
            print(f"  - Genre: {enhanced_result.get('detected_genre')} ({enhanced_result.get('genre_confidence', 0):.2f} confidence)")
            print(f"  - Arc optimized: {summary.get('arcOptimized', False)}")
            print(f"  - Pacing optimized: {summary.get('pacingOptimized', False)}")
            print(f"  - Variants generated: {summary.get('variantsGenerated', 0)}")

            return plan, text_cards

        except Exception as e:
            print(f"[{self.job_id}] AI enhancement failed (continuing without): {e}")
            return plan, text_cards


def import_time_module():
    """Helper to import time module (avoids global import issues)."""
    import time
    return time
