-- =============================================================================
-- Migration: 0157_drop_start_test_1arg.sql
-- Description: Hotfix to 0156. Adding the (p_first, p_last) DEFAULT args created
--   a NEW overload `start_test(text, integer, integer)` ALONGSIDE the old
--   `start_test(text)` (CREATE OR REPLACE only replaces a same-signature
--   function). A client call with just {p_slug} then matched BOTH candidates →
--   PostgREST "could not choose the best candidate function" → every full-test
--   (no-range) start failed. Drop the 1-arg overload; the 3-arg version with
--   DEFAULT NULLs serves the 1-arg call. Forward-only.
-- =============================================================================

DROP FUNCTION IF EXISTS public.start_test(text);

-- =============================================================================
-- END OF MIGRATION 0157_drop_start_test_1arg.sql
-- =============================================================================
