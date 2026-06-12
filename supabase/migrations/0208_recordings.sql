-- =============================================================================
-- Migration: 0208_recordings.sql
-- Description: Foundations for the Recordings feature (audio -> transcript ->
--   AI "Fathom" notes -> quiz/assignment). Owner-facing across all three
--   domains (teacher / counselor / coach). See docs/RECORDINGS_FEATURE.md.
--
--   Three tables:
--     recordings        — one capture session (owner-scoped)
--     recording_parts   — the "spurt" Parts; each transcribes independently
--                         and is stitched in order (Part 1 / Part 2 …)
--     recording_notes   — the AI-structured summary, 1:1 with a recording
--
--   Plus:
--     - assignments.source_recording_id  (links a generated quiz back to its
--       recording; nullable, ON DELETE SET NULL so deleting a recording never
--       orphans/loses a published assignment)
--     - a private 'recordings' storage bucket + owner/admin-only object RLS
--     - audit_recording() trigger -> audit_events (metadata only, never the
--       transcript/notes/audio content), mirroring 0203 / 0062
--
-- PRIVACY: recordings are OWNER-ONLY. Unlike course-materials (enrolled
--   students may read), students have NO access to recordings, parts, notes, or
--   the audio objects — these can contain session audio of other people.
--
-- Forward-only. Idempotent re-runs OK.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: recordings — the capture session
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recordings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Optional link to a course (drives domain vocab + later assignment target).
  course_id       uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  -- Denormalized domain for gating/vocabulary ('academic'|'counseling'|'coaching').
  domain          text NOT NULL DEFAULT 'academic'
                    CHECK (domain IN ('academic', 'counseling', 'coaching')),
  title           text NOT NULL DEFAULT 'Untitled recording',
  -- 'self'  = the owner's own voice (no third-party consent needed)
  -- 'session' = a live session with students/clients present (consent required)
  subject_type    text NOT NULL DEFAULT 'self'
                    CHECK (subject_type IN ('self', 'session')),
  consent_obtained boolean NOT NULL DEFAULT false,
  consent_note    text,
  -- Lifecycle of the whole session.
  status          text NOT NULL DEFAULT 'recording'
                    CHECK (status IN ('recording', 'processing', 'ready', 'failed')),
  duration_s      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- A 'session' recording must assert consent before it can leave 'recording'.
  CONSTRAINT recordings_session_consent
    CHECK (subject_type <> 'session' OR consent_obtained OR status = 'recording')
);

CREATE INDEX IF NOT EXISTS recordings_owner_idx
  ON public.recordings (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recordings_course_idx
  ON public.recordings (course_id) WHERE course_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_recordings_updated_at ON public.recordings;
CREATE TRIGGER trg_recordings_updated_at
  BEFORE UPDATE ON public.recordings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: recording_parts — the "spurt" Parts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recording_parts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
  -- 1-based; the display order ("Part 1", "Part 2"). Unique per recording.
  part_index   integer NOT NULL CHECK (part_index >= 1),
  -- Storage object path inside the 'recordings' bucket.
  audio_path   text,
  status       text NOT NULL DEFAULT 'uploading'
                CHECK (status IN ('uploading', 'queued', 'transcribing',
                                  'transcribed', 'failed')),
  -- AssemblyAI transcript id, for webhook reconciliation.
  provider_id  text,
  -- Utterances: [{speaker, start_ms, end_ms, text}, ...]. NULL until done.
  transcript   jsonb,
  duration_s   integer NOT NULL DEFAULT 0,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recording_id, part_index)
);

CREATE INDEX IF NOT EXISTS recording_parts_recording_idx
  ON public.recording_parts (recording_id, part_index);
-- Webhook reconciles by provider_id.
CREATE INDEX IF NOT EXISTS recording_parts_provider_idx
  ON public.recording_parts (provider_id) WHERE provider_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_recording_parts_updated_at ON public.recording_parts;
CREATE TRIGGER trg_recording_parts_updated_at
  BEFORE UPDATE ON public.recording_parts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: recording_notes — the AI "Fathom" output (1:1)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recording_notes (
  recording_id uuid PRIMARY KEY REFERENCES public.recordings(id) ON DELETE CASCADE,
  tldr         text,
  -- [{title, summary, start_ms, part_index}]
  topics       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{text, owner?}]
  action_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{quote, start_ms, part_index}]
  highlights   jsonb NOT NULL DEFAULT '[]'::jsonb,
  model        text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_recording_notes_updated_at ON public.recording_notes;
CREATE TRIGGER trg_recording_notes_updated_at
  BEFORE UPDATE ON public.recording_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: link a generated quiz back to its recording
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS source_recording_id uuid
    REFERENCES public.recordings(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: RLS — owner-only (admins can read for support/audit)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.recordings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recording_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recording_notes ENABLE ROW LEVEL SECURITY;

-- recordings ------------------------------------------------------------------
DROP POLICY IF EXISTS "recordings: owner all"  ON public.recordings;
DROP POLICY IF EXISTS "recordings: admin read" ON public.recordings;

CREATE POLICY "recordings: owner all"
  ON public.recordings
  FOR ALL
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY "recordings: admin read"
  ON public.recordings
  FOR SELECT
  USING (public.is_admin((SELECT auth.uid())));

-- recording_parts (ownership derived through the parent recording) ------------
DROP POLICY IF EXISTS "recording_parts: owner all"  ON public.recording_parts;
DROP POLICY IF EXISTS "recording_parts: admin read" ON public.recording_parts;

CREATE POLICY "recording_parts: owner all"
  ON public.recording_parts
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.recordings r
     WHERE r.id = recording_parts.recording_id
       AND r.owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.recordings r
     WHERE r.id = recording_parts.recording_id
       AND r.owner_id = (SELECT auth.uid())
  ));

