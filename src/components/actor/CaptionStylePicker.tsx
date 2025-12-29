"use client";

import type { FC } from "react";
import { useState } from "react";
import { MessageSquare, ChevronDown, ChevronUp } from "lucide-react";

export interface CaptionStyle {
  highlightColor: string;
  fontFamily: string;
  fontSize: "small" | "medium" | "large";
  position: "top" | "center" | "bottom";
  style: "word-highlight" | "karaoke" | "static";
  outline: boolean;
  shadow: boolean;
}

interface CaptionTheme {
  id: string;
  name: string;
  description: string;
  style: CaptionStyle;
  previewColor: string; // For visual display
}

interface CaptionStylePickerProps {
  value: CaptionStyle;
  onChange: (value: CaptionStyle) => void;
  disabled?: boolean;
}

// Caption themes with BGR colors (as used by ASS subtitles)
const CAPTION_THEMES: CaptionTheme[] = [
  {
    id: "viral_yellow",
    name: "Viral Yellow",
    description: "High energy, attention-grabbing",
    previewColor: "#FFFF00",
    style: {
      highlightColor: "00FFFF", // BGR for yellow/cyan
      fontFamily: "Impact",
      fontSize: "large",
      position: "center",
      style: "word-highlight",
      outline: true,
      shadow: true,
    },
  },
  {
    id: "clean_white",
    name: "Clean White",
    description: "Professional, minimal",
    previewColor: "#FFFFFF",
    style: {
      highlightColor: "FFFFFF",
      fontFamily: "Arial",
      fontSize: "medium",
      position: "bottom",
      style: "word-highlight",
      outline: true,
      shadow: false,
    },
  },
  {
    id: "bold_red",
    name: "Bold Red",
    description: "Dramatic, intense",
    previewColor: "#FF0000",
    style: {
      highlightColor: "0000FF", // BGR for red
      fontFamily: "Impact",
      fontSize: "large",
      position: "center",
      style: "word-highlight",
      outline: true,
      shadow: true,
    },
  },
  {
    id: "gaming_green",
    name: "Gaming Green",
    description: "Gaming, action-packed",
    previewColor: "#00FF00",
    style: {
      highlightColor: "00FF00",
      fontFamily: "Arial Black",
      fontSize: "large",
      position: "bottom",
      style: "word-highlight",
      outline: true,
      shadow: true,
    },
  },
  {
    id: "podcast_coral",
    name: "Podcast Coral",
    description: "Warm, conversational",
    previewColor: "#FF6B6B",
    style: {
      highlightColor: "6B6BFF", // BGR for coral
      fontFamily: "Arial",
      fontSize: "medium",
      position: "center",
      style: "word-highlight",
      outline: true,
      shadow: false,
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Subtle, understated",
    previewColor: "#AAAAAA",
    style: {
      highlightColor: "AAAAAA",
      fontFamily: "Arial",
      fontSize: "small",
      position: "bottom",
      style: "static",
      outline: false,
      shadow: false,
    },
  },
];

export const CaptionStylePicker: FC<CaptionStylePickerProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const selectedTheme = CAPTION_THEMES.find(
    (theme) => theme.style.highlightColor === value.highlightColor
  ) || CAPTION_THEMES[0];

  const handleThemeSelect = (theme: CaptionTheme) => {
    if (!disabled) {
      onChange(theme.style);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Caption Style
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600"
            style={{ backgroundColor: selectedTheme.previewColor }}
          />
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {selectedTheme.name}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="grid grid-cols-2 gap-2 pt-2">
          {CAPTION_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => handleThemeSelect(theme)}
              disabled={disabled}
              className={`
                px-3 py-2 rounded-lg text-left transition-all
                ${
                  selectedTheme.id === theme.id
                    ? "ring-2 ring-red-600 ring-offset-2 dark:ring-offset-slate-900 bg-slate-100 dark:bg-slate-800"
                    : "bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800"
                }
                ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600"
                  style={{ backgroundColor: theme.previewColor }}
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {theme.name}
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 pl-6">
                {theme.description}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CaptionStylePicker;
