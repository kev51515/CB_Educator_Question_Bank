-- =============================================================================
-- Migration: 0054_announcement_publish_at.sql
-- Description: Adds scheduled-publish support to course_announcements via a
--              nullable `publish_at` timestamp. When NULL, the announcement
--              is visible immediately (existing behavior, fully backward-
--              compatible). When set, the row exists in the DB but the
--              student-side SELECT filters it out until now() >= publish_at.
--
-- Why this matters (Wave M7 / Maya audit finding #2):
--   The Modal now ALSO supports broadcasting one announcement body to N
--   courses (one INSERT per course). When combined with a future publish_at,
--   Maya can write a "Quiz Friday" once, schedule it for 8am the morning of,
--   and target all four of her SAT cohorts in a single submission.
--
-- Design notes:
--   * No new RLS policy is needed. The existing student-read policy
--       USING (published = true AND is_student_in_class(uid, course_id))
--     already restricts to enrolled students. The publish_at check is layered
--     on at SELECT time by the client. We chose client-side filtering over a
--     policy rewrite because (a) keeping the RLS predicate cheap matters for
--     plan stability and (b) teachers MUST be able to read their own
--     scheduled rows in the teacher list (the "Scheduled" badge is the whole
--     point) — a single RLS rule can't easily say "students see only past
--     publish_at, teachers see everything" without re-introducing the
--     SELECT-policy split that 0015 deliberately kept simple.
--   * Index is (course_id, publish_at) — supports both the student-side
--     filter ("WHERE course_id=? AND (publish_at IS NULL OR publish_at <=
--     now())") and a future cron worker that wants "all rows with
--     publish_at <= now() AND notification_sent=false".
--   * Future enhancement (NOT in this migration): a pg_cron job that fans
--     out notifications when a scheduled post crosses its publish_at
--     boundary. v1 ships without fan-out — students simply see the post on
--     their next page load after the scheduled time. The notification gap
--     is acceptable because Maya's current workaround (writing N copies by
--     hand) already has no scheduled-fan-out either.
--
-- Platform: Supabase (PostgreSQL 15+). Forward-only, no rollback.
-- =============================================================================

ALTER TABLE public.course_announcements
  ADD COLUMN IF NOT EXISTS publish_at timestamptz;

-- Why (course_id, publish_at): the student-side query is "for course X, where
-- publish_at IS NULL OR publish_at <= now()". A composite covers both the
-- enrolment scope and the time predicate without a sort step. NULLs sort last
-- by default in btree, which is fine — the query unions both branches anyway.
CREATE INDEX IF NOT EXISTS course_announcements_publish_at_idx
  ON public.course_announcements (course_id, publish_at);

COMMENT ON COLUMN public.course_announcements.publish_at IS
  'Optional scheduled-publish timestamp. NULL = visible immediately. When set, '
  'students see the row only after now() >= publish_at. Teachers always see it '
  '(filtered client-side in useStudentAnnouncements / CourseAnnouncementsList).';
