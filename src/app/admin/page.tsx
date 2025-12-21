"use client";

import Link from "next/link";
import {
  Zap,
  BarChart3,
  Mail,
  Settings,
  ChevronRight,
  Image as ImageIcon,
} from "lucide-react";

export default function AdminPage() {
  const adminModules = [
    {
      title: "Boost Campaigns",
      description: "View all boost campaigns across all users with detailed analytics",
      icon: Zap,
      href: "/admin/boost",
      color: "from-amber-500 to-orange-600",
    },
    {
      title: "Deep Analytics",
      description: "Platform-wide analytics with filters for location, trailers, and films",
      icon: BarChart3,
      href: "/admin/analytics",
      color: "from-indigo-500 to-purple-600",
    },
    {
      title: "All Assets",
      description: "View all clips, memes, and GIFs across all users with filtering",
      icon: ImageIcon,
      href: "/admin/assets",
      color: "from-purple-500 to-pink-600",
    },
    {
      title: "Email Campaigns",
      description: "Manage email campaigns including 'All Filmmakers' audience targeting",
      icon: Mail,
      href: "/admin/campaigns",
      color: "from-red-500 to-pink-600",
      comingSoon: true,
    },
  ];

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="mb-12">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-xl">
            <Settings className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Admin Dashboard
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Platform administration and analytics
            </p>
          </div>
        </div>
      </div>

      {/* Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminModules.map((module) => (
          <Link
            key={module.title}
            href={module.comingSoon ? "#" : module.href}
            className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 ${
              module.comingSoon ? "cursor-not-allowed opacity-60" : ""
            }`}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${module.color} opacity-0 group-hover:opacity-5 transition-opacity`} />

            <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${module.color} text-white shadow-lg mb-4`}>
              <module.icon className="h-6 w-6" />
            </div>

            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              {module.title}
              {module.comingSoon && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  Coming Soon
                </span>
              )}
            </h2>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {module.description}
            </p>

            {!module.comingSoon && (
              <div className="flex items-center text-sm font-medium text-indigo-600 dark:text-indigo-400 group-hover:gap-2 transition-all">
                View Dashboard
                <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
