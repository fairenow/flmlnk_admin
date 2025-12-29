export type OnboardingStepId =
  | "url"
  | "trailer"
  | "socials";

export const ONBOARDING_STEPS: {
  id: OnboardingStepId;
  label: string;
  path: string;
}[] = [
  {
    id: "url",
    label: "Your URL",
    path: "/onboarding/01-url",
  },
  {
    id: "trailer",
    label: "Trailer",
    path: "/onboarding/02-trailer",
  },
  {
    id: "socials",
    label: "Socials",
    path: "/onboarding/03-socials",
  },
];
