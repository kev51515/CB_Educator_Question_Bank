-- =============================================================================
-- Migration: 0136_counseling_student_selfservice.sql
-- Description: Make the counseling surfaces two-sided — a student can maintain
-- their own profile, mark their own tasks done, and get notified when a
-- counselor assigns them a task. (Meeting notes stay counselor-private; college
-- list stays counselor-managed for now.)
--
-- Forward-only.
-- =============================================================================

-- 1. A student may CREATE their own counseling profile (0134 already lets them
--    SELECT + UPDATE it; without INSERT they couldn't start one before the
--    counselor did). Gated to the student themselves AND enrolment in the course.
DROP POLICY IF EXISTS "cprofiles: student inserts own" ON public.counseling_profiles;
CREATE POLICY "cprofiles: student inserts own" ON public.counseling_profiles
  FOR INSERT
  WITH CHECK (
    student_id = (SELECT auth.uid())
    AND public.is_student_in_class((SELECT auth.uid()), course_id)
  );

-- 2. complete_counseling_task — toggle a task's done status. Callable by the
--    task's OWN student (so they can check it off) or a counselor/admin. Keeps
--    students from editing the task's content (title/due set by the counselor)
--    by only ever touching status + completed_at.
CREATE OR REPLACE FUNCTION public.complete_counseling_task(
  p_task_id uuid,
  p_done    boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller  uuid := (SELECT auth.uid());
  v_student uuid;
  v_course  uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT student_id, course_id INTO v_student, v_course
  FROM public.counseling_tasks WHERE id = p_task_id;
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'task_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (
    v_caller = v_student
    OR public.is_teacher_of_course(v_caller, v_course)
    OR public.is_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.counseling_tasks
     SET status       = CASE WHEN p_done THEN 'done' ELSE 'open' END,
         completed_at = CASE WHEN p_done THEN now() ELSE NULL END
   WHERE id = p_task_id;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_counseling_task(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_counseling_task(uuid, boolean) TO authenticated;

-- 3. Notify the student when a counselor assigns them a task (kind
--    'counseling_task'). SECURITY DEFINER so the INSERT (run as the counselor)
--    can write a notification row for the student — same pattern as 0059.
CREATE OR REPLACE FUNCTION public.fanout_counseling_task_notification()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_short text;
BEGIN
  SELECT short_code INTO v_short FROM public.courses WHERE id = NEW.course_id;
  INSERT INTO public.notifications (recipient_id, kind, title, body, link)
  VALUES (
    NEW.student_id,
    'counseling_task',
    'New counseling task: ' || NEW.title,
    NEW.details,
    '/courses/' || COALESCE(v_short, NEW.course_id::text)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fanout_counseling_task ON public.counseling_tasks;
CREATE TRIGGER trg_fanout_counseling_task
  AFTER INSERT ON public.counseling_tasks
  FOR EACH ROW EXECUTE FUNCTION public.fanout_counseling_task_notification();

-- =============================================================================
-- END OF MIGRATION 0136_counseling_student_selfservice.sql
-- =============================================================================
