-- =============================================================================
-- Migration: 0137_application_documents.sql
-- Description: Per-application document checklist ("missing documents" tracking)
-- + surface a docs_missing count in the caseload roll-up.
--
-- Each college_applications row gets a `documents` jsonb checklist:
--   [{ "label": "Transcript", "done": false }, { "label": "Rec letter", "done": true }, ...]
-- The column inherits the row's existing RLS, so no new policy. counseling_caseload
-- is re-created (verbatim from 0135) with per-student + total docs_missing added.
--
-- Forward-only.
-- =============================================================================

ALTER TABLE public.college_applications
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb;

-- helper expr (inline below): count of not-done docs in a documents jsonb
-- = (SELECT count(*) FROM jsonb_array_elements(doc) d WHERE coalesce((d->>'done')::boolean,false)=false)

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
  app_rows AS (
    SELECT
      student_id,
      status,
      deadline,
      (SELECT count(*) FROM jsonb_array_elements(COALESCE(documents, '[]'::jsonb)) d
         WHERE COALESCE((d->>'done')::boolean, false) = false) AS missing_docs
    FROM public.college_applications
    WHERE course_id = p_course_id
  ),
  apps AS (
    SELECT
      student_id,
      count(*) AS total,
      count(*) FILTER (WHERE status = ANY (v_done)) AS submitted,
      count(*) FILTER (WHERE status IN ('accepted','enrolled')) AS accepted,
      min(deadline) FILTER (WHERE deadline >= current_date AND NOT (status = ANY (v_done))) AS next_deadline,
      COALESCE(sum(missing_docs), 0) AS docs_missing
    FROM app_rows
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
      s.id, s.display_name, s.email,
      COALESCE(a.total, 0)     AS applications_total,
      COALESCE(a.submitted, 0) AS applications_submitted,
      COALESCE(a.accepted, 0)  AS applications_accepted,
      a.next_deadline,
      COALESCE(a.docs_missing, 0) AS docs_missing,
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
                                  WHERE deadline >= current_date AND deadline < current_date + 14),
      'docs_missing', (SELECT COALESCE(sum(
                          (SELECT count(*) FROM jsonb_array_elements(COALESCE(documents,'[]'::jsonb)) d
                             WHERE COALESCE((d->>'done')::boolean, false) = false)
                        ), 0) FROM all_apps),
      'tasks_open',    (SELECT count(*) FROM all_tasks WHERE status = 'open'),
      'tasks_overdue', (SELECT count(*) FROM all_tasks WHERE status = 'open' AND due_date < current_date)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.counseling_caseload(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counseling_caseload(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0137_application_documents.sql
-- =============================================================================
