# Modal Clip Generation Enhancement Plan

## Executive Summary

This plan outlines a comprehensive enhancement to the Modal clip generation system to:
1. **Match** clip-gold-main capabilities
2. **Enhance** user controls for more desirable clip outputs
3. **Fix** thumbnail generation to capture in correct aspect ratio
4. **Exceed** clip-gold-main with advanced features

**Timeline**: 8 sprints (flexible pacing)
**Priority Focus**: User controls, thumbnail fix, video clipper enhancements

---

## Implementation Status

| Phase | Status | Completion Date |
|-------|--------|-----------------|
| Phase 1: User Controls | COMPLETE | Dec 2024 |
| Phase 2: Match clip-gold-main | COMPLETE | Dec 2024 |
| Phase 3: Exceed clip-gold-main | COMPLETE | Dec 2024 |

### Phase 3 Implementation Details

**3.1 Smart Speaker Detection** (`modal/services/speaker_detector.py`)
- Audio amplitude analysis to detect speech segments
- Face movement correlation for multi-speaker videos
- Speaker timeline generation for podcast/interview content
- Conversation analysis (monologue/dialogue/debate detection)

**3.2 Smart Thumbnail Selection** (`modal/services/video_clipper.py`)
- Multi-frame sampling (5 frames by default)
- Scoring algorithm (100 points max):
  - Face visibility: 30 points
  - Sharpness (Laplacian variance): 25 points
  - Brightness (optimal 100-160): 25 points
  - Visual interest (edge density): 20 points
- `create_clip_with_smart_thumbnail()` method for integrated usage

**3.3 AI Layout Auto-Detection** (`modal/services/clip_analyzer.py`)
- GPT-4o Vision analysis of video frames
- Automatic detection of: gaming, podcast, standard layouts
- Feature detection: num_people, has_gameplay, has_facecam, content_type
- Confidence scoring for layout recommendations

---

## Current State Analysis

### Existing User Controls (ClipGeneratorModal.tsx)

| Control | Current Options | Customizable? |
|---------|----------------|---------------|
| Clip Count | 3, 5, 8, 10 | Yes |
| Layout | meme, standard, gaming, podcast | Yes |
| Caption Color | 00FFFF (cyan) | No - hardcoded |
| Font Family | Arial | No - hardcoded |
| Font Scale | 1.0 | No - hardcoded |
| Caption Position | bottom | No - hardcoded |
| Aspect Ratio | 9:16 only | No - hardcoded |
| Min Clip Duration | 15s | No - hardcoded |
| Max Clip Duration | 60s | No - hardcoded |
| Clip Tone/Style | "viral" | No - hardcoded |

### Current Issues

1. **Thumbnails**: Auto-generated from source video (often 16:9), displayed stretched/distorted in 9:16 containers
2. **Limited User Controls**: Cannot customize captions, duration, aspect ratio, or tone
3. **Basic Video Clipper**: Missing dynamic layout switching, face tracking, boundary refinement
4. **No Caching**: Re-downloads and re-transcribes same videos every time

---

## Phase 1: Critical Fixes & User-Requested Controls

### 1.1 Thumbnail Fix - Auto-Capture in Correct Format
**Priority: CRITICAL | Effort: MEDIUM | Impact: HIGH**

**Current Problem:**
- Thumbnails extracted from SOURCE video (16:9)
- Clips output in 9:16 format
- Thumbnails displayed stretched/distorted

**Solution: Generate thumbnail from OUTPUT clip's first frame**

**File: `modal/services/video_clipper.py`**

```python
async def create_clip(self, ...) -> Dict[str, Any]:
    """Create clip and auto-generate thumbnail in correct format."""

    # 1. Create the clip video (in target aspect ratio)
    clip_path = await self._create_clip_video(...)

    # 2. Extract first frame from OUTPUT clip (not source)
    thumbnail_path = await self._generate_thumbnail_from_clip(clip_path)

    # 3. Upload thumbnail to R2
    thumbnail_url = await self._upload_thumbnail(thumbnail_path, job_id, clip_index)

    return {
        "output_path": clip_path,
        "thumbnail_path": thumbnail_path,
        "thumbnail_url": thumbnail_url,
    }

async def _generate_thumbnail_from_clip(
    self,
    clip_path: str,
    output_path: str = None,
) -> str:
    """
    Extract thumbnail from the FIRST FRAME of the generated clip.

    Since the clip is already in the target aspect ratio (9:16, 16:9, or 1:1),
    the thumbnail will match the clip format exactly.
    """
    if output_path is None:
        output_path = clip_path.replace(".mp4", "_thumb.jpg")

    cmd = [
        "ffmpeg", "-y",
        "-i", clip_path,
        "-vframes", "1",           # First frame only
        "-q:v", "2",               # High quality JPEG
        output_path
    ]

    await self._run_command(cmd)
    return output_path
```

**Changes Required:**
- `modal/services/video_clipper.py`: Add `_generate_thumbnail_from_clip()` method
- `modal/app.py`: Include `thumbnailUrl` in webhook payload
- `convex/clipGenerator.ts`: Store thumbnail URL correctly

---

### 1.2 Clip Duration Controls
**Priority: HIGH | Effort: MEDIUM | Impact: HIGH**

**Goal:** Let users control min/max clip duration

**Frontend Changes: `src/components/actor/ClipGeneratorModal.tsx`**

