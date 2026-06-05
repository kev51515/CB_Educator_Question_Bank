-- 0105_security_invoker_views.sql
-- ============================================================================
-- Close 3 CRITICAL Supabase advisor warnings: "Security Definer View".
--
-- Postgres views default to SECURITY DEFINER semantics — they run their
-- underlying queries as the view OWNER, BYPASSING the calling user's RLS. Three
-- views were created this way and never marked security_invoker:
--   • public.module_tree          (GRANTed to authenticated → REST-exposed)
--   • public.portfolio_item_tree  (GRANTed to authenticated → REST-exposed)
--   • public.student_skill_stats  (no grant; read only inside a DEFINER RPC)
-- module_tree / portfolio_item_tree are recursive walks of course_modules /
-- portfolio_items with NO per-user filter, so a direct REST query
-- (/rest/v1/module_tree) returned EVERY course's rows across tenants — a
-- cross-student/-course data leak.
--
-- Fix (PG15+, matches 0065): mark each view `security_invoker = on` so it runs
-- with the CALLER's permissions and the underlying RLS (course_modules /
-- portfolio_items / assignment_attempts — all RLS-enabled) is enforced per user.
--
-- Why this is safe:
--   • module_tree + portfolio_item_tree have NO client or RPC consumers (the app
--     reads the base tables directly) — pure latent REST exposure, now scoped.
--   • student_skill_stats is read ONLY inside my_skill_mastery() (0024), a
--     SECURITY DEFINER RPC: inside a definer function the view still executes as
--     the function owner (sees all rows) and the function's own WHERE scopes to
--     the calling student — so the mastery/prediction feature is unchanged. Only
--     a hypothetical DIRECT read of the view becomes RLS-scoped.
--
-- Forward-only; idempotent (SET is a no-op if already on).
-- ============================================================================

ALTER VIEW public.student_skill_stats SET (security_invoker = on);
ALTER VIEW public.module_tree         SET (security_invoker = on);
ALTER VIEW public.portfolio_item_tree SET (security_invoker = on);
