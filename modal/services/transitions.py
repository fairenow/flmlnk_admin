"""
Phase 6: Transitions & Speed Effects - Transition Renderer

Professional clip transitions for trailer editing including:
- Crossfade transitions
- Dip to black/white
- Whip pan effects
- Zoom transitions
- Wipe effects
- Hard cuts with impact
"""

import logging
import subprocess
import os
import tempfile
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class TransitionType(Enum):
    """Available transition types for trailer editing."""
    CROSSFADE = "crossfade"
    DIP_TO_BLACK = "dip_to_black"
    DIP_TO_WHITE = "dip_to_white"
    WHIP_PAN = "whip_pan"
    ZOOM_TRANSITION = "zoom_transition"
    WIPE_RIGHT = "wipe_right"
    HARD_CUT = "hard_cut"


@dataclass
class TransitionConfig:
    """Configuration for a transition effect."""
    filter_template: str
    default_duration: float
    requires_audio_crossfade: bool = True
    impact_multiplier: float = 1.0  # For beat-sync emphasis


@dataclass
class ClipTransition:
    """Represents a transition between two clips."""
    from_clip_index: int
    to_clip_index: int
    transition_type: TransitionType
    duration: float
    offset: float  # Time offset from clip start
    custom_params: dict = field(default_factory=dict)


