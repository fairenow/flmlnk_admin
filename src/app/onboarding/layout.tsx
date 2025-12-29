import type { Metadata } from "next";
import type { ReactNode } from "react";

import { OnboardingProvider } from "./OnboardingContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

export const metadata: Metadata = {
  title: "Onboarding | FLMLNK",
  description: "Multi-step filmmaker onboarding for FLMLNK.",
};

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <OnboardingProvider>{children}</OnboardingProvider>
    </ThemeProvider>
  );
}
