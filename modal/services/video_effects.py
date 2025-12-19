"""
Video Effects for Trailer Polish.

Professional finishing effects including film grain, letterbox, and color grading.
Uses FFmpeg filters for GPU-accelerated processing where available.
"""

import os
import subprocess
from typing import Dict, Any, Optional, List


class VideoEffects:
    """Apply professional finishing effects to trailer renders."""

    # Color grade presets with FFmpeg eq/curves values
    COLOR_PRESETS = {
        "cinematic": {
            "saturation": 0.9,
            "contrast": 1.1,
            "brightness": 0.0,
            "gamma": 1.05,
            "shadows_lift": 0.02,  # Lift blacks slightly
            "highlights_compress": 0.95,  # Compress highlights
        },
        "thriller": {
            "saturation": 0.75,
            "contrast": 1.2,
            "brightness": -0.05,
            "gamma": 1.1,
            "shadows_lift": 0.0,
            "highlights_compress": 0.9,
        },
        "drama": {
            "saturation": 0.85,
            "contrast": 1.15,
            "brightness": -0.02,
            "gamma": 1.0,
            "shadows_lift": 0.03,
            "highlights_compress": 0.92,
        },
        "action": {
            "saturation": 1.05,
            "contrast": 1.15,
            "brightness": 0.02,
            "gamma": 0.95,
            "shadows_lift": 0.0,
            "highlights_compress": 0.98,
        },
        "broadcast": {
            "saturation": 1.0,
            "contrast": 1.0,
            "brightness": 0.0,
            "gamma": 1.0,
            "shadows_lift": 0.0,
            "highlights_compress": 1.0,
        },
    }

    # Letterbox aspect ratios (as height multiplier for bars)
    LETTERBOX_RATIOS = {
        "2.39:1": 2.39,  # Cinemascope
        "2.35:1": 2.35,  # Panavision
        "1.85:1": 1.85,  # Academy flat
        "2.00:1": 2.00,  # Univisium
    }

    def __init__(self, job_id: str = ""):
        self.job_id = job_id

    def build_polish_filter(
        self,
        width: int,
        height: int,
        film_grain: Optional[Dict[str, Any]] = None,
        letterbox: Optional[Dict[str, Any]] = None,
        color_grade: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Build FFmpeg filter chain for polish effects.

        Args:
            width: Video width
            height: Video height
            film_grain: {enabled, intensity} - 0-100 intensity
            letterbox: {enabled, aspectRatio} - "2.39:1", etc.
            color_grade: {enabled, preset, saturation, contrast, vignette}

        Returns:
            FFmpeg filter string (e.g., "eq=...,noise=...,drawbox=...")
        """
        filters = []

        # 1. Color grading (apply first for best quality)
        if color_grade and color_grade.get("enabled"):
            color_filter = self._build_color_grade_filter(color_grade)
            if color_filter:
                filters.append(color_filter)

        # 2. Vignette (part of color grade but applied separately)
        if color_grade and color_grade.get("enabled"):
            vignette = color_grade.get("vignette", 0)
            if vignette > 0:
                vignette_filter = self._build_vignette_filter(vignette)
                if vignette_filter:
                    filters.append(vignette_filter)

        # 3. Letterbox (adds black bars)
        if letterbox and letterbox.get("enabled"):
            letterbox_filter = self._build_letterbox_filter(
                width, height, letterbox.get("aspectRatio", "2.39:1")
            )
            if letterbox_filter:
                filters.append(letterbox_filter)

        # 4. Film grain (apply last to preserve grain visibility)
        if film_grain and film_grain.get("enabled"):
            grain_filter = self._build_grain_filter(film_grain.get("intensity", 15))
            if grain_filter:
                filters.append(grain_filter)

        if not filters:
            return ""

        return ",".join(filters)

    def _build_grain_filter(self, intensity: int) -> str:
        """Build FFmpeg noise filter for film grain.

        Args:
            intensity: 0-100, where 15 is subtle, 30 is noticeable

        Returns:
            FFmpeg noise filter string
        """
        # Scale intensity to FFmpeg noise amounts
        # FFmpeg noise alls (all strength) ranges 0-100
        # c0s (Y/luma) is primary, c1s/c2s (chroma) should be lower
        luma_strength = min(int(intensity * 0.4), 40)  # Max 40 for luma
        chroma_strength = min(int(intensity * 0.15), 15)  # Much less chroma noise

        # Use temporal noise (t=1) for film-like variation
        # allf=t makes it temporal (changes per frame)
        return (
            f"noise=alls={luma_strength}:allf=t+u:"
            f"c0s={luma_strength}:c1s={chroma_strength}:c2s={chroma_strength}"
        )

    def _build_letterbox_filter(
        self, width: int, height: int, aspect_ratio: str
    ) -> str:
        """Build letterbox filter (black bars for widescreen).

        Args:
            width: Video width
            height: Video height
            aspect_ratio: Target aspect ratio ("2.39:1", etc.)

        Returns:
            FFmpeg filter string for letterbox bars
        """
        target_ratio = self.LETTERBOX_RATIOS.get(aspect_ratio, 2.39)
        current_ratio = width / height

        if target_ratio <= current_ratio:
            # Already wider, no letterbox needed
            return ""

        # Calculate bar height
        # Target height = width / target_ratio
        target_height = int(width / target_ratio)
        bar_height = (height - target_height) // 2

        if bar_height <= 0:
            return ""

        # Draw black boxes at top and bottom
        # drawbox filter: x:y:width:height:color:thickness (or fill)
        return (
            f"drawbox=x=0:y=0:w={width}:h={bar_height}:c=black:t=fill,"
            f"drawbox=x=0:y={height - bar_height}:w={width}:h={bar_height}:c=black:t=fill"
        )

    def _build_color_grade_filter(self, color_grade: Dict[str, Any]) -> str:
        """Build color grading filter using eq and curves.

        Args:
            color_grade: {preset, saturation, contrast, brightness}

        Returns:
            FFmpeg eq filter string
        """
        preset_name = color_grade.get("preset", "cinematic")
        preset = self.COLOR_PRESETS.get(preset_name, self.COLOR_PRESETS["cinematic"])

        # Override preset values with explicit settings
        saturation = color_grade.get("saturation", preset["saturation"])
        contrast = color_grade.get("contrast", preset["contrast"])
        brightness = preset.get("brightness", 0)
        gamma = preset.get("gamma", 1.0)

        # Build eq filter
        # eq filter: brightness (-1 to 1), contrast (0 to 2), saturation (0 to 3), gamma (0.1 to 10)
        eq_parts = []
        eq_parts.append(f"saturation={saturation:.2f}")
        eq_parts.append(f"contrast={contrast:.2f}")
        if brightness != 0:
            eq_parts.append(f"brightness={brightness:.2f}")
        if gamma != 1.0:
            eq_parts.append(f"gamma={gamma:.2f}")

        return f"eq={':'.join(eq_parts)}"

    def _build_vignette_filter(self, intensity: float) -> str:
        """Build vignette filter for darkened edges.

        Args:
            intensity: 0-1, where 0.3 is subtle

        Returns:
            FFmpeg vignette filter string
        """
        if intensity <= 0:
            return ""

        # Vignette filter angle (in radians) controls strength
        # PI/4 (0.785) is default, smaller = stronger vignette
        # We'll scale intensity to angle: 0.1 intensity = PI/3, 1.0 = PI/6
        angle = 1.05 - (intensity * 0.7)  # Range from ~1.0 to ~0.35

        return f"vignette=angle={angle:.2f}"

    def apply_polish(
        self,
        input_path: str,
        output_path: str,
        width: int,
        height: int,
        polish_options: Dict[str, Any],
        crf: int = 18,
    ) -> bool:
        """Apply all polish effects to a video.

        Args:
            input_path: Path to input video
            output_path: Path for output video
            width: Video width
            height: Video height
            polish_options: {filmGrain, letterbox, colorGrade}
            crf: Quality setting (lower = better, 18 is high quality)

        Returns:
            True if successful, False otherwise
        """
        filter_chain = self.build_polish_filter(
            width=width,
            height=height,
            film_grain=polish_options.get("filmGrain"),
            letterbox=polish_options.get("letterbox"),
            color_grade=polish_options.get("colorGrade"),
        )

        if not filter_chain:
            # No filters needed, just copy
            print(f"[{self.job_id}] No polish filters to apply")
            return self._copy_video(input_path, output_path)

        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-vf", filter_chain,
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", str(crf),
            "-c:a", "copy",
            output_path,
        ]

        try:
            print(f"[{self.job_id}] Applying polish: {filter_chain[:100]}...")
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"[{self.job_id}] Polish failed: {result.stderr}")
                return False
            return True
        except Exception as e:
            print(f"[{self.job_id}] Polish error: {e}")
            return False

    def _copy_video(self, input_path: str, output_path: str) -> bool:
        """Copy video without re-encoding."""
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-c", "copy",
            output_path,
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            return result.returncode == 0
        except Exception:
            return False


def get_polish_options_for_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
    """Extract polish options from profile, with defaults.

    Args:
        profile: Trailer profile dict

    Returns:
        Polish options dict with sensible defaults
    """
    polish = profile.get("polishOptions", {})

    # Return empty if no polish configured
    if not polish:
        return {}

    return {
        "filmGrain": polish.get("filmGrain", {"enabled": False}),
        "letterbox": polish.get("letterbox", {"enabled": False}),
        "colorGrade": polish.get("colorGrade", {"enabled": False}),
    }


def should_apply_polish(polish_options: Dict[str, Any]) -> bool:
    """Check if any polish effects are enabled.

    Args:
        polish_options: Polish options dict

    Returns:
        True if at least one effect is enabled
    """
    if not polish_options:
        return False

    film_grain = polish_options.get("filmGrain", {})
    letterbox = polish_options.get("letterbox", {})
    color_grade = polish_options.get("colorGrade", {})

    return (
        film_grain.get("enabled", False)
        or letterbox.get("enabled", False)
        or color_grade.get("enabled", False)
    )
