-- =============================================================================
-- Migration: 0143_test_module_windows.sql
-- Purpose:   Teacher-controlled PARTIAL / SCHEDULED module deployment of full
--            tests. A teacher can (a) STAGGER a full test's modules over days
--            ("RW M1 today, RW M2 tomorrow") and/or (b) deploy a permanent
--            SUBSET ("RW only" = positions 1-2 as a complete 2-module test).
--
--   Design: docs/PLAN_PARTIAL_MODULE_DEPLOYMENT.md. The integrity spine is
--   UNCHANGED — exactly ONE test_runs row per (user, test), enforced by the
--   existing partial unique index `test_runs_one_active` (0048). A metered run
--   simply stays in_progress across days; it never spawns a second run, so a
--   student can NEVER be "taking the same test twice". This migration adds a
--   per-(course, test, module-position) release schedule and gates module
--   fetch/submit on it, server-side. Finalization keys off a per-run SNAPSHOT
--   of the deployed range (captured at run creation) so a teacher editing the
--   schedule mid-flight cannot move an in-flight student's finish line.
--
--   Permanent subsets: section_scores naturally contains only the answered
--   section(s); viewer/src/fulltest/satScore.ts already returns total=null when
--   a section is absent (a RW-only test = a 200-800 R&W section score, not a
--   400-1600 composite). No new scoring code needed.
--
--   Back-compat keystone: a test with ZERO window rows (the one-click
--   assign_test_to_course path, 0089) ⇒ every position open immediately,
--   scheduled range = 1..max ⇒ behaviour byte-identical to pre-0143. The
--   existing clickthrough harness proves this.
--
--   Replaces the LATEST definitions: start_test (0141), get_test_module (0086),
--   submit_test_module (0073). Each is reproduced verbatim and only the gating
--   + finalization-range + duration logic is added — proctor pause (0102),
--   eliminated choices (0073), marks/highlights/notes (0086), module_timing
--   (0080), one-attempt + enrollment gate (0141) are all preserved.
--
--   Adaptive note: the seeded DSAT forms are NOT adaptive (one M2 per section,
--   0049+), so metering R&W days before Math cannot break adaptive routing that
--   doesn't exist. The estimated scaled score is per-section and already
--   labelled "estimated" everywhere it surfaces.
--
--   Forward-only. NOT YET APPLIED to remote (branch feat/test-access-policy).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schedule table (per course × test × module position)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.test_module_windows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  test_id         uuid NOT NULL REFERENCES public.tests(id)   ON DELETE CASCADE,
  module_position integer NOT NULL,            -- 1..max(test_modules.position)
  deployed        boolean NOT NULL DEFAULT true,  -- false ⇒ excluded from this course's deployment
  opens_at        timestamptz,                 -- NULL ⇒ open immediately
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, test_id, module_position)
);

CREATE INDEX IF NOT EXISTS test_module_windows_lookup
  ON public.test_module_windows (course_id, test_id, module_position);

-- RLS on, NO policies: only the SECURITY DEFINER RPCs below touch this table.
-- A student cannot read the raw schedule via PostgREST (they receive opens_at
-- only as echoed by start_test for their own enrolled course).
ALTER TABLE public.test_module_windows ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. Run columns — additive snapshots (no existing column touched)
-- -----------------------------------------------------------------------------
ALTER TABLE public.test_runs
  ADD COLUMN IF NOT EXISTS course_id               uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_first_position integer,   -- NULL ⇒ legacy full-test run
  ADD COLUMN IF NOT EXISTS scheduled_last_position  integer;   -- NULL ⇒ finalize at max(position)

