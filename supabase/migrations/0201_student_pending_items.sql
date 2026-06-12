-- 0201_student_pending_items.sql
-- Student "pending items" + calendar feed support.
--
-- 1. student_course_seen — DB-backed per-(student, course) last-seen marker so
--    "new since you last looked" badges survive across devices (localStorage
--    couldn't: a student who checked on their phone still saw stale badges on
--    the laptop).
-- 2. mark_course_seen(p_course_id) — upsert RPC called when the student opens
--    a course page.
-- 3. get_student_pending_counts() — one round trip returning per-course counts
--    that drive the sidebar Courses badge, per-course "new" pills, and the
--    Home indicators:
--      new_announcements     published announcements since last seen
--      new_items             newly published non-assignment module items
--                            (links/pages/files — practice tests link this way)
--      unstarted_assignments open assignments with no submitted attempt
--                            (pending work — NOT gated on last_seen; it clears
--                            by doing the work, not by looking at it)
--      due_soon              subset of unstarted with due_at within 48h
--      new_grades            attempts graded since last seen
-- 4. calendar_feed_tokens + get_or_create_calendar_token() — opaque per-user
--    token for the read-only ICS feed served by the calendar-ics edge
--    function (personal Google/Apple calendar subscription). The token is the
--    only credential on that URL, so it lives in its own table (rotatable
--    later without touching profiles).

-- ---------------------------------------------------------------------------
-- 1. Seen-state table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_course_seen (
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id    uuid        NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);

ALTER TABLE public.student_course_seen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_seen: own rows" ON public.student_course_seen;
CREATE POLICY "course_seen: own rows"
  ON public.student_course_seen FOR SELECT
  USING (user_id = (SELECT auth.uid()));
-- INSERT/UPDATE go through mark_course_seen (SECURITY DEFINER) so the
-- membership check lives in one place; no direct write policies needed.

-- ---------------------------------------------------------------------------
-- 2. mark_course_seen
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_course_seen(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_student_in_course(v_uid, p_course_id) THEN
    RAISE EXCEPTION 'not_enrolled';
  END IF;

  INSERT INTO public.student_course_seen (user_id, course_id, last_seen_at)
  VALUES (v_uid, p_course_id, now())
  ON CONFLICT (user_id, course_id)
  DO UPDATE SET last_seen_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_course_seen(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_student_pending_counts
-- ---------------------------------------------------------------------------
-- Baseline per course = last_seen_at if the student has ever opened the
-- course, else their enrolment time (joining a course should not light up a
-- year of pre-enrolment announcements).
CREATE OR REPLACE FUNCTION public.get_student_pending_counts()
RETURNS TABLE (
  course_id             uuid,
  new_announcements     integer,
  new_items             integer,
  unstarted_assignments integer,
  due_soon              integer,
  new_grades            integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  enrolled AS (
    SELECT m.course_id,
           GREATEST(
             COALESCE(s.last_seen_at, '-infinity'::timestamptz),
             m.joined_at
           ) AS baseline
    FROM public.course_memberships m
    CROSS JOIN me
    LEFT JOIN public.student_course_seen s
      ON s.user_id = me.uid AND s.course_id = m.course_id
    WHERE m.student_id = me.uid
  )
  SELECT
    e.course_id,
    (SELECT count(*)::integer FROM public.course_announcements ca
      WHERE ca.course_id = e.course_id
        AND ca.published
        AND (ca.publish_at IS NULL OR ca.publish_at <= now())
        AND GREATEST(ca.created_at, COALESCE(ca.publish_at, ca.created_at)) > e.baseline
    ) AS new_announcements,
    (SELECT count(*)::integer FROM public.module_items mi
      JOIN public.course_modules cm ON cm.id = mi.module_id
      WHERE cm.course_id = e.course_id
        AND cm.published
        AND (cm.opens_at IS NULL OR cm.opens_at <= now())
        AND mi.published
        AND mi.item_type NOT IN ('assignment', 'header')
        AND mi.created_at > e.baseline
    ) AS new_items,
    (SELECT count(*)::integer FROM public.assignments a
      WHERE a.course_id = e.course_id
        AND NOT a.archived
        AND a.opens_at <= now()
        AND NOT EXISTS (
          SELECT 1 FROM public.assignment_attempts at, me
          WHERE at.assignment_id = a.id
            AND at.student_id = me.uid
            AND at.submitted_at IS NOT NULL
        )
    ) AS unstarted_assignments,
    (SELECT count(*)::integer FROM public.assignments a
      WHERE a.course_id = e.course_id
        AND NOT a.archived
        AND a.opens_at <= now()
        AND a.due_at IS NOT NULL
        AND a.due_at BETWEEN now() AND now() + interval '48 hours'
        AND NOT EXISTS (
          SELECT 1 FROM public.assignment_attempts at, me
          WHERE at.assignment_id = a.id
            AND at.student_id = me.uid
            AND at.submitted_at IS NOT NULL
        )
    ) AS due_soon,
    (SELECT count(*)::integer FROM public.assignment_attempts at
      JOIN public.assignments a ON a.id = at.assignment_id
      CROSS JOIN me
      WHERE a.course_id = e.course_id
        AND at.student_id = me.uid
        AND at.graded_at IS NOT NULL
        AND at.graded_at > e.baseline
    ) AS new_grades
  FROM enrolled e;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_pending_counts() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Calendar feed tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  user_id    uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  token      uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_tokens: own row" ON public.calendar_feed_tokens;
CREATE POLICY "calendar_tokens: own row"
  ON public.calendar_feed_tokens FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.get_or_create_calendar_token()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_token uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO public.calendar_feed_tokens (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT token INTO v_token
  FROM public.calendar_feed_tokens
  WHERE user_id = v_uid;

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_calendar_token() TO authenticated;
