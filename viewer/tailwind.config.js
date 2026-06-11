import containerQueries from "@tailwindcss/container-queries";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutral ramps — routed through CSS channel vars (index.css seeds)
        // exactly like the accent alias below, so the Ivy Ledger theme
        // (`.theme-ivy` on <html>, see lib/theme.ts) can swap every slate-*/
        // ink-* utility app-wide with zero component edits. The :root seeds
        // are the EXACT pre-redesign values, so the default 'classic' theme
        // renders pixel-identical to before this alias existed.
        ink: {
          50: "rgb(var(--ink-50) / <alpha-value>)",
          100: "rgb(var(--ink-100) / <alpha-value>)",
          150: "rgb(var(--ink-150) / <alpha-value>)",
          200: "rgb(var(--ink-200) / <alpha-value>)",
          300: "rgb(var(--ink-300) / <alpha-value>)",
          400: "rgb(var(--ink-400) / <alpha-value>)",
          450: "rgb(var(--ink-450) / <alpha-value>)",
          500: "rgb(var(--ink-500) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
        },
        slate: {
          50: "rgb(var(--slate-50) / <alpha-value>)",
          100: "rgb(var(--slate-100) / <alpha-value>)",
          200: "rgb(var(--slate-200) / <alpha-value>)",
          300: "rgb(var(--slate-300) / <alpha-value>)",
          400: "rgb(var(--slate-400) / <alpha-value>)",
          500: "rgb(var(--slate-500) / <alpha-value>)",
          600: "rgb(var(--slate-600) / <alpha-value>)",
          700: "rgb(var(--slate-700) / <alpha-value>)",
          800: "rgb(var(--slate-800) / <alpha-value>)",
          900: "rgb(var(--slate-900) / <alpha-value>)",
          950: "rgb(var(--slate-950) / <alpha-value>)",
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
        // Routed through theme vars (index.css). Classic seeds = the previous
        // literal stacks, so nothing changes by default; .theme-ivy swaps to
        // Onest / Newsreader / Literata / Fragment Mono (lib/theme.ts).
        sans: ["var(--font-ui)"],
        mono: ["var(--font-mono-ui)"],
        // `font-display` (page titles) and `font-passage` (reading serif) are
        // intentional no-ops in classic (they resolve to --font-ui) so Ivy
        // surface work can land incrementally without forking components.
        display: ["var(--font-display)"],
        passage: ["var(--font-passage)"],
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
