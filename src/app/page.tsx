"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Shield, Loader2, ArrowRight, LayoutDashboard, Users, BarChart3, Settings } from "lucide-react";
import Link from "next/link";

export default function AdminLandingPage() {
  const router = useRouter();
  const { data: sessionData, isPending } = useSession();
  const isAuthenticated = Boolean(sessionData?.session);

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/dashboard/actor");
    }
  }, [isAuthenticated, router]);

  if (isPending) {
    return (
      <div className="min-h-screen bg-admin-dark flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-admin-primary-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-admin-dark">
      {/* Background gradient effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-admin-primary-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-admin-accent-500/6 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-admin-primary-600/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-admin-card border border-admin-primary-500/30 rounded-full">
              <Shield className="w-4 h-4 text-admin-primary-400" />
              <span className="text-xs font-medium text-admin-primary-300 tracking-wider">ADMIN</span>
            </div>
            <h1 className="text-xl font-bold text-white">FLMLNK</h1>
          </div>
          <Link
            href="/signin"
            className="flex items-center gap-2 px-4 py-2 bg-admin-primary-600 hover:bg-admin-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Sign In
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 px-6 pt-20 pb-32">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-admin-surface/50 border border-white/10 rounded-full mb-8">
            <span className="w-2 h-2 bg-admin-accent-400 rounded-full animate-pulse" />
            <span className="text-sm text-slate-400">Internal Team Dashboard</span>
          </div>

          <h2 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-6">
            FLMLNK{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-admin-primary-400 to-admin-accent-400">
              Admin
            </span>
          </h2>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-12">
            The central hub for the FLMLNK team. Manage users, monitor analytics,
            configure settings, and collaborate on platform development.
          </p>

          <Link
            href="/signin"
            className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-admin-primary-600 to-admin-primary-500 hover:from-admin-primary-500 hover:to-admin-primary-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-admin-primary-500/25 text-lg"
          >
            Access Dashboard
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        {/* Feature Cards */}
        <div className="max-w-5xl mx-auto mt-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <FeatureCard
            icon={<LayoutDashboard className="w-6 h-6" />}
            title="Dashboard"
            description="Overview of platform metrics and activity"
          />
          <FeatureCard
            icon={<Users className="w-6 h-6" />}
            title="User Management"
            description="Manage filmmaker profiles and accounts"
          />
          <FeatureCard
            icon={<BarChart3 className="w-6 h-6" />}
            title="Analytics"
            description="Deep insights into platform performance"
          />
          <FeatureCard
            icon={<Settings className="w-6 h-6" />}
            title="Settings"
            description="Configure platform behavior and features"
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <p className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} FLMLNK. Internal use only.
          </p>
          <p className="text-sm text-slate-600">
            Authorized personnel only
          </p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 bg-admin-card/50 border border-white/5 rounded-xl hover:border-admin-primary-500/30 transition-colors group">
      <div className="w-12 h-12 bg-admin-surface rounded-lg flex items-center justify-center text-admin-primary-400 mb-4 group-hover:text-admin-primary-300 transition-colors">
        {icon}
      </div>
      <h3 className="text-white font-semibold mb-2">{title}</h3>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}
