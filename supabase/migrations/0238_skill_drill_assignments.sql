-- =============================================================================
-- Migration: 0238_skill_drill_assignments.sql
-- Purpose:   Let a Skill Drill (skill_drill module item) materialize a real,
--            HIDDEN, per-student `qbank_set` assignment so the existing
--            submit_qbank_attempt grading path (0045) and the my_skill_mastery
--            feedback loop work end-to-end — WITHOUT cluttering the teacher
--            gradebook or the student assignment list.
--
-- The hidden/drill model
-- ----------------------
--   A skill_drill module item is a self-serve, repeatable practice surface, not
--   a teacher-issued assignment. But the only graded qbank runner we have keys
--   off an `assignments` row (submit_qbank_attempt resolves the set by
--   assignment_id, and my_skill_mastery rolls up from assignment_attempts).
--   So a drill needs a backing assignment — it just must NOT behave like a
--   normal one.
--
--   Three new columns on `assignments` carry that distinction:
--     • hidden            — true => omitted from teacher/student assignment
--                            lists + gradebook + the student "pending" badge.
--     • drill_for_student — the ONE student this drill instance belongs to
--                            (drills are per-student so each student's attempts
--                            roll up to their own mastery; NULL on normal rows).
--     • drill_source_item — the skill_drill module_item that generated it.
--   A partial UNIQUE (drill_source_item, drill_for_student) guarantees exactly
--   one backing assignment per (item, student); the ensure_* RPC below is the
--   single writer and is idempotent (race-safe via unique_violation fallback).
--
--   Because these rows are `hidden = true`, every list/gradebook/badge query
--   that already filters on `archived`/`course_id` must ALSO filter
--   `AND NOT hidden`. This migration updates get_student_pending_counts (the
--   badge source, 0224); other surfaces filter client-side or in their own
--   queries.
--
-- House conventions honoured:
--   • SECURITY DEFINER fn gets `SET search_path = public, auth`.
--   • Stable RAISE error codes the client switches on
--     (not_authenticated / not_found / not_enrolled).
--   • GRANT EXECUTE TO authenticated.
--   • assignments NOT NULL columns all set: course_id, created_by, title, kind,
--     qbank_set_uid, question_count (CHECK > 0 — see GREATEST(...,1) below),
--     difficulty_mix, opens_at, archived. source_id stays NULL (loosened in
--     0045; the kind_consistency CHECK only requires qbank_set_uid for a
--     qbank_set, which we supply).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema additions on public.assignments
-- -----------------------------------------------------------------------------
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS drill_for_student uuid
    REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS drill_source_item uuid
    REFERENCES public.module_items(id) ON DELETE CASCADE;

-- One backing drill assignment per (skill_drill item, student). Partial so it
-- only constrains drill rows and never collides with normal assignments (both
-- columns NULL on those).
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_drill_item_student
  ON public.assignments (drill_source_item, drill_for_student)
  WHERE drill_source_item IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. ensure_skill_drill_assignment
