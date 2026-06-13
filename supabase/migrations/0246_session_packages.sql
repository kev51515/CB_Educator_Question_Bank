-- =============================================================================
-- Migration: 0246_session_packages.sql
-- Description: Session-package TRACKING for tutoring courses (v1 = tracking
--              ONLY — no billing, no payments, no money). A teacher records
--              that a student bought a block of N sessions, then logs
--              attendance per meeting; the UI shows how many sessions remain so
--              the family can be reminded to top up before they run out.
--
--   Model:
--     * session_packages    — one row = "student bought N sessions in course C".
--                             total_sessions is the purchased count. There is
--                             deliberately NO stored remaining/used counter.
--     * session_attendance  — one row per logged meeting (present/absent/late/
--                             excused). Only 'present' and 'late' consume a
--                             session.
--
--   COMPUTED REMAINING (rationale): remaining is ALWAYS derived as
--   total_sessions - count(attendance WHERE status IN ('present','late')),
--   never stored. A stored counter drifts the instant an attendance row is
--   voided / a meeting is reclassified / two teachers log concurrently; a
--   computed value is correct by construction. The `session_package_balances`
--   view is the single read surface for used/remaining.
--
--   LOW-BALANCE NOTIFY: when logging attendance drops remaining to <=
--   low_balance_threshold (default 2), log_attendance fans a one-shot LINE
--   message out to the student's GUARDIANS (NOT the student), reusing the
--   exact guardian -> line_outbox loop from 0239 (JOIN guardian_students ->
--   line_links WHERE status='linked', INSERT line_outbox; line-dispatch (0153)
--   drains it to LINE). De-dup: low_balance_notified_at gates it so a guardian
--   is messaged once per dip below the line. void_attendance re-arms the gate
--   (sets low_balance_notified_at = NULL) because remaining just went back up,
--   so a later re-dip will notify again.
--
--   Auth: teacher-of-course (is_teacher_of_course) or admin (is_admin) manage
--   everything; a student may read their own packages + attendance. RLS on
--   both tables; SECURITY DEFINER RPCs carry the privileged writes. Stable
--   string error codes the client switches on: not_authenticated /
--   not_authorized / not_found. Important writes audit to audit_events.
--
--   Roster table is `course_memberships(course_id, student_id)` (renamed 0012).
--
-- !! NUMBERING: highest local file is 0245; this is 0246. A parallel session
--    shares this tree and pushes to main — re-verify `supabase migration list`
--    shows Local==Remote after push, and bump if a collision appears.
--
-- Platform: Supabase cloud (PostgreSQL 15+). Forward-only, no rollback.
-- =============================================================================


-- =============================================================================
-- SECTION 1: tables
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.session_packages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id             uuid NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  total_sessions        int  NOT NULL CHECK (total_sessions > 0),
  note                  text,
  low_balance_threshold int  NOT NULL DEFAULT 2,
  low_balance_notified_at timestamptz,
  created_by            uuid REFERENCES public.profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS session_packages_course_student_idx
  ON public.session_packages (course_id, student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.session_attendance (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id   uuid NOT NULL REFERENCES public.session_packages(id) ON DELETE CASCADE,
  session_date date NOT NULL DEFAULT current_date,
  status       text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  note         text,
  logged_by    uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS session_attendance_package_idx
  ON public.session_attendance (package_id);

ALTER TABLE public.session_packages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 2: balances view — COMPUTED used/remaining (single read surface)
-- =============================================================================
CREATE OR REPLACE VIEW public.session_package_balances AS
SELECT p.*,
       COALESCE(used.n, 0)                       AS used,
       p.total_sessions - COALESCE(used.n, 0)    AS remaining
  FROM public.session_packages p
  LEFT JOIN (
        SELECT package_id, count(*) AS n
          FROM public.session_attendance
         WHERE status IN ('present', 'late')
         GROUP BY package_id
       ) used ON used.package_id = p.id;


-- =============================================================================
-- SECTION 3: RLS policies (views inherit base-table RLS)
-- =============================================================================

-- session_packages -----------------------------------------------------------
DROP POLICY IF EXISTS "session_packages: teacher manages" ON public.session_packages;
CREATE POLICY "session_packages: teacher manages" ON public.session_packages
  FOR ALL
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "session_packages: student reads own" ON public.session_packages;
CREATE POLICY "session_packages: student reads own" ON public.session_packages
  FOR SELECT USING (student_id = (SELECT auth.uid()));

-- session_attendance (course resolved via the package) -----------------------
DROP POLICY IF EXISTS "session_attendance: teacher manages" ON public.session_attendance;
CREATE POLICY "session_attendance: teacher manages" ON public.session_attendance
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.session_packages sp
       WHERE sp.id = session_attendance.package_id
         AND (public.is_teacher_of_course((SELECT auth.uid()), sp.course_id)
              OR public.is_admin((SELECT auth.uid())))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.session_packages sp
       WHERE sp.id = session_attendance.package_id
         AND (public.is_teacher_of_course((SELECT auth.uid()), sp.course_id)
              OR public.is_admin((SELECT auth.uid())))
    )
  );

