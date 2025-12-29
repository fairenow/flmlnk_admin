"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

import { useSession } from "@/lib/auth-client";

export default function ActorSnapshotPage() {
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-slate-400">Not available in production.</p>
      </main>
    );
  }

  const { data: sessionData, isLoading: sessionLoading } = useSession();
  const snapshot = useQuery(api.devDebug.getCurrentActorSnapshot, {});

  if (sessionLoading || snapshot === undefined) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading developer snapshot…</p>
      </main>
    );
  }

  if (!sessionData?.session) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-slate-400">Please sign in to view developer tools.</p>
      </main>
    );
  }

  if (snapshot === null) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-slate-400">No actor data found for this user.</p>
      </main>
    );
  }

  const totalProjects = snapshot.projects.length;
  const totalClips = snapshot.projects.reduce(
    (sum, project) => sum + project.clips.length,
    0,
  );

  return (
    <main className="min-h-screen bg-slate-950 text-white px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Current actor snapshot</h1>
          <p className="text-sm text-slate-400">
            User: <span className="font-mono">{snapshot.user?.email ?? "(no email)"}</span> • Actor profile ID:
            <span className="font-mono"> {snapshot.actorProfile?._id ?? "(none)"}</span> • Projects: {totalProjects} • Clips: {" "}
            {totalClips}
          </p>
        </header>

        <section className="rounded-xl bg-slate-900 border border-slate-800 p-4">
          <pre className="overflow-x-auto text-xs leading-relaxed">
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}
