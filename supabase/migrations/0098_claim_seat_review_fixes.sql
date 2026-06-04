-- =============================================================================
-- Migration: 0098_claim_seat_review_fixes.sql
-- Description: Review follow-ups for the seat-claim feature (0095/0096).
--
-- Fixes (from a multi-agent review, 2026-06-04):
--   1. NOTIFICATION SPAM: the already-claimed branch of claim_student_seat fired
--      a teacher notification on every re-submit (including refreshes of an
--      existing pending request). Now it notifies ONLY when a genuinely new
--      pending row is inserted.
--   2. DEFENSIVE email_confirmed_at: stamp email_confirmed_at = now() on the
--      auth.users email swap so the claimed/approved login can never land in an
--      "email not confirmed" state regardless of GoTrue config.
--   3. CLEAN email_in_use: wrap the auth.users email UPDATE in a unique_violation
--      handler so a race (or a case-only collision the pre-check missed) raises
--      the stable 'email_in_use' code instead of a raw constraint error.
--   4. decided_by FK gains ON DELETE SET NULL so deleting a teacher's profile
--      can't be blocked by a historical decided request.
--
-- Function bodies are the 0096 (claim) / 0095 (decide) versions with only the
-- above changes. Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4. decided_by → ON DELETE SET NULL
-- -----------------------------------------------------------------------------
ALTER TABLE public.seat_claim_requests
  DROP CONSTRAINT IF EXISTS seat_claim_requests_decided_by_fkey;
