-- ============================================================================
-- Migration 0149 — Per-course roster attribution for the test-overview filter
-- ============================================================================
-- The teacher test-overview page (/educator/tests/:slug) showed ALL students
-- across EVERY course that links the test, with no per-course view. The feed
-- RPC `test_roster_status(p_slug)` (last defined in 0083) DEDUPED students with
-- `SELECT DISTINCT cm.student_id, p.display_name`, dropping course attribution.
--
-- This migration re-defines the RPC to also return WHICH COURSE each roster row
-- belongs to (course_id, course_name) so the UI can filter per course.
--
-- ROW CARDINALITY CHANGE: the `assigned` CTE now DISTINCTs per (student, course)
-- instead of per student. A student enrolled in two courses that both link the
-- test now appears once PER COURSE (exactly what per-course filtering needs) —
-- callers that previously assumed one row per student must adapt.
--
-- Signature change (RETURNS TABLE column list changes) means we cannot use
-- CREATE OR REPLACE; this migration DROPs then CREATEs the function. The two new
-- columns are APPENDED after has_in_progress (append-only, backward-friendly).
-- Re-runnable via DROP FUNCTION IF EXISTS.
-- ============================================================================

DROP FUNCTION IF EXISTS public.test_roster_status(text);

CREATE FUNCTION public.test_roster_status(p_slug text)
RETURNS TABLE (
  student_id          uuid,
  student_name        text,
  run_id              uuid,
  score               integer,
  total               integer,
  submitted_at        timestamptz,
  results_released_at timestamptz,
  has_in_progress     boolean,
  course_id           uuid,
  course_name         text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_test_id uuid;
  v_admin   boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_admin := public.is_admin(v_uid);
  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;
  RETURN QUERY
  WITH assigned AS (
    SELECT DISTINCT cm.student_id AS sid, p.display_name AS sname,
                    c.id AS cid, c.name AS cname
      FROM public.module_items mi
      JOIN public.course_modules cmod ON cmod.id = mi.module_id
      JOIN public.courses c ON c.id = cmod.course_id
      JOIN public.course_memberships cm ON cm.course_id = c.id
      JOIN public.profiles p ON p.id = cm.student_id
     WHERE mi.item_type = 'link'
       AND mi.url ILIKE '%/test/' || p_slug || '%'
       AND (v_admin OR c.teacher_id = v_uid)
  )
  SELECT a.sid, a.sname, lr.id, lr.score, lr.total, lr.submitted_at, lr.results_released_at,
         EXISTS (SELECT 1 FROM public.test_runs ip
                  WHERE ip.user_id = a.sid AND ip.test_id = v_test_id
                    AND ip.status = 'in_progress'),
         a.cid, a.cname
    FROM assigned a
    LEFT JOIN LATERAL (
      SELECT r.id, r.score, r.total, r.submitted_at, r.results_released_at
        FROM public.test_runs r
       WHERE r.user_id = a.sid AND r.test_id = v_test_id AND r.status = 'submitted'
       ORDER BY r.submitted_at DESC NULLS LAST
       LIMIT 1
    ) lr ON true
   ORDER BY a.cname, (lr.submitted_at IS NULL), a.sname;
END;
$$;

REVOKE ALL ON FUNCTION public.test_roster_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_roster_status(text) TO authenticated;
