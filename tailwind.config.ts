import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        // dark "studio" surfaces
        ink: {
          DEFAULT: "#0B0B0C",
          900: "#060607",
          800: "#0B0B0C",
          700: "#111113",
          600: "#18181B",
          500: "#222226",
        },
        // warm light "paper" surfaces
        paper: {
          DEFAULT: "#EEEAE3",
          dark: "#E4DED3",
          line: "#CFC7B9",
        },
        fg: "#F2EFE9", // text on dark
        mut: {
          DEFAULT: "#8F897E", // muted text on dark
          paper: "#6D675D", // muted text on paper
        },
        accent: {
          DEFAULT: "#C9B99A",
          deep: "#8A7A5C", // accent on paper
        },
      },
      letterSpacing: {
        tightest: "-0.04em",
        label: "0.28em",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(.2,.8,.2,1)",
      },
    },
  },
  plugins: [],
};

export default config;
