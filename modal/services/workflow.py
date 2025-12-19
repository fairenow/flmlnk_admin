"""
Phase 8: Professional Workflow Features

This module provides workflow management capabilities for the trailer pipeline:
1. Preview Generation - Low-res previews for quick iterations
2. Manual Adjustments - User-controlled modifications to AI selections
3. Export Options - Multiple format/quality presets for final output

The goal is to give users control over the AI-generated trailer while
maintaining professional quality output options.
"""

import os
import subprocess
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Any, List, Optional


class PreviewQuality(Enum):
    """Preview quality presets for quick iterations."""
    DRAFT = "draft"       # 480p, low bitrate, fast encode
    STANDARD = "standard"  # 720p, medium bitrate
    HIGH = "high"          # 1080p, good bitrate (for client review)


class ExportQuality(Enum):
    """Export quality presets for final output."""
    WEB_OPTIMIZED = "web_optimized"      # Balanced size/quality for web
    SOCIAL_MEDIA = "social_media"        # Optimized for social platforms
    BROADCAST = "broadcast"              # Broadcast-compliant specs
    THEATRICAL = "theatrical"            # High quality for theater
    ARCHIVE = "archive"                  # Maximum quality for master


class ExportFormat(Enum):
    """Output container formats."""
    MP4 = "mp4"           # H.264/AAC - universal compatibility
    MOV = "mov"           # ProRes/PCM - professional editing
    WEBM = "webm"         # VP9/Opus - web optimized
    MKV = "mkv"           # Flexible container


@dataclass
class PreviewSpec:
    """Specification for preview rendering."""
    quality: PreviewQuality
    resolution: str      # e.g., "1280x720"
    bitrate: str         # e.g., "2M"
    preset: str          # ffmpeg preset
    crf: int             # Quality factor (lower = better)
    audio_bitrate: str   # e.g., "128k"

    @classmethod
    def from_quality(cls, quality: PreviewQuality) -> "PreviewSpec":
        """Create spec from quality preset."""
        specs = {
            PreviewQuality.DRAFT: cls(
                quality=quality,
                resolution="854x480",
                bitrate="1M",
                preset="ultrafast",
                crf=28,
                audio_bitrate="96k",
            ),
            PreviewQuality.STANDARD: cls(
                quality=quality,
                resolution="1280x720",
                bitrate="2.5M",
                preset="fast",
                crf=23,
                audio_bitrate="128k",
            ),
            PreviewQuality.HIGH: cls(
                quality=quality,
                resolution="1920x1080",
                bitrate="5M",
                preset="medium",
                crf=20,
                audio_bitrate="192k",
            ),
        }
        return specs[quality]


@dataclass
class ExportSpec:
    """Specification for final export rendering."""
    quality: ExportQuality
    format: ExportFormat
    video_codec: str
    audio_codec: str
    resolution: Optional[str]  # None = source resolution
    video_bitrate: Optional[str]
    crf: Optional[int]
    preset: str
    audio_bitrate: str
    audio_sample_rate: int
    pixel_format: str
    profile: Optional[str]   # H.264 profile
    level: Optional[str]     # H.264 level

    @classmethod
    def from_preset(
        cls,
        quality: ExportQuality,
        format: ExportFormat = ExportFormat.MP4,
    ) -> "ExportSpec":
        """Create spec from quality and format presets."""

        # Base specs per quality level
        base_specs = {
            ExportQuality.WEB_OPTIMIZED: {
                "video_codec": "libx264",
                "audio_codec": "aac",
                "resolution": "1920x1080",
                "video_bitrate": None,
                "crf": 20,
                "preset": "medium",
                "audio_bitrate": "192k",
                "audio_sample_rate": 48000,
                "pixel_format": "yuv420p",
                "profile": "high",
                "level": "4.1",
            },
            ExportQuality.SOCIAL_MEDIA: {
                "video_codec": "libx264",
                "audio_codec": "aac",
                "resolution": "1080x1920",  # Vertical by default
                "video_bitrate": None,
                "crf": 18,
                "preset": "slow",
                "audio_bitrate": "256k",
                "audio_sample_rate": 48000,
                "pixel_format": "yuv420p",
                "profile": "high",
                "level": "4.2",
            },
            ExportQuality.BROADCAST: {
                "video_codec": "libx264",
                "audio_codec": "pcm_s24le" if format == ExportFormat.MOV else "aac",
                "resolution": "1920x1080",
                "video_bitrate": "25M",
                "crf": None,
                "preset": "slow",
                "audio_bitrate": "320k",
                "audio_sample_rate": 48000,
                "pixel_format": "yuv422p",
                "profile": "high",
                "level": "4.2",
            },
            ExportQuality.THEATRICAL: {
                "video_codec": "libx264",
                "audio_codec": "pcm_s24le" if format == ExportFormat.MOV else "aac",
                "resolution": None,  # Source resolution
                "video_bitrate": "50M",
                "crf": None,
                "preset": "veryslow",
                "audio_bitrate": "320k",
                "audio_sample_rate": 48000,
                "pixel_format": "yuv422p10le",
                "profile": "high10",
                "level": "5.1",
            },
            ExportQuality.ARCHIVE: {
                "video_codec": "prores_ks" if format == ExportFormat.MOV else "libx265",
                "audio_codec": "pcm_s24le" if format == ExportFormat.MOV else "aac",
                "resolution": None,  # Source resolution
                "video_bitrate": None,
                "crf": 15 if format != ExportFormat.MOV else None,
                "preset": "slow",
                "audio_bitrate": "320k",
                "audio_sample_rate": 48000,
                "pixel_format": "yuv422p10le",
                "profile": "3" if format == ExportFormat.MOV else None,  # ProRes HQ
                "level": None,
            },
        }

        spec_dict = base_specs[quality]
        return cls(
            quality=quality,
            format=format,
            **spec_dict,
        )


@dataclass
class ClipAdjustment:
    """Manual adjustment to a clip in the timeline."""
    clip_index: int
    adjustment_type: str  # "trim", "move", "replace", "delete", "add"

    # For trim adjustments
    new_source_start: Optional[float] = None
    new_source_end: Optional[float] = None

    # For move adjustments
    new_target_start: Optional[float] = None

    # For replace adjustments
    new_scene_index: Optional[int] = None

    # For add adjustments (insert new clip)
    insert_at_index: Optional[int] = None
    scene_index: Optional[int] = None
    source_start: Optional[float] = None
    source_end: Optional[float] = None


@dataclass
class TextCardAdjustment:
    """Manual adjustment to a text card."""
    card_index: int
    adjustment_type: str  # "edit", "delete", "add", "move"

    # For edit adjustments
    new_text: Optional[str] = None
    new_style: Optional[str] = None
    new_motion: Optional[str] = None
    new_position: Optional[str] = None

    # For timing adjustments
    new_at_sec: Optional[float] = None
    new_duration_sec: Optional[float] = None


