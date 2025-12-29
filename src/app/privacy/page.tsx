import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | FlmLnk",
  description: "Learn how FlmLnk collects, uses, and protects your information.",
};

const privacySections = [
  {
    title: "Information We Collect",
    content:
      "We collect information you provide directly, such as account details and project data, as well as limited technical data like device type and usage patterns to improve the platform.",
  },
  {
    title: "How We Use Information",
    content:
      "Your information is used to operate and improve FlmLnk, provide customer support, and communicate updates about the service. We do not sell your personal data.",
  },
  {
    title: "Sharing and Disclosure",
    content:
      "We may share information with trusted service providers who help us deliver FlmLnk. We may also disclose data if required by law or to protect the rights and safety of our users.",
  },
  {
    title: "Data Security",
    content:
      "We use administrative, technical, and physical safeguards to protect your information. While no system is entirely secure, we work to keep your data safe.",
  },
  {
    title: "Your Choices",
    content:
      "You can update or delete your account information at any time. You may also opt out of non-essential communications from us.",
  },
  {
    title: "Contact Us",
    content:
      "If you have privacy-related questions or requests, contact our team at support@flmlnk.com.",
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
                Your privacy matters to us. This Privacy Policy explains the data we collect, how we use it,
                and the choices you have regarding your information.
              </p>
              <p className="text-sm text-gray-500">Last updated: November 2024</p>
            </div>

            <div className="grid gap-4">
              {privacySections.map((section) => (
                <section
                  key={section.title}
                  className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 shadow-lg shadow-red-900/10"
                >
                  <h2 className="text-xl font-semibold mb-2">{section.title}</h2>
                  <p className="text-gray-300 leading-relaxed">{section.content}</p>
                </section>
              ))}
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-red-600/20 to-red-800/20 p-6">
              <h3 className="text-lg font-semibold mb-2">Staying Informed</h3>
              <p className="text-gray-300">
                We may update this policy as FlmLnk evolves. Significant changes will be communicated through the app
                or via email. Please review this page periodically to stay informed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
