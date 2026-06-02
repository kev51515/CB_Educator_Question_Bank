// Smoke test for the static test-runner + persistence assets.
//
// We're not running a headless browser here; we just (a) verify the rendered
// HTML carries every hook the runner relies on, and (b) load
// _assets/persistence.js into a JSDOM-style stub global to confirm the
// adapter contract works against an in-memory localStorage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');

// Tiny in-memory localStorage stub.
function makeLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
  };
}

// Load _assets/persistence.js into a fresh global with localStorage stub.
// Done via `new Function` so we don't touch the real Node globals.
function loadPersistence() {
  const path = join(ROOT, 'data', 'exports', '_assets', 'persistence.js');
  // file may not exist if a fresh checkout: fail loudly so the dev notices.
  return readFile(path, 'utf8').then((src) => {
    const sandbox = {
      window: { localStorage: makeLocalStorage() },
      globalThis: undefined,
    };
    // The script does `(function (global) {...})(typeof window !== 'undefined' ? window : globalThis)`.
    // We patch by constructing a real eval context.
    const fn = new Function('window', 'localStorage', src + '\nreturn window.Persistence;');
    return fn(sandbox.window, sandbox.window.localStorage);
  });
}

// ----- persistence ---------------------------------------------------------
test('Persistence — save/load/clear draft round-trip', async () => {
  const P = await loadPersistence();
  P.saveDraft('uid-1', { answers: { q1: 'B' }, startedAt: 1000 });
  const d = P.loadDraft('uid-1');
  assert.deepEqual(d, { answers: { q1: 'B' }, startedAt: 1000 });
  P.clearDraft('uid-1');
  assert.equal(P.loadDraft('uid-1'), null);
});

// §10 — Highlights & Notes ride through the same LocalStorage contract.
// The Supabase path also routes them via draft_meta (covered manually by
// the Supabase column tests; not exercised here without a live DB).
test('Persistence — highlights + notes round-trip on draft and attempt', async () => {
  const P = await loadPersistence();
  const draft = {
    answers: { q1: 'A' },
    highlights: { q1: [{ hid: 'h1', color: 'yellow', pane: 'stimulus', start: 4, end: 12, text: 'critics' }] },
    notes: { q1: 'remember: tone shift in line 3' },
    startedAt: 5000,
  };
  P.saveDraft('uid-hn', draft);
  assert.deepEqual(P.loadDraft('uid-hn'), draft, 'draft round-trips H&N');

  await P.saveAttempt('uid-hn', {
    startedAt: 5000, submittedAt: 6000, secondsTaken: 1,
    score: 1, total: 1, source: 'static', answers: [{ qid: 'q1', chosen: 'A', isCorrect: true }],
    highlights: draft.highlights, notes: draft.notes,
  });
  const list = await P.listLatestAttempts();
  const found = list.find((x) => x.setUid === 'uid-hn');
  assert.ok(found, 'attempt persisted');
  assert.deepEqual(found.attempt.highlights, draft.highlights, 'attempt carries highlights');
  assert.deepEqual(found.attempt.notes, draft.notes, 'attempt carries notes');
});

test('Persistence — saveAttempt clears the draft and surfaces in listLatestAttempts', async () => {
  const P = await loadPersistence();
  P.saveDraft('uid-1', { answers: { q1: 'B' }, startedAt: 1000 });
  await P.saveAttempt('uid-1', {
    startedAt: 1000, submittedAt: 2000, secondsTaken: 1,
    score: 2, total: 3, source: 'static', answers: [],
  });
  assert.equal(P.loadDraft('uid-1'), null, 'draft cleared after submit');
  const list = await P.listLatestAttempts();
  assert.equal(list.length, 1);
  assert.equal(list[0].setUid, 'uid-1');
  assert.equal(list[0].attempt.score, 2);
});

test('Persistence — listInProgress lists only active drafts', async () => {
  const P = await loadPersistence();
  P.saveDraft('uid-a', { answers: { q1: 'A' }, startedAt: 1 });
  P.saveDraft('uid-b', { answers: { q1: 'B' }, startedAt: 2 });
  const inProgress = await P.listInProgress();
  const uids = inProgress.map((x) => x.setUid).sort();
  assert.deepEqual(uids, ['uid-a', 'uid-b']);
});

test('Persistence — clearForSet removes both draft and attempts for that uid', async () => {
  const P = await loadPersistence();
  P.saveDraft('uid-x', { answers: { q1: 'A' }, startedAt: 1 });
  await P.saveAttempt('uid-x', { submittedAt: 99, score: 1, total: 2, answers: [] });
  await P.saveAttempt('uid-y', { submittedAt: 99, score: 2, total: 2, answers: [] });
  await P.clearForSet('uid-x');
  assert.equal(P.loadDraft('uid-x'), null);
  const list = await P.listLatestAttempts();
  assert.equal(list.length, 1);
  assert.equal(list[0].setUid, 'uid-y');
});

test('Persistence — clearAll wipes everything', async () => {
  const P = await loadPersistence();
  P.saveDraft('uid-a', { answers: { q1: 'A' }, startedAt: 1 });
  await P.saveAttempt('uid-a', { submittedAt: 1, score: 0, total: 1, answers: [] });
  await P.clearAll();
  assert.equal((await P.listLatestAttempts()).length, 0);
  assert.equal((await P.listInProgress()).length, 0);
});

// ----- generated HTML shape ------------------------------------------------
test('Rendered HTML — embeds set-uid + test-runner script + cards have data hooks', async () => {
  const html = await readFile(
    join(ROOT, 'data', 'exports', 'by-skill', 'reading-and-writing', 'easy', 'boundaries-set-1_questions.html'),
    'utf8'
  );
  assert.match(html, /<meta name="set-uid" content="by-skill\/reading-and-writing\/easy\/boundaries-set-1">/);
  assert.match(html, /<meta name="set-total" content="10">/);
  assert.match(html, /test-runner\.js/);
  // Phase A: canonical-stem callout present, per-card stem suppressed.
  assert.match(html, /<aside class="cover-stem-callout">/);
  assert.ok(!/<div class="stem">/.test(html), 'per-card stems suppressed when canonical');
  // Cards carry the test-runner hooks.
  assert.match(html, /<article class="card" data-qid="q1" data-type="mcq" data-correct="[A-D]"/);
  // Strip toggle present.
  assert.match(html, /strip__mode-btn" data-mode="test"/);
  // Per-card skill tag dropped on single-skill set.
  assert.ok(/<div class="card__tags"><\/div>/.test(html), 'card__tags is empty on single-skill set');
});

test('Rendered HTML — mixed-skill set KEEPS per-card tag + no canonical callout', async () => {
  const html = await readFile(
    join(ROOT, 'data', 'exports', 'by-mixed', 'reading-and-writing', 'easy', 'mixed-set-1_questions.html'),
    'utf8'
  );
  // Per-card tag remains.
  assert.match(html, /<span class="tag u-ui">/);
  // No cover-stem-callout aside element (math/mixed sets never share a stem).
  assert.ok(!/<aside class="cover-stem-callout"/.test(html));
});
