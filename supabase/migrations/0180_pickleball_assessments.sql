-- =============================================================================
-- Migration: 0156_pickleball_assessments.sql
-- Description: Player-track skill assessments for the Pickleball feature.
--
-- A coach periodically scores a player on the 10 fixed pickleball skills (the
-- taxonomy lives in viewer/src/lib/pickleballSkills.ts — slugs serve / return /
-- dink / third_shot_drop / drive / volley_reset / lob_overhead / footwork /
-- court_positioning / strategy). Each assessment is an IMMUTABLE snapshot: there
-- is no UPDATE policy and the RPC never UPDATEs an existing row. A correction is
-- a NEW row whose `corrects_id` points back at the row it supersedes, so the
-- skill trajectory always reflects the full history.
--
-- Scores live in a jsonb object keyed by skill slug, value a number 1..5 (the
-- coach's per-skill grade). `overall_level` is the suggested DUPR-style level
-- (auto = average of the skill scores, overridable with a reason). `type`
-- distinguishes an intake baseline, an ongoing progress check, and a formal
-- level-up evaluation.
--
-- Also bolts level bands onto pickleball_programs (level_min / level_max) so the
-- player ProgressCard can render a level-up checklist against their program's
-- target band.
--
-- RLS reuses the existing SECURITY DEFINER helpers (no inline EXISTS over
-- profiles in WITH CHECK, per the project rule):
--   * is_teacher_of_course(uid, course_id) — owner / co-teacher (0130)
--   * is_admin(uid)                          — admin oversight (0001)
--   * player_id = (SELECT auth.uid())        — the player reading their own rows
-- All writes go through pk_ RPCs (SECURITY DEFINER, stable string error codes).
-- person FK columns reference profiles(id), NOT other pickleball tables.
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. pickleball_programs level bands — a program targets a level range, used by
--    the player ProgressCard to render the "ready to level up?" checklist.
-- -----------------------------------------------------------------------------
ALTER TABLE public.pickleball_programs
  ADD COLUMN IF NOT EXISTS level_min numeric,
  ADD COLUMN IF NOT EXISTS level_max numeric;

-- -----------------------------------------------------------------------------
-- 1. pickleball_assessments — one immutable per-player skill snapshot.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_assessments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  player_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id        uuid REFERENCES public.profiles(id),
  type            text NOT NULL CHECK (type IN ('intake', 'progress', 'level_up')),
  scores          jsonb NOT NULL DEFAULT '{}',
  overall_level   numeric,
  override_reason text,
  notes           text,
  corrects_id     uuid REFERENCES public.pickleball_assessments(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickleball_assessments_course_player_idx
  ON public.pickleball_assessments (course_id, player_id, created_at);
ALTER TABLE public.pickleball_assessments ENABLE ROW LEVEL SECURITY;

-- Educator of the course (owner / co-teacher / admin) OR the player themself
-- may READ. Snapshots are immutable: educators INSERT (only) via the policy +
-- the RPC; there is intentionally NO UPDATE/DELETE policy.
DROP POLICY IF EXISTS "pk_assessments: read" ON public.pickleball_assessments;
CREATE POLICY "pk_assessments: read" ON public.pickleball_assessments
  FOR SELECT
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
    OR player_id = (SELECT auth.uid())
  );

-- Only the educator of the course may INSERT (recording an assessment).
DROP POLICY IF EXISTS "pk_assessments: educator inserts" ON public.pickleball_assessments;
CREATE POLICY "pk_assessments: educator inserts" ON public.pickleball_assessments
  FOR INSERT
  WITH CHECK (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  );

-- -----------------------------------------------------------------------------
-- 2. pk_record_assessment — educator records a new assessment snapshot.
--    Validates: scores keys are a subset of the 10 skill slugs and each value
--    is a number in [1, 5]. type ∈ {intake, progress, level_up}.
--    Stable error codes: not_authenticated / not_authorized / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_record_assessment(
  p_course_id       uuid,
  p_player_id       uuid,
  p_type            text,
  p_scores          jsonb   DEFAULT '{}',
  p_overall_level   numeric DEFAULT NULL,
  p_notes           text    DEFAULT NULL,
  p_override_reason text    DEFAULT NULL,
  p_corrects_id     uuid    DEFAULT NULL
)
  RETURNS public.pickleball_assessments
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_assessments;
  v_key    text;
  v_val    jsonb;
  v_num    numeric;
  -- The 10 fixed skill slugs (mirrors viewer/src/lib/pickleballSkills.ts).
  v_slugs  text[] := ARRAY[
    'serve', 'return', 'dink', 'third_shot_drop', 'drive', 'volley_reset',
    'lob_overhead', 'footwork', 'court_positioning', 'strategy'
  ];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_course_id IS NULL OR p_player_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF p_type IS NULL OR p_type NOT IN ('intake', 'progress', 'level_up') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  -- Authorisation: only the educator of the course (or admin).
  IF NOT (
    public.is_teacher_of_course(v_caller, p_course_id)
    OR public.is_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- scores must be a (possibly empty) jsonb object.
  IF p_scores IS NULL OR jsonb_typeof(p_scores) <> 'object' THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  -- Every key must be a known slug; every value must be a number in [1, 5].
  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_scores) LOOP
    IF NOT (v_key = ANY (v_slugs)) THEN
      RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_val) <> 'number' THEN
      RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
    END IF;
    v_num := (v_val)::numeric;
    IF v_num < 1 OR v_num > 5 THEN
      RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- A correction must point at an existing row in the same course.
  IF p_corrects_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.pickleball_assessments a
       WHERE a.id = p_corrects_id AND a.course_id = p_course_id
     ) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pickleball_assessments (
    course_id, player_id, coach_id, type, scores, overall_level,
    override_reason, notes, corrects_id
  )
  VALUES (
    p_course_id, p_player_id, v_caller, p_type, p_scores, p_overall_level,
    p_override_reason, p_notes, p_corrects_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_record_assessment(
  uuid, uuid, text, jsonb, numeric, text, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_record_assessment(
  uuid, uuid, text, jsonb, numeric, text, text, uuid
) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. pk_player_skill_series — latest score per skill + full history.
--    Readable by the educator of the course OR the player themself.
--    Returns jsonb:
--      {
--        "latest":  { "<slug>": <num>, ... },   -- newest non-null score / skill
--        "history": { "<slug>": [ {"at": ts, "score": <num>}, ... ], ... },
--        "overall": { "level": <num>, "at": ts } | null,
--        "count":   <int>                        -- number of assessment rows
--      }
--    Stable error codes: not_authenticated / not_authorized.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_player_skill_series(
  p_course_id uuid,
  p_player_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller    uuid := (SELECT auth.uid());
  v_history   jsonb := '{}'::jsonb;
  v_latest    jsonb := '{}'::jsonb;
  v_overall   jsonb := NULL;
  v_count     int := 0;
  v_slug      text;
  v_slugs     text[] := ARRAY[
    'serve', 'return', 'dink', 'third_shot_drop', 'drive', 'volley_reset',
    'lob_overhead', 'footwork', 'court_positioning', 'strategy'
  ];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT (
    public.is_teacher_of_course(v_caller, p_course_id)
    OR public.is_admin(v_caller)
    OR p_player_id = v_caller
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.pickleball_assessments
  WHERE course_id = p_course_id AND player_id = p_player_id;

  -- Per-skill history (oldest -> newest) + latest non-null score.
  FOREACH v_slug IN ARRAY v_slugs LOOP
    DECLARE
      v_skill_hist jsonb;
      v_skill_last numeric;
    BEGIN
      SELECT
        COALESCE(
          jsonb_agg(
            jsonb_build_object('at', a.created_at, 'score', (a.scores -> v_slug)::numeric)
            ORDER BY a.created_at ASC
          ),
          '[]'::jsonb
        )
      INTO v_skill_hist
      FROM public.pickleball_assessments a
      WHERE a.course_id = p_course_id
        AND a.player_id = p_player_id
        AND a.scores ? v_slug
        AND jsonb_typeof(a.scores -> v_slug) = 'number';

      v_history := v_history || jsonb_build_object(v_slug, v_skill_hist);

      SELECT (a.scores -> v_slug)::numeric
      INTO v_skill_last
      FROM public.pickleball_assessments a
      WHERE a.course_id = p_course_id
        AND a.player_id = p_player_id
        AND a.scores ? v_slug
        AND jsonb_typeof(a.scores -> v_slug) = 'number'
      ORDER BY a.created_at DESC
      LIMIT 1;

      IF v_skill_last IS NOT NULL THEN
        v_latest := v_latest || jsonb_build_object(v_slug, v_skill_last);
      END IF;
    END;
  END LOOP;

  -- Most-recent overall level (if any assessment carried one).
  SELECT jsonb_build_object('level', a.overall_level, 'at', a.created_at)
  INTO v_overall
  FROM public.pickleball_assessments a
  WHERE a.course_id = p_course_id
    AND a.player_id = p_player_id
    AND a.overall_level IS NOT NULL
  ORDER BY a.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'latest', v_latest,
    'history', v_history,
    'overall', v_overall,
    'count', v_count
  );
END;
$$;
REVOKE ALL ON FUNCTION public.pk_player_skill_series(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_player_skill_series(uuid, uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0156_pickleball_assessments.sql
-- =============================================================================
