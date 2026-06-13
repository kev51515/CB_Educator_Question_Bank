-- 0233_module_item_types_plan_engage.sql
-- Premium module item types — Plan + Engage groups (first batch).
--
-- See docs/PLAN_MODULE_ITEM_TYPES.md. Adds three inline types (no new tables;
-- payload rides the 0226 `config` jsonb / `url`):
--   goal          (Plan)   → config.target, config.metric   — a target card
--   countdown     (Plan)   → config.date (ISO date)          — test-date countdown
--   live_session  (Engage) → url (meet link) + config.starts_at, config.duration_min
-- Discussion + Survey are deferred (need a student discussion surface / a
-- responses table respectively).

ALTER TABLE public.module_items
  DROP CONSTRAINT IF EXISTS module_items_item_type_check;

ALTER TABLE public.module_items
  ADD CONSTRAINT module_items_item_type_check
  CHECK (item_type IN (
    'assignment', 'header', 'link', 'page', 'file',
    'note', 'divider', 'video',
    'goal', 'countdown', 'live_session'
  ));
