import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1a2e21",
        secondary: "#5d5a52",
        background: "#f6f2e8",
        surface: "#ffffff",
        "surface-container": "#f7f3ea",
        "surface-container-low": "#faf8f2",
        "surface-container-high": "#f1ece2",
        "surface-container-highest": "#eae4d9",
        outline: "#c8c1b3",
        "outline-variant": "#ddd7ca",
        error: "#a23e33",
        "primary-container": "#d7e3d8",
        "on-primary": "#ffffff",
        "on-surface": "#1f2821",
        "on-surface-variant": "#7b776d",
        "on-primary-container": "#173121",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-newsreader)", "Newsreader", "ui-serif", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
