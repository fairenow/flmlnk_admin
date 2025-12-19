"""
ElevenLabs Music Generator for Trailer Audio.

Generates cinematic trailer music using the ElevenLabs Music API.
"""

import os
import asyncio
from typing import Optional, List, Dict, Any

import httpx


class ElevenLabsMusicGenerator:
    """Generate trailer music using ElevenLabs Music API."""

    # Music style presets for different trailer types
    STYLE_PRESETS = {
        "epic_orchestral": {
            "description": "Epic orchestral trailer music with brass, percussion, and strings",
            "instruments": "orchestra, brass, timpani, strings, choir",
        },
        "tension": {
            "description": "Dark, suspenseful trailer music with building dread",
            "instruments": "strings, low brass, synth, pulsing bass",
        },
        "emotional": {
            "description": "Emotional, piano-driven trailer music with swelling strings",
            "instruments": "piano, strings, soft synth pads",
        },
        "action": {
            "description": "High-energy action trailer music with driving drums",
            "instruments": "drums, electric guitar, brass, synth bass",
        },
        "horror": {
            "description": "Eerie, unsettling trailer music with dissonant tones",
            "instruments": "strings, prepared piano, synth drones, reverse effects",
        },
        "comedy": {
            "description": "Light, playful trailer music with bouncy rhythms",
            "instruments": "pizzicato strings, woodwinds, xylophone, light percussion",
        },
    }

    def __init__(self):
        self.api_key = os.environ.get("ELEVENLABS_API_KEY")
        self.base_url = "https://api.elevenlabs.io/v1"
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=180.0)  # Long timeout for generation
        return self._client

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def generate_trailer_music(
        self,
        prompt: str,
        duration_sec: float,
        style: str = "epic_orchestral",
        output_format: str = "mp3_44100_128",
    ) -> bytes:
        """Generate music from text prompt.

        Args:
            prompt: Descriptive prompt like "Epic orchestral build,
                   tension rising, impact at 45 seconds, resolve to sting"
            duration_sec: Target duration in seconds (max 300)
            style: Music style hint from STYLE_PRESETS
            output_format: Audio format (mp3_44100_128, mp3_44100_192, etc.)

        Returns:
            Audio bytes (MP3)

        Raises:
            RuntimeError: If API key is not set or API call fails
        """
        if not self.api_key:
            raise RuntimeError("ELEVENLABS_API_KEY environment variable not set")

        client = await self._get_client()

        # Get style preset info
        preset = self.STYLE_PRESETS.get(style, self.STYLE_PRESETS["epic_orchestral"])

        # Enhance prompt with style description
        enhanced_prompt = f"{preset['description']}. {prompt}. Instruments: {preset['instruments']}"

        # ElevenLabs music generation endpoint
        # Note: As of late 2024, ElevenLabs has sound effects but music generation
        # may be through a different endpoint or third-party. This uses the expected API structure.
        response = await client.post(
            f"{self.base_url}/sound-generation",
            headers={
                "xi-api-key": self.api_key,
                "Content-Type": "application/json",
            },
            json={
                "text": enhanced_prompt,
                "duration_seconds": min(duration_sec, 300),  # Max 5 min
                "prompt_influence": 0.8,  # High influence from prompt
            },
        )

        if response.status_code == 401:
            raise RuntimeError("Invalid ElevenLabs API key")
        elif response.status_code == 429:
            raise RuntimeError("ElevenLabs rate limit exceeded")
        elif response.status_code != 200:
            raise RuntimeError(f"ElevenLabs API error: {response.status_code} - {response.text}")

        return response.content

    def build_trailer_prompt(
        self,
        duration_sec: float,
        rise_points: List[float],
        impact_points: List[float],
        mood: str = "epic",
        title: Optional[str] = None,
    ) -> str:
        """Build a structured music prompt from analysis data.

        Args:
            duration_sec: Total trailer duration
            rise_points: Seconds where intensity should build
            impact_points: Peak moments for hits/stings
            mood: Overall mood (epic, tension, emotional, action)
            title: Optional title for context

        Returns:
            Formatted prompt string for music generation
        """
        sections = []

        # Opening section
        sections.append("mysterious, ambient opening that draws the listener in")

        # Map rise points to build sections
        for i, rise in enumerate(sorted(rise_points)[:4]):
            progress = rise / duration_sec
            if progress < 0.3:
                sections.append(f"gentle tension build starting at {rise:.0f}s")
            elif progress < 0.6:
                sections.append(f"intensity increasing at {rise:.0f}s")
            else:
                sections.append(f"powerful crescendo building from {rise:.0f}s")

        # Map impact points to hits
        for impact in sorted(impact_points)[:6]:
            progress = impact / duration_sec
            if progress < 0.5:
                sections.append(f"orchestral accent at {impact:.0f}s")
            else:
                sections.append(f"major impact hit at {impact:.0f}s")

        # Ending section
        if duration_sec > 30:
            sections.append(f"powerful title sting resolving at {duration_sec - 3:.0f}s")
        else:
            sections.append("conclusive sting at the end")

        # Get mood descriptors
        mood_descriptors = {
            "epic": "Epic cinematic trailer music",
            "tension": "Dark, suspenseful trailer music",
            "emotional": "Emotional, moving trailer music",
            "action": "High-energy action trailer music",
            "horror": "Eerie, unsettling horror trailer music",
        }

        base = mood_descriptors.get(mood, mood_descriptors["epic"])
        structure = ", ".join(sections)

        prompt = f"{base}. {duration_sec:.0f} seconds total. Structure: {structure}"

        if title:
            prompt = f"Music for '{title}' trailer. {prompt}"

        return prompt

    async def generate_with_analysis(
        self,
        duration_sec: float,
        rise_points: List[float],
        impact_points: List[float],
        mood: str = "epic",
        title: Optional[str] = None,
    ) -> tuple[bytes, str]:
        """Generate music using analysis data.

        Args:
            duration_sec: Total trailer duration
            rise_points: Seconds where intensity should build
            impact_points: Peak moments for hits/stings
            mood: Overall mood
            title: Optional title for context

        Returns:
            Tuple of (audio_bytes, prompt_used)
        """
        prompt = self.build_trailer_prompt(
            duration_sec=duration_sec,
            rise_points=rise_points,
            impact_points=impact_points,
            mood=mood,
            title=title,
        )

        style = self._mood_to_style(mood)
        audio = await self.generate_trailer_music(
            prompt=prompt,
            duration_sec=duration_sec,
            style=style,
        )

        return audio, prompt

    def _mood_to_style(self, mood: str) -> str:
        """Map mood to style preset."""
        mood_style_map = {
            "epic": "epic_orchestral",
            "tension": "tension",
            "emotional": "emotional",
            "action": "action",
            "horror": "horror",
            "comedy": "comedy",
        }
        return mood_style_map.get(mood, "epic_orchestral")


