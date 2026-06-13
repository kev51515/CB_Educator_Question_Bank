# scripts/test-pipeline

Tooling for seeding full tests from source PDFs and **verifying content fidelity**
before go-live. Full process: **`docs/TEST_SEEDING_PIPELINE.md`**.

Born from the 2026-06-13 audit: OCR/vision transcription silently corrupts
content (dropped punctuation on convention questions, word substitutions, dropped
italics, answer-flipping table digits). These tools are the gate that catches it.

| Tool | What it does |
|---|---|
| `build-cbog.mjs <testDir> <config.mjs>` | Merge `raw/m{1..4}.json` + config → idempotent seed migration. Accepts rich run-objects (`[{t,i,u,b,sup,sub}]`) and serializes to `<i>/<u>/<b>/<sup>/<sub>` markup. Validates counts / choices / answer keys. |
| `audit-choices.py <testDir> <pdf>` | Diff seeded **choices** vs `pdftotext` (column + full-width extraction, letter-paired, markup-aware). Must read 0 punctuation diffs. **Text-layer PDFs only.** |
| `audit-passages.py <testDir> <pdf> [--math]` | difflib word-diff of passage/stem vs `pdftotext`. **Text-layer PDFs only.** |
| `fix-content.py <testDir> <pdf> [--apply]` | Auto-fix choices when ≥3/4 match a PDF group exactly; restore prose italics from `pdftohtml -xml` (strict filter). **Text-layer PDFs only.** |
| `audit-db.py <slug> <pdf...>` | Diff the **live prod DB** for a test slug against its PDF(s). Works for any test; reads `SUPABASE_DB_PASSWORD` from repo-root `.env`. |

**Scanned/image PDFs (e.g. the DSAT exports) have no text layer** — the `pdftotext`
tools yield nothing, so they require a **vision-QA pass** (render every page with
`pdftoppm`, read it, compare to the DB). See the pipeline doc.

These are dev/ops tools, run manually from the repo root with `python3` /
`node`. Not part of the app build.
