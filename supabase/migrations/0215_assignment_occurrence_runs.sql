-- =============================================================================
-- Migration: 0215_assignment_occurrence_runs.sql
-- Purpose:   Distinguish two assignments of the SAME module range ("Module 1"
--            assigned in week 1 and again in week 3). Until now an occurrence
--            was identified by (course, scheduled_first/last_position) — two
--            assignments of the same range were indistinguishable, so:
--              (a) the teacher's roster (test_roster_status) merged their runs
--                  ("you need to consider which item I am on"), and
--              (b) start_test's retake gate blocked the second assignment for
--                  any student who had submitted the first.
--
--   The natural occurrence identity is the module_items row the assignment IS.
--   This migration threads it end-to-end:
--     1. test_runs.module_item_id — which assignment launched the run.
--        Assign-time links now embed `&item=<module_items.id>` (viewer change,
--        same release); the runner passes it to start_test.
--     2. start_test(p_item): validated against the link row (must be a link
--        for this test+range — students can't forge fresh attempts), recorded
--        on the run, and the retake gate keys on it: a second assignment of
--        the same module is a fresh, independent attempt. The one-active-run
--        index is untouched — still at most ONE in-progress run per
--        (user, test, range); an in-progress run from the other occurrence is
--        adopted/resumed exactly as before.
--     3. test_roster_status(p_item): when the overview deep-link carries the
--        item id, each student's shown run is THAT assignment's run. Legacy
--        runs (module_item_id IS NULL, pre-0215) still match by range so
--        historical data keeps appearing; only they remain ambiguous between
--        duplicated occurrences — the pre-0215 status quo.
--
--   Signature changes ⇒ DROP old overloads + CREATE (the candidate-ambiguity
--   lesson from 0157). Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. test_runs.module_item_id — the assignment occurrence that launched the run
-- -----------------------------------------------------------------------------
ALTER TABLE public.test_runs
  ADD COLUMN IF NOT EXISTS module_item_id uuid REFERENCES public.module_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS test_runs_module_item
  ON public.test_runs (module_item_id)
  WHERE module_item_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. start_test — accept + validate + record p_item; occurrence-keyed retake gate
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.start_test(text, integer, integer, text);


CREATE OR REPLACE FUNCTION public.start_test(
  p_slug text,
  p_first integer DEFAULT NULL,
  p_last integer DEFAULT NULL,
  p_time_mode text DEFAULT 'unlimited',
  p_item uuid DEFAULT NULL
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
  v_item       uuid := NULL;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_test FROM public.tests WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'test_not_found'; END IF;

  -- Occurrence identity (0215): honor p_item only when it really is a link
  -- item for THIS test and THIS range — otherwise a student could pass an
  -- arbitrary uuid to dodge the retake gate. Invalid/foreign ids degrade to
  -- NULL (legacy range-keyed behavior). Subset links only.
  IF p_item IS NOT NULL AND v_subset THEN
    IF EXISTS (
      SELECT 1 FROM public.module_items mi
       WHERE mi.id = p_item AND mi.item_type = 'link'
         AND mi.url ILIKE '%/test/' || v_test.slug || '?m=' || p_first || '-' || p_last || '%'
    ) THEN
      v_item := p_item;
    END IF;
  END IF;

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
      -- Occurrence-aware retake gate (0215): when this launch carries an item
      -- id, only THAT assignment's own submission blocks a restart — the same
      -- module assigned a second time is a fresh, independent attempt.
      -- (Legacy runs predate module_item_id and are NULL: they don't block an
      -- item-carrying launch — a one-time transition allowance.)
      SELECT * INTO v_run FROM public.test_runs
       WHERE user_id = v_uid AND test_id = v_test.id AND status = 'submitted'
         AND scheduled_first_position = v_first AND scheduled_last_position = v_last
         AND (v_item IS NULL OR module_item_id = v_item)
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
           scheduled_first_position, scheduled_last_position, time_mode,
           module_item_id)
        VALUES (v_uid, v_test.id, v_course, v_first, v_first, v_last, v_mode,
                v_item)
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

REVOKE ALL ON FUNCTION public.start_test(text, integer, integer, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_test(text, integer, integer, text, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. test_roster_status — optional p_item scopes each student's shown run to
--    one assignment occurrence (legacy NULL-item runs still match by range).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.test_roster_status(text, integer, integer);

CREATE FUNCTION public.test_roster_status(
  p_slug text, p_first integer DEFAULT NULL, p_last integer DEFAULT NULL,
  p_item uuid DEFAULT NULL
)
RETURNS TABLE (
  student_id          uuid,
  student_name        text,
  run_id              uuid,
  score               integer,
  total               integer,
  submitted_at        timestamptz,
  results_released_at timestamptz,
  has_in_progress     boolean,
  course_id           uuid,
  course_name         text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_test_id uuid;
  v_admin   boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_admin := public.is_admin(v_uid);
  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;
  RETURN QUERY
  WITH assigned AS (
    SELECT DISTINCT cm.student_id AS sid, p.display_name AS sname,
                    c.id AS cid, c.name AS cname
      FROM public.module_items mi
      JOIN public.course_modules cmod ON cmod.id = mi.module_id
      JOIN public.courses c ON c.id = cmod.course_id
      JOIN public.course_memberships cm ON cm.course_id = c.id
      JOIN public.profiles p ON p.id = cm.student_id
     WHERE mi.item_type = 'link'
       AND mi.url ILIKE '%/test/' || p_slug || '%'
       AND (v_admin OR c.teacher_id = v_uid)
  )
  SELECT a.sid, a.sname, lr.id, lr.score, lr.total, lr.submitted_at, lr.results_released_at,
         EXISTS (SELECT 1 FROM public.test_runs ip
                  WHERE ip.user_id = a.sid AND ip.test_id = v_test_id
                    AND ip.status = 'in_progress'
                    AND (p_first IS NULL OR ip.scheduled_first_position = p_first)
                    AND (p_last  IS NULL OR ip.scheduled_last_position  = p_last)
                    AND (p_item  IS NULL OR ip.module_item_id = p_item
                         OR ip.module_item_id IS NULL)),
         a.cid, a.cname
    FROM assigned a
    LEFT JOIN LATERAL (
      SELECT r.id, r.score, r.total, r.submitted_at, r.results_released_at
        FROM public.test_runs r
       WHERE r.user_id = a.sid AND r.test_id = v_test_id AND r.status = 'submitted'
         AND (p_first IS NULL OR r.scheduled_first_position = p_first)
         AND (p_last  IS NULL OR r.scheduled_last_position  = p_last)
         -- Occurrence scope (0215): the run this assignment launched, plus
         -- legacy pre-0215 runs (NULL item) that match the range.
         AND (p_item  IS NULL OR r.module_item_id = p_item
              OR r.module_item_id IS NULL)
       ORDER BY (r.module_item_id IS NOT NULL) DESC, r.submitted_at DESC NULLS LAST
       LIMIT 1
    ) lr ON true
   ORDER BY a.cname, (lr.submitted_at IS NULL), a.sname;
END;
$$;
REVOKE ALL ON FUNCTION public.test_roster_status(text, integer, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_roster_status(text, integer, integer, uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0215_assignment_occurrence_runs.sql
-- =============================================================================
