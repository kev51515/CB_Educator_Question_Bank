-- =============================================================================
-- Migration: 0219_scheduled_publish.sql
-- Description: Scheduled publishing for modules + module items.
--
--   Teachers can pre-arrange content: set `publish_at` on a course_module
--   and/or its module_items and a pg_cron tick (every minute, same pattern
--   as 0058's announcement fan-out) flips `published = true` when the time
--   arrives. Visibility semantics are unchanged — a student sees an item
--   only when BOTH its module and the item are published — which yields the
--   requested cascade for free:
--
--     · an item scheduled at/before its module's publish time goes live
--       WITH the container;
--     · unscheduled draft items stay drafts when the module publishes;
--     · an item whose time arrives while its module is still a draft flips
--       `published` but stays invisible until the module goes live (the
--       teacher UI surfaces this state explicitly).
--
--   Assignments already carry start (`opens_at`) + due (`due_at`); their
--   "publish time" IS their module item's publish_at (student visibility of
--   an assignment is gated by its module_items row).
--
--   Manual publish toggles clear publish_at client-side ("publish now"
--   supersedes the schedule). The cron flip leaves publish_at in place as a
--   historical record; the UI only badges "Scheduled" while NOT published.
--
-- Forward-only.
-- =============================================================================

ALTER TABLE public.course_modules
  ADD COLUMN IF NOT EXISTS publish_at timestamptz;

ALTER TABLE public.module_items
  ADD COLUMN IF NOT EXISTS publish_at timestamptz;

-- The cron tick scans only unpublished rows with a schedule — keep that
-- path index-only and tiny.
CREATE INDEX IF NOT EXISTS course_modules_publish_at_idx
  ON public.course_modules (publish_at)
  WHERE publish_at IS NOT NULL AND NOT published;

CREATE INDEX IF NOT EXISTS module_items_publish_at_idx
  ON public.module_items (publish_at)
  WHERE publish_at IS NOT NULL AND NOT published;

-- ---------------------------------------------------------------------------
-- Worker — called by pg_cron every minute. SECURITY DEFINER per CLAUDE.md
-- (the function owner flips rows regardless of RLS). Returns the counts so
-- probes/ops can verify a tick did something.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_scheduled_content()
RETURNS TABLE (modules_published integer, items_published integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_modules integer := 0;
  v_items   integer := 0;
BEGIN
  -- Trashed rows (0198/0202 soft delete) never auto-publish.
  UPDATE public.course_modules
     SET published = true,
         updated_at = now()
   WHERE NOT published
     AND publish_at IS NOT NULL
     AND publish_at <= now()
     AND deleted_at IS NULL;
  GET DIAGNOSTICS v_modules = ROW_COUNT;

  UPDATE public.module_items
     SET published = true
   WHERE NOT published
     AND publish_at IS NOT NULL
     AND publish_at <= now()
     AND deleted_at IS NULL;
  GET DIAGNOSTICS v_items = ROW_COUNT;

  RETURN QUERY SELECT v_modules, v_items;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_scheduled_content() FROM PUBLIC;
-- service_role may invoke it directly (smoke probes, manual ops ticks);
-- authenticated users may NOT — the cron job runs as the function owner.
GRANT EXECUTE ON FUNCTION public.publish_scheduled_content() TO service_role;

-- ---------------------------------------------------------------------------
-- Cron registration (idempotent re-schedule, 0198 pattern).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not available; skipping schedule. Re-run after enabling.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('scheduled-publish-tick')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-publish-tick');

  PERFORM cron.schedule(
    'scheduled-publish-tick',
    '* * * * *',
    $cron$ SELECT public.publish_scheduled_content(); $cron$
  );
END;
$$;

-- =============================================================================
-- END OF MIGRATION 0219_scheduled_publish.sql
-- =============================================================================
