-- =============================================================================
-- Migration: 0154_pickleball_coach_dev.sql
-- Description: Coach-development track for the 'pickleball_coach' course type.
-- Three tables + one roll-up view + four RPCs:
--
--   pickleball_coach_devsteps   — per-coach development "next steps" a teacher
--                                 assigns; the coach checks them off. Modelled
--                                 on counseling_tasks (0134).
--   pickleball_hours_log        — per-coach log of teaching hours (date, hours,
--                                 program taught, #players, notes). Educator or
--                                 the coach themselves may add own rows.
--   pickleball_coach_programs   — coach × program qualification matrix
--                                 (training / cleared), educator-controlled.
--   pickleball_coach_hours_totals (VIEW) — sum of hours per (coach, course).
--
-- RLS mirrors the counseling pattern (0134/0135): educator of the course
-- (owner / co-teacher / admin) has full read+write; the coach reads their OWN
-- rows and may self-service the narrow writes the UI exposes (check off own
-- devstep, log own hours).
--
-- All person FKs point at profiles(id) — never at other pickleball tables — so
-- this lane is independent of the player/coach-profile lanes.
--
-- Reused helpers (do not reinvent):
--   * is_teacher_of_course(uid, course_id) — owner / share recipient (0130)
--   * is_admin(uid)                        — staff admin (0001)
--   * is_student_in_class(uid, course_id)  — enrolled member (0012/0130)
--
-- RPCs raise stable string error codes the client switches on:
--   not_authenticated / not_authorized / not_found / invalid_input.
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pickleball_coach_devsteps — development next-steps assigned per coach.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_coach_devsteps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  coach_id     uuid NOT NULL REFERENCES public.profiles(id),
  title        text NOT NULL,
  detail       text,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  notes        text,
  due_on       date,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickleball_coach_devsteps_course_idx
  ON public.pickleball_coach_devsteps (course_id);
CREATE INDEX IF NOT EXISTS pickleball_coach_devsteps_coach_idx
  ON public.pickleball_coach_devsteps (coach_id);
ALTER TABLE public.pickleball_coach_devsteps ENABLE ROW LEVEL SECURITY;

-- Educator of the course (owner / co-teacher / admin) — full read+write.
DROP POLICY IF EXISTS "pk_devsteps: educator manages" ON public.pickleball_coach_devsteps;
CREATE POLICY "pk_devsteps: educator manages" ON public.pickleball_coach_devsteps
  FOR ALL
  USING (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())));

-- Coach reads their OWN devsteps.
DROP POLICY IF EXISTS "pk_devsteps: coach reads own" ON public.pickleball_coach_devsteps;
CREATE POLICY "pk_devsteps: coach reads own" ON public.pickleball_coach_devsteps
  FOR SELECT
  USING (coach_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- 2. pickleball_hours_log — teaching hours logged per coach.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_hours_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  coach_id    uuid NOT NULL REFERENCES public.profiles(id),
  taught_on   date NOT NULL,
  hours       numeric NOT NULL,
  program_id  uuid REFERENCES public.pickleball_programs(id),
  num_players int,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickleball_hours_log_course_idx
  ON public.pickleball_hours_log (course_id);
CREATE INDEX IF NOT EXISTS pickleball_hours_log_coach_idx
  ON public.pickleball_hours_log (coach_id);
ALTER TABLE public.pickleball_hours_log ENABLE ROW LEVEL SECURITY;

-- Educator — full read+write.
DROP POLICY IF EXISTS "pk_hours: educator manages" ON public.pickleball_hours_log;
CREATE POLICY "pk_hours: educator manages" ON public.pickleball_hours_log
  FOR ALL
  USING (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())));

-- Coach reads their OWN hours.
DROP POLICY IF EXISTS "pk_hours: coach reads own" ON public.pickleball_hours_log;
CREATE POLICY "pk_hours: coach reads own" ON public.pickleball_hours_log
  FOR SELECT
  USING (coach_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. pickleball_coach_programs — coach × program qualification matrix.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_coach_programs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  coach_id   uuid NOT NULL REFERENCES public.profiles(id),
  program_id uuid NOT NULL REFERENCES public.pickleball_programs(id),
  status     text NOT NULL DEFAULT 'training' CHECK (status IN ('training', 'cleared')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, program_id)
);
CREATE INDEX IF NOT EXISTS pickleball_coach_programs_course_idx
  ON public.pickleball_coach_programs (course_id);
CREATE INDEX IF NOT EXISTS pickleball_coach_programs_coach_idx
  ON public.pickleball_coach_programs (coach_id);
ALTER TABLE public.pickleball_coach_programs ENABLE ROW LEVEL SECURITY;

-- Educator — full read+write.
DROP POLICY IF EXISTS "pk_coach_programs: educator manages" ON public.pickleball_coach_programs;
CREATE POLICY "pk_coach_programs: educator manages" ON public.pickleball_coach_programs
  FOR ALL
  USING (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())));

-- Coach reads their OWN qualification rows.
DROP POLICY IF EXISTS "pk_coach_programs: coach reads own" ON public.pickleball_coach_programs;
CREATE POLICY "pk_coach_programs: coach reads own" ON public.pickleball_coach_programs
  FOR SELECT
  USING (coach_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- 4. pickleball_coach_hours_totals — roll-up of logged hours per (coach, course).
--    SELECT-only view; inherits the underlying table's RLS (educator sees all
--    rows for their courses, a coach sees only their own).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.pickleball_coach_hours_totals AS
  SELECT
    coach_id,
    course_id,
    COALESCE(SUM(hours), 0)::numeric AS total_hours
  FROM public.pickleball_hours_log
  GROUP BY coach_id, course_id;

