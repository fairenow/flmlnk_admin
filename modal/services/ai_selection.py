"""
Phase 9: AI-Powered Selection Enhancements

This module provides advanced AI capabilities for trailer clip selection:
1. Audience Analysis - Optimize selections for target demographics
2. Genre Optimization - Apply genre-specific rules and conventions
3. Emotional Arc Analysis - Ensure proper emotional pacing
4. A/B Variant Generation - Create multiple trailer variants for testing
5. Pacing Optimization - Optimize cut rhythm and tempo

The goal is to enhance the AI's decision-making to produce more engaging
trailers tailored to specific audiences and genres.
"""

import os
import json
import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Any, List, Optional, Tuple
import asyncio


class AudienceType(Enum):
    """Target audience demographics."""
    GENERAL = "general"           # Broad appeal, all ages
    YOUNG_ADULT = "young_adult"   # 18-34, action/comedy/romance
    MATURE = "mature"             # 35+, drama/thriller/documentary
    FAMILY = "family"             # All ages, animated/adventure
    HORROR_FANS = "horror_fans"   # Horror enthusiasts
    ART_HOUSE = "art_house"       # Film festival/arthouse audiences
    ACTION_FANS = "action_fans"   # Action/adventure enthusiasts


class Genre(Enum):
    """Film genres with trailer conventions."""
    ACTION = "action"
    COMEDY = "comedy"
    DRAMA = "drama"
    HORROR = "horror"
    THRILLER = "thriller"
    ROMANCE = "romance"
    SCI_FI = "sci_fi"
    FANTASY = "fantasy"
    DOCUMENTARY = "documentary"
    ANIMATION = "animation"
    INDIE = "indie"
    MYSTERY = "mystery"


class EmotionalBeat(Enum):
    """Emotional beats in a trailer arc."""
    INTRIGUE = "intrigue"         # Hook the audience
    SETUP = "setup"               # Establish world/characters
    TENSION = "tension"           # Build conflict
    ESCALATION = "escalation"     # Raise stakes
    CLIMAX = "climax"             # Peak intensity
    RESOLUTION = "resolution"     # Tease ending/button


@dataclass
class AudienceProfile:
    """Profile defining target audience preferences."""
    audience_type: AudienceType
    preferred_genres: List[Genre]

    # Pacing preferences
    avg_shot_duration_sec: float  # Preferred average shot length
    max_dialogue_ratio: float     # Max dialogue vs action (0-1)
    action_preference: float      # Action intensity preference (0-1)

    # Content preferences
    prefer_dialogue_hooks: bool   # Use dialogue for opening hooks
    prefer_visual_spectacle: bool # Prioritize visual moments
    prefer_character_focus: bool  # Focus on character moments
    prefer_mystery: bool          # Keep plot details hidden

    # Emotional preferences
    emotional_intensity: float    # Target emotional impact (0-1)
    humor_tolerance: float        # Include comedy beats (0-1)
    tension_preference: float     # Sustained tension level (0-1)


@dataclass
class GenreConventions:
    """Genre-specific trailer conventions and rules."""
    genre: Genre

    # Structure
    typical_structure: List[str]  # e.g., ["hook", "setup", "montage", "button"]
    avg_duration_sec: float       # Typical trailer length

    # Pacing
    opening_pace: str             # "slow", "medium", "fast"
    climax_pace: str              # Pace at climax
    shot_acceleration: bool       # Speed up cuts toward end

    # Content rules
    spoiler_sensitivity: float    # How much to hide plot (0-1)
    dialogue_importance: float    # Dialogue weight (0-1)
    music_sync_importance: float  # Music beat sync weight (0-1)

    # Visual elements
    preferred_transitions: List[str]
    use_flash_frames: bool
    use_slow_motion: bool
    letterbox_style: Optional[str]

    # Text cards
    text_card_style: str          # "bold", "minimal", "elegant", "gritty"
    text_card_frequency: int      # Cards per minute


@dataclass
class EmotionalArc:
    """Emotional arc for a trailer."""
    beats: List[Tuple[float, EmotionalBeat, float]]  # (timestamp, beat, intensity)
    overall_intensity_curve: List[float]  # 0-1 values over duration
    peak_moment: float  # Timestamp of peak intensity
    resolution_start: float  # When resolution begins


@dataclass
class ABVariant:
    """A/B test variant configuration."""
    variant_id: str
    variant_name: str

    # Variant modifications
    clip_order_seed: int          # Random seed for clip ordering
    emphasis: str                 # "action", "dialogue", "mystery", "character"
    pacing_modifier: float        # Speed up/slow down (0.8-1.2)
    text_card_variant: str        # Text card style variation
    music_style: str              # Music mood variation

    # Tracking
    is_control: bool              # Is this the control variant?


# Default audience profiles
AUDIENCE_PROFILES: Dict[AudienceType, AudienceProfile] = {
    AudienceType.GENERAL: AudienceProfile(
        audience_type=AudienceType.GENERAL,
        preferred_genres=[Genre.ACTION, Genre.COMEDY, Genre.DRAMA],
        avg_shot_duration_sec=3.0,
        max_dialogue_ratio=0.4,
        action_preference=0.5,
        prefer_dialogue_hooks=True,
        prefer_visual_spectacle=True,
        prefer_character_focus=True,
        prefer_mystery=True,
        emotional_intensity=0.6,
        humor_tolerance=0.5,
        tension_preference=0.5,
    ),
    AudienceType.YOUNG_ADULT: AudienceProfile(
        audience_type=AudienceType.YOUNG_ADULT,
        preferred_genres=[Genre.ACTION, Genre.COMEDY, Genre.SCI_FI, Genre.ROMANCE],
        avg_shot_duration_sec=2.0,
        max_dialogue_ratio=0.3,
        action_preference=0.7,
        prefer_dialogue_hooks=False,
        prefer_visual_spectacle=True,
        prefer_character_focus=False,
        prefer_mystery=False,
        emotional_intensity=0.7,
        humor_tolerance=0.7,
        tension_preference=0.6,
    ),
    AudienceType.MATURE: AudienceProfile(
        audience_type=AudienceType.MATURE,
        preferred_genres=[Genre.DRAMA, Genre.THRILLER, Genre.MYSTERY],
        avg_shot_duration_sec=4.0,
        max_dialogue_ratio=0.6,
        action_preference=0.3,
        prefer_dialogue_hooks=True,
        prefer_visual_spectacle=False,
        prefer_character_focus=True,
        prefer_mystery=True,
        emotional_intensity=0.5,
        humor_tolerance=0.3,
        tension_preference=0.7,
    ),
    AudienceType.HORROR_FANS: AudienceProfile(
        audience_type=AudienceType.HORROR_FANS,
        preferred_genres=[Genre.HORROR, Genre.THRILLER],
        avg_shot_duration_sec=2.5,
        max_dialogue_ratio=0.3,
        action_preference=0.4,
        prefer_dialogue_hooks=True,
        prefer_visual_spectacle=True,
        prefer_character_focus=False,
        prefer_mystery=True,
        emotional_intensity=0.8,
        humor_tolerance=0.1,
        tension_preference=0.9,
    ),
    AudienceType.ART_HOUSE: AudienceProfile(
        audience_type=AudienceType.ART_HOUSE,
        preferred_genres=[Genre.INDIE, Genre.DRAMA, Genre.DOCUMENTARY],
        avg_shot_duration_sec=5.0,
        max_dialogue_ratio=0.5,
        action_preference=0.2,
        prefer_dialogue_hooks=True,
        prefer_visual_spectacle=False,
        prefer_character_focus=True,
        prefer_mystery=True,
        emotional_intensity=0.6,
        humor_tolerance=0.4,
        tension_preference=0.4,
    ),
    AudienceType.FAMILY: AudienceProfile(
        audience_type=AudienceType.FAMILY,
        preferred_genres=[Genre.ANIMATION, Genre.FANTASY, Genre.COMEDY],
        avg_shot_duration_sec=2.5,
        max_dialogue_ratio=0.4,
        action_preference=0.5,
        prefer_dialogue_hooks=True,
        prefer_visual_spectacle=True,
        prefer_character_focus=True,
        prefer_mystery=False,
        emotional_intensity=0.5,
        humor_tolerance=0.8,
        tension_preference=0.3,
    ),
}

