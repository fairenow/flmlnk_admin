"""
Caption Generator Service

Generates ASS (Advanced SubStation Alpha) captions with word-level highlighting.
Preserves the original video_clipper.py:104-213 logic for 4-word groups
with dynamic highlighting.
"""

from typing import Dict, Any, List, Optional

from .segment_utils import get_segment_value, normalize_segments, normalize_word


# =============================================================================
# ASS TEMPLATE
# =============================================================================

ASS_HEADER = """[Script Info]
Title: Generated Captions
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,{outline},{shadow},{alignment},{margin_l},{margin_r},{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


class CaptionGenerator:
    """
    Service for generating ASS captions with word-level highlighting.

    Implements the 4-word group dynamic highlighting from the original
    video_clipper.py implementation.
    """

    # Default styling
    DEFAULT_FONT = "Arial"
    DEFAULT_FONT_SIZE = 72
    DEFAULT_OUTLINE = 4
    DEFAULT_SHADOW = 2

    # Position alignments (ASS numpad style)
    # 7 8 9  (top)
    # 4 5 6  (middle)
    # 1 2 3  (bottom)
    POSITIONS = {
        "top": 8,
        "center": 5,
        "bottom": 2,
    }

    # Margins for different positions
    MARGINS = {
        "top": {"l": 50, "r": 50, "v": 100},
        "center": {"l": 50, "r": 50, "v": 0},
        "bottom": {"l": 50, "r": 50, "v": 200},
    }

    def generate(
        self,
        segments: List[Dict[str, Any]],
        clip_start: float,
        clip_end: float,
        highlight_color: str = "00FFFF",  # BGR format for ASS
        font_scale: float = 1.0,
        position: str = "bottom",
        words_per_group: int = 4,
    ) -> str:
        """
        Generate ASS content with word-level highlighting.

        Args:
            segments: List of transcription segments with word timings
            clip_start: Clip start time (for adjusting timings)
            clip_end: Clip end time
            highlight_color: Highlight color in BGR hex (e.g., "00FFFF" for cyan)
            font_scale: Scale factor for font size
            position: Caption position ("top", "center", "bottom")
            words_per_group: Number of words to show at once

        Returns:
            Complete ASS file content as string
        """
        # Normalize segments to handle both dict and TranscriptionSegment objects
        normalized_segments = normalize_segments(segments)

        # Get all words with timings
        word_timings = self._extract_word_timings(normalized_segments)

        if not word_timings:
            # Fallback: use segment text (already normalized)
            word_timings = self._words_from_segments(normalized_segments)

        # Build ASS header
        font_size = int(self.DEFAULT_FONT_SIZE * font_scale)
        alignment = self.POSITIONS.get(position, 2)
        margins = self.MARGINS.get(position, self.MARGINS["bottom"])

        header = ASS_HEADER.format(
            font_name=self.DEFAULT_FONT,
            font_size=font_size,
            outline=self.DEFAULT_OUTLINE,
            shadow=self.DEFAULT_SHADOW,
            alignment=alignment,
            margin_l=margins["l"],
            margin_r=margins["r"],
            margin_v=margins["v"],
        )

        # Generate dialogue lines with word highlighting
        dialogue_lines = self._generate_highlighted_dialogue(
            word_timings=word_timings,
            highlight_color=highlight_color,
            words_per_group=words_per_group,
            clip_duration=clip_end - clip_start,
        )

        return header + "\n".join(dialogue_lines)

    def _extract_word_timings(
        self,
        segments: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Extract word-level timings from segments."""
        words = []

        for segment in segments:
            if "words" in segment and segment["words"]:
                for word in segment["words"]:
                    if word.get("word", "").strip():
                        words.append({
                            "word": word["word"].strip(),
                            "start": word.get("start", 0),
                            "end": word.get("end", 0),
                        })
            elif segment.get("text"):
                # Fallback: split segment text and distribute timing
                text = segment["text"].strip()
                seg_words = text.split()
                if seg_words:
                    seg_start = segment.get("start", 0)
                    seg_end = segment.get("end", 0)
                    duration = seg_end - seg_start
                    word_duration = duration / len(seg_words) if len(seg_words) > 0 else duration

                    for i, word in enumerate(seg_words):
                        words.append({
                            "word": word,
                            "start": seg_start + i * word_duration,
                            "end": seg_start + (i + 1) * word_duration,
                        })

        return words

    def _words_from_segments(
        self,
        segments: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Create word timings from segment text (fallback)."""
        words = []

        for segment in segments:
            text = segment.get("text", "").strip()
            if not text:
                continue

            seg_words = text.split()
            seg_start = segment.get("start", 0)
            seg_end = segment.get("end", 0)
            duration = seg_end - seg_start

            if not seg_words:
                continue

            word_duration = duration / len(seg_words)

            for i, word in enumerate(seg_words):
                words.append({
                    "word": word,
                    "start": seg_start + i * word_duration,
                    "end": seg_start + (i + 1) * word_duration,
                })

        return words

    def _generate_highlighted_dialogue(
        self,
        word_timings: List[Dict[str, Any]],
        highlight_color: str,
        words_per_group: int,
        clip_duration: float,
    ) -> List[str]:
        """
        Generate ASS dialogue lines with word-by-word highlighting.

        Implements the 4-word group logic from original video_clipper.py:104-213:
        - Show groups of 4 words at a time
        - Highlight current word within group
        - Move to next group when all words shown
        """
        dialogue_lines = []

        if not word_timings:
            return dialogue_lines

        # Process words in groups
        total_words = len(word_timings)

        for group_start in range(0, total_words, words_per_group):
            group_end = min(group_start + words_per_group, total_words)
            group = word_timings[group_start:group_end]

            if not group:
                continue

            # For each word in the group, create a dialogue line
            for word_idx, current_word in enumerate(group):
                # Build text with current word highlighted
                text_parts = []

                for j, word in enumerate(group):
                    word_text = self._escape_ass_text(word["word"])

                    if j == word_idx:
                        # Current word - highlighted
                        text_parts.append(
                            f"{{\\c&H{highlight_color}&}}{word_text}{{\\c&HFFFFFF&}}"
                        )
                    else:
                        # Other words - white
                        text_parts.append(word_text)

                full_text = " ".join(text_parts)

                # Calculate timing
                start_time = current_word["start"]

                # End time is either next word start or current word end
                if word_idx < len(group) - 1:
                    end_time = group[word_idx + 1]["start"]
                else:
                    end_time = current_word["end"]

                # Ensure minimum duration
                if end_time - start_time < 0.1:
                    end_time = start_time + 0.3

                # Clamp to clip duration
                start_time = max(0, min(start_time, clip_duration))
                end_time = max(start_time + 0.1, min(end_time, clip_duration))

                # Format times
                start_str = self._format_ass_time(start_time)
                end_str = self._format_ass_time(end_time)

                # Create dialogue line
                dialogue_lines.append(
                    f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{full_text}"
                )

        return dialogue_lines

    def _format_ass_time(self, seconds: float) -> str:
        """Format seconds to ASS time format (H:MM:SS.cc)."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        centisecs = int((seconds % 1) * 100)

        return f"{hours}:{minutes:02d}:{secs:02d}.{centisecs:02d}"

    def _escape_ass_text(self, text: str) -> str:
        """Escape special characters for ASS format."""
        # ASS uses curly braces for styling, so escape literal braces
        text = text.replace("\\", "\\\\")
        text = text.replace("{", "\\{")
        text = text.replace("}", "\\}")
        # Newlines
        text = text.replace("\n", "\\N")
        return text


class SimpleCaptionGenerator:
    """
    Simple caption generator without word-level highlighting.
    Used as fallback when word timings are not available.
    """

    @staticmethod
    def generate_srt(segments: List[Dict[str, Any]]) -> str:
        """Generate SRT subtitles from segments."""
        # Normalize segments to handle both dict and TranscriptionSegment objects
        normalized = normalize_segments(segments)
        lines = []

        for i, segment in enumerate(normalized, 1):
            start = SimpleCaptionGenerator._format_srt_time(segment.get("start", 0))
            end = SimpleCaptionGenerator._format_srt_time(segment.get("end", 0))
            text = segment.get("text", "").strip()

            if text:
                lines.append(f"{i}")
                lines.append(f"{start} --> {end}")
                lines.append(text)
                lines.append("")

        return "\n".join(lines)

    @staticmethod
    def _format_srt_time(seconds: float) -> str:
        """Format seconds to SRT time format (HH:MM:SS,mmm)."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds % 1) * 1000)

        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


# =============================================================================
# CAPTION STYLES PRESETS
# =============================================================================

CAPTION_PRESETS = {
    "default": {
        "highlightColor": "00FFFF",  # Cyan
        "fontScale": 1.0,
        "position": "bottom",
    },
    "bold_yellow": {
        "highlightColor": "00FFFF",  # Yellow (BGR)
        "fontScale": 1.2,
        "position": "center",
    },
    "subtle": {
        "highlightColor": "AAAAAA",  # Light gray
        "fontScale": 0.8,
        "position": "bottom",
    },
    "top_red": {
        "highlightColor": "0000FF",  # Red (BGR)
        "fontScale": 1.0,
        "position": "top",
    },
    "green": {
        "highlightColor": "00FF00",  # Green
        "fontScale": 1.0,
        "position": "bottom",
    },
}


def get_preset(name: str) -> Dict[str, Any]:
    """Get a caption preset by name."""
    return CAPTION_PRESETS.get(name, CAPTION_PRESETS["default"])
