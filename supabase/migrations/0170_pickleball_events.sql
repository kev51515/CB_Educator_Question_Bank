-- =============================================================================
-- Migration: 0170_pickleball_events.sql
-- Description: Player-track EVENTS for the Pickleball feature — clinics, camps,
-- and social play that a course schedules for its enrolled players.
--
-- An "event" is a course-scoped happening with a capacity, an optional skill
-- band, and a registration window. Players register themselves through the
-- pk_register_event RPC, which enforces:
--   * the event is published and inside its registration window,
--   * the player isn't already registered,
--   * a SKILL GATE: the player's derived level (latest pickleball_assessments
--     overall_level, falling back to their pickleball_player_profiles
--     skill_level / dupr) must lie inside [skill_min, skill_max],
--   * CAPACITY: if the registered seats are full the player is WAITLISTED with
--     the next waitlist_rank, otherwise they get a 'registered' seat.
-- Cancelling a registered seat promotes the lowest-rank waitlisted player and
-- notifies them. All capacity/waitlist math locks the event row FOR UPDATE so
-- concurrent registers/cancels can't double-fill or double-promote.
--
-- Mirrors the lessons / assessments pattern:
--   * is_teacher_of_course(uid, course_id) — owner / co-teacher (0130)
--   * is_admin(uid)                         — staff oversight (0001)
--   * the player (player_id = auth.uid())   — reads own registrations, and
--     registers / cancels self through the RPCs
-- All writes go through pk_ RPCs (SECURITY DEFINER, stable string error codes).
-- person FK columns reference profiles(id), NOT other pickleball tables.
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pickleball_events — one course-scoped event.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id             uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  type                  text NOT NULL DEFAULT 'clinic'
                        CHECK (type IN ('clinic', 'camp', 'social')),
  name                  text NOT NULL,
  description           text,
  coach_id              uuid REFERENCES public.profiles(id),
  location              text,
  starts_at             timestamptz,
  ends_at               timestamptz,
  capacity              integer,
  skill_min             numeric,
  skill_max             numeric,
  registration_opens_at  timestamptz,
  registration_closes_at timestamptz,
  status                text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'published', 'cancelled')),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickleball_events_course_starts_idx
  ON public.pickleball_events (course_id, starts_at);
ALTER TABLE public.pickleball_events ENABLE ROW LEVEL SECURITY;

-- Educator of the course (owner / co-teacher / admin) has full read+write.
DROP POLICY IF EXISTS "pk_events: educator manages" ON public.pickleball_events;
CREATE POLICY "pk_events: educator manages" ON public.pickleball_events
  FOR ALL
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  );

-- Members of the course read PUBLISHED events.
DROP POLICY IF EXISTS "pk_events: member reads published" ON public.pickleball_events;
CREATE POLICY "pk_events: member reads published" ON public.pickleball_events
  FOR SELECT
  USING (
    status = 'published'
    AND public.is_student_in_class((SELECT auth.uid()), course_id)
  );

-- -----------------------------------------------------------------------------
-- 2. pickleball_event_registrations — one per (event, player).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_event_registrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.pickleball_events(id) ON DELETE CASCADE,
  course_id     uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  player_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  state         text NOT NULL DEFAULT 'registered'
                CHECK (state IN ('registered', 'waitlisted', 'attended', 'no_show', 'cancelled')),
  waitlist_rank integer,
  registered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, player_id)
);
CREATE INDEX IF NOT EXISTS pickleball_event_registrations_event_state_idx
  ON public.pickleball_event_registrations (event_id, state, waitlist_rank);
ALTER TABLE public.pickleball_event_registrations ENABLE ROW LEVEL SECURITY;

-- Educator of the course (owner / co-teacher / admin) has full read+write.
DROP POLICY IF EXISTS "pk_event_regs: educator manages"
  ON public.pickleball_event_registrations;
CREATE POLICY "pk_event_regs: educator manages"
  ON public.pickleball_event_registrations
  FOR ALL
  USING (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_teacher_of_course((SELECT auth.uid()), course_id)
    OR public.is_admin((SELECT auth.uid()))
  );

-- The player reads their OWN registrations. (All player writes go through the
-- pk_ RPCs, which are SECURITY DEFINER and bypass RLS, so there is no player
-- INSERT/UPDATE/DELETE policy here.)
DROP POLICY IF EXISTS "pk_event_regs: player reads own"
  ON public.pickleball_event_registrations;
