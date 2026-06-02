-- =============================================================================
-- Migration: 0077_notify_test_result_release.sql
-- Description: Notify a student when their full-length test results are released.
--
-- Closes the dispense loop's last gap: a teacher releases results (per-run via
-- release_test_results, or whole-class via release_test_results_for_teacher),
-- but the student had no signal — they'd only find out by chance. This fans out
-- a public.notifications row (lights up the NotificationBell) on the
-- NULL → non-NULL transition of test_runs.results_released_at.
--
-- Mirrors fanout_assignment_grade_notification (0059): SECURITY DEFINER (the
-- actor is the teacher, the recipient is the student, and notifications RLS
-- limits non-DEFINER inserts), null→non-null guard to avoid spam, free-text
-- kind. recipient_id = test_runs.user_id (== profiles.id, 1:1 with auth.users).
--
-- Forward-only, idempotent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fanout_test_result_release_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_title text;
BEGIN
  IF OLD.results_released_at IS NULL AND NEW.results_released_at IS NOT NULL THEN
    SELECT title INTO v_title FROM public.tests WHERE id = NEW.test_id;
    INSERT INTO public.notifications (recipient_id, kind, title, body, link)
    VALUES (
      NEW.user_id,
      'test_result',
      'Your ' || coalesce(v_title, 'test') || ' results are ready',
      NULL,
      '/'  -- student home surfaces "Your test results" → View results
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_test_release ON public.test_runs;
CREATE TRIGGER trg_notify_on_test_release
  AFTER UPDATE ON public.test_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.fanout_test_result_release_notification();

-- =============================================================================
-- END OF MIGRATION 0077_notify_test_result_release.sql
-- =============================================================================
