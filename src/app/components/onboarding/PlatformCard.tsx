import type { ButtonHTMLAttributes } from "react";

export function PlatformCard({
  name,
  description,
  selected,
  onToggle,
  ...props
}: { name: string; description: string; selected: boolean; onToggle: () => void } &
  ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      onClick={onToggle}
      className={`flex h-full flex-col gap-2 rounded-xl border px-4 py-3 text-left transition ${
        selected ? "border-[#f53c56] bg-[#fce5ea] text-[#b91532]" : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold">{name}</span>
        <span className={`h-2.5 w-2.5 rounded-full ${selected ? "bg-[#f53c56]" : "bg-slate-300"}`} />
      </div>
      <p className="text-sm text-slate-600">{description}</p>
    </button>
  );
}
