# Components Catalogue

> See also: [DESIGN.md](./DESIGN.md) for the design system foundations.

Reference for ~60 React components in the SAT Question Bank viewer. Organized
by purpose, not alphabetically — start from the section that matches what
you're building and drill in.

For the underlying design language (color, typography, spacing), see
[DESIGN.md](./DESIGN.md). For data flow and state, see
[MECHANISMS.md](./MECHANISMS.md).

## Layout

> **Modal accessibility:** All dialog/modal components (StatsPanel, CompareView, BottomSheet, ChoiceAnalysisPanel, MaintainerView, A11yPanel, ReadingMode, StateExportPanel, CalibrationView, QuickBuildWizard, TimerSetup, CustomizerPanel, KnowledgeGraph, ProgressDashboard, HelpOverlay, DslHelpPopover, AdaptiveLayout.FilterDrawer) use `useFocusTrap` from `hooks/useFocusTrap.ts` to satisfy WCAG 2.4.3. Always include `role="dialog"` + `aria-modal="true"` + `aria-label[ledby]`. Add `data-autofocus` to the initial focus target (typically the close button).

- **App** (`src/App.tsx`) — Root orchestrator. Wires together filter state, the
  active question, modal stack, persisted preferences, and the three-column
  shell.
- **SidebarV2** (`components/SidebarV2.tsx`) — Adaptive filter pane with
  Basic/Advanced depth modes. Built on the declarative facet engine
  (`lib/facets.ts` + `lib/filterRegistry.ts`). Renders Basic (w-64) or Advanced
  (w-96) layouts; Advanced reveals scoreBand range, type, hasStimulus,
  freshness + per-skill Aspects panel. **Legacy `Sidebar.tsx` was REMOVED in
  2026-05-29 — only `SidebarV2.tsx` exists now.**
- **QuestionList** (`components/QuestionList.tsx`) — Middle column. Renders the
  filtered + sorted question list with a 2px difficulty stripe on each row.
- **Detail** (`components/Detail.tsx`, split across `DetailHeader.tsx`,
  `DetailContent` parts, `AnswerActions.tsx`, etc.) — Right pane. Question
  header, stimulus, stem, choices, rationale, actions.