```typescript
// New state
const [minDuration, setMinDuration] = useState(15);
const [maxDuration, setMaxDuration] = useState(60);

// Duration presets
const DURATION_PRESETS = [
  { label: "Quick Hits (5-15s)", min: 5, max: 15, description: "Perfect for TikTok hooks" },
  { label: "Short (15-30s)", min: 15, max: 30, description: "Ideal for Reels & Shorts" },
  { label: "Standard (15-60s)", min: 15, max: 60, description: "Flexible length for any platform" },
  { label: "Extended (30-90s)", min: 30, max: 90, description: "More context, deeper content" },
  { label: "Custom", min: null, max: null, description: "Set your own range" },
];
```

**New Component: `src/components/actor/DurationSelector.tsx`**

```typescript
interface DurationSelectorProps {
  minDuration: number;
  maxDuration: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
}

// UI includes:
// - Preset buttons (Quick Hits, Short, Standard, Extended, Custom)
// - Min duration slider (5-120s)
// - Max duration slider (5-180s)
// - Validation: max > min
```

**Schema Changes: `convex/schema.ts`**

```typescript
// Add to processing_jobs table
minClipDuration: v.optional(v.number()),  // 5-300 seconds
maxClipDuration: v.optional(v.number()),  // 5-300 seconds
```

**Modal Changes: `modal/app.py`**

```python
async def process_video(
    ...
    min_duration: int = 15,  # NEW
    max_duration: int = 60,  # NEW
):
    # Pass to clip analyzer
    clips = await analyzer.analyze(
        ...,
        min_duration=min_duration,
        max_duration=max_duration,
    )
```

---

### 1.3 Caption Style Controls
**Priority: HIGH | Effort: MEDIUM | Impact: HIGH**

**Goal:** Let users customize caption appearance

**New Component: `src/components/actor/CaptionStylePicker.tsx`**

```typescript
interface CaptionStyle {
  highlightColor: string;      // Hex color for highlighted word
  fontFamily: string;          // Font name
  fontSize: "small" | "medium" | "large";
  position: "top" | "center" | "bottom";
  style: "word-highlight" | "karaoke" | "static";
  outline: boolean;
  shadow: boolean;
}

// Preset themes
const CAPTION_THEMES = {
  viral_yellow: {
    highlightColor: "00FFFF",  // Cyan/Yellow in BGR
    fontFamily: "Impact",
    fontSize: "large",
    position: "center",
    style: "word-highlight",
    outline: true,
    shadow: true,
  },
  clean_white: {
    highlightColor: "FFFFFF",
    fontFamily: "Arial",
    fontSize: "medium",
    position: "bottom",
    style: "word-highlight",
    outline: true,
    shadow: false,
  },
  bold_red: {
    highlightColor: "0000FF",  // Red in BGR
    fontFamily: "Impact",
    fontSize: "large",
    position: "center",
    style: "word-highlight",
    outline: true,
    shadow: true,
  },
  gaming_green: {
    highlightColor: "00FF00",  // Green
    fontFamily: "Bebas Neue",
    fontSize: "large",
    position: "bottom",
    style: "word-highlight",
    outline: true,
    shadow: true,
  },
  podcast_coral: {
    highlightColor: "5050FF",  // Coral in BGR
    fontFamily: "Montserrat",
    fontSize: "medium",
    position: "center",
    style: "word-highlight",
    outline: true,
    shadow: false,
  },
  minimal: {
    highlightColor: "AAAAAA",  // Light gray
    fontFamily: "Arial",
    fontSize: "small",
    position: "bottom",
    style: "static",
    outline: false,
    shadow: false,
  },
};

// Component features:
// - Theme preset gallery with live preview
// - Custom color picker (with color wheel)
// - Font family dropdown with preview
// - Font size buttons (S/M/L)
// - Position selector (visual diagram)
// - Style type radio buttons
// - Outline/shadow toggles
// - Live preview on sample text animation
```

**Schema Changes: `convex/schema.ts`**

```typescript
// Add to processing_jobs table
captionStyle: v.optional(v.object({
  highlightColor: v.string(),
  fontFamily: v.string(),
  fontSize: v.string(),
  position: v.string(),
  style: v.string(),
  outline: v.boolean(),
  shadow: v.boolean(),
})),
```

**Modal Changes: `modal/services/caption_generator.py`**

```python
# Add font size mapping
FONT_SIZES = {
    "small": 48,
    "medium": 64,
    "large": 80,
}

# Add font family validation
SUPPORTED_FONTS = [
    "Arial",
    "Arial Black",
    "Impact",
    "Bebas Neue",
    "Montserrat",
    "Comic Sans MS",
    "Helvetica",
]

def generate(
    self,
    segments,
    clip_start,
    clip_end,
    caption_style: dict = None,  # Full style object
):
    style = caption_style or {}
    highlight_color = style.get("highlightColor", "00FFFF")
    font_family = style.get("fontFamily", "Arial Black")
    font_size = FONT_SIZES.get(style.get("fontSize", "medium"), 64)
    position = style.get("position", "center")
    # ... apply all styling
```

---

### 1.4 Aspect Ratio Selection
**Priority: HIGH | Effort: HIGH | Impact: HIGH**

**Goal:** Support 9:16 (vertical), 16:9 (horizontal), and 1:1 (square)

**New Component: `src/components/actor/AspectRatioSelector.tsx`**

```typescript
type AspectRatio = "9:16" | "16:9" | "1:1";

const ASPECT_RATIOS = {
  "9:16": {
    width: 1080,
    height: 1920,
    label: "Vertical",
    description: "TikTok, Reels, Shorts",
    icon: "=�",
  },
  "16:9": {
    width: 1920,
    height: 1080,
    label: "Horizontal",
    description: "YouTube, Twitter",
    icon: "=�",
  },
  "1:1": {
    width: 1080,
    height: 1080,
    label: "Square",
    description: "Instagram Feed",
    icon: "",
  },
};

// Component shows visual representation of each format
// with platform icons and recommended use cases
```

