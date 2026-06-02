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
        // SF / iOS system blue
        accent: {
          50: "#eff8ff",
          100: "#dbedff",
          200: "#bfe0ff",
          400: "#3b9eff",
          500: "#0a84ff",
          600: "#007aff",
          700: "#0064d3",
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
  plugins: [],
};