- **MobileTabBar** (`components/MobileTabBar.tsx`) — Bottom nav for mobile.
- **Breadcrumbs** (`components/Breadcrumbs.tsx`) — The global breadcrumb bar for
  the educator shell. Three exports: `BreadcrumbProvider` (label registry, wraps
  `StaffShell`), `useBreadcrumbLabel(urlValue, name)` (a page registers a dynamic
  segment's real name; no-ops without a provider / until both args truthy), and
  `Breadcrumbs` (the sticky `h-12` bar — back control + trail). The trail itself is
  computed by the pure `lib/breadcrumbs.ts` (`buildEducatorTrail` / `backTargetOf`).
  Mounted once above the `<Outlet/>`; publishes its height as the `--app-chrome-top`
  CSS var. See DESIGN_PRINCIPLES §8j for the full chrome/offset/alignment contract.

## Foundations (lib/)

- **facets** (`lib/facets.ts`) — Declarative filter engine: `FacetDef` /
  `FacetState` / `applyFacets` / `facetCounts` / `sanitizeFacetState` / URL
  serializers. Single source of truth for filter behavior.
- **filterRegistry** (`lib/filterRegistry.ts`) — `FILTERS` array defining 9
  facets (section, difficulty, scoreBand, domain, skill, type, hasStimulus,
  updateDate, status). Add a one-line entry here = automatic UI.
- **filterAdapter** (`lib/filterAdapter.ts`) — Bidirectional Filters ↔
  FacetState. `applyAllFilters()` composes facets + status + search.
- **designTokens** (`lib/designTokens.ts`) — IDENTITY palette (6 colors mapped
  to meaning).
- **designSystem** (`lib/designSystem.ts`) — Full reference token catalog
  (DIFFICULTY, CONFIDENCE, STATUS, TYPE, SPACE, SURFACE, INTERACTIVE, Z).
- **fetch** (`lib/fetch.ts`) — `fetchJson<T>()` with throw-on-non-OK.
- **filters** (`lib/filters.ts`) — Legacy `applyFilters`/`sanitizeFilters`
  (still used as Filters-shape adapter, will eventually retire).
- **sets** (`lib/sets.ts`) — `AVAILABLE_SETS` metadata + `baseForSet()`.

## Foundational hooks (hooks/)

- **useFocusTrap** (`hooks/useFocusTrap.ts`) — WCAG-compliant focus trap for
  modals. Saves prior focus, traps Tab/Shift+Tab, restores on unmount.
  Supports `data-autofocus` for initial focus selection.
- **useKeyboardShortcuts** (`hooks/useKeyboardShortcuts.ts`) — Centralized
  keyboard shortcut registration.
- **useLocalStorage*** (`hooks/index.ts`) — Set/Map/JSON/Number/Recent variants
  with cross-tab sync (`useLocalStorageSet`, `useLocalStorageMap`,
  `useLocalStorageJSON`, `useLocalStorageNumber`, `useLocalStorageRecent`,
  `useLocalStorageConfidence`).
- **useMediaQuery** (`hooks/index.ts`) — Reactive media query state, backed by
  `useSyncExternalStore` (no setState-in-effect; SSR snapshot `false`).
- **useModals** (`hooks/useModals.ts`) — Modal state machinery.
- **useNow** (`hooks/index.ts`) — A timestamp that refreshes every `intervalMs`
  (default 60s) so relative-time labels + time-based categorisation update while
  a view sits open, and `now`-keyed `useMemo`s recompute on the tick rather than
  every render. Used by `AssignmentsPanel` (live "Due soon → Past due").
- **useRovingTabIndex<T>** (`hooks/index.ts`) — WAI-ARIA tablist keyboard
  support: `getTabProps(i)` (ref + roving `tabIndex` + `onKeyDown`) gives
  Arrow/Home/End movement with selection-follows-focus. Spread onto each
  `role="tab"`. Adopted by AssignmentsPanel, MyFeedbackPage, CourseMaterialsList,
  StudentPortfolio, AllUsersView, AdminInviteCodesPage. **Don't** use it on
  tablists that move focus elsewhere on select (e.g. autofocus a field).

## Filter system
- **FacetDef** (`lib/facets.ts`) — Filter definition shape (see Foundations).
- **FILTERS** (`lib/filterRegistry.ts`) — Registry of filters; drives the V2
  sidebar (see Foundations).
- **FilterControls** (`components/FilterControls.tsx`) — Generic UI controls
  driven by `FacetDef`: `MultiFilter` (checkboxes), `RangeFilter` (dual
  slider), `BooleanFilter` (3-state), `DateRangeFilter` (preset chips),
  `FilterSection` (header wrapper with IDENTITY dot), `DepthSelector`
  (Basic/Advanced toggle).
- **FilterDSL** (`components/FilterDSL.tsx`) — DSL parser for
  `section:math difficulty:hard`-style queries.
- **FilterPresets** (`components/FilterPresets.tsx`) — Save and recall named
  filter views.
- **FilterShortcuts** (`components/FilterShortcuts.tsx`) — Keyboard shortcuts
  bound to common filter combinations.
- **SidebarShared / SidebarDomainTree / SidebarSearchBox / SidebarSetToggle /
  SidebarStatusFilter** (`components/Sidebar*.tsx`) — Sidebar sub-components
  used by `SidebarV2`.

## Study modes
- **PracticeMode** (`components/PracticeMode.tsx`) — Click-to-answer + flashcard.
- **TimerSession** (`components/TimerSession.tsx`) — Timed practice (`TimerBar`
  + `TimerSetup` + `useTimer`).
- **ConfidenceRating** (`components/ConfidenceRating.tsx`) — 3-dot rating per
  question (unsure / okay / confident — see `CONFIDENCE` tokens).
- **ProgressDashboard** (`components/ProgressDashboard.tsx`) — Personal
  coverage + mastery view.
- **CalibrationView** (`components/CalibrationView.tsx`) — CB vs. user
  difficulty agreement.
- **ProgressiveHints** (`components/ProgressiveHints.tsx`) — Progressive
  rationale reveal.
- **StepRationale** (`components/StepRationale.tsx`) — Step-by-step rationale
  display.
- **SpacedRepetition** (`components/SpacedRepetition.tsx`) — SM-2 review
  scheduler. See `useSpacedRepetition` hook.
- **ReadingMode** (`components/ReadingMode.tsx`) — Distraction-free
  single-question view.

## Organization & metadata
- **TagSystem** (`components/TagSystem.tsx`) — User-defined colored tags.
- **QuestionFlags** (`components/QuestionFlags.tsx`) — Confusing / great /
  too-easy markers.
- **Annotations** (`components/Annotations.tsx`) — Text highlights (4 colors,
  defined as `.annotation-<color>` in `index.css`).
- **ChoiceAnalysis** (`components/ChoiceAnalysis.tsx`) — Per-choice "why pick
  this" notes.
- **DraggablePrintList** (`components/DraggablePrintList.tsx`) — HTML5
  drag-and-drop reorderable list, used inside Print Set workflows.
- **NoteEditor** (`components/NoteEditor.tsx`) — Inline notes attached to a
  question.

## Search & discovery
- **Highlight** (`components/Highlight.tsx`) — `<mark>` text highlighter for
  search matches.
- **SearchExtras** (`components/SearchExtras.tsx`) — Math expression match +
  similarity + freshness.
- **CommandPalette** (`components/CommandPalette.tsx`) — ⌘K command palette.

## Export & sharing
- **PdfExport** (`components/PdfExport.tsx`) — Browser save-as-PDF.
- **ExportFormats** (`components/ExportFormats.tsx`) — Plain text / CSV /
  Markdown.
- **ShareSet** (`components/ShareSet.tsx`) — base64url URL encoding of a set
  for sharing.
- **StateExport** (`components/StateExport.tsx`) — Full state backup/restore.
- **QuestionSnapshot** (`components/QuestionSnapshot.tsx`) — Single-question
  HTML export.
- **PrintSet** (`components/PrintSet.tsx`) — Off-screen worksheet renderer
  driven by print CSS in `index.css`.
- **QuickBuild** (`components/QuickBuild.tsx` and friends) — Multi-step
  worksheet builder (Configure → Preview → Save Template). Includes
  `QuickBuildPill`, `QuickBuildConfigureStep`, `QuickBuildPreviewStep`,
  `QuickBuildSaveTemplatePrompt`, `QuickBuildTemplates`.

## Analysis & visualization
- **StatsPanel** (`components/StatsPanel.tsx`) — Distribution charts modal.
- **PrintSetAnalytics** (`components/PrintSetAnalytics.tsx`) — Inline print
  set stats.
- **CompareView** (`components/CompareView.tsx`) — Side-by-side question
  comparison.
- **KnowledgeGraph** (`components/KnowledgeGraph.tsx`) — Force-directed skill
  graph.
- **ActivityCalendar** (`components/ActivityCalendar.tsx`) — GitHub-style
  heatmap.
- **MaintainerView** (`components/MaintainerView.tsx`) — Data quality
  dashboard for content authors.

## Accessibility
- **A11yPreferences** (`components/A11yPreferences.tsx`) — Dyslexia / contrast
  / math speech / spacing modal. Toggles the `.dyslexia-mode`,
  `.high-contrast`, `.math-speech-on` classes on `<html>` and tunes
  `--letter-spacing` / `--line-height` CSS vars.
- **MathSpeech** (`lib/`) — MathJax SRE integration (loaded externally).

## Power user
- **ShortcutCustomizer** (`components/ShortcutCustomizer.tsx`) — Remap
  keyboard shortcuts.
- **DarkModeToggle** (`components/DarkModeToggle.tsx`) — Light/dark theme.
- **FilterDSL** (`components/FilterDSL.tsx`) — Query syntax editor.
- **FilterPresets** (`components/FilterPresets.tsx`) — Named filter views.
- **HelpOverlay** (`components/HelpOverlay.tsx`) — Keyboard shortcut and gesture
  cheatsheet (`?`).

## UI utilities
- **ListExtras** (`components/ListExtras.tsx`) — `CompactToggle`,
  `QuestionPreviewTooltip`, `useHoverPreview`.
- **StickyActions** (`components/StickyActions.tsx`) — Detail scroll-header
  action pills.
- **BatchOps** (`components/BatchOps.tsx`) — Multi-select operations bar.
- **VirtualList** (`components/VirtualList.tsx`) — Zero-dep windowing.
- **BottomSheet** (`components/BottomSheet.tsx`) — Mobile-native modal.
- **AdaptiveLayout** (`components/AdaptiveLayout.tsx`) — Breakpoint-driven
  layout switch.
- **SplashScreen** (`components/SplashScreen.tsx`) — Initial-load splash.
- **ErrorBoundary** (`components/ErrorBoundary.tsx`) — Top-level error catch.

## Question rendering
- **QuestionHtml** (`components/QuestionHtml.tsx`) — Trusted HTML renderer
  (`.q-html` class — see `index.css` for typography).
- **AnswerOptions** (`components/AnswerOptions.tsx`) — MCQ option list.
- **SprAnswerInput** (`components/SprAnswerInput.tsx`) — Student-produced
  response input.
- **RationaleBlock** (`components/RationaleBlock.tsx`) — Rationale surface
  (`SURFACE.inset`).
- **DetailEmptyStates / DetailFootnote / DetailHeader / DetailIcons**
  (`components/Detail*.tsx`) — Detail-pane sub-components.

## Mobile
- **SwipeNav** (`components/SwipeNav.tsx`) — Touch swipe navigation.
- **BottomSheet** (`components/BottomSheet.tsx`) — Slide-up modal pattern.
- **MobileTabBar** (`components/MobileTabBar.tsx`) — Bottom navigation.

## Collaboration
- **LanSync** (`components/LanSync.tsx`) — BroadcastChannel state sync between
  tabs / windows.

## Co-located hooks

> Note: This project intentionally co-locates feature hooks with their host
> components (e.g., `useTimer` lives in `TimerSession.tsx`). For the
> foundational hooks in `hooks/`, see the **Foundational hooks (hooks/)**
> section above. See `viewer/eslint.config.js` for the documented co-location
> rationale.

- **TimeTracker** (`components/TimeTracker.tsx`) — Per-question viewing time.
- **useSpacedRepetition** — Review scheduling (see SpacedRepetition).
- **useActivityLog** — Daily activity tracking (see ActivityCalendar).
- **useTimer** — Timer state (see TimerSession).
