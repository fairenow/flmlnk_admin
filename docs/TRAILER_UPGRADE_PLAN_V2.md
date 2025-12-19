# Hollywood Trailer Upgrade Plan V2

## Executive Summary

Building on the foundation of Phases 1-4 (Text Cards, Audio, Sound Design, Polish), this expanded roadmap adds advanced editing intelligence, professional workflows, and multi-platform delivery capabilities to create a truly Hollywood-caliber trailer production pipeline.

---

## Status: Completed Phases

### Phase 1: Cinematic Text Cards ✅
- GPT-generated anticipatory title cards
- 7 motion types (fade_up, push_in, slide_left/right, zoom_in, typewriter, cut)
- FFmpeg drawtext with dynamic expressions
- Profile-based styling

### Phase 2: Audio Foundation ✅
- ElevenLabs Music API integration
- Music prompt generation from content analysis
- Basic audio mixing (dialogue + music)
- Loudness normalization (-14 LUFS web, -24 LUFS theatrical)

### Phase 3: Sound Design ✅
- ElevenLabs SFX generation (impacts, risers, whooshes, stings, drones)
- Beat-aligned SFX placement
- Multi-track mixing (dialogue + music + SFX)
- Dialogue ducking automation

### Phase 4: Polish ✅
- Film grain via FFmpeg noise filter
- Letterbox (2.39:1, 2.35:1, 1.85:1)
- Color grading (presets: cinematic, thriller, drama, action, broadcast)
- Vignette effects

---

## Phase 5: Advanced Editing Intelligence

**Goal:** Make AI-driven editorial decisions that mirror professional trailer editors

### 5.1 Scene Importance Scoring

GPT-4o analyzes each scene for trailer value, enabling intelligent clip selection.

```typescript
// convex/schema.ts - Add to scenes analysis

scene_importance: defineTable({
  sceneId: v.id("scenes"),
  trailerJobId: v.id("trailer_jobs"),

  // Scoring dimensions (0-1)
  emotionalIntensity: v.number(),      // Dramatic weight
  visualInterest: v.number(),          // Cinematography quality
  narrativeImportance: v.number(),     // Plot relevance
  starPower: v.number(),               // Lead actor presence
  iconicPotential: v.number(),         // "Money shot" quality

  // Derived
  compositeScore: v.number(),          // Weighted average
  recommendedPlacement: v.string(),    // "opener" | "build" | "climax" | "closer"

  aiReasoning: v.optional(v.string()),
}).index("by_trailerJob", ["trailerJobId"]),
```

```python
# modal/services/scene_analyzer.py

SCENE_SCORING_PROMPT = """
Analyze this scene for trailer potential. Score each dimension 0-1:

1. EMOTIONAL INTENSITY: How dramatic/emotional is this moment?
   - 0.0 = mundane, no tension
   - 0.5 = moderate interest
   - 1.0 = peak emotional moment

2. VISUAL INTEREST: How visually compelling?
   - Consider: cinematography, action, unique imagery
   - 0.0 = static/boring
   - 1.0 = stunning/iconic

3. NARRATIVE IMPORTANCE: How central to the story?
   - 0.0 = filler scene
   - 1.0 = critical plot point

4. STAR POWER: Lead actor presence and performance?
   - 0.0 = no recognizable talent
   - 1.0 = star in their best moment

5. ICONIC POTENTIAL: Could this be "the shot" from the trailer?
   - 0.0 = forgettable
   - 1.0 = poster-worthy

SCENE TRANSCRIPT:
{transcript}

SCENE DESCRIPTION:
{visual_description}

Output JSON:
{
  "emotionalIntensity": 0.X,
  "visualInterest": 0.X,
  "narrativeImportance": 0.X,
  "starPower": 0.X,
  "iconicPotential": 0.X,
  "compositeScore": 0.X,
  "recommendedPlacement": "opener|build|climax|closer",
  "reasoning": "..."
}
"""

class SceneAnalyzer:
    def score_scene(self, scene: dict, transcript: str) -> dict:
        """Score a scene for trailer value."""

        # Get visual description from keyframe
        visual_desc = self._describe_keyframe(scene["keyframePath"])

        response = self.openai.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": SCENE_SCORING_PROMPT.format(
                    transcript=transcript,
                    visual_description=visual_desc
                )
            }],
            response_format={"type": "json_object"}
        )

        return json.loads(response.choices[0].message.content)

    def _describe_keyframe(self, keyframe_path: str) -> str:
        """Use GPT-4o vision to describe the keyframe."""
        # Encode image and send to GPT-4o vision
        # Returns natural language description
        pass
```

### 5.2 Dialogue Selection AI

Automatically select the most impactful dialogue moments for trailer use.

