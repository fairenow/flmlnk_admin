"use client";

import type { FC } from "react";
import type { Id } from "@convex/_generated/dataModel";

type NotableProject = {
  _id: Id<"notable_projects"> | Id<"projects">;
  title: string;
  posterUrl?: string;
  platformUrl?: string;
  releaseYear?: number;
};

type NotableProjectsCircularProps = {
  projects: NotableProject[];
  primaryColor?: string;
};

export const NotableProjectsCircular: FC<NotableProjectsCircularProps> = ({
  projects,
  primaryColor = "#FF1744",
}) => {
  if (projects.length === 0) return null;

  return (
    <div>
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Notable Projects
      </h3>
      <div className="flex flex-wrap gap-4">
        {projects.slice(0, 6).map((project) => {
          const Wrapper = project.platformUrl ? "a" : "div";
          const wrapperProps = project.platformUrl
            ? {
                href: project.platformUrl,
                target: "_blank",
                rel: "noopener noreferrer",
              }
            : {};

          return (
            <Wrapper
              key={project._id}
              {...wrapperProps}
              className="group flex flex-col items-center gap-2"
            >
              {/* Circular thumbnail */}
              <div
                className="relative h-16 w-16 overflow-hidden rounded-full border-2 transition-all group-hover:scale-105"
                style={{
                  borderColor: project.platformUrl
                    ? `${primaryColor}80`
                    : "rgba(255,255,255,0.1)",
                }}
              >
                {project.posterUrl ? (
                  <img
                    src={project.posterUrl}
                    alt={project.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white/10">
                    <span className="text-lg">🎬</span>
                  </div>
                )}

                {/* Hover overlay */}
                {project.platformUrl && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                    <svg
                      className="w-5 h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                )}
              </div>

              {/* Title */}
              <div className="max-w-[80px] text-center">
                <p className="text-xs text-slate-300 line-clamp-2 leading-tight">
                  {project.title}
                </p>
                {project.releaseYear && (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {project.releaseYear}
                  </p>
                )}
              </div>
            </Wrapper>
          );
        })}
      </div>
    </div>
  );
};

export default NotableProjectsCircular;
