# Codemap — `scripts/export-sets/`

Print-first SAT question bank export pipeline. Reads raw College Board JSON,
groups questions into sets, and emits matching `questions.html` + `key.html`
pairs (optionally with PDFs and a manifest). A separate index builder rolls
everything into a single browsable catalog.

## How to run

```bash
# Build all axes (skill / domain / mixed) for both sections, hard difficulty.
node scripts/export-sets/build-sets.mjs --all

# Build one axis explicitly.
node scripts/export-sets/build-sets.mjs --axis skill   --section math --difficulty hard
node scripts/export-sets/build-sets.mjs --axis domain  --section reading-and-writing --difficulty medium
node scripts/export-sets/build-sets.mjs --axis mixed   --section math --pdf

# Build the top-level catalog index (HTML + JSON) after the sets exist.
node scripts/export-sets/build-index.mjs

# Audit the raw data bank for missing keys / broken context / rare skills.
node scripts/export-sets/audit.mjs               # writes data/audit.md + data/audit.json

# Post-build CSS deduplication (run after build-sets to shrink exports/).
node scripts/export-sets/lib/extract-styles.mjs  # writes data/exports/_assets/styles.css

# Tests.
node --test scripts/export-sets/__tests__/*.test.mjs
# or
npm run test:export-sets
```

## Data flow

```
            ┌───────────────────────────┐
            │  data/json/<section>/     │
            │       <difficulty>/       │
            │       <domain>/*.json     │
            └────────────┬──────────────┘
                         │  (raw CB questions)
                  load.mjs
                         │
                         ▼
                   select.mjs   ── bySkill / byDomain / byMixed
                         │  (sets: [{ setName, label, questions, … }])
                         ▼
                  format.mjs    ── normalize · renderQuestionCard · renderAnswerCell
                         │  (HTML fragments)
                         ▼
                  render.mjs    ── fills templates, writes HTML
                         │             │
                         │             └── render-pdf.mjs (optional puppeteer pool)
                         ▼
            ┌───────────────────────────┐
            │  data/exports/by-<axis>/  │
            │   <section>/<difficulty>/ │
            │     *_questions.html      │
            │     *_key.html            │
            │     manifest.json         │
            └────────────┬──────────────┘
                         │
                  build-index.mjs   ── walks exports, emits index
                         │
                         ▼
            ┌───────────────────────────┐
            │  data/exports/index.html  │
            │  data/exports/catalog.json│
            └───────────────────────────┘
                         │
                  extract-styles.mjs  ── dedupes the inline ~16 KB
                         │              stylesheet into _assets/styles.css
                         ▼
            ┌───────────────────────────┐
            │  data/exports/_assets/    │
            │     styles.css            │
            └───────────────────────────┘
```

## Files

### Entry points

- **`build-sets.mjs`** — CLI entry. Parses flags (`--axis`, `--section`,
  `--difficulty`, `--skill`, `--set-size`, `--mixed-count`, `--pdf`,
  `--paper`, `--all`), drives the load → select → render pipeline, writes
  per-difficulty `manifest.json`, and closes the shared puppeteer browser
  at the end. Exposes only its own `main` flow; no library exports.

  Env vars that influence PDF generation:
  - `PDF_CONCURRENCY` (default 3) — number of pages rendered in parallel
  - `PDF_RECYCLE_AFTER` (default 150) — browser auto-recycle threshold

