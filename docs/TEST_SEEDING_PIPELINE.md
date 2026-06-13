# Full-Test Seeding Pipeline (PDF → live test)

How a paper/scanned SAT PDF becomes a live full test in `test_questions`, and the
**fidelity gates that are now mandatory** at each step. Written after the
2026-06-13 audit found that vision transcription had silently corrupted content
across CB OG #1–10 (dropped punctuation/colons, word substitutions, dropped
italics) and the six DSAT tests (incl. an answer-flipping data table).

> **Root cause:** OCR/vision transcription is lossy. On Standard-English-convention
> items **punctuation _is_ the answer**, so a dropped colon or scrambled
> apostrophe silently inverts which choice is correct. On data-table items a
> single wrong digit flips the answer. None of this trips a casual read — it
> must be caught by an explicit verification gate before go-live.

Tooling lives in **`scripts/test-pipeline/`** (committed). Per-test scratch
(`raw/m*.json`, `*-config.mjs`, page renders) lives under `.work/<test>/`
(gitignored — the committed artifact is the migration SQL).

| Tool | Use |
|---|---|
| `build-cbog.mjs <testDir> <config.mjs>` | merge `raw/m{1..4}.json` + config → idempotent seed migration (validates counts/choices/keys; accepts rich run-objects) |
| `audit-choices.py <testDir> <pdf>` | diff seeded choices vs `pdftotext` (text-layer PDFs) |
| `audit-passages.py <testDir> <pdf> [--math]` | diff passage/stem words vs `pdftotext` (text-layer) |
| `fix-content.py <testDir> <pdf> --apply` | auto-fix ≥3/4-match choices + restore italics from `pdftohtml` (text-layer) |
| `apply-italics.py <slug> [spans.json]` | wrap an explicit italic-span list (+ convert markdown `*…*`) — used for **scanned** PDFs whose italics are flattened |
| `audit-db.py <slug> <pdf...>` | diff the **live DB** for a slug vs its PDF(s) — any test |

