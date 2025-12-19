import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | FlmLnk",
  description: "Review the terms of service that govern your use of FlmLnk.",
};

const termsSections = [
  {
    title: "Acceptance of Terms",
    content:
      "By accessing or using FlmLnk, you agree to these Terms of Service and our Privacy Policy. If you do not agree, please discontinue use of the platform.",
  },
  {
    title: "Use of the Service",
    content:
      "You may use FlmLnk only for lawful purposes and in accordance with these terms. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.",
  },
  {
    title: "User Content",
    content:
      "You retain ownership of content you upload or create while using FlmLnk. By posting content, you grant us a limited license to host and display it as necessary to operate the service.",
  },
  {
    title: "Prohibited Activities",
    content:
      "Do not engage in activities that could harm the platform or other users, including uploading malicious code, attempting unauthorized access, or violating intellectual property rights.",
  },
  {
    title: "Termination",
    content:
      "We may suspend or terminate access to FlmLnk if we reasonably believe you have violated these terms or pose a risk to the platform or community.",
  },
  {
    title: "Changes to Terms",
    content:
      "We may update these terms from time to time. Continued use of FlmLnk after changes become effective constitutes acceptance of the revised terms.",
  },
];

export default function TermsPage() {
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
            <span className="text-white">Terms of Service</span>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-red-400">Legal</p>
              <h1 className="text-3xl sm:text-4xl font-semibold">Terms of Service</h1>
              <p className="text-gray-400 max-w-2xl">
                These Terms of Service outline the rules and guidelines for using FlmLnk. Please
                review them carefully to understand your rights and responsibilities.
              </p>
              <p className="text-sm text-gray-500">Last updated: November 2024</p>
            </div>

            <div className="grid gap-4">
              {termsSections.map((section) => (
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
              <h3 className="text-lg font-semibold mb-2">Questions?</h3>
              <p className="text-gray-300">
                If you have any questions about these terms, please reach out to our team at
                <span className="text-red-300"> support@flmlnk.com</span>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
