"""
Speaker Detector Service

Phase 3.1: Smart Speaker Detection

Detects which person is speaking at any given moment using:
1. Audio amplitude analysis correlated with face positions
2. Face movement detection (mouth/jaw region activity)
3. Audio-visual synchronization scoring

This enables:
- Dynamic focus on active speaker during clips
- Smart cropping that follows the conversation
- Better two-person clip layouts
"""

import os
import asyncio
import subprocess
import tempfile
import json
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field

import cv2
import numpy as np


# =============================================================================
# CONFIGURATION
# =============================================================================

# Audio analysis settings
AUDIO_SAMPLE_RATE = 16000  # Hz
AUDIO_CHUNK_DURATION = 0.5  # seconds per analysis chunk
SPEECH_ENERGY_THRESHOLD = 0.02  # Minimum energy to consider as speech

# Face movement detection
MOVEMENT_THRESHOLD = 0.015  # Minimum movement to consider as speaking
MOUTH_REGION_RATIO = 0.35  # Lower 35% of face is mouth region

# Speaker assignment confidence
MIN_SPEAKER_CONFIDENCE = 0.6


@dataclass
class SpeakerSegment:
    """A segment where a specific speaker is active."""
    start_time: float
    end_time: float
    speaker_idx: int  # Index of the speaking face (0, 1, etc.)
    confidence: float
    audio_energy: float = 0.0
    face_movement: float = 0.0

    @property
    def duration(self) -> float:
        return self.end_time - self.start_time


@dataclass
class AudioSegment:
    """Audio analysis for a time segment."""
    start_time: float
    end_time: float
    energy: float  # RMS energy level
    is_speech: bool  # Whether speech is detected
    peak_amplitude: float = 0.0


