-- =============================================================================
-- Migration: 0211_test_time_mode.sql
-- Purpose:   Per-run TIME MODE + student-initiated timer pause + copied-text
--            capture, so the educator can choose how a test behaves when the
--            student saves-and-leaves:
--
--   • 'unlimited' (DEFAULT) — the section timer PAUSES while the student is
--     away (tab hidden / closed / reopened later). Homework / practice mentality:
--     leaving doesn't burn the clock. Implemented with a NEW `self_paused_at`
--     column (distinct from the proctor `paused_at` from 0102 — a student may
--     lift their OWN pause, but only the teacher may lift a proctor pause).
--   • 'strict' — the timer keeps running on wall-clock exactly like today (real
--     exam: the clock doesn't stop for a bathroom break). Expiry is finalized by
--     the cron sweep in 0211 "with or without" the student.
--
--   The mode is chosen by the educator per OCCURRENCE and carried in the test
--   link's query string (`/test/<slug>?m=<first>-<last>&tm=strict`), parsed by
--   the client and passed to start_test, then frozen onto the run at creation.
--
--   Also: `test_log_proctor_event` gains a `p_meta jsonb` param so a captured
--   copy/cut SELECTION can be stored (the educator asked to see "what exactly
--   they copied"). The events table already has an unused `meta jsonb` column
--   (0108) — this wires the writer to it. get_test_result returns the run's
--   module range + time_mode so the review screen can scope/label correctly.
--
-- Forward-only. start_test + test_log_proctor_event are DROP+CREATE (signature
-- changes — a 4th / 6th DEFAULTed arg would otherwise be ambiguous with the old
-- arity; see the 0157 lesson). get_test_result + get_test_module unchanged in
-- shape (CREATE OR REPLACE, additive keys only).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. test_runs: time mode + student self-pause stamp
-- -----------------------------------------------------------------------------
ALTER TABLE public.test_runs
  ADD COLUMN IF NOT EXISTS time_mode text NOT NULL DEFAULT 'unlimited'
    CHECK (time_mode IN ('unlimited', 'strict')),
  -- Non-NULL while the student has stepped away during an 'unlimited' run; the
  -- clock is frozen for the duration. Lifted (and current_module_started_at
  -- shifted forward by the away interval) when they return. Kept SEPARATE from
  -- proctor `paused_at` so the two pause sources don't clobber each other.
  ADD COLUMN IF NOT EXISTS self_paused_at timestamptz;

-- -----------------------------------------------------------------------------
-- 2. test_self_pause(run, paused) — student freezes/unfreezes their OWN timer
--    (only for an 'unlimited' run; a 'strict' run can never self-pause). Mirrors
--    the proctor pause shift from 0102, but owner-scoped and on self_paused_at.
--    Best-effort: returns false (never raises) for a run the caller doesn't own
--    or that isn't an in-progress unlimited run, so it can be fired from
--    visibility handlers without ever disrupting the test.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.test_self_pause(p_run_id uuid, p_paused boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.test_runs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_run.user_id <> v_uid THEN RETURN false; END IF;
  IF v_run.status <> 'in_progress' THEN RETURN false; END IF;
  IF v_run.time_mode <> 'unlimited' THEN RETURN false; END IF;

  IF p_paused THEN
    IF v_run.self_paused_at IS NULL THEN
      UPDATE public.test_runs SET self_paused_at = now() WHERE id = p_run_id;
    END IF;
  ELSE
    IF v_run.self_paused_at IS NOT NULL THEN
      UPDATE public.test_runs
         SET current_module_started_at =
               current_module_started_at + (now() - self_paused_at),
             self_paused_at = NULL,
             last_seen_at   = now()
       WHERE id = p_run_id;
    END IF;
  END IF;

  RETURN p_paused;
EXCEPTION WHEN OTHERS THEN
  RETURN false;  -- never break a sitting over a pause poll
END;
$$;
REVOKE ALL ON FUNCTION public.test_self_pause(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_self_pause(uuid, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. start_test — accept p_time_mode and freeze it onto the run at creation.
--    DROP the 3-arg signature (a 4th DEFAULTed arg would be ambiguous with it)
--    and recreate. Body identical to 0156 except: validate p_time_mode, write
--    it on both INSERT paths, and return it. (1/2/3/4-arg calls all resolve to
--    this single all-defaulted function.)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.start_test(text, integer, integer);

CREATE OR REPLACE FUNCTION public.start_test(
  p_slug text,
  p_first integer DEFAULT NULL,
  p_last integer DEFAULT NULL,
  p_time_mode text DEFAULT 'unlimited'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_test       public.tests%ROWTYPE;
  v_run        public.test_runs%ROWTYPE;
  v_have       boolean := false;
  v_can_retake boolean;
  v_courses    uuid[];
  v_metered    uuid[];
  v_course     uuid;
  v_win_count  integer;
  v_first      integer;
  v_last       integer;
  v_subset     boolean := (p_first IS NOT NULL AND p_last IS NOT NULL);
  v_mode       text := CASE WHEN p_time_mode IN ('unlimited', 'strict')
                            THEN p_time_mode ELSE 'unlimited' END;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_test FROM public.tests WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'test_not_found'; END IF;

  IF NOT public.is_staff(v_uid) THEN
    IF v_subset THEN
      SELECT array_agg(DISTINCT c.id) INTO v_courses
        FROM public.course_memberships cm
        JOIN public.courses          c    ON c.id = cm.course_id
        JOIN public.course_modules   cmod ON cmod.course_id = cm.course_id
        JOIN public.module_items     mi   ON mi.module_id   = cmod.id
       WHERE cm.student_id = v_uid
         AND mi.item_type  = 'link'
         AND mi.url ILIKE '%/test/' || v_test.slug || '?m=' || p_first || '-' || p_last || '%';
      IF v_courses IS NULL OR array_length(v_courses, 1) IS NULL THEN
        RAISE EXCEPTION 'not_enrolled'
          USING HINT = 'You must be enrolled in a course that assigns this module.';
      END IF;
    ELSE
      SELECT array_agg(DISTINCT c.id) INTO v_courses
        FROM public.course_memberships cm
        JOIN public.courses          c    ON c.id = cm.course_id
        JOIN public.course_modules   cmod ON cmod.course_id = cm.course_id
        JOIN public.module_items     mi   ON mi.module_id   = cmod.id
       WHERE cm.student_id = v_uid
         AND mi.item_type  = 'link'
         AND mi.url ILIKE '%/test/' || v_test.slug || '%';
      IF v_courses IS NULL OR array_length(v_courses, 1) IS NULL THEN
        RAISE EXCEPTION 'not_enrolled'
          USING HINT = 'You must be enrolled in a course that assigns this test.';
      END IF;
    END IF;
  END IF;

  -- ===========================================================================
  -- SUBSET PATH (a ?m=<first>-<last> link)
  -- ===========================================================================
  IF v_subset THEN
    v_first := p_first; v_last := p_last;

    SELECT * INTO v_run FROM public.test_runs
     WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
       AND scheduled_first_position = v_first AND scheduled_last_position = v_last
     ORDER BY started_at DESC LIMIT 1;
    v_have := FOUND;

    IF NOT v_have AND NOT public.is_staff(v_uid) AND v_test.retake_policy <> 'unlimited' THEN
      SELECT * INTO v_run FROM public.test_runs
       WHERE user_id = v_uid AND test_id = v_test.id AND status = 'submitted'
         AND scheduled_first_position = v_first AND scheduled_last_position = v_last
       ORDER BY submitted_at DESC LIMIT 1;
      IF FOUND THEN
        SELECT EXISTS (
          SELECT 1 FROM public.test_retake_grants g
           WHERE g.user_id = v_uid AND g.test_id = v_test.id
             AND g.granted_at > v_run.submitted_at
        ) INTO v_can_retake;
        v_have := NOT v_can_retake;
      END IF;
    END IF;

    IF public.is_staff(v_uid) THEN
      v_course := NULL;
    ELSE
      v_course := (SELECT x FROM unnest(v_courses) AS x ORDER BY x LIMIT 1);
    END IF;

    IF NOT v_have THEN
      BEGIN
        INSERT INTO public.test_runs
          (user_id, test_id, course_id, current_module,
           scheduled_first_position, scheduled_last_position, time_mode)
        VALUES (v_uid, v_test.id, v_course, v_first, v_first, v_last, v_mode)
        RETURNING * INTO v_run;
      EXCEPTION WHEN unique_violation THEN
        SELECT * INTO v_run FROM public.test_runs
         WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
           AND scheduled_first_position = v_first AND scheduled_last_position = v_last
         ORDER BY started_at DESC LIMIT 1;
      END;
    END IF;

  -- ===========================================================================
  -- FULL / METERED PATH (plain /test/<slug> link)
  -- ===========================================================================
  ELSE
    SELECT * INTO v_run FROM public.test_runs
     WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
     ORDER BY started_at DESC LIMIT 1;
    v_have := FOUND;

    IF NOT v_have AND NOT public.is_staff(v_uid) AND v_test.retake_policy <> 'unlimited' THEN
      SELECT * INTO v_run FROM public.test_runs
       WHERE user_id = v_uid AND test_id = v_test.id AND status = 'submitted'
       ORDER BY submitted_at DESC LIMIT 1;
      IF FOUND THEN
        SELECT EXISTS (
          SELECT 1 FROM public.test_retake_grants g
           WHERE g.user_id = v_uid AND g.test_id = v_test.id
             AND g.granted_at > v_run.submitted_at
        ) INTO v_can_retake;
        v_have := NOT v_can_retake;
      END IF;
    END IF;

    IF NOT v_have THEN
      IF public.is_staff(v_uid) THEN
        v_course := NULL;
        SELECT min(position), max(position) INTO v_first, v_last
          FROM public.test_modules WHERE test_id = v_test.id;
      ELSE
        SELECT array_agg(DISTINCT course_id) INTO v_metered
          FROM public.test_module_windows
         WHERE test_id = v_test.id AND course_id = ANY(v_courses);
        IF v_metered IS NOT NULL AND array_length(v_metered, 1) > 1 THEN
          RAISE EXCEPTION 'ambiguous_course_enrollment'
            USING HINT = 'This test is scheduled differently in two of your courses.';
        END IF;
        v_course := COALESCE(v_metered[1],
                             (SELECT x FROM unnest(v_courses) AS x ORDER BY x LIMIT 1));
        SELECT count(*) INTO v_win_count
          FROM public.test_module_windows WHERE course_id = v_course AND test_id = v_test.id;
        IF v_win_count = 0 THEN
          SELECT min(position), max(position) INTO v_first, v_last
            FROM public.test_modules WHERE test_id = v_test.id;
        ELSE
          SELECT min(module_position), max(module_position) INTO v_first, v_last
            FROM public.test_module_windows
           WHERE course_id = v_course AND test_id = v_test.id AND deployed;
          IF v_first IS NULL THEN
            RAISE EXCEPTION 'no_modules_deployed';
          END IF;
        END IF;
      END IF;

      BEGIN
        INSERT INTO public.test_runs
          (user_id, test_id, course_id, current_module,
           scheduled_first_position, scheduled_last_position, time_mode)
        VALUES (v_uid, v_test.id, v_course, COALESCE(v_first, 1), v_first, v_last, v_mode)
        RETURNING * INTO v_run;
      EXCEPTION WHEN unique_violation THEN
        SELECT * INTO v_run FROM public.test_runs
         WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
         ORDER BY started_at DESC LIMIT 1;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run.id,
    'status', v_run.status,
    'current_module', v_run.current_module,
    'started_at', v_run.started_at,
    'first_position', v_run.scheduled_first_position,
    'last_position', v_run.scheduled_last_position,
    'time_mode', v_run.time_mode,
    'results_released', (v_run.results_released_at IS NOT NULL),
    'answered', (
      SELECT count(*) FROM public.test_run_answers
       WHERE run_id = v_run.id AND chosen IS NOT NULL),
    'test', jsonb_build_object(
      'slug', v_test.slug, 'title', v_test.title,
      'short_title', v_test.short_title, 'total_questions', v_test.total_questions,
      'retake_policy', v_test.retake_policy),
    'modules', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'position', m.position, 'section', m.section, 'label', m.label,
        'time_limit_seconds', m.time_limit_seconds, 'question_count', m.question_count,
        'deployed', COALESCE(w.deployed, true),
        'opens_at', w.opens_at
      ) ORDER BY m.position), '[]'::jsonb)
      FROM public.test_modules m
      LEFT JOIN public.test_module_windows w
        ON w.test_id = m.test_id AND w.module_position = m.position
       AND w.course_id = v_run.course_id
     WHERE m.test_id = v_test.id),
    'proctoring_level', v_test.proctoring_level
  );
END;
$$;
REVOKE ALL ON FUNCTION public.start_test(text, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_test(text, integer, integer, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. test_log_proctor_event — add p_meta jsonb (store the captured copy/cut
--    selection text). DROP the 5-arg signature, recreate with the 6th DEFAULTed
--    arg. Body identical to 0108 except the INSERT now carries meta.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.test_log_proctor_event(uuid, text, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.test_log_proctor_event(
  p_run_id           uuid,
  p_type             text,
  p_duration_seconds integer DEFAULT NULL,
  p_module           integer DEFAULT NULL,
  p_question         integer DEFAULT NULL,
  p_meta             jsonb   DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_own boolean;
  v_dur integer := COALESCE(p_duration_seconds, 0);
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  IF p_type NOT IN (
       'away', 'focus_loss', 'fullscreen_exit', 'fullscreen_enter',
       'copy', 'paste', 'copy_blocked', 'paste_blocked',
       'contextmenu_blocked', 'devtools') THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.test_runs r WHERE r.id = p_run_id AND r.user_id = v_uid
  ) INTO v_own;
  IF NOT v_own THEN RETURN; END IF;

  INSERT INTO public.test_run_events (run_id, type, module, question, duration_seconds, meta)
  VALUES (p_run_id, p_type, p_module, p_question, p_duration_seconds, p_meta);

  IF p_type = 'away' THEN
    UPDATE public.test_runs
       SET away_count         = away_count + 1,
           away_total_seconds = away_total_seconds + v_dur,
           last_seen_at       = now()
     WHERE id = p_run_id;
  ELSIF p_type = 'focus_loss' THEN
    UPDATE public.test_runs
       SET focus_loss_count   = focus_loss_count + 1,
           focus_loss_seconds = focus_loss_seconds + v_dur
     WHERE id = p_run_id;
  ELSIF p_type IN ('copy', 'paste', 'fullscreen_exit',
                   'copy_blocked', 'paste_blocked',
                   'contextmenu_blocked', 'devtools') THEN
    UPDATE public.test_runs
       SET integrity = jsonb_set(
             COALESCE(integrity, '{}'::jsonb), ARRAY[p_type],
             to_jsonb(COALESCE((integrity ->> p_type)::int, 0) + 1), true)
     WHERE id = p_run_id;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN;  -- telemetry must NEVER break the test
END;
$$;
REVOKE ALL ON FUNCTION public.test_log_proctor_event(uuid, text, integer, integer, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_log_proctor_event(uuid, text, integer, integer, integer, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. get_test_result — return the run's module range + time_mode so the review
--    screen can scope/label a single-module occurrence. CREATE OR REPLACE; body
--    identical to 0121 except three new top-level keys (additive).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_test_result(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.test_runs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.status <> 'submitted' THEN RAISE EXCEPTION 'run_not_submitted'; END IF;

  IF public.is_staff(v_uid) THEN
    NULL;
  ELSIF v_run.user_id = v_uid THEN
    IF v_run.results_released_at IS NULL THEN
      RAISE EXCEPTION 'results_locked'
        USING HINT = 'Your teacher has not released results for this test yet.';
    END IF;
  ELSE
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run.id,
    'score', v_run.score, 'total', v_run.total,
    'duration_seconds', v_run.duration_seconds,
    'section_scores', v_run.section_scores,
    'module_timing', coalesce(v_run.module_timing, '{}'::jsonb),
    'first_position', v_run.scheduled_first_position,
    'last_position', v_run.scheduled_last_position,
    'time_mode', v_run.time_mode,
    'questions', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', tq.id, 'ref', tq.ref, 'number', tq.number, 'type', tq.type,
        'section', m.section, 'module_position', m.position,
        'stem', tq.stem, 'choices', tq.choices, 'figure', tq.figure,
        'passage', tq.passage, 'passage_alt', tq.passage_alt,
        'your_answer', a.chosen, 'correct_answer', tq.correct_answer,
        'accepted', tq.accepted, 'is_correct', a.is_correct,
        'eliminated', to_jsonb(a.eliminated),
        'domain', tq.domain
      ) ORDER BY m.position, tq.position), '[]'::jsonb)
      FROM public.test_run_answers a
      JOIN public.test_questions tq ON tq.id = a.question_id
      JOIN public.test_modules m ON m.id = tq.module_id
     WHERE a.run_id = v_run.id)
  );
END;
$$;

-- =============================================================================
-- END OF MIGRATION 0211_test_time_mode.sql
-- =============================================================================
