-- =============================================================================
-- Migration: 0002_join_class_rpc.sql
-- Description: Adds the `join_class_by_code` RPC and tightens the
--              class_memberships INSERT policy so that all student
--              enrollments must flow through the RPC.
-- Platform: Supabase (PostgreSQL 15+)
-- =============================================================================


-- =============================================================================
-- SECTION 1: TIGHTEN class_memberships INSERT POLICY
--
-- The original `memberships: student self-enrolls` policy in 0001_init.sql
-- allowed any authenticated user to insert a membership row for themselves
-- into any class. That meant a student who somehow learned a class_id (or
-- guessed one — UUIDs make that hard, but not impossible if leaked) could
-- enroll without ever seeing the join code.
--
-- Strategy (a): drop the student self-enroll INSERT policy entirely. All
-- student enrollments now go through `public.join_class_by_code`, which is
-- SECURITY DEFINER and validates the join code before inserting. The teacher
-- and admin INSERT policies remain untouched — they are still the correct
-- mechanism for teacher-driven or admin-driven enrollments.
-- =============================================================================

DROP POLICY IF EXISTS "memberships: student self-enrolls" ON public.class_memberships;


-- =============================================================================
-- SECTION 2: join_class_by_code RPC
--
-- Looks up a class by its join_code (case-insensitive, ignoring archived
-- classes). Inserts a membership row for the caller if one doesn't already
-- exist. Returns the class metadata so the UI can confirm what the student
-- just joined (including the teacher's display name).
--
-- Why SECURITY DEFINER: this function intentionally bypasses RLS on
-- class_memberships so that students — who have no direct INSERT privilege
-- post-tightening — can still enroll themselves once they prove they know
-- the join code. The function owner (postgres / supabase_admin) does the
-- write; the caller never touches the table directly.
--
-- The function raises `invalid_join_code` for unknown / archived codes so
-- the client can render a clean, user-facing error. Production note: this
-- function does not currently rate-limit. A future migration may want to
-- attach pg_stat-based or per-user counters to guard against brute-force
-- enumeration of join codes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.join_class_by_code(p_code text)
  RETURNS TABLE (
    id                   uuid,
    name                 text,
    description          text,
    join_code            text,
    teacher_display_name text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller    uuid := auth.uid();
  v_class_id  uuid;
  v_normalized text;
BEGIN
  -- Why: this RPC only makes sense for authenticated callers. anon callers
  -- get a clean error rather than a "null value violates not-null" surprise.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in to join a class.';
  END IF;

  -- Why: trim + case-fold once so the lookup is predictable regardless of
  -- whether the user typed "ABCD-1234", "abcd-1234", or "  ABCD-1234  ".
  v_normalized := upper(trim(coalesce(p_code, '')));

  IF v_normalized = '' THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'Join code is required.';
  END IF;

  -- Locate the class. Skip archived classes — they are effectively closed
  -- for new enrollments even if the code is still technically unique.
  SELECT c.id
    INTO v_class_id
    FROM public.classes c
   WHERE upper(c.join_code) = v_normalized
     AND c.archived = false
   LIMIT 1;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'No active class found for that code.';
  END IF;

  -- Idempotent enrollment. A duplicate (already enrolled) is treated as
  -- success — the UI just shows the class confirmation again.
  INSERT INTO public.class_memberships (class_id, student_id)
  VALUES (v_class_id, v_caller)
  ON CONFLICT (class_id, student_id) DO NOTHING;

  -- Return the class row plus the teacher's display name so the UI can show
  -- a confirmation like "You joined Mrs. Patel's Algebra II".
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.description,
    c.join_code,
    p.display_name AS teacher_display_name
  FROM public.classes c
  JOIN public.profiles p ON p.id = c.teacher_id
  WHERE c.id = v_class_id;
END;
$$;

-- Why: lock down the function's privilege surface. PUBLIC keeps the door
-- open by default; we explicitly limit execution to signed-in users.
REVOKE ALL ON FUNCTION public.join_class_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_class_by_code(text) TO authenticated;


-- =============================================================================
-- END OF MIGRATION 0002_join_class_rpc.sql
-- =============================================================================