```python
# modal/services/dialogue_selector.py

DIALOGUE_SELECTION_PROMPT = """
From this transcript, select the BEST LINES for a trailer.

Trailer dialogue should be:
- PUNCHY: Short, impactful statements (1-2 sentences max)
- INTRIGUING: Raise questions without spoiling
- EMOTIONAL: Peak emotional moments
- ICONIC: "Trailer voice" quality

Avoid:
- Plot spoilers
- Context-dependent lines
- Mundane dialogue
- Long explanatory passages

FULL TRANSCRIPT:
{transcript}

Select 5-10 best moments. Output JSON:
{
  "selectedLines": [
    {
      "text": "exact quote",
      "startSec": 0.0,
      "endSec": 0.0,
      "speaker": "character name or NARRATOR",
      "category": "hook|question|emotional|action|closer",
      "trailerScore": 0.9,
      "suggestedPlacement": "opener|build|climax|closer",
      "reasoning": "why this works for trailer"
    }
  ]
}
"""

class DialogueSelector:
    def select_trailer_dialogue(self, transcript: list[dict]) -> list[dict]:
        """Select the best dialogue moments for trailer use."""

        # Format transcript for prompt
        formatted = "\n".join([
            f"[{seg['start']:.1f}s - {seg['end']:.1f}s] {seg['text']}"
            for seg in transcript
        ])

        response = self.openai.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": DIALOGUE_SELECTION_PROMPT.format(transcript=formatted)
            }],
            response_format={"type": "json_object"}
        )

        return json.loads(response.choices[0].message.content)["selectedLines"]
```

### 5.3 Beat-Sync Editing

Align cuts to music beats for professional rhythm.

```python
# modal/services/beat_sync.py

import librosa
import numpy as np

class BeatSyncEditor:
    """Sync trailer cuts to music beats."""

    def analyze_music_beats(self, music_path: str) -> dict:
        """Extract beat grid from music."""

        y, sr = librosa.load(music_path)

        # Get tempo and beat frames
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)

        # Detect strong beats (downbeats)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        downbeats = self._detect_downbeats(beat_frames, onset_env)
        downbeat_times = librosa.frames_to_time(downbeats, sr=sr)

        # Detect musical sections (verse, chorus, build, drop)
        sections = self._segment_music(y, sr)

        return {
            "tempo": float(tempo),
            "beats": beat_times.tolist(),
            "downbeats": downbeat_times.tolist(),
            "sections": sections,
            "impactPoints": self._find_impact_points(y, sr, beat_times)
        }

    def snap_to_beat(
        self,
        target_time: float,
        beat_grid: list[float],
        tolerance_sec: float = 0.15
    ) -> float:
        """Snap a timestamp to nearest beat within tolerance."""

        closest_beat = min(beat_grid, key=lambda b: abs(b - target_time))

        if abs(closest_beat - target_time) <= tolerance_sec:
            return closest_beat
        return target_time

    def align_cuts_to_beats(
        self,
        cut_points: list[float],
        beat_analysis: dict,
        prefer_downbeats: bool = True
    ) -> list[float]:
        """Align all cut points to music beats."""

        grid = beat_analysis["downbeats"] if prefer_downbeats else beat_analysis["beats"]

        aligned = []
        for cut in cut_points:
            aligned.append(self.snap_to_beat(cut, grid))

        return aligned

    def _find_impact_points(self, y, sr, beat_times) -> list[float]:
        """Find major musical impact moments (drops, hits)."""

        # Use spectral flux for sudden changes
        spectral_flux = librosa.onset.onset_strength(y=y, sr=sr)

        # Find peaks in spectral flux
        peaks = librosa.util.peak_pick(
            spectral_flux,
            pre_max=3, post_max=3,
            pre_avg=3, post_avg=5,
            delta=0.5, wait=10
        )

        impact_times = librosa.frames_to_time(peaks, sr=sr)

        # Filter to only major impacts (top 20%)
        threshold = np.percentile(spectral_flux[peaks], 80)
        major_impacts = [
            impact_times[i] for i, p in enumerate(peaks)
            if spectral_flux[p] >= threshold
        ]

        return major_impacts[:10]  # Max 10 impacts
```

---

## Phase 6: Transitions & Speed Effects

**Goal:** Add Hollywood-style transitions and dramatic speed manipulation

### 6.1 Clip Transitions

```python
# modal/services/transitions.py

class TransitionRenderer:
    """Render professional transitions between clips."""

    TRANSITION_TYPES = {
        "crossfade": {
            "filter": "xfade=transition=fade:duration={duration}:offset={offset}",
            "default_duration": 0.5,
        },
        "dip_to_black": {
            "filter": "xfade=transition=fadeblack:duration={duration}:offset={offset}",
            "default_duration": 0.8,
        },
        "dip_to_white": {
            "filter": "xfade=transition=fadewhite:duration={duration}:offset={offset}",
            "default_duration": 0.6,
        },
        "whip_pan": {
            "filter": "xfade=transition=slideleft:duration={duration}:offset={offset}",
            "default_duration": 0.25,  # Fast!
        },
        "zoom_transition": {
            "filter": "xfade=transition=zoomin:duration={duration}:offset={offset}",
            "default_duration": 0.4,
        },
        "wipe_right": {
            "filter": "xfade=transition=wiperight:duration={duration}:offset={offset}",
            "default_duration": 0.5,
        },
        "hard_cut": {
            "filter": None,  # No transition needed
            "default_duration": 0,
        },
    }

    def render_with_transitions(
        self,
        clips: list[dict],
        transitions: list[dict],  # [{type, duration}]
        output_path: str
    ) -> str:
        """Render clips with transitions between them."""

        if len(clips) < 2:
            return clips[0]["path"]

        # Build FFmpeg filter graph
        filter_parts = []

        # First clip input
        current_output = "[0:v]"

        for i, (clip, trans) in enumerate(zip(clips[1:], transitions)):
            trans_type = trans.get("type", "crossfade")
            trans_config = self.TRANSITION_TYPES.get(trans_type, self.TRANSITION_TYPES["crossfade"])

            if trans_config["filter"] is None:
                continue  # Hard cut

            duration = trans.get("duration", trans_config["default_duration"])
            offset = self._calculate_offset(clips[:i+1], duration)

            filter_str = trans_config["filter"].format(
                duration=duration,
                offset=offset
            )

            next_output = f"[v{i}]"
            filter_parts.append(f"{current_output}[{i+1}:v]{filter_str}{next_output}")
            current_output = next_output

        # Build inputs
        inputs = []
        for clip in clips:
            inputs.extend(["-i", clip["path"]])

        filter_complex = ";".join(filter_parts)

        cmd = [
            "ffmpeg", "-y",
            *inputs,
            "-filter_complex", filter_complex,
            "-map", current_output,
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            output_path
        ]

        subprocess.run(cmd, check=True)
        return output_path
```

