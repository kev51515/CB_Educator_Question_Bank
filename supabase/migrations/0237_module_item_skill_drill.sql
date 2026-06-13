-- 0237_module_item_skill_drill.sql
-- A "skill_drill" module item: a practice set auto-targeted at each student's
-- WEAK skills. It REUSES the existing qbank_set runner + grading entirely — the
-- only new logic is set SELECTION, which happens client-side (resolve the
-- student's weakest matching catalog set, then mount QBankAssignmentRunner with
-- a synthesized assignment). There is therefore NO new content/grading table or
-- RPC: attempts flow through the existing qbank submit path and feed back into
-- my_skill_mastery, making the drill self-improving.
--
-- The ONLY schema change is widening module_items_item_type_check to allow
-- item_type = 'skill_drill' (drop + recreate, preserving every existing value).
--
-- module_items.config jsonb optionally carries { section: 'math' |
-- 'reading-and-writing' } to constrain which section the drill draws from; an
-- absent/empty section means "any section".

ALTER TABLE public.module_items
  DROP CONSTRAINT IF EXISTS module_items_item_type_check;

ALTER TABLE public.module_items
  ADD CONSTRAINT module_items_item_type_check CHECK (
    item_type IN (
      'assignment',
      'header',
      'link',
      'page',
      'file',
      'note',
      'divider',
      'video',
      'goal',
      'countdown',
      'live_session',
      'survey',
      'vocab',
      'skill_drill'
    )
  );
