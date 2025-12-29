"use client";

import React, { useState, useEffect } from "react";
import { Filter, ChevronDown } from "lucide-react";

// Filter options for assets
export type FilterOption = "recent" | "oldest" | "highest" | "lowest";

export const filterLabels: Record<FilterOption, string> = {
  recent: "Most Recent",
  oldest: "Oldest First",
  highest: "Highest Score",
  lowest: "Lowest Score",
};

type FilterDropdownProps = {
  value: FilterOption;
  onChange: (option: FilterOption) => void;
  className?: string;
};

export function FilterDropdown({ value, onChange, className = "" }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setIsOpen(false);
    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/25"
      >
        <Filter className="w-3.5 h-3.5" />
        {filterLabels[value]}
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 w-40 rounded-lg bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-20"
          onClick={(e) => e.stopPropagation()}
        >
          {(Object.keys(filterLabels) as FilterOption[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition ${
                value === option
                  ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              {filterLabels[option]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default FilterDropdown;