### 6.2 Speed Ramping

```python
# modal/services/speed_effects.py

class SpeedRamper:
    """Apply dramatic speed changes for emotional impact."""

    def apply_speed_ramp(
        self,
        input_path: str,
        output_path: str,
        ramp_points: list[dict]  # [{startSec, endSec, speed, easing}]
    ) -> str:
        """Apply speed ramping with smooth transitions."""

        # Build setpts filter for speed changes
        pts_expressions = []

        for ramp in ramp_points:
            start = ramp["startSec"]
            end = ramp["endSec"]
            speed = ramp["speed"]  # 0.5 = half speed, 2.0 = double speed
            easing = ramp.get("easing", "linear")  # linear, ease_in, ease_out

            # setpts uses PTS/speed, so 0.5 speed = PTS/0.5 = PTS*2 (2x longer)
            if easing == "linear":
                pts_expr = f"if(between(T,{start},{end}),PTS/{speed},PTS)"
            else:
                # Eased speed change
                pts_expr = self._build_eased_pts(start, end, speed, easing)

            pts_expressions.append(pts_expr)

        # Combine all speed modifications
        combined_pts = " + ".join([f"({expr})" for expr in pts_expressions])

        # Apply speed change with pitch correction for audio
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-filter_complex", f"""
                [0:v]setpts={combined_pts}[v];
                [0:a]atempo={1/speed}[a]
            """,
            "-map", "[v]",
            "-map", "[a]",
            "-c:v", "libx264", "-preset", "medium",
            "-c:a", "aac",
            output_path
        ]

        subprocess.run(cmd, check=True)
        return output_path

    def create_slow_motion_moment(
        self,
        input_path: str,
        output_path: str,
        start_sec: float,
        duration_sec: float,
        slow_factor: float = 0.5,  # Half speed
        ramp_in_sec: float = 0.3,
        ramp_out_sec: float = 0.3,
    ) -> str:
        """Create dramatic slow-motion with smooth ramps."""

        ramp_points = [
            # Ramp into slow-mo
            {
                "startSec": start_sec - ramp_in_sec,
                "endSec": start_sec,
                "speed": 1.0,
                "target_speed": slow_factor,
                "easing": "ease_out"
            },
            # Hold slow-mo
            {
                "startSec": start_sec,
                "endSec": start_sec + duration_sec,
                "speed": slow_factor,
                "easing": "linear"
            },
            # Ramp out of slow-mo
            {
                "startSec": start_sec + duration_sec,
                "endSec": start_sec + duration_sec + ramp_out_sec,
                "speed": slow_factor,
                "target_speed": 1.0,
                "easing": "ease_in"
            }
        ]

        return self.apply_speed_ramp(input_path, output_path, ramp_points)
```

### 6.3 Flash Frames

```python
# modal/services/flash_frames.py

class FlashFrameRenderer:
    """Add subliminal flash frames for tension."""

    def add_flash_frames(
        self,
        input_path: str,
        output_path: str,
        flash_points: list[dict]  # [{atSec, type, duration_frames}]
    ) -> str:
        """Insert flash frames at specified points."""

        filter_parts = []

        for flash in flash_points:
            at_sec = flash["atSec"]
            flash_type = flash.get("type", "white")  # white, black, red
            duration_frames = flash.get("duration_frames", 2)  # 2-3 frames typical

            # Color for flash
            colors = {
                "white": "FFFFFF",
                "black": "000000",
                "red": "FF0000",
            }
            color = colors.get(flash_type, "FFFFFF")

            # Calculate frame duration (assuming 24fps for theatrical)
            frame_duration = duration_frames / 24.0

            # Overlay solid color for flash duration
            filter_str = (
                f"drawbox=enable='between(t,{at_sec},{at_sec + frame_duration})':"
                f"x=0:y=0:w=iw:h=ih:c=#{color}:t=fill"
            )
            filter_parts.append(filter_str)

        filter_complex = ",".join(filter_parts)

        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-vf", filter_complex,
            "-c:v", "libx264", "-preset", "medium",
            "-c:a", "copy",
            output_path
        ]

        subprocess.run(cmd, check=True)
        return output_path
```

---

## Phase 7: Professional Overlays & Branding

**Goal:** Add studio-quality branding and overlay systems

### 7.1 Logo Watermark System