# Genre conventions
GENRE_CONVENTIONS: Dict[Genre, GenreConventions] = {
    Genre.ACTION: GenreConventions(
        genre=Genre.ACTION,
        typical_structure=["cold_open", "setup", "action_montage", "stakes", "montage", "button"],
        avg_duration_sec=150,
        opening_pace="fast",
        climax_pace="very_fast",
        shot_acceleration=True,
        spoiler_sensitivity=0.3,
        dialogue_importance=0.3,
        music_sync_importance=0.9,
        preferred_transitions=["hard_cut", "whip_pan", "dip_to_black"],
        use_flash_frames=True,
        use_slow_motion=True,
        letterbox_style="2.39:1",
        text_card_style="bold",
        text_card_frequency=4,
    ),
    Genre.HORROR: GenreConventions(
        genre=Genre.HORROR,
        typical_structure=["atmosphere", "intrigue", "scares", "reveal", "button"],
        avg_duration_sec=120,
        opening_pace="slow",
        climax_pace="very_fast",
        shot_acceleration=True,
        spoiler_sensitivity=0.8,
        dialogue_importance=0.4,
        music_sync_importance=0.8,
        preferred_transitions=["dip_to_black", "hard_cut"],
        use_flash_frames=True,
        use_slow_motion=True,
        letterbox_style="2.39:1",
        text_card_style="gritty",
        text_card_frequency=3,
    ),
    Genre.DRAMA: GenreConventions(
        genre=Genre.DRAMA,
        typical_structure=["character_intro", "conflict", "emotional_build", "climax", "resolution_tease"],
        avg_duration_sec=150,
        opening_pace="slow",
        climax_pace="medium",
        shot_acceleration=False,
        spoiler_sensitivity=0.6,
        dialogue_importance=0.8,
        music_sync_importance=0.5,
        preferred_transitions=["crossfade", "dip_to_black"],
        use_flash_frames=False,
        use_slow_motion=False,
        letterbox_style="2.39:1",
        text_card_style="elegant",
        text_card_frequency=3,
    ),
    Genre.COMEDY: GenreConventions(
        genre=Genre.COMEDY,
        typical_structure=["joke_hook", "premise", "gag_montage", "heart", "button_joke"],
        avg_duration_sec=150,
        opening_pace="medium",
        climax_pace="fast",
        shot_acceleration=False,
        spoiler_sensitivity=0.2,
        dialogue_importance=0.9,
        music_sync_importance=0.4,
        preferred_transitions=["hard_cut", "wipe_right"],
        use_flash_frames=False,
        use_slow_motion=False,
        letterbox_style=None,
        text_card_style="minimal",
        text_card_frequency=2,
    ),
    Genre.THRILLER: GenreConventions(
        genre=Genre.THRILLER,
        typical_structure=["hook", "mystery", "tension_build", "reveal_tease", "cliffhanger"],
        avg_duration_sec=135,
        opening_pace="medium",
        climax_pace="fast",
        shot_acceleration=True,
        spoiler_sensitivity=0.9,
        dialogue_importance=0.6,
        music_sync_importance=0.7,
        preferred_transitions=["hard_cut", "dip_to_black", "crossfade"],
        use_flash_frames=True,
        use_slow_motion=True,
        letterbox_style="2.39:1",
        text_card_style="bold",
        text_card_frequency=4,
    ),
    Genre.ROMANCE: GenreConventions(
        genre=Genre.ROMANCE,
        typical_structure=["meet_cute", "connection", "conflict", "separation", "hope"],
        avg_duration_sec=140,
        opening_pace="slow",
        climax_pace="medium",
        shot_acceleration=False,
        spoiler_sensitivity=0.4,
        dialogue_importance=0.8,
        music_sync_importance=0.6,
        preferred_transitions=["crossfade", "dip_to_white"],
        use_flash_frames=False,
        use_slow_motion=True,
        letterbox_style=None,
        text_card_style="elegant",
        text_card_frequency=3,
    ),
    Genre.SCI_FI: GenreConventions(
        genre=Genre.SCI_FI,
        typical_structure=["world_intro", "discovery", "conflict", "spectacle", "stakes", "button"],
        avg_duration_sec=150,
        opening_pace="medium",
        climax_pace="fast",
        shot_acceleration=True,
        spoiler_sensitivity=0.5,
        dialogue_importance=0.5,
        music_sync_importance=0.8,
        preferred_transitions=["hard_cut", "zoom_transition", "dip_to_black"],
        use_flash_frames=True,
        use_slow_motion=True,
        letterbox_style="2.39:1",
        text_card_style="bold",
        text_card_frequency=4,
    ),
    Genre.DOCUMENTARY: GenreConventions(
        genre=Genre.DOCUMENTARY,
        typical_structure=["hook", "subject_intro", "journey", "impact", "call_to_action"],
        avg_duration_sec=120,
        opening_pace="slow",
        climax_pace="medium",
        shot_acceleration=False,
        spoiler_sensitivity=0.3,
        dialogue_importance=0.9,
        music_sync_importance=0.4,
        preferred_transitions=["crossfade", "dip_to_black"],
        use_flash_frames=False,
        use_slow_motion=False,
        letterbox_style=None,
        text_card_style="minimal",
        text_card_frequency=5,
    ),
}