DROP POLICY IF EXISTS "session_attendance: student reads own" ON public.session_attendance;
CREATE POLICY "session_attendance: student reads own" ON public.session_attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.session_packages sp
       WHERE sp.id = session_attendance.package_id
         AND sp.student_id = (SELECT auth.uid())
    )
  );


-- =============================================================================
-- SECTION 4: RPCs (SECURITY DEFINER)
-- =============================================================================

-- 4a. create_session_package — teacher/admin records a purchased block.
CREATE OR REPLACE FUNCTION public.create_session_package(
  p_student_id    uuid,
  p_course_id     uuid,
  p_total_sessions int,
  p_note          text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT (public.is_teacher_of_course(v_uid, p_course_id)
          OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_total_sessions IS NULL OR p_total_sessions <= 0 THEN
    RAISE EXCEPTION 'invalid_total';
  END IF;

  INSERT INTO public.session_packages
    (student_id, course_id, total_sessions, note, created_by)
  VALUES
    (p_student_id, p_course_id, p_total_sessions, p_note, v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, 'session_package.create', 'session_package', v_id::text,
          jsonb_build_object('student_id', p_student_id,
                             'course_id', p_course_id,
                             'total_sessions', p_total_sessions));

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_session_package(uuid, uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_session_package(uuid, uuid, int, text) TO authenticated;


-- 4b. log_attendance — teacher/admin logs a meeting; consumes a session when
--     present/late; fans a one-shot low-balance LINE message to guardians.
CREATE OR REPLACE FUNCTION public.log_attendance(
  p_package_id   uuid,
  p_session_date date,
  p_status       text,
  p_note         text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_pkg       public.session_packages;
  v_remaining int;
  v_short     text;
  v_msg       text;
  rec         record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_pkg FROM public.session_packages WHERE id = p_package_id;
  IF v_pkg.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF NOT (public.is_teacher_of_course(v_uid, v_pkg.course_id)
          OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('present', 'absent', 'late', 'excused') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  INSERT INTO public.session_attendance
    (package_id, session_date, status, note, logged_by)
  VALUES
    (p_package_id, COALESCE(p_session_date, current_date), p_status, p_note, v_uid);

  -- Recompute remaining from the view (COMPUTED — never a stored counter).
  SELECT remaining INTO v_remaining
    FROM public.session_package_balances
   WHERE id = p_package_id;

  -- Low-balance fan-out: only on a consuming status, only when we just crossed
  -- the threshold, and only once (de-dup via low_balance_notified_at).
  IF p_status IN ('present', 'late')
     AND v_remaining <= v_pkg.low_balance_threshold
     AND v_pkg.low_balance_notified_at IS NULL THEN

    SELECT short_code INTO v_short FROM public.courses WHERE id = v_pkg.course_id;
    v_msg := 'Session balance is low: '
          || v_remaining || ' session'
          || CASE WHEN v_remaining = 1 THEN '' ELSE 's' END
          || ' remaining. Please contact the teacher to add more.';

    -- One line_outbox row per LINE-linked guardian of the student (0239 loop).
    FOR rec IN
      SELECT ll.line_user_id, ll.profile_id
        FROM public.guardian_students gs
        JOIN public.line_links ll ON ll.profile_id = gs.guardian_id
       WHERE gs.student_id = v_pkg.student_id
         AND ll.status = 'linked'
    LOOP
      INSERT INTO public.line_outbox (line_user_id, profile_id, kind, payload)
      VALUES (
        rec.line_user_id,
        rec.profile_id,
        'session_low_balance',
        jsonb_build_object(
          'type', 'text',
          'text', v_msg,
          'course', COALESCE(v_short, v_pkg.course_id::text),
          'remaining', v_remaining
        )
      );
    END LOOP;

    UPDATE public.session_packages
       SET low_balance_notified_at = now()
     WHERE id = p_package_id;

    INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
    VALUES (v_uid, 'session_package.low_balance', 'session_package', p_package_id::text,
            jsonb_build_object('student_id', v_pkg.student_id,
                               'course_id', v_pkg.course_id,
                               'remaining', v_remaining));
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.log_attendance(uuid, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_attendance(uuid, date, text, text) TO authenticated;


-- 4c. void_attendance — teacher/admin removes a logged meeting. Remaining goes
--     back up, so re-arm the low-balance gate for a future dip.
CREATE OR REPLACE FUNCTION public.void_attendance(p_attendance_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_pkg public.session_packages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT sp.* INTO v_pkg
    FROM public.session_attendance sa
    JOIN public.session_packages sp ON sp.id = sa.package_id
   WHERE sa.id = p_attendance_id;
  IF v_pkg.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF NOT (public.is_teacher_of_course(v_uid, v_pkg.course_id)
          OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM public.session_attendance WHERE id = p_attendance_id;

  -- Remaining just went up: re-arm low-balance so a later re-dip notifies again.
  UPDATE public.session_packages
     SET low_balance_notified_at = NULL
   WHERE id = v_pkg.id;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, 'session_package.void_attendance', 'session_package', v_pkg.id::text,
          jsonb_build_object('attendance_id', p_attendance_id));
END;
$$;
REVOKE ALL ON FUNCTION public.void_attendance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_attendance(uuid) TO authenticated;


-- 4d. get_course_session_balances — one row per enrolled student (newest
--     package per student; NULL package when none), for the teacher roster view.
CREATE OR REPLACE FUNCTION public.get_course_session_balances(p_course_id uuid)
RETURNS TABLE (
  student_id            uuid,
  student_name          text,
  package_id            uuid,
  total_sessions        int,
  used                  int,
  remaining             int,
  low_balance_threshold int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT (public.is_teacher_of_course(v_uid, p_course_id)
          OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT cm.student_id,
         pr.display_name                       AS student_name,
         b.id                                  AS package_id,
         b.total_sessions,
         b.used::int,
         b.remaining::int,
         b.low_balance_threshold
    FROM public.course_memberships cm
    JOIN public.profiles pr ON pr.id = cm.student_id
    LEFT JOIN LATERAL (
          SELECT spb.*
            FROM public.session_package_balances spb
           WHERE spb.course_id = p_course_id
             AND spb.student_id = cm.student_id
           ORDER BY spb.created_at DESC
           LIMIT 1
         ) b ON true
   WHERE cm.course_id = p_course_id
   ORDER BY pr.display_name NULLS LAST;
END;
$$;
REVOKE ALL ON FUNCTION public.get_course_session_balances(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_course_session_balances(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0246_session_packages.sql
-- =============================================================================