```python
# modal/services/logo_overlay.py

class LogoOverlay:
    """Add logo watermarks and branding."""

    PLACEMENTS = {
        "lower_right": {"x": "W-w-20", "y": "H-h-20"},
        "lower_left": {"x": "20", "y": "H-h-20"},
        "upper_right": {"x": "W-w-20", "y": "20"},
        "upper_left": {"x": "20", "y": "20"},
        "center": {"x": "(W-w)/2", "y": "(H-h)/2"},
    }

    def add_logo(
        self,
        video_path: str,
        logo_path: str,
        output_path: str,
        placement: str = "lower_right",
        opacity: float = 0.7,
        scale: float = 0.15,  # 15% of video width
        start_sec: float = 0,
        end_sec: float = None,  # None = entire video
    ) -> str:
        """Overlay logo on video."""

        pos = self.PLACEMENTS.get(placement, self.PLACEMENTS["lower_right"])

        # Build enable expression if time-limited
        enable = ""
        if end_sec:
            enable = f":enable='between(t,{start_sec},{end_sec})'"

        filter_complex = f"""
            [1:v]scale=iw*{scale}:-1,format=rgba,colorchannelmixer=aa={opacity}[logo];
            [0:v][logo]overlay={pos['x']}:{pos['y']}{enable}[out]
        """

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", logo_path,
            "-filter_complex", filter_complex.strip(),
            "-map", "[out]",
            "-map", "0:a",
            "-c:v", "libx264", "-preset", "medium",
            "-c:a", "copy",
            output_path
        ]

        subprocess.run(cmd, check=True)
        return output_path
```

### 7.2 End Card Templates

```python
# modal/services/end_card.py

class EndCardRenderer:
    """Generate professional end cards with logo, title, and credits."""

    END_CARD_TEMPLATES = {
        "theatrical": {
            "duration": 5.0,
            "bg_color": "black",
            "logo_position": "center",
            "logo_scale": 0.4,
            "title_below_logo": True,
            "credits_style": "minimal",
            "release_date": True,
            "rating": True,
        },
        "social": {
            "duration": 3.0,
            "bg_color": "black",
            "logo_position": "center",
            "logo_scale": 0.6,
            "cta_text": "WATCH NOW",
            "url_display": True,
        },
        "tv_spot": {
            "duration": 2.0,
            "bg_color": "black",
            "logo_position": "upper_center",
            "title_below_logo": True,
            "tune_in_text": True,
        },
    }

    def render_end_card(
        self,
        output_path: str,
        template: str,
        width: int,
        height: int,
        logo_path: str = None,
        title: str = None,
        release_date: str = None,
        credits: list[str] = None,
        custom_text: dict = None,
    ) -> str:
        """Render end card video segment."""

        from PIL import Image, ImageDraw, ImageFont
        import tempfile

        config = self.END_CARD_TEMPLATES.get(template, self.END_CARD_TEMPLATES["theatrical"])

        # Create base image
        img = Image.new("RGB", (width, height), config["bg_color"])
        draw = ImageDraw.Draw(img)

        current_y = height * 0.3

        # Add logo
        if logo_path:
            logo = Image.open(logo_path)
            logo_width = int(width * config["logo_scale"])
            logo_height = int(logo.height * (logo_width / logo.width))
            logo = logo.resize((logo_width, logo_height))

            logo_x = (width - logo_width) // 2
            img.paste(logo, (logo_x, int(current_y)), logo if logo.mode == 'RGBA' else None)
            current_y += logo_height + 40

        # Add title
        if title and config.get("title_below_logo"):
            font = ImageFont.truetype("/usr/share/fonts/truetype/BebasNeue-Bold.ttf", 72)
            bbox = draw.textbbox((0, 0), title, font=font)
            text_width = bbox[2] - bbox[0]
            draw.text(
                ((width - text_width) // 2, current_y),
                title,
                font=font,
                fill="white"
            )
            current_y += 100

        # Add release date
        if release_date and config.get("release_date"):
            font = ImageFont.truetype("/usr/share/fonts/truetype/BebasNeue-Regular.ttf", 48)
            bbox = draw.textbbox((0, 0), release_date, font=font)
            text_width = bbox[2] - bbox[0]
            draw.text(
                ((width - text_width) // 2, current_y),
                release_date,
                font=font,
                fill="white"
            )

        # Save frame
        frame_path = tempfile.mktemp(suffix=".png")
        img.save(frame_path)

        # Convert to video
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1",
            "-i", frame_path,
            "-t", str(config["duration"]),
            "-vf", f"scale={width}:{height}",
            "-c:v", "libx264", "-preset", "medium",
            "-pix_fmt", "yuv420p",
            output_path
        ]

        subprocess.run(cmd, check=True)
        return output_path
```

### 7.3 Custom Font System

