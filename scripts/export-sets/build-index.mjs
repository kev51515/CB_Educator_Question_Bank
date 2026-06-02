#!/usr/bin/env node
// Build a top-level catalog index (HTML + manifest) listing every exported set.
// The HTML is a single-page app with sidebar filtering: section, type, topic,
// plus free-text search. All interactivity is vanilla JS; bulk-download uses
// JSZip loaded from a CDN.
//
// Features:
//   - Sidebar facet filters with live counts (sets · questions)
//   - Ranked free-text search (skill exact > prefix > substring > label > topic)
//   - Cards grouped by skill (topic) with collapsible group headers
//   - "Build packet" tray: per-card "+" adds set to a slide-out tray,
//     "Download as ZIP" bundles PDFs (when present) into subfolders
//   - Recently opened section persisted across reloads; clicking a recent
//     entry scrolls to + highlights the card
//   - Responsive: <768px sidebar slides over as off-canvas drawer; <480px
//     cards stack to a single column

import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'data', 'exports');

const axes = ['by-skill', 'by-domain', 'by-mixed'];
const sections = ['math', 'reading-and-writing'];
const difficulties = ['easy', 'medium', 'hard'];

async function main() {
const entries = [];

for (const axis of axes) {
  for (const section of sections) {
    for (const difficulty of difficulties) {
      const dir = join(ROOT, axis, section, difficulty);
      let mf;
      try {
        mf = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
      } catch {
        continue;
      }
      for (const s of mf.sets) {
        const qPath = join(dir, s.files.questionsHtml);
        const kPath = join(dir, s.files.keyHtml);
        const qPdf       = qPath.replace(/\.html$/, '.pdf');
        const qPdfSpaced = qPath.replace(/\.html$/, '-spaced.pdf');
        const kPdf       = kPath.replace(/\.html$/, '.pdf');
        entries.push({
          axis: axis.replace(/^by-/, ''),
          section,
          difficulty,
          setId: s.setId,
          label: s.label,
          topic: extractTopic(s.label),
          questionCount: s.questionCount,
          questionsHtml: relative(qPath),
          keyHtml: relative(kPath),
          questionsPdf:       (await exists(qPdf))       ? relative(qPdf)       : null,
          questionsPdfSpaced: (await exists(qPdfSpaced)) ? relative(qPdfSpaced) : null,
          keyPdf:             (await exists(kPdf))       ? relative(kPdf)       : null,
        });
      }
    }
  }
}

const catalog = { generatedAt: new Date().toISOString(), entries };
await writeFile(join(ROOT, 'catalog.json'), JSON.stringify(catalog, null, 2));

const html = renderIndex(catalog);
await writeFile(join(ROOT, 'index.html'), html);

console.log(`✓ ${entries.length} sets indexed`);
console.log(`  ${join(ROOT, 'catalog.json')}`);
console.log(`  ${join(ROOT, 'index.html')}`);
}

// ---------------------------------------------------------------------------

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

function relative(p) {
  return p.replace(ROOT + '/', '');
}

function extractTopic(label) {
  // "Linear functions — Set 1" → "Linear functions"
  return label.replace(/\s*—\s*Set\s+([A-Z]+|\d+)$/, '').trim();
}

function renderIndex(catalog) {
  // Assign each entry a stable uid the client can use for the packet tray
  // and "recently opened" highlight. The format mirrors the test-runner's
  // setUid ("by-<axis>/<section>/<difficulty>/<setName>") so progress badges
  // can be looked up directly from the shared Persistence store.
  const withUid = catalog.entries.map((e) => {
    // Recover the setName from the questionsHtml path. Path looks like
    // "by-axis/section/difficulty/<setName>_questions.html".
    const m = String(e.questionsHtml).match(/([^\/]+)_questions\.html$/);
    const setName = m ? m[1] : slug(e.label);
    return {
      ...e,
      setName,
      uid: `by-${e.axis}/${e.section}/${e.difficulty}/${setName}`,
    };
  });
  const data = JSON.stringify(withUid);
  const generated = new Date().toISOString().slice(0, 10);
  const total = withUid.length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SAT Question Bank — Catalog</title>
  ${renderSupabaseMetaTags()}
  <style>${STYLES}</style>
</head>
<body>
  <!-- mobile: floating button that opens the sidebar drawer -->
  <button class="m-menu" id="m-menu" type="button" aria-label="Open filters">
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      <line x1="2" y1="4"  x2="14" y2="4"/>
      <line x1="2" y1="8"  x2="14" y2="8"/>
      <line x1="2" y1="12" x2="14" y2="12"/>
    </svg>
  </button>
  <div class="scrim" id="scrim" hidden></div>

  <aside class="sidebar" id="sidebar">
    <button class="sidebar__toggle" id="sidebar-toggle" type="button" aria-label="Toggle sidebar" title="Toggle sidebar (⌘\\)">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="12" height="10" rx="1.5"/>
        <line x1="6" y1="3" x2="6" y2="13"/>
      </svg>
    </button>
    <div class="sidebar__inner">
      <div class="brand">
        <div class="brand__logo">SAT</div>
        <div class="brand__name">Question Bank</div>
      </div>

      <div class="search">
        <svg class="search__icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5"/><path d="m11 11 3 3"/></svg>
        <input
          id="search"
          type="search"
          placeholder="Search sets…"
          autocomplete="off"
          spellcheck="false"
        >
        <kbd class="search__kbd">/</kbd>
      </div>

      <div class="facet">
        <div class="facet__head">Difficulty</div>
        <div class="facet__opts" data-facet="difficulty"></div>
      </div>

      <div class="facet">
        <div class="facet__head">Section</div>
        <div class="facet__opts" data-facet="section"></div>
      </div>

      <div class="facet">
        <div class="facet__head">Set type</div>
        <div class="facet__opts" data-facet="axis"></div>
      </div>

      <div class="facet">
        <div class="facet__head" id="topic-head">Topic</div>
        <div class="facet__opts facet__opts--scroll" data-facet="topic"></div>
      </div>

      <button id="reset" class="reset" type="button">Clear filters</button>
    </div>
  </aside>

  <main class="main">
    <header class="main__head">
      <div>
        <h1>SAT Question Bank</h1>
        <p class="lede"><span id="count">${total}</span> of ${total} sets · <span id="q-count"></span></p>
      </div>
      <div class="head__right">
        <div class="mode-toggle" role="group" aria-label="Mode">
          <button type="button" class="mode-toggle__btn" data-mode="study" aria-pressed="true">Study</button>
          <button type="button" class="mode-toggle__btn" data-mode="test" aria-pressed="false">Test</button>
        </div>
        <button type="button" class="reset-all" id="reset-all" title="Reset all attempts">Reset attempts</button>
        <div class="head__chips" id="active-chips"></div>
      </div>
    </header>

    <section id="grid" class="grid"></section>

    <p id="empty" class="empty" hidden>No sets match the current filters.</p>

    <footer class="foot">Generated ${generated} &middot; ${total} sets</footer>
  </main>

  <!-- packet tray (slide-out from right) -->
  <button class="tray__fab" id="tray-fab" type="button" aria-label="Open packet tray">
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 4h12l-1.2 8.5a1 1 0 0 1-1 .9H4.2a1 1 0 0 1-1-.9L2 4Z"/>
      <path d="M5.5 4V3a2.5 2.5 0 0 1 5 0v1"/>
    </svg>
    <span>Packet</span>
    <span class="tray__fab-count" id="tray-fab-count">0</span>
  </button>

  <aside class="tray" id="tray" aria-hidden="true">
    <div class="tray__head">
      <div>
        <div class="tray__title">Build packet</div>
        <div class="tray__sub" id="tray-sub">0 sets selected</div>
      </div>
      <button class="tray__close" id="tray-close" type="button" aria-label="Close tray">×</button>
    </div>
    <div class="tray__list" id="tray-list"></div>
    <div class="tray__foot">
      <button class="tray__clear" id="tray-clear" type="button">Clear</button>
      <button class="tray__zip" id="tray-zip" type="button" disabled>
        <span class="tray__zip-label">Download as ZIP</span>
        <span class="tray__zip-progress" id="tray-zip-progress" hidden></span>
      </button>
    </div>
    <p class="tray__hint">PDFs are organized by section and difficulty inside the zip.</p>
  </aside>

  <script>
    window.__CATALOG__ = ${data};
  </script>
  <!-- Shared attempt persistence. Loaded before the catalog script so badges
       can render synchronously from localStorage. -->
  <script src="_assets/persistence.js"></script>
  <!-- JSZip loaded async; tray.zip downloads gracefully fail with a helpful
       message if it can't load (e.g. offline) -->
  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"
          integrity="sha256-rMfkFFWoB2W1/Zx+4bgHim0WC7vKRVrq6FTeZclH1Z4="
          crossorigin="anonymous"
          referrerpolicy="no-referrer"></script>
  <script>${SCRIPT}</script>
</body>
</html>`;
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Supabase config inlined into the catalog/index page so the page's copy of
// persistence.js can promote itself to SupabaseAdapter when a viewer auth
// session is present (same-origin requirement). Missing env vars → no tags
// → LocalStorageAdapter stays in charge (offline / unauthenticated default).
// Mirrors the per-set logic in scripts/export-sets/lib/render.mjs.
function renderSupabaseMetaTags() {
  const url = process.env.VITE_SUPABASE_URL || '';
  const anon = process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !anon) return '';
  const escape = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  return (
    `<meta name="supabase-url"  content="${escape(url)}">\n  ` +
    `<meta name="supabase-anon" content="${escape(anon)}">`
  );
}

// ---------------------------------------------------------------------------

const STYLES = `
:root {
  --ink: #111; --ink-2: #444; --ink-3: #777; --ink-4: #9a9a9a;
  --rule: #E5E5E5; --rule-strong: #CFCFCF;
  --paper: #fff; --paper-soft: #FAFAF9;
  --bg: #F5F5F4;
  --hard: #C73838;
  --medium: #D69400;
  --easy: #2F7D4F;
  --accent: #1E5FB0;
  --t-ui: 'SF Pro Text','Inter',system-ui,-apple-system,sans-serif;
  --t-display: 'SF Pro Display','Inter',system-ui,-apple-system,sans-serif;
  --t-body: 'New York','Newsreader',Georgia,serif;
  --t-mono: 'SF Mono','JetBrains Mono',ui-monospace,Menlo,monospace;
  --sidebar-w: 280px;
  --tray-w: 340px;
}
* , *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--ink);
  font-family: var(--t-ui); font-size: 14px; line-height: 1.5;
  -webkit-font-smoothing: antialiased; }
