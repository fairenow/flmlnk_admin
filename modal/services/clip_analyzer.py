"""
Clip Analyzer Service

Uses GPT-4o to analyze transcriptions and identify the most viral/engaging clips.
Includes content type detection and caption styling suggestions.
"""

import os
import json
import asyncio
import httpx
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field

from openai import AsyncOpenAI

from .segment_utils import get_segment_value, normalize_segments


# =============================================================================
# API CONFIGURATION
# =============================================================================

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


# =============================================================================
# ANALYSIS RESULT DATA CLASS
# =============================================================================

@dataclass
class AnalysisResult:
    """Result of clip analysis including styling suggestions."""
    clips: List[Dict[str, Any]]
    content_type: str = "podcast"  # gaming, podcast, educational, vlog, entertainment
    caption_color: str = "00FFFF"  # BGR hex color
    caption_font: str = "Arial Black"


# =============================================================================
# VIRAL CONTENT ANALYSIS PROMPT (Enhanced)
# =============================================================================

CLIP_ANALYSIS_PROMPT = """You are a VIRAL CONTENT EXPERT who has created hundreds of clips that got millions of views on TikTok, YouTube Shorts, and Instagram Reels.

Your job: Find the BEST moments that will HOOK viewers instantly and make them watch till the end.

🎯 WHAT MAKES A CLIP GO VIRAL:

1. **STRONG HOOK (First 2-3 seconds)** - The clip MUST start with something that grabs attention:
   - A bold/controversial statement ("Most people are wrong about...")
   - A surprising fact or revelation
   - An emotional moment (anger, excitement, shock, laughter)
   - A question that creates curiosity ("What if I told you...")
   - A relatable pain point ("We've all been there when...")

2. **HIGH RETENTION** - Keep viewers watching:
   - Story with buildup and payoff
   - Useful information/tips delivered clearly
   - Emotional journey (tension → resolution)
   - Unexpected twist or punchline

3. **SHAREABLE MOMENTS** - Content people want to send to friends:
   - "OMG you need to hear this"
   - Controversial takes people will debate
   - Life advice that resonates
   - Funny/relatable situations

4. **ENGAGEMENT TRIGGERS**
   - Debate-worthy opinions
   - "Tag someone who..." moments
   - "Wait for it..." anticipation
   - Mind-blowing revelations

🚫 AVOID THESE (Low engagement clips):
- Starting mid-sentence or mid-thought
- Clips without a clear point or payoff
- Boring intros or slow buildups with no hook
- Incomplete stories or thoughts
- Generic/forgettable content
- Inside jokes that need context

📊 SCORING CRITERIA (0-100):
- Hook Strength (0-25): How compelling is the opening?
- Retention Score (0-25): Will viewers watch till the end?
- Shareability (0-25): Will people share this?
- Engagement Potential (0-25): Will people comment/interact?

Think like a viewer scrolling TikTok - what would make YOU stop and watch?

Always respond with valid JSON only."""


# =============================================================================
# TONE-SPECIFIC GUIDANCE
# =============================================================================

TONE_GUIDANCE = {
    "viral": """🔥 VIRAL TONE: Find moments that will make people STOP scrolling:
- Bold/controversial statements
- Shocking revelations or hot takes
- Emotional outbursts or reactions
- "I can't believe they said that" moments
- Debate-worthy opinions that spark comments""",

    "educational": """📚 EDUCATIONAL TONE: Find moments that teach or inform:
- Clear "aha" explanations that simplify complex topics
- Step-by-step tips and actionable advice
- Myth-busting facts and corrections
- Expert insights and unique perspectives
- "I wish I knew this earlier" moments""",

    "funny": """😂 FUNNY TONE: Find moments that make people laugh:
- Perfect comedic timing and delivery
- Unexpected punchlines and wordplay
- Relatable humor and self-deprecation
- Funny reactions and expressions
- "I'm dying" moments worth sharing""",

    "dramatic": """🎭 DRAMATIC TONE: Find intense, gripping moments:
- Confrontations and heated discussions
- Emotional breakthroughs and revelations
- Life-changing realizations
- Heated debates and arguments
- "Edge of your seat" tension""",

    "highlights": """⭐ HIGHLIGHTS TONE: Find the absolute BEST moments:
- Most quotable lines and memorable phrases
- Peak entertainment value
- Key takeaways and main points
- Memorable scenes and reactions
- "This is the part everyone needs to see" moments""",

    "inspirational": """✨ INSPIRATIONAL TONE: Find uplifting, motivating moments:
- Life lessons and wisdom
- Encouragement and positive messaging
- Success stories and achievements
- Motivational speeches and advice
- "This changed my perspective" moments""",
}


