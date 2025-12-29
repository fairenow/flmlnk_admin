"use client";

import type { FC } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { Film, Video, Briefcase, Tv, Theater } from "lucide-react";

type Socials = {
  instagram?: string;
  facebook?: string;
  youtube?: string;
  tiktok?: string;
  imdb?: string;
  website?: string;
};

type CareerHighlight = {
  icon: string;
  title: string;
  subtitle?: string;
};

type NotableProject = {
  _id: Id<"notable_projects"> | Id<"projects">;
  title: string;
  posterUrl?: string;
  platformUrl?: string;
  releaseYear?: number;
  roleName?: string;
  type?: 'film' | 'television' | 'theater';
};

type AboutSectionProps = {
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  socials: Socials;
  primaryColor?: string;
  careerHighlights?: CareerHighlight[];
  genres?: string[];
  yearsActive?: number;
  notableProjects?: NotableProject[];
  actingPhilosophy?: string;
  personalInterests?: string[];
};

export const AboutSection: FC<AboutSectionProps> = ({
  displayName = "Actor",
  avatarUrl,
  bio,
  location,
  socials: _socials,
  primaryColor = "#FF1744",
  careerHighlights = [],
  genres = [],
  yearsActive = 0,
  notableProjects = [],
  actingPhilosophy,
  personalInterests = [],
}) => {
  const hasContent = bio || careerHighlights.length > 0 || notableProjects.length > 0 || actingPhilosophy;
  if (!hasContent) return null;

  // Default career highlights if none provided
  const defaultHighlights: CareerHighlight[] = [
    { icon: "film", title: "Film & Theater Productions", subtitle: "Dynamic range across genres" },
    { icon: "video", title: "Content Creator", subtitle: "Developing independent stories" },
    { icon: "briefcase", title: "Entrepreneur", subtitle: "Business ventures & consulting" },
  ];

  const displayHighlights = careerHighlights.length > 0 ? careerHighlights : defaultHighlights;

  // Parse bio into paragraphs
  const bioParagraphs = bio ? bio.split('\n\n').filter(p => p.trim()) : [];

  const getIconComponent = (iconName: string) => {
    switch (iconName.toLowerCase()) {
      case 'film': return Film;
      case 'video': return Video;
      case 'briefcase': return Briefcase;
      case 'tv': return Tv;
      case 'theater': return Theater;
      default: return Film;
    }
  };

  return (
    <section className="bg-black text-white py-8 md:py-16 px-4 md:px-6 lg:px-12">
      <div className="max-w-7xl mx-auto">
        <div className="animate-fadeIn">
          <div className="space-y-8">
            <div className="grid md:grid-cols-2 gap-8">
              {/* Personal Story - Left Column */}
              <div>
                {/* Actor Photo with glow effect */}
                {avatarUrl && (
                  <div className="mb-6">
                    <div className="relative group inline-block">
                      <div
                        className="absolute -inset-0.5 rounded-full blur opacity-50 group-hover:opacity-75 transition duration-1000"
                        style={{ background: `linear-gradient(to right, ${primaryColor}, #ec4899)` }}
                      />
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        className="relative w-24 h-24 md:w-32 md:h-32 rounded-full object-cover border-4 border-black"
                      />
                    </div>
                  </div>
                )}

                <h3 className="text-2xl font-bold text-white mb-4">About {displayName}</h3>
                <div className="space-y-4 text-gray-300">
                  {bioParagraphs.length > 0 ? (
                    bioParagraphs.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))
                  ) : bio ? (
                    <p>{bio}</p>
                  ) : null}
                </div>

                {/* Acting Philosophy */}
                {actingPhilosophy && (
                  <div className="mt-6">
                    <h4 className="text-lg font-semibold text-white mb-3">Philosophy</h4>
                    <p className="text-gray-300 italic">
                      "{actingPhilosophy}"
                    </p>
                  </div>
                )}
              </div>

              {/* Career Highlights & Stats - Right Column */}
              <div>
                <h3 className="text-2xl font-bold text-white mb-4">Career Highlights</h3>
                <div className="space-y-4">
                  {displayHighlights.map((highlight, index) => {
                    const IconComponent = getIconComponent(highlight.icon);
                    return (
                      <div key={index} className="flex items-center gap-4">
                        <div
                          className="w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-br from-carpet-red-800/90 via-carpet-red-600/90 to-red-500/80"
                        >
                          <IconComponent className="w-8 h-8 text-white" />
                        </div>
                        <div>
                          <h4 className="text-white font-semibold">{highlight.title}</h4>
                          {highlight.subtitle && (
                            <p className="text-gray-400 text-sm">{highlight.subtitle}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Personal Interests */}
                {personalInterests.length > 0 && (
                  <div className="mt-8">
                    <h4 className="text-lg font-semibold text-white mb-3">Personal Interests</h4>
                    <div className="space-y-2 text-gray-300">
                      {personalInterests.map((interest, index) => (
                        <p key={index}>• {interest}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Stats */}
                <div className="mt-8 bg-slate-900/50 rounded-lg p-4">
                  <h4 className="text-lg font-semibold text-white mb-3">Quick Stats</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {notableProjects.length > 0 && (
                      <div>
                        <span className="text-gray-400">Productions:</span>
                        <span className="text-white ml-2">{notableProjects.length}+</span>
                      </div>
                    )}
                    {yearsActive > 0 && (
                      <div>
                        <span className="text-gray-400">Years Active:</span>
                        <span className="text-white ml-2">{yearsActive}+</span>
                      </div>
                    )}
                    {genres.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-gray-400">Genres:</span>
                        <span className="text-white ml-2">{genres.join(', ')}</span>
                      </div>
                    )}
                    {location && (
                      <div className="col-span-2">
                        <span className="text-gray-400">Based in:</span>
                        <span className="text-white ml-2">{location}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Notable Projects Carousel */}
            {notableProjects.length > 0 && (
              <div className="mt-12">
                <h3 className="text-2xl font-bold text-white mb-6">Notable Projects</h3>
                <div className="relative">
                  <div
                    className="flex gap-4 overflow-x-auto pb-4"
                    style={{
                      scrollBehavior: 'smooth',
                      scrollbarWidth: 'none',
                      msOverflowStyle: 'none'
                    }}
                  >
                    {notableProjects.map((project) => (
                      <a
                        key={String(project._id)}
                        href={project.platformUrl || '#'}
                        target={project.platformUrl ? "_blank" : undefined}
                        rel="noopener noreferrer"
                        className="relative group flex-shrink-0 cursor-pointer"
                      >
                        {/* Project Image */}
                        <div className="relative">
                          <div
                            className="absolute -inset-0.5 rounded-full opacity-0 group-hover:opacity-100 transition duration-300"
                            style={{ background: `linear-gradient(to right, ${primaryColor}80, #ec489980)` }}
                          />
                          {project.posterUrl ? (
                            <img
                              src={project.posterUrl}
                              alt={project.title}
                              className="relative w-28 h-28 md:w-32 md:h-32 rounded-full object-cover border-2 transition-all duration-300"
                              style={{
                                borderColor: `${primaryColor}50`,
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.borderColor = primaryColor)}
                              onMouseLeave={(e) => (e.currentTarget.style.borderColor = `${primaryColor}50`)}
                            />
                          ) : (
                            <div
                              className="relative w-28 h-28 md:w-32 md:h-32 rounded-full flex items-center justify-center border-2 bg-slate-800"
                              style={{ borderColor: `${primaryColor}50` }}
                            >
                              <Film className="w-10 h-10 text-gray-500" />
                            </div>
                          )}

                          {/* Type Icon Badge */}
                          <div
                            className="absolute bottom-0 right-0 w-8 h-8 bg-black rounded-full flex items-center justify-center border-2"
                            style={{ borderColor: primaryColor }}
                          >
                            {project.type === 'television' && <Tv className="w-4 h-4 text-white" />}
                            {project.type === 'theater' && <Theater className="w-4 h-4 text-white" />}
                            {(!project.type || project.type === 'film') && <Film className="w-4 h-4 text-white" />}
                          </div>
                        </div>

                        {/* Project Info on Hover */}
                        <div className="absolute inset-0 rounded-full bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center p-2 text-center">
                          <h4 className="text-white font-semibold text-xs md:text-sm mb-1 line-clamp-2">{project.title}</h4>
                          {project.releaseYear && (
                            <p className="text-red-400 text-xs">{project.releaseYear}</p>
                          )}
                          {project.roleName && (
                            <p className="text-gray-400 text-xs line-clamp-1">{project.roleName}</p>
                          )}
                          {project.platformUrl && (
                            <p style={{ color: primaryColor }} className="text-xs mt-1">Watch Now</p>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </section>
  );
};

export default AboutSection;
