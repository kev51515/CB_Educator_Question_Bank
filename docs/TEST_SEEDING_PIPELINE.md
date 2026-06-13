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

Tooling lives in **`scripts/test-pipeline/`** (committed). The CB-OG instances of
the per-test scratch (`raw/m*.json`, configs) live under `.work/cb-og/` (gitignored).

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
punctuation; **numeric/data tables** (a wrong digit flips the answer — the
oct-asia-a Q9 table had 5 wrong cells); transition questions that must keep a
`______` blank; italics/underlines. Verify any answer-affecting finding yourself
before writing.

#### 5c. Both — final gates
- `cd viewer && npm run check:content` — OCR-artifact scanner over all
  `test_questions`. Must read **0 real flags**. Known false positives to expect:
  LaTeX `\sqrt[5]` (bracket heuristic), a full-sentence choice among phrases,
  quotation marks that open in the passage and close in a choice.
- `python3 scripts/test-pipeline/audit-db.py <slug> <pdf...>` — diff the **live
  DB** against the PDF (works for any test; use after seeding/UPDATEs).
- Structural: `total_questions` == row count; clickthrough harness
  (`viewer/scripts/clickthrough-practice-test.mjs`) green.

### 6. Deploy
`npm run db:push` for new migrations. If a seed migration is already applied and
you corrected its content, re-run the idempotent SQL straight to prod via psql on
the pooler (see [docs in MIGRATIONS.md] / memory `psql-direct-migration-apply`) —
`db push` skips already-applied migrations. For content fixes to tests seeded by
other pipelines, write a **forward corrective migration** of idempotent
`UPDATE … replace()` statements scoped by `(slug, ref)` (e.g. `0227_dsat_content_fixes.sql`).

---

## Checklist (copy into the seeding PR / task)

- [ ] PDF class identified (text-layer vs scanned) → correct QC gate chosen
- [ ] Transcription preserves punctuation + formatting (italics/underline/sup/sub)
- [ ] `build-cbog.mjs` validation passes
- [ ] **Text-layer:** `audit-choices` = 0 punctuation diffs; italics restored + split-titles merged
- [ ] **Scanned:** full vision-QA pass done; tables/convention-punctuation verified
- [ ] `npm run check:content` = 0 real flags
- [ ] `audit-db.py` clean against the live DB
- [ ] counts match `total_questions`; clickthrough harness green
- [ ] answer keys spot-checked (keys are usually right — fix the CONTENT, not the key)