**Modal Changes: `modal/services/video_clipper.py`**

```python
class VideoClipper:
    ASPECT_CONFIGS = {
        "9:16": {"width": 1080, "height": 1920, "name": "vertical"},
        "16:9": {"width": 1920, "height": 1080, "name": "horizontal"},
        "1:1": {"width": 1080, "height": 1080, "name": "square"},
    }

    async def create_clip(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        aspect_ratio: str = "9:16",  # NEW PARAMETER
        ...
    ):
        config = self.ASPECT_CONFIGS[aspect_ratio]
        output_width = config["width"]
        output_height = config["height"]

        # Calculate crop based on aspect ratio
        crop = self._calculate_smart_crop(
            src_width, src_height,
            output_width, output_height,
            face_positions,
        )

def _calculate_smart_crop(
    self,
    src_width: int,
    src_height: int,
    target_width: int,
    target_height: int,
    face_positions: List[Dict] = None,
) -> Dict[str, int]:
    """
    Calculate crop region for target aspect ratio, centered on face if available.

    For 9:16 from 16:9: Crop sides (vertical strip from center)
    For 16:9 from 16:9: No crop or minimal adjustment
    For 1:1 from 16:9: Crop sides to square
    For 9:16 from 9:16: No crop needed
    """
    target_aspect = target_width / target_height
    src_aspect = src_width / src_height

    if src_aspect > target_aspect:
        # Source is wider - crop horizontally
        crop_width = int(src_height * target_aspect)
        crop_height = src_height
        # Center on face if available, otherwise center crop
        if face_positions:
            face_x = face_positions[0].get("x", 0.5) * src_width
            crop_x = int(max(0, min(src_width - crop_width, face_x - crop_width / 2)))
        else:
            crop_x = (src_width - crop_width) // 2
        crop_y = 0
    else:
        # Source is taller - crop vertically
        crop_width = src_width
        crop_height = int(src_width / target_aspect)
        crop_x = 0
        if face_positions:
            face_y = face_positions[0].get("y", 0.5) * src_height
            crop_y = int(max(0, min(src_height - crop_height, face_y - crop_height / 2)))
        else:
            crop_y = (src_height - crop_height) // 2

    return {"x": crop_x, "y": crop_y, "w": crop_width, "h": crop_height}
```

---

### 1.5 Tone/Style Selector
**Priority: MEDIUM | Effort: LOW | Impact: HIGH**

**Goal:** Let users choose the "vibe" of clips

**New Component: `src/components/actor/ToneSelector.tsx`**

```typescript
type ClipTone = "viral" | "educational" | "funny" | "dramatic" | "highlights" | "inspirational";

const TONE_OPTIONS = [
  {
    value: "viral",
    label: "Viral",
    icon: "=%",
    description: "Controversial, emotional, shareable moments",
    examples: ["Hot takes", "Surprising reveals", "Emotional reactions"],
  },
  {
    value: "educational",
    label: "Educational",
    icon: "=�",
    description: "Clear explanations, tips, insights",
    examples: ["How-to moments", "Expert advice", "Aha moments"],
  },
  {
    value: "funny",
    label: "Funny",
    icon: "=",
    description: "Comedy, jokes, funny reactions",
    examples: ["Punchlines", "Awkward moments", "Comedic timing"],
  },
  {
    value: "dramatic",
    label: "Dramatic",
    icon: "<�",
    description: "Intense moments, confrontations, revelations",
    examples: ["Plot twists", "Heated debates", "Emotional peaks"],
  },
  {
    value: "highlights",
    label: "Highlights",
    icon: "P",
    description: "Best moments, peak entertainment",
    examples: ["Quotable moments", "Key points", "Memorable scenes"],
  },
  {
    value: "inspirational",
    label: "Inspirational",
    icon: "(",
    description: "Motivational, uplifting content",
    examples: ["Life lessons", "Success stories", "Encouragement"],
  },
];
```

**Modal Changes: `modal/services/clip_analyzer.py`**

```python
TONE_PROMPTS = {
    "viral": """Find moments that will make people STOP scrolling:
        - Bold/controversial statements
        - Shocking revelations
        - Emotional outbursts
        - "I can't believe they said that" moments
        - Debate-worthy opinions""",

    "educational": """Find moments that teach or inform:
        - Clear "aha" explanations
        - Step-by-step tips
        - Myth-busting facts
        - Expert insights
        - "I wish I knew this earlier" moments""",

    "funny": """Find moments that make people laugh:
        - Perfect comedic timing
        - Unexpected punchlines
        - Relatable humor
        - Funny reactions
        - "I'm dying" moments""",

    "dramatic": """Find intense, gripping moments:
        - Confrontations
        - Emotional breakthroughs
        - Life-changing realizations
        - Heated debates
        - "Edge of your seat" moments""",

    "highlights": """Find the absolute BEST moments:
        - Most quotable lines
        - Peak entertainment value
        - Key takeaways
        - Memorable scenes
        - "This is the part everyone needs to see" moments""",

    "inspirational": """Find uplifting, motivating moments:
        - Life lessons
        - Encouragement
        - Success stories
        - Wisdom drops
        - "This changed my perspective" moments""",
}

async def analyze(
    self,
    segments,
    full_text,
    video_duration,
    num_clips=5,
    min_duration=15,
    max_duration=60,
    clip_tone="viral",  # NEW PARAMETER
):
    tone_guidance = TONE_PROMPTS.get(clip_tone, TONE_PROMPTS["viral"])

    # Include in analysis prompt
    prompt = CLIP_EXTRACTION_PROMPT.format(
        ...,
        tone_guidance=tone_guidance,
    )
```

