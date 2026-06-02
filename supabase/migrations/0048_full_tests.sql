-- =============================================================================
-- Migration: 0048_full_tests.sql
-- Purpose:   First-class, *proctored* full-length tests (e.g. a real Digital
--            SAT form: 4 ordered, timed modules). Unlike the static question
--            bank (answers shipped in client JSON by design) and the mock-test
--            sampler, a full test must NOT leak its content:
--
--              • Question text + answer key live in Postgres, NEVER in
--                web-served JSON.
--              • Students can only SELECT `tests` / `test_modules` metadata.
--                They CANNOT select `test_questions` at all.
--              • Question content is delivered one module at a time via the
--                SECURITY DEFINER RPC `get_test_module`, which strips the
--                correct answers.
--              • Grading is server-side (`submit_test_module`). The key never
--                reaches the browser until the whole test is submitted
--                (`get_test_result`), and even then only for review.
--
--   Tables:
--     tests              — catalog of available tests (public metadata)
--     test_modules       — ordered, timed sections (public metadata)
--     test_questions     — question content + answer key (NO student SELECT)
--     test_runs          — one per student attempt (owner-scoped)
--     test_run_answers   — graded per-question rows (owner-readable, RPC-written)
--
--   Drift gotchas (per CLAUDE.md backend rules):
--     • Every RPC that reads test_questions or writes test_runs/answers is
--       SECURITY DEFINER with `SET search_path = public, auth` so RLS does not
--       block it. Without DEFINER, students (who cannot SELECT test_questions)
--       could never receive a question.
--     • RPCs raise stable string error codes the client switches on:
--       not_authenticated | test_not_found | run_not_found | not_authorized
--       | module_out_of_order | run_already_submitted.
--     • test_run_answers has NO direct INSERT/UPDATE policy — only the DEFINER
--       RPCs write it, so is_correct cannot be forged by the client.
--     • Forward-only. Re-runnable (IF NOT EXISTS / CREATE OR REPLACE / DROP
--       POLICY IF EXISTS).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Catalog tables (public metadata)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  ordinal         integer NOT NULL DEFAULT 0,
  title           text NOT NULL,
  short_title     text,
  source          text,
  total_questions integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.test_modules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id           uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  position          integer NOT NULL,
  section           text NOT NULL CHECK (section IN ('reading-writing', 'math')),
  label             text NOT NULL,
  time_limit_seconds integer NOT NULL,
  question_count    integer NOT NULL DEFAULT 0,
  UNIQUE (test_id, position)
);

-- -----------------------------------------------------------------------------
-- 2. Question content + answer key (NEVER selectable by students)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.test_questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id      uuid NOT NULL REFERENCES public.test_modules(id) ON DELETE CASCADE,
  position       integer NOT NULL,
  ref            text NOT NULL,                       -- "3-10" (module-number)
  number         integer NOT NULL,                    -- question number within module
  type           text NOT NULL CHECK (type IN ('mcq', 'grid')),
  passage        text,
  passage_alt    text,                                -- a11y/search text when a figure is authoritative
  stem           text NOT NULL,
  choices        jsonb,                               -- { "A": "...", ... } for mcq, null for grid
  figure         text,                                -- served path, e.g. /data/tests/.../figures/m3-q1.png
  correct_answer text,                                -- letter for mcq; canonical string for grid
  accepted       jsonb,                               -- ["45/8","5.625"] for grid; null for mcq
  domain         text,
  source_page    integer,
  UNIQUE (module_id, position)
);

-- -----------------------------------------------------------------------------
-- 3. Attempt tables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.test_runs (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_id                   uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  status                    text NOT NULL DEFAULT 'in_progress'
                              CHECK (status IN ('in_progress', 'submitted', 'abandoned')),
  current_module            integer NOT NULL DEFAULT 1,
  current_module_started_at timestamptz,
  started_at                timestamptz NOT NULL DEFAULT now(),
  submitted_at              timestamptz,
  score                     integer,
  total                     integer,
  section_scores            jsonb,
  duration_seconds          integer
);

CREATE INDEX IF NOT EXISTS test_runs_user ON public.test_runs (user_id, test_id, started_at DESC);

-- At most one in-progress run per (user, test).
CREATE UNIQUE INDEX IF NOT EXISTS test_runs_one_active
  ON public.test_runs (user_id, test_id)
  WHERE status = 'in_progress';

CREATE TABLE IF NOT EXISTS public.test_run_answers (
  run_id          uuid NOT NULL REFERENCES public.test_runs(id) ON DELETE CASCADE,
  question_id     uuid NOT NULL REFERENCES public.test_questions(id) ON DELETE CASCADE,
  module_position integer NOT NULL,
  chosen          text,
  is_correct      boolean,
  time_ms         integer,
  answered_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, question_id)
);

