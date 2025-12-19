# Hollywood-Quality Trailer Upgrade Plan

## Executive Summary

Transform the current trailer generation system from a basic clip assembly tool into a Hollywood-caliber trailer production pipeline with:
- **Cinematic Text Cards** - Replace subtitles with anticipatory title cards
- **AI-Generated Music** - ElevenLabs Music for custom trailer scores
- **Sound Design** - Impacts, risers, whooshes synced to visual beats
- **Professional Mixing** - Dialogue ducking, loudness normalization, dynamic range

---

## Current State Assessment

### What Works Well
- Modular pipeline with clear stages
- GPT-4o for intelligent clip selection
- Scene detection via keyframes
- Multi-format output (16:9, 9:16, 1:1)
- Thumbnail generation
- Profile-based configuration

### Critical Gaps
| Gap | Impact | Priority |
|-----|--------|----------|
| No music/score | Trailers feel flat and amateur | P0 |
| No text cards | Missing "anticipatory" trailer language | P0 |
| No sound design (impacts/risers) | No emotional punctuation | P1 |
| No audio mixing | Dialogue competes with music | P1 |
| Source audio passthrough only | No enhancement or normalization | P2 |
| burnCaptions creates subtitles, not cards | Wrong visual language | P0 |

---

## Implementation Phases

## Phase 1: Cinematic Text Cards
**Goal:** Replace burned captions with Hollywood-style title cards

### 1.1 Schema Changes

```typescript
// convex/schema.ts - Add new table

trailer_text_card_plans: defineTable({
  trailerJobId: v.id("trailer_jobs"),
  profileId: v.id("trailer_profiles"),
  cards: v.array(v.object({
    cardIndex: v.number(),
    atSec: v.number(),              // When card appears in trailer timeline
    durationSec: v.number(),        // How long visible (typically 1.5-3s)
    text: v.string(),               // "THIS WINTER", "ONE CHOICE", etc.
    style: v.string(),              // "minimal" | "bold" | "elegant" | "gritty"
    motion: v.string(),             // "fade_up" | "push_in" | "cut" | "typewriter"
    fontSize: v.optional(v.number()), // Override default sizing
    position: v.optional(v.string()), // "center" | "lower_third" | "upper"
  })),
  aiReasoning: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_trailerJob", ["trailerJobId"]),
```

### 1.2 Profile Changes

```typescript
// convex/trailerProfiles.ts - Update profiles

// REMOVE burnCaptions from theatrical/teaser/festival profiles
// KEEP burnCaptions ONLY for social_vertical and social_square (different product)

// Add text card defaults to profiles:
textCardDefaults: {
  fontFamily: "Bebas Neue",       // Bold condensed for impact
  primaryColor: "#FFFFFF",
  shadowColor: "#000000",
  defaultStyle: "bold",
  defaultMotion: "fade_up",
}
```

### 1.3 GPT Prompt Enhancement

```python
# modal/services/trailer_processor.py - Update _generate_timestamp_plan()

"""
Also generate cinematic text cards for this trailer.

TEXT CARD GUIDELINES:
- Use 1-4 word phrases that CREATE ANTICIPATION for the next beat
- Cards should land on impact moments (scene transitions, music hits)
- Common patterns:
  * Opening: "THIS [SEASON]", "FROM [STUDIO/CREATOR]"
  * Build: "ONE [NOUN]", "A [ADJECTIVE] [NOUN]"
  * Stakes: "[EVERYTHING/NOTHING] [AT STAKE]", "WILL [QUESTION]"
  * Button: Title card, release date, "COMING SOON"
- Space cards at least 8-15 seconds apart (don't overwhelm)
- 5-8 cards total for a 2-minute trailer

OUTPUT FORMAT - Add to your JSON:
{
  "clips": [...],
  "textCards": [
    {
      "cardIndex": 0,
      "atSec": 0.0,
      "durationSec": 2.5,
      "text": "THIS WINTER",
      "style": "minimal",
      "motion": "fade_up"
    },
    {
      "cardIndex": 1,
      "atSec": 18.0,
      "durationSec": 2.0,
      "text": "ONE DECISION",
      "style": "bold",
      "motion": "push_in"
    }
  ],
  "reasoning": "..."
}
"""
```

### 1.4 Text Card Rendering

```python
# modal/services/trailer_processor.py - New method

def _render_text_cards_overlay(self, text_cards: List[Dict], video_path: str, output_path: str):
    """Render text cards as overlay on video using FFmpeg drawtext."""

    # Build filter_complex for each card
    filters = []
    for card in text_cards:
        at_sec = card["atSec"]
        duration = card["durationSec"]
        text = card["text"].replace("'", "'\\''")  # Escape quotes
        style = card.get("style", "bold")
        motion = card.get("motion", "fade_up")

        # Font settings per style
        font_configs = {
            "minimal": {"size": 72, "font": "Helvetica Neue", "weight": "Light"},
            "bold": {"size": 96, "font": "Bebas Neue", "weight": "Bold"},
            "elegant": {"size": 80, "font": "Didot", "weight": "Regular"},
            "gritty": {"size": 88, "font": "Impact", "weight": "Bold"},
        }
        cfg = font_configs.get(style, font_configs["bold"])

        # Motion: fade_up uses alpha animation
        if motion == "fade_up":
            alpha_expr = f"if(between(t,{at_sec},{at_sec+0.5}),(t-{at_sec})/0.5,if(between(t,{at_sec+duration-0.5},{at_sec+duration}),({at_sec+duration}-t)/0.5,if(between(t,{at_sec},{at_sec+duration}),1,0)))"
        else:
            alpha_expr = f"if(between(t,{at_sec},{at_sec+duration}),1,0)"

        filter_str = (
            f"drawtext=text='{text}':"
            f"fontfile=/usr/share/fonts/truetype/{cfg['font']}.ttf:"
            f"fontsize={cfg['size']}:"
            f"fontcolor=white:"
            f"shadowcolor=black@0.8:shadowx=2:shadowy=2:"
            f"x=(w-text_w)/2:y=(h-text_h)/2:"
            f"alpha='{alpha_expr}'"
        )
        filters.append(filter_str)

    filter_complex = ",".join(filters) if filters else "null"

    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vf", filter_complex,
        "-c:v", "libx264", "-preset", "fast",
        "-c:a", "copy",
        output_path
    ]
    subprocess.run(cmd, check=True)
```

### 1.5 Pipeline Integration

```python
# Update _render_trailer() to include text cards

async def _render_trailer(self, plan: Dict, profile: Dict) -> List[Dict]:
    """Render trailer with text card overlays."""

    # Step 1: Render base trailer (existing logic)
    base_clips = await self._render_base_clips(plan, profile)

    # Step 2: Apply text card overlays if present
    text_cards = plan.get("textCards", [])
    if text_cards:
        for clip in base_clips:
            base_path = clip["path"]
            overlay_path = base_path.replace(".mp4", "_titled.mp4")
            self._render_text_cards_overlay(text_cards, base_path, overlay_path)
            clip["path"] = overlay_path  # Use titled version

    return base_clips
```

---

## Phase 2: Audio Foundation
**Goal:** Add AI-generated music and basic audio mixing

### 2.1 Schema Changes

```typescript
// convex/schema.ts - Add audio plan table

trailer_audio_plans: defineTable({
  trailerJobId: v.id("trailer_jobs"),
  profileId: v.id("trailer_profiles"),

  // Analysis-derived structure
  trailerDurationSec: v.number(),
  risePoints: v.array(v.number()),      // Seconds where intensity should build
  impactPoints: v.array(v.number()),    // Peak moments for hits/stings
  dialogueWindows: v.array(v.object({   // Where to duck music for clarity
    startSec: v.number(),
    endSec: v.number(),
    importance: v.number(),              // 0-1, how much to duck
  })),

  // Music generation
  musicPrompt: v.string(),              // Generated prompt for ElevenLabs
  musicStyle: v.string(),               // "epic_orchestral" | "tension" | "emotional"
  musicBpm: v.optional(v.number()),     // Target tempo

  // Generated assets
  musicR2Key: v.optional(v.string()),   // Path to generated music
  musicDurationSec: v.optional(v.number()),

  // Mixing parameters
  targetLufs: v.number(),               // -14 for web, -24 for theatrical
  dialogueLevelDb: v.number(),          // Typically -12 to -6 dB
  musicLevelDb: v.number(),             // Typically -18 to -12 dB

  createdAt: v.number(),
}).index("by_trailerJob", ["trailerJobId"]),
```

### 2.2 ElevenLabs Music Integration

```python
# modal/services/music_generator.py - New file

import httpx
import os
from typing import Optional

class ElevenLabsMusicGenerator:
    """Generate trailer music using ElevenLabs Music API."""

    def __init__(self):
        self.api_key = os.environ.get("ELEVENLABS_API_KEY")
        self.base_url = "https://api.elevenlabs.io/v1"

    async def generate_trailer_music(
        self,
        prompt: str,
        duration_sec: float,
        style: str = "cinematic",
    ) -> bytes:
        """Generate music from text prompt.

        Args:
            prompt: Descriptive prompt like "Epic orchestral build,
                   tension rising, impact at 45 seconds, resolve to sting"
            duration_sec: Target duration in seconds
            style: Music style hint

        Returns:
            Audio bytes (MP3/WAV)
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/music/generate",
                headers={
                    "xi-api-key": self.api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "prompt": prompt,
                    "duration_seconds": min(duration_sec, 300),  # Max 5 min
                    "style": style,
                },
                timeout=120.0,  # Music generation can take time
            )
            response.raise_for_status()
            return response.content

    def build_trailer_prompt(
        self,
        duration_sec: float,
        rise_points: list[float],
        impact_points: list[float],
        mood: str = "epic",
    ) -> str:
        """Build a structured music prompt from analysis data."""

        # Convert timestamps to prompt language
        sections = []

        # Opening
        sections.append(f"Mysterious, ambient opening")

        # Map rise points to build sections
        for i, rise in enumerate(rise_points[:3]):
            sections.append(f"tension build starting at {rise:.0f}s")

        # Map impact points to hits
        for impact in impact_points[:5]:
            sections.append(f"major orchestral hit at {impact:.0f}s")

        # Ending
        sections.append(f"resolve to powerful title sting at {duration_sec-5:.0f}s")

        mood_descriptors = {
            "epic": "Epic orchestral trailer music with brass, percussion, and strings",
            "tension": "Dark, suspenseful trailer music with building dread",
            "emotional": "Emotional, piano-driven trailer music with swelling strings",
            "action": "High-energy action trailer music with driving drums",
        }

        base = mood_descriptors.get(mood, mood_descriptors["epic"])
        structure = ", ".join(sections)

        return f"{base}. {duration_sec:.0f} seconds total. Structure: {structure}"
```

