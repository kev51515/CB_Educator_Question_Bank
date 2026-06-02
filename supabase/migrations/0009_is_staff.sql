-- =============================================================================
-- Migration: 0009_is_staff.sql
-- Description: Collapse the admin/teacher privilege boundary into a single
--              "staff" gate for the current single-team operation. The LMS
--              is run by a husband-wife team — they want any teacher to have
--              the same operational reach as an admin (manage all classes,
--              all users, invite codes, dashboard stats).
-- Platform: Supabase (PostgreSQL 15+)
-- Note: Supabase wraps each migration in a transaction automatically.
--
-- WHY THIS DOESN'T DROP THE 'admin' ROLE:
--   The `admin` enum value stays in the schema so a future split (multi-
--   school tenancy, billing admin, etc.) is a small refactor — not a data
--   migration. Today, every privileged surface is gated on `is_staff` which
--   is just `is_teacher OR is_admin`. The set_user_role / admin_delete_user
--   self-guards still keep individual admins from locking themselves out.
--
-- HOW TO UNDO (re-split admin vs teacher):
--   Replace every `public.is_staff(...)` call below with `public.is_admin(...)`
--   — same set of functions and policies. The helper itself can stay; nothing
--   else uses it once the gates flip back. No data shape changes are needed.
--
-- WHAT THIS MIGRATION TOUCHES:
--   1. New helper:  public.is_staff(uid)
--   2. RPC re-gates (CREATE OR REPLACE — bodies preserved verbatim, only the
--      authorization check flips from is_admin to is_staff):
--        - public.mint_teacher_invite      (was admin-only)
--        - public.revoke_teacher_invite    (was admin-only)
--        - public.set_user_role            (was admin-only; keeps cannot_demote_self)
--        - public.admin_delete_user        (was admin-only; keeps cannot_delete_self)
--        - public.admin_dashboard_stats    (was admin-only)
--   3. RLS policy re-gates (rename "admin reads/updates all" → "staff …"):
--        - profiles            SELECT + UPDATE
--        - classes             SELECT
--        - assignments         SELECT
--        - assignment_attempts SELECT
--        - teacher_invite_codes        SELECT
--        - teacher_invite_redemptions  SELECT
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT TOUCH:
--   - bootstrap_first_admin (still admin-specific by design)
--   - the role enum, profile schema, or any data
--   - INSERT/UPDATE/DELETE policies that already accept both teachers (via
--     ownership) and admins (via is_admin) — those continue to work and
--     re-routing them through is_staff would loosen *teacher* access more
--     than intended (e.g., letting teachers edit other teachers' classes).
--     We only relax the "admin sees/edits everything" surface, which is
--     exactly the cross-cutting capability staff want shared.
-- =============================================================================


-- =============================================================================
-- SECTION 1: HELPER — is_staff(uid)
-- Returns true if the user is a teacher OR an admin. SECURITY DEFINER so it
-- can be called from inside RLS policies without recursing through profiles.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_staff(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.is_teacher(uid) OR public.is_admin(uid);
$$;

REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;


-- =============================================================================
-- SECTION 2: RPC RE-GATES
-- Each function body is identical to its previous definition; only the
-- authorization check switches from is_admin → is_staff. The "not_authorized"
-- error name is preserved so the UI layer continues to recognize it.
-- =============================================================================

-- ---- mint_teacher_invite (was 0005) ----

CREATE OR REPLACE FUNCTION public.mint_teacher_invite(
  p_code       text,
  p_note       text,
  p_expires_at timestamptz,
  p_max_uses   integer
)
  RETURNS public.teacher_invite_codes
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_code    text;
  v_row     public.teacher_invite_codes%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Was: is_admin. Now: is_staff. Teachers may also mint invite codes.
  IF NOT public.is_staff(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_code := lower(trim(coalesce(p_code, '')));
  IF char_length(v_code) < 6 OR char_length(v_code) > 32 THEN
    RAISE EXCEPTION 'invalid_code_length' USING ERRCODE = '22023';
  END IF;

  IF v_code !~ '^[a-z0-9_-]+$' THEN
    RAISE EXCEPTION 'invalid_code_format' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.teacher_invite_codes WHERE code = v_code) THEN
    RAISE EXCEPTION 'code_already_exists' USING ERRCODE = '23505';
  END IF;

  IF p_max_uses IS NOT NULL AND p_max_uses <= 0 THEN
    RAISE EXCEPTION 'invalid_max_uses' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.teacher_invite_codes (code, note, created_by, expires_at, max_uses)
  VALUES (v_code, NULLIF(trim(p_note), ''), v_uid, p_expires_at, p_max_uses)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mint_teacher_invite(text, text, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mint_teacher_invite(text, text, timestamptz, integer) TO authenticated;


-- ---- revoke_teacher_invite (was 0005) ----

CREATE OR REPLACE FUNCTION public.revoke_teacher_invite(p_code text)
  RETURNS public.teacher_invite_codes
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_row  public.teacher_invite_codes%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Was: is_admin. Now: is_staff.
  IF NOT public.is_staff(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.teacher_invite_codes
     SET revoked = true
   WHERE code = lower(trim(p_code))
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'code_not_found' USING ERRCODE = '02000';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_teacher_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_teacher_invite(text) TO authenticated;


-- ---- set_user_role (was 0006) ----
-- Self-demotion guard (cannot_demote_self) preserved verbatim.

CREATE OR REPLACE FUNCTION public.set_user_role(
  p_user_id uuid,
  p_role    public.user_role
)
  RETURNS public.profiles
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Was: is_admin. Now: is_staff.
  IF NOT public.is_staff(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user_id' USING ERRCODE = '22023';
  END IF;

  -- Self-demotion guard preserved. Note: an admin demoting themselves to
  -- teacher is still blocked (p_role <> 'admin'), and a teacher attempting
  -- to demote themselves to student is likewise blocked. This is the
  -- intended floor: staff can't accidentally orphan their own access.
  IF p_user_id = v_uid AND p_role <> 'admin' THEN
    RAISE EXCEPTION 'cannot_demote_self' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET role = p_role,
         updated_at = now()
   WHERE id = p_user_id
  RETURNING * INTO v_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = '02000';
  END IF;

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_role(uuid, public.user_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, public.user_role) TO authenticated;


-- ---- admin_delete_user (was 0006) ----
-- Self-delete guard (cannot_delete_self) preserved verbatim.

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Was: is_admin. Now: is_staff.
  IF NOT public.is_staff(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user_id' USING ERRCODE = '22023';
  END IF;

  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'cannot_delete_self' USING ERRCODE = '22023';
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = '02000';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;


-- ---- admin_dashboard_stats (was 0006) ----
-- Aggregation body unchanged; only the gate flips.

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Was: is_admin. Now: is_staff.
  IF NOT public.is_staff(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  WITH
    users_roles AS (
      SELECT
        count(*) FILTER (WHERE role = 'student') AS students,
        count(*) FILTER (WHERE role = 'teacher') AS teachers,
        count(*) FILTER (WHERE role = 'admin')   AS admins
      FROM public.profiles
    ),
    classes_agg AS (
      SELECT
        count(*) FILTER (WHERE archived = false) AS active,
        count(*) FILTER (WHERE archived = true)  AS archived
      FROM public.classes
    ),
    memberships_agg AS (
      SELECT count(*) AS total FROM public.class_memberships
    ),
    assignments_src AS (
      SELECT
        count(*) FILTER (WHERE source_id = 'cb')    AS cb,
        count(*) FILTER (WHERE source_id = 'sat')   AS sat,
        count(*) FILTER (WHERE source_id = 'mixed') AS mixed
      FROM public.assignments
    ),
    attempts_agg AS (
      SELECT
        count(*) FILTER (WHERE submitted_at IS NULL)     AS in_progress,
        count(*) FILTER (WHERE submitted_at IS NOT NULL) AS completed,
        avg(score_percent) FILTER (WHERE submitted_at IS NOT NULL) AS avg_score
      FROM public.assignment_attempts
    ),
    recent_signups AS (
      SELECT count(*) AS c
      FROM public.profiles
      WHERE created_at >= now() - interval '7 days'
    ),
    recent_attempts AS (
      SELECT count(*) AS c
      FROM public.assignment_attempts
      WHERE submitted_at IS NOT NULL
        AND submitted_at >= now() - interval '7 days'
    ),
    teacher_activity AS (
      SELECT
        p.id,
        p.display_name,
        p.email,
        (SELECT count(*) FROM public.classes c WHERE c.teacher_id = p.id) AS classes_count,
        (SELECT count(*) FROM public.assignments a WHERE a.created_by = p.id) AS assignments_count
      FROM public.profiles p
      WHERE p.role IN ('teacher', 'admin')
    ),
    top_teachers AS (
      SELECT jsonb_agg(t ORDER BY t.classes_count DESC, t.assignments_count DESC) FILTER (
        WHERE t.classes_count > 0 OR t.assignments_count > 0
      ) AS rows
      FROM (
        SELECT id, display_name, email, classes_count, assignments_count
        FROM teacher_activity
        ORDER BY classes_count DESC, assignments_count DESC
        LIMIT 5
      ) t
    ),
    student_activity AS (
      SELECT
        p.id,
        p.display_name,
        p.email,
        count(aa.id) AS completed_attempts
      FROM public.profiles p
      JOIN public.assignment_attempts aa
        ON aa.student_id = p.id AND aa.submitted_at IS NOT NULL
      WHERE p.role = 'student'
      GROUP BY p.id, p.display_name, p.email
      ORDER BY completed_attempts DESC
      LIMIT 5
    ),
    top_students AS (
      SELECT jsonb_agg(s) AS rows FROM student_activity s
    )
  SELECT jsonb_build_object(
    'users_by_role', jsonb_build_object(
      'student', (SELECT students FROM users_roles),
      'teacher', (SELECT teachers FROM users_roles),
      'admin',   (SELECT admins   FROM users_roles)
    ),
    'classes', jsonb_build_object(
      'active',   (SELECT active   FROM classes_agg),
      'archived', (SELECT archived FROM classes_agg)
    ),
    'memberships', (SELECT total FROM memberships_agg),
    'assignments_by_source', jsonb_build_object(
      'cb',    (SELECT cb    FROM assignments_src),
      'sat',   (SELECT sat   FROM assignments_src),
      'mixed', (SELECT mixed FROM assignments_src)
    ),
    'attempts', jsonb_build_object(
      'in_progress', (SELECT in_progress FROM attempts_agg),
      'completed',   (SELECT completed   FROM attempts_agg)
    ),
    'avg_score', (SELECT avg_score FROM attempts_agg),
    'recent_signups_count',  (SELECT c FROM recent_signups),
    'recent_attempts_count', (SELECT c FROM recent_attempts),
    'most_active_teachers',  COALESCE((SELECT rows FROM top_teachers), '[]'::jsonb),
    'most_active_students',  COALESCE((SELECT rows FROM top_students), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;


-- =============================================================================
-- SECTION 3: RLS POLICY RE-GATES
-- Drop the "admin reads/updates all" policies and recreate them as
-- "staff reads/updates all" backed by is_staff. The existing teacher
-- ownership policies (e.g., "classes: teacher sees own", "assignments:
-- teacher of class reads") stay in place — staff effectively gain the
-- union of "their own" + "everything via is_staff".
-- =============================================================================

-- ---- profiles ----

DROP POLICY IF EXISTS "profiles: admin reads all" ON public.profiles;
CREATE POLICY "profiles: staff reads all"
  ON public.profiles
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "profiles: admin updates all" ON public.profiles;
CREATE POLICY "profiles: staff updates all"
  ON public.profiles
  FOR UPDATE
  USING (
    -- Staff may edit any profile (display_name, role via set_user_role,
    -- etc). The self-demotion guard lives in the set_user_role RPC, not
    -- here — this policy lets the dashboard freely edit non-role fields
    -- for any user.
    public.is_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- classes ----

DROP POLICY IF EXISTS "classes: admin reads all" ON public.classes;
CREATE POLICY "classes: staff reads all"
  ON public.classes
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- assignments ----

DROP POLICY IF EXISTS "assignments: admin reads all" ON public.assignments;
CREATE POLICY "assignments: staff reads all"
  ON public.assignments
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- assignment_attempts ----

DROP POLICY IF EXISTS "attempts: admin reads all" ON public.assignment_attempts;
CREATE POLICY "attempts: staff reads all"
  ON public.assignment_attempts
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- teacher_invite_codes ----

DROP POLICY IF EXISTS "teacher_invite_codes: admin reads" ON public.teacher_invite_codes;
CREATE POLICY "teacher_invite_codes: staff reads"
  ON public.teacher_invite_codes
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );

-- ---- teacher_invite_redemptions ----

DROP POLICY IF EXISTS "teacher_invite_redemptions: admin reads" ON public.teacher_invite_redemptions;
CREATE POLICY "teacher_invite_redemptions: staff reads"
  ON public.teacher_invite_redemptions
  FOR SELECT
  USING (
    public.is_staff((SELECT auth.uid()))
  );


-- =============================================================================
-- END OF MIGRATION 0009_is_staff.sql
-- =============================================================================
