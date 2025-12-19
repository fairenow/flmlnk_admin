export type OnboardingStepId =
  | "your-info"
  | "imdb"
  | "trailer"
  | "clips"
  | "socials"
  | "streaming"
  | "generate";

export const ONBOARDING_STEPS: {
  id: OnboardingStepId;
  label: string;
  path: string;
}[] = [
  {
    id: "your-info",
    label: "Your info",
    path: "/onboarding/01-your-info",
  },
  { id: "imdb", label: "IMDb", path: "/onboarding/02-imdb" },
  { id: "trailer", label: "Trailer", path: "/onboarding/03-trailer" },
  { id: "clips", label: "Clips", path: "/onboarding/04-clips" },
  { id: "socials", label: "Socials", path: "/onboarding/05-socials" },
  {
    id: "streaming",
    label: "Streaming",
    path: "/onboarding/06-streaming",
  },
  {
    id: "generate",
    label: "Generate",
    path: "/onboarding/07-generate",
  },
];