CLIP_EXTRACTION_PROMPT = """Based on the following video transcription, identify {num_clips} of the MOST ENGAGING clips.

VIDEO DURATION: {duration} seconds

TRANSCRIPTION:
{transcription}

SEGMENT TIMINGS:
{segments_json}

{tone_guidance}

📏 CRITICAL DURATION REQUIREMENTS (MUST FOLLOW):
⚠️ IMPORTANT: Each clip MUST be between {min_duration}-{max_duration} seconds.
⚠️ Clips outside this range will be REJECTED.

- MINIMUM duration: {min_duration} seconds (clips under this are INVALID and will be rejected)
- MAXIMUM duration: {max_duration} seconds
- Calculate duration: end_time - start_time MUST be >= {min_duration} seconds
- If a moment is interesting but too short, EXPAND the clip to include surrounding context
- Must have a clear beginning and end
- Every clip MUST have a strong opening hook
- Clips should be COMPLETE thoughts (satisfying ending)

🎮 CONTENT TYPE DETECTION (Very Important!):
Detect what type of video this is based on the transcript:
- "gaming": Gaming streams, Let's Plays, game reactions (mentions of games, gameplay, streaming, chat, donations)
- "podcast": Interviews, conversations, discussions between people
- "educational": Tutorials, how-to videos, explainers
- "vlog": Personal vlogs, daily life content
- "entertainment": Comedy, skits, reactions, general entertainment

The content_type affects how the video will be cropped:
- Gaming: Face cam on top (40%), gameplay on bottom (60%)
- Podcast: Focus on speaker faces
- Others: Smart framing based on content

🎨 CAPTION STYLING (Analyze the overall VIBE first):

CAPTION COLOR (BGR Hex - pick based on energy/mood):
| Mood/Vibe | Color | BGR Code |
|-----------|-------|----------|
| Hype, exciting, high energy | Yellow | 00FFFF |
| Fun, playful, lifestyle | Pink | FF00FF |
| Tech, calm, professional | Cyan | FFFF00 |
| Positive, healthy, growth | Green | 00FF00 |
| Motivational, warm, inspiring | Orange | 00A5FF |
| Serious, news, factual | White | FFFFFF |
| Gaming, intense, action | Red | 0000FF |
| Money, business, success | Gold | 00D4FF |
| Chill, relaxing, peaceful | Light Blue | FFE4B5 |
| Edgy, dark humor, bold | Purple | FF0080 |

CAPTION FONT (pick based on content style):
| Style | Font |
|-------|------|
| Bold, impactful, viral | Impact |
| Professional, clean | Arial |
| Modern, tech | Helvetica |
| Fun, casual | Comic Sans MS |
| Gaming, action | Bebas Neue |
| Creative, trendy | Montserrat |
| Default | Arial Black |

📤 OUTPUT FORMAT (JSON only):
{{
  "clips": [
    {{
      "start_time": <float>,
      "end_time": <float>,
      "title": "<catchy title max 60 chars>",
      "description": "<why this is viral-worthy>",
      "hook": "<the specific line/moment that grabs attention>",
      "transcript": "<exact transcript text>",
      "score": <0-100>,
      "viral_analysis": {{
        "hookStrength": <0-100>,
        "retentionScore": <0-100>,
        "shareabilityScore": <0-100>,
        "suggestedHashtags": ["<hashtag1>", "<hashtag2>", ...],
        "summary": "<brief analysis>"
      }}
    }}
  ],
  "content_type": "<gaming|podcast|educational|vlog|entertainment>",
  "caption_color": "<BGR hex code>",
  "caption_font": "<font name>"
}}

⚠️ REMEMBER: (end_time - start_time) MUST be >= 5.0 seconds for EVERY clip!

Return ONLY valid JSON, no additional text."""


