-- =============================================================================
-- Migration: 0158_pickleball_coach_efficiency.sql
-- Description: Coach-efficiency + player-safety layer for the Pickleball
-- PLAYER track (Increment 3).
--
-- Three pieces:
--
--   1. pickleball_player_notes — coach-PRIVATE per-(course, player) notes. Same
--      privacy intent as teacher_student_notes (0062): educators + admins can
--      read/write; the PLAYER NEVER can (no player policy at all). Unlike 0062
--      these are NOT scoped to a single authoring teacher — any educator of the
--      course (owner / co-teacher) shares the coaching notes for a player, since
--      a player may be coached by more than one staff member and the briefing
--      card needs the full picture. (If single-author privacy is ever wanted,
--      add an author scope later — loosening is easier than tightening.)
--
--   2. pre-lesson CHECK-IN columns on pickleball_lessons. The player fills these
--      in before a session (focus, physical condition, free-text note). When the
--      player reports 'injured', pk_submit_checkin fans out a notification to
--      the lesson's coach AND the course teacher so it's never missed.
--
--   3. pk_lesson_briefing — a read-only educator aggregate that powers the
--      BriefingsPanel "what do I need to know before this session" card: player
--      snapshot, weakest 2 skills, last recap, homework open/done counts, the
--      player's check-in, plus a few flags (first lesson, injury, minor).
--
-- RLS reuses the existing SECURITY DEFINER helpers VERBATIM (no inline EXISTS
-- over profiles in WITH CHECK, per the project rule):
--   * is_teacher_of_course(uid, course_id) — owner / co-teacher (0130)
--   * is_admin(uid)                         — admin oversight (0001)
--   * player_id = (SELECT auth.uid())       — the player themself
--
-- person FK columns reference profiles(id). All writes go through pk_ RPCs
-- (SECURITY DEFINER + SET search_path = public, auth, stable string error
-- codes, GRANT EXECUTE TO authenticated).
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pickleball_player_notes — coach-private per-(course, player) notes.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_player_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  uuid NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  player_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES public.profiles(id),
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickleball_player_notes_course_player_idx
  ON public.pickleball_player_notes (course_id, player_id);
ALTER TABLE public.pickleball_player_notes ENABLE ROW LEVEL SECURITY;

-- Educator of the course (owner / co-teacher) OR admin has FULL access
-- (SELECT/INSERT/UPDATE/DELETE). There is intentionally NO player policy:
-- these notes are coach-private and a player can NEVER read or write them.
DROP POLICY IF EXISTS "pk_player_notes: educator manages"
  ON public.pickleball_player_notes;
CREATE POLICY "pk_player_notes: educator manages"
  ON public.pickleball_player_notes
  FOR ALL
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  );

-- updated_at trigger (reuses the project-standard helper from 0001).
DROP TRIGGER IF EXISTS trg_pickleball_player_notes_set_updated_at
  ON public.pickleball_player_notes;
CREATE TRIGGER trg_pickleball_player_notes_set_updated_at
  BEFORE UPDATE ON public.pickleball_player_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pickleball_player_notes TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Pre-lesson CHECK-IN columns on pickleball_lessons.
-- -----------------------------------------------------------------------------
ALTER TABLE public.pickleball_lessons
  ADD COLUMN IF NOT EXISTS checkin_focus     text,
  ADD COLUMN IF NOT EXISTS checkin_condition text,
  ADD COLUMN IF NOT EXISTS checkin_note      text,
  ADD COLUMN IF NOT EXISTS checkin_at        timestamptz;

-- Constrain the physical-condition enum (separate ALTER so the CHECK is
-- guarded against re-runs).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pickleball_lessons_checkin_condition_chk'
       AND conrelid = 'public.pickleball_lessons'::regclass
  ) THEN
    ALTER TABLE public.pickleball_lessons
      ADD CONSTRAINT pickleball_lessons_checkin_condition_chk
      CHECK (checkin_condition IS NULL
             OR checkin_condition IN ('good', 'minor_issue', 'injured'));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. pk_submit_checkin — the player (or an educator) records the pre-lesson
