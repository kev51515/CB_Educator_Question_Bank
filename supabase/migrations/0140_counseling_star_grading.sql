-- =============================================================================
-- Migration: 0140_counseling_star_grading.sql
-- Description: A star-based grading model for counseling deliverables. Counseling
-- is graded on BOTH timeliness AND quality:
--
--   * Submitting ON TIME earns a guaranteed baseline of `on_time_stars`
--     (default 3 of 5). A LATE submission earns `late_stars` (default 1).
--     This "punctuality" component is computed automatically at the FIRST
--     submission and LOCKED — a later resubmission can't un-late you.
--   * The counselor then awards 0..`quality_max_stars` (default 2) QUALITY
--     stars. Final stars = LEAST(punctuality + quality, max_stars).
--   * Resubmissions/makeups (if the educator allows them) let the QUALITY
--     score improve on re-grade; punctuality stays locked.
--
-- Every knob lives in a per-course `counseling_grading_settings` row so the
-- EDUCATOR decides whether grading is on, the star split, and whether/how many
-- resubmissions are allowed. Sensible defaults are baked in (and used when no
-- settings row exists yet) so grading works out of the box for the demo.
--
-- Two SECURITY DEFINER RPCs carry the logic the client can't be trusted with:
--   submit_counseling_task(task)        -- student (or counselor) submits
--   grade_counseling_task(task, q, fb)  -- counselor awards quality + feedback
-- Students never write the grading columns directly (no student UPDATE policy on
-- counseling_tasks); they go through submit_counseling_task. The grade RPC
-- notifies the student (kind 'counseling_grade'), mirroring 0059/0136.
--
-- Forward-only. No CHECK on notifications.kind (free-form text, see 0059).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Per-course grading settings (educator-controlled; students read)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.counseling_grading_settings (
  course_id          uuid PRIMARY KEY REFERENCES public.courses(id) ON DELETE CASCADE,
  enabled            boolean NOT NULL DEFAULT true,
  max_stars          integer NOT NULL DEFAULT 5,
  on_time_stars      integer NOT NULL DEFAULT 3,
  late_stars         integer NOT NULL DEFAULT 1,
  quality_max_stars  integer NOT NULL DEFAULT 2,
  allow_resubmission boolean NOT NULL DEFAULT true,
  max_resubmissions  integer NOT NULL DEFAULT 2,   -- ignored unless allow_resubmission
  updated_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cgs_stars_sane CHECK (
    max_stars BETWEEN 1 AND 10
    AND on_time_stars     BETWEEN 0 AND max_stars
    AND late_stars        BETWEEN 0 AND max_stars
    AND quality_max_stars BETWEEN 0 AND max_stars
    AND max_resubmissions BETWEEN 0 AND 20
  )
);
ALTER TABLE public.counseling_grading_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cgs: counselor manages" ON public.counseling_grading_settings;
CREATE POLICY "cgs: counselor manages" ON public.counseling_grading_settings
  FOR ALL
  USING (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())));

-- Students read the scheme so the UI can show "on-time = 3 stars" + whether
-- resubmission is allowed.
DROP POLICY IF EXISTS "cgs: student reads" ON public.counseling_grading_settings;
CREATE POLICY "cgs: student reads" ON public.counseling_grading_settings
  FOR SELECT USING (public.is_student_in_class((SELECT auth.uid()), course_id));

DROP TRIGGER IF EXISTS trg_cgs_updated_at ON public.counseling_grading_settings;
CREATE TRIGGER trg_cgs_updated_at BEFORE UPDATE ON public.counseling_grading_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Grading columns on counseling_tasks (the deliverable IS the task)
-- -----------------------------------------------------------------------------
-- A gradable task lifecycle (derived from columns, status stays open|done):
--   not submitted   : submitted_at IS NULL
--   awaiting grade  : submitted_at IS NOT NULL AND graded_at IS NULL
--   graded          : graded_at IS NOT NULL  (status set to 'done')
-- punctuality_stars + submission_on_time are LOCKED at the first submission.
ALTER TABLE public.counseling_tasks
  ADD COLUMN IF NOT EXISTS gradable           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS submitted_at       timestamptz,
  ADD COLUMN IF NOT EXISTS submission_on_time boolean,
  ADD COLUMN IF NOT EXISTS punctuality_stars  integer,
  ADD COLUMN IF NOT EXISTS quality_stars      integer,
  ADD COLUMN IF NOT EXISTS stars              integer,
  ADD COLUMN IF NOT EXISTS feedback           text,
  ADD COLUMN IF NOT EXISTS graded_at          timestamptz,
  ADD COLUMN IF NOT EXISTS graded_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resubmission_count integer NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 3. Effective-settings helper — returns the course's row or the defaults so the
