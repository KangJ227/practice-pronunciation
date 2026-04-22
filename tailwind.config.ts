import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1d1a16",
        paper: "#f4ede1",
        berry: "#a5233a",
        moss: "#2f5a45",
        sand: "#dcc7aa",
        brass: "#98712c",
      },
      boxShadow: {
        card: "0 18px 42px rgba(42, 26, 11, 0.12)",
      },
      backgroundImage: {
        "paper-grid":
          "linear-gradient(rgba(120,88,43,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(120,88,43,0.08) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "32px 32px",
      },
      fontFamily: {
        display: ["Georgia", "serif"],
        body: ["ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        drift: {
          "0%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
          "100%": { transform: "translateY(0px)" },
        },
      },
      animation: {
        drift: "drift 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
