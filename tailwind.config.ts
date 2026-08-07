import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ocean: {
          50: "#ecfeff",
          100: "#cffafe",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
        },
        coral: {
          50: "#fff1f2",
          100: "#ffe4e6",
          500: "#fb7185",
          600: "#e11d48",
        },
        leaf: {
          50: "#f0fdf4",
          100: "#dcfce7",
          500: "#22c55e",
          600: "#16a34a",
        },
        sun: {
          50: "#fffbeb",
          100: "#fef3c7",
          400: "#facc15",
          500: "#eab308",
        },
      },
      boxShadow: {
        soft: "0 18px 55px rgba(15, 23, 42, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
