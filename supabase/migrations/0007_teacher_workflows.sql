-- =============================================================================
-- Migration: 0007_teacher_workflows.sql
-- Description: Adds the `regenerate_class_join_code` RPC so a teacher can
--              cycle a class join code without giving the client direct
--              UPDATE access to the join_code column (collision retry logic
--              belongs server-side to avoid a half-applied state under
--              concurrent regeneration).
-- Platform: Supabase (PostgreSQL 15+)
-- Note: Supabase wraps each migration in a transaction automatically.
--
-- WHY THIS IS THE ONLY RPC ADDED:
--   The remaining new workflows in this milestone (archive class, edit class,
--   delete assignment, remove student, leave class, edit assignment, etc.)
--   are all single-row UPDATE/DELETE/INSERT operations that the existing RLS
--   policies in 0001 already gate correctly. The only operation that needs
--   server-side atomicity is the join-code regeneration loop, because it
--   needs to retry on uniqueness collisions and the client should not be
--   trusted to converge on a fresh code by itself.
-- =============================================================================


-- =============================================================================
-- SECTION 1: regenerate_class_join_code RPC
--
-- Generates a fresh 8-char join code (alphabet excludes O/0/I/1/L for legibility),
-- retries up to 5 times on uniqueness collision, and returns the updated row.
-- Requires the caller to be either the teacher who owns the class or an admin.
--
-- Why SECURITY DEFINER:
--   The retry loop runs server-side so we don't leak the alphabet to the
--   client or burn round trips. The function still respects business-level
--   authorization via the is_teacher_of_class / is_admin guards below.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.regenerate_class_join_code(p_class_id uuid)
  RETURNS TABLE (
    id          uuid,
    teacher_id  uuid,
    name        text,
    description text,
    join_code   text,
    archived    boolean,
    created_at  timestamptz,
    updated_at  timestamptz
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller    uuid := auth.uid();
  -- Why this alphabet: visually unambiguous characters only. O/0, I/1, and L
  -- are dropped so dictating a code over the phone is robust.
  v_alphabet  constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_alpha_len constant integer := length(v_alphabet);
  v_new_code  text;
  v_attempt   integer := 0;
  v_max       constant integer := 5;
  v_inserted  boolean := false;
  v_i         integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in.';
  END IF;

  IF NOT (
    public.is_teacher_of_class(v_caller, p_class_id)
    OR public.is_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'not_authorized'
      USING HINT = 'Only the owning teacher or an admin can regenerate the code.';
  END IF;

  WHILE v_attempt < v_max AND NOT v_inserted LOOP
    v_attempt := v_attempt + 1;

    -- Build "XXXX-XXXX" using random sampling from the legible alphabet.
    -- random() returns [0,1); floor * len yields an unbiased index in
    -- [0, v_alpha_len). The first/second halves are joined with a dash so
    -- the code matches the format teachers already see in the UI.
    v_new_code := '';
    FOR v_i IN 1..4 LOOP
      v_new_code := v_new_code
        || substr(v_alphabet, floor(random() * v_alpha_len)::int + 1, 1);
    END LOOP;
    v_new_code := v_new_code || '-';
    FOR v_i IN 1..4 LOOP
      v_new_code := v_new_code
        || substr(v_alphabet, floor(random() * v_alpha_len)::int + 1, 1);
    END LOOP;

    BEGIN
      UPDATE public.classes
         SET join_code = v_new_code
       WHERE classes.id = p_class_id;
      v_inserted := true;
    EXCEPTION
      WHEN unique_violation THEN
        -- Collision: try again with a fresh code on the next loop iteration.
        v_inserted := false;
    END;
  END LOOP;

  IF NOT v_inserted THEN
    RAISE EXCEPTION 'join_code_collision'
      USING HINT = 'Could not generate a unique join code after several attempts.';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.teacher_id,
    c.name,
    c.description,
    c.join_code,
    c.archived,
    c.created_at,
    c.updated_at
  FROM public.classes c
  WHERE c.id = p_class_id;
END;
$$;

-- Why: lock down the function's privilege surface. PUBLIC keeps the door
-- open by default; we explicitly limit execution to signed-in users.
REVOKE ALL ON FUNCTION public.regenerate_class_join_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_class_join_code(uuid) TO authenticated;


-- =============================================================================
-- END OF MIGRATION 0007_teacher_workflows.sql
-- =============================================================================
