# SAT Question Bank — Practice Sets

Self-contained catalog of practice sets sliced from the official College
Board SAT question bank (Easy, Medium, Hard difficulties; Math and
Reading & Writing sections).

## Quick start

Open **`index.html`** in any modern browser. The catalog lists every set
with sidebar filters (Difficulty, Section, Set type, Topic, Length) and a
free-text search. Each card opens the question file in HTML or PDF, and a
matching answer key.

```
open index.html
```

## What's in here

| Folder | Contents |
|---|---|
| `by-skill/` | Sets grouped by individual SAT skill (e.g. "Linear equations in two variables", "Boundaries"). 10 questions per set. |
| `by-domain/` | Sets stratified across all skills inside a domain (e.g. "Algebra", "Information and Ideas"). 10 questions per set. |
| `by-mixed/` | Test-like sampling weighted by SAT distribution. 10 questions per set, 4 sets per (section, difficulty). |
| `_assets/styles.css` | Shared stylesheet linked by every generated HTML file. Do not move. |
| `catalog.json` | Machine-readable index of every set + file paths. |
| `index.html` | Browsable catalog SPA. **Start here.** |

Each set lives at:

```
by-<axis>/<section>/<difficulty>/<skill-slug>-set-<N>_questions.html
                                              ...-set-<N>_questions.pdf
                                              ...-set-<N>_questions-spaced.pdf
                                              ...-set-<N>_key.html
                                              ...-set-<N>_key.pdf
```

## File flavors

For each set:

- **Questions HTML** — open in a browser. Has a floating toolbar to
  toggle between *Condensed* (multiple cards per page) and *1 Question
  Per Page*, and a *Print* button.
- **PDF (Condensed)** — paper-saving, multiple questions per page.
- **PDF (1 Question Per Page)** — generous workspace, one card per page.
- **Key HTML / Key PDF** — answer + alternate forms + the full College
  Board rationale for every question. Designed for teachers / tutors to
  walk through answers in class.

All PDFs have page numbers (bottom-right) and a footer crumb
(bottom-left): `SKILL — SET N · DOMAIN`. The cover is page 1 (unnumbered).

## Catalog features

- **Filters** with live `sets · questions` counts.
- **Build a packet** — click `+` on any card to add it to a tray
  (bottom-right). The tray downloads a ZIP of the selected sets' PDFs.
- **Search ranking** — exact skill match wins over substring, etc. Type
  `/` to focus.
- **Mobile** — works on tablet and phone. Filter sidebar slides over.
- **Persistence** — filter selections, packet contents, and density
  toggle all survive page reload via `localStorage`.

## Numbers

- **3,444 questions** in the source bank.
- **764 sets** generated (skill × domain × mixed axes).
- **2,292 PDFs** (compact + spaced + key per set).
- About 47 % of spaced PDFs are hardlinks to their compact siblings
  when the page count is identical (saves disk).

## Known gaps

The audit (run `node scripts/export-sets/audit.mjs`) flags:
- **70 questions** with no recoverable correct answer (em-dash in keys).
- **599 questions** whose stem references context ("above", "shown",
  "following") that wasn't captured in the source data — these render
  but may read incomplete.

## Regenerating

From the repo root:

```bash
# Regenerate everything (HTML only).
node scripts/export-sets/build-sets.mjs --all

# Same, but emit PDFs too (~15-20 min with concurrency 3 on a Mac).
node scripts/export-sets/build-sets.mjs --all --pdf

# Refresh the catalog index after building sets.
node scripts/export-sets/build-index.mjs

# Post-build deduplication of the CSS (~25 MB savings).
node scripts/export-sets/lib/extract-styles.mjs
```

See `docs/CODEMAP.md` for the full pipeline tour.
