"""
Phase 7: Professional Overlays & Branding

Professional overlay system for trailer branding including:
- Studio/production company logo bumpers
- Age ratings and content warnings (MPAA, ESRB, etc.)
- Social media handle watermarks
- End cards with title, release date, and URLs
- Credits text ("From the director of...", etc.)
- Custom font management for text rendering
"""

import logging
import subprocess
import os
import tempfile
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)


class OverlayPosition(Enum):
    """Standard positions for overlays."""
    TOP_LEFT = "top_left"
    TOP_CENTER = "top_center"
    TOP_RIGHT = "top_right"
    CENTER = "center"
    BOTTOM_LEFT = "bottom_left"
    BOTTOM_CENTER = "bottom_center"
    BOTTOM_RIGHT = "bottom_right"
    LOWER_THIRD = "lower_third"  # Professional broadcast position


class AgeRating(Enum):
    """Standard age rating systems."""
    # MPAA (US)
    MPAA_G = "G"
    MPAA_PG = "PG"
    MPAA_PG13 = "PG-13"
    MPAA_R = "R"
    MPAA_NC17 = "NC-17"
    # BBFC (UK)
    BBFC_U = "U"
    BBFC_PG = "PG"
    BBFC_12A = "12A"
    BBFC_15 = "15"
    BBFC_18 = "18"
    # Generic
    ALL_AGES = "ALL AGES"
    MATURE = "MATURE"
    NOT_RATED = "NOT RATED"
    COMING_SOON = "COMING SOON"


@dataclass
class LogoConfig:
    """Configuration for a logo overlay."""
    logo_path: str  # Path to logo image (PNG with transparency)
    position: OverlayPosition = OverlayPosition.CENTER
    start_time: float = 0.0  # When logo appears
    duration: float = 3.0  # How long logo is visible
    fade_in: float = 0.5  # Fade in duration
    fade_out: float = 0.5  # Fade out duration
    scale: float = 0.3  # Scale relative to video width
    opacity: float = 1.0


@dataclass
class AgeRatingConfig:
    """Configuration for age rating overlay."""
    rating: AgeRating
    position: OverlayPosition = OverlayPosition.BOTTOM_RIGHT
    content_descriptors: List[str] = field(default_factory=list)  # ["Violence", "Language"]
    start_time: float = 0.0
    duration: Optional[float] = None  # None = entire video
    background_opacity: float = 0.7


@dataclass
class SocialHandleConfig:
    """Configuration for social media watermark."""
    platform: str  # "instagram", "twitter", "tiktok", "youtube"
    handle: str  # "@username"
    position: OverlayPosition = OverlayPosition.BOTTOM_RIGHT
    start_time: Optional[float] = None  # None = last 10 seconds
    duration: Optional[float] = None  # None = until end
    include_icon: bool = True
    opacity: float = 0.8


@dataclass
class EndCardConfig:
    """Configuration for end card (title, release date, URL)."""
    title: str
    subtitle: Optional[str] = None  # "A Film by John Doe"
    release_date: Optional[str] = None  # "SUMMER 2025" or "MARCH 15"
    tagline: Optional[str] = None  # "Every choice has a consequence"
    url: Optional[str] = None  # "www.moviename.com"
    duration: float = 5.0  # End card duration
    style: str = "elegant"  # "elegant", "bold", "minimal", "gritty"


@dataclass
class CreditsConfig:
    """Configuration for credits text overlays."""
    text: str  # "FROM THE DIRECTOR OF INCEPTION"
    position: OverlayPosition = OverlayPosition.LOWER_THIRD
    start_time: float = 0.0
    duration: float = 3.0
    style: str = "minimal"
    fade_in: float = 0.3
    fade_out: float = 0.3


