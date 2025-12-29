"use client";

import { usePathname } from "next/navigation";

import { ONBOARDING_STEPS } from "@/app/onboarding/steps";

interface Props {
  currentStepId?: string;
}

export function OnboardingProgress({ currentStepId }: Props) {
  const pathname = usePathname();
  const current =
    currentStepId ??
    ONBOARDING_STEPS.find((s) => s.path === pathname)?.id ??
    "your-info";

  const currentIndex = Math.max(ONBOARDING_STEPS.findIndex((s) => s.id === current), 0);

  return (
    <div className="flex items-center gap-2">
      {ONBOARDING_STEPS.map((step, index) => {
        const isActive = index <= currentIndex;
        return (
          <div
            key={step.id}
            className={`h-1 flex-1 rounded-full transition-colors ${
              isActive ? "bg-[#f53c56]" : "bg-slate-200"
            }`}
          />
        );
      })}
    </div>
  );
}
