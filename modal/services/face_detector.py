"""
Face Detector Service

Enhanced face detection using MediaPipe with:
- Size filtering (2% minimum) to ignore background faces
- Multi-frame sampling for better accuracy
- Face clustering to find dominant positions
- Upper body/pose detection fallback for VR/masked faces
- Dominant color detection for caption theming
- Gaming layout detection (40% face / 60% gameplay)
- Podcast layout with dynamic speaker tracking
"""

import os
import asyncio
import subprocess
import tempfile
from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass
from collections import Counter

import cv2
import numpy as np


# =============================================================================
# CONFIGURATION
# =============================================================================

# Minimum face area as percentage of frame - filters out background faces
# Main subjects in podcasts typically have faces >3% of frame
# Faces in posters/thumbnails are usually <1%
MIN_FACE_AREA_PERCENT = 0.02  # 2% of frame area

# Sample rate for face detection (every N frames)
SAMPLE_RATE = 30  # ~1 sample per second at 30fps

# MediaPipe confidence threshold
MIN_DETECTION_CONFIDENCE = 0.5

# Clustering threshold for grouping same person across frames
FACE_CLUSTER_THRESHOLD = 150  # pixels


@dataclass
class FacePosition:
    """Detected face position."""
    x: float  # Center X (0-1)
    y: float  # Center Y (0-1)
    width: float  # Width (0-1)
    height: float  # Height (0-1)
    timestamp: float  # Time in seconds
    confidence: float  # Detection confidence
    detection_type: str = "face"  # face, upper_body, pose


