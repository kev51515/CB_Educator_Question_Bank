-- 0236_module_item_vocab.sql  (renumbered from 0235 — parallel session took 0235)
-- A "vocab" flashcard module item with per-student spaced repetition (Leitner).
--
-- The deck CARDS live on the module item — no schema change there:
-- module_items.config jsonb carries { cards: [{ front, back }] }. This migration
-- only adds the per-student review STATE + the scheduling RPC:
--
--   1. Widen module_items_item_type_check to allow item_type = 'vocab'
--      (drop + recreate, preserving every existing value).
--   2. vocab_review_state — one row per (student, item, card_idx) holding the
--      Leitner box (0..5) + due_at. SELECT is own-rows-only; the only writer is
--      the DEFINER RPC below, so there are no direct write policies.
--   3. record_vocab_review(p_item_id, p_card_idx, p_grade) — student grades a
--      card ('again' | 'good' | 'easy'); the box advances/resets, due_at is
--      recomputed from the Leitner schedule, and the new due_at is returned.
--
-- Leitner box -> review interval (for 'good' / 'easy' promotions):
--   box 1 -> 1 day,  box 2 -> 3 days,  box 3 -> 7 days,
--   box 4 -> 14 days, box 5 -> 30 days.
-- 'again' resets to box 0, due in 10 minutes (same-session relearn).
--
-- House rules followed: every SECURITY DEFINER fn SETs search_path = public,
-- auth; stable string error codes via RAISE EXCEPTION; GRANT EXECUTE TO
-- authenticated.

-- ---------------------------------------------------------------------------
-- 1. Widen item_type CHECK to add 'vocab'
-- ---------------------------------------------------------------------------
ALTER TABLE public.module_items
  DROP CONSTRAINT IF EXISTS module_items_item_type_check;

ALTER TABLE public.module_items
  ADD CONSTRAINT module_items_item_type_check CHECK (
    item_type IN (
      'assignment',
      'header',
      'link',
      'page',
      'file',
      'note',
      'divider',
      'video',
      'goal',
      'countdown',
      'live_session',
      'survey',
      'vocab'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Per-student review-state table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vocab_review_state (
  user_id    uuid        NOT NULL REFERENCES public.profiles(id)     ON DELETE CASCADE,
  item_id    uuid        NOT NULL REFERENCES public.module_items(id) ON DELETE CASCADE,
  card_idx   int         NOT NULL,                  -- index into config.cards
  box        int         NOT NULL DEFAULT 0,        -- Leitner box 0..5
  due_at     timestamptz NOT NULL DEFAULT now(),
  reps       int         NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id, card_idx)
);

ALTER TABLE public.vocab_review_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vocab_review_state: own rows" ON public.vocab_review_state;
CREATE POLICY "vocab_review_state: own rows"
  ON public.vocab_review_state FOR SELECT
  USING (user_id = (SELECT auth.uid()));
-- Writes go through record_vocab_review (SECURITY DEFINER) so the enrollment
-- check + scheduling live in one place; no direct write policies needed.

-- ---------------------------------------------------------------------------
-- 3. record_vocab_review — student grades a card; returns the new due_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_vocab_review(
  p_item_id  uuid,
  p_card_idx int,
  p_grade    text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_course   uuid;
  v_old_box  int;
  v_new_box  int;
  v_interval interval;
  v_due      timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT cm.course_id INTO v_course
  FROM public.module_items mi
  JOIN public.course_modules cm ON cm.id = mi.module_id
  WHERE mi.id = p_item_id;

  IF v_course IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF NOT public.is_student_in_course(v_uid, v_course) THEN
    RAISE EXCEPTION 'not_enrolled';
  END IF;

  SELECT box INTO v_old_box
  FROM public.vocab_review_state
  WHERE user_id = v_uid AND item_id = p_item_id AND card_idx = p_card_idx;
  v_old_box := COALESCE(v_old_box, 0);

  IF p_grade = 'again' THEN
    v_new_box := 0;
    v_due     := now() + interval '10 minutes';
  ELSIF p_grade IN ('good', 'easy') THEN
    IF p_grade = 'good' THEN
      v_new_box := LEAST(v_old_box + 1, 5);
    ELSE
      v_new_box := LEAST(v_old_box + 2, 5);
    END IF;
    v_interval := CASE v_new_box
      WHEN 1 THEN interval '1 day'
      WHEN 2 THEN interval '3 days'
      WHEN 3 THEN interval '7 days'
      WHEN 4 THEN interval '14 days'
      WHEN 5 THEN interval '30 days'
      ELSE        interval '1 day'   -- box 0 from a good/easy shouldn't happen
    END;
    v_due := now() + v_interval;
  ELSE
    RAISE EXCEPTION 'invalid_grade';
  END IF;

  INSERT INTO public.vocab_review_state
    (user_id, item_id, card_idx, box, due_at, reps, updated_at)
  VALUES
    (v_uid, p_item_id, p_card_idx, v_new_box, v_due,
     COALESCE(
       (SELECT reps FROM public.vocab_review_state
         WHERE user_id = v_uid AND item_id = p_item_id AND card_idx = p_card_idx),
       0) + 1,
     now())
  ON CONFLICT (user_id, item_id, card_idx)
  DO UPDATE SET
    box        = EXCLUDED.box,
    due_at     = EXCLUDED.due_at,
    reps       = public.vocab_review_state.reps + 1,
    updated_at = now();

  RETURN v_due;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_vocab_review(uuid, int, text) TO authenticated;
