-- =============================================================================
-- Migration: 0113_proctor_messages.sql
-- Description: Two-way proctor ⇄ student messaging for a paused live test.
--
-- The proctor pauses a sitting (0102 proctor_set_pause); the student sees a
-- "Paused by your teacher" screen. This adds a recorded, two-way channel so the
-- proctor can give a reason and the student can respond (presets + free text):
--
--   proctor_messages          — append-only message log per run (no UPDATE/
--                               DELETE policy → a permanent record).
--   student_send_proctor_message(run, kind, body)
--                             — student → proctor; only on the student's OWN
--                               run, only while it is PAUSED (the safe window:
--                               timer frozen, no test content on screen).
--   proctor_send_message(run, kind, body)
--                             — proctor → student; staff, gated admin OR
--                               teacher-of-the-run's-course (same predicate as
--                               proctor_set_pause). kind 'pause' carries the
--                               pause reason.
--
-- Reads are RLS-direct (+ realtime): the student reads their own run's thread;
-- staff read any (proctoring data is staff-only). Writes are DEFINER-only so
-- `sender` can't be forged and the paused-window rule can't be bypassed.
-- Forward-only.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.proctor_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     uuid NOT NULL REFERENCES public.test_runs(id) ON DELETE CASCADE,
  sender     text NOT NULL CHECK (sender IN ('student', 'staff')),
  sender_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind       text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'preset', 'pause')),
  body       text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proctor_messages_run_idx
  ON public.proctor_messages (run_id, created_at);

ALTER TABLE public.proctor_messages ENABLE ROW LEVEL SECURITY;

-- Student reads their own run's thread; staff read any (staff-only data).
-- There is intentionally NO INSERT/UPDATE/DELETE policy — only the DEFINER RPCs
-- below write, so `sender` is trustworthy and the log is append-only.
DROP POLICY IF EXISTS proctor_messages_student_read ON public.proctor_messages;
CREATE POLICY proctor_messages_student_read ON public.proctor_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.test_runs r
       WHERE r.id = proctor_messages.run_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS proctor_messages_staff_read ON public.proctor_messages;
CREATE POLICY proctor_messages_staff_read ON public.proctor_messages
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- Deliver inserts over realtime (student overlay + proctor monitor subscribe).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'proctor_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.proctor_messages;
  END IF;
END$$;

-- 1. Student → proctor (own run, paused only) --------------------------------
CREATE OR REPLACE FUNCTION public.student_send_proctor_message(
  p_run_id uuid,
  p_kind   text,
  p_body   text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.test_runs%ROWTYPE;
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_kind NOT IN ('text', 'preset') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) = 0 THEN
    RAISE EXCEPTION 'invalid_message';
  END IF;

  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_run.status <> 'in_progress' THEN RAISE EXCEPTION 'run_already_submitted'; END IF;
  -- Student may only message while the proctor has them paused.
  IF v_run.paused_at IS NULL THEN RAISE EXCEPTION 'not_paused'; END IF;

  INSERT INTO public.proctor_messages (run_id, sender, sender_id, kind, body)
  VALUES (p_run_id, 'student', v_uid, p_kind, btrim(p_body))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.student_send_proctor_message(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_send_proctor_message(uuid, text, text) TO authenticated;

-- 2. Proctor → student (staff; admin or teacher-of-course) -------------------
CREATE OR REPLACE FUNCTION public.proctor_send_message(
  p_run_id uuid,
  p_kind   text,
  p_body   text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_run  public.test_runs%ROWTYPE;
  v_slug text;
  v_ok   boolean;
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_kind NOT IN ('text', 'preset', 'pause') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) = 0 THEN
    RAISE EXCEPTION 'invalid_message';
  END IF;

  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.status <> 'in_progress' THEN RAISE EXCEPTION 'run_already_submitted'; END IF;

  -- Non-admin staff must teach a course whose Modules link this test
  -- (identical predicate to proctor_set_pause).
  IF NOT public.is_admin(v_uid) THEN
    SELECT t.slug INTO v_slug FROM public.tests t WHERE t.id = v_run.test_id;
    SELECT EXISTS (
      SELECT 1 FROM public.module_items mi
        JOIN public.course_modules cm ON cm.id = mi.module_id
        JOIN public.courses c ON c.id = cm.course_id
       WHERE mi.item_type = 'link'
         AND mi.url ILIKE '%/test/' || v_slug || '%'
         AND c.teacher_id = v_uid
    ) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'not_authorized'; END IF;
  END IF;

  INSERT INTO public.proctor_messages (run_id, sender, sender_id, kind, body)
  VALUES (p_run_id, 'staff', v_uid, p_kind, btrim(p_body))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.proctor_send_message(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proctor_send_message(uuid, text, text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0113_proctor_messages.sql
-- =============================================================================
