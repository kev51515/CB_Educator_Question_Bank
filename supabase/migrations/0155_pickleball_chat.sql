-- =============================================================================
-- Migration: 0155_pickleball_chat.sql
-- Description: Realtime community chat for pickleball courses (both player and
-- coach tracks). A single per-course message stream any enrolled member or
-- educator of the course can read + post to. Messages soft-delete (deleted_at)
-- so moderation removes them from view without losing the row for audit.
--
-- RLS reuses the existing SECURITY DEFINER helpers (no new membership helper):
--   * is_teacher_of_course(uid, course_id)  — owner / co-teacher (0130)
--   * is_student_in_class(uid, course_id)   — enrolled member (0012/0130)
--   * is_admin(uid)                          — staff oversight (0001)
--
-- The table is added to the supabase_realtime publication with REPLICA IDENTITY
-- FULL so the client gets postgres_changes events (the ChatPanel subscribes on
-- INSERT filtered by course_id).
--
-- RPCs (pk_): pk_post_chat_message, pk_delete_chat_message. Both SECURITY
-- DEFINER with `SET search_path = public, auth`, GRANT EXECUTE TO authenticated,
-- and raise STABLE string error codes the client switches on
-- (not_authenticated / not_authorized / not_found / invalid_input).
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pickleball_chat_messages — per-course community chat stream.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_chat_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES public.profiles(id),
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at  timestamptz,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS pickleball_chat_messages_course_created_idx
  ON public.pickleball_chat_messages (course_id, created_at);

ALTER TABLE public.pickleball_chat_messages ENABLE ROW LEVEL SECURITY;

-- Any enrolled member OR educator of the course (or admin) may read non-deleted
-- messages.
DROP POLICY IF EXISTS "pk_chat: member or educator reads" ON public.pickleball_chat_messages;
CREATE POLICY "pk_chat: member or educator reads" ON public.pickleball_chat_messages
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      public.is_student_in_class((SELECT auth.uid()), course_id)
      OR public.is_teacher_of_course((SELECT auth.uid()), course_id)
      OR public.is_admin((SELECT auth.uid()))
    )
  );

-- Any enrolled member OR educator of the course (or admin) may post, but only
-- as themselves (sender_id = auth.uid()).
DROP POLICY IF EXISTS "pk_chat: member or educator inserts" ON public.pickleball_chat_messages;
CREATE POLICY "pk_chat: member or educator inserts" ON public.pickleball_chat_messages
  FOR INSERT
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND (
      public.is_student_in_class((SELECT auth.uid()), course_id)
      OR public.is_teacher_of_course((SELECT auth.uid()), course_id)
      OR public.is_admin((SELECT auth.uid()))
    )
  );

-- Author OR educator (or admin) may soft-delete (set deleted_at).
DROP POLICY IF EXISTS "pk_chat: author or educator moderates" ON public.pickleball_chat_messages;
CREATE POLICY "pk_chat: author or educator moderates" ON public.pickleball_chat_messages
  FOR UPDATE
  USING (
    sender_id = (SELECT auth.uid())
    OR public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    OR public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  );

-- -----------------------------------------------------------------------------
-- 2. Realtime: publish the table so the client receives postgres_changes events.
--    REPLICA IDENTITY FULL so DELETE/UPDATE payloads carry the old row.
--    Guard the publication ADD so re-running the migration is a no-op.
-- -----------------------------------------------------------------------------
ALTER TABLE public.pickleball_chat_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'pickleball_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pickleball_chat_messages;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 3. pk_post_chat_message — post a message to the course chat as the signed-in
--    user. Returns the inserted row. Membership/educator authorisation is
--    enforced here (and again by RLS WITH CHECK).
--    Error codes: not_authenticated / not_authorized / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_post_chat_message(
  p_course_id uuid,
  p_body      text
)
  RETURNS public.pickleball_chat_messages
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_body   text := btrim(COALESCE(p_body, ''));
  v_row    public.pickleball_chat_messages;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_course_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF v_body = '' THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_student_in_class(v_caller, p_course_id)
    OR public.is_teacher_of_course(v_caller, p_course_id)
    OR public.is_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pickleball_chat_messages (course_id, sender_id, body)
  VALUES (p_course_id, v_caller, v_body)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_post_chat_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_post_chat_message(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. pk_delete_chat_message — soft-delete a message. Author OR educator of the
--    message's course (or admin) may delete. Idempotent: deleting an already
--    deleted row returns the row unchanged.
--    Error codes: not_authenticated / not_found / not_authorized.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_delete_chat_message(
  p_id uuid
)
  RETURNS public.pickleball_chat_messages
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_chat_messages;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row
    FROM public.pickleball_chat_messages
   WHERE id = p_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (
    v_row.sender_id = v_caller
    OR public.is_teacher_of_course(v_caller, v_row.course_id)
    OR public.is_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_row.deleted_at IS NOT NULL THEN
    RETURN v_row; -- already deleted; idempotent no-op
  END IF;

  UPDATE public.pickleball_chat_messages
     SET deleted_at = now()
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_delete_chat_message(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_delete_chat_message(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0155_pickleball_chat.sql
-- =============================================================================