class ClipAnalyzer:
    """
    Service for analyzing transcriptions and identifying viral clips using GPT-4o.
    Now includes content type detection and caption styling suggestions.
    Falls back to Gemini if OpenAI fails.
    """

    def __init__(self):
        self.client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        self.model = "gpt-4o"  # Use GPT-4o for best quality
        self._http_client = None

    async def _get_http_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client for Gemini API calls."""
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=60.0)
        return self._http_client

    async def _call_gemini(self, prompt: str, max_tokens: int = 4000, temperature: float = 0.8) -> str:
        """Call Gemini API and return the text response."""
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY not configured")

        client = await self._get_http_client()
        response = await client.post(
            f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": temperature,
                    "maxOutputTokens": max_tokens,
                },
            },
        )

        if response.status_code != 200:
            error_text = response.text[:500] if response.text else "No error details"
            raise Exception(f"Gemini API error {response.status_code}: {error_text}")

        result = response.json()
        candidates = result.get("candidates", [])
        if not candidates:
            raise Exception("Gemini returned no candidates")

        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            raise Exception("Gemini returned no content parts")

        text = parts[0].get("text", "")
        if not text or not text.strip():
            raise Exception("Gemini returned empty text content")

        return text.strip()

    async def _call_gemini_vision(self, prompt: str, images_base64: List[str], max_tokens: int = 500, temperature: float = 0.3) -> str:
        """Call Gemini API with images and return the text response."""
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY not configured")

        # Build parts with text and images
        parts = [{"text": prompt}]
        for img_b64 in images_base64[:3]:  # Limit to 3 images
            parts.append({
                "inline_data": {
                    "mime_type": "image/jpeg",
                    "data": img_b64,
                }
            })

        client = await self._get_http_client()
        response = await client.post(
            f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": parts}],
                "generationConfig": {
                    "temperature": temperature,
                    "maxOutputTokens": max_tokens,
                },
            },
        )

        if response.status_code != 200:
            error_text = response.text[:500] if response.text else "No error details"
            raise Exception(f"Gemini API error {response.status_code}: {error_text}")

        result = response.json()
        candidates = result.get("candidates", [])
        if not candidates:
            raise Exception("Gemini returned no candidates")

        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            raise Exception("Gemini returned no content parts")

        text = parts[0].get("text", "")
        if not text or not text.strip():
            raise Exception("Gemini returned empty text content")

        return text.strip()

    async def analyze(
        self,
        segments: List[Dict[str, Any]],
        full_text: str,
        video_duration: float,
        num_clips: int = 5,
        min_duration: float = 5.0,
        max_duration: float = 60.0,
        clip_tone: str = "viral",
    ) -> AnalysisResult:
        """
        Analyze transcription and identify viral clips.

        Args:
            segments: List of transcription segments with timing
            full_text: Full transcription text
            video_duration: Total video duration in seconds
            num_clips: Number of clips to identify
            min_duration: Minimum clip duration
            max_duration: Maximum clip duration
            clip_tone: Tone/style for clip selection ("viral", "educational", "funny", etc.)

        Returns:
            AnalysisResult with clips, content_type, caption_color, and caption_font
        """
        # Normalize segments to handle both dict and TranscriptionSegment objects
        normalized_segments = normalize_segments(segments)

        # Format segments for the prompt
        segments_json = json.dumps([
            {
                "start": s["start"],
                "end": s["end"],
                "text": s["text"]
            }
            for s in normalized_segments
        ], indent=2)

        # Get tone-specific guidance
        tone_guidance = TONE_GUIDANCE.get(clip_tone, TONE_GUIDANCE["viral"])

        # Build the extraction prompt with all parameters
        extraction_prompt = CLIP_EXTRACTION_PROMPT.format(
            num_clips=num_clips,
            duration=video_duration,
            transcription=full_text[:8000],  # Limit to avoid token limits
            segments_json=segments_json[:8000],
            tone_guidance=tone_guidance,
            min_duration=int(min_duration),
            max_duration=int(max_duration),
        )

        print(f"Clip analysis with tone={clip_tone}, duration={min_duration}-{max_duration}s")

        # Default styling values
        content_type = "podcast"
        caption_color = "00FFFF"
        caption_font = "Arial Black"

        # Try OpenAI first, fall back to Gemini
        content = None
        openai_error = None

        # Try OpenAI
        try:
            print(f"Calling GPT for clip analysis: video_duration={video_duration}, num_clips={num_clips}, segments_count={len(normalized_segments)}")
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": CLIP_ANALYSIS_PROMPT},
                    {"role": "user", "content": extraction_prompt},
                ],
                temperature=0.8,
                max_tokens=4000,
                response_format={"type": "json_object"},
            )

            if response.choices and response.choices[0].message.content:
                content = response.choices[0].message.content
            else:
                openai_error = "GPT response has no choices or empty content"
        except Exception as e:
            openai_error = str(e)
            print(f"OpenAI clip analysis failed: {e}")

        # Try Gemini fallback if OpenAI failed
        if content is None and GEMINI_API_KEY:
            print(f"Trying Gemini fallback for clip analysis...")
            try:
                full_prompt = f"{CLIP_ANALYSIS_PROMPT}\n\n{extraction_prompt}\n\nReturn ONLY valid JSON."
                content = await self._call_gemini(full_prompt, max_tokens=4000, temperature=0.8)
            except Exception as e:
                print(f"Gemini clip analysis also failed: {e}")

        # If both failed, use fallback extraction
        if content is None:
            print(f"Both APIs failed (OpenAI: {openai_error}), using fallback extraction")
            clips = self._fallback_extraction(normalized_segments, num_clips, min_duration, max_duration)
            return AnalysisResult(clips=clips, content_type=content_type, caption_color=caption_color, caption_font=caption_font)

        # Parse response
        try:
            result = json.loads(content)
            print(f"GPT returned result: {type(result).__name__}")

            # Handle both array and object responses
            if isinstance(result, dict):
                clips = result.get("clips", [])
                # Extract styling suggestions
                content_type = result.get("content_type", "podcast")
                caption_color = result.get("caption_color", "00FFFF")
                caption_font = result.get("caption_font", "Arial Black")
            else:
                clips = result

            print(f"GPT returned {len(clips)} clip suggestions")
            print(f"AI detected: content_type={content_type}, caption_color=#{caption_color}, font={caption_font}")

            # Validate and filter clips
            validated_clips = []
            for i, clip in enumerate(clips):
                is_valid = self._validate_clip(clip, video_duration, min_duration, max_duration)
                if is_valid:
                    validated_clips.append(clip)
                else:
                    # Log why clip failed validation
                    start = clip.get("start_time", 0)
                    end = clip.get("end_time", 0)
                    duration = end - start
                    print(f"Clip {i+1} FAILED validation: start={start}, end={end}, duration={duration}, video_duration={video_duration}")
                    if duration < min_duration or duration > max_duration:
                        print(f"  - Duration {duration} outside range [{min_duration}, {max_duration}]")
                    if start < 0 or end > video_duration:
                        print(f"  - Time bounds invalid: start<0={start<0}, end>video_duration={end}>{video_duration}={end > video_duration}")
                    required_fields = ["start_time", "end_time", "title", "description"]
                    missing = [f for f in required_fields if f not in clip]
                    if missing:
                        print(f"  - Missing required fields: {missing}")

            print(f"Validation complete: {len(validated_clips)}/{len(clips)} clips passed")

            # If no clips passed validation (including empty GPT response), use fallback
            if len(validated_clips) == 0:
                print("No valid clips from GPT, using fallback extraction")
                fallback_clips = self._fallback_extraction(normalized_segments, num_clips, min_duration, max_duration, video_duration)
                return AnalysisResult(clips=fallback_clips, content_type=content_type, caption_color=caption_color, caption_font=caption_font)

            # Sort by score and limit to requested number
            validated_clips.sort(key=lambda x: x.get("score", 0), reverse=True)
            return AnalysisResult(
                clips=validated_clips[:num_clips],
                content_type=content_type,
                caption_color=caption_color,
                caption_font=caption_font,
            )

        except json.JSONDecodeError as e:
            print(f"Failed to parse GPT response: {e}")
            # Fallback to basic clip extraction (use already normalized segments)
            clips = self._fallback_extraction(normalized_segments, num_clips, min_duration, max_duration)
            return AnalysisResult(clips=clips, content_type=content_type, caption_color=caption_color, caption_font=caption_font)

    def _validate_clip(
        self,
        clip: Dict[str, Any],
        video_duration: float,
        min_duration: float,
        max_duration: float,
    ) -> bool:
        """Validate a clip suggestion."""
        start = clip.get("start_time", 0)
        end = clip.get("end_time", 0)
        duration = end - start

        # Check duration bounds
        if duration < min_duration or duration > max_duration:
            return False

        # Check time bounds
        if start < 0 or end > video_duration:
            return False

        # Must have required fields
        required_fields = ["start_time", "end_time", "title", "description"]
        if not all(field in clip for field in required_fields):
            return False

        return True

    def _fallback_extraction(
        self,
        segments: List[Dict[str, Any]],
        num_clips: int,
        min_duration: float,
        max_duration: float,
        video_duration: float = None,
    ) -> List[Dict[str, Any]]:
        """
        Fallback clip extraction based on segment lengths.
        Used when GPT analysis fails or returns no valid clips.
        Always tries to generate the requested number of clips (num_clips).
        """
        clips = []

        if not segments:
            print("Fallback: No segments available")
            return clips

        # Calculate total content duration
        first_start = segments[0]["start"]
        last_end = segments[-1]["end"]
        total_duration = last_end - first_start

        # Determine effective video duration
        effective_video_duration = video_duration if video_duration else last_end

        print(f"Fallback: video_duration={effective_video_duration}s, total_content={total_duration}s, requested_clips={num_clips}")

        # Calculate how many clips we can realistically create
        max_possible_clips = max(1, int(effective_video_duration / min_duration))
        actual_num_clips = min(num_clips, max_possible_clips)

        # Calculate target duration for each clip to evenly distribute content
        if actual_num_clips > 0:
            target_duration = effective_video_duration / actual_num_clips
            # Ensure target is within bounds
            target_duration = max(min_duration, min(target_duration, max_duration))
        else:
            target_duration = min_duration

        print(f"Fallback: Creating {actual_num_clips} clips with target_duration={target_duration:.1f}s each")

        # Strategy 1: Create clips by evenly dividing the video timeline
        if effective_video_duration >= min_duration * actual_num_clips:
            # We have enough duration to create the requested clips
            clip_duration = effective_video_duration / actual_num_clips
            clip_duration = max(min_duration, min(clip_duration, max_duration))

            for i in range(actual_num_clips):
                clip_start = first_start + (i * clip_duration)
                clip_end = min(clip_start + clip_duration, effective_video_duration)

                # Ensure minimum duration
                if clip_end - clip_start < min_duration and i == actual_num_clips - 1:
                    # For the last clip, extend backwards if needed
                    clip_start = max(first_start, clip_end - min_duration)

                # Get transcript for this time range
                clip_text = self._get_transcript_for_range(segments, clip_start, clip_end)

                clips.append({
                    "start_time": clip_start,
                    "end_time": clip_end,
                    "title": f"Clip {len(clips) + 1}",
                    "description": "Auto-generated clip",
                    "transcript": clip_text,
                    "score": max(30, 60 - (i * 5)),  # Decreasing score for later clips
                    "viral_analysis": {
                        "hookStrength": 50,
                        "retentionScore": 50,
                        "shareabilityScore": 50,
                        "suggestedHashtags": [],
                        "summary": f"Automatically extracted clip {i + 1} of {actual_num_clips}",
                    }
                })
                print(f"  Created clip {i + 1}: {clip_start:.1f}s - {clip_end:.1f}s (duration: {clip_end - clip_start:.1f}s)")

        # Strategy 2: If video is too short for requested clips, create overlapping clips
        elif effective_video_duration >= min_duration:
            # Video is long enough for at least one valid clip
            # Create overlapping clips to meet the requested count
            overlap_ratio = 0.5  # 50% overlap between clips

            for i in range(actual_num_clips):
                # Calculate start with overlap
                step = min_duration * (1 - overlap_ratio)
                clip_start = first_start + (i * step)

                # Ensure we don't go past the video
                if clip_start + min_duration > effective_video_duration:
                    clip_start = max(first_start, effective_video_duration - min_duration)

                clip_end = min(clip_start + min_duration, effective_video_duration)

                # Skip if this clip would be a duplicate of the previous one
                if clips and abs(clips[-1]["start_time"] - clip_start) < 1.0:
                    continue

                clip_text = self._get_transcript_for_range(segments, clip_start, clip_end)

                clips.append({
                    "start_time": clip_start,
                    "end_time": clip_end,
                    "title": f"Clip {len(clips) + 1}",
                    "description": "Auto-generated clip",
                    "transcript": clip_text,
                    "score": max(30, 60 - (len(clips) * 5)),
                    "viral_analysis": {
                        "hookStrength": 50,
                        "retentionScore": 50,
                        "shareabilityScore": 50,
                        "suggestedHashtags": [],
                        "summary": f"Automatically extracted overlapping clip",
                    }
                })
                print(f"  Created overlapping clip {len(clips)}: {clip_start:.1f}s - {clip_end:.1f}s")

        # Strategy 3: Video is too short - create what we can
        else:
            # Video is shorter than min_duration, create one clip with available content
            full_text = " ".join(s["text"] for s in segments).strip()
            print(f"Fallback: Video too short ({effective_video_duration}s < {min_duration}s min), creating single clip")
            clips.append({
                "start_time": first_start,
                "end_time": last_end,
                "title": "Highlight Clip",
                "description": "Auto-generated highlight from short video",
                "transcript": full_text,
                "score": 40,
                "viral_analysis": {
                    "hookStrength": 40,
                    "retentionScore": 40,
                    "shareabilityScore": 40,
                    "suggestedHashtags": [],
                    "summary": "Short video - extracted all available content",
                }
            })

        print(f"Fallback extraction generated {len(clips)} clips (requested: {num_clips})")
        return clips

    def _get_transcript_for_range(
        self,
        segments: List[Dict[str, Any]],
        start_time: float,
        end_time: float,
    ) -> str:
        """Get transcript text for a specific time range."""
        texts = []
        for segment in segments:
            seg_start = segment["start"]
            seg_end = segment["end"]
            # Include segment if it overlaps with the range
            if seg_start < end_time and seg_end > start_time:
                texts.append(segment["text"])
        return " ".join(texts).strip()

    def refine_clip_boundaries(
        self,
        clips: List[Dict[str, Any]],
        segments: List[Dict[str, Any]],
        min_duration: float = 5.0,
        max_duration: float = 60.0,
        max_adjustment: float = 2.0,
    ) -> List[Dict[str, Any]]:
        """
        Refine clip boundaries to snap to sentence endings.

        This creates cleaner cuts by:
        1. Snapping start times to the beginning of sentences
        2. Snapping end times to the end of sentences (. ! ?)

        Args:
            clips: List of clip suggestions with start_time and end_time
            segments: List of transcription segments
            min_duration: Minimum clip duration to maintain
            max_duration: Maximum clip duration to maintain
            max_adjustment: Maximum seconds to adjust boundaries

        Returns:
            Refined clips with adjusted boundaries
        """
        if not clips or not segments:
            return clips

        # Normalize segments
        normalized = normalize_segments(segments)

        # Build list of sentence boundaries from segments
        sentence_starts = []  # (time, segment_idx)
        sentence_ends = []    # (time, segment_idx)

        for i, seg in enumerate(normalized):
            text = seg.get("text", "").strip()
            seg_start = seg.get("start", 0)
            seg_end = seg.get("end", 0)

            # Track segment starts as potential clip starts
            sentence_starts.append((seg_start, i))

            # Track sentence endings within segments
            if text.endswith((".", "!", "?", "...", "。", "！", "？")):
                sentence_ends.append((seg_end, i))

            # Also check for natural pauses (gaps between segments)
            if i < len(normalized) - 1:
                next_start = normalized[i + 1].get("start", seg_end)
                if next_start - seg_end > 0.3:  # Gap > 300ms indicates pause
                    sentence_ends.append((seg_end, i))

        # Add final segment end as boundary
        if normalized:
            sentence_ends.append((normalized[-1].get("end", 0), len(normalized) - 1))

        refined_clips = []

        for clip in clips:
            original_start = clip.get("start_time", 0)
            original_end = clip.get("end_time", 0)
            original_duration = original_end - original_start

            # Find best start time (beginning of a sentence/segment)
            best_start = original_start
            min_start_diff = float("inf")

            for sent_start, _ in sentence_starts:
                diff = abs(sent_start - original_start)
                if diff < min_start_diff and diff <= max_adjustment:
                    # Prefer starting slightly earlier (at sentence start)
                    if sent_start <= original_start + 0.5:
                        best_start = sent_start
                        min_start_diff = diff

            # Find best end time (end of a sentence)
            best_end = original_end
            min_end_diff = float("inf")

            for sent_end, _ in sentence_ends:
                diff = abs(sent_end - original_end)
                if diff < min_end_diff and diff <= max_adjustment:
                    # Prefer ending slightly later (at sentence end)
                    if sent_end >= original_end - 0.5:
                        best_end = sent_end
                        min_end_diff = diff

            # Validate refined boundaries
            refined_duration = best_end - best_start

            # If refined duration is out of bounds, try to fix it
            if refined_duration < min_duration:
                # Try extending the end
                for sent_end, _ in sorted(sentence_ends, key=lambda x: x[0]):
                    if sent_end > best_start + min_duration:
                        best_end = sent_end
                        break
                refined_duration = best_end - best_start

            if refined_duration > max_duration:
                # Try finding an earlier end point
                for sent_end, _ in sorted(sentence_ends, key=lambda x: x[0], reverse=True):
                    if best_start + min_duration <= sent_end <= best_start + max_duration:
                        best_end = sent_end
                        break
                refined_duration = best_end - best_start

            # Final validation - if still invalid, use original
            if refined_duration < min_duration or refined_duration > max_duration:
                best_start = original_start
                best_end = original_end

            # Create refined clip
            refined_clip = clip.copy()
            refined_clip["start_time"] = best_start
            refined_clip["end_time"] = best_end

            # Update transcript for new boundaries
            refined_clip["transcript"] = self._get_transcript_for_range(
                normalized, best_start, best_end
            )

            # Log adjustment if significant
            start_adj = best_start - original_start
            end_adj = best_end - original_end
            if abs(start_adj) > 0.1 or abs(end_adj) > 0.1:
                print(f"Refined clip boundaries: start {start_adj:+.2f}s, end {end_adj:+.2f}s")

            refined_clips.append(refined_clip)

        return refined_clips

    async def generate_video_summary(
        self,
        segments: List[Dict[str, Any]],
        video_title: str = "",
        video_duration: float = 0,
    ) -> str:
        """
        Generate a comprehensive summary of the full video for filmmakers.

        This feature provides filmmakers with:
        - Overview of the video content
        - Key topics discussed
        - Notable moments and timestamps
        - Content structure breakdown
        - Production notes and B-roll suggestions
        - Target audience insights

        Args:
            segments: List of transcription segments
            video_title: Title of the video
            video_duration: Total video duration in seconds

        Returns:
            A detailed summary string (500-800 words)
        """
        print(f"Generating video summary for filmmaker role...")

        # Normalize segments
        normalized = normalize_segments(segments)

        # Build full transcript
        full_transcript = "\n".join([s["text"] for s in normalized])

        # Truncate if too long (keep ~15000 chars to stay within token limits)
        if len(full_transcript) > 15000:
            full_transcript = full_transcript[:15000] + "...[truncated]"

        summary_prompt = f"""You are an expert video analyst helping FILMMAKERS understand video content.

