"use client";

import Link from "next/link";
import { Shield } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#05040A] flex items-center justify-center p-4">
      {/* Background gradient effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md text-center">
        {/* Admin Badge */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-pink-500/30 rounded-full">
            <Shield className="w-5 h-5 text-pink-400" />
            <span className="text-sm font-medium text-pink-300 tracking-wider">ADMIN PORTAL</span>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
          <h1 className="text-4xl font-bold text-white tracking-tight mb-2">
            FLMLNK
          </h1>
          <p className="text-slate-400 mb-8">
            Internal admin dashboard for team collaboration and management
          </p>

          <Link
            href="/signin"
            className="inline-flex items-center justify-center gap-2 w-full py-3 px-6 bg-pink-500 hover:bg-pink-600 text-white font-medium rounded-lg transition-all"
          >
            <Shield className="w-5 h-5" />
            Sign In to Admin
          </Link>

          <p className="text-xs text-slate-500 mt-6">
            Access restricted to authorized FLMLNK team members
          </p>
        </div>

        {/* Footer */}
        <p className="text-xs text-slate-500 mt-6">
          &copy; {new Date().getFullYear()} FLMLNK. Internal use only.
        </p>
      </div>
    </div>
  );
}