- **`build-index.mjs`** — Standalone catalog builder. Walks
  `data/exports/by-{skill,domain,mixed}/{section}/{difficulty}/manifest.json`,
  composes a `catalog.json` (one entry per generated set with HTML/PDF
  paths), and emits a self-contained `index.html` SPA with vanilla JS.

  Catalog features:
  - **Sidebar facets** with live `sets · questions` counts: Difficulty
    (color-coded dots), Section, Set type, Topic (collapsible scroll list),
    Length (≤10 / 11–18 / 19+).
  - **Free-text search** with weighted ranking: exact-skill (10) >
    skill prefix (7) > skill substring (5) > label (3) > topic (1).
  - **Cards grouped by skill** with collapsible headers and set-count
    badge. Collapsed by default when >3 sets; opens when searching.
  - **Build packet (JSZip)** — per-card `+` button adds set to a tray
    (bottom-right FAB), drawer lists selections, "Download as ZIP"
    bundles the matching PDFs organized by section/difficulty subfolders.
    JSZip loaded from CDN (`cdn.jsdelivr.net/npm/jszip@3.10.1`) with SRI.
  - **Recently opened** — clicking any per-card link records the set;
    sidebar shows the last 5, click jumps to the card with a flash.
  - **Filter persistence** — state saved in
    `localStorage['sat-qb-filters-v1']`; invalid keys silently dropped
    on load.
  - **Sidebar collapse** — toggle button + `⌘\`, persisted in
    `localStorage['sat-qb-sidebar-collapsed']`.
  - **Mobile responsive** — at <768 px the sidebar slides over as an
    off-canvas drawer (hamburger button + scrim); at <480 px cards
    stack to a single column.
  - Keyboard: `/` focuses search, `Esc` clears search / closes drawer.

- **`audit.mjs`** — Health check over `data/json/`. Counts questions per
  section × difficulty, flags broken items (empty `keys` and empty
  `answerOptions`), surfaces questions whose stem references context
  ("above", "shown", "following") with no `raw.body`/`raw.stimulus`, lists
  rare skills (< 10 questions — typo candidates), and computes the median
  stem length per skill. Outputs both Markdown and JSON to `data/`.
  Designed to finish in well under 5 s on the full ~3.4 k question dataset.

### Library — `lib/`

- **`load.mjs`** — Filesystem glue. `loadQuestions({ section, difficulty })`
  walks `data/json/<section>/<difficulty>/<domain>/*.json`, parses each
  file, tags each question with `_domainSlug`, and returns a flat array.
  Also exports `byField(items, field)` — a generic grouping helper, used
  rarely.

- **`select.mjs`** — Pure selection strategies. Each returns
  `[{ setName, label, skill, setId, questions }]`.
  - `bySkill(questions, { chunkSize = 10 })` — groups by `q.skill`, sorts
    each group by `questionId`, chunks into fixed-size sets.
  - `byDomain(questions, { setSize = 10, seed = 1 })` — stratified sampling
    within a domain: round-robin draws across the domain's skill buckets so
    skill proportions are preserved when possible.
  - `byMixed(questions, { setSize = 10, sets = 4, seed = 7 })` — weighted
    random sampling across the whole section, proportional to domain
    volume in the bank. Largest-remainder rounding distributes the
    leftover slots.
  - Helpers: `slug(s)` (exported), `chunk`, `shuffle`, `mulberry32` (the
    seeded PRNG that makes `byDomain` / `byMixed` reproducible).

- **`format.mjs`** — Question normalization + HTML builders.
  - `normalize(q)` — turns a raw CB JSON record into the shape templates
    expect. Resolves `correctLetter` (A–E) for MCQs from `keys[0]` against
    `answerOptions[].id`; for SPRs, surfaces the first accepted key as
    `correctText` and the rest as `altAnswers`. When `keys` are empty
    (e.g. ~37 hard-math items), falls back to `extractFromRationale` which
    parses "The correct answer is X." out of the rationale prose. Sets
    `keyMissing` true when both paths fail.
  - `cleanStimulus(body)` — strips CB's nested `stimulus_reference`,
    `passage`, and `prose` wrapper divs so the table/figure embeds cleanly.
  - `renderQuestionCard(q, index)` — `<article class="card">` HTML.
  - `renderAnswerCell(q, index, difficultyKey)` — answer-key entry with
    pill, accepted-alternate forms, and the full rationale HTML.
  - `escapeHtml(s)` — `&<>"`-safe coercion used by both renderers.

- **`render.mjs`** — Template glue. `renderSet(set, opts)` reads
  `templates/{styles.css, questions.html, key.html}`, builds a substitution
  bag (`title`, `styles`, `cards`, `answers`, `pageFooter`, `keyPageFooter`,
  `setNumPadded`, `missingNote`, …), runs `{{key}}` replacement, writes
  both HTML files to `outDir`, and — when `--pdf` is on — orchestrates
  three concurrent PDF jobs (compact, spaced, key) via the shared
  puppeteer pool, runs Ghostscript compression on each, and (when
  compact's page count equals spaced's) hardlinks the spaced PDF to the
  compact one to save disk.

- **`render-pdf.mjs`** — Puppeteer pool with reliability features.
  - `getBrowser` / `closeBrowser` — shared browser instance, auto-recycled
    after `PDF_RECYCLE_AFTER` (default 150) renders to prevent CDP
    connection exhaustion on long batch runs.
  - `htmlFileToPdf` — wraps `_renderOnce` with retry-on-disconnect
    (`Connection closed` / `Target closed` / `Protocol error` →
    relaunch browser, try once more).
  - `htmlFilesToPdfs(jobs, { concurrency })` — runs jobs through
    `runWithConcurrency` pool, defaulting to `PDF_CONCURRENCY` (3).
    Each job: `{ htmlPath, pdfPath, density?, paper? }`.
  - `density` toggles the body class (`density-compact` vs
    `density-spaced`) so the same HTML produces multiple-per-page or
    one-per-page PDFs from a single source.
  - `paper: 'Letter' | 'A4'` overrides the CSS-baked Letter size via
    `addStyleTag({ content: '@page { size: A4 }' })`.
  - `compressPdf(path)` — runs `gs -dPDFSETTINGS=/ebook` in a temp file,
    atomic-renames to overwrite the original. Probes for `gs` once and
    caches the result; warns to stderr a single time if missing. Returns
    `{ compressed, before, after }`. Typical reduction: 30–50 %.
  - `countPdfPages(buf)` — counts `/Type /Page` markers (excluding
    `/Pages`) in the PDF byte stream; used to detect compact ≡ spaced
    so renderSet can hardlink instead of duplicating bytes.

- **`extract-styles.mjs`** — Post-build optimization. Walks
  `data/exports/**/*.html`, finds the first `<style>…</style>` block,
  verifies it contains the signature comment (`SAT Question Bank — Export
  Stylesheet`), and replaces it with a relative `<link rel="stylesheet">`
  pointing to `data/exports/_assets/styles.css`. Writes the shared asset
  once. Idempotent — safe to re-run after an incremental rebuild. Reduces
  total HTML bytes by ~23 MB across the 1.5k+ generated files.

### Helpers / dev scripts

- **`preview-section.mjs`** — Puppeteer one-shot: screenshots a CSS-selected
  region of an HTML file (`<html> <selector> [suffix]`). Used for manually
  validating new template tweaks.
- **`screenshot.mjs`** — Full-page screenshot of one HTML file. Quick eye
  check.
- **`viewport.mjs`** — Single-viewport (above-the-fold) screenshot at a
  given width × height. Useful for evaluating cover-page layout.
- **`test-collapsed.mjs`** — End-to-end check that the index sidebar
  toggle works.
- **`test-persistence.mjs`** — End-to-end check that filter selections
  persist across reloads (localStorage).

### Templates — `templates/`

- **`questions.html`** — Student-facing per-set page. Top: cover with
  difficulty + domain chips, hairline, skill title, meta line
  (questions · est. min), hero-numeral set ID (`01`, `02`, …), hairline,
  brand strip. Main: strip header with breadcrumbs + set number, then
  `{{cards}}` (one `<article class="card">` per question with stimulus,
  stem, choices or grid-in). Bottom: floating screen-only toolbar
  (`Layout: [Condensed | 1 Question Per Page] · Print`) with choice
  persisted in `localStorage['sat-qb-density']`. Footer crumb
  injected per-set via `{{pageFooter}}` (form: `<skill> — Set <n> ·
  <domain>`).

- **`key.html`** — Teacher-facing answer key. Hero-numeral cover that
  mirrors the question file but adds an `ANSWER KEY` chip and brand line
  `ANSWER KEY · SAT QUESTION BANK`. Main: strip header (extra `KEY`
  crumb), then `{{answers}}` — each entry is `Q<n>` + color-coded
  difficulty pill (or em-dash for the 70 unrecoverable items) + the
  correct-choice content + alternate-form line + hairline + the full
  CB rationale HTML (MathML and base64 images preserved). Footnote
  block dynamically lists Qs that needed em-dash placeholders. Footer
  crumb via `{{keyPageFooter}}` (form: `<skill> — Set <n> · <domain> ·
  KEY`).

- **`styles.css`** — Shared stylesheet. Defines the entire visual system:
  - Tokens (ink ramp, rule grays, difficulty colors, type stacks).
  - `@page` rules: Letter size, 0.7 in margins, page numbers in
    `@bottom-right`, footer crumb in `@bottom-left`, cover unfooterd via
    `@page :first`.
  - `.cover` + `.cover-card` + `.cover-body` + `.cover-num` — hero
    numeral cover layout; compact on screen, full-page in print
    (`@media print { min-height: 92vh; … }`).
  - `.strip`, `.card`, `.stem`, `.choices`, `.stimulus` — question card
    system. Choices stack in a single vertical column.
  - `.gridin` + `.gridin__box` + `.gridin__digit` — SAT-style 4-column
    bubble grid for student-produced response questions.
  - `.density-compact .card`, `.density-spaced .card` — density toggle
    (the latter forces `break-after: page`).
  - Answer-key section: `.key-cover`, `.key-entry`, `.answer-pill`,
    `.answer-pill--missing`, `.key-entry__rationale`.
  - `.toolbar` (screen-only via `@media print { display: none }`).

`render.mjs` reads all three templates on each call and runs `{{key}}`
substitution. After a build, `extract-styles.mjs` replaces the inline
`<style>` block in every generated HTML with a `<link>` to
`data/exports/_assets/styles.css` to save ~23 MB.

### Tests — `__tests__/`

- **`select.test.mjs`** — 16 tests covering `bySkill` (chunking, naming,
  sorting, custom chunk size, missing-skill fallback), `byDomain`
  (stratified sampling, graceful degradation, domain-labeled output),
  `byMixed` (seeded reproducibility, proportionality, exhaustion handling),
  and `mulberry32` indirectly via `byMixed` determinism.
- **`format.test.mjs`** — 17 tests covering `normalize` for MCQs (A/B/C/D
  letter resolution, rationale fallback, `keyMissing` detection), SPRs
  (primary + alternate keys, rationale fallback, wrapping-tag strip),
  `cleanStimulus` (wrapper unwrapping, short-input guard), and
  `escapeHtml` (special chars, null/undefined, number coercion).

Run with `node --test scripts/export-sets/__tests__/*.test.mjs` or
`npm run test:export-sets`.

## Manifest & catalog shape

### `manifest.json` (per `by-<axis>/<section>/<difficulty>/`)

Emitted by `build-sets.mjs` alongside each batch of HTML files.

```jsonc
{
  "generatedAt": "2026-05-29T09:23:18.479Z",
  "section": "math",
  "difficulty": "Hard",
  "axis": "skill",
  "setCount": 4,
  "questionCount": 32,
  "sets": [
    {
      "setId": "1",
      "label": "Linear equations in two variables — Set 1",
      "questionCount": 10,
      "files": {
        "questionsHtml": "linear-equations-in-two-variables-set-1_questions.html",
        "keyHtml":       "linear-equations-in-two-variables-set-1_key.html"
        // Companion PDFs are inferred by build-index.mjs at refresh time
        // from the same basename (`*_questions.pdf`, `*-spaced.pdf`,
        // `*_key.pdf`) — they aren't stored in the manifest. About 47%
        // of `*-spaced.pdf` files are hardlinks to their compact siblings
        // when the page count is identical.
      }
    }
  ]
}
```

### `catalog.json` (single file at `data/exports/catalog.json`)

Emitted by `build-index.mjs`. One flat entry per generated set, regardless
of axis — paths are repo-root-relative (i.e. relative to `data/exports/`).

```jsonc
{
  "generatedAt": "2026-05-29T09:11:17.659Z",
  "entries": [
    {
      "axis": "skill",                 // "skill" | "domain" | "mixed"
      "section": "math",               // "math" | "reading-and-writing"
      "difficulty": "easy",            // "easy" | "medium" | "hard"
      "setId": "1",
      "label": "Equivalent expressions — Set 1",
      "topic": "Equivalent expressions",
      "questionCount": 10,
      "questionsHtml":      "by-skill/math/easy/equivalent-expressions-set-1_questions.html",
      "keyHtml":            "by-skill/math/easy/equivalent-expressions-set-1_key.html",
      "questionsPdf":       null,      // populated when sets were built with --pdf
      "questionsPdfSpaced": null,
      "keyPdf":             null
    }
  ]
}
```

The `index.html` sibling is a self-contained SPA that reads this JSON and
renders the filterable catalog. No build step; load it directly in a
browser.
