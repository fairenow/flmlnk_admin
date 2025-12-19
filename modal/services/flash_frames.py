"""
Phase 6: Transitions & Speed Effects - Flash Frames

Professional flash frame effects for trailer editing including:
- Subliminal white flashes for tension
- Black flashes for impact
- Red flashes for intensity
- Configurable patterns for rhythm
"""

import logging
import subprocess
import os
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class FlashColor(Enum):
    """Available flash colors for trailer effects."""
    WHITE = "white"
    BLACK = "black"
    RED = "red"
    BLUE = "blue"
    ORANGE = "orange"


@dataclass
class FlashConfig:
    """Configuration for a single flash frame."""
    timestamp: float  # Time in seconds
    duration: float  # Flash duration in seconds
    color: FlashColor = FlashColor.WHITE
    intensity: float = 1.0  # 0.0 to 1.0 opacity
    fade_in: float = 0.0  # Fade in duration
    fade_out: float = 0.0  # Fade out duration


@dataclass
class FlashPattern:
    """A pattern of flash frames for rhythmic effects."""
    name: str
    flashes: list[FlashConfig] = field(default_factory=list)
    total_duration: float = 0.0


class FlashFrameRenderer:
    """
    Renders subliminal flash frame effects for trailers.

    Uses FFmpeg drawbox and fade filters to create the quick
    flash effects commonly used in intense trailer moments.
    """

    # Color RGB values for FFmpeg
    COLOR_VALUES = {
        FlashColor.WHITE: "white@{intensity}",
        FlashColor.BLACK: "black@{intensity}",
        FlashColor.RED: "0xFF0000@{intensity}",
        FlashColor.BLUE: "0x0066FF@{intensity}",
        FlashColor.ORANGE: "0xFF6600@{intensity}",
    }

    # Preset patterns for common trailer effects
    PRESET_PATTERNS = {
        "tension_build": [
            {"offset": 0.0, "duration": 0.03, "color": "white"},
            {"offset": 0.2, "duration": 0.03, "color": "white"},
            {"offset": 0.35, "duration": 0.03, "color": "white"},
            {"offset": 0.45, "duration": 0.03, "color": "white"},
            {"offset": 0.52, "duration": 0.03, "color": "white"},
            {"offset": 0.57, "duration": 0.03, "color": "white"},
        ],
        "impact": [
            {"offset": 0.0, "duration": 0.08, "color": "white"},
        ],
        "strobe": [
            {"offset": 0.0, "duration": 0.02, "color": "white"},
            {"offset": 0.05, "duration": 0.02, "color": "black"},
            {"offset": 0.10, "duration": 0.02, "color": "white"},
            {"offset": 0.15, "duration": 0.02, "color": "black"},
        ],
        "horror": [
            {"offset": 0.0, "duration": 0.04, "color": "red"},
            {"offset": 0.1, "duration": 0.02, "color": "black"},
            {"offset": 0.15, "duration": 0.04, "color": "red"},
        ],
        "action_beat": [
            {"offset": 0.0, "duration": 0.05, "color": "orange"},
            {"offset": 0.08, "duration": 0.03, "color": "white"},
        ],
    }

    def __init__(self, ffmpeg_path: str = "ffmpeg"):
        """Initialize the flash frame renderer."""
        self.ffmpeg_path = ffmpeg_path

    def add_flash_frames(
        self,
        input_path: str,
        output_path: str,
        flashes: list[FlashConfig]
    ) -> bool:
        """
        Add flash frame effects to a video.

        Args:
            input_path: Path to input video
            output_path: Path for output video
            flashes: List of flash configurations

        Returns:
            True if successful, False otherwise
        """
        if not os.path.exists(input_path):
            logger.error(f"Input file not found: {input_path}")
            return False

        if not flashes:
            logger.warning("No flashes specified, copying input")
            return self._copy_file(input_path, output_path)

        # Get video dimensions
        width, height = self._get_video_dimensions(input_path)
        if width is None or height is None:
            logger.error("Could not determine video dimensions")
            return False

        # Build filter chain for all flashes
        filter_chain = self._build_flash_filter_chain(flashes, width, height)

        cmd = [
            self.ffmpeg_path,
            "-i", input_path,
            "-filter_complex", filter_chain,
            "-map", "[v]",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",
            "-c:a", "copy",
            "-y",
            output_path
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300
            )

            if result.returncode != 0:
                logger.error(f"Flash frames failed: {result.stderr}")
                return False

            logger.info(f"Added {len(flashes)} flash frames to {output_path}")
            return True

        except subprocess.TimeoutExpired:
            logger.error("Flash frame rendering timed out")
            return False
        except Exception as e:
            logger.error(f"Error adding flash frames: {e}")
            return False

    def _build_flash_filter_chain(
        self,
        flashes: list[FlashConfig],
        width: int,
        height: int
    ) -> str:
        """Build the FFmpeg filter chain for flash effects."""
        # Start with input
        filter_parts = ["[0:v]"]
        current_output = "v0"

        for i, flash in enumerate(flashes):
            input_label = f"v{i}" if i > 0 else "0:v"
            output_label = f"v{i + 1}"

            # Get color value
            color_template = self.COLOR_VALUES.get(
                flash.color,
                self.COLOR_VALUES[FlashColor.WHITE]
            )
            color = color_template.format(intensity=flash.intensity)

            # Build the drawbox filter with enable condition
            # This draws a full-screen colored box during the flash
            enable_expr = (
                f"between(t,{flash.timestamp},{flash.timestamp + flash.duration})"
            )

            # If there's fade in/out, we need a more complex approach
            if flash.fade_in > 0 or flash.fade_out > 0:
                # Use blend/overlay approach for fading
                flash_filter = self._build_fade_flash_filter(
                    flash, width, height, input_label, output_label
                )
            else:
                # Simple drawbox for instant flash
                flash_filter = (
                    f"[{input_label}]drawbox=x=0:y=0:w={width}:h={height}:"
                    f"c={color}:t=fill:enable='{enable_expr}'[{output_label}]"
                )

            filter_parts.append(flash_filter)
            current_output = output_label

        # Build final chain
        full_chain = ";".join(filter_parts[1:])  # Skip initial marker
        full_chain = full_chain.replace(f"[{current_output}]", "[v]")

        return full_chain

    def _build_fade_flash_filter(
        self,
        flash: FlashConfig,
        width: int,
        height: int,
        input_label: str,
        output_label: str
    ) -> str:
        """Build a flash filter with fade in/out."""
        color_template = self.COLOR_VALUES.get(
            flash.color,
            self.COLOR_VALUES[FlashColor.WHITE]
        )

        # For fading flashes, we use a more complex expression
        # that modulates the opacity over time
        start = flash.timestamp
        fade_in_end = start + flash.fade_in
        fade_out_start = start + flash.duration - flash.fade_out
        end = start + flash.duration

        # Build opacity expression
        opacity_expr = (
            f"if(between(t,{start},{fade_in_end}),"
            f"{flash.intensity}*(t-{start})/{flash.fade_in},"  # Fade in
            f"if(between(t,{fade_in_end},{fade_out_start}),"
            f"{flash.intensity},"  # Full intensity
            f"if(between(t,{fade_out_start},{end}),"
            f"{flash.intensity}*(1-(t-{fade_out_start})/{flash.fade_out}),"  # Fade out
            f"0)))"  # Outside flash
        )

        # Use geq filter for per-frame opacity
        color_hex = self._get_color_hex(flash.color)

        return (
            f"[{input_label}]drawbox=x=0:y=0:w={width}:h={height}:"
            f"c={color_hex}@'{opacity_expr}':t=fill:enable='between(t,{start},{end})'"
            f"[{output_label}]"
        )

    def _get_color_hex(self, color: FlashColor) -> str:
        """Get the hex color code without opacity."""
        color_map = {
            FlashColor.WHITE: "white",
            FlashColor.BLACK: "black",
            FlashColor.RED: "0xFF0000",
            FlashColor.BLUE: "0x0066FF",
            FlashColor.ORANGE: "0xFF6600",
        }
        return color_map.get(color, "white")

    def add_pattern_at_timestamp(
        self,
        input_path: str,
        output_path: str,
        pattern_name: str,
        timestamp: float,
        intensity: float = 1.0
    ) -> bool:
        """
        Add a preset flash pattern at a specific timestamp.

        Args:
            input_path: Path to input video
            output_path: Path for output video
            pattern_name: Name of the preset pattern
            timestamp: Start time for the pattern
            intensity: Overall intensity multiplier

        Returns:
            True if successful, False otherwise
        """
        if pattern_name not in self.PRESET_PATTERNS:
            logger.warning(f"Unknown pattern: {pattern_name}, using 'impact'")
            pattern_name = "impact"

        pattern_data = self.PRESET_PATTERNS[pattern_name]
        flashes = []

        for flash_def in pattern_data:
            color_str = flash_def.get("color", "white")
            color = FlashColor(color_str)

            flashes.append(FlashConfig(
                timestamp=timestamp + flash_def["offset"],
                duration=flash_def["duration"],
                color=color,
                intensity=intensity
            ))

        return self.add_flash_frames(input_path, output_path, flashes)

    def create_flash_plan(
        self,
        scenes: list[dict],
        beat_times: Optional[list[float]] = None,
        trailer_duration: Optional[float] = None
    ) -> list[FlashConfig]:
        """
        Create an intelligent flash plan based on scene analysis.

        Args:
            scenes: List of scene dicts with importance and emotion
            beat_times: Optional list of music beat timestamps
            trailer_duration: Total trailer duration

        Returns:
            List of FlashConfig objects
        """
        flashes = []
        beat_set = set(beat_times) if beat_times else set()

        for i, scene in enumerate(scenes):
            importance = scene.get("importance", 0)
            emotion = scene.get("emotion", "")
            scene_start = scene.get("start", 0)
            scene_end = scene.get("end", 0)

            # Only add flashes to high-importance scenes
            if importance < 0.7:
                continue

            # Determine flash type based on emotion
            if emotion in ["action", "intense"]:
                # Action scenes get impact flashes on beats
                for beat in beat_set:
                    if scene_start <= beat <= scene_end:
                        flashes.append(FlashConfig(
                            timestamp=beat,
                            duration=0.05,
                            color=FlashColor.ORANGE,
                            intensity=0.8
                        ))

            elif emotion in ["horror", "thriller"]:
                # Horror scenes get red flashes
                mid_point = (scene_start + scene_end) / 2
                flashes.append(FlashConfig(
                    timestamp=mid_point,
                    duration=0.04,
                    color=FlashColor.RED,
                    intensity=0.9
                ))

            elif emotion in ["dramatic", "reveal", "climax"]:
                # Dramatic moments get white impact flashes
                flashes.append(FlashConfig(
                    timestamp=scene_start,
                    duration=0.08,
                    color=FlashColor.WHITE,
                    intensity=1.0,
                    fade_out=0.05
                ))

            # Add tension build near end of important scenes
            if importance > 0.85 and (scene_end - scene_start) > 2.0:
                # Add accelerating flashes near scene end
                tension_start = scene_end - 1.0
                pattern = self._generate_tension_build(
                    tension_start,
                    0.8,  # 0.8 seconds of flashes
                    5,    # 5 flashes accelerating
                    FlashColor.WHITE
                )
                flashes.extend(pattern)

        # Add final climax flash if we have trailer duration
        if trailer_duration and trailer_duration > 5:
            # Big flash near the end
            flashes.append(FlashConfig(
                timestamp=trailer_duration - 2.0,
                duration=0.1,
                color=FlashColor.WHITE,
                intensity=1.0,
                fade_out=0.15
            ))

        # Sort by timestamp
        flashes.sort(key=lambda f: f.timestamp)

        # Remove overlapping flashes
        flashes = self._remove_overlapping_flashes(flashes)

        return flashes

    def _generate_tension_build(
        self,
        start_time: float,
        total_duration: float,
        flash_count: int,
        color: FlashColor
    ) -> list[FlashConfig]:
        """Generate accelerating flash pattern for tension building."""
        flashes = []

        # Calculate accelerating intervals
        # Each interval is 70% of the previous one
        intervals = []
        interval = total_duration / flash_count
        remaining = total_duration

        for i in range(flash_count):
            intervals.append(interval)
            remaining -= interval
            interval *= 0.7  # Accelerate

        # Normalize to fit in duration
        total_intervals = sum(intervals)
        scale = total_duration / total_intervals

        current_time = start_time
        for i, interval in enumerate(intervals):
            scaled_interval = interval * scale
            # Flash duration gets shorter too
            flash_duration = max(0.02, 0.05 * (1 - i / flash_count))

            flashes.append(FlashConfig(
                timestamp=current_time,
                duration=flash_duration,
                color=color,
                intensity=0.6 + 0.4 * (i / flash_count)  # Intensity builds
            ))

            current_time += scaled_interval

        return flashes

    def _remove_overlapping_flashes(
        self,
        flashes: list[FlashConfig],
        min_gap: float = 0.03
    ) -> list[FlashConfig]:
        """Remove flashes that overlap or are too close together."""
        if not flashes:
            return []

        result = [flashes[0]]

        for flash in flashes[1:]:
            last_flash = result[-1]
            last_end = last_flash.timestamp + last_flash.duration

            # Check if there's enough gap
            if flash.timestamp >= last_end + min_gap:
                result.append(flash)
            else:
                # Keep the higher intensity flash
                if flash.intensity > last_flash.intensity:
                    result[-1] = flash

        return result

    def _get_video_dimensions(
        self,
        video_path: str
    ) -> tuple[Optional[int], Optional[int]]:
        """Get the dimensions of a video file."""
        cmd = [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0:s=x",
            video_path
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                parts = result.stdout.strip().split("x")
                if len(parts) == 2:
                    return int(parts[0]), int(parts[1])
            return None, None

        except (subprocess.TimeoutExpired, ValueError):
            return None, None

    def _copy_file(self, src: str, dst: str) -> bool:
        """Copy a file using FFmpeg (re-encode)."""
        cmd = [
            self.ffmpeg_path,
            "-i", src,
            "-c", "copy",
            "-y",
            dst
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, timeout=60)
            return result.returncode == 0
        except subprocess.TimeoutExpired:
            return False

    def generate_flash_summary(self, flashes: list[FlashConfig]) -> dict:
        """Generate a summary of the flash plan for display."""
        if not flashes:
            return {"count": 0, "colors": [], "total_duration": 0}

        color_counts: dict[str, int] = {}
        total_flash_time = 0

        for flash in flashes:
            color_name = flash.color.value
            color_counts[color_name] = color_counts.get(color_name, 0) + 1
            total_flash_time += flash.duration

        return {
            "count": len(flashes),
            "colors": color_counts,
            "total_duration": total_flash_time,
            "first_flash": flashes[0].timestamp if flashes else 0,
            "last_flash": flashes[-1].timestamp if flashes else 0,
        }
