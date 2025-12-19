"""
Utility functions for safely accessing segment and word properties.

The OpenAI Whisper API returns TranscriptionSegment and TranscriptionWord objects
with attributes (not dictionaries). This module provides helper functions to safely
access properties from either object types or dictionaries.
"""

from typing import Any, Dict, List, Union


def get_segment_value(segment: Any, key: str, default: Any = None) -> Any:
    """
    Safely get a value from a segment (either dict or TranscriptionSegment object).

    Args:
        segment: Dictionary or TranscriptionSegment/TranscriptionWord object
        key: The key/attribute to access
        default: Default value if key doesn't exist

    Returns:
        The value for the key, or default if not found
    """
    # Try attribute access first (for TranscriptionSegment objects)
    if hasattr(segment, key):
        return getattr(segment, key, default)

    # Try dictionary access
    if hasattr(segment, "get"):
        return segment.get(key, default)

    # Try bracket notation
    try:
        return segment[key]
    except (TypeError, KeyError):
        pass

    return default


def normalize_segment(segment: Any) -> Dict[str, Any]:
    """
    Convert a segment (dict or object) to a normalized dictionary.

    Args:
        segment: Dictionary or TranscriptionSegment object

    Returns:
        Dictionary with start, end, text, and optionally words
    """
    result = {
        "start": get_segment_value(segment, "start", 0),
        "end": get_segment_value(segment, "end", 0),
        "text": str(get_segment_value(segment, "text", "")).strip(),
    }

    # Include words if present
    words = get_segment_value(segment, "words")
    if words:
        result["words"] = [normalize_word(w) for w in words]

    return result


def normalize_word(word: Any) -> Dict[str, Any]:
    """
    Convert a word (dict or object) to a normalized dictionary.

    Args:
        word: Dictionary or TranscriptionWord object

    Returns:
        Dictionary with word, start, end, and optionally confidence
    """
    result = {
        "word": str(get_segment_value(word, "word", "")).strip(),
        "start": get_segment_value(word, "start", 0),
        "end": get_segment_value(word, "end", 0),
    }

    # Include confidence/probability if present
    confidence = get_segment_value(word, "confidence") or get_segment_value(word, "probability")
    if confidence is not None:
        result["confidence"] = confidence

    return result


def normalize_segments(segments: List[Any]) -> List[Dict[str, Any]]:
    """
    Convert a list of segments to normalized dictionaries.

    Args:
        segments: List of dictionaries or TranscriptionSegment objects

    Returns:
        List of normalized segment dictionaries
    """
    return [normalize_segment(s) for s in segments]
