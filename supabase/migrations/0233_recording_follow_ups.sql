-- =============================================================================
-- Migration: 0233_recording_follow_ups.sql
-- Description: Tracked follow-ups promoted from a recording's AI action items.
--   A recording's notes.action_items are advisory text; this table turns any
--   of them into a real, checkable task with an optional due date so the
--   educator (teacher / counselor / coach) actually closes the loop after a
--   session.
--
--   OWNER-SCOPED + personal: a follow-up belongs to the educator who created
--   it, not to a student. recording_id is nullable + ON DELETE SET NULL so
--   deleting the source recording keeps the follow-up (the task outlives the
--   audio). No audit trigger — this is the owner's own to-do list, low
--   sensitivity, and never holds third-party PII beyond the action text the
--   owner chose to track.
--
--   No RPC: it's the caller's own rows, so plain RLS (owner-all) + direct
--   PostgREST CRUD is enough (mirrors the counseling_tasks client-direct
--   pattern). The client builds rows when promoting action items.
--
-- Forward-only. Idempotent re-runs OK.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.recording_follow_ups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Source recording (kept as provenance); follow-up survives its deletion.
  recording_id uuid REFERENCES public.recordings(id) ON DELETE SET NULL,
  body         text NOT NULL CHECK (length(btrim(body)) > 0),
  -- Free-text "owner" label carried over from the AI action item (e.g. a
  -- student/client name) — NOT a profile FK; this is a personal note.
  assignee     text,
  due_at       timestamptz,
  done         boolean NOT NULL DEFAULT false,
  done_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Drives the standalone "Follow-ups" page (open first, by due date).
CREATE INDEX IF NOT EXISTS recording_follow_ups_owner_idx
  ON public.recording_follow_ups (owner_id, done, due_at NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS recording_follow_ups_recording_idx
  ON public.recording_follow_ups (recording_id) WHERE recording_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_recording_follow_ups_updated_at ON public.recording_follow_ups;
CREATE TRIGGER trg_recording_follow_ups_updated_at
  BEFORE UPDATE ON public.recording_follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — owner-only across every verb.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.recording_follow_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follow_ups: owner all" ON public.recording_follow_ups;
CREATE POLICY "follow_ups: owner all"
  ON public.recording_follow_ups
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

COMMENT ON TABLE public.recording_follow_ups IS
  'Owner-scoped tracked follow-ups promoted from recording AI action items. '
  'Added 0233. Client-direct CRUD under owner-all RLS; no RPC.';
