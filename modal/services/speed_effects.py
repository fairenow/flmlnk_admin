"""
Phase 6: Transitions & Speed Effects - Speed Ramping

Professional speed ramping effects for trailer editing including:
- Slow motion moments for dramatic impact
- Speed ramping with easing curves
- Quick cuts with acceleration
- Time remapping for emphasis
"""

import logging
import subprocess
import os
import math
import tempfile
from dataclasses import dataclass
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class EasingType(Enum):
    """Easing types for speed transitions."""
    LINEAR = "linear"
    EASE_IN = "ease_in"
    EASE_OUT = "ease_out"
    EASE_IN_OUT = "ease_in_out"
    EXPONENTIAL_IN = "exponential_in"
    EXPONENTIAL_OUT = "exponential_out"
    BOUNCE = "bounce"


@dataclass
class SpeedRamp:
    """Configuration for a speed ramp effect."""
    start_time: float  # Start time in the clip
    end_time: float  # End time in the clip
    start_speed: float  # Starting speed multiplier (1.0 = normal)
    end_speed: float  # Ending speed multiplier
    easing: EasingType = EasingType.EASE_IN_OUT


@dataclass
class SlowMotionMoment:
    """Configuration for a slow motion moment."""
    timestamp: float  # Center timestamp for the slow motion
    duration: float  # Duration of the slow motion effect
    speed_factor: float  # Speed multiplier (0.25 = 4x slower)
    ramp_in_duration: float = 0.3  # Time to ramp into slow motion
    ramp_out_duration: float = 0.3  # Time to ramp out of slow motion