### 2.3 Audio Mixing Pipeline

```python
# modal/services/audio_mixer.py - New file

import subprocess
import os
from typing import Optional

class TrailerAudioMixer:
    """Mix dialogue, music, and SFX for trailer output."""

    def mix_trailer_audio(
        self,
        video_with_dialogue: str,
        music_path: str,
        output_path: str,
        dialogue_level_db: float = -12,
        music_level_db: float = -18,
        target_lufs: float = -14,
        dialogue_windows: list[dict] = None,
    ):
        """Mix video audio with music bed, applying ducking and normalization.

        Args:
            video_with_dialogue: Path to video with original audio
            music_path: Path to music bed audio file
            output_path: Output video path
            dialogue_level_db: Target dialogue level
            music_level_db: Base music level (will be ducked during dialogue)
            target_lufs: Final loudness target
            dialogue_windows: List of {startSec, endSec, importance} for ducking
        """

        # Build ducking filter for music
        if dialogue_windows:
            # Create volume automation for music ducking
            duck_points = []
            for window in dialogue_windows:
                start = window["startSec"]
                end = window["endSec"]
                importance = window.get("importance", 0.8)
                duck_db = -6 * importance  # Duck by up to -6dB

                # Fade in to duck, hold, fade out
                duck_points.append(f"volume=enable='between(t,{start-0.3},{end+0.3})':volume='{duck_db}dB'")

            music_filter = ",".join(duck_points) if duck_points else "anull"
        else:
            music_filter = "anull"

        # FFmpeg filter_complex for mixing
        filter_complex = f"""
        [0:a]volume={dialogue_level_db}dB[dialogue];
        [1:a]{music_filter},volume={music_level_db}dB[music];
        [dialogue][music]amix=inputs=2:duration=first:dropout_transition=2[mixed];
        [mixed]loudnorm=I={target_lufs}:TP=-1:LRA=11[final]
        """

        cmd = [
            "ffmpeg", "-y",
            "-i", video_with_dialogue,
            "-i", music_path,
            "-filter_complex", filter_complex.strip(),
            "-map", "0:v",           # Video from first input
            "-map", "[final]",       # Mixed audio
            "-c:v", "copy",          # Don't re-encode video
            "-c:a", "aac", "-b:a", "192k",
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"Audio mix failed: {result.stderr}")
```

### 2.4 Pipeline Status Updates

```python
# convex/trailerJobs.ts - Add new status constants

export const TRAILER_STATUS = {
  // ... existing statuses ...
  AUDIO_PLANNING: "AUDIO_PLANNING",
  MUSIC_GENERATING: "MUSIC_GENERATING",
  SFX_GENERATING: "SFX_GENERATING",
  MIXING: "MIXING",
} as const;
```

### 2.5 Updated Pipeline Flow

```python
# modal/services/trailer_processor.py - Updated process() method

async def process(self):
    """Full trailer processing pipeline."""

    # Phase 1: Analysis (existing)
    await self._prepare_video()           # Proxy generation
    transcript = await self._transcribe() # Whisper
    scenes = await self._detect_scenes()  # Keyframes

    # Phase 2: Planning
    profile = self.job_data.get("profile", {})
    content_plan = await self._generate_timestamp_plan(transcript, scenes, profile)
    audio_plan = await self._generate_audio_plan(content_plan, scenes, profile)

    # Phase 3: Asset Generation
    await self._generate_music(audio_plan)
    # await self._generate_sfx(audio_plan)  # Phase 3

    # Phase 4: Rendering
    clips = await self._render_trailer(content_plan, profile)

    # Phase 5: Mixing
    clips = await self._mix_audio(clips, audio_plan)

    # Phase 6: Upload
    await self._upload_clips(clips)
    await self.convex.complete_job(self.job_id)
```

---

## Phase 3: Sound Design
**Goal:** Add impacts, risers, whooshes, and advanced ducking

### 3.1 SFX Generation

```python
# modal/services/sfx_generator.py - New file

class ElevenLabsSFXGenerator:
    """Generate trailer sound effects using ElevenLabs SFX API."""

    SFX_PROMPTS = {
        "impact": "Deep cinematic impact hit, bass boom, trailer percussion",
        "riser": "Building tension riser, cinematic whoosh ascending",
        "whoosh": "Fast transition whoosh, air movement, dramatic",
        "sting": "Dramatic orchestral sting, brass stab, finale hit",
        "drone": "Dark atmospheric drone, ominous undertone, tension",
    }

    async def generate_sfx(self, sfx_type: str, duration_sec: float = 3.0) -> bytes:
        """Generate a sound effect."""
        prompt = self.SFX_PROMPTS.get(sfx_type, sfx_type)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/sound-effects/generate",
                headers={"xi-api-key": self.api_key},
                json={
                    "prompt": prompt,
                    "duration_seconds": duration_sec,
                },
                timeout=60.0,
            )
            response.raise_for_status()
            return response.content
```

### 3.2 SFX Placement Logic

```python
# In audio plan generation

def _plan_sfx_placements(
    self,
    impact_points: list[float],
    text_cards: list[dict],
    clip_transitions: list[float],
) -> list[dict]:
    """Determine where to place sound effects."""

    sfx_placements = []

    # Impacts on major visual hits
    for impact in impact_points:
        sfx_placements.append({
            "atSec": impact,
            "type": "impact",
            "intensity": 1.0,
        })

    # Risers before impacts (build anticipation)
    for impact in impact_points:
        if impact > 3:  # Need room for riser
            sfx_placements.append({
                "atSec": impact - 2.5,
                "type": "riser",
                "intensity": 0.8,
            })

    # Whooshes on text card appearances
    for card in text_cards:
        sfx_placements.append({
            "atSec": card["atSec"],
            "type": "whoosh",
            "intensity": 0.6,
        })

    # Final sting for title card
    if text_cards:
        last_card = max(text_cards, key=lambda c: c["atSec"])
        sfx_placements.append({
            "atSec": last_card["atSec"],
            "type": "sting",
            "intensity": 1.0,
        })

    return sfx_placements
```

### 3.3 Multi-Track Audio Mix

```python
# Enhanced mixing with SFX layer

def mix_full_trailer_audio(
    self,
    video_path: str,
    music_path: str,
    sfx_files: list[dict],  # [{path, atSec, type, intensity}]
    output_path: str,
    dialogue_windows: list[dict],
    target_lufs: float = -14,
):
    """Full trailer mix with dialogue, music, and SFX."""

    # Input mapping
    inputs = ["-i", video_path, "-i", music_path]
    for sfx in sfx_files:
        inputs.extend(["-i", sfx["path"]])

    # Build filter graph
    # [0:a] = dialogue from video
    # [1:a] = music bed
    # [2:a], [3:a], ... = SFX

    filter_parts = []

    # Dialogue processing
    filter_parts.append(f"[0:a]volume=-12dB[dialogue]")

    # Music with ducking
    duck_filter = self._build_duck_filter(dialogue_windows)
    filter_parts.append(f"[1:a]{duck_filter},volume=-15dB[music]")

    # SFX placement with adelay
    sfx_labels = []
    for i, sfx in enumerate(sfx_files):
        delay_ms = int(sfx["atSec"] * 1000)
        vol_db = -6 + (6 * sfx["intensity"])  # -6 to 0 dB based on intensity
        label = f"sfx{i}"
        filter_parts.append(
            f"[{i+2}:a]adelay={delay_ms}|{delay_ms},volume={vol_db}dB[{label}]"
        )
        sfx_labels.append(f"[{label}]")

    # Mix all tracks
    all_inputs = "[dialogue][music]" + "".join(sfx_labels)
    num_inputs = 2 + len(sfx_files)
    filter_parts.append(
        f"{all_inputs}amix=inputs={num_inputs}:duration=first[premix]"
    )

    # Final loudness normalization
    filter_parts.append(
        f"[premix]loudnorm=I={target_lufs}:TP=-1:LRA=11[final]"
    )

    filter_complex = ";".join(filter_parts)

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "0:v",
        "-map", "[final]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "256k",
        output_path
    ]

    subprocess.run(cmd, check=True)
```

---

## Phase 4: Polish & Advanced Features
**Goal:** Professional-grade finishing touches

### 4.1 Advanced Text Card Motion

