# Sitemap

```
CB_Educator_Question_Bank/
├── data/                                  # All scraped content
│   ├── index.json                          # Flat manifest (3,444 entries) — consumed by the viewer
│   │                                       # Fields: number, id, section, difficulty, domain, skill,
│   │                                       # type, preview, searchText, mathText, path, scoreBand,
│   │                                       # hasStimulus, updateDate
│   └── json/                               # One file per question
│       ├── math/<difficulty>/<domain>/<id>.json
│       └── reading-and-writing/<difficulty>/<domain>/<id>.json
│
├── scraper/                               # Python scrapers (pure httpx, no browser)
│   ├── api_scraper.py                      # Main: walks /digital/get-questions + /get-question
│   ├── ibn_scraper.py                      # Fallback for ~459 IBN-style legacy questions
│   ├── api_progress.json                   # Live progress dump (overwritten during runs)
│   ├── api_failed.json                     # Inputs to the IBN fallback
│   ├── ibn_progress.json
│   ├── ibn_remaining.json
│   ├── logs/                               # Run logs (keep history)
│   └── README.md
│
├── scripts/                               # Utility scripts
│   ├── sync.py                             # Incremental update: fetch deltas + rebuild index
│   ├── build_index.py                      # Rebuild data/index.json from the JSON files
│   ├── normalize_skills.py                 # Collapse case-duplicate skill names
│   └── add_stimulus.py                     # One-time migration that lifted raw.stimulus → stimulus
│
├── viewer/                                # Vite + React + TypeScript SPA
│   ├── public/
│   │   ├── data → ../../data              # Symlink so dev server can serve data/index.json
│   │   ├── manifest.webmanifest            # PWA manifest
│   │   ├── sw.js                           # Service worker (cache-first questions)
│   │   ├── favicon.svg
│   │   └── icons.svg                       # Sprite sheet
│   ├── src/
│   │   │
│   │   │  # ── Top-level entry & shared modules ────────────────────
│   │   ├── App.tsx                         # Root: state, URL hash sync, overlays, keyboard
│   │   ├── main.tsx                        # React entry + service worker registration
│   │   ├── index.css                       # Tailwind base + dark mode vars + a11y + print
│   │   ├── types.ts                        # Shared types (IndexEntry, Question, Filters)
│   │   │                                   #   + URL hash serializers
│   │   ├── IndexedDBCache.ts               # Persistent question cache across sessions
│   │   ├── MathSpeech.ts                   # MathML accessibility via MathJax SRE
│   │   ├── registerSW.ts                   # Service worker registration helper
│   │   │
│   │   ├── components/                     # All UI components (barrel: ./index.ts)
│   │   │   │  # ── Core layout ──────────────────────────────────────
│   │   │   ├── Detail.tsx                  # Right pane: content, answer reveal, annotations,
│   │   │   │                               #   practice mode, flags, tags
│   │   │   ├── SidebarV2.tsx               # Adaptive sidebar (Basic w-64 / Advanced w-96).
│   │   │   │                               #   Driven by lib/facets + lib/filterRegistry.
│   │   │   │                               #   (Legacy Sidebar.tsx removed 2026-05-29.)
│   │   │   ├── SidebarShared.tsx           # Shared primitives (chip, section header)
│   │   │   ├── SidebarDomainTree.tsx       # Collapsible domain/skill tree
│   │   │   ├── SidebarSearchBox.tsx        # Sidebar search input
│   │   │   ├── SidebarSetToggle.tsx        # Set switcher (full / official / linked)
│   │   │   ├── SidebarStatusFilter.tsx     # Bookmarked / done / unanswered toggles
│   │   │   ├── QuestionList.tsx            # Middle column: numbered rows, highlighting,
│   │   │   │                               #   compact mode, print set bar
│   │   │   ├── MobileTabBar.tsx            # Mobile bottom tab bar (Filters / List / Detail)
│   │   │   ├── HelpOverlay.tsx             # Keyboard shortcut help overlay
│   │   │   ├── SplashScreen.tsx            # First-load splash screen
│   │   │   ├── CommandPalette.tsx          # Cmd-K palette: recent / questions / commands
│   │   │   ├── ErrorBoundary.tsx           # Top-level error catch
│   │   │   │
│   │   │   │  # ── Filter UI (declarative) ─────────────────────────
│   │   │   ├── FilterControls.tsx          # MultiFilter / RangeFilter / BooleanFilter /
│   │   │   │                               #   DateRangeFilter / FilterSection / DepthSelector
│   │   │   ├── FilterDSL.tsx               # DSL parser for advanced filters
│   │   │   ├── FilterPresets.tsx           # Save / load named filter presets
│   │   │   ├── FilterShortcuts.tsx         # Keyboard filter shortcuts, useFilterHistory
│   │   │   │
│   │   │   │  # ── Study modes ─────────────────────────────────────
│   │   │   ├── PracticeMode.tsx            # Click-to-answer quiz + flashcard mode
│   │   │   ├── TimerSession.tsx            # Timed practice: countdown, setup modal, useTimer
│   │   │   ├── ConfidenceRating.tsx        # Per-question 1-3 confidence dots
│   │   │   ├── ProgressDashboard.tsx       # Coverage, mastery heatmap, skill gap analysis
│   │   │   ├── ProgressiveHints.tsx        # Tiered hint reveal (nudge → strategy → answer)
│   │   │   ├── StepRationale.tsx           # Stepwise rationale walk-through
│   │   │   ├── SpacedRepetition.tsx        # SM-2 spaced repetition queue
│   │   │   ├── CalibrationView.tsx         # Confidence vs. correctness calibration plot
│   │   │   ├── ReadingMode.tsx             # Distraction-free reading layout
│   │   │   │
│   │   │   │  # ── Question rendering ──────────────────────────────
│   │   │   ├── QuestionHtml.tsx            # Trusted HTML renderer (.q-html)
│   │   │   ├── AnswerOptions.tsx           # MCQ option list
│   │   │   ├── AnswerActions.tsx           # Show answer / next / nav buttons
│   │   │   ├── SprAnswerInput.tsx          # Student-produced response input
│   │   │   ├── RationaleBlock.tsx          # Rationale surface
│   │   │   ├── DetailHeader.tsx            # Detail-pane header
│   │   │   ├── DetailEmptyStates.tsx       # Empty / loading / error states
│   │   │   ├── DetailFootnote.tsx          # Source / metadata footnote
│   │   │   ├── DetailIcons.tsx             # Shared SVG icons for detail pane
│   │   │   │
│   │   │   │  # ── Organization & curation ─────────────────────────
│   │   │   ├── TagSystem.tsx               # Custom colored tags: create, assign, filter
│   │   │   ├── QuestionFlags.tsx           # Flag: confusing/great/too-easy/similar
│   │   │   ├── Annotations.tsx             # Text highlighting with 4 colors
│   │   │   ├── NoteEditor.tsx              # Inline notes attached to a question
│   │   │   ├── DraggablePrintList.tsx      # Drag-and-drop reorderable print set
│   │   │   ├── ChoiceAnalysis.tsx          # Per-choice answer distribution analysis
│   │   │   ├── PrintSet.tsx                # Print set sidebar / management UI
│   │   │   ├── QuickBuild.tsx              # Quick set builder entry (wizard host)
│   │   │   ├── QuickBuildPill.tsx          # Quick-build launcher pill
│   │   │   ├── QuickBuildConfigureStep.tsx # Step 1: configure parameters
│   │   │   ├── QuickBuildPreviewStep.tsx   # Step 2: preview generated set
│   │   │   ├── QuickBuildSaveTemplatePrompt.tsx # Step 3: save as template
│   │   │   ├── QuickBuildTemplates.tsx     # Saved-template browser
│   │   │   │
│   │   │   │  # ── Export, sharing & collab ────────────────────────
│   │   │   ├── PdfExport.tsx               # Print-friendly HTML for save-as-PDF
│   │   │   ├── ExportFormats.tsx           # Plain text, CSV, Markdown + ExportMenu
│   │   │   ├── ShareSet.tsx                # Encode/decode print set IDs as base64url links
│   │   │   ├── StateExport.tsx             # Export/import full app state JSON
│   │   │   ├── QuestionSnapshot.tsx        # Capture a question as a shareable image
│   │   │   ├── LanSync.tsx                 # LAN sync between devices (WebRTC / mDNS)
│   │   │   │
│   │   │   │  # ── Analysis & visualization ────────────────────────
│   │   │   ├── StatsPanel.tsx              # Distribution charts: difficulty/section/domain
│   │   │   ├── PrintSetAnalytics.tsx       # Answer balance, time estimate, skill coverage
│   │   │   ├── CompareView.tsx             # Side-by-side question comparison
│   │   │   ├── KnowledgeGraph.tsx          # Domain/skill graph visualization
│   │   │   ├── ActivityCalendar.tsx        # Daily activity heatmap calendar
│   │   │   ├── MaintainerView.tsx          # Maintainer/curator inspection view
│   │   │   │
│   │   │   │  # ── Search ──────────────────────────────────────────
│   │   │   ├── Highlight.tsx               # Search term highlighting with <mark>
│   │   │   ├── SearchExtras.tsx            # Advanced search helpers (operators, history)
│   │   │   │
│   │   │   │  # ── UI utilities ────────────────────────────────────
│   │   │   ├── ListExtras.tsx              # CompactToggle, QuestionPreviewTooltip
│   │   │   ├── StickyActions.tsx           # Sticky detail header toggle pills
│   │   │   ├── DarkModeToggle.tsx          # Dark mode toggle + useDarkMode hook
│   │   │   ├── A11yPreferences.tsx         # Accessibility preferences (font, motion, contrast)
│   │   │   ├── ShortcutCustomizer.tsx      # Remap keyboard shortcuts
│   │   │   ├── BatchOps.tsx                # Batch bookmark/done/tag operations bar
│   │   │   ├── VirtualList.tsx             # Virtualized list rendering for long lists
│   │   │   ├── BottomSheet.tsx             # Mobile bottom-sheet overlay primitive
│   │   │   ├── AdaptiveLayout.tsx          # Responsive layout switcher (mobile/desktop)
│   │   │   │
│   │   │   │  # ── Hooks colocated here ────────────────────────────
│   │   │   ├── TimeTracker.tsx             # Per-question time tracking hook + UI
│   │   │   ├── SwipeNav.tsx                # Touch swipe navigation between questions
│   │   │   │
│   │   │   ├── lazy.ts                     # React.lazy wrappers for code-split modals
│   │   │   └── index.ts                    # Barrel export for all components
│   │   │
│   │   ├── hooks/                          # Foundational custom hooks
│   │   │   ├── index.ts                    # Barrel + inline useLocalStorage*/useMediaQuery
│   │   │   ├── useKeyboardShortcuts.ts     # Global keyboard shortcut registration
│   │   │   ├── useFocusTrap.ts             # WCAG 2.4.3 focus trap for modals
│   │   │   └── useModals.ts                # Modal state machinery
│   │   │
│   │   └── lib/                            # Pure utility functions (foundations)
│   │       ├── facets.ts                   # Declarative facet engine: types, applyFacets,
│   │       │                               #   facetCounts, sanitizeFacetState, URL serializers
│   │       ├── filterRegistry.ts           # FILTERS array — 9 facet definitions
│   │       ├── filterAdapter.ts            # Filters ↔ FacetState bidirectional adapter
│   │       │                               #   + applyAllFilters pipeline
│   │       ├── designTokens.ts             # IDENTITY palette — 6 semantic colors
│   │       ├── designSystem.ts             # Full reference catalog: IDENTITY + DIFFICULTY +
│   │       │                               #   CONFIDENCE + STATUS + TYPE + SPACE + SURFACE +
│   │       │                               #   INTERACTIVE + Z
│   │       ├── fetch.ts                    # fetchJson<T>() with throw-on-non-OK
│   │       ├── filters.ts                  # Legacy applyFilters/sanitizeFilters (adapter shim)
│   │       ├── sets.ts                     # AVAILABLE_SETS metadata + baseForSet()
│   │       └── index.ts                    # Barrel export
│   │
│   ├── eslint.config.js                    # Enforces: no inline hex codes, no arbitrary
│   │                                       #   z-index brackets, no arbitrary color brackets
│   │                                       #   in components (design-rule violations fail CI)
│   ├── tailwind.config.js                  # Custom `ink` neutral + `accent` SF Blue,
│   │                                       #   darkMode: 'class'
│   ├── vite.config.ts
│   ├── package.json
│   └── README.md
│
├── docs/                                  # ← you are here
│   ├── README.md
│   ├── SITEMAP.md
│   ├── COMPONENTS.md
│   ├── DESIGN.md
│   ├── PROCEDURES.md
│   ├── MECHANISMS.md
│   ├── LEARNINGS.md
│   ├── SESSION_PROGRESS.md
│   └── SESSION_REPORT.md
│
├── sat_scraper_legacy/                    # Archived prior attempts (Scrapy + Puppeteer). Reference only.
├── venv/                                  # Python virtualenv
└── progress.json                          # Legacy scraper progress file (unused)
```

## What runs where

| Need to… | Run |
|---|---|
| Scrape | `python scraper/api_scraper.py` |
| Scrape IBN fallback | `python scraper/ibn_scraper.py` |
| Rebuild the viewer's index | `python scripts/build_index.py` |
| Normalize skill capitalization | `python scripts/normalize_skills.py` |
| Find duplicate questions | `python scripts/find_duplicates.py` |
| Show question history | `python scripts/question_history.py <id>` |
| Develop the viewer | `cd viewer && npm run dev` |
| Build for production | `cd viewer && npm run build` |
| Preview production build | `cd viewer && npm run preview` |
| Type-check viewer | `cd viewer && npx tsc --noEmit` |
| Lint viewer | `cd viewer && npm run lint` — ESLint, also catches design-rule violations (inline hex, arbitrary `z-[…]`, arbitrary color brackets in components) |
