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
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        // Inter Tight — every heading of the public site (sentence case, upright; see `.heading` in globals.css)
        head: ["var(--font-head)", "var(--font-sans)", "system-ui", "sans-serif"],
        // the 3D studio's, the quote page's and the admin's titles and numbers: the same Inter Tight (it was Space Grotesk)
        display: ["var(--font-head)", "var(--font-sans)", "system-ui", "sans-serif"],
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

        // ---- public site, light system (2026-10 redesign). The tokens above stay for the studio and admin.
        canvas: "#FAF8F5", // warm white page
        greige: "#F2EEE8", // soft alternate section
        card: "#FFFFFF",
        graphite: "#1A1A18", // text on light (16.7:1 on canvas)
        taupe: "#6F6A62", // muted text on light (5.1:1 on canvas, 4.6:1 on greige)
        hairline: "#E6E0D7", // rules and card borders on light
        bronze: {
          DEFAULT: "#9A7650", // accent on light — large text and graphics only (3.9:1)
          deep: "#7A5C3B", // small accent text on light (5.6:1 on canvas)
        },
        // dark zones of the public site: warm charcoal
        night: {
          DEFAULT: "#141416", // hero
          band: "#161518", // dark bands (3D studio)
          deep: "#111113", // footer
          raise: "#1E1E21", // chips and panels on night
        },
      },
      letterSpacing: {
        tightest: "-0.04em",
        label: "0.28em",
        // Inter Tight headings: tighter as they grow
        head: "-0.025em",
        "head-sm": "-0.015em",
        caps: "0.18em",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(.2,.8,.2,1)",
      },
    },
  },
  plugins: [],
};

export default config;
