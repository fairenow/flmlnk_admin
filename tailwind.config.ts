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
        // Admin theme colors - modern tech company palette
        "admin-dark": "#0f1117",
        "admin-card": "#1a1d24",
        "admin-surface": "#22262f",
        // Primary brand - deep indigo/purple
        "admin-primary": {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b"
        },
        // Accent - electric cyan/teal
        "admin-accent": {
          50: "#ecfeff",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e63",
          950: "#083344"
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
        "flmlnk-dark": "#0f1117",
        "flmlnk-card": "#1a1d24",
        "flmlnk-rose": "#6366f1",
        "carpet-red": {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b"
        }
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(99,102,241,0.15), 0 40px 80px rgba(0,0,0,0.45)",
        "admin-glow": "0 0 20px rgba(99,102,241,0.25), 0 0 40px rgba(99,102,241,0.1)"
      }
    }
  },
  plugins: []
};

export default config;
