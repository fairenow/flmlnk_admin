"""
Trailer Audio Mixer.

Mixes dialogue, music, and SFX for professional trailer output.
Uses FFmpeg for audio processing with loudness normalization and dialogue ducking.
"""

import os
import subprocess
import tempfile
from typing import List, Dict, Any, Optional


class TrailerAudioMixer:
    """Mix dialogue, music, and SFX for trailer output."""

    # Loudness targets by platform
    LOUDNESS_TARGETS = {
        "web": -14,  # Web/streaming platforms
        "theatrical": -24,  # Cinema/broadcast
        "mobile": -12,  # Mobile-first (louder for small speakers)
    }

    def __init__(self, job_id: str = ""):
        self.job_id = job_id

    def mix_trailer_audio(
        self,
        video_with_dialogue: str,
        music_path: str,
        output_path: str,
        dialogue_level_db: float = -12,
        music_level_db: float = -18,
        target_lufs: float = -14,
        dialogue_windows: Optional[List[Dict[str, Any]]] = None,
    ) -> bool:
        """Mix video audio with music bed, applying ducking and normalization.

        Args:
            video_with_dialogue: Path to video with original audio
            music_path: Path to music bed audio file
            output_path: Output video path
            dialogue_level_db: Target dialogue level (-12 to -6 dB typical)
            music_level_db: Base music level (-18 to -12 dB typical)
            target_lufs: Final loudness target (-14 web, -24 theatrical)
            dialogue_windows: List of {startSec, endSec, importance} for ducking

        Returns:
            True if successful, False otherwise
        """
        # Build ducking filter for music
        if dialogue_windows:
            duck_filter = self._build_duck_filter(dialogue_windows, music_level_db)
        else:
            duck_filter = f"volume={music_level_db}dB"

        # FFmpeg filter_complex for mixing
        # [0:a] = dialogue from video
        # [1:a] = music bed
        filter_complex = (
            f"[0:a]volume={dialogue_level_db}dB[dialogue];"
            f"[1:a]{duck_filter}[music];"
            f"[dialogue][music]amix=inputs=2:duration=first:dropout_transition=2[mixed];"
            f"[mixed]loudnorm=I={target_lufs}:TP=-1:LRA=11[final]"
        )

        cmd = [
            "ffmpeg", "-y",
            "-i", video_with_dialogue,
            "-i", music_path,
            "-filter_complex", filter_complex,
            "-map", "0:v",  # Video from first input
            "-map", "[final]",  # Mixed audio
            "-c:v", "copy",  # Don't re-encode video
            "-c:a", "aac", "-b:a", "192k",
            output_path,
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"[{self.job_id}] Audio mix failed: {result.stderr}")
                return False
            return True
        except Exception as e:
            print(f"[{self.job_id}] Audio mix error: {e}")
            return False

    def mix_trailer_audio_with_sfx(
        self,
        video_with_dialogue: str,
        music_path: Optional[str],
        sfx_paths: List[Dict[str, Any]],
        output_path: str,
        dialogue_level_db: float = -12,
        music_level_db: float = -18,
        sfx_level_db: float = -6,
        target_lufs: float = -14,
        dialogue_windows: Optional[List[Dict[str, Any]]] = None,
    ) -> bool:
        """Mix video audio with music and SFX, applying ducking and normalization.

        Args:
            video_with_dialogue: Path to video with original audio
            music_path: Path to music bed audio file (optional)
            sfx_paths: List of {path, atSec, intensity, durationSec} for each SFX
            output_path: Output video path
            dialogue_level_db: Target dialogue level (-12 to -6 dB typical)
            music_level_db: Base music level (-18 to -12 dB typical)
            sfx_level_db: Base SFX level (-6 to 0 dB typical)
            target_lufs: Final loudness target (-14 web, -24 theatrical)
            dialogue_windows: List of {startSec, endSec, importance} for ducking

        Returns:
            True if successful, False otherwise
        """
        if not sfx_paths and not music_path:
            # Nothing to mix, just normalize
            return self.normalize_audio(video_with_dialogue, output_path, target_lufs)

        # Build input list: [0] = video, [1] = music (if present), [2+] = SFX
        inputs = ["-i", video_with_dialogue]
        input_count = 1

        music_input_idx = -1
        if music_path and os.path.exists(music_path):
            inputs.extend(["-i", music_path])
            music_input_idx = input_count
            input_count += 1

        # Map SFX files - group by unique path since same SFX can be reused
        sfx_input_map = {}  # path -> input index
        for sfx in sfx_paths:
            sfx_file = sfx.get("path")
            if sfx_file and os.path.exists(sfx_file) and sfx_file not in sfx_input_map:
                inputs.extend(["-i", sfx_file])
                sfx_input_map[sfx_file] = input_count
                input_count += 1

        # Build filter_complex
        filter_parts = []

        # Dialogue processing
        filter_parts.append(f"[0:a]volume={dialogue_level_db}dB[dialogue]")

        # Music processing with ducking
        if music_input_idx >= 0:
            if dialogue_windows:
                duck_filter = self._build_duck_filter(dialogue_windows, music_level_db)
            else:
                duck_filter = f"volume={music_level_db}dB"
            filter_parts.append(f"[{music_input_idx}:a]{duck_filter}[music]")

        # SFX processing - each SFX placed at specific time with adelay
        sfx_labels = []
        for i, sfx in enumerate(sfx_paths):
            sfx_file = sfx.get("path")
            if not sfx_file or sfx_file not in sfx_input_map:
                continue

            input_idx = sfx_input_map[sfx_file]
            at_sec = sfx.get("atSec", 0)
            intensity = sfx.get("intensity", 1.0)
            delay_ms = int(at_sec * 1000)

            # Apply volume based on intensity and base level
            sfx_volume = sfx_level_db + (6 * (intensity - 1))  # intensity 1.0 = base, 0.5 = -3dB

            label = f"sfx{i}"
            # adelay=delays|delays (left|right for stereo)
            filter_parts.append(
                f"[{input_idx}:a]adelay={delay_ms}|{delay_ms},volume={sfx_volume}dB[{label}]"
            )
            sfx_labels.append(f"[{label}]")

        # Count total audio streams to mix
        mix_inputs = ["[dialogue]"]
        if music_input_idx >= 0:
            mix_inputs.append("[music]")
        mix_inputs.extend(sfx_labels)

        mix_count = len(mix_inputs)

        if mix_count == 1:
            # Only dialogue, just normalize
            filter_parts.append(f"[dialogue]loudnorm=I={target_lufs}:TP=-1:LRA=11[final]")
        else:
            # Mix all streams
            mix_str = "".join(mix_inputs)
            filter_parts.append(
                f"{mix_str}amix=inputs={mix_count}:duration=first:dropout_transition=2[mixed];"
                f"[mixed]loudnorm=I={target_lufs}:TP=-1:LRA=11[final]"
            )

        filter_complex = ";".join(filter_parts)

        cmd = [
            "ffmpeg", "-y",
            *inputs,
            "-filter_complex", filter_complex,
            "-map", "0:v",  # Video from first input
            "-map", "[final]",  # Mixed audio
            "-c:v", "copy",  # Don't re-encode video
            "-c:a", "aac", "-b:a", "192k",
            output_path,
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"[{self.job_id}] Audio mix with SFX failed: {result.stderr}")
                return False
            return True
        except Exception as e:
            print(f"[{self.job_id}] Audio mix with SFX error: {e}")
            return False

    def _build_duck_filter(
        self,
        dialogue_windows: List[Dict[str, Any]],
        base_music_db: float,
    ) -> str:
        """Build FFmpeg volume automation for music ducking.

        Args:
            dialogue_windows: List of {startSec, endSec, importance} dicts
            base_music_db: Base music level in dB

        Returns:
            FFmpeg filter string for music track
        """
        if not dialogue_windows:
            return f"volume={base_music_db}dB"

        # Create volume automation points
        # When dialogue is present, duck music by importance * 6dB
        volume_filters = []

        for window in dialogue_windows:
            start = window.get("startSec", 0)
            end = window.get("endSec", start + 2)
            importance = window.get("importance", 0.7)

            # Duck amount: higher importance = more ducking
            duck_db = base_music_db - (6 * importance)

            # Fade in/out duration for smooth transitions
            fade_duration = 0.3

            # Create enable expression for this window
            # Volume will be lower during dialogue windows
            volume_filters.append(
                f"volume=enable='between(t,{start-fade_duration},{end+fade_duration})':"
                f"volume='{duck_db}dB'"
            )

        # Combine filters - apply base level, then ducking overlays
        base_filter = f"volume={base_music_db}dB"

        if volume_filters:
            # Chain all volume filters
            return f"{base_filter}," + ",".join(volume_filters)

        return base_filter

    def normalize_audio(
        self,
        input_path: str,
        output_path: str,
        target_lufs: float = -14,
        target_tp: float = -1,
        target_lra: float = 11,
    ) -> bool:
        """Normalize audio to target loudness using EBU R128.

        Args:
            input_path: Path to input video/audio
            output_path: Path for normalized output
            target_lufs: Target integrated loudness (LUFS)
            target_tp: Target true peak (dBTP)
            target_lra: Target loudness range (LU)

        Returns:
            True if successful, False otherwise
        """
        # Two-pass loudnorm for better quality
        # First pass: analyze
        analyze_cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-af", f"loudnorm=I={target_lufs}:TP={target_tp}:LRA={target_lra}:print_format=json",
            "-f", "null", "-"
        ]

        try:
            result = subprocess.run(analyze_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"[{self.job_id}] Loudness analysis failed: {result.stderr}")
                # Fall back to single-pass
                return self._single_pass_normalize(
                    input_path, output_path, target_lufs, target_tp, target_lra
                )

            # Parse measured values from stderr (FFmpeg outputs there)
            # For simplicity, use single-pass with dynamic mode
            return self._single_pass_normalize(
                input_path, output_path, target_lufs, target_tp, target_lra
            )

        except Exception as e:
            print(f"[{self.job_id}] Normalize error: {e}")
            return False

    def _single_pass_normalize(
        self,
        input_path: str,
        output_path: str,
        target_lufs: float,
        target_tp: float,
        target_lra: float,
    ) -> bool:
        """Single-pass loudness normalization."""
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-af", f"loudnorm=I={target_lufs}:TP={target_tp}:LRA={target_lra}",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            output_path,
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"[{self.job_id}] Single-pass normalize failed: {result.stderr}")
                return False
            return True
        except Exception as e:
            print(f"[{self.job_id}] Single-pass normalize error: {e}")
            return False

    def extract_audio(
        self,
        video_path: str,
        output_path: str,
        format: str = "wav",
    ) -> bool:
        """Extract audio from video file.

        Args:
            video_path: Path to video file
            output_path: Path for extracted audio
            format: Output format (wav, mp3, aac)

        Returns:
            True if successful, False otherwise
        """
        codec_map = {
            "wav": ["pcm_s16le", "-ar", "44100"],
            "mp3": ["libmp3lame", "-b:a", "192k"],
            "aac": ["aac", "-b:a", "192k"],
        }

        codec_args = codec_map.get(format, codec_map["wav"])

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vn",  # No video
            "-c:a", codec_args[0],
        ]
        if len(codec_args) > 1:
            cmd.extend(codec_args[1:])
        cmd.append(output_path)

        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"[{self.job_id}] Audio extraction failed: {result.stderr}")
                return False
            return True
        except Exception as e:
            print(f"[{self.job_id}] Audio extraction error: {e}")
            return False

    def analyze_audio_levels(self, audio_path: str) -> Optional[Dict[str, float]]:
        """Analyze audio levels of a file.

        Args:
            audio_path: Path to audio file

        Returns:
            Dict with lufs, peak_db, lra or None if analysis fails
        """
        cmd = [
            "ffmpeg",
            "-i", audio_path,
            "-af", "ebur128=peak=true",
            "-f", "null", "-"
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            stderr = result.stderr

            # Parse the output
            # Look for "I: -X.X LUFS" and "Peak: -X.X dBFS"
            lufs = None
            peak = None
            lra = None

            for line in stderr.split("\n"):
                if "I:" in line and "LUFS" in line:
                    try:
                        # Extract LUFS value
                        parts = line.split("I:")[-1].strip().split()
                        lufs = float(parts[0])
                    except (ValueError, IndexError):
                        pass
                elif "Peak:" in line and "dBFS" in line:
                    try:
                        parts = line.split("Peak:")[-1].strip().split()
                        peak = float(parts[0])
                    except (ValueError, IndexError):
                        pass
                elif "LRA:" in line and "LU" in line:
                    try:
                        parts = line.split("LRA:")[-1].strip().split()
                        lra = float(parts[0])
                    except (ValueError, IndexError):
                        pass

            if lufs is not None:
                return {
                    "lufs": lufs,
                    "peak_db": peak or 0,
                    "lra": lra or 0,
                }

            return None

        except Exception as e:
            print(f"[{self.job_id}] Audio analysis error: {e}")
            return None


def get_target_lufs_for_profile(profile_key: str) -> float:
    """Get target LUFS for a profile.

    Args:
        profile_key: Trailer profile key

    Returns:
        Target LUFS value
    """
    # Theatrical/broadcast profiles need lower loudness
    theatrical_profiles = {"theatrical", "festival", "tv_spot_30", "tv_spot_60"}

    if profile_key in theatrical_profiles:
        return -24  # Broadcast standard

    # Social/web profiles can be louder
    return -14  # Web standard


def get_mixing_levels_for_profile(
    profile_key: str,
) -> Dict[str, float]:
    """Get mixing level recommendations for a profile.

    Args:
        profile_key: Trailer profile key

    Returns:
        Dict with dialogue_level_db, music_level_db
    """
    # Different profiles emphasize different elements
    level_presets = {
        "theatrical": {"dialogue_level_db": -12, "music_level_db": -15},
        "teaser": {"dialogue_level_db": -15, "music_level_db": -12},  # Music forward
        "festival": {"dialogue_level_db": -10, "music_level_db": -18},  # Dialogue forward
        "social_vertical": {"dialogue_level_db": -10, "music_level_db": -14},
        "social_square": {"dialogue_level_db": -10, "music_level_db": -14},
        "tv_spot_30": {"dialogue_level_db": -12, "music_level_db": -15},
        "tv_spot_60": {"dialogue_level_db": -12, "music_level_db": -15},
    }

    return level_presets.get(profile_key, {
        "dialogue_level_db": -12,
        "music_level_db": -15,
    })
