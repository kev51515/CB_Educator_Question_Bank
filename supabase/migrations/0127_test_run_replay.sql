-- =============================================================================
-- Migration: 0127_test_run_replay.sql
-- Description: get_test_run_replay(run) — one teacher-authorized fetch that
--              powers the proctor REPLAY page: run meta + every module's full
--              content + the ordered action/integrity event stream. The client
--              reconstructs the sitting (answers, colored highlights, notes,
--              eliminations, flags, position, dwell) by replaying the events
--              over the content.
--
--   Auth: the run's OWNER, a teacher of a course administering the test
--   (is_teacher_of_test, 0108), or an admin. SECURITY DEFINER so it can read
--   test_questions (staff-RLS) + auth/profiles regardless of the caller.
--
--   Returns jsonb:
--     { run:      { id, status, started_at, submitted_at, current_module,
--                   proctoring_level, student_id, student_name,
--                   test: { slug, title, short_title } },
--       modules:  [ { position, section, label, time_limit_seconds,
--                     question_count, questions:[ {id,number,type,section,
--                     passage,passage_alt,stem,choices,figure} ] } ],
--       events:   [ { at, type, module, question, duration_seconds, meta } ],
--       final:    { answers, eliminations, marks, highlights, notes } }  -- ground
--                   truth at submit, keyed by question_id (so the replay can
--                   reconcile its reconstruction against the saved state).
--
-- Forward-only. Read-only (no writes); raises stable error codes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_test_run_replay(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.test_runs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;

  -- Owner, teacher-of-test, or admin.
  IF NOT (v_run.user_id = v_uid
          OR public.is_teacher_of_test(v_uid, v_run.test_id)
          OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN jsonb_build_object(
    'run', (
      SELECT jsonb_build_object(
        'id', v_run.id,
        'status', v_run.status,
        'started_at', v_run.started_at,
        'submitted_at', v_run.submitted_at,
        'current_module', v_run.current_module,
        'proctoring_level', COALESCE(t.proctoring_level, 'off'),
        'student_id', v_run.user_id,
        'student_name', p.display_name,
        'test', jsonb_build_object(
          'slug', t.slug, 'title', t.title, 'short_title', t.short_title)
      )
      FROM public.tests t
      LEFT JOIN public.profiles p ON p.id = v_run.user_id
      WHERE t.id = v_run.test_id
    ),
    'modules', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'position', m.position, 'section', m.section, 'label', m.label,
          'time_limit_seconds', m.time_limit_seconds, 'question_count', m.question_count,
          'questions', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
              'id', q.id, 'ref', q.ref, 'number', q.number, 'type', q.type,
              'section', m.section, 'passage', q.passage, 'passage_alt', q.passage_alt,
              'stem', q.stem, 'choices', q.choices, 'figure', q.figure
            ) ORDER BY q.position), '[]'::jsonb)
            FROM public.test_questions q WHERE q.module_id = m.id)
        ) ORDER BY m.position), '[]'::jsonb)
      FROM public.test_modules m WHERE m.test_id = v_run.test_id
    ),
    'events', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'at', e.at, 'type', e.type, 'module', e.module, 'question', e.question,
        'duration_seconds', e.duration_seconds, 'meta', e.meta
      ) ORDER BY e.at), '[]'::jsonb)
      FROM public.test_run_events e WHERE e.run_id = v_run.id
    ),
    'final', jsonb_build_object(
      'answers', (
        SELECT coalesce(jsonb_object_agg(a.question_id::text, a.chosen)
                          FILTER (WHERE a.chosen IS NOT NULL), '{}'::jsonb)
        FROM public.test_run_answers a WHERE a.run_id = v_run.id),
      'eliminations', (
        SELECT coalesce(jsonb_object_agg(a.question_id::text, to_jsonb(a.eliminated))
                          FILTER (WHERE array_length(a.eliminated, 1) > 0), '{}'::jsonb)
        FROM public.test_run_answers a WHERE a.run_id = v_run.id),
      'marks', (
        SELECT coalesce(jsonb_agg(a.question_id::text) FILTER (WHERE a.marked), '[]'::jsonb)
        FROM public.test_run_answers a WHERE a.run_id = v_run.id),
      'highlights', (
        SELECT coalesce(jsonb_object_agg(a.question_id::text, a.highlights)
                          FILTER (WHERE jsonb_array_length(a.highlights) > 0), '{}'::jsonb)
        FROM public.test_run_answers a WHERE a.run_id = v_run.id),
      'notes', (
        SELECT coalesce(jsonb_object_agg(a.question_id::text, to_jsonb(a.note))
                          FILTER (WHERE a.note IS NOT NULL AND a.note <> ''), '{}'::jsonb)
        FROM public.test_run_answers a WHERE a.run_id = v_run.id)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_test_run_replay(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_run_replay(uuid) TO authenticated;