-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.tests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_modules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_run_answers ENABLE ROW LEVEL SECURITY;

-- Catalog metadata: any authenticated user may read (safe — no answers here).
DROP POLICY IF EXISTS tests_read ON public.tests;
CREATE POLICY tests_read ON public.tests
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS test_modules_read ON public.test_modules;
CREATE POLICY test_modules_read ON public.test_modules
  FOR SELECT TO authenticated USING (true);

-- Question content: ONLY staff may select directly (for management/preview).
-- Students receive content exclusively through SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS test_questions_staff_read ON public.test_questions;
CREATE POLICY test_questions_staff_read ON public.test_questions
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- Runs: owner-scoped.
DROP POLICY IF EXISTS test_runs_owner ON public.test_runs;
CREATE POLICY test_runs_owner ON public.test_runs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Answers: owner may READ (review). Writes happen only via DEFINER RPCs, so
-- there is intentionally NO INSERT/UPDATE/DELETE policy here — is_correct
-- cannot be forged from the client.
DROP POLICY IF EXISTS test_run_answers_owner_read ON public.test_run_answers;
CREATE POLICY test_run_answers_owner_read ON public.test_run_answers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.test_runs r
     WHERE r.id = test_run_answers.run_id AND r.user_id = auth.uid()
  ));

-- -----------------------------------------------------------------------------
-- 5. Helpers
-- -----------------------------------------------------------------------------
-- Parse a student-produced response into a numeric value. Handles "a/b"
-- fractions and plain decimals (incl. leading-dot ".5" and negatives).
-- Returns NULL when the text is not a clean number/fraction.
CREATE OR REPLACE FUNCTION public._spr_numeric(p text)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  s text := btrim(coalesce(p, ''));
  num numeric;
  den numeric;
BEGIN
  IF s = '' THEN RETURN NULL; END IF;
  IF s ~ '^-?\d+/\d+$' THEN
    num := split_part(s, '/', 1)::numeric;
    den := split_part(s, '/', 2)::numeric;
    IF den = 0 THEN RETURN NULL; END IF;
    RETURN num / den;
  ELSIF s ~ '^-?(\d+\.?\d*|\.\d+)$' THEN
    RETURN s::numeric;
  END IF;
  RETURN NULL;
END;
$$;

-- Grade one answer against a question's key. mcq: exact letter. grid: member
-- of `accepted` (case/space-insensitive) OR numerically equal to the key.
CREATE OR REPLACE FUNCTION public._grade_answer(
  p_type text, p_correct text, p_accepted jsonb, p_chosen text
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  c text := btrim(coalesce(p_chosen, ''));
  sv numeric;
  kv numeric;
BEGIN
  IF c = '' THEN RETURN false; END IF;
  IF p_type = 'mcq' THEN
    RETURN upper(c) = upper(coalesce(p_correct, ''));
  END IF;
  -- grid
  IF p_accepted IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(p_accepted) a
     WHERE lower(btrim(a)) = lower(c)
  ) THEN
    RETURN true;
  END IF;
  sv := public._spr_numeric(c);
  kv := public._spr_numeric(p_correct);
  IF sv IS NOT NULL AND kv IS NOT NULL AND abs(sv - kv) < 1e-9 THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPCs
-- -----------------------------------------------------------------------------

-- start_test: find-or-resume an in-progress run for the caller; returns run +
-- module metadata (NO question content).
CREATE OR REPLACE FUNCTION public.start_test(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_test public.tests%ROWTYPE;
  v_run  public.test_runs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_test FROM public.tests WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'test_not_found'; END IF;

  SELECT * INTO v_run FROM public.test_runs
   WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
   ORDER BY started_at DESC LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.test_runs (user_id, test_id) VALUES (v_uid, v_test.id)
    RETURNING * INTO v_run;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run.id,
    'status', v_run.status,
    'current_module', v_run.current_module,
    'started_at', v_run.started_at,
    'test', jsonb_build_object(
      'slug', v_test.slug, 'title', v_test.title,
      'short_title', v_test.short_title, 'total_questions', v_test.total_questions),
    'modules', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'position', m.position, 'section', m.section, 'label', m.label,
        'time_limit_seconds', m.time_limit_seconds, 'question_count', m.question_count
      ) ORDER BY m.position), '[]'::jsonb)
      FROM public.test_modules m WHERE m.test_id = v_test.id)
  );
END;
$$;