VIDEO TITLE: {video_title}
VIDEO DURATION: {video_duration:.1f} seconds ({video_duration/60:.1f} minutes)

FULL TRANSCRIPT:
{full_transcript}

Please provide a COMPREHENSIVE SUMMARY for a filmmaker that includes:

1. **OVERVIEW** (2-3 sentences)
   - What is this video about?
   - Who are the main speakers/subjects?

2. **KEY TOPICS DISCUSSED** (bullet points)
   - List the main topics/themes covered
   - Include approximate timestamps if notable

3. **NOTABLE MOMENTS** (bullet points)
   - Highlight memorable quotes or statements
   - Emotional peaks or dramatic moments
   - Funny or viral-worthy segments

4. **CONTENT STRUCTURE**
   - How is the video organized?
   - Introduction, main content, conclusion breakdown

5. **PRODUCTION NOTES** (for filmmaker)
   - Suggested b-roll or visual ideas
   - Tone and pacing observations
   - Target audience insights

6. **CLIP RECOMMENDATIONS SUMMARY**
   - Brief overview of the best segments for short-form content
   - Why these segments would perform well

Keep the summary informative but concise (around 500-800 words).
Format with clear headers and bullet points for easy reading."""

        system_prompt = "You are a professional video analyst providing detailed summaries for filmmakers and content creators. Be thorough but organized."

        # Try OpenAI first
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": summary_prompt},
                ],
                temperature=0.7,
                max_tokens=2000,
            )

            summary = response.choices[0].message.content
            if summary:
                print(f"Video summary generated successfully ({len(summary)} chars)")
                return summary
        except Exception as e:
            print(f"OpenAI video summary failed: {e}")

        # Try Gemini fallback
        if GEMINI_API_KEY:
            try:
                print("Trying Gemini fallback for video summary...")
                full_prompt = f"{system_prompt}\n\n{summary_prompt}"
                summary = await self._call_gemini(full_prompt, max_tokens=2000, temperature=0.7)
                print(f"Video summary generated via Gemini ({len(summary)} chars)")
                return summary
            except Exception as e:
                print(f"Gemini video summary also failed: {e}")

        return "Summary generation failed: Both OpenAI and Gemini APIs failed"


    # =========================================================================
    # AI LAYOUT AUTO-DETECTION (Phase 3.3)
    # =========================================================================

    async def detect_optimal_layout(
        self,
        video_path: str,
        sample_times: List[float] = None,
        num_samples: int = 3,
    ) -> Dict[str, Any]:
        """
        Use GPT-4o Vision to analyze video frames and suggest optimal layout.

        Analyzes sample frames to detect:
        - Gaming content (gameplay + facecam)
        - Podcast/interview (2+ people talking)
        - Standard (single speaker, vlog, tutorial)

        Args:
            video_path: Path to video file
            sample_times: Specific timestamps to sample (optional)
            num_samples: Number of frames to sample if sample_times not provided

        Returns:
            Dict with layout, confidence, reason, and detected features
        """
        try:
            # Get video duration if sample_times not provided
            if sample_times is None:
                duration = await self._get_video_duration(video_path)
                if duration <= 0:
                    duration = 60.0  # Default assumption

                # Sample at 10%, 40%, 70% of video
                sample_times = [
                    duration * 0.1,
                    duration * 0.4,
                    duration * 0.7,
                ][:num_samples]

            # Extract and encode frames
            frames_base64 = []
            for ts in sample_times:
                frame_b64 = await self._extract_frame_base64(video_path, ts)
                if frame_b64:
                    frames_base64.append(frame_b64)

            if not frames_base64:
                print("AI layout detection: no frames extracted, defaulting to standard")
                return {
                    "layout": "standard",
                    "confidence": 0.3,
                    "reason": "Could not extract frames for analysis",
                    "features": {},
                }

            # Call GPT-4o Vision
            result = await self._analyze_frames_for_layout(frames_base64)
            print(f"AI layout detection: {result.get('layout')} (confidence: {result.get('confidence', 0):.2f})")

            return result

        except Exception as e:
            print(f"AI layout detection failed: {e}")
            return {
                "layout": "standard",
                "confidence": 0.3,
                "reason": f"Analysis failed: {str(e)}",
                "features": {},
            }

    async def _get_video_duration(self, video_path: str) -> float:
        """Get video duration using ffprobe."""
        import asyncio
        import subprocess

        try:
            cmd = [
                'ffprobe', '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                video_path
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await process.communicate()

            return float(stdout.decode().strip())
        except Exception:
            return 0.0

    async def _extract_frame_base64(
        self,
        video_path: str,
        timestamp: float,
    ) -> Optional[str]:
        """Extract a frame and encode as base64 JPEG."""
        import asyncio
        import base64
        import tempfile
        import os

        try:
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                tmp_path = tmp.name

            cmd = [
                'ffmpeg', '-y',
                '-ss', str(timestamp),
                '-i', video_path,
                '-vframes', '1',
                '-vf', 'scale=768:-1',  # Resize for API efficiency
                '-q:v', '3',
                tmp_path
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await process.communicate()

            if os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 0:
                with open(tmp_path, 'rb') as f:
                    frame_data = f.read()
                os.unlink(tmp_path)
                return base64.b64encode(frame_data).decode('utf-8')

            return None
        except Exception as e:
            print(f"Frame extraction for layout detection failed: {e}")
            return None

    async def _analyze_frames_for_layout(
        self,
        frames_base64: List[str],
    ) -> Dict[str, Any]:
        """
        Send frames to GPT-4o Vision for layout analysis.
        """
        layout_prompt = """Analyze these video frames and determine the optimal layout for creating vertical (9:16) clips.

