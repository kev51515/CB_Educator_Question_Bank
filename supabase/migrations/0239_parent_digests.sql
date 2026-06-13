-- =============================================================================
-- Migration: 0239_parent_digests.sql
-- Description: Parent progress digests (lane C) — teacher-approved weekly
--              progress summaries delivered to a student's GUARDIANS via LINE.
--
--   Flow:
--     1. compose_student_digest(course, student) — a teacher composes (or
--        recomposes) the current ISO-week DRAFT for one student: a stats jsonb
--        blob computed from full-test runs + assignment_best_attempts +
--        get_student_pending_counts, scoped to this course. Idempotent UPSERT
--        on (course_id, student_id, period_start); a recompose refreshes the
--        stats but KEEPS any teacher edits (ai_summary / teacher_note) and the
--        'draft' status (never resurrects a 'sent' row's stats).
--     2. The teacher reviews the draft in the UI, edits the AI summary
--        (composed client-side by the digest-ai-summary edge fn) + an optional
--        note, then calls:
--     3. approve_and_send_digest(digest, ai_summary, note) — saves the summary
--        + note, builds a tidy multi-line LINE message, and enqueues ONE
--        line_outbox row per LINE-linked guardian of the student (NOT the
--        student). Marks the digest 'sent'. line-dispatch (0153) drains the
--        outbox to the LINE push API — this RPC never talks HTTP itself.
--        Returns the count enqueued (0 when no guardian is LINE-linked — that
--        is a normal outcome, not an error).
--
--   Delivery is LINE-only by design: guardians are managed accounts with
--   synthetic <code>@students.local emails (0155), so email can't reach them.
--
--   Auth: every surface is gated to a teacher of the digest's course (via the
--   existing is_teacher_of_course helper, 0012/0130) or an admin. No student
--   or guardian access at all. Stable string error codes the client switches
--   on: not_authenticated / not_authorized / not_found / already_sent.
--
-- !! NUMBERING: highest local file is 0238; this is 0239. A parallel session
--    shares this tree and pushes to main — re-verify `supabase migration list`
--    shows Local==Remote after push, and bump if a collision appears (a silent
--    number collision once skipped a migration — see CLAUDE.md).
--
-- Platform: Supabase cloud (PostgreSQL 15+). pgcrypto enabled. Forward-only.
-- =============================================================================


-- =============================================================================
-- SECTION 1: student_progress_digests — one row per (course, student, week)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.student_progress_digests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    uuid NOT NULL REFERENCES public.courses(id)   ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end   date NOT NULL,
  stats        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_summary   text,
  teacher_note text,
  status       text NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'sent')),
  approved_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id, period_start)
);

CREATE INDEX IF NOT EXISTS student_progress_digests_course_period_idx
  ON public.student_progress_digests (course_id, period_start);

-- set_updated_at() is the shared BEFORE UPDATE trigger fn from 0001/0004.
DROP TRIGGER IF EXISTS trg_student_progress_digests_set_updated_at
  ON public.student_progress_digests;
CREATE TRIGGER trg_student_progress_digests_set_updated_at
  BEFORE UPDATE ON public.student_progress_digests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.student_progress_digests ENABLE ROW LEVEL SECURITY;

-- Teacher-of-course (or admin) may read/insert/update. No student/guardian
-- access. Writes also go through the SECURITY DEFINER RPCs below, but explicit
-- policies let the client list drafts directly (joined with the roster).
DROP POLICY IF EXISTS "digests: teacher read" ON public.student_progress_digests;
CREATE POLICY "digests: teacher read" ON public.student_progress_digests
  FOR SELECT USING (
    public.is_admin((SELECT auth.uid()))
    OR public.is_teacher_of_course((SELECT auth.uid()), course_id)
  );

DROP POLICY IF EXISTS "digests: teacher insert" ON public.student_progress_digests;
CREATE POLICY "digests: teacher insert" ON public.student_progress_digests
  FOR INSERT WITH CHECK (
    public.is_admin((SELECT auth.uid()))
    OR public.is_teacher_of_course((SELECT auth.uid()), course_id)
  );

DROP POLICY IF EXISTS "digests: teacher update" ON public.student_progress_digests;
CREATE POLICY "digests: teacher update" ON public.student_progress_digests
  FOR UPDATE USING (
    public.is_admin((SELECT auth.uid()))
    OR public.is_teacher_of_course((SELECT auth.uid()), course_id)
  )
  WITH CHECK (
    public.is_admin((SELECT auth.uid()))
    OR public.is_teacher_of_course((SELECT auth.uid()), course_id)
  );