class FaceDetector:
    """
    Enhanced face detector for video content.

    Features:
    - Size filtering (2% minimum) to ignore background faces in posters
    - Multi-frame sampling for better accuracy
    - Face clustering to find dominant positions
    - Upper body detection fallback for VR/masked faces
    - Dominant color detection for caption theming
    """

    def __init__(self):
        self._detector = None
        self._pose_detector = None
        self._upper_body_cascade = None
        self._init_upper_body_cascade()

    def _init_upper_body_cascade(self):
        """Initialize upper body cascade for fallback detection."""
        try:
            cascade_path = cv2.data.haarcascades + 'haarcascade_upperbody.xml'
            if os.path.exists(cascade_path):
                self._upper_body_cascade = cv2.CascadeClassifier(cascade_path)
        except Exception:
            pass

    def _get_detector(self):
        """Lazy initialization of MediaPipe face detector."""
        if self._detector is None:
            import mediapipe as mp
            self._detector = mp.solutions.face_detection.FaceDetection(
                model_selection=1,  # Full range model
                min_detection_confidence=MIN_DETECTION_CONFIDENCE,
            )
        return self._detector

    def _get_pose_detector(self):
        """Lazy initialization of MediaPipe pose detector for fallback."""
        if self._pose_detector is None:
            try:
                import mediapipe as mp
                self._pose_detector = mp.solutions.pose.Pose(
                    static_image_mode=True,
                    model_complexity=0,  # Fastest
                    min_detection_confidence=0.5,
                )
            except Exception:
                pass
        return self._pose_detector

    def extract_frame_ffmpeg(
        self,
        video_path: str,
        timestamp: float,
    ) -> Optional[np.ndarray]:
        """
        Extract frame using FFmpeg - works with all codecs including AV1.
        """
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
            subprocess.run(cmd, capture_output=True, timeout=30)

            if os.path.exists(tmp_path):
                frame = cv2.imread(tmp_path)
                os.unlink(tmp_path)
                return frame
            return None
        except Exception as e:
            print(f"FFmpeg frame extraction failed: {e}")
            return None

    def extract_frame(
        self,
        video_path: str,
        timestamp: float,
    ) -> Optional[np.ndarray]:
        """Extract frame at given timestamp, with FFmpeg fallback."""
        # Try FFmpeg first (works with all codecs)
        frame = self.extract_frame_ffmpeg(video_path, timestamp)
        if frame is not None:
            return frame

        # Fallback to OpenCV
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return None
        cap.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
        ret, frame = cap.read()
        cap.release()
        return frame if ret else None

    async def detect_faces(
        self,
        video_path: str,
        clip_times: Optional[List[Tuple[float, float]]] = None,
    ) -> Dict[int, Dict[str, Any]]:
        """
        Detect faces in video for specified time ranges.

        Args:
            video_path: Path to video file
            clip_times: List of (start, end) tuples for clips to analyze
                       If None, analyzes entire video

        Returns:
            Dictionary mapping clip index to face detection results
        """
        # Run detection in thread pool since OpenCV is blocking
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._detect_faces_sync,
            video_path,
            clip_times,
        )

    def _detect_faces_sync(
        self,
        video_path: str,
        clip_times: Optional[List[Tuple[float, float]]],
    ) -> Dict[int, Dict[str, Any]]:
        """Synchronous face detection."""
        results = {}

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print(f"Failed to open video: {video_path}")
            return results

        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        frame_area = frame_width * frame_height

        detector = self._get_detector()

        if clip_times is None:
            # Analyze entire video
            clip_times = [(0, total_frames / fps)]

        for clip_idx, (start_time, end_time) in enumerate(clip_times):
            positions = []
            start_frame = int(start_time * fps)
            end_frame = int(end_time * fps)

            frame_idx = start_frame
            while frame_idx < end_frame:
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                ret, frame = cap.read()

                if not ret:
                    break

                # Convert BGR to RGB for MediaPipe
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                # Detect faces
                result = detector.process(rgb_frame)

                if result.detections:
                    for detection in result.detections:
                        bbox = detection.location_data.relative_bounding_box

                        # Calculate face area as percentage of frame
                        face_width = bbox.width
                        face_height = bbox.height
                        face_area_percent = face_width * face_height

                        # Filter out small faces (background)
                        if face_area_percent >= MIN_FACE_AREA_PERCENT:
                            positions.append(FacePosition(
                                x=bbox.xmin + face_width / 2,
                                y=bbox.ymin + face_height / 2,
                                width=face_width,
                                height=face_height,
                                timestamp=frame_idx / fps,
                                confidence=detection.score[0] if detection.score else 0,
                            ))

                # Skip frames for performance
                frame_idx += SAMPLE_RATE

            # Summarize results for this clip
            results[clip_idx] = self._summarize_detections(positions)

        cap.release()
        return results

    def _summarize_detections(
        self,
        positions: List[FacePosition],
    ) -> Dict[str, Any]:
        """Summarize face detections for a clip."""
        if not positions:
            return {
                "has_faces": False,
                "positions": [],
                "dominant_position": None,
                "face_count": 0,
            }

        # Convert to dictionaries
        position_dicts = [
            {
                "x": p.x,
                "y": p.y,
                "width": p.width,
                "height": p.height,
                "timestamp": p.timestamp,
            }
            for p in positions
        ]

        # Calculate dominant (average) face position
        avg_x = sum(p.x for p in positions) / len(positions)
        avg_y = sum(p.y for p in positions) / len(positions)
        avg_width = sum(p.width for p in positions) / len(positions)
        avg_height = sum(p.height for p in positions) / len(positions)

        return {
            "has_faces": True,
            "positions": position_dicts[:10],  # Limit stored positions
            "dominant_position": {
                "x": avg_x,
                "y": avg_y,
                "width": avg_width,
                "height": avg_height,
            },
            "face_count": len(positions),
        }

    def detect_upper_body(
        self,
        frame: np.ndarray,
    ) -> List[Dict[str, Any]]:
        """
        Detect upper body/person when face is not visible.

        Useful for:
        - People wearing VR headsets
        - People with face masks
        - People facing away from camera
        - Backlit/silhouette shots
        """
        try:
            h, w = frame.shape[:2]
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.equalizeHist(gray)

            bodies = []

            # Try upper body cascade if available
            if self._upper_body_cascade is not None:
                upper_bodies = self._upper_body_cascade.detectMultiScale(
                    gray, scaleFactor=1.1, minNeighbors=3, minSize=(100, 100)
                )
                for (x, y, bw, bh) in upper_bodies:
                    # Estimate head position (top 30% of upper body)
                    head_y = y
                    head_h = int(bh * 0.35)
                    head_x = x + int(bw * 0.25)
                    head_w = int(bw * 0.5)

                    bodies.append({
                        "x": head_x / w,
                        "y": head_y / h,
                        "width": head_w / w,
                        "height": head_h / h,
                        "confidence": 0.4,
                        "type": "upper_body",
                    })

            # Try MediaPipe Pose if available and no bodies found
            if not bodies:
                pose_bodies = self._detect_person_pose(frame)
                bodies.extend(pose_bodies)

            return bodies
        except Exception as e:
            print(f"Upper body detection failed: {e}")
            return []

    def _detect_person_pose(
        self,
        frame: np.ndarray,
    ) -> List[Dict[str, Any]]:
        """
        Use MediaPipe Pose to detect person and estimate head position.
        Works even when face is covered (VR headset, mask, etc.)
        """
        try:
            h, w = frame.shape[:2]
            pose_detector = self._get_pose_detector()

            if pose_detector is None:
                return []

            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose_detector.process(rgb_frame)

            persons = []
            if results.pose_landmarks:
                landmarks = results.pose_landmarks.landmark

                # Key points: nose(0), left_shoulder(11), right_shoulder(12)
                nose = landmarks[0]
                left_shoulder = landmarks[11]
                right_shoulder = landmarks[12]

                # Estimate head region from shoulders and nose
                shoulder_cx = (left_shoulder.x + right_shoulder.x) / 2
                shoulder_cy = (left_shoulder.y + right_shoulder.y) / 2
                shoulder_width = abs(left_shoulder.x - right_shoulder.x)

                # Head is roughly above shoulders
                head_cx = nose.x if nose.visibility > 0.5 else shoulder_cx
                head_cy = nose.y if nose.visibility > 0.5 else shoulder_cy - shoulder_width * 0.5
                head_w = max(shoulder_width * 0.8, 0.05)
                head_h = head_w * 1.2  # Head slightly taller than wide

                persons.append({
                    "x": head_cx,
                    "y": head_cy,
                    "width": head_w,
                    "height": head_h,
                    "confidence": min(nose.visibility, left_shoulder.visibility, right_shoulder.visibility),
                    "type": "pose_estimation",
                })

                print(f"Pose detection found person - useful for VR/masked faces")

            return persons
        except Exception as e:
            print(f"Pose detection failed: {e}")
            return []

    def detect_dominant_color(
        self,
        frame: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Detect dominant color for caption theming.

        Returns theme (dark/light/neutral) and suggested highlight color.
        """
        try:
            # Resize for faster processing
            small = cv2.resize(frame, (100, 100))
            pixels = small.reshape(-1, 3)

            # Find dominant color
            pixel_counts = Counter(map(tuple, pixels))
            dominant_bgr = pixel_counts.most_common(1)[0][0]

            r, g, b = dominant_bgr[2], dominant_bgr[1], dominant_bgr[0]
            brightness = (r + g + b) / 3

            # Determine theme and suggested caption color
            if brightness < 85:
                theme = "dark"
                highlight = "00FFFF"  # Cyan works on dark backgrounds
            elif brightness > 170:
                theme = "light"
                highlight = "FF6B6B"  # Coral works on light backgrounds
            else:
                theme = "neutral"
                highlight = "FFD700"  # Gold for neutral backgrounds

            return {
                "theme": theme,
                "brightness": brightness,
                "highlight_color": highlight,
                "dominant_rgb": (r, g, b),
            }
        except Exception as e:
            print(f"Color detection failed: {e}")
            return {"theme": "neutral", "highlight_color": "00FFFF"}

    def detect_layout_for_clip(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
    ) -> Dict[str, Any]:
        """
        Enhanced multi-frame detection for a specific clip.

        Samples 3 frames within the clip for better accuracy:
        - start + 0.5s
        - middle
        - end - 20%

        Returns clustered face positions and theme info.
        """
        # Get video info
        video_info = self._get_video_info(video_path)
        video_w = video_info.get("width", 1920)
        video_h = video_info.get("height", 1080)

        duration = end_time - start_time
        all_faces = []

        # Sample 3 frames within the clip
        sample_times = [
            start_time + 0.5,
            start_time + duration * 0.5,
            start_time + duration * 0.8,
        ]

        for t in sample_times:
            if t >= end_time:
                continue

            frame = self.extract_frame(video_path, t)
            if frame is None:
                continue

            # Detect faces with size filtering
            faces = self._detect_faces_in_frame(frame)
            all_faces.extend(faces)

            # If no faces found, try upper body detection
            if not faces:
                body_detections = self.detect_upper_body(frame)
                all_faces.extend(body_detections)

        # Cluster faces to find dominant positions
        clusters = self._cluster_faces(all_faces, video_w)
        dominant_faces = []

        for cluster in clusters:
            avg_face = self._get_average_face(cluster)
            if avg_face:
                dominant_faces.append(avg_face)

        # Sort by area (largest first - main subjects)
        dominant_faces = sorted(
            dominant_faces,
            key=lambda f: f.get("width", 0) * f.get("height", 0),
            reverse=True,
        )

        # Get theme from first frame
        theme = {"theme": "neutral", "highlight_color": "00FFFF"}
        first_frame = self.extract_frame(video_path, start_time + 0.5)
        if first_frame is not None:
            theme = self.detect_dominant_color(first_frame)

        # Determine face corner for gaming layout detection
        face_corner = None
        if dominant_faces:
            face_corner = self._get_face_corner(dominant_faces[0], video_w, video_h)

        return {
            "video_w": video_w,
            "video_h": video_h,
            "theme": theme,
            "num_faces": len(dominant_faces),
            "face_found": len(dominant_faces) > 0,
            "face_region": dominant_faces[0] if dominant_faces else None,
            "face_region_2": dominant_faces[1] if len(dominant_faces) > 1 else None,
            "detection_confidence": dominant_faces[0].get("confidence", 0) if dominant_faces else 0,
            "face_corner": face_corner,
        }

    def _detect_faces_in_frame(
        self,
        frame: np.ndarray,
    ) -> List[Dict[str, Any]]:
        """Detect faces in a single frame with size filtering."""
        h, w = frame.shape[:2]
        frame_area = h * w
        min_face_area = frame_area * MIN_FACE_AREA_PERCENT

        detector = self._get_detector()

        try:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = detector.process(rgb_frame)

            faces = []
            if results.detections:
                for detection in results.detections:
                    bbox = detection.location_data.relative_bounding_box
                    face_w = bbox.width * w
                    face_h = bbox.height * h
                    face_area = face_w * face_h

                    # Filter by size
                    if face_area >= min_face_area:
                        faces.append({
                            "x": bbox.xmin + bbox.width / 2,
                            "y": bbox.ymin + bbox.height / 2,
                            "width": bbox.width,
                            "height": bbox.height,
                            "confidence": detection.score[0] if detection.score else 0.5,
                            "type": "face",
                        })

            return faces
        except Exception as e:
            print(f"Face detection in frame failed: {e}")
            return []

    def _cluster_faces(
        self,
        faces: List[Dict[str, Any]],
        frame_w: int,
    ) -> List[List[Dict[str, Any]]]:
        """
        Group faces that are close together (likely same person across frames).
        """
        if not faces:
            return []

        threshold = FACE_CLUSTER_THRESHOLD / frame_w  # Normalize to 0-1
        clusters = []
        used = set()

        for i, face in enumerate(faces):
            if i in used:
                continue

            cluster = [face]
            used.add(i)

            for j, other in enumerate(faces):
                if j in used:
                    continue

                # Check if faces are close (same person)
                dist = abs(face["x"] - other["x"]) + abs(face["y"] - other["y"])
                if dist < threshold:
                    cluster.append(other)
                    used.add(j)

            clusters.append(cluster)

        return clusters

    def _get_average_face(
        self,
        faces: List[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        """Get average position from multiple face detections."""
        if not faces:
            return None

        avg_x = sum(f["x"] for f in faces) / len(faces)
        avg_y = sum(f["y"] for f in faces) / len(faces)
        avg_w = sum(f["width"] for f in faces) / len(faces)
        avg_h = sum(f["height"] for f in faces) / len(faces)

        return {
            "x": avg_x,
            "y": avg_y,
            "width": avg_w,
            "height": avg_h,
            "confidence": max(f.get("confidence", 0) for f in faces),
        }

    def _get_face_corner(
        self,
        face: Dict[str, Any],
        video_w: int,
        video_h: int,
    ) -> str:
        """Determine which corner/area the face is in (for gaming layout detection)."""
        cx = face["x"]
        cy = face["y"]

        h_pos = "left" if cx < 0.33 else ("right" if cx > 0.67 else "center")
        v_pos = "top" if cy < 0.33 else ("bottom" if cy > 0.67 else "middle")

        return f"{v_pos}-{h_pos}"

    def _get_video_info(
        self,
        video_path: str,
    ) -> Dict[str, Any]:
        """Get video dimensions using ffprobe."""
        try:
            cmd = [
                'ffprobe', '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height,duration',
                '-of', 'csv=p=0',
                video_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if result.returncode == 0:
                parts = result.stdout.strip().split(',')
                if len(parts) >= 2:
                    return {
                        "width": int(parts[0]),
                        "height": int(parts[1]),
                        "duration": float(parts[2]) if len(parts) > 2 and parts[2] else 0,
                    }
        except Exception as e:
            print(f"ffprobe failed: {e}")

        return {"width": 1920, "height": 1080, "duration": 0}

    def get_crop_region(
        self,
        face_data: Dict[str, Any],
        target_aspect: float = 9 / 16,  # Vertical video
        frame_width: int = 1920,
        frame_height: int = 1080,
    ) -> Dict[str, int]:
        """
        Calculate crop region centered on detected face.

        Args:
            face_data: Face detection results
            target_aspect: Target aspect ratio (height/width)
            frame_width: Source frame width
            frame_height: Source frame height

        Returns:
            Crop region as {x, y, width, height}
        """
        if not face_data.get("has_faces") or not face_data.get("dominant_position"):
            # Default: center crop
            if target_aspect > 1:  # Vertical
                crop_width = frame_height / target_aspect
                crop_height = frame_height
            else:  # Horizontal
                crop_width = frame_width
                crop_height = frame_width * target_aspect

            return {
                "x": int((frame_width - crop_width) / 2),
                "y": int((frame_height - crop_height) / 2),
                "width": int(crop_width),
                "height": int(crop_height),
            }

        # Center on dominant face position
        pos = face_data["dominant_position"]
        face_center_x = int(pos["x"] * frame_width)
        face_center_y = int(pos["y"] * frame_height)

        # Calculate crop dimensions
        if target_aspect > 1:  # Vertical (9:16)
            crop_height = frame_height
            crop_width = int(crop_height / target_aspect)
        else:  # Horizontal
            crop_width = frame_width
            crop_height = int(crop_width * target_aspect)

        # Center crop on face, with bounds checking
        crop_x = max(0, min(frame_width - crop_width, face_center_x - crop_width // 2))
        crop_y = max(0, min(frame_height - crop_height, face_center_y - crop_height // 2))

        return {
            "x": crop_x,
            "y": crop_y,
            "width": crop_width,
            "height": crop_height,
        }


class LayoutCalculator:
    """
    Calculate optimal video layouts based on face detection.

    Supports three layouts:
    1. standard: Smart vertical crop centered on face
    2. gaming: 40% face cam (top) + 60% gameplay (bottom)
    3. podcast: Dynamic speaker tracking or two-speaker split
    """

    LAYOUTS = {
        "standard": {
            "description": "Smart vertical crop centered on face",
            "aspect": 9 / 16,
        },
        "gaming": {
            # 40% face / 60% gameplay (optimal for streaming content)
            "description": "40% face cam on top, 60% gameplay on bottom",
            "face_panel_ratio": 0.40,
            "game_panel_ratio": 0.60,
        },
        "podcast": {
            # Dynamic speaker tracking or split view
            "description": "Dynamic speaker focus or two-speaker split",
            "split": "vertical",
        },
    }

    @staticmethod
    def get_layout_config(
        layout: str,
        face_data: Dict[str, Any],
        frame_width: int,
        frame_height: int,
    ) -> Dict[str, Any]:
        """Get layout configuration based on detected faces."""
        if layout == "gaming":
            return LayoutCalculator._gaming_layout(face_data, frame_width, frame_height)
        elif layout == "podcast":
            return LayoutCalculator._podcast_layout(face_data, frame_width, frame_height)
        else:
            return LayoutCalculator._standard_layout(face_data, frame_width, frame_height)

    @staticmethod
    def _standard_layout(
        face_data: Dict[str, Any],
        frame_width: int,
        frame_height: int,
    ) -> Dict[str, Any]:
        """Standard vertical crop layout with smart face centering."""
        detector = FaceDetector()
        crop = detector.get_crop_region(
            face_data,
            target_aspect=9 / 16,
            frame_width=frame_width,
            frame_height=frame_height,
        )

        return {
            "type": "standard",
            "output_width": 1080,
            "output_height": 1920,
            "crop": crop,
        }

    @staticmethod
    def _gaming_layout(
        face_data: Dict[str, Any],
        frame_width: int,
        frame_height: int,
    ) -> Dict[str, Any]:
        """
        Gaming layout optimized for streaming content.

        Layout (1080x1920):
        ┌─────────────────┐
        │   FACE/CAM      │  <- Top 40% (768px): Streamer face cam
        │   (zoomed)      │
        ├─────────────────┤
        │                 │
        │   GAMEPLAY      │  <- Bottom 60% (1152px): Main game content
        │   (full width)  │
        │  [CAPTIONS]     │
        └─────────────────┘
        """
        output_w = 1080
        output_h = 1920

        # 40% for face panel, 60% for gameplay panel
        face_panel_h = int(output_h * 0.40)  # 768px
        game_panel_h = output_h - face_panel_h  # 1152px

        # Detect face region for smart cropping
        face_region = face_data.get("face_region") or face_data.get("dominant_position")
        face_corner = face_data.get("face_corner", "top-left")

        # Determine face cam crop region based on detected face position
        if face_region:
            # Face cam is where the face was detected
            face_x = face_region.get("x", 0.5)
            face_y = face_region.get("y", 0.5)
            face_w = face_region.get("width", 0.3)
            face_h = face_region.get("height", 0.4)

            # Expand to capture face with some margin
            facecam_w = min(face_w * 2.5, 0.5)  # At most 50% of frame
            facecam_h = min(face_h * 2.5, 0.5)
            facecam_x = max(0, face_x - facecam_w / 2)
            facecam_y = max(0, face_y - facecam_h / 2)
        else:
            # Default: assume face cam is in top-left corner
            facecam_x = 0
            facecam_y = 0
            facecam_w = 0.35
            facecam_h = 0.40

        # Convert to absolute coordinates
        facecam_crop = {
            "x": int(facecam_x * frame_width),
            "y": int(facecam_y * frame_height),
            "width": int(facecam_w * frame_width),
            "height": int(facecam_h * frame_height),
        }

        # Gameplay is the full frame (will be scaled to fit bottom panel)
        gameplay_crop = {
            "x": 0,
            "y": 0,
            "width": frame_width,
            "height": frame_height,
        }

        return {
            "type": "gaming",
            "output_width": output_w,
            "output_height": output_h,
            "face_panel_height": face_panel_h,
            "game_panel_height": game_panel_h,
            "facecam_crop": facecam_crop,
            "gameplay_crop": gameplay_crop,
            "face_corner": face_corner,
        }

    @staticmethod
    def _podcast_layout(
        face_data: Dict[str, Any],
        frame_width: int,
        frame_height: int,
    ) -> Dict[str, Any]:
        """
        Podcast layout with dynamic speaker tracking.

        For single speaker: Full-frame zoom on the speaker
        For two speakers: Vertical split view

        Layout (single speaker):
        ┌─────────────────┐
        │                 │
        │   SPEAKER       │  <- Full screen zoomed on speaker
        │   (centered)    │
        │  [CAPTIONS]     │
        │                 │
        └─────────────────┘

        Layout (two speakers):
        ┌─────────────────┐
        │   SPEAKER 1     │
        │   (top half)    │
        ├─────────────────┤
        │   SPEAKER 2     │
        │   (bottom half) │
        │  [CAPTIONS]     │
        └─────────────────┘
        """
        output_w = 1080
        output_h = 1920

        num_faces = face_data.get("face_count", 0) if face_data.get("has_faces") else 0
        face_region = face_data.get("face_region") or face_data.get("dominant_position")
        face_region_2 = face_data.get("face_region_2")

        if num_faces >= 2 and face_region and face_region_2:
            # Two speakers - use split view
            # Crop around first face for top panel
            f1_x = face_region.get("x", 0.25)
            f1_y = face_region.get("y", 0.5)
            f1_w = face_region.get("width", 0.2)
            f1_h = face_region.get("height", 0.3)

            # Crop around second face for bottom panel
            f2_x = face_region_2.get("x", 0.75)
            f2_y = face_region_2.get("y", 0.5)
            f2_w = face_region_2.get("width", 0.2)
            f2_h = face_region_2.get("height", 0.3)

            # Expand crops to 9:16 aspect with face centered
            def expand_to_vertical(fx, fy, fw, fh):
                # Target aspect for each half: 1080 x 960 = 9:8
                target_ratio = 9 / 8
                expand_w = min(fh * target_ratio, 1.0)
                expand_h = min(expand_w / target_ratio, 1.0)
                cx = max(expand_w / 2, min(fx, 1 - expand_w / 2))
                cy = max(expand_h / 2, min(fy, 1 - expand_h / 2))
                return {
                    "x": int((cx - expand_w / 2) * frame_width),
                    "y": int((cy - expand_h / 2) * frame_height),
                    "width": int(expand_w * frame_width),
                    "height": int(expand_h * frame_height),
                }

            return {
                "type": "podcast_split",
                "output_width": output_w,
                "output_height": output_h,
                "split": "vertical",
                "top_crop": expand_to_vertical(f1_x, f1_y, f1_w, f1_h),
                "bottom_crop": expand_to_vertical(f2_x, f2_y, f2_w, f2_h),
                "num_speakers": 2,
            }
        else:
            # Single speaker - dynamic zoom on face
            if face_region:
                face_x = face_region.get("x", 0.5)
                face_y = face_region.get("y", 0.5)
                face_w = face_region.get("width", 0.2)
                face_h = face_region.get("height", 0.3)

                # Calculate 9:16 crop centered on face with some headroom
                target_ratio = 9 / 16
                # Make crop tall enough to show face with context
                crop_h = min(face_h * 3, 1.0)
                crop_w = crop_h * target_ratio

                # Center on face with slight upward offset (headroom)
                crop_cx = max(crop_w / 2, min(face_x, 1 - crop_w / 2))
                crop_cy = max(crop_h / 2, min(face_y + 0.05, 1 - crop_h / 2))

                speaker_crop = {
                    "x": int((crop_cx - crop_w / 2) * frame_width),
                    "y": int((crop_cy - crop_h / 2) * frame_height),
                    "width": int(crop_w * frame_width),
                    "height": int(crop_h * frame_height),
                }
            else:
                # Fallback to center crop
                detector = FaceDetector()
                speaker_crop = detector.get_crop_region(
                    {},
                    target_aspect=9 / 16,
                    frame_width=frame_width,
                    frame_height=frame_height,
                )

            return {
                "type": "podcast_single",
                "output_width": output_w,
                "output_height": output_h,
                "crop": speaker_crop,
                "num_speakers": 1,
            }

    @staticmethod
    def _legacy_podcast_layout(
        face_data: Dict[str, Any],
        frame_width: int,
        frame_height: int,
    ) -> Dict[str, Any]:
        """Legacy podcast layout - simple vertical split."""
        return {
            "type": "podcast",
            "output_width": 1080,
            "output_height": 1920,
            "split": "vertical",
            "left_crop": {
                "x": 0,
                "y": 0,
                "width": frame_width // 2,
                "height": frame_height,
            },
            "right_crop": {
                "x": frame_width // 2,
                "y": 0,
                "width": frame_width // 2,
                "height": frame_height,
            },
        }
