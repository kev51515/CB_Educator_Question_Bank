# Procedures

Everything you need to do from a fresh checkout.

## One-time setup

```bash
# Python
python3 -m venv venv
source venv/bin/activate
pip install httpx

# Viewer
cd viewer
npm install
cd ..
```

Playwright is only used for the legacy probes in `sat_scraper_legacy/`; the current pipeline is pure httpx + a browser-less viewer.

## Sync (preferred for ongoing maintenance)

```bash
source venv/bin/activate
python scripts/sync.py                 # incremental: only fetch what changed upstream
python scripts/sync.py --force         # re-fetch every question (use sparingly)
python scripts/sync.py --dry-run       # see what would change without writing
python scripts/sync.py --section Math  # one section only
python scripts/sync.py --no-ibn        # skip legacy IBN endpoint
```

The sync script is the safe default for keeping the local bank in sync with College Board's. It:

- Enumerates upstream, compares each `updateDate` to local, **only re-fetches what's changed**
- **Atomic writes** (temp file → rename) so kills mid-write can't corrupt files
- **Lock file** at `data/.sync.lock` blocks concurrent runs (stale locks > 1 hour are reclaimed)
- **Retry with exponential backoff** on 429/5xx/timeouts
- **Schema validation** before writing — drops malformed responses
- **Soft deletes** to `data/.deleted.json` if a question vanishes upstream; file stays so existing question #s don't shift
- Runs `normalize_skills` + `build_index` automatically at the end
- Appends a summary to `scraper/sync_history.json` (last 100 runs kept)

## Initial scrape (one-time, from empty)

```bash
source venv/bin/activate
python scraper/api_scraper.py           # 2,985 questions via JSON API
python scraper/ibn_scraper.py           # 459 legacy IBN questions
python scripts/normalize_skills.py      # idempotent — fixes case-duplicates
python scripts/build_index.py           # rebuilds data/index.json with per-skill #s
```

Resume is automatic for the initial scrapers too: any `.json` already on disk is skipped. After the initial run, prefer `sync.py` for everything.

## Scrape a single section / difficulty

```bash
python scraper/api_scraper.py --section Math
python scraper/api_scraper.py --section "Reading and Writing" --concurrency 6
```

Default concurrency is 4 (gentle). Bump to 6–8 if the API is responsive; back off if you see timeouts.

## Run the viewer

```bash
cd viewer
npm run dev        # http://localhost:5173
```

The dev server serves `data/` through a symlink at `viewer/public/data`. If the symlink got lost (e.g. fresh clone): `cd viewer/public && ln -s ../../data data`.

## Using the viewer

### Modes

The header has a **Browse / Practice / Flashcard** toggle:
- **Browse** — default read-only mode. Navigate questions, reveal answers.
- **Practice** — click a choice to select it, then "Check answer" for correct/incorrect feedback.
- **Flashcard** — choices are hidden. Think of the answer, then "Reveal choices" and check yourself.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `J` / `↓` | Next question |
| `K` / `↑` | Previous question |
| `A` | Toggle answer |
| `R` | Toggle rationale |
| `B` | Toggle bookmark |
| `D` | Toggle done |
| `S` | Add/remove from print set |
| `N` | Toggle note |
| `G` | Random question |
| `C` | Copy link |
| `P` | Print |
| `1` / `2` / `3` | Toggle Easy / Medium / Hard filter |
| `Shift+M` | Toggle Math filter |
| `Shift+R` | Toggle Reading and Writing filter |
| `Shift+Z` | Undo last filter change |
| `+` / `-` / `0` | Font size up / down / reset |
| `/` | Focus search |
| `?` | Keyboard shortcuts help |
| `⌘K` | Command palette |
| `Esc` | Close dialog / blur input |

All shortcuts can be remapped via **⌘K → "Customize shortcuts"**.

### Practice & study modes

Toggle Browse / Practice / Flashcard in the header. **Practice** mode records spaced repetition reviews whenever you set a confidence rating; questions that are due for review surface in a **"N due for review"** badge in the header.

### Sidebar depth modes

The sidebar has two modes, toggled via the **Basic / Advanced** segmented control at the top:

- **Basic** (256px, default) — Section, Difficulty, Domain → Skill tree, Status. Clean default for everyday filtering.
- **Advanced** (384px) — Adds Score Band range slider, Question Type (MCQ/SPR), Has Stimulus toggle, Freshness presets. Bottom panel reveals **"Aspects within selected skills"** — the same Format facets but counts re-scoped to your selected skills, so you see narrowing numbers within a topic of focus.

The mode preference persists across sessions. Advanced is recommended when building targeted practice sets or analyzing topic mastery.

### Knowledge graph

Click **Graph** in the header (or ⌘K → "Knowledge graph") for a canvas visualization of all skills. Nodes are skills sized by question count and colored by your confidence. Click any node to filter the list to that skill.

### Reading mode

Click **Read** in the header for a full-screen, distraction-free view of the current question.

### Annotations

Select text in a question, pick a color (yellow / green / blue / pink), and click **Highlight selection**. Highlights persist per question.

### Filter DSL (power-user search)

The search box accepts a small query syntax:

- `section:math`
- `difficulty:medium`
- `skill:"linear equations"` — quotes for multi-word values
- `is:bookmarked` / `is:done`
- `not:done`
- `difficulty:easy,medium` — comma-separated multi-values
- Any plain text becomes free-text search

Click the **`?`** button next to the search input for inline help.

### Saved filter views (presets)

In the sidebar's **Views** menu, click **"Save current as…"** to name and save the current filter combination. Presets persist across sessions and can be one-clicked to restore.

### Customizing shortcuts

Open via **⌘K → "Customize shortcuts"**. Click an action row, then press the key combination you want. Reset any binding back to the default at any time.

### Accessibility preferences

Open via the **A11y icon** in the header or **⌘K**. Three toggles:

- **Dyslexia mode** — OpenDyslexic font + relaxed spacing
- **High contrast** — pure B/W palette, thick focus rings
- **Math speech** — adds `aria-label`s on `<math>` for VoiceOver / NVDA

Plus two sliders: **letter spacing** (4 stops) and **line height** (5 stops).

### Backup & restore

Open via **⌘K → "Backup and restore state"**. Downloads a JSON of all your bookmarks, notes, tags, annotations, confidence ratings, etc. Import supports either **merge** (union with existing) or **destructive replace**.

### Question snapshot

The **Snapshot** dropdown in the detail toolbar generates a standalone HTML page of the current question with your highlights baked in. Open in a new tab, copy as HTML, or send straight to the printer.

### Data quality dashboard

Open via **⌘K → "Data quality dashboard"** (for maintainers). Shows total questions, missing-field counts, scoreBand distribution, and freshness histogram.

### Progress dashboard updates

The dashboard now includes a **365-day activity calendar** and a **skill mastery heatmap**. Click any cell to filter the list to those questions.

### Mobile gestures

On touch devices, swipe **left/right** on the question pane to navigate between questions. The single-pane layout cycles between Filters / List / Detail via the bottom tab bar.

### Offline / PWA install

Production builds register a service worker. The index and any viewed questions cache for offline use. Supported browsers will offer an **Install** prompt to add the viewer as a standalone app.

### Building a worksheet (Quick Build)

1. Click **Build** in the header (or `⌘K` → "Quick build worksheet")
2. Select section, difficulty, domain, and count
3. Click **Build set** — random questions are selected
4. Click **Shuffle** to re-randomize, or **Add to print set**
5. Optionally save the configuration as a reusable template

### Managing the print set

1. Add questions with `S` key, shift-click for ranges, or Quick Build
2. Click **Manage** in the print set bar to open the drawer
3. **Drag and drop** to reorder questions
4. Review the **analytics** panel: difficulty mix, answer distribution, estimated time, skill coverage
5. Export: **Print** (browser), **PDF** (new window), or use the **Export** menu for plain text, Markdown, or CSV
6. **Share** — click the Share button in the header to copy a link that recipients can import

### Timed practice

1. Click **Timer** in the header (or `⌘K` → "Start timed session")
2. Pick a duration (10 / 20 / 35 / 45 minutes) and question count
3. The timer bar appears at the top with countdown, question position, and prev/next buttons
4. When time runs out, a "Time's up!" toast appears

### Tracking progress