class OverlayRenderer:
    """
    Renders professional overlays for trailers.

    Uses FFmpeg filters for logo compositing, text rendering,
    and animated end cards.
    """

    # Social media icon unicode/emoji (fallback if no icon file)
    SOCIAL_ICONS = {
        "instagram": "📷",
        "twitter": "𝕏",
        "x": "𝕏",
        "tiktok": "🎵",
        "youtube": "▶",
        "facebook": "📘",
        "threads": "🧵",
    }

    # Platform colors
    SOCIAL_COLORS = {
        "instagram": "#E4405F",
        "twitter": "#1DA1F2",
        "x": "#000000",
        "tiktok": "#000000",
        "youtube": "#FF0000",
        "facebook": "#1877F2",
        "threads": "#000000",
    }

    # Rating badge colors
    RATING_COLORS = {
        AgeRating.MPAA_G: "#00AA00",
        AgeRating.MPAA_PG: "#00AA00",
        AgeRating.MPAA_PG13: "#FFAA00",
        AgeRating.MPAA_R: "#FF0000",
        AgeRating.MPAA_NC17: "#AA0000",
        AgeRating.NOT_RATED: "#666666",
    }

    # Font styles for different overlay types
    FONT_STYLES = {
        "elegant": {
            "font": "DejaVu-Sans",
            "weight": "normal",
            "spacing": 2,
        },
        "bold": {
            "font": "Liberation-Sans-Bold",
            "weight": "bold",
            "spacing": 4,
        },
        "minimal": {
            "font": "DejaVu-Sans-Light",
            "weight": "light",
            "spacing": 1,
        },
        "gritty": {
            "font": "Liberation-Mono",
            "weight": "bold",
            "spacing": 0,
        },
    }

    def __init__(self, ffmpeg_path: str = "ffmpeg"):
        """Initialize the overlay renderer."""
        self.ffmpeg_path = ffmpeg_path

    def add_logo_overlay(
        self,
        input_path: str,
        output_path: str,
        logo: LogoConfig
    ) -> bool:
        """
        Add a logo overlay to a video.

        Args:
            input_path: Path to input video
            output_path: Path for output video
            logo: Logo configuration

        Returns:
            True if successful, False otherwise
        """
        if not os.path.exists(input_path):
            logger.error(f"Input video not found: {input_path}")
            return False

        if not os.path.exists(logo.logo_path):
            logger.error(f"Logo file not found: {logo.logo_path}")
            return False

        # Get video dimensions
        width, height = self._get_video_dimensions(input_path)
        if width is None:
            return False

        # Calculate logo size and position
        logo_width = int(width * logo.scale)
        x, y = self._get_position_coords(logo.position, width, height, logo_width, logo_width)

        # Build overlay filter with fade
        enable_expr = f"between(t,{logo.start_time},{logo.start_time + logo.duration})"

        # Fade expression for alpha
        fade_expr = self._build_fade_expression(
            logo.start_time,
            logo.duration,
            logo.fade_in,
            logo.fade_out,
            logo.opacity
        )

        filter_complex = (
            f"[1:v]scale={logo_width}:-1,format=rgba,"
            f"colorchannelmixer=aa={fade_expr}[logo];"
            f"[0:v][logo]overlay={x}:{y}:enable='{enable_expr}'[v]"
        )

        cmd = [
            self.ffmpeg_path,
            "-i", input_path,
            "-i", logo.logo_path,
            "-filter_complex", filter_complex,
            "-map", "[v]",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",
            "-c:a", "copy",
            "-y",
            output_path
        ]

        return self._run_ffmpeg(cmd, "logo overlay")

    def add_age_rating(
        self,
        input_path: str,
        output_path: str,
        rating: AgeRatingConfig,
        video_duration: Optional[float] = None
    ) -> bool:
        """
        Add age rating badge to video.

        Args:
            input_path: Path to input video
            output_path: Path for output video
            rating: Age rating configuration
            video_duration: Total video duration (for full-video overlays)

        Returns:
            True if successful
        """
        width, height = self._get_video_dimensions(input_path)
        if width is None:
            return False

        if video_duration is None:
            video_duration = self._get_video_duration(input_path)

        duration = rating.duration if rating.duration else video_duration

        # Build rating text
        rating_text = rating.rating.value
        if rating.content_descriptors:
            descriptors = " | ".join(rating.content_descriptors)
            rating_text = f"{rating_text}\\n{descriptors}"

        # Get position
        x, y = self._get_position_coords(rating.position, width, height, 150, 50)

        # Get rating color
        bg_color = self.RATING_COLORS.get(rating.rating, "#666666")

        # Build drawtext filter with background box
        enable_expr = f"between(t,{rating.start_time},{rating.start_time + duration})"

        filter_str = (
            f"drawbox=x={x-10}:y={y-5}:w=170:h=60:c={bg_color}@{rating.background_opacity}:t=fill:"
            f"enable='{enable_expr}',"
            f"drawtext=text='{rating_text}':fontsize=24:fontcolor=white:"
            f"x={x}:y={y}:enable='{enable_expr}'"
        )

        cmd = [
            self.ffmpeg_path,
            "-i", input_path,
            "-vf", filter_str,
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",
            "-c:a", "copy",
            "-y",
            output_path
        ]

        return self._run_ffmpeg(cmd, "age rating")

    def add_social_watermark(
        self,
        input_path: str,
        output_path: str,
        social: SocialHandleConfig,
        video_duration: Optional[float] = None
    ) -> bool:
        """
        Add social media handle watermark.

        Args:
            input_path: Path to input video
            output_path: Path for output video
            social: Social handle configuration
            video_duration: Total video duration

        Returns:
            True if successful
        """
        width, height = self._get_video_dimensions(input_path)
        if width is None:
            return False

        if video_duration is None:
            video_duration = self._get_video_duration(input_path)

        # Default to last 10 seconds if not specified
        start_time = social.start_time if social.start_time is not None else max(0, video_duration - 10)
        duration = social.duration if social.duration is not None else (video_duration - start_time)

        # Build handle text with optional icon
        icon = self.SOCIAL_ICONS.get(social.platform.lower(), "")
        display_text = f"{icon} {social.handle}" if social.include_icon else social.handle

        # Get position
        x, y = self._get_position_coords(social.position, width, height, 200, 30)

        # Build drawtext filter
        enable_expr = f"between(t,{start_time},{start_time + duration})"

        filter_str = (
            f"drawtext=text='{display_text}':fontsize=24:fontcolor=white@{social.opacity}:"
            f"x={x}:y={y}:enable='{enable_expr}':shadowcolor=black@0.5:shadowx=2:shadowy=2"
        )

        cmd = [
            self.ffmpeg_path,
            "-i", input_path,
            "-vf", filter_str,
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",
            "-c:a", "copy",
            "-y",
            output_path
        ]

        return self._run_ffmpeg(cmd, "social watermark")

    def add_end_card(
        self,
        input_path: str,
        output_path: str,
        end_card: EndCardConfig
    ) -> bool:
        """
        Add end card with title, release date, and URL.

        This appends a new end card segment to the video.

        Args:
            input_path: Path to input video
            output_path: Path for output video
            end_card: End card configuration

        Returns:
            True if successful
        """
        width, height = self._get_video_dimensions(input_path)
        if width is None:
            return False

        # Get font style
        style = self.FONT_STYLES.get(end_card.style, self.FONT_STYLES["elegant"])

        # Create end card as a separate video segment
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            end_card_path = tmp.name

        try:
            # Generate end card video
            success = self._generate_end_card_video(
                end_card_path, width, height, end_card, style
            )

            if not success:
                return False

            # Concatenate original video with end card
            return self._concat_videos(input_path, end_card_path, output_path)

        finally:
            if os.path.exists(end_card_path):
                os.remove(end_card_path)

    def _generate_end_card_video(
        self,
        output_path: str,
        width: int,
        height: int,
        end_card: EndCardConfig,
        style: dict
    ) -> bool:
        """Generate the end card video segment."""
        # Build filter for text elements
        filters = []

        # Start with black background
        base = f"color=c=black:s={width}x{height}:d={end_card.duration}"

        # Title (large, centered)
        title_y = height // 3
        filters.append(
            f"drawtext=text='{self._escape_text(end_card.title)}':"
            f"fontsize={int(height * 0.08)}:fontcolor=white:"
            f"x=(w-text_w)/2:y={title_y}:"
            f"font='{style['font']}'"
        )

        # Subtitle if present
        if end_card.subtitle:
            subtitle_y = title_y + int(height * 0.12)
            filters.append(
                f"drawtext=text='{self._escape_text(end_card.subtitle)}':"
                f"fontsize={int(height * 0.03)}:fontcolor=white@0.8:"
                f"x=(w-text_w)/2:y={subtitle_y}"
            )

        # Tagline if present
        if end_card.tagline:
            tagline_y = height // 2
            filters.append(
                f"drawtext=text='{self._escape_text(end_card.tagline)}':"
                f"fontsize={int(height * 0.04)}:fontcolor=white@0.9:"
                f"x=(w-text_w)/2:y={tagline_y}:font='{style['font']}'"
            )

        # Release date if present
        if end_card.release_date:
            date_y = int(height * 0.65)
            filters.append(
                f"drawtext=text='{self._escape_text(end_card.release_date)}':"
                f"fontsize={int(height * 0.05)}:fontcolor=white:"
                f"x=(w-text_w)/2:y={date_y}"
            )

        # URL if present
        if end_card.url:
            url_y = int(height * 0.85)
            filters.append(
                f"drawtext=text='{self._escape_text(end_card.url)}':"
                f"fontsize={int(height * 0.025)}:fontcolor=white@0.7:"
                f"x=(w-text_w)/2:y={url_y}"
            )

        # Combine filters
        filter_str = ",".join(filters)

        # Add fade in/out
        fade_filter = f",fade=t=in:st=0:d=0.5,fade=t=out:st={end_card.duration - 0.5}:d=0.5"

        cmd = [
            self.ffmpeg_path,
            "-f", "lavfi",
            "-i", base,
            "-f", "lavfi",
            "-i", f"anullsrc=r=48000:cl=stereo:d={end_card.duration}",
            "-vf", filter_str + fade_filter,
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",
            "-c:a", "aac",
            "-shortest",
            "-y",
            output_path
        ]

        return self._run_ffmpeg(cmd, "end card generation")

    def add_credits_text(
        self,
        input_path: str,
        output_path: str,
        credits: CreditsConfig
    ) -> bool:
        """
        Add credits text overlay (e.g., "FROM THE DIRECTOR OF...").

        Args:
            input_path: Path to input video
            output_path: Path for output video
            credits: Credits configuration

        Returns:
            True if successful
        """
        width, height = self._get_video_dimensions(input_path)
        if width is None:
            return False

        style = self.FONT_STYLES.get(credits.style, self.FONT_STYLES["minimal"])

        # Get position
        if credits.position == OverlayPosition.LOWER_THIRD:
            x = "(w-text_w)/2"
            y = int(height * 0.75)
        else:
            x_val, y = self._get_position_coords(credits.position, width, height, 400, 50)
            x = str(x_val)

        # Build enable and alpha expressions
        enable_expr = f"between(t,{credits.start_time},{credits.start_time + credits.duration})"
        alpha_expr = self._build_fade_expression(
            credits.start_time,
            credits.duration,
            credits.fade_in,
            credits.fade_out,
            1.0
        )

        filter_str = (
            f"drawtext=text='{self._escape_text(credits.text)}':"
            f"fontsize={int(height * 0.035)}:fontcolor=white@'{alpha_expr}':"
            f"x={x}:y={y}:enable='{enable_expr}':"
            f"font='{style['font']}':shadowcolor=black@0.5:shadowx=2:shadowy=2"
        )

        cmd = [
            self.ffmpeg_path,
            "-i", input_path,
            "-vf", filter_str,
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",
            "-c:a", "copy",
            "-y",
            output_path
        ]

        return self._run_ffmpeg(cmd, "credits text")

    def apply_all_overlays(
        self,
        input_path: str,
        output_path: str,
        overlay_plan: Dict[str, Any]
    ) -> bool:
        """
        Apply all overlays from a plan in a single pass.

        Args:
            input_path: Path to input video
            output_path: Path for output video
            overlay_plan: Dict with logos, ratings, socials, credits, end_card

        Returns:
            True if successful
        """
        current_path = input_path
        temp_files = []

        try:
            # Apply logo overlays
            for logo_data in overlay_plan.get("logos", []):
                logo = LogoConfig(**logo_data)
                temp_output = tempfile.mktemp(suffix=".mp4")
                temp_files.append(temp_output)

                if not self.add_logo_overlay(current_path, temp_output, logo):
                    logger.warning("Failed to add logo overlay, continuing")
                    continue

                current_path = temp_output

            # Apply age rating
            if overlay_plan.get("rating"):
                rating = AgeRatingConfig(**overlay_plan["rating"])
                temp_output = tempfile.mktemp(suffix=".mp4")
                temp_files.append(temp_output)

                if self.add_age_rating(current_path, temp_output, rating):
                    current_path = temp_output

            # Apply social handles
            for social_data in overlay_plan.get("socials", []):
                social = SocialHandleConfig(**social_data)
                temp_output = tempfile.mktemp(suffix=".mp4")
                temp_files.append(temp_output)

                if self.add_social_watermark(current_path, temp_output, social):
                    current_path = temp_output

            # Apply credits
            for credits_data in overlay_plan.get("credits", []):
                credits = CreditsConfig(**credits_data)
                temp_output = tempfile.mktemp(suffix=".mp4")
                temp_files.append(temp_output)

                if self.add_credits_text(current_path, temp_output, credits):
                    current_path = temp_output

            # Apply end card (must be last as it appends)
            if overlay_plan.get("end_card"):
                end_card = EndCardConfig(**overlay_plan["end_card"])
                if self.add_end_card(current_path, output_path, end_card):
                    return True
                else:
                    # If end card fails, just copy current to output
                    return self._copy_video(current_path, output_path)
            else:
                # No end card, just copy current to output
                return self._copy_video(current_path, output_path)

        finally:
            # Clean up temp files
            for temp_file in temp_files:
                if os.path.exists(temp_file):
                    try:
                        os.remove(temp_file)
                    except Exception:
                        pass

    def create_overlay_plan(
        self,
        profile: Dict[str, Any],
        branding: Dict[str, Any],
        trailer_duration: float
    ) -> Dict[str, Any]:
        """
        Create an overlay plan based on profile and branding settings.

        Args:
            profile: Trailer profile (theatrical, teaser, social, etc.)
            branding: User's branding settings (logo, socials, etc.)
            trailer_duration: Total trailer duration

        Returns:
            Overlay plan dict
        """
        plan: Dict[str, Any] = {
            "logos": [],
            "rating": None,
            "socials": [],
            "credits": [],
            "end_card": None,
        }

        profile_key = profile.get("key", "theatrical")

        # Add logo if provided
        if branding.get("logo_path"):
            logo_duration = 3.0 if profile_key in ["theatrical", "teaser"] else 2.0
            plan["logos"].append({
                "logo_path": branding["logo_path"],
                "position": "center",
                "start_time": 0.0,
                "duration": logo_duration,
                "fade_in": 0.5,
                "fade_out": 0.5,
                "scale": 0.3,
                "opacity": 1.0,
            })

        # Add age rating if specified
        if branding.get("age_rating"):
            plan["rating"] = {
                "rating": branding["age_rating"],
                "position": "bottom_right",
                "content_descriptors": branding.get("content_descriptors", []),
                "start_time": 0.0,
                "duration": None,  # Entire video
                "background_opacity": 0.7,
            }

        # Add social handles for social profiles
        if profile_key in ["social_vertical", "social_square"] or branding.get("always_show_socials"):
            for platform, handle in branding.get("social_handles", {}).items():
                if handle:
                    plan["socials"].append({
                        "platform": platform,
                        "handle": handle,
                        "position": "bottom_right",
                        "start_time": max(0, trailer_duration - 10),
                        "duration": None,
                        "include_icon": True,
                        "opacity": 0.8,
                    })

        # Add credits if provided
        for credit_text in branding.get("credits", []):
            if credit_text:
                plan["credits"].append({
                    "text": credit_text,
                    "position": "lower_third",
                    "start_time": branding.get("credits_start_time", 5.0),
                    "duration": 3.0,
                    "style": "minimal",
                    "fade_in": 0.3,
                    "fade_out": 0.3,
                })

        # Add end card for theatrical/teaser
        if profile_key in ["theatrical", "teaser", "festival"]:
            plan["end_card"] = {
                "title": branding.get("title", "UNTITLED"),
                "subtitle": branding.get("subtitle"),
                "release_date": branding.get("release_date"),
                "tagline": branding.get("tagline"),
                "url": branding.get("website_url"),
                "duration": 5.0 if profile_key == "theatrical" else 3.0,
                "style": "elegant",
            }

        return plan

    def _get_position_coords(
        self,
        position: OverlayPosition,
        video_width: int,
        video_height: int,
        element_width: int,
        element_height: int
    ) -> tuple[int, int]:
        """Convert position enum to x,y coordinates."""
        margin = 20

        if isinstance(position, str):
            position = OverlayPosition(position)

        positions = {
            OverlayPosition.TOP_LEFT: (margin, margin),
            OverlayPosition.TOP_CENTER: ((video_width - element_width) // 2, margin),
            OverlayPosition.TOP_RIGHT: (video_width - element_width - margin, margin),
            OverlayPosition.CENTER: (
                (video_width - element_width) // 2,
                (video_height - element_height) // 2
            ),
            OverlayPosition.BOTTOM_LEFT: (margin, video_height - element_height - margin),
            OverlayPosition.BOTTOM_CENTER: (
                (video_width - element_width) // 2,
                video_height - element_height - margin
            ),
            OverlayPosition.BOTTOM_RIGHT: (
                video_width - element_width - margin,
                video_height - element_height - margin
            ),
            OverlayPosition.LOWER_THIRD: (
                (video_width - element_width) // 2,
                int(video_height * 0.75)
            ),
        }

        return positions.get(position, positions[OverlayPosition.CENTER])

    def _build_fade_expression(
        self,
        start_time: float,
        duration: float,
        fade_in: float,
        fade_out: float,
        max_opacity: float
    ) -> str:
        """Build FFmpeg expression for fade in/out alpha."""
        end_time = start_time + duration
        fade_out_start = end_time - fade_out

        return (
            f"if(lt(t,{start_time}),0,"
            f"if(lt(t,{start_time + fade_in}),{max_opacity}*(t-{start_time})/{fade_in},"
            f"if(lt(t,{fade_out_start}),{max_opacity},"
            f"if(lt(t,{end_time}),{max_opacity}*(1-(t-{fade_out_start})/{fade_out}),0))))"
        )

    def _escape_text(self, text: str) -> str:
        """Escape text for FFmpeg drawtext filter."""
        # Escape special characters
        text = text.replace("\\", "\\\\")
        text = text.replace("'", "'\\''")
        text = text.replace(":", "\\:")
        text = text.replace("%", "\\%")
        return text

    def _concat_videos(self, video1: str, video2: str, output: str) -> bool:
        """Concatenate two videos."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(f"file '{video1}'\n")
            f.write(f"file '{video2}'\n")
            concat_file = f.name

        try:
            cmd = [
                self.ffmpeg_path,
                "-f", "concat",
                "-safe", "0",
                "-i", concat_file,
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "18",
                "-c:a", "aac",
                "-y",
                output
            ]
            return self._run_ffmpeg(cmd, "video concatenation")
        finally:
            os.remove(concat_file)

    def _copy_video(self, src: str, dst: str) -> bool:
        """Copy video file."""
        import shutil
        try:
            shutil.copy2(src, dst)
            return True
        except Exception as e:
            logger.error(f"Failed to copy video: {e}")
            return False

    def _get_video_dimensions(self, video_path: str) -> tuple[Optional[int], Optional[int]]:
        """Get video dimensions."""
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0:s=x",
            video_path
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                parts = result.stdout.strip().split("x")
                if len(parts) == 2:
                    return int(parts[0]), int(parts[1])
        except Exception:
            pass
        return None, None

    def _get_video_duration(self, video_path: str) -> float:
        """Get video duration in seconds."""
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                return float(result.stdout.strip())
        except Exception:
            pass
        return 0.0

    def _run_ffmpeg(self, cmd: list, operation: str) -> bool:
        """Run FFmpeg command and handle errors."""
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                logger.error(f"FFmpeg {operation} failed: {result.stderr}")
                return False
            logger.info(f"Successfully completed {operation}")
            return True
        except subprocess.TimeoutExpired:
            logger.error(f"FFmpeg {operation} timed out")
            return False
        except Exception as e:
            logger.error(f"Error during {operation}: {e}")
            return False


class FontManager:
    """
    Manage custom fonts for text rendering.

    Provides trailer-optimized fonts from Google Fonts with automatic
    download and caching. Supports font selection based on style needs.
    """

    # Google Fonts that work well for trailers
    TRAILER_FONTS = {
        "bebas_neue": {
            "family": "Bebas Neue",
            "weights": ["Regular"],
            "style": "bold_condensed",
            "use_case": "Impact text, titles, bold statements",
        },
        "oswald": {
            "family": "Oswald",
            "weights": ["Light", "Regular", "Bold"],
            "style": "condensed",
            "use_case": "Clean, modern titles and subtitles",
        },
        "anton": {
            "family": "Anton",
            "weights": ["Regular"],
            "style": "impact",
            "use_case": "Bold, aggressive titles",
        },
        "playfair_display": {
            "family": "Playfair Display",
            "weights": ["Regular", "Bold", "Italic"],
            "style": "serif",
            "use_case": "Elegant, dramatic titles",
        },
        "roboto_condensed": {
            "family": "Roboto Condensed",
            "weights": ["Light", "Regular", "Bold"],
            "style": "sans_condensed",
            "use_case": "Clean subtitles, credits, secondary text",
        },
        "special_elite": {
            "family": "Special Elite",
            "weights": ["Regular"],
            "style": "typewriter",
            "use_case": "Thriller, mystery, vintage titles",
        },
        "montserrat": {
            "family": "Montserrat",
            "weights": ["Light", "Regular", "Bold", "Black"],
            "style": "geometric",
            "use_case": "Modern, clean titles",
        },
        "abril_fatface": {
            "family": "Abril Fatface",
            "weights": ["Regular"],
            "style": "display_serif",
            "use_case": "Drama, romance titles",
        },
    }

    # Map text card styles to fonts
    STYLE_FONT_MAP = {
        "bold": "bebas_neue",
        "minimal": "oswald",
        "elegant": "playfair_display",
        "gritty": "anton",
        "typewriter": "special_elite",
        "clean": "roboto_condensed",
        "modern": "montserrat",
        "dramatic": "abril_fatface",
    }

    def __init__(self, fonts_dir: str = "/usr/share/fonts/truetype/custom"):
        """
        Initialize FontManager.

        Args:
            fonts_dir: Directory for storing downloaded fonts
        """
        self.fonts_dir = fonts_dir
        self._font_cache: Dict[str, str] = {}

    async def ensure_font(self, font_key: str) -> str:
        """
        Ensure font is available, download if needed.

        Args:
            font_key: Font identifier from TRAILER_FONTS

        Returns:
            Path to the font file

        Raises:
            ValueError: If font_key is unknown
        """
        font_info = self.TRAILER_FONTS.get(font_key)
        if not font_info:
            raise ValueError(f"Unknown font: {font_key}")

        # Check cache first
        if font_key in self._font_cache:
            cached_path = self._font_cache[font_key]
            if os.path.exists(cached_path):
                return cached_path

        # Check if already downloaded
        font_filename = font_info["family"].replace(" ", "") + ".ttf"
        font_path = os.path.join(self.fonts_dir, font_filename)

        if os.path.exists(font_path):
            self._font_cache[font_key] = font_path
            return font_path

        # Download from Google Fonts
        os.makedirs(self.fonts_dir, exist_ok=True)
        await self._download_google_font(font_info["family"], font_path)

        self._font_cache[font_key] = font_path
        return font_path

    async def _download_google_font(self, family: str, output_path: str) -> None:
        """
        Download font from Google Fonts.

        Args:
            family: Font family name
            output_path: Where to save the font file
        """
        try:
            import httpx
        except ImportError:
            logger.warning("httpx not available, using fallback font")
            return

        # Google Fonts CSS URL
        css_url = f"https://fonts.googleapis.com/css2?family={family.replace(' ', '+')}"

        try:
            async with httpx.AsyncClient() as client:
                # Get CSS with font URLs (need User-Agent for woff2 URLs)
                css_response = await client.get(
                    css_url,
                    headers={"User-Agent": "Mozilla/5.0"},
                    timeout=30.0,
                )

                if css_response.status_code != 200:
                    logger.warning(f"Could not fetch font CSS for {family}")
                    return

                # Try to find TTF URL, fallback to WOFF2
                ttf_match = re.search(r"url\((https://[^)]+\.ttf)\)", css_response.text)
                woff2_match = re.search(r"url\((https://[^)]+\.woff2)\)", css_response.text)

                font_url = None
                if ttf_match:
                    font_url = ttf_match.group(1)
                elif woff2_match:
                    font_url = woff2_match.group(1)
                    # Change output extension for woff2
                    output_path = output_path.replace(".ttf", ".woff2")

                if font_url:
                    font_response = await client.get(font_url, timeout=30.0)
                    if font_response.status_code == 200:
                        with open(output_path, "wb") as f:
                            f.write(font_response.content)
                        logger.info(f"Downloaded font {family} to {output_path}")
                    else:
                        logger.warning(f"Failed to download font file for {family}")
                else:
                    logger.warning(f"No font URL found in CSS for {family}")

        except Exception as e:
            logger.error(f"Error downloading font {family}: {e}")

    def get_font_for_style(self, style: str) -> str:
        """
        Get best font key for a given text card style.

        Args:
            style: Text card style ("bold", "minimal", "elegant", etc.)

        Returns:
            Font key to use with ensure_font()
        """
        return self.STYLE_FONT_MAP.get(style, "bebas_neue")

    def get_fallback_font_path(self) -> str:
        """
        Get path to a reliable fallback font.

        Returns:
            Path to fallback font (DejaVu Sans or Liberation Sans)
        """
        fallback_paths = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        ]

        for path in fallback_paths:
            if os.path.exists(path):
                return path

        return fallback_paths[0]  # Return first even if doesn't exist

    def list_available_fonts(self) -> List[Dict[str, Any]]:
        """
        List all available trailer fonts.

        Returns:
            List of font info dicts
        """
        return [
            {
                "key": key,
                "family": info["family"],
                "style": info["style"],
                "use_case": info["use_case"],
            }
            for key, info in self.TRAILER_FONTS.items()
        ]