```python
# modal/services/font_manager.py

class FontManager:
    """Manage custom fonts for text rendering."""

    # Google Fonts that work well for trailers
    TRAILER_FONTS = {
        "bebas_neue": {
            "family": "Bebas Neue",
            "weights": ["Regular"],
            "style": "bold_condensed",
            "use_case": "Impact text, titles"
        },
        "oswald": {
            "family": "Oswald",
            "weights": ["Light", "Regular", "Bold"],
            "style": "condensed",
            "use_case": "Clean, modern titles"
        },
        "anton": {
            "family": "Anton",
            "weights": ["Regular"],
            "style": "impact",
            "use_case": "Bold, aggressive titles"
        },
        "playfair_display": {
            "family": "Playfair Display",
            "weights": ["Regular", "Bold", "Italic"],
            "style": "serif",
            "use_case": "Elegant, drama titles"
        },
        "roboto_condensed": {
            "family": "Roboto Condensed",
            "weights": ["Light", "Regular", "Bold"],
            "style": "sans_condensed",
            "use_case": "Clean subtitles, credits"
        },
        "special_elite": {
            "family": "Special Elite",
            "weights": ["Regular"],
            "style": "typewriter",
            "use_case": "Thriller, mystery titles"
        },
    }

    def __init__(self, fonts_dir: str = "/usr/share/fonts/truetype/custom"):
        self.fonts_dir = fonts_dir
        os.makedirs(fonts_dir, exist_ok=True)

    async def ensure_font(self, font_key: str) -> str:
        """Ensure font is available, download if needed."""

        font_info = self.TRAILER_FONTS.get(font_key)
        if not font_info:
            raise ValueError(f"Unknown font: {font_key}")

        font_path = f"{self.fonts_dir}/{font_info['family'].replace(' ', '')}.ttf"

        if not os.path.exists(font_path):
            await self._download_google_font(font_info["family"], font_path)

        return font_path

    async def _download_google_font(self, family: str, output_path: str):
        """Download font from Google Fonts."""
        import httpx

        # Google Fonts API URL
        url = f"https://fonts.googleapis.com/css2?family={family.replace(' ', '+')}"

        async with httpx.AsyncClient() as client:
            # Get CSS with font URLs
            css_response = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0"  # Required for woff2 URLs
            })

            # Extract TTF URL from CSS
            import re
            ttf_match = re.search(r"url\((https://[^)]+\.ttf)\)", css_response.text)
            if ttf_match:
                ttf_url = ttf_match.group(1)
                font_response = await client.get(ttf_url)

                with open(output_path, "wb") as f:
                    f.write(font_response.content)

    def get_font_for_style(self, style: str) -> str:
        """Get best font for a given style."""

        style_map = {
            "bold": "bebas_neue",
            "minimal": "oswald",
            "elegant": "playfair_display",
            "gritty": "anton",
            "typewriter": "special_elite",
            "clean": "roboto_condensed",
        }

        return style_map.get(style, "bebas_neue")
```

---

## Phase 8: Professional Workflow Features

**Goal:** Add approval workflows and professional delivery features

### 8.1 Preview Workflow (Low-Res Approval)

```typescript
// convex/schema.ts - Add preview system

trailer_previews: defineTable({
  trailerJobId: v.id("trailer_jobs"),

  // Preview video
  previewR2Key: v.string(),           // Low-res preview path
  previewResolution: v.string(),       // "480p" | "720p"
  previewBitrate: v.number(),          // kbps

  // Watermark
  hasWatermark: v.boolean(),
  watermarkText: v.optional(v.string()), // "PREVIEW - NOT FOR DISTRIBUTION"

  // Status
  status: v.string(),                  // "pending" | "approved" | "rejected" | "revision_requested"
  reviewedAt: v.optional(v.number()),
  reviewerNotes: v.optional(v.string()),

  // Revision tracking
  revisionNumber: v.number(),
  previousVersionId: v.optional(v.id("trailer_previews")),

  createdAt: v.number(),
}).index("by_trailerJob", ["trailerJobId"]),
```

```python
# modal/services/preview_renderer.py

class PreviewRenderer:
    """Generate low-resolution previews for approval."""

    PREVIEW_PRESETS = {
        "quick": {
            "resolution": "480p",
            "width": 854,
            "height": 480,
            "bitrate": 1000,
            "crf": 28,
        },
        "standard": {
            "resolution": "720p",
            "width": 1280,
            "height": 720,
            "bitrate": 2500,
            "crf": 24,
        },
    }

    def render_preview(
        self,
        input_path: str,
        output_path: str,
        preset: str = "standard",
        watermark: bool = True,
        watermark_text: str = "PREVIEW - NOT FOR DISTRIBUTION",
    ) -> str:
        """Render preview version with watermark."""

        config = self.PREVIEW_PRESETS.get(preset, self.PREVIEW_PRESETS["standard"])

        filters = [f"scale={config['width']}:{config['height']}"]

        if watermark:
            # Diagonal watermark across frame
            filters.append(
                f"drawtext=text='{watermark_text}':"
                f"fontsize=24:fontcolor=white@0.3:"
                f"x=(w-text_w)/2:y=(h-text_h)/2:"
                f"enable=1"
            )

        filter_chain = ",".join(filters)

        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-vf", filter_chain,
            "-c:v", "libx264", "-preset", "fast",
            "-crf", str(config["crf"]),
            "-b:v", f"{config['bitrate']}k",
            "-c:a", "aac", "-b:a", "128k",
            output_path
        ]

        subprocess.run(cmd, check=True)
        return output_path
```

### 8.2 Multi-Version Generation

```typescript
// convex/schema.ts - Version management

trailer_versions: defineTable({
  trailerJobId: v.id("trailer_jobs"),

  // Version type
  versionType: v.string(),  // "full" | "tv_30" | "tv_15" | "social_60" | "bumper_6"

  // Duration constraint
  targetDuration: v.number(),         // Target seconds
  actualDuration: v.number(),         // Actual seconds

  // Content differences
  excludedClips: v.array(v.number()), // Clip indices excluded from full
  textCardAdjustments: v.optional(v.array(v.object({
    cardIndex: v.number(),
    action: v.string(),  // "remove" | "shorten" | "replace"
    newText: v.optional(v.string()),
  }))),

  // Technical specs
  resolution: v.string(),
  aspectRatio: v.string(),

  // Output
  r2Key: v.string(),

  createdAt: v.number(),
}).index("by_trailerJob", ["trailerJobId"]),
```

