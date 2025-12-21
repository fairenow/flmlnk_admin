"use client";

import React from "react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AdminAuthGuard } from "@/components/auth/AdminAuthGuard";
import { Toaster } from "sonner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AdminAuthGuard>
        <div className="min-h-screen bg-slate-50 dark:bg-flmlnk-dark">
          {children}
        </div>
      </AdminAuthGuard>
      <Toaster position="bottom-right" richColors />
    </ThemeProvider>
  );
}
