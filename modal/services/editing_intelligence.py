"""
Phase 5: Advanced Editing Intelligence

AI-powered scene analysis and music-synchronized editing for trailers:
1. Scene Importance Scoring - Multi-dimensional (emotional/visual/narrative)
2. Dialogue Selection AI - GPT-4o picks trailer-worthy lines
3. Beat-Sync Editing - Librosa-based cut alignment to music
"""

import json
import os
from dataclasses import dataclass, asdict
from typing import Optional, List, Dict, Any

import numpy as np


# ============================================
# SCENE IMPORTANCE SCORING
# ============================================


@dataclass
class SceneImportanceScore:
    """Multi-dimensional scene importance scoring (0-1 scales)."""

    emotional_score: float  # Emotional intensity (faces, expressions, dialogue tone)
    visual_score: float  # Visual interest (motion, composition, color contrast)
    narrative_score: float  # Story value (dialogue content, character moments)

    @property
    def combined_score(self) -> float:
        """Weighted combination of all scores."""
        return (
            self.emotional_score * 0.35
            + self.visual_score * 0.30
            + self.narrative_score * 0.35
        )

    @property
    def trailer_priority(self) -> str:
        """Priority tier for trailer inclusion."""
        score = self.combined_score
        if score >= 0.8:
            return "must_include"
        elif score >= 0.6:
            return "high_priority"
        elif score >= 0.4:
            return "consider"
        else:
            return "skip"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        return {
            "emotional": self.emotional_score,
            "visual": self.visual_score,
            "narrative": self.narrative_score,
            "combined": self.combined_score,
            "priority": self.trailer_priority,
        }