---

## Phase 2: Match clip-gold-main Capabilities

### 2.1 Advanced Video Clipper
**Priority: HIGH | Effort: HIGH | Impact: HIGH**

**Goal:** Implement dynamic layout switching, face tracking, and multi-segment clips

**File: `modal/services/video_clipper.py` - Major Rewrite**

```python
class VideoClipper:
    """
    Advanced video clipper with:
    - Dynamic layout detection per segment
    - Face position tracking within clips
    - Multi-segment concatenation
    - Two-person split view
    - Gaming layout (40% face / 60% gameplay)
    """

    async def create_clip(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        segments: List[Dict],
        layout: str = "standard",
        aspect_ratio: str = "9:16",
        caption_style: Dict = None,
        dynamic_layout: bool = True,  # NEW: Enable dynamic switching
    ) -> Dict[str, Any]:
        """
        Create a clip with optional dynamic layout switching.

        If dynamic_layout=True:
        - Sample faces every 3 seconds
        - Detect layout changes (1 person � 2 people, etc.)
        - Create segments with different layouts
        - Concatenate into final clip
        """
        if dynamic_layout and layout in ["podcast", "standard"]:
            return await self._create_dynamic_layout_clip(...)
        elif layout == "gaming":
            return await self._create_gaming_layout_clip(...)
        else:
            return await self._create_simple_clip(...)

    async def _detect_layout_segments(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        sample_interval: float = 3.0,
    ) -> List[Dict]:
        """
        Sample faces at regular intervals to determine layout segments.

        Returns:
            [
                {"start": 0.0, "end": 6.0, "num_faces": 1, "faces": [...]},
                {"start": 6.0, "end": 12.0, "num_faces": 2, "faces": [...]},
                ...
            ]
        """
        segments = []
        current_time = start_time

        while current_time < end_time:
            segment_end = min(current_time + sample_interval, end_time)

            # Extract frame and detect faces
            frame = self.face_detector.extract_frame(video_path, current_time + 0.5)
            if frame is not None:
                faces = self.face_detector.detect_faces_dnn(frame)
                segments.append({
                    "start": current_time,
                    "end": segment_end,
                    "num_faces": len(faces),
                    "faces": faces[:2],  # Keep top 2 faces
                })

            current_time = segment_end

        return self._merge_layout_segments(segments)

    def _merge_layout_segments(
        self,
        segments: List[Dict],
    ) -> List[Dict]:
        """
        Merge consecutive segments with same layout type AND similar face positions.

        This prevents unnecessary transitions when:
        - Same number of faces throughout
        - Faces haven't moved significantly
        """
        if not segments:
            return []

        merged = [segments[0].copy()]

        for seg in segments[1:]:
            last = merged[-1]

            # Same layout type?
            same_layout = (last["num_faces"] >= 2) == (seg["num_faces"] >= 2)

            # Similar face positions?
            similar_positions = self._faces_similar_position(
                last["faces"], seg["faces"]
            )

            if same_layout and similar_positions:
                # Extend the last segment
                last["end"] = seg["end"]
            else:
                # New segment needed
                merged.append(seg.copy())

        return merged

    def _faces_similar_position(
        self,
        faces1: List[Dict],
        faces2: List[Dict],
        threshold: float = 0.15,
    ) -> bool:
        """
        Check if face positions are similar between two frames.
        Returns True if faces haven't moved much.
        """
        if not faces1 or not faces2:
            return len(faces1) == len(faces2)

        # Compare primary face positions
        f1, f2 = faces1[0], faces2[0]

        dist_x = abs(f1.get("x", 0.5) - f2.get("x", 0.5))
        dist_y = abs(f1.get("y", 0.5) - f2.get("y", 0.5))

        return (dist_x + dist_y) < threshold

    async def _create_dynamic_layout_clip(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        segments: List[Dict],
        caption_style: Dict,
        aspect_ratio: str,
    ) -> Dict[str, Any]:
        """
        Create clip with layout that changes based on detected faces.

        - If 1 face: zoom/focus on that person
        - If 2 faces: split view
        - Smooth transitions between layouts
        """
        # Detect layout segments
        layout_segments = await self._detect_layout_segments(
            video_path, start_time, end_time
        )

        # If only one segment type, use simple approach
        if len(layout_segments) == 1:
            seg = layout_segments[0]
            if seg["num_faces"] >= 2:
                return await self._create_two_person_clip(...)
            else:
                return await self._create_single_person_clip(...)

        # Multiple layout changes - create segments and concatenate
        temp_dir = tempfile.mkdtemp()
        segment_files = []

        try:
            for i, seg in enumerate(layout_segments):
                seg_output = os.path.join(temp_dir, f"segment_{i:03d}.mp4")

                if seg["num_faces"] >= 2:
                    await self._create_two_person_clip(
                        video_path, seg["start"], seg["end"],
                        segments, caption_style, aspect_ratio,
                        output_path=seg_output,
                        faces=seg["faces"],
                    )
                else:
                    await self._create_single_person_clip(
                        video_path, seg["start"], seg["end"],
                        segments, caption_style, aspect_ratio,
                        output_path=seg_output,
                        faces=seg["faces"],
                    )

                if os.path.exists(seg_output):
                    segment_files.append(seg_output)

            # Concatenate all segments
            final_path = await self._concatenate_segments(segment_files)

            # Generate thumbnail from final clip
            thumbnail_path = await self._generate_thumbnail_from_clip(final_path)

            return {
                "output_path": final_path,
                "thumbnail_path": thumbnail_path,
            }
        finally:
            shutil.rmtree(temp_dir)

    async def _create_two_person_clip(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        segments: List[Dict],
        caption_style: Dict,
        aspect_ratio: str,
        output_path: str,
        faces: List[Dict],
    ) -> str:
        """
        Create split-view clip for two people.

        Layout:
                         
           PERSON 1        <- Top 50%
           (zoomed)      
                         $
           PERSON 2        <- Bottom 50%
           (zoomed)      
          [CAPTIONS]     
                         
        """
        config = self.ASPECT_CONFIGS[aspect_ratio]
        output_w, output_h = config["width"], config["height"]
        panel_h = output_h // 2

        # Calculate crop for each face
        face1_crop = self._calculate_face_crop(faces[0], panel_h / output_w)
        face2_crop = self._calculate_face_crop(faces[1], panel_h / output_w)

        # Generate captions
        ass_content = self.caption_generator.generate(
            segments, start_time, end_time, caption_style
        )
        ass_path = self._write_ass_file(ass_content)

        # Build FFmpeg filter
        filter_complex = (
            f"[0:v]crop={face1_crop}[face1];"
            f"[0:v]crop={face2_crop}[face2];"
            f"[face1]scale={output_w}:{panel_h}[scaled1];"
            f"[face2]scale={output_w}:{panel_h}[scaled2];"
            f"[scaled1][scaled2]vstack=inputs=2[stacked];"
            f"[stacked]ass='{ass_path}'[v]"
        )

        await self._run_ffmpeg(video_path, start_time, end_time,
                               filter_complex, output_path)
        return output_path

    async def _create_gaming_layout_clip(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        segments: List[Dict],
        caption_style: Dict,
        aspect_ratio: str,
    ) -> Dict[str, Any]:
        """
        Create gaming layout: 40% face on top, 60% gameplay on bottom.

        Layout:
                         
           FACE/CAM        <- Top 40%
           (zoomed)      
                         $
                         
           GAMEPLAY        <- Bottom 60%
           (full width)  
          [CAPTIONS]     
                         
        """
        config = self.ASPECT_CONFIGS[aspect_ratio]
        output_w, output_h = config["width"], config["height"]

        face_panel_h = int(output_h * 0.40)
        game_panel_h = output_h - face_panel_h

        # Detect face for face panel
        frame = self.face_detector.extract_frame(video_path, start_time + 0.5)
        faces = self.face_detector.detect_faces_dnn(frame) if frame else []

        # Generate captions
        ass_content = self.caption_generator.generate(
            segments, start_time, end_time, caption_style
        )
        ass_path = self._write_ass_file(ass_content)

        if faces:
            face_crop = self._calculate_face_crop(faces[0], face_panel_h / output_w)
            face_filter = f"crop={face_crop},scale={output_w}:{face_panel_h}"
        else:
            # Fallback: top-left corner
            face_filter = f"crop=iw*0.35:ih*0.4:0:0,scale={output_w}:{face_panel_h}"

        # Gameplay: center crop from full frame
        game_filter = f"scale={output_w}:{game_panel_h}:force_original_aspect_ratio=decrease,pad={output_w}:{game_panel_h}:(ow-iw)/2:(oh-ih)/2"

        filter_complex = (
            f"[0:v]{face_filter}[face];"
            f"[0:v]{game_filter}[game];"
            f"[face][game]vstack=inputs=2[stacked];"
            f"[stacked]ass='{ass_path}'[v]"
        )

        output_path = self._get_output_path()
        await self._run_ffmpeg(video_path, start_time, end_time,
                               filter_complex, output_path)

        thumbnail_path = await self._generate_thumbnail_from_clip(output_path)

        return {
            "output_path": output_path,
            "thumbnail_path": thumbnail_path,
        }
```