-- -----------------------------------------------------------------------------
-- 5. pk_add_devstep — educator assigns a development next-step to a coach.
--    Returns the new row. Errors: not_authenticated / not_authorized /
--    invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_add_devstep(
  p_course_id uuid,
  p_coach_id  uuid,
  p_title     text,
  p_detail    text DEFAULT NULL,
  p_due_on    date DEFAULT NULL
)
  RETURNS public.pickleball_coach_devsteps
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_coach_devsteps;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_course_id IS NULL OR p_coach_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, p_course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pickleball_coach_devsteps (course_id, coach_id, title, detail, due_on)
  VALUES (p_course_id, p_coach_id, btrim(p_title), p_detail, p_due_on)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_add_devstep(uuid, uuid, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_add_devstep(uuid, uuid, text, text, date) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. pk_update_devstep — educator edits title / detail / notes / due date of an
--    existing devstep. Returns the row. Errors: not_authenticated / not_found /
--    not_authorized / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_update_devstep(
  p_id     uuid,
  p_title  text,
  p_detail text DEFAULT NULL,
  p_notes  text DEFAULT NULL,
  p_due_on date DEFAULT NULL
)
  RETURNS public.pickleball_coach_devsteps
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_coach_devsteps;
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

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pickleball_coach_devsteps
     SET title  = btrim(p_title),
         detail = p_detail,
         notes  = p_notes,
         due_on = p_due_on
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_update_devstep(uuid, text, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_update_devstep(uuid, text, text, text, date) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. pk_complete_devstep — toggle a devstep open/done. Educator of the course
--    OR the coach themselves may flip their own step. Returns the row.
--    Errors: not_authenticated / not_found / not_authorized.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_complete_devstep(
  p_id   uuid,
  p_done boolean DEFAULT true
)
  RETURNS public.pickleball_coach_devsteps
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_coach_devsteps;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM public.pickleball_coach_devsteps WHERE id = p_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  -- Educator of the course, an admin, or the owning coach may toggle.
  IF NOT (
    public.is_teacher_of_course(v_caller, v_row.course_id)
    OR public.is_admin(v_caller)
    OR v_row.coach_id = v_caller
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pickleball_coach_devsteps
     SET status       = CASE WHEN COALESCE(p_done, true) THEN 'done' ELSE 'open' END,
         completed_at = CASE WHEN COALESCE(p_done, true) THEN now() ELSE NULL END
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_complete_devstep(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_complete_devstep(uuid, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. pk_log_hours — log a block of teaching hours. Educator of the course (for
--    any coach) OR the coach themselves (for their OWN row only). Returns the
--    new row. Errors: not_authenticated / not_authorized / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_log_hours(
  p_course_id   uuid,
  p_coach_id    uuid,
  p_taught_on   date,
  p_hours       numeric,
  p_program_id  uuid DEFAULT NULL,
  p_num_players int DEFAULT NULL,
  p_notes       text DEFAULT NULL
)
  RETURNS public.pickleball_hours_log
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_hours_log;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_course_id IS NULL OR p_coach_id IS NULL OR p_taught_on IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF p_hours IS NULL OR p_hours <= 0 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF p_num_players IS NOT NULL AND p_num_players < 0 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  -- Educator may log for any coach; a coach may log only for themselves.
  IF NOT (
    public.is_teacher_of_course(v_caller, p_course_id)
    OR public.is_admin(v_caller)
    OR (p_coach_id = v_caller AND public.is_student_in_class(v_caller, p_course_id))
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Guard the program belongs to this course (if supplied).
  IF p_program_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pickleball_programs
     WHERE id = p_program_id AND course_id = p_course_id
  ) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pickleball_hours_log
    (course_id, coach_id, taught_on, hours, program_id, num_players, notes)
  VALUES
    (p_course_id, p_coach_id, p_taught_on, p_hours, p_program_id, p_num_players, p_notes)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_log_hours(uuid, uuid, date, numeric, uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_log_hours(uuid, uuid, date, numeric, uuid, int, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 9. pk_set_coach_program — educator sets a coach's qualification status for a
--    program (training / cleared). Upserts on (coach_id, program_id). Returns
--    the row. Errors: not_authenticated / not_authorized / not_found /
--    invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_set_coach_program(
  p_coach_id   uuid,
  p_program_id uuid,
  p_status     text
)
  RETURNS public.pickleball_coach_programs
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller    uuid := (SELECT auth.uid());
  v_course_id uuid;
  v_row       public.pickleball_coach_programs;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_coach_id IS NULL OR p_program_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('training', 'cleared') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  -- Resolve the program's course (and confirm it exists).
  SELECT course_id INTO v_course_id
    FROM public.pickleball_programs WHERE id = p_program_id;
  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, v_course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pickleball_coach_programs (course_id, coach_id, program_id, status)
  VALUES (v_course_id, p_coach_id, p_program_id, p_status)
  ON CONFLICT (coach_id, program_id)
  DO UPDATE SET status = EXCLUDED.status
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_set_coach_program(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_set_coach_program(uuid, uuid, text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0154_pickleball_coach_dev.sql
-- =============================================================================