**Prod DB connection** (the psql-based tools/gates read `SUPABASE_DB_PASSWORD`
from the repo-root `.env`):
```
psql -h aws-1-ap-southeast-2.pooler.supabase.com -p 5432 \
     -U postgres.ljdofwovsyaqydcbohhd -d postgres        # PGPASSWORD=$SUPABASE_DB_PASSWORD
```
`check:content` instead uses `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (supabase-js).

---

## The two PDF classes (decide first)

Run `pdffonts <pdf> | tail -n +3 | wc -l` and `pdftotext -layout <pdf> -` on a
content page:

| Class | Signature | Verification oracle |
|---|---|---|
| **Text-layer** (e.g. College Board "digital" PDFs / CB OG) | body text is selectable; choices appear as `A) …` in `pdftotext`; `pdftohtml -xml` emits `<i>`/`<b>` from the font | **Automated** — diff transcription vs `pdftotext`/`pdftohtml` |
| **Scanned image** (e.g. the DSAT exports) | `pdftotext` returns near-empty for content pages even if `pdffonts` lists fonts (those are page chrome) | **Vision only** — render every page and read it; no cheap text oracle |

This choice determines which QC gate applies (steps 5a vs 5b).

---

## Pipeline steps

### 1. Render
`pdftoppm -png -r 200 <pdf> /tmp/<slug>_p` (use `-r 300/400` + crop for fine
punctuation). Note page size: CB OG is US-Letter 612×792; DSAT is A4 595×841.

### 2. Transcribe (OCR / vision) — where errors enter
Vision agents read page images → per-module JSON (`raw/m1..m4.json`). Modules:
RW = 27 Q each, Math = 22 (DSAT) / 27 (CB OG linear) Q each.
**Transcription instructions must demand:**
- Exact punctuation in every choice (commas/colons/semicolons/apostrophes/dashes) —
  never "tidy up" a convention question's choices.
- Capture formatting (see step 3): italics, underlines, super/subscripts.
- Math as LaTeX in `$…$`. Transcribe data tables digit-for-digit.

### 3. JSON format (carries formatting)
A `passage`/`stem`/choice value is **either a plain string or an array of
run-objects**, so formatting survives transcription:
```json
"passage": ["the term ", {"t":"flauna","i":true}, " …"]
"choices": {"A": {"t":"H","sub":"2"} }      // also: i/italic, u/underline, b/bold, sup
```
`build-cbog.mjs` serializes runs → the inline markup the runner understands:
`<i>` italic · `<u>` underline · `<b>` bold · `<sup>`/`<sub>` · `$…$` KaTeX.
The runner (`viewer/src/fulltest/passageRender.tsx`) renders all of these and
keeps the highlight char-offset model intact. **Plain strings are still fine** —
arrays are only needed where formatting exists.

### 4. Build → idempotent seed migration
`node scripts/test-pipeline/build-cbog.mjs <testDir> <config.mjs>` →
`supabase/migrations/NNNN_seed_<slug>.sql` (upsert on slug / position).
The build **validates**: 4 modules, expected Q counts, every MCQ has 4 non-empty
choices, the answer key letter resolves to a choice, grids have accepted values.
The official answer key is authoritative for `type` (single A–D ⇒ mcq, else grid).

The `<config.mjs>` shape (one per test; the answers come from the official key):
```js
export default {
  slug: "cb-og-1", ordinal: 7, title: "CB OG #1", shortTitle: "CB OG #1",
  source: "sat-practice-test-1-digital.pdf", migrationName: "0164_seed_cb_og_1",
  modules: [ { module:1, position:1, section:"reading-writing", label:"Reading and Writing — Module 1" }, … ],
  answers: { 1:{ 1:"B", 2:"C", … }, 3:{ 6:"2520", 14:["2","-12"], … } },  // per module; grids = string/array
  figures: {},  // "module-number" → served PNG path, filled after cropping
};
```

### 5. QC GATES — **mandatory before go-live**

#### 5a. Text-layer PDFs (automated)
```
python3 scripts/test-pipeline/audit-choices.py   <testDir> <pdf>      # choices vs pdftotext, letter-paired
python3 scripts/test-pipeline/audit-passages.py  <testDir> <pdf>      # passage/stem word diffs (difflib)
python3 scripts/test-pipeline/fix-content.py     <testDir> <pdf> --apply   # auto-fix ≥3/4-match choices + restore italics
```
- `audit-choices` must read **0 punctuation diffs**; residual "word/structural"
  diffs are only the graphical math choices (no extractable PDF text) — confirm
  those visually.
- `fix-content` restores prose italics from `pdftohtml -xml` (MinionPro-It font),
  with a STRICT filter (titles/binomials/distinctive words; rejects common words
  + math-variable italics). Afterward scan `</i> [A-Z][a-z]+` for split titles
  (pdftohtml splits a title across lines) and merge.

#### 5b. Scanned image PDFs (vision — required)
There is no text oracle, so a **vision-QA pass is mandatory**: render every page,
read it, compare to the live row. Dump the DB rows with:
```
psql "$POOLER" -tAc "select tm.position||' | '||tq.ref||' | A='||(tq.choices->>'A')|| … from public.test_questions tq join test_modules tm … join tests t … where t.slug='<slug>' order by tm.position, tq.position"
```
Parallelize with one subagent per test. **Look hardest at:** convention-question
punctuation; **numeric/data tables**; transition questions that must keep a
`______` blank; italics/underlines.

**Lessons from the 2026-06-13 DSAT pass (bake these into the agent prompts):**
- **Verify any answer-affecting finding YOURSELF before writing.** A subagent
  under-counted a dense numeric table (reported 3 of 5 wrong cells on the
  oct-asia-a Q9 table, where a `$2.4B`→`$12.4B` digit flipped the ranking
  answer). Re-render and read tables/answer-bearing cells personally.
- **Scanned PDFs FLATTEN italics** — the slant doesn't survive the digital→scan
  render, so the scan shows titles/binomials in plain upright type and you cannot
  detect italics visually. Don't conclude "no italics"; instead derive them from
  standard College Board typographic convention (italicize titles of
  books/works/albums/films/paintings/periodicals [title proper only — "New
  Yorker", not "New Yorker essays"], scientific binomials, ship names, foreign
  terms; CB *quotes* short-work/poem titles, so those are NOT italic). Have the
  subagent emit a `spans.json` of `{ref, field, text}` (text = exact DB
  substring) and apply with `apply-italics.py <slug> spans.json` (word-boundary,
  longest-first for nested titles, also converts any markdown `*…*`→`<i>`).
- **Don't change answer keys** — keys have been correct across all 16 tests; the
  defects are always in the CONTENT.
- Don't have subagents edit the DB directly; have them REPORT, then apply via a
  scoped, idempotent migration (step 6).

#### 5c. Both — final gates
- `cd viewer && npm run check:content` — OCR-artifact scanner over all
  `test_questions`. **Must read a clean 0.** The heuristics recognise the
  legitimate patterns that used to false-positive: LaTeX inside `$…$` (nth-root
  `\sqrt[5]{…}`), uppercase phrase/full-sentence choices that legitimately mix
  terminal punctuation (e.g. a noun phrase beside "No additional information is
  necessary."), "…from the notes" rhetorical items, and a quotation that opens in
  the passage and closes inside an answer choice. So any flag now is a REAL defect
  to fix — don't dismiss it.
- `python3 scripts/test-pipeline/audit-db.py <slug> <pdf...>` — diff the **live
  DB** against the PDF (works for any test; use after seeding/UPDATEs).
- Structural: `total_questions` == row count; clickthrough harness
  (`viewer/scripts/clickthrough-practice-test.mjs`) green.

### 6. Deploy
`npm run db:push` for new migrations. If a seed migration is **already applied**
and you corrected its content, re-run the idempotent SQL straight to prod via
psql on the pooler (connection above; see also `docs/MIGRATIONS.md` / memory
`psql-direct-migration-apply`) — `db push` skips already-applied migrations. For
content fixes to tests seeded by other pipelines, write a **forward corrective
migration** of idempotent `UPDATE … replace()` / `jsonb_set(...)` statements
scoped by `(slug, ref)` (e.g. `0230_dsat_content_fixes.sql`,
`0231_dsat_italics.sql`). Make every statement re-runnable (replace/regexp_replace
that no-ops once applied) so a later clean `db push` is harmless.

⚠️ **Migration-number collisions:** a parallel session may grab the next
number(s) concurrently. Before naming a migration, run
`ls supabase/migrations | grep -E '^0NNN'` and pick a number ABOVE the current
max; after pushing, confirm `supabase migration list` shows no duplicate prefix
(two `0NNN_*` files silently skip one on push — this bit us; we renumbered
0227/0228 → 0230/0231). Stage only YOUR files (`git add <paths>`, never `-A`) —
the tree is shared with the parallel session.

---

## Checklist (copy into the seeding PR / task)

- [ ] PDF class identified (text-layer vs scanned) → correct QC gate chosen
- [ ] Transcription preserves punctuation + formatting (italics/underline/sup/sub)
- [ ] `build-cbog.mjs` validation passes
- [ ] **Text-layer:** `audit-choices` = 0 punctuation diffs; `fix-content` ran; italics restored + split-titles (`</i> [A-Z]…`) merged
- [ ] **Scanned:** full vision-QA pass done; numeric tables + convention punctuation verified BY YOU; italics derived from CB convention + applied via `apply-italics.py`
- [ ] `npm run check:content` = **clean 0** (any flag is now a real defect)
- [ ] `audit-db.py` clean against the live DB
- [ ] counts match `total_questions`; clickthrough harness green
- [ ] answer keys spot-checked (keys are usually right — fix the CONTENT, not the key)
- [ ] migration number above current max + no duplicate prefix; staged only your files; committed + pushed