---

### 2.2 Clip Boundary Refinement
**Priority: HIGH | Effort: LOW | Impact: HIGH**

**Goal:** Snap clip boundaries to sentence endings for cleaner cuts

**File: `modal/services/clip_analyzer.py`**

```python
def refine_clip_boundaries(
    self,
    clip: Dict,
    segments: List[Dict],
    min_duration: float = 5.0,
    max_duration: float = 60.0,
) -> Dict:
    """
    Adjust clip start/end to align with sentence boundaries.

    Goals:
    - Start at beginning of a sentence/segment
    - End at end of a sentence/segment
    - Avoid cutting mid-word
    - Maintain duration constraints
    """
    start_time = clip["start_time"]
    end_time = clip["end_time"]

    # Find segment containing start time
    start_segment = None
    for seg in segments:
        if seg["start"] <= start_time <= seg["end"]:
            start_segment = seg
            break

    # Find segment containing end time
    end_segment = None
    for seg in segments:
        if seg["start"] <= end_time <= seg["end"]:
            end_segment = seg
            break

    # Snap to segment boundaries
    if start_segment:
        # Start at segment beginning (cleaner entry)
        new_start = start_segment["start"]
    else:
        new_start = start_time

    if end_segment:
        # End at segment end (complete thought)
        new_end = end_segment["end"]
    else:
        new_end = end_time

    # Check duration constraints
    duration = new_end - new_start

    if duration < min_duration:
        # Extend to meet minimum
        new_end = new_start + min_duration
    elif duration > max_duration:
        # Trim from end, try to find earlier segment boundary
        target_end = new_start + max_duration
        for seg in reversed(segments):
            if seg["end"] <= target_end and seg["end"] > new_start + min_duration:
                new_end = seg["end"]
                break
        else:
            new_end = target_end

    return {
        **clip,
        "start_time": new_start,
        "end_time": new_end,
        "duration": new_end - new_start,
    }
```

---

### 2.3 Video Caching Service
**Priority: MEDIUM | Effort: MEDIUM | Impact: MEDIUM**

