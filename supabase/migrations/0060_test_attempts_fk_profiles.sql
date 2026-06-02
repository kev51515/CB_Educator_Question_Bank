-- =============================================================================
-- Migration: 0060_test_attempts_fk_profiles.sql
-- Description: M33 follow-up from the May-2026 audit (Wave 19, migration 0050).
--              Swap test_attempts.user_id's FK target from auth.users(id) to
--              public.profiles(id) to match project convention for user-owned
--              data. Functional impact is zero today (auth.users.id == profiles.id
--              by the handle_new_auth_user trigger from 0001/0032), but aligning
--              the schema removes a footgun: future RLS / audit / cascade work
--              should depend on a single, consistent user-FK target.
--
-- Why deferred until now (see 0050 footer):
--   Changing an FK on a populated, RLS-protected, actively-written table is
--   riskier than the other 0050 changes. The cascade chain via profiles is
--   already wired (B2 in 0050 added the BEFORE-DELETE audit trigger on
--   public.profiles that snapshots dependent-row counts to audit_events
--   before any cascade fires — that trigger keeps working here because the
--   cascade still originates from profiles either way).
--
-- Why safe now (two-phase NOT VALID + VALIDATE pattern):
--   A naive `DROP CONSTRAINT ... ADD CONSTRAINT ...` takes ACCESS EXCLUSIVE on
--   test_attempts for the duration of the full-table check, blocking concurrent
--   reads and writes. Instead we:
--     Phase 1: DROP the old FK (auth.users).             cheap, no scan.
--     Phase 2: ADD the new FK NOT VALID (profiles).      cheap, no scan;
--              future writes are checked but existing rows are not.
--     Phase 3: VALIDATE CONSTRAINT.                      takes only
--              SHARE UPDATE EXCLUSIVE — concurrent reads + most writes proceed.
--
-- ON DELETE behavior preserved: CASCADE, identical to the prior auth.users FK.
--
-- Idempotency:
--   `DROP CONSTRAINT IF EXISTS` is safe to re-run.
--   `ADD CONSTRAINT` with the same name will fail loudly if state diverges —
--   that is the correct behavior (a divergent schema should not silently pass).
--   `VALIDATE CONSTRAINT` on an already-validated FK is a no-op.
--
-- Risk callout:
--   The VALIDATE step will fail if any test_attempts.user_id lacks a matching
--   profiles.id. We have strong evidence this cannot happen:
--     - 0001's handle_new_auth_user trigger inserts a profiles row for every
--       new auth.users row.
--     - 0032 patched the trigger to tolerate NULL email (anonymous users) so
--       no auth.users insert can silently fail the profile insert.
--     - profiles.id is the same uuid as auth.users.id (same column type,
--       trigger-copied at signup), so for any test_attempt that exists,
--       the matching profile row exists by construction.
--   PostgreSQL will reject the VALIDATE if this assumption is wrong, which is
--   the right failure mode — we'd rather fail loudly than corrupt the schema.
--
-- Forward-only. No DROP TABLE. No data destruction. DDL only (no SECURITY
-- DEFINER needed).
-- =============================================================================

-- Phase 1: drop the old FK to auth.users(id).
ALTER TABLE public.test_attempts
  DROP CONSTRAINT IF EXISTS test_attempts_user_id_fkey;

-- Phase 2: add the new FK to profiles(id) as NOT VALID.
-- Same constraint name as the default the original ADD COLUMN would have
-- produced, so downstream tooling (pg_dump, supabase introspection, schema
-- diffs) keeps recognizing it.
ALTER TABLE public.test_attempts
  ADD CONSTRAINT test_attempts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
  NOT VALID;

-- Phase 3: validate. Takes SHARE UPDATE EXCLUSIVE, not ACCESS EXCLUSIVE.
-- If this fails, see the "Risk callout" header — a failure here means a
-- test_attempts row exists whose user_id has no matching profile, which would
-- indicate a deeper data-integrity bug worth investigating before retrying.
ALTER TABLE public.test_attempts
  VALIDATE CONSTRAINT test_attempts_user_id_fkey;

-- =============================================================================
-- End 0060.
-- =============================================================================