class TransitionRenderer:
    """
    Renders professional transitions between trailer clips.

    Uses FFmpeg xfade filter for seamless clip transitions with
    various effects commonly used in Hollywood trailers.
    """

    TRANSITION_TYPES: dict[str, TransitionConfig] = {
        "crossfade": TransitionConfig(
            filter_template="xfade=transition=fade:duration={duration}:offset={offset}",
            default_duration=0.5,
            requires_audio_crossfade=True,
            impact_multiplier=0.8
        ),
        "dip_to_black": TransitionConfig(
            filter_template="xfade=transition=fadeblack:duration={duration}:offset={offset}",
            default_duration=0.8,
            requires_audio_crossfade=True,
            impact_multiplier=1.2
        ),
        "dip_to_white": TransitionConfig(
            filter_template="xfade=transition=fadewhite:duration={duration}:offset={offset}",
            default_duration=0.6,
            requires_audio_crossfade=True,
            impact_multiplier=1.5
        ),
        "whip_pan": TransitionConfig(
            filter_template="xfade=transition=slideleft:duration={duration}:offset={offset}",
            default_duration=0.3,
            requires_audio_crossfade=False,
            impact_multiplier=1.8
        ),
        "zoom_transition": TransitionConfig(
            filter_template="xfade=transition=zoomin:duration={duration}:offset={offset}",
            default_duration=0.4,
            requires_audio_crossfade=True,
            impact_multiplier=1.4
        ),
        "wipe_right": TransitionConfig(
            filter_template="xfade=transition=wiperight:duration={duration}:offset={offset}",
            default_duration=0.5,
            requires_audio_crossfade=True,
            impact_multiplier=1.0
        ),
        "hard_cut": TransitionConfig(
            filter_template="",  # No filter needed for hard cut
            default_duration=0.0,
            requires_audio_crossfade=False,
            impact_multiplier=2.0
        ),
    }

    # Additional xfade transitions available in FFmpeg
    EXTENDED_TRANSITIONS = {
        "circleclose": "xfade=transition=circleclose:duration={duration}:offset={offset}",
        "circleopen": "xfade=transition=circleopen:duration={duration}:offset={offset}",
        "dissolve": "xfade=transition=dissolve:duration={duration}:offset={offset}",
        "pixelize": "xfade=transition=pixelize:duration={duration}:offset={offset}",
        "radial": "xfade=transition=radial:duration={duration}:offset={offset}",
        "hblur": "xfade=transition=hblur:duration={duration}:offset={offset}",
        "hlslice": "xfade=transition=hlslice:duration={duration}:offset={offset}",
    }

    def __init__(self, ffmpeg_path: str = "ffmpeg"):
        """Initialize the transition renderer."""
        self.ffmpeg_path = ffmpeg_path
        self._validate_ffmpeg()

    def _validate_ffmpeg(self) -> None:
        """Validate FFmpeg is available and supports xfade."""
        try:
            result = subprocess.run(
                [self.ffmpeg_path, "-version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode != 0:
                logger.warning("FFmpeg validation returned non-zero exit code")
        except FileNotFoundError:
            logger.error(f"FFmpeg not found at {self.ffmpeg_path}")
            raise RuntimeError("FFmpeg is required for transition rendering")
        except subprocess.TimeoutExpired:
            logger.warning("FFmpeg validation timed out")

    def get_transition_filter(
        self,
        transition_type: str,
        duration: Optional[float] = None,
        offset: float = 0.0
    ) -> str:
        """
        Get the FFmpeg filter string for a transition type.

        Args:
            transition_type: Type of transition (crossfade, dip_to_black, etc.)
            duration: Transition duration in seconds (uses default if None)
            offset: Time offset for the transition start

        Returns:
            FFmpeg filter string for the transition
        """
        if transition_type not in self.TRANSITION_TYPES:
            logger.warning(f"Unknown transition type: {transition_type}, defaulting to crossfade")
            transition_type = "crossfade"

        config = self.TRANSITION_TYPES[transition_type]

        if transition_type == "hard_cut":
            return ""  # Hard cuts don't need a filter

        actual_duration = duration if duration is not None else config.default_duration

        return config.filter_template.format(
            duration=actual_duration,
            offset=offset
        )

    def render_transition(
        self,
        clip1_path: str,
        clip2_path: str,
        output_path: str,
        transition_type: str = "crossfade",
        duration: Optional[float] = None,
        include_audio: bool = True
    ) -> bool:
        """
        Render a transition between two clips.

        Args:
            clip1_path: Path to the first clip
            clip2_path: Path to the second clip
            output_path: Path for the output file
            transition_type: Type of transition to apply
            duration: Transition duration (uses default if None)
            include_audio: Whether to include audio crossfade

        Returns:
            True if successful, False otherwise
        """
        if not os.path.exists(clip1_path) or not os.path.exists(clip2_path):
            logger.error("One or both input clips do not exist")
            return False

        config = self.TRANSITION_TYPES.get(transition_type, self.TRANSITION_TYPES["crossfade"])
        actual_duration = duration if duration is not None else config.default_duration

        # Get clip1 duration to calculate offset
        clip1_duration = self._get_clip_duration(clip1_path)
        if clip1_duration is None:
            logger.error("Could not determine clip1 duration")
            return False

        offset = clip1_duration - actual_duration

        if transition_type == "hard_cut":
            # For hard cuts, just concatenate
            return self._concat_clips(clip1_path, clip2_path, output_path)

        # Build FFmpeg command for xfade transition
        filter_str = self.get_transition_filter(transition_type, actual_duration, offset)

        # Build filter complex for video transition
        filter_complex = f"[0:v][1:v]{filter_str}[v]"

        # Add audio crossfade if requested and supported
        if include_audio and config.requires_audio_crossfade:
            audio_filter = f";[0:a][1:a]acrossfade=d={actual_duration}:c1=tri:c2=tri[a]"
            filter_complex += audio_filter
            output_maps = ["-map", "[v]", "-map", "[a]"]
        else:
            # Mix audio without crossfade or use first audio
            filter_complex += ";[0:a][1:a]concat=n=2:v=0:a=1[a]"
            output_maps = ["-map", "[v]", "-map", "[a]"]

        cmd = [
            self.ffmpeg_path,
            "-i", clip1_path,
            "-i", clip2_path,
            "-filter_complex", filter_complex,
            *output_maps,
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
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
                logger.error(f"FFmpeg transition failed: {result.stderr}")
                return False

            logger.info(f"Successfully rendered {transition_type} transition to {output_path}")
            return True

        except subprocess.TimeoutExpired:
            logger.error("Transition rendering timed out")
            return False
        except Exception as e:
            logger.error(f"Error rendering transition: {e}")
            return False

    def render_multi_clip_sequence(
        self,
        clips: list[str],
        transitions: list[ClipTransition],
        output_path: str,
        include_audio: bool = True
    ) -> bool:
        """
        Render a sequence of clips with transitions between them.

        Args:
            clips: List of clip paths in order
            transitions: List of transitions between clips
            output_path: Path for the final output
            include_audio: Whether to include audio

        Returns:
            True if successful, False otherwise
        """
        if len(clips) < 2:
            logger.error("Need at least 2 clips for transitions")
            return False

        if len(transitions) != len(clips) - 1:
            logger.warning("Transition count doesn't match clips, using defaults")
            transitions = self._generate_default_transitions(len(clips))

        # Process clips pairwise with transitions
        temp_files = []
        current_clip = clips[0]

        try:
            for i, (next_clip, transition) in enumerate(zip(clips[1:], transitions)):
                temp_output = tempfile.mktemp(suffix=".mp4")
                temp_files.append(temp_output)

                success = self.render_transition(
                    current_clip,
                    next_clip,
                    temp_output,
                    transition.transition_type.value,
                    transition.duration,
                    include_audio
                )

                if not success:
                    logger.error(f"Failed to render transition {i}")
                    return False

                current_clip = temp_output

            # Move final result to output path
            if temp_files:
                os.rename(temp_files[-1], output_path)
                temp_files.pop()

            logger.info(f"Successfully rendered {len(clips)} clips with transitions")
            return True

        finally:
            # Clean up temp files
            for temp_file in temp_files:
                if os.path.exists(temp_file):
                    os.remove(temp_file)

    def _generate_default_transitions(self, clip_count: int) -> list[ClipTransition]:
        """Generate default transitions for a clip sequence."""
        transitions = []
        for i in range(clip_count - 1):
            # Alternate between crossfade and dip_to_black
            t_type = TransitionType.CROSSFADE if i % 2 == 0 else TransitionType.DIP_TO_BLACK
            transitions.append(ClipTransition(
                from_clip_index=i,
                to_clip_index=i + 1,
                transition_type=t_type,
                duration=self.TRANSITION_TYPES[t_type.value].default_duration,
                offset=0.0
            ))
        return transitions

    def _get_clip_duration(self, clip_path: str) -> Optional[float]:
        """Get the duration of a clip in seconds."""
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            clip_path
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                return float(result.stdout.strip())
            return None

        except (subprocess.TimeoutExpired, ValueError):
            return None

    def _concat_clips(self, clip1: str, clip2: str, output: str) -> bool:
        """Concatenate two clips without transition (hard cut)."""
        # Create concat file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(f"file '{clip1}'\n")
            f.write(f"file '{clip2}'\n")
            concat_file = f.name

        try:
            cmd = [
                self.ffmpeg_path,
                "-f", "concat",
                "-safe", "0",
                "-i", concat_file,
                "-c", "copy",
                "-y",
                output
            ]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            return result.returncode == 0

        finally:
            os.remove(concat_file)

    def select_transition_for_scene(
        self,
        scene_importance: float,
        is_beat_aligned: bool,
        scene_emotion: Optional[str] = None
    ) -> tuple[str, float]:
        """
        Intelligently select a transition type based on scene characteristics.

        Args:
            scene_importance: Score from 0-1 indicating scene importance
            is_beat_aligned: Whether the cut aligns with a music beat
            scene_emotion: Emotional context (action, dramatic, calm, etc.)

        Returns:
            Tuple of (transition_type, duration)
        """
        # High importance scenes on beats get impactful transitions
        if is_beat_aligned and scene_importance > 0.8:
            if scene_emotion in ["action", "intense", "climax"]:
                return ("whip_pan", 0.25)
            elif scene_emotion in ["dramatic", "emotional", "reveal"]:
                return ("dip_to_white", 0.6)
            else:
                return ("zoom_transition", 0.35)

        # Beat-aligned but lower importance
        if is_beat_aligned:
            return ("hard_cut", 0.0)

        # High importance but not beat-aligned
        if scene_importance > 0.7:
            if scene_emotion == "dramatic":
                return ("dip_to_black", 0.8)
            return ("crossfade", 0.6)

        # Medium importance scenes
        if scene_importance > 0.4:
            return ("crossfade", 0.4)

        # Low importance - quick transitions
        return ("hard_cut", 0.0)

    def create_transition_plan(
        self,
        scenes: list[dict],
        beat_times: Optional[list[float]] = None
    ) -> list[dict]:
        """
        Create a transition plan for a list of scenes.

        Args:
            scenes: List of scene dicts with 'importance', 'emotion', 'start', 'end'
            beat_times: Optional list of music beat timestamps

        Returns:
            List of transition plans with type and duration
        """
        transition_plan = []
        beat_set = set(beat_times) if beat_times else set()

        for i in range(len(scenes) - 1):
            current_scene = scenes[i]
            next_scene = scenes[i + 1]

            # Check if transition point aligns with a beat
            transition_time = current_scene.get("end", 0)
            is_beat_aligned = any(
                abs(transition_time - beat) < 0.1
                for beat in beat_set
            )

            # Get scene characteristics
            importance = next_scene.get("importance", 0.5)
            emotion = next_scene.get("emotion", "neutral")

            transition_type, duration = self.select_transition_for_scene(
                importance,
                is_beat_aligned,
                emotion
            )

            transition_plan.append({
                "from_scene": i,
                "to_scene": i + 1,
                "transition_type": transition_type,
                "duration": duration,
                "is_beat_aligned": is_beat_aligned,
                "offset": transition_time - duration / 2
            })

        return transition_plan
