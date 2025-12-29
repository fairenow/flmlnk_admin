"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Zap,
  BarChart3,
  Mail,
  ArrowRight,
  Loader2,
} from "lucide-react";

export default function AdminPage() {
  const router = useRouter();

  // Auto-redirect to dashboard after a brief moment
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/dashboard");
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-lg text-center">
        <div className="flex justify-center mb-6">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
          Admin Features Integrated
        </h1>

        <p className="text-slate-600 dark:text-slate-400 mb-8">
          Admin features are now integrated directly into the dashboard modules.
          Look for the admin tabs when logged in as a superadmin.
        </p>

        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 text-left">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Mail className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-900 dark:text-white">Email Campaigns</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Dashboard → Email Campaigns → Platform Campaigns tab
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 text-left">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-900 dark:text-white">Boost Management</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Dashboard → Boost → Submissions, Suggestions, Gift tabs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 text-left">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-900 dark:text-white">Platform Analytics</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Dashboard → Overview (coming soon)
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors"
        >
          Go to Dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>

        <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">
          Redirecting automatically in 3 seconds...
        </p>
      </div>
    </div>
  );
}