class AudienceAnalyzer:
    """
    Analyzes target audience and optimizes clip selection accordingly.

    Uses demographic data and viewing preferences to tailor the trailer
    to specific audience segments.
    """

    def __init__(self, job_id: str = ""):
        self.job_id = job_id
        self._openai_client = None

    def _get_openai_client(self):
        """Lazy initialization of OpenAI client."""
        if self._openai_client is None:
            import openai
            self._openai_client = openai.AsyncOpenAI()
        return self._openai_client

    def get_audience_profile(
        self,
        audience_type: AudienceType,
    ) -> AudienceProfile:
        """Get predefined audience profile."""
        return AUDIENCE_PROFILES.get(audience_type, AUDIENCE_PROFILES[AudienceType.GENERAL])

    async def analyze_content_for_audience(
        self,
        scenes: List[Dict[str, Any]],
        transcript: Dict[str, Any],
        audience_profile: AudienceProfile,
    ) -> Dict[str, Any]:
        """
        Analyze content and score scenes for target audience.

        Args:
            scenes: List of scene objects with analysis data
            transcript: Transcription with segments
            audience_profile: Target audience profile

        Returns:
            Dict with audience-scored scenes and recommendations
        """
        client = self._get_openai_client()

        # Prepare scene summaries
        scene_summaries = []
        for scene in scenes[:50]:  # Limit for prompt size
            scene_summaries.append({
                "index": scene.get("sceneIndex", 0),
                "duration": scene.get("duration", 0),
                "has_dialogue": scene.get("hasDialogue", False),
                "motion_intensity": scene.get("avgMotionIntensity", 0),
                "importance": scene.get("importanceScores", {}),
            })

        # Get transcript text
        transcript_text = transcript.get("text", "")[:5000]

        prompt = f"""You are a movie marketing expert analyzing content for a specific audience.

TARGET AUDIENCE: {audience_profile.audience_type.value}
- Preferred shot duration: {audience_profile.avg_shot_duration_sec}s
- Action preference: {audience_profile.action_preference} (0-1)
- Dialogue preference: {audience_profile.max_dialogue_ratio} (0-1)
- Prefers visual spectacle: {audience_profile.prefer_visual_spectacle}
- Prefers character focus: {audience_profile.prefer_character_focus}
- Emotional intensity target: {audience_profile.emotional_intensity}

AVAILABLE SCENES:
{json.dumps(scene_summaries, indent=2)}

TRANSCRIPT EXCERPT:
{transcript_text}

Analyze the content and provide:
1. Top 15 scene indices most suitable for this audience (in order of priority)
2. Recommended opening scene index (hook)
3. Recommended climax scene indices (2-3 scenes)
4. Dialogue lines that would resonate with this audience (up to 5)
5. Overall tone recommendation ("energetic", "emotional", "mysterious", "fun", "intense")

Return JSON:
{{
  "top_scenes": [0, 1, 2, ...],
  "opening_scene": 0,
  "climax_scenes": [10, 12, 14],
  "key_dialogue": [
    {{"text": "...", "start": 0.0, "audience_appeal": "high"}}
  ],
  "tone_recommendation": "energetic",
  "reasoning": "Brief explanation of choices"
}}"""

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.5,
        )

        result = json.loads(response.choices[0].message.content)

        # Add audience profile to result
        result["audience_type"] = audience_profile.audience_type.value
        result["audience_profile"] = {
            "avg_shot_duration": audience_profile.avg_shot_duration_sec,
            "action_preference": audience_profile.action_preference,
            "emotional_intensity": audience_profile.emotional_intensity,
        }

        return result

    def score_scene_for_audience(
        self,
        scene: Dict[str, Any],
        audience_profile: AudienceProfile,
    ) -> float:
        """
        Score a single scene for audience fit (0-1).

        Args:
            scene: Scene object with analysis data
            audience_profile: Target audience profile

        Returns:
            Audience fit score (0-1)
        """
        score = 0.5  # Base score

        # Motion intensity scoring
        motion = scene.get("avgMotionIntensity", 0.5)
        if audience_profile.action_preference > 0.6:
            # Action-preferring audience likes high motion
            score += (motion - 0.5) * 0.3
        else:
            # Low-action audience prefers moderate motion
            score -= abs(motion - 0.4) * 0.2

        # Dialogue scoring
        has_dialogue = scene.get("hasDialogue", False)
        if audience_profile.prefer_dialogue_hooks and has_dialogue:
            score += 0.2

        # Duration scoring
        duration = scene.get("duration", 3.0)
        ideal_duration = audience_profile.avg_shot_duration_sec
        duration_diff = abs(duration - ideal_duration)
        score -= min(0.2, duration_diff * 0.05)

        # Character focus scoring
        has_faces = scene.get("hasFaces", False)
        if audience_profile.prefer_character_focus and has_faces:
            score += 0.15

        # Emotional intensity matching
        emotional_score = scene.get("importanceScores", {}).get("emotional", 0.5)
        if abs(emotional_score - audience_profile.emotional_intensity) < 0.2:
            score += 0.1

        return max(0, min(1, score))


class GenreOptimizer:
    """
    Applies genre-specific rules and conventions to clip selection.

    Each genre has different expectations for pacing, content,
    and structure that this class helps enforce.
    """

    def __init__(self, job_id: str = ""):
        self.job_id = job_id

    def get_genre_conventions(self, genre: Genre) -> GenreConventions:
        """Get conventions for a genre."""
        return GENRE_CONVENTIONS.get(genre, GENRE_CONVENTIONS[Genre.DRAMA])

    def detect_genre_from_content(
        self,
        scenes: List[Dict[str, Any]],
        transcript: Dict[str, Any],
    ) -> Tuple[Genre, float]:
        """
        Detect likely genre from content analysis.

        Returns:
            Tuple of (detected genre, confidence 0-1)
        """
        # Analyze content signals
        total_motion = sum(s.get("avgMotionIntensity", 0) for s in scenes) / max(len(scenes), 1)
        dialogue_ratio = sum(1 for s in scenes if s.get("hasDialogue")) / max(len(scenes), 1)

        text = transcript.get("text", "").lower()

        # Genre keywords
        genre_signals = {
            Genre.HORROR: ["scary", "fear", "death", "dark", "kill", "monster", "scream"],
            Genre.COMEDY: ["funny", "laugh", "joke", "hilarious", "comedy"],
            Genre.ACTION: ["fight", "explosion", "chase", "war", "battle", "hero"],
            Genre.ROMANCE: ["love", "heart", "kiss", "relationship", "together", "romantic"],
            Genre.THRILLER: ["danger", "mystery", "secret", "truth", "lie", "escape"],
            Genre.SCI_FI: ["space", "future", "alien", "technology", "planet", "robot"],
            Genre.DRAMA: ["family", "life", "story", "journey", "believe", "hope"],
        }

        scores = {}
        for genre, keywords in genre_signals.items():
            keyword_score = sum(1 for kw in keywords if kw in text) / len(keywords)
            scores[genre] = keyword_score

        # Adjust based on motion/dialogue
        if total_motion > 0.7:
            scores[Genre.ACTION] = scores.get(Genre.ACTION, 0) + 0.3
        if dialogue_ratio > 0.7:
            scores[Genre.DRAMA] = scores.get(Genre.DRAMA, 0) + 0.2
            scores[Genre.COMEDY] = scores.get(Genre.COMEDY, 0) + 0.1

        # Find best match
        best_genre = max(scores, key=scores.get) if scores else Genre.DRAMA
        confidence = min(1.0, scores.get(best_genre, 0) + 0.3)

        return best_genre, confidence

    def apply_genre_structure(
        self,
        clips: List[Dict[str, Any]],
        conventions: GenreConventions,
        trailer_duration: float,
    ) -> List[Dict[str, Any]]:
        """
        Reorganize clips to follow genre structure.

        Args:
            clips: List of selected clips
            conventions: Genre conventions
            trailer_duration: Target duration

        Returns:
            Reorganized clips following genre structure
        """
        if not clips:
            return clips

        structure = conventions.typical_structure
        section_duration = trailer_duration / len(structure)

        # Categorize clips by characteristics
        high_energy = [c for c in clips if c.get("avgMotionIntensity", 0) > 0.6]
        dialogue_clips = [c for c in clips if c.get("hasDialogue", False)]
        character_clips = [c for c in clips if c.get("hasFaces", False)]
        atmospheric = [c for c in clips if c.get("avgMotionIntensity", 0) < 0.3]

        reorganized = []
        used_indices = set()

        for section in structure:
            section_clips = []

            if "hook" in section or "cold_open" in section:
                # Opening - use high energy or strong dialogue
                candidates = high_energy if conventions.opening_pace == "fast" else dialogue_clips
                if candidates:
                    clip = candidates[0]
                    section_clips.append(clip)
                    used_indices.add(clip.get("sceneIndex"))

            elif "montage" in section:
                # Montage - mix of quick clips
                for c in high_energy[:3]:
                    if c.get("sceneIndex") not in used_indices:
                        section_clips.append(c)
                        used_indices.add(c.get("sceneIndex"))

            elif "character" in section or "setup" in section:
                # Character/setup - dialogue and faces
                candidates = [c for c in character_clips if c.get("sceneIndex") not in used_indices]
                for c in candidates[:2]:
                    section_clips.append(c)
                    used_indices.add(c.get("sceneIndex"))

            elif "climax" in section or "stakes" in section:
                # Climax - highest energy
                candidates = sorted(
                    [c for c in clips if c.get("sceneIndex") not in used_indices],
                    key=lambda x: x.get("avgMotionIntensity", 0),
                    reverse=True
                )
                for c in candidates[:2]:
                    section_clips.append(c)
                    used_indices.add(c.get("sceneIndex"))

            elif "atmosphere" in section:
                # Atmosphere - slow, moody
                candidates = [c for c in atmospheric if c.get("sceneIndex") not in used_indices]
                for c in candidates[:2]:
                    section_clips.append(c)
                    used_indices.add(c.get("sceneIndex"))

            else:
                # Default - any unused clips
                candidates = [c for c in clips if c.get("sceneIndex") not in used_indices]
                if candidates:
                    section_clips.append(candidates[0])
                    used_indices.add(candidates[0].get("sceneIndex"))

            reorganized.extend(section_clips)

        # Add remaining clips
        for clip in clips:
            if clip.get("sceneIndex") not in used_indices:
                reorganized.append(clip)

        return reorganized

    def get_recommended_effects(
        self,
        conventions: GenreConventions,
    ) -> Dict[str, Any]:
        """Get recommended effects for genre."""
        return {
            "transitions": conventions.preferred_transitions,
            "use_flash_frames": conventions.use_flash_frames,
            "use_slow_motion": conventions.use_slow_motion,
            "letterbox": conventions.letterbox_style,
            "text_card_style": conventions.text_card_style,
            "text_card_frequency": conventions.text_card_frequency,
            "shot_acceleration": conventions.shot_acceleration,
            "music_sync_importance": conventions.music_sync_importance,
        }