```python
# modal/services/version_generator.py

class VersionGenerator:
    """Generate multiple trailer versions from master."""

    VERSION_SPECS = {
        "full": {
            "max_duration": None,  # Full length
            "aspect_ratios": ["16:9"],
        },
        "tv_30": {
            "max_duration": 30,
            "aspect_ratios": ["16:9"],
            "must_include": ["opener", "climax", "closer"],
            "pacing": "aggressive",
        },
        "tv_15": {
            "max_duration": 15,
            "aspect_ratios": ["16:9"],
            "must_include": ["hook", "closer"],
            "pacing": "very_aggressive",
        },
        "social_60": {
            "max_duration": 60,
            "aspect_ratios": ["9:16", "1:1"],
            "auto_captions": True,
        },
        "bumper_6": {
            "max_duration": 6,
            "aspect_ratios": ["16:9", "1:1"],
            "must_include": ["hook"],
            "pacing": "extreme",
        },
    }

    async def generate_version(
        self,
        master_plan: dict,
        version_type: str,
        output_path: str,
    ) -> dict:
        """Generate a specific version from the master plan."""

        spec = self.VERSION_SPECS.get(version_type)
        if not spec:
            raise ValueError(f"Unknown version type: {version_type}")

        # Use GPT to select best clips for duration
        shortened_plan = await self._select_clips_for_duration(
            master_plan,
            spec["max_duration"],
            spec.get("must_include", []),
            spec.get("pacing", "normal")
        )

        # Render shortened version
        # ... render logic

        return {
            "versionType": version_type,
            "targetDuration": spec["max_duration"],
            "actualDuration": shortened_plan["actualDuration"],
            "excludedClips": shortened_plan["excludedClips"],
        }

    async def _select_clips_for_duration(
        self,
        master_plan: dict,
        target_duration: float,
        must_include: list[str],
        pacing: str
    ) -> dict:
        """AI-powered clip selection for shortened version."""

        prompt = f"""
        Select clips from this trailer plan to fit within {target_duration} seconds.

        MUST INCLUDE moments: {must_include}
        PACING: {pacing}

        Current plan has {len(master_plan['clips'])} clips totaling {master_plan['totalDuration']}s.

        Return indices of clips to KEEP (not remove).
        Prioritize: emotional peaks, star moments, plot hooks.

        CLIPS:
        {json.dumps(master_plan['clips'], indent=2)}

        Output JSON:
        {{
          "keepClipIndices": [0, 2, 5, ...],
          "adjustedTextCards": [...],
          "reasoning": "..."
        }}
        """

        # Call GPT for selection
        # Return adjusted plan
```

### 8.3 Export Presets

```python
# modal/services/export_presets.py

class ExportPresets:
    """Platform-optimized export settings."""

    PRESETS = {
        "youtube": {
            "container": "mp4",
            "video_codec": "libx264",
            "video_profile": "high",
            "video_level": "4.1",
            "crf": 18,
            "max_bitrate": 50000,  # 50 Mbps for 4K
            "audio_codec": "aac",
            "audio_bitrate": 384,
            "audio_sample_rate": 48000,
            "color_space": "bt709",
            "resolution_options": ["4k", "1080p", "720p"],
        },
        "instagram_feed": {
            "container": "mp4",
            "video_codec": "libx264",
            "video_profile": "main",
            "crf": 20,
            "max_bitrate": 3500,
            "max_duration": 60,
            "audio_codec": "aac",
            "audio_bitrate": 128,
            "aspect_ratios": ["1:1", "4:5"],
            "resolution_options": ["1080p"],
        },
        "instagram_reels": {
            "container": "mp4",
            "video_codec": "libx264",
            "crf": 20,
            "max_bitrate": 3500,
            "max_duration": 90,
            "audio_codec": "aac",
            "audio_bitrate": 128,
            "aspect_ratio": "9:16",
            "resolution": "1080x1920",
        },
        "tiktok": {
            "container": "mp4",
            "video_codec": "libx264",
            "crf": 20,
            "max_bitrate": 4000,
            "max_duration": 180,
            "audio_codec": "aac",
            "audio_bitrate": 128,
            "aspect_ratio": "9:16",
            "resolution": "1080x1920",
        },
        "twitter": {
            "container": "mp4",
            "video_codec": "libx264",
            "crf": 21,
            "max_bitrate": 25000,
            "max_duration": 140,
            "audio_codec": "aac",
            "audio_bitrate": 128,
            "max_file_size_mb": 512,
        },
        "broadcast_hd": {
            "container": "mxf",
            "video_codec": "dnxhd",
            "video_profile": "dnxhr_hq",
            "audio_codec": "pcm_s24le",
            "audio_sample_rate": 48000,
            "audio_channels": 8,  # 5.1 + stereo mix
            "color_space": "bt709",
            "resolution": "1920x1080",
            "frame_rate": "23.976",
            "lufs": -24,
        },
        "broadcast_4k": {
            "container": "mxf",
            "video_codec": "dnxhd",
            "video_profile": "dnxhr_uhd",
            "audio_codec": "pcm_s24le",
            "resolution": "3840x2160",
            "frame_rate": "23.976",
            "lufs": -24,
        },
        "dcp": {
            "container": "mxf",
            "video_codec": "jpeg2000",
            "video_bitrate": 250000,  # 250 Mbps
            "color_space": "xyz",
            "resolution": "4096x1716",  # Scope
            "audio_codec": "pcm_s24le",
            "audio_sample_rate": 48000,
            "frame_rate": "24",
            "lufs": -20,
        },
    }

    def get_ffmpeg_args(self, preset: str, input_path: str, output_path: str) -> list:
        """Generate FFmpeg arguments for preset."""

        config = self.PRESETS.get(preset)
        if not config:
            raise ValueError(f"Unknown preset: {preset}")

        args = ["ffmpeg", "-y", "-i", input_path]

        # Video encoding
        args.extend(["-c:v", config["video_codec"]])

        if config.get("crf"):
            args.extend(["-crf", str(config["crf"])])
        if config.get("video_profile"):
            args.extend(["-profile:v", config["video_profile"]])
        if config.get("max_bitrate"):
            args.extend(["-maxrate", f"{config['max_bitrate']}k"])
            args.extend(["-bufsize", f"{config['max_bitrate'] * 2}k"])

        # Audio encoding
        args.extend(["-c:a", config["audio_codec"]])
        if config.get("audio_bitrate"):
            args.extend(["-b:a", f"{config['audio_bitrate']}k"])
        if config.get("audio_sample_rate"):
            args.extend(["-ar", str(config["audio_sample_rate"])])

        # Container format
        if config["container"] != "mp4":
            args.extend(["-f", config["container"]])

        args.append(output_path)

        return args
```

