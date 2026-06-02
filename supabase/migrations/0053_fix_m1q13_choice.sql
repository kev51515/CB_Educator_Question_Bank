-- =============================================================================
-- Migration: 0053_fix_m1q13_choice.sql
-- Purpose:   Content QA correction for Test #1 (dsat-nov-2023), Reading &
--            Writing Module 1 Q13 (ref 1-13) — a graph "command of evidence"
--            item. A second independent OCR pass found choice A mis-transcribed
--            the class: the source image reads "Class VII" (the legend lists
--            Class VIII / VI / VII), but the seed stored "Class VIII".
--            Does not change the correct answer (C); fixes choice-text fidelity.
--
--   Idempotent; scoped by slug + ref. Forward-only.
-- =============================================================================

UPDATE public.test_questions q
   SET choices = jsonb_set(
         q.choices,
         '{A}',
         '"difference between mean forest patch size in Class VII and in Class VI in 2000."'::jsonb)
  FROM public.test_modules m, public.tests t
 WHERE q.module_id = m.id
   AND m.test_id = t.id
   AND t.slug = 'dsat-nov-2023'
   AND q.ref = '1-13';