/* honour the hidden attribute even when class rules set display: flex/grid */
[hidden] { display: none !important; }

/* -------- sidebar -------- */
.sidebar {
  position: fixed; top: 0; left: 0; bottom: 0;
  width: var(--sidebar-w);
  background: var(--paper);
  border-right: 1px solid var(--rule);
  overflow: hidden;
  overscroll-behavior: contain;
  transition: width 280ms cubic-bezier(0.22, 0.61, 0.36, 1),
              transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
  will-change: width, transform;
  z-index: 30;
}
.sidebar__inner {
  width: var(--sidebar-w);
  height: 100%;
  overflow-y: auto;
  padding: 24px 20px 32px;
  display: flex; flex-direction: column; gap: 22px;
  transition: opacity 200ms ease, transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
  will-change: opacity, transform;
}

.sidebar__toggle {
  position: absolute; top: 18px; right: 16px;
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: 7px;
  color: var(--ink-3);
  cursor: pointer;
  z-index: 2;
  transition: color 120ms, border-color 120ms, background-color 120ms,
              left 280ms cubic-bezier(0.22, 0.61, 0.36, 1),
              right 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.sidebar__toggle:hover { color: var(--ink); border-color: var(--ink-3); background: var(--paper-soft); }

/* collapsed (desktop, manual) */
.sidebar--collapsed { width: 56px; }
.sidebar--collapsed .sidebar__inner {
  opacity: 0; transform: translateX(-12px);
  pointer-events: none;
}
.sidebar--collapsed .sidebar__toggle {
  right: auto;
  left: 14px;
  top: 18px;
}
.sidebar--collapsed + .main { margin-left: 56px; }
.main { transition: margin-left 280ms cubic-bezier(0.22, 0.61, 0.36, 1); }

.brand { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.brand__logo {
  width: 28px; height: 28px; border-radius: 7px;
  background: var(--ink); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--t-display); font-weight: 600; font-size: 11px;
  letter-spacing: 0.04em;
}
.brand__name { font-weight: 600; font-size: 14px; color: var(--ink); letter-spacing: -0.01em; }

/* search */
.search { position: relative; }
.search__icon {
  position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
  color: var(--ink-3); pointer-events: none;
}
.search input {
  width: 100%; height: 36px;
  padding: 0 36px 0 32px;
  border: 1px solid var(--rule);
  border-radius: 9px;
  background: var(--paper-soft);
  font-family: var(--t-ui); font-size: 13px; color: var(--ink);
  outline: none;
  transition: border-color 120ms, background-color 120ms;
}
.search input:focus { border-color: var(--ink-3); background: var(--paper); }
.search input::placeholder { color: var(--ink-4); }
.search__kbd {
  position: absolute; right: 9px; top: 50%; transform: translateY(-50%);
  font-family: var(--t-mono); font-size: 10px;
  color: var(--ink-3);
  border: 1px solid var(--rule-strong);
  border-radius: 4px;
  padding: 1px 5px;
  background: var(--paper);
}

/* facets */
.facet { display: flex; flex-direction: column; gap: 8px; }
.facet__head {
  font-size: 10.5px; font-weight: 600;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--ink-3);
  padding: 0 4px;
  cursor: pointer;
  user-select: none;
  display: flex; align-items: baseline; gap: 8px;
}
.facet__head:hover { color: var(--ink); }
/* Inline selection summary when a facet is collapsed (drill-down mode). */
.facet__summary {
  font-size: 11px; font-weight: 500;
  letter-spacing: 0; text-transform: none;
  color: var(--ink-2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  min-width: 0; flex: 1;
}
.facet--collapsed .facet__opts { display: none; }
.facet--collapsed .facet__head::after {
  content: '+'; margin-left: auto;
  color: var(--ink-4); font-weight: 400; font-size: 12px;
}
.facet__opts { display: flex; flex-direction: column; gap: 2px; }
.facet__opts--scroll { max-height: 260px; overflow-y: auto; padding-right: 4px; }

.opt {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px; color: var(--ink-2);
  user-select: none;
  transition: background-color 80ms;
}
.opt:hover { background: var(--paper-soft); color: var(--ink); }
.opt--on { background: rgba(199,56,56,0.06); color: var(--ink); }
.opt__check {
  width: 14px; height: 14px;
  border: 1.5px solid var(--rule-strong);
  border-radius: 4px;
  flex: none;
  display: flex; align-items: center; justify-content: center;
  background: var(--paper);
  transition: border-color 80ms, background-color 80ms;
}
.opt--on .opt__check { border-color: var(--hard); background: var(--hard); }
.opt--on .opt__check::after {
  content: ''; width: 7px; height: 4px;
  border-left: 1.5px solid #fff; border-bottom: 1.5px solid #fff;
  transform: rotate(-45deg) translate(1px, -1px);
}
.opt__label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.opt__count {
  font-family: var(--t-mono); font-size: 11px;
  color: var(--ink-4); font-variant-numeric: tabular-nums;
}
.opt--zero { color: var(--ink-4); opacity: 0.55; }
.opt--zero:hover { background: transparent; cursor: default; }

/* recent-opts: simple list with no checkboxes */
.recent {
  display: flex; flex-direction: column; gap: 1px;
  padding: 4px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 12.5px; color: var(--ink-2);
}
.recent:hover { background: var(--paper-soft); color: var(--ink); }
.recent__title {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.recent__meta {
  font-size: 10.5px; color: var(--ink-4); letter-spacing: 0.02em;
}

.reset {
  appearance: none; background: transparent;
  border: 1px solid var(--rule);
  border-radius: 8px;
  padding: 8px 12px;
  font-family: var(--t-ui); font-size: 12px; color: var(--ink-3);
  cursor: pointer;
  transition: color 80ms, border-color 80ms, background-color 80ms;
}
.reset:hover { color: var(--ink); border-color: var(--ink-3); background: var(--paper-soft); }

/* -------- main -------- */
.main {
  margin-left: var(--sidebar-w);
  min-height: 100vh;
  padding: 40px 48px 64px;
  max-width: 1280px;
}
.main__head {
  display: flex; justify-content: space-between; align-items: flex-end;
  gap: 24px; margin-bottom: 32px;
  flex-wrap: wrap;
}
h1 {
  font-family: var(--t-display); font-weight: 600;
  font-size: 28px; letter-spacing: -0.02em;
  margin: 0 0 4px;
}
.lede { color: var(--ink-3); font-size: 13px; margin: 0; }
.lede #count { color: var(--ink); font-variant-numeric: tabular-nums; font-weight: 500; }

.head__chips { display: flex; gap: 6px; flex-wrap: wrap; }
.head__chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 8px 4px 10px;
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: 999px;
  font-size: 11.5px; color: var(--ink-2);
  letter-spacing: 0.02em;
}
.head__chip button {
  appearance: none; background: transparent; border: 0; padding: 0;
  color: var(--ink-3); cursor: pointer; font-size: 14px; line-height: 1;
}
.head__chip button:hover { color: var(--ink); }

/* group (skill) -------------------------------------------------------- */
.grid { display: flex; flex-direction: column; gap: 22px; }
.group { display: flex; flex-direction: column; gap: 10px; }
.group__head {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 4px 6px 0;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--rule);
}
.group__head:hover { color: var(--accent); }
.group__chev {
  width: 12px; height: 12px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--ink-3);
  transition: transform 150ms ease;
}
.group--open .group__chev { transform: rotate(90deg); }
.group__title {
  font-family: var(--t-display);
  font-weight: 600; font-size: 15px;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.group__meta {
  font-family: var(--t-mono);
  font-size: 11px; color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
.group__badge {
  margin-left: auto;
  font-family: var(--t-mono);
  font-size: 10.5px;
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 1px 8px;
  color: var(--ink-3);
}
.group__cards { display: none; }
.group--open .group__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

/* card */
.card {
  position: relative;
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: 12px;
  padding: 16px 18px 14px;
  display: flex; flex-direction: column; gap: 12px;
  transition: border-color 100ms, transform 100ms, box-shadow 200ms;
}
.card:hover { border-color: var(--rule-strong); }
.card--flash {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(30,95,176,0.18);
}
.card__top {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
}
.card__chips { display: flex; gap: 6px; align-items: center; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 9px;
  border: 1px solid var(--rule-strong);
  border-radius: 999px;
  font-size: 9.5px; color: var(--ink-2);
  letter-spacing: 0.08em; text-transform: uppercase;
}
.chip__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ink-3); }
.chip--hard   .chip__dot { background: var(--hard); }
.chip--medium .chip__dot { background: var(--medium); }
.chip--easy   .chip__dot { background: var(--easy); }
.chip--axis { color: var(--ink-3); }
.opt__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-3); flex: none; margin-right: 2px; }
.opt__dot--hard   { background: var(--hard); }
.opt__dot--medium { background: var(--medium); }
.opt__dot--easy   { background: var(--easy); }
.card__qc {
  font-family: var(--t-mono); font-size: 10.5px;
  color: var(--ink-3); font-variant-numeric: tabular-nums;
}
.card__title {
  font-weight: 500; font-size: 14px; color: var(--ink);
  letter-spacing: -0.005em;
  line-height: 1.35;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.card__sub { font-size: 11.5px; color: var(--ink-3); }
.card__links { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.link {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 10px;
  border: 1px solid var(--rule-strong);
  border-radius: 999px;
  font-size: 11px; color: var(--ink-2);
  text-decoration: none; letter-spacing: 0.02em;
  transition: color 80ms, border-color 80ms;
}
.link:hover { color: var(--ink); border-color: var(--ink-2); }
.link--key { color: var(--hard); border-color: #F0CCCC; }
.link--key:hover { color: var(--hard); border-color: var(--hard); }
.link--pdf { color: var(--ink-3); }

/* per-card "+" / "✓" packet button */
.card__add {
  position: absolute; top: 10px; right: 10px;
  width: 26px; height: 26px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--paper);
  border: 1px solid var(--rule-strong);
  border-radius: 7px;
  color: var(--ink-3);
  font-size: 16px; line-height: 1;
  cursor: pointer;
  transition: color 120ms, border-color 120ms, background-color 120ms, transform 120ms;
}
.card__add:hover { color: var(--accent); border-color: var(--accent); transform: scale(1.05); }
.card--picked { border-color: rgba(30,95,176,0.45); background: linear-gradient(0deg, rgba(30,95,176,0.025), rgba(30,95,176,0.025)), var(--paper); }
.card--picked .card__add { color: #fff; background: var(--accent); border-color: var(--accent); }

/* tray --------------------------------------------------------------- */
.tray__fab {
  position: fixed; right: 20px; bottom: 20px;
  display: inline-flex; align-items: center; gap: 8px;
  height: 40px; padding: 0 14px 0 12px;
  background: var(--ink); color: #fff;
  border: 0; border-radius: 999px;
  font-family: var(--t-ui); font-size: 13px; font-weight: 500;
  cursor: pointer; z-index: 25;
  box-shadow: 0 6px 22px rgba(0,0,0,0.18);
  transition: transform 120ms, opacity 200ms;
}
.tray__fab:hover { transform: translateY(-1px); }
.tray__fab[hidden] { display: none; }
.tray__fab-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px;
  background: var(--accent); border-radius: 999px;
  font-family: var(--t-mono); font-size: 10.5px; font-variant-numeric: tabular-nums;
}

.tray {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: var(--tray-w); max-width: 92vw;
  background: var(--paper);
  border-left: 1px solid var(--rule);
  display: flex; flex-direction: column;
  transform: translateX(105%);
  transition: transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
  z-index: 35;
  box-shadow: -16px 0 40px rgba(0,0,0,0.06);
}
.tray--open { transform: translateX(0); }
.tray__head {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 20px 18px 12px;
  border-bottom: 1px solid var(--rule);
}
.tray__title {
  font-family: var(--t-display);
  font-weight: 600; font-size: 16px;
  letter-spacing: -0.01em;
}
.tray__sub { font-size: 12px; color: var(--ink-3); margin-top: 2px; }
.tray__close {
  appearance: none; background: transparent; border: 0;
  font-size: 22px; line-height: 1; color: var(--ink-3);
  width: 28px; height: 28px; border-radius: 7px;
  cursor: pointer;
}
.tray__close:hover { color: var(--ink); background: var(--paper-soft); }
.tray__list {
  flex: 1; overflow-y: auto;
  padding: 8px 14px;
  display: flex; flex-direction: column; gap: 4px;
}
.tray__empty {
  text-align: center; padding: 40px 12px;
  color: var(--ink-3); font-size: 13px;
}
.tray__item {
  display: flex; gap: 8px; align-items: flex-start;
  padding: 8px 8px; border-radius: 8px;
  font-size: 12.5px; color: var(--ink-2);
}
.tray__item:hover { background: var(--paper-soft); }
.tray__item-main { flex: 1; min-width: 0; }
.tray__item-title {
  color: var(--ink); font-size: 13px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tray__item-meta {
  font-size: 11px; color: var(--ink-3);
  margin-top: 2px;
}
.tray__item-rm {
  appearance: none; background: transparent; border: 0;
  color: var(--ink-3); cursor: pointer;
  width: 22px; height: 22px; border-radius: 5px;
  font-size: 16px; line-height: 1;
}
.tray__item-rm:hover { color: var(--hard); background: rgba(199,56,56,0.06); }

.tray__foot {
  display: flex; gap: 8px; padding: 12px 14px;
  border-top: 1px solid var(--rule);
}
.tray__clear {
  appearance: none; background: transparent;
  border: 1px solid var(--rule);
  border-radius: 8px;
  padding: 8px 12px;
  font-family: var(--t-ui); font-size: 12px; color: var(--ink-3);
  cursor: pointer;
}
.tray__clear:hover { color: var(--ink); border-color: var(--ink-3); background: var(--paper-soft); }
.tray__zip {
  flex: 1;
  appearance: none; background: var(--ink); color: #fff;
  border: 0; border-radius: 8px;
  padding: 8px 14px;
  font-family: var(--t-ui); font-size: 13px; font-weight: 500;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  transition: opacity 120ms;
}
.tray__zip:disabled { opacity: 0.4; cursor: not-allowed; }
.tray__zip-progress {
  font-family: var(--t-mono); font-size: 11px; opacity: 0.85;
}
.tray__hint {
  margin: 0; padding: 10px 16px 16px;
  font-size: 11px; color: var(--ink-4);
  border-top: 1px solid var(--rule);
}

.scrim {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.30);
  z-index: 20;
  opacity: 0; pointer-events: none;
  transition: opacity 200ms ease;
}
.scrim--on { opacity: 1; pointer-events: auto; }

/* mobile menu button (hidden on desktop) */
.m-menu {
  position: fixed; top: 14px; left: 14px;
  width: 36px; height: 36px;
  display: none; align-items: center; justify-content: center;
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: 9px;
  color: var(--ink-2);
  cursor: pointer;
  z-index: 22;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.m-menu:hover { color: var(--ink); border-color: var(--ink-3); }

.empty {
  text-align: center; padding: 60px 0;
  color: var(--ink-3); font-size: 14px;
}
.foot {
  margin-top: 64px; padding-top: 24px;
  border-top: 1px solid var(--rule);
  color: var(--ink-3); font-size: 11.5px;
}

/* -------- mode toggle + reset (header right) -------- */
.head__right {
  display: inline-flex; align-items: center; gap: 10px;
  flex-wrap: wrap;
}
.mode-toggle {
  display: inline-flex;
  border: 1px solid var(--rule);
  border-radius: 999px;
  overflow: hidden;
  background: var(--paper);
}
.mode-toggle__btn {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 6px 14px;
  font-family: var(--t-ui);
  font-size: 12px;
  color: var(--ink-3);
  cursor: pointer;
  transition: background-color 100ms, color 100ms;
}
.mode-toggle__btn:hover { color: var(--ink); }
.mode-toggle__btn[aria-pressed="true"] {
  background: var(--ink);
  color: #fff;
}
.reset-all {
  appearance: none;
  border: 1px solid var(--rule);
  background: var(--paper);
  border-radius: 999px;
  padding: 6px 12px;
  font-family: var(--t-ui);
  font-size: 11.5px;
  color: var(--ink-3);
  cursor: pointer;
  transition: color 100ms, border-color 100ms;
}
.reset-all:hover { color: var(--hard); border-color: var(--hard); }
.reset-all[hidden] { display: none; }

/* -------- per-card progress badges -------- */
.card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 9px 2px 8px;
  border: 1px solid var(--rule-strong);
  border-radius: 999px;
  font-size: 10.5px;
  color: var(--ink-2);
  letter-spacing: 0.02em;
}
.badge__dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--ink-3);
}
.badge--resume { border-color: rgba(214, 148, 0, 0.55); color: var(--medium); }
.badge--resume .badge__dot { background: var(--medium); }
.badge--score-high { border-color: rgba(47, 125, 79, 0.55); color: var(--easy); }
.badge--score-high .badge__dot { background: var(--easy); }
.badge--score-mid  { border-color: rgba(214, 148, 0, 0.55); color: var(--medium); }
.badge--score-mid  .badge__dot { background: var(--medium); }
.badge--score-low  { border-color: rgba(199, 56, 56, 0.55); color: var(--hard); }
.badge--score-low  .badge__dot { background: var(--hard); }