```python
# Pre-rendered PNG sequences for complex motion

def _render_text_card_sequence(
    self,
    card: dict,
    width: int,
    height: int,
    fps: int = 30,
) -> str:
    """Render text card as PNG sequence for complex motion effects."""

    motion = card.get("motion", "fade_up")
    duration = card["durationSec"]
    num_frames = int(duration * fps)

    # Use Pillow for frame generation
    from PIL import Image, ImageDraw, ImageFont

    frames_dir = f"/tmp/card_{card['cardIndex']}"
    os.makedirs(frames_dir, exist_ok=True)

    for frame in range(num_frames):
        t = frame / fps  # Time in seconds
        progress = frame / num_frames

        img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Motion calculations
        if motion == "push_in":
            scale = 0.95 + (0.05 * progress)  # 95% to 100%
            alpha = int(255 * min(1, t / 0.5))  # Fade in over 0.5s
        elif motion == "fade_up":
            y_offset = int(20 * (1 - progress))  # Rise 20px
            alpha = int(255 * min(1, t / 0.5))
        # ... more motion types

        # Draw text with calculated transforms
        font = ImageFont.truetype("/usr/share/fonts/truetype/BebasNeue.ttf", 96)
        draw.text((width//2, height//2), card["text"], font=font, anchor="mm", fill=(255,255,255,alpha))

        img.save(f"{frames_dir}/frame_{frame:05d}.png")

    return frames_dir
```

### 4.2 Film Grain & Color Grade

```python
# FFmpeg filter for cinematic look

def _apply_cinematic_grade(self, input_path: str, output_path: str):
    """Apply film grain, letterbox, and color grade."""

    filter_complex = """
    [0:v]
    # Slight desaturation for cinematic look
    eq=saturation=0.9:contrast=1.05,
    # Film grain overlay
    noise=alls=3:allf=t,
    # 2.39:1 letterbox
    crop=in_w:in_w/2.39,pad=in_w:in_w/1.778:(ow-iw)/2:(oh-ih)/2:black,
    # Subtle vignette
    vignette=PI/4
    [graded]
    """

    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-filter_complex", filter_complex.strip().replace("\n", ""),
        "-map", "[graded]",
        "-map", "0:a",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18",
        "-c:a", "copy",
        output_path
    ]
    subprocess.run(cmd, check=True)
```

### 4.3 Variant-Specific Processing

```python
# Different treatments per output format

VARIANT_TREATMENTS = {
    "theatrical": {
        "letterbox": True,
        "grain": True,
        "lufs": -24,  # Theatrical loudness
        "dynamic_range": "wide",
    },
    "social_vertical": {
        "letterbox": False,
        "grain": False,
        "lufs": -14,  # Mobile loudness
        "dynamic_range": "compressed",
        "captions": True,  # Burn captions for social
    },
    "broadcast": {
        "letterbox": False,
        "grain": False,
        "lufs": -24,  # Broadcast standard
        "max_bitrate": 25000,
    },
}
```

---

## Environment & Dependencies

### Required API Keys
```bash
# .env additions
ELEVENLABS_API_KEY=sk-...          # For music & SFX generation
OPENAI_API_KEY=sk-...              # Already exists for GPT-4o
```

### Modal Container Updates
```python
# modal/app.py - Update image

image = modal.Image.debian_slim().apt_install(
    "ffmpeg",
    "fonts-liberation",           # Fallback fonts
    "fonts-dejavu-core",
).pip_install(
    "openai",
    "httpx",
    "boto3",
    "Pillow",                     # For text card rendering
).run_commands(
    # Install premium fonts for text cards
    "wget -O /tmp/bebas.zip https://fonts.google.com/download?family=Bebas%20Neue",
    "unzip /tmp/bebas.zip -d /usr/share/fonts/truetype/",
    "fc-cache -fv",
)
```

---

## Implementation Timeline

### Week 1-2: Phase 1 (Text Cards)
- [ ] Schema: trailer_text_card_plans table
- [ ] GPT prompt update for text card generation
- [ ] FFmpeg drawtext implementation
- [ ] Font installation in Modal container
- [ ] Remove burnCaptions from theatrical profiles
- [ ] Integration testing

### Week 3-4: Phase 2 (Audio Foundation)
- [ ] Schema: trailer_audio_plans table
- [ ] ElevenLabs Music API integration
- [ ] Music prompt generation from analysis
- [ ] Basic audio mixing (dialogue + music)
- [ ] Loudness normalization
- [ ] Pipeline status updates

### Week 5-6: Phase 3 (Sound Design)
- [ ] ElevenLabs SFX API integration
- [ ] SFX placement algorithm
- [ ] Multi-track mixing
- [ ] Dialogue ducking automation
- [ ] Beat-synced text cards

### Week 7-8: Phase 4 (Polish)
- [ ] Advanced text card animations
- [ ] Film grain & color grade options
- [ ] Variant-specific treatments
- [ ] Performance optimization
- [ ] Quality assurance testing

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Viewer engagement (watch %) | ~40% | 75%+ |
| "Professional quality" rating | 2/5 | 4.5/5 |
| Music presence | 0% | 100% |
| Text card usage | 0% | 100% (theatrical) |
| Loudness compliance | None | -14 LUFS web, -24 LUFS theatrical |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| ElevenLabs API costs | Cache generated music/SFX, offer regeneration as premium |
| Music generation latency | Generate during analysis phase, parallelize with rendering |
| Font licensing | Use Google Fonts (open license) |
| FFmpeg complexity | Extensive logging, fallback to simpler filters on failure |
| Audio sync issues | Use PTS timestamps, validate duration matching |

---

---

## Phase 5: Advanced Editing Intelligence
**Goal:** AI-powered scene analysis and music-synchronized editing

### 5.1 Scene Importance Scoring

Multi-dimensional scoring system that rates each scene on a 0-1 scale across three categories:

```python
# modal/services/editing_intelligence.py

@dataclass
class SceneImportanceScore:
    """Multi-dimensional scene importance scoring."""

    emotional_score: float    # 0-1: Emotional intensity (faces, expressions, dialogue tone)
    visual_score: float       # 0-1: Visual interest (motion, composition, color contrast)
    narrative_score: float    # 0-1: Story value (dialogue content, character moments)

    @property
    def combined_score(self) -> float:
        """Weighted combination of all scores."""
        return (
            self.emotional_score * 0.35 +
            self.visual_score * 0.30 +
            self.narrative_score * 0.35
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


class SceneImportanceScorer:
    """Score scenes for trailer worthiness using multi-modal analysis."""

    def __init__(self):
        self.emotion_keywords = {
            "high": ["love", "death", "fear", "joy", "rage", "betrayal", "truth", "war"],
            "medium": ["hope", "loss", "fight", "family", "power", "secret"],
            "low": ["okay", "fine", "perhaps", "maybe", "could"]
        }

    async def score_scene(
        self,
        scene: Dict[str, Any],
        transcript_segment: Optional[Dict[str, Any]] = None,
        audio_features: Optional[Dict[str, Any]] = None,
    ) -> SceneImportanceScore:
        """Score a single scene across all dimensions."""

        emotional = await self._score_emotional(scene, transcript_segment, audio_features)
        visual = await self._score_visual(scene)
        narrative = await self._score_narrative(transcript_segment)

        return SceneImportanceScore(
            emotional_score=emotional,
            visual_score=visual,
            narrative_score=narrative,
        )

    async def _score_emotional(
        self,
        scene: Dict[str, Any],
        transcript: Optional[Dict[str, Any]],
        audio: Optional[Dict[str, Any]],
    ) -> float:
        """Score emotional intensity."""
        score = 0.0

        # Face presence boosts emotional score
        if scene.get("hasFaces"):
            score += 0.3

        # Audio intensity (loud = emotional)
        if scene.get("avgAudioIntensity", 0) > 0.7:
            score += 0.3
        elif scene.get("avgAudioIntensity", 0) > 0.4:
            score += 0.15

        # Transcript emotional keywords
        if transcript:
            text = transcript.get("text", "").lower()
            if any(kw in text for kw in self.emotion_keywords["high"]):
                score += 0.3
            elif any(kw in text for kw in self.emotion_keywords["medium"]):
                score += 0.15

        # Audio energy features from librosa
        if audio and audio.get("rms_energy", 0) > 0.5:
            score += 0.1

        return min(1.0, score)

    async def _score_visual(self, scene: Dict[str, Any]) -> float:
        """Score visual interest."""
        score = 0.0

        # Motion intensity (action = interesting)
        motion = scene.get("avgMotionIntensity", 0)
        score += motion * 0.4

        # Scene duration sweet spot (2-8 seconds is ideal)
        duration = scene.get("duration", 0)
        if 2 <= duration <= 8:
            score += 0.3
        elif duration < 2:
            score += 0.1  # Too short might be impactful cut
        else:
            score += 0.15  # Long scenes need more justification

        # Color diversity (more colors = more interesting)
        colors = scene.get("dominantColors", [])
        if len(colors) >= 3:
            score += 0.2
        elif len(colors) >= 2:
            score += 0.1

        return min(1.0, score)

    async def _score_narrative(
        self,
        transcript: Optional[Dict[str, Any]],
    ) -> float:
        """Score narrative/story value."""
        if not transcript:
            return 0.3  # Default for scenes without dialogue

        text = transcript.get("text", "")
        words = text.split()
        score = 0.0

        # Length scoring (trailer lines are typically 3-15 words)
        if 3 <= len(words) <= 15:
            score += 0.3
        elif len(words) > 0:
            score += 0.1

        # Sentence structure (questions, imperatives are trailer-worthy)
        if "?" in text:
            score += 0.2  # Questions create intrigue
        if text.strip().endswith("!"):
            score += 0.15  # Exclamations show intensity

        # Character dialogue markers
        if any(word in text.lower() for word in ["i", "you", "we", "they"]):
            score += 0.2  # Personal pronouns = character moments

        # Trailer-worthy phrases
        trailer_phrases = [
            "what if", "you must", "no choice", "only one",
            "everything", "nothing", "forever", "never",
            "the truth", "the world", "save", "destroy"
        ]
        if any(phrase in text.lower() for phrase in trailer_phrases):
            score += 0.2

        return min(1.0, score)
```

### 5.2 Dialogue Selection AI

GPT-4o-powered selection of trailer-worthy lines:

```python
# modal/services/editing_intelligence.py (continued)

class DialogueSelectionAI:
    """Select the best dialogue lines for trailer using GPT-4o."""

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
    """

    async def select_trailer_lines(
        self,
        transcript_segments: List[Dict[str, Any]],
        max_lines: int = 8,
        trailer_duration_sec: float = 120,
    ) -> List[Dict[str, Any]]:
        """Select the best lines for a trailer.

        Returns:
            List of selected segments with added 'trailer_score' and 'trailer_purpose' fields
        """
        import openai
        client = openai.AsyncOpenAI()

        # Prepare segments for analysis
        segments_text = []
        for i, seg in enumerate(transcript_segments):
            text = seg.get("text", "").strip()
            if len(text) > 5:  # Skip very short segments
                segments_text.append({
                    "index": i,
                    "text": text,
                    "start": seg.get("start", 0),
                    "end": seg.get("end", 0),
                    "duration": seg.get("end", 0) - seg.get("start", 0),
                })

        prompt = f"""You are a Hollywood trailer editor selecting dialogue.

{self.SELECTION_CRITERIA}

Trailer Duration: {trailer_duration_sec} seconds
Maximum Lines to Select: {max_lines}

AVAILABLE DIALOGUE:
{json.dumps(segments_text, indent=2)}

Select the {max_lines} best lines for a trailer. For each, provide:
- index: The segment index
- trailer_score: 0-1 score for trailer worthiness
- trailer_purpose: "hook" | "stakes" | "conflict" | "question" | "button"
- edit_suggestion: Optional edit to make it punchier

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
  "reasoning": "Brief explanation"
}}"""

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
            if idx is not None and idx < len(transcript_segments):
                segment = transcript_segments[idx].copy()
                segment["trailer_score"] = sel.get("trailer_score", 0.5)
                segment["trailer_purpose"] = sel.get("trailer_purpose", "general")
                segment["edit_suggestion"] = sel.get("edit_suggestion")
                selected.append(segment)

        return selected

    async def rank_all_lines(
        self,
        transcript_segments: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Score ALL lines without GPT (faster, local heuristics).

        Use this for pre-filtering before GPT selection.
        """
        scored = []

        for seg in transcript_segments:
            text = seg.get("text", "").strip()
            score = self._quick_score(text)

            scored.append({
                **seg,
                "quick_score": score,
            })

        # Sort by score descending
        scored.sort(key=lambda x: x["quick_score"], reverse=True)
        return scored

    def _quick_score(self, text: str) -> float:
        """Quick heuristic scoring without AI."""
        score = 0.5  # Base score
        words = text.split()

        # Length scoring
        if 3 <= len(words) <= 12:
            score += 0.2
        elif len(words) > 20:
            score -= 0.2

        # Punctuation
        if "?" in text:
            score += 0.15
        if "!" in text:
            score += 0.1

        # Strong words
        strong_words = ["must", "will", "never", "always", "everything", "only", "truth"]
        if any(w in text.lower() for w in strong_words):
            score += 0.15

        # Weak words
        weak_words = ["maybe", "perhaps", "sort of", "kind of", "i think", "i guess"]
        if any(w in text.lower() for w in weak_words):
            score -= 0.15

        return max(0, min(1, score))
```

### 5.3 Beat-Sync Editing (Librosa Integration)

Music beat detection for synchronized cuts:

```python
# modal/services/editing_intelligence.py (continued)

import numpy as np

class BeatSyncEditor:
    """Align video cuts to music beats using librosa."""

    def __init__(self):
        self._librosa = None

    def _get_librosa(self):
        """Lazy import librosa."""
        if self._librosa is None:
            import librosa
            self._librosa = librosa
        return self._librosa

    async def analyze_music_beats(
        self,
        music_path: str,
        target_fps: float = 30.0,
    ) -> Dict[str, Any]:
        """Analyze music file for beat positions and energy.

        Args:
            music_path: Path to music audio file
            target_fps: Video frame rate for frame-accurate beat alignment

        Returns:
            Dict with beat_times, downbeat_times, tempo, energy_curve
        """
        librosa = self._get_librosa()

        # Load audio
        y, sr = librosa.load(music_path, sr=22050)

        # Beat detection
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)

        # Downbeat detection (first beat of each measure)
        # Assuming 4/4 time, every 4th beat is a downbeat
        downbeat_times = beat_times[::4]

        # Energy envelope for intensity matching
        rms = librosa.feature.rms(y=y)[0]
        rms_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr)

        # Peak detection for impact moments
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        peaks = librosa.util.peak_pick(
            onset_env,
            pre_max=3, post_max=3,
            pre_avg=3, post_avg=5,
            delta=0.5, wait=10
        )
        peak_times = librosa.frames_to_time(peaks, sr=sr)

        # Snap to frame boundaries
        frame_duration = 1.0 / target_fps
        beat_times = self._snap_to_frames(beat_times, frame_duration)
        downbeat_times = self._snap_to_frames(downbeat_times, frame_duration)
        peak_times = self._snap_to_frames(peak_times, frame_duration)

        return {
            "tempo": float(tempo),
            "beat_times": beat_times.tolist(),
            "downbeat_times": downbeat_times.tolist(),
            "peak_times": peak_times.tolist(),
            "duration": float(len(y) / sr),
            "energy_curve": {
                "times": rms_times.tolist(),
                "values": rms.tolist(),
            },
        }

    def _snap_to_frames(
        self,
        times: np.ndarray,
        frame_duration: float,
    ) -> np.ndarray:
        """Snap times to nearest frame boundary."""
        return np.round(times / frame_duration) * frame_duration

    async def align_cuts_to_beats(
        self,
        clips: List[Dict[str, Any]],
        beat_analysis: Dict[str, Any],
        alignment_mode: str = "downbeat",
    ) -> List[Dict[str, Any]]:
        """Adjust clip cut points to align with music beats.

        Args:
            clips: List of clip objects with targetStart/targetEnd
            beat_analysis: Result from analyze_music_beats
            alignment_mode: "beat" (every beat), "downbeat" (every 4th), "peak" (impacts only)

        Returns:
            Clips with adjusted targetStart/targetEnd for beat alignment
        """
        if alignment_mode == "downbeat":
            reference_times = beat_analysis["downbeat_times"]
        elif alignment_mode == "peak":
            reference_times = beat_analysis["peak_times"]
        else:
            reference_times = beat_analysis["beat_times"]

        if not reference_times:
            return clips  # No beats to align to

        aligned_clips = []
        cumulative_adjustment = 0.0

        for i, clip in enumerate(clips):
            clip_copy = clip.copy()
            target_start = clip.get("targetStart", 0) + cumulative_adjustment
            target_end = clip.get("targetEnd", 0) + cumulative_adjustment

            # Find nearest beat to the current cut point
            nearest_beat = self._find_nearest(target_end, reference_times)

            # Only adjust if within tolerance (don't stretch clips too much)
            adjustment = nearest_beat - target_end
            max_adjustment = 0.5  # Max 0.5s adjustment

            if abs(adjustment) <= max_adjustment:
                # Adjust this clip's end and next clip's start
                clip_copy["targetEnd"] = nearest_beat
                clip_copy["beat_aligned"] = True
                clip_copy["alignment_adjustment"] = adjustment
                cumulative_adjustment += adjustment
            else:
                clip_copy["targetEnd"] = target_end
                clip_copy["beat_aligned"] = False
                clip_copy["alignment_adjustment"] = 0

            clip_copy["targetStart"] = target_start
            aligned_clips.append(clip_copy)

        return aligned_clips

    def _find_nearest(self, time: float, reference_times: List[float]) -> float:
        """Find nearest reference time."""
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

        Args:
            scene_scores: Scenes with importance scores
            beat_analysis: Music beat analysis
            target_duration: Target trailer duration

        Returns:
            List of suggested cuts with beat-aligned timestamps
        """
        downbeats = beat_analysis["downbeat_times"]
        peaks = beat_analysis["peak_times"]
        tempo = beat_analysis["tempo"]

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
            key=lambda s: s.get("combined_score", 0),
            reverse=True
        )

        suggestions = []
        used_time = 0.0

        for scene in sorted_scenes[:target_cuts]:
            if used_time >= target_duration:
                break

            scene_duration = scene.get("duration", 5)
            scene_start = scene.get("startTime", 0)

            # Find best beat alignment for this scene
            ideal_end = used_time + min(scene_duration, 8)  # Max 8s per clip
            aligned_end = self._find_nearest(ideal_end, downbeats)

            suggestions.append({
                "sceneIndex": scene.get("sceneIndex"),
                "sourceStart": scene_start,
                "sourceEnd": scene_start + (aligned_end - used_time),
                "targetStart": used_time,
                "targetEnd": aligned_end,
                "beat_aligned": True,
                "importance_score": scene.get("combined_score", 0),
            })

            used_time = aligned_end

        return suggestions
```

### 5.4 Schema Changes

