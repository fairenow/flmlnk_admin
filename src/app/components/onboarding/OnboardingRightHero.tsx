"use client";

const PlayIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const TrophyIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C13.1 2 14 2.9 14 4H19V6C19 8.21 17.21 10 15 10H14.83C14.42 11.17 13.31 12 12 12C10.69 12 9.58 11.17 9.17 10H9C6.79 10 5 8.21 5 6V4H10C10 2.9 10.9 2 12 2ZM19 4H16V6C16 6.55 16.45 7 17 7H19V6C19 5.45 19 5 19 4ZM5 4V6C5 6 5 6.55 5 7H7C7.55 7 8 6.55 8 6V4H5ZM12 14C14.67 14 20 15.34 20 18V22H4V18C4 15.34 9.33 14 12 14Z" />
  </svg>
);

const StarIcon = () => (
  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
  </svg>
);

const FilmIcon = () => (
  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M2 8h20M2 16h20M6 4v4M6 16v4M10 4v4M10 16v4M14 4v4M14 16v4M18 4v4M18 16v4" />
  </svg>
);

export function OnboardingRightHero() {
  return (
    <div className="relative w-full h-full max-w-3xl px-8">
      {/* Background glow */}
      <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top,_#FF1744_0,_transparent_50%)]" />

      <div className="relative h-full flex items-center">
        <div className="grid grid-cols-2 gap-6 w-full">
          {/* Main film card */}
          <div className="col-span-2 md:col-span-1">
            <div className="rounded-2xl bg-[#15111c] shadow-xl p-4 space-y-3">
              {/* Card header */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-100">The Filmmaker&apos;s Story</span>
                <button className="flex items-center justify-center h-7 w-7 rounded-full bg-[#FF1744] text-white">
                  <PlayIcon />
                </button>
              </div>
              {/* Video preview with play overlay */}
              <div className="relative rounded-lg overflow-hidden bg-gradient-to-br from-[#2a1f3d] to-[#1a1225] aspect-video">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                    <PlayIcon />
                  </div>
                </div>
                {/* Simulated film scene gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              </div>
              <div className="flex justify-between items-center text-xs text-slate-300">
                <span className="inline-flex items-center gap-1 text-[10px]">
                  <span className="text-emerald-400 font-semibold">98% Match</span>
                  <span className="text-slate-400">2024</span>
                  <span className="text-[9px] border border-slate-500 rounded px-1">HD</span>
                </span>
              </div>
              <button className="mt-1 inline-flex items-center justify-center rounded-full bg-[#FF1744] px-4 py-1.5 text-xs font-medium text-white">
                Now Streaming
              </button>
            </div>
          </div>

          {/* Sundance badge */}
          <div className="justify-self-end self-start">
            <div className="rounded-xl bg-[#18131f] px-4 py-3 text-xs text-slate-100 shadow-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[#f5c518]"><TrophyIcon /></span>
                <p className="font-semibold">Sundance 2024</p>
              </div>
              <p className="text-[11px] text-slate-400">Official Selection</p>
              <div className="flex gap-1 mt-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-[#f5c518]/20 text-[#f5c518]"><TrophyIcon /></span>
                <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-[#f5c518]/20 text-[#f5c518]"><StarIcon /></span>
                <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-[#FF1744]/20 text-[#FF1744]"><FilmIcon /></span>
              </div>
            </div>
          </div>

          {/* Professional film pages card */}
          <div className="col-span-2">
            <div className="rounded-2xl bg-[#17121f] p-5 text-slate-100 shadow-2xl max-w-md mx-auto text-center">
              <div className="flex justify-center mb-3">
                <div className="h-12 w-12 rounded-lg bg-[#FF1744]/20 flex items-center justify-center text-[#FF1744]">
                  <FilmIcon />
                </div>
              </div>
              <p className="text-base font-semibold mb-1">Professional Film Pages</p>
              <p className="text-xs text-slate-400 mb-4">
                Create stunning, streaming-ready showcases that captivate
                audiences and industry professionals.
              </p>
              <button className="inline-flex items-center justify-center rounded-full bg-[#FF1744] px-5 py-2 text-xs font-medium text-white">
                Launch in Minutes
              </button>
            </div>
          </div>

          {/* Bottom actor card */}
          <div className="col-span-2 md:col-span-1">
            <div className="rounded-xl bg-[#17121f] px-4 py-3 text-xs text-slate-100 shadow-lg flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-black to-[#FF1744] flex items-center justify-center text-white font-semibold text-sm">
                  SJ
                </div>
                <div>
                  <p className="text-sm font-medium">Sarah Johnson</p>
                  <p className="text-[11px] text-slate-400">Award-winning Director</p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <FilmIcon />
                  <span>15 Films</span>
                </span>
                <span className="flex items-center gap-1">
                  <StarIcon />
                  <span>3 Awards</span>
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                <button className="flex-1 rounded-full bg-[#FF1744] py-1.5 text-[11px] font-medium">
                  View Filmography
                </button>
                <button className="flex-1 rounded-full bg-[#262033] py-1.5 text-[11px] font-medium border border-slate-700">
                  Contact Agent
                </button>
              </div>
            </div>
          </div>

          {/* Integrations strip */}
          <div className="col-span-2 md:col-span-1 flex items-end justify-end">
            <div className="rounded-xl bg-[#18131f] px-4 py-3 shadow-lg">
              <p className="text-[10px] text-slate-400 mb-2">Integrated with</p>
              <div className="flex gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#e50914] text-white text-xs font-bold">N</span>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f5c518] text-black text-xs font-bold">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 8.5c0-1.1-.9-2-2-2h-2v4h2c1.1 0 2-.9 2-2zm-2-5.5H6v14h3v-4h4.5c2.5 0 4.5-2 4.5-4.5S16 3 13.5 3zm0 7H9V6h4.5c.83 0 1.5.67 1.5 1.5S14.33 9 13.5 9h-4.5v1z"/></svg>
                </span>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#FF0000] text-white">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg>
                </span>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#1DB954] text-white text-xs font-bold">H</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