ALTER TABLE public.seat_claim_requests
  ADD CONSTRAINT seat_claim_requests_decided_by_fkey
  FOREIGN KEY (decided_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


-- -----------------------------------------------------------------------------
-- claim_student_seat — notify-on-new-only + confirmed email + email_in_use guard
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_student_seat(
  p_code     text,
  p_email    text,
  p_password text
)
  RETURNS TABLE (
    status      text,
    course_id   uuid,
    course_name text,
    login_email text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_code       text;
  v_email      text;
  v_seat_id    uuid;
  v_claimed_at timestamptz;
  v_course_id  uuid;
  v_course_nm  text;
  v_teacher_id uuid;
  v_seat_name  text;
  v_was_new    boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in (anonymously is fine) to claim a seat.';
  END IF;

  PERFORM public.check_rate_limit('claim_seat', 5, 60);

  v_code  := upper(trim(coalesce(p_code, '')));
  v_email := lower(trim(coalesce(p_email, '')));

  IF v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING HINT = 'That email does not look right.';
  END IF;
  IF length(coalesce(p_password, '')) < 6 THEN
    RAISE EXCEPTION 'weak_password' USING HINT = 'Password must be at least 6 characters.';
  END IF;

  SELECT p.id, p.claimed_at, p.display_name
    INTO v_seat_id, v_claimed_at, v_seat_name
    FROM public.profiles p
   WHERE upper(p.login_code) = v_code
     AND p.managed = true
   LIMIT 1;

  IF v_seat_id IS NULL THEN
    RAISE EXCEPTION 'seat_not_found'
      USING HINT = 'No personal login code matches that. Check with your teacher.';
  END IF;

  SELECT cm.course_id, c.name, c.teacher_id
    INTO v_course_id, v_course_nm, v_teacher_id
    FROM public.course_memberships cm
    JOIN public.courses c ON c.id = cm.course_id
   WHERE cm.student_id = v_seat_id
   ORDER BY cm.joined_at ASC
   LIMIT 1;

  IF EXISTS (
    SELECT 1 FROM auth.users u
     WHERE lower(u.email) = v_email AND u.id <> v_seat_id
  ) THEN
    RAISE EXCEPTION 'email_in_use'
      USING HINT = 'That email is already attached to another account.';
  END IF;

  -- ---- First claim: take over the seat immediately. ----------------------
  IF v_claimed_at IS NULL THEN
    BEGIN
      UPDATE auth.users
         SET email                  = v_email,
             encrypted_password     = crypt(p_password, gen_salt('bf')),
             email_confirmed_at     = now(),
             email_change           = '',
             email_change_token_new = '',
             updated_at             = now()
       WHERE id = v_seat_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'email_in_use'
        USING HINT = 'That email is already attached to another account.';
    END;

    UPDATE auth.identities
       SET identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email)),
           updated_at    = now()
     WHERE user_id = v_seat_id AND provider = 'email';

    UPDATE public.profiles
       SET email      = v_email,
           claimed_at = now(),
           updated_at = now()
     WHERE id = v_seat_id;

    INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
    VALUES (
      v_uid, 'student.claim_seat', 'profile', v_seat_id::text,
      jsonb_build_object('course_id', v_course_id, 'roster_code', v_code, 'email', v_email)
    );

    RETURN QUERY SELECT 'claimed'::text, v_course_id, v_course_nm, v_email;
    RETURN;
  END IF;

  -- ---- Already claimed: file (or refresh) a teacher-approval request. -----
  UPDATE public.seat_claim_requests
     SET requested_email         = v_email,
         requested_password_hash = crypt(p_password, gen_salt('bf')),
         requested_by            = v_uid,
         created_at              = now()
   WHERE seat_claim_requests.seat_id = v_seat_id
     AND seat_claim_requests.status  = 'pending';

  IF NOT FOUND THEN
    BEGIN
      INSERT INTO public.seat_claim_requests (
        course_id, seat_id, roster_code, requested_email, requested_password_hash, requested_by
      )
      VALUES (
        v_course_id, v_seat_id, v_code, v_email, crypt(p_password, gen_salt('bf')), v_uid
      );
      v_was_new := true;
    EXCEPTION WHEN unique_violation THEN
      UPDATE public.seat_claim_requests
         SET requested_email         = v_email,
             requested_password_hash = crypt(p_password, gen_salt('bf')),
             requested_by            = v_uid,
             created_at              = now()
       WHERE seat_claim_requests.seat_id = v_seat_id
         AND seat_claim_requests.status  = 'pending';
    END;
  END IF;

  -- Only notify the teacher when this is a genuinely NEW pending request, so a
  -- student re-submitting / refreshing doesn't spam the teacher.
  IF v_was_new AND v_teacher_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, kind, title, body, link)
    VALUES (
      v_teacher_id,
      'seat_claim_request',
      'Login request: ' || COALESCE(v_seat_name, v_code),
      'A student is requesting access to ' || COALESCE(v_seat_name, v_code)
        || ' (' || v_code || ').',
      '/courses/' || v_course_id || '/roster'
    );
  END IF;

  RETURN QUERY SELECT 'pending'::text, v_course_id, v_course_nm, v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_student_seat(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_student_seat(text, text, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- decide_seat_claim_request — confirmed email + email_in_use guard on approve
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_seat_claim_request(
  p_request_id uuid,
  p_approve    boolean
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.seat_claim_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_req
    FROM public.seat_claim_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'already_decided';
  END IF;

  IF NOT (public.is_teacher_of_course(v_uid, v_req.course_id) OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_approve THEN
    IF EXISTS (
      SELECT 1 FROM auth.users u
       WHERE lower(u.email) = v_req.requested_email AND u.id <> v_req.seat_id
    ) THEN
      RAISE EXCEPTION 'email_in_use';
    END IF;

    BEGIN
      UPDATE auth.users
         SET email                  = v_req.requested_email,
             encrypted_password     = v_req.requested_password_hash,
             email_confirmed_at     = now(),
             email_change           = '',
             email_change_token_new = '',
             updated_at             = now()
       WHERE id = v_req.seat_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'email_in_use';
    END;

    UPDATE auth.identities
       SET identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_req.requested_email)),
           updated_at    = now()
     WHERE user_id = v_req.seat_id AND provider = 'email';

    UPDATE public.profiles
       SET email      = v_req.requested_email,
           claimed_at = now(),
           updated_at = now()
     WHERE id = v_req.seat_id;

    UPDATE public.seat_claim_requests
       SET status = 'approved', decided_at = now(), decided_by = v_uid
     WHERE id = p_request_id;

    INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
    VALUES (
      v_uid, 'student.claim_seat_approved', 'profile', v_req.seat_id::text,
      jsonb_build_object('course_id', v_req.course_id, 'roster_code', v_req.roster_code,
                         'email', v_req.requested_email, 'request_id', p_request_id)
    );

    RETURN 'approved';
  ELSE
    UPDATE public.seat_claim_requests
       SET status = 'denied', decided_at = now(), decided_by = v_uid
     WHERE id = p_request_id;

    INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
    VALUES (
      v_uid, 'student.claim_seat_denied', 'profile', v_req.seat_id::text,
      jsonb_build_object('course_id', v_req.course_id, 'roster_code', v_req.roster_code,
                         'request_id', p_request_id)
    );

    RETURN 'denied';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_seat_claim_request(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_seat_claim_request(uuid, boolean) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0098_claim_seat_review_fixes.sql
-- =============================================================================