-- -----------------------------------------------------------------------------
-- 3. Window helper (NOT granted — internal). Returns the deployment state of
--    one module for the course the run is bound to. Staff ⇒ always open/full.
--    No window row for the course ⇒ deployed + open (back-compat).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._test_module_window(
  p_uid uuid, p_course_id uuid, p_test_id uuid, p_position integer
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_w public.test_module_windows%ROWTYPE;
BEGIN
  IF public.is_staff(p_uid) THEN
    RETURN jsonb_build_object('deployed', true, 'opens_at', NULL, 'open', true);
  END IF;
  IF p_course_id IS NULL THEN
    RETURN jsonb_build_object('deployed', true, 'opens_at', NULL, 'open', true);
  END IF;
  SELECT * INTO v_w FROM public.test_module_windows
   WHERE course_id = p_course_id AND test_id = p_test_id AND module_position = p_position;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('deployed', true, 'opens_at', NULL, 'open', true);
  END IF;
  RETURN jsonb_build_object(
    'deployed', v_w.deployed,
    'opens_at', v_w.opens_at,
    'open', v_w.deployed AND (v_w.opens_at IS NULL OR v_w.opens_at <= now())
  );
END;
$$;
REVOKE ALL ON FUNCTION public._test_module_window(uuid, uuid, uuid, integer) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 4. start_test — 0141 verbatim + course binding, deployed-range snapshot, and
--    per-module opens_at/deployed in the payload.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_test(p_slug text)
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_test FROM public.tests WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'test_not_found'; END IF;

  -- (a) Enrollment gate (0141) — non-staff must be enrolled in a course that
  -- links this test. Collect those courses; we also use them to bind the run.
  IF NOT public.is_staff(v_uid) THEN
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

  -- 1. Resume an in-progress run (never window-blocked — the gate is on fetching
  --    a not-yet-reached module, not on resuming an existing run).
  SELECT * INTO v_run FROM public.test_runs
   WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
   ORDER BY started_at DESC LIMIT 1;
  v_have := FOUND;

  -- 2. One-attempt — STUDENTS ONLY, non-'unlimited' tests (0141).
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

  -- 3. Create a new run. Bind it to ONE course and snapshot the deployed range.
  IF NOT v_have THEN
    IF public.is_staff(v_uid) THEN
      -- Staff preview: ungated, full test.
      v_course := NULL;
      SELECT min(position), max(position) INTO v_first, v_last
        FROM public.test_modules WHERE test_id = v_test.id;
    ELSE
      -- Pick the binding course. If >1 enrolled course has a metered schedule
      -- for this test, the deployment is genuinely ambiguous — make the teacher
      -- disambiguate rather than silently picking a schedule.
      SELECT array_agg(DISTINCT course_id) INTO v_metered
        FROM public.test_module_windows
       WHERE test_id = v_test.id AND course_id = ANY(v_courses);
      IF v_metered IS NOT NULL AND array_length(v_metered, 1) > 1 THEN
        RAISE EXCEPTION 'ambiguous_course_enrollment'
          USING HINT = 'This test is scheduled differently in two of your courses.';
      END IF;
      v_course := COALESCE(v_metered[1], (SELECT min(x) FROM unnest(v_courses) x));

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
         scheduled_first_position, scheduled_last_position)
      VALUES (v_uid, v_test.id, v_course, v_first, v_first, v_last)
      RETURNING * INTO v_run;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_run FROM public.test_runs
       WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
       ORDER BY started_at DESC LIMIT 1;
    END;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run.id,
    'status', v_run.status,
    'current_module', v_run.current_module,
    'started_at', v_run.started_at,
    'first_position', v_run.scheduled_first_position,
    'last_position', v_run.scheduled_last_position,
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
REVOKE ALL ON FUNCTION public.start_test(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_test(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. get_test_module — 0086 verbatim + window gate + multi-day timer re-anchor.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_test_module(p_run_id uuid, p_position integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.test_runs%ROWTYPE;
  v_mod public.test_modules%ROWTYPE;
  v_started timestamptz;
  v_remaining integer;
  v_win jsonb;
  v_has_answers boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_run.status <> 'in_progress' THEN RAISE EXCEPTION 'run_already_submitted'; END IF;
  IF p_position > v_run.current_module THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  SELECT m.* INTO v_mod FROM public.test_modules m
   WHERE m.test_id = v_run.test_id AND m.position = p_position;
  IF NOT FOUND THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  -- Window gate — only the module the student is about to ENTER (== current).
  -- Past modules (p_position < current) are already done; never re-gate them.
  IF p_position = v_run.current_module THEN
    v_win := public._test_module_window(v_uid, v_run.course_id, v_run.test_id, p_position);
    IF NOT (v_win->>'deployed')::boolean THEN
      RAISE EXCEPTION 'module_not_deployed';
    END IF;
    IF NOT (v_win->>'open')::boolean THEN
      RAISE EXCEPTION 'module_not_yet_open' USING DETAIL = COALESCE(v_win->>'opens_at', '');
    END IF;

    -- Timer re-anchor: if the student opened this module previously (timer set)
    -- but recorded NO answers, and time has since elapsed (e.g. tapped Begin,
    -- left for a day, came back after the window opened), restart the clock so
    -- they get the full limit rather than 0 → instant auto-submit.
    SELECT EXISTS (
      SELECT 1 FROM public.test_run_answers a
       WHERE a.run_id = v_run.id AND a.module_position = p_position
    ) INTO v_has_answers;

    IF v_run.current_module_started_at IS NULL OR NOT v_has_answers THEN
      UPDATE public.test_runs SET current_module_started_at = now()
       WHERE id = v_run.id RETURNING current_module_started_at INTO v_started;
    ELSE
      v_started := v_run.current_module_started_at;
    END IF;
    v_remaining := greatest(0,
      v_mod.time_limit_seconds - floor(extract(epoch FROM (now() - v_started)))::int);
  ELSE
    v_remaining := 0;
  END IF;

  RETURN jsonb_build_object(
    'module', jsonb_build_object(
      'position', v_mod.position, 'section', v_mod.section, 'label', v_mod.label,
      'time_limit_seconds', v_mod.time_limit_seconds, 'question_count', v_mod.question_count),
    'seconds_remaining', v_remaining,
    'saved_answers', (
      SELECT coalesce(jsonb_object_agg(a.question_id::text, a.chosen)
                        FILTER (WHERE a.chosen IS NOT NULL), '{}'::jsonb)
      FROM public.test_run_answers a
      JOIN public.test_questions tq ON tq.id = a.question_id
      WHERE a.run_id = v_run.id AND tq.module_id = v_mod.id),
    'saved_eliminations', (
      SELECT coalesce(jsonb_object_agg(a.question_id::text, to_jsonb(a.eliminated))
                        FILTER (WHERE array_length(a.eliminated, 1) > 0), '{}'::jsonb)
      FROM public.test_run_answers a
      JOIN public.test_questions tq ON tq.id = a.question_id
      WHERE a.run_id = v_run.id AND tq.module_id = v_mod.id),
    'saved_marks', (
      SELECT coalesce(jsonb_agg(a.question_id::text) FILTER (WHERE a.marked), '[]'::jsonb)
      FROM public.test_run_answers a
      JOIN public.test_questions tq ON tq.id = a.question_id
      WHERE a.run_id = v_run.id AND tq.module_id = v_mod.id),
    'saved_highlights', (
      SELECT coalesce(jsonb_object_agg(a.question_id::text, a.highlights)
                        FILTER (WHERE jsonb_array_length(a.highlights) > 0), '{}'::jsonb)
      FROM public.test_run_answers a
      JOIN public.test_questions tq ON tq.id = a.question_id
      WHERE a.run_id = v_run.id AND tq.module_id = v_mod.id),
    'saved_notes', (
      SELECT coalesce(jsonb_object_agg(a.question_id::text, to_jsonb(a.note))
                        FILTER (WHERE a.note IS NOT NULL AND a.note <> ''), '{}'::jsonb)
      FROM public.test_run_answers a
      JOIN public.test_questions tq ON tq.id = a.question_id
      WHERE a.run_id = v_run.id AND tq.module_id = v_mod.id),
    'questions', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id, 'ref', q.ref, 'number', q.number, 'type', q.type,
        'section', v_mod.section, 'passage', q.passage, 'passage_alt', q.passage_alt,
        'stem', q.stem, 'choices', q.choices, 'figure', q.figure
      ) ORDER BY q.position), '[]'::jsonb)
      FROM public.test_questions q WHERE q.module_id = v_mod.id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_test_module(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_module(uuid, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. submit_test_module — 0073 verbatim + submit-side window gate, snapshot
--    finalization range, and module_timing-summed duration (exam time, not the
--    multi-day wall clock between started_at and finalize).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_test_module(
  p_run_id uuid, p_position integer, p_answers jsonb,
  p_eliminated jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.test_runs%ROWTYPE;
  v_mod public.test_modules%ROWTYPE;
  v_final_pos integer;
  v_chosen text;
  v_elim text[];
  v_correct boolean;
  v_answered integer := 0;
  v_score integer;
  v_total integer;
  v_elapsed integer;
  v_timed_out boolean := false;
  v_grace constant integer := 120;
  v_win jsonb;
  q RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_run.status <> 'in_progress' THEN RAISE EXCEPTION 'run_already_submitted'; END IF;
  IF p_position <> v_run.current_module THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  -- Defense in depth: a not-yet-open (or not-deployed) module can't be submitted
  -- even if its questions were obtained out-of-band. (get_test_module is the
  -- first gate; this is the second.)
  v_win := public._test_module_window(v_uid, v_run.course_id, v_run.test_id, p_position);
  IF NOT (v_win->>'deployed')::boolean THEN RAISE EXCEPTION 'module_not_deployed'; END IF;
  IF NOT (v_win->>'open')::boolean THEN
    RAISE EXCEPTION 'module_not_yet_open' USING DETAIL = COALESCE(v_win->>'opens_at', '');
  END IF;

  SELECT m.* INTO v_mod FROM public.test_modules m
   WHERE m.test_id = v_run.test_id AND m.position = p_position;
  IF NOT FOUND THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  IF v_run.current_module_started_at IS NOT NULL THEN
    v_elapsed := floor(extract(epoch FROM (now() - v_run.current_module_started_at)))::int;
    v_timed_out := v_elapsed > v_mod.time_limit_seconds + v_grace;
  ELSE
    v_elapsed := NULL;
  END IF;

  FOR q IN
    SELECT * FROM public.test_questions WHERE module_id = v_mod.id ORDER BY position
  LOOP
    v_chosen := nullif(btrim(coalesce(p_answers ->> q.id::text, '')), '');
    v_elim := ARRAY(SELECT jsonb_array_elements_text(
                      coalesce(p_eliminated -> q.id::text, '[]'::jsonb)));
    v_correct := public._grade_answer(q.type, q.correct_answer, q.accepted, v_chosen);
    IF v_chosen IS NOT NULL THEN v_answered := v_answered + 1; END IF;
    INSERT INTO public.test_run_answers (run_id, question_id, module_position, chosen, eliminated, is_correct)
    VALUES (v_run.id, q.id, p_position, v_chosen, v_elim, v_correct)
    ON CONFLICT (run_id, question_id) DO UPDATE
      SET chosen = EXCLUDED.chosen, eliminated = EXCLUDED.eliminated,
          is_correct = EXCLUDED.is_correct, answered_at = now();
  END LOOP;

  UPDATE public.test_runs SET module_timing = module_timing || jsonb_build_object(
    p_position::text, jsonb_build_object(
      'elapsed_seconds', v_elapsed,
      'limit_seconds', v_mod.time_limit_seconds,
      'timed_out', v_timed_out,
      'answered', v_answered,
      'submitted_at', now()))
   WHERE id = v_run.id;

  -- Finalization boundary = the per-run SNAPSHOT (deployed last position),
  -- NOT a live max(position) — so a subset run finalizes at its own last
  -- module and a mid-flight schedule edit can't move the finish line.
  v_final_pos := COALESCE(
    v_run.scheduled_last_position,
    (SELECT max(position) FROM public.test_modules WHERE test_id = v_run.test_id));

  IF p_position >= v_final_pos THEN
    SELECT count(*) FILTER (WHERE a.is_correct), count(*)
      INTO v_score, v_total
      FROM public.test_run_answers a WHERE a.run_id = v_run.id;
    UPDATE public.test_runs SET
      status = 'submitted',
      submitted_at = now(),
      current_module = p_position,
      current_module_started_at = NULL,
      score = v_score,
      total = v_total,
      -- Sum the per-module exam time (handles multi-day metered runs); fall
      -- back to wall-clock for any legacy run lacking module_timing entries.
      duration_seconds = GREATEST(0, COALESCE((
        SELECT sum((e.value->>'elapsed_seconds')::int)
          FROM public.test_runs r2, jsonb_each(COALESCE(r2.module_timing, '{}'::jsonb)) e
         WHERE r2.id = v_run.id AND e.value->>'elapsed_seconds' IS NOT NULL
      ), floor(extract(epoch FROM (now() - started_at)))::int)),
      section_scores = (
        SELECT jsonb_object_agg(s.section, jsonb_build_object('correct', s.correct, 'total', s.total))
        FROM (
          SELECT m.section,
                 count(*) FILTER (WHERE a.is_correct) AS correct,
                 count(*) AS total
            FROM public.test_run_answers a
            JOIN public.test_questions tq ON tq.id = a.question_id
            JOIN public.test_modules m ON m.id = tq.module_id
           WHERE a.run_id = v_run.id
           GROUP BY m.section
        ) s)
     WHERE id = v_run.id;
    RETURN jsonb_build_object('finished', true, 'run_id', v_run.id,
      'score', v_score, 'total', v_total, 'timed_out', v_timed_out);
  ELSE
    UPDATE public.test_runs SET
      current_module = p_position + 1,
      current_module_started_at = NULL
     WHERE id = v_run.id;
    RETURN jsonb_build_object('finished', false, 'next_module', p_position + 1,
      'answered', v_answered, 'timed_out', v_timed_out,
      'next_module_opens_at', (
        (public._test_module_window(v_uid, v_run.course_id, v_run.test_id, p_position + 1))->>'opens_at'));
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_test_module(uuid, integer, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_test_module(uuid, integer, jsonb, jsonb) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0143_test_module_windows.sql
-- =============================================================================
