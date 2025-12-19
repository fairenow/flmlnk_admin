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
        background: "hsl(210, 40%, 98%)",
        foreground: "hsl(222, 47%, 11%)",
        "flmlnk-dark": "#0e0f11",
        "flmlnk-card": "#15171b",
        "flmlnk-rose": "#f02d60",
        "carpet-red": {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#FF5252",
          500: "#DC143C",
          600: "#c41230",
          700: "#a50f28",
          800: "#8B0000",
          900: "#7f1d1d",
          950: "#450a0a"
        }
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.04), 0 40px 80px rgba(0,0,0,0.45)"
      }
    }
  },
  plugins: []
};

export default config;
