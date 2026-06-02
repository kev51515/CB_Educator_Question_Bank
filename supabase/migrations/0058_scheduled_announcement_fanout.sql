-- =============================================================================
-- Migration: 0058_scheduled_announcement_fanout.sql
-- Description: Closes the notification gap for scheduled announcements.
--              0054 added course_announcements.publish_at so students see a
--              scheduled post only after now() >= publish_at. But the existing
--              fan-out trigger from 0029 fires at INSERT time — so a post
--              scheduled for Friday 08:00 had its notifications dispatched
--              the moment the teacher hit Save (or, more precisely, every
--              enrolled student got "New announcement: ..." in their bell
--              before the post itself was visible to them).
--
-- Two changes:
--   1. Add a guard to the existing INSERT trigger so it ONLY fires for
--      immediate-publish rows (publish_at IS NULL). Scheduled rows are skipped.
--   2. Add a pg_cron job that ticks every minute, finds announcements whose
--      publish_at has crossed now(), fans out notifications, and stamps a
--      new notifications_fanout_at column so we never double-send.
--
-- Why the column (not "infer from notifications table"):
--   * The notifications row could be deleted by a recipient (RLS UPDATE allows
--     marking-read but DELETE cascade only on profile drop — still, defensive).
--   * A teacher could re-schedule a post by updating publish_at backward. We
--     want a single is-this-fanned-out flag rather than a JOIN-count check
--     against notifications for every tick.
--   * Cheap idempotency for the cron worker — UPDATE WHERE
--     notifications_fanout_at IS NULL is a sargable predicate.
--
-- Backward compatibility:
--   * Existing rows with publish_at IS NULL (the entire population before
--     0054 + most rows after) are backfilled to notifications_fanout_at =
--     created_at. The original INSERT trigger already sent their
--     notifications at create time; we just record that fact post-hoc so the
--     cron worker never re-considers them.
--   * Existing rows with publish_at IS NOT NULL AND publish_at <= now() are
--     ALSO backfilled — at the moment of deploy they're "already past their
--     boundary AND already had notifications sent at insert time" (the old
--     trigger fired unconditionally before this migration). Marking them as
--     fanned-out is correct: re-firing would double-notify.
--   * Rows with publish_at IS NOT NULL AND publish_at > now() — the future-
--     scheduled ones — also already had their notifications sent at insert
--     by the pre-fix trigger (the bug we're fixing). We can't unsend those.
--     We leave notifications_fanout_at NULL for these so the cron job will
--     reconsider them; the INSERT INTO notifications below is idempotent at
--     the data level (recipient gets a second copy) which is mild
--     double-notification noise we accept rather than losing the "this is
--     publishing NOW" boundary signal. In practice the population of
--     pre-existing future-scheduled rows on deploy day is ~zero (the feature
--     just shipped in 0054) so this is theoretical.
--
-- Platform: Supabase (PostgreSQL 15+, pg_cron must be enabled — 0031
-- already enables it).
-- Forward-only, no rollback.
-- =============================================================================


-- =============================================================================
-- SECTION 1: TRACKING COLUMN
-- =============================================================================

ALTER TABLE public.course_announcements
  ADD COLUMN IF NOT EXISTS notifications_fanout_at timestamptz;

COMMENT ON COLUMN public.course_announcements.notifications_fanout_at IS
  'Stamp of when student notifications were dispatched. NULL = pending. '
  'Set by the INSERT trigger for immediate-publish rows and by '
  'public.fanout_due_announcements() for scheduled rows whose publish_at '
  'has crossed now(). Used by cron to skip already-fanned-out rows.';

-- Backfill: rows that were INSERTed BEFORE this migration ran already had
-- their notifications dispatched by the pre-fix trigger. Mark them so the
-- cron worker never re-fires.
--   * publish_at IS NULL → immediate-publish, stamped to created_at.
--   * publish_at IS NOT NULL AND publish_at <= now() → past-boundary at
--     deploy time. Same treatment.
-- We deliberately leave publish_at > now() rows untouched (see header note).
UPDATE public.course_announcements
   SET notifications_fanout_at = created_at
 WHERE notifications_fanout_at IS NULL
   AND (publish_at IS NULL OR publish_at <= now());

-- Supports the cron query: "find due-but-not-fanned-out rows".
-- Partial index keeps it tiny — only pending rows are in the index.
CREATE INDEX IF NOT EXISTS course_announcements_fanout_pending_idx
  ON public.course_announcements (publish_at)
  WHERE notifications_fanout_at IS NULL;


-- =============================================================================
-- SECTION 2: GUARD THE EXISTING INSERT TRIGGER
-- The 0029 fanout_announcement_notifications trigger fired on every INSERT
-- regardless of publish_at. Now it only fires for immediate-publish rows AND
-- stamps notifications_fanout_at so the cron worker skips them.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fanout_announcement_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Scheduled rows: skip. The cron worker will fan out when publish_at hits.
  IF NEW.publish_at IS NOT NULL AND NEW.publish_at > now() THEN
    RETURN NEW;
  END IF;

  -- Draft rows: skip. Students can't see them; no notification.
  IF NEW.published = false THEN
    RETURN NEW;
  END IF;

  -- Immediate-publish (publish_at IS NULL) OR scheduled-in-the-past at
  -- INSERT time. Same fan-out as before.
  INSERT INTO public.notifications (recipient_id, kind, title, body, link)
  SELECT cm.student_id,
         'announcement',
         'New announcement: ' || NEW.title,
         left(NEW.body, 200),
         '/courses/' || NEW.course_id || '/announcements'
    FROM public.course_memberships cm
   WHERE cm.course_id = NEW.course_id;

  -- Record fan-out so the cron worker never reconsiders this row.
  UPDATE public.course_announcements
     SET notifications_fanout_at = now()
   WHERE id = NEW.id;

  RETURN NEW;
END
$$;

-- Trigger itself is unchanged; replacing the function above is enough.
-- (Re-declare DROP+CREATE for idempotency hygiene.)
DROP TRIGGER IF EXISTS trg_fanout_announcement ON public.course_announcements;
CREATE TRIGGER trg_fanout_announcement
  AFTER INSERT ON public.course_announcements
  FOR EACH ROW EXECUTE FUNCTION public.fanout_announcement_notifications();


-- =============================================================================
-- SECTION 3: CRON WORKER FUNCTION
-- Tick-driven fan-out for scheduled rows whose publish_at has crossed now().
-- Returns the number of rows fanned out for observability / smoke testing.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fanout_due_announcements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_count integer := 0;
  v_row   record;
BEGIN
  -- FOR UPDATE SKIP LOCKED so two concurrent cron ticks (or a manual call
  -- racing the cron tick) don't double-fan-out the same row. LIMIT 500
  -- keeps each tick bounded — at one minute granularity that's >8/sec
  -- throughput which is far above realistic scheduled-post volume.
  FOR v_row IN
    SELECT a.id, a.course_id, a.title, a.body, a.published
      FROM public.course_announcements a
     WHERE a.publish_at IS NOT NULL
       AND a.publish_at <= now()
       AND a.notifications_fanout_at IS NULL
     ORDER BY a.publish_at ASC
     LIMIT 500
     FOR UPDATE SKIP LOCKED
  LOOP
    -- Drafts: stamp anyway so we don't keep reconsidering them every tick.
    -- If the teacher later publishes, an UPDATE doesn't re-trigger fan-out
    -- — but that's consistent with the existing behavior (the INSERT
    -- trigger never re-fires on UPDATE either). Documented gap.
    IF v_row.published = true THEN
      INSERT INTO public.notifications (recipient_id, kind, title, body, link)
      SELECT cm.student_id,
             'announcement',
             'New announcement: ' || v_row.title,
             left(v_row.body, 200),
             '/courses/' || v_row.course_id || '/announcements'
        FROM public.course_memberships cm
       WHERE cm.course_id = v_row.course_id;
    END IF;

    UPDATE public.course_announcements
       SET notifications_fanout_at = now()
     WHERE id = v_row.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END
$$;

COMMENT ON FUNCTION public.fanout_due_announcements() IS
  'Cron worker. Dispatches student notifications for scheduled announcements '
  'whose publish_at has crossed now(). Stamps notifications_fanout_at so each '
  'row is processed at most once. Returns count of rows handled per tick.';


-- =============================================================================
-- SECTION 4: SCHEDULE
-- Mirrors the unschedule-then-schedule pattern from 0031 for idempotency.
-- =============================================================================

DO $$
BEGIN
  -- pg_cron is enabled by 0031. If running standalone (shadow db), guard.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not available; skipping schedule. Re-run after enabling.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('announcement-fanout-minute')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'announcement-fanout-minute');

  PERFORM cron.schedule(
    'announcement-fanout-minute',
    '* * * * *',
    'SELECT public.fanout_due_announcements();'
  );
END
$$;


-- =============================================================================
-- END OF MIGRATION 0057_scheduled_announcement_fanout.sql
-- =============================================================================
