/**
 * Lazy-loaded heavy components.
 *
 * These are shown conditionally (modals, overlays, dashboard) and represent
 * a meaningful chunk of bundle size. Splitting them out of the initial JS
 * payload keeps first-paint fast.
 *
 * Usage pattern:
 *   import { LazyKnowledgeGraph } from "@/components/lazy";
 *   import { Suspense } from "react";
 *   ...
 *   <Suspense fallback={null}>
 *     {graphOpen && <LazyKnowledgeGraph ... />}
 *   </Suspense>
 *
 * Note: we re-export via `default` adapters because React.lazy only accepts
 * default exports, but our components are named exports for barrel ergonomics.
 */
import { lazy } from "react";

export const LazyKnowledgeGraph = lazy(() =>
  import("./KnowledgeGraph").then((m) => ({ default: m.KnowledgeGraph })),
);

export const LazyMaintainerView = lazy(() =>
  import("./MaintainerView").then((m) => ({ default: m.MaintainerView })),
);

export const LazyCalibrationView = lazy(() =>
  import("./CalibrationView").then((m) => ({ default: m.CalibrationView })),
);

export const LazyProgressDashboard = lazy(() =>
  import("./ProgressDashboard").then((m) => ({ default: m.ProgressDashboard })),
);

export const LazyQuickBuildWizard = lazy(() =>
  import("./QuickBuild").then((m) => ({ default: m.QuickBuildWizard })),
);

export const LazyStateExportPanel = lazy(() =>
  import("./StateExport").then((m) => ({ default: m.StateExportPanel })),
);

export const LazyA11yPanel = lazy(() =>
  import("./A11yPreferences").then((m) => ({ default: m.A11yPanel })),
);

export const LazyCustomizerPanel = lazy(() =>
  import("./ShortcutCustomizer").then((m) => ({ default: m.CustomizerPanel })),
);

export const LazyReadingMode = lazy(() =>
  import("./ReadingMode").then((m) => ({ default: m.ReadingMode })),
);

export const LazyCompareView = lazy(() =>
  import("./CompareView").then((m) => ({ default: m.CompareView })),
);

export const LazyTimerSetup = lazy(() =>
  import("./TimerSetup").then((m) => ({ default: m.TimerSetup })),
);