```typescript
// convex/schema.ts - Add to trailer_scene_maps

// Enhanced scene scoring
scenes: v.array(
  v.object({
    // ... existing fields ...

    // Phase 5: Advanced importance scoring (0-1 scales)
    importanceScores: v.optional(v.object({
      emotional: v.number(),      // Emotional intensity
      visual: v.number(),         // Visual interest
      narrative: v.number(),      // Story/dialogue value
      combined: v.number(),       // Weighted combination
      priority: v.string(),       // "must_include" | "high_priority" | "consider" | "skip"
    })),
  })
),

// Add new table for dialogue analysis
trailer_dialogue_analysis: defineTable({
  trailerJobId: v.id("trailer_jobs"),

  // All scored dialogue lines
  scoredLines: v.array(v.object({
    segmentIndex: v.number(),
    text: v.string(),
    startSec: v.number(),
    endSec: v.number(),

    // Scoring
    trailerScore: v.number(),        // 0-1 AI score
    quickScore: v.number(),          // 0-1 heuristic score
    trailerPurpose: v.optional(v.string()),  // hook, stakes, conflict, question, button
    editSuggestion: v.optional(v.string()),
  })),

  // Top selected lines for trailer
  selectedLineIndices: v.array(v.number()),

  aiReasoning: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_trailerJob", ["trailerJobId"]),

// Add beat sync data to audio plans
trailer_audio_plans: defineTable({
  // ... existing fields ...

  // Phase 5: Beat sync data
  beatAnalysis: v.optional(v.object({
    tempo: v.number(),                    // BPM
    beatTimes: v.array(v.number()),       // All beat timestamps
    downbeatTimes: v.array(v.number()),   // Measure-start beats
    peakTimes: v.array(v.number()),       // Impact/peak moments
    energyCurve: v.optional(v.object({
      times: v.array(v.number()),
      values: v.array(v.number()),
    })),
  })),

  // Beat-aligned cut adjustments
  cutAlignments: v.optional(v.array(v.object({
    clipIndex: v.number(),
    originalEnd: v.number(),
    alignedEnd: v.number(),
    adjustment: v.number(),
  }))),
}),
```

### 5.5 Pipeline Integration

```python
# modal/services/trailer_processor.py - Updated process() method

async def process(self):
    """Full trailer processing pipeline with Phase 5 intelligence."""

    # ... existing steps 1-4 ...

    # Phase 5: Advanced scene scoring
    print(f"[{self.job_id}] Scoring scenes with AI...")
    await self.convex.update_status(
        self.job_id, "SCENE_SCORING", progress=45, current_step="Analyzing scene importance..."
    )
    scored_scenes = await self._score_scenes_advanced(scenes, transcript)

    # Phase 5: Dialogue selection
    print(f"[{self.job_id}] Selecting trailer-worthy dialogue...")
    await self.convex.update_status(
        self.job_id, "DIALOGUE_SELECTING", progress=50, current_step="Selecting dialogue..."
    )
    selected_dialogue = await self._select_trailer_dialogue(transcript)

    # ... existing step 6 (timestamp plan) - now uses scored_scenes and selected_dialogue ...

    # Phase 5: Beat sync (after music generation)
    if audio_plan and self.music_path:
        print(f"[{self.job_id}] Analyzing music for beat sync...")
        beat_analysis = await self._analyze_music_beats(self.music_path)

        # Align cuts to beats
        aligned_clips = await self._align_cuts_to_beats(plan["clips"], beat_analysis)
        plan["clips"] = aligned_clips
```

### 5.6 Modal Container Updates

```python
# modal/app.py - Add librosa dependency

image = modal.Image.debian_slim().apt_install(
    "ffmpeg",
    "fonts-liberation",
    "fonts-dejavu-core",
    "libsndfile1",        # Required for librosa
).pip_install(
    "openai",
    "httpx",
    "boto3",
    "Pillow",
    "librosa>=0.10.0",    # Beat detection
    "numpy>=1.24.0",
    "soundfile",          # Audio I/O for librosa
)
```

---

## Phase 6: Transitions & Speed Effects ✅ IMPLEMENTED
**Goal:** Professional clip transitions, speed ramping, and flash frame effects

### 6.1 New Modules Created

Three new service modules in `modal/services/`:

#### `transitions.py` - TransitionRenderer Class

```python
# Available transition types (using FFmpeg xfade filter)
TRANSITION_TYPES = {
    "crossfade": "xfade=transition=fade:duration={duration}:offset={offset}",
    "dip_to_black": "xfade=transition=fadeblack:duration={duration}:offset={offset}",
    "dip_to_white": "xfade=transition=fadewhite:duration={duration}:offset={offset}",
    "whip_pan": "xfade=transition=slideleft:duration={duration}:offset={offset}",
    "zoom_transition": "xfade=transition=zoomin:duration={duration}:offset={offset}",
    "wipe_right": "xfade=transition=wiperight:duration={duration}:offset={offset}",
    "hard_cut": "",  # No filter (instant cut)
}

# Key methods:
- render_transition(clip1, clip2, output, transition_type, duration)
- render_multi_clip_sequence(clips, transitions, output)
- select_transition_for_scene(importance, is_beat_aligned, emotion)
- create_transition_plan(scenes, beat_times) -> List[transition_config]
```

#### `speed_effects.py` - SpeedRamper Class

```python
# Easing types for speed transitions
class EasingType(Enum):
    LINEAR = "linear"
    EASE_IN = "ease_in"
    EASE_OUT = "ease_out"
    EASE_IN_OUT = "ease_in_out"
    EXPONENTIAL_IN = "exponential_in"
    EXPONENTIAL_OUT = "exponential_out"

# Key methods:
- apply_constant_speed(input, output, speed_factor)
- apply_speed_ramp(input, output, SpeedRamp config)
- create_slow_motion_moment(input, output, SlowMotionMoment config)
- identify_slow_motion_candidates(scenes, beat_times) -> List[SlowMotionMoment]
- create_speed_effect_plan(scenes, beat_times) -> List[effect_config]
```

#### `flash_frames.py` - FlashFrameRenderer Class

```python
# Flash colors for tension building
class FlashColor(Enum):
    WHITE = "white"   # Reveal, impact
    BLACK = "black"   # Tension, transition
    RED = "red"       # Horror, intensity
    BLUE = "blue"     # Cool tension
    ORANGE = "orange" # Action warmth

# Preset patterns
PRESET_PATTERNS = {
    "tension_build": [...accelerating white flashes...],
    "impact": [single strong flash],
    "strobe": [alternating white/black],
    "horror": [red pulses with black],
    "action_beat": [orange + white combo],
}

# Key methods:
- add_flash_frames(input, output, List[FlashConfig])
- add_pattern_at_timestamp(input, output, pattern_name, timestamp)
- create_flash_plan(scenes, beat_times, trailer_duration) -> List[FlashConfig]
```

### 6.2 Schema Changes

```typescript
// convex/schema.ts - New table

trailer_effects_plans: defineTable({
  trailerJobId: v.id("trailer_jobs"),
  profileId: v.id("trailer_profiles"),

  // Transition plan between clips
  transitions: v.array(v.object({
    fromClipIndex: v.number(),
    toClipIndex: v.number(),
    transitionType: v.string(),
    duration: v.number(),
    offset: v.number(),
    isBeatAligned: v.boolean(),
  })),

  // Speed effect plan
  speedEffects: v.array(v.object({
    effectIndex: v.number(),
    effectType: v.string(),  // "slow_motion" | "speed_ramp" | "constant_speed"
    startTime: v.number(),
    endTime: v.number(),
    speedFactor: v.optional(v.number()),
    rampInDuration: v.optional(v.number()),
    rampOutDuration: v.optional(v.number()),
    startSpeed: v.optional(v.number()),
    endSpeed: v.optional(v.number()),
    easing: v.optional(v.string()),
  })),

  // Flash frame plan
  flashFrames: v.array(v.object({
    flashIndex: v.number(),
    timestamp: v.number(),
    duration: v.number(),
    color: v.string(),
    intensity: v.number(),
    fadeIn: v.optional(v.number()),
    fadeOut: v.optional(v.number()),
  })),

  // Summary stats
  totalTransitions: v.number(),
  totalSpeedEffects: v.number(),
  totalFlashFrames: v.number(),

  aiReasoning: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_trailerJob", ["trailerJobId"]),

// Added to trailer_jobs:
effectsPlanId: v.optional(v.id("trailer_effects_plans")),
```

### 6.3 Pipeline Integration

```python
# modal/services/trailer_processor.py

# New pipeline step after SFX generation:
# Step 8e: Phase 6 - Generate effects plan
print(f"[{self.job_id}] Generating effects plan...")
await self.convex.update_status(
    self.job_id, "EFFECTS_PLANNING", progress=69,
    current_step="Planning transitions & effects..."
)
self.effects_plan = await self._generate_effects_plan(plan, profile)

# The _generate_effects_plan method:
# 1. Creates transition plan using scene importance + beat alignment
# 2. Identifies slow motion candidates from high-importance moments
# 3. Generates flash frame plan for tension/impact
# 4. Saves to Convex via create_effects_plan action
```

### 6.4 Intelligent Effect Selection

The effect planning uses Phase 5 scene analysis:

```python
# Transition selection based on context:
if is_beat_aligned and importance > 0.8:
    if emotion == "action": return ("whip_pan", 0.25)
    if emotion == "dramatic": return ("dip_to_white", 0.6)
elif is_beat_aligned:
    return ("hard_cut", 0.0)  # Clean beat-aligned cuts
elif importance > 0.7:
    return ("dip_to_black", 0.8)  # Dramatic transitions
else:
    return ("crossfade", 0.4)  # Smooth flow

# Slow motion candidates:
- Only scenes with importance > 0.7
- Prefer "action", "dramatic", "climax" emotions
- Speed factor: 0.25-0.4x (slower for climax)
- Max 3 slow motion moments per trailer

# Flash frames:
- Action scenes: Orange flashes on beats
- Horror scenes: Red pulses
- Dramatic reveals: White impact flash
- Tension build: Accelerating flashes before climax
```

---

## Phase 7: Professional Overlays & Branding ✅ IMPLEMENTED
**Goal:** Add professional trailer branding elements like logos, ratings, social handles, and end cards

### 7.1 New Module Created

New service module: `modal/services/overlays.py`

#### `OverlayRenderer` Class

