"use client";

import type { ReactNode } from "react";
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
            <ThemeToggle />
          </header>
          {children}
        </div>
        <ToasterWithTheme />
      </JobNotificationProvider>
    </ThemeProvider>
  );
}
