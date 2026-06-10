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
        // `--accent-*` are in "R G B" channel form (set by DomainProvider) so
        // the `/opacity` modifier works. `indigo` is REMAPPED onto the same
        // vars: the app is styled with indigo-* as its brand primary, so this
        // re-themes every existing indigo usage by active domain (academic=
        // indigo, counseling=emerald, coaching=orange) with no per-component
        // edits. Fixed indigo (e.g. the domain dots) uses explicit hex.
        accent: {
          50: "rgb(var(--accent-50) / <alpha-value>)",
          100: "rgb(var(--accent-100) / <alpha-value>)",
          200: "rgb(var(--accent-200) / <alpha-value>)",
          300: "rgb(var(--accent-300) / <alpha-value>)",
          400: "rgb(var(--accent-400) / <alpha-value>)",
          500: "rgb(var(--accent-500) / <alpha-value>)",
          600: "rgb(var(--accent-600) / <alpha-value>)",
          700: "rgb(var(--accent-700) / <alpha-value>)",
          800: "rgb(var(--accent-800) / <alpha-value>)",
          900: "rgb(var(--accent-900) / <alpha-value>)",
          950: "rgb(var(--accent-950) / <alpha-value>)",
        },
        indigo: {
          50: "rgb(var(--accent-50) / <alpha-value>)",
          100: "rgb(var(--accent-100) / <alpha-value>)",
          200: "rgb(var(--accent-200) / <alpha-value>)",
          300: "rgb(var(--accent-300) / <alpha-value>)",
          400: "rgb(var(--accent-400) / <alpha-value>)",
          500: "rgb(var(--accent-500) / <alpha-value>)",
          600: "rgb(var(--accent-600) / <alpha-value>)",
          700: "rgb(var(--accent-700) / <alpha-value>)",
          800: "rgb(var(--accent-800) / <alpha-value>)",
          900: "rgb(var(--accent-900) / <alpha-value>)",
          950: "rgb(var(--accent-950) / <alpha-value>)",
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
