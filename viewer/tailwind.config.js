import containerQueries from "@tailwindcss/container-queries";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Apple-ish neutral grays (slightly cooler than pure white-to-black)
        ink: {
          50: "#fafafb",
          100: "#f3f3f5",
          150: "#ececef",
          200: "#e6e6ea",
          300: "#cfd0d6",
          400: "#9b9da5",
          450: "#6E7078",
          500: "#80828a",
          600: "#65676f",
          700: "#3e3f47",
          800: "#1d1d20",
          900: "#000000",
        },
        // Domain accent — re-themes live per active domain (academic=indigo,
        // counseling=emerald, coaching=orange). The ramp maps to CSS custom
        // properties set by DomainProvider onto :root; index.css seeds the
        // indigo (academic) default so accent-* works before the provider runs.
        // See lib/domain.ts + lib/DomainProvider.tsx.
        accent: {
          50: "var(--accent-50)",
          100: "var(--accent-100)",
          200: "var(--accent-200)",
          300: "var(--accent-300)",
          400: "var(--accent-400)",
          500: "var(--accent-500)",
          600: "var(--accent-600)",
          700: "var(--accent-700)",
          800: "var(--accent-800)",
          900: "var(--accent-900)",
          950: "var(--accent-950)",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Inter"',
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"SF Mono"',
          '"Menlo"',
          "ui-monospace",
          "monospace",
        ],
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.02)",
        modal:
          "0 20px 40px -10px rgba(0,0,0,0.18), 0 6px 12px -6px rgba(0,0,0,0.08)",
      },
    },
  },
  plugins: [containerQueries],
};