class SpeakerDetector:
    """
    Detect active speaker using audio analysis and face tracking.

    Methods:
    1. Audio amplitude analysis - detect when speech occurs
    2. Face movement correlation - detect which face is moving during speech
    3. Audio-visual synchronization - combine signals for speaker assignment
    """

    def __init__(self):
        self._face_detector = None

    def _get_face_detector(self):
        """Lazy initialization of face detector."""
        if self._face_detector is None:
            from .face_detector import FaceDetector
            self._face_detector = FaceDetector()
        return self._face_detector

    async def detect_active_speakers(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        faces: List[Dict[str, Any]],
        chunk_duration: float = AUDIO_CHUNK_DURATION,
    ) -> List[SpeakerSegment]:
        """
        Detect which face is speaking at each time segment.

        Args:
            video_path: Path to video file
            start_time: Clip start time
            end_time: Clip end time
            faces: List of detected face positions (from face_detector)
            chunk_duration: Duration of each analysis chunk

        Returns:
            List of SpeakerSegment indicating who is speaking when
        """
        if not faces:
            return []

        # Run analysis in thread pool
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._detect_speakers_sync,
            video_path,
            start_time,
            end_time,
            faces,
            chunk_duration,
        )

    def _detect_speakers_sync(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        faces: List[Dict[str, Any]],
        chunk_duration: float,
    ) -> List[SpeakerSegment]:
        """Synchronous speaker detection."""
        # Extract audio and analyze
        audio_segments = self._analyze_audio(
            video_path, start_time, end_time, chunk_duration
        )

        if not audio_segments:
            print("No audio segments extracted")
            return []

        # Detect face movements during each segment
        speaker_segments = []
        face_detector = self._get_face_detector()

        for audio_seg in audio_segments:
            if not audio_seg.is_speech:
                continue

            # Analyze face movement during this audio segment
            speaker_idx, confidence = self._find_active_speaker(
                video_path,
                audio_seg.start_time,
                audio_seg.end_time,
                faces,
                face_detector,
            )

            if speaker_idx >= 0 and confidence >= MIN_SPEAKER_CONFIDENCE:
                speaker_segments.append(SpeakerSegment(
                    start_time=audio_seg.start_time,
                    end_time=audio_seg.end_time,
                    speaker_idx=speaker_idx,
                    confidence=confidence,
                    audio_energy=audio_seg.energy,
                ))

        # Merge consecutive segments with same speaker
        merged = self._merge_speaker_segments(speaker_segments)
        print(f"Speaker detection: {len(audio_segments)} audio segments -> {len(merged)} speaker segments")

        return merged

    def _analyze_audio(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        chunk_duration: float,
    ) -> List[AudioSegment]:
        """
        Extract and analyze audio to detect speech segments.

        Returns list of AudioSegment with energy levels and speech detection.
        """
        segments = []

        try:
            # Extract audio using FFmpeg
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                audio_path = tmp.name

            cmd = [
                'ffmpeg', '-y',
                '-ss', str(start_time),
                '-i', video_path,
                '-t', str(end_time - start_time),
                '-vn',  # No video
                '-acodec', 'pcm_s16le',
                '-ar', str(AUDIO_SAMPLE_RATE),
                '-ac', '1',  # Mono
                audio_path,
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=60,
            )

            if result.returncode != 0:
                print(f"FFmpeg audio extraction failed: {result.stderr.decode()[:200]}")
                return segments

            # Load audio data
            import wave
            with wave.open(audio_path, 'rb') as wav:
                n_frames = wav.getnframes()
                audio_data = np.frombuffer(
                    wav.readframes(n_frames),
                    dtype=np.int16
                ).astype(np.float32) / 32768.0

            # Clean up temp file
            os.unlink(audio_path)

            # Analyze in chunks
            samples_per_chunk = int(chunk_duration * AUDIO_SAMPLE_RATE)
            current_time = start_time
            chunk_idx = 0

            while chunk_idx * samples_per_chunk < len(audio_data):
                start_sample = chunk_idx * samples_per_chunk
                end_sample = min(start_sample + samples_per_chunk, len(audio_data))
                chunk = audio_data[start_sample:end_sample]

                if len(chunk) == 0:
                    break

                # Calculate RMS energy
                energy = np.sqrt(np.mean(chunk ** 2))
                peak = np.max(np.abs(chunk))

                # Detect speech based on energy threshold
                is_speech = energy > SPEECH_ENERGY_THRESHOLD

                segments.append(AudioSegment(
                    start_time=current_time,
                    end_time=current_time + chunk_duration,
                    energy=float(energy),
                    is_speech=is_speech,
                    peak_amplitude=float(peak),
                ))

                current_time += chunk_duration
                chunk_idx += 1

            print(f"Audio analysis: {len(segments)} chunks, {sum(1 for s in segments if s.is_speech)} with speech")

        except Exception as e:
            print(f"Audio analysis failed: {e}")

        return segments

    def _find_active_speaker(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        faces: List[Dict[str, Any]],
        face_detector,
    ) -> Tuple[int, float]:
        """
        Determine which face is speaking during a time segment.

        Uses face/mouth movement detection to identify the active speaker.

        Returns:
            (speaker_idx, confidence) - index of speaking face and confidence score
        """
        if len(faces) == 0:
            return -1, 0.0

        if len(faces) == 1:
            # Only one face - assume they're speaking
            return 0, 0.8

        # Sample frames at start and end of segment to detect movement
        frame_start = face_detector.extract_frame(video_path, start_time)
        frame_end = face_detector.extract_frame(video_path, end_time)

        if frame_start is None or frame_end is None:
            # Can't analyze movement - use heuristics
            return self._speaker_heuristic(faces), 0.5

        # Calculate movement for each face's mouth region
        movements = []
        for i, face in enumerate(faces):
            movement = self._calculate_face_movement(
                frame_start, frame_end, face
            )
            movements.append((i, movement))

        # Speaker is the face with most mouth region movement
        movements.sort(key=lambda x: x[1], reverse=True)

        if movements[0][1] > MOVEMENT_THRESHOLD:
            # Clear speaker detected
            confidence = min(0.95, 0.6 + movements[0][1] * 2)
            return movements[0][0], confidence
        else:
            # No clear movement - use position heuristic
            return self._speaker_heuristic(faces), 0.5

    def _calculate_face_movement(
        self,
        frame1: np.ndarray,
        frame2: np.ndarray,
        face: Dict[str, Any],
    ) -> float:
        """
        Calculate movement in the mouth region of a face between two frames.

        Uses optical flow or frame difference in the mouth area.
        """
        try:
            h, w = frame1.shape[:2]

            # Get face bounding box
            face_x = int(face.get("x", 0.5) * w)
            face_y = int(face.get("y", 0.5) * h)
            face_w = int(face.get("width", 0.2) * w)
            face_h = int(face.get("height", 0.3) * h)

            # Calculate mouth region (lower portion of face)
            mouth_y = face_y + int(face_h * (1 - MOUTH_REGION_RATIO) / 2)
            mouth_h = int(face_h * MOUTH_REGION_RATIO)
            mouth_x = face_x - face_w // 2
            mouth_w = face_w

            # Ensure bounds
            mouth_x = max(0, mouth_x)
            mouth_y = max(0, mouth_y)
            mouth_w = min(mouth_w, w - mouth_x)
            mouth_h = min(mouth_h, h - mouth_y)

            if mouth_w <= 0 or mouth_h <= 0:
                return 0.0

            # Extract mouth regions
            mouth1 = frame1[mouth_y:mouth_y + mouth_h, mouth_x:mouth_x + mouth_w]
            mouth2 = frame2[mouth_y:mouth_y + mouth_h, mouth_x:mouth_x + mouth_w]

            if mouth1.size == 0 or mouth2.size == 0:
                return 0.0

            # Convert to grayscale
            gray1 = cv2.cvtColor(mouth1, cv2.COLOR_BGR2GRAY)
            gray2 = cv2.cvtColor(mouth2, cv2.COLOR_BGR2GRAY)

            # Calculate frame difference
            diff = cv2.absdiff(gray1, gray2)
            movement = np.mean(diff) / 255.0

            return float(movement)

        except Exception as e:
            print(f"Face movement calculation failed: {e}")
            return 0.0

    def _speaker_heuristic(
        self,
        faces: List[Dict[str, Any]],
    ) -> int:
        """
        Use heuristics to guess the speaker when movement can't be detected.

        Heuristics:
        - Larger face is more likely to be speaking (closer to camera)
        - Face closer to center is more likely to be speaking
        - Lower face might be responding to questions from higher position
        """
        if not faces:
            return -1

        scores = []
        for i, face in enumerate(faces):
            score = 0.0

            # Size factor (larger = more prominent)
            size = face.get("width", 0.1) * face.get("height", 0.1)
            score += size * 2

            # Center factor (closer to horizontal center = more attention)
            x_dist = abs(face.get("x", 0.5) - 0.5)
            score += (0.5 - x_dist) * 0.5

            scores.append((i, score))

        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[0][0]

    def _merge_speaker_segments(
        self,
        segments: List[SpeakerSegment],
        gap_threshold: float = 0.5,
    ) -> List[SpeakerSegment]:
        """
        Merge consecutive segments with the same speaker.

        Also fills small gaps (< gap_threshold) between same-speaker segments.
        """
        if not segments:
            return []

        merged = [SpeakerSegment(
            start_time=segments[0].start_time,
            end_time=segments[0].end_time,
            speaker_idx=segments[0].speaker_idx,
            confidence=segments[0].confidence,
            audio_energy=segments[0].audio_energy,
        )]

        for seg in segments[1:]:
            last = merged[-1]

            # Same speaker and close in time?
            if (seg.speaker_idx == last.speaker_idx and
                seg.start_time - last.end_time <= gap_threshold):
                # Extend the last segment
                last.end_time = seg.end_time
                last.confidence = max(last.confidence, seg.confidence)
                last.audio_energy = max(last.audio_energy, seg.audio_energy)
            else:
                # New segment
                merged.append(SpeakerSegment(
                    start_time=seg.start_time,
                    end_time=seg.end_time,
                    speaker_idx=seg.speaker_idx,
                    confidence=seg.confidence,
                    audio_energy=seg.audio_energy,
                ))

        return merged

    def get_speaker_timeline(
        self,
        segments: List[SpeakerSegment],
        total_duration: float,
    ) -> Dict[str, Any]:
        """
        Generate a speaker timeline summary.

        Returns statistics about speaker distribution in the clip.
        """
        if not segments:
            return {
                "speakers": [],
                "total_speech_duration": 0,
                "silence_duration": total_duration,
                "dominant_speaker": -1,
            }

        # Calculate per-speaker statistics
        speaker_times = {}
        for seg in segments:
            if seg.speaker_idx not in speaker_times:
                speaker_times[seg.speaker_idx] = 0
            speaker_times[seg.speaker_idx] += seg.duration

        total_speech = sum(speaker_times.values())

        # Find dominant speaker
        dominant = max(speaker_times.items(), key=lambda x: x[1])[0]

        speakers = []
        for idx, time in sorted(speaker_times.items()):
            speakers.append({
                "speaker_idx": idx,
                "total_time": time,
                "percentage": time / total_duration * 100 if total_duration > 0 else 0,
            })

        return {
            "speakers": speakers,
            "total_speech_duration": total_speech,
            "silence_duration": total_duration - total_speech,
            "dominant_speaker": dominant,
            "segment_count": len(segments),
        }

    async def get_speaker_focused_crops(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        faces: List[Dict[str, Any]],
        output_width: int = 1080,
        output_height: int = 1920,
    ) -> List[Dict[str, Any]]:
        """
        Generate time-coded crop regions that follow the active speaker.

        This can be used to create dynamic clips that focus on whoever is speaking.

        Returns:
            List of dicts with start_time, end_time, and crop region for each segment
        """
        segments = await self.detect_active_speakers(
            video_path, start_time, end_time, faces
        )

        if not segments:
            # No speaker detection - return single centered crop
            return [{
                "start_time": start_time,
                "end_time": end_time,
                "speaker_idx": 0,
                "crop": self._calculate_crop_for_face(
                    faces[0] if faces else None,
                    output_width,
                    output_height,
                ),
            }]

        crops = []
        for seg in segments:
            face = faces[seg.speaker_idx] if seg.speaker_idx < len(faces) else None
            crops.append({
                "start_time": seg.start_time,
                "end_time": seg.end_time,
                "speaker_idx": seg.speaker_idx,
                "confidence": seg.confidence,
                "crop": self._calculate_crop_for_face(
                    face, output_width, output_height
                ),
            })

        return crops

    def _calculate_crop_for_face(
        self,
        face: Optional[Dict[str, Any]],
        output_width: int,
        output_height: int,
        video_width: int = 1920,
        video_height: int = 1080,
    ) -> Dict[str, int]:
        """
        Calculate optimal crop region centered on a face.
        """
        target_aspect = output_height / output_width

        if face is None:
            # Center crop
            if target_aspect > 1:  # Vertical
                crop_w = int(video_height / target_aspect)
                crop_h = video_height
            else:
                crop_w = video_width
                crop_h = int(video_width * target_aspect)

            return {
                "x": (video_width - crop_w) // 2,
                "y": (video_height - crop_h) // 2,
                "width": crop_w,
                "height": crop_h,
            }

        # Face-centered crop
        face_x = face.get("x", 0.5) * video_width
        face_y = face.get("y", 0.5) * video_height

        if target_aspect > 1:  # Vertical
            crop_h = video_height
            crop_w = int(crop_h / target_aspect)
        else:
            crop_w = video_width
            crop_h = int(crop_w * target_aspect)

        # Center on face with bounds checking
        crop_x = int(max(0, min(video_width - crop_w, face_x - crop_w / 2)))
        crop_y = int(max(0, min(video_height - crop_h, face_y - crop_h / 2)))

        return {
            "x": crop_x,
            "y": crop_y,
            "width": crop_w,
            "height": crop_h,
        }


