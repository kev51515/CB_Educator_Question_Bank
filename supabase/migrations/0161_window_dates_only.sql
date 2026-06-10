-- =============================================================================
-- Migration: 0161_window_dates_only.sql
-- Purpose:   Unify the two test-deployment mechanisms (#3). The MODULE RANGE
--            now solely defines which modules a run covers — it comes from the
--            run's `scheduled_first/last_position` (set from a `/test/<slug>?m=
--            <first>-<last>` link, 0156, or the full test). `test_module_windows`
--            is repurposed to carry ONLY the per-module open DATE (`opens_at`);
--            its `deployed` flag no longer gates anything.
--
--   Before: `get_test_module` / `submit_test_module` consulted the window's
--   `deployed` flag, so a windows-based "subset" could throw `module_not_deployed`
--   on a run whose range explicitly includes that module — the two mechanisms
--   fought. Now deployment = the run's range (already enforced by the lower-bound
--   gate + `current_module` + finalize-at-`scheduled_last`), and the window is
--   used only for scheduling.
--
--   Implementation is a one-function change: `_test_module_window` always reports
--   `deployed = true` (range is the truth) and surfaces `opens_at` as before.
--   The callers' `IF NOT deployed RAISE module_not_deployed` therefore never
--   fires; their `module_not_yet_open` (opens_at) gate is unchanged. Verified
--   safe: production has ~no `deployed=false` window rows.
--
--   Forward-only. CREATE OR REPLACE (signature unchanged).
-- =============================================================================

CREATE OR REPLACE FUNCTION public._test_module_window(
  p_uid uuid, p_course_id uuid, p_test_id uuid, p_position integer
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_w public.test_module_windows%ROWTYPE;
BEGIN
  -- Staff preview + un-bound (course_id NULL) runs are always open.
  IF public.is_staff(p_uid) OR p_course_id IS NULL THEN
    RETURN jsonb_build_object('deployed', true, 'opens_at', NULL, 'open', true);
  END IF;
  SELECT * INTO v_w FROM public.test_module_windows
   WHERE course_id = p_course_id AND test_id = p_test_id AND module_position = p_position;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('deployed', true, 'opens_at', NULL, 'open', true);
  END IF;
  -- Deployment is the RUN's module range now (not this flag). The window only
  -- carries the open DATE.
  RETURN jsonb_build_object(
    'deployed', true,
    'opens_at', v_w.opens_at,
    'open', (v_w.opens_at IS NULL OR v_w.opens_at <= now())
  );
END;
$$;
REVOKE ALL ON FUNCTION public._test_module_window(uuid, uuid, uuid, integer) FROM PUBLIC;

-- =============================================================================
-- END OF MIGRATION 0161_window_dates_only.sql
-- =============================================================================