CREATE POLICY "recording_parts: admin read"
  ON public.recording_parts
  FOR SELECT
  USING (public.is_admin((SELECT auth.uid())));

-- recording_notes -------------------------------------------------------------
DROP POLICY IF EXISTS "recording_notes: owner all"  ON public.recording_notes;
DROP POLICY IF EXISTS "recording_notes: admin read" ON public.recording_notes;

CREATE POLICY "recording_notes: owner all"
  ON public.recording_notes
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.recordings r
     WHERE r.id = recording_notes.recording_id
       AND r.owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.recordings r
     WHERE r.id = recording_notes.recording_id
       AND r.owner_id = (SELECT auth.uid())
  ));

CREATE POLICY "recording_notes: admin read"
  ON public.recording_notes
  FOR SELECT
  USING (public.is_admin((SELECT auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: private 'recordings' storage bucket + object RLS
--   Path convention: `{owner_id}/{recording_id}/part-{n}.{ext}` — the owner id
--   is the FIRST path segment so object RLS can gate on it directly.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "recordings-bucket: owner reads"   ON storage.objects;
DROP POLICY IF EXISTS "recordings-bucket: owner inserts" ON storage.objects;
DROP POLICY IF EXISTS "recordings-bucket: owner updates" ON storage.objects;
DROP POLICY IF EXISTS "recordings-bucket: owner deletes" ON storage.objects;

-- SELECT — owner only (admin reads go through the service role / DB, not the
-- public bucket policy). Guard the uuid cast like 0016 does.
CREATE POLICY "recordings-bucket: owner reads"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'recordings'
    AND (string_to_array(name, '/'))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND ((string_to_array(name, '/'))[1])::uuid = (SELECT auth.uid())
  );

CREATE POLICY "recordings-bucket: owner inserts"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'recordings'
    AND (string_to_array(name, '/'))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND ((string_to_array(name, '/'))[1])::uuid = (SELECT auth.uid())
  );

CREATE POLICY "recordings-bucket: owner updates"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'recordings'
    AND (string_to_array(name, '/'))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND ((string_to_array(name, '/'))[1])::uuid = (SELECT auth.uid())
  )
  WITH CHECK (
    bucket_id = 'recordings'
    AND (string_to_array(name, '/'))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND ((string_to_array(name, '/'))[1])::uuid = (SELECT auth.uid())
  );

CREATE POLICY "recordings-bucket: owner deletes"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'recordings'
    AND (string_to_array(name, '/'))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND ((string_to_array(name, '/'))[1])::uuid = (SELECT auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: audit trail (metadata only — never transcript/notes/audio)
--   Mirrors 0203 / 0062: SECURITY DEFINER so the INSERT survives audit_events'
--   admin-read-only RLS; logs only ids, op, and the NAMES of changed columns.
--   Sensitive payload columns (transcript, tldr, topics, action_items,
--   highlights, consent_note, title) are NEVER copied into the audit row.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_recording()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END;
  -- Identify the owning recording + owner regardless of which table fired.
  v_recording_id text := COALESCE(v_row ->> 'recording_id', v_row ->> 'id');
  v_changed text[];
  v_status_old text := v_old ->> 'status';
  v_status_new text := v_new ->> 'status';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(key ORDER BY key) INTO v_changed
      FROM jsonb_each(v_new) AS e(key, val)
     WHERE key <> 'updated_at'
       AND v_new -> key IS DISTINCT FROM v_old -> key;
    IF v_changed IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (
    auth.uid(),
    'recording.' || lower(TG_OP),
    TG_TABLE_NAME,
    v_row ->> 'id',
    jsonb_strip_nulls(jsonb_build_object(
      'op',             TG_OP,
      'recording_id',   v_recording_id,
      'course_id',      v_row ->> 'course_id',
      'subject_type',   v_row ->> 'subject_type',
      'changed_fields', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(v_changed) END,
      'status_from',    CASE WHEN TG_OP = 'UPDATE' AND v_status_old IS DISTINCT FROM v_status_new
                             THEN v_status_old END,
      'status_to',      CASE WHEN TG_OP = 'UPDATE' AND v_status_old IS DISTINCT FROM v_status_new
                             THEN v_status_new END
    ))
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_recordings      ON public.recordings;
DROP TRIGGER IF EXISTS trg_audit_recording_parts ON public.recording_parts;
DROP TRIGGER IF EXISTS trg_audit_recording_notes ON public.recording_notes;

CREATE TRIGGER trg_audit_recordings
  AFTER INSERT OR UPDATE OR DELETE ON public.recordings
  FOR EACH ROW EXECUTE FUNCTION public.audit_recording();

CREATE TRIGGER trg_audit_recording_parts
  AFTER INSERT OR UPDATE OR DELETE ON public.recording_parts
  FOR EACH ROW EXECUTE FUNCTION public.audit_recording();

CREATE TRIGGER trg_audit_recording_notes
  AFTER INSERT OR UPDATE OR DELETE ON public.recording_notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_recording();

-- =============================================================================
