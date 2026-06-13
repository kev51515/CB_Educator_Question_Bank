-- 0224_student_assignment_seen.sql
-- "Open the item → its red dot clears" for assignments.
--
-- Background: the student "Courses" badge (0201, get_student_pending_counts)
-- counts unstarted assignments as pending, and that count only dropped when the
-- student SUBMITTED the work. Question Sets (kind 'qbank_set') never create an
-- assignment_attempts row until submit, so there was no way to tell that a
-- student had *opened* one — the dot nagged until completion, with no per-item
-- wayfinding to say which item it pointed at.
--
-- Product decision (owner, 2026-06-13): the red dot means "new — go look", not
-- "not done yet". Opening an assignment marks it seen and clears its dot, even
-- if the student doesn't finish. Pending WORK still surfaces via the due-date
-- "Assignments Due" card; the dot is purely a wayfinding/novelty signal.
--
-- This migration:
--   1. student_assignment_seen — per-(student, assignment) opened marker.
--   2. mark_assignment_seen(p_assignment_id) — upsert RPC the runner calls on
--      open (idempotent; enrollment-checked).
--   3. get_student_pending_counts — unstarted_assignments now also excludes
--      assignments the student has opened (seen). Same return shape.

-- ---------------------------------------------------------------------------
-- 1. Seen-state table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_assignment_seen (
  user_id       uuid        NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  assignment_id uuid        NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  opened_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, assignment_id)
);

ALTER TABLE public.student_assignment_seen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assignment_seen: own rows" ON public.student_assignment_seen;
CREATE POLICY "assignment_seen: own rows"
  ON public.student_assignment_seen FOR SELECT
  USING (user_id = (SELECT auth.uid()));
-- Writes go through mark_assignment_seen (SECURITY DEFINER) so the membership
-- check lives in one place; no direct write policies needed.

-- ---------------------------------------------------------------------------
-- 2. mark_assignment_seen
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_assignment_seen(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_course_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT a.course_id INTO v_course_id
  FROM public.assignments a
  WHERE a.id = p_assignment_id;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF NOT public.is_student_in_course(v_uid, v_course_id) THEN
    RAISE EXCEPTION 'not_enrolled';
  END IF;

  INSERT INTO public.student_assignment_seen (user_id, assignment_id, opened_at)
  VALUES (v_uid, p_assignment_id, now())
  ON CONFLICT (user_id, assignment_id)
  DO UPDATE SET opened_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_assignment_seen(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_student_pending_counts — unstarted now excludes seen assignments
-- ---------------------------------------------------------------------------
-- Identical to 0201 except the unstarted_assignments sub-select gains a
-- NOT EXISTS against student_assignment_seen so opening an assignment clears it.
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
        AND at.student_id = me.uid
        AND at.graded_at IS NOT NULL
        AND at.graded_at > e.baseline
    ) AS new_grades
  FROM enrolled e;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_pending_counts() TO authenticated;
