"use client";

import type { FC } from "react";
import { Clock } from "lucide-react";

export interface DurationRange {
  min: number;
  max: number;
}

interface DurationPreset {
  label: string;
  min: number;
  max: number;
  description: string;
}

interface DurationSelectorProps {
  value: DurationRange;
  onChange: (value: DurationRange) => void;
  disabled?: boolean;
}

const DURATION_PRESETS: DurationPreset[] = [
  { label: "Quick Hits", min: 5, max: 15, description: "5-15s - Perfect for TikTok hooks" },
  { label: "Short", min: 15, max: 30, description: "15-30s - Ideal for Reels & Shorts" },
  { label: "Standard", min: 15, max: 60, description: "15-60s - Flexible for any platform" },
  { label: "Extended", min: 30, max: 90, description: "30-90s - More context, deeper content" },
];

export const DurationSelector: FC<DurationSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const isPresetSelected = (preset: DurationPreset) =>
    value.min === preset.min && value.max === preset.max;

  const handlePresetClick = (preset: DurationPreset) => {
    if (!disabled) {
      onChange({ min: preset.min, max: preset.max });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Clip Duration
        </label>
      </div>

      {/* Preset buttons */}
      <div className="grid grid-cols-2 gap-2">
        {DURATION_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => handlePresetClick(preset)}
            disabled={disabled}
            className={`
              px-3 py-2 rounded-lg text-left transition-all text-sm
              ${
                isPresetSelected(preset)
                  ? "bg-red-600 text-white ring-2 ring-red-600 ring-offset-2 dark:ring-offset-slate-900"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }
              ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            <div className="font-medium">{preset.label}</div>
            <div className={`text-xs ${isPresetSelected(preset) ? "text-red-100" : "text-slate-500 dark:text-slate-400"}`}>
              {preset.min}-{preset.max}s
            </div>
          </button>
        ))}
      </div>

      {/* Current selection display */}
      <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
        Selected: {value.min}-{value.max} seconds
      </div>
    </div>
  );
};

export default DurationSelector;
