-- =============================================================================
-- Migration: 0052_fix_m3q16_typo.sql
-- Purpose:   Content correction for Test #1 (dsat-nov-2023), Math Module 1 Q16.
--
--   The source PDF prints the stem as "y = x² + 18 − 23", which simplifies to
--   y = x² − 5 (minimum at x = 0) — a value NOT among the answer choices
--   (A −23, B −9, C 9, D 18). The answer key marks B (−9), and the vertex of
--   y = x² + 18x − 23 is x = −18/2 = −9. So the original PDF dropped the `x`
--   coefficient; the intended (and answer-key-consistent) equation is
--   y = x² + 18x − 23. We correct the stem so the question is solvable.
--
--   Idempotent UPDATE scoped by test slug + question ref. Forward-only.
-- =============================================================================

UPDATE public.test_questions q
   SET stem = 'At what value of x does the graph of y = x² + 18x − 23 reach its minimum in the xy-plane?'
  FROM public.test_modules m, public.tests t
 WHERE q.module_id = m.id
   AND m.test_id = t.id
   AND t.slug = 'dsat-nov-2023'
   AND q.ref = '3-16';
