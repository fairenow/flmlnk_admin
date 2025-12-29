"use client";

import type { FC } from "react";
import { useState } from "react";
import { Sparkles, ChevronDown, ChevronUp, Flame, BookOpen, Laugh, Drama, Star, Heart } from "lucide-react";

export type ClipTone = "viral" | "educational" | "funny" | "dramatic" | "highlights" | "inspirational";

interface ToneOption {
  value: ClipTone;
  label: string;
  icon: typeof Flame;
  description: string;
  examples: string[];
}

interface ToneSelectorProps {
  value: ClipTone;
  onChange: (value: ClipTone) => void;
  disabled?: boolean;
}

const TONE_OPTIONS: ToneOption[] = [
  {
    value: "viral",
    label: "Viral",
    icon: Flame,
    description: "Controversial, emotional, shareable moments",
    examples: ["Hot takes", "Surprising reveals", "Emotional reactions"],
  },
  {
    value: "educational",
    label: "Educational",
    icon: BookOpen,
    description: "Clear explanations, tips, insights",
    examples: ["How-to moments", "Expert advice", "Aha moments"],
  },
  {
    value: "funny",
    label: "Funny",
    icon: Laugh,
    description: "Comedy, jokes, funny reactions",
    examples: ["Punchlines", "Awkward moments", "Comedic timing"],
  },
  {
    value: "dramatic",
    label: "Dramatic",
    icon: Drama,
    description: "Intense moments, confrontations",
    examples: ["Plot twists", "Heated debates", "Emotional peaks"],
  },
  {
    value: "highlights",
    label: "Highlights",
    icon: Star,
    description: "Best moments, peak entertainment",
    examples: ["Quotable moments", "Key points", "Memorable scenes"],
  },
  {
    value: "inspirational",
    label: "Inspirational",
    icon: Heart,
    description: "Motivational, uplifting content",
    examples: ["Life lessons", "Success stories", "Encouragement"],
  },
];

export const ToneSelector: FC<ToneSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const selectedTone = TONE_OPTIONS.find((t) => t.value === value) || TONE_OPTIONS[0];
  const SelectedIcon = selectedTone.icon;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Clip Tone
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SelectedIcon className="w-4 h-4" />
          <span className="text-sm">{selectedTone.label}</span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="grid grid-cols-2 gap-2 pt-2">
          {TONE_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => !disabled && onChange(option.value)}
                disabled={disabled}
                className={`
                  px-3 py-2 rounded-lg text-left transition-all
                  ${
                    value === option.value
                      ? "bg-red-600 text-white ring-2 ring-red-600 ring-offset-2 dark:ring-offset-slate-900"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }
                  ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                `}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{option.label}</span>
                </div>
                <div className={`text-xs mt-1 ${value === option.value ? "text-red-100" : "text-slate-500 dark:text-slate-400"}`}>
                  {option.description}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ToneSelector;
