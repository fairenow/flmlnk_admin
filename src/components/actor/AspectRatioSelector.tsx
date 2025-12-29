"use client";

import type { FC } from "react";
import { Smartphone, Monitor, Square } from "lucide-react";

export type AspectRatio = "9:16" | "16:9" | "1:1";

interface AspectRatioOption {
  value: AspectRatio;
  label: string;
  description: string;
  icon: typeof Smartphone;
  dimensions: { width: number; height: number };
}

interface AspectRatioSelectorProps {
  value: AspectRatio;
  onChange: (value: AspectRatio) => void;
  disabled?: boolean;
}

const ASPECT_RATIOS: AspectRatioOption[] = [
  {
    value: "9:16",
    label: "Vertical",
    description: "TikTok, Reels, Shorts",
    icon: Smartphone,
    dimensions: { width: 1080, height: 1920 },
  },
  {
    value: "16:9",
    label: "Horizontal",
    description: "YouTube, Twitter",
    icon: Monitor,
    dimensions: { width: 1920, height: 1080 },
  },
  {
    value: "1:1",
    label: "Square",
    description: "Instagram Feed",
    icon: Square,
    dimensions: { width: 1080, height: 1080 },
  },
];

export const AspectRatioSelector: FC<AspectRatioSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        Output Format
      </label>

      <div className="grid grid-cols-3 gap-2">
        {ASPECT_RATIOS.map((option) => {
          const _Icon = option.icon; // Available for future use
          const isSelected = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => !disabled && onChange(option.value)}
              disabled={disabled}
              className={`
                flex flex-col items-center gap-2 p-3 rounded-lg transition-all
                ${
                  isSelected
                    ? "bg-red-600 text-white ring-2 ring-red-600 ring-offset-2 dark:ring-offset-slate-900"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }
                ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              {/* Visual aspect ratio representation */}
              <div className="relative flex items-center justify-center w-10 h-10">
                {option.value === "9:16" && (
                  <div className={`w-5 h-8 rounded-sm border-2 ${isSelected ? "border-white" : "border-slate-400 dark:border-slate-500"}`} />
                )}
                {option.value === "16:9" && (
                  <div className={`w-10 h-6 rounded-sm border-2 ${isSelected ? "border-white" : "border-slate-400 dark:border-slate-500"}`} />
                )}
                {option.value === "1:1" && (
                  <div className={`w-7 h-7 rounded-sm border-2 ${isSelected ? "border-white" : "border-slate-400 dark:border-slate-500"}`} />
                )}
              </div>

              <div className="text-center">
                <div className="text-sm font-medium">{option.label}</div>
                <div className={`text-xs ${isSelected ? "text-red-100" : "text-slate-500 dark:text-slate-400"}`}>
                  {option.value}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Platform hint */}
      <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
        {ASPECT_RATIOS.find((o) => o.value === value)?.description}
      </div>
    </div>
  );
};

export default AspectRatioSelector;