### 8.4 Subtitle Burn-In (International)

```python
# modal/services/subtitle_burn.py

class SubtitleBurner:
    """Burn subtitles for international versions."""

    SUBTITLE_STYLES = {
        "theatrical": {
            "font": "Arial",
            "fontsize": 48,
            "primary_color": "&HFFFFFF",
            "outline_color": "&H000000",
            "outline_width": 3,
            "shadow_offset": 2,
            "margin_v": 60,
            "alignment": 2,  # Center bottom
        },
        "social": {
            "font": "Arial Bold",
            "fontsize": 36,
            "primary_color": "&HFFFFFF",
            "back_color": "&H80000000",  # Semi-transparent background
            "outline_width": 0,
            "margin_v": 40,
            "alignment": 2,
        },
    }

    def burn_subtitles(
        self,
        video_path: str,
        subtitle_path: str,  # .srt or .ass file
        output_path: str,
        style: str = "theatrical",
    ) -> str:
        """Burn subtitles into video."""

        style_config = self.SUBTITLE_STYLES.get(style, self.SUBTITLE_STYLES["theatrical"])

        # Build ASS style string
        ass_style = self._build_ass_style(style_config)

        # FFmpeg subtitles filter
        filter_str = (
            f"subtitles={subtitle_path}:force_style='{ass_style}'"
        )

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vf", filter_str,
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-c:a", "copy",
            output_path
        ]

        subprocess.run(cmd, check=True)
        return output_path

    def _build_ass_style(self, config: dict) -> str:
        """Build ASS subtitle style string."""
        parts = [
            f"FontName={config['font']}",
            f"FontSize={config['fontsize']}",
            f"PrimaryColour={config['primary_color']}",
            f"OutlineColour={config['outline_color']}",
            f"Outline={config['outline_width']}",
            f"Shadow={config.get('shadow_offset', 0)}",
            f"MarginV={config['margin_v']}",
            f"Alignment={config['alignment']}",
        ]

        if config.get("back_color"):
            parts.append(f"BackColour={config['back_color']}")

        return ",".join(parts)
```

---

## Phase 9: AI-Powered Selection Enhancements

**Goal:** Smarter clip and thumbnail selection

### 9.1 Thumbnail AI Selection

```python
# modal/services/thumbnail_selector.py

class ThumbnailSelector:
    """AI-powered thumbnail selection from trailer frames."""

    THUMBNAIL_CRITERIA = """
    Select the BEST frames for trailer thumbnail. Consider:

    1. STAR POWER: Lead actor's face clearly visible, good expression
    2. ACTION: Dynamic, exciting moment frozen
    3. COMPOSITION: Rule of thirds, leading lines, visual interest
    4. EMOTION: Conveys the film's tone/genre
    5. CURIOSITY: Makes viewer want to click/watch
    6. TECHNICAL: Sharp focus, good lighting, no motion blur

    Avoid:
    - Blurry frames
    - Mid-blink expressions
    - Text overlays obscuring visuals
    - Dark/underexposed frames
    - Generic establishing shots
    """

    async def select_best_thumbnails(
        self,
        video_path: str,
        num_candidates: int = 20,
        num_final: int = 5,
    ) -> list[dict]:
        """Select best thumbnail candidates from video."""

        # Extract candidate frames
        candidates = await self._extract_candidate_frames(video_path, num_candidates)

        # Score each candidate with GPT-4o vision
        scored_candidates = []
        for frame in candidates:
            score = await self._score_thumbnail(frame["path"])
            scored_candidates.append({
                **frame,
                "score": score["overall"],
                "breakdown": score["breakdown"],
                "reasoning": score["reasoning"],
            })

        # Sort by score and return top N
        scored_candidates.sort(key=lambda x: x["score"], reverse=True)
        return scored_candidates[:num_final]

    async def _extract_candidate_frames(
        self,
        video_path: str,
        num_frames: int
    ) -> list[dict]:
        """Extract candidate frames using scene detection."""

        # Use ffmpeg scene detection to find key moments
        cmd = [
            "ffmpeg",
            "-i", video_path,
            "-vf", f"select='gt(scene,0.3)',showinfo",
            "-vsync", "vfr",
            "-f", "null",
            "-"
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        # Parse scene change timestamps
        timestamps = self._parse_scene_timestamps(result.stderr)

        # Sample evenly if too many scenes
        if len(timestamps) > num_frames:
            step = len(timestamps) // num_frames
            timestamps = timestamps[::step][:num_frames]

        # Extract frames at timestamps
        frames = []
        for i, ts in enumerate(timestamps):
            frame_path = f"/tmp/thumb_candidate_{i}.jpg"
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(ts),
                "-i", video_path,
                "-frames:v", "1",
                "-q:v", "2",
                frame_path
            ]
            subprocess.run(cmd, check=True)
            frames.append({"path": frame_path, "timestamp": ts})

        return frames

    async def _score_thumbnail(self, frame_path: str) -> dict:
        """Score a frame for thumbnail potential using GPT-4o."""

        import base64

        with open(frame_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode()

        response = await self.openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": f"{self.THUMBNAIL_CRITERIA}\n\nScore this frame 0-10 on each criterion and overall."},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}}
                    ]
                }
            ],
            response_format={"type": "json_object"}
        )

        return json.loads(response.choices[0].message.content)
```

