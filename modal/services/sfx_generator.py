"""
ElevenLabs SFX Generator for Trailer Sound Design.

Generates cinematic sound effects (impacts, risers, whooshes, stings)
using the ElevenLabs Sound Effects API.
"""

import os
import asyncio
from typing import Optional, List, Dict, Any

import httpx


class ElevenLabsSFXGenerator:
    """Generate trailer sound effects using ElevenLabs SFX API."""

    # SFX type prompts for different trailer sound elements
    SFX_PROMPTS = {
        "impact": "Deep cinematic impact hit, bass boom, trailer percussion, powerful",
        "riser": "Building tension riser, cinematic whoosh ascending, suspenseful build",
        "whoosh": "Fast transition whoosh, air movement, dramatic swoosh, quick",
        "sting": "Dramatic orchestral sting, brass stab, finale hit, powerful ending",
        "drone": "Dark atmospheric drone, ominous undertone, tension, low rumble",
        "hit": "Sharp percussion hit, snare impact, punchy trailer hit",
        "reverse": "Reverse cymbal swell, building anticipation, crescendo",
        "sub_drop": "Deep sub bass drop, low frequency impact, chest-thumping boom",
    }

    # Default durations for each SFX type
    SFX_DURATIONS = {
        "impact": 1.5,
        "riser": 3.0,
        "whoosh": 1.0,
        "sting": 2.5,
        "drone": 5.0,
        "hit": 0.5,
        "reverse": 2.0,
        "sub_drop": 2.0,
    }

    def __init__(self):
        self.api_key = os.environ.get("ELEVENLABS_API_KEY")
        self.base_url = "https://api.elevenlabs.io/v1"
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=120.0)
        return self._client

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def generate_sfx(
        self,
        sfx_type: str,
        duration_sec: Optional[float] = None,
        custom_prompt: Optional[str] = None,
    ) -> bytes:
        """Generate a sound effect.

        Args:
            sfx_type: Type of SFX from SFX_PROMPTS keys
            duration_sec: Optional duration override
            custom_prompt: Optional custom prompt override

        Returns:
            Audio bytes (MP3)

        Raises:
            RuntimeError: If API key is not set or API call fails
        """
        if not self.api_key:
            raise RuntimeError("ELEVENLABS_API_KEY environment variable not set")

        client = await self._get_client()

        # Get prompt and duration
        prompt = custom_prompt or self.SFX_PROMPTS.get(sfx_type, sfx_type)
        duration = duration_sec or self.SFX_DURATIONS.get(sfx_type, 2.0)

        # ElevenLabs sound effects endpoint
        response = await client.post(
            f"{self.base_url}/sound-generation",
            headers={
                "xi-api-key": self.api_key,
                "Content-Type": "application/json",
            },
            json={
                "text": prompt,
                "duration_seconds": min(duration, 22.0),  # API max is typically 22s
                "prompt_influence": 0.9,  # High influence for consistent results
            },
        )

        if response.status_code == 401:
            raise RuntimeError("Invalid ElevenLabs API key")
        elif response.status_code == 429:
            raise RuntimeError("ElevenLabs rate limit exceeded")
        elif response.status_code != 200:
            raise RuntimeError(f"ElevenLabs SFX API error: {response.status_code} - {response.text}")

        return response.content

    async def generate_batch(
        self,
        sfx_requests: List[Dict[str, Any]],
        concurrency: int = 3,
    ) -> List[Dict[str, Any]]:
        """Generate multiple SFX concurrently.

        Args:
            sfx_requests: List of {type, duration_sec, sfx_index}
            concurrency: Max concurrent requests

        Returns:
            List of {sfx_index, type, audio_bytes, duration_sec}
        """
        results = []
        semaphore = asyncio.Semaphore(concurrency)

        async def generate_one(request: Dict[str, Any]) -> Dict[str, Any]:
            async with semaphore:
                try:
                    audio = await self.generate_sfx(
                        sfx_type=request["type"],
                        duration_sec=request.get("duration_sec"),
                    )
                    return {
                        "sfx_index": request.get("sfx_index", 0),
                        "type": request["type"],
                        "audio_bytes": audio,
                        "duration_sec": request.get("duration_sec", self.SFX_DURATIONS.get(request["type"], 2.0)),
                        "success": True,
                    }
                except Exception as e:
                    return {
                        "sfx_index": request.get("sfx_index", 0),
                        "type": request["type"],
                        "error": str(e),
                        "success": False,
                    }

        tasks = [generate_one(req) for req in sfx_requests]
        results = await asyncio.gather(*tasks)

        return list(results)


