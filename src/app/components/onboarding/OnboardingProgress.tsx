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
    "url";

  const currentIndex = Math.max(ONBOARDING_STEPS.findIndex((s) => s.id === current), 0);

  return (
    <div className="flex items-center gap-3">
      {ONBOARDING_STEPS.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isUpcoming = index > currentIndex;

        return (
          <div
            key={step.id}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              isComplete
                ? "bg-[#B91C1C]"
                : isCurrent
                  ? "bg-[#B91C1C]"
                  : "bg-slate-200"
            }`}
          />
        );
      })}
    </div>
  );
}
