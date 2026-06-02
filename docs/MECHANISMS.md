# Mechanisms

How the system works under the hood. Aimed at someone who has read the code briefly and wants the "why."

## Scrape pipeline

### Discovered API endpoints

All public, no auth required (this took a while to figure out — see [LEARNINGS.md](./LEARNINGS.md)).

| Endpoint | Purpose |
|---|---|
| `GET https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/lookup` | Taxonomy (assessment / test / domain / skill) |
| `POST .../digital/get-questions` | List question metadata for a filter set |
| `POST .../digital/get-question` | Full question content (stem, choices, keys, rationale) |
| `GET https://saic.collegeboard.org/disclosed/<ibn>.json` | Legacy IBN questions (different host) |

**`get-questions` body**: `{"asmtEventId":99, "test":<1|2>, "domain":"<comma-codes>"}` (1=R&W, 2=Math; domain codes from `/lookup`).
**`get-question` body**: `{"external_id":"<uuid>"}`. ~25% of Math questions return null `external_id`; these are IBN-style and need the legacy host.

### Two-pass flow

```
api_scraper.py
  ├─ enumerate via get-questions
  ├─ for each entry, POST /get-question
  ├─ on null external_id → record in api_failed.json
  └─ write data/json/<section>/<difficulty>/<domain>/<id>.json

ibn_scraper.py
  ├─ read api_failed.json
  ├─ GET https://saic.collegeboard.org/disclosed/<ibn>.json
  ├─ normalize IBN schema → unified question schema
  └─ write to same data/json/... layout
```

### Schema normalization for IBN

IBN responses use a different shape (`prompt` instead of `stem`, `answer.choices.{a,b,c,d}` instead of `answerOptions`). `ibn_scraper.py::normalize_ibn` maps it to the unified viewer schema so the UI doesn't have to branch.

## Viewer architecture

```
App.tsx
 ├─ index.json fetched once on mount → IndexEntry[]
 │   (now includes scoreBand, hasStimulus, updateDate fields)
 ├─ Filters state → sanitized → applied → tag-filtered → finalFiltered
 │   ├─ Hydrated from URL hash on first render
 │   ├─ Sanitized against the live index (drops orphans + cascade-prunes)
 │   ├─ Tag filter applied as a second pass (OR across active tags)
 │   └─ Persisted back to hash on every change
 ├─ Question fetch cache:
 │   ├─ In-memory LRU (cap 200) — hot reads
 │   ├─ IndexedDB persistent cache — survives reload
 │   └─ Service worker (public/sw.js) — offline cache-first for assets/JSON
 ├─ View mode: browse / practice / flashcard
 ├─ Timer session (countdown, question queue)
 ├─ Keyboard handler (J/K/A/R, /, ?, 1/2/3, Shift+M/R/Z, Esc)
 ├─ Print set management (order, drawer, analytics, export)
 └─ Renders Sidebar | QuestionList | Detail
     + overlays: CommandPalette, StatsPanel, CompareView,
       QuickBuildWizard, TimerSetup, ProgressDashboard, HelpOverlay
```

### Filter logic

Two distinct concepts:

1. **The visible result list** — `applyFilters(index, filters)`.
   - Short-circuits to `[]` when any required facet is empty.
   - Otherwise: all four sets are AND-ed; an empty set means "no constraint from this category."
   - Case-insensitive `Set.has` via `ciHas()` so legacy URL casings still match.
2. **Facet counts in the sidebar** — each category's count = items matching all *other* categories' filters, grouped by that category. Standard "faceted search" pattern. Implemented as four separate scopes in `Sidebar.tsx` (`sectionScope`, `difficultyScope`, `domainCountScope`, `skillCountScope`).
3. **Tag post-filter** — `finalFiltered`: after `applyFilters`, an additional pass removes entries not matching any active tag (OR semantics). When no tags are active, passes through unchanged. This is a separate memo so the base filter set stays available for facet counts.

Note: `REQUIRED_FACETS` is now `[]` — all questions display immediately on first load.

The result: every count narrows by the others, and a "0" next to a row signals truthfully that picking it (with current filters) yields nothing.

### Domain / Skill tree

`buildDomainTree` in `Sidebar.tsx` produces:
- Every domain that exists in the current `section + difficulty + search` scope (so unrelated domains never appear).
- Per-domain count: from `domainCountScope` (which drops the domain filter).
- Per-skill count under a domain: from `skillCountScope` (which drops the skill filter).
- Skill names deduped case-insensitively (canonical = most common case variant).

