-- 0226_module_item_types_phase1.sql  (renumbered from 0225 — parallel session took 0225 for recording_shares)
-- Premium module item types — Phase 1 (foundation + Structure group).
--
-- See docs/PLAN_MODULE_ITEM_TYPES.md. Expands module items from 6 → 17 types
-- across 4 add-picker sub-tabs (Learn / Assess / Engage / Structure). This
-- migration lands the shared plumbing + the two Structure-group additions
-- (Note/Callout, Divider). Later phases widen the CHECK further as each type
-- ships; the `config` column carries every inline type's payload so most
-- phases need no further schema.
--
--   config jsonb — per-type inline payload, e.g.:
--     note     → {"body": "...", "tone": "info|tip|warning"}
--     page     → {"body": "..."}            (Phase 2)
--     video    → {"provider": "youtube"}    (Phase 2; url holds the link)
--     goal     → {"target": "...", "metric": "..."}  (Phase 3)
--   divider carries nothing (visual only).

-- 1. Inline payload column (additive; existing rows default to {}).
ALTER TABLE public.module_items
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Widen the item_type CHECK. 'note' + 'divider' join Phase 1; the rest of
--    the new types are added in their phases. Drop-and-recreate keeps the
--    constraint name stable.
ALTER TABLE public.module_items
  DROP CONSTRAINT IF EXISTS module_items_item_type_check;

ALTER TABLE public.module_items
  ADD CONSTRAINT module_items_item_type_check
  CHECK (item_type IN (
    'assignment', 'header', 'link', 'page', 'file',
    'note', 'divider'
  ));
