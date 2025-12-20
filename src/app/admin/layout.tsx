"use client";

import React from "react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Toaster } from "sonner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-flmlnk-dark">
        {children}
      </div>
      <Toaster position="bottom-right" richColors />
    </ThemeProvider>
  );
}