class EmotionalArcAnalyzer:
    """
    Analyzes and optimizes the emotional arc of a trailer.

    Ensures the trailer has proper emotional pacing with rising tension,
    appropriate climax, and satisfying resolution tease.
    """

    def __init__(self, job_id: str = ""):
        self.job_id = job_id

    async def analyze_emotional_arc(
        self,
        clips: List[Dict[str, Any]],
        text_cards: List[Dict[str, Any]],
        beat_analysis: Optional[Dict[str, Any]] = None,
    ) -> EmotionalArc:
        """
        Analyze the emotional arc of current clip sequence.

        Args:
            clips: Ordered list of clips
            text_cards: Text cards with timestamps
            beat_analysis: Optional music beat analysis

        Returns:
            EmotionalArc object with beat mapping
        """
        if not clips:
            return EmotionalArc(beats=[], overall_intensity_curve=[], peak_moment=0, resolution_start=0)

        beats = []
        intensity_curve = []

        total_duration = sum(c.get("duration", 0) for c in clips)
        current_time = 0

        for i, clip in enumerate(clips):
            duration = clip.get("duration", 3.0)
            motion = clip.get("avgMotionIntensity", 0.5)
            emotional = clip.get("importanceScores", {}).get("emotional", 0.5)

            # Calculate intensity for this segment
            intensity = (motion + emotional) / 2

            # Determine beat type based on position and intensity
            position_ratio = current_time / max(total_duration, 1)

            if position_ratio < 0.1:
                beat_type = EmotionalBeat.INTRIGUE
            elif position_ratio < 0.25:
                beat_type = EmotionalBeat.SETUP
            elif position_ratio < 0.5:
                beat_type = EmotionalBeat.TENSION
            elif position_ratio < 0.75:
                beat_type = EmotionalBeat.ESCALATION
            elif position_ratio < 0.9:
                beat_type = EmotionalBeat.CLIMAX
            else:
                beat_type = EmotionalBeat.RESOLUTION

            beats.append((current_time, beat_type, intensity))
            intensity_curve.append(intensity)

            current_time += duration

        # Find peak moment
        if intensity_curve:
            peak_idx = intensity_curve.index(max(intensity_curve))
            peak_time = sum(c.get("duration", 0) for c in clips[:peak_idx])
        else:
            peak_time = total_duration * 0.75

        # Resolution typically starts at 90%
        resolution_start = total_duration * 0.9

        return EmotionalArc(
            beats=beats,
            overall_intensity_curve=intensity_curve,
            peak_moment=peak_time,
            resolution_start=resolution_start,
        )

    def optimize_arc(
        self,
        clips: List[Dict[str, Any]],
        target_arc: str = "standard",
    ) -> List[Dict[str, Any]]:
        """
        Reorder clips to optimize emotional arc.

        Args:
            clips: List of clips to reorder
            target_arc: Arc type ("standard", "slow_burn", "explosive", "mystery")

        Returns:
            Reordered clips
        """
        if not clips or len(clips) < 4:
            return clips

        # Score clips by intensity
        scored = []
        for clip in clips:
            motion = clip.get("avgMotionIntensity", 0.5)
            emotional = clip.get("importanceScores", {}).get("emotional", 0.5)
            intensity = (motion + emotional) / 2
            scored.append((clip, intensity))

        # Sort by intensity
        sorted_clips = sorted(scored, key=lambda x: x[1])

        # Distribute based on arc type
        n = len(sorted_clips)

        if target_arc == "standard":
            # Standard: Low -> Medium -> High -> Peak -> Resolution
            opening = sorted_clips[:n//4]
            middle = sorted_clips[n//4:n//2]
            build = sorted_clips[n//2:3*n//4]
            climax = sorted_clips[3*n//4:]

            result = (
                [c[0] for c in opening] +
                [c[0] for c in middle] +
                [c[0] for c in build] +
                [c[0] for c in reversed(climax)]
            )

        elif target_arc == "slow_burn":
            # Slow burn: Very slow start, gradual build
            opening = sorted_clips[:n//3]
            middle = sorted_clips[n//3:2*n//3]
            climax = sorted_clips[2*n//3:]

            result = (
                [c[0] for c in opening] +
                [c[0] for c in middle] +
                [c[0] for c in climax]
            )

        elif target_arc == "explosive":
            # Explosive: Start high, dip, then explode
            high_start = sorted_clips[-n//4:]
            low_middle = sorted_clips[:n//4]
            build = sorted_clips[n//4:3*n//4]

            result = (
                [c[0] for c in reversed(high_start)] +
                [c[0] for c in low_middle] +
                [c[0] for c in build]
            )

        elif target_arc == "mystery":
            # Mystery: Irregular intensity to maintain intrigue
            # Shuffle but keep climax at end
            main_clips = sorted_clips[:-n//4]
            climax = sorted_clips[-n//4:]

            # Semi-random distribution
            random.shuffle(main_clips)
            result = [c[0] for c in main_clips] + [c[0] for c in climax]

        else:
            result = [c[0] for c in sorted_clips]

        return result

    def validate_arc(
        self,
        arc: EmotionalArc,
    ) -> Dict[str, Any]:
        """
        Validate emotional arc quality.

        Returns:
            Dict with validation results and suggestions
        """
        issues = []
        suggestions = []
        score = 1.0

        if not arc.beats:
            return {"valid": False, "score": 0, "issues": ["No beats detected"]}

        # Check for monotonic intensity (boring)
        if len(arc.overall_intensity_curve) > 5:
            diffs = [
                arc.overall_intensity_curve[i+1] - arc.overall_intensity_curve[i]
                for i in range(len(arc.overall_intensity_curve) - 1)
            ]
            if all(d >= 0 for d in diffs) or all(d <= 0 for d in diffs):
                issues.append("Intensity is monotonic - consider more variation")
                suggestions.append("Add contrasting beats for emotional variety")
                score -= 0.2

        # Check peak timing
        total_duration = arc.beats[-1][0] if arc.beats else 0
        if total_duration > 0:
            peak_ratio = arc.peak_moment / total_duration
            if peak_ratio < 0.6:
                issues.append("Peak moment too early in trailer")
                suggestions.append("Move high-intensity moments toward the end")
                score -= 0.15
            elif peak_ratio > 0.95:
                issues.append("Peak moment too late - no room for button")
                suggestions.append("Allow time after climax for title card")
                score -= 0.1

        # Check opening intensity
        if arc.overall_intensity_curve and arc.overall_intensity_curve[0] > 0.8:
            issues.append("Opening too intense - nowhere to build")
            suggestions.append("Start with lower intensity to allow for escalation")
            score -= 0.15

        return {
            "valid": len(issues) == 0,
            "score": max(0, score),
            "issues": issues,
            "suggestions": suggestions,
            "peak_moment": arc.peak_moment,
            "resolution_start": arc.resolution_start,
        }


class ABVariantGenerator:
    """
    Generates A/B test variants of trailers for performance comparison.

    Creates multiple versions with different emphasis, pacing, and
    style to determine what resonates best with audiences.
    """

    def __init__(self, job_id: str = ""):
        self.job_id = job_id

    def generate_variants(
        self,
        clips: List[Dict[str, Any]],
        text_cards: List[Dict[str, Any]],
        num_variants: int = 3,
        include_control: bool = True,
    ) -> List[ABVariant]:
        """
        Generate A/B test variant configurations.

        Args:
            clips: Base clip selection
            text_cards: Base text cards
            num_variants: Number of variants to generate
            include_control: Include unchanged control variant

        Returns:
            List of ABVariant configurations
        """
        variants = []

        if include_control:
            variants.append(ABVariant(
                variant_id="control",
                variant_name="Control (Original)",
                clip_order_seed=0,
                emphasis="balanced",
                pacing_modifier=1.0,
                text_card_variant="original",
                music_style="original",
                is_control=True,
            ))

        # Variant templates
        templates = [
            {
                "name": "Action Focus",
                "emphasis": "action",
                "pacing_modifier": 1.1,
                "text_card_variant": "bold",
                "music_style": "energetic",
            },
            {
                "name": "Character Focus",
                "emphasis": "character",
                "pacing_modifier": 0.95,
                "text_card_variant": "elegant",
                "music_style": "emotional",
            },
            {
                "name": "Mystery Focus",
                "emphasis": "mystery",
                "pacing_modifier": 1.0,
                "text_card_variant": "minimal",
                "music_style": "tension",
            },
            {
                "name": "Dialogue Focus",
                "emphasis": "dialogue",
                "pacing_modifier": 0.9,
                "text_card_variant": "elegant",
                "music_style": "dramatic",
            },
            {
                "name": "Fast Paced",
                "emphasis": "action",
                "pacing_modifier": 1.2,
                "text_card_variant": "bold",
                "music_style": "energetic",
            },
        ]

        # Generate requested number of variants
        for i in range(min(num_variants - (1 if include_control else 0), len(templates))):
            template = templates[i]
            variants.append(ABVariant(
                variant_id=f"variant_{i+1}",
                variant_name=template["name"],
                clip_order_seed=i + 1,
                emphasis=template["emphasis"],
                pacing_modifier=template["pacing_modifier"],
                text_card_variant=template["text_card_variant"],
                music_style=template["music_style"],
                is_control=False,
            ))

        return variants

    def apply_variant(
        self,
        clips: List[Dict[str, Any]],
        text_cards: List[Dict[str, Any]],
        variant: ABVariant,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Apply variant modifications to clips and text cards.

        Args:
            clips: Original clips
            text_cards: Original text cards
            variant: Variant configuration

        Returns:
            Tuple of (modified clips, modified text cards)
        """
        if variant.is_control:
            return clips, text_cards

        modified_clips = []

        # Reorder clips based on emphasis
        if variant.emphasis == "action":
            # Sort by motion intensity, high first
            sorted_clips = sorted(
                clips,
                key=lambda c: c.get("avgMotionIntensity", 0),
                reverse=True
            )
            # Keep high action clips prominent
            modified_clips = sorted_clips

        elif variant.emphasis == "character":
            # Prioritize clips with faces/dialogue
            character_clips = [c for c in clips if c.get("hasFaces") or c.get("hasDialogue")]
            other_clips = [c for c in clips if c not in character_clips]
            modified_clips = character_clips + other_clips

        elif variant.emphasis == "mystery":
            # Use random seed for unpredictable order
            random.seed(variant.clip_order_seed)
            modified_clips = clips.copy()
            random.shuffle(modified_clips)

        elif variant.emphasis == "dialogue":
            # Prioritize dialogue clips
            dialogue_clips = [c for c in clips if c.get("hasDialogue")]
            other_clips = [c for c in clips if c not in dialogue_clips]
            modified_clips = dialogue_clips + other_clips

        else:
            modified_clips = clips.copy()

        # Apply pacing modifier to durations
        for clip in modified_clips:
            if "duration" in clip:
                clip["duration"] = clip["duration"] / variant.pacing_modifier

        # Modify text cards based on variant
        modified_cards = []
        for card in text_cards:
            modified_card = card.copy()
            modified_card["style"] = variant.text_card_variant
            # Adjust timing based on pacing
            if "atSec" in modified_card:
                modified_card["atSec"] = modified_card["atSec"] / variant.pacing_modifier
            if "durationSec" in modified_card:
                modified_card["durationSec"] = modified_card["durationSec"] / variant.pacing_modifier
            modified_cards.append(modified_card)

        return modified_clips, modified_cards


class PacingOptimizer:
    """
    Optimizes the pacing and rhythm of trailer cuts.

    Uses music analysis and genre conventions to determine
    optimal cut timing and shot duration.
    """

    def __init__(self, job_id: str = ""):
        self.job_id = job_id

    def analyze_pacing(
        self,
        clips: List[Dict[str, Any]],
        target_duration: float,
    ) -> Dict[str, Any]:
        """
        Analyze current pacing of clip sequence.

        Returns:
            Dict with pacing metrics and recommendations
        """
        if not clips:
            return {"valid": False, "issues": ["No clips"]}

        durations = [c.get("duration", 0) for c in clips if c.get("duration", 0) > 0]

        if not durations:
            return {"valid": False, "issues": ["No duration data"]}

        avg_duration = sum(durations) / len(durations)
        min_duration = min(durations)
        max_duration = max(durations)
        total_duration = sum(durations)

        # Calculate cuts per minute
        cuts_per_minute = (len(durations) / total_duration) * 60 if total_duration > 0 else 0

        # Analyze pacing curve (do shots speed up?)
        first_half = durations[:len(durations)//2]
        second_half = durations[len(durations)//2:]

        first_avg = sum(first_half) / len(first_half) if first_half else 0
        second_avg = sum(second_half) / len(second_half) if second_half else 0

        accelerating = second_avg < first_avg * 0.9  # Shots getting shorter

        issues = []
        suggestions = []

        # Check for pacing issues
        if avg_duration > 5:
            issues.append("Average shot duration too long for trailer")
            suggestions.append("Trim clips to 2-4 seconds each")

        if avg_duration < 1.5:
            issues.append("Average shot duration too short - may feel chaotic")
            suggestions.append("Allow some shots to breathe")

        if max_duration > 10:
            issues.append(f"Longest shot ({max_duration:.1f}s) may lose audience attention")
            suggestions.append("Split long shots or use B-roll cutaways")

        if not accelerating:
            suggestions.append("Consider accelerating cuts toward the climax")

        return {
            "valid": len(issues) == 0,
            "avg_duration": avg_duration,
            "min_duration": min_duration,
            "max_duration": max_duration,
            "total_duration": total_duration,
            "target_duration": target_duration,
            "cuts_per_minute": cuts_per_minute,
            "accelerating": accelerating,
            "issues": issues,
            "suggestions": suggestions,
        }

    def optimize_pacing(
        self,
        clips: List[Dict[str, Any]],
        beat_times: Optional[List[float]] = None,
        target_duration: float = 120,
        genre_conventions: Optional[GenreConventions] = None,
    ) -> List[Dict[str, Any]]:
        """
        Optimize clip pacing based on music and conventions.

        Args:
            clips: List of clips with duration data
            beat_times: Optional list of music beat timestamps
            target_duration: Target trailer duration
            genre_conventions: Optional genre-specific rules

        Returns:
            Clips with optimized durations and timing
        """
        if not clips:
            return clips

        optimized = []
        current_time = 0

        # Calculate target cut frequency
        if genre_conventions:
            if genre_conventions.opening_pace == "fast":
                opening_duration = 2.0
            elif genre_conventions.opening_pace == "slow":
                opening_duration = 4.0
            else:
                opening_duration = 3.0

            if genre_conventions.climax_pace == "very_fast":
                climax_duration = 1.5
            elif genre_conventions.climax_pace == "fast":
                climax_duration = 2.0
            else:
                climax_duration = 3.0

            accelerate = genre_conventions.shot_acceleration
        else:
            opening_duration = 3.0
            climax_duration = 2.0
            accelerate = True

        # Calculate duration curve
        for i, clip in enumerate(clips):
            clip_copy = clip.copy()
            progress = i / max(len(clips) - 1, 1)  # 0 to 1

            # Calculate target duration based on position
            if accelerate:
                target_shot_duration = opening_duration - (opening_duration - climax_duration) * progress
            else:
                target_shot_duration = (opening_duration + climax_duration) / 2

            # Snap to beat if available
            if beat_times:
                # Find nearest beat for cut point
                cut_point = current_time + target_shot_duration
                nearest_beat = min(beat_times, key=lambda b: abs(b - cut_point), default=cut_point)

                # Adjust if beat is close
                if abs(nearest_beat - cut_point) < 0.5:
                    target_shot_duration = nearest_beat - current_time

            # Ensure minimum duration
            target_shot_duration = max(1.0, target_shot_duration)

            # Update clip
            original_duration = clip.get("sourceEnd", 0) - clip.get("sourceStart", 0)
            if original_duration > target_shot_duration:
                # Trim clip
                center = clip.get("sourceStart", 0) + original_duration / 2
                clip_copy["sourceStart"] = center - target_shot_duration / 2
                clip_copy["sourceEnd"] = center + target_shot_duration / 2

            clip_copy["targetStart"] = current_time
            clip_copy["targetEnd"] = current_time + target_shot_duration
            clip_copy["duration"] = target_shot_duration
            clip_copy["pacing_optimized"] = True

            optimized.append(clip_copy)
            current_time += target_shot_duration

        return optimized

    def calculate_rhythm_score(
        self,
        clip_durations: List[float],
        beat_times: List[float],
    ) -> float:
        """
        Calculate how well cuts align with music beats.

        Returns:
            Score 0-1 (1 = perfect alignment)
        """
        if not clip_durations or not beat_times:
            return 0.5

        # Calculate cut times
        cut_times = []
        current = 0
        for duration in clip_durations:
            current += duration
            cut_times.append(current)

        # Score alignment
        total_distance = 0
        for cut_time in cut_times:
            nearest_beat = min(beat_times, key=lambda b: abs(b - cut_time), default=cut_time)
            distance = abs(nearest_beat - cut_time)
            total_distance += distance

        avg_distance = total_distance / len(cut_times)

        # Convert to 0-1 score (0 = 1+ second off, 1 = perfect)
        score = max(0, 1 - avg_distance)

        return score


class AISelectionEnhancer:
    """
    Main orchestrator for Phase 9 AI-powered selection enhancements.

    Combines all analysis components to produce optimized trailer selections.
    """

    def __init__(self, job_id: str = ""):
        self.job_id = job_id
        self.audience_analyzer = AudienceAnalyzer(job_id)
        self.genre_optimizer = GenreOptimizer(job_id)
        self.arc_analyzer = EmotionalArcAnalyzer(job_id)
        self.variant_generator = ABVariantGenerator(job_id)
        self.pacing_optimizer = PacingOptimizer(job_id)

    async def enhance_selection(
        self,
        scenes: List[Dict[str, Any]],
        transcript: Dict[str, Any],
        clips: List[Dict[str, Any]],
        text_cards: List[Dict[str, Any]],
        profile: Dict[str, Any],
        beat_analysis: Optional[Dict[str, Any]] = None,
        audience_type: Optional[str] = None,
        genre_override: Optional[str] = None,
        generate_variants: bool = False,
    ) -> Dict[str, Any]:
        """
        Apply all AI enhancements to clip selection.

        Args:
            scenes: All detected scenes
            transcript: Full transcription
            clips: Currently selected clips
            text_cards: Currently generated text cards
            profile: Trailer profile settings
            beat_analysis: Optional music beat analysis
            audience_type: Override audience type
            genre_override: Override detected genre
            generate_variants: Whether to generate A/B variants

        Returns:
            Enhanced selection with all optimizations applied
        """
        print(f"[{self.job_id}] Starting AI selection enhancement...")

        # Step 1: Detect or use provided genre
        if genre_override:
            genre = Genre(genre_override)
            genre_confidence = 1.0
        else:
            genre, genre_confidence = self.genre_optimizer.detect_genre_from_content(
                scenes, transcript
            )
        print(f"[{self.job_id}] Detected genre: {genre.value} (confidence: {genre_confidence:.2f})")

        # Step 2: Get genre conventions
        conventions = self.genre_optimizer.get_genre_conventions(genre)

        # Step 3: Get audience profile
        if audience_type:
            audience = self.audience_analyzer.get_audience_profile(AudienceType(audience_type))
        else:
            # Default based on genre
            audience = self.audience_analyzer.get_audience_profile(AudienceType.GENERAL)

        # Step 4: Analyze content for audience
        audience_analysis = await self.audience_analyzer.analyze_content_for_audience(
            scenes, transcript, audience
        )
        print(f"[{self.job_id}] Audience analysis complete: {len(audience_analysis.get('top_scenes', []))} top scenes")

        # Step 5: Apply genre structure
        structured_clips = self.genre_optimizer.apply_genre_structure(
            clips, conventions, profile.get("durationTargetSec", 120)
        )

        # Step 6: Optimize emotional arc
        optimized_clips = self.arc_analyzer.optimize_arc(
            structured_clips, target_arc="standard"
        )

        # Step 7: Analyze and validate arc
        arc = await self.arc_analyzer.analyze_emotional_arc(
            optimized_clips, text_cards, beat_analysis
        )
        arc_validation = self.arc_analyzer.validate_arc(arc)
        print(f"[{self.job_id}] Arc validation score: {arc_validation['score']:.2f}")

        # Step 8: Optimize pacing
        beat_times = beat_analysis.get("beat_times", []) if beat_analysis else []
        paced_clips = self.pacing_optimizer.optimize_pacing(
            optimized_clips,
            beat_times=beat_times,
            target_duration=profile.get("durationTargetSec", 120),
            genre_conventions=conventions,
        )

        # Step 9: Analyze final pacing
        pacing_analysis = self.pacing_optimizer.analyze_pacing(
            paced_clips, profile.get("durationTargetSec", 120)
        )

        # Step 10: Generate A/B variants if requested
        variants = []
        if generate_variants:
            variants = self.variant_generator.generate_variants(
                paced_clips, text_cards, num_variants=3, include_control=True
            )
            print(f"[{self.job_id}] Generated {len(variants)} A/B variants")

        # Get recommended effects
        recommended_effects = self.genre_optimizer.get_recommended_effects(conventions)

        return {
            "enhanced_clips": paced_clips,
            "text_cards": text_cards,

            # Genre analysis
            "detected_genre": genre.value,
            "genre_confidence": genre_confidence,
            "genre_conventions": {
                "structure": conventions.typical_structure,
                "opening_pace": conventions.opening_pace,
                "climax_pace": conventions.climax_pace,
                "text_card_style": conventions.text_card_style,
            },

            # Audience analysis
            "audience_analysis": audience_analysis,
            "audience_type": audience.audience_type.value,

            # Arc analysis
            "emotional_arc": {
                "peak_moment": arc.peak_moment,
                "resolution_start": arc.resolution_start,
                "intensity_curve": arc.overall_intensity_curve[:20],  # First 20 points
            },
            "arc_validation": arc_validation,

            # Pacing analysis
            "pacing_analysis": pacing_analysis,

            # Recommended effects
            "recommended_effects": recommended_effects,

            # A/B variants
            "variants": [
                {
                    "variant_id": v.variant_id,
                    "variant_name": v.variant_name,
                    "emphasis": v.emphasis,
                    "pacing_modifier": v.pacing_modifier,
                    "is_control": v.is_control,
                }
                for v in variants
            ] if variants else [],

            # Summary
            "enhancement_summary": {
                "genre_applied": True,
                "audience_optimized": True,
                "arc_optimized": arc_validation["valid"],
                "pacing_optimized": pacing_analysis["valid"],
                "variants_generated": len(variants),
            },
        }

    def create_selection_plan(
        self,
        enhanced_result: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Create a selection plan document for Convex storage.

        Args:
            enhanced_result: Result from enhance_selection

        Returns:
            Plan document for storage
        """
        return {
            "detectedGenre": enhanced_result.get("detected_genre"),
            "genreConfidence": enhanced_result.get("genre_confidence", 0),
            "genreConventions": enhanced_result.get("genre_conventions", {}),

            "audienceType": enhanced_result.get("audience_type"),
            "audienceAnalysis": {
                "topScenes": enhanced_result.get("audience_analysis", {}).get("top_scenes", []),
                "openingScene": enhanced_result.get("audience_analysis", {}).get("opening_scene"),
                "climaxScenes": enhanced_result.get("audience_analysis", {}).get("climax_scenes", []),
                "toneRecommendation": enhanced_result.get("audience_analysis", {}).get("tone_recommendation"),
            },

            "emotionalArc": enhanced_result.get("emotional_arc", {}),
            "arcValidation": enhanced_result.get("arc_validation", {}),

            "pacingAnalysis": enhanced_result.get("pacing_analysis", {}),

            "recommendedEffects": enhanced_result.get("recommended_effects", {}),

            "variants": enhanced_result.get("variants", []),

            "enhancementSummary": enhanced_result.get("enhancement_summary", {}),
        }


class ThumbnailSelector:
    """
    AI-powered thumbnail selection from trailer frames.

    Uses GPT-4o vision to analyze frames and select the best
    candidates for trailer thumbnails based on composition,
    star presence, emotion, and click-worthiness.
    """

    THUMBNAIL_CRITERIA = """
Evaluate this frame for trailer thumbnail potential. Consider:

1. STAR POWER (0-10): Is a lead actor's face clearly visible with good expression?
2. ACTION (0-10): Does it capture a dynamic, exciting moment frozen in time?
3. COMPOSITION (0-10): Rule of thirds, leading lines, visual interest?
4. EMOTION (0-10): Does it convey the film's tone/genre effectively?
5. CURIOSITY (0-10): Would it make a viewer want to click/watch?
6. TECHNICAL (0-10): Is it sharp, well-lit, without motion blur?

AVOID frames with:
- Blurry or out-of-focus content
- Mid-blink or awkward facial expressions
- Text overlays obscuring key visuals
- Dark/underexposed areas
- Generic establishing shots without interest
"""

    def __init__(self, job_id: str = ""):
        self.job_id = job_id
        self._openai_client = None

    def _get_openai_client(self):
        """Lazy initialization of OpenAI client."""
        if self._openai_client is None:
            import openai
            self._openai_client = openai.AsyncOpenAI()
        return self._openai_client

    async def select_best_thumbnails(
        self,
        video_path: str,
        num_candidates: int = 20,
        num_final: int = 5,
        scene_timestamps: Optional[List[float]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Select best thumbnail candidates from video.

        Args:
            video_path: Path to video file
            num_candidates: Number of frames to extract as candidates
            num_final: Number of best thumbnails to return
            scene_timestamps: Optional list of scene change timestamps

        Returns:
            List of thumbnail info dicts with scores and reasoning
        """
        import subprocess
        import base64
        import tempfile
        import os

        print(f"[{self.job_id}] Extracting {num_candidates} thumbnail candidates...")

        # Extract candidate frames
        candidates = await self._extract_candidate_frames(
            video_path, num_candidates, scene_timestamps
        )

        if not candidates:
            print(f"[{self.job_id}] No candidate frames extracted")
            return []

        print(f"[{self.job_id}] Scoring {len(candidates)} candidates with GPT-4o vision...")

        # Score each candidate with GPT-4o vision
        scored_candidates = []
        for frame in candidates:
            try:
                score = await self._score_thumbnail(frame["path"])
                scored_candidates.append({
                    **frame,
                    "score": score.get("overall", 0),
                    "breakdown": score.get("breakdown", {}),
                    "reasoning": score.get("reasoning", ""),
                })
            except Exception as e:
                print(f"[{self.job_id}] Failed to score frame at {frame['timestamp']}: {e}")
                continue

        # Sort by score and return top N
        scored_candidates.sort(key=lambda x: x.get("score", 0), reverse=True)

        # Clean up temporary frame files
        for candidate in candidates:
            if os.path.exists(candidate["path"]):
                try:
                    os.remove(candidate["path"])
                except Exception:
                    pass

        return scored_candidates[:num_final]

    async def _extract_candidate_frames(
        self,
        video_path: str,
        num_frames: int,
        scene_timestamps: Optional[List[float]] = None,
    ) -> List[Dict[str, Any]]:
        """Extract candidate frames using scene detection or even sampling."""
        import subprocess
        import tempfile
        import os

        frames = []
        temp_dir = tempfile.mkdtemp()

        if scene_timestamps and len(scene_timestamps) >= num_frames // 2:
            # Use scene change timestamps
            timestamps = scene_timestamps[:num_frames]
        else:
            # Use FFmpeg scene detection
            try:
                cmd = [
                    "ffprobe",
                    "-v", "quiet",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    video_path,
                ]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                duration = float(result.stdout.strip())

                # Sample evenly across video duration
                timestamps = [
                    (i / num_frames) * duration
                    for i in range(num_frames)
                ]
            except Exception as e:
                print(f"[{self.job_id}] Error getting video duration: {e}")
                return []

        # Extract frames at timestamps
        for i, ts in enumerate(timestamps):
            frame_path = os.path.join(temp_dir, f"thumb_candidate_{i}.jpg")
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(ts),
                "-i", video_path,
                "-frames:v", "1",
                "-q:v", "2",  # High quality JPEG
                frame_path,
            ]

            try:
                subprocess.run(cmd, check=True, capture_output=True, timeout=30)
                if os.path.exists(frame_path):
                    frames.append({
                        "path": frame_path,
                        "timestamp": ts,
                        "index": i,
                    })
            except Exception as e:
                print(f"[{self.job_id}] Failed to extract frame at {ts}: {e}")

        return frames

    async def _score_thumbnail(self, frame_path: str) -> Dict[str, Any]:
        """Score a frame for thumbnail potential using GPT-4o."""
        import base64

        with open(frame_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode()

        client = self._get_openai_client()

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"""{self.THUMBNAIL_CRITERIA}

Score this frame and return JSON:
{{
  "overall": <0-10 weighted average>,
  "breakdown": {{
    "star_power": <0-10>,
    "action": <0-10>,
    "composition": <0-10>,
    "emotion": <0-10>,
    "curiosity": <0-10>,
    "technical": <0-10>
  }},
  "reasoning": "<1-2 sentence explanation>"
}}""",
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{image_data}"},
                        },
                    ],
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=500,
        )

        return json.loads(response.choices[0].message.content)

    async def generate_thumbnail_variants(
        self,
        frame_path: str,
        output_dir: str,
        aspect_ratios: List[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Generate thumbnail variants with different crops for various platforms.

        Args:
            frame_path: Path to source frame
            output_dir: Directory for output thumbnails
            aspect_ratios: List of aspect ratios to generate (e.g., ["16:9", "1:1", "9:16"])

        Returns:
            List of generated thumbnail info
        """
        import subprocess
        import os

        if aspect_ratios is None:
            aspect_ratios = ["16:9", "1:1", "4:5", "9:16"]

        os.makedirs(output_dir, exist_ok=True)

        variants = []
        base_name = os.path.splitext(os.path.basename(frame_path))[0]

        # Get source dimensions
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0:s=x",
            frame_path,
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            src_width, src_height = map(int, result.stdout.strip().split("x"))
        except Exception:
            src_width, src_height = 1920, 1080

        for ratio in aspect_ratios:
            ratio_w, ratio_h = map(int, ratio.split(":"))
            ratio_name = f"{ratio_w}x{ratio_h}"

            # Calculate crop dimensions
            target_ratio = ratio_w / ratio_h
            src_ratio = src_width / src_height

            if src_ratio > target_ratio:
                # Source is wider - crop width
                crop_height = src_height
                crop_width = int(crop_height * target_ratio)
            else:
                # Source is taller - crop height
                crop_width = src_width
                crop_height = int(crop_width / target_ratio)

            # Center crop
            x_offset = (src_width - crop_width) // 2
            y_offset = (src_height - crop_height) // 2

            output_path = os.path.join(output_dir, f"{base_name}_{ratio_name}.jpg")

            cmd = [
                "ffmpeg", "-y",
                "-i", frame_path,
                "-vf", f"crop={crop_width}:{crop_height}:{x_offset}:{y_offset}",
                "-q:v", "2",
                output_path,
            ]

            try:
                subprocess.run(cmd, check=True, capture_output=True, timeout=30)
                variants.append({
                    "aspect_ratio": ratio,
                    "path": output_path,
                    "width": crop_width,
                    "height": crop_height,
                })
            except Exception as e:
                print(f"[{self.job_id}] Failed to generate {ratio} variant: {e}")

        return variants

    def get_thumbnail_recommendations(
        self,
        thumbnails: List[Dict[str, Any]],
        platform: str = "all",
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get platform-specific thumbnail recommendations.

        Args:
            thumbnails: List of scored thumbnails
            platform: Target platform or "all"

        Returns:
            Dict mapping platform to recommended thumbnail
        """
        platform_preferences = {
            "youtube": {
                "aspect_ratio": "16:9",
                "priority": ["curiosity", "star_power", "emotion"],
            },
            "instagram": {
                "aspect_ratio": "1:1",
                "priority": ["star_power", "emotion", "composition"],
            },
            "tiktok": {
                "aspect_ratio": "9:16",
                "priority": ["action", "curiosity", "star_power"],
            },
            "twitter": {
                "aspect_ratio": "16:9",
                "priority": ["curiosity", "action", "emotion"],
            },
            "facebook": {
                "aspect_ratio": "16:9",
                "priority": ["emotion", "star_power", "curiosity"],
            },
        }

        if not thumbnails:
            return {}

        recommendations = {}

        if platform == "all":
            platforms = platform_preferences.keys()
        else:
            platforms = [platform] if platform in platform_preferences else []

        for plat in platforms:
            prefs = platform_preferences[plat]
            priority = prefs["priority"]

            # Score thumbnails for this platform
            platform_scores = []
            for thumb in thumbnails:
                breakdown = thumb.get("breakdown", {})
                score = sum(
                    breakdown.get(p, 0) * (len(priority) - i)
                    for i, p in enumerate(priority)
                )
                platform_scores.append((thumb, score))

            # Sort and get best
            platform_scores.sort(key=lambda x: x[1], reverse=True)
            if platform_scores:
                best_thumb = platform_scores[0][0]
                recommendations[plat] = {
                    "thumbnail": best_thumb,
                    "aspect_ratio": prefs["aspect_ratio"],
                    "score": platform_scores[0][1],
                }

        return recommendations