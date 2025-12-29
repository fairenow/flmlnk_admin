import type { FC } from "react";

type MetadataBadgesProps = {
  matchScore?: number | null;
  releaseYear?: number | null;
  ratingCategory?: string | null;
  formatTags?: string[];
  status?: string | null;
};

export const MetadataBadges: FC<MetadataBadgesProps> = ({
  matchScore,
  releaseYear,
  ratingCategory,
  formatTags = [],
  status,
}) => {
  // Filter out empty values
  const hasMatchScore = typeof matchScore === "number" && matchScore > 0;
  const hasYear = typeof releaseYear === "number" && releaseYear > 0;
  const hasRating = typeof ratingCategory === "string" && ratingCategory.trim() !== "";
  const hasTags = formatTags.length > 0;
  const hasStatus = typeof status === "string" && status.trim() !== "";

  // If nothing to show, return null
  if (!hasMatchScore && !hasYear && !hasRating && !hasTags && !hasStatus) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm md:gap-3">
      {/* Match Score - Green like Netflix */}
      {hasMatchScore && (
        <span className="font-bold text-[#46d369]">{matchScore}% Match</span>
      )}

      {/* Release Year */}
      {hasYear && (
        <span className="text-white/90">{releaseYear}</span>
      )}

      {/* Status (if not released) */}
      {hasStatus && status !== "released" && (
        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium capitalize text-amber-400">
          {status}
        </span>
      )}

      {/* Rating Category - Bordered pill like Netflix */}
      {hasRating && (
        <span className="rounded border border-white/40 px-2 py-0.5 text-xs font-medium text-white/90">
          {ratingCategory}
        </span>
      )}

      {/* Format Tags - IMAX, 3D, Dolby Atmos, 4K HDR etc */}
      {hasTags &&
        formatTags.map((tag) => (
          <span
            key={tag}
            className="rounded border border-white/30 bg-white/10 px-2 py-0.5 text-xs font-medium text-white/80"
          >
            {tag}
          </span>
        ))}
    </div>
  );
};

export default MetadataBadges;