**Goal:** Cache downloaded videos and transcriptions to avoid re-processing

**New File: `modal/services/video_cache.py`**

```python
class VideoCache:
    """
    R2-based caching for downloaded videos and transcriptions.

    Cache Structure (R2):
        cache/{video_id}/
            metadata.json       # Video metadata, cached_at timestamp
            video.mp4           # Downloaded video
            transcription.json  # Whisper transcription with word timings

    Benefits:
    - Avoid re-downloading same YouTube video
    - Avoid re-transcribing (expensive Whisper API calls)
    - Speed up re-processing of popular videos
    """

    def __init__(self, r2_client, bucket_name: str):
        self.r2 = r2_client
        self.bucket = bucket_name
        self.cache_prefix = "cache"

    def _get_video_id(self, url: str) -> str:
        """Extract video ID from YouTube URL."""
        # Handle various YouTube URL formats
        patterns = [
            r'(?:v=|/)([0-9A-Za-z_-]{11}).*',
            r'(?:embed/)([0-9A-Za-z_-]{11})',
            r'(?:youtu\.be/)([0-9A-Za-z_-]{11})',
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        return hashlib.md5(url.encode()).hexdigest()[:16]

    def _cache_key(self, video_id: str, filename: str) -> str:
        return f"{self.cache_prefix}/{video_id}/{filename}"

    async def has_video(self, video_url: str) -> bool:
        """Check if video is cached."""
        video_id = self._get_video_id(video_url)
        key = self._cache_key(video_id, "video.mp4")
        return await self._key_exists(key)

    async def has_transcription(self, video_url: str) -> bool:
        """Check if transcription is cached."""
        video_id = self._get_video_id(video_url)
        key = self._cache_key(video_id, "transcription.json")
        return await self._key_exists(key)

    async def get_cached_video(self, video_url: str) -> Optional[str]:
        """
        Get cached video path (downloads from R2 to temp file).
        Returns None if not cached.
        """
        video_id = self._get_video_id(video_url)
        key = self._cache_key(video_id, "video.mp4")

        if not await self._key_exists(key):
            return None

        # Download to temp file
        temp_path = f"/tmp/cache_{video_id}.mp4"
        await self._download_file(key, temp_path)
        return temp_path

    async def get_cached_transcription(self, video_url: str) -> Optional[Dict]:
        """Get cached transcription data."""
        video_id = self._get_video_id(video_url)
        key = self._cache_key(video_id, "transcription.json")

        if not await self._key_exists(key):
            return None

        content = await self._get_object(key)
        return json.loads(content)

    async def save_video(
        self,
        video_url: str,
        video_path: str,
        metadata: Dict,
    ) -> str:
        """Cache a downloaded video."""
        video_id = self._get_video_id(video_url)

        # Upload video
        video_key = self._cache_key(video_id, "video.mp4")
        await self._upload_file(video_path, video_key)

        # Save metadata
        metadata_key = self._cache_key(video_id, "metadata.json")
        metadata["cached_at"] = datetime.now().isoformat()
        metadata["video_id"] = video_id
        await self._put_object(metadata_key, json.dumps(metadata))

        return video_key

    async def save_transcription(
        self,
        video_url: str,
        transcription: Dict,
    ) -> str:
        """Cache transcription data."""
        video_id = self._get_video_id(video_url)
        key = self._cache_key(video_id, "transcription.json")

        transcription["cached_at"] = datetime.now().isoformat()
        await self._put_object(key, json.dumps(transcription))

        return key

    async def clear_expired_cache(self, max_age_days: int = 30):
        """Remove cache entries older than max_age_days."""
        cutoff = datetime.now() - timedelta(days=max_age_days)

        # List all cache directories
        prefix = f"{self.cache_prefix}/"
        objects = await self._list_objects(prefix)

        for obj in objects:
            if "metadata.json" in obj["Key"]:
                metadata = json.loads(await self._get_object(obj["Key"]))
                cached_at = datetime.fromisoformat(metadata.get("cached_at", "2000-01-01"))

                if cached_at < cutoff:
                    video_id = obj["Key"].split("/")[1]
                    await self._delete_prefix(f"{self.cache_prefix}/{video_id}/")
```

**Integration in `modal/services/video_processor.py`**

```python
class R2VideoProcessor:
    def __init__(self, ...):
        ...
        self.cache = VideoCache(self.r2_client, self.bucket_name)

    async def process(self):
        # Check cache for transcription
        if await self.cache.has_transcription(self.video_url):
            print(f"Using cached transcription")
            transcription = await self.cache.get_cached_transcription(self.video_url)
        else:
            # Transcribe and cache
            transcription = await self._transcribe_video(video_path)
            await self.cache.save_transcription(self.video_url, transcription)
```

---

## Phase 3: Exceed clip-gold-main

### 3.1 Smart Speaker Detection
**Priority: HIGH | Effort: HIGH | Impact: HIGH**

**Goal:** Detect who is speaking and focus crop on active speaker

**New File: `modal/services/speaker_detector.py`**

