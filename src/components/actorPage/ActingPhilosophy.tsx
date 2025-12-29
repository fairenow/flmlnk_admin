"use client";

import type { FC } from "react";

type ActingPhilosophyProps = {
  quote: string;
  attribution?: string;
  primaryColor?: string;
};

export const ActingPhilosophy: FC<ActingPhilosophyProps> = ({
  quote,
  attribution,
  primaryColor = "#FF1744",
}) => {
  if (!quote) return null;

  return (
    <div className="relative rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-6">
      {/* Quote mark */}
      <div
        className="absolute -top-3 left-6 text-5xl font-serif leading-none opacity-30"
        style={{ color: primaryColor }}
      >
        &ldquo;
      </div>

      {/* Quote text */}
      <blockquote className="relative">
        <p className="text-base italic text-slate-300 leading-relaxed pl-2">
          {quote}
        </p>
        {attribution && (
          <footer className="mt-3 text-sm text-slate-500">
            — {attribution}
          </footer>
        )}
      </blockquote>

      {/* Decorative line */}
      <div
        className="absolute bottom-0 left-6 right-6 h-0.5 opacity-20"
        style={{
          background: `linear-gradient(90deg, ${primaryColor}, transparent)`,
        }}
      />
    </div>
  );
};

export default ActingPhilosophy;
