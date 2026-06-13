-- =============================================================================
-- Migration: 0232_search_recordings.sql
-- Description: Full-text-ish search across the caller's OWN recordings —
--   matches the title, the AI notes (tldr + topic title/summary), and the
--   stitched transcript utterances. Returns one row per matching recording
--   with a snippet + (for transcript hits) the part_index/start_ms so the UI
--   can deep-link to the moment.
--
--   SECURITY: SECURITY DEFINER but hard-scoped to owner_id = auth.uid(), so it
--   can read across the caller's recordings without per-row RLS round-trips and
--   NEVER returns another owner's content. Admins use the table RLS, not this.
--
--   ILIKE '%term%' with a leading wildcard won't use a btree index, but the
--   search space is one owner's recordings (tens, not millions) so a seq scan
--   over their parts is fine. Revisit with pg_trgm / tsvector if a power user
--   accumulates thousands of parts.
--
-- Forward-only. Idempotent (CREATE OR REPLACE).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_my_recordings(p_query text)
RETURNS TABLE (
  recording_id uuid,
  title        text,
  created_at   timestamptz,
  subject_type text,
  domain       text,
  matched_in   text,      -- 'title' | 'transcript' | 'notes'
  snippet      text,      -- NULL for a pure title match
  part_index   integer,   -- transcript hits only
  start_ms     integer    -- transcript hits only
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH q AS (
    SELECT btrim(coalesce(p_query, '')) AS term
  ),
  mine AS (
    SELECT r.id, r.title, r.created_at, r.subject_type, r.domain
    FROM public.recordings r, q
    WHERE r.owner_id = auth.uid()
      AND length(q.term) >= 2
  ),
  -- First matching utterance per recording (earliest part, then earliest ms).
  tx AS (
    SELECT DISTINCT ON (p.recording_id)
      p.recording_id,
      (u->>'text')                          AS snippet,
      p.part_index,
      COALESCE((u->>'start_ms')::int, 0)     AS start_ms
    FROM public.recording_parts p
    JOIN mine m ON m.id = p.recording_id
    CROSS JOIN q
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.transcript, '[]'::jsonb)) AS u
    WHERE (u->>'text') ILIKE '%' || q.term || '%'
    ORDER BY p.recording_id, p.part_index, COALESCE((u->>'start_ms')::int, 0)
  ),
  -- Notes match: tldr, or the first topic whose title/summary matches.
  nt AS (
    SELECT
      n.recording_id,
      CASE
        WHEN n.tldr ILIKE '%' || q.term || '%' THEN n.tldr
        ELSE (
          SELECT t->>'summary'
          FROM jsonb_array_elements(n.topics) t
          WHERE t->>'title'   ILIKE '%' || q.term || '%'
             OR t->>'summary' ILIKE '%' || q.term || '%'
          LIMIT 1
        )
      END AS snippet
    FROM public.recording_notes n
    JOIN mine m ON m.id = n.recording_id
    CROSS JOIN q
    WHERE n.tldr ILIKE '%' || q.term || '%'
       OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(n.topics) t
            WHERE t->>'title'   ILIKE '%' || q.term || '%'
               OR t->>'summary' ILIKE '%' || q.term || '%'
          )
  )
  SELECT
    m.id, m.title, m.created_at, m.subject_type, m.domain,
    CASE
      WHEN m.title ILIKE '%' || q.term || '%' THEN 'title'
      WHEN tx.recording_id IS NOT NULL        THEN 'transcript'
      ELSE 'notes'
    END AS matched_in,
    CASE
      WHEN m.title ILIKE '%' || q.term || '%' THEN NULL
      WHEN tx.recording_id IS NOT NULL        THEN tx.snippet
      ELSE nt.snippet
    END AS snippet,
    tx.part_index,
    tx.start_ms
  FROM mine m
  CROSS JOIN q
  LEFT JOIN tx ON tx.recording_id = m.id
  LEFT JOIN nt ON nt.recording_id = m.id
  WHERE m.title ILIKE '%' || q.term || '%'
     OR tx.recording_id IS NOT NULL
     OR nt.recording_id IS NOT NULL
  ORDER BY m.created_at DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.search_my_recordings(text) TO authenticated;

COMMENT ON FUNCTION public.search_my_recordings(text) IS
  'Owner-scoped search across own recordings (title + notes + transcript). '
  'Returns one row per recording with a snippet + part_index/start_ms for '
  'transcript hits. Added 0232.';