LAYOUT OPTIONS:
1. "gaming" - Video shows gameplay with a facecam overlay
   - Look for: Game UI, gameplay graphics, small facecam in corner, streaming overlays
   - Common in: Let's Plays, Twitch streams, gaming reactions

2. "podcast" - Video shows 2+ people talking (interview, discussion)
   - Look for: Multiple people visible, interview setup, split screen, panel discussion
   - Common in: Podcasts, interviews, debates, talk shows

3. "standard" - Single person or general content
   - Look for: One main speaker, vlog style, tutorials, presentations
   - Common in: YouTube videos, educational content, vlogs

ANALYSIS CRITERIA:
- Count the number of distinct people/faces visible
- Check for gaming UI elements (health bars, minimaps, chat overlays)
- Look for screen recording or gameplay footage
- Identify if there's a facecam overlay separate from main content
- Notice interview-style setups (side-by-side, facing each other)

Return JSON only:
{
  "layout": "gaming" | "podcast" | "standard",
  "confidence": 0.0-1.0,
  "reason": "Brief explanation of why this layout was chosen",
  "features": {
    "num_people": <number of distinct people visible>,
    "has_gameplay": <true/false>,
    "has_facecam": <true/false>,
    "has_screen_share": <true/false>,
    "content_type": "gaming" | "interview" | "vlog" | "tutorial" | "entertainment" | "other"
  }
}"""

        result_text = None
        openai_error = None

        # Try OpenAI first
        try:
            content = [{"type": "text", "text": layout_prompt}]
            for frame_b64 in frames_base64[:3]:
                content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{frame_b64}",
                        "detail": "low",
                    }
                })

            response = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": content}],
                response_format={"type": "json_object"},
                max_tokens=500,
                temperature=0.3,
            )
            result_text = response.choices[0].message.content
        except Exception as e:
            openai_error = str(e)
            print(f"OpenAI layout detection failed: {e}")

        # Try Gemini fallback
        if result_text is None and GEMINI_API_KEY:
            try:
                print("Trying Gemini fallback for layout detection...")
                result_text = await self._call_gemini_vision(
                    layout_prompt + "\n\nReturn ONLY valid JSON.",
                    frames_base64,
                    max_tokens=500,
                    temperature=0.3
                )
            except Exception as e:
                print(f"Gemini layout detection also failed: {e}")

        if result_text is None:
            return {
                "layout": "standard",
                "confidence": 0.3,
                "reason": f"Both APIs failed: {openai_error}",
                "features": {},
            }

        try:
            # Extract JSON from markdown if needed
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]

            result = json.loads(result_text.strip())

            # Validate and normalize response
            valid_layouts = ["gaming", "podcast", "standard"]
            if result.get("layout") not in valid_layouts:
                result["layout"] = "standard"

            result["confidence"] = min(1.0, max(0.0, float(result.get("confidence", 0.5))))

            return result

        except json.JSONDecodeError as e:
            print(f"Failed to parse layout detection response: {e}")
            return {
                "layout": "standard",
                "confidence": 0.4,
                "reason": "Failed to parse AI response",
                "features": {},
            }
        except Exception as e:
            print(f"Layout detection API call failed: {e}")
            return {
                "layout": "standard",
                "confidence": 0.3,
                "reason": f"API error: {str(e)}",
                "features": {},
            }

    async def analyze_with_layout_detection(
        self,
        segments: List[Dict[str, Any]],
        full_text: str,
        video_path: str,
        video_duration: float,
        num_clips: int = 5,
        min_duration: float = 5.0,
        max_duration: float = 60.0,
        clip_tone: str = "viral",
        auto_detect_layout: bool = True,
    ) -> Dict[str, Any]:
        """
        Enhanced analysis that includes automatic layout detection.

        This combines clip analysis with AI-powered layout detection
        to provide both the best clips AND the optimal way to present them.

        Args:
            segments: Transcription segments
            full_text: Full transcript text
            video_path: Path to video for frame analysis
            video_duration: Total video duration
            num_clips: Number of clips to identify
            min_duration: Minimum clip duration
            max_duration: Maximum clip duration
            clip_tone: Desired tone for clips
            auto_detect_layout: Whether to run AI layout detection

        Returns:
            Dict with clips, layout recommendation, and analysis metadata
        """
        # Run clip analysis
        analysis_result = await self.analyze(
            segments=segments,
            full_text=full_text,
            video_duration=video_duration,
            num_clips=num_clips,
            min_duration=min_duration,
            max_duration=max_duration,
            clip_tone=clip_tone,
        )

        result = {
            "clips": analysis_result.clips,
            "content_type": analysis_result.content_type,
            "caption_color": analysis_result.caption_color,
            "caption_font": analysis_result.caption_font,
            "detected_layout": None,
            "layout_confidence": 0.0,
        }

        # Run layout detection if enabled
        if auto_detect_layout and video_path:
            layout_result = await self.detect_optimal_layout(video_path)

            result["detected_layout"] = layout_result.get("layout", "standard")
            result["layout_confidence"] = layout_result.get("confidence", 0.0)
            result["layout_reason"] = layout_result.get("reason", "")
            result["layout_features"] = layout_result.get("features", {})

            # Override content_type if AI detection is confident
            if layout_result.get("confidence", 0) > 0.7:
                features = layout_result.get("features", {})
                if features.get("content_type"):
                    result["content_type"] = features["content_type"]

        return result


class SimpleClipExtractor:
    """
    Simple rule-based clip extractor as backup.
    Identifies clips based on sentence boundaries and natural pauses.
    """

    @staticmethod
    def extract_clips(
        segments: List[Dict[str, Any]],
        num_clips: int = 5,
        min_duration: float = 5.0,
        max_duration: float = 60.0,
    ) -> List[Dict[str, Any]]:
        """Extract clips based on natural boundaries."""
        # Normalize segments to handle both dict and TranscriptionSegment objects
        normalized = normalize_segments(segments)

        clips = []
        current_start = None
        current_text = ""

        for i, segment in enumerate(normalized):
            if current_start is None:
                current_start = segment["start"]

            current_text += " " + segment["text"]
            duration = segment["end"] - current_start

            # Check if we should end this clip
            should_end = (
                duration >= min_duration and (
                    # Natural pause (gap between segments)
                    (i < len(normalized) - 1 and normalized[i + 1]["start"] - segment["end"] > 0.5) or
                    # End of sentence
                    segment["text"].rstrip().endswith((".", "!", "?")) or
                    # Max duration reached
                    duration >= max_duration
                )
            )

            if should_end:
                clips.append({
                    "start_time": current_start,
                    "end_time": segment["end"],
                    "title": f"Clip {len(clips) + 1}",
                    "description": "Extracted based on natural boundaries",
                    "transcript": current_text.strip(),
                    "score": 50,
                })
                current_start = None
                current_text = ""

                if len(clips) >= num_clips:
                    break

        return clips
