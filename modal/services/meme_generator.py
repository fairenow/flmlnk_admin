"""
Meme Generator Service

AI-powered meme generation from video frames:
1. Extract frames at various timestamps using FFmpeg
2. Analyze frames with OpenAI Vision for meme potential
3. Select best frames based on emotion, action, memeability
4. Generate viral captions using GPT-4o with transcription context
5. Compose final meme images with text overlay (square format)
6. Upload memes and results to Convex
"""

import os
import asyncio
import base64
import json
import subprocess
import tempfile
import textwrap
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field

import httpx
from PIL import Image, ImageDraw, ImageFont, ImageFilter


# =============================================================================
# CONFIGURATION
# =============================================================================

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"

# Gemini fallback configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

# Frame extraction settings
DEFAULT_FRAME_COUNT = 12  # Number of frames to extract for analysis
MIN_MEMEABILITY_SCORE = 40  # Minimum score to consider a frame for memes

# Meme image composition settings
MEME_OUTPUT_SIZE = 1080  # Square meme output size (1080x1080 for Instagram)
MEME_FONT_SIZE_RATIO = 0.07  # Font size as ratio of image height
MEME_PADDING_RATIO = 0.03  # Padding from edges as ratio of image size
MEME_MAX_CHARS_PER_LINE = 18  # Max characters before wrapping (reduced from 25 to prevent overflow)


# =============================================================================
# MEME IMAGE COMPOSITION
# =============================================================================

def get_meme_font(size: int) -> ImageFont.FreeTypeFont:
    """
    Get a bold font suitable for meme text.
    Falls back through several options to find an available font.
    """
    # Try common bold/impact fonts in order of preference
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",  # macOS
        "C:/Windows/Fonts/impact.ttf",  # Windows
        "C:/Windows/Fonts/arialbd.ttf",  # Windows fallback
    ]

    for font_path in font_paths:
        try:
            return ImageFont.truetype(font_path, size)
        except (IOError, OSError):
            continue

    # Final fallback to default font
    try:
        return ImageFont.load_default()
    except Exception:
        return ImageFont.load_default()