--    check-in. On an 'injured' report, fans out a notification to the lesson's
--    coach (if set) AND the course teacher.
--
--    Authorisation: caller is the lesson's player_id OR an educator/admin of
--    the lesson's course. Stable error codes: not_authenticated /
--    not_authorized / not_found / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_submit_checkin(
  p_lesson_id uuid,
  p_focus     text DEFAULT NULL,
  p_condition text DEFAULT NULL,
  p_note      text DEFAULT NULL
)
  RETURNS public.pickleball_lessons
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller     uuid := (SELECT auth.uid());
  v_row        public.pickleball_lessons;
  v_teacher_id uuid;
  v_player     text;
  v_title      text;
  v_body       text;
  v_link       text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_condition IS NOT NULL
     AND p_condition NOT IN ('good', 'minor_issue', 'injured') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.pickleball_lessons WHERE id = p_lesson_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  -- The lesson's player, OR an educator of the course, may submit the check-in.
  IF NOT (
    v_row.player_id = v_caller
    OR public.is_teacher_of_course(v_caller, v_row.course_id)
    OR public.is_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pickleball_lessons
     SET checkin_focus     = p_focus,
         checkin_condition = p_condition,
         checkin_note      = p_note,
         checkin_at        = now(),
         updated_at        = now()
   WHERE id = p_lesson_id
  RETURNING * INTO v_row;

  -- Injury alert fan-out. RLS on notifications limits SELECT/UPDATE to the
  -- recipient; this INSERT succeeds because the function is SECURITY DEFINER
  -- with a locked search_path. We notify the coach (if assigned) AND the
  -- course teacher, de-duping when they're the same person.
  IF p_condition = 'injured' THEN
    SELECT teacher_id INTO v_teacher_id
    FROM public.courses
    WHERE id = v_row.course_id;

    SELECT COALESCE(NULLIF(btrim(display_name), ''), 'A player')
    INTO v_player
    FROM public.profiles
    WHERE id = v_row.player_id;

    v_title := 'Injury reported before lesson';
    v_body  := v_player || ' reported an injury in their pre-lesson check-in.';
    v_link  := '/courses/' || v_row.course_id;

    IF v_row.coach_id IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_id, kind, title, body, link)
      VALUES (v_row.coach_id, 'pickleball_checkin_injury', v_title, v_body, v_link);
    END IF;

    IF v_teacher_id IS NOT NULL AND v_teacher_id IS DISTINCT FROM v_row.coach_id THEN
      INSERT INTO public.notifications (recipient_id, kind, title, body, link)
      VALUES (v_teacher_id, 'pickleball_checkin_injury', v_title, v_body, v_link);
    END IF;
  END IF;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_submit_checkin(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_submit_checkin(uuid, text, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. pk_lesson_briefing — read-only educator aggregate for the BriefingsPanel
--    card. Returns jsonb:
--      {
--        "lesson":      { id, scheduled_at, duration_min, location, status,
--                         plan_md },
--        "player":      { id, name, goal, skill_level, dupr, dominant_hand,
--                         years_played },
--        "weak_skills": [ { "slug": <text>, "score": <num> }, ... up to 2 ],
--        "last_recap":  { "recap_md": <text>, "at": <ts> } | null,
--        "homework":    { "open_count": <int>, "done_count": <int> },
--        "checkin":     { "focus": <text>, "condition": <text>, "note": <text>,
--                         "at": <ts> } | null,
--        "flags":       [ "first_lesson"?, "injury"?, "minor"? ]
--      }
--    Educator-only. Stable error codes: not_authenticated / not_authorized /
--    not_found.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_lesson_briefing(
  p_lesson_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller       uuid := (SELECT auth.uid());
  v_lesson       public.pickleball_lessons;
  v_player       jsonb;
  v_weak         jsonb := '[]'::jsonb;
  v_last_recap   jsonb := NULL;
  v_open_count   int := 0;
  v_done_count   int := 0;
  v_checkin      jsonb := NULL;
  v_flags        jsonb := '[]'::jsonb;
  v_earliest_id  uuid;
  v_dob          date;
  v_slugs        text[] := ARRAY[
    'serve', 'return', 'dink', 'third_shot_drop', 'drive', 'volley_reset',
    'lob_overhead', 'footwork', 'court_positioning', 'strategy'
  ];
  v_slug         text;
  v_latest       jsonb := '{}'::jsonb;
  v_skill_last   numeric;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_lesson FROM public.pickleball_lessons WHERE id = p_lesson_id;
  IF v_lesson.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  -- Educator-only (the player gets their own check-in surface, not the
  -- briefing).
  IF NOT (
    public.is_teacher_of_course(v_caller, v_lesson.course_id)
    OR public.is_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Player snapshot: name from profiles + intake fields from the player profile.
  SELECT jsonb_build_object(
           'id',            v_lesson.player_id,
           'name',          COALESCE(NULLIF(btrim(pr.display_name), ''), 'Player'),
           'goal',          pp.goal,
           'skill_level',   pp.skill_level,
           'dupr',          pp.dupr,
           'dominant_hand', pp.dominant_hand,
           'years_played',  pp.years_played
         ),
         pp.dob
  INTO v_player, v_dob
  FROM public.profiles pr
  LEFT JOIN public.pickleball_player_profiles pp
    ON pp.course_id = v_lesson.course_id
   AND pp.student_id = v_lesson.player_id
  WHERE pr.id = v_lesson.player_id;

  IF v_player IS NULL THEN
    v_player := jsonb_build_object('id', v_lesson.player_id, 'name', 'Player');
  END IF;

  -- Latest non-null score per skill, then pick the lowest 2 as weak skills.
  FOREACH v_slug IN ARRAY v_slugs LOOP
    SELECT (a.scores -> v_slug)::numeric
    INTO v_skill_last
    FROM public.pickleball_assessments a
    WHERE a.course_id = v_lesson.course_id
      AND a.player_id = v_lesson.player_id
      AND a.scores ? v_slug
      AND jsonb_typeof(a.scores -> v_slug) = 'number'
    ORDER BY a.created_at DESC
    LIMIT 1;

    IF v_skill_last IS NOT NULL THEN
      v_latest := v_latest || jsonb_build_object(v_slug, v_skill_last);
    END IF;
  END LOOP;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object('slug', key, 'score', (value)::numeric)
             ORDER BY (value)::numeric ASC, key ASC
           ),
           '[]'::jsonb
         )
  INTO v_weak
  FROM (
    SELECT key, value
    FROM jsonb_each(v_latest)
    ORDER BY (value)::numeric ASC, key ASC
    LIMIT 2
  ) lowest;

  -- Most recent recap (a recapped lesson with a non-empty recap_md).
  SELECT jsonb_build_object('recap_md', l.recap_md, 'at', l.updated_at)
  INTO v_last_recap
  FROM public.pickleball_lessons l
  WHERE l.course_id = v_lesson.course_id
    AND l.player_id = v_lesson.player_id
    AND l.recap_md IS NOT NULL
    AND btrim(l.recap_md) <> ''
  ORDER BY l.updated_at DESC
  LIMIT 1;

  -- Homework counts for this player in this course.
  SELECT
    COUNT(*) FILTER (WHERE status = 'assigned'),
    COUNT(*) FILTER (WHERE status = 'done')
  INTO v_open_count, v_done_count
  FROM public.pickleball_homework
  WHERE course_id = v_lesson.course_id
    AND player_id = v_lesson.player_id;

  -- This lesson's check-in (if the player has submitted one).
  IF v_lesson.checkin_at IS NOT NULL THEN
    v_checkin := jsonb_build_object(
      'focus',     v_lesson.checkin_focus,
      'condition', v_lesson.checkin_condition,
      'note',      v_lesson.checkin_note,
      'at',        v_lesson.checkin_at
    );
  END IF;

  -- Flags.
  -- first_lesson: this is the player's earliest scheduled lesson in the course.
  SELECT l.id
  INTO v_earliest_id
  FROM public.pickleball_lessons l
  WHERE l.course_id = v_lesson.course_id
    AND l.player_id = v_lesson.player_id
    AND l.scheduled_at IS NOT NULL
  ORDER BY l.scheduled_at ASC, l.created_at ASC
  LIMIT 1;

  IF v_earliest_id = v_lesson.id THEN
    v_flags := v_flags || to_jsonb('first_lesson'::text);
  END IF;

  IF v_lesson.checkin_condition = 'injured' THEN
    v_flags := v_flags || to_jsonb('injury'::text);
  END IF;

  -- minor: player under 18 (only when dob is known).
  IF v_dob IS NOT NULL AND v_dob > (CURRENT_DATE - INTERVAL '18 years') THEN
    v_flags := v_flags || to_jsonb('minor'::text);
  END IF;

  RETURN jsonb_build_object(
    'lesson', jsonb_build_object(
      'id',           v_lesson.id,
      'scheduled_at', v_lesson.scheduled_at,
      'duration_min', v_lesson.duration_min,
      'location',     v_lesson.location,
      'status',       v_lesson.status,
      'plan_md',      v_lesson.plan_md
    ),
    'player',      v_player,
    'weak_skills', v_weak,
    'last_recap',  v_last_recap,
    'homework',    jsonb_build_object(
      'open_count', v_open_count,
      'done_count', v_done_count
    ),
    'checkin',     v_checkin,
    'flags',       v_flags
  );
END;
$$;
REVOKE ALL ON FUNCTION public.pk_lesson_briefing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_lesson_briefing(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0158_pickleball_coach_efficiency.sql
-- =============================================================================
