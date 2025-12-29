"use client";

import type { FC } from "react";

type QuickStatsProps = {
  productions?: number;
  yearsActive?: number;
  ventures?: number;
  genres?: string[];
  commentReplyRate?: string;
  primaryColor?: string;
};

export const QuickStats: FC<QuickStatsProps> = ({
  productions = 0,
  yearsActive = 0,
  ventures = 0,
  genres = [],
  commentReplyRate,
  primaryColor = "#FF1744",
}) => {
  const stats = [
    { label: "Productions", value: productions.toString(), show: productions > 0 },
    { label: "Years Active", value: yearsActive.toString(), show: yearsActive > 0 },
    { label: "Ventures", value: ventures.toString(), show: ventures > 0 },
    { label: "Genres", value: genres.length.toString(), show: genres.length > 0 },
    { label: "Reply Rate", value: commentReplyRate || "", show: !!commentReplyRate },
  ].filter((s) => s.show);

  if (stats.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Quick Stats
      </h3>
      <div className="space-y-3">
        {stats.map((stat, index) => (
          <div key={index} className="flex items-center justify-between">
            <span className="text-sm text-slate-400">{stat.label}</span>
            <span
              className="text-sm font-semibold"
              style={{ color: primaryColor }}
            >
              {stat.value}
            </span>
          </div>
        ))}
        {genres.length > 0 && (
          <div className="pt-2 border-t border-white/10">
            <div className="flex flex-wrap gap-2">
              {genres.slice(0, 4).map((genre, index) => (
                <span
                  key={index}
                  className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-300"
                >
                  {genre}
                </span>
              ))}
              {genres.length > 4 && (
                <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-500">
                  +{genres.length - 4} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickStats;
