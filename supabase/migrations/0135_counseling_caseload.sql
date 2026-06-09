-- =============================================================================
-- Migration: 0135_counseling_caseload.sql
-- Description: counseling_caseload(course) — one course-level roll-up across the
-- whole caseload for the Counseling "Caseload" dashboard tab. Aggregates each
-- enrolled student's college-application + task + meeting state plus
-- course-wide totals, in a single SECURITY DEFINER round-trip.
--
-- Auth: teacher of the course (is_teacher_of_course, incl. shared co-teachers
-- from 0130) OR admin. Stable string error codes per the project convention.
--
-- Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.counseling_caseload(p_course_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_result jsonb;
  -- statuses that count as "applied" (submitted or beyond)
  v_done text[] := ARRAY['submitted','accepted','rejected','waitlisted','deferred','enrolled'];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.is_teacher_of_course(v_caller, p_course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  WITH students AS (
    SELECT p.id, p.display_name, p.email
    FROM public.course_memberships cm
    JOIN public.profiles p ON p.id = cm.student_id
    WHERE cm.course_id = p_course_id
  ),
  apps AS (
    SELECT
      student_id,
      count(*) AS total,
      count(*) FILTER (WHERE status = ANY (v_done)) AS submitted,
      count(*) FILTER (WHERE status IN ('accepted','enrolled')) AS accepted,
      min(deadline) FILTER (
        WHERE deadline >= current_date AND NOT (status = ANY (v_done))
      ) AS next_deadline
    FROM public.college_applications
    WHERE course_id = p_course_id
    GROUP BY student_id
  ),
  tasks AS (
    SELECT
      student_id,
      count(*) FILTER (WHERE status = 'open') AS open,
      count(*) FILTER (WHERE status = 'open' AND due_date < current_date) AS overdue
    FROM public.counseling_tasks
    WHERE course_id = p_course_id
    GROUP BY student_id
  ),
  meets AS (
    SELECT student_id, max(met_on) AS last_meeting
    FROM public.counseling_meetings
    WHERE course_id = p_course_id
    GROUP BY student_id
  ),
  rows AS (
    SELECT
      s.id,
      s.display_name,
      s.email,
      COALESCE(a.total, 0)     AS applications_total,
      COALESCE(a.submitted, 0) AS applications_submitted,
      COALESCE(a.accepted, 0)  AS applications_accepted,
      a.next_deadline,
      COALESCE(t.open, 0)      AS tasks_open,
      COALESCE(t.overdue, 0)   AS tasks_overdue,
      m.last_meeting
    FROM students s
    LEFT JOIN apps  a ON a.student_id = s.id
    LEFT JOIN tasks t ON t.student_id = s.id
    LEFT JOIN meets m ON m.student_id = s.id
  ),
  all_apps  AS (SELECT * FROM public.college_applications WHERE course_id = p_course_id),
  all_tasks AS (SELECT * FROM public.counseling_tasks     WHERE course_id = p_course_id)
  SELECT jsonb_build_object(
    'students', COALESCE(
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.display_name NULLS LAST) FROM rows r),
      '[]'::jsonb
    ),
    'totals', jsonb_build_object(
      'students',     (SELECT count(*) FROM students),
      'applications', (SELECT count(*) FROM all_apps),
      'by_status',    (SELECT jsonb_object_agg(status, c)
                         FROM (SELECT status, count(*) c FROM all_apps GROUP BY status) z),
      'by_plan',      (SELECT jsonb_object_agg(plan, c)
                         FROM (SELECT plan, count(*) c FROM all_apps WHERE plan IS NOT NULL GROUP BY plan) z),
      'upcoming_deadlines_14d', (SELECT count(*) FROM all_apps
                                  WHERE deadline >= current_date
                                    AND deadline < current_date + 14),
      'tasks_open',    (SELECT count(*) FROM all_tasks WHERE status = 'open'),
      'tasks_overdue', (SELECT count(*) FROM all_tasks
                          WHERE status = 'open' AND due_date < current_date)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.counseling_caseload(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counseling_caseload(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0135_counseling_caseload.sql
-- =============================================================================
