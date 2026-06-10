-- =============================================================================
-- Migration: 0154_add_guardian_role.sql
-- Adds 'guardian' to the user_role enum so a parent can have a coded login
-- (provisioned by a teacher, like a managed student) and receive LINE
-- notifications about their linked student(s). See 0153 (line_integration) for
-- the line_links / guardian_students / line_outbox tables this complements,
-- and 0155 for the provisioning RPCs.
--
-- WHY ITS OWN MIGRATION: Postgres forbids using a newly-added enum value in the
-- SAME transaction that adds it ("unsafe use of new value"). The Supabase CLI
-- runs each migration file in its own transaction and commits between files, so
-- 'guardian' added here is safely usable from 0155 onward.
--
-- !! VERIFY NUMBERING BEFORE PUSH — part of the LINE block 0153/0154/0155;
--    a parallel session is actively pushing migrations (0148/0150/0152 already
--    on cloud). Re-verify `supabase migration list --linked` and renumber the
--    whole block together if needed. Forward-only, no rollback.
-- =============================================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'guardian';

-- =============================================================================
-- END OF MIGRATION 0154_add_guardian_role.sql
-- =============================================================================
