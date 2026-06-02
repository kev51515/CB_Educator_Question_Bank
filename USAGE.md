# SAT Question Bank — Usage Guide

## Viewer (Question Bank App)

### Quick Start

```bash
cd viewer
npm install    # first time only
npm run dev    # http://localhost:5173
```

The app loads all 3,444 questions immediately. No login or setup required.

### Layout

Three-pane interface:
- **Left** — Filters (Basic mode: 256px; Advanced mode: 384px with score band, type, stimulus, freshness, aspects panel)
- **Middle** — Question list with search, compact/comfortable toggle
- **Right** — Question detail with answer reveal, rationale, notes, annotations

### Three Modes

Toggle in the header:
- **Browse** — Read-only. Reveal answers with A key or "Show answer" button.
- **Practice** — Click a choice to attempt it, then check. Green = correct, red = wrong.
- **Flashcard** — Choices hidden until you click "Reveal." Forces recall before recognition.

### Key Features

| Feature | How to access |
|---|---|
| Quick Build worksheet | Header → Build, or ⌘K → "Quick build" |
| Timed practice | Header → Timer |
| Progress dashboard | Header → Progress |
| Question statistics | Header → Stats |
| Compare two questions | Header → Compare |
| Dark mode | Header → sun/moon icon |
| Share print set | Header → Share (when set is non-empty) |
| Export (PDF/text/CSV/MD) | Manage drawer → Export menu |
| Annotations | Select text → pick color → "Highlight selection" |
| Custom tags | Tag icon on any question |
| Quality flags | Flag icon → confusing/great/too-easy/similar |
| Spaced repetition | "Due for review" badge in header (when applicable) |
| Knowledge graph | Header → Graph |
| Reading mode | Header → Read |
| Accessibility preferences | Header → A11y icon |
| Filter DSL | Type `section:math difficulty:hard` in search; `?` button for syntax help |
| Saved filter views | Sidebar → Views menu |
| Backup state | ⌘K → "Backup state" |
| Customize shortcuts | ⌘K → "Customize shortcuts" |
| Choice analysis | Info icon in detail toolbar (MCQ only) |
| Step-by-step rationale | Click "Show rationale" — reveals one step at a time |
| Question snapshot | Snapshot dropdown in detail toolbar |
| Score band range filter (1-8) | Sidebar → Advanced → Score band |
| Question type filter (MCQ/SPR) | Sidebar → Advanced → Question type |
| Passage-based filter | Sidebar → Advanced → Has stimulus |
| Recently updated questions | Sidebar → Advanced → Freshness |
| Aspects within skill | Pick skills in Basic → switch to Advanced → bottom panel |

### Keyboard Shortcuts

| Key | Action | | Key | Action |
|---|---|---|---|---|
| J / ↓ | Next question | | B | Bookmark |
| K / ↑ | Previous | | D | Mark done |
| A | Toggle answer | | S | Add to print set |
| R | Toggle rationale | | N | Toggle note |
| G | Random question | | C | Copy link |
| 1 / 2 / 3 | Filter Easy/Med/Hard | | P | Print |
| Shift+M | Filter Math | | + / - / 0 | Font size |
| Shift+R | Filter Reading | | / | Focus search |
| Shift+Z | Undo filter | | ? | Help |
| ⌘K | Command palette | | Esc | Close/blur |

### Building a Worksheet

1. Click **Build** → select criteria → **Build set**
2. Questions added to print set
3. Click **Manage** in the print set bar
4. Drag to reorder, review analytics (answer balance, time estimate)
5. **Print**, **PDF**, or **Export** as text/CSV/Markdown

Save a template to reuse the same criteria with fresh random questions each time.

### Power-user tips

**Advanced sidebar depth.** Toggle Basic ↔ Advanced via the segmented control at the top of the sidebar. Advanced reveals all 9 facets and the Aspects panel; Basic shows just the essentials. Width animates smoothly.

**Facet search via DSL.** Type `section:math difficulty:hard skill:"linear equations"` in the search box. Click the `?` next to the search input for the syntax cheat sheet.

**Saved views.** Click the **Views** menu in the sidebar to save the current filter configuration as a named preset. Quick-switch between e.g. "Math exam prep" and "RW review" without rebuilding filters.

**Customize shortcuts.** Press `⌘K` → "Customize keyboard shortcuts" to remap J/K/A/R/etc.

**Snapshot a question.** Use the Snapshot dropdown in the detail toolbar to export the current question as standalone HTML — including your highlights — for sharing or asking for help.

**Compare two questions.** Header → Compare. Pick two questions in the side-by-side view to study differences in approach or framing.

### Data Storage

All user data is in browser localStorage — nothing leaves your machine:
- Bookmarks, done marks, confidence ratings
- Notes, annotations, tags, flags
- Print set order, templates
- Dark mode preference, recent views

Data syncs across tabs automatically. State is also mirrored to **IndexedDB** for offline access, and a **service worker** caches the question bank after your first visit so the viewer works offline.

## Scraper

### Quick Start

```bash
python3 -m venv venv
source venv/bin/activate
pip install httpx
```

### Sync (recommended)

```bash
python scripts/sync.py              # incremental update
python scripts/sync.py --force      # re-fetch everything
python scripts/sync.py --dry-run    # preview changes
```

### Initial Scrape (from empty)

```bash
python scraper/api_scraper.py       # ~2,985 questions
python scraper/ibn_scraper.py       # ~459 legacy questions
python scripts/normalize_skills.py
python scripts/build_index.py
```

### After Data Changes

```bash
python scripts/build_index.py       # rebuilds data/index.json
```

Then refresh the viewer.

### Monitoring

```bash
cat scraper/api_progress.json       # live progress
cat scraper/sync_history.json       # last 100 sync runs
```

### Troubleshooting

- **Viewer shows 0 questions**: rebuild index with `python scripts/build_index.py`
- **Symlink missing**: `cd viewer/public && ln -s ../../data data`
- **API check**: `curl -X POST https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/lookup`
