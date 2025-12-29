import Image from "next/image";
import Link from "next/link";

const metrics = [
  { label: "Festival selections", value: "11" },
  { label: "Press opens", value: "4.2k" },
  { label: "Investor replies", value: "38" },
  { label: "Watch-through", value: "78%" },
];

const timeline = [
  {
    heading: "Week 1 — Align the brand",
    copy: "We ported the film's artwork into the flmlnk signup theme and used the same gradients across the press kit and screeners.",
  },
  {
    heading: "Week 3 — Share confidently",
    copy: "Private links, review copies, and role-based invites let the producers and sales agent coordinate without email chaos.",
  },
  {
    heading: "Week 5 — Measure & adapt",
    copy: "Live dashboards showed which outlets were opening the kit and who needed follow-ups, mirroring the clarity of the signup UI.",
  },
];

export default function CaseStudyPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05040A] text-slate-100">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_18%_20%,rgba(255,23,68,0.2),transparent_45%),radial-gradient(circle_at_82%_12%,rgba(220,20,60,0.18),transparent_40%),radial-gradient(circle_at_50%_78%,rgba(0,0,0,0.3),transparent_35%)]" />
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
              href="/how-it-works"
              className="hidden sm:inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 font-medium text-white hover:border-white/30 hover:bg-white/10 transition"
            >
              How it works
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
            <p className="text-xs uppercase tracking-[0.3em] text-carpet-red-500">Case study</p>
            <h1 className="text-4xl sm:text-5xl font-semibold leading-tight text-white">
              How a debut feature sold out its first screening.
            </h1>
            <p className="text-lg text-white/70 max-w-2xl">
              The producers, talent, and sales partners behind <span className="text-white">"Northern Passage"</span> built their
              entire outreach workflow on the same interface new users meet on signup. Flmlnk replaced scattered links and PDF kits with a
              systematic, on-brand experience their industry contacts could trust.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/how-it-works"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/10 transition"
              >
                See the playbook
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-black via-carpet-red-600 to-carpet-red-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-carpet-red-600/30"
              >
                Start my release
              </Link>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-black via-[#0f0a16] to-[#1a0f1f] backdrop-blur shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-carpet-red-500/10" />
            <div className="relative px-6 py-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-black to-carpet-red-500" />
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-white/60">Spotlight</p>
                  <p className="text-lg font-semibold text-white">"Northern Passage" assets</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm text-white/70">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-3xl font-semibold text-white">4</p>
                  <p className="text-white/50">Screeners prepared</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-3xl font-semibold text-white">9</p>
                  <p className="text-white/50">Team collaborators</p>
                </div>
              </div>
              <p className="text-sm text-white/70">
                Producers and reps reused the signup gradients to keep their press kit, screener invites, and investor follow-ups on-brand.
                The familiarity increased trust with every link they shared while keeping the team out of fragmented tools.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-black via-[#0f0a16] to-[#1a0f1f] p-8 shadow-[0_0_60px_rgba(255,23,68,0.08)]">
          <p className="text-sm font-semibold text-carpet-red-400 mb-4">Outcomes</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-xl border border-white/10 bg-black/40 p-4">
                <p className="text-3xl font-semibold text-white">{metric.value}</p>
                <p className="text-xs uppercase tracking-[0.2em] text-white/50 mt-1">{metric.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-start">
          <div className="space-y-5 rounded-2xl border border-white/10 bg-gradient-to-br from-black via-[#0f0a16] to-[#1a0f1f] p-8 shadow-[0_0_60px_rgba(255,23,68,0.08)]">
            <p className="text-sm font-semibold text-carpet-red-400">Release timeline</p>
            <div className="space-y-5">
              {timeline.map((item) => (
                <div key={item.heading} className="rounded-xl border border-white/10 bg-black/40 p-4 shadow-[0_0_40px_rgba(0,0,0,0.35)]">
                  <p className="text-base font-semibold text-white">{item.heading}</p>
                  <p className="text-sm text-white/70 mt-1 leading-relaxed">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-black via-[#1d0f24] to-[#0b0713] px-7 py-8 space-y-4 shadow-[0_0_80px_rgba(220,20,60,0.08)]">
            <p className="text-sm uppercase tracking-[0.25em] text-carpet-red-500">Creator quote</p>
            <p className="text-xl font-semibold text-white">
              "Keeping our site, press kit, and invites on the same design system as the signup page made us look like a
              premiere-ready team. We spent more time pitching and less time fixing slides."
            </p>
            <p className="text-sm text-white/60">— Dalia Chen, Producer</p>
            <div className="inline-flex items-center gap-3 rounded-full bg-black/40 px-4 py-3 text-sm text-white/70 border border-white/10">
              <div className="h-2 w-2 rounded-full bg-carpet-red-500" />
              <span>Brand consistency lifted their response rate across every list they contacted.</span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-gradient-to-r from-black via-[#0c0a12] to-black px-8 py-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 shadow-[0_0_80px_rgba(255,23,68,0.12)]">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.25em] text-carpet-red-500">Start now</p>
            <h2 className="text-2xl sm:text-3xl font-semibold text-white">Bring the same energy to your own release.</h2>
            <p className="text-white/70 text-sm max-w-2xl">
              Reuse the gradients, spacing, and crisp typography from the signup experience to carry your story through every link.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-full bg-gradient-to-r from-black via-carpet-red-600 to-carpet-red-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-carpet-red-600/30"
            >
              Create your account
            </Link>
            <Link
              href="/how-it-works"
              className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/10 transition"
            >
              See how it works
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
