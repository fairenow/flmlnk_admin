"""
Video Clipper Service

Uses FFmpeg to extract clips with ASS captions and layout transformations.
Supports gaming, podcast, and standard layouts.

Phase 2 Features:
- Dynamic layout switching based on face detection per segment
- Two-person split view with face-aware cropping
- Gaming layout (40% face / 60% gameplay)
- Segment concatenation for layout transitions
"""

import os
import asyncio
import subprocess
import shutil
import tempfile
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field


# =============================================================================
# CONFIGURATION
# =============================================================================

# Default output video settings (9:16 vertical)
OUTPUT_WIDTH = 1080
OUTPUT_HEIGHT = 1920
OUTPUT_FPS = 30
OUTPUT_BITRATE = "4M"
OUTPUT_CRF = 23  # Quality (lower = better, 18-28 is good range)

# Codec settings
VIDEO_CODEC = "libx264"
AUDIO_CODEC = "aac"
AUDIO_BITRATE = "128k"

# Aspect ratio configurations
ASPECT_RATIO_CONFIGS = {
    "9:16": {"width": 1080, "height": 1920, "name": "vertical"},
    "16:9": {"width": 1920, "height": 1080, "name": "horizontal"},
    "1:1": {"width": 1080, "height": 1080, "name": "square"},
}


@dataclass
class ClipConfig:
    """Configuration for clip generation."""
    start_time: float
    end_time: float
    layout: str = "standard"
    aspect_ratio: str = "9:16"
    output_path: str = ""
    thumbnail_path: str = ""


@dataclass
class LayoutSegment:
    """A segment of a clip with a specific layout."""
    start_time: float
    end_time: float
    num_faces: int = 0
    layout_type: str = "single"  # "single", "split", "gaming"
    faces: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def duration(self) -> float:
        return self.end_time - self.start_time


