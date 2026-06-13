-- 0234_module_item_surveys.sql
-- Student responses to a "survey" module item (a single-question poll).
--
-- The survey question itself already lives on the module item — no schema
-- change there: module_items.config jsonb carries
--   { prompt, kind: 'scale'|'choice'|'text', options?: string[] }
-- This migration only adds the place to store the answers + the two RPCs that
-- gate access:
--
--   1. Widen module_items_item_type_check to allow item_type = 'survey'
--      (drop + recreate, preserving every existing value).
--   2. module_item_survey_responses — one row per (item, student); answer is
--      free-form jsonb so 'scale'/'choice'/'text' kinds all fit. SELECT is
--      own-rows-only; writes/teacher-reads go through the DEFINER RPCs below.
--   3. submit_survey_response(p_item_id, p_answer) — student upsert; enrollment
--      checked so a student can only answer surveys in a course they're in.
--   4. get_survey_results(p_item_id) — teacher/admin read of all responses for
--      one survey item (DEFINER bypasses the own-rows SELECT policy).
--
-- House rules followed: every SECURITY DEFINER fn SETs search_path = public,
-- auth; stable string error codes via RAISE EXCEPTION; GRANT EXECUTE TO
-- authenticated.

-- ---------------------------------------------------------------------------
-- 1. Widen item_type CHECK to add 'survey'
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
      'survey'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Responses table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.module_item_survey_responses (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid        NOT NULL REFERENCES public.module_items(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id)     ON DELETE CASCADE,
  answer     jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, user_id)
);

ALTER TABLE public.module_item_survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "survey_responses: own rows" ON public.module_item_survey_responses;
CREATE POLICY "survey_responses: own rows"
  ON public.module_item_survey_responses FOR SELECT
  USING (user_id = (SELECT auth.uid()));
-- Writes go through submit_survey_response (SECURITY DEFINER) so the enrollment
-- check lives in one place; no direct write policies needed. Teachers read via
-- get_survey_results (DEFINER bypasses the own-rows SELECT policy).

-- ---------------------------------------------------------------------------
-- 3. submit_survey_response — student upsert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_survey_response(
  p_item_id uuid,
  p_answer  jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_course uuid;
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

  INSERT INTO public.module_item_survey_responses (item_id, user_id, answer)
  VALUES (p_item_id, v_uid, p_answer)
  ON CONFLICT (item_id, user_id)
  DO UPDATE SET answer = EXCLUDED.answer, created_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_survey_response(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. get_survey_results — teacher/admin read of all responses
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_survey_results(p_item_id uuid)
RETURNS TABLE (
  answer     jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_course uuid;
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

  IF NOT (public.is_teacher_of_course(v_uid, v_course) OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT r.answer, r.created_at
  FROM public.module_item_survey_responses r
  WHERE r.item_id = p_item_id
  ORDER BY r.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_survey_results(uuid) TO authenticated;
