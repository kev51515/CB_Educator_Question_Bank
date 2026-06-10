-- =============================================================================
-- Migration: 0168_pickleball_coach_development.sql
-- Description: Coach-development DEPTH for the 'pickleball_coach' course type —
-- shadow logs + auto-completing development steps.
--
--   pickleball_shadow_logs        — one shadowing session a coach-in-development
--                                   observed (a mentor's lesson). The mentor (or
--                                   the educator) signs it off once complete.
--
--   pickleball_coach_devsteps     — EXTENDED with auto-completion config:
--     step_type        — what kind of milestone drives auto-completion
--                         ('cert' | 'hours' | 'shadow' | 'manual')
--     auto_threshold    — numeric goal (hours total, # of signed-off shadows)
--     auto_program_id   — optional program filter for the 'hours' rule
--     auto_completed    — set true when the system (not a human) closed the step
--
--   pk_recompute_devsteps(course, coach) — re-evaluates every OPEN auto step for
--     a coach and closes the ones whose threshold is met, firing a notification
--     to the coach AND the course teacher. Called by triggers on the three
--     source tables (hours log, shadow logs, certifications) so a step closes
--     itself the moment the underlying data crosses the line.
--
-- RLS / RPC conventions mirror 0162/0163:
--   * is_teacher_of_course(uid, course_id) OR is_admin(uid)  — educator full r/w
--   * coach_id = auth.uid()                                  — coach reads own
-- Person FKs reference profiles(id). RPCs are SECURITY DEFINER with a locked
-- search_path and raise stable string error codes:
--   not_authenticated / not_authorized / not_found / invalid_input.
--
-- Cross-recipient notification fan-out happens only inside the SECURITY DEFINER
-- recompute function (RLS on notifications limits ordinary callers to their own
-- recipient_id rows).
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pickleball_shadow_logs — coach observed (shadowed) a mentor's session.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_shadow_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  coach_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentor_id     uuid REFERENCES public.profiles(id),
  lesson_id     uuid REFERENCES public.pickleball_lessons(id),
  shadow_date   date NOT NULL,
  mentor_notes  text,
  signed_off    boolean NOT NULL DEFAULT false,
  signed_off_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickleball_shadow_logs_course_coach_idx
  ON public.pickleball_shadow_logs (course_id, coach_id);
ALTER TABLE public.pickleball_shadow_logs ENABLE ROW LEVEL SECURITY;

-- Educator of the course (owner / co-teacher / admin) — full read+write.
DROP POLICY IF EXISTS "pk_shadow: educator manages" ON public.pickleball_shadow_logs;
CREATE POLICY "pk_shadow: educator manages" ON public.pickleball_shadow_logs
  FOR ALL
  USING (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())));

-- The coach reads their OWN shadow logs.
DROP POLICY IF EXISTS "pk_shadow: coach reads own" ON public.pickleball_shadow_logs;
CREATE POLICY "pk_shadow: coach reads own" ON public.pickleball_shadow_logs
  FOR SELECT
  USING (coach_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- 2. Extend pickleball_coach_devsteps with auto-completion config.
-- -----------------------------------------------------------------------------
ALTER TABLE public.pickleball_coach_devsteps
  ADD COLUMN IF NOT EXISTS step_type       text,
  ADD COLUMN IF NOT EXISTS auto_threshold  numeric,
  ADD COLUMN IF NOT EXISTS auto_program_id uuid REFERENCES public.pickleball_programs(id),
  ADD COLUMN IF NOT EXISTS auto_completed  boolean DEFAULT false;

-- Guarded CHECK on step_type (only add if not already present).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pickleball_coach_devsteps_step_type_check'
  ) THEN
    ALTER TABLE public.pickleball_coach_devsteps
      ADD CONSTRAINT pickleball_coach_devsteps_step_type_check
      CHECK (step_type IS NULL OR step_type IN ('cert', 'hours', 'shadow', 'manual'));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. pk_recompute_devsteps — close auto-completing OPEN steps whose threshold is
--    met, for one (course, coach). SECURITY DEFINER so it can fan a notification
--    out to a recipient that isn't the current auth.uid(). Returns the number of
--    steps auto-completed in this pass.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_recompute_devsteps(
  p_course_id uuid,
  p_coach_id  uuid
)
  RETURNS int
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_step       public.pickleball_coach_devsteps;
  v_met        boolean;
  v_progress   numeric;
  v_count      int := 0;
  v_teacher_id uuid;
  v_coach_name text;
  v_title      text;
  v_body       text;
  v_link       text;
