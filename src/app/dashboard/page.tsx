"use client";

import { Shield } from "lucide-react";
import Link from "next/link";

/**
 * Main admin dashboard landing page.
 * Shows navigation to admin sections.
 */
export default function DashboardPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-admin-dark">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-3">
          <Shield className="w-10 h-10 text-admin-primary-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">FLMLNK Admin Dashboard</h1>
          <p className="text-sm text-slate-400">Welcome to the admin portal</p>
        </div>

        <div className="grid gap-4 mt-4">
          <Link
            href="/admin"
            className="px-6 py-3 bg-admin-primary-500 hover:bg-admin-primary-600 text-white font-medium rounded-lg transition-colors"
          >
            Go to Admin Panel
          </Link>
        </div>
      </div>
    </main>
  );
}
