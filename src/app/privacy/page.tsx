import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | FLMLNK",
  description: "Learn how FLMLNK collects, uses, and protects your personal information.",
};

const privacySections = [
  {
    title: "1. Introduction",
    content: `FLMLNK ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform and services (collectively, the "Service"). Please read this Privacy Policy carefully. By using the Service, you consent to the data practices described in this policy. If you do not agree with the terms of this Privacy Policy, please do not access or use the Service.`,
  },
  {
    title: "2. Information We Collect",
    content: `We collect information in several ways:

Personal Information You Provide: When you create an account, we collect your name, email address, and password. If you subscribe to a paid plan, we collect payment information (processed securely through third-party payment processors). You may also provide profile information, including profile pictures, biographical information, and professional details.

Content You Upload: We collect and store the content you upload to the Service, including videos, images, trailers, metadata, and any other materials you submit.

Automatically Collected Information: When you access the Service, we automatically collect device information (browser type, operating system, device identifiers), IP address, access times and dates, pages viewed, referring URLs, and usage patterns and interactions with the Service.

Cookies and Tracking Technologies: We use cookies, web beacons, and similar technologies to collect information about your browsing activities. You can manage cookie preferences through your browser settings.`,
  },
  {
    title: "3. How We Use Your Information",
    content: `We use the information we collect for various purposes, including:

Service Operations: To create and manage your account, process transactions and payments, provide customer support, deliver the features and functionality of the Service, and personalize your experience.

Communications: To send you service-related notices and updates, respond to your inquiries and requests, send promotional communications (with your consent), and notify you about changes to our Service or policies.

Analytics and Improvement: To analyze usage patterns and trends, improve and optimize the Service, develop new features and services, and conduct research and analysis.

Legal and Security: To comply with legal obligations, enforce our Terms of Service, protect against fraudulent or illegal activity, and ensure the security of the Service.`,
  },
  {
    title: "4. How We Share Your Information",
    content: `We may share your information in the following circumstances:

Service Providers: We share information with third-party vendors who perform services on our behalf, such as payment processing, data analysis, email delivery, hosting services, and customer service. These providers are contractually obligated to protect your information.

Business Transfers: If FLMLNK is involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will notify you of any change in ownership or uses of your personal information.

Legal Requirements: We may disclose your information if required to do so by law or in response to valid requests by public authorities (e.g., court orders, subpoenas, or government agencies).

Protection of Rights: We may disclose information when we believe disclosure is necessary to protect our rights, your safety or the safety of others, investigate fraud, or respond to a government request.

With Your Consent: We may share your information for other purposes with your explicit consent.

We do not sell your personal information to third parties.`,
  },
  {
    title: "5. Data Retention",
    content: `We retain your personal information for as long as your account is active or as needed to provide you with the Service. We may also retain and use your information as necessary to comply with legal obligations, resolve disputes, and enforce our agreements. When you delete your account, we will delete or anonymize your personal information within a reasonable timeframe, unless we are required to retain it for legal purposes. Backup copies may persist for a limited period as part of our disaster recovery procedures.`,
  },
  {
    title: "6. Data Security",
    content: `We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. These measures include encryption of data in transit and at rest, secure server infrastructure, regular security assessments, access controls and authentication procedures, and employee training on data protection.

However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to protect your personal information, we cannot guarantee its absolute security. You are responsible for maintaining the confidentiality of your account credentials.`,
  },
  {
    title: "7. Your Rights and Choices",
    content: `Depending on your location, you may have certain rights regarding your personal information:

Access: You can request a copy of the personal information we hold about you.

Correction: You can request that we correct inaccurate or incomplete information.

Deletion: You can request that we delete your personal information, subject to certain exceptions.

Data Portability: You can request a copy of your data in a structured, machine-readable format.

Opt-Out: You can opt out of receiving promotional communications by following the unsubscribe instructions in those messages or by adjusting your account settings.

Cookie Preferences: You can manage cookie preferences through your browser settings.

To exercise these rights, please contact us at support@flmlnk.com. We will respond to your request within a reasonable timeframe and in accordance with applicable law.`,
  },
  {
    title: "8. International Data Transfers",
    content: `FLMLNK is based in the United States, and your information may be transferred to, stored, and processed in the United States or other countries where our service providers operate. These countries may have data protection laws that differ from those in your country. By using the Service, you consent to the transfer of your information to the United States and other countries. We take appropriate safeguards to ensure that your personal information remains protected in accordance with this Privacy Policy.`,
  },
  {
    title: "9. Children's Privacy",
    content: `The Service is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take steps to delete such information promptly. If you believe that we may have collected information from a child under 13, please contact us at support@flmlnk.com.`,
  },
  {
    title: "10. Third-Party Links and Services",
    content: `The Service may contain links to third-party websites, services, or applications that are not operated by us. This Privacy Policy does not apply to those third-party services. We encourage you to review the privacy policies of any third-party services you access through our Service. We are not responsible for the content, privacy policies, or practices of third-party services.`,
  },
  {
    title: "11. California Privacy Rights",
    content: `If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):

Right to Know: You can request information about the categories and specific pieces of personal information we have collected, the sources of that information, our business purposes for collecting it, and the categories of third parties with whom we share it.

Right to Delete: You can request deletion of your personal information, subject to certain exceptions.

Right to Opt-Out: You have the right to opt out of the sale of your personal information. Note that we do not sell personal information.

Right to Non-Discrimination: We will not discriminate against you for exercising your CCPA rights.

To submit a request, please contact us at support@flmlnk.com. We may need to verify your identity before processing your request.`,
  },
  {
    title: "12. European Privacy Rights (GDPR)",
    content: `If you are located in the European Economic Area (EEA), United Kingdom, or Switzerland, you have additional rights under the General Data Protection Regulation (GDPR):

Legal Basis: We process your personal information based on your consent, the performance of a contract with you, compliance with legal obligations, or our legitimate interests (such as improving our Service).

Additional Rights: In addition to the rights listed in Section 7, you may have the right to restrict processing, object to processing based on legitimate interests, and lodge a complaint with a supervisory authority.

Data Protection Officer: For questions about our data practices or to exercise your rights, please contact us at support@flmlnk.com.`,
  },
  {
    title: "13. Changes to This Privacy Policy",
    content: `We may update this Privacy Policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons. When we make material changes, we will notify you by posting the updated policy on the Service with a new "Last updated" date, sending you an email notification (if you have provided your email), or displaying a prominent notice within the Service.

We encourage you to review this Privacy Policy periodically to stay informed about how we are protecting your information. Your continued use of the Service after any changes to this Privacy Policy constitutes your acceptance of the updated policy.`,
  },
  {
    title: "14. Contact Us",
    content: `If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at:

FLMLNK
Email: support@flmlnk.com

We will respond to your inquiry as soon as reasonably possible.`,
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-red-900/10 via-transparent to-red-900/5 blur-3xl" aria-hidden />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="flex items-center gap-3 text-sm text-gray-400 mb-4">
            <Link href="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-white">Privacy Policy</span>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-red-400">Legal</p>
              <h1 className="text-3xl sm:text-4xl font-semibold">Privacy Policy</h1>
              <p className="text-gray-400 max-w-2xl">
                Your privacy is important to us. This Privacy Policy explains how FLMLNK collects, uses,
                discloses, and safeguards your information when you use our platform.
              </p>
              <p className="text-sm text-gray-500">Last updated: December 2024</p>
            </div>

            <div className="grid gap-4">
              {privacySections.map((section) => (
                <section
                  key={section.title}
                  className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 shadow-lg shadow-red-900/10"
                >
                  <h2 className="text-xl font-semibold mb-3">{section.title}</h2>
                  <p className="text-gray-300 leading-relaxed whitespace-pre-line">{section.content}</p>
                </section>
              ))}
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-red-600/20 to-red-800/20 p-6">
              <h3 className="text-lg font-semibold mb-2">Your Privacy Matters</h3>
              <p className="text-gray-300">
                We are committed to protecting your privacy and being transparent about our data practices.
                If you have any questions or concerns about this Privacy Policy, please contact us at{" "}
                <a href="mailto:support@flmlnk.com" className="text-red-300 hover:text-red-200 underline">
                  support@flmlnk.com
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
