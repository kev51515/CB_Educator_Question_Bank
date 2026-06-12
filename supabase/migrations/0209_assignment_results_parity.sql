-- =============================================================================
-- Migration: 0209_assignment_results_parity.sql
-- Description: Phase 1 of bringing ASSIGNMENTS (kind qbank_set / mocktest) to
--   parity with full TESTS for cohort monitoring + results release. Full tests
--   have test_roster_status / release_test_results[_for_teacher] and a
--   results_released_at gate (test_runs); assignments had none. This migration
--   lays the DB foundation; the educator Overview/Monitor UI and the student
--   release-gate ship in later phases.
--
-- Additive + behavior-preserving:
--   • assignment_attempts.results_released_at  — per-attempt release stamp
--     (mirrors test_runs.results_released_at). Backfilled to submitted_at for
--     every existing submitted attempt so nothing currently visible is hidden.
--   • assignments.withhold_results boolean DEFAULT false — when false (the
--     default, = today's behavior) a student sees their result immediately; when
--     true the student gate (Phase 3) requires results_released_at to be set.
--     This migration only adds the flag; no surface reads it yet.
--   • assignment_roster_status(assignment_id) — per-enrolled-student cohort row
--     (mirrors test_roster_status): best submitted attempt's effective score,
--     submitted_at, results_released_at, plus has_in_progress / started_at for
--     the live Monitor. Course-scoped (teacher of the assignment's course OR
--     admin).
--   • release_assignment_results(attempt_id, released)            — per-attempt
--   • release_assignment_results_for_teacher(assignment_id, released) — bulk
--     Both course-scoped (mirror 0090's EXISTS scope pattern) + audited.
--
-- All functions STABLE/VOLATILE as appropriate, SECURITY DEFINER, SET
--   search_path = public, auth. Stable error codes: not_authenticated /
--   not_authorized / not_found. GRANT EXECUTE TO authenticated.
--
-- Forward-only. Idempotent.
-- =============================================================================

-- 1) Columns -------------------------------------------------------------------
ALTER TABLE public.assignment_attempts
  ADD COLUMN IF NOT EXISTS results_released_at timestamptz;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS withhold_results boolean NOT NULL DEFAULT false;

-- Backfill: keep every already-submitted attempt visible (results were always
-- visible pre-0209). Only stamps rows that haven't been stamped yet.
UPDATE public.assignment_attempts
   SET results_released_at = COALESCE(submitted_at, created_at)
 WHERE submitted_at IS NOT NULL
   AND results_released_at IS NULL;

-- 2) assignment_roster_status --------------------------------------------------
-- One row per student enrolled in the assignment's course. Mirrors
-- test_roster_status: a NULL attempt_id ⇒ not started.
DROP FUNCTION IF EXISTS public.assignment_roster_status(uuid);
CREATE FUNCTION public.assignment_roster_status(p_assignment_id uuid)
RETURNS TABLE (
  student_id          uuid,
  student_name        text,
  attempt_id          uuid,
  effective_score     numeric,
  submitted_at        timestamptz,
  results_released_at timestamptz,
  has_in_progress     boolean,
  started_at          timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_course uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT course_id INTO v_course FROM public.assignments WHERE id = p_assignment_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.is_teacher_of_course(v_uid, v_course) OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  WITH roster AS (
    SELECT cm.student_id AS sid, p.display_name AS sname
      FROM public.course_memberships cm
      JOIN public.profiles p ON p.id = cm.student_id
     WHERE cm.course_id = v_course
  ),
  best AS (
    SELECT DISTINCT ON (att.student_id)
           att.student_id,
           att.id AS attempt_id,
           COALESCE(att.score_override, att.score_percent) AS eff,
           att.submitted_at,
           att.results_released_at
      FROM public.assignment_attempts att
     WHERE att.assignment_id = p_assignment_id
       AND att.submitted_at IS NOT NULL
     ORDER BY att.student_id,
              COALESCE(att.score_override, att.score_percent) DESC NULLS LAST,
              att.submitted_at DESC
  ),
  inprog AS (
    SELECT att.student_id, min(att.started_at) AS started_at
      FROM public.assignment_attempts att
     WHERE att.assignment_id = p_assignment_id
       AND att.submitted_at IS NULL
     GROUP BY att.student_id
  )
  SELECT r.sid, r.sname,
         b.attempt_id, b.eff, b.submitted_at, b.results_released_at,
         (ip.student_id IS NOT NULL) AS has_in_progress,
         ip.started_at
    FROM roster r
    LEFT JOIN best   b  ON b.student_id  = r.sid
    LEFT JOIN inprog ip ON ip.student_id = r.sid
   ORDER BY r.sname NULLS LAST;
END;
$$;
GRANT EXECUTE ON FUNCTION public.assignment_roster_status(uuid) TO authenticated;

-- 3) release_assignment_results (per-attempt) ---------------------------------
DROP FUNCTION IF EXISTS public.release_assignment_results(uuid, boolean);
CREATE FUNCTION public.release_assignment_results(
  p_attempt_id uuid,
  p_released   boolean DEFAULT true
)
RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_course uuid;
  v_when   timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT a.course_id INTO v_course
    FROM public.assignment_attempts att
    JOIN public.assignments a ON a.id = att.assignment_id
   WHERE att.id = p_attempt_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.is_teacher_of_course(v_uid, v_course) OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.assignment_attempts
     SET results_released_at = CASE WHEN p_released THEN now() ELSE NULL END
   WHERE id = p_attempt_id
  RETURNING results_released_at INTO v_when;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid,
          CASE WHEN p_released THEN 'assignment_result.release' ELSE 'assignment_result.unrelease' END,
          'assignment_attempt', p_attempt_id::text,
          jsonb_build_object('course_id', v_course));

  RETURN v_when;
END;
$$;
GRANT EXECUTE ON FUNCTION public.release_assignment_results(uuid, boolean) TO authenticated;

-- 4) release_assignment_results_for_teacher (bulk) ----------------------------
DROP FUNCTION IF EXISTS public.release_assignment_results_for_teacher(uuid, boolean);
CREATE FUNCTION public.release_assignment_results_for_teacher(
  p_assignment_id uuid,
  p_released      boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_course uuid;
  v_count  integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT course_id INTO v_course FROM public.assignments WHERE id = p_assignment_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.is_teacher_of_course(v_uid, v_course) OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.assignment_attempts
     SET results_released_at = CASE WHEN p_released THEN now() ELSE NULL END
   WHERE assignment_id = p_assignment_id
     AND submitted_at IS NOT NULL
     AND (results_released_at IS NULL) = p_released;  -- only flip rows that need it
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid,
          CASE WHEN p_released THEN 'assignment_result.release_bulk' ELSE 'assignment_result.unrelease_bulk' END,
          'assignment', p_assignment_id::text,
          jsonb_build_object('course_id', v_course, 'count', v_count));

  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.release_assignment_results_for_teacher(uuid, boolean) TO authenticated;

-- END OF MIGRATION 0209_assignment_results_parity.sql
