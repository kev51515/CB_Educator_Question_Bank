-- =============================================================================
-- Migration: 0040_discussion_short_codes.sql
-- Description: Mirror 0039 for `discussion_topics`. Adds a stable global-unique
--   6-char `short_code` so URLs become
--   `/courses/AB12CD/discussions/H7K9MN` instead of `…/discussions/<uuid>`.
--   Same alphabet (no O/0/I/1/L); same BEFORE INSERT trigger; same backfill
--   pattern. Trigger is SECURITY DEFINER with search_path pinned to public so
--   RLS on discussion_topics doesn't trip the generator's existence probe.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_discussion_short_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  alphabet_len constant int := length(alphabet);
  code text;
  exists_already boolean;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(alphabet, floor(random() * alphabet_len)::int + 1, 1);
    END LOOP;
    SELECT EXISTS (SELECT 1 FROM public.discussion_topics WHERE short_code = code)
      INTO exists_already;
    IF NOT exists_already THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_discussion_short_code() TO anon, authenticated, service_role;

ALTER TABLE public.discussion_topics ADD COLUMN IF NOT EXISTS short_code text;

UPDATE public.discussion_topics
   SET short_code = public.generate_discussion_short_code()
 WHERE short_code IS NULL;

ALTER TABLE public.discussion_topics ALTER COLUMN short_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discussion_topics_short_code_unique'
  ) THEN
    ALTER TABLE public.discussion_topics
      ADD CONSTRAINT discussion_topics_short_code_unique UNIQUE (short_code);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discussion_topics_short_code_format'
  ) THEN
    ALTER TABLE public.discussion_topics
      ADD CONSTRAINT discussion_topics_short_code_format
      CHECK (short_code ~ '^[A-Z0-9]{6}$');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_discussion_short_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.short_code IS NULL THEN
    NEW.short_code := public.generate_discussion_short_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_discussion_short_code ON public.discussion_topics;
CREATE TRIGGER trg_set_discussion_short_code
  BEFORE INSERT ON public.discussion_topics
  FOR EACH ROW
  EXECUTE FUNCTION public.set_discussion_short_code();

COMMENT ON COLUMN public.discussion_topics.short_code IS
  '6-char A-Z2-9 stable URL slug. Globally unique across all courses.';