BEGIN
  IF p_course_id IS NULL OR p_coach_id IS NULL THEN
    RETURN 0;
  END IF;

  v_link := '/courses/' || p_course_id;

  SELECT teacher_id INTO v_teacher_id
    FROM public.courses WHERE id = p_course_id;

  FOR v_step IN
    SELECT * FROM public.pickleball_coach_devsteps
     WHERE course_id = p_course_id
       AND coach_id  = p_coach_id
       AND status    = 'open'
       AND step_type IN ('cert', 'hours', 'shadow')
       AND auto_threshold IS NOT NULL
  LOOP
    v_met := false;

    IF v_step.step_type = 'hours' THEN
      SELECT COALESCE(SUM(hours), 0) INTO v_progress
        FROM public.pickleball_hours_log
       WHERE coach_id = p_coach_id
         AND course_id = p_course_id
         AND (v_step.auto_program_id IS NULL OR program_id = v_step.auto_program_id);
      v_met := v_progress >= v_step.auto_threshold;

    ELSIF v_step.step_type = 'shadow' THEN
      SELECT COUNT(*) INTO v_progress
        FROM public.pickleball_shadow_logs
       WHERE coach_id = p_coach_id
         AND course_id = p_course_id
         AND signed_off = true;
      v_met := v_progress >= v_step.auto_threshold;

    ELSIF v_step.step_type = 'cert' THEN
      SELECT COUNT(*) INTO v_progress
        FROM public.pickleball_certifications
       WHERE coach_id = p_coach_id
         AND course_id = p_course_id;
      v_met := v_progress >= v_step.auto_threshold;
    END IF;

    IF v_met THEN
      UPDATE public.pickleball_coach_devsteps
         SET status         = 'done',
             completed_at   = now(),
             auto_completed = true
       WHERE id = v_step.id;

      v_count := v_count + 1;

      -- Notify the coach and the course teacher (de-dupe if same person).
      SELECT COALESCE(NULLIF(btrim(display_name), ''), 'A coach')
        INTO v_coach_name
        FROM public.profiles WHERE id = p_coach_id;

      v_title := 'Development step completed';
      v_body  := v_coach_name || ' met the goal for "' || v_step.title || '".';

      INSERT INTO public.notifications (recipient_id, kind, title, body, link)
      VALUES (p_coach_id, 'pickleball_devstep_complete',
              'You completed a development step',
              'You met the goal for "' || v_step.title || '".', v_link);

      IF v_teacher_id IS NOT NULL AND v_teacher_id IS DISTINCT FROM p_coach_id THEN
        INSERT INTO public.notifications (recipient_id, kind, title, body, link)
        VALUES (v_teacher_id, 'pickleball_devstep_complete', v_title, v_body, v_link);
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_recompute_devsteps(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_recompute_devsteps(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Triggers — recompute on the three source tables.
--    Each trigger fn is SECURITY DEFINER with a locked search_path (it calls
--    the recompute fn which INSERTs into another table).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_trg_recompute_devsteps()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
BEGIN
  PERFORM public.pk_recompute_devsteps(NEW.course_id, NEW.coach_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pk_recompute_on_hours ON public.pickleball_hours_log;
CREATE TRIGGER trg_pk_recompute_on_hours
  AFTER INSERT OR UPDATE ON public.pickleball_hours_log
  FOR EACH ROW EXECUTE FUNCTION public.pk_trg_recompute_devsteps();

DROP TRIGGER IF EXISTS trg_pk_recompute_on_shadow ON public.pickleball_shadow_logs;
CREATE TRIGGER trg_pk_recompute_on_shadow
  AFTER UPDATE OF signed_off ON public.pickleball_shadow_logs
  FOR EACH ROW EXECUTE FUNCTION public.pk_trg_recompute_devsteps();

DROP TRIGGER IF EXISTS trg_pk_recompute_on_cert ON public.pickleball_certifications;
CREATE TRIGGER trg_pk_recompute_on_cert
  AFTER INSERT ON public.pickleball_certifications
  FOR EACH ROW EXECUTE FUNCTION public.pk_trg_recompute_devsteps();

-- -----------------------------------------------------------------------------
-- 5. pk_add_shadow_log — educator records a shadowing session for a coach.
--    Educator of the course only. Returns the new row.
--    Errors: not_authenticated / not_authorized / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_add_shadow_log(
  p_course_id    uuid,
  p_coach_id     uuid,
  p_shadow_date  date,
  p_mentor_id    uuid DEFAULT NULL,
  p_lesson_id    uuid DEFAULT NULL,
  p_mentor_notes text DEFAULT NULL
)
  RETURNS public.pickleball_shadow_logs
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_shadow_logs;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_course_id IS NULL OR p_coach_id IS NULL OR p_shadow_date IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, p_course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Guard the lesson belongs to this course (if supplied).
  IF p_lesson_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pickleball_lessons
     WHERE id = p_lesson_id AND course_id = p_course_id
  ) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pickleball_shadow_logs
    (course_id, coach_id, mentor_id, lesson_id, shadow_date, mentor_notes)
  VALUES
    (p_course_id, p_coach_id, p_mentor_id, p_lesson_id, p_shadow_date, p_mentor_notes)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_add_shadow_log(uuid, uuid, date, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_add_shadow_log(uuid, uuid, date, uuid, uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. pk_signoff_shadow_log — flip the signed_off flag. Educator of the course OR
--    the assigned mentor may sign off. Returns the row.
--    Errors: not_authenticated / not_found / not_authorized.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_signoff_shadow_log(
  p_id        uuid,
  p_signed_off boolean DEFAULT true
)
  RETURNS public.pickleball_shadow_logs
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_shadow_logs;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM public.pickleball_shadow_logs WHERE id = p_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  -- Educator of the course, an admin, or the assigned mentor may sign off.
  IF NOT (
    public.is_teacher_of_course(v_caller, v_row.course_id)
    OR public.is_admin(v_caller)
    OR (v_row.mentor_id IS NOT NULL AND v_row.mentor_id = v_caller)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pickleball_shadow_logs
     SET signed_off    = COALESCE(p_signed_off, true),
         signed_off_at = CASE WHEN COALESCE(p_signed_off, true) THEN now() ELSE NULL END
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_signoff_shadow_log(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_signoff_shadow_log(uuid, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. pk_set_devstep_auto — educator configures (or clears) the auto-completion
--    rule on an existing dev step. p_step_type 'manual' (or NULL) clears the
--    rule. Returns the row; immediately recomputes so a just-met step closes
--    without waiting for the next source-table write.
--    Errors: not_authenticated / not_found / not_authorized / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_set_devstep_auto(
  p_id              uuid,
  p_step_type       text,
  p_auto_threshold  numeric DEFAULT NULL,
  p_auto_program_id uuid    DEFAULT NULL
)
  RETURNS public.pickleball_coach_devsteps
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_coach_devsteps;
  v_type   text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM public.pickleball_coach_devsteps WHERE id = p_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, v_row.course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_type := NULLIF(btrim(COALESCE(p_step_type, '')), '');
  IF v_type IS NOT NULL AND v_type NOT IN ('cert', 'hours', 'shadow', 'manual') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  -- An auto rule (cert/hours/shadow) needs a positive threshold.
  IF v_type IN ('cert', 'hours', 'shadow')
     AND (p_auto_threshold IS NULL OR p_auto_threshold <= 0) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  -- Program filter only applies to the 'hours' rule.
  IF v_type IS DISTINCT FROM 'hours' AND p_auto_program_id IS NOT NULL THEN
    p_auto_program_id := NULL;
  END IF;

  -- Guard the program belongs to this course (if supplied).
  IF p_auto_program_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pickleball_programs
     WHERE id = p_auto_program_id AND course_id = v_row.course_id
  ) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pickleball_coach_devsteps
     SET step_type       = v_type,
         auto_threshold  = CASE WHEN v_type IN ('cert', 'hours', 'shadow')
                                THEN p_auto_threshold ELSE NULL END,
         auto_program_id = p_auto_program_id
   WHERE id = p_id
   RETURNING * INTO v_row;

  -- Close it right away if the rule is already satisfied.
  PERFORM public.pk_recompute_devsteps(v_row.course_id, v_row.coach_id);
  SELECT * INTO v_row FROM public.pickleball_coach_devsteps WHERE id = p_id;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_set_devstep_auto(uuid, text, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_set_devstep_auto(uuid, text, numeric, uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0168_pickleball_coach_development.sql
-- =============================================================================
