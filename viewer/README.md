# SAT Question Bank Viewer

A local-dev Vite + React + TypeScript app that browses the JSON files produced
by the scraper in `../data/json/`.

## Run

```bash
cd viewer
npm install        # only the first time
npm run dev        # then open http://localhost:5173
```

## How it finds the data

The dev server serves the project's `data/` directory via a symlink at
`viewer/public/data` -> `../../data`, so:

- `http://localhost:5173/data/index.json` -> `data/index.json`
- `http://localhost:5173/data/json/.../<id>.json` -> per-question files

If `data/index.json` is missing or stale (e.g. you scraped more files), rebuild
it from the project root:

```bash
python3 scripts/build_index.py
```

The scraper also writes this file when it finishes a run; the script above is
useful while a scrape is in progress and you want the viewer to see the
already-scraped files.

## Features

- Sidebar filters: section, difficulty, domain, skill, text/ID search, reset
- Counts per filter chip (e.g. "Algebra (542)")
- Middle column: filtered question list (ID + domain · skill + difficulty pill)
- Right pane: rendered stem, A/B/C/D choices (or SPR input), show-answer
  highlight, collapsible rationale
- Light/Dark mode toggle in the header
- URL hash carries the selected question id (`#q=<questionId>`) so refresh
  preserves the selection
- Keyboard: `J`/`↓` next, `K`/`↑` prev, `A` toggle answer, `R` toggle rationale

## Notes

- HTML from `stem`, `answerOptions[].content`, and `rationale` is rendered with
  `dangerouslySetInnerHTML` (trusted source, MathML must be preserved).
- MathML is rendered natively by modern Chrome / Safari / Firefox — no MathJax.
- Files that fail to parse are surfaced as a per-question error; the rest of
  the app continues to work.

## Build

```bash
npm run build
```
