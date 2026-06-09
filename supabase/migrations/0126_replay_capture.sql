-- =============================================================================
-- Migration: 0126_replay_capture.sql
-- Description: Extend the action journal (0124) so the proctor can REPLAY a
--              sitting — capture highlights (per color), notes, calculator
--              open/close, and accurate per-question dwell time.
--
--   1. Expand the test_run_events.type CHECK with 7 new action types:
--        highlight_add     (meta {field,start,end,color,text})
--        highlight_remove  (meta {field,offset})
--        highlight_clear
--        note_edit         (meta {text})        — debounced snapshots
--        calc_open / calc_close                 — Desmos usage
--        dwell             (duration_seconds)   — ACTIVE seconds on a question
--                                                  for one visit, away-time
--                                                  excluded; closed on leave /
--                                                  module-submit / tab-hide.
--      `dwell` is the aggregate-ready per-question time (sum per (student,
--      question) → total; average across a cohort → class baseline) for the
--      future individual-vs-class-vs-all comparison.
--
--   2. test_log_action gains a trailing `p_duration_seconds` arg (for dwell)
--      and its allowlist grows to admit the new types. The OLD 5-arg signature
--      is DROPPED first so PostgREST sees ONE overload (per the 0064 lesson:
--      added/changed params need DROP + CREATE, not CREATE OR REPLACE, to
--      avoid signature ambiguity). The deployed client calls with named params,
--      so the extra defaulted arg is backward-compatible.
--
--   Still best-effort (owner + in_progress only, NEVER throws), no integrity-
--   counter / test_live_progress changes, integrity contract (smoke-cascade)
--   untouched. get_test_run_timeline (0108) already returns all rows.
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Expand the type allowlist on test_run_events
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
    'nav',
    -- replay capture (0126)
    'highlight_add', 'highlight_remove', 'highlight_clear',
    'note_edit',
    'calc_open', 'calc_close',
    'dwell'
  ));

-- -----------------------------------------------------------------------------
-- 2. test_log_action — add p_duration_seconds; expand allowlist
--    (DROP old signature first to keep a single PostgREST overload)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.test_log_action(uuid, text, integer, integer, jsonb);

CREATE OR REPLACE FUNCTION public.test_log_action(
  p_run_id           uuid,
  p_type             text,
  p_question         integer DEFAULT NULL,
  p_module           integer DEFAULT NULL,
  p_meta             jsonb   DEFAULT NULL,
  p_duration_seconds integer DEFAULT NULL
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
       'nav',
       'highlight_add', 'highlight_remove', 'highlight_clear',
       'note_edit',
       'calc_open', 'calc_close',
       'dwell') THEN
    RETURN;
  END IF;

  -- Owner + still in progress: don't accept a journal write after submission.
  SELECT EXISTS (
    SELECT 1 FROM public.test_runs r
     WHERE r.id = p_run_id AND r.user_id = v_uid AND r.status = 'in_progress'
  ) INTO v_ok;
  IF NOT v_ok THEN RETURN; END IF;

  INSERT INTO public.test_run_events (run_id, type, module, question, meta, duration_seconds)
  VALUES (p_run_id, p_type, p_module, p_question, p_meta,
          -- clamp negatives to 0, keep NULL when no duration was supplied
          CASE WHEN p_duration_seconds IS NULL THEN NULL
               ELSE GREATEST(0, p_duration_seconds) END);

  UPDATE public.test_runs SET last_seen_at = now() WHERE id = p_run_id;
EXCEPTION WHEN OTHERS THEN
  RETURN;  -- telemetry must NEVER break the test
END;
$$;

REVOKE ALL ON FUNCTION public.test_log_action(uuid, text, integer, integer, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_log_action(uuid, text, integer, integer, jsonb, integer) TO authenticated;
