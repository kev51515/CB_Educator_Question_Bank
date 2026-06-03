-- =============================================================================
-- Migration: 0095_claim_student_seat.sql
-- Description: Let a student CLAIM a pre-created managed roster seat with their
--              own email + password, instead of accidentally minting a duplicate
--              profile via the quick-start (course-join) path.
--
-- The bug (observed 2026-06-03):
--   A teacher pre-creates "Bob" via admin_create_student (0084), which hands out
--   a per-seat login code like "Y8M3KP-01" (course short_code + "-NN") and mints
--   a managed profile + synthetic auth.users email (y8m3kp-01@students.local).
--   The real Bob typed that code into the *quick-start* screen, whose code field
--   scrubs the "-01" away to the 6-char course code "Y8M3KP", so quick_start
--   created a BRAND-NEW anonymous profile ("Ca") enrolled in the same course —
--   a duplicate that never converges with the Bob seat.
--
-- The fix (product decisions, owner-confirmed):
--   (1) A code with a "-NN" suffix is a SEAT code → it CLAIMS the existing seat,
--       never mints a new profile.
--   (2) The teacher owns the name (cf. 0093) → claiming does NOT take a name;
--       display_name stays whatever the teacher set ("Bob").
--   (3) The student's email is PROMOTED to a real login identity: claiming swaps
--       the seat's synthetic auth.users email → the real email and sets the
--       student's chosen password, so Bob can later sign in with email+password.
--       All of Bob's enrolments / attempts stay attached (same profile id).
--   (4) A SECOND attempt to claim an already-claimed seat is NOT a hard reject —
--       it files a `seat_claim_requests` row the teacher can approve or deny.
--       Approving is credential RECOVERY: it resets THAT seat's login to the
--       requester's email+password (same student, same work). It never transfers
--       one student's work to a different person.
--
-- Security model:
--   - claim_student_seat / decide_seat_claim_request are SECURITY DEFINER with
--     SET search_path = public, auth, extensions (need pgcrypto crypt/gen_salt).
--   - The claimer calls from an anonymous session (role 'authenticated', so
--     auth.uid() is non-null and check_rate_limit works).
--   - decide_* is gated on is_teacher_of_course OR is_admin.
--   - Stable string error codes the client switches on: not_authenticated,
--     seat_not_found, weak_password, invalid_email, email_in_use,
--     not_authorized, not_found, already_decided.
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1: profiles.claimed_at — marks a managed seat as taken over.
--   NULL  = teacher-created seat, not yet claimed by the real student.
--   non-NULL = the student has set their own email+password on this seat.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;


-- -----------------------------------------------------------------------------
-- SECTION 2: seat_claim_requests — pending re-claims awaiting teacher decision.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seat_claim_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id              uuid NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  seat_id                uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  roster_code            text NOT NULL,                 -- snapshot for display, e.g. "Y8M3KP-01"
  requested_email        text NOT NULL,
  requested_password_hash text NOT NULL,                -- bcrypt; applied verbatim to auth.users on approve
  status                 text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'denied')),
  requested_by           uuid,                          -- the (anon) uid that filed it; not FK'd
  created_at             timestamptz NOT NULL DEFAULT now(),
  decided_at             timestamptz,
  decided_by             uuid REFERENCES public.profiles(id)
);

-- At most one OPEN request per seat (a re-file just refreshes it; see RPC upsert).
CREATE UNIQUE INDEX IF NOT EXISTS seat_claim_requests_one_pending
  ON public.seat_claim_requests (seat_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS seat_claim_requests_course_pending_idx
  ON public.seat_claim_requests (course_id, created_at DESC) WHERE status = 'pending';

ALTER TABLE public.seat_claim_requests ENABLE ROW LEVEL SECURITY;

-- Teachers of the course (or admins) may read their pending/decided requests.
-- Writes happen ONLY through the SECURITY DEFINER RPCs below (which bypass RLS),
-- so there is intentionally no INSERT/UPDATE/DELETE policy.
DROP POLICY IF EXISTS "seat_claim_requests: course staff read" ON public.seat_claim_requests;
CREATE POLICY "seat_claim_requests: course staff read"
  ON public.seat_claim_requests FOR SELECT
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  );


-- -----------------------------------------------------------------------------
-- SECTION 3: claim_student_seat — first claim takes over; re-claim files request.
-- -----------------------------------------------------------------------------
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

  -- Resolve the seat by its login code. login_code is unique per profile.
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

  -- The seat's course (used for display + teacher notification).
  SELECT cm.course_id, c.name, c.teacher_id
    INTO v_course_id, v_course_nm, v_teacher_id
    FROM public.course_memberships cm
    JOIN public.courses c ON c.id = cm.course_id
   WHERE cm.student_id = v_seat_id
   ORDER BY cm.joined_at ASC
   LIMIT 1;

  -- Email must be free across auth.users (excluding this very seat).
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
       SET email                   = v_email,
           encrypted_password       = crypt(p_password, gen_salt('bf')),
           email_change             = '',
           email_change_token_new   = '',
           updated_at               = now()
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

  -- ---- Already claimed: file a teacher-approval request. -----------------
  INSERT INTO public.seat_claim_requests (
    course_id, seat_id, roster_code, requested_email, requested_password_hash, requested_by
  )
  VALUES (
    v_course_id, v_seat_id, v_code, v_email, crypt(p_password, gen_salt('bf')), v_uid
  )
  ON CONFLICT (seat_id) WHERE status = 'pending'
  DO UPDATE SET
    requested_email         = EXCLUDED.requested_email,
    requested_password_hash = EXCLUDED.requested_password_hash,
    requested_by            = EXCLUDED.requested_by,
    created_at              = now();

  -- Notify the course teacher (best-effort; no-op if course/teacher missing).
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


-- -----------------------------------------------------------------------------
-- SECTION 4: decide_seat_claim_request — teacher approves (recovery) or denies.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_seat_claim_request(
  p_request_id uuid,
  p_approve    boolean
)
  RETURNS text  -- 'approved' | 'denied'
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
    -- Re-check the email is still free (another account may have taken it).
    IF EXISTS (
      SELECT 1 FROM auth.users u
       WHERE lower(u.email) = v_req.requested_email AND u.id <> v_req.seat_id
    ) THEN
      RAISE EXCEPTION 'email_in_use';
    END IF;

    UPDATE auth.users
       SET email                  = v_req.requested_email,
           encrypted_password     = v_req.requested_password_hash,  -- already bcrypt
           email_change           = '',
           email_change_token_new = '',
           updated_at             = now()
     WHERE id = v_req.seat_id;

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
-- END OF MIGRATION 0095_claim_student_seat.sql
-- =============================================================================
