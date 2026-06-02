-- =============================================================================
-- Migration: 0022_audit_log.sql
-- Description: System-wide audit log. Captures role changes, invite-code mints,
--              and course deletes as structured events for admin review.
-- Platform: Supabase (PostgreSQL 15+)
--
-- WHY:
--   We need an append-only ledger of sensitive admin/teacher actions so that
--   (a) an admin can answer "who promoted X?", "who minted code Y?", "who
--   nuked course Z?" without trawling Postgres logs, and (b) we have a
--   forensic record if access is later disputed. Triggers on the underlying
--   tables guarantee capture without requiring every RPC to remember to log.
--
--   Reads are admin-only (RLS). Inserts only happen from SECURITY DEFINER
--   trigger functions / RPCs — RLS blocks direct INSERTs from clients, which
--   keeps the ledger trustworthy.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_events (
  id bigserial PRIMARY KEY,
  actor_id uuid,            -- nullable for system events
  action text NOT NULL,     -- short kebab-cased verb (e.g. role.change)
  target_kind text,         -- 'profile' | 'course' | 'invite_code' | etc.
  target_id text,           -- stringified id (uuid or text key)
  details jsonb,            -- structured payload (before/after, reason, etc.)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON public.audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON public.audit_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_target_idx ON public.audit_events (target_kind, target_id);

-- RLS: admins read; nobody else.
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit: admin reads" ON public.audit_events;
CREATE POLICY "audit: admin reads"
  ON public.audit_events
  FOR SELECT
  USING (public.is_admin((SELECT auth.uid())));
-- Inserts only from triggers / SECURITY DEFINER paths.

-- Helper to insert audit row (SECURITY DEFINER so triggers + RPCs can call
-- without RLS write paths).
CREATE OR REPLACE FUNCTION public.audit_record(
  p_action text,
  p_target_kind text DEFAULT NULL,
  p_target_id text DEFAULT NULL,
  p_details jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (auth.uid(), p_action, p_target_kind, p_target_id, p_details);
END;
$$;
REVOKE ALL ON FUNCTION public.audit_record(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_record(text, text, text, jsonb) TO authenticated;

-- Triggers
CREATE OR REPLACE FUNCTION public.audit_profile_role_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
    VALUES (auth.uid(), 'role.change', 'profile', NEW.id::text,
            jsonb_build_object('from', OLD.role, 'to', NEW.role, 'email', NEW.email));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_profile_role_change ON public.profiles;
CREATE TRIGGER trg_audit_profile_role_change AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profile_role_change();

CREATE OR REPLACE FUNCTION public.audit_invite_mint() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (auth.uid(), 'invite.mint', 'invite_code', NEW.code,
          jsonb_build_object('note', NEW.note, 'max_uses', NEW.max_uses, 'expires_at', NEW.expires_at));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_invite_mint ON public.teacher_invite_codes;
CREATE TRIGGER trg_audit_invite_mint AFTER INSERT ON public.teacher_invite_codes
  FOR EACH ROW EXECUTE FUNCTION public.audit_invite_mint();

CREATE OR REPLACE FUNCTION public.audit_course_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (auth.uid(), 'course.delete', 'course', OLD.id::text,
          jsonb_build_object('name', OLD.name, 'teacher_id', OLD.teacher_id));
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_course_delete ON public.courses;
CREATE TRIGGER trg_audit_course_delete BEFORE DELETE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.audit_course_delete();
