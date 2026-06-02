-- =============================================================================
-- Migration: 0069_fanout_announcement_now.sql
-- Description: Per-row "fan out announcement notifications now" RPC for the
--              teacher-facing "Publish now & send notifications immediately"
--              option. Closes Task #177 from the autonomous run backlog.
--
-- WHY:
--   0058 added the 60-second cron worker (fanout_due_announcements) that
--   processes ALL due-but-not-fanned-out scheduled announcements on each
--   tick. The teacher Publish Now button (Round 22) UPDATEs publish_at =
--   now() + notifications_fanout_at = null, then waits for the next cron
--   tick (~60s) to dispatch student notifications.
--
--   This RPC lets a teacher who really wants notifications out RIGHT NOW
--   (e.g. "I just realized the deadline is in 30 minutes") skip the cron
--   tick. It runs the same fan-out logic the cron worker uses, but scoped
--   to a single row — so a teacher can't preempt OTHER teachers' due rows.
--
-- SECURITY:
--   * SECURITY DEFINER with SET search_path = public, auth (CLAUDE.md rule).
--   * Gated on is_teacher_of_course() — the post-0012 canonical helper
--     (0068 also added an is_teacher_of_class shim for legacy callers; new
--     code uses is_teacher_of_course directly per 0068's "should call"
--     guidance).
--   * The function only INSERTs into notifications and UPDATEs the single
--     announcement row's notifications_fanout_at. It cannot leak data or
--     side-effect other rows.
--   * Stable string error codes the client switches on (matches the
--     project's RPC error-code contract from CLAUDE.md):
--       not_authenticated | not_authorized | not_found
--   * Eligibility no-ops return 0 rather than raising, so the UI can
--     optimistically call this RPC without ever having to handle a benign
--     "race lost to cron" / "already fanned out" error.
--
-- IDEMPOTENCY:
--   * FOR UPDATE on the announcement row + the existing partial index on
--     (publish_at) WHERE notifications_fanout_at IS NULL means concurrent
--     calls — or this RPC racing the cron worker — see at most one winner.
--     The loser's SELECT returns notifications_fanout_at IS NOT NULL and
--     short-circuits to "return 0".
--   * No double-notify even if the teacher clicks the button twice.
--
-- Platform: PostgreSQL 15+ (Supabase).
-- Forward-only.
-- =============================================================================


CREATE OR REPLACE FUNCTION public.fanout_announcement_now(p_announcement_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_row       record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Lock the row so we serialize against the cron worker and against a
  -- concurrent invocation. SKIP LOCKED would silently return 0 on the loser;
  -- we want to BLOCK briefly instead so the second caller still sees the
  -- accurate post-fanout state (notifications_fanout_at IS NOT NULL) and
  -- returns 0 from the eligibility check below.
  SELECT a.id, a.course_id, a.title, a.body, a.published,
         a.publish_at, a.notifications_fanout_at
    INTO v_row
    FROM public.course_announcements a
   WHERE a.id = p_announcement_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF NOT public.is_teacher_of_course(v_uid, v_row.course_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Eligibility (no-op on any of these — same predicate as the cron
  -- worker's WHERE clause, just spelled out so we can return 0 silently
  -- instead of producing an "already done" error).
  IF v_row.notifications_fanout_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  IF v_row.publish_at IS NULL OR v_row.publish_at > now() THEN
    -- Either an immediate-publish row (already fanned out at INSERT by the
    -- 0058-guarded trigger; notifications_fanout_at should be non-null but
    -- belt-and-suspenders), or still in the future-scheduled state. Skip.
    RETURN 0;
  END IF;

  IF v_row.published = false THEN
    -- Stamp the column anyway so the cron worker doesn't keep reconsidering
    -- it on every tick, mirroring the cron worker's draft-handling.
    UPDATE public.course_announcements
       SET notifications_fanout_at = now()
     WHERE id = p_announcement_id;
    RETURN 0;
  END IF;

  -- Fan out — same INSERT shape as the cron worker / INSERT trigger.
  INSERT INTO public.notifications (recipient_id, kind, title, body, link)
  SELECT cm.student_id,
         'announcement',
         'New announcement: ' || v_row.title,
         left(v_row.body, 200),
         '/courses/' || v_row.course_id || '/announcements'
    FROM public.course_memberships cm
   WHERE cm.course_id = v_row.course_id;

  UPDATE public.course_announcements
     SET notifications_fanout_at = now()
   WHERE id = p_announcement_id;

  RETURN 1;
END
$$;

COMMENT ON FUNCTION public.fanout_announcement_now(uuid) IS
  'Per-row fan-out for the "Publish now & send notifications immediately" UX. '
  'Same INSERT logic as the cron worker, scoped to a single row + gated on '
  'is_teacher_of_course. Stable error codes: not_authenticated, not_authorized, '
  'not_found. Returns 1 if fanned out, 0 if already-done / draft / not-yet-due.';

REVOKE ALL ON FUNCTION public.fanout_announcement_now(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fanout_announcement_now(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0069_fanout_announcement_now.sql
-- =============================================================================
