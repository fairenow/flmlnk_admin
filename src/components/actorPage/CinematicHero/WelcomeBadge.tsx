import type { FC } from "react";

type WelcomeBadgeProps = {
  displayName: string;
  avatarUrl?: string;
  primaryColor?: string;
};

export const WelcomeBadge: FC<WelcomeBadgeProps> = ({
  displayName,
  avatarUrl,
  primaryColor = "#22c55e", // Green default like Robert Q
}) => {
  const firstName = displayName.split(" ")[0].toUpperCase();

  return (
    <div className="flex items-center gap-3">
      {/* Avatar */}
      <div className="relative">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="h-10 w-10 rounded-full border-2 border-white/20 object-cover shadow-lg md:h-12 md:w-12"
          />
        ) : (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/20 text-lg font-bold text-white shadow-lg md:h-12 md:w-12"
            style={{ backgroundColor: primaryColor }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Welcome Badge */}
      <div
        className="rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg md:text-sm"
        style={{ backgroundColor: primaryColor }}
      >
        WELCOME TO {firstName}&apos;S FLMLNK PAGE!
      </div>
    </div>
  );
};

export default WelcomeBadge;