-- =============================================================================
-- SECTION 2: compose_student_digest — build/refresh the current-week draft
-- =============================================================================
CREATE OR REPLACE FUNCTION public.compose_student_digest(
  p_course_id  uuid,
  p_student_id uuid
)
RETURNS public.student_progress_digests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid          uuid := (SELECT auth.uid());
  v_period_start date;
  v_period_end   date;
  v_stats        jsonb;
  v_recent       jsonb;
  v_completed    integer;
  v_due_soon     integer;
  v_upcoming     jsonb;
  v_best         numeric;
  v_prior        numeric;
  v_row          public.student_progress_digests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT (public.is_admin(v_uid)
          OR public.is_teacher_of_course(v_uid, p_course_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Current ISO week (Mon–Sun), server time.
  v_period_start := date_trunc('week', now())::date;          -- Monday
  v_period_end   := v_period_start + 6;                        -- Sunday

  -- Recent full-test results submitted this week (oldest→newest), scaled
  -- score = test_runs.score / total.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'test_title',   t.title,
           'score',        r.score,
           'total',        r.total,
           'submitted_at', r.submitted_at
         ) ORDER BY r.submitted_at), '[]'::jsonb)
    INTO v_recent
    FROM public.test_runs r
    JOIN public.tests t ON t.id = r.test_id
   WHERE r.user_id = p_student_id
     AND r.status = 'submitted'
     AND r.submitted_at >= v_period_start::timestamptz
     AND r.submitted_at <  (v_period_end + 1)::timestamptz;

  -- Best recent full-test score (this week) + the prior submitted score before
  -- this week (for a trajectory delta). Expressed as percent of total.
  SELECT max(CASE WHEN r.total > 0 THEN round(100.0 * r.score / r.total, 1) END)
    INTO v_best
    FROM public.test_runs r
   WHERE r.user_id = p_student_id
     AND r.status = 'submitted'
     AND r.submitted_at >= v_period_start::timestamptz
     AND r.submitted_at <  (v_period_end + 1)::timestamptz;

  SELECT round(100.0 * r.score / NULLIF(r.total, 0), 1)
    INTO v_prior
    FROM public.test_runs r
   WHERE r.user_id = p_student_id
     AND r.status = 'submitted'
     AND r.submitted_at < v_period_start::timestamptz
     AND r.total > 0
   ORDER BY r.submitted_at DESC
   LIMIT 1;

  -- Assignments completed (submitted) this week in THIS course, via the
  -- best-attempts view (one row per assignment/student).
  SELECT count(*)::integer
    INTO v_completed
    FROM public.assignment_best_attempts ba
    JOIN public.assignments a ON a.id = ba.assignment_id
   WHERE a.course_id = p_course_id
     AND ba.student_id = p_student_id
     AND ba.submitted_at >= v_period_start::timestamptz
     AND ba.submitted_at <  (v_period_end + 1)::timestamptz;

  -- Upcoming / due-soon: open, non-archived assignments in this course due in
  -- the next 7 days that the student has not yet submitted.
  SELECT count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object('title', a.title, 'due_at', a.due_at)
                   ORDER BY a.due_at), '[]'::jsonb)
    INTO v_due_soon, v_upcoming
    FROM public.assignments a
   WHERE a.course_id = p_course_id
     AND NOT a.archived
     AND a.opens_at <= now()
     AND a.due_at IS NOT NULL
     AND a.due_at BETWEEN now() AND now() + interval '7 days'
     AND NOT EXISTS (
       SELECT 1 FROM public.assignment_attempts aa
        WHERE aa.assignment_id = a.id
          AND aa.student_id = p_student_id
          AND aa.submitted_at IS NOT NULL
     );

  v_stats := jsonb_build_object(
    'recent_scores',       v_recent,
    'completed_this_week', coalesce(v_completed, 0),
    'due_soon',            coalesce(v_due_soon, 0),
    'upcoming',            v_upcoming,
    'best_recent_score',   v_best,    -- null when no test this week
    'prior_score',         v_prior    -- null when no prior test
  );

  -- UPSERT the draft. On conflict: refresh stats + period_end, but keep the
  -- teacher's edits and never downgrade/overwrite a row already 'sent'.
  INSERT INTO public.student_progress_digests
    (course_id, student_id, period_start, period_end, stats, status)
  VALUES
    (p_course_id, p_student_id, v_period_start, v_period_end, v_stats, 'draft')
  ON CONFLICT (course_id, student_id, period_start) DO UPDATE
    SET stats      = EXCLUDED.stats,
        period_end = EXCLUDED.period_end
    WHERE public.student_progress_digests.status = 'draft'
  RETURNING * INTO v_row;

  -- If the row already existed and was 'sent', ON CONFLICT WHERE skipped the
  -- update and RETURNING is empty — fetch the existing row to return it.
  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
      FROM public.student_progress_digests
     WHERE course_id = p_course_id
       AND student_id = p_student_id
       AND period_start = v_period_start;
  END IF;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.compose_student_digest(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compose_student_digest(uuid, uuid) TO authenticated;


-- =============================================================================
-- SECTION 3: approve_and_send_digest — save edits + enqueue LINE to guardians
-- =============================================================================
CREATE OR REPLACE FUNCTION public.approve_and_send_digest(
  p_digest_id   uuid,
  p_ai_summary  text,
  p_teacher_note text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_digest  public.student_progress_digests;
  v_msg     text;
  v_line    text;
  v_score   text;
  v_count   integer;
  rec       record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_digest
    FROM public.student_progress_digests
   WHERE id = p_digest_id;
  IF v_digest.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF NOT (public.is_admin(v_uid)
          OR public.is_teacher_of_course(v_uid, v_digest.course_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_digest.status = 'sent' THEN
    RAISE EXCEPTION 'already_sent';
  END IF;

  -- Persist the teacher's edits first (also marks the row sent below).
  UPDATE public.student_progress_digests
     SET ai_summary   = p_ai_summary,
         teacher_note = p_teacher_note
   WHERE id = p_digest_id;

  -- ---------------------------------------------------------------------------
  -- Build a tidy multi-line LINE message from stats + summary + note.
  -- Plain text only (line_outbox payload is { type:'text', text:… }).
  -- ---------------------------------------------------------------------------
  v_msg := 'Weekly progress update ('
        || to_char(v_digest.period_start, 'Mon DD')
        || ' - ' || to_char(v_digest.period_end, 'Mon DD') || ')';

  -- Best recent score line (with trajectory delta when a prior score exists).
  IF (v_digest.stats ->> 'best_recent_score') IS NOT NULL THEN
    v_score := 'Best practice score this week: '
            || (v_digest.stats ->> 'best_recent_score') || '%';
    IF (v_digest.stats ->> 'prior_score') IS NOT NULL THEN
      v_score := v_score || ' (prev '
              || (v_digest.stats ->> 'prior_score') || '%)';
    END IF;
    v_msg := v_msg || E'\n' || v_score;
  END IF;

  v_msg := v_msg || E'\nAssignments completed this week: '
        || COALESCE(v_digest.stats ->> 'completed_this_week', '0');

  IF COALESCE((v_digest.stats ->> 'due_soon')::int, 0) > 0 THEN
    v_msg := v_msg || E'\nDue in the next 7 days: '
          || (v_digest.stats ->> 'due_soon');
  END IF;

  IF p_ai_summary IS NOT NULL AND length(trim(p_ai_summary)) > 0 THEN
    v_msg := v_msg || E'\n\n' || trim(p_ai_summary);
  END IF;

  IF p_teacher_note IS NOT NULL AND length(trim(p_teacher_note)) > 0 THEN
    v_msg := v_msg || E'\n\nNote from the teacher:\n' || trim(p_teacher_note);
  END IF;

  -- ---------------------------------------------------------------------------
  -- Enqueue ONE line_outbox row per LINE-linked guardian of this student.
  -- The student is deliberately NOT notified. line-dispatch (0153) drains it.
  -- ---------------------------------------------------------------------------
  v_count := 0;
  FOR rec IN
    SELECT ll.line_user_id, ll.profile_id
      FROM public.guardian_students gs
      JOIN public.line_links ll ON ll.profile_id = gs.guardian_id
     WHERE gs.student_id = v_digest.student_id
       AND ll.status = 'linked'
  LOOP
    INSERT INTO public.line_outbox (line_user_id, profile_id, kind, payload)
    VALUES (
      rec.line_user_id,
      rec.profile_id,
      'progress_digest',
      jsonb_build_object('type', 'text', 'text', v_msg)
    );
    v_count := v_count + 1;
  END LOOP;

  -- Mark sent regardless of guardian count (an approved digest is "sent" even
  -- if 0 guardians are linked — the teacher reviewed + released it).
  UPDATE public.student_progress_digests
     SET status      = 'sent',
         approved_by = v_uid,
         sent_at     = now()
   WHERE id = p_digest_id;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_and_send_digest(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_and_send_digest(uuid, text, text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0239_parent_digests.sql
-- =============================================================================
