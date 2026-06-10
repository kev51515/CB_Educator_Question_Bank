import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import path from "node:path";

// `ANALYZE=1 npm run build` emits dist/stats.html (chunk treemap). Off by
// default so normal/CI builds are byte-identical.
const analyze = !!process.env.ANALYZE;

// `@/foo` → `src/foo`. Keep in sync with `paths` in tsconfig.app.json.
export default defineConfig({
  plugins: [
    react(),
    ...(analyze
      ? [
          visualizer({
            filename: "dist/stats.html",
            gzipSize: true,
            brotliSize: true,
            template: "treemap",
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the always-needed, rarely-changing core libs into stable vendor
        // chunks so returning users keep them cached across app deploys (the
        // app chunk changes every deploy; these don't). Heavy optional libs
        // (Sentry, PostHog, TipTap, KaTeX) are code-split at their usage sites
        // instead, so they're intentionally NOT grouped here.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(
              id,
            )
          ) {
            return "vendor-react";
          }
          if (id.includes("/node_modules/@supabase/")) return "vendor-supabase";
          return undefined;
        },
      },
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
