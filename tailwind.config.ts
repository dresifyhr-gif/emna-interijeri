import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-raleway)", "system-ui", "sans-serif"],
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        accent: {
          DEFAULT: "#C9B99A",
          light: "#E5D9CB",
          dark: "#A89278",
        },
        brand: {
          black: "#0A0A0A",
          dark: "#1A1A1A",
          mid: "#3A3A3A",
        },
        stone: {
          50: "#FAFAF8",
          75: "#F5F0EB",
          100: "#F0EDE8",
          200: "#E8E4DF",
          300: "#D8D4CE",
          400: "#B8B4AE",
          500: "#98948E",
          600: "#78746E",
          700: "#58544E",
          800: "#38342E",
          900: "#18140E",
        },
      },
    },
  },
  plugins: [],
};

export default config;
