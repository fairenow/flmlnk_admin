"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";

export default function ActorPageDebugger() {
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-slate-400">Not available in production.</p>
      </main>
    );
  }

  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const data = useQuery(api.devDebug.getActorPageBySlug, { slug });

  if (data === undefined) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading actor page data…</p>
      </main>
    );
  }

  if (data === null) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-slate-400">
          No actor page found for <span className="font-mono">{slug}</span>.
        </p>
      </main>
    );
  }

  const clipCount = data.clips.length;
  const projectCount = data.notableProjects.length;

  return (
    <main className="min-h-screen bg-slate-950 text-white px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Actor page debug: {slug}</h1>
          <p className="text-sm text-slate-400">
            Slug: <span className="font-mono">{slug}</span> • Projects: {projectCount} • Clips: {clipCount}
          </p>
        </header>

        <section className="rounded-xl bg-slate-900 border border-slate-800 p-4">
          <pre className="overflow-x-auto text-xs leading-relaxed">
            {JSON.stringify(data, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}