---

## Implementation Priority Matrix

| Phase | Feature | Impact | Effort | Priority |
|-------|---------|--------|--------|----------|
| 5 | Scene Importance Scoring | High | Medium | P1 |
| 5 | Dialogue Selection AI | High | Medium | P1 |
| 5 | Beat-Sync Editing | High | Medium | P1 |
| 6 | Clip Transitions | High | Low | P0 |
| 6 | Speed Ramping | Medium | Medium | P2 |
| 6 | Flash Frames | Low | Low | P3 |
| 7 | Logo Watermark | Medium | Low | P1 |
| 7 | End Card Templates | High | Medium | P1 |
| 7 | Custom Fonts | Medium | Low | P2 |
| 8 | Preview Workflow | High | Medium | P1 |
| 8 | Multi-Version Generation | High | High | P1 |
| 8 | Export Presets | High | Low | P0 |
| 8 | Subtitle Burn-In | Medium | Low | P2 |
| 9 | Thumbnail AI Selection | Medium | Medium | P2 |

---

## Recommended Implementation Order

### Sprint 1: Core Polish (2 weeks)
- [ ] Clip transitions (crossfade, dip-to-black)
- [ ] Export presets (YouTube, Instagram, TikTok)
- [ ] Logo watermark system

### Sprint 2: AI Intelligence (2 weeks)
- [ ] Scene importance scoring
- [ ] Dialogue selection AI
- [ ] Beat-sync editing

### Sprint 3: Professional Workflow (2 weeks)
- [ ] Preview workflow with watermarks
- [ ] End card templates
- [ ] Multi-version generation (TV spots)

### Sprint 4: Advanced Effects (2 weeks)
- [ ] Speed ramping with easing
- [ ] Custom font system
- [ ] Subtitle burn-in

### Sprint 5: Finishing Touches (1 week)
- [ ] Flash frames
- [ ] Thumbnail AI selection
- [ ] Broadcast export presets

---

## Success Metrics (Updated)

| Metric | Current | Phase 4 | Target (Full Plan) |
|--------|---------|---------|-------------------|
| Viewer engagement | ~40% | ~60% | 85%+ |
| Professional quality rating | 2/5 | 3.5/5 | 4.8/5 |
| Multi-platform delivery | 1 format | 3 formats | 8+ formats |
| Version generation | Manual | Manual | Automated |
| Approval turnaround | N/A | N/A | < 24 hours |
| International support | None | None | 10+ languages |

---

## Technical Dependencies

### New Python Packages
```python
# requirements.txt additions
librosa>=0.10.0        # Beat detection
Pillow>=10.0.0         # Image processing (already added)
pydub>=0.25.0          # Audio manipulation
fonttools>=4.40.0      # Font management
```

### Modal Container Updates
```python
# modal/app.py - Additional dependencies

image = image.apt_install(
    "libsndfile1",      # For librosa
    "fontconfig",       # Font management
).run_commands(
    # Install additional Google Fonts
    "mkdir -p /usr/share/fonts/truetype/custom",
    "wget -qO- 'https://fonts.google.com/download?family=Oswald' | unzip -d /usr/share/fonts/truetype/custom -",
    "wget -qO- 'https://fonts.google.com/download?family=Anton' | unzip -d /usr/share/fonts/truetype/custom -",
    "fc-cache -fv",
)
```

### API Requirements
- OpenAI GPT-4o (existing) - Scene analysis, dialogue selection
- ElevenLabs (existing) - Music and SFX
- No new external APIs required

---

## Risk Mitigation (Updated)

| Risk | Mitigation |
|------|------------|
| Beat detection accuracy | Fallback to fixed grid timing; manual override |
| Version generation quality | AI scoring + human approval workflow |
| Font licensing | Stick to Google Fonts (OFL license) |
| Export format compatibility | Extensive testing per platform |
| Processing time increase | Parallel processing; preview-first workflow |
| Storage costs | Smart caching; expiring previews |

---

## Next Steps

1. **Immediate**: Implement clip transitions (crossfade, dip-to-black)
2. **This week**: Add export presets for major platforms
3. **Next sprint**: Begin AI intelligence features (scene scoring)
4. **Architecture**: Design version management schema
5. **Testing**: Create test suite for export format compliance
