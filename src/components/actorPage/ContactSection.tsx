"use client";

import type { FC } from "react";
import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { DirectBookingForm } from "./DirectBookingForm";
import { FollowTheJourney } from "./FollowTheJourney";

type Socials = {
  instagram?: string;
  facebook?: string;
  youtube?: string;
  tiktok?: string;
  imdb?: string;
  website?: string;
};

type ContactSectionProps = {
  displayName: string;
  socials: Socials;
  actorProfileId: Id<"actor_profiles">;
  primaryColor?: string;
  onConnectClick?: () => void;
};

export const ContactSection: FC<ContactSectionProps> = ({
  displayName,
  socials,
  actorProfileId,
  primaryColor = "#FF1744",
  onConnectClick,
}) => {
  const submitInquiry = useMutation(api.inquiries.submitBookingInquiry);

  const handleBookingSubmit = useCallback(
    async (data: {
      name: string;
      email: string;
      projectType: string;
      message: string;
    }) => {
      await submitInquiry({
        actorProfileId,
        name: data.name,
        email: data.email,
        projectType: data.projectType,
        message: data.message,
      });
    },
    [submitInquiry, actorProfileId]
  );

  return (
    <section className="min-h-[50vh] bg-[#05040A] py-12">
      <div className="mx-auto max-w-6xl px-4">
        {/* Header */}
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">
            Work with {displayName}
          </h2>
          <p className="text-slate-400">
            Interested in collaborating? Get in touch or follow along.
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left: Booking Form */}
          <DirectBookingForm
            actorName={displayName}
            primaryColor={primaryColor}
            onSubmit={handleBookingSubmit}
          />

          {/* Right: Follow & Connect */}
          <FollowTheJourney
            socials={socials}
            primaryColor={primaryColor}
            onEmailSignup={onConnectClick}
            actorProfileId={actorProfileId}
          />
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