Auto-expand rule: a domain is expanded if **manually expanded OR domain is checked OR any of its skills is checked**.

### URL hash format

Encoded with `URLSearchParams`. Keys:
- `q` — question hash id (stable across re-indexes)
- `sec` — pipe-delimited section names
- `diff` — pipe-delimited difficulty names
- `dom` — pipe-delimited domain names
- `skl` — pipe-delimited skill names
- `s` — search query

Example: `#q=03c9f327&sec=Reading+and+Writing&diff=Hard&dom=Craft+and+Structure`.

Note: `q` uses the underlying hash id, NOT the user-facing number. Reason: numbers are assigned at index-build time and may shift if questions are added; hash ids are forever.

### Sanitization (defensive parsing)

`sanitizeFilters` runs every render (via `useEffect`). It:
1. Drops filter values that don't exist in the index (typo, manual edit, stale URL).
2. Cascade-prunes: if user has Domain=X and switches Section so X is no longer valid, X is dropped. Same for Skill ↔ Domain.

Returns the *same* object reference when nothing changed, so it never triggers an extra render.

### Question numbers `#1..N` per skill

Assigned by `scripts/build_index.py`:
1. Read every JSON file.
2. Sort by `(section, domain, skill, difficulty_rank, id)`.
3. **Reset the counter at each skill** and assign 1..N within that skill (easier first).

So #1 means "the first question in this skill," not "the first of 3,444." The skill name in the breadcrumb / list subtitle gives the number its context. Inside a single skill the numbers are stable across re-runs because the sort key is deterministic.

Numbers live only in `data/index.json`. Question files themselves don't carry the number, which is fine since the viewer always has the index in memory.

URL hashes use the underlying question id (`#q=03c9f327`), not the number — so bookmarks survive even if the bank grows.

### Trusted HTML rendering

Question stems, stimuli, choices, and rationales are written via `dangerouslySetInnerHTML`. This is **intentional** — they contain MathML which would not survive any sanitizer worth using. The content source is College Board (not user input), so XSS isn't a meaningful threat. A small `useEffect` in `Detail.tsx::HTML` post-processes the injected DOM to:
- Add `loading="lazy"` + `decoding="async"` to images
- Add `target="_blank" rel="noopener noreferrer"` to anchor tags

### MathML

Rendered natively by the browser. The custom font stack (`STIX Two Math`, `Cambria Math`, `Latin Modern Math`, serif) picks up whichever the OS has.

## Update / sync system (`scripts/sync.py`)

The sync script is the maintenance entry point. Its job: keep the local copy of the question bank in sync with the upstream API without ever corrupting local state, regardless of network conditions, kills, or schema drift.

### Pipeline
```
sync.py
 ├─ Acquire data/.sync.lock (O_EXCL; stale > 1h is auto-reclaimed)
 ├─ For each section (Math, R&W):
 │   ├─ POST /digital/get-questions → upstream metadata list
 │   └─ For each upstream entry, compared to local:
 │       ├─ NEW (file missing)            → fetch + write
 │       ├─ updateDate(upstream) > local  → re-fetch + overwrite
 │       ├─ Same updateDate               → skip
 │       └─ null external_id              → IBN fallback (saic.collegeboard.org)
 ├─ Detect removals: qids on disk but not upstream → log to data/.deleted.json
 ├─ Run scripts/normalize_skills.py (idempotent)
 ├─ Run scripts/build_index.py (regenerates data/index.json + per-skill #s)
 ├─ Append run summary to scraper/sync_history.json
 └─ Release lock
```

### Robustness guarantees

| Failure mode | Mitigation |
|---|---|
| Process killed mid-write | Atomic writes — `os.replace(tmp, target)` |
| Two syncs run simultaneously | `data/.sync.lock` with PID; stale > 1h reclaimed |
| API returns 429 / 502 / 503 / 504 / timeout | Exponential backoff: 1.5s → 3s → 6s → 12s → 24s, up to 5 attempts |
| Malformed response | `validate_question()` rejects payloads without a stem; row goes into errors list, file untouched |
| Upstream adds a new field | `raw` blob preserves the full upstream payload verbatim |
| Question removed upstream | Soft-delete entry in `data/.deleted.json`; file stays so question numbers don't shift |
| Question's domain/skill renamed | Old folder cleaned up after the new write (`existing.unlink` if path moved) |
| External_id is null | IBN endpoint `saic.collegeboard.org/disclosed/<ibn>.json` is the fallback |
| Local edits (bookmarks, notes) | Keyed on stable hash id, not on number — unaffected by re-indexing |
| Disk full / permission error | Logged in the run's `errors` list; other rows continue |
| Network completely down | Lock released, exit code 2 |
| Run interrupted with SIGINT/SIGTERM | Lock released cleanly via signal handler |