- Rate confidence (1-3 dots) on each question after answering
- Click **Progress** in the header for the dashboard: coverage, mastery heatmap, focus suggestions
- Click any heatmap cell to filter to that skill + difficulty

### Tags and flags

- Click the **tag icon** on any question to assign custom colored tags
- Click the **flag icon** to mark questions as confusing, great, too easy, or similar
- Tags appear as filter checkboxes in the sidebar
- In the print set drawer, use **batch operations** to tag/bookmark/done multiple questions at once

### Dark mode

Click the **sun/moon icon** in the header to toggle. Persists across sessions.

## Production build

```bash
cd viewer
npm run build      # outputs dist/
```

`dist/` is a static site. Serve over any HTTP server that can host static files **and** the `data/` tree. Easiest: copy or symlink `data/` next to `dist/`, then `python3 -m http.server` inside the parent.

## Lint check (pre-commit)

```bash
cd viewer
npm run lint
```

The ESLint config warns on:
- Inline hex color literals in components (use `lib/designSystem.ts` tokens or Tailwind classes)
- Arbitrary Tailwind color brackets like `bg-[#123456]`
- Arbitrary z-index brackets like `z-[40]` (use `Z` token instead)

Exempt files (HTML-export code where inline hex is legitimate): `PdfExport.tsx`, `QuestionSnapshot.tsx`, `TagSystem.tsx`, the token files themselves.

New code adding violations should either use a token or add a comment explaining the exemption.

## After data changes

Whenever you re-scrape or edit files under `data/json/`:

```bash
python scripts/build_index.py
```

Then refresh the viewer. The index is the single source of truth for the sidebar and for question numbers `#1..N`.

## Common tasks

| Task | Command |
|---|---|
| Add a brand-new field to every question JSON | Write a one-off in `scripts/`, run it, then `build_index.py` |
| Investigate a specific question | `cat data/json/<section>/<difficulty>/<domain>/<id>.json | jq` |
| List all skills with counts | `python3 -c "import json,collections;print(collections.Counter(q['skill'] for q in json.load(open('data/index.json'))).most_common())"` |
| Check API still works (no auth) | `curl -X POST https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/lookup` |
| Quick-build 10 Easy Algebra questions | Click Build → select Math + Easy + Algebra → count 10 → Build set |
| Export print set as CSV | Open Manage drawer → Export → Download CSV |
| Share a question set | Add questions to print set → click Share in header |
| Toggle dark mode | Click sun/moon icon in header, or `⌘K` → "dark mode" |
| See your progress | Click Progress in header, or `⌘K` → "Progress dashboard" |
| Find duplicate questions | `python scripts/find_duplicates.py [--threshold 0.85]` |
| Show question change history | `python scripts/question_history.py <id>` |
| Build a worksheet from criteria | Header → Build → configure |
| Find questions due for review | Header → "N due for review" badge (when present) |
| Open the Knowledge Graph | Header → Graph, or `⌘K` → "Knowledge graph" |
| Save current filters as a preset | Sidebar → Views menu → "Save current as…" |
| Narrow by score band 1-8 | Advanced sidebar → "Score band" range |
| Filter to passage-based questions | Advanced sidebar → "Has stimulus" → Yes |
| Find recently updated questions | Advanced sidebar → "Freshness" → Last 30 days |
| See aspect counts within a skill | Select skills in Basic → switch to Advanced → Aspects panel populates |

## Troubleshooting

- **`HTTP 500 VALIDATION_ERROR / Missing external_id`** in the scraper log: that's an IBN question with `null` external_id. They're collected in `scraper/api_failed.json` and picked up by `ibn_scraper.py`. Expected, not a failure.
- **`net::ERR_HTTP2_PROTOCOL_ERROR`** or stuck Playwright runs: only the legacy scraper used Playwright; the current pipeline doesn't, so you should never see this in normal use. If you ever resurrect a Playwright path, pass `--disable-http2` and use a fresh profile.
- **Viewer shows 0 questions even though data exists**: rebuild the index (`python scripts/build_index.py`). The viewer reads `data/index.json`, not the individual files.
- **`Cross-text Connections` reappears as a separate pill**: re-run `python scripts/normalize_skills.py` then rebuild the index.