class VideoClipper:
    """
    Service for creating video clips with captions using FFmpeg.
    """

    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    async def create_clip(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        ass_content: str,
        layout: str = "standard",
        aspect_ratio: str = "9:16",
        face_positions: Optional[List[Dict[str, Any]]] = None,
        clip_index: int = 0,
    ) -> Dict[str, Any]:
        """
        Create a video clip with captions.

        Args:
            video_path: Source video path
            start_time: Clip start time in seconds
            end_time: Clip end time in seconds
            ass_content: ASS subtitle content
            layout: Layout type ("standard", "gaming", "podcast")
            aspect_ratio: Output aspect ratio ("9:16", "16:9", "1:1")
            face_positions: Face detection results for smart cropping
            clip_index: Index for output filename

        Returns:
            Dictionary with output_path, thumbnail_path, and metadata
        """
        output_path = os.path.join(self.output_dir, f"clip_{clip_index:02d}.mp4")
        thumbnail_path = os.path.join(self.output_dir, f"thumb_{clip_index:02d}.jpg")
        ass_path = os.path.join(self.output_dir, f"captions_{clip_index:02d}.ass")

        # Get output dimensions based on aspect ratio
        ar_config = ASPECT_RATIO_CONFIGS.get(aspect_ratio, ASPECT_RATIO_CONFIGS["9:16"])
        output_width = ar_config["width"]
        output_height = ar_config["height"]

        # Write ASS file (update resolution in ASS header)
        ass_content_updated = self._update_ass_resolution(ass_content, output_width, output_height)
        with open(ass_path, "w", encoding="utf-8") as f:
            f.write(ass_content_updated)

        # Get video dimensions
        video_info = await self._get_video_info(video_path)
        src_width = video_info.get("width", 1920)
        src_height = video_info.get("height", 1080)

        # Build filter based on layout
        if layout == "gaming":
            filter_complex = self._build_gaming_filter(
                src_width, src_height, face_positions, ass_path, output_width, output_height
            )
        elif layout == "podcast":
            filter_complex = self._build_podcast_filter(
                src_width, src_height, face_positions, ass_path, output_width, output_height
            )
        else:
            filter_complex = self._build_standard_filter(
                src_width, src_height, face_positions, ass_path, output_width, output_height
            )

        # Build FFmpeg command
        cmd = [
            "ffmpeg",
            "-y",  # Overwrite output
            "-ss", str(start_time),  # Seek before input (faster)
            "-i", video_path,
            "-t", str(end_time - start_time),  # Duration
            "-filter_complex", filter_complex,
            "-map", "[v]",
            "-map", "0:a?",  # Audio if available
            "-c:v", VIDEO_CODEC,
            "-preset", "fast",
            "-crf", str(OUTPUT_CRF),
            "-c:a", AUDIO_CODEC,
            "-b:a", AUDIO_BITRATE,
            "-movflags", "+faststart",  # Enable streaming
            "-pix_fmt", "yuv420p",  # Compatibility
            output_path,
        ]

        await self._run_command(cmd)

        # Generate thumbnail from OUTPUT clip (not source) to match aspect ratio
        await self._generate_thumbnail_from_clip(output_path, thumbnail_path)

        return {
            "output_path": output_path,
            "thumbnail_path": thumbnail_path,
            "duration": end_time - start_time,
            "layout": layout,
            "aspect_ratio": aspect_ratio,
        }

    def _update_ass_resolution(
        self,
        ass_content: str,
        width: int,
        height: int,
    ) -> str:
        """Update ASS subtitle resolution to match output dimensions."""
        import re
        # Update PlayResX and PlayResY in the ASS header
        ass_content = re.sub(r'PlayResX:\s*\d+', f'PlayResX: {width}', ass_content)
        ass_content = re.sub(r'PlayResY:\s*\d+', f'PlayResY: {height}', ass_content)
        return ass_content

    def _build_standard_filter(
        self,
        src_width: int,
        src_height: int,
        face_positions: Optional[List[Dict[str, Any]]],
        ass_path: str,
        output_width: int = OUTPUT_WIDTH,
        output_height: int = OUTPUT_HEIGHT,
    ) -> str:
        """
        Build FFmpeg filter for standard crop layout.

        Supports any aspect ratio (9:16 vertical, 16:9 horizontal, 1:1 square).
        Centers on detected face when available.
        """
        # Calculate crop dimensions for target aspect ratio
        target_aspect = output_height / output_width
        src_aspect = src_height / src_width

        if src_aspect < target_aspect:
            # Source is wider than target - crop width
            crop_height = src_height
            crop_width = int(src_height / target_aspect)
        else:
            # Source is taller than target - crop height
            crop_width = src_width
            crop_height = int(src_width * target_aspect)

        # Calculate crop position (center by default)
        crop_x = (src_width - crop_width) // 2
        crop_y = (src_height - crop_height) // 2

        # Adjust based on face position if available
        if face_positions:
            avg_x = sum(p.get("x", 0.5) for p in face_positions) / len(face_positions)
            avg_y = sum(p.get("y", 0.5) for p in face_positions) / len(face_positions)
            # Shift crop to center on face
            face_x = int(avg_x * src_width)
            face_y = int(avg_y * src_height)
            crop_x = max(0, min(src_width - crop_width, face_x - crop_width // 2))
            crop_y = max(0, min(src_height - crop_height, face_y - crop_height // 2))

        # Build filter chain
        # 1. Crop to target aspect ratio
        # 2. Scale to output dimensions
        # 3. Apply ASS subtitles
        filter_chain = (
            f"[0:v]crop={crop_width}:{crop_height}:{crop_x}:{crop_y},"
            f"scale={output_width}:{output_height},"
            f"ass='{ass_path}'[v]"
        )

        return filter_chain

    def _build_gaming_filter(
        self,
        src_width: int,
        src_height: int,
        face_positions: Optional[List[Dict[str, Any]]],
        ass_path: str,
        output_width: int = OUTPUT_WIDTH,
        output_height: int = OUTPUT_HEIGHT,
    ) -> str:
        """
        Build FFmpeg filter for gaming layout.

        Layout:
        - Main gameplay area (top 70%)
        - Facecam overlay (bottom right, 25%)
        """
        # Main gameplay crop (center crop for top portion)
        main_height = int(output_height * 0.7)
        main_crop_height = int(src_height * 0.7)
        main_crop_width = int(main_crop_height / (main_height / output_width))
        main_crop_x = (src_width - main_crop_width) // 2
        main_crop_y = 0

        # Facecam area (if faces detected, use that region)
        facecam_size = int(output_width * 0.35)
        facecam_x = output_width - facecam_size - 20
        facecam_y = main_height + 20

        # Build filter
        if face_positions:
            # Extract facecam region from source
            avg_x = sum(p.get("x", 0.8) for p in face_positions) / len(face_positions)
            avg_y = sum(p.get("y", 0.8) for p in face_positions) / len(face_positions)
            avg_width = sum(p.get("width", 0.2) for p in face_positions) / len(face_positions)

            fc_width = int(max(src_width * avg_width * 2, src_width * 0.25))
            fc_height = int(fc_width * 1.2)  # Slightly taller
            fc_x = max(0, min(src_width - fc_width, int(avg_x * src_width) - fc_width // 2))
            fc_y = max(0, min(src_height - fc_height, int(avg_y * src_height) - fc_height // 2))

            filter_chain = (
                # Main gameplay
                f"[0:v]split=2[main][fc];"
                f"[main]crop={main_crop_width}:{main_crop_height}:{main_crop_x}:{main_crop_y},"
                f"scale={output_width}:{main_height}[main_scaled];"
                # Facecam with border
                f"[fc]crop={fc_width}:{fc_height}:{fc_x}:{fc_y},"
                f"scale={facecam_size}:{facecam_size},"
                f"drawbox=x=0:y=0:w={facecam_size}:h={facecam_size}:c=white:t=3[fc_scaled];"
                # Combine
                f"color=black:{output_width}x{output_height}[bg];"
                f"[bg][main_scaled]overlay=0:0[with_main];"
                f"[with_main][fc_scaled]overlay={facecam_x}:{facecam_y},"
                f"ass='{ass_path}'[v]"
            )
        else:
            # No facecam, just gameplay with lower third
            filter_chain = (
                f"[0:v]crop={main_crop_width}:{main_crop_height}:{main_crop_x}:{main_crop_y},"
                f"scale={output_width}:{main_height}[main];"
                f"color=black:{output_width}x{output_height}[bg];"
                f"[bg][main]overlay=0:0,"
                f"ass='{ass_path}'[v]"
            )

        return filter_chain

    def _build_podcast_filter(
        self,
        src_width: int,
        src_height: int,
        face_positions: Optional[List[Dict[str, Any]]],
        ass_path: str,
        output_width: int = OUTPUT_WIDTH,
        output_height: int = OUTPUT_HEIGHT,
    ) -> str:
        """
        Build FFmpeg filter for podcast layout.

        Layout:
        - Split view for two speakers (top and bottom)
        """
        half_height = output_height // 2
        half_src_width = src_width // 2

        # Calculate crop for each speaker
        speaker_crop_height = int(half_height / output_width * half_src_width)
        speaker_crop_width = half_src_width

        filter_chain = (
            # Split source into left and right
            f"[0:v]split=2[left][right];"
            # Left speaker (top half of output)
            f"[left]crop={speaker_crop_width}:{speaker_crop_height}:0:{(src_height - speaker_crop_height) // 2},"
            f"scale={output_width}:{half_height}[left_scaled];"
            # Right speaker (bottom half of output)
            f"[right]crop={speaker_crop_width}:{speaker_crop_height}:{half_src_width}:{(src_height - speaker_crop_height) // 2},"
            f"scale={output_width}:{half_height}[right_scaled];"
            # Stack vertically
            f"[left_scaled][right_scaled]vstack,"
            f"ass='{ass_path}'[v]"
        )

        return filter_chain

    async def _get_video_info(self, video_path: str) -> Dict[str, Any]:
        """Get video dimensions and metadata using ffprobe."""
        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            video_path,
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, _ = await process.communicate()

        try:
            import json
            data = json.loads(stdout.decode())
            for stream in data.get("streams", []):
                if stream.get("codec_type") == "video":
                    return {
                        "width": stream.get("width", 1920),
                        "height": stream.get("height", 1080),
                        "duration": float(stream.get("duration", 0)),
                        "fps": eval(stream.get("r_frame_rate", "30/1")),
                    }
        except Exception as e:
            print(f"Failed to get video info: {e}")

        return {"width": 1920, "height": 1080}

    async def _generate_thumbnail_from_clip(
        self,
        clip_path: str,
        output_path: str,
        timestamp_percent: float = 0.1,
    ):
        """
        Generate thumbnail from the OUTPUT clip (not source video).

        This ensures the thumbnail matches the clip's aspect ratio exactly.
        The clip has already been cropped/scaled to the target format (9:16, etc.),
        so the thumbnail will display correctly without stretching.

        Args:
            clip_path: Path to the generated clip video
            output_path: Where to save the thumbnail
            timestamp_percent: Where to extract frame (0.0-1.0, default 10% into clip)
        """
        try:
            # Get clip duration to calculate actual timestamp
            info = await self._get_video_info(clip_path)
            duration = info.get("duration", 1.0)
            timestamp = max(0.1, duration * timestamp_percent)

            # Extract frame from OUTPUT clip - already in correct aspect ratio
            cmd = [
                "ffmpeg",
                "-y",
                "-ss", str(timestamp),
                "-i", clip_path,
                "-vframes", "1",
                "-q:v", "2",  # High quality JPEG
                output_path,
            ]

            await self._run_command(cmd)
            print(f"Generated thumbnail from clip at {timestamp:.1f}s")
        except Exception as e:
            print(f"Failed to generate thumbnail from clip: {e}")
            # Fallback: try first frame
            try:
                cmd = [
                    "ffmpeg",
                    "-y",
                    "-i", clip_path,
                    "-vframes", "1",
                    "-q:v", "2",
                    output_path,
                ]
                await self._run_command(cmd)
                print("Generated thumbnail from first frame (fallback)")
            except Exception as e2:
                print(f"Fallback thumbnail generation also failed: {e2}")

    async def _run_command(self, cmd: list) -> str:
        """Run a shell command asynchronously."""
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise RuntimeError(f"FFmpeg failed: {error_msg}")

        return stdout.decode() if stdout else ""

    # =========================================================================
    # DYNAMIC LAYOUT METHODS (Phase 2)
    # =========================================================================

    async def create_dynamic_clip(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        ass_content: str,
        face_detector,  # FaceDetector instance
        aspect_ratio: str = "9:16",
        clip_index: int = 0,
        segment_duration: float = 3.0,
    ) -> Dict[str, Any]:
        """
        Create a clip with dynamic layout switching based on face detection.

        This method:
        1. Samples faces at regular intervals within the clip
        2. Determines optimal layout for each segment (single/split/gaming)
        3. Creates individual segment clips
        4. Concatenates segments into final clip

        Args:
            video_path: Source video path
            start_time: Clip start time in seconds
            end_time: Clip end time in seconds
            ass_content: ASS subtitle content
            face_detector: FaceDetector instance for face detection
            aspect_ratio: Output aspect ratio
            clip_index: Index for output filename
            segment_duration: How often to check for layout changes (seconds)

        Returns:
            Dictionary with output_path, thumbnail_path, and metadata
        """
        output_path = os.path.join(self.output_dir, f"clip_{clip_index:02d}.mp4")
        thumbnail_path = os.path.join(self.output_dir, f"thumb_{clip_index:02d}.jpg")
        ass_path = os.path.join(self.output_dir, f"captions_{clip_index:02d}.ass")

        # Get output dimensions
        ar_config = ASPECT_RATIO_CONFIGS.get(aspect_ratio, ASPECT_RATIO_CONFIGS["9:16"])
        output_width = ar_config["width"]
        output_height = ar_config["height"]

        # Write ASS file
        ass_content_updated = self._update_ass_resolution(ass_content, output_width, output_height)
        with open(ass_path, "w", encoding="utf-8") as f:
            f.write(ass_content_updated)

        # Get video info
        video_info = await self._get_video_info(video_path)
        src_width = video_info.get("width", 1920)
        src_height = video_info.get("height", 1080)

        # Detect layout segments
        layout_segments = await self._detect_layout_segments(
            video_path=video_path,
            start_time=start_time,
            end_time=end_time,
            face_detector=face_detector,
            segment_duration=segment_duration,
        )

        # Merge similar consecutive segments
        merged_segments = self._merge_similar_segments(layout_segments)
        print(f"Dynamic layout: {len(layout_segments)} segments merged to {len(merged_segments)}")

        # If only one segment type, use simple approach
        if len(merged_segments) == 1:
            seg = merged_segments[0]
            layout = "podcast" if seg.num_faces >= 2 else "standard"
            return await self.create_clip(
                video_path=video_path,
                start_time=start_time,
                end_time=end_time,
                ass_content=ass_content,
                layout=layout,
                aspect_ratio=aspect_ratio,
                face_positions=seg.faces,
                clip_index=clip_index,
            )

        # Multiple segments - create and concatenate
        temp_dir = tempfile.mkdtemp(prefix="dynamic_clip_")
        segment_files = []

        try:
            for i, seg in enumerate(merged_segments):
                seg_output = os.path.join(temp_dir, f"segment_{i:03d}.mp4")

                # Determine layout for this segment
                if seg.num_faces >= 2:
                    layout = "podcast"
                else:
                    layout = "standard"

                # Create segment clip (without ASS - we'll add captions after concat)
                await self._create_segment_clip(
                    video_path=video_path,
                    start_time=seg.start_time,
                    end_time=seg.end_time,
                    src_width=src_width,
                    src_height=src_height,
                    output_width=output_width,
                    output_height=output_height,
                    output_path=seg_output,
                    layout=layout,
                    face_positions=seg.faces,
                )

                if os.path.exists(seg_output):
                    segment_files.append(seg_output)

            # Concatenate segments
            if len(segment_files) > 1:
                concat_output = os.path.join(temp_dir, "concat.mp4")
                await self._concatenate_segments(segment_files, concat_output)

                # Add captions to concatenated video
                await self._add_captions(concat_output, ass_path, output_path)
            elif segment_files:
                # Single segment - just add captions
                await self._add_captions(segment_files[0], ass_path, output_path)
            else:
                raise RuntimeError("No segment files created")

            # Generate thumbnail
            await self._generate_thumbnail_from_clip(output_path, thumbnail_path)

            return {
                "output_path": output_path,
                "thumbnail_path": thumbnail_path,
                "duration": end_time - start_time,
                "layout": "dynamic",
                "aspect_ratio": aspect_ratio,
                "segments": len(merged_segments),
            }

        finally:
            # Cleanup temp files
            try:
                shutil.rmtree(temp_dir)
            except Exception:
                pass

    async def _detect_layout_segments(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        face_detector,
        segment_duration: float = 3.0,
    ) -> List[LayoutSegment]:
        """
        Detect faces at regular intervals and determine layout segments.

        Args:
            video_path: Source video path
            start_time: Clip start time
            end_time: Clip end time
            face_detector: FaceDetector instance
            segment_duration: Interval for face detection (seconds)

        Returns:
            List of LayoutSegment objects
        """
        segments = []
        current_time = start_time

        while current_time < end_time:
            segment_end = min(current_time + segment_duration, end_time)

            # Detect layout for this segment (uses multi-frame sampling)
            layout_data = face_detector.detect_layout_for_clip(
                video_path=video_path,
                start_time=current_time,
                end_time=segment_end,
            )

            num_faces = layout_data.get("num_faces", 0)
            faces = []

            if layout_data.get("face_region"):
                faces.append(layout_data["face_region"])
            if layout_data.get("face_region_2"):
                faces.append(layout_data["face_region_2"])

            # Determine layout type
            if num_faces >= 2:
                layout_type = "split"
            elif num_faces == 1:
                layout_type = "single"
            else:
                layout_type = "single"  # Default to single (center crop)

            segments.append(LayoutSegment(
                start_time=current_time,
                end_time=segment_end,
                num_faces=num_faces,
                layout_type=layout_type,
                faces=faces,
            ))

            print(f"  Segment {current_time:.1f}s-{segment_end:.1f}s: {num_faces} faces -> {layout_type}")
            current_time = segment_end

        return segments

    def _merge_similar_segments(
        self,
        segments: List[LayoutSegment],
        position_threshold: float = 0.15,
    ) -> List[LayoutSegment]:
        """
        Merge consecutive segments with the same layout type and similar face positions.

        Args:
            segments: List of layout segments
            position_threshold: Max position difference to merge (0-1)

        Returns:
            Merged list of segments
        """
        if not segments:
            return []

        merged = [LayoutSegment(
            start_time=segments[0].start_time,
            end_time=segments[0].end_time,
            num_faces=segments[0].num_faces,
            layout_type=segments[0].layout_type,
            faces=segments[0].faces.copy(),
        )]

        for seg in segments[1:]:
            last = merged[-1]

            # Same layout type?
            same_layout = last.layout_type == seg.layout_type

            # Similar face positions?
            similar_positions = self._faces_similar_position(
                last.faces, seg.faces, position_threshold
            )

            if same_layout and similar_positions:
                # Extend the last segment
                last.end_time = seg.end_time
            else:
                # Add new segment
                merged.append(LayoutSegment(
                    start_time=seg.start_time,
                    end_time=seg.end_time,
                    num_faces=seg.num_faces,
                    layout_type=seg.layout_type,
                    faces=seg.faces.copy(),
                ))

        return merged

    def _faces_similar_position(
        self,
        faces1: List[Dict[str, Any]],
        faces2: List[Dict[str, Any]],
        threshold: float = 0.15,
    ) -> bool:
        """
        Check if face positions are similar between two sets.

        Args:
            faces1: First set of face dicts with x, y, width, height (0-1)
            faces2: Second set of face dicts
            threshold: Max allowed position difference

        Returns:
            True if positions are similar
        """
        if not faces1 or not faces2:
            return len(faces1) == len(faces2)

        # Compare primary face positions
        f1 = faces1[0]
        f2 = faces2[0]

        # Calculate center distance
        f1_cx = f1.get("x", 0.5)
        f1_cy = f1.get("y", 0.5)
        f2_cx = f2.get("x", 0.5)
        f2_cy = f2.get("y", 0.5)

        dist = abs(f1_cx - f2_cx) + abs(f1_cy - f2_cy)
        return dist < threshold

    async def _create_segment_clip(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        src_width: int,
        src_height: int,
        output_width: int,
        output_height: int,
        output_path: str,
        layout: str,
        face_positions: List[Dict[str, Any]],
    ):
        """
        Create a single segment clip without captions.

        Args:
            video_path: Source video
            start_time: Segment start
            end_time: Segment end
            src_width: Source video width
            src_height: Source video height
            output_width: Output width
            output_height: Output height
            output_path: Where to save segment
            layout: Layout type (standard, podcast)
            face_positions: Detected face positions
        """
        if layout == "podcast" and len(face_positions) >= 2:
            # Two-person split view
            filter_complex = self._build_split_filter(
                src_width, src_height, face_positions, output_width, output_height
            )
        else:
            # Single person / standard layout
            filter_complex = self._build_standard_filter_simple(
                src_width, src_height, face_positions, output_width, output_height
            )

        cmd = [
            "ffmpeg",
            "-y",
            "-ss", str(start_time),
            "-i", video_path,
            "-t", str(end_time - start_time),
            "-filter_complex", filter_complex,
            "-map", "[v]",
            "-map", "0:a?",
            "-c:v", VIDEO_CODEC,
            "-preset", "fast",
            "-crf", str(OUTPUT_CRF),
            "-c:a", AUDIO_CODEC,
            "-b:a", AUDIO_BITRATE,
            "-pix_fmt", "yuv420p",
            output_path,
        ]

        await self._run_command(cmd)

    def _build_standard_filter_simple(
        self,
        src_width: int,
        src_height: int,
        face_positions: List[Dict[str, Any]],
        output_width: int,
        output_height: int,
    ) -> str:
        """Build standard filter without ASS for segment creation."""
        target_aspect = output_height / output_width
        src_aspect = src_height / src_width

        if src_aspect < target_aspect:
            crop_height = src_height
            crop_width = int(src_height / target_aspect)
        else:
            crop_width = src_width
            crop_height = int(src_width * target_aspect)

        crop_x = (src_width - crop_width) // 2
        crop_y = (src_height - crop_height) // 2

        if face_positions:
            avg_x = sum(p.get("x", 0.5) for p in face_positions) / len(face_positions)
            avg_y = sum(p.get("y", 0.5) for p in face_positions) / len(face_positions)
            face_x = int(avg_x * src_width)
            face_y = int(avg_y * src_height)
            crop_x = max(0, min(src_width - crop_width, face_x - crop_width // 2))
            crop_y = max(0, min(src_height - crop_height, face_y - crop_height // 2))

        return (
            f"[0:v]crop={crop_width}:{crop_height}:{crop_x}:{crop_y},"
            f"scale={output_width}:{output_height}[v]"
        )

    def _build_split_filter(
        self,
        src_width: int,
        src_height: int,
        face_positions: List[Dict[str, Any]],
        output_width: int,
        output_height: int,
    ) -> str:
        """
        Build FFmpeg filter for two-person split view.

        Layout:
        ┌─────────────────┐
        │   PERSON 1      │  <- Top 50%
        │   (zoomed)      │
        ├─────────────────┤
        │   PERSON 2      │  <- Bottom 50%
        │   (zoomed)      │
        └─────────────────┘
        """
        panel_height = output_height // 2
        panel_aspect = output_width / panel_height

        def get_crop_for_face(face: Dict[str, Any]) -> Tuple[int, int, int, int]:
            """Calculate crop region for a face."""
            if not face:
                # Center crop fallback
                crop_h = src_height
                crop_w = int(crop_h * panel_aspect)
                crop_w = min(crop_w, src_width)
                crop_x = (src_width - crop_w) // 2
                return crop_x, 0, crop_w, crop_h

            face_x = face.get("x", 0.5)
            face_y = face.get("y", 0.5)
            face_h = face.get("height", 0.3)

            # Face should be ~35% of crop height
            target_face_ratio = 0.35
            crop_h = min(int((face_h * src_height) / target_face_ratio), src_height)
            crop_w = int(crop_h * panel_aspect)
            crop_w = min(crop_w, src_width)

            # Recalculate height if width was clamped
            if crop_w == src_width:
                crop_h = int(crop_w / panel_aspect)

            # Center crop on face (face at 35% from top)
            crop_x = int(face_x * src_width) - crop_w // 2
            crop_y = int(face_y * src_height) - int(crop_h * 0.35)

            # Keep within bounds
            crop_x = max(0, min(crop_x, src_width - crop_w))
            crop_y = max(0, min(crop_y, src_height - crop_h))

            return crop_x, crop_y, crop_w, crop_h

        f1 = get_crop_for_face(face_positions[0] if face_positions else None)
        f2 = get_crop_for_face(face_positions[1] if len(face_positions) > 1 else None)

        return (
            # Person 1 on top
            f"[0:v]split=2[v1][v2];"
            f"[v1]crop={f1[2]}:{f1[3]}:{f1[0]}:{f1[1]},"
            f"scale={output_width}:{panel_height}:force_original_aspect_ratio=increase,"
            f"crop={output_width}:{panel_height}[face1];"
            # Person 2 on bottom
            f"[v2]crop={f2[2]}:{f2[3]}:{f2[0]}:{f2[1]},"
            f"scale={output_width}:{panel_height}:force_original_aspect_ratio=increase,"
            f"crop={output_width}:{panel_height}[face2];"
            # Stack vertically
            f"[face1][face2]vstack=inputs=2[v]"
        )

    async def _concatenate_segments(
        self,
        segment_files: List[str],
        output_path: str,
    ):
        """Concatenate multiple segment files into one video."""
        # Create concat file
        concat_file = output_path.replace(".mp4", "_concat.txt")
        with open(concat_file, "w") as f:
            for seg_file in segment_files:
                f.write(f"file '{seg_file}'\n")

        cmd = [
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            "-c", "copy",
            output_path,
        ]

        try:
            await self._run_command(cmd)
        finally:
            # Cleanup concat file
            try:
                os.unlink(concat_file)
            except Exception:
                pass

    async def _add_captions(
        self,
        input_path: str,
        ass_path: str,
        output_path: str,
    ):
        """Add ASS captions to a video."""
        escaped_ass = ass_path.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")

        cmd = [
            "ffmpeg",
            "-y",
            "-i", input_path,
            "-vf", f"ass='{escaped_ass}'",
            "-c:v", VIDEO_CODEC,
            "-preset", "fast",
            "-crf", str(OUTPUT_CRF),
            "-c:a", "copy",
            "-movflags", "+faststart",
            output_path,
        ]

        await self._run_command(cmd)

    # =========================================================================
    # SMART THUMBNAIL SELECTION (Phase 3.2)
    # =========================================================================

    async def select_best_thumbnail(
        self,
        video_path: str,
        output_path: str,
        num_samples: int = 5,
    ) -> str:
        """
        Select the best frame for thumbnail from multiple candidates.

        Analyzes multiple frames and scores them based on:
        1. Face visibility and quality (30 points)
        2. Sharpness / no motion blur (25 points)
        3. Good lighting / brightness (25 points)
        4. Visual interest / composition (20 points)

        Args:
            video_path: Path to the video (clip or source)
            output_path: Where to save the thumbnail
            num_samples: Number of frames to sample and score

        Returns:
            Path to the generated thumbnail
        """
        try:
            # Get video duration
            info = await self._get_video_info(video_path)
            duration = info.get("duration", 1.0)

            if duration <= 0:
                duration = 1.0

            # Sample frames at even intervals (avoiding first and last 10%)
            usable_start = duration * 0.1
            usable_end = duration * 0.9
            usable_range = usable_end - usable_start

            sample_times = [
                usable_start + (usable_range * (i + 0.5) / num_samples)
                for i in range(num_samples)
            ]

            best_frame = None
            best_score = -1
            best_time = 0

            for ts in sample_times:
                # Extract frame
                frame = await self._extract_frame_at(video_path, ts)
                if frame is None:
                    continue

                # Score the frame
                score = self._score_thumbnail_quality(frame)

                if score > best_score:
                    best_score = score
                    best_frame = frame
                    best_time = ts

            if best_frame is not None:
                # Save best frame as thumbnail
                import cv2
                cv2.imwrite(output_path, best_frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
                print(f"Smart thumbnail: selected frame at {best_time:.1f}s (score: {best_score:.1f})")
                return output_path
            else:
                # Fallback to first frame
                print("Smart thumbnail: falling back to first frame")
                await self._generate_thumbnail_from_clip(video_path, output_path, 0.1)
                return output_path

        except Exception as e:
            print(f"Smart thumbnail selection failed: {e}")
            # Fallback
            await self._generate_thumbnail_from_clip(video_path, output_path, 0.1)
            return output_path

    async def _extract_frame_at(
        self,
        video_path: str,
        timestamp: float,
    ):
        """Extract a single frame at the given timestamp."""
        import cv2

        try:
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                tmp_path = tmp.name

            cmd = [
                'ffmpeg', '-y',
                '-ss', str(timestamp),
                '-i', video_path,
                '-vframes', '1',
                '-q:v', '2',
                tmp_path
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await process.communicate()

            if os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 0:
                frame = cv2.imread(tmp_path)
                os.unlink(tmp_path)
                return frame

            return None
        except Exception as e:
            print(f"Frame extraction failed at {timestamp}s: {e}")
            return None

    def _score_thumbnail_quality(self, frame) -> float:
        """
        Score a frame's suitability as thumbnail (0-100).

        Criteria:
        1. Face visibility (30 points max)
        2. Sharpness (25 points max)
        3. Brightness (25 points max)
        4. Visual interest (20 points max)
        """
        import cv2
        import numpy as np

        score = 0.0

        try:
            h, w = frame.shape[:2]
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            # 1. Face detection (30 points max)
            face_score = self._score_face_quality(frame)
            score += min(30, face_score)

            # 2. Sharpness - Laplacian variance (25 points max)
            # Higher variance = sharper image
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            laplacian_var = laplacian.var()

            # Scale: 0-500+ variance maps to 0-25 points
            sharpness_score = min(25, laplacian_var / 20)
            score += sharpness_score

            # 3. Brightness - prefer well-lit frames (25 points max)
            brightness = np.mean(gray)

            # Optimal brightness is 100-160, penalize too dark or too bright
            if 100 <= brightness <= 160:
                brightness_score = 25
            elif 70 <= brightness < 100 or 160 < brightness <= 190:
                brightness_score = 20
            elif 50 <= brightness < 70 or 190 < brightness <= 210:
                brightness_score = 12
            else:
                brightness_score = 5

            score += brightness_score

            # 4. Visual interest - edge density (20 points max)
            # More edges = more visual information
            edges = cv2.Canny(gray, 50, 150)
            edge_density = np.sum(edges > 0) / edges.size

            # Scale: 0-0.15 edge density maps to 0-20 points
            interest_score = min(20, edge_density * 150)
            score += interest_score

        except Exception as e:
            print(f"Thumbnail scoring failed: {e}")
            score = 50  # Default middle score

        return score

    def _score_face_quality(self, frame) -> float:
        """
        Score face quality in frame.

        Considers:
        - Face presence
        - Face size (larger = better for thumbnails)
        - Face position (centered is better)
        - Face clarity
        """
        import cv2

        try:
            # Use Haar cascade for quick face detection
            face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            )

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            h, w = gray.shape

            faces = face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(50, 50),
            )

            if len(faces) == 0:
                return 5  # No face penalty, but not zero

            # Score based on best face
            best_face_score = 0

            for (x, y, fw, fh) in faces:
                face_score = 0

                # Face size (larger = better, max 15 points)
                face_area_ratio = (fw * fh) / (w * h)
                size_score = min(15, face_area_ratio * 150)
                face_score += size_score

                # Face position - prefer roughly centered (max 10 points)
                face_center_x = (x + fw / 2) / w
                face_center_y = (y + fh / 2) / h

                # Horizontal: prefer 0.3-0.7 range
                h_dist = abs(face_center_x - 0.5)
                # Vertical: prefer 0.25-0.5 range (rule of thirds, upper)
                v_dist = abs(face_center_y - 0.38)

                position_score = max(0, 10 - (h_dist + v_dist) * 15)
                face_score += position_score

                # Face clarity - check sharpness in face region (max 5 points)
                face_region = gray[y:y + fh, x:x + fw]
                if face_region.size > 0:
                    face_laplacian = cv2.Laplacian(face_region, cv2.CV_64F).var()
                    clarity_score = min(5, face_laplacian / 40)
                    face_score += clarity_score

                best_face_score = max(best_face_score, face_score)

            return best_face_score

        except Exception as e:
            print(f"Face scoring failed: {e}")
            return 5

    async def create_clip_with_smart_thumbnail(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        ass_content: str,
        layout: str = "standard",
        aspect_ratio: str = "9:16",
        face_positions: Optional[List[Dict[str, Any]]] = None,
        clip_index: int = 0,
        use_smart_thumbnail: bool = True,
    ) -> Dict[str, Any]:
        """
        Create a video clip with smart thumbnail selection.

        This is an enhanced version of create_clip that uses smart thumbnail
        selection (Phase 3.2) to choose the best frame for the thumbnail.
        """
        # Create the clip using standard method
        result = await self.create_clip(
            video_path=video_path,
            start_time=start_time,
            end_time=end_time,
            ass_content=ass_content,
            layout=layout,
            aspect_ratio=aspect_ratio,
            face_positions=face_positions,
            clip_index=clip_index,
        )

        # If smart thumbnail is enabled, replace the thumbnail
        if use_smart_thumbnail and result.get("output_path"):
            clip_path = result["output_path"]
            thumbnail_path = result.get("thumbnail_path", clip_path.replace(".mp4", "_thumb.jpg"))

            await self.select_best_thumbnail(
                video_path=clip_path,
                output_path=thumbnail_path,
                num_samples=5,
            )

            result["thumbnail_path"] = thumbnail_path
            result["smart_thumbnail"] = True

        return result