### Exit codes
- `0` — clean run, no errors
- `1` — partial — some rows failed; check `scraper/sync_history.json`'s last entry's `sections[*].errors`
- `2` — fatal — lock held, network down, or other reason no rows could be processed

### Audit trail

`scraper/sync_history.json` is a list of the last 100 runs. Each entry:
```jsonc
{
  "started": "2026-05-25T20:00:00Z",
  "finished": "2026-05-25T20:00:02Z",
  "elapsedSec": 2.0,
  "force": false,
  "dryRun": false,
  "sections": [
    { "section": "Math", "upstream": 1756, "new": 0, "updated": 0, "skipped": 1756, "ibn_new": 0, "errors": [] }
  ],
  "removed": []   // qids vanished upstream
}
```

## Personal state (bookmarks, done, set, notes, recents, font size)

Stored in `localStorage` (handled by `viewer/src/hooks.ts`):

| Key | Type | Meaning |
|---|---|---|
| `sat:bookmarks` | `string[]` (JSON) — question ids | Stars / "save for later" |
| `sat:done` | `string[]` (JSON) — question ids | Reviewed / practiced |
| `sat:selected` | `string[]` (JSON) — question ids | Print-set (worksheet builder) |
| `sat:notes` | `{[id]: string}` (JSON) | Per-question free-text annotations |
| `sat:recent` | `string[]` (JSON, capped at 20) | Recently-viewed ids; surfaced in ⌘K palette |
| `sat:font-step` | number `-2..3` | Stem font-size offset (`--qfs` CSS variable) |
| `sat:confidence` | `{[id]: number}` (JSON) | Per-question confidence (1=unsure, 2=okay, 3=confident) |
| `sat:print-order` | `string[]` (JSON) | Custom print set ordering |
| `sat:tags` | `Tag[]` (JSON) | User-created tag definitions |
| `sat:question-tags` | `{[qid]: tagId[]}` (JSON) | Tag assignments per question |
| `sat:flags` | `{[qid]: QuestionFlag[]}` (JSON) | Quality flags per question |
| `sat:annotations` | `{[qid]: Annotation[]}` (JSON) | Text highlights per question |
| `sat:dark-mode` | boolean | Dark mode preference |
| `sat:build-templates` | `Template[]` (JSON) | Saved Quick Build configs |
| `sat:spaced-rep` | `Record<id, ReviewRecord>` (JSON) | SM-2 review history + due dates |
| `sat:activity-log` | `Array<{date, ids[]}>` (JSON) | Daily activity for calendar heatmap |
| `sat:time-tracker` | `Record<id, {count, totalSeconds}>` (JSON) | Per-question viewing time totals |
| `sat:choice-notes` | `Record<qid, Record<choiceId, string>>` (JSON) | Per-MCQ-choice pedagogical notes |
| `sat:a11y-prefs` | `A11yPrefs` (JSON) | Dyslexia / contrast / math speech / spacing prefs |
| `sat:shortcuts` | `ShortcutMap` (JSON) | Custom keyboard bindings |
| `sat:filter-presets` | `FilterPreset[]` (JSON) | Saved named filter views |
| `sat:sidebar-depth` | `"simple" \| "advanced"` | Sidebar depth preference |

State syncs across tabs via the `storage` event.

A status filter (`Bookmarked` / `Done`) is offered in the sidebar **only when there's something to filter** (`bookmarks.size > 0 || done.size > 0 || filters.status.size > 0`). When a status filter is on it bypasses the difficulty-required safeguard, since the user has already curated the set explicitly.

## Print — two modes

`@media print` in `index.css` recognizes two print paths:

1. **Single-question print** (default, triggered by `P` or `cmd+P`). Sidebar/list hide; only the detail pane prints with 0.5in padding.
2. **Worksheet / print-set** (triggered by the "Print" button in the selection drawer). `App.tsx::printSelected` force-fetches all selected ids into cache, mounts a hidden `<PrintSet>` container with every question stacked (plus an answer-key page), then calls `window.print()`. The CSS uses `body:has(.print-set-container)` to switch to worksheet layout, hiding the detail pane entirely.

## Command palette (`⌘K`)

`viewer/src/CommandPalette.tsx`. Three grouped sections — Recent / Questions / Commands — with substring matching (case-insensitive) across number, id, skill, domain, section, difficulty, stem text, and command label/keywords. Arrow keys + Enter to execute. Custom-rolled rather than pulling in a library — kept the dependency count flat.

Commands now include Quick Build wizard, Timer setup, Progress Dashboard, and Dark Mode toggle in addition to the original navigation and filter commands.

## Performance: cheap virtualization

The list applies `content-visibility: auto` + `contain-intrinsic-size: 1px 84px` to each `<li>`. Browsers skip layout/paint for off-screen items while preserving scroll height. This keeps the 3,444-row list scrollable on cheap hardware without bringing in a virtualization library.

Compact list mode uses `contain-intrinsic-size: 1px 36px` instead of 84px for the shorter row height. The hover preview tooltip uses a React portal for positioning so it can overflow the list container without clipping.

## Practice mode

Three modes controlled by `ModeToggle` in the header: Browse (default, read-only), Practice (click-to-answer with correct/incorrect feedback, SPR text input), Flashcard (choices hidden until revealed). Implemented in `PracticeMode.tsx`. State resets on question change.

## Timed sessions

`TimerSession.tsx` provides `useTimer`, `TimerBar` (36px countdown with color transitions), and `TimerSetup` (modal with preset durations). Flow: setup modal → shuffle filtered list → navigate queue → time up stops session.

## Confidence & progress tracking

`ConfidenceRating` (3-dot widget per question), `ProgressDashboard` (overview cards, coverage by section, skill mastery heatmap, suggested focus areas). Clicking a heatmap cell filters to that skill+difficulty.

## Tags, flags, annotations

Three localStorage-backed organization systems: Tags (user-defined colored labels, also filterable in sidebar), Flags (confusing/great/too-easy/similar quality markers), Annotations (text highlights with 4 colors). Storage keys: `sat:tags`, `sat:question-tags`, `sat:flags`, `sat:annotations`.

## Print set management

Full workflow: add via S key/shift-click/Quick Build → Manage drawer (drag-and-drop reorder, batch ops) → Analytics (difficulty distribution, answer balance warning, time estimate) → Export (Print, PDF, plain text, Markdown, CSV) → Share (base64url link). Order persists in `sat:print-order`.

## Quick Build wizard

Modal for rapid set assembly: configure section/difficulty/domain/count with live match preview, random selection with shuffle, save as reusable template. Templates stored in `sat:build-templates`.

## Dark mode

CSS custom properties + `.dark` class overrides in `index.css`. No component files modified — all handled via CSS variable remapping and structural `.dark .bg-white` etc. overrides. Persisted in `sat:dark-mode`, falls back to `prefers-color-scheme: dark`.

## Virtual list rendering

The question list switched from rendering all 3,444 `<li>` elements (using `content-visibility: auto`) to a windowed virtual list (`components/VirtualList.tsx`). Only ~20 visible items plus 5 overscan above/below are rendered into an absolutely-positioned scroll container whose spacer is sized to `items.length * itemHeight` (e.g., 3,444 × 76px ≈ 261,744px). Scroll position is tracked via rAF-throttled `onScroll`, and the visible range is recomputed on resize via `ResizeObserver`. A `scrollToIndex` helper keeps the selected question in view across filter/navigation changes.

## IndexedDB cache

`IndexedDBCache.ts` provides a persistent question cache that survives page reloads, using a single object store `questions` keyed by id. The fetch path checks IDB first; on miss, fetches from network and writes back best-effort. The in-memory LRU (cap 200) still runs in front for hot reads. Gracefully degrades when IndexedDB is unavailable (e.g., Safari private mode).

## Service worker / PWA

`public/sw.js` provides offline-first behaviour with a versioned cache name (`sat-bank-v1`); old caches are cleaned on activate. Strategy by URL:
- `/data/index.json` — stale-while-revalidate
- `/data/json/**`, `/assets/**` — cache-first
- Everything else — network