def plan_sfx_placements(
    impact_points: List[float],
    text_cards: List[Dict[str, Any]],
    clip_transitions: List[float],
    trailer_duration: float,
) -> List[Dict[str, Any]]:
    """Determine where to place sound effects.

    Args:
        impact_points: Timestamps of visual impact moments
        text_cards: Text card objects with atSec
        clip_transitions: Timestamps of clip cuts/transitions
        trailer_duration: Total trailer duration

    Returns:
        List of SFX placement objects
    """
    sfx_placements = []
    sfx_index = 0

    # Track used timestamps to avoid SFX collisions
    used_timestamps = set()

    def is_available(timestamp: float, margin: float = 0.5) -> bool:
        """Check if timestamp is available (not too close to existing SFX)."""
        for used in used_timestamps:
            if abs(timestamp - used) < margin:
                return False
        return True

    def add_sfx(at_sec: float, sfx_type: str, intensity: float, duration: Optional[float] = None):
        nonlocal sfx_index
        if is_available(at_sec):
            sfx_placements.append({
                "sfxIndex": sfx_index,
                "atSec": at_sec,
                "type": sfx_type,
                "intensity": intensity,
                "durationSec": duration or ElevenLabsSFXGenerator.SFX_DURATIONS.get(sfx_type, 2.0),
            })
            used_timestamps.add(at_sec)
            sfx_index += 1

    # 1. Impacts on major visual hits (high priority)
    for impact in sorted(impact_points)[:8]:  # Limit to 8 impacts
        if impact > 0.5 and impact < trailer_duration - 0.5:
            add_sfx(impact, "impact", 1.0)

    # 2. Risers before major impacts (build anticipation)
    for impact in sorted(impact_points)[:5]:  # Limit risers
        riser_start = impact - 2.5
        if riser_start > 1.0:  # Need room for riser
            add_sfx(riser_start, "riser", 0.8, duration_sec=2.5)

    # 3. Whooshes on text card appearances
    for card in text_cards:
        at_sec = card.get("atSec", 0)
        if at_sec > 0.5 and at_sec < trailer_duration - 0.5:
            add_sfx(at_sec, "whoosh", 0.6)

    # 4. Hits on some clip transitions (not all - would be overwhelming)
    transition_count = 0
    for transition in sorted(clip_transitions):
        if transition > 5.0 and transition < trailer_duration - 2.0:
            # Only add hit on every 3rd transition for subtlety
            if transition_count % 3 == 1:
                add_sfx(transition, "hit", 0.5)
            transition_count += 1

    # 5. Final sting for title card (last text card)
    if text_cards:
        last_card = max(text_cards, key=lambda c: c.get("atSec", 0))
        last_at_sec = last_card.get("atSec", 0)
        if last_at_sec > trailer_duration * 0.7:  # Only if in final third
            add_sfx(last_at_sec, "sting", 1.0)

    # 6. Opening drone for atmosphere (first 5 seconds)
    if trailer_duration > 10:
        add_sfx(0.5, "drone", 0.4, duration_sec=5.0)

    # Sort by timestamp
    sfx_placements.sort(key=lambda x: x["atSec"])

    return sfx_placements


def get_sfx_generation_requests(placements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert placements to generation requests, deduplicating by type.

    Since the same SFX type will sound similar, we only generate one of each type
    and reuse it at different timestamps.

    Args:
        placements: List of SFX placements

    Returns:
        List of unique SFX generation requests
    """
    # Group by type to deduplicate
    types_needed = {}
    for placement in placements:
        sfx_type = placement["type"]
        duration = placement.get("durationSec", 2.0)

        # Keep the longest duration needed for each type
        if sfx_type not in types_needed or duration > types_needed[sfx_type]:
            types_needed[sfx_type] = duration

    # Create generation requests
    requests = []
    for i, (sfx_type, duration) in enumerate(types_needed.items()):
        requests.append({
            "sfx_index": i,
            "type": sfx_type,
            "duration_sec": duration,
        })

    return requests
