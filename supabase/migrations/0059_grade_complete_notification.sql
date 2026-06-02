-- =============================================================================
-- Migration: 0059_grade_complete_notification.sql
-- Purpose:   Close the M6 student-pull loop. Today, when a teacher grades an
--            attempt — sets graded_at, writes feedback_text, or applies a
--            score_override (all added in 0056) — the student has zero signal
--            until they happen to revisit the review page. This migration
--            fanouts a public.notifications row to the student so the
--            NotificationBell (0029) lights up.
--
-- Summary:
--   1. AFTER UPDATE trigger on assignment_attempts. Fires only on three
--      transitions worth a notification:
--        a) "Just graded"    — OLD.graded_at IS NULL AND NEW.graded_at IS NOT NULL
--        b) "Feedback added" — OLD.feedback_text IS NULL AND NEW.feedback_text IS NOT NULL
--        c) "Score changed"  — NEW.score_override IS DISTINCT FROM OLD.score_override
--      The null→non-null guards on (a) and (b) prevent spam from autosave-y
--      teacher UIs that re-write the same feedback_text several times in a
--      session. (c) fires on every legitimate change because score override
--      changes are inherently meaningful (and rare). A teacher who unmarks +
--      remarks (graded_at → null → non-null) WILL re-notify, which is
--      intentional and matches student expectation.
--
--   2. SECURITY DEFINER + SET search_path = public, auth on the function. This
--      is mandatory because notifications has RLS that limits SELECT/UPDATE
--      to recipient_id = auth.uid(), and the INSERT is being performed on
--      behalf of the teacher (who is NOT the recipient). Without DEFINER the
--      INSERT would silently no-op against the policy. Pattern matches the
--      three existing fanout functions in 0029.
--
--   3. The notifications table (see 0029) has columns: recipient_id, kind,
--      title, body, link, read_at, created_at. There is NO payload jsonb
--      column and NO CHECK constraint on kind (it is free-form text). So:
--        - kind   = 'assignment_grade'  (new value, no constraint to alter)
--        - title  = "Your <assignment title> has been graded"
--                   or "Feedback added on <assignment title>"
--                   or "Score updated on <assignment title>"
--        - body   = NULL (full feedback lives behind the link; we don't want
--                   to copy markdown into a notification preview, and an
--                   empty body keeps the bell-dropdown rendering clean)
--        - link   = '/courses/<course_id>/assignments/<assignment_id>'
--                   (best canonical destination — the student clicks through
--                    and the assignment runner / review surface handles the
--                    rest of the routing)
--
--   4. Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.
--
-- Out of scope (deliberately punted):
--   - Email / push fanout. The NotificationBell is in-app only today;
--     adding email here would require a separate edge function + user
--     prefs table, well beyond M6.
--   - Coalescing rapid graded_at changes (a teacher who clicks Mark Done
--     and then Mark Undone and then Mark Done within seconds will receive
--     two notifications). Acceptable: this path is rare and the second
--     notification is correct.
--   - Updating notifications.kind to a CHECK-constrained enum — no
--     constraint exists today (free text), so no ALTER needed; if we
--     later harden this we can add 'assignment_grade' then.
--
-- Forward-only. Idempotent re-runs OK.
-- =============================================================================


CREATE OR REPLACE FUNCTION public.fanout_assignment_grade_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_just_graded    boolean := false;
  v_feedback_added boolean := false;
  v_score_changed  boolean := false;
  v_title_prefix   text;
  v_assignment_title text;
  v_course_id      uuid;
BEGIN
  -- Transition guards (see header §1).
  v_just_graded    := (OLD.graded_at IS NULL AND NEW.graded_at IS NOT NULL);
  v_feedback_added := (OLD.feedback_text IS NULL AND NEW.feedback_text IS NOT NULL);
  v_score_changed  := (NEW.score_override IS DISTINCT FROM OLD.score_override);

  IF NOT (v_just_graded OR v_feedback_added OR v_score_changed) THEN
    RETURN NEW;
  END IF;

  -- Fetch the parent assignment's title + course_id for routing.
  SELECT a.title, a.course_id
    INTO v_assignment_title, v_course_id
    FROM public.assignments a
   WHERE a.id = NEW.assignment_id;

  -- If the parent assignment is somehow gone (race against delete) bail
  -- silently rather than fail the parent UPDATE.
  IF v_course_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Title preference: just-graded wins over score-changed wins over feedback.
  -- (Most user-meaningful event takes the headline; the other signals are
  --  implicitly conveyed when the student clicks through.)
  IF v_just_graded THEN
    v_title_prefix := 'Your assignment has been graded: ';
  ELSIF v_score_changed THEN
    v_title_prefix := 'Score updated on: ';
  ELSE
    v_title_prefix := 'Feedback added on: ';
  END IF;

  INSERT INTO public.notifications (recipient_id, kind, title, body, link)
  VALUES (
    NEW.student_id,
    'assignment_grade',
    v_title_prefix || COALESCE(v_assignment_title, '(untitled assignment)'),
    NULL,
    '/courses/' || v_course_id || '/assignments/' || NEW.assignment_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fanout_assignment_grade ON public.assignment_attempts;
CREATE TRIGGER trg_fanout_assignment_grade
  AFTER UPDATE ON public.assignment_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.fanout_assignment_grade_notification();