Registration lives in `registerSW.ts`, called from `main.tsx` after render (skipped in dev). Combined with `manifest.webmanifest`, this makes the app installable as a PWA.

## Spaced repetition

`components/SpacedRepetition.tsx` implements a simple SM-2-style algorithm:
- First review: 1-day interval
- Confidence 1 (Unsure): interval halved, capped to ≥1 day
- Confidence 2 (Okay): interval × 2
- Confidence 3 (Confident): interval × 3
- Max interval: 90 days

Records persist in `sat:spaced-rep` and are written automatically whenever a user sets a confidence rating. `DueReviewIndicator` in the header shows a count of due reviews and jumps to the first due question on click.

## Knowledge graph

`components/KnowledgeGraph.tsx` is a force-directed canvas visualization of the skill taxonomy. Each unique skill is a node whose radius scales with question count (sqrt) and color reflects average confidence (gray/rose/amber/emerald). Edges connect skills sharing a domain. Layout uses Coulomb-like repulsion plus Hooke-like attraction over 200 iterations on mount; clicking a node filters to that skill.

## Activity calendar & time tracking

`components/ActivityCalendar.tsx` renders a GitHub-style 53×7 heatmap of daily question views. `useActivityLog` logs to `sat:activity-log` on each question selection (deduped per day) and computes current + longest streaks.

`components/TimeTracker.tsx` tracks time spent per question via `useTimeTracker`. Sessions under 2s are discarded (just navigating through) and sessions over 5min are capped (probably afk). Persisted as `Record<id, {count, totalSeconds}>` in `sat:time-tracker`, displayed in the detail footer as "~Ns avg · N× viewed".

## Reading mode, step rationale, progressive hints

Three pedagogy enhancements:
- **Reading mode** (`ReadingMode.tsx`): full-screen distraction-free single-question view with larger text (18px base) and generous line-height (1.8). Useful for projector display or printing one question.
- **Progressive hints** (`ProgressiveHints.tsx`): when the rationale hasn't been revealed, surfaces "Hint 1", "Hint 2", etc., progressively revealing rationale sentences/paragraphs. Resets on question change.
- **Step rationale** (`StepRationale.tsx`): when the rationale is shown, displays it as discrete steps revealed one at a time. Splits on `</p>` first, falls back to sentence boundaries.

## Annotations, choice analysis, snapshots

- **Annotations** (`Annotations.tsx`): select text, pick a color (yellow/green/blue/pink), click "Highlight selection". Stored per question in `sat:annotations`, rendered via `applyAnnotations` which injects `<mark>` tags into the trusted HTML.
- **Choice analysis** (`ChoiceAnalysis.tsx`): per-MCQ-choice notes ("why a student might pick this"), stored as `sat:choice-notes`. Useful for teachers capturing pedagogical observations.
- **Snapshot** (`QuestionSnapshot.tsx`): export a single question as standalone HTML with annotations baked in. Options: open in new tab, copy as HTML, print. Useful for sharing or asking for help.

## Accessibility preferences

`components/A11yPreferences.tsx` adds:
- Dyslexia mode (OpenDyslexic/Comic Sans MS, increased letter & word spacing)
- High contrast mode (forced black/white palette, thick focus rings)
- Math speech (sets aria-label on `<math>` elements via `MathSpeech.ts` — uses MathJax SRE if loaded, falls back to alttext)
- User-adjustable letter spacing (4 stops) and line height (5 stops) via CSS custom properties

All applied by toggling `document.documentElement` classes; no component edits needed (overrides handled in `index.css`).

## Power-user: shortcuts, DSL, presets

- **Shortcut customizer** (`ShortcutCustomizer.tsx`): remap keyboard shortcuts. Stored in `sat:shortcuts`.
- **Filter DSL** (`FilterDSL.tsx`): parser for `section:math difficulty:hard skill:"linear equations" is:bookmarked` syntax. Help popover accessible from the search input.
- **Filter presets** (`FilterPresets.tsx`): save named filter configurations in `sat:filter-presets` for quick-switching between e.g. "Math exam prep" and "RW review".

## Collaboration

