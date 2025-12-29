"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { JobNotificationProvider } from "@/contexts/JobNotificationContext";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Toaster } from "sonner";

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

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <JobNotificationProvider>
        <div className="relative min-h-screen">
          <header className="absolute right-16 top-4 z-50 flex items-center gap-3 lg:right-4">
            <Link
              href="https://www.flmlnk.com/f/flmlnk?tab=contact"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-red-800 bg-red-700/30 text-red-100 shadow-md shadow-red-950/30 transition hover:border-red-700 hover:bg-red-700/50 hover:text-white"
              aria-label="Leave feedback"
              title="Leave feedback"
            >
              <HelpCircle className="h-4 w-4" />
            </Link>
            <ThemeToggle />
          </header>
          {children}
        </div>
        <ToasterWithTheme />
      </JobNotificationProvider>
    </ThemeProvider>
  );
}
