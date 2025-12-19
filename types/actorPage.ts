export type ActorPage = {
  profile: ActorProfile;
  featuredProject: FeaturedProject;
  clips: Clip[];
  notableProjects: NotableProject[];
  comments: CommentThread[];
  theme: ActorTheme;
  settings: ActorPageSettings;
};

export type ActorProfile = {
  slug: string;
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  socials: ActorSocialLinks;
};

export type ActorSocialLinks = {
  imdb?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  website?: string;
  linkedin?: string;
};

export type FeaturedProject = {
  title: string;
  logline: string;
  description: string;
  releaseYear: number | null;
  status: string | null;
  matchScore: number | null;
  ratingCategory: string | null;
  formatTags: string[];
  posterUrl: string | null;
  watchCtaText: string;
  watchCtaUrl: string;
  platforms: PlatformLink[];
};

export type PlatformLink = {
  key: string;
  label: string;
  url: string;
};

export type Clip = {
  id: string;
  title: string;
  youtubeUrl: string;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  isFeatured: boolean;
  sortOrder: number;
  deepLinkId?: string;
};

export type NotableProject = {
  id: string;
  title: string;
  posterUrl: string | null;
  platformUrl: string | null;
  releaseYear: number | null;
};

export type CommentThread = {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: number;
  parentId?: string | null;
  likes: number;
};

export type ActorTheme = {
  primaryColor?: string;
  accentColor?: string;
  layoutVariant?: string;
};

export type ActorPageSettings = {
  enableComments: boolean;
  enableEmailCapture: boolean;
  clipSharingEnabled: boolean;
};
