import type { FC, CSSProperties } from "react";

type Socials = {
  instagram?: string;
  facebook?: string;
  youtube?: string;
  tiktok?: string;
  imdb?: string;
  website?: string;
};

type SocialBarProps = {
  socials: Socials;
  className?: string;
  iconSize?: "sm" | "md" | "lg";
};

const SOCIAL_CONFIG: Record<
  keyof Socials,
  { label: string; icon: string; hoverColor: string }
> = {
  instagram: { label: "Instagram", icon: "IG", hoverColor: "#E4405F" },
  facebook: { label: "Facebook", icon: "FB", hoverColor: "#1877F2" },
  youtube: { label: "YouTube", icon: "YT", hoverColor: "#FF0000" },
  tiktok: { label: "TikTok", icon: "TT", hoverColor: "#000000" },
  imdb: { label: "IMDb", icon: "IMDb", hoverColor: "#F5C518" },
  website: { label: "Website", icon: "WEB", hoverColor: "#6366F1" },
};

const SIZE_CLASSES = {
  sm: "h-7 w-7 text-[9px]",
  md: "h-8 w-8 text-[10px]",
  lg: "h-10 w-10 text-xs",
};

export const SocialBar: FC<SocialBarProps> = ({
  socials,
  className = "",
  iconSize = "md",
}) => {
  const activeSocials = Object.entries(socials).filter(
    ([, url]) => url && url.trim(),
  ) as [keyof Socials, string][];

  if (activeSocials.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {activeSocials.map(([key, url]) => {
        const config = SOCIAL_CONFIG[key];
        return (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={config.label}
            className={`flex items-center justify-center rounded-full bg-white/10 font-semibold text-white/80 transition-all hover:scale-110 hover:bg-white/20 hover:text-white ${SIZE_CLASSES[iconSize]}`}
            style={{ "--hover-color": config.hoverColor } as CSSProperties}
          >
            {config.icon}
          </a>
        );
      })}
    </div>
  );
};

export default SocialBar;
