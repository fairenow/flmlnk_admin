import Image from "next/image";
import Link from "next/link";

const steps = [
  {
    title: "Create your Flmlnk page",
    detail:
      "Import your materials—poster, trailer, headshot, reel, or deck. Everything is formatted into a streaming-ready hub for the way you work.",
  },
  {
    title: "Distribute everywhere",
    detail:
      "Publish polished landing pages, EPKs, and private screeners with role-based access for reps, producers, and collaborators.",
  },
  {
    title: "Track momentum",
    detail:
      "View real-time engagement, invitation status, and team tasks in one dashboard built for film professionals instead of a patchwork of tools.",
  },
];

const highlights = [
  {
    heading: "Built for industry teams",
    copy: "Invite producers, department heads, talent, and reps with permissions tailored to their work.",
  },
  {
    heading: "Festival-ready instantly",
    copy: "Export clean, consistent pages that look great on any device and stay aligned with your brand.",
  },
  {
    heading: "Always on-brand",
    copy: "Use gradient accents, typography, and spacing that match the signup experience your audience sees first.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05040A] text-slate-100">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_15%_20%,rgba(255,23,68,0.2),transparent_45%),radial-gradient(circle_at_85%_10%,rgba(220,20,60,0.18),transparent_40%),radial-gradient(circle_at_50%_80%,rgba(0,0,0,0.3),transparent_35%)]" />
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(120deg,rgba(255,23,68,0.08),transparent_35%),linear-gradient(320deg,rgba(0,0,0,0.2),transparent_35%)]" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-8 pb-20 pt-16 space-y-16">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/white_flmlnk.png"
              alt="FLMLNK logo"
              width={120}
              height={32}
            />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/case-study"
              className="hidden sm:inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 font-medium text-white hover:border-white/30 hover:bg-white/10 transition"
            >
              Case study
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-gradient-to-r from-black via-carpet-red-600 to-carpet-red-500 px-4 py-2 font-semibold text-white shadow-lg shadow-carpet-red-600/30"
            >
              Start free
            </Link>
          </div>
        </header>

        <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-start rounded-3xl border border-white/10 bg-gradient-to-br from-black/50 via-[#0b0914]/80 to-black/60 p-8 shadow-[0_0_80px_rgba(255,23,68,0.08)]">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.3em] text-carpet-red-500">How it works</p>
            <h1 className="text-4xl sm:text-5xl font-semibold leading-tight text-white">
              The visibility system built for film professionals.
            </h1>
            <p className="text-lg text-white/70 max-w-2xl">
              From onboarding to analytics, every step uses the same bold gradients and crisp surfaces you see on our signup experience.
              Replace the broken, segmented workflow of links and slide decks with a single, cohesive system your collaborators can trust.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-black via-carpet-red-600 to-carpet-red-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-carpet-red-600/30"
              >
                Create my account
              </Link>
              <Link
                href="/case-study"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/10 transition"
              >
                See a real release
              </Link>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-black via-[#0f0a16] to-[#1a0f1f] backdrop-blur shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-carpet-red-500/10" />
            <div className="relative px-6 py-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-black to-carpet-red-500" />
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-white/60">Momentum</p>
                  <p className="text-lg font-semibold text-white">Live previews & alerts</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm text-white/70">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-3xl font-semibold text-white">14</p>
                  <p className="text-white/50">Active campaigns</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-3xl font-semibold text-white">92%</p>
                  <p className="text-white/50">Press kit completion</p>
                </div>
              </div>
              <p className="text-sm text-white/70">
                See previews for your film sites, invitations, and dashboard widgets before your team publishes them.
                Everything inherits the same gradients and typography from signup.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-start">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-black via-[#0f0a16] to-[#1a0f1f] p-8 shadow-[0_0_60px_rgba(255,23,68,0.08)]">
            <p className="text-sm font-semibold text-carpet-red-400 mb-6">Three steps, no guesswork</p>
            <div className="space-y-6">
              {steps.map((step, index) => (
                <div key={step.title} className="flex gap-4">
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-r from-black to-carpet-red-500 text-sm font-semibold text-white">
                    {index + 1}
                  </div>
                  <div className="space-y-2">
                    <p className="text-lg font-semibold text-white">{step.title}</p>
                    <p className="text-sm text-white/65 leading-relaxed">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-black via-[#1d0f24] to-[#0b0713] p-8 shadow-[0_0_60px_rgba(220,20,60,0.08)]">
            <p className="text-sm font-semibold text-carpet-red-400">Why industry teams stay with flmlnk</p>
            <div className="mt-6 space-y-5">
              {highlights.map((highlight) => (
                <div key={highlight.heading} className="rounded-xl border border-white/10 bg-black/40 p-4 shadow-[0_0_40px_rgba(0,0,0,0.35)]">
                  <p className="text-base font-semibold text-white">{highlight.heading}</p>
                  <p className="text-sm text-white/70 mt-1 leading-relaxed">{highlight.copy}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 inline-flex items-center gap-3 rounded-full bg-black/40 px-4 py-3 text-sm text-white/70 border border-white/10">
              <div className="h-2 w-2 rounded-full bg-carpet-red-500" />
              <span>Consistent UI from signup to dashboard keeps decision-makers focused on your work.</span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-gradient-to-r from-black via-[#0c0a12] to-black px-8 py-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 shadow-[0_0_80px_rgba(255,23,68,0.12)]">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.25em] text-carpet-red-500">Launch</p>
            <h2 className="text-2xl sm:text-3xl font-semibold text-white">Ready to see your work front and center?</h2>
            <p className="text-white/70 text-sm max-w-2xl">
              Use the same modern surfaces and gradients from our landing experience while you build your release funnel without switching tools.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-full bg-gradient-to-r from-black via-carpet-red-600 to-carpet-red-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-carpet-red-600/30"
            >
              Start free today
            </Link>
            <Link
              href="/case-study"
              className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/10 transition"
            >
              Explore case study
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