class SpeedRamper:
    """
    Applies professional speed ramping effects to trailer clips.

    Uses FFmpeg setpts filter with expressions for smooth speed
    transitions and dramatic slow motion moments.
    """

    # Easing function expressions for FFmpeg
    EASING_EXPRESSIONS = {
        EasingType.LINEAR: "T",
        EasingType.EASE_IN: "T*T",
        EasingType.EASE_OUT: "1-(1-T)*(1-T)",
        EasingType.EASE_IN_OUT: "if(lt(T,0.5),2*T*T,1-2*(1-T)*(1-T))",
        EasingType.EXPONENTIAL_IN: "pow(2,10*(T-1))",
        EasingType.EXPONENTIAL_OUT: "1-pow(2,-10*T)",
        EasingType.BOUNCE: "abs(sin(T*PI*2.5)*exp(-T*3))",
    }

    def __init__(self, ffmpeg_path: str = "ffmpeg"):
        """Initialize the speed ramper."""
        self.ffmpeg_path = ffmpeg_path

    def apply_constant_speed(
        self,
        input_path: str,
        output_path: str,
        speed_factor: float,
        maintain_pitch: bool = True
    ) -> bool:
        """
        Apply a constant speed change to a clip.

        Args:
            input_path: Path to input video
            output_path: Path for output video
            speed_factor: Speed multiplier (0.5 = half speed, 2.0 = double speed)
            maintain_pitch: Whether to maintain audio pitch during speed change

        Returns:
            True if successful, False otherwise
        """
        if speed_factor <= 0:
            logger.error("Speed factor must be positive")
            return False

        # Video speed: setpts filter (inverse of speed factor)
        pts_factor = 1.0 / speed_factor
        video_filter = f"setpts={pts_factor}*PTS"

        # Audio speed: atempo filter (can only do 0.5-2.0 at a time)
        audio_filters = self._build_atempo_chain(speed_factor)

        # Combine audio filters
        audio_filter_str = ",".join(audio_filters) if audio_filters else "anull"

        cmd = [
            self.ffmpeg_path,
            "-i", input_path,
            "-filter_complex",
            f"[0:v]{video_filter}[v];[0:a]{audio_filter_str}[a]",
            "-map", "[v]",
            "-map", "[a]",
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
                logger.error(f"Speed change failed: {result.stderr}")
                return False

            logger.info(f"Applied {speed_factor}x speed to {output_path}")
            return True

        except subprocess.TimeoutExpired:
            logger.error("Speed change timed out")
            return False
        except Exception as e:
            logger.error(f"Error applying speed change: {e}")
            return False

    def _build_atempo_chain(self, speed_factor: float) -> list[str]:
        """
        Build a chain of atempo filters for the target speed.

        atempo only supports values between 0.5 and 2.0, so we chain
        multiple filters for more extreme speed changes.
        """
        if speed_factor == 1.0:
            return ["anull"]

        filters = []
        remaining = speed_factor

        # Handle speeds > 2.0
        while remaining > 2.0:
            filters.append("atempo=2.0")
            remaining /= 2.0

        # Handle speeds < 0.5
        while remaining < 0.5:
            filters.append("atempo=0.5")
            remaining /= 0.5

        # Add final adjustment
        if remaining != 1.0:
            filters.append(f"atempo={remaining}")

        return filters if filters else ["anull"]

    def apply_speed_ramp(
        self,
        input_path: str,
        output_path: str,
        ramp: SpeedRamp
    ) -> bool:
        """
        Apply a speed ramp effect between two speeds.

        Args:
            input_path: Path to input video
            output_path: Path for output video
            ramp: SpeedRamp configuration

        Returns:
            True if successful, False otherwise
        """
        # Get clip duration
        duration = self._get_clip_duration(input_path)
        if duration is None:
            logger.error("Could not determine clip duration")
            return False

        # Build the setpts expression for ramping
        ramp_duration = ramp.end_time - ramp.start_time
        easing_expr = self.EASING_EXPRESSIONS.get(
            ramp.easing,
            self.EASING_EXPRESSIONS[EasingType.LINEAR]
        )

        # Create time-based speed expression
        # T = normalized time within ramp (0 to 1)
        # Speed transitions from start_speed to end_speed
        speed_diff = ramp.end_speed - ramp.start_speed

        # Complex expression for speed ramping
        video_filter = self._build_ramp_filter(ramp, duration)

        cmd = [
            self.ffmpeg_path,
            "-i", input_path,
            "-filter_complex",
            f"[0:v]{video_filter}[v];[0:a]anull[a]",
            "-map", "[v]",
            "-map", "[a]",
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
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
                logger.error(f"Speed ramp failed: {result.stderr}")
                return False

            logger.info(f"Applied speed ramp to {output_path}")
            return True

        except subprocess.TimeoutExpired:
            logger.error("Speed ramp timed out")
            return False
        except Exception as e:
            logger.error(f"Error applying speed ramp: {e}")
            return False

    def _build_ramp_filter(self, ramp: SpeedRamp, duration: float) -> str:
        """
        Build a setpts filter expression for speed ramping.

        The setpts filter adjusts presentation timestamps.
        For ramping speed, we need to calculate the accumulated
        time offset based on the varying speed.
        """
        # For simplicity, we use a piecewise approach:
        # Before ramp: normal speed or start_speed
        # During ramp: interpolate between start and end speed
        # After ramp: end_speed

        # Calculate PTS multipliers (inverse of speed)
        start_pts = 1.0 / ramp.start_speed
        end_pts = 1.0 / ramp.end_speed

        # Build expression with conditions
        ramp_start = ramp.start_time
        ramp_end = ramp.end_time

        # Normalized position within ramp
        # T = (t - ramp_start) / (ramp_end - ramp_start)
        t_normalized = f"((T-{ramp_start})/({ramp_end}-{ramp_start}))"

        # Easing applied to normalized time
        easing = self.EASING_EXPRESSIONS.get(
            ramp.easing,
            "T"
        ).replace("T", t_normalized)

        # Speed factor at current time (interpolated)
        speed_interp = f"({ramp.start_speed}+{easing}*({ramp.end_speed}-{ramp.start_speed}))"

        # For setpts, we need the cumulative time, which is complex with varying speed
        # Simplified approach: segment the video and use different speeds
        # For now, use a simpler approximation with if conditions

        filter_expr = (
            f"setpts="
            f"if(lt(T,{ramp_start}),"
            f"{start_pts}*PTS,"  # Before ramp
            f"if(lt(T,{ramp_end}),"
            f"({start_pts}+({end_pts}-{start_pts})*((T-{ramp_start})/{ramp_end - ramp_start}))*PTS,"  # During ramp (linear approx)
            f"{end_pts}*PTS))"  # After ramp
        )

        return filter_expr

    def create_slow_motion_moment(
        self,
        input_path: str,
        output_path: str,
        moment: SlowMotionMoment
    ) -> bool:
        """
        Create a dramatic slow motion moment with smooth ramps.

        This creates the "time freeze" effect often used in trailers
        where action slows down for emphasis then speeds back up.

        Args:
            input_path: Path to input video
            output_path: Path for output video
            moment: SlowMotionMoment configuration

        Returns:
            True if successful, False otherwise
        """
        # Get clip info
        duration = self._get_clip_duration(input_path)
        if duration is None:
            logger.error("Could not determine clip duration")
            return False

        # Calculate timing
        slow_start = moment.timestamp - moment.duration / 2
        slow_end = moment.timestamp + moment.duration / 2

        ramp_in_start = slow_start - moment.ramp_in_duration
        ramp_out_end = slow_end + moment.ramp_out_duration

        # Clamp to valid range
        ramp_in_start = max(0, ramp_in_start)
        ramp_out_end = min(duration, ramp_out_end)

        # Build complex expression for the slow motion moment
        video_filter = self._build_slow_motion_filter(
            moment,
            ramp_in_start,
            slow_start,
            slow_end,
            ramp_out_end
        )

        # For audio, we need to adjust tempo to match
        # This is complex, so we'll just fade audio during slow-mo
        audio_filter = self._build_slow_motion_audio_filter(
            moment,
            ramp_in_start,
            slow_start,
            slow_end,
            ramp_out_end
        )

        cmd = [
            self.ffmpeg_path,
            "-i", input_path,
            "-filter_complex",
            f"[0:v]{video_filter}[v];[0:a]{audio_filter}[a]",
            "-map", "[v]",
            "-map", "[a]",
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
                logger.error(f"Slow motion failed: {result.stderr}")
                return False

            logger.info(f"Created slow motion moment at {moment.timestamp}s")
            return True

        except subprocess.TimeoutExpired:
            logger.error("Slow motion processing timed out")
            return False
        except Exception as e:
            logger.error(f"Error creating slow motion: {e}")
            return False

    def _build_slow_motion_filter(
        self,
        moment: SlowMotionMoment,
        ramp_in_start: float,
        slow_start: float,
        slow_end: float,
        ramp_out_end: float
    ) -> str:
        """Build the setpts filter for slow motion with ramps."""
        speed = moment.speed_factor
        pts_slow = 1.0 / speed  # Slow motion PTS multiplier

        # Simplified approach using segmented speeds
        # Before ramp: 1x speed
        # Ramp in: gradually slow down
        # Slow section: constant slow speed
        # Ramp out: gradually speed up
        # After ramp: 1x speed

        # Calculate intermediate positions for ramping
        ramp_in_duration = slow_start - ramp_in_start
        ramp_out_duration = ramp_out_end - slow_end

        filter_expr = (
            f"setpts="
            f"if(lt(T,{ramp_in_start}),"
            f"PTS,"  # Normal speed before ramp
            f"if(lt(T,{slow_start}),"
            f"(1+({pts_slow}-1)*((T-{ramp_in_start})/{ramp_in_duration}))*PTS,"  # Ramp in
            f"if(lt(T,{slow_end}),"
            f"{pts_slow}*PTS,"  # Full slow motion
            f"if(lt(T,{ramp_out_end}),"
            f"({pts_slow}+(1-{pts_slow})*((T-{slow_end})/{ramp_out_duration}))*PTS,"  # Ramp out
            f"PTS))))"  # Normal speed after
        )

        return filter_expr

    def _build_slow_motion_audio_filter(
        self,
        moment: SlowMotionMoment,
        ramp_in_start: float,
        slow_start: float,
        slow_end: float,
        ramp_out_end: float
    ) -> str:
        """Build audio filter for slow motion (fade/pitch shift)."""
        # Option 1: Lower pitch and slow audio (complex)
        # Option 2: Fade out audio during slow-mo (simpler, cinematic)

        # Using option 2: fade audio during slow motion for dramatic effect
        fade_out_start = ramp_in_start
        fade_in_start = slow_end

        # Volume envelope: fade to 30% during slow-mo for dramatic effect
        return (
            f"volume=eval=frame:"
            f"volume='if(lt(t,{fade_out_start}),1,"
            f"if(lt(t,{slow_start}),1-0.7*((t-{fade_out_start})/{slow_start - fade_out_start}),"
            f"if(lt(t,{slow_end}),0.3,"
            f"if(lt(t,{ramp_out_end}),0.3+0.7*((t-{slow_end})/{ramp_out_end - slow_end}),1))))'"
        )

    def identify_slow_motion_candidates(
        self,
        scenes: list[dict],
        beat_times: Optional[list[float]] = None,
        max_slow_moments: int = 3
    ) -> list[SlowMotionMoment]:
        """
        Identify optimal moments for slow motion effects.

        Uses scene importance, beat alignment, and emotional context
        to select the most impactful slow motion moments.

        Args:
            scenes: List of scene dicts with importance scores
            beat_times: Optional list of music beat timestamps
            max_slow_moments: Maximum number of slow motion moments

        Returns:
            List of SlowMotionMoment configurations
        """
        candidates = []

        for scene in scenes:
            importance = scene.get("importance", 0)
            emotion = scene.get("emotion", "")
            start = scene.get("start", 0)
            end = scene.get("end", 0)

            # Only consider high-importance scenes
            if importance < 0.7:
                continue

            # Prefer action/dramatic moments
            if emotion not in ["action", "dramatic", "climax", "intense", "reveal"]:
                continue

            # Find the midpoint as the slow-mo center
            midpoint = (start + end) / 2

            # Check for beat alignment if beats are provided
            is_near_beat = False
            if beat_times:
                is_near_beat = any(
                    abs(midpoint - beat) < 0.5
                    for beat in beat_times
                )

            # Calculate score for this candidate
            score = importance
            if is_near_beat:
                score += 0.2
            if emotion in ["climax", "reveal"]:
                score += 0.1

            # Calculate appropriate speed factor based on emotion
            if emotion in ["action", "intense"]:
                speed_factor = 0.3  # Very slow for action
            elif emotion == "climax":
                speed_factor = 0.25  # Slowest for climax
            else:
                speed_factor = 0.4  # Moderately slow

            candidates.append({
                "timestamp": midpoint,
                "score": score,
                "speed_factor": speed_factor,
                "scene_duration": end - start
            })

        # Sort by score and take top candidates
        candidates.sort(key=lambda x: x["score"], reverse=True)
        top_candidates = candidates[:max_slow_moments]

        # Convert to SlowMotionMoment objects
        moments = []
        for c in top_candidates:
            # Duration scales with scene duration but capped
            duration = min(c["scene_duration"] * 0.3, 1.5)
            duration = max(duration, 0.5)  # Minimum 0.5 seconds

            moments.append(SlowMotionMoment(
                timestamp=c["timestamp"],
                duration=duration,
                speed_factor=c["speed_factor"],
                ramp_in_duration=0.3,
                ramp_out_duration=0.3
            ))

        return moments

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

    def create_speed_effect_plan(
        self,
        scenes: list[dict],
        beat_times: Optional[list[float]] = None
    ) -> list[dict]:
        """
        Create a comprehensive speed effect plan for trailer scenes.

        Args:
            scenes: List of scene dicts
            beat_times: Optional music beat times

        Returns:
            List of speed effect configurations
        """
        speed_plan = []

        # Identify slow motion candidates
        slow_moments = self.identify_slow_motion_candidates(
            scenes,
            beat_times,
            max_slow_moments=3
        )

        # Add slow motion moments to plan
        for moment in slow_moments:
            speed_plan.append({
                "type": "slow_motion",
                "timestamp": moment.timestamp,
                "duration": moment.duration,
                "speed_factor": moment.speed_factor,
                "ramp_in": moment.ramp_in_duration,
                "ramp_out": moment.ramp_out_duration
            })

        # Add speed ramps at key transitions
        for i, scene in enumerate(scenes[:-1]):
            next_scene = scenes[i + 1]

            # Check if importance drops significantly (good for speed-up)
            importance_diff = scene.get("importance", 0) - next_scene.get("importance", 0)

            if importance_diff > 0.3:
                # Speed up at end of high-importance scene
                speed_plan.append({
                    "type": "speed_ramp",
                    "start_time": scene.get("end", 0) - 0.5,
                    "end_time": scene.get("end", 0),
                    "start_speed": 1.0,
                    "end_speed": 1.5,
                    "easing": "ease_in"
                })
            elif importance_diff < -0.3:
                # Slow down into high-importance scene
                speed_plan.append({
                    "type": "speed_ramp",
                    "start_time": next_scene.get("start", 0),
                    "end_time": next_scene.get("start", 0) + 0.5,
                    "start_speed": 1.2,
                    "end_speed": 1.0,
                    "easing": "ease_out"
                })

        return speed_plan