-- get_test_module: deliver one module's questions WITHOUT the answer key.
-- Gated: cannot fetch a module ahead of current_module. Stamps the module
-- start time (once) so timing survives reload, and returns seconds remaining.
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_run.status <> 'in_progress' THEN RAISE EXCEPTION 'run_already_submitted'; END IF;
  IF p_position > v_run.current_module THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  SELECT m.* INTO v_mod FROM public.test_modules m
    JOIN public.tests t ON t.id = m.test_id
   WHERE t.id = v_run.test_id AND m.position = p_position;
  IF NOT FOUND THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  -- Stamp module start once (only for the active module).
  IF p_position = v_run.current_module THEN
    IF v_run.current_module_started_at IS NULL THEN
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

-- submit_test_module: grade the module server-side, persist answers, advance.
-- p_answers: { "<question_id>": "A" | "<grid string>" | null, ... }
-- Mid-test it returns only counts (no per-question correctness). When the last
-- module is submitted it finalizes the run and returns the full result.
CREATE OR REPLACE FUNCTION public.submit_test_module(
  p_run_id uuid, p_position integer, p_answers jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.test_runs%ROWTYPE;
  v_mod public.test_modules%ROWTYPE;
  v_test public.tests%ROWTYPE;
  v_max_position integer;
  v_chosen text;
  v_correct boolean;
  v_answered integer := 0;
  v_score integer;
  v_total integer;
  q RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_run.status <> 'in_progress' THEN RAISE EXCEPTION 'run_already_submitted'; END IF;
  IF p_position <> v_run.current_module THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  SELECT * INTO v_test FROM public.tests WHERE id = v_run.test_id;
  SELECT m.* INTO v_mod FROM public.test_modules m
   WHERE m.test_id = v_run.test_id AND m.position = p_position;
  IF NOT FOUND THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  -- Grade + upsert each question in this module.
  FOR q IN
    SELECT * FROM public.test_questions WHERE module_id = v_mod.id ORDER BY position
  LOOP
    v_chosen := nullif(btrim(coalesce(p_answers ->> q.id::text, '')), '');
    v_correct := public._grade_answer(q.type, q.correct_answer, q.accepted, v_chosen);
    IF v_chosen IS NOT NULL THEN v_answered := v_answered + 1; END IF;
    INSERT INTO public.test_run_answers (run_id, question_id, module_position, chosen, is_correct)
    VALUES (v_run.id, q.id, p_position, v_chosen, v_correct)
    ON CONFLICT (run_id, question_id) DO UPDATE
      SET chosen = EXCLUDED.chosen, is_correct = EXCLUDED.is_correct,
          answered_at = now();
  END LOOP;

  SELECT max(position) INTO v_max_position FROM public.test_modules WHERE test_id = v_run.test_id;

  IF p_position >= v_max_position THEN
    -- Finalize.
    SELECT count(*) FILTER (WHERE a.is_correct), count(*)
      INTO v_score, v_total
      FROM public.test_run_answers a WHERE a.run_id = v_run.id;
    UPDATE public.test_runs SET
      status = 'submitted',
      submitted_at = now(),
      current_module = v_max_position,
      current_module_started_at = NULL,
      score = v_score,
      total = v_total,
      duration_seconds = floor(extract(epoch FROM (now() - started_at)))::int,
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
      'score', v_score, 'total', v_total);
  ELSE
    UPDATE public.test_runs SET
      current_module = p_position + 1,
      current_module_started_at = NULL
     WHERE id = v_run.id;
    RETURN jsonb_build_object('finished', false, 'next_module', p_position + 1,
      'answered', v_answered);
  END IF;
END;
$$;

-- get_test_result: review payload — only valid once the run is submitted.
-- Now safe to reveal the key alongside the student's choice.
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
  IF v_run.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_run.status <> 'submitted' THEN RAISE EXCEPTION 'run_not_submitted'; END IF;

  RETURN jsonb_build_object(
    'run_id', v_run.id,
    'score', v_run.score, 'total', v_run.total,
    'duration_seconds', v_run.duration_seconds,
    'section_scores', v_run.section_scores,
    'questions', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', tq.id, 'ref', tq.ref, 'number', tq.number, 'type', tq.type,
        'section', m.section, 'module_position', m.position,
        'stem', tq.stem, 'choices', tq.choices, 'figure', tq.figure,
        'passage', tq.passage, 'passage_alt', tq.passage_alt,
        'your_answer', a.chosen, 'correct_answer', tq.correct_answer,
        'accepted', tq.accepted, 'is_correct', a.is_correct
      ) ORDER BY m.position, tq.position), '[]'::jsonb)
      FROM public.test_run_answers a
      JOIN public.test_questions tq ON tq.id = a.question_id
      JOIN public.test_modules m ON m.id = tq.module_id
     WHERE a.run_id = v_run.id)
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Grants — DEFINER RPCs are the only student path to content.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.start_test(text)                        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_test_module(uuid, integer)          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_test_module(uuid, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_test_result(uuid)                   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_test(text)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_test_module(uuid, integer)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_test_module(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_test_result(uuid)                   TO authenticated;
