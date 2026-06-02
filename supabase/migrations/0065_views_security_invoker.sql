-- =============================================================================
-- Migration: 0065_views_security_invoker.sql
-- Purpose:   Close a row-level-security leak found in QA (smoke-features
--            "outsider sees N best_attempts (RLS leak)").
--
-- `assignment_best_attempts` (mig 0020, recreated in 0057) and
-- `assignment_attempts_effective` (mig 0056) are PLAIN views over
-- `assignment_attempts`. A plain Postgres view runs with the privileges of the
-- view OWNER, which bypasses the base table's RLS — so ANY authenticated user
-- could SELECT every student's best/effective assignment scores across courses
-- they don't belong to (a cross-student privacy leak in an education product).
--
-- Fix: mark both views `security_invoker = on` (PG15+) so they execute with the
-- CALLER's privileges and therefore enforce `assignment_attempts`' RLS:
--   • students see only their own attempts,
--   • teachers see only attempts in courses they teach,
--   • admins per their policy.
-- SECURITY DEFINER RPCs that read these views are unaffected (they already run
-- as the definer). This is strictly MORE restrictive, so legitimate access is
-- preserved. Pre-existing since 0020 — not introduced by 0057's column reorder.
--
-- Idempotent (ALTER VIEW ... SET is a no-op if already set). Forward-only.
-- =============================================================================

ALTER VIEW public.assignment_best_attempts     SET (security_invoker = on);
ALTER VIEW public.assignment_attempts_effective SET (security_invoker = on);