@dataclass
class EffectAdjustment:
    """Manual adjustment to effects (transitions, speed, flash)."""
    effect_type: str  # "transition", "speed", "flash"
    effect_index: int
    adjustment_type: str  # "edit", "delete", "add"

    # For transition edits
    new_transition_type: Optional[str] = None
    new_duration: Optional[float] = None

    # For speed effect edits
    new_speed_factor: Optional[float] = None

    # For flash frame edits
    new_flash_color: Optional[str] = None
    new_intensity: Optional[float] = None


@dataclass
class WorkflowAdjustments:
    """Collection of all manual adjustments for a trailer."""
    job_id: str

    # Clip adjustments
    clip_adjustments: List[ClipAdjustment] = field(default_factory=list)

    # Text card adjustments
    text_card_adjustments: List[TextCardAdjustment] = field(default_factory=list)

    # Effect adjustments
    effect_adjustments: List[EffectAdjustment] = field(default_factory=list)

    # Audio adjustments
    music_level_db_offset: Optional[float] = None
    dialogue_level_db_offset: Optional[float] = None
    sfx_level_db_offset: Optional[float] = None

    # Overlay adjustments
    disable_end_card: bool = False
    disable_rating: bool = False
    custom_logo_r2_key: Optional[str] = None

    # Version tracking
    revision: int = 1
    parent_revision: Optional[int] = None