```python
# Overlay position options
class OverlayPosition(Enum):
    TOP_LEFT = "top_left"
    TOP_CENTER = "top_center"
    TOP_RIGHT = "top_right"
    CENTER = "center"
    BOTTOM_LEFT = "bottom_left"
    BOTTOM_CENTER = "bottom_center"
    BOTTOM_RIGHT = "bottom_right"
    LOWER_THIRD = "lower_third"

# Age rating support (MPAA, BBFC, etc.)
class AgeRating(Enum):
    MPAA_G = "G"
    MPAA_PG = "PG"
    MPAA_PG13 = "PG-13"
    MPAA_R = "R"
    MPAA_NC17 = "NC-17"
    NOT_RATED = "NOT RATED"
    # ... and more

# Key methods:
- add_logo_overlay(input, output, LogoConfig)
- add_age_rating(input, output, AgeRatingConfig)
- add_social_watermark(input, output, SocialHandleConfig)
- add_end_card(input, output, EndCardConfig)
- add_credits_text(input, output, CreditsConfig)
- apply_all_overlays(input, output, overlay_plan) -> single pass
- create_overlay_plan(profile, branding, duration) -> overlay_plan
```

### 7.2 Overlay Types

#### Logo Overlays (Studio Bumpers)
```python
@dataclass
class LogoConfig:
    logo_path: str        # Path to PNG with transparency
    position: OverlayPosition
    start_time: float     # When logo appears
    duration: float       # How long visible
    fade_in: float        # Fade in duration
    fade_out: float       # Fade out duration
    scale: float          # Scale relative to video width (0-1)
    opacity: float        # 0-1
```

#### Age Ratings
```python
@dataclass
class AgeRatingConfig:
    rating: AgeRating           # G, PG, PG-13, R, etc.
    position: OverlayPosition
    content_descriptors: List[str]  # ["Violence", "Language"]
    start_time: float
    duration: Optional[float]   # None = entire video
    background_opacity: float   # Badge background
```

#### Social Media Watermarks
```python
@dataclass
class SocialHandleConfig:
    platform: str         # "instagram", "twitter", "tiktok"
    handle: str           # "@username"
    position: OverlayPosition
    start_time: Optional[float]  # None = last 10 seconds
    include_icon: bool    # Show platform icon
    opacity: float
```

#### End Cards
```python
@dataclass
class EndCardConfig:
    title: str                    # Movie title
    subtitle: Optional[str]       # "A Film by John Doe"
    release_date: Optional[str]   # "SUMMER 2025"
    tagline: Optional[str]        # "Every choice has a consequence"
    url: Optional[str]            # "www.moviename.com"
    duration: float               # End card duration
    style: str                    # "elegant", "bold", "minimal", "gritty"
```

#### Credits Text
```python
@dataclass
class CreditsConfig:
    text: str             # "FROM THE DIRECTOR OF INCEPTION"
    position: OverlayPosition
    start_time: float
    duration: float
    style: str            # Font style
    fade_in: float
    fade_out: float
```

### 7.3 Schema Changes

```typescript
// convex/schema.ts - New table

trailer_overlay_plans: defineTable({
  trailerJobId: v.id("trailer_jobs"),
  profileId: v.id("trailer_profiles"),

  // Logo overlays
  logos: v.array(v.object({
    logoIndex: v.number(),
    logoR2Key: v.string(),
    position: v.string(),
    startTime: v.number(),
    duration: v.number(),
    fadeIn: v.number(),
    fadeOut: v.number(),
    scale: v.number(),
    opacity: v.number(),
  })),

  // Age rating
  rating: v.optional(v.object({
    ratingCode: v.string(),
    contentDescriptors: v.optional(v.array(v.string())),
    position: v.string(),
    startTime: v.number(),
    duration: v.optional(v.number()),
    backgroundOpacity: v.number(),
  })),

  // Social handles
  socials: v.array(v.object({...})),

  // Credits
  credits: v.array(v.object({...})),

  // End card
  endCard: v.optional(v.object({...})),

  // Summary
  totalLogos: v.number(),
  totalSocials: v.number(),
  totalCredits: v.number(),
  hasEndCard: v.boolean(),
  hasRating: v.boolean(),

  createdAt: v.number(),
}).index("by_trailerJob", ["trailerJobId"]),

// Added to trailer_jobs:
overlayPlanId: v.optional(v.id("trailer_overlay_plans")),
```

### 7.4 Pipeline Integration

```python
# modal/services/trailer_processor.py

# New pipeline step after polish:
# Step 9c: Phase 7 - Apply overlays and branding
branding = self.job_data.get("branding", {})
if branding:
    print(f"[{self.job_id}] Applying overlays and branding...")
    await self.convex.update_status(
        self.job_id, "BRANDING", progress=82,
        current_step="Applying branding overlays..."
    )
    clips = await self._apply_overlays(clips, profile, branding)
```

### 7.5 Branding Configuration

Users can configure branding via job data:

```python
branding = {
    "logo_path": "/path/to/studio_logo.png",
    "age_rating": "PG-13",
    "content_descriptors": ["Violence", "Language"],
    "social_handles": {
        "instagram": "@moviestudio",
        "twitter": "@moviename",
    },
    "credits": [
        "FROM THE DIRECTOR OF INCEPTION",
        "STARRING JOHN DOE",
    ],
    "title": "MOVIE TITLE",
    "subtitle": "A Film by Jane Director",
    "release_date": "SUMMER 2025",
    "tagline": "Every choice has a consequence",
    "website_url": "www.moviename.com",
    "always_show_socials": False,  # True for social profiles
}
```

---

## Phase 8: Professional Workflow Features ✅ IMPLEMENTED
**Goal:** Add preview generation, manual adjustments, and export options for professional workflow

### 8.1 New Module Created

New service module: `modal/services/workflow.py`

#### `WorkflowManager` Class

```python
# Preview quality presets
class PreviewQuality(Enum):
    DRAFT = "draft"       # 480p, low bitrate, fast encode
    STANDARD = "standard"  # 720p, medium bitrate
    HIGH = "high"          # 1080p, good bitrate (for client review)

# Export quality presets
class ExportQuality(Enum):
    WEB_OPTIMIZED = "web_optimized"      # Balanced size/quality for web
    SOCIAL_MEDIA = "social_media"        # Optimized for social platforms
    BROADCAST = "broadcast"              # Broadcast-compliant specs
    THEATRICAL = "theatrical"            # High quality for theater
    ARCHIVE = "archive"                  # Maximum quality for master

# Export formats
class ExportFormat(Enum):
    MP4 = "mp4"           # H.264/AAC - universal compatibility
    MOV = "mov"           # ProRes/PCM - professional editing
    WEBM = "webm"         # VP9/Opus - web optimized
    MKV = "mkv"           # Flexible container

# Key methods:
- generate_preview(source, output, quality, watermark_text)
- generate_timeline_preview(clips, source, output, quality)
- export_final(source, output, quality, format, custom_resolution)
- apply_clip_adjustments(clips, adjustments) -> modified clips
- apply_text_card_adjustments(cards, adjustments) -> modified cards
- create_workflow_plan(profile, clips, text_cards, effects_plan)
```

### 8.2 Preview Generation

#### Preview Specs
```python
@dataclass
class PreviewSpec:
    quality: PreviewQuality
    resolution: str      # e.g., "1280x720"
    bitrate: str         # e.g., "2M"
    preset: str          # ffmpeg preset
    crf: int             # Quality factor (lower = better)
    audio_bitrate: str   # e.g., "128k"

# Preview presets:
DRAFT = PreviewSpec(
    resolution="854x480", bitrate="1M", preset="ultrafast", crf=28
)
STANDARD = PreviewSpec(
    resolution="1280x720", bitrate="2.5M", preset="fast", crf=23
)
HIGH = PreviewSpec(
    resolution="1920x1080", bitrate="5M", preset="medium", crf=20
)
```

#### Features
- Watermark overlay ("PREVIEW - NOT FINAL")
- Partial preview (start_time/end_time for specific sections)
- Timeline preview (quick clip sequence without full effects)

### 8.3 Manual Adjustments

#### Clip Adjustments
```python
@dataclass
class ClipAdjustment:
    clip_index: int
    adjustment_type: str  # "trim" | "move" | "replace" | "delete" | "add"

    # For trim adjustments
    new_source_start: Optional[float]
    new_source_end: Optional[float]

    # For move adjustments
    new_target_start: Optional[float]

    # For replace adjustments
    new_scene_index: Optional[int]

    # For add adjustments
    insert_at_index: Optional[int]
    scene_index: Optional[int]
    source_start: Optional[float]
    source_end: Optional[float]
```

#### Text Card Adjustments
```python
@dataclass
class TextCardAdjustment:
    card_index: int
    adjustment_type: str  # "edit" | "delete" | "add" | "move"

    new_text: Optional[str]
    new_style: Optional[str]
    new_motion: Optional[str]
    new_position: Optional[str]
    new_at_sec: Optional[float]
    new_duration_sec: Optional[float]
```

#### Effect Adjustments
```python
@dataclass
class EffectAdjustment:
    effect_type: str  # "transition" | "speed" | "flash"
    effect_index: int
    adjustment_type: str  # "edit" | "delete" | "add"

    new_transition_type: Optional[str]
    new_duration: Optional[float]
    new_speed_factor: Optional[float]
    new_flash_color: Optional[str]
    new_intensity: Optional[float]
```

### 8.4 Export Options

#### Export Specs
```python
@dataclass
class ExportSpec:
    quality: ExportQuality
    format: ExportFormat
    video_codec: str          # "libx264", "prores_ks", etc.
    audio_codec: str          # "aac", "pcm_s24le", etc.
    resolution: Optional[str]  # None = source resolution
    video_bitrate: Optional[str]
    crf: Optional[int]
    preset: str               # ffmpeg preset
    audio_bitrate: str
    audio_sample_rate: int
    pixel_format: str
    profile: Optional[str]    # H.264 profile
    level: Optional[str]      # H.264 level
```

