import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// `@/foo` → `src/foo`. Keep in sync with `paths` in tsconfig.app.json.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    // Fixed, easy-to-remember dev port. strictPort = fail loudly if 9000 is
    // taken rather than silently hopping to 9001 (so the URL is always the same).
    port: 9000,
    strictPort: true,
    // Don't trigger HMR reloads when bulk-generated static data churns.
    // The app fetches these at runtime, so a code reload is wasted work
    // and was thrashing E2E test runs.
    watch: {
      ignored: [
        "**/public/data/exports/**",
        "**/public/data/aspects/**",
        "**/public/data/index.json",
        "**/public/data/index.json.bak",
        // `viewer/public/exports` is a symlink to `../../data/exports` so the
        // static SAT export pages can be served same-origin as the viewer
        // (lets them see the existing Supabase auth session). HMR-ignored for
        // the same reason as the legacy `public/data/exports` path above.
        "**/public/exports/**",
        "**/data/aspects/**",
        "**/data/json/**",
      ],
    },
  },
});