```python
class SpeakerDetector:
    """
    Detect active speaker using audio analysis and face tracking.

    Methods:
    1. Audio amplitude analysis (simple)
    2. Audio-visual correlation (face movement during speech)
    3. Lip movement detection (future enhancement)
    """

    async def detect_active_speaker(
        self,
        video_path: str,
        faces: List[Dict],
        segments: List[Dict],
        start_time: float,
        end_time: float,
    ) -> List[Dict]:
        """
        For each time segment, determine which face is speaking.

        Returns:
            [
                {"start": 0.0, "end": 2.5, "speaker_idx": 0, "confidence": 0.8},
                {"start": 2.5, "end": 5.0, "speaker_idx": 1, "confidence": 0.9},
                ...
            ]
        """
        # Simple approach: Use audio segments to determine who's speaking
        # More advanced: Correlate face positions with audio timing

        speaker_segments = []

        for seg in segments:
            if seg["start"] < start_time or seg["end"] > end_time:
                continue

            # Extract frame at segment midpoint
            frame = self._extract_frame(video_path, (seg["start"] + seg["end"]) / 2)

            # Detect faces and their positions
            current_faces = self.face_detector.detect_faces_dnn(frame)

            # Match to known faces and determine active speaker
            # (In simple version, assume face closest to center is speaking)
            if current_faces:
                # Find face with most movement (likely speaking)
                speaker_idx = self._find_active_face(current_faces, faces)
                speaker_segments.append({
                    "start": seg["start"],
                    "end": seg["end"],
                    "speaker_idx": speaker_idx,
                    "confidence": 0.7,
                })

        return self._merge_speaker_segments(speaker_segments)
```

---

### 3.2 Smart Thumbnail Selection
**Priority: MEDIUM | Effort: MEDIUM | Impact: MEDIUM**

**Goal:** Choose best frame for thumbnail, not just first frame

**Enhancement to `modal/services/video_clipper.py`**

```python
async def _select_best_thumbnail_frame(
    self,
    video_path: str,
    num_samples: int = 5,
) -> str:
    """
    Analyze multiple frames and select the best one for thumbnail.

    Criteria:
    1. Face visible and well-lit (30 points)
    2. Not blurry - motion blur detection (25 points)
    3. Good composition (25 points)
    4. Visual interest (20 points)
    """
    # Get video duration
    duration = await self._get_video_duration(video_path)

    # Sample frames at even intervals
    sample_times = [duration * (i + 0.5) / num_samples for i in range(num_samples)]

    best_frame = None
    best_score = 0
    best_time = 0

    for ts in sample_times:
        frame = await self._extract_frame_at(video_path, ts)
        score = self._score_thumbnail_quality(frame)

        if score > best_score:
            best_score = score
            best_frame = frame
            best_time = ts

    # Save best frame as thumbnail
    thumbnail_path = video_path.replace(".mp4", "_thumb.jpg")
    cv2.imwrite(thumbnail_path, best_frame, [cv2.IMWRITE_JPEG_QUALITY, 90])

    return thumbnail_path

def _score_thumbnail_quality(self, frame: np.ndarray) -> float:
    """Score a frame's suitability as thumbnail (0-100)."""
    score = 0

    # 1. Face detection (30 points max)
    faces = self.face_detector.detect_faces_dnn(frame)
    if faces:
        # Bonus for faces, more for larger faces
        face_size = max(f["width"] * f["height"] for f in faces)
        score += min(30, face_size * 300)

    # 2. Sharpness - Laplacian variance (25 points max)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    sharpness_score = min(25, laplacian_var / 100)
    score += sharpness_score

    # 3. Brightness - prefer well-lit (25 points max)
    brightness = np.mean(frame)
    if 80 < brightness < 180:
        score += 25
    elif 60 < brightness < 200:
        score += 15
    else:
        score += 5

    # 4. Visual interest - edge density (20 points max)
    edges = cv2.Canny(gray, 50, 150)
    edge_density = np.sum(edges > 0) / edges.size
    score += min(20, edge_density * 200)

    return score
```

---

### 3.3 AI Layout Auto-Detection
**Priority: MEDIUM | Effort: MEDIUM | Impact: MEDIUM**

**Goal:** Automatically detect optimal layout based on video content

**Enhancement to `modal/services/clip_analyzer.py`**

```python
async def detect_optimal_layout(
    self,
    video_path: str,
    sample_times: List[float],
) -> str:
    """
    Use GPT-4o Vision to analyze video and suggest optimal layout.

    Returns: "gaming" | "podcast" | "standard"
    """
    # Extract sample frames
    frames_base64 = []
    for ts in sample_times[:3]:  # Limit to 3 frames
        frame = await self._extract_frame(video_path, ts)
        frames_base64.append(self._encode_frame_base64(frame))

    response = await self.client.chat.completions.create(
        model="gpt-4o",
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": LAYOUT_DETECTION_PROMPT},
                *[{"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{f}"}}
                  for f in frames_base64]
            ]
        }],
        response_format={"type": "json_object"},
        max_tokens=200,
    )

    result = json.loads(response.choices[0].message.content)
    return result.get("layout", "standard")

LAYOUT_DETECTION_PROMPT = """Analyze these video frames and determine the optimal layout.

Options:
- "gaming": Video shows gameplay with a facecam overlay (common in streams/Let's Plays)
- "podcast": Video shows 2+ people talking (interview, podcast, discussion)
- "standard": Single person talking to camera, or general content

Look for:
- Gaming UI, game graphics, facecam in corner � "gaming"
- Multiple people, split screen, interview setup � "podcast"
- Single speaker, vlog style, tutorials � "standard"

Return JSON: {"layout": "gaming|podcast|standard", "confidence": 0.0-1.0, "reason": "brief explanation"}
"""
```

---

## Implementation Timeline

### Sprint 1: Critical Fixes (Days 1-5)
| Task | File | Effort |
|------|------|--------|
| Thumbnail fix - capture from clip | video_clipper.py | 4h |
| Duration controls - frontend | DurationSelector.tsx | 4h |
| Duration controls - backend | app.py, clip_analyzer.py | 2h |
| Duration controls - schema | schema.ts, processing.ts | 2h |