class WorkflowManager:
    """
    Manages trailer production workflow including previews and adjustments.

    This class provides:
    1. Preview generation at various quality levels
    2. Application of manual adjustments to the AI-generated plan
    3. Final export with quality presets
    4. Revision tracking for iterative refinement
    """

    def __init__(self, job_id: str, temp_dir: str):
        self.job_id = job_id
        self.temp_dir = temp_dir
        self.job_temp = os.path.join(temp_dir, job_id)
        os.makedirs(self.job_temp, exist_ok=True)

        # Current adjustments (loaded or new)
        self.adjustments: Optional[WorkflowAdjustments] = None

    async def generate_preview(
        self,
        source_path: str,
        output_path: str,
        quality: PreviewQuality = PreviewQuality.STANDARD,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        watermark_text: Optional[str] = None,
    ) -> str:
        """
        Generate a preview render for quick iteration.

        Args:
            source_path: Path to the rendered trailer (post-effects)
            output_path: Where to save the preview
            quality: Preview quality preset
            start_time: Optional start time for partial preview
            end_time: Optional end time for partial preview
            watermark_text: Optional watermark (e.g., "PREVIEW - NOT FINAL")

        Returns:
            Path to the generated preview file
        """
        spec = PreviewSpec.from_quality(quality)

        # Build ffmpeg command
        cmd = ["ffmpeg", "-y"]

        # Input with optional seeking
        if start_time is not None:
            cmd.extend(["-ss", str(start_time)])
        cmd.extend(["-i", source_path])
        if end_time is not None:
            duration = end_time - (start_time or 0)
            cmd.extend(["-t", str(duration)])

        # Build video filter chain
        vf_filters = []

        # Scale to target resolution
        width, height = spec.resolution.split("x")
        vf_filters.append(f"scale={width}:{height}:force_original_aspect_ratio=decrease")
        vf_filters.append(f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black")

        # Add watermark if requested
        if watermark_text:
            # Escape special characters
            escaped_text = watermark_text.replace("'", "'\\''").replace(":", "\\:")
            vf_filters.append(
                f"drawtext=text='{escaped_text}':"
                f"fontsize=24:fontcolor=white@0.5:"
                f"x=(w-text_w)/2:y=h-th-20:"
                f"shadowcolor=black@0.5:shadowx=1:shadowy=1"
            )

        # Apply video filters
        if vf_filters:
            cmd.extend(["-vf", ",".join(vf_filters)])

        # Video encoding settings
        cmd.extend([
            "-c:v", "libx264",
            "-preset", spec.preset,
            "-crf", str(spec.crf),
            "-maxrate", spec.bitrate,
            "-bufsize", f"{int(spec.bitrate.replace('M', '')) * 2}M",
            "-pix_fmt", "yuv420p",
        ])

        # Audio encoding settings
        cmd.extend([
            "-c:a", "aac",
            "-b:a", spec.audio_bitrate,
            "-ar", "48000",
        ])

        # Output
        cmd.append(output_path)

        print(f"[{self.job_id}] Generating {quality.value} preview...")
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise RuntimeError(f"Preview generation failed: {result.stderr}")

        return output_path

    async def generate_timeline_preview(
        self,
        clips: List[Dict[str, Any]],
        source_path: str,
        output_path: str,
        quality: PreviewQuality = PreviewQuality.DRAFT,
    ) -> str:
        """
        Generate a quick preview of the clip sequence without full effects.

        This is useful for reviewing the basic cut before applying
        expensive effects like transitions, speed ramps, etc.

        Args:
            clips: List of clip objects with sourceStart/sourceEnd
            source_path: Path to source video
            output_path: Where to save preview
            quality: Preview quality preset

        Returns:
            Path to timeline preview
        """
        spec = PreviewSpec.from_quality(quality)

        # Build concat file
        concat_list_path = os.path.join(self.job_temp, "preview_concat.txt")
        clip_paths = []

        for i, clip in enumerate(clips):
            clip_output = os.path.join(self.job_temp, f"preview_clip_{i}.mp4")
            clip_paths.append(clip_output)

            source_start = clip.get("sourceStart", 0)
            source_end = clip.get("sourceEnd", source_start + 5)
            duration = source_end - source_start

            # Extract and encode clip
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(source_start),
                "-i", source_path,
                "-t", str(duration),
                "-c:v", "libx264",
                "-preset", spec.preset,
                "-crf", str(spec.crf + 3),  # Slightly lower quality for speed
                "-vf", f"scale={spec.resolution.split('x')[0]}:-2",
                "-c:a", "aac",
                "-b:a", spec.audio_bitrate,
                clip_output,
            ]
            subprocess.run(cmd, check=True, capture_output=True)

        # Write concat list
        with open(concat_list_path, "w") as f:
            for path in clip_paths:
                f.write(f"file '{path}'\n")

        # Concatenate clips
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_list_path,
            "-c", "copy",
            output_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)

        # Cleanup intermediate files
        for path in clip_paths:
            if os.path.exists(path):
                os.remove(path)
        if os.path.exists(concat_list_path):
            os.remove(concat_list_path)

        return output_path

    async def export_final(
        self,
        source_path: str,
        output_path: str,
        quality: ExportQuality = ExportQuality.WEB_OPTIMIZED,
        format: ExportFormat = ExportFormat.MP4,
        custom_resolution: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Export final trailer with professional quality settings.

        Args:
            source_path: Path to the fully rendered trailer
            output_path: Where to save the final export
            quality: Export quality preset
            format: Output format
            custom_resolution: Override resolution (e.g., "3840x2160" for 4K)

        Returns:
            Dict with export metadata (duration, filesize, specs)
        """
        spec = ExportSpec.from_preset(quality, format)

        # Build ffmpeg command
        cmd = ["ffmpeg", "-y", "-i", source_path]

        # Video filters
        vf_filters = []

        # Resolution handling
        target_res = custom_resolution or spec.resolution
        if target_res:
            width, height = target_res.split("x")
            vf_filters.append(
                f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black"
            )

        if vf_filters:
            cmd.extend(["-vf", ",".join(vf_filters)])

        # Video codec settings
        cmd.extend(["-c:v", spec.video_codec])

        if spec.video_codec == "libx264" or spec.video_codec == "libx265":
            cmd.extend(["-preset", spec.preset])

            if spec.crf is not None:
                cmd.extend(["-crf", str(spec.crf)])
            elif spec.video_bitrate:
                cmd.extend([
                    "-b:v", spec.video_bitrate,
                    "-maxrate", spec.video_bitrate,
                    "-bufsize", f"{int(spec.video_bitrate.replace('M', '')) * 2}M",
                ])

            if spec.profile:
                cmd.extend(["-profile:v", spec.profile])
            if spec.level:
                cmd.extend(["-level", spec.level])

        elif spec.video_codec == "prores_ks":
            # ProRes profile (0=proxy, 1=LT, 2=standard, 3=HQ, 4=4444)
            cmd.extend(["-profile:v", spec.profile or "3"])

        # Pixel format
        cmd.extend(["-pix_fmt", spec.pixel_format])

        # Audio codec settings
        cmd.extend(["-c:a", spec.audio_codec])

        if spec.audio_codec == "aac":
            cmd.extend(["-b:a", spec.audio_bitrate])

        cmd.extend(["-ar", str(spec.audio_sample_rate)])

        # Format-specific settings
        if format == ExportFormat.MP4:
            cmd.extend(["-movflags", "+faststart"])

        # Output
        cmd.append(output_path)

        print(f"[{self.job_id}] Exporting {quality.value} {format.value}...")
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise RuntimeError(f"Export failed: {result.stderr}")

        # Get file metadata
        file_size = os.path.getsize(output_path)
        duration = self._get_duration(output_path)

        return {
            "path": output_path,
            "quality": quality.value,
            "format": format.value,
            "resolution": target_res or "source",
            "file_size": file_size,
            "file_size_mb": round(file_size / (1024 * 1024), 2),
            "duration": duration,
            "video_codec": spec.video_codec,
            "audio_codec": spec.audio_codec,
        }

    def _get_duration(self, video_path: str) -> float:
        """Get video duration using ffprobe."""
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
        return 0.0

    def apply_clip_adjustments(
        self,
        clips: List[Dict[str, Any]],
        adjustments: List[ClipAdjustment],
    ) -> List[Dict[str, Any]]:
        """
        Apply manual clip adjustments to the AI-generated clip list.

        Args:
            clips: Original AI-generated clips
            adjustments: List of adjustments to apply

        Returns:
            Modified clip list
        """
        # Make a copy to avoid modifying original
        result = [clip.copy() for clip in clips]

        # Sort adjustments to handle deletes and adds correctly
        # Process deletes in reverse order, adds after
        deletes = [a for a in adjustments if a.adjustment_type == "delete"]
        deletes.sort(key=lambda a: a.clip_index, reverse=True)

        adds = [a for a in adjustments if a.adjustment_type == "add"]
        edits = [a for a in adjustments if a.adjustment_type in ["trim", "move", "replace"]]

        # Apply edits first
        for adj in edits:
            if adj.clip_index >= len(result):
                continue

            clip = result[adj.clip_index]

            if adj.adjustment_type == "trim":
                if adj.new_source_start is not None:
                    clip["sourceStart"] = adj.new_source_start
                if adj.new_source_end is not None:
                    clip["sourceEnd"] = adj.new_source_end

            elif adj.adjustment_type == "move":
                if adj.new_target_start is not None:
                    clip["targetStart"] = adj.new_target_start
                    # Recalculate targetEnd based on duration
                    duration = clip.get("sourceEnd", 0) - clip.get("sourceStart", 0)
                    clip["targetEnd"] = adj.new_target_start + duration

            elif adj.adjustment_type == "replace":
                if adj.new_scene_index is not None:
                    clip["sceneIndex"] = adj.new_scene_index
                    clip["userModified"] = True

        # Apply deletes (reverse order to maintain indices)
        for adj in deletes:
            if adj.clip_index < len(result):
                del result[adj.clip_index]

        # Apply adds
        for adj in adds:
            if adj.scene_index is not None:
                new_clip = {
                    "sceneIndex": adj.scene_index,
                    "sourceStart": adj.source_start or 0,
                    "sourceEnd": adj.source_end or 5,
                    "userAdded": True,
                }
                insert_idx = adj.insert_at_index or len(result)
                result.insert(insert_idx, new_clip)

        # Recalculate target timestamps
        result = self._recalculate_timeline(result)

        return result

    def apply_text_card_adjustments(
        self,
        cards: List[Dict[str, Any]],
        adjustments: List[TextCardAdjustment],
    ) -> List[Dict[str, Any]]:
        """
        Apply manual text card adjustments.

        Args:
            cards: Original AI-generated text cards
            adjustments: List of adjustments to apply

        Returns:
            Modified text card list
        """
        result = [card.copy() for card in cards]

        # Separate by type
        deletes = [a for a in adjustments if a.adjustment_type == "delete"]
        deletes.sort(key=lambda a: a.card_index, reverse=True)

        adds = [a for a in adjustments if a.adjustment_type == "add"]
        edits = [a for a in adjustments if a.adjustment_type in ["edit", "move"]]

        # Apply edits
        for adj in edits:
            if adj.card_index >= len(result):
                continue

            card = result[adj.card_index]

            if adj.new_text is not None:
                card["text"] = adj.new_text
            if adj.new_style is not None:
                card["style"] = adj.new_style
            if adj.new_motion is not None:
                card["motion"] = adj.new_motion
            if adj.new_position is not None:
                card["position"] = adj.new_position
            if adj.new_at_sec is not None:
                card["atSec"] = adj.new_at_sec
            if adj.new_duration_sec is not None:
                card["durationSec"] = adj.new_duration_sec

            card["userModified"] = True

        # Apply deletes
        for adj in deletes:
            if adj.card_index < len(result):
                del result[adj.card_index]

        # Apply adds (from TextCardAdjustment)
        for adj in adds:
            new_card = {
                "cardIndex": len(result),
                "atSec": adj.new_at_sec or 0,
                "durationSec": adj.new_duration_sec or 2.0,
                "text": adj.new_text or "",
                "style": adj.new_style or "bold",
                "motion": adj.new_motion or "fade_up",
                "position": adj.new_position or "center",
                "userAdded": True,
            }
            result.append(new_card)

        # Sort by timestamp and re-index
        result.sort(key=lambda c: c.get("atSec", 0))
        for i, card in enumerate(result):
            card["cardIndex"] = i

        return result

    def _recalculate_timeline(
        self,
        clips: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Recalculate target timestamps to ensure continuous timeline."""
        current_time = 0.0

        for clip in clips:
            duration = clip.get("sourceEnd", 0) - clip.get("sourceStart", 0)
            clip["targetStart"] = current_time
            clip["targetEnd"] = current_time + duration
            current_time += duration

        return clips

    def load_adjustments(self, adjustments_dict: Dict[str, Any]) -> WorkflowAdjustments:
        """Load adjustments from Convex-stored dict."""
        self.adjustments = WorkflowAdjustments(
            job_id=adjustments_dict.get("jobId", self.job_id),
            revision=adjustments_dict.get("revision", 1),
            parent_revision=adjustments_dict.get("parentRevision"),
            clip_adjustments=[
                ClipAdjustment(**adj) for adj in adjustments_dict.get("clipAdjustments", [])
            ],
            text_card_adjustments=[
                TextCardAdjustment(**adj) for adj in adjustments_dict.get("textCardAdjustments", [])
            ],
            effect_adjustments=[
                EffectAdjustment(**adj) for adj in adjustments_dict.get("effectAdjustments", [])
            ],
            music_level_db_offset=adjustments_dict.get("musicLevelDbOffset"),
            dialogue_level_db_offset=adjustments_dict.get("dialogueLevelDbOffset"),
            sfx_level_db_offset=adjustments_dict.get("sfxLevelDbOffset"),
            disable_end_card=adjustments_dict.get("disableEndCard", False),
            disable_rating=adjustments_dict.get("disableRating", False),
            custom_logo_r2_key=adjustments_dict.get("customLogoR2Key"),
        )
        return self.adjustments

    def to_adjustment_dict(self, adjustments: WorkflowAdjustments) -> Dict[str, Any]:
        """Convert adjustments to dict for Convex storage."""
        return {
            "jobId": adjustments.job_id,
            "revision": adjustments.revision,
            "parentRevision": adjustments.parent_revision,
            "clipAdjustments": [
                {
                    "clipIndex": adj.clip_index,
                    "adjustmentType": adj.adjustment_type,
                    "newSourceStart": adj.new_source_start,
                    "newSourceEnd": adj.new_source_end,
                    "newTargetStart": adj.new_target_start,
                    "newSceneIndex": adj.new_scene_index,
                    "insertAtIndex": adj.insert_at_index,
                    "sceneIndex": adj.scene_index,
                    "sourceStart": adj.source_start,
                    "sourceEnd": adj.source_end,
                }
                for adj in adjustments.clip_adjustments
            ],
            "textCardAdjustments": [
                {
                    "cardIndex": adj.card_index,
                    "adjustmentType": adj.adjustment_type,
                    "newText": adj.new_text,
                    "newStyle": adj.new_style,
                    "newMotion": adj.new_motion,
                    "newPosition": adj.new_position,
                    "newAtSec": adj.new_at_sec,
                    "newDurationSec": adj.new_duration_sec,
                }
                for adj in adjustments.text_card_adjustments
            ],
            "effectAdjustments": [
                {
                    "effectType": adj.effect_type,
                    "effectIndex": adj.effect_index,
                    "adjustmentType": adj.adjustment_type,
                    "newTransitionType": adj.new_transition_type,
                    "newDuration": adj.new_duration,
                    "newSpeedFactor": adj.new_speed_factor,
                    "newFlashColor": adj.new_flash_color,
                    "newIntensity": adj.new_intensity,
                }
                for adj in adjustments.effect_adjustments
            ],
            "musicLevelDbOffset": adjustments.music_level_db_offset,
            "dialogueLevelDbOffset": adjustments.dialogue_level_db_offset,
            "sfxLevelDbOffset": adjustments.sfx_level_db_offset,
            "disableEndCard": adjustments.disable_end_card,
            "disableRating": adjustments.disable_rating,
            "customLogoR2Key": adjustments.custom_logo_r2_key,
        }

    def create_workflow_plan(
        self,
        profile: Dict[str, Any],
        clips: List[Dict[str, Any]],
        text_cards: List[Dict[str, Any]],
        effects_plan: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create a workflow plan that can be stored and modified.

        This creates a comprehensive plan document that captures the current
        state of the trailer edit, suitable for preview, manual adjustments,
        and final export.

        Args:
            profile: Trailer profile settings
            clips: Current clip selections
            text_cards: Current text cards
            effects_plan: Current effects plan (transitions, speed, flash)

        Returns:
            Workflow plan dict for storage
        """
        return {
            "profileKey": profile.get("key", "theatrical"),
            "profileId": profile.get("_id"),

            # Timeline data
            "clips": clips,
            "textCards": text_cards,
            "totalClips": len(clips),
            "totalTextCards": len(text_cards),

            # Effects (reference to effects plan)
            "effectsPlanId": effects_plan.get("_id") if effects_plan else None,
            "hasTransitions": len(effects_plan.get("transitions", [])) > 0 if effects_plan else False,
            "hasSpeedEffects": len(effects_plan.get("speedEffects", [])) > 0 if effects_plan else False,
            "hasFlashFrames": len(effects_plan.get("flashFrames", [])) > 0 if effects_plan else False,

            # Duration calculation
            "calculatedDuration": self._calculate_total_duration(clips),
            "targetDuration": profile.get("durationTargetSec", 120),

            # Export presets available for this profile
            "recommendedExports": self._get_recommended_exports(profile),

            # Preview specs
            "previewSpecs": {
                "draft": PreviewSpec.from_quality(PreviewQuality.DRAFT).__dict__,
                "standard": PreviewSpec.from_quality(PreviewQuality.STANDARD).__dict__,
                "high": PreviewSpec.from_quality(PreviewQuality.HIGH).__dict__,
            },

            # Workflow state
            "revision": 1,
            "adjustments": None,  # Will be set when user makes changes
            "previewGenerated": False,
            "finalExported": False,
        }

    def _calculate_total_duration(self, clips: List[Dict[str, Any]]) -> float:
        """Calculate total duration from clips."""
        if not clips:
            return 0.0

        total = 0.0
        for clip in clips:
            duration = clip.get("sourceEnd", 0) - clip.get("sourceStart", 0)
            total += duration
        return total

    def _get_recommended_exports(self, profile: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Get recommended export presets based on profile."""
        profile_key = profile.get("key", "theatrical")

        recommendations = []

        if profile_key in ["theatrical", "teaser", "festival"]:
            recommendations.extend([
                {
                    "quality": ExportQuality.THEATRICAL.value,
                    "format": ExportFormat.MOV.value,
                    "label": "Theatrical Master",
                    "description": "High-quality master for theatrical projection",
                },
                {
                    "quality": ExportQuality.WEB_OPTIMIZED.value,
                    "format": ExportFormat.MP4.value,
                    "label": "Web Distribution",
                    "description": "Optimized for YouTube, Vimeo, website embedding",
                },
                {
                    "quality": ExportQuality.BROADCAST.value,
                    "format": ExportFormat.MOV.value,
                    "label": "Broadcast Ready",
                    "description": "Compliant with broadcast standards",
                },
            ])

        elif profile_key in ["social_vertical", "social_square"]:
            recommendations.extend([
                {
                    "quality": ExportQuality.SOCIAL_MEDIA.value,
                    "format": ExportFormat.MP4.value,
                    "label": "Social Media",
                    "description": "Optimized for Instagram, TikTok, YouTube Shorts",
                },
                {
                    "quality": ExportQuality.WEB_OPTIMIZED.value,
                    "format": ExportFormat.MP4.value,
                    "label": "Web Embed",
                    "description": "For website and ads",
                },
            ])

        else:
            # Default recommendations
            recommendations.extend([
                {
                    "quality": ExportQuality.WEB_OPTIMIZED.value,
                    "format": ExportFormat.MP4.value,
                    "label": "Standard",
                    "description": "Balanced quality and file size",
                },
                {
                    "quality": ExportQuality.ARCHIVE.value,
                    "format": ExportFormat.MOV.value,
                    "label": "Archive Master",
                    "description": "Maximum quality for archival",
                },
            ])

        return recommendations


# Export functions for integration with trailer processor
def get_preview_spec(quality: str) -> Dict[str, Any]:
    """Get preview specification by quality name."""
    try:
        q = PreviewQuality(quality)
        spec = PreviewSpec.from_quality(q)
        return {
            "quality": spec.quality.value,
            "resolution": spec.resolution,
            "bitrate": spec.bitrate,
            "preset": spec.preset,
            "crf": spec.crf,
            "audioBitrate": spec.audio_bitrate,
        }
    except ValueError:
        # Default to standard
        spec = PreviewSpec.from_quality(PreviewQuality.STANDARD)
        return {
            "quality": spec.quality.value,
            "resolution": spec.resolution,
            "bitrate": spec.bitrate,
            "preset": spec.preset,
            "crf": spec.crf,
            "audioBitrate": spec.audio_bitrate,
        }


def get_export_spec(quality: str, format: str = "mp4") -> Dict[str, Any]:
    """Get export specification by quality and format names."""
    try:
        q = ExportQuality(quality)
        f = ExportFormat(format)
        spec = ExportSpec.from_preset(q, f)
        return {
            "quality": spec.quality.value,
            "format": spec.format.value,
            "videoCodec": spec.video_codec,
            "audioCodec": spec.audio_codec,
            "resolution": spec.resolution,
            "videoBitrate": spec.video_bitrate,
            "crf": spec.crf,
            "preset": spec.preset,
            "audioBitrate": spec.audio_bitrate,
            "audioSampleRate": spec.audio_sample_rate,
            "pixelFormat": spec.pixel_format,
            "profile": spec.profile,
            "level": spec.level,
        }
    except ValueError:
        # Default to web optimized MP4
        spec = ExportSpec.from_preset(ExportQuality.WEB_OPTIMIZED, ExportFormat.MP4)
        return {
            "quality": spec.quality.value,
            "format": spec.format.value,
            "videoCodec": spec.video_codec,
            "audioCodec": spec.audio_codec,
            "resolution": spec.resolution,
            "videoBitrate": spec.video_bitrate,
            "crf": spec.crf,
            "preset": spec.preset,
            "audioBitrate": spec.audio_bitrate,
            "audioSampleRate": spec.audio_sample_rate,
            "pixelFormat": spec.pixel_format,
            "profile": spec.profile,
            "level": spec.level,
        }


class VersionGenerator:
    """
    Generate multiple trailer versions from a master edit.

    Creates shortened versions (TV spots, bumpers) and format variants
    (social, broadcast) from the full trailer.
    """

    VERSION_SPECS = {
        "full": {
            "max_duration": None,  # Full length
            "aspect_ratios": ["16:9"],
            "description": "Full-length theatrical trailer",
        },
        "tv_30": {
            "max_duration": 30,
            "aspect_ratios": ["16:9"],
            "must_include": ["opener", "climax", "closer"],
            "pacing": "aggressive",
            "description": "30-second TV spot",
        },
        "tv_15": {
            "max_duration": 15,
            "aspect_ratios": ["16:9"],
            "must_include": ["hook", "closer"],
            "pacing": "very_aggressive",
            "description": "15-second TV spot",
        },
        "social_60": {
            "max_duration": 60,
            "aspect_ratios": ["9:16", "1:1"],
            "auto_captions": True,
            "pacing": "moderate",
            "description": "60-second social media clip",
        },
        "social_30": {
            "max_duration": 30,
            "aspect_ratios": ["9:16", "1:1"],
            "auto_captions": True,
            "pacing": "aggressive",
            "description": "30-second social media clip",
        },
        "bumper_6": {
            "max_duration": 6,
            "aspect_ratios": ["16:9", "1:1"],
            "must_include": ["hook"],
            "pacing": "extreme",
            "description": "6-second YouTube bumper ad",
        },
        "instagram_story": {
            "max_duration": 15,
            "aspect_ratios": ["9:16"],
            "auto_captions": True,
            "pacing": "aggressive",
            "description": "15-second Instagram story",
        },
    }

    def __init__(self, job_id: str = ""):
        self.job_id = job_id
        self._openai_client = None

    def _get_openai_client(self):
        """Lazy initialization of OpenAI client."""
        if self._openai_client is None:
            import openai
            self._openai_client = openai.AsyncOpenAI()
        return self._openai_client

    def get_version_specs(self) -> Dict[str, Dict[str, Any]]:
        """Get all available version specifications."""
        return self.VERSION_SPECS.copy()

    async def generate_version(
        self,
        master_plan: Dict[str, Any],
        version_type: str,
        output_path: str,
        source_video_path: str,
    ) -> Dict[str, Any]:
        """
        Generate a specific version from the master plan.

        Args:
            master_plan: Full trailer plan with clips, text cards
            version_type: Version type from VERSION_SPECS
            output_path: Where to save the generated version
            source_video_path: Path to the source video

        Returns:
            Dict with version metadata
        """
        spec = self.VERSION_SPECS.get(version_type)
        if not spec:
            raise ValueError(f"Unknown version type: {version_type}")

        # Get clips and select best for duration
        master_clips = master_plan.get("clips", [])
        target_duration = spec.get("max_duration")

        if target_duration is None:
            # Full version - use all clips
            selected_clips = master_clips
        else:
            # Select best clips for target duration
            selected_clips = await self._select_clips_for_duration(
                master_clips,
                target_duration,
                spec.get("must_include", []),
                spec.get("pacing", "normal"),
            )

        # Calculate actual duration
        actual_duration = sum(
            c.get("sourceEnd", 0) - c.get("sourceStart", 0)
            for c in selected_clips
        )

        # Determine which clips were excluded
        selected_indices = {c.get("sceneIndex") for c in selected_clips}
        excluded_indices = [
            c.get("sceneIndex")
            for c in master_clips
            if c.get("sceneIndex") not in selected_indices
        ]

        return {
            "versionType": version_type,
            "targetDuration": target_duration,
            "actualDuration": actual_duration,
            "selectedClips": selected_clips,
            "excludedClipIndices": excluded_indices,
            "aspectRatios": spec.get("aspect_ratios", ["16:9"]),
            "description": spec.get("description", ""),
            "outputPath": output_path,
        }

    async def _select_clips_for_duration(
        self,
        clips: List[Dict[str, Any]],
        target_duration: float,
        must_include: List[str],
        pacing: str,
    ) -> List[Dict[str, Any]]:
        """
        AI-powered clip selection for shortened version.

        Args:
            clips: All available clips
            target_duration: Target duration in seconds
            must_include: Required moments (opener, climax, etc.)
            pacing: Pacing style

        Returns:
            Selected clips for the shortened version
        """
        if not clips:
            return []

        # Calculate current total duration
        total_duration = sum(
            c.get("sourceEnd", 0) - c.get("sourceStart", 0)
            for c in clips
        )

        if total_duration <= target_duration:
            return clips  # Already short enough

        client = self._get_openai_client()

        # Prepare clip info for AI
        clip_info = []
        for i, clip in enumerate(clips):
            clip_info.append({
                "index": i,
                "sceneIndex": clip.get("sceneIndex"),
                "duration": clip.get("sourceEnd", 0) - clip.get("sourceStart", 0),
                "hasDialogue": clip.get("hasDialogue", False),
                "motionIntensity": clip.get("avgMotionIntensity", 0.5),
                "importance": clip.get("importanceScores", {}).get("combined", 0.5),
            })

        prompt = f"""You are a trailer editor selecting clips for a shortened version.

TARGET DURATION: {target_duration} seconds
CURRENT TOTAL: {total_duration} seconds
PACING: {pacing}
MUST INCLUDE: {must_include}

AVAILABLE CLIPS:
{json.dumps(clip_info, indent=2)}

Select the best clips to fit within {target_duration} seconds while:
1. Including required moments (opener = high-impact opening, climax = peak intensity, closer = ending beat)
2. Maintaining narrative flow
3. Prioritizing high-importance clips
4. Following the {pacing} pacing (aggressive = shorter clips, normal = balanced)

Return JSON:
{{
  "selectedIndices": [0, 2, 5, ...],
  "reasoning": "Brief explanation"
}}"""

        try:
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.3,
            )

            result = json.loads(response.choices[0].message.content)
            selected_indices = result.get("selectedIndices", [])

            # Return selected clips in order
            return [clips[i] for i in selected_indices if i < len(clips)]

        except Exception as e:
            print(f"[{self.job_id}] AI selection failed, using fallback: {e}")
            # Fallback: select clips by importance until duration is met
            sorted_clips = sorted(
                enumerate(clips),
                key=lambda x: x[1].get("importanceScores", {}).get("combined", 0),
                reverse=True,
            )

            selected = []
            current_duration = 0

            for i, clip in sorted_clips:
                clip_duration = clip.get("sourceEnd", 0) - clip.get("sourceStart", 0)
                if current_duration + clip_duration <= target_duration:
                    selected.append(clip)
                    current_duration += clip_duration

            # Sort by original order
            return sorted(selected, key=lambda c: clips.index(c))

    def get_recommended_versions(
        self,
        profile_key: str,
    ) -> List[Dict[str, Any]]:
        """
        Get recommended versions based on trailer profile.

        Args:
            profile_key: Trailer profile (theatrical, social, etc.)

        Returns:
            List of recommended version specs
        """
        recommendations = []

        if profile_key in ["theatrical", "teaser", "festival"]:
            recommendations.extend([
                {"type": "full", **self.VERSION_SPECS["full"]},
                {"type": "tv_30", **self.VERSION_SPECS["tv_30"]},
                {"type": "tv_15", **self.VERSION_SPECS["tv_15"]},
                {"type": "bumper_6", **self.VERSION_SPECS["bumper_6"]},
            ])

        elif profile_key in ["social_vertical", "social_square"]:
            recommendations.extend([
                {"type": "social_60", **self.VERSION_SPECS["social_60"]},
                {"type": "social_30", **self.VERSION_SPECS["social_30"]},
                {"type": "instagram_story", **self.VERSION_SPECS["instagram_story"]},
                {"type": "bumper_6", **self.VERSION_SPECS["bumper_6"]},
            ])

        else:
            # Default recommendations
            recommendations.extend([
                {"type": "full", **self.VERSION_SPECS["full"]},
                {"type": "social_60", **self.VERSION_SPECS["social_60"]},
                {"type": "tv_30", **self.VERSION_SPECS["tv_30"]},
            ])

        return recommendations


class ExportPresets:
    """
    Platform-optimized export settings for final delivery.

    Provides encoding presets for various platforms (YouTube, Instagram,
    TikTok, broadcast, theatrical) with appropriate codecs and settings.
    """

    PRESETS = {
        "youtube": {
            "container": "mp4",
            "video_codec": "libx264",
            "video_profile": "high",
            "video_level": "4.1",
            "crf": 18,
            "max_bitrate": 50000,  # 50 Mbps for 4K
            "audio_codec": "aac",
            "audio_bitrate": 384,
            "audio_sample_rate": 48000,
            "color_space": "bt709",
            "resolution_options": ["4k", "1080p", "720p"],
            "description": "YouTube upload (all resolutions)",
        },
        "youtube_shorts": {
            "container": "mp4",
            "video_codec": "libx264",
            "video_profile": "high",
            "crf": 18,
            "max_bitrate": 8000,
            "audio_codec": "aac",
            "audio_bitrate": 192,
            "audio_sample_rate": 48000,
            "aspect_ratio": "9:16",
            "resolution": "1080x1920",
            "max_duration": 60,
            "description": "YouTube Shorts (vertical, 60s max)",
        },
        "instagram_feed": {
            "container": "mp4",
            "video_codec": "libx264",
            "video_profile": "main",
            "crf": 20,
            "max_bitrate": 3500,
            "max_duration": 60,
            "audio_codec": "aac",
            "audio_bitrate": 128,
            "audio_sample_rate": 44100,
            "aspect_ratios": ["1:1", "4:5"],
            "resolution_options": ["1080p"],
            "description": "Instagram feed post (square or 4:5)",
        },
        "instagram_reels": {
            "container": "mp4",
            "video_codec": "libx264",
            "crf": 20,
            "max_bitrate": 3500,
            "max_duration": 90,
            "audio_codec": "aac",
            "audio_bitrate": 128,
            "audio_sample_rate": 44100,
            "aspect_ratio": "9:16",
            "resolution": "1080x1920",
            "description": "Instagram Reels (vertical, 90s max)",
        },
        "tiktok": {
            "container": "mp4",
            "video_codec": "libx264",
            "crf": 20,
            "max_bitrate": 4000,
            "max_duration": 180,
            "audio_codec": "aac",
            "audio_bitrate": 128,
            "audio_sample_rate": 44100,
            "aspect_ratio": "9:16",
            "resolution": "1080x1920",
            "description": "TikTok (vertical, 3 min max)",
        },
        "twitter": {
            "container": "mp4",
            "video_codec": "libx264",
            "crf": 21,
            "max_bitrate": 25000,
            "max_duration": 140,
            "audio_codec": "aac",
            "audio_bitrate": 128,
            "audio_sample_rate": 44100,
            "max_file_size_mb": 512,
            "description": "Twitter/X video (2:20 max)",
        },
        "facebook": {
            "container": "mp4",
            "video_codec": "libx264",
            "video_profile": "high",
            "crf": 20,
            "max_bitrate": 8000,
            "audio_codec": "aac",
            "audio_bitrate": 192,
            "audio_sample_rate": 48000,
            "resolution_options": ["1080p", "720p"],
            "description": "Facebook video",
        },
        "linkedin": {
            "container": "mp4",
            "video_codec": "libx264",
            "crf": 20,
            "max_bitrate": 6000,
            "max_duration": 600,
            "audio_codec": "aac",
            "audio_bitrate": 192,
            "audio_sample_rate": 48000,
            "aspect_ratios": ["16:9", "1:1"],
            "resolution_options": ["1080p"],
            "max_file_size_mb": 200,
            "description": "LinkedIn video (10 min max)",
        },
        "broadcast_hd": {
            "container": "mxf",
            "video_codec": "dnxhd",
            "video_profile": "dnxhr_hq",
            "audio_codec": "pcm_s24le",
            "audio_sample_rate": 48000,
            "audio_channels": 8,  # 5.1 + stereo mix
            "color_space": "bt709",
            "resolution": "1920x1080",
            "frame_rate": "23.976",
            "lufs": -24,
            "description": "HD broadcast master",
        },
        "broadcast_4k": {
            "container": "mxf",
            "video_codec": "dnxhd",
            "video_profile": "dnxhr_uhd",
            "audio_codec": "pcm_s24le",
            "audio_sample_rate": 48000,
            "resolution": "3840x2160",
            "frame_rate": "23.976",
            "lufs": -24,
            "description": "4K broadcast master",
        },
        "dcp": {
            "container": "mxf",
            "video_codec": "jpeg2000",
            "video_bitrate": 250000,  # 250 Mbps
            "color_space": "xyz",
            "resolution": "4096x1716",  # Scope 2.39:1
            "audio_codec": "pcm_s24le",
            "audio_sample_rate": 48000,
            "audio_channels": 6,
            "frame_rate": "24",
            "lufs": -20,
            "description": "Digital Cinema Package (DCP)",
        },
        "prores_master": {
            "container": "mov",
            "video_codec": "prores_ks",
            "video_profile": "3",  # ProRes 422 HQ
            "audio_codec": "pcm_s24le",
            "audio_sample_rate": 48000,
            "description": "ProRes 422 HQ master for editing",
        },
    }

    def __init__(self):
        pass

    def get_preset(self, preset_name: str) -> Optional[Dict[str, Any]]:
        """Get a specific export preset."""
        return self.PRESETS.get(preset_name)

    def list_presets(self) -> List[Dict[str, Any]]:
        """List all available presets."""
        return [
            {"name": name, **preset}
            for name, preset in self.PRESETS.items()
        ]

    def get_ffmpeg_args(
        self,
        preset_name: str,
        input_path: str,
        output_path: str,
        custom_options: Optional[Dict[str, Any]] = None,
    ) -> List[str]:
        """
        Generate FFmpeg arguments for a preset.

        Args:
            preset_name: Name of the preset
            input_path: Path to input video
            output_path: Path for output video
            custom_options: Optional overrides for preset settings

        Returns:
            List of FFmpeg command arguments
        """
        preset = self.PRESETS.get(preset_name)
        if not preset:
            raise ValueError(f"Unknown preset: {preset_name}")

        # Merge with custom options
        config = preset.copy()
        if custom_options:
            config.update(custom_options)

        args = ["ffmpeg", "-y", "-i", input_path]

        # Video encoding
        args.extend(["-c:v", config["video_codec"]])

        if config.get("crf"):
            args.extend(["-crf", str(config["crf"])])
        if config.get("video_profile"):
            args.extend(["-profile:v", config["video_profile"]])
        if config.get("video_level"):
            args.extend(["-level", config["video_level"]])
        if config.get("max_bitrate"):
            args.extend(["-maxrate", f"{config['max_bitrate']}k"])
            args.extend(["-bufsize", f"{config['max_bitrate'] * 2}k"])

        # Resolution
        if config.get("resolution"):
            width, height = config["resolution"].split("x")
            args.extend(["-vf", f"scale={width}:{height}"])

        # Audio encoding
        args.extend(["-c:a", config["audio_codec"]])
        if config.get("audio_bitrate"):
            args.extend(["-b:a", f"{config['audio_bitrate']}k"])
        if config.get("audio_sample_rate"):
            args.extend(["-ar", str(config["audio_sample_rate"])])
        if config.get("audio_channels"):
            args.extend(["-ac", str(config["audio_channels"])])

        # Container format
        if config["container"] != "mp4":
            args.extend(["-f", config["container"]])

        # MP4 fast start
        if config["container"] == "mp4":
            args.extend(["-movflags", "+faststart"])

        args.append(output_path)

        return args

    def get_presets_for_platform(self, platform: str) -> List[str]:
        """Get all preset names for a specific platform."""
        platform_lower = platform.lower()
        return [
            name for name in self.PRESETS.keys()
            if platform_lower in name.lower()
        ]

    def get_social_presets(self) -> List[str]:
        """Get all social media platform presets."""
        social_platforms = ["youtube", "instagram", "tiktok", "twitter", "facebook", "linkedin"]
        return [
            name for name in self.PRESETS.keys()
            if any(p in name.lower() for p in social_platforms)
        ]

    def get_broadcast_presets(self) -> List[str]:
        """Get all broadcast/professional presets."""
        return [
            name for name in self.PRESETS.keys()
            if any(p in name.lower() for p in ["broadcast", "dcp", "prores"])
        ]


class SubtitleBurner:
    """
    Burn subtitles into video for international versions.

    Supports SRT and ASS subtitle formats with customizable styling
    for theatrical and social media output.
    """

    SUBTITLE_STYLES = {
        "theatrical": {
            "font": "Arial",
            "fontsize": 48,
            "primary_color": "&HFFFFFF",  # White
            "outline_color": "&H000000",  # Black
            "outline_width": 3,
            "shadow_offset": 2,
            "margin_v": 60,
            "alignment": 2,  # Center bottom
        },
        "social": {
            "font": "Arial Bold",
            "fontsize": 36,
            "primary_color": "&HFFFFFF",
            "back_color": "&H80000000",  # Semi-transparent background
            "outline_width": 0,
            "margin_v": 40,
            "alignment": 2,
        },
        "minimal": {
            "font": "Helvetica",
            "fontsize": 40,
            "primary_color": "&HFFFFFF",
            "outline_color": "&H40000000",
            "outline_width": 2,
            "shadow_offset": 0,
            "margin_v": 50,
            "alignment": 2,
        },
        "bold": {
            "font": "Impact",
            "fontsize": 52,
            "primary_color": "&HFFFFFF",
            "outline_color": "&H000000",
            "outline_width": 4,
            "shadow_offset": 3,
            "margin_v": 50,
            "alignment": 2,
        },
    }

    def __init__(self, ffmpeg_path: str = "ffmpeg"):
        self.ffmpeg_path = ffmpeg_path

    def burn_subtitles(
        self,
        video_path: str,
        subtitle_path: str,
        output_path: str,
        style: str = "theatrical",
    ) -> bool:
        """
        Burn subtitles into video.

        Args:
            video_path: Path to input video
            subtitle_path: Path to subtitle file (.srt or .ass)
            output_path: Path for output video
            style: Style preset to use

        Returns:
            True if successful
        """
        if not os.path.exists(video_path):
            print(f"Video file not found: {video_path}")
            return False

        if not os.path.exists(subtitle_path):
            print(f"Subtitle file not found: {subtitle_path}")
            return False

        style_config = self.SUBTITLE_STYLES.get(style, self.SUBTITLE_STYLES["theatrical"])

        # Build ASS style string for force_style
        ass_style = self._build_ass_style(style_config)

        # Escape the subtitle path for FFmpeg
        escaped_path = subtitle_path.replace("\\", "/").replace(":", "\\:")
        escaped_path = escaped_path.replace("'", "'\\''")

        # Build subtitles filter
        filter_str = f"subtitles='{escaped_path}':force_style='{ass_style}'"

        cmd = [
            self.ffmpeg_path, "-y",
            "-i", video_path,
            "-vf", filter_str,
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",
            "-c:a", "copy",
            output_path,
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            if result.returncode != 0:
                print(f"Subtitle burn failed: {result.stderr}")
                return False
            return True
        except subprocess.TimeoutExpired:
            print("Subtitle burn timed out")
            return False
        except Exception as e:
            print(f"Error burning subtitles: {e}")
            return False

    def _build_ass_style(self, config: Dict[str, Any]) -> str:
        """Build ASS subtitle style string."""
        parts = [
            f"FontName={config['font']}",
            f"FontSize={config['fontsize']}",
            f"PrimaryColour={config['primary_color']}",
            f"OutlineColour={config.get('outline_color', '&H000000')}",
            f"Outline={config.get('outline_width', 2)}",
            f"Shadow={config.get('shadow_offset', 0)}",
            f"MarginV={config['margin_v']}",
            f"Alignment={config['alignment']}",
        ]

        if config.get("back_color"):
            parts.append(f"BackColour={config['back_color']}")

        return ",".join(parts)

    def generate_srt_from_transcript(
        self,
        transcript: Dict[str, Any],
        output_path: str,
        max_chars_per_line: int = 42,
        max_lines: int = 2,
    ) -> str:
        """
        Generate SRT subtitle file from transcript.

        Args:
            transcript: Transcription with word-level timing
            output_path: Where to save the SRT file
            max_chars_per_line: Maximum characters per subtitle line
            max_lines: Maximum lines per subtitle

        Returns:
            Path to generated SRT file
        """
        segments = transcript.get("segments", [])
        if not segments:
            segments = transcript.get("words", [])

        srt_entries = []
        entry_num = 1

        for segment in segments:
            text = segment.get("text", "").strip()
            start = segment.get("start", 0)
            end = segment.get("end", start + 2)

            if not text:
                continue

            # Wrap text if too long
            wrapped_text = self._wrap_text(text, max_chars_per_line, max_lines)

            # Format timestamps
            start_tc = self._seconds_to_srt_timestamp(start)
            end_tc = self._seconds_to_srt_timestamp(end)

            srt_entries.append(f"{entry_num}\n{start_tc} --> {end_tc}\n{wrapped_text}\n")
            entry_num += 1

        # Write SRT file
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n".join(srt_entries))

        return output_path

    def _wrap_text(
        self,
        text: str,
        max_chars: int,
        max_lines: int,
    ) -> str:
        """Wrap text to fit subtitle constraints."""
        words = text.split()
        lines = []
        current_line = []

        for word in words:
            test_line = " ".join(current_line + [word])
            if len(test_line) <= max_chars:
                current_line.append(word)
            else:
                if current_line:
                    lines.append(" ".join(current_line))
                current_line = [word]

        if current_line:
            lines.append(" ".join(current_line))

        # Limit to max lines
        if len(lines) > max_lines:
            lines = lines[:max_lines]
            lines[-1] = lines[-1] + "..."

        return "\n".join(lines)

    def _seconds_to_srt_timestamp(self, seconds: float) -> str:
        """Convert seconds to SRT timestamp format (HH:MM:SS,mmm)."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds % 1) * 1000)

        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

    def get_available_styles(self) -> List[Dict[str, Any]]:
        """List available subtitle styles."""
        return [
            {"name": name, **style}
            for name, style in self.SUBTITLE_STYLES.items()
        ]
