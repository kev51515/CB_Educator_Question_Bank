-- =============================================================================
-- Migration: 0152_pickleball_lessons.sql
-- Description: Player-track lessons + recap videos for the Pickleball feature.
--
-- A "lesson" is a coaching session a course schedules for one of its enrolled
-- players. The educator writes a PLAN before the session and a RECAP after it,
-- moving the lesson through scheduled -> completed -> recapped. Recap videos
-- (YouTube/Vimeo/Drive links OR uploads to the `pickleball-videos` storage
-- bucket) hang off the lesson so the player can review their session.
--
-- Mirrors the counseling / 0150 program pattern:
--   * is_teacher_of_course(uid, course_id) — owner / co-teacher (0130)
--   * is_admin(uid)                         — staff oversight (0001)
--   * the player (player_id = auth.uid())   — read-only on their own lessons
-- All writes go through pk_ RPCs (SECURITY DEFINER, stable string error codes).
--
-- person FK columns reference profiles(id), NOT other pickleball tables, to
-- avoid cross-lane dependencies.
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pickleball_lessons — one coaching session for one player.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_lessons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  player_id    uuid NOT NULL REFERENCES public.profiles(id),
  coach_id     uuid REFERENCES public.profiles(id),
  program_id   uuid REFERENCES public.pickleball_programs(id),
  scheduled_at timestamptz,
  duration_min integer,
  location     text,
  status       text NOT NULL DEFAULT 'scheduled'
               CHECK (status IN ('scheduled', 'completed', 'recapped', 'cancelled')),
  plan_md      text,
  recap_md     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickleball_lessons_course_idx
  ON public.pickleball_lessons (course_id);
CREATE INDEX IF NOT EXISTS pickleball_lessons_player_idx
  ON public.pickleball_lessons (player_id);
ALTER TABLE public.pickleball_lessons ENABLE ROW LEVEL SECURITY;

-- Educator of the course (owner / co-teacher / admin) has full read+write.
DROP POLICY IF EXISTS "pk_lessons: educator manages" ON public.pickleball_lessons;
CREATE POLICY "pk_lessons: educator manages" ON public.pickleball_lessons
  FOR ALL
  USING (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())));

-- The player reads their own lessons.
DROP POLICY IF EXISTS "pk_lessons: player reads own" ON public.pickleball_lessons;
CREATE POLICY "pk_lessons: player reads own" ON public.pickleball_lessons
  FOR SELECT
  USING (player_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- 2. pickleball_lesson_videos — recap videos attached to a lesson.
--    kind 'link'   -> url is an external YouTube/Vimeo/Drive URL.
--    kind 'upload' -> storage_path points into the `pickleball-videos` bucket.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_lesson_videos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id    uuid NOT NULL REFERENCES public.pickleball_lessons(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('link', 'upload')),
  url          text,
  storage_path text,
  title        text,
  sort_order   integer DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickleball_lesson_videos_lesson_idx
  ON public.pickleball_lesson_videos (lesson_id);
ALTER TABLE public.pickleball_lesson_videos ENABLE ROW LEVEL SECURITY;

-- Educator of the owning lesson's course manages videos.
DROP POLICY IF EXISTS "pk_lesson_videos: educator manages" ON public.pickleball_lesson_videos;
CREATE POLICY "pk_lesson_videos: educator manages" ON public.pickleball_lesson_videos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.pickleball_lessons l
      WHERE l.id = lesson_id
        AND (public.is_teacher_of_course((SELECT auth.uid()), l.course_id) OR public.is_admin((SELECT auth.uid())))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pickleball_lessons l
      WHERE l.id = lesson_id
        AND (public.is_teacher_of_course((SELECT auth.uid()), l.course_id) OR public.is_admin((SELECT auth.uid())))
    )
  );