- **State export** (`StateExport.tsx`): gather all `sat:*` localStorage into a single JSON file. Import supports merge (union for sets, overlay for maps) or destructive replace.
- **LAN sync** (`LanSync.tsx`): same-origin tabs sync via `BroadcastChannel`. Each tab has a unique source ID and tracks live peers via ping/pong. Future-extensible to cross-machine WebRTC via a signal server.

## Mobile gestures & layout

- **Swipe nav** (`SwipeNav.tsx`): touch-based J/K equivalent. `useSwipeNav` attaches to the main container, detects horizontal swipes (threshold 50px), and respects interactive elements (buttons/inputs).
- **Bottom sheet** (`BottomSheet.tsx`): mobile-native modal pattern with slide-up animation and drag-down-to-dismiss.
- **Adaptive layout** (`AdaptiveLayout.tsx`): three breakpoints — mobile (one pane), tablet (two panes + filter drawer), desktop (three panes).

## Data quality tools

- `scripts/find_duplicates.py`: stdlib-only duplicate detection using normalized stem signatures plus Jaccard similarity within (skill, difficulty) buckets.
- `scripts/question_history.py`: show change diffs across sync runs (requires history tracking enabled in `sync.py`).
- `components/MaintainerView.tsx`: in-app data quality dashboard showing total / missing-field / scoreBand-distribution / freshness metrics.

## 1. Declarative facet engine

`/viewer/src/lib/facets.ts` + `/viewer/src/lib/filterRegistry.ts` provide a declarative filter system. Each filter dimension is a `FacetDef` entry — adding a new dimension is a single line in the registry, not a multi-file edit.

```
FacetDef shape:
  key:      "scoreBand"
  label:    "Score band"
  group:    "Difficulty"  // sidebar grouping
  control:  "range"       // "multi" | "range" | "boolean" | "tree" | "daterange"
  depth:    "advanced"    // "simple" | "advanced" — which depth mode reveals it
  accessor: (e) => e.scoreBand
  matches:  (entryValue, filterValue) => ...
  ordering: [...]         // canonical sort
  range:    { min, max, step }
  hint:     "..."
```

