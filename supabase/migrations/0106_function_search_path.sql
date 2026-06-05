-- 0106_function_search_path.sql
-- ============================================================================
-- Close the remaining Supabase advisor "Function Search Path Mutable" warnings.
--
-- Seven public functions had no pinned search_path, so they inherited the
-- caller's — a caller could prepend a malicious schema and shadow an
-- unqualified reference. (None are SECURITY DEFINER, so the blast radius was
-- limited, but the advisor flags all seven and it's cheap to close.)
--
-- Fix: pin `search_path = ''` (Supabase's recommended value). This is provably
-- behavior-preserving here because EVERY cross-schema reference in all seven
-- bodies is ALREADY fully-qualified —
--   _grade_answer       → calls public._spr_numeric, jsonb_* (pg_catalog)
--   _spr_numeric        → only pg_catalog built-ins + regex operators
--   apply_late_penalty  → only pg_catalog (interval cast, GREATEST)
--   *_validate_assignment_ref → public.course_modules, public.assignments
--   prevent_module_cycle      → public.course_modules
--   prevent_portfolio_item_cycle → public.portfolio_items
--   scale_section_score → only pg_catalog (ROUND/EXP/GREATEST/LEAST)
-- pg_catalog is always implicitly searched even with an empty search_path, so
-- built-in types/operators/functions keep resolving; the only non-catalog refs
-- are public.* and are spelled out. No reference to the `auth` schema.
--
-- ALTER FUNCTION (not CREATE OR REPLACE) so only the config attribute changes —
-- zero risk of body drift. Forward-only; idempotent.
-- ============================================================================

ALTER FUNCTION public._grade_answer(text, text, jsonb, text)                       SET search_path = '';
ALTER FUNCTION public._spr_numeric(text)                                           SET search_path = '';
ALTER FUNCTION public.apply_late_penalty(numeric, timestamptz, timestamptz, integer, integer) SET search_path = '';
ALTER FUNCTION public.module_items_validate_assignment_ref()                       SET search_path = '';
ALTER FUNCTION public.prevent_module_cycle()                                       SET search_path = '';
ALTER FUNCTION public.prevent_portfolio_item_cycle()                               SET search_path = '';
ALTER FUNCTION public.scale_section_score(numeric)                                 SET search_path = '';