-- The player reads videos on their own lessons.
DROP POLICY IF EXISTS "pk_lesson_videos: player reads own" ON public.pickleball_lesson_videos;
CREATE POLICY "pk_lesson_videos: player reads own" ON public.pickleball_lesson_videos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pickleball_lessons l
      WHERE l.id = lesson_id
        AND l.player_id = (SELECT auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- 3. pk_schedule_lesson — educator creates a lesson for a player. Returns row.
--    Stable error codes: not_authenticated / not_authorized / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_schedule_lesson(
  p_course_id    uuid,
  p_player_id    uuid,
  p_coach_id     uuid         DEFAULT NULL,
  p_program_id   uuid         DEFAULT NULL,
  p_scheduled_at timestamptz  DEFAULT NULL,
  p_duration_min integer      DEFAULT NULL,
  p_location     text         DEFAULT NULL,
  p_plan_md      text         DEFAULT NULL
)
  RETURNS public.pickleball_lessons
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_lessons;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_course_id IS NULL OR p_player_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, p_course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- The program (if supplied) must belong to the same course.
  IF p_program_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pickleball_programs pr
    WHERE pr.id = p_program_id AND pr.course_id = p_course_id
  ) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pickleball_lessons (
    course_id, player_id, coach_id, program_id,
    scheduled_at, duration_min, location, plan_md
  )
  VALUES (
    p_course_id, p_player_id, p_coach_id, p_program_id,
    p_scheduled_at, p_duration_min, p_location, p_plan_md
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_schedule_lesson(uuid, uuid, uuid, uuid, timestamptz, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_schedule_lesson(uuid, uuid, uuid, uuid, timestamptz, integer, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. pk_update_lesson — educator edits the schedulable fields + plan. Returns
--    row. Stable error codes: not_authenticated / not_authorized / not_found /
--    invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_update_lesson(
  p_id           uuid,
  p_coach_id     uuid         DEFAULT NULL,
  p_program_id   uuid         DEFAULT NULL,
  p_scheduled_at timestamptz  DEFAULT NULL,
  p_duration_min integer      DEFAULT NULL,
  p_location     text         DEFAULT NULL,
  p_plan_md      text         DEFAULT NULL
)
  RETURNS public.pickleball_lessons
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_lessons;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM public.pickleball_lessons WHERE id = p_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, v_row.course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_program_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pickleball_programs pr
    WHERE pr.id = p_program_id AND pr.course_id = v_row.course_id
  ) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pickleball_lessons
     SET coach_id     = p_coach_id,
         program_id   = p_program_id,
         scheduled_at = p_scheduled_at,
         duration_min = p_duration_min,
         location     = p_location,
         plan_md      = p_plan_md,
         updated_at   = now()
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_update_lesson(uuid, uuid, uuid, timestamptz, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_update_lesson(uuid, uuid, uuid, timestamptz, integer, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. pk_recap_lesson — educator writes the post-session recap and (usually)
--    advances status to 'recapped'. Returns row. Stable error codes:
--    not_authenticated / not_authorized / not_found / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_recap_lesson(
  p_id       uuid,
  p_recap_md text,
  p_status   text DEFAULT 'recapped'
)
  RETURNS public.pickleball_lessons
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_lessons;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('scheduled', 'completed', 'recapped', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.pickleball_lessons WHERE id = p_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, v_row.course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pickleball_lessons
     SET recap_md   = p_recap_md,
         status     = COALESCE(p_status, status),
         updated_at = now()
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_recap_lesson(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_recap_lesson(uuid, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. pk_set_lesson_status — one-click status toggle. Returns row. Stable error
--    codes: not_authenticated / not_authorized / not_found / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_set_lesson_status(
  p_id     uuid,
  p_status text
)
  RETURNS public.pickleball_lessons
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_lessons;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('scheduled', 'completed', 'recapped', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.pickleball_lessons WHERE id = p_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, v_row.course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pickleball_lessons
     SET status     = p_status,
         updated_at = now()
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_set_lesson_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_set_lesson_status(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. pk_add_lesson_video — educator attaches a recap video (link or upload).
--    Returns the new video row. Stable error codes: not_authenticated /
--    not_authorized / not_found / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_add_lesson_video(
  p_lesson_id    uuid,
  p_kind         text,
  p_url          text DEFAULT NULL,
  p_storage_path text DEFAULT NULL,
  p_title        text DEFAULT NULL
)
  RETURNS public.pickleball_lesson_videos
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_lesson public.pickleball_lessons;
  v_row    public.pickleball_lesson_videos;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('link', 'upload') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'link'   AND (p_url IS NULL OR btrim(p_url) = '') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'upload' AND (p_storage_path IS NULL OR btrim(p_storage_path) = '') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_lesson FROM public.pickleball_lessons WHERE id = p_lesson_id;
  IF v_lesson.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, v_lesson.course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pickleball_lesson_videos (
    lesson_id, kind, url, storage_path, title, sort_order
  )
  VALUES (
    p_lesson_id,
    p_kind,
    CASE WHEN p_kind = 'link'   THEN btrim(p_url)          ELSE NULL END,
    CASE WHEN p_kind = 'upload' THEN btrim(p_storage_path) ELSE NULL END,
    NULLIF(btrim(COALESCE(p_title, '')), ''),
    COALESCE(
      (SELECT MAX(sort_order) + 1 FROM public.pickleball_lesson_videos WHERE lesson_id = p_lesson_id),
      0
    )
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_add_lesson_video(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_add_lesson_video(uuid, text, text, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. pk_delete_lesson_video — educator removes a recap video. Returns the
--    deleted video's id. Stable error codes: not_authenticated /
--    not_authorized / not_found.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_delete_lesson_video(
  p_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller   uuid := (SELECT auth.uid());
  v_video    public.pickleball_lesson_videos;
  v_lesson   public.pickleball_lessons;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_video FROM public.pickleball_lesson_videos WHERE id = p_id;
  IF v_video.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  SELECT * INTO v_lesson FROM public.pickleball_lessons WHERE id = v_video.lesson_id;
  IF v_lesson.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, v_lesson.course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.pickleball_lesson_videos WHERE id = p_id;

  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_delete_lesson_video(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_delete_lesson_video(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0152_pickleball_lessons.sql
-- =============================================================================