#### Quality Presets
```python
# WEB_OPTIMIZED - For YouTube, Vimeo, website embedding
- 1080p, H.264 High Profile 4.1, CRF 20
- AAC 192k, 48kHz
- Fast start for streaming

# SOCIAL_MEDIA - For Instagram, TikTok, YouTube Shorts
- 1080x1920 (vertical), H.264 High Profile 4.2, CRF 18
- AAC 256k, 48kHz
- Optimized for mobile playback

# BROADCAST - For TV/cable delivery
- 1080p, H.264 High Profile 4.2, 25Mbps CBR
- PCM 24-bit (MOV) or AAC 320k (MP4)
- yuv422p pixel format

# THEATRICAL - For cinema projection
- Source resolution, H.264 High10 Profile 5.1, 50Mbps CBR
- PCM 24-bit (MOV)
- yuv422p10le pixel format

# ARCHIVE - Maximum quality master
- Source resolution, ProRes HQ (MOV) or H.265 CRF 15
- PCM 24-bit (MOV) or AAC 320k
- Best quality for archival
```

### 8.5 Schema Changes

```typescript
// convex/schema.ts - New tables

trailer_workflow_plans: defineTable({
  trailerJobId: v.id("trailer_jobs"),
  profileId: v.id("trailer_profiles"),

  // Timeline snapshot
  clips: v.array(v.object({...})),
  textCards: v.array(v.object({...})),

  // Duration info
  calculatedDuration: v.number(),
  targetDuration: v.number(),

  // References to other plans
  effectsPlanId: v.optional(v.id("trailer_effects_plans")),
  overlayPlanId: v.optional(v.id("trailer_overlay_plans")),
  audioPlanId: v.optional(v.id("trailer_audio_plans")),

  // Preview state
  previewQuality: v.optional(v.string()),
  previewR2Key: v.optional(v.string()),
  previewGeneratedAt: v.optional(v.number()),

  // Export state
  exports: v.optional(v.array(v.object({...}))),

  // Recommended presets
  recommendedExports: v.array(v.object({...})),

  // Revision tracking
  revision: v.number(),
  adjustmentsId: v.optional(v.id("trailer_workflow_adjustments")),

  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_trailerJob", ["trailerJobId"]),

trailer_workflow_adjustments: defineTable({
  trailerJobId: v.id("trailer_jobs"),
  workflowPlanId: v.id("trailer_workflow_plans"),

  clipAdjustments: v.array(v.object({...})),
  textCardAdjustments: v.array(v.object({...})),
  effectAdjustments: v.array(v.object({...})),

  // Audio adjustments
  musicLevelDbOffset: v.optional(v.number()),
  dialogueLevelDbOffset: v.optional(v.number()),
  sfxLevelDbOffset: v.optional(v.number()),

  // Overlay toggles
  disableEndCard: v.optional(v.boolean()),
  disableRating: v.optional(v.boolean()),
  customLogoR2Key: v.optional(v.string()),

  revision: v.number(),
  createdAt: v.number(),
}).index("by_trailerJob", ["trailerJobId"]),

// Added to trailer_jobs:
workflowPlanId: v.optional(v.id("trailer_workflow_plans")),
```

### 8.6 Pipeline Integration

```python
# modal/services/trailer_processor.py

# New pipeline steps after audio mixing:

# Step 10b: Phase 8 - Create workflow plan
print(f"[{self.job_id}] Creating workflow plan...")
await self.convex.update_status(
    self.job_id, "WORKFLOW_PLANNING", progress=87,
    current_step="Creating workflow plan..."
)
self.workflow_plan = await self._create_workflow_plan(
    profile, plan, text_cards, audio_plan
)

# Step 10c: Phase 8 - Generate preview (optional)
generate_preview = self.job_data.get("generatePreview", True)
if generate_preview and clips:
    print(f"[{self.job_id}] Generating preview...")
    await self.convex.update_status(
        self.job_id, "PREVIEW_GENERATING", progress=88,
        current_step="Generating preview..."
    )
    await self._generate_and_upload_preview(clips, profile)
```

### 8.7 Recommended Exports by Profile

```python
# Theatrical/Teaser/Festival profiles:
1. Theatrical Master (MOV, ProRes HQ)
2. Web Distribution (MP4, H.264 CRF 20)
3. Broadcast Ready (MOV, H.264 25Mbps)

# Social profiles:
1. Social Media (MP4, H.264 CRF 18, vertical)
2. Web Embed (MP4, H.264 CRF 20)

# Default:
1. Standard (MP4, H.264 CRF 20)
2. Archive Master (MOV, ProRes HQ)
```

---

## Phase 9: AI-Powered Selection Enhancements ✅ IMPLEMENTED
**Goal:** Enhance AI clip selection with audience analysis, genre optimization, emotional arc mapping, A/B variant generation, and pacing optimization

### 9.1 New Module Created

New service module: `modal/services/ai_selection.py`

#### Core Enums

```python
class AudienceType(Enum):
    GENERAL = "general"           # Broad appeal
    YOUNG_ADULT = "young_adult"   # 16-25 demographic
    MATURE = "mature"             # 25+ audience
    FAMILY = "family"             # All ages content
    HORROR_FANS = "horror_fans"   # Genre enthusiasts
    ART_HOUSE = "art_house"       # Arthouse/indie audience
    ACTION_FANS = "action_fans"   # Action movie enthusiasts

class Genre(Enum):
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
    INTRIGUE = "intrigue"       # Opening hook
    SETUP = "setup"             # World/character establishment
    TENSION = "tension"         # Building conflict
    ESCALATION = "escalation"   # Stakes rising
    CLIMAX = "climax"           # Peak moment
    RESOLUTION = "resolution"   # Closing beat
```

#### `AudienceAnalyzer` Class

Optimizes clip selection based on target audience demographics:

```python
class AudienceAnalyzer:
    """Analyze and optimize clip selection for target audience."""

    # Audience preferences for different demographics
    AUDIENCE_PREFERENCES = {
        AudienceType.GENERAL: {
            "pace": "moderate",          # Medium pacing
            "dialogue_importance": 0.6,  # Moderate dialogue
            "action_preference": 0.5,    # Balanced action
            "emotional_depth": 0.5,      # Balanced emotion
            "complexity_tolerance": 0.4, # Lower complexity
        },
        AudienceType.YOUNG_ADULT: {
            "pace": "fast",
            "dialogue_importance": 0.4,
            "action_preference": 0.7,
            "emotional_depth": 0.6,
            "complexity_tolerance": 0.6,
        },
        # ... more audience types
    }

    async def analyze_content_for_audience(
        self, scenes, transcript, audience_type
    ) -> AudienceProfile:
        """Analyze content and generate audience-optimized recommendations."""
        # Uses GPT-4o for content analysis
```

#### `GenreOptimizer` Class

Applies genre-specific trailer conventions:

```python
class GenreOptimizer:
    """Optimize clip selection based on detected genre."""

    GENRE_CONVENTIONS = {
        Genre.ACTION: GenreConventions(
            typical_pace=1.2,              # Fast cuts
            dialogue_ratio=0.3,            # 30% dialogue
            music_intensity=0.9,           # High intensity music
            text_card_frequency=0.6,       # Moderate text cards
            recommended_transitions=["whip_pan", "hard_cut", "flash"],
            color_palette="warm_high_contrast",
            typical_clip_count=25,
            avg_clip_duration=2.5,
        ),
        Genre.HORROR: GenreConventions(
            typical_pace=0.8,              # Slower, tension-building
            dialogue_ratio=0.4,
            music_intensity=0.7,
            text_card_frequency=0.4,
            recommended_transitions=["dip_to_black", "slow_fade"],
            color_palette="dark_desaturated",
            typical_clip_count=18,
            avg_clip_duration=4.0,
        ),
        # ... more genre conventions
    }

    async def detect_genre(self, scenes, transcript) -> Tuple[Genre, float]:
        """Detect primary genre from content analysis."""
```

#### `EmotionalArcAnalyzer` Class

Maps clips to emotional beats for proper trailer structure:

```python
class EmotionalArcAnalyzer:
    """Analyze and map emotional arc for trailers."""

    IDEAL_ARC = {
        EmotionalBeat.INTRIGUE: {"position": 0.0, "duration": 0.15, "intensity": 0.6},
        EmotionalBeat.SETUP: {"position": 0.15, "duration": 0.20, "intensity": 0.4},
        EmotionalBeat.TENSION: {"position": 0.35, "duration": 0.20, "intensity": 0.6},
        EmotionalBeat.ESCALATION: {"position": 0.55, "duration": 0.20, "intensity": 0.8},
        EmotionalBeat.CLIMAX: {"position": 0.75, "duration": 0.15, "intensity": 1.0},
        EmotionalBeat.RESOLUTION: {"position": 0.90, "duration": 0.10, "intensity": 0.7},
    }

    async def analyze_emotional_arc(self, clips, text_cards, transcript) -> EmotionalArc:
        """Analyze the emotional progression of a trailer."""
```

#### `ABVariantGenerator` Class

Creates multiple trailer variants for A/B testing:

```python
class ABVariantGenerator:
    """Generate A/B test variants of trailers."""

    VARIANT_TYPES = {
        "emphasis": {
            "action": {"dialogue_ratio": 0.2, "pacing_modifier": 1.2},
            "dialogue": {"dialogue_ratio": 0.6, "pacing_modifier": 0.9},
            "emotional": {"dialogue_ratio": 0.4, "emotional_intensity": 1.2},
            "mystery": {"dialogue_ratio": 0.3, "reveal_level": 0.5},
        },
        "text_cards": {
            "minimal": {"card_count": 3, "style": "minimal"},
            "standard": {"card_count": 5, "style": "bold"},
            "heavy": {"card_count": 8, "style": "gritty"},
        },
        "music_style": {
            "orchestral": {"style": "epic_orchestral"},
            "electronic": {"style": "dark_electronic"},
            "minimal": {"style": "ambient_minimal"},
        },
    }

    async def generate_variants(self, base_clips, base_cards, genre, audience) -> List[ABVariant]:
        """Generate A/B test variants with different approaches."""
```

