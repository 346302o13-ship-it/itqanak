import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Match the real body stack in globals.css so a `font-sans` utility
        // never silently drops to Arial/Tahoma.
        sans: [
          "IBM Plex Sans Arabic",
          "IBM Plex Sans",
          "Segoe UI",
          "Tahoma",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
