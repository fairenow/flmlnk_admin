import type { ButtonHTMLAttributes } from "react";

export function GenreTag({
  label,
  selected,
  onToggle,
  ...props
}: { label: string; selected: boolean; onToggle: () => void } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      onClick={onToggle}
      className={`rounded-full border px-4 py-2 text-sm transition ${
        selected
          ? "border-[#f53c56] bg-[#fce5ea] text-[#b91532]"
          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}
