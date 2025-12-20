import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(220, 20%, 97%)",
        foreground: "hsl(222, 47%, 11%)",
        // Admin theme colors - FLMLNK brand (black/red)
        "admin-dark": "#050505",
        "admin-card": "#0f0f0f",
        "admin-surface": "#1a1a1a",
        // Primary brand - FLMLNK red
        "admin-primary": {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
          800: "#991b1b",
          900: "#7f1d1d",
          950: "#450a0a"
        },
        // Accent - slightly different red for variety
        "admin-accent": {
          50: "#fff1f2",
          100: "#ffe4e6",
          200: "#fecdd3",
          300: "#fda4af",
          400: "#fb7185",
          500: "#f43f5e",
          600: "#e11d48",
          700: "#be123c",
          800: "#9f1239",
          900: "#881337",
          950: "#4c0519"
        },
        // Success green
        "admin-success": {
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a"
        },
        // Warning amber
        "admin-warning": {
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706"
        },
        // Legacy colors for compatibility
        "flmlnk-dark": "#050505",
        "flmlnk-card": "#0f0f0f",
        "flmlnk-rose": "#ef4444",
        "carpet-red": {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
          800: "#991b1b",
          900: "#7f1d1d",
          950: "#450a0a"
        }
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(239,68,68,0.15), 0 40px 80px rgba(0,0,0,0.45)",
        "admin-glow": "0 0 20px rgba(239,68,68,0.2), 0 0 40px rgba(239,68,68,0.1)"
      }
    }
  },
  plugins: []
};

export default config;
