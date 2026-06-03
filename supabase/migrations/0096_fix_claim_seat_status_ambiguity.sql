-- =============================================================================
-- Migration: 0096_fix_claim_seat_status_ambiguity.sql
-- Description: Fix `column reference "status" is ambiguous` in
--              claim_student_seat (caught by clickthrough-claim-seat before the
--              re-claim path ever shipped to users).
--
-- Cause: the function RETURNS TABLE (status text, ...). That OUT column `status`
--   is an in-scope plpgsql name, so the unqualified `status` inside
--   `INSERT ... ON CONFLICT (seat_id) WHERE status = 'pending'` was ambiguous
--   against seat_claim_requests.status.
--
-- Fix: drop the ON CONFLICT-with-predicate upsert and use an explicit,
--   table-qualified UPDATE-then-INSERT for the re-claim (already-claimed) path.
--   A concurrent double-submit that loses the partial-unique race is caught and
--   folded back into the UPDATE, so the student never sees a raw unique error.
--   The first-claim path is byte-for-byte identical to 0095.
--
-- Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_student_seat(
  p_code     text,
  p_email    text,
  p_password text
)
  RETURNS TABLE (
    status      text,   -- 'claimed' | 'pending'
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
    UPDATE auth.users
       SET email                  = v_email,
           encrypted_password     = crypt(p_password, gen_salt('bf')),
           email_change           = '',
           email_change_token_new = '',
           updated_at             = now()
     WHERE id = v_seat_id;

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
  -- Table-qualified to disambiguate from the OUT column `status`.
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
    EXCEPTION WHEN unique_violation THEN
      -- Lost the partial-unique race to a concurrent re-claim; fold into it.
      UPDATE public.seat_claim_requests
         SET requested_email         = v_email,
             requested_password_hash = crypt(p_password, gen_salt('bf')),
             requested_by            = v_uid,
             created_at              = now()
       WHERE seat_claim_requests.seat_id = v_seat_id
         AND seat_claim_requests.status  = 'pending';
    END;
  END IF;

  IF v_teacher_id IS NOT NULL THEN
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

-- =============================================================================
-- END OF MIGRATION 0096_fix_claim_seat_status_ambiguity.sql
-- =============================================================================