def crop_to_square(image: Image.Image, focus_point: Optional[Tuple[float, float]] = None) -> Image.Image:
    """
    Crop an image to square format.

    Args:
        image: PIL Image to crop
        focus_point: Optional (x, y) as ratios (0-1) for the focal point.
                     If not provided, centers the crop.

    Returns:
        Square PIL Image
    """
    width, height = image.size

    if width == height:
        return image

    # Determine the size of the square (smaller dimension)
    size = min(width, height)

    if focus_point:
        # Crop around the focus point
        focus_x = int(width * focus_point[0])
        focus_y = int(height * focus_point[1])

        # Calculate crop box centered on focus point
        left = max(0, focus_x - size // 2)
        top = max(0, focus_y - size // 2)

        # Adjust if crop goes beyond image bounds
        if left + size > width:
            left = width - size
        if top + size > height:
            top = height - size
    else:
        # Center crop
        left = (width - size) // 2
        top = (height - size) // 2

    return image.crop((left, top, left + size, top + size))


def draw_text_with_outline(
    draw: ImageDraw.ImageDraw,
    position: Tuple[int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill_color: str = "white",
    outline_color: str = "black",
    outline_width: int = 3,
) -> None:
    """
    Draw text with an outline effect (classic meme style).
    """
    x, y = position

    # Draw outline by drawing text multiple times offset in each direction
    for dx in range(-outline_width, outline_width + 1):
        for dy in range(-outline_width, outline_width + 1):
            if dx != 0 or dy != 0:
                draw.text((x + dx, y + dy), text, font=font, fill=outline_color)

    # Draw the main text
    draw.text(position, text, font=font, fill=fill_color)


def compose_meme_image(
    frame_path: str,
    caption: str,
    caption_position: str = "bottom",
    output_path: Optional[str] = None,
    output_size: int = MEME_OUTPUT_SIZE,
) -> str:
    """
    Compose a meme image with text overlay.

    Args:
        frame_path: Path to the source frame image
        caption: The meme caption text
        caption_position: "top", "bottom", or "top_bottom" (for multi-line split)
        output_path: Optional output path. If not provided, generates one.
        output_size: Size of the square output image (default 1080x1080)

    Returns:
        Path to the composed meme image
    """
    # Load and process the image
    image = Image.open(frame_path).convert("RGB")

    # Crop to square
    image = crop_to_square(image)

    # Resize to output size
    image = image.resize((output_size, output_size), Image.Resampling.LANCZOS)

    # Calculate font size and padding
    font_size = int(output_size * MEME_FONT_SIZE_RATIO)
    padding = int(output_size * MEME_PADDING_RATIO)
    outline_width = max(2, font_size // 20)

    # Get font
    font = get_meme_font(font_size)

    # Create drawing context
    draw = ImageDraw.Draw(image)

    # Process caption text
    caption = caption.upper()  # Classic meme style uses uppercase

    # Handle different caption positions
    if caption_position == "top_bottom" and "\n" in caption:
        # Split text for top and bottom
        parts = caption.split("\n", 1)
        top_text = parts[0].strip()
        bottom_text = parts[1].strip() if len(parts) > 1 else ""

        # Draw top text
        if top_text:
            wrapped_top = textwrap.fill(top_text, width=MEME_MAX_CHARS_PER_LINE)
            _draw_meme_text(draw, wrapped_top, font, output_size, padding, outline_width, position="top")

        # Draw bottom text
        if bottom_text:
            wrapped_bottom = textwrap.fill(bottom_text, width=MEME_MAX_CHARS_PER_LINE)
            _draw_meme_text(draw, wrapped_bottom, font, output_size, padding, outline_width, position="bottom")

    elif caption_position == "top":
        wrapped = textwrap.fill(caption, width=MEME_MAX_CHARS_PER_LINE)
        _draw_meme_text(draw, wrapped, font, output_size, padding, outline_width, position="top")

    else:  # Default to bottom
        wrapped = textwrap.fill(caption, width=MEME_MAX_CHARS_PER_LINE)
        _draw_meme_text(draw, wrapped, font, output_size, padding, outline_width, position="bottom")

    # Determine output path
    if output_path is None:
        base, _ = os.path.splitext(frame_path)
        output_path = f"{base}_meme.jpg"

    # Save the meme
    image.save(output_path, "JPEG", quality=95)

    return output_path


def _draw_meme_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont,
    image_size: int,
    padding: int,
    outline_width: int,
    position: str = "bottom",
) -> None:
    """
    Draw meme text at the specified position (top or bottom).
    Ensures text never overflows image boundaries by truncating if needed.
    """
    lines = text.split("\n")

    # Maximum width available for text (accounting for padding and outline)
    max_text_width = image_size - (2 * padding) - (2 * outline_width)

    # Process lines to ensure they fit within image bounds
    processed_lines = []
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        text_width = bbox[2] - bbox[0]

        # If line is too wide, truncate it with ellipsis
        if text_width > max_text_width:
            # Binary search for the right truncation point
            truncated = line
            while text_width > max_text_width and len(truncated) > 3:
                truncated = truncated[:-1]
                test_text = truncated.rstrip() + "..."
                bbox = draw.textbbox((0, 0), test_text, font=font)
                text_width = bbox[2] - bbox[0]
            processed_lines.append(truncated.rstrip() + "..." if truncated != line else line)
        else:
            processed_lines.append(line)

    lines = processed_lines

    # Calculate total text height
    line_heights = []
    line_widths = []
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        line_widths.append(bbox[2] - bbox[0])
        line_heights.append(bbox[3] - bbox[1])

    line_height = max(line_heights) if line_heights else font.size
    total_height = line_height * len(lines) + (len(lines) - 1) * (line_height // 4)

    # Calculate starting Y position
    if position == "top":
        y = padding
    else:  # bottom
        y = image_size - padding - total_height

    # Draw each line centered, accounting for outline width to prevent clipping
    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font)
        text_width = bbox[2] - bbox[0]
        # Ensure outline doesn't get clipped on left or right edges
        available_width = image_size - 2 * outline_width
        x = outline_width + max(0, (available_width - text_width) // 2)

        draw_text_with_outline(
            draw,
            (x, y),
            line,
            font,
            fill_color="white",
            outline_color="black",
            outline_width=outline_width,
        )

        y += line_height + line_height // 4


# =============================================================================
# MEME TEMPLATES
# =============================================================================

MEME_TEMPLATES = {
    "reaction": {
        "name": "Reaction Meme",
        "description": "Strong facial expression or body language reactions to relatable situations",
        "requirements": {
            "emotions": ["happy", "shocked", "stressed", "anxious", "terrified", "smug", "disgusted", "confused"],
            "needs_expression": True,
            "frame_count": 1,
        },
        "caption_patterns": [
            "Me when...",
            "My face when...",
            "How I look when...",
            "POV: you just...",
            "Nobody: / Me:",
        ],
    },
    "before_after": {
        "name": "Expectation vs Reality / Before vs After",
        "description": "Two distinct frames showing change (happy -> shocked, clean -> messy)",
        "requirements": {
            "needs_multiple_frames": True,
            "frame_count": 2,
        },
        "caption_patterns": [
            "How it started / How it's going",
            "My plans / The group chat",
            "Expectation / Reality",
            "Before coffee / After coffee",
        ],
    },
    "internal_external": {
        "name": "Internal vs External / Brain vs Me",
        "description": "Frame representing internal dialogue (stressed, conflicted character)",
        "requirements": {
            "emotions": ["stressed", "conflicted", "tempted", "exhausted"],
            "needs_expression": True,
            "frame_count": 1,
        },
        "caption_patterns": [
            "My brain when...",
            "My liver watching me order another...",
            "My last brain cell...",
            "My anxiety vs my need to be liked",
        ],
    },
    "absurd_visual": {
        "name": "Absurd Visual + Relatable Caption",
        "description": "Any strange frame: odd angle, freeze-frame face, weird action",
        "requirements": {
            "frame_count": 1,
        },
        "caption_patterns": [
            "Day X of...",
            "Me trying to...",
            "When you accidentally...",
            "That one friend who...",
        ],
    },
    "character_voice": {
        "name": "Character Voice Meme",
        "description": "Recognizable character, outfit, or vibe from your film",
        "requirements": {
            "needs_expression": True,
            "frame_count": 1,
        },
        "caption_patterns": [
            "[Character name] energy",
            "POV: [Character name] is your...",
            "When [Character name] said '...' I felt that",
        ],
    },
    "fake_tutorial": {
        "name": "Fake Tutorial / Presentation Meme",
        "description": "Shot of someone explaining, pointing, teaching",
        "requirements": {
            "actions": ["explaining", "pointing", "teaching", "presenting"],
            "frame_count": 1,
        },
        "caption_patterns": [
            "How to [do something you absolutely should not do]",
            "Step 1: [terrible advice]",
            "Me explaining why...",
        ],
    },
    "forbidden": {
        "name": "Forbidden / Don't Touch Meme",
        "description": "A character clearly about to do something they shouldn't",
        "requirements": {
            "actions": ["reaching", "sneaking", "tempted"],
            "frame_count": 1,
        },
        "caption_patterns": [
            "They told me not to X / Me: ...",
            "The forbidden [object]",
            "Me: I won't / Also me:",
        ],
    },
}


@dataclass
class FrameAnalysis:
    """Analysis result for a single frame."""
    timestamp: float
    frame_path: str
    emotion: str
    emotion_confidence: float
    action: str
    action_confidence: float
    has_faces: bool
    face_count: int
    scene_description: str
    potential_templates: List[str]
    memeability: int  # 0-100


@dataclass
class GeneratedMeme:
    """A generated meme with frame and caption."""
    template_type: str
    template_name: str
    frame_path: str
    frame_timestamp: float
    frame_url: Optional[str]
    frame_storage_id: Optional[str]
    caption: str
    caption_position: str
    viral_score: int
    sentiment: str
    suggested_hashtags: List[str]
    ai_reasoning: str
    # Frame analysis data
    emotion: Optional[str] = None
    action: Optional[str] = None
    has_faces: Optional[bool] = None
    face_count: Optional[int] = None


@dataclass
class MemeGenerationResult:
    """Result of meme generation job."""
    success: bool
    job_id: str
    memes: List[Dict[str, Any]] = field(default_factory=list)
    candidate_frames: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None
    video_title: Optional[str] = None
    video_duration: Optional[float] = None


class MemeGenerator:
    """
    AI-powered meme generator from video frames.

    Pipeline:
    1. Extract frames from video at various timestamps
    2. Analyze each frame with OpenAI Vision
    3. Match frames to meme templates
    4. Generate viral captions using GPT-4o
    5. Compose final meme images (square 1080x1080 with text overlay)
    6. Upload composed memes to Convex
    """

    def __init__(
        self,
        job_id: str,
        webhook_url: Optional[str] = None,
        webhook_secret: Optional[str] = None,
        temp_dir: str = "/tmp/meme_processing",
    ):
        self.job_id = job_id
        self.webhook_url = webhook_url
        self.webhook_secret = webhook_secret
        self.temp_dir = temp_dir
        self.job_dir = os.path.join(temp_dir, job_id)

        # Create job directory
        os.makedirs(self.job_dir, exist_ok=True)

        # HTTP client for webhooks
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _get_http_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=60.0)
        return self._http_client

    async def _send_webhook(
        self,
        endpoint: str,
        data: Dict[str, Any],
    ) -> bool:
        """Send webhook to Convex."""
        if not self.webhook_url:
            print(f"[Webhook] No webhook URL configured, skipping {endpoint}")
            return False

        try:
            client = await self._get_http_client()
            headers = {"Content-Type": "application/json"}
            if self.webhook_secret:
                headers["Authorization"] = f"Bearer {self.webhook_secret}"

            url = f"{self.webhook_url}{endpoint}"
            response = await client.post(
                url,
                json=data,
                headers=headers,
            )

            if response.status_code != 200:
                print(f"[Webhook] {endpoint} returned {response.status_code}: {response.text[:200]}")

            return response.status_code == 200
        except Exception as e:
            print(f"[Webhook] Error sending to {endpoint}: {e}")
            import traceback
            traceback.print_exc()
            return False

    async def _update_progress(
        self,
        status: str,
        progress: int,
        current_step: str,
        video_title: Optional[str] = None,
        video_duration: Optional[float] = None,
        error: Optional[str] = None,
    ):
        """Send progress update to Convex."""
        data = {
            "externalJobId": self.job_id,
            "status": status,
            "progress": progress,
            "currentStep": current_step,
        }
        if video_title:
            data["videoTitle"] = video_title
        if video_duration is not None:
            data["videoDuration"] = video_duration
        if error:
            data["error"] = error

        await self._send_webhook("/modal/meme-progress", data)

    async def _send_meme(self, meme_data: Dict[str, Any]):
        """Send a generated meme to Convex."""
        await self._send_webhook("/modal/meme", {
            "externalJobId": self.job_id,
            "meme": meme_data,
        })

    async def _send_candidate_frame(self, frame_data: Dict[str, Any]):
        """Send a candidate frame to Convex."""
        await self._send_webhook("/modal/meme-frame", {
            "externalJobId": self.job_id,
            "frame": frame_data,
        })

    async def _complete_job(self, success: bool, error: Optional[str] = None):
        """Mark job as complete."""
        await self._send_webhook("/modal/meme-complete", {
            "externalJobId": self.job_id,
            "success": success,
            "error": error,
        })

    def extract_frames(
        self,
        video_path: str,
        timestamps: List[float],
    ) -> List[Dict[str, Any]]:
        """
        Extract frames from video at specified timestamps using FFmpeg.

        Returns list of {timestamp, path} dicts.
        """
        frames = []

        for ts in timestamps:
            output_path = os.path.join(self.job_dir, f"frame_{ts:.2f}.jpg")

            try:
                cmd = [
                    'ffmpeg', '-y',
                    '-ss', str(ts),
                    '-i', video_path,
                    '-vframes', '1',
                    '-q:v', '2',  # High quality JPEG
                    output_path
                ]
                result = subprocess.run(cmd, capture_output=True, timeout=30)

                if result.returncode == 0 and os.path.exists(output_path):
                    frames.append({
                        "timestamp": ts,
                        "path": output_path,
                    })
                else:
                    print(f"Failed to extract frame at {ts}s: {result.stderr.decode()}")
            except Exception as e:
                print(f"Frame extraction error at {ts}s: {e}")

        return frames

    def get_smart_timestamps(
        self,
        video_duration: float,
        frame_count: int = DEFAULT_FRAME_COUNT,
    ) -> List[float]:
        """
        Generate smart timestamps for frame extraction.

        Strategy:
        - Skip first 5 seconds (usually logos/intros)
        - Skip last 5 seconds (usually outros)
        - Distribute frames evenly across video
        - Add extra samples at key moments (1/3, 1/2, 2/3)
        """
        if video_duration < 15:
            # Short video - sample more densely
            interval = max(1, video_duration / frame_count)
            return [i * interval for i in range(min(frame_count, int(video_duration)))]

        start = 5.0  # Skip first 5 seconds
        end = max(start + 5, video_duration - 5)  # Leave 5 seconds at end
        effective_duration = end - start

        # Calculate interval
        interval = effective_duration / (frame_count - 1)

        timestamps = []
        for i in range(frame_count):
            ts = start + (i * interval)
            timestamps.append(round(ts, 2))

        # Add key moments if not already included
        key_moments = [
            video_duration * 0.25,
            video_duration * 0.33,
            video_duration * 0.5,
            video_duration * 0.67,
            video_duration * 0.75,
        ]

        for moment in key_moments:
            if start < moment < end:
                # Check if close to existing timestamp
                if not any(abs(ts - moment) < 2 for ts in timestamps):
                    timestamps.append(round(moment, 2))

        return sorted(set(timestamps))

    async def analyze_frame(
        self,
        frame_path: str,
        timestamp: float,
        movie_context: Optional[Dict[str, str]] = None,
    ) -> FrameAnalysis:
        """
        Analyze a frame using OpenAI Vision for meme potential.
        """
        if not OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not configured")

        # Read and encode frame
        with open(frame_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")

        context_prompt = ""
        if movie_context:
            context_prompt = f"\n\nContext: This frame is from \"{movie_context.get('title', 'a film')}\". {movie_context.get('logline', '')} Genre: {movie_context.get('genre', 'Unknown')}"

        client = await self._get_http_client()

        response = await client.post(
            OPENAI_API_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENAI_API_KEY}",
            },
            json={
                "model": "gpt-4o",
                "messages": [
                    {
                        "role": "system",
                        "content": """You are a meme expert analyzing video frames for meme potential. Analyze the image and return a JSON object with:
- emotion: The primary emotion displayed (happy, shocked, stressed, anxious, terrified, smug, disgusted, confused, angry, sad, excited, bored, neutral, etc.)
- emotionConfidence: 0-1 confidence score
- action: What action is happening (arguing, sneaking, falling, running, explaining, pointing, reaching, eating, sleeping, standing, sitting, walking, talking, fighting, etc.)
- actionConfidence: 0-1 confidence score
- hasFaces: boolean - are there visible faces?
- faceCount: number of faces visible
- sceneDescription: Brief description of what's happening in the scene (1-2 sentences)
- potentialTemplates: Array of template types this frame could work with: ["reaction", "before_after", "internal_external", "absurd_visual", "character_voice", "fake_tutorial", "forbidden"]
- memeability: 0-100 score of how good this frame would be for memes (consider expression clarity, composition, relatability, uniqueness)

Consider:
- Clear facial expressions score higher
- Dramatic or exaggerated moments are more memeable
- Unusual angles or compositions can be great for absurd memes
- Actions that are relatable (eating, sleeping, stressed) score well

Return ONLY valid JSON, no markdown code blocks.""",
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": f"Analyze this frame for meme potential.{context_prompt}",
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_data}",
                                    "detail": "high",
                                },
                            },
                        ],
                    },
                ],
                "max_tokens": 500,
                "temperature": 0.3,
            },
            timeout=60.0,
        )

        if response.status_code != 200:
            raise Exception(f"OpenAI API error: {response.status_code} - {response.text}")

        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content")

        # Check for None or empty content
        if not content:
            print(f"OpenAI returned empty content for frame analysis: {data}")
            return FrameAnalysis(
                timestamp=timestamp,
                frame_path=frame_path,
                emotion="neutral",
                emotion_confidence=0.5,
                action="unknown",
                action_confidence=0.5,
                has_faces=False,
                face_count=0,
                scene_description="OpenAI returned empty response",
                potential_templates=["absurd_visual"],
                memeability=30,
            )

        try:
            # Clean up response in case it has markdown
            cleaned = content.replace("```json", "").replace("```", "").strip()
            result = json.loads(cleaned)

            return FrameAnalysis(
                timestamp=timestamp,
                frame_path=frame_path,
                emotion=result.get("emotion", "neutral"),
                emotion_confidence=result.get("emotionConfidence", 0.5),
                action=result.get("action", "unknown"),
                action_confidence=result.get("actionConfidence", 0.5),
                has_faces=result.get("hasFaces", False),
                face_count=result.get("faceCount", 0),
                scene_description=result.get("sceneDescription", ""),
                potential_templates=result.get("potentialTemplates", ["absurd_visual"]),
                memeability=result.get("memeability", 30),
            )
        except json.JSONDecodeError:
            print(f"Failed to parse frame analysis: {content}")
            return FrameAnalysis(
                timestamp=timestamp,
                frame_path=frame_path,
                emotion="neutral",
                emotion_confidence=0.5,
                action="unknown",
                action_confidence=0.5,
                has_faces=False,
                face_count=0,
                scene_description="Unable to analyze frame",
                potential_templates=["absurd_visual"],
                memeability=30,
            )

    async def generate_caption(
        self,
        frame_path: str,
        frame_analysis: FrameAnalysis,
        template_type: str,
        movie_context: Optional[Dict[str, str]] = None,
        transcript_context: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate a viral meme caption for a frame.
        """
        if not OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not configured")

        template = MEME_TEMPLATES.get(template_type)
        if not template:
            raise ValueError(f"Unknown template type: {template_type}")

        # Read and encode frame
        with open(frame_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")

        context_prompt = ""
        if movie_context:
            context_prompt = f"\n\nMovie Context:\n- Title: {movie_context.get('title', 'Unknown')}\n- Logline: {movie_context.get('logline', 'Not provided')}\n- Genre: {movie_context.get('genre', 'Unknown')}"

        transcript_prompt = ""
        if transcript_context:
            # Truncate if too long
            transcript_prompt = f"\n\nRelevant dialogue/transcript:\n{transcript_context[:500]}"

        client = await self._get_http_client()

        response = await client.post(
            OPENAI_API_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENAI_API_KEY}",
            },
            json={
                "model": "gpt-4o",
                "messages": [
                    {
                        "role": "system",
                        "content": f"""You are a viral meme caption generator. Create captions that are:
- Highly relatable to internet users
- Funny without being offensive
- Using current meme language and formats
- Perfect for social media sharing

Template: {template['name']}
Description: {template['description']}
Caption Patterns to follow: {', '.join(template['caption_patterns'])}

Frame Analysis:
- Detected Emotion: {frame_analysis.emotion} ({round(frame_analysis.emotion_confidence * 100)}% confidence)
- Detected Action: {frame_analysis.action} ({round(frame_analysis.action_confidence * 100)}% confidence)
- Scene: {frame_analysis.scene_description}
- Faces: {frame_analysis.face_count} detected

Return a JSON object with:
- caption: The meme caption text (can include line breaks with \\n for multi-part memes)
- captionPosition: "top", "bottom", or "top_bottom" for where text should go
- viralScore: 0-100 predicted virality score
- sentiment: "funny", "relatable", "absurd", "wholesome", "sarcastic", etc.
- suggestedHashtags: Array of 3-5 relevant hashtags (without #)
- reasoning: Brief explanation of why this caption works (1-2 sentences)

Return ONLY valid JSON, no markdown code blocks.""",
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": f"Generate a viral meme caption for this frame.{context_prompt}{transcript_prompt}",
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_data}",
                                    "detail": "high",
                                },
                            },
                        ],
                    },
                ],
                "max_tokens": 400,
                "temperature": 0.8,  # Higher for creative captions
            },
            timeout=60.0,
        )

        if response.status_code != 200:
            raise Exception(f"OpenAI API error: {response.status_code} - {response.text}")

        data = response.json()
        message = data.get("choices", [{}])[0].get("message", {})
        content = message.get("content")
        refusal = message.get("refusal")

        # Check for OpenAI content moderation refusal
        if refusal:
            raise Exception(f"OpenAI refused to generate caption: {refusal}")

        # Check for None or empty content
        if not content:
            raise Exception(f"OpenAI returned empty content for caption generation")

        try:
            cleaned = content.replace("```json", "").replace("```", "").strip()
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            raise Exception(f"Failed to parse caption JSON: {e}")

    async def upload_frame_to_convex(
        self,
        frame_path: str,
    ) -> Dict[str, Any]:
        """
        Upload a frame to Convex storage.

        Returns {storageId, url} on success.
        """
        if not self.webhook_url:
            return {}

        try:
            client = await self._get_http_client()

            # First, get upload URL from Convex
            headers = {"Content-Type": "application/json"}
            if self.webhook_secret:
                headers["Authorization"] = f"Bearer {self.webhook_secret}"

            response = await client.post(
                f"{self.webhook_url}/modal/upload-url",
                json={"contentType": "image/jpeg"},
                headers=headers,
            )

            if response.status_code != 200:
                print(f"Failed to get upload URL: {response.status_code}")
                return {}

            upload_data = response.json()
            upload_url = upload_data.get("uploadUrl")

            if not upload_url:
                return {}

            # Upload the file
            with open(frame_path, "rb") as f:
                file_data = f.read()

            upload_response = await client.post(
                upload_url,
                content=file_data,
                headers={"Content-Type": "image/jpeg"},
            )

            if upload_response.status_code != 200:
                print(f"Failed to upload frame: {upload_response.status_code}")
                return {}

            result = upload_response.json()
            storage_id = result.get("storageId")

            if not storage_id:
                print("Upload succeeded but no storageId returned")
                return {}

            # Fetch the public URL for the uploaded file
            url = None
            try:
                file_url_response = await client.post(
                    f"{self.webhook_url}/modal/file-url",
                    json={"storageId": storage_id},
                    headers=headers,
                )
                if file_url_response.status_code == 200:
                    url_data = file_url_response.json()
                    url = url_data.get("url")
            except Exception as url_err:
                print(f"Failed to fetch file URL: {url_err}")
                # Continue without URL - Convex mutation will generate it from storageId

            return {
                "storageId": storage_id,
                "url": url,
            }
        except Exception as e:
            print(f"Frame upload error: {e}")
            return {}

    async def generate_memes(
        self,
        video_path: str,
        video_duration: float,
        meme_count: int = 5,
        target_templates: Optional[List[str]] = None,
        movie_context: Optional[Dict[str, str]] = None,
        transcript_segments: Optional[List[Dict[str, Any]]] = None,
    ) -> MemeGenerationResult:
        """
        Generate memes from a video.

        Args:
            video_path: Path to downloaded video
            video_duration: Duration in seconds
            meme_count: Number of memes to generate
            target_templates: Specific templates to use (optional)
            movie_context: Movie metadata for context
            transcript_segments: Transcription segments for caption context

        Returns:
            MemeGenerationResult with generated memes
        """
        memes = []
        candidate_frames = []

        try:
            # =================================================================
            # STEP 1: Extract frames
            # =================================================================
            await self._update_progress(
                status="extracting_frames",
                progress=10,
                current_step="Extracting video frames...",
            )

            # Get timestamps for frame extraction
            timestamps = self.get_smart_timestamps(video_duration, frame_count=DEFAULT_FRAME_COUNT)
            print(f"Extracting {len(timestamps)} frames at timestamps: {timestamps}")

            # Extract frames
            extracted_frames = self.extract_frames(video_path, timestamps)
            print(f"Successfully extracted {len(extracted_frames)} frames")

            if not extracted_frames:
                raise Exception("Failed to extract any frames from video")

            await self._update_progress(
                status="analyzing",
                progress=25,
                current_step=f"Analyzing {len(extracted_frames)} frames with AI...",
            )

            # =================================================================
            # STEP 2: Analyze frames with OpenAI Vision
            # =================================================================
            analyzed_frames: List[FrameAnalysis] = []

            for i, frame in enumerate(extracted_frames):
                progress = 25 + int((i / len(extracted_frames)) * 30)
                await self._update_progress(
                    status="analyzing",
                    progress=progress,
                    current_step=f"Analyzing frame {i+1}/{len(extracted_frames)}...",
                )

                try:
                    analysis = await self.analyze_frame(
                        frame["path"],
                        frame["timestamp"],
                        movie_context,
                    )
                    analyzed_frames.append(analysis)

                    # Store candidate frame data
                    candidate_frame_data = {
                        "timestamp": frame["timestamp"],
                        "framePath": frame["path"],
                        "emotion": analysis.emotion,
                        "emotionConfidence": analysis.emotion_confidence,
                        "action": analysis.action,
                        "actionConfidence": analysis.action_confidence,
                        "hasFaces": analysis.has_faces,
                        "faceCount": analysis.face_count,
                        "sceneDescription": analysis.scene_description,
                        "potentialTemplates": analysis.potential_templates,
                        "memeability": analysis.memeability,
                    }
                    candidate_frames.append(candidate_frame_data)

                    # Send candidate frame to Convex
                    await self._send_candidate_frame(candidate_frame_data)

                except Exception as e:
                    print(f"Failed to analyze frame at {frame['timestamp']}s: {e}")

            if not analyzed_frames:
                raise Exception("Failed to analyze any frames")

            print(f"Analyzed {len(analyzed_frames)} frames")
            for af in analyzed_frames:
                print(f"  - {af.timestamp}s: emotion={af.emotion}, memeability={af.memeability}")

            # =================================================================
            # STEP 3: Select best frames and generate captions
            # =================================================================
            print("\n=== STEP 3: Starting caption generation ===")
            print(f"Updating progress to 'generating_captions'...")

            await self._update_progress(
                status="generating_captions",
                progress=60,
                current_step="Generating meme captions...",
            )
            print("Progress update sent successfully")

            # Sort by memeability
            sorted_frames = sorted(analyzed_frames, key=lambda f: f.memeability, reverse=True)
            print(f"Sorted frames by memeability, top frame: {sorted_frames[0].memeability if sorted_frames else 'none'}")

            # Filter to frames above minimum threshold
            good_frames = [f for f in sorted_frames if f.memeability >= MIN_MEMEABILITY_SCORE]
            print(f"Filtered to {len(good_frames)} frames with memeability >= {MIN_MEMEABILITY_SCORE}")

            if not good_frames:
                # Use best available if none meet threshold
                good_frames = sorted_frames[:meme_count]
                print(f"No frames met threshold, using top {len(good_frames)} frames")

            # Determine templates to use
            templates_to_use = target_templates or list(MEME_TEMPLATES.keys())
            print(f"Templates to use: {templates_to_use}")

            # Generate memes
            memes_generated = 0
            print(f"\nStarting to generate {meme_count} memes from {len(good_frames)} good frames...")

            for frame_idx, frame in enumerate(good_frames):
                if memes_generated >= meme_count:
                    print(f"Reached target of {meme_count} memes, stopping generation")
                    break

                print(f"\n--- Processing frame {frame_idx + 1}/{len(good_frames)} (timestamp: {frame.timestamp}s) ---")

                # Find best template for this frame
                suitable_templates = [
                    t for t in frame.potential_templates
                    if t in templates_to_use
                ]
                if not suitable_templates:
                    suitable_templates = templates_to_use[:1]
                    print(f"No matching templates from frame analysis, defaulting to: {suitable_templates[0]}")
                else:
                    print(f"Suitable templates from frame analysis: {suitable_templates}")

                template_type = suitable_templates[0]
                template = MEME_TEMPLATES[template_type]
                print(f"Using template: {template_type} ({template['name']})")

                # Get transcript context for this frame's timestamp
                transcript_context = None
                if transcript_segments:
                    transcript_context = self._get_transcript_context(
                        transcript_segments,
                        frame.timestamp,
                        window_seconds=10,
                    )

                try:
                    # Generate caption
                    print(f"Generating caption for frame at {frame.timestamp}s...")
                    caption_data = await self.generate_caption(
                        frame.frame_path,
                        frame,
                        template_type,
                        movie_context,
                        transcript_context,
                    )
                    caption_text = caption_data.get("caption", "")
                    caption_position = caption_data.get("captionPosition", "bottom")
                    print(f"Caption generated: '{caption_text[:50]}...'")
                    print(f"Viral score: {caption_data.get('viralScore', 'N/A')}, Sentiment: {caption_data.get('sentiment', 'N/A')}")

                    # Compose the meme image with text overlay (square format)
                    print(f"Composing meme image (1080x1080 square with text overlay)...")
                    meme_output_path = os.path.join(self.job_dir, f"meme_{frame.timestamp:.2f}.jpg")
                    composed_meme_path = compose_meme_image(
                        frame_path=frame.frame_path,
                        caption=caption_text,
                        caption_position=caption_position,
                        output_path=meme_output_path,
                    )
                    print(f"Meme composed: {composed_meme_path}")

                    # Upload composed meme to Convex storage
                    print("Uploading composed meme to Convex storage...")
                    upload_result = await self.upload_frame_to_convex(composed_meme_path)
                    print(f"Upload result: url={'present' if upload_result.get('url') else 'missing'}, storageId={'present' if upload_result.get('storageId') else 'missing'}")

                    meme_data = {
                        "templateType": template_type,
                        "templateName": template["name"],
                        "frameTimestamp": frame.timestamp,
                        "frameUrl": upload_result.get("url"),
                        "frameStorageId": upload_result.get("storageId"),
                        "caption": caption_text,
                        "captionPosition": caption_position,
                        "viralScore": caption_data.get("viralScore", 50),
                        "sentiment": caption_data.get("sentiment", "relatable"),
                        "suggestedHashtags": caption_data.get("suggestedHashtags", []),
                        "aiReasoning": caption_data.get("reasoning", ""),
                        "emotion": frame.emotion,
                        "action": frame.action,
                        "hasFaces": frame.has_faces,
                        "faceCount": frame.face_count,
                    }

                    memes.append(meme_data)

                    # Send meme to Convex
                    print("Sending meme data to Convex via webhook...")
                    webhook_success = await self._send_meme(meme_data)
                    print(f"Meme webhook sent: {'success' if webhook_success else 'failed'}")

                    memes_generated += 1
                    print(f"Successfully generated meme {memes_generated}/{meme_count}")

                    progress = 60 + int((memes_generated / meme_count) * 35)
                    await self._update_progress(
                        status="generating_captions",
                        progress=progress,
                        current_step=f"Generated {memes_generated}/{meme_count} memes...",
                    )

                except Exception as e:
                    print(f"!!! EXCEPTION generating meme for frame at {frame.timestamp}s: {e}")
                    import traceback
                    traceback.print_exc()

            # =================================================================
            # STEP 4: Complete
            # =================================================================
            print(f"\n=== STEP 4: Completing job with {len(memes)} memes ===")

            await self._update_progress(
                status="completed",
                progress=100,
                current_step=f"Generated {len(memes)} memes!",
            )
            print("Progress updated to completed")

            await self._complete_job(success=True)
            print("Job completion webhook sent")

            print(f"\n=== MEME GENERATION COMPLETE ===")
            print(f"Total memes generated: {len(memes)}")
            print(f"Total candidate frames: {len(candidate_frames)}")
            print("=================================\n")

            return MemeGenerationResult(
                success=True,
                job_id=self.job_id,
                memes=memes,
                candidate_frames=candidate_frames,
            )

        except Exception as e:
            error_msg = str(e)
            print(f"\n!!! MEME GENERATION ERROR: {error_msg}")
            import traceback
            traceback.print_exc()

            await self._update_progress(
                status="failed",
                progress=0,
                current_step="Meme generation failed",
                error=error_msg,
            )

            await self._complete_job(success=False, error=error_msg)

            return MemeGenerationResult(
                success=False,
                job_id=self.job_id,
                error=error_msg,
            )

        finally:
            # Close HTTP client
            if self._http_client:
                await self._http_client.aclose()

    def _get_transcript_context(
        self,
        segments: List[Dict[str, Any]],
        timestamp: float,
        window_seconds: float = 10,
    ) -> str:
        """
        Get transcript text around a specific timestamp.
        """
        relevant_text = []

        for segment in segments:
            seg_start = segment.get("start", 0)
            seg_end = segment.get("end", 0)

            # Check if segment is within window of timestamp
            if (seg_start <= timestamp + window_seconds and
                seg_end >= timestamp - window_seconds):
                text = segment.get("text", "")
                if text:
                    relevant_text.append(text)

        return " ".join(relevant_text)

    def cleanup(self):
        """Clean up temporary files."""
        import shutil
        try:
            if os.path.exists(self.job_dir):
                shutil.rmtree(self.job_dir)
        except Exception as e:
            print(f"Cleanup error: {e}")
