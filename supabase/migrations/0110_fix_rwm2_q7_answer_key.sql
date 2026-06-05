-- 0110_fix_rwm2_q7_answer_key.sql
-- ---------------------------------------------------------------------------
-- Content fix: DSAT Nov-2023 · Reading & Writing · Module 2 · Q7 (ref "2-7")
-- was mis-keyed 'D'. The passage states the microorganism community
-- composition "was unchanged", which is what let the researchers attribute
-- the accelerated nutrient cycling to temperature — i.e. it RULES OUT a
-- compositional alternative explanation = choice C. Choice D ("activity
-- varied depending on which microorganisms comprised the community") directly
-- contradicts the passage. Caught by an independent re-solve of all 98
-- questions; the printed third-party answer key carried the same typo, so a
-- letter-vs-key match alone missed it. Verified against the College Board
-- item logic. Forward-only.
-- ---------------------------------------------------------------------------

UPDATE public.test_questions q
SET correct_answer = 'C'
FROM public.test_modules m
JOIN public.tests t ON t.id = m.test_id
WHERE q.module_id = m.id
  AND t.slug = 'dsat-nov-2023'
  AND m.position = 2
  AND q.ref = '2-7'
  AND q.number = 7
  AND q.correct_answer = 'D';

-- Self-verify: exactly one RW-M2 Q7 row for this test, now keyed 'C'.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM public.test_questions q
  JOIN public.test_modules m ON m.id = q.module_id
  JOIN public.tests t ON t.id = m.test_id
  WHERE t.slug = 'dsat-nov-2023'
    AND m.position = 2
    AND q.ref = '2-7'
    AND q.correct_answer = 'C';
  IF n <> 1 THEN
    RAISE EXCEPTION 'migration 0110: expected exactly 1 RW-M2 Q7 row keyed C, found %', n;
  END IF;
END $$;
