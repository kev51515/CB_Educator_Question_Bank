-- 0227_module_item_types_learn.sql
-- Premium module item types — Phase 2 (Learn group: Page, Video, File).
--
-- See docs/PLAN_MODULE_ITEM_TYPES.md. 'page' and 'file' were already allowed by
-- the item_type CHECK (0011) but never exposed in the add-picker; this phase
-- surfaces them and adds 'video'. All three are inline content:
--   page  → config.body (markdown lesson text)
--   video → url (YouTube/Vimeo/Loom) + config.provider
--   file  → url (material link)
-- No new tables — the 0226 `config` jsonb column carries everything.

ALTER TABLE public.module_items
  DROP CONSTRAINT IF EXISTS module_items_item_type_check;

ALTER TABLE public.module_items
  ADD CONSTRAINT module_items_item_type_check
  CHECK (item_type IN (
    'assignment', 'header', 'link', 'page', 'file',
    'note', 'divider', 'video'
  ));
