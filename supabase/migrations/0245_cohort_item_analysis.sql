-- =============================================================================
-- Migration: 0245_cohort_item_analysis.sql
-- Description: Teacher per-assignment item analysis for kind='mocktest'
--              assignments — the "Cohort Distractor Analytics" surface.
--
-- For a mocktest assignment, every submitted assignment_attempts row carries
--   answers jsonb = { question_id: 'A'|'B'|'C'|'D'|null }
-- and the exact pool the student saw is snapshotted in
--   assignment_attempt_questions.question jsonb (camelCase TestQuestion:
--   id, stem, choices, correctAnswer, domain, skill, position).
-- The answers key === the snapshot question's `id`.
--
-- This RPC aggregates across SUBMITTED attempts by enrolled members of the
-- assignment's course: per distinct snapshot question it tallies chosen
-- letters, computes n_responses, correct count, pct_correct, and the
-- top distractor (most-chosen wrong letter, NULL when n_responses < 3).
--
-- Returns an ordered jsonb array of:
--   { position, question_number, prompt_excerpt, domain, correct_answer,
--     choice_counts {A,B,C,D}, n_responses, pct_correct, top_distractor }
--
-- If the assignment is not kind='mocktest' it returns an empty array (the
-- client shows a "no item data" note). Other kinds don't snapshot choices +
-- CB domain, so item analysis is meaningless for them in v1.
--
-- SECURITY DEFINER + is_teacher_of_course/is_admin guard, mirroring 0123.
-- Forward-only; new function.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_cohort_item_analysis(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_course_id uuid;
  v_kind      text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT a.course_id, a.kind
    INTO v_course_id, v_kind
    FROM public.assignments a
   WHERE a.id = p_assignment_id;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF NOT (public.is_teacher_of_course(v_uid, v_course_id) OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- v1 only supports mocktest (the only kind that snapshots choices + domain).
  IF v_kind <> 'mocktest' THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    WITH
    -- Submitted attempts by students enrolled in the assignment's course.
    submitted AS (
      SELECT aa.id, aa.answers
        FROM public.assignment_attempts aa
        JOIN public.course_memberships cm
          ON cm.student_id = aa.student_id AND cm.course_id = v_course_id
       WHERE aa.assignment_id = p_assignment_id
         AND aa.submitted_at IS NOT NULL
    ),
    -- One canonical snapshot question per distinct (position, id). Different
    -- students get the same pool, but resume-as-fresh can reshuffle; we key on
    -- the snapshot question id and pick the lowest position as the display slot.
    questions AS (
      SELECT DISTINCT ON (aaq.question ->> 'id')
             aaq.question ->> 'id'             AS qid,
             aaq.position                       AS position,
             aaq.question                       AS q
        FROM public.assignment_attempt_questions aaq
        JOIN submitted s ON s.id = aaq.attempt_id
       WHERE aaq.question ->> 'id' IS NOT NULL
       ORDER BY aaq.question ->> 'id', aaq.position
    ),
    -- One chosen letter per (question, attempt). The answers map is keyed by
    -- the snapshot question id; NULL / missing answers are dropped from tallies.
    responses AS (
      SELECT q.qid,
             upper(s.answers ->> q.qid) AS choice
        FROM questions q
        JOIN submitted s ON TRUE
       WHERE s.answers ->> q.qid IS NOT NULL
         AND upper(s.answers ->> q.qid) IN ('A', 'B', 'C', 'D')
    ),
    tallies AS (
      SELECT r.qid,
             count(*) FILTER (WHERE r.choice = 'A') AS a,
             count(*) FILTER (WHERE r.choice = 'B') AS b,
             count(*) FILTER (WHERE r.choice = 'C') AS c,
             count(*) FILTER (WHERE r.choice = 'D') AS d,
             count(*)                                AS n
        FROM responses r
       GROUP BY r.qid
    ),
    rows AS (
      SELECT q.position,
             q.q ->> 'stem'          AS stem,
             q.q ->> 'domain'        AS domain,
             upper(q.q ->> 'correctAnswer') AS correct_answer,
             COALESCE(t.a, 0)        AS a,
             COALESCE(t.b, 0)        AS b,
             COALESCE(t.c, 0)        AS c,
             COALESCE(t.d, 0)        AS d,
             COALESCE(t.n, 0)        AS n
        FROM questions q
        LEFT JOIN tallies t ON t.qid = q.qid
    )
    SELECT COALESCE(jsonb_agg(
             jsonb_build_object(
               'position',        r.position,
               'question_number', row_number() OVER (ORDER BY r.position),
               'prompt_excerpt',  left(COALESCE(r.stem, ''), 160),
               'domain',          r.domain,
               'correct_answer',  r.correct_answer,
               'choice_counts',   jsonb_build_object('A', r.a, 'B', r.b, 'C', r.c, 'D', r.d),
               'n_responses',     r.n,
               'pct_correct',     CASE
                                    WHEN r.n = 0 THEN NULL
                                    ELSE round(
                                      100.0 * (
                                        CASE r.correct_answer
                                          WHEN 'A' THEN r.a
                                          WHEN 'B' THEN r.b
                                          WHEN 'C' THEN r.c
                                          WHEN 'D' THEN r.d
                                          ELSE 0
                                        END
                                      )::numeric / r.n
                                    , 1)
                                  END,
               'top_distractor',  CASE
                                    WHEN r.n < 3 THEN NULL
                                    ELSE (
                                      SELECT x.letter
                                        FROM (VALUES
                                          ('A', r.a), ('B', r.b), ('C', r.c), ('D', r.d)
                                        ) AS x(letter, cnt)
                                       WHERE x.letter <> r.correct_answer
                                         AND x.cnt > 0
                                       ORDER BY x.cnt DESC, x.letter
                                       LIMIT 1
                                    )
                                  END
             )
             ORDER BY r.position
           ), '[]'::jsonb)
      FROM rows r
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_cohort_item_analysis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cohort_item_analysis(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0245_cohort_item_analysis.sql
-- =============================================================================
