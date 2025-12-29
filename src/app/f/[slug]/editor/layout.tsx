import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/contexts/ThemeContext";

export const metadata: Metadata = {
  title: "Edit Your Page | FLMLNK",
  description: "Edit your filmmaker page on FLMLNK.",
};

export default function EditorLayout({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
