-- =============================================================================
-- Migration: 0153_line_integration.sql
-- Description: LINE Official Account binding + notification delivery channel.
--
--   Lets a logged-in profile (student / teacher / — later — guardian) bind a
--   LINE account via the chat-initiated Account Link nonce flow, and makes
--   LINE a second delivery channel for the existing `notifications` table:
--   every notification INSERT is mirrored to a per-recipient outbox queue,
--   which the `line-dispatch` edge function drains to the LINE push API.
--
--   Pieces:
--     1. line_links        — profile ↔ line_user_id (1:1), status, per-kind prefs
--     2. line_link_nonces  — short-TTL single-use nonces for the Account Link flow
--     3. guardian_students — guardian profile ↔ student profile (many-to-many)
--     4. line_outbox       — delivery queue (decouples DB triggers from HTTP)
--     5. trg_enqueue_line  — notifications INSERT -> outbox (recipient + guardians)
--     6. RPCs              — create_line_link_nonce / finalize_line_link /
--                            mark_line_unlinked
--
--   Guardian role enum value + teacher-side provisioning RPC/UI land in a
--   follow-up migration on this branch — the table + fan-out here work the
--   moment a guardian profile exists and is linked, so nothing blocks on it.
--
-- !! VERIFY NUMBERING BEFORE PUSH !!
--   A parallel session is actively pushing: main now has 0148 + 0150, so this
--   is numbered 0153 (above the ceiling — a lower number like 0149 would apply
--   OUT OF ORDER behind the already-applied 0150). Re-verify with
--   `supabase migration list --linked` and bump again if needed BEFORE push.
--   NOTE: `supabase db push` from main currently errors "remote versions not
--   in local" because 0144–0146 are on cloud but not yet on main as files;
--   that mismatch must be reconciled first. (CLAUDE.md: a silent number
--   collision skipped a migration once.)
--
-- Platform: Supabase cloud (PostgreSQL 15+). pgcrypto is already enabled
-- (gen_random_bytes used below). Forward-only, no rollback.
-- =============================================================================