--    RPCs work even before a counselor saves settings.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.counseling_effective_grading_settings(p_course_id uuid)
  RETURNS public.counseling_grading_settings
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_row public.counseling_grading_settings;
BEGIN
  SELECT * INTO v_row FROM public.counseling_grading_settings WHERE course_id = p_course_id;
  IF NOT FOUND THEN
    v_row.course_id          := p_course_id;
    v_row.enabled            := true;
    v_row.max_stars          := 5;
    v_row.on_time_stars      := 3;
    v_row.late_stars         := 1;
    v_row.quality_max_stars  := 2;
    v_row.allow_resubmission := true;
    v_row.max_resubmissions  := 2;
  END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.counseling_effective_grading_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counseling_effective_grading_settings(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. submit_counseling_task — student (or counselor) submits a gradable task.
--    First submission computes + LOCKS punctuality. A resubmission (when allowed
--    and under the cap) keeps punctuality, clears the prior grade, and bumps the
--    resubmission counter. Returns the updated row as jsonb.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_counseling_task(p_task_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller   uuid := (SELECT auth.uid());
  v_task     public.counseling_tasks;
  v_set      public.counseling_grading_settings;
  v_on_time  boolean;
  v_punct    integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_task FROM public.counseling_tasks WHERE id = p_task_id;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'task_not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (
    v_caller = v_task.student_id
    OR public.is_teacher_of_course(v_caller, v_task.course_id)
    OR public.is_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT v_task.gradable THEN
    RAISE EXCEPTION 'task_not_gradable' USING ERRCODE = '22023';
  END IF;

  v_set := public.counseling_effective_grading_settings(v_task.course_id);

  IF v_task.submitted_at IS NOT NULL THEN
    -- This is a resubmission.
    IF NOT v_set.allow_resubmission THEN
      RAISE EXCEPTION 'resubmission_not_allowed' USING ERRCODE = '42501';
    END IF;
    IF v_task.resubmission_count >= v_set.max_resubmissions THEN
      RAISE EXCEPTION 'resubmission_limit_reached' USING ERRCODE = '42501';
    END IF;
    UPDATE public.counseling_tasks
       SET submitted_at       = now(),
           resubmission_count = resubmission_count + 1,
           -- punctuality + submission_on_time stay LOCKED from the first try
           quality_stars      = NULL,
           stars              = NULL,
           feedback           = NULL,
           graded_at          = NULL,
           graded_by          = NULL,
           status             = 'open'
     WHERE id = p_task_id
     RETURNING * INTO v_task;
  ELSE
    -- First submission: compute + lock punctuality.
    v_on_time := (v_task.due_date IS NULL OR current_date <= v_task.due_date);
    v_punct   := CASE WHEN v_on_time THEN v_set.on_time_stars ELSE v_set.late_stars END;
    UPDATE public.counseling_tasks
       SET submitted_at       = now(),
           submission_on_time = v_on_time,
           punctuality_stars  = v_punct,
           status             = 'open'
     WHERE id = p_task_id
     RETURNING * INTO v_task;
  END IF;

  RETURN to_jsonb(v_task);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_counseling_task(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_counseling_task(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. grade_counseling_task — counselor awards quality stars + feedback. Requires
--    the task be submitted first. Sets final stars = LEAST(punctuality+quality,
--    max), marks status 'done', and notifies the student. Returns jsonb row.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grade_counseling_task(
  p_task_id       uuid,
  p_quality_stars integer,
  p_feedback      text DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_task   public.counseling_tasks;
  v_set    public.counseling_grading_settings;
  v_stars  integer;
  v_short  text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_task FROM public.counseling_tasks WHERE id = p_task_id;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'task_not_found' USING ERRCODE = '02000';
  END IF;

  -- Grading is counselor/admin only — students never award their own stars.
  IF NOT (public.is_teacher_of_course(v_caller, v_task.course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_task.submitted_at IS NULL THEN
    RAISE EXCEPTION 'not_submitted' USING ERRCODE = '22023';
  END IF;

  v_set := public.counseling_effective_grading_settings(v_task.course_id);

  IF p_quality_stars IS NULL OR p_quality_stars < 0 OR p_quality_stars > v_set.quality_max_stars THEN
    RAISE EXCEPTION 'invalid_quality' USING ERRCODE = '22023';
  END IF;

  v_stars := LEAST(COALESCE(v_task.punctuality_stars, 0) + p_quality_stars, v_set.max_stars);

  UPDATE public.counseling_tasks
     SET quality_stars = p_quality_stars,
         stars         = v_stars,
         feedback      = p_feedback,
         graded_at     = now(),
         graded_by     = v_caller,
         status        = 'done'
   WHERE id = p_task_id
   RETURNING * INTO v_task;

  -- Notify the student (SECURITY DEFINER lets us write a row they own).
  SELECT short_code INTO v_short FROM public.courses WHERE id = v_task.course_id;
  INSERT INTO public.notifications (recipient_id, kind, title, body, link)
  VALUES (
    v_task.student_id,
    'counseling_grade',
    'Graded: ' || v_task.title || ' — ' || v_stars || ' of ' || v_set.max_stars || ' stars',
    p_feedback,
    '/courses/' || COALESCE(v_short, v_task.course_id::text)
  );

  RETURN to_jsonb(v_task);
END;
$$;
REVOKE ALL ON FUNCTION public.grade_counseling_task(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grade_counseling_task(uuid, integer, text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0140_counseling_star_grading.sql
-- =============================================================================
