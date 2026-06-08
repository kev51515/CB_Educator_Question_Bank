-- =============================================================================
-- Migration: 0114_proctor_send_admin_only.sql
-- Description: Tighten proctor_send_message (0113) to ADMIN-only, matching the
--              0104 proctoring model.
--
-- 0104 made every proctor ACTION (pause/resume, add-time, force-submit, reset,
-- release) admin-only so two teachers can't issue conflicting actions on one
-- sitting; non-admin staff keep READ access. Sending a control message to a
-- live student is a proctor action, so it belongs to the admin too. The 0113
-- version allowed is_staff + teacher-of-course — this aligns it with pause.
--
-- Reads are unchanged: the proctor_messages staff-read RLS still lets any staff
-- see the thread (parity with the read-only live monitor). The student RPC is
-- unchanged. Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.proctor_send_message(
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
  -- Admin-only, per the 0104 proctoring model (pause/add-time/etc are admin-only).
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_kind NOT IN ('text', 'preset', 'pause') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) = 0 THEN
    RAISE EXCEPTION 'invalid_message';
  END IF;

  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.status <> 'in_progress' THEN RAISE EXCEPTION 'run_already_submitted'; END IF;

  INSERT INTO public.proctor_messages (run_id, sender, sender_id, kind, body)
  VALUES (p_run_id, 'staff', v_uid, p_kind, btrim(p_body))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.proctor_send_message(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proctor_send_message(uuid, text, text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0114_proctor_send_admin_only.sql
-- =============================================================================
