-- =============================================================================
-- Migration: 0156_subset_scoped_runs.sql  (renumbered from 0153 — LINE/guardian took 0153-0155)
-- Purpose:   Let the SAME test be assigned to a course MORE THAN ONCE as
--            independent module-subset attempts — e.g. "RW Module 1" as one
--            Modules item and "RW Module 2" as a separate item, each its own
--            run + its own report.
--
--   Before: a run is keyed by (user, test) — `test_runs_one_active` allowed
--   exactly one in-progress run per (user, test), and start_test resumed ANY
--   run for the pair. So two subset assignments of the same test collapsed to
--   one run: a student who finished Module 1 then opened the "Module 2" item
--   got Module 1's submitted run (and its report) back, with no way to take
--   Module 2 as a separate test.
--
--   After: a run is scoped to its MODULE RANGE. A subset Modules-link carries
--   the range in its URL — `/test/<slug>?m=<first>-<last>` — and start_test
--   accepts (p_first, p_last). When given, resume / one-attempt / create are
--   all scoped to that (first, last), so `?m=1-1` and `?m=2-2` are two
--   independent runs with independent reports. The unique index is relaxed to
--   (user, test, first, last) so both can be in-progress at once.
--
--   *** Backward compatible by construction: when p_first/p_last are NULL
--   (a plain `/test/<slug>` link — the full test, or a metered full test via
--   test_module_windows), start_test behaves EXACTLY as 0146 — same resume,
--   same one-attempt, same windows-derived range, one run. Only a ?m= link
--   takes the new scoped path. ***
--
--   Forward-only. CREATE OR REPLACE (start_test signature gains 2 DEFAULTed
--   args — the 1-arg call still resolves). Index swapped.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Relax the one-active-run index: now one in-progress run per
--    (user, test, module-range) instead of per (user, test). COALESCE so a
--    legacy NULL range still collapses to a single (0,0) slot.
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.test_runs_one_active;
CREATE UNIQUE INDEX IF NOT EXISTS test_runs_one_active
  ON public.test_runs (
    user_id, test_id,
    COALESCE(scheduled_first_position, 0),
    COALESCE(scheduled_last_position, 0)
  )
  WHERE status = 'in_progress';

-- -----------------------------------------------------------------------------
-- 2. start_test — optional module-range scoping (additive; NULL = 0146 behavior)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_test(
  p_slug text, p_first integer DEFAULT NULL, p_last integer DEFAULT NULL
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_test FROM public.tests WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'test_not_found'; END IF;

  -- Enrollment gate (non-staff). For a subset launch, the matching course must
  -- carry the EXACT `?m=<first>-<last>` link — so a student can only run a
  -- range the teacher actually deployed, not a hand-typed one.
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
  -- SUBSET PATH (a ?m=<first>-<last> link): run scoped to the module range.
  -- ===========================================================================
  IF v_subset THEN
    v_first := p_first; v_last := p_last;

    -- 1. Resume an in-progress run for THIS range.
    SELECT * INTO v_run FROM public.test_runs
     WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
       AND scheduled_first_position = v_first AND scheduled_last_position = v_last
     ORDER BY started_at DESC LIMIT 1;
    v_have := FOUND;

    -- 2. One-attempt for THIS range (students, non-'unlimited').
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

    -- 3. Bind to a course carrying the range link (staff preview: NULL course).
    IF public.is_staff(v_uid) THEN
      v_course := NULL;
    ELSE
      v_course := (SELECT x FROM unnest(v_courses) AS x ORDER BY x LIMIT 1);
    END IF;

    IF NOT v_have THEN
      BEGIN
        INSERT INTO public.test_runs
          (user_id, test_id, course_id, current_module,
           scheduled_first_position, scheduled_last_position)
        VALUES (v_uid, v_test.id, v_course, v_first, v_first, v_last)
        RETURNING * INTO v_run;
      EXCEPTION WHEN unique_violation THEN
        SELECT * INTO v_run FROM public.test_runs
         WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
           AND scheduled_first_position = v_first AND scheduled_last_position = v_last
         ORDER BY started_at DESC LIMIT 1;
      END;
    END IF;

  -- ===========================================================================
  -- FULL / METERED PATH (plain /test/<slug> link): identical to 0146.
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
           scheduled_first_position, scheduled_last_position)
        VALUES (v_uid, v_test.id, v_course, COALESCE(v_first, 1), v_first, v_last)
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
REVOKE ALL ON FUNCTION public.start_test(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_test(text, integer, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. get_test_module — add a LOWER-bound range gate so a subset run (e.g. a
--    Module-2-only run starting at position 2) can't serve a module BELOW its
--    range. Otherwise identical to 0143 (upper bound via current_module +
--    window/opens_at gate + timer re-anchor all unchanged).
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
  -- Subset runs start above position 1; a module below the run's range is not
  -- part of this attempt.
  IF p_position < COALESCE(v_run.scheduled_first_position, 1) THEN
    RAISE EXCEPTION 'module_out_of_order';
  END IF;

  SELECT m.* INTO v_mod FROM public.test_modules m
   WHERE m.test_id = v_run.test_id AND m.position = p_position;
  IF NOT FOUND THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  IF p_position = v_run.current_module THEN
    v_win := public._test_module_window(v_uid, v_run.course_id, v_run.test_id, p_position);
    IF NOT (v_win->>'deployed')::boolean THEN
      RAISE EXCEPTION 'module_not_deployed';
    END IF;
    IF NOT (v_win->>'open')::boolean THEN
      RAISE EXCEPTION 'module_not_yet_open' USING DETAIL = COALESCE(v_win->>'opens_at', '');
    END IF;

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

-- =============================================================================
-- END OF MIGRATION 0153_subset_scoped_runs.sql
-- =============================================================================
