-- =============================================================================
-- Migration: 0157_pickleball_drills_homework.sql
-- Description: Player-track drills library + per-player homework for the
-- Pickleball feature (Increment 2, Lane B).
--
-- A "drill" is a reusable practice exercise authored by a course's educators
-- (name, description, demo video, skill tags drawn from the fixed 10-skill
-- taxonomy in viewer/src/lib/pickleballSkills.ts, level band, solo/partner,
-- equipment, default params). Drills live per-course and are visible to every
-- enrolled member (so players can browse the library).
--
-- "Homework" assigns a drill to one player, optionally tied to a lesson, with
-- params + a due date. A player moves their own homework through
-- assigned -> done / skipped. Coaches see + manage all homework for the course.
--
-- RLS reuses the existing SECURITY DEFINER helpers VERBATIM (no inline EXISTS
-- over profiles in WITH CHECK, per the project rule):
--   * is_teacher_of_course(uid, course_id) — owner / co-teacher (0130)
--   * is_admin(uid)                         — staff oversight (0001)
--   * is_student_in_class(uid, course_id)   — enrolled member (0012/0130)
--   * player_id = (SELECT auth.uid())       — the player themself
--     (profiles.id == auth.uid() in this schema, 1:1)
--
-- person FK columns reference profiles(id), NOT other pickleball tables, to
-- avoid cross-lane dependencies. All writes go through pk_ RPCs (SECURITY
-- DEFINER, stable string error codes, GRANT EXECUTE TO authenticated).
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pickleball_drills — reusable practice exercises, scoped per course.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_drills (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name           text NOT NULL,
  description    text,
  demo_video_url text,
  skill_tags     text[] NOT NULL DEFAULT '{}',
  level_min      numeric,
  level_max      numeric,
  solo_or_partner text CHECK (solo_or_partner IN ('solo', 'partner', 'group', 'wall')),
  equipment      text[],
  default_params jsonb,
  contributed_by uuid REFERENCES public.profiles(id),
  status         text NOT NULL DEFAULT 'published'
                 CHECK (status IN ('draft', 'published', 'archived')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickleball_drills_course_idx
  ON public.pickleball_drills (course_id);
ALTER TABLE public.pickleball_drills ENABLE ROW LEVEL SECURITY;

-- Educator of the course (owner / co-teacher / admin) has full read+write.
DROP POLICY IF EXISTS "pk_drills: educator manages" ON public.pickleball_drills;
CREATE POLICY "pk_drills: educator manages" ON public.pickleball_drills
  FOR ALL
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  );

-- Enrolled members read non-archived drills (the browsable library).
DROP POLICY IF EXISTS "pk_drills: members read" ON public.pickleball_drills;
CREATE POLICY "pk_drills: members read" ON public.pickleball_drills
  FOR SELECT
  USING (
    status <> 'archived'
    AND public.is_student_in_class((SELECT auth.uid()), course_id)
  );

-- -----------------------------------------------------------------------------
-- 2. pickleball_homework — one drill assigned to one player.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_homework (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  player_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  drill_id     uuid NOT NULL REFERENCES public.pickleball_drills(id),
  lesson_id    uuid REFERENCES public.pickleball_lessons(id),
  params       jsonb,
  due_on       date,
  status       text NOT NULL DEFAULT 'assigned'
               CHECK (status IN ('assigned', 'done', 'skipped')),
  assigned_by  uuid REFERENCES public.profiles(id),
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickleball_homework_course_player_idx
  ON public.pickleball_homework (course_id, player_id);
ALTER TABLE public.pickleball_homework ENABLE ROW LEVEL SECURITY;

-- Educator of the course (owner / co-teacher / admin) has full read+write.
DROP POLICY IF EXISTS "pk_homework: educator manages" ON public.pickleball_homework;
CREATE POLICY "pk_homework: educator manages" ON public.pickleball_homework
  FOR ALL
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  );

-- The player reads their own homework.
DROP POLICY IF EXISTS "pk_homework: player reads own" ON public.pickleball_homework;
CREATE POLICY "pk_homework: player reads own" ON public.pickleball_homework
  FOR SELECT
  USING (player_id = (SELECT auth.uid()));

-- The player may mark their OWN homework done / skipped. The WITH CHECK keeps
-- the row their own and restricts the resulting status to the two
-- self-service values (the UPDATE policy can't reference OLD, so the RPC is the
-- canonical path; this policy is a defence-in-depth backstop that still lets a
-- player flip only their own row to a self-service status).
DROP POLICY IF EXISTS "pk_homework: player updates own status"
  ON public.pickleball_homework;
CREATE POLICY "pk_homework: player updates own status"
  ON public.pickleball_homework
  FOR UPDATE
  USING (player_id = (SELECT auth.uid()))
  WITH CHECK (
    player_id = (SELECT auth.uid())
    AND status IN ('assigned', 'done', 'skipped')
  );

-- -----------------------------------------------------------------------------
-- 3. pk_upsert_drill — create or edit a drill (educator only).
--    p_id NULL => insert; non-NULL => update that drill in the same course.
--    Stable error codes: not_authenticated / not_authorized / not_found /
--    invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_upsert_drill(
  p_course_id       uuid,
  p_id              uuid    DEFAULT NULL,
  p_name            text    DEFAULT NULL,
  p_description     text    DEFAULT NULL,
  p_demo_video_url  text    DEFAULT NULL,
  p_skill_tags      text[]  DEFAULT NULL,
  p_level_min       numeric DEFAULT NULL,
  p_level_max       numeric DEFAULT NULL,
  p_solo_or_partner text    DEFAULT NULL,
  p_equipment       text[]  DEFAULT NULL,
  p_default_params  jsonb   DEFAULT NULL,
  p_status          text    DEFAULT NULL
)
  RETURNS public.pickleball_drills
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_drills;
  v_status text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_course_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_teacher_of_course(v_caller, p_course_id)
    OR public.is_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_solo_or_partner IS NOT NULL
     AND p_solo_or_partner NOT IN ('solo', 'partner', 'group', 'wall') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NOT NULL
     AND p_status NOT IN ('draft', 'published', 'archived') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    -- Insert. name is required on create.
    IF p_name IS NULL OR btrim(p_name) = '' THEN
      RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.pickleball_drills (
      course_id, name, description, demo_video_url, skill_tags, level_min,
      level_max, solo_or_partner, equipment, default_params, contributed_by,
      status
    )
    VALUES (
      p_course_id, p_name, p_description, p_demo_video_url,
      COALESCE(p_skill_tags, '{}'), p_level_min, p_level_max, p_solo_or_partner,
      p_equipment, p_default_params, v_caller,
      COALESCE(p_status, 'published')
    )
    RETURNING * INTO v_row;
  ELSE
    -- Update an existing drill belonging to this course.
    SELECT * INTO v_row FROM public.pickleball_drills WHERE id = p_id;
    IF v_row.id IS NULL OR v_row.course_id <> p_course_id THEN
      RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
    END IF;
    v_status := COALESCE(p_status, v_row.status);
    UPDATE public.pickleball_drills
       SET name            = COALESCE(NULLIF(btrim(p_name), ''), v_row.name),
           description      = p_description,
           demo_video_url   = p_demo_video_url,
           skill_tags       = COALESCE(p_skill_tags, v_row.skill_tags),
           level_min        = p_level_min,
           level_max        = p_level_max,
           solo_or_partner  = p_solo_or_partner,
           equipment        = p_equipment,
           default_params   = p_default_params,
           status           = v_status
     WHERE id = p_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_upsert_drill(
  uuid, uuid, text, text, text, text[], numeric, numeric, text, text[], jsonb, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_upsert_drill(
  uuid, uuid, text, text, text, text[], numeric, numeric, text, text[], jsonb, text
) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. pk_archive_drill — flip a drill to archived (or back to published).
--    Educator only. Stable codes: not_authenticated / not_authorized /
--    not_found.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_archive_drill(
  p_id       uuid,
  p_archived boolean DEFAULT true
)
  RETURNS public.pickleball_drills
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_drills;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM public.pickleball_drills WHERE id = p_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (
    public.is_teacher_of_course(v_caller, v_row.course_id)
    OR public.is_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pickleball_drills
     SET status = CASE WHEN p_archived THEN 'archived' ELSE 'published' END
   WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_archive_drill(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_archive_drill(uuid, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. pk_assign_homework — assign a drill to a player (educator only).
--    Validates the drill belongs to the course and (when supplied) the lesson
--    belongs to the same course + player. Stable codes: not_authenticated /
--    not_authorized / not_found / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_assign_homework(
  p_course_id uuid,
  p_player_id uuid,
  p_drill_id  uuid,
  p_lesson_id uuid  DEFAULT NULL,
  p_params    jsonb DEFAULT NULL,
  p_due_on    date  DEFAULT NULL
)
  RETURNS public.pickleball_homework
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_homework;
  v_drill  public.pickleball_drills;
  v_lesson public.pickleball_lessons;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_course_id IS NULL OR p_player_id IS NULL OR p_drill_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_teacher_of_course(v_caller, p_course_id)
    OR public.is_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- The drill must belong to this course.
  SELECT * INTO v_drill FROM public.pickleball_drills WHERE id = p_drill_id;
  IF v_drill.id IS NULL OR v_drill.course_id <> p_course_id THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  -- When a lesson is supplied it must match the same course + player.
  IF p_lesson_id IS NOT NULL THEN
    SELECT * INTO v_lesson FROM public.pickleball_lessons WHERE id = p_lesson_id;
    IF v_lesson.id IS NULL
       OR v_lesson.course_id <> p_course_id
       OR v_lesson.player_id <> p_player_id THEN
      RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.pickleball_homework (
    course_id, player_id, drill_id, lesson_id, params, due_on, status,
    assigned_by
  )
  VALUES (
    p_course_id, p_player_id, p_drill_id, p_lesson_id, p_params, p_due_on,
    'assigned', v_caller
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_assign_homework(
  uuid, uuid, uuid, uuid, jsonb, date
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_assign_homework(
  uuid, uuid, uuid, uuid, jsonb, date
) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. pk_set_homework_status — move a homework row to assigned/done/skipped.
--    Allowed for: the player on their OWN row, OR the educator of the course.
--    completed_at is stamped when moving to 'done' and cleared otherwise.
--    Stable codes: not_authenticated / not_authorized / not_found /
--    invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_set_homework_status(
  p_id     uuid,
  p_status text
)
  RETURNS public.pickleball_homework
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_homework;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('assigned', 'done', 'skipped') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.pickleball_homework WHERE id = p_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (
    v_row.player_id = v_caller
    OR public.is_teacher_of_course(v_caller, v_row.course_id)
    OR public.is_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pickleball_homework
     SET status       = p_status,
         completed_at = CASE WHEN p_status = 'done' THEN now() ELSE NULL END
   WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_set_homework_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_set_homework_status(uuid, text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0157_pickleball_drills_homework.sql
-- =============================================================================
