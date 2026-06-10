-- =============================================================================
-- Migration: 0152_fix_june2026_content.sql
-- Description: Content QC fixes for the seeded test `dsat-june-2026-asia`
--   (Test #2). The OCR→seed pipeline left several defects, surfaced by the new
--   `viewer/scripts/check-test-content.mjs` checker and verified by review:
--
--     • placeholder word "blank" sitting next to the `______` gap (the gap IS
--       the blank) — M1 Q16, Q19, Q20; M2 Q1, Q2, Q19.
--     • a mid-sentence gap whose choices wrongly carried a trailing period
--       ("faces." etc.) — M1 Q16 (and one stray period on a single choice,
--       M1 Q18).
--     • the word "seafloor" duplicated BEFORE the gap while every choice also
--       leads with "seafloor" — M1 Q19.
--     • a stray "[a]" footnote artifact + an unclosed quote on a truncated
--       passage — M1 Q16.
--     • one choice missing its terminal period in an all-full-sentence set —
--       M2 Q10.
--
--   Fixes are TARGETED (regex/jsonb on the specific defect), never a full-text
--   re-type, so we can't silently corrupt the rest of a passage. Each statement
--   is scoped by (slug, module position, question number) — robust to id drift.
--
--   ⚠️ KNOWN-INCOMPLETE: M1 Q16's passage was TRUNCATED in the source seed
--   (it ended mid-quote at "…give a baby [a]"). We strip the artifact and close
--   the quote, but the passage may still be missing its tail — verify Q16
--   against the original PDF.
--
--   Forward-only; idempotent in effect (re-running the regexes on already-fixed
--   text is a no-op). All other tests' checker flags were verified FALSE
--   POSITIVES (periods inside closing quotes; `__` two-underscore gaps), so no
--   other test is touched.
-- =============================================================================

-- helper: resolve a question id within this test by (module position, number)
-- (inlined per-statement below as a subselect)

-- M1 Q16 — remove "blank", strip the "[a]" artifact + close the quote, and
--          strip the spurious trailing period from every choice.
UPDATE public.test_questions tq SET
  passage = regexp_replace(
              regexp_replace(passage, '(_+)\s+blank\M', '\1', 'gi'),
              '\s*\[a\]\s*$', '."', ''),
  choices = (SELECT jsonb_object_agg(k, regexp_replace(v, '\.\s*$', '')) FROM jsonb_each_text(tq.choices) AS e(k, v))
WHERE tq.id = (SELECT q.id FROM public.tests t JOIN public.test_modules m ON m.test_id=t.id JOIN public.test_questions q ON q.module_id=m.id
               WHERE t.slug='dsat-june-2026-asia' AND m.position=1 AND q.number=16);

-- M1 Q18 — mid-sentence gap; strip the lone trailing period off the choices.
UPDATE public.test_questions tq SET
  choices = (SELECT jsonb_object_agg(k, regexp_replace(v, '\.\s*$', '')) FROM jsonb_each_text(tq.choices) AS e(k, v))
WHERE tq.id = (SELECT q.id FROM public.tests t JOIN public.test_modules m ON m.test_id=t.id JOIN public.test_questions q ON q.module_id=m.id
               WHERE t.slug='dsat-june-2026-asia' AND m.position=1 AND q.number=18);

-- M1 Q19 — remove the duplicated "seafloor" before the gap AND the "blank"
--          word, so gap+choice reads "…along the seafloor: the handfish's…".
UPDATE public.test_questions SET
  passage = regexp_replace(passage, 'seafloor\s+(_+)\s+blank\M', '\1', 'gi')
WHERE id = (SELECT q.id FROM public.tests t JOIN public.test_modules m ON m.test_id=t.id JOIN public.test_questions q ON q.module_id=m.id
            WHERE t.slug='dsat-june-2026-asia' AND m.position=1 AND q.number=19);

-- M1 Q20 / M2 Q1 / M2 Q2 / M2 Q19 — remove the "blank" word next to the gap.
UPDATE public.test_questions SET
  passage = regexp_replace(passage, '(_+)\s+blank\M', '\1', 'gi')
WHERE id IN (
  SELECT q.id FROM public.tests t JOIN public.test_modules m ON m.test_id=t.id JOIN public.test_questions q ON q.module_id=m.id
   WHERE t.slug='dsat-june-2026-asia'
     AND ((m.position=1 AND q.number=20) OR (m.position=2 AND q.number IN (1,2,19)))
);

-- M2 Q10 — full-sentence choices; the outlier (D) was missing its terminal
--          period. Add it only if absent.
UPDATE public.test_questions SET
  choices = jsonb_set(choices, '{D}', to_jsonb((choices->>'D') || '.'))
WHERE id = (SELECT q.id FROM public.tests t JOIN public.test_modules m ON m.test_id=t.id JOIN public.test_questions q ON q.module_id=m.id
            WHERE t.slug='dsat-june-2026-asia' AND m.position=2 AND q.number=10)
  AND (choices->>'D') !~ '\.\s*$';

-- M1 Q12 — quotation-completion item; choice A had lost its OPENING " (the other
--          three choices + the format require it). Restore it if absent.
UPDATE public.test_questions SET
  choices = jsonb_set(choices, '{A}', to_jsonb('"' || (choices->>'A')))
WHERE id = (SELECT q.id FROM public.tests t JOIN public.test_modules m ON m.test_id=t.id JOIN public.test_questions q ON q.module_id=m.id
            WHERE t.slug='dsat-june-2026-asia' AND m.position=1 AND q.number=12)
  AND left(choices->>'A', 1) <> '"';