**Engine functions:**
- `applyFacets(defs, state, entries)` — filter entries by state
- `facetCounts(defs, state, entries)` — for each facet, group entries by value (used for sidebar facet counts; correctly drops the facet's own filter so counts predict "what happens if I check this")
- `sanitizeFacetState(defs, state, entries)` — prune invalid values + cascade-prune children (e.g., when section changes, drop skills that no longer exist within scope)
- `facetStateToParams` / `paramsToFacetState` — URL hash serialization

**Filter pipeline** (`/viewer/src/lib/filterAdapter.ts`):
```
entries
 → applyFacets()        — facet engine (everything in IndexEntry)
 → applyStatusFilter()  — bookmarks/done/selected (App-level state)
 → applySearch()        — free text + math text + DSL
 → filtered             — final result
```

The legacy `Filters` type (Set<string>) is kept as an adapter alongside FacetState, so DSL/Presets/URL hash still work. Migration is gradual.

## 2. Adaptive sidebar (Basic / Advanced)

`/viewer/src/components/SidebarV2.tsx` renders the registry-driven sidebar with two depth modes:

| Mode | Width | Visible |
|---|---|---|
| Basic | 256px | section, difficulty, domain → skill tree, status |
| Advanced | 384px | + scoreBand range, type (MCQ/SPR), hasStimulus, freshness + per-skill Aspects panel |

**Aspects panel** appears in Advanced mode at the bottom. When no skill is selected, shows a placeholder explaining how to populate it. When one or more skills are selected, shows the same Format facets (scoreBand/type/hasStimulus) but with counts re-scoped to the entries within those skills — so a teacher sees narrowing numbers within their topic of focus.

Width transition: `transition-[width] duration-200 ease-out`. Depth preference persists in `sat:sidebar-depth` localStorage.

## 3. Design token system

Two files:
- `/viewer/src/lib/designTokens.ts` — IDENTITY palette (6 colors: content / topic / difficulty / format / status / accent). Each has `dot` (bg class) / `topBorder` (border class) / `chipBg` (50-tint) / `chipText` (700-saturation).
- `/viewer/src/lib/designSystem.ts` — Full token reference catalog. IDENTITY is re-exported. Adds DIFFICULTY, CONFIDENCE, STATUS, TYPE (typography), SPACE, SURFACE, INTERACTIVE, Z (z-index scale).

**Status:** IDENTITY is consistently imported in production. The rest is reference-only — existing components may use equivalent inline classes; new code should use the tokens. ESLint enforces no inline hex codes / no arbitrary color brackets / no `z-[N]` raw values in components (with file-by-file exemptions for HTML-export code).

**Identity mapping:**
- content (indigo) → curriculum structure (Section, Domain)
- topic (teal) → skill specificity (Skill)
- difficulty (amber, with emerald/amber/rose for Easy/Med/Hard) → challenge level
- format (violet) → question shape (Type, Has stimulus, Freshness)
- status (slate) → metadata (Bookmarked, Done, Tags)
- accent (blue) → interactive/active

Applied as: 6px colored dots before filter group headers, 3px colored top borders on modals, tinted chips in breadcrumbs, 2px stripes on list rows.

## 4. Modal accessibility (useFocusTrap)

`/viewer/src/hooks/useFocusTrap.ts` provides a single hook applied to 17+ modal/popover components. Closes a WCAG 2.4.3 gap where Tab could leak focus to underlying page.

**Behaviour:**
- On mount/open: save `document.activeElement`, move focus to the dialog's `[data-autofocus]` element (or first focusable element)
- On Tab/Shift+Tab: cycle within dialog
- On unmount/close: restore focus to the previously-focused element

**Pattern:**
```tsx
const dialogRef = useRef<HTMLDivElement>(null);
useFocusTrap(dialogRef, open);
return <div ref={dialogRef} role="dialog" aria-modal="true">...</div>
```

The `active` flag (second arg) lets some modals conditionally disable the trap — `ShortcutCustomizer` disables it during key-capture mode so Tab can be assigned as a binding.

## 5. ESLint design enforcement

`/viewer/eslint.config.js` adds three `no-restricted-syntax` warnings scoped to `src/components/**/*.tsx` + `src/lib/**/*.ts`:

1. Inline hex color literals (e.g., `"#007aff"`)
2. Arbitrary Tailwind color brackets (e.g., `bg-[#1d1d20]`)
3. Arbitrary z-index brackets (e.g., `z-[40]`)

**Exempted files** (legitimate use of hex): `PdfExport.tsx`, `QuestionSnapshot.tsx`, `TagSystem.tsx`, `lib/designSystem.ts`, `lib/designTokens.ts`. New code is enforced; existing violations surface as warnings for incremental migration.

## 6. Migration to FacetState (current status)

The migration from `Filters` (legacy Set-based) to `FacetState` (Record-based) is partial:

- ✅ Filter pipeline runs on FacetState (via `applyAllFilters`)
- ✅ SidebarV2 emits FacetState
- ✅ FacetState mirrored back to Filters via setFilters wrapper
- ✅ URL hash legacy keys still parse (`sec`, `diff`, `dom`, `skl`, `st`, `s`)
- ⏳ New facet keys (`scoreBand`, `type`, `hasStimulus`, `updateDate`) don't yet round-trip via URL hash — they're session-only
- ⏳ Filter DSL still emits Filters; conversion happens at the boundary
- ⏳ Filter Presets store Filters; conversion at apply time

Future work: collapse the Filters adapter once URL hash supports the full FacetState shape.

---

## Edge cases handled in the viewer

| Case | Handling |
|---|---|
| MCQ with no `keys` matching a choice | Amber notice: "Answer key not available; see rationale" |
| `rationale` empty | Button disabled, shows "No rationale" |
| Question `type` ≠ `mcq`/`spr` | Fallback info card; stem still rendered |
| `q=<id>` in URL but id not in index | Auto-falls through to first match in filtered list |
| Filter values not in data (legacy/typo) | Sanitized away silently; URL hash also rewrites |
| Cascade orphan (skill X no longer valid under new section) | Pruned automatically |
| Large data-URI images in stimuli | `loading="lazy"` so initial paint isn't blocked |
| Help modal open + key shortcut | Only Esc and `?` work; J/K/A/R suppressed |
| Search input focused + key shortcut | All shortcuts suppressed except Esc (which blurs the input) |
| Cache grows unbounded | LRU cap at 200 questions, evicts oldest |
| Question fetch fails | Rejected promise evicted from cache so a re-select retries |
| Modal opened from inside another modal | z-index conflict possible; current implementation doesn't formally support stacking dialogs |
| FacetState orphaned by section change | `sanitizeFacetState` cascade-prunes children |
