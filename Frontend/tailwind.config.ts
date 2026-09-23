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
        // Canonical Adminiculum Design Tokens (Phase 1)
        "adm-green": "#0F3D32",
        "adm-deep": "#062B22",
        "adm-terracotta": "#B85C4B",
        "adm-terracotta-soft": "#F1D7D1",
        "adm-canvas": "#FFFFFF",
        "adm-surface-subtle": "#F8FAF9",
        "adm-border-canonical": "#E5E7E6",
        "adm-text-main": "#1F2937",
        "adm-text-subtle": "#6B7280",
        "adm-teal": "#2E7DBA",
        "adm-gold": "#F4A51C",
        "adm-navy": "#1E3A5F",
        "adm-brick": "#8B4B4B",
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
