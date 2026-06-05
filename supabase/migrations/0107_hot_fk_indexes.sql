-- 0107_hot_fk_indexes.sql
-- ============================================================================
-- Index the foreign keys on the live-test + modules HOT paths (Supabase
-- Performance advisor: "Unindexed foreign keys"). These bite hardest exactly
-- under launch-day contention — many students/proctor polls hitting the same
-- parent rows at once — and on cascade deletes.
--
-- Surgical, NOT blanket: we index only FKs that match a real query/recursion
-- pattern. The ~17 remaining unindexed FKs are pure authorship/created_by
-- columns (filtered by course_id / topic_id, which ARE indexed); indexing those
-- would only add write overhead, so they're intentionally skipped.
--
--   test_runs(test_id)                  → proctor monitor / roster / release all
--                                         filter runs BY test; polled live.
--   test_run_answers(question_id)       → result review + per-item analysis join
--                                         answers to questions.
--   module_item_completion(module_item_id) → completion ticks; + cascade on item delete.
--   course_modules(parent_module_id)    → module_tree recursion + child lookups
--                                         on every Modules page load.
--   portfolio_items(parent_item_id)     → portfolio_item_tree recursion / subtree imports.
--
-- Plain CREATE INDEX (not CONCURRENTLY): these tables are small pre-launch so it
-- is effectively instant, and CONCURRENTLY cannot run inside the migration's
-- transaction. IF NOT EXISTS keeps it idempotent / forward-only.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_test_runs_test_id
  ON public.test_runs (test_id);

CREATE INDEX IF NOT EXISTS idx_test_run_answers_question_id
  ON public.test_run_answers (question_id);

CREATE INDEX IF NOT EXISTS idx_module_item_completion_module_item_id
  ON public.module_item_completion (module_item_id);

CREATE INDEX IF NOT EXISTS idx_course_modules_parent_module_id
  ON public.course_modules (parent_module_id);

CREATE INDEX IF NOT EXISTS idx_portfolio_items_parent_item_id
  ON public.portfolio_items (parent_item_id);