--    Idempotently get-or-create the hidden per-student qbank_set assignment
--    that backs a skill_drill item, then return its id. Called by the student
--    drill runner on open.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_skill_drill_assignment(
  p_item_id        uuid,
  p_qbank_set_uid  text,
  p_label          text,
  p_question_count int,
  p_time_limit     int
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_course_id  uuid;
  v_assignment uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Resolve the skill_drill item's owning course.
  SELECT cm.course_id INTO v_course_id
  FROM public.module_items mi
  JOIN public.course_modules cm ON cm.id = mi.module_id
  WHERE mi.id = p_item_id;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF NOT public.is_student_in_course(v_uid, v_course_id) THEN
    RAISE EXCEPTION 'not_enrolled';
  END IF;

  -- Fast path: already materialized for this (item, student).
  SELECT a.id INTO v_assignment
  FROM public.assignments a
  WHERE a.drill_source_item = p_item_id
    AND a.drill_for_student = v_uid;

  IF v_assignment IS NOT NULL THEN
    RETURN v_assignment;
  END IF;

  -- Create it. question_count CHECK is (> 0 AND <= 100), so clamp into range:
  -- a drill must carry at least one question, never more than 100.
  BEGIN
    INSERT INTO public.assignments (
      course_id,
      created_by,
      title,
      kind,
      qbank_set_uid,
      qbank_set_label,
      question_count,
      time_limit_minutes,
      difficulty_mix,
      opens_at,
      archived,
      hidden,
      drill_for_student,
      drill_source_item
    ) VALUES (
      v_course_id,
      v_uid,
      COALESCE(NULLIF(p_label, ''), 'Skill Drill'),
      'qbank_set',
      p_qbank_set_uid,
      COALESCE(NULLIF(p_label, ''), 'Skill Drill'),
      LEAST(GREATEST(COALESCE(p_question_count, 1), 1), 100),
      GREATEST(COALESCE(p_time_limit, 0), 0),
      'any',
      now(),
      false,
      true,
      v_uid,
      p_item_id
    )
    RETURNING id INTO v_assignment;
  EXCEPTION
    -- Race: a concurrent open inserted the row between our SELECT and INSERT.
    -- Fall back to the existing row (matches the partial UNIQUE above).
    WHEN unique_violation THEN
      SELECT a.id INTO v_assignment
      FROM public.assignments a
      WHERE a.drill_source_item = p_item_id
        AND a.drill_for_student = v_uid;
  END;

  RETURN v_assignment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_skill_drill_assignment(uuid, text, text, int, int) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. get_student_pending_counts — exclude hidden (drill) assignments
-- -----------------------------------------------------------------------------
-- Verbatim copy of the 0224 body (identical return shape + logic), with a
-- single addition: `AND NOT a.hidden` on EACH of the three sub-selects that
-- read public.assignments a (unstarted_assignments, due_soon, and new_grades's
-- join to assignments). Hidden drill rows must never feed the student badge.
CREATE OR REPLACE FUNCTION public.get_student_pending_counts()
RETURNS TABLE (
  course_id             uuid,
  new_announcements     integer,
  new_items             integer,
  unstarted_assignments integer,
  due_soon              integer,
  new_grades            integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  enrolled AS (
    SELECT m.course_id,
           GREATEST(
             COALESCE(s.last_seen_at, '-infinity'::timestamptz),
             m.joined_at
           ) AS baseline
    FROM public.course_memberships m
    CROSS JOIN me
    LEFT JOIN public.student_course_seen s
      ON s.user_id = me.uid AND s.course_id = m.course_id
    WHERE m.student_id = me.uid
  )
  SELECT
    e.course_id,
    (SELECT count(*)::integer FROM public.course_announcements ca
      WHERE ca.course_id = e.course_id
        AND ca.published
        AND (ca.publish_at IS NULL OR ca.publish_at <= now())
        AND GREATEST(ca.created_at, COALESCE(ca.publish_at, ca.created_at)) > e.baseline
    ) AS new_announcements,
    (SELECT count(*)::integer FROM public.module_items mi
      JOIN public.course_modules cm ON cm.id = mi.module_id
      WHERE cm.course_id = e.course_id
        AND cm.published
        AND (cm.opens_at IS NULL OR cm.opens_at <= now())
        AND mi.published
        AND mi.item_type NOT IN ('assignment', 'header')
        AND mi.created_at > e.baseline
    ) AS new_items,
    (SELECT count(*)::integer FROM public.assignments a
      WHERE a.course_id = e.course_id
        AND NOT a.archived
        AND NOT a.hidden
        AND a.opens_at <= now()
        AND NOT EXISTS (
          SELECT 1 FROM public.assignment_attempts at, me
          WHERE at.assignment_id = a.id
            AND at.student_id = me.uid
            AND at.submitted_at IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.student_assignment_seen sas, me
          WHERE sas.assignment_id = a.id
            AND sas.user_id = me.uid
        )
    ) AS unstarted_assignments,
    (SELECT count(*)::integer FROM public.assignments a
      WHERE a.course_id = e.course_id
        AND NOT a.archived
        AND NOT a.hidden
        AND a.opens_at <= now()
        AND a.due_at IS NOT NULL
        AND a.due_at BETWEEN now() AND now() + interval '48 hours'
        AND NOT EXISTS (
          SELECT 1 FROM public.assignment_attempts at, me
          WHERE at.assignment_id = a.id
            AND at.student_id = me.uid
            AND at.submitted_at IS NOT NULL
        )
    ) AS due_soon,
    (SELECT count(*)::integer FROM public.assignment_attempts at
      JOIN public.assignments a ON a.id = at.assignment_id
      CROSS JOIN me
      WHERE a.course_id = e.course_id
        AND NOT a.hidden
        AND at.student_id = me.uid
        AND at.graded_at IS NOT NULL
        AND at.graded_at > e.baseline
    ) AS new_grades
  FROM enrolled e;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_pending_counts() TO authenticated;
