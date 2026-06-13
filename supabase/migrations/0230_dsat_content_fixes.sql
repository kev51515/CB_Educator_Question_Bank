-- =============================================================================
-- Migration: 0230_dsat_content_fixes.sql
-- Purpose:   Content-fidelity fixes for the six DSAT full tests, found by the
--            2026-06-13 vision-QA pass (subagents read every question page of
--            the scanned source PDFs vs the live DB). These tests were seeded
--            by various pipelines and the scanned PDFs have no text layer, so
--            errors are corrected here as targeted, idempotent UPDATEs rather
--            than by rebuilding each seed migration. Already applied to prod;
--            this file keeps the repo in sync (forward-only).
--
--   ANSWER-AFFECTING:
--     * dsat-2025-oct-asia-a Q2-9 — "Impact of Four Key Industries on Oklahoma
--       Economy" table had 5 wrong cells; the Transportation contribution
--       ($2.4B vs the real $12.4B) changed the industry ranking the question
--       asks about, flipping the intended answer.
--     * dsat-2026-mar-asia-a Q2-25 — a transition question had lost its "______"
--       blank (replaced by an em-dash), making the item unanswerable.
--   The rest are non-answer-affecting OCR artifacts (passage word drops/subs,
--   a stray period, a duplicated word in a distractor) + one restored underline.
--   See docs/TEST_SEEDING_PIPELINE.md for the QC process that now guards this.
--
--   All UPDATEs are scoped by (slug, ref) and use replace()/regexp_replace, so
--   re-running is a no-op once applied.
-- =============================================================================

-- 1) dsat-2025-oct-asia-a Q2-9 table: 5 wrong cells (ANSWER-AFFECTING)
UPDATE public.test_questions tq SET passage = replace(replace(replace(replace(replace(
  passage,'$6,797,700,000','$6,797,300,000'),'$7,312,100,000','$7,312,400,000'),
  '71,674','51,674'),'$2,414,600,000','$12,414,600,000'),'32,891','52,891')
FROM public.test_modules tm, public.tests t
WHERE tq.module_id=tm.id AND tm.test_id=t.id AND t.slug='dsat-2025-oct-asia-a' AND tq.ref='2-9';

-- 2) dsat-2026-mar-asia-a Q2-25: restore dropped transition blank (STRUCTURAL)
UPDATE public.test_questions tq SET passage = regexp_replace(passage,'forest\s*[—–-]\s*one sees','forest. ______ one sees')
FROM public.test_modules tm, public.tests t
WHERE tq.module_id=tm.id AND tm.test_id=t.id AND t.slug='dsat-2026-mar-asia-a' AND tq.ref='2-25';

-- 3) dsat-2026-mar-asia-a Q2-15: remove stray period after the blank
UPDATE public.test_questions tq SET passage = replace(passage,'______. six','______ six')
FROM public.test_modules tm, public.tests t
WHERE tq.module_id=tm.id AND tm.test_id=t.id AND t.slug='dsat-2026-mar-asia-a' AND tq.ref='2-15';

-- 4) dsat-2025-jun-us-c Q2-10: missing space in proper name
UPDATE public.test_questions tq SET passage = replace(passage,'Culturay Artes','Cultura y Artes')
FROM public.test_modules tm, public.tests t
WHERE tq.module_id=tm.id AND tm.test_id=t.id AND t.slug='dsat-2025-jun-us-c' AND tq.ref='2-10';

-- 5) dsat-2025-jun-us-c Q1-25: possessive apostrophe in a notes bullet
UPDATE public.test_questions tq SET passage = replace(passage,'skeptics, takes','skeptics'' takes')
FROM public.test_modules tm, public.tests t
WHERE tq.module_id=tm.id AND tm.test_id=t.id AND t.slug='dsat-2025-jun-us-c' AND tq.ref='1-25';

-- 6) dsat-june-2026-asia Q1-9: remove OCR bleed splice from another passage
UPDATE public.test_questions tq SET passage = regexp_replace(passage,'tasks, often to their closest friend\s*[—–-]\s*and the individual tasks','tasks and complete the individual tasks')
FROM public.test_modules tm, public.tests t
WHERE tq.module_id=tm.id AND tm.test_id=t.id AND t.slug='dsat-june-2026-asia' AND tq.ref='1-9';

-- 7) dsat-june-2026-asia Q1-13: spurious "free" + "claiming"->"planning"
UPDATE public.test_questions tq SET passage = replace(replace(passage,'well-enforced free speed limits','well-enforced speed limits'),'is claiming a new streetcar stop','is planning a new streetcar stop')
FROM public.test_modules tm, public.tests t
WHERE tq.module_id=tm.id AND tm.test_id=t.id AND t.slug='dsat-june-2026-asia' AND tq.ref='1-13';

-- 8) dsat-june-2026-asia Q2-4: "well" -> "wells"
UPDATE public.test_questions tq SET passage = replace(passage,'found in well past','found in wells past')
FROM public.test_modules tm, public.tests t
WHERE tq.module_id=tm.id AND tm.test_id=t.id AND t.slug='dsat-june-2026-asia' AND tq.ref='2-4';

-- 9) dsat-june-2026-asia Q1-27 choice A: duplicated "Khumalo" (distractor)
UPDATE public.test_questions tq SET choices = jsonb_set(choices,'{A}',to_jsonb(replace(choices->>'A','album Nandi Khumalo features','album Nandi features')))
FROM public.test_modules tm, public.tests t
WHERE tq.module_id=tm.id AND tm.test_id=t.id AND t.slug='dsat-june-2026-asia' AND tq.ref='1-27';

-- 10) dsat-nov-2023 Q3-18 stem: restore underline on the tested word
UPDATE public.test_questions tq SET stem = replace(stem,'many centimeters are','many <u>centimeters</u> are')
FROM public.test_modules tm, public.tests t
WHERE tq.module_id=tm.id AND tm.test_id=t.id AND t.slug='dsat-nov-2023' AND tq.ref='3-18';