class ConversationAnalyzer:
    """
    High-level conversation analysis for podcast/interview content.

    Provides insights about conversation dynamics:
    - Turn-taking patterns
    - Interruption detection
    - Monologue vs dialogue detection
    """

    def __init__(self):
        self.speaker_detector = SpeakerDetector()

    async def analyze_conversation(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        faces: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Analyze conversation dynamics in a video segment.
        """
        segments = await self.speaker_detector.detect_active_speakers(
            video_path, start_time, end_time, faces
        )

        if not segments:
            return {
                "type": "unknown",
                "speakers": 0,
                "turn_count": 0,
            }

        # Count unique speakers
        unique_speakers = set(s.speaker_idx for s in segments)

        # Count turns (speaker changes)
        turn_count = 0
        for i in range(1, len(segments)):
            if segments[i].speaker_idx != segments[i - 1].speaker_idx:
                turn_count += 1

        # Detect conversation type
        duration = end_time - start_time
        avg_turn_duration = duration / max(turn_count + 1, 1)

        if len(unique_speakers) == 1:
            conv_type = "monologue"
        elif avg_turn_duration > 10:
            conv_type = "interview"  # Long turns = interview style
        elif turn_count > duration / 3:
            conv_type = "debate"  # Frequent interruptions
        else:
            conv_type = "dialogue"

        # Get timeline
        timeline = self.speaker_detector.get_speaker_timeline(
            segments, duration
        )

        return {
            "type": conv_type,
            "speakers": len(unique_speakers),
            "turn_count": turn_count,
            "avg_turn_duration": avg_turn_duration,
            "timeline": timeline,
            "segments": [
                {
                    "start": s.start_time,
                    "end": s.end_time,
                    "speaker": s.speaker_idx,
                    "confidence": s.confidence,
                }
                for s in segments
            ],
        }