-- =============================================================================
-- SECTION 1: line_links — the established 1:1 binding
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.line_links (
  profile_id   uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  line_user_id text NOT NULL UNIQUE,
  status       text NOT NULL DEFAULT 'linked' CHECK (status IN ('linked', 'unlinked')),
  display_name text,
  -- Per-kind opt-OUT map. { "<notifications.kind>": "off" } suppresses that
  -- kind on LINE; an absent key means "on". Empty default => everything on.
  prefs        jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_at    timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.line_links ENABLE ROW LEVEL SECURITY;

-- Owner can see / adjust prefs / disconnect their own link. Inserts happen
-- only via the SECURITY DEFINER finalize RPC (webhook, service role) — there
-- is deliberately no INSERT policy for end users.
DROP POLICY IF EXISTS "line_links: owner read" ON public.line_links;
CREATE POLICY "line_links: owner read" ON public.line_links
  FOR SELECT USING (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "line_links: owner update" ON public.line_links;
CREATE POLICY "line_links: owner update" ON public.line_links
  FOR UPDATE USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "line_links: owner delete" ON public.line_links;
CREATE POLICY "line_links: owner delete" ON public.line_links
  FOR DELETE USING (profile_id = (SELECT auth.uid()));


-- =============================================================================
-- SECTION 2: line_link_nonces — short-TTL single-use nonces (Account Link)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.line_link_nonces (
  nonce       text PRIMARY KEY,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS line_link_nonces_profile_idx
  ON public.line_link_nonces (profile_id);

-- RLS on, no policies: reachable only by service_role + the SECURITY DEFINER
-- RPCs below. Nonces are never readable by end users.
ALTER TABLE public.line_link_nonces ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 3: guardian_students — guardian profile -> student profile
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.guardian_students (
  guardian_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (guardian_id, student_id)
);
CREATE INDEX IF NOT EXISTS guardian_students_student_idx
  ON public.guardian_students (student_id);

ALTER TABLE public.guardian_students ENABLE ROW LEVEL SECURITY;

-- A guardian sees their own student links; a student sees who guards them.
-- Mutations happen via a staff-gated RPC (added with the provisioning UI) —
-- no direct INSERT/DELETE policy for end users.
DROP POLICY IF EXISTS "guardian_students: party read" ON public.guardian_students;
CREATE POLICY "guardian_students: party read" ON public.guardian_students
  FOR SELECT USING (
    guardian_id = (SELECT auth.uid()) OR student_id = (SELECT auth.uid())
  );


-- =============================================================================
-- SECTION 4: line_outbox — delivery queue
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.line_outbox (
  id           bigserial PRIMARY KEY,
  line_user_id text NOT NULL,
  profile_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind         text,
  payload      jsonb NOT NULL,                 -- a single LINE message object
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'sent', 'failed')),
  attempts     int  NOT NULL DEFAULT 0,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz
);
-- Partial index: the drain query is WHERE status = 'pending' ORDER BY created_at.
CREATE INDEX IF NOT EXISTS line_outbox_pending_idx
  ON public.line_outbox (created_at) WHERE status = 'pending';

-- Service-role only — no end-user access at all.
ALTER TABLE public.line_outbox ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 5: notifications INSERT -> line_outbox
--   Fans every notification to the recipient AND (if the recipient is a
--   student) their linked guardians, for any subject that is linked and not
--   opted-out of that kind. Does NOT insert into notifications => no recursion.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.enqueue_line_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.line_outbox (line_user_id, profile_id, kind, payload)
  SELECT ll.line_user_id,
         ll.profile_id,
         NEW.kind,
         jsonb_build_object(
           'type', 'text',
           'text', NEW.title || COALESCE(E'\n' || NEW.body, '')
         )
  FROM public.line_links ll
  WHERE ll.status = 'linked'
    AND COALESCE(ll.prefs ->> NEW.kind, 'on') <> 'off'
    AND ll.profile_id IN (
      SELECT NEW.recipient_id
      UNION
      SELECT gs.guardian_id
      FROM public.guardian_students gs
      WHERE gs.student_id = NEW.recipient_id
    );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enqueue_line ON public.notifications;
CREATE TRIGGER trg_enqueue_line
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_line_for_notification();


-- =============================================================================
-- SECTION 6: RPCs
-- =============================================================================

-- 6a. create_line_link_nonce() — called by the logged-in user on the LMS
--     /line/link page. Mints a single-use nonce bound to auth.uid(); the
--     client then redirects to the LINE accountLink dialog with it.
CREATE OR REPLACE FUNCTION public.create_line_link_nonce()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid   uuid := (SELECT auth.uid());
  v_nonce text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  v_nonce := encode(gen_random_bytes(16), 'hex');
  INSERT INTO public.line_link_nonces (nonce, profile_id, expires_at)
  VALUES (v_nonce, v_uid, now() + interval '10 minutes');
  RETURN v_nonce;
END
$$;
REVOKE ALL ON FUNCTION public.create_line_link_nonce() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_line_link_nonce() TO authenticated;


-- 6b. finalize_line_link(nonce, line_user_id, display_name) — called by the
--     line-webhook (service role) on a successful accountLink event. Consumes
--     the nonce and upserts the binding. "Latest link wins": if the LINE user
--     was bound to a different profile, that stale row is removed first.
--     Returns the linked profile_id, or NULL if the nonce was invalid/expired.
CREATE OR REPLACE FUNCTION public.finalize_line_link(
  p_nonce        text,
  p_line_user_id text,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_profile uuid;
BEGIN
  UPDATE public.line_link_nonces
     SET consumed_at = now()
   WHERE nonce = p_nonce
     AND consumed_at IS NULL
     AND expires_at > now()
  RETURNING profile_id INTO v_profile;

  IF v_profile IS NULL THEN
    RETURN NULL;  -- unknown / expired / already-consumed nonce
  END IF;

  -- Drop any prior binding of this LINE account to a different profile.
  DELETE FROM public.line_links
   WHERE line_user_id = p_line_user_id
     AND profile_id <> v_profile;

  INSERT INTO public.line_links (profile_id, line_user_id, status, display_name, linked_at, updated_at)
  VALUES (v_profile, p_line_user_id, 'linked', p_display_name, now(), now())
  ON CONFLICT (profile_id) DO UPDATE
    SET line_user_id = EXCLUDED.line_user_id,
        status       = 'linked',
        display_name = COALESCE(EXCLUDED.display_name, public.line_links.display_name),
        updated_at   = now();

  RETURN v_profile;
END
$$;
REVOKE ALL ON FUNCTION public.finalize_line_link(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_line_link(text, text, text) TO service_role;


-- 6c. mark_line_unlinked(line_user_id) — called by the webhook on `unfollow`.
CREATE OR REPLACE FUNCTION public.mark_line_unlinked(p_line_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.line_links
     SET status = 'unlinked', updated_at = now()
   WHERE line_user_id = p_line_user_id;
END
$$;
REVOKE ALL ON FUNCTION public.mark_line_unlinked(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_line_unlinked(text) TO service_role;

-- =============================================================================
-- END OF MIGRATION 0153_line_integration.sql
-- =============================================================================