def analyze_for_music_points(
    clips: List[Dict[str, Any]],
    text_cards: List[Dict[str, Any]],
    transcript_segments: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Analyze clips and text cards to determine rise/impact points.

    Args:
        clips: List of clip objects with targetStart/targetEnd
        text_cards: List of text card objects with atSec
        transcript_segments: Optional transcript segments with timestamps

    Returns:
        Dict with rise_points, impact_points, and dialogue_windows
    """
    rise_points = []
    impact_points = []
    dialogue_windows = []

    if not clips:
        return {
            "rise_points": [],
            "impact_points": [],
            "dialogue_windows": [],
        }

    # Total duration from clips
    total_duration = max(c.get("targetEnd", 0) for c in clips)

    # Impact points at clip transitions (cuts create visual impact)
    for i, clip in enumerate(clips):
        target_end = clip.get("targetEnd", 0)
        if target_end > 0 and target_end < total_duration:
            impact_points.append(target_end)

    # Rise points before each third of the trailer
    third = total_duration / 3
    rise_points.append(third * 0.5)  # Rise before first third ends
    rise_points.append(third * 1.5)  # Rise before second third ends
    rise_points.append(third * 2.5)  # Rise to climax

    # Impact points at text card appearances
    for card in text_cards:
        at_sec = card.get("atSec", 0)
        if at_sec > 0:
            impact_points.append(at_sec)

    # Dialogue windows from transcript or clip analysis
    if transcript_segments:
        for seg in transcript_segments:
            start = seg.get("start", 0)
            end = seg.get("end", start + 2)
            # Only include if within trailer duration
            if start < total_duration:
                dialogue_windows.append({
                    "startSec": start,
                    "endSec": min(end, total_duration),
                    "importance": 0.7,  # Default importance
                })
    else:
        # Estimate dialogue windows from clips with audio treatment
        for clip in clips:
            if clip.get("audioTreatment") == "dialogue":
                dialogue_windows.append({
                    "startSec": clip.get("targetStart", 0),
                    "endSec": clip.get("targetEnd", 0),
                    "importance": 0.8,
                })

    # Deduplicate and sort
    rise_points = sorted(set(rise_points))
    impact_points = sorted(set(impact_points))

    return {
        "rise_points": rise_points,
        "impact_points": impact_points,
        "dialogue_windows": dialogue_windows,
    }


def determine_music_mood(profile_key: str, structure: List[str]) -> str:
    """Determine music mood from profile and structure.

    Args:
        profile_key: Trailer profile key
        structure: List of structure segments

    Returns:
        Mood string
    """
    # Profile-based defaults
    profile_moods = {
        "theatrical": "epic",
        "teaser": "tension",
        "festival": "emotional",
        "social_vertical": "action",
        "social_square": "action",
        "tv_spot_30": "epic",
        "tv_spot_60": "epic",
    }

    # Structure-based overrides
    if "horror" in structure or "tension" in structure:
        return "tension"
    elif "emotional" in structure or "character" in structure:
        return "emotional"
    elif "action" in structure or "montage" in structure:
        if "emotional" not in structure:
            return "action"

    return profile_moods.get(profile_key, "epic")
