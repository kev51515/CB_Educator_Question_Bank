-- =============================================================================
-- Migration: 0124_action_journal.sql
-- Description: Semantic ACTION JOURNAL for the proctor timeline — so a teacher
--              can replay HOW a student took the test (answer churn, flags,
--              choice eliminations, navigation/revisits), not just integrity
--              signals. Doubles as coaching insight (#1) and in-person
--              cheating evidence (#2: rapid last-second answer changes,
--              revisit patterns).
--
--   Builds on 0108's test_run_events + get_test_run_timeline. Same table, same
--   timeline RPC, same forge-proof contract (write-only via SECURITY DEFINER;
--   no client INSERT/UPDATE/DELETE policy — a tampered client can neither forge
--   nor erase its own trail).
--
--   1. Expand the test_run_events.type CHECK to admit the action family:
--        answer_set | answer_change | answer_clear   (meta: {from, to})
--        flag | unflag                               (mark-for-review)
--        eliminate | uneliminate                     (meta: {choice})
--        nav                                          (revisit / dwell anchor)
--      The integrity types from 0108 are preserved unchanged.
--
--   2. test_log_action(run, type, question, module, meta) — dedicated
--      best-effort logger for the action family. Owner + in_progress only,
--      own allowlist (kept SEPARATE from test_log_proctor_event so the
--      0103/0108 integrity contract smoke-cascade guards stays untouched).
--      NEVER throws — telemetry must not break a test. Bumps NO integrity
--      counters (these are behavioural, not violations) and does NOT touch
--      test_live_progress, so the existing live-monitor flag math is intact.
--
--   get_test_run_timeline (0108) already SELECTs every row for a run regardless
--   of type, so the new action rows surface on the timeline with no RPC change.
--
-- Forward-only. Action journaling is gated client-side on proctoring_level
-- != 'off' (the same proctorOn switch as integrity telemetry), so 'off' stays
-- genuinely silent and a teacher opts into coaching telemetry via 'soft'.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Expand the type allowlist on test_run_events
--    (single-column inline CHECK from 0108 is auto-named test_run_events_type_check)
-- -----------------------------------------------------------------------------
ALTER TABLE public.test_run_events
  DROP CONSTRAINT IF EXISTS test_run_events_type_check;

ALTER TABLE public.test_run_events
  ADD CONSTRAINT test_run_events_type_check CHECK (type IN (
    -- integrity signals (0108)
    'away', 'focus_loss', 'fullscreen_exit', 'fullscreen_enter',
    'copy', 'paste', 'copy_blocked', 'paste_blocked',
    'contextmenu_blocked', 'devtools',
    -- action journal (0124)
    'answer_set', 'answer_change', 'answer_clear',
    'flag', 'unflag',
    'eliminate', 'uneliminate',
    'nav'
  ));

-- -----------------------------------------------------------------------------
-- 2. test_log_action — best-effort action-journal logger (NEVER throws)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.test_log_action(
  p_run_id   uuid,
  p_type     text,
  p_question integer DEFAULT NULL,
  p_module   integer DEFAULT NULL,
  p_meta     jsonb   DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok  boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  -- Action-family allowlist — a tampered client can only log known action types.
  IF p_type NOT IN (
       'answer_set', 'answer_change', 'answer_clear',
       'flag', 'unflag',
       'eliminate', 'uneliminate',
       'nav') THEN
    RETURN;
  END IF;

  -- Owner + still in progress: don't accept a journal write after submission.
  SELECT EXISTS (
    SELECT 1 FROM public.test_runs r
     WHERE r.id = p_run_id AND r.user_id = v_uid AND r.status = 'in_progress'
  ) INTO v_ok;
  IF NOT v_ok THEN RETURN; END IF;

  INSERT INTO public.test_run_events (run_id, type, module, question, meta)
  VALUES (p_run_id, p_type, p_module, p_question, p_meta);

  -- Keep the heartbeat fresh so the live monitor sees an active student even
  -- if they're only changing answers (not navigating between questions).
  UPDATE public.test_runs SET last_seen_at = now() WHERE id = p_run_id;
EXCEPTION WHEN OTHERS THEN
  RETURN;  -- telemetry must NEVER break the test
END;
$$;

REVOKE ALL ON FUNCTION public.test_log_action(uuid, text, integer, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_log_action(uuid, text, integer, integer, jsonb) TO authenticated;