class SceneImportanceScorer:
    """Score scenes for trailer worthiness using multi-modal analysis.

    Analyzes scenes across three dimensions:
    - Emotional: Faces, audio intensity, emotional keywords
    - Visual: Motion intensity, scene duration, color diversity
    - Narrative: Dialogue structure, trailer-worthy phrases
    """

    # Emotional keyword categories
    EMOTION_KEYWORDS = {
        "high": [
            "love",
            "death",
            "fear",
            "joy",
            "rage",
            "betrayal",
            "truth",
            "war",
            "kill",
            "die",
            "hate",
            "forever",
            "destroy",
        ],
        "medium": [
            "hope",
            "loss",
            "fight",
            "family",
            "power",
            "secret",
            "choose",
            "save",
            "protect",
            "promise",
        ],
        "low": ["okay", "fine", "perhaps", "maybe", "could", "might", "guess"],
    }

    # Trailer-worthy phrases that work out of context
    TRAILER_PHRASES = [
        "what if",
        "you must",
        "no choice",
        "only one",
        "everything",
        "nothing",
        "forever",
        "never",
        "the truth",
        "the world",
        "save",
        "destroy",
        "begin",
        "end",
        "last chance",
        "no turning back",
        "time has come",
        "one chance",
        "all along",
        "the only way",
    ]

    def __init__(self, job_id: Optional[str] = None):
        self.job_id = job_id

    def _log(self, msg: str):
        """Log with job ID prefix."""
        prefix = f"[{self.job_id}]" if self.job_id else "[SceneScorer]"
        print(f"{prefix} {msg}")

    async def score_scene(
        self,
        scene: Dict[str, Any],
        transcript_segment: Optional[Dict[str, Any]] = None,
        audio_features: Optional[Dict[str, Any]] = None,
    ) -> SceneImportanceScore:
        """Score a single scene across all dimensions.

        Args:
            scene: Scene dict with startTime, endTime, duration, hasFaces,
                   avgMotionIntensity, avgAudioIntensity, dominantColors
            transcript_segment: Optional transcript segment with text, start, end
            audio_features: Optional audio features (rms_energy, spectral_centroid)

        Returns:
            SceneImportanceScore with emotional, visual, narrative scores
        """
        emotional = self._score_emotional(scene, transcript_segment, audio_features)
        visual = self._score_visual(scene)
        narrative = self._score_narrative(transcript_segment)

        return SceneImportanceScore(
            emotional_score=emotional,
            visual_score=visual,
            narrative_score=narrative,
        )

    async def score_all_scenes(
        self,
        scenes: List[Dict[str, Any]],
        transcript_segments: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """Score all scenes and return enhanced scene list.

        Args:
            scenes: List of scene dicts
            transcript_segments: Optional transcript segments to match with scenes

        Returns:
            Scenes with added importanceScores field
        """
        scored_scenes = []

        # Build transcript lookup by time range
        transcript_lookup = {}
        if transcript_segments:
            for seg in transcript_segments:
                start = seg.get("start") or 0
                end = seg.get("end") or (start + 1)
                # Map to time range
                for t in range(int(start), int(end) + 1):
                    transcript_lookup[t] = seg

        for scene in scenes:
            # Find matching transcript segment
            scene_start = int(scene.get("startTime") or 0)
            scene_end = int(scene.get("endTime") or (scene_start + 1))
            transcript_seg = None

            # Look for transcript in scene time range
            for t in range(scene_start, scene_end + 1):
                if t in transcript_lookup:
                    transcript_seg = transcript_lookup[t]
                    break

            # Score the scene
            score = await self.score_scene(
                scene=scene,
                transcript_segment=transcript_seg,
            )

            # Add score to scene
            scene_copy = scene.copy()
            scene_copy["importanceScores"] = score.to_dict()

            scored_scenes.append(scene_copy)

        # Log summary
        high_priority = sum(
            1 for s in scored_scenes
            if s.get("importanceScores", {}).get("priority") in ["must_include", "high_priority"]
        )
        self._log(f"Scored {len(scored_scenes)} scenes, {high_priority} high priority")

        return scored_scenes

    def _score_emotional(
        self,
        scene: Dict[str, Any],
        transcript: Optional[Dict[str, Any]],
        audio: Optional[Dict[str, Any]],
    ) -> float:
        """Score emotional intensity (0-1)."""
        score = 0.0

        # Face presence boosts emotional score (humans connect with faces)
        if scene.get("hasFaces"):
            score += 0.3

        # Audio intensity (loud = emotional impact)
        audio_intensity = scene.get("avgAudioIntensity") or 0
        if audio_intensity > 0.7:
            score += 0.3
        elif audio_intensity > 0.4:
            score += 0.15
        elif audio_intensity > 0.2:
            score += 0.05

        # Transcript emotional keywords
        if transcript:
            text = transcript.get("text", "").lower()
            if any(kw in text for kw in self.EMOTION_KEYWORDS["high"]):
                score += 0.3
            elif any(kw in text for kw in self.EMOTION_KEYWORDS["medium"]):
                score += 0.15
            # Penalty for weak/uncertain language
            if any(kw in text for kw in self.EMOTION_KEYWORDS["low"]):
                score -= 0.1

        # Audio energy features from librosa (if available)
        if audio:
            rms_energy = audio.get("rms_energy") or 0
            if rms_energy > 0.5:
                score += 0.1
            elif rms_energy > 0.3:
                score += 0.05

        return max(0.0, min(1.0, score))

    def _score_visual(self, scene: Dict[str, Any]) -> float:
        """Score visual interest (0-1)."""
        score = 0.0

        # Motion intensity (action = visually interesting)
        motion = scene.get("avgMotionIntensity") or 0
        if motion:
            score += float(motion) * 0.4

        # Scene duration sweet spot
        # Ideal: 2-8 seconds for trailer pacing
        duration = scene.get("duration") or 0
        if 2 <= duration <= 8:
            score += 0.3  # Perfect trailer length
        elif 1 <= duration < 2:
            score += 0.2  # Quick cut, might be impactful
        elif 8 < duration <= 15:
            score += 0.15  # Slightly long but usable
        elif duration > 15:
            score += 0.05  # Too long, would need trimming

        # Color diversity (more colors = more visual interest)
        colors = scene.get("dominantColors") or []
        if len(colors) >= 3:
            score += 0.2
        elif len(colors) >= 2:
            score += 0.1
        elif len(colors) == 1:
            score += 0.05  # Monochromatic can be stylistic

        # Keyframe density (more keyframes = more visual changes)
        keyframes = scene.get("keyframeTimestamps") or []
        if duration > 0 and len(keyframes) > 0:
            kf_density = len(keyframes) / duration
            if kf_density > 0.5:  # High visual activity
                score += 0.1

        return max(0.0, min(1.0, score))

    def _score_narrative(
        self,
        transcript: Optional[Dict[str, Any]],
    ) -> float:
        """Score narrative/story value (0-1)."""
        if not transcript:
            return 0.3  # Default for scenes without dialogue

        text = transcript.get("text", "")
        if not text.strip():
            return 0.3

        words = text.split()
        score = 0.0

        # Length scoring (trailer lines are typically 3-15 words)
        word_count = len(words)
        if 3 <= word_count <= 15:
            score += 0.3  # Perfect trailer length
        elif 1 <= word_count < 3:
            score += 0.1  # Too short, might be a grunt or single word
        elif 15 < word_count <= 25:
            score += 0.15  # Slightly long but could work
        elif word_count > 25:
            score += 0.05  # Too long for trailer

        # Sentence structure (questions, imperatives are trailer-worthy)
        if "?" in text:
            score += 0.2  # Questions create intrigue
        if text.strip().endswith("!"):
            score += 0.15  # Exclamations show intensity

        # Personal pronouns = character moments
        pronouns = ["i", "you", "we", "they", "he", "she"]
        text_lower = text.lower()
        if any(f" {p} " in f" {text_lower} " for p in pronouns):
            score += 0.15

        # Trailer-worthy phrases
        if any(phrase in text_lower for phrase in self.TRAILER_PHRASES):
            score += 0.2

        # Penalty for exposition markers
        exposition_markers = [
            "let me explain",
            "as you know",
            "remember when",
            "back in",
            "years ago",
            "once upon",
        ]
        if any(marker in text_lower for marker in exposition_markers):
            score -= 0.2

        return max(0.0, min(1.0, score))


# ============================================
# DIALOGUE SELECTION AI
# ============================================


class DialogueSelectionAI:
    """Select the best dialogue lines for trailer using GPT-4o.

    Analyzes transcript segments and scores them for trailer worthiness,
    considering punchiness, emotional impact, and out-of-context clarity.
    """

    SELECTION_CRITERIA = """
Select dialogue for a cinematic trailer. Great trailer lines:
1. Create INTRIGUE without spoilers
2. Convey STAKES and CONFLICT
3. Are SHORT and PUNCHY (3-15 words ideal)
4. Work OUT OF CONTEXT
5. Have EMOTIONAL weight
6. Use ACTIVE voice and strong verbs

Avoid:
- Exposition or backstory
- Character names that mean nothing to audience
- Plot-specific references
- Weak verbs (is, was, have, be)
- Long rambling sentences
- Filler words and hesitations
"""

    # Strong words that work in trailers
    STRONG_WORDS = [
        "must",
        "will",
        "never",
        "always",
        "everything",
        "only",
        "truth",
        "death",
        "life",
        "love",
        "war",
        "fight",
        "save",
        "destroy",
        "choose",
        "begin",
        "end",
    ]

    # Weak words that don't work in trailers
    WEAK_WORDS = [
        "maybe",
        "perhaps",
        "sort of",
        "kind of",
        "i think",
        "i guess",
        "probably",
        "might",
        "could",
        "um",
        "uh",
        "like",
        "you know",
    ]

    def __init__(self, job_id: Optional[str] = None):
        self.job_id = job_id

    def _log(self, msg: str):
        """Log with job ID prefix."""
        prefix = f"[{self.job_id}]" if self.job_id else "[DialogueAI]"
        print(f"{prefix} {msg}")

    async def select_trailer_lines(
        self,
        transcript_segments: List[Dict[str, Any]],
        max_lines: int = 8,
        trailer_duration_sec: float = 120,
    ) -> List[Dict[str, Any]]:
        """Select the best lines for a trailer using GPT-4o.

        Args:
            transcript_segments: List of transcript segments with text, start, end
            max_lines: Maximum number of lines to select
            trailer_duration_sec: Target trailer duration for context

        Returns:
            List of selected segments with added trailer_score and trailer_purpose
        """
        import openai

        client = openai.AsyncOpenAI()

        # Prepare segments for analysis (skip very short ones)
        segments_text = []
        for i, seg in enumerate(transcript_segments):
            text = seg.get("text", "").strip()
            if len(text) > 5:  # Skip very short segments
                segments_text.append(
                    {
                        "index": i,
                        "text": text,
                        "start": seg.get("start") or 0,
                        "end": seg.get("end") or 0,
                        "duration": (seg.get("end") or 0) - (seg.get("start") or 0),
                    }
                )

        if not segments_text:
            self._log("No valid dialogue segments to analyze")
            return []

        # Limit to top pre-scored segments for efficiency
        pre_scored = self.rank_all_lines(transcript_segments)
        top_candidates = [s for s in pre_scored if (s.get("quick_score") or 0) > 0.4][:50]

        if not top_candidates:
            top_candidates = pre_scored[:30]  # Fallback

        # Prepare for GPT
        candidate_text = [
            {
                "index": transcript_segments.index(s) if s in transcript_segments else i,
                "text": s.get("text", ""),
                "start": s.get("start") or 0,
                "end": s.get("end") or 0,
                "quick_score": s.get("quick_score") or 0.5,
            }
            for i, s in enumerate(top_candidates)
        ]

        prompt = f"""You are a Hollywood trailer editor selecting dialogue.

{self.SELECTION_CRITERIA}

Trailer Duration: {trailer_duration_sec} seconds
Maximum Lines to Select: {max_lines}

CANDIDATE DIALOGUE (pre-scored by heuristics):
{json.dumps(candidate_text, indent=2)}

Select up to {max_lines} best lines for a trailer. For each, provide:
- index: The segment index from the candidates
- trailer_score: 0-1 score for trailer worthiness (0.7+ is good)
- trailer_purpose: "hook" | "stakes" | "conflict" | "question" | "button"
- edit_suggestion: Optional shorter/punchier version, or null

Return JSON:
{{
  "selected_lines": [
    {{
      "index": 0,
      "trailer_score": 0.95,
      "trailer_purpose": "hook",
      "edit_suggestion": null
    }}
  ],
  "reasoning": "Brief explanation of selections"
}}"""

        try:
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.5,
            )

            result = json.loads(response.choices[0].message.content)

            # Merge selections back with original segments
            selected = []
            for sel in result.get("selected_lines", []):
                idx = sel.get("index")
                if idx is not None and idx < len(top_candidates):
                    # Find original segment
                    candidate = top_candidates[idx]
                    segment = candidate.copy()
                    segment["trailer_score"] = sel.get("trailer_score", 0.5)
                    segment["trailer_purpose"] = sel.get("trailer_purpose", "general")
                    segment["edit_suggestion"] = sel.get("edit_suggestion")
                    selected.append(segment)

            self._log(
                f"Selected {len(selected)} lines: {result.get('reasoning', 'N/A')[:100]}"
            )
            return selected

        except Exception as e:
            self._log(f"GPT selection failed: {e}, falling back to heuristics")
            # Fallback to top pre-scored lines
            return pre_scored[:max_lines]

    def rank_all_lines(
        self,
        transcript_segments: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Score ALL lines without GPT (faster, local heuristics).

        Use this for pre-filtering before GPT selection.

        Args:
            transcript_segments: List of transcript segments

        Returns:
            Segments with added quick_score field, sorted by score descending
        """
        scored = []

        for seg in transcript_segments:
            text = seg.get("text", "").strip()
            score = self._quick_score(text)

            scored.append(
                {
                    **seg,
                    "quick_score": score,
                }
            )

        # Sort by score descending
        scored.sort(key=lambda x: x["quick_score"], reverse=True)
        return scored

    def _quick_score(self, text: str) -> float:
        """Quick heuristic scoring without AI (0-1).

        Args:
            text: Dialogue text to score

        Returns:
            Quick score between 0 and 1
        """
        if not text:
            return 0.0

        score = 0.5  # Base score
        words = text.split()
        text_lower = text.lower()

        # Length scoring (trailer lines are 3-15 words)
        word_count = len(words)
        if 3 <= word_count <= 12:
            score += 0.2
        elif word_count < 3:
            score -= 0.1
        elif word_count > 20:
            score -= 0.2
        elif word_count > 15:
            score -= 0.1

        # Punctuation (questions and exclamations are good)
        if "?" in text:
            score += 0.15
        if "!" in text:
            score += 0.1

        # Strong words
        if any(w in text_lower for w in self.STRONG_WORDS):
            score += 0.15

        # Weak words (penalty)
        if any(w in text_lower for w in self.WEAK_WORDS):
            score -= 0.15

        # All caps words (emphasis)
        caps_words = [w for w in words if w.isupper() and len(w) > 1]
        if caps_words:
            score += 0.1

        # Personal pronouns (character moment)
        if any(p in f" {text_lower} " for p in [" i ", " you ", " we "]):
            score += 0.1

        return max(0.0, min(1.0, score))


# ============================================
# BEAT-SYNC EDITING
# ============================================


class BeatSyncEditor:
    """Align video cuts to music beats using librosa.

    Analyzes music for beat positions, tempo, and energy curves,
    then adjusts clip cut points to align with musical beats.
    """

    def __init__(self, job_id: Optional[str] = None):
        self.job_id = job_id
        self._librosa = None
        self._numpy = None

    def _log(self, msg: str):
        """Log with job ID prefix."""
        prefix = f"[{self.job_id}]" if self.job_id else "[BeatSync]"
        print(f"{prefix} {msg}")

    def _get_librosa(self):
        """Lazy import librosa (heavy dependency)."""
        if self._librosa is None:
            try:
                import librosa

                self._librosa = librosa
            except ImportError:
                raise RuntimeError(
                    "librosa not installed. Add 'librosa>=0.10.0' to requirements."
                )
        return self._librosa

    async def analyze_music_beats(
        self,
        music_path: str,
        target_fps: float = 30.0,
    ) -> Dict[str, Any]:
        """Analyze music file for beat positions and energy.

        Args:
            music_path: Path to music audio file (mp3, wav, etc.)
            target_fps: Video frame rate for frame-accurate beat alignment

        Returns:
            Dict with:
                - tempo: BPM
                - beat_times: All beat timestamps (seconds)
                - downbeat_times: First beat of each measure (seconds)
                - peak_times: Impact/peak moment timestamps
                - duration: Total audio duration
                - energy_curve: {times, values} for intensity matching
        """
        librosa = self._get_librosa()

        self._log(f"Analyzing music beats in {music_path}")

        # Load audio (22050 Hz is efficient for beat tracking)
        y, sr = librosa.load(music_path, sr=22050)
        duration = len(y) / sr

        # Beat detection
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)

        # Handle tempo being an array (newer librosa versions)
        if hasattr(tempo, "__len__"):
            tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
        else:
            tempo = float(tempo)

        # Downbeat detection (first beat of each measure, assuming 4/4 time)
        downbeat_times = beat_times[::4] if len(beat_times) > 0 else np.array([])

        # Energy envelope (RMS) for intensity matching
        rms = librosa.feature.rms(y=y)[0]
        rms_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr)

        # Normalize RMS to 0-1
        if rms.max() > 0:
            rms_normalized = rms / rms.max()
        else:
            rms_normalized = rms

        # Peak/onset detection for impact moments
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        peaks = librosa.util.peak_pick(
            onset_env,
            pre_max=3,
            post_max=3,
            pre_avg=3,
            post_avg=5,
            delta=0.5,
            wait=10,
        )
        peak_times = librosa.frames_to_time(peaks, sr=sr)

        # Snap times to frame boundaries for video sync
        frame_duration = 1.0 / target_fps
        beat_times = self._snap_to_frames(beat_times, frame_duration)
        downbeat_times = self._snap_to_frames(downbeat_times, frame_duration)
        peak_times = self._snap_to_frames(peak_times, frame_duration)

        self._log(
            f"Found tempo={tempo:.1f} BPM, {len(beat_times)} beats, "
            f"{len(downbeat_times)} downbeats, {len(peak_times)} peaks"
        )

        return {
            "tempo": tempo,
            "beat_times": beat_times.tolist(),
            "downbeat_times": downbeat_times.tolist(),
            "peak_times": peak_times.tolist(),
            "duration": float(duration),
            "energy_curve": {
                "times": rms_times.tolist(),
                "values": rms_normalized.tolist(),
            },
        }

    def _snap_to_frames(
        self,
        times: np.ndarray,
        frame_duration: float,
    ) -> np.ndarray:
        """Snap times to nearest video frame boundary.

        Args:
            times: Array of timestamps
            frame_duration: Duration of one video frame (1/fps)

        Returns:
            Times snapped to frame boundaries
        """
        if len(times) == 0:
            return times
        return np.round(times / frame_duration) * frame_duration

    async def align_cuts_to_beats(
        self,
        clips: List[Dict[str, Any]],
        beat_analysis: Dict[str, Any],
        alignment_mode: str = "downbeat",
        max_adjustment: float = 0.5,
    ) -> List[Dict[str, Any]]:
        """Adjust clip cut points to align with music beats.

        Args:
            clips: List of clip objects with targetStart/targetEnd
            beat_analysis: Result from analyze_music_beats
            alignment_mode: "beat" (every beat), "downbeat" (every 4th), "peak" (impacts)
            max_adjustment: Maximum time adjustment per cut (seconds)

        Returns:
            Clips with adjusted targetStart/targetEnd for beat alignment
        """
        # Select reference times based on alignment mode
        if alignment_mode == "downbeat":
            reference_times = beat_analysis.get("downbeat_times", [])
        elif alignment_mode == "peak":
            reference_times = beat_analysis.get("peak_times", [])
        else:  # "beat"
            reference_times = beat_analysis.get("beat_times", [])

        if not reference_times:
            self._log("No beats to align to, returning original clips")
            return clips

        aligned_clips = []
        cumulative_adjustment = 0.0
        alignments_made = 0

        for i, clip in enumerate(clips):
            clip_copy = clip.copy()

            # Calculate adjusted positions
            target_start = (clip.get("targetStart") or 0) + cumulative_adjustment
            target_end = (clip.get("targetEnd") or 0) + cumulative_adjustment

            # Find nearest beat to the current cut point (end of clip)
            nearest_beat = self._find_nearest(target_end, reference_times)

            # Only adjust if within tolerance
            adjustment = nearest_beat - target_end

            if abs(adjustment) <= max_adjustment:
                # Adjust this clip's end and accumulate for next clips
                clip_copy["targetEnd"] = nearest_beat
                clip_copy["beat_aligned"] = True
                clip_copy["alignment_adjustment"] = adjustment
                cumulative_adjustment += adjustment
                alignments_made += 1
            else:
                clip_copy["targetEnd"] = target_end
                clip_copy["beat_aligned"] = False
                clip_copy["alignment_adjustment"] = 0

            clip_copy["targetStart"] = target_start
            aligned_clips.append(clip_copy)

        self._log(f"Aligned {alignments_made}/{len(clips)} cuts to beats")
        return aligned_clips

    def _find_nearest(self, time: float, reference_times: List[float]) -> float:
        """Find the nearest reference time to a given time.

        Args:
            time: Target time
            reference_times: List of reference beat times

        Returns:
            Nearest reference time
        """
        if not reference_times:
            return time

        arr = np.array(reference_times)
        idx = np.abs(arr - time).argmin()
        return reference_times[idx]

    async def generate_cut_suggestions(
        self,
        scene_scores: List[Dict[str, Any]],
        beat_analysis: Dict[str, Any],
        target_duration: float,
    ) -> List[Dict[str, Any]]:
        """Suggest optimal cut points based on beats and scene scores.

        Creates a new edit suggestion by:
        1. Prioritizing high-scoring scenes
        2. Aligning cuts to downbeats
        3. Adjusting pacing based on tempo

        Args:
            scene_scores: Scenes with importanceScores
            beat_analysis: Music beat analysis
            target_duration: Target trailer duration

        Returns:
            List of suggested clips with beat-aligned timestamps
        """
        downbeats = beat_analysis.get("downbeat_times", [])
        tempo = beat_analysis.get("tempo", 120)

        # Calculate ideal number of cuts based on tempo
        # Fast tempo = more cuts, slow tempo = fewer cuts
        if tempo > 140:
            cuts_per_minute = 15  # Fast action
        elif tempo > 100:
            cuts_per_minute = 10  # Medium
        else:
            cuts_per_minute = 6  # Slow, dramatic

        target_cuts = int((target_duration / 60) * cuts_per_minute)

        # Prioritize high-scoring scenes
        sorted_scenes = sorted(
            scene_scores,
            key=lambda s: (s.get("importanceScores") or {}).get("combined") or 0,
            reverse=True,
        )

        suggestions = []
        used_time = 0.0

        for scene in sorted_scenes[:target_cuts]:
            if used_time >= target_duration:
                break

            scene_duration = scene.get("duration") or 5
            scene_start = scene.get("startTime") or 0

            # Calculate clip duration (max 8s per clip for good pacing)
            clip_duration = min(scene_duration, 8)

            # Find best beat alignment for this scene
            ideal_end = used_time + clip_duration
            aligned_end = self._find_nearest(ideal_end, downbeats)

            # Make sure we don't exceed target duration
            if aligned_end > target_duration:
                aligned_end = target_duration

            actual_clip_duration = aligned_end - used_time
            if actual_clip_duration < 1:  # Skip very short clips
                continue

            suggestions.append(
                {
                    "sceneIndex": scene.get("sceneIndex"),
                    "sourceStart": scene_start,
                    "sourceEnd": scene_start + actual_clip_duration,
                    "targetStart": used_time,
                    "targetEnd": aligned_end,
                    "beat_aligned": True,
                    "importance_score": scene.get("importanceScores", {}).get(
                        "combined", 0
                    ),
                }
            )

            used_time = aligned_end

        self._log(
            f"Generated {len(suggestions)} beat-aligned cut suggestions "
            f"for {target_duration:.1f}s trailer at {tempo:.1f} BPM"
        )

        return suggestions

    def get_energy_at_time(
        self,
        beat_analysis: Dict[str, Any],
        time: float,
    ) -> float:
        """Get music energy level at a specific time.

        Args:
            beat_analysis: Result from analyze_music_beats
            time: Time in seconds

        Returns:
            Energy level (0-1)
        """
        energy_curve = beat_analysis.get("energy_curve", {})
        times = energy_curve.get("times", [])
        values = energy_curve.get("values", [])

        if not times or not values:
            return 0.5

        # Find nearest time index
        arr = np.array(times)
        idx = np.abs(arr - time).argmin()

        if idx < len(values):
            return float(values[idx])
        return 0.5


# ============================================
# UTILITY FUNCTIONS
# ============================================


def create_editing_intelligence(job_id: Optional[str] = None):
    """Factory function to create all editing intelligence components.

    Args:
        job_id: Optional job ID for logging

    Returns:
        Tuple of (SceneImportanceScorer, DialogueSelectionAI, BeatSyncEditor)
    """
    return (
        SceneImportanceScorer(job_id=job_id),
        DialogueSelectionAI(job_id=job_id),
        BeatSyncEditor(job_id=job_id),
    )
