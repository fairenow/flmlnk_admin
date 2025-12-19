"use client";

import type { FC } from "react";
import type { Id } from "@convex/_generated/dataModel";
import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { Play } from "lucide-react";

type Project = {
  _id: Id<"projects">;
  title: string;
  logline?: string;
  posterUrl?: string;
  resolvedPosterUrl?: string; // URL from storage for uploaded images
  releaseYear?: number;
  roleName?: string;
  status?: string;
  primaryWatchUrl?: string;
  primaryWatchLabel?: string;
  trailerUrl?: string; // YouTube trailer URL for hero player
};

type Clip = {
  _id: Id<"clips">;
  projectId?: Id<"projects">;
  youtubeUrl: string;
};

type FilmographySliderProps = {
  projects: Project[];
  clips?: Clip[];
  primaryColor?: string;
  selectedProjectId?: Id<"projects"> | null;
  onSelectProject?: (projectId: Id<"projects">) => void;
};

// Component to handle poster image with error fallback
function PosterImage({ src, alt }: { src: string; alt: string }) {
  const [hasError, setHasError] = useState(false);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  if (hasError || !src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
        <svg
          className="w-16 h-16 text-slate-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
          />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      onError={handleError}
    />
  );
}

export const FilmographySlider: FC<FilmographySliderProps> = ({
  projects,
  clips = [],
  primaryColor = "#FF1744",
  selectedProjectId,
  onSelectProject,
}) => {
  // Build a map of projectId -> clip for quick lookup
  const projectClipMap = useMemo(() => {
    const map = new Map<string, Clip>();
    clips.forEach((clip) => {
      if (clip.projectId) {
        map.set(clip.projectId, clip);
      }
    });
    return map;
  }, [clips]);

  if (projects.length === 0) return null;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAdjustingRef = useRef(false);

  const loopedProjects = useMemo(
    () => [...projects, ...projects, ...projects],
    [projects]
  );

  const ensureLoopingScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || isAdjustingRef.current) return;

    const totalScrollWidth = container.scrollWidth;
    const segmentWidth = totalScrollWidth / 3; // because we render 3 copies
    const current = container.scrollLeft;

    if (current < segmentWidth * 0.5) {
      isAdjustingRef.current = true;
      container.scrollLeft = current + segmentWidth;
      requestAnimationFrame(() => {
        isAdjustingRef.current = false;
      });
    } else if (current > segmentWidth * 2.5) {
      isAdjustingRef.current = true;
      container.scrollLeft = current - segmentWidth;
      requestAnimationFrame(() => {
        isAdjustingRef.current = false;
      });
    }
  }, []);

  // Initialize scroll position to the middle copy so we can scroll in both directions
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const segmentWidth = container.scrollWidth / 3;
    container.scrollLeft = segmentWidth;
  }, [projects.length]);

  // Watch scroll position and reset when we reach the edges of the middle copy
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => ensureLoopingScrollPosition();
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [ensureLoopingScrollPosition]);

  return (
    <section className="bg-[#05040A] py-12">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Filmography</h2>
          <p className="text-sm text-slate-500">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Horizontal scroll container */}
        <div className="relative -mx-4 px-4">
          <div
            ref={scrollContainerRef}
            className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {loopedProjects.map((project, index) => {
              // Check for trailer in clips OR in project's trailerUrl field
              const hasTrailer = projectClipMap.has(project._id) || Boolean(project.trailerUrl);
              const isSelected = selectedProjectId === project._id;

              return (
                <div
                  key={`${project._id}-${index}`}
                  className="flex-shrink-0 snap-start w-[260px] sm:w-[280px] md:w-[300px]"
                >
                  <div
                    className={`group relative overflow-hidden rounded-xl border bg-[#0c0911] transition-all duration-300 hover:shadow-lg hover:shadow-black/40 ${
                      isSelected
                        ? "border-2 ring-2 ring-offset-2 ring-offset-black"
                        : "border-white/5 hover:border-white/20"
                    }`}
                    style={{
                      borderColor: isSelected ? primaryColor : undefined,
                      ringColor: isSelected ? primaryColor : undefined,
                    }}
                  >
                    {/* Selected indicator */}
                    {isSelected && (
                      <div
                        className="absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white shadow-lg"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <Play className="w-3 h-3" fill="currentColor" />
                        Now Playing
                      </div>
                    )}

                    {/* Poster */}
                    <div className="relative aspect-[2/3] bg-[#1d1725] overflow-hidden">
                      <PosterImage
                        src={project.resolvedPosterUrl || project.posterUrl || ""}
                        alt={project.title}
                      />

                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                      {/* Action buttons - show on hover */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 opacity-0 transition-all duration-300 group-hover:opacity-100">
                        {/* Play Trailer button - only if project has a trailer */}
                        {hasTrailer && onSelectProject && !isSelected && (
                          <button
                            onClick={() => onSelectProject(project._id)}
                            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform duration-200 hover:scale-105 bg-gradient-to-r from-carpet-red-800/90 via-carpet-red-600/90 to-red-500/80"
                          >
                            <Play className="w-4 h-4" fill="currentColor" />
                            Play Trailer
                          </button>
                        )}

                        {/* Watch CTA */}
                        {project.primaryWatchUrl && (
                          <a
                            href={project.primaryWatchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`rounded-full px-5 py-2 text-sm font-semibold shadow-lg transition-transform duration-200 hover:scale-105 ${
                              hasTrailer && !isSelected
                                ? "bg-white/20 text-white backdrop-blur-sm"
                                : "text-white bg-gradient-to-r from-carpet-red-800/90 via-carpet-red-600/90 to-red-500/80"
                            }`}
                          >
                            {project.primaryWatchLabel ?? "Watch Now"}
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-4">
                      <h3 className="font-semibold text-white line-clamp-1 group-hover:text-white/90 transition">
                        {project.title}
                      </h3>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        {project.releaseYear && (
                          <span>{project.releaseYear}</span>
                        )}
                        {project.roleName && (
                          <span className="rounded-full bg-white/5 px-2 py-0.5">
                            {project.roleName}
                          </span>
                        )}
                        {project.status && (
                          <span className="rounded-full border border-white/10 px-2 py-0.5 capitalize">
                            {project.status}
                          </span>
                        )}
                        {hasTrailer && (
                          <span
                            className="rounded-full px-2 py-0.5 text-white/90"
                            style={{ backgroundColor: `${primaryColor}40` }}
                          >
                            Has Trailer
                          </span>
                        )}
                      </div>

                      {project.logline && (
                        <p className="mt-3 text-xs text-slate-400 line-clamp-2">
                          {project.logline}
                        </p>
                      )}
                    </div>

                    {/* Accent border on hover */}
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-0.5 transition-opacity ${
                        isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                      style={{ backgroundColor: primaryColor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FilmographySlider;