### Sprint 2: Caption Controls (Days 6-10)
| Task | File | Effort |
|------|------|--------|
| Caption style picker - frontend | CaptionStylePicker.tsx | 8h |
| Caption style - theme presets | caption_generator.py | 4h |
| Caption style - backend integration | app.py | 2h |
| Caption style - schema | schema.ts | 1h |

### Sprint 3: Aspect Ratio & Tone (Days 11-15)
| Task | File | Effort |
|------|------|--------|
| Aspect ratio selector - frontend | AspectRatioSelector.tsx | 4h |
| Aspect ratio - clipper logic | video_clipper.py | 8h |
| Tone selector - frontend | ToneSelector.tsx | 4h |
| Tone prompts - backend | clip_analyzer.py | 4h |

### Sprint 4: Advanced Clipper Part 1 (Days 16-22)
| Task | File | Effort |
|------|------|--------|
| Dynamic layout detection | video_clipper.py | 8h |
| Face tracking per segment | video_clipper.py | 6h |
| Two-person split view | video_clipper.py | 6h |
| Single-person zoom | video_clipper.py | 4h |

### Sprint 5: Advanced Clipper Part 2 (Days 23-28)
| Task | File | Effort |
|------|------|--------|
| Gaming layout | video_clipper.py | 6h |
| Multi-segment concatenation | video_clipper.py | 4h |
| Clip boundary refinement | clip_analyzer.py | 4h |

### Sprint 6: Caching & Speaker Detection (Days 29-35)
| Task | File | Effort |
|------|------|--------|
| Video cache service | video_cache.py (new) | 8h |
| Cache integration | video_processor.py | 4h |
| Speaker detection | speaker_detector.py (new) | 12h |

### Sprint 7: Polish & Optimization (Days 36-42)
| Task | File | Effort |
|------|------|--------|
| Smart thumbnail selection | video_clipper.py | 6h |
| AI layout detection | clip_analyzer.py | 6h |
| Testing & bug fixes | all | 8h |

### Sprint 8: Documentation & Rollout (Days 43-49)
| Task | Effort |
|------|--------|
| API documentation | 4h |
| User guide updates | 4h |
| Feature flag setup | 2h |
| Gradual rollout | 8h |
| Monitoring setup | 4h |

---

## File Changes Summary

### New Files
```
modal/services/
   video_cache.py           # Phase 2.3
   speaker_detector.py      # Phase 3.1

src/components/actor/
   DurationSelector.tsx     # Phase 1.2
   CaptionStylePicker.tsx   # Phase 1.3
   AspectRatioSelector.tsx  # Phase 1.4
   ToneSelector.tsx         # Phase 1.5
```

### Major Modifications
```
modal/
   app.py                    # New parameters
   services/
      video_clipper.py      # MAJOR REWRITE
      clip_analyzer.py      # Boundary refinement, tone prompts
      caption_generator.py  # Extended styling
      face_detector.py      # Speaker detection support
      video_processor.py    # Cache integration

convex/
   schema.ts                 # New fields
   processing.ts             # New parameters
   clipGenerator.ts          # New parameters

src/components/actor/
   ClipGeneratorModal.tsx    # New controls integration
```

---

## Database Schema Additions

```typescript
// convex/schema.ts

// Add to processing_jobs table
minClipDuration: v.optional(v.number()),      // 5-300 seconds
maxClipDuration: v.optional(v.number()),      // 5-300 seconds
aspectRatio: v.optional(v.string()),          // "9:16", "16:9", "1:1"
clipTone: v.optional(v.string()),             // "viral", "educational", etc.
captionStyle: v.optional(v.object({
  highlightColor: v.string(),
  fontFamily: v.string(),
  fontSize: v.string(),
  position: v.string(),
  style: v.string(),
  outline: v.boolean(),
  shadow: v.boolean(),
})),

// Add to generated_clips table
aspectRatio: v.optional(v.string()),
qualityScore: v.optional(v.number()),
thumbnailGeneratedAt: v.optional(v.number()), // Timestamp
```

---

## Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Thumbnail aspect ratio match | ~0% | 100% | Visual QA |
| User control options | 2 | 8+ | Feature count |
| Supported aspect ratios | 1 | 3 | Feature count |
| Clip boundary accuracy | Basic | Sentence-aligned | Manual review |
| Dynamic layout switching | No | Yes | Feature flag |
| Cache hit rate | 0% | >30% | R2 metrics |
| Processing time (cached) | N/A | -40% | Timing logs |
| User satisfaction | Baseline | +20% | Surveys |

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Video clipper changes break existing clips | High | Feature flags, A/B testing |
| Caption styling renders incorrectly | Medium | Preview component, test suite |
| Cache storage costs increase | Low | TTL-based expiration, size limits |
| Complex layouts slow processing | Medium | Async processing, timeout handling |

---

## Appendix: FFmpeg Reference

### Aspect Ratio Crop Commands

**9:16 from 16:9:**
```bash
-vf "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920"
```

**16:9 pass-through:**
```bash
-vf "scale=1920:1080"
```

**1:1 from 16:9:**
```bash
-vf "crop=ih:ih:(iw-ih)/2:0,scale=1080:1080"
```

### Two-Person Split View
```bash
-filter_complex "
  [0:v]crop=w1:h1:x1:y1,scale=1080:960[top];
  [0:v]crop=w2:h2:x2:y2,scale=1080:960[bot];
  [top][bot]vstack=inputs=2[v]
"
```

### Gaming Layout (40/60 split)
```bash
-filter_complex "
  [0:v]crop=face_w:face_h:face_x:face_y,scale=1080:768[face];
  [0:v]scale=1080:1152:force_original_aspect_ratio=decrease[game];
  [face][game]vstack=inputs=2[v]
"
```
