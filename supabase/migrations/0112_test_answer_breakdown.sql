-- =============================================================================
-- Migration: 0112_test_answer_breakdown.sql
-- Description: Staff-gated, per-course answer breakdown for full-test REVIEW.
--
-- The new teacher "Review" surface (answer key + class results) needs to show,
-- per question, which option each student in a chosen class picked. Student
-- responses live in test_run_answers, but its RLS is owner-read only — a
-- teacher cannot SELECT them directly. These two SECURITY DEFINER RPCs expose
-- exactly what review needs, gated to staff (+ teacher-of-course / admin):
--
--   list_test_review_courses(slug)        — the classes the caller can review
--     for this test (courses they teach whose Modules link to /test/<slug>),
--     each with a count of students who have a submitted run. Admins: all.
--
--   get_test_answer_breakdown(slug,course) — one row per (question, student)
--     for the LATEST submitted run of each student enrolled in that course:
--     chosen, is_correct, student id + name. The client aggregates into the
--     per-option counts/names shown in the review sidebar. No answer key is
--     returned here (the client already reads it via the staff test SELECT).
--
-- Mirrors the assigned-roster logic of 0078_test_roster_status. Forward-only.
-- =============================================================================

-- 1. Classes the caller can review for this test ------------------------------
CREATE OR REPLACE FUNCTION public.list_test_review_courses(p_slug text)
RETURNS TABLE (
  course_id uuid,
  title     text,
  taken     integer
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
  WITH assigned_courses AS (
    SELECT DISTINCT c.id, c.name
      FROM public.module_items mi
      JOIN public.course_modules cmod ON cmod.id = mi.module_id
      JOIN public.courses c ON c.id = cmod.course_id
     WHERE mi.item_type = 'link'
       AND mi.url ILIKE '%/test/' || p_slug || '%'
       AND (v_admin OR c.teacher_id = v_uid)
  )
  SELECT ac.id,
         ac.name,
         (SELECT count(DISTINCT r.user_id)::int
            FROM public.course_memberships cm
            JOIN public.test_runs r ON r.user_id = cm.student_id
           WHERE cm.course_id = ac.id
             AND r.test_id = v_test_id
             AND r.status = 'submitted') AS taken
    FROM assigned_courses ac
   ORDER BY taken DESC, ac.name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_test_review_courses(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_test_review_courses(text) TO authenticated;

-- 2. Per-(question,student) answers for one class ----------------------------
CREATE OR REPLACE FUNCTION public.get_test_answer_breakdown(
  p_slug text,
  p_course_id uuid
)
RETURNS TABLE (
  question_id  uuid,
  chosen       text,
  is_correct   boolean,
  student_id   uuid,
  student_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_test_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  -- Admins see any class; teachers only classes they own.
  IF NOT (public.is_admin(v_uid) OR public.is_teacher_of_course(v_uid, p_course_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;

  RETURN QUERY
  WITH latest_run AS (
    -- One run per student: their most recent submitted attempt for this test.
    SELECT DISTINCT ON (r.user_id) r.id AS run_id, r.user_id
      FROM public.test_runs r
      JOIN public.course_memberships cm
        ON cm.student_id = r.user_id AND cm.course_id = p_course_id
     WHERE r.test_id = v_test_id
       AND r.status = 'submitted'
     ORDER BY r.user_id, r.submitted_at DESC NULLS LAST
  )
  SELECT a.question_id,
         a.chosen,
         a.is_correct,
         lr.user_id,
         p.display_name
    FROM latest_run lr
    JOIN public.test_run_answers a ON a.run_id = lr.run_id
    JOIN public.profiles p ON p.id = lr.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_test_answer_breakdown(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_answer_breakdown(text, uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0112_test_answer_breakdown.sql
-- =============================================================================