/* Per-card "reset" link nested in the actions row. */
.card__reset {
  appearance: none;
  background: transparent;
  border: 0;
  padding: 4px 6px;
  font-family: var(--t-ui);
  font-size: 10.5px;
  color: var(--ink-3);
  cursor: pointer;
  border-radius: 6px;
}
.card__reset:hover { color: var(--hard); background: rgba(199, 56, 56, 0.05); }

/* -------- mobile (drawer + responsive grid) -------- */
@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
    width: 86vw; max-width: 320px;
    box-shadow: 6px 0 24px rgba(0,0,0,0.10);
  }
  .sidebar.sidebar--open { transform: translateX(0); }
  .sidebar__toggle { display: none; }
  .sidebar--collapsed + .main { margin-left: 0; }
  .main { margin-left: 0; padding: 56px 20px 100px; }
  .main__head { margin-bottom: 22px; }
  .m-menu { display: inline-flex; }
  /* don't double up on the floating tray button */
  .tray__fab { right: 14px; bottom: 14px; }
}

@media (max-width: 480px) {
  h1 { font-size: 22px; }
  .main { padding: 56px 14px 100px; }
  .group__cards { grid-template-columns: 1fr !important; }
  .card { padding: 14px 14px 12px; }
  .card__links .link { font-size: 10.5px; padding: 4px 8px; }
  .head__chips { width: 100%; }
  .tray { width: 100vw; max-width: 100vw; }
}
`;

const SCRIPT = `
(() => {
  const entries = window.__CATALOG__;
  const grid = document.getElementById('grid');
  const search = document.getElementById('search');
  const countEl = document.getElementById('count');
  const qCountEl = document.getElementById('q-count');
  const emptyEl = document.getElementById('empty');
  const chipsEl = document.getElementById('active-chips');
  const resetBtn = document.getElementById('reset');

  const LABELS = {
    section:    { math: 'Math', 'reading-and-writing': 'Reading & Writing' },
    axis:       { skill: 'By skill', domain: 'By domain', mixed: 'Mixed' },
    length:     { short: 'Short (≤10)', medium: 'Medium (11–18)', long: 'Long (19+)' },
    difficulty: { easy: 'Easy', medium: 'Medium', hard: 'Hard' },
  };

  // build a fast lookup by uid
  const byUid = new Map(entries.map(e => [e.uid, e]));

  const state = {
    difficulty: new Set(),
    section:    new Set(),
    axis:       new Set(),
    topic:      new Set(),
    q: '',
  };

  // Per-facet "user explicitly opened" overrides. A facet auto-collapses
  // once any later facet has a selection (the user has moved deeper); the
  // user can click a collapsed header to re-expand. Membership in this set
  // pins a facet open regardless of the auto rule.
  const facetForcedOpen = new Set();

  // ---- persistence: filters -------------------------------------------
  const STORAGE_KEY = 'sat-qb-filters-v1';
  // Order matters — used by the auto-collapse rule ("later facet selected →
  // earlier facets collapse"). Difficulty is topmost, Topic is deepest.
  const SET_FACETS = ['difficulty', 'section', 'axis', 'topic'];

  function isEmptyState() {
    return state.q === '' && SET_FACETS.every(f => state[f].size === 0);
  }
  function saveState() {
    try {
      if (isEmptyState()) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const payload = { q: state.q };
      for (const f of SET_FACETS) payload[f] = [...state[f]];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      const validKeys = {
        difficulty: new Set(difficultyList),
        section:    new Set(sectionList),
        axis:       new Set(axisList),
        topic:      new Set(entries.map(e => e.topic)),
      };
      for (const f of SET_FACETS) {
        if (!Array.isArray(payload[f])) continue;
        for (const k of payload[f]) {
          if (validKeys[f].has(k)) state[f].add(k);
        }
      }
      if (typeof payload.q === 'string') {
        state.q = payload.q;
        search.value = payload.q;
      }
    } catch {}
  }

  // ---- persistence: packet tray ---------------------------------------
  const PACKET_KEY = 'sat-qb-packet-v1';
  /** Set<uid> */
  const packet = new Set();
  function loadPacket() {
    try {
      const raw = localStorage.getItem(PACKET_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) for (const u of arr) if (byUid.has(u)) packet.add(u);
    } catch {}
  }
  function savePacket() {
    try {
      if (packet.size === 0) localStorage.removeItem(PACKET_KEY);
      else localStorage.setItem(PACKET_KEY, JSON.stringify([...packet]));
    } catch {}
  }

  // ---- persistence: group collapse state ------------------------------
  const GROUPS_KEY = 'sat-qb-groups-v1';
  /** Map<groupKey, 'open'|'closed'> — only stores user overrides */
  const groupOverrides = new Map();
  function loadGroups() {
    try {
      const raw = localStorage.getItem(GROUPS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          if (v === 'open' || v === 'closed') groupOverrides.set(k, v);
        }
      }
    } catch {}
  }
  function saveGroups() {
    try {
      if (groupOverrides.size === 0) {
        localStorage.removeItem(GROUPS_KEY);
        return;
      }
      const obj = {};
      for (const [k, v] of groupOverrides) obj[k] = v;
      localStorage.setItem(GROUPS_KEY, JSON.stringify(obj));
    } catch {}
  }

  // "Recently opened" was removed as a UI surface — kept here only as a
  // no-op shim so call sites don't crash if a stale invocation lingers.
  function pushRecent() { /* removed */ }
  function loadRecent() { /* removed */ }
  function renderRecent() { /* removed */ }

  // ---- facet option lists ---------------------------------------------
  const difficultyList = ['easy', 'medium', 'hard'];
  const sectionList    = uniq(entries.map(e => e.section));
  const axisList       = uniq(entries.map(e => e.axis));

  function visibleTopics() {
    return uniq(entries
      .filter(e => state.difficulty.size === 0 || state.difficulty.has(e.difficulty))
      .filter(e => state.section.size === 0 || state.section.has(e.section))
      .filter(e => state.axis.size === 0 || state.axis.has(e.axis))
      .map(e => e.topic))
      .sort((a, b) => a.localeCompare(b));
  }

  function matchesBase(e) {
    if (state.difficulty.size && !state.difficulty.has(e.difficulty)) return false;
    if (state.section.size && !state.section.has(e.section)) return false;
    if (state.axis.size && !state.axis.has(e.axis)) return false;
    if (state.topic.size && !state.topic.has(e.topic)) return false;
    return true;
  }

  // search-as-you-type ranking:
  //   exact skill (topic) match: 10
  //   skill prefix:               7
  //   skill substring:            5
  //   label substring:            3
  //   topic substring (extra):    1
  // Returns 0 = no match.
  function searchScore(e, q) {
    if (!q) return 0.0001; // any positive value; treated as "passes filter"
    const topic = e.topic.toLowerCase();
    const label = e.label.toLowerCase();
    let score = 0;
    if (topic === q) score += 10;
    else if (topic.startsWith(q)) score += 7;
    else if (topic.includes(q)) score += 5;
    if (label.includes(q)) score += 3;
    if (topic.includes(q)) score += 1;
    return score;
  }

  function matches(e) {
    if (!matchesBase(e)) return false;
    if (state.q && searchScore(e, state.q.toLowerCase()) <= 0.001) return false;
    return true;
  }

  // facet counts (holding all other filters constant)
  function counts(facet) {
    const out = {};
    const q = state.q.toLowerCase();
    for (const e of entries) {
      if (facet !== 'difficulty' && state.difficulty.size && !state.difficulty.has(e.difficulty)) continue;
      if (facet !== 'section'    && state.section.size    && !state.section.has(e.section)) continue;
      if (facet !== 'axis'       && state.axis.size       && !state.axis.has(e.axis)) continue;
      if (facet !== 'topic'      && state.topic.size      && !state.topic.has(e.topic)) continue;
      if (state.q && searchScore(e, q) <= 0.001) continue;
      const key = e[facet];
      if (!out[key]) out[key] = { sets: 0, qs: 0 };
      out[key].sets += 1;
      out[key].qs   += e.questionCount;
    }
    return out;
  }

  function fmtCount(c) {
    if (!c) return '0';
    return c.sets + ' · ' + (c.qs >= 1000 ? (c.qs/1000).toFixed(1) + 'k' : c.qs);
  }

  function renderFacet(facet, items) {
    const container = document.querySelector(\`[data-facet="\${facet}"]\`);
    container.innerHTML = '';
    const c = counts(facet);
    for (const key of items) {
      const cell = c[key];
      const sets = cell ? cell.sets : 0;
      const on = state[facet].has(key);
      const label = (LABELS[facet] && LABELS[facet][key]) ?? key;
      const el = document.createElement('div');
      el.className = 'opt' + (on ? ' opt--on' : '') + (sets === 0 && !on ? ' opt--zero' : '');
      const dot = facet === 'difficulty'
        ? \`<span class="opt__dot opt__dot--\${key}"></span>\`
        : '';
      const countLabel = cell ? fmtCount(cell) : '0';
      const title = cell ? \`\${cell.sets} sets · \${cell.qs.toLocaleString()} questions\` : '0 sets';
      el.innerHTML = \`
        <span class="opt__check"></span>
        \${dot}
        <span class="opt__label">\${escape(label)}</span>
        <span class="opt__count" title="\${title}">\${countLabel}</span>
      \`;
      el.addEventListener('click', () => {
        if (state[facet].has(key)) state[facet].delete(key);
        else state[facet].add(key);
        if (facet === 'difficulty' || facet === 'section' || facet === 'axis') {
          const allowed = new Set(visibleTopics());
          for (const t of [...state.topic]) if (!allowed.has(t)) state.topic.delete(t);
        }
        render();
      });
      container.appendChild(el);
    }
  }

  function renderActiveChips() {
    chipsEl.innerHTML = '';
    const pushChip = (facet, key) => {
      const label = (LABELS[facet] && LABELS[facet][key]) ?? key;
      const chip = document.createElement('span');
      chip.className = 'head__chip';
      chip.innerHTML = \`<span>\${escape(label)}</span><button aria-label="Remove">×</button>\`;
      chip.querySelector('button').addEventListener('click', () => {
        state[facet].delete(key);
        if (facet === 'section' || facet === 'axis') {
          const allowed = new Set(visibleTopics());
          for (const t of [...state.topic]) if (!allowed.has(t)) state.topic.delete(t);
        }
        render();
      });
      chipsEl.appendChild(chip);
    };
    for (const k of state.difficulty) pushChip('difficulty', k);
    for (const k of state.section)    pushChip('section', k);
    for (const k of state.axis)       pushChip('axis', k);
    for (const k of state.topic)      pushChip('topic', k);
    if (state.q) {
      const chip = document.createElement('span');
      chip.className = 'head__chip';
      chip.innerHTML = \`<span>"\${escape(state.q)}"</span><button aria-label="Remove">×</button>\`;
      chip.querySelector('button').addEventListener('click', () => {
        state.q = ''; search.value = ''; render();
      });
      chipsEl.appendChild(chip);
    }
  }

  // ---- grid (grouped by skill/topic) ----------------------------------
  function groupKey(e) {
    // Topic is shared across sections/axes (e.g. multiple "Linear functions"
    // collections under different difficulties). Disambiguating by section
    // keeps the math/R&W "Linear functions" groups distinct and matches the
    // facet semantics users already learned.
    return e.section + '∶' + e.topic;
  }

  function buildCard(e) {
    const card = document.createElement('article');
    card.className = 'card' + (packet.has(e.uid) ? ' card--picked' : '');
    card.dataset.uid = e.uid;
    const diffLabel = (LABELS.difficulty[e.difficulty] ?? e.difficulty).toUpperCase();
    const setBit = e.label.match(/Set\\s+([A-Z]+|\\d+)$/);
    const setSub = setBit ? 'Set ' + setBit[1] : '';
    // Progress lookups (synchronous via the shared Persistence store).
    const draft = progress.drafts[e.uid] || null;
    const last  = progress.attempts[e.uid] || null;
    const badges = [];
    if (draft && draft.answers && Object.keys(draft.answers).length > 0) {
      const n = Object.keys(draft.answers).length;
      badges.push(\`<span class="badge badge--resume" title="In-progress test"><span class="badge__dot"></span>Resume · \${n}/\${e.questionCount}</span>\`);
    }
    if (last && typeof last.score === 'number' && typeof last.total === 'number') {
      const pct = last.total ? last.score / last.total : 0;
      const tone = pct >= 0.8 ? 'high' : (pct >= 0.5 ? 'mid' : 'low');
      badges.push(\`<span class="badge badge--score-\${tone}" title="Last attempt"><span class="badge__dot"></span>Last: \${last.score}/\${last.total}</span>\`);
    }
    const badgeRow = badges.length
      ? \`<div class="card__badges">\${badges.join('')}</div>\`
      : '';
    const resetBtn = (draft || last)
      ? \`<button class="card__reset" type="button" data-uid="\${e.uid}" title="Clear attempts for this set">Reset</button>\`
      : '';

    const qHref = withModeQuery(e.questionsHtml);
    card.innerHTML = \`
      <button class="card__add" type="button" aria-label="Add to packet" title="Add to packet">\${packet.has(e.uid) ? '✓' : '+'}</button>
      <div class="card__top">
        <div class="card__chips">
          <span class="chip chip--\${e.difficulty}"><span class="chip__dot"></span>\${diffLabel}</span>
          <span class="chip chip--axis">\${escape(LABELS.axis[e.axis] ?? e.axis)}</span>
        </div>
        <span class="card__qc">\${e.questionCount}Q</span>
      </div>
      <div class="card__title">\${escape(e.label)}</div>
      <div class="card__sub">\${escape(LABELS.section[e.section] ?? e.section)}\${setSub ? ' · ' + escape(setSub) : ''}</div>
      \${badgeRow}
      <div class="card__links">
        <a class="link" data-track="\${e.uid}" data-href="\${e.questionsHtml}" href="\${qHref}" target="_blank" rel="noopener">Questions ↗</a>
        <a class="link link--key" data-track="\${e.uid}" data-href="\${e.keyHtml}" href="\${e.keyHtml}" target="_blank" rel="noopener">Key ↗</a>
        \${e.questionsPdf       ? \`<a class="link link--pdf" data-track="\${e.uid}" data-href="\${e.questionsPdf}" href="\${e.questionsPdf}" target="_blank" rel="noopener" title="Multiple questions per page — saves paper">PDF (Condensed)</a>\` : ''}
        \${e.questionsPdfSpaced ? \`<a class="link link--pdf" data-track="\${e.uid}" data-href="\${e.questionsPdfSpaced}" href="\${e.questionsPdfSpaced}" target="_blank" rel="noopener" title="One question per page — more workspace">PDF (1 Question Per Page)</a>\` : ''}
        \${e.keyPdf             ? \`<a class="link link--pdf link--key" data-track="\${e.uid}" data-href="\${e.keyPdf}" href="\${e.keyPdf}" target="_blank" rel="noopener">Key PDF</a>\` : ''}
        \${resetBtn}
      </div>
    \`;
    card.querySelector('.card__add').addEventListener('click', (ev) => {
      ev.preventDefault();
      togglePacket(e.uid);
    });
    const rb = card.querySelector('.card__reset');
    if (rb) {
      rb.addEventListener('click', async () => {
        if (window.Persistence) await window.Persistence.clearForSet(e.uid);
        delete progress.drafts[e.uid];
        delete progress.attempts[e.uid];
        render();
      });
    }
    // track recently-opened: any link click counts
    for (const a of card.querySelectorAll('a[data-track]')) {
      a.addEventListener('click', () => pushRecent(e.uid));
    }
    return card;
  }

  // ---- mode toggle (Study | Test) -------------------------------------
  const MODE_KEY = 'sat-qb-mode';
  let mode = 'study';
  try { mode = localStorage.getItem(MODE_KEY) === 'test' ? 'test' : 'study'; } catch {}
  function withModeQuery(href) {
    if (mode !== 'test') return href;
    return href + (href.indexOf('?') === -1 ? '?mode=test' : '&mode=test');
  }
  function applyMode(next) {
    mode = next === 'test' ? 'test' : 'study';
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
    for (const b of document.querySelectorAll('.mode-toggle__btn')) {
      b.setAttribute('aria-pressed', b.getAttribute('data-mode') === mode ? 'true' : 'false');
    }
    // Re-render so Questions ↗ links pick up the ?mode=test suffix.
    render();
  }
  for (const b of document.querySelectorAll('.mode-toggle__btn')) {
    b.addEventListener('click', () => applyMode(b.getAttribute('data-mode')));
  }

  // ---- progress (drafts + attempts) -----------------------------------
  // Synchronously snapshot from Persistence. We refresh on tab focus so
  // returning to the index after submitting a test reflects new badges.
  const progress = { drafts: Object.create(null), attempts: Object.create(null) };

  async function refreshProgress() {
    if (!window.Persistence) return;
    try {
      const [drafts, attempts] = await Promise.all([
        window.Persistence.listInProgress(),
        window.Persistence.listLatestAttempts(),
      ]);
      progress.drafts = Object.create(null);
      progress.attempts = Object.create(null);
      for (const { setUid, draft } of drafts) progress.drafts[setUid] = draft;
      for (const { setUid, attempt } of attempts) progress.attempts[setUid] = attempt;
    } catch {}
  }
  window.addEventListener('focus', async () => {
    await refreshProgress();
    render();
    syncResetAllVisibility();
  });

  function syncResetAllVisibility() {
    const btn = document.getElementById('reset-all');
    if (!btn) return;
    const hasAny = Object.keys(progress.drafts).length > 0 || Object.keys(progress.attempts).length > 0;
    btn.hidden = !hasAny;
  }
  const resetAllBtn = document.getElementById('reset-all');
  if (resetAllBtn) {
    resetAllBtn.addEventListener('click', async () => {
      if (!confirm('Clear all in-progress drafts and completed attempts?')) return;
      if (window.Persistence) await window.Persistence.clearAll();
      progress.drafts = Object.create(null);
      progress.attempts = Object.create(null);
      render();
      syncResetAllVisibility();
    });
  }

  function renderGrid() {
    grid.innerHTML = '';
    const q = state.q.toLowerCase();

    // Filter then rank
    const filtered = entries.filter(matches);
    const ranked = filtered.map(e => ({ e, score: searchScore(e, q) }));

    // Group by skill+section
    /** Map<key, {topic, section, items: [{e, score}]}> */
    const groups = new Map();
    for (const x of ranked) {
      const k = groupKey(x.e);
      if (!groups.has(k)) groups.set(k, { topic: x.e.topic, section: x.e.section, items: [], bestScore: 0 });
      const g = groups.get(k);
      g.items.push(x);
      if (x.score > g.bestScore) g.bestScore = x.score;
    }

    // Sort items within each group: by score desc, then by set number asc
    for (const g of groups.values()) {
      g.items.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return setOrder(a.e.label) - setOrder(b.e.label);
      });
      g.totalQs = g.items.reduce((a, x) => a + x.e.questionCount, 0);
    }

    // Sort groups: when searching, by best score desc then alphabetically;
    // when not searching, alphabetically by topic.
    const groupList = [...groups.values()].sort((a, b) => {
      if (q) {
        if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
      }
      const t = a.topic.localeCompare(b.topic);
      if (t !== 0) return t;
      return a.section.localeCompare(b.section);
    });

    countEl.textContent = filtered.length;
    const qTotal = filtered.reduce((acc, e) => acc + e.questionCount, 0);
    qCountEl.textContent = qTotal.toLocaleString() + ' questions';
    emptyEl.hidden = filtered.length > 0;

    for (const g of groupList) {
      const key = g.section + '∶' + g.topic;
      const userOverride = groupOverrides.get(key);
      // default: open when ≤3 sets OR when actively searching, otherwise collapsed
      const defaultOpen = g.items.length <= 3 || !!q;
      const open = userOverride
        ? userOverride === 'open'
        : defaultOpen;

      const gEl = document.createElement('section');
      gEl.className = 'group' + (open ? ' group--open' : '');
      gEl.dataset.group = key;

      const head = document.createElement('div');
      head.className = 'group__head';
      head.setAttribute('role', 'button');
      head.setAttribute('aria-expanded', String(open));
      head.innerHTML = \`
        <span class="group__chev">
          <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="5 3 11 8 5 13"/>
          </svg>
        </span>
        <span class="group__title">\${escape(g.topic)}</span>
        <span class="group__meta">\${escape(LABELS.section[g.section] ?? g.section)} · \${g.totalQs.toLocaleString()} Q</span>
        <span class="group__badge">\${g.items.length} set\${g.items.length === 1 ? '' : 's'}</span>
      \`;
      head.addEventListener('click', () => {
        const isOpen = gEl.classList.toggle('group--open');
        head.setAttribute('aria-expanded', String(isOpen));
        // record override; only persists user-explicit choice
        groupOverrides.set(key, isOpen ? 'open' : 'closed');
        saveGroups();
      });
      gEl.appendChild(head);

      const cards = document.createElement('div');
      cards.className = 'group__cards';
      for (const x of g.items) cards.appendChild(buildCard(x.e));
      gEl.appendChild(cards);

      grid.appendChild(gEl);
    }
  }

  function setOrder(label) {
    const m = label.match(/Set\\s+([A-Z]+|\\d+)$/);
    if (!m) return 9999;
    const n = parseInt(m[1], 10);
    if (!isNaN(n)) return n;
    // letter sets ("Set A", "Set B"): convert to a stable number-like key
    return 1000 + (m[1].charCodeAt(0) - 'A'.charCodeAt(0));
  }

  // Auto-collapse rule: a facet collapses once any *later* facet (lower in
  // the SET_FACETS list) has a selection — once you've drilled deeper, the
  // upstream filter is "done" and folds into a one-line summary. The user
  // can click any collapsed head to re-expand (pin to facetForcedOpen).
  function shouldAutoCollapse(facet) {
    const idx = SET_FACETS.indexOf(facet);
    if (idx < 0) return false;
    for (let j = idx + 1; j < SET_FACETS.length; j++) {
      if (state[SET_FACETS[j]].size > 0) return true;
    }
    return false;
  }

  function applyAutoCollapse() {
    for (const facet of SET_FACETS) {
      const container = document.querySelector(\`[data-facet="\${facet}"]\`);
      if (!container) continue;
      const wrap = container.closest('.facet');
      if (!wrap) continue;
      const head = wrap.querySelector('.facet__head');
      const collapsed = shouldAutoCollapse(facet) && !facetForcedOpen.has(facet);
      wrap.classList.toggle('facet--collapsed', collapsed);
      // Head becomes clickable to toggle the override. Bind once.
      if (head && !head.dataset.collapseBound) {
        head.dataset.collapseBound = '1';
        head.addEventListener('click', () => {
          if (facetForcedOpen.has(facet)) facetForcedOpen.delete(facet);
          else facetForcedOpen.add(facet);
          applyAutoCollapse();
        });
      }
      // When collapsed, show selection summary inline in the head.
      if (head) {
        let summary = head.querySelector('.facet__summary');
        if (!summary) {
          summary = document.createElement('span');
          summary.className = 'facet__summary';
          head.appendChild(summary);
        }
        const selected = [...state[facet]];
        summary.textContent = collapsed && selected.length
          ? selected.map(k => (LABELS[facet] && LABELS[facet][k]) ?? k).join(', ')
          : '';
      }
    }
  }

  function render() {
    renderFacet('difficulty', difficultyList);
    renderFacet('section',    sectionList);
    renderFacet('axis',       axisList);
    renderFacet('topic',      visibleTopics());
    applyAutoCollapse();
    renderActiveChips();
    renderGrid();
    renderRecent();
    saveState();
  }

  // ---- packet tray ----------------------------------------------------
  const tray = document.getElementById('tray');
  const trayFab = document.getElementById('tray-fab');
  const trayFabCount = document.getElementById('tray-fab-count');
  const trayClose = document.getElementById('tray-close');
  const trayList = document.getElementById('tray-list');
  const traySub = document.getElementById('tray-sub');
  const trayClear = document.getElementById('tray-clear');
  const trayZip = document.getElementById('tray-zip');
  const trayZipProgress = document.getElementById('tray-zip-progress');
  const trayZipLabel = trayZip.querySelector('.tray__zip-label');

  function togglePacket(uid) {
    if (packet.has(uid)) packet.delete(uid);
    else packet.add(uid);
    savePacket();
    syncPacketUI();
  }

  function openTray() {
    tray.classList.add('tray--open');
    tray.setAttribute('aria-hidden', 'false');
    scrim.classList.add('scrim--on');
    scrim.hidden = false;
  }
  function closeTray() {
    tray.classList.remove('tray--open');
    tray.setAttribute('aria-hidden', 'true');
    // only hide scrim if drawer is also closed
    if (!sidebar.classList.contains('sidebar--open')) {
      scrim.classList.remove('scrim--on');
      scrim.hidden = true;
    }
  }
  trayFab.addEventListener('click', openTray);
  trayClose.addEventListener('click', closeTray);
  trayClear.addEventListener('click', () => {
    packet.clear();
    savePacket();
    syncPacketUI();
  });

  function syncPacketUI() {
    const n = packet.size;
    trayFabCount.textContent = String(n);
    traySub.textContent = n === 0
      ? '0 sets selected'
      : (n + ' set' + (n === 1 ? '' : 's') + ' selected');
    trayZip.disabled = n === 0;
    trayList.innerHTML = '';
    if (n === 0) {
      trayList.innerHTML = '<div class="tray__empty">Tap the <strong>+</strong> on any card to add it to your packet.</div>';
    } else {
      for (const uid of packet) {
        const e = byUid.get(uid);
        if (!e) continue;
        const item = document.createElement('div');
        item.className = 'tray__item';
        item.innerHTML = \`
          <div class="tray__item-main">
            <div class="tray__item-title">\${escape(e.label)}</div>
            <div class="tray__item-meta">\${escape(LABELS.section[e.section] ?? e.section)} · \${escape(LABELS.difficulty[e.difficulty] ?? e.difficulty)} · \${e.questionCount}Q</div>
          </div>
          <button class="tray__item-rm" type="button" aria-label="Remove">×</button>
        \`;
        item.querySelector('.tray__item-rm').addEventListener('click', () => {
          packet.delete(uid);
          savePacket();
          syncPacketUI();
          // also un-highlight the corresponding card if visible
          const card = grid.querySelector(\`.card[data-uid="\${cssEscape(uid)}"]\`);
          if (card) {
            card.classList.remove('card--picked');
            const btn = card.querySelector('.card__add');
            if (btn) btn.textContent = '+';
          }
        });
        trayList.appendChild(item);
      }
    }
    // sync card visuals
    for (const card of grid.querySelectorAll('.card')) {
      const isPicked = packet.has(card.dataset.uid);
      card.classList.toggle('card--picked', isPicked);
      const btn = card.querySelector('.card__add');
      if (btn) btn.textContent = isPicked ? '✓' : '+';
    }
  }

  function cssEscape(s) {
    // Minimal CSS escape for our slug-shaped uids (contain '/' and dashes).
    return String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\\\' + c);
  }

  // ---- zip download ---------------------------------------------------
  trayZip.addEventListener('click', async () => {
    if (packet.size === 0) return;
    if (typeof JSZip === 'undefined') {
      alert('JSZip failed to load — check your internet connection and try again.');
      return;
    }
    trayZip.disabled = true;
    trayZipLabel.textContent = 'Preparing…';
    trayZipProgress.hidden = false;
    trayZipProgress.textContent = '0 / ' + packet.size;
    const zip = new JSZip();
    const picked = [...packet].map(u => byUid.get(u)).filter(Boolean);

    let done = 0;
    let added = 0;
    let missing = 0;

    for (const e of picked) {
      const subdir = \`\${LABELS.section[e.section] ?? e.section}/\${(LABELS.difficulty[e.difficulty] ?? e.difficulty)}\`;
      const baseName = slug(e.label);
      const candidates = [
        { url: e.questionsPdf,       name: baseName + '_questions.pdf' },
        { url: e.questionsPdfSpaced, name: baseName + '_questions-spaced.pdf' },
        { url: e.keyPdf,             name: baseName + '_key.pdf' },
      ];
      for (const c of candidates) {
        if (!c.url) { missing++; continue; }
        try {
          const res = await fetch(c.url);
          if (!res.ok) { missing++; continue; }
          const blob = await res.blob();
          zip.file(subdir + '/' + c.name, blob);
          added++;
        } catch {
          missing++;
        }
      }
      done++;
      trayZipProgress.textContent = done + ' / ' + picked.length;
    }

    if (added === 0) {
      alert(\`No PDFs are available for the selected sets yet (\${missing} files missing). PDFs are generated by the export pipeline; if you don't see any, the export hasn't produced them.\`);
      trayZipLabel.textContent = 'Download as ZIP';
      trayZipProgress.hidden = true;
      trayZip.disabled = false;
      return;
    }

    trayZipLabel.textContent = 'Zipping…';
    const blob = await zip.generateAsync({ type: 'blob' }, (meta) => {
      trayZipProgress.textContent = Math.round(meta.percent) + '%';
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = \`sat-question-bank-packet-\${stamp}.zip\`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30_000);

    trayZipLabel.textContent = added < (added + missing)
      ? \`Downloaded (\${added} files, \${missing} missing)\`
      : 'Downloaded ✓';
    trayZipProgress.hidden = true;
    setTimeout(() => {
      trayZipLabel.textContent = 'Download as ZIP';
      trayZip.disabled = false;
    }, 2400);
  });

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+\$/g, '');
  }

  // ---- recent → focus card --------------------------------------------
  function focusCard(uid) {
    const e = byUid.get(uid);
    if (!e) return;
    const key = e.section + '∶' + e.topic;
    // ensure the containing group is open
    const groupEl = grid.querySelector(\`section.group[data-group="\${cssEscape(key)}"]\`);
    if (groupEl && !groupEl.classList.contains('group--open')) {
      groupEl.classList.add('group--open');
      const head = groupEl.querySelector('.group__head');
      if (head) head.setAttribute('aria-expanded', 'true');
      groupOverrides.set(key, 'open');
      saveGroups();
    }
    const card = grid.querySelector(\`.card[data-uid="\${cssEscape(uid)}"]\`);
    if (!card) return;
    // close mobile drawer if open, so the scroll target is visible
    if (window.matchMedia('(max-width: 768px)').matches) {
      sidebar.classList.remove('sidebar--open');
      scrim.classList.remove('scrim--on');
      scrim.hidden = true;
    }
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('card--flash');
    setTimeout(() => card.classList.remove('card--flash'), 1600);
  }

  // ---- handlers --------------------------------------------------------
  search.addEventListener('input', e => { state.q = e.target.value.trim(); render(); });
  resetBtn.addEventListener('click', () => {
    state.difficulty.clear();
    state.section.clear(); state.axis.clear();
    state.topic.clear();
    facetForcedOpen.clear();
    state.q = ''; search.value = '';
    render();
  });

  // sidebar collapse (desktop) / drawer (mobile) ------------------------
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebar-toggle');
  const mMenu = document.getElementById('m-menu');
  const scrim = document.getElementById('scrim');
  const SIDEBAR_KEY = 'sat-qb-sidebar-collapsed';

  function applyCollapsed(collapsed) {
    sidebar.classList.toggle('sidebar--collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
  }
  try {
    if (localStorage.getItem(SIDEBAR_KEY) === '1') applyCollapsed(true);
  } catch {}

  toggle.addEventListener('click', () => {
    const next = !sidebar.classList.contains('sidebar--collapsed');
    applyCollapsed(next);
    try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch {}
  });

  // mobile drawer
  function openDrawer() {
    sidebar.classList.add('sidebar--open');
    scrim.classList.add('scrim--on');
    scrim.hidden = false;
  }
  function closeDrawer() {
    sidebar.classList.remove('sidebar--open');
    if (!tray.classList.contains('tray--open')) {
      scrim.classList.remove('scrim--on');
      scrim.hidden = true;
    }
  }
  mMenu.addEventListener('click', () => {
    if (sidebar.classList.contains('sidebar--open')) closeDrawer();
    else openDrawer();
  });
  scrim.addEventListener('click', () => { closeDrawer(); closeTray(); });

  // keyboard: '/' focuses search, ESC clears search, ⌘\\ toggles sidebar
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '\\\\') {
      e.preventDefault();
      toggle.click();
      return;
    }
    if (e.key === '/' && document.activeElement !== search) {
      e.preventDefault();
      search.focus();
      search.select();
    } else if (e.key === 'Escape') {
      if (tray.classList.contains('tray--open')) { closeTray(); return; }
      if (sidebar.classList.contains('sidebar--open')) { closeDrawer(); return; }
      if (document.activeElement === search) {
        state.q = ''; search.value = ''; render();
        search.blur();
      }
    }
  });

  function uniq(arr) { return [...new Set(arr)]; }
  function escape(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // init
  loadState();
  loadPacket();
  loadGroups();
  loadRecent();
  // Snapshot persistence FIRST so the first render shows badges.
  (async () => {
    await refreshProgress();
    // Reflect mode on the toggle (state was read at script load).
    applyMode(mode);
    syncPacketUI();
    syncResetAllVisibility();
  })();
  // Render once now so the grid is visible even before persistence resolves.
  render();
  syncPacketUI();
})();
`;

await main();
