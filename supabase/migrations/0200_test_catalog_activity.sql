-- =============================================================================
-- Migration: 0200_test_catalog_activity.sql
-- Description: One cheap aggregate RPC the Full-Test catalog calls once to learn,
--   per test, how many of the caller's courses link it (assigned_courses) and how
--   many enrolled students have a live in-progress sitting right now (live_now).
--
-- Why: the catalog's "Monitor" button used to always render as "live" (animated
--   ping) regardless of activity. We want it active only when a test is actually
--   assigned to a course AND students are mid-sitting — and we want a one-call
--   signal to drive a "Live now" view without N per-test round-trips.
--
-- Scope (mirrors test_live_progress, 0108):
--   A test is "assigned" to a course when that course has a module_items link
--   (item_type='link', url ILIKE '%/test/<slug>%'). The caller sees their own
--   courses (courses.teacher_id = auth.uid()); admins see all. live_now counts
--   DISTINCT students with a status='in_progress' test_run for the test who are
--   enrolled in one of those linked courses — so live_now > 0 already implies
--   assigned, matching the "assigned AND active" gate the client wants.
--
-- Returns one row PER test (assigned_courses / live_now may be 0) so the client
--   can left-join by slug. STABLE, SECURITY DEFINER, SET search_path = public,auth
--   per the trigger/RPC rule in CLAUDE.md. Error codes: not_authenticated,
--   not_authorized. GRANT EXECUTE TO authenticated.
--
-- Forward-only. No rollback.
-- =============================================================================

DROP FUNCTION IF EXISTS public.test_catalog_activity();

CREATE FUNCTION public.test_catalog_activity()
RETURNS TABLE (
  slug             text,
  assigned_courses integer,
  live_now         integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_admin := public.is_admin(v_uid);

  RETURN QUERY
  WITH links AS (
    -- (test, course) pairs the caller can see via a Modules link to /test/<slug>.
    SELECT DISTINCT t.id AS test_id, t.slug AS test_slug, c.id AS course_id
      FROM public.module_items mi
      JOIN public.course_modules cmod ON cmod.id = mi.module_id
      JOIN public.courses c           ON c.id = cmod.course_id
      JOIN public.tests t             ON mi.url ILIKE '%/test/' || t.slug || '%'
     WHERE mi.item_type = 'link'
       AND (v_admin OR c.teacher_id = v_uid)
  ),
  agg_courses AS (
    SELECT test_slug, count(DISTINCT course_id)::int AS n FROM links GROUP BY test_slug
  ),
  live AS (
    -- DISTINCT student per test with a live sitting, scoped to a linked course.
    SELECT DISTINCT l.test_slug, r.user_id AS sid
      FROM links l
      JOIN public.course_memberships cm ON cm.course_id = l.course_id
      JOIN public.test_runs r
        ON r.test_id = l.test_id
       AND r.user_id = cm.student_id
       AND r.status  = 'in_progress'
  ),
  agg_live AS (
    SELECT test_slug, count(DISTINCT sid)::int AS n FROM live GROUP BY test_slug
  )
  SELECT t.slug,
         COALESCE(ac.n, 0) AS assigned_courses,
         COALESCE(al.n, 0) AS live_now
    FROM public.tests t
    LEFT JOIN agg_courses ac ON ac.test_slug = t.slug
    LEFT JOIN agg_live    al ON al.test_slug = t.slug;
END;
$$;

GRANT EXECUTE ON FUNCTION public.test_catalog_activity() TO authenticated;