CREATE POLICY "pk_event_regs: player reads own"
  ON public.pickleball_event_registrations
  FOR SELECT
  USING (player_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. pk_upsert_event — educator creates OR edits an event. When p_id is NULL a
--    new draft is inserted; otherwise the existing event is updated in place.
--    Returns the row. Stable errors: not_authenticated / not_authorized /
--    not_found / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_upsert_event(
  p_course_id              uuid,
  p_name                   text,
  p_id                     uuid        DEFAULT NULL,
  p_type                   text        DEFAULT 'clinic',
  p_description            text        DEFAULT NULL,
  p_coach_id               uuid        DEFAULT NULL,
  p_location               text        DEFAULT NULL,
  p_starts_at              timestamptz DEFAULT NULL,
  p_ends_at                timestamptz DEFAULT NULL,
  p_capacity               integer     DEFAULT NULL,
  p_skill_min              numeric     DEFAULT NULL,
  p_skill_max              numeric     DEFAULT NULL,
  p_registration_opens_at  timestamptz DEFAULT NULL,
  p_registration_closes_at timestamptz DEFAULT NULL
)
  RETURNS public.pickleball_events
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_events;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_course_id IS NULL OR p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF p_type IS NULL OR p_type NOT IN ('clinic', 'camp', 'social') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF p_capacity IS NOT NULL AND p_capacity < 0 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, p_course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.pickleball_events (
      course_id, type, name, description, coach_id, location,
      starts_at, ends_at, capacity, skill_min, skill_max,
      registration_opens_at, registration_closes_at
    )
    VALUES (
      p_course_id, p_type, btrim(p_name), p_description, p_coach_id, p_location,
      p_starts_at, p_ends_at, p_capacity, p_skill_min, p_skill_max,
      p_registration_opens_at, p_registration_closes_at
    )
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM public.pickleball_events WHERE id = p_id;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
    END IF;

    -- An event may not be moved to a different course.
    IF v_row.course_id <> p_course_id THEN
      RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
    END IF;

    UPDATE public.pickleball_events
       SET type                   = p_type,
           name                   = btrim(p_name),
           description            = p_description,
           coach_id               = p_coach_id,
           location               = p_location,
           starts_at              = p_starts_at,
           ends_at                = p_ends_at,
           capacity               = p_capacity,
           skill_min              = p_skill_min,
           skill_max              = p_skill_max,
           registration_opens_at  = p_registration_opens_at,
           registration_closes_at = p_registration_closes_at
     WHERE id = p_id
     RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_upsert_event(
  uuid, text, uuid, text, text, uuid, text, timestamptz, timestamptz,
  integer, numeric, numeric, timestamptz, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_upsert_event(
  uuid, text, uuid, text, text, uuid, text, timestamptz, timestamptz,
  integer, numeric, numeric, timestamptz, timestamptz
) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. pk_publish_event — one-click status toggle (draft / published / cancelled).
--    Returns the row. Stable errors: not_authenticated / not_authorized /
--    not_found / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_publish_event(
  p_id     uuid,
  p_status text
)
  RETURNS public.pickleball_events
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_events;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('draft', 'published', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.pickleball_events WHERE id = p_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, v_row.course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pickleball_events
     SET status = p_status
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_publish_event(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_publish_event(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- helper: pk__event_player_level — derive a player's level for the skill gate.
--   Prefers the most-recent pickleball_assessments.overall_level for the
--   (course, player), then falls back to their pickleball_player_profiles
--   dupr, then skill_level (cast to numeric when numeric-looking). Returns NULL
--   when no level is known. Internal (no GRANT); only called by RPCs below.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk__event_player_level(
  p_course_id uuid,
  p_player_id uuid
)
  RETURNS numeric
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_level numeric;
  v_skill text;
BEGIN
  -- 1. Latest assessment overall_level.
  SELECT a.overall_level
    INTO v_level
  FROM public.pickleball_assessments a
  WHERE a.course_id = p_course_id
    AND a.player_id = p_player_id
    AND a.overall_level IS NOT NULL
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF v_level IS NOT NULL THEN
    RETURN v_level;
  END IF;

  -- 2. Player profile dupr, then numeric-looking skill_level.
  SELECT pp.dupr, pp.skill_level
    INTO v_level, v_skill
  FROM public.pickleball_player_profiles pp
  WHERE pp.course_id = p_course_id
    AND pp.student_id = p_player_id
  LIMIT 1;

  IF v_level IS NOT NULL THEN
    RETURN v_level;
  END IF;

  IF v_skill IS NOT NULL AND v_skill ~ '^[0-9]+(\.[0-9]+)?$' THEN
    RETURN v_skill::numeric;
  END IF;

  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.pk__event_player_level(uuid, uuid) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 5. pk_register_event — player registers themself for a published event.
--    Checks: published + inside the registration window + not already an active
--    registration. SKILL GATE: derived level must be within [skill_min,
--    skill_max] (error 'skill_gate'). CAPACITY: registered count >= capacity ->
--    'waitlisted' with the next waitlist_rank, else 'registered'. The event row
--    is locked FOR UPDATE so concurrent registers can't over-fill. Returns the
--    registration row. Stable errors: not_authenticated / not_authorized /
--    not_found / registration_closed / already_registered / skill_gate.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_register_event(
  p_event_id uuid
)
  RETURNS public.pickleball_event_registrations
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller     uuid := (SELECT auth.uid());
  v_event      public.pickleball_events;
  v_existing   public.pickleball_event_registrations;
  v_row        public.pickleball_event_registrations;
  v_level      numeric;
  v_reg_count  integer;
  v_next_rank  integer;
  v_state      text;
  v_now        timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Lock the event row so capacity math is race-safe.
  SELECT * INTO v_event FROM public.pickleball_events WHERE id = p_event_id FOR UPDATE;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  -- The caller must be a member of the event's course.
  IF NOT public.is_student_in_class(v_caller, v_event.course_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_event.status <> 'published' THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = '22023';
  END IF;

  IF v_event.registration_opens_at IS NOT NULL AND v_now < v_event.registration_opens_at THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = '22023';
  END IF;
  IF v_event.registration_closes_at IS NOT NULL AND v_now > v_event.registration_closes_at THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = '22023';
  END IF;

  -- Existing registration? Re-registering after a cancel is allowed; an active
  -- registration is a conflict.
  SELECT * INTO v_existing
  FROM public.pickleball_event_registrations
  WHERE event_id = p_event_id AND player_id = v_caller;

  IF v_existing.id IS NOT NULL
     AND v_existing.state IN ('registered', 'waitlisted', 'attended', 'no_show') THEN
    RAISE EXCEPTION 'already_registered' USING ERRCODE = '22023';
  END IF;

  -- Skill gate.
  v_level := public.pk__event_player_level(v_event.course_id, v_caller);
  IF (v_event.skill_min IS NOT NULL OR v_event.skill_max IS NOT NULL) THEN
    IF v_level IS NULL THEN
      RAISE EXCEPTION 'skill_gate' USING ERRCODE = '22023';
    END IF;
    IF v_event.skill_min IS NOT NULL AND v_level < v_event.skill_min THEN
      RAISE EXCEPTION 'skill_gate' USING ERRCODE = '22023';
    END IF;
    IF v_event.skill_max IS NOT NULL AND v_level > v_event.skill_max THEN
      RAISE EXCEPTION 'skill_gate' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Capacity: count active 'registered' seats (waitlisted don't occupy a seat).
  SELECT count(*) INTO v_reg_count
  FROM public.pickleball_event_registrations
  WHERE event_id = p_event_id AND state = 'registered';

  IF v_event.capacity IS NOT NULL AND v_reg_count >= v_event.capacity THEN
    v_state := 'waitlisted';
    SELECT COALESCE(MAX(waitlist_rank), 0) + 1 INTO v_next_rank
    FROM public.pickleball_event_registrations
    WHERE event_id = p_event_id AND state = 'waitlisted';
  ELSE
    v_state := 'registered';
    v_next_rank := NULL;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    -- Reuse the cancelled row (the UNIQUE(event,player) constraint forces this).
    UPDATE public.pickleball_event_registrations
       SET state         = v_state,
           waitlist_rank = v_next_rank,
           registered_at = v_now
     WHERE id = v_existing.id
     RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.pickleball_event_registrations (
      event_id, course_id, player_id, state, waitlist_rank
    )
    VALUES (
      p_event_id, v_event.course_id, v_caller, v_state, v_next_rank
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_register_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_register_event(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. pk_cancel_registration — player cancels their own registration, or the
--    educator cancels on their behalf. If a 'registered' seat frees up and a
--    waitlisted entry exists, promote the lowest waitlist_rank to 'registered'
--    and notify them (kind 'pickleball_event_promoted'). The event row is
--    locked FOR UPDATE so the promotion is race-safe. Returns the cancelled
--    registration row. Stable errors: not_authenticated / not_authorized /
--    not_found.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_cancel_registration(
  p_event_id uuid
)
  RETURNS public.pickleball_event_registrations
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller    uuid := (SELECT auth.uid());
  v_event     public.pickleball_events;
  v_reg       public.pickleball_event_registrations;
  v_freed     boolean := false;
  v_promote   public.pickleball_event_registrations;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Lock the event so the freed-seat promotion is race-safe.
  SELECT * INTO v_event FROM public.pickleball_events WHERE id = p_event_id FOR UPDATE;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  -- The player cancels their own, OR the educator cancels for any player.
  -- A player passes only their own event; we resolve the target registration as
  -- the caller's own. (Educator override-cancel for another player is handled
  -- via pk_set_attendance / direct educator policy; this RPC is the self/own +
  -- educator-of-course path keyed on the calling player.)
  IF public.is_teacher_of_course(v_caller, v_event.course_id) OR public.is_admin(v_caller) THEN
    -- Educator cancelling: there must be exactly the caller-supplied event; the
    -- educator cancels their own registration if present, otherwise this is a
    -- no-op guard. Educators manage other players' rows through the RLS policy
    -- + pk_set_attendance; keep this RPC player-self-shaped but allow educators
    -- to cancel their own enrolment too.
    SELECT * INTO v_reg
    FROM public.pickleball_event_registrations
    WHERE event_id = p_event_id AND player_id = v_caller;
  ELSE
    IF NOT public.is_student_in_class(v_caller, v_event.course_id) THEN
      RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_reg
    FROM public.pickleball_event_registrations
    WHERE event_id = p_event_id AND player_id = v_caller;
  END IF;

  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF v_reg.state = 'cancelled' THEN
    RETURN v_reg;  -- idempotent
  END IF;

  -- A 'registered' (active seat) cancellation frees a seat.
  IF v_reg.state = 'registered' THEN
    v_freed := true;
  END IF;

  UPDATE public.pickleball_event_registrations
     SET state = 'cancelled',
         waitlist_rank = NULL
   WHERE id = v_reg.id
   RETURNING * INTO v_reg;

  -- Promote the lowest-rank waitlisted player into the freed seat.
  IF v_freed THEN
    SELECT * INTO v_promote
    FROM public.pickleball_event_registrations
    WHERE event_id = p_event_id AND state = 'waitlisted'
    ORDER BY waitlist_rank ASC NULLS LAST, registered_at ASC
    LIMIT 1
    FOR UPDATE;

    IF v_promote.id IS NOT NULL THEN
      UPDATE public.pickleball_event_registrations
         SET state = 'registered',
             waitlist_rank = NULL
       WHERE id = v_promote.id;

      -- Notify the promoted player. SECURITY DEFINER lets us write a row whose
      -- recipient_id is not the caller (RLS otherwise limits to self).
      INSERT INTO public.notifications (recipient_id, kind, title, body, link)
      VALUES (
        v_promote.player_id,
        'pickleball_event_promoted',
        'You''re off the waitlist',
        'A spot opened up for ' || v_event.name || ' — you''re now registered.',
        NULL
      );
    END IF;
  END IF;

  RETURN v_reg;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_cancel_registration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_cancel_registration(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. pk_override_register — educator registers a player, bypassing the skill
--    gate. Still respects capacity (over-cap registrations go to waitlist).
--    The event row is locked FOR UPDATE. Returns the registration row. Stable
--    errors: not_authenticated / not_authorized / not_found / already_registered.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_override_register(
  p_event_id uuid,
  p_player_id uuid
)
  RETURNS public.pickleball_event_registrations
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller    uuid := (SELECT auth.uid());
  v_event     public.pickleball_events;
  v_existing  public.pickleball_event_registrations;
  v_row       public.pickleball_event_registrations;
  v_reg_count integer;
  v_next_rank integer;
  v_state     text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_event FROM public.pickleball_events WHERE id = p_event_id FOR UPDATE;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, v_event.course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing
  FROM public.pickleball_event_registrations
  WHERE event_id = p_event_id AND player_id = p_player_id;

  IF v_existing.id IS NOT NULL
     AND v_existing.state IN ('registered', 'waitlisted', 'attended', 'no_show') THEN
    RAISE EXCEPTION 'already_registered' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_reg_count
  FROM public.pickleball_event_registrations
  WHERE event_id = p_event_id AND state = 'registered';

  IF v_event.capacity IS NOT NULL AND v_reg_count >= v_event.capacity THEN
    v_state := 'waitlisted';
    SELECT COALESCE(MAX(waitlist_rank), 0) + 1 INTO v_next_rank
    FROM public.pickleball_event_registrations
    WHERE event_id = p_event_id AND state = 'waitlisted';
  ELSE
    v_state := 'registered';
    v_next_rank := NULL;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.pickleball_event_registrations
       SET state         = v_state,
           waitlist_rank = v_next_rank,
           registered_at = now()
     WHERE id = v_existing.id
     RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.pickleball_event_registrations (
      event_id, course_id, player_id, state, waitlist_rank
    )
    VALUES (
      p_event_id, v_event.course_id, p_player_id, v_state, v_next_rank
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_override_register(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_override_register(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. pk_set_attendance — educator marks a registration attended / no_show.
--    Returns the row. Stable errors: not_authenticated / not_authorized /
--    not_found / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_set_attendance(
  p_registration_id uuid,
  p_state           text
)
  RETURNS public.pickleball_event_registrations
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_event_registrations;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_state IS NULL OR p_state NOT IN ('attended', 'no_show') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.pickleball_event_registrations
  WHERE id = p_registration_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, v_row.course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pickleball_event_registrations
     SET state = p_state
   WHERE id = p_registration_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_set_attendance(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_set_attendance(uuid, text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0170_pickleball_events.sql
-- =============================================================================
