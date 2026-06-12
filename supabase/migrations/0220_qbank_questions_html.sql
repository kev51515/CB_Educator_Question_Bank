-- =============================================================================
-- Migration: 0220_qbank_questions_html.sql
-- Description: Make qbank set→questions resolution AUTHORITATIVE + single-source.
--   Until now a qbank_set assignment stored only `qbank_set_uid`, and the STUDENT
--   runner re-resolved that uid to a questions HTML file against the static
--   catalog at runtime (resolveQuestionsHtml). That client-side re-resolution is
--   fragile (it caused a set to load the wrong subject's file) and spreads the
--   mapping across three layers (React resolver + static catalog + uid string).
--
--   The teacher's catalog already KNOWS the exact `questionsHtml` path when the
--   assignment is created. Persist it on the row so the runner reads one stored
--   value instead of re-guessing. Deterministic + robust to any catalog/resolver
--   drift; the runner keeps the uid resolver only as a fallback for old rows.
--
--   • assignments.qbank_questions_html text — the exported file path
--     (`by-skill/<section>/<difficulty>/<slug>_questions.html`). NULL for
--     non-qbank rows and for legacy rows not yet backfilled (a one-off node
--     script populates those from catalog.json; the runner falls back to uid
--     resolution meanwhile).
--
-- Forward-only. Additive.
-- =============================================================================

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS qbank_questions_html text;

COMMENT ON COLUMN public.assignments.qbank_questions_html IS
  'Authoritative exported questions-HTML path for a qbank_set assignment '
  '(by-skill/<section>/<difficulty>/<slug>_questions.html). Set at creation '
  'from the catalog entry; the student runner reads this instead of re-resolving '
  'qbank_set_uid. NULL for non-qbank or un-backfilled legacy rows.';

-- END OF MIGRATION 0220_qbank_questions_html.sql