#### `PacingOptimizer` Class

Optimizes cut rhythm and tempo:

```python
class PacingOptimizer:
    """Optimize trailer pacing based on content and target."""

    async def analyze_pacing(self, clips, target_duration, beat_times) -> Dict:
        """Analyze current pacing and suggest optimizations."""

    async def optimize_pacing(
        self, clips, target_pace, beat_times, allow_speed_changes
    ) -> List[Dict]:
        """Optimize clip timing for better pacing."""
```

#### `AISelectionEnhancer` Class (Main Orchestrator)

```python
class AISelectionEnhancer:
    """Main orchestrator for Phase 9 AI-powered selection enhancements."""

    async def enhance_selection(
        self,
        scenes: List[Dict],
        transcript: Dict,
        clips: List[Dict],
        text_cards: List[Dict],
        profile: Dict,
        beat_analysis: Optional[Dict] = None,
        audience_type: Optional[str] = None,
        genre_override: Optional[str] = None,
        generate_variants: bool = False,
    ) -> Dict[str, Any]:
        """Full AI enhancement pipeline.

        Returns:
            Dict containing:
            - enhanced_clips: Optimized clip selection
            - enhanced_text_cards: Optimized text cards
            - genre: Detected/confirmed genre with confidence
            - genre_conventions: Applied genre conventions
            - audience_analysis: Audience optimization results
            - emotional_arc: Mapped emotional progression
            - arc_validation: Arc compliance results
            - pacing_analysis: Pacing optimization results
            - recommended_effects: Effect suggestions based on genre
            - ab_variants: List of generated variants (if requested)
        """
```

### 9.2 Schema Changes

```typescript
// convex/schema.ts - New tables

// Added to trailer_jobs:
aiSelectionPlanId: v.optional(v.id("trailer_ai_selection_plans")),

// New AI selection plan table
trailer_ai_selection_plans: defineTable({
  trailerJobId: v.id("trailer_jobs"),
  profileId: v.id("trailer_profiles"),

  // Genre detection
  detectedGenre: v.string(),
  genreConfidence: v.number(),
  genreConventions: v.object({
    typicalPace: v.number(),
    dialogueRatio: v.number(),
    musicIntensity: v.number(),
    textCardFrequency: v.number(),
    recommendedTransitions: v.array(v.string()),
    colorPalette: v.string(),
    typicalClipCount: v.number(),
    avgClipDuration: v.number(),
  }),

  // Audience analysis
  audienceType: v.string(),
  audienceAnalysis: v.object({
    targetAudience: v.string(),
    contentRating: v.string(),
    pacePreference: v.string(),
    dialogueImportance: v.number(),
    actionPreference: v.number(),
    emotionalDepth: v.number(),
    recommendations: v.array(v.string()),
  }),

  // Emotional arc
  emotionalArc: v.object({
    mappedBeats: v.array(v.object({
      beat: v.string(),
      clipIndices: v.array(v.number()),
      startTime: v.number(),
      endTime: v.number(),
      intensity: v.number(),
    })),
    overallProgression: v.string(),
  }),
  arcValidation: v.object({
    isValid: v.boolean(),
    issues: v.array(v.string()),
    suggestions: v.array(v.string()),
  }),

  // Pacing analysis
  pacingAnalysis: v.object({
    currentPace: v.number(),
    targetPace: v.number(),
    avgClipDuration: v.number(),
    pacingVariation: v.number(),
    suggestions: v.array(v.string()),
  }),

  // Recommended effects based on genre
  recommendedEffects: v.object({
    transitions: v.array(v.string()),
    speedEffects: v.array(v.string()),
    flashPatterns: v.array(v.string()),
  }),

  // Enhancement summary
  enhancementSummary: v.object({
    clipsOptimized: v.number(),
    textCardsAdjusted: v.number(),
    arcComplianceScore: v.number(),
    genreComplianceScore: v.number(),
  }),

  createdAt: v.number(),
}).index("by_trailerJob", ["trailerJobId"]),

// A/B variant tracking
trailer_ab_variants: defineTable({
  trailerJobId: v.id("trailer_jobs"),
  selectionPlanId: v.id("trailer_ai_selection_plans"),

  // Variant identification
  variantId: v.string(),
  variantName: v.string(),
  isControl: v.boolean(),

  // Variant configuration
  emphasis: v.string(),
  pacingModifier: v.number(),
  textCardVariant: v.string(),
  musicStyle: v.string(),

  // Clip/card differences
  clipModifications: v.optional(v.array(v.object({
    clipIndex: v.number(),
    modification: v.string(),
    reason: v.string(),
  }))),
  textCardModifications: v.optional(v.array(v.object({
    cardIndex: v.number(),
    modification: v.string(),
    reason: v.string(),
  }))),

  // Performance tracking (for future A/B test results)
  viewCount: v.optional(v.number()),
  completionRate: v.optional(v.number()),
  engagementScore: v.optional(v.number()),

  status: v.string(),
  createdAt: v.number(),
}).index("by_trailerJob", ["trailerJobId"]).index("by_selectionPlan", ["selectionPlanId"]),
```

### 9.3 Pipeline Integration

```python
# modal/services/trailer_processor.py

# Step 6b: Phase 9 - AI Selection Enhancement (optional)
enable_ai_enhancement = self.job_data.get("enableAIEnhancement", True)
if enable_ai_enhancement:
    print(f"[{self.job_id}] Enhancing selection with AI...")
    await self.convex.update_status(
        self.job_id, "AI_ENHANCING", progress=62,
        current_step="Enhancing clip selection with AI..."
    )

    # Get optional configuration
    audience_type = self.job_data.get("audienceType")
    genre_override = self.job_data.get("genreOverride")
    generate_variants = self.job_data.get("generateABVariants", False)

    # Enhance selection
    enhancement_result = await self.ai_selection_enhancer.enhance_selection(
        scenes=scenes,
        transcript=transcript,
        clips=plan.get("clips", []),
        text_cards=plan.get("textCards", []),
        profile=profile,
        beat_analysis=beat_analysis,
        audience_type=audience_type,
        genre_override=genre_override,
        generate_variants=generate_variants,
    )

    # Update plan with enhanced clips and text cards
    plan["clips"] = enhancement_result.get("enhanced_clips", plan["clips"])
    text_cards = enhancement_result.get("enhanced_text_cards", text_cards)

    # Save AI selection plan to Convex
    self.ai_selection_plan = await self.convex.create_ai_selection_plan(
        self.job_id, profile.get("id"), enhancement_result
    )
```

### 9.4 Features

1. **Audience Optimization**: Tailors pacing, dialogue, and action balance for target demographics
2. **Genre Detection**: Automatically detects genre and applies appropriate conventions
3. **Emotional Arc Mapping**: Ensures proper INTRIGUE → SETUP → TENSION → ESCALATION → CLIMAX → RESOLUTION structure
4. **A/B Variant Generation**: Creates multiple trailer approaches for testing:
   - Action-focused vs dialogue-focused
   - Minimal vs heavy text cards
   - Different music styles
5. **Pacing Optimization**: Adjusts clip timing to match genre conventions and beat synchronization

---

## Success Metrics (Updated with Phase 9)

| Metric | Current | Target |
|--------|---------|--------|
| Viewer engagement (watch %) | ~40% | 80%+ |
| "Professional quality" rating | 2/5 | 4.8/5 |
| Music presence | 0% | 100% |
| Text card usage | 0% | 100% (theatrical) |
| Beat-aligned cuts | 0% | 90%+ |
| Dialogue selection accuracy | N/A | 85%+ (subjective) |
| Loudness compliance | None | -14 LUFS web, -24 LUFS theatrical |
| Professional transitions | 0% | 100% |
| Speed effects (slow-mo) | 0% | 2-3 per trailer |
| Flash frame effects | 0% | 5-10 per trailer |
| End cards with branding | 0% | 100% (theatrical) |
| Age ratings displayed | 0% | 100% (when configured) |
| Social handles watermark | 0% | 100% (social profiles) |
| Preview generation | 0% | 100% (all jobs) |
| Export options available | 1 | 5 presets |
| Manual adjustment support | None | Full clip/card/effect editing |
| Revision tracking | None | Unlimited revisions |
| Genre detection accuracy | N/A | 90%+ correct genre |
| Emotional arc compliance | N/A | 85%+ proper beat structure |
| Audience optimization | N/A | Demographic-tailored content |
| A/B variant generation | N/A | 3+ variants per job (when enabled) |
| Pacing optimization | N/A | Within 10% of genre conventions |

---

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Done | Cinematic Text Cards |
| Phase 2 | ✅ Done | AI-Generated Music (ElevenLabs) |
| Phase 3 | ✅ Done | Sound Design (Impacts, Risers, Whooshes) |
| Phase 4 | ✅ Done | Polish with Professional Finishing |
| Phase 5 | ✅ Done | Advanced Editing Intelligence |
| Phase 6 | ✅ Done | Transitions & Speed Effects |
| Phase 7 | ✅ Done | Professional Overlays & Branding |
| Phase 8 | ✅ Done | Professional Workflow Features |
| Phase 9 | ✅ Done | AI-Powered Selection Enhancements |

---

## Next Steps

1. **Testing**: Validate all phases (1-9) with real trailer outputs
2. **UI Integration**: Build frontend components for:
   - Preview playback and manual adjustments
   - Export selection and quality presets
   - Audience targeting configuration
   - A/B variant management
   - Genre override controls
3. **Performance Optimization**: Profile and optimize the full pipeline
4. **A/B Testing Analytics**: Build dashboard for tracking variant performance

