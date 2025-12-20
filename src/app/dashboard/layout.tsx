"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { JobNotificationProvider } from "@/contexts/JobNotificationContext";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Toaster } from "sonner";
import { Shield } from "lucide-react";

function ToasterWithTheme() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      toastOptions={{
        duration: 5000,
      }}
      richColors
    />
  );
}

function AdminHeader() {
  return (
    <header className="absolute left-0 right-0 top-0 z-50 flex items-center justify-between px-4 py-3 lg:px-6">
      {/* Left: Admin Badge */}
      <Link href="/dashboard/actor" className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-admin-card border border-admin-primary-500/30 rounded-full">
          <Shield className="w-4 h-4 text-admin-primary-400" />
          <span className="text-xs font-medium text-admin-primary-300 tracking-wider">ADMIN</span>
        </div>
        <span className="text-lg font-bold text-white hidden sm:block">FLMLNK</span>
      </Link>

      {/* Right: Theme Toggle */}
      <div className="flex items-center gap-3">
        <ThemeToggle />
      </div>
    </header>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <JobNotificationProvider>
        <div className="relative min-h-screen pt-14">
          <AdminHeader />
          {children}
        </div>
        <ToasterWithTheme />
      </JobNotificationProvider>
    </ThemeProvider>
  );
}
