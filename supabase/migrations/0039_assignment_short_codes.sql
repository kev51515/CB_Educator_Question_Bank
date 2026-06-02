-- =============================================================================
-- Migration: 0039_assignment_short_codes.sql
-- Description: Mirror 0038 for `assignments`. Adds a stable global-unique
--   6-char `short_code` so URLs become `/courses/AB12CD/assignments/H7K9MN`
--   instead of `…/assignments/<uuid>`. Same alphabet (no O/0/I/1/L); same
--   BEFORE INSERT trigger; same backfill pattern.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_assignment_short_code()
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
    SELECT EXISTS (SELECT 1 FROM public.assignments WHERE short_code = code)
      INTO exists_already;
    IF NOT exists_already THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_assignment_short_code() TO anon, authenticated, service_role;

ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS short_code text;

UPDATE public.assignments
   SET short_code = public.generate_assignment_short_code()
 WHERE short_code IS NULL;

ALTER TABLE public.assignments ALTER COLUMN short_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assignments_short_code_unique'
  ) THEN
    ALTER TABLE public.assignments
      ADD CONSTRAINT assignments_short_code_unique UNIQUE (short_code);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assignments_short_code_format'
  ) THEN
    ALTER TABLE public.assignments
      ADD CONSTRAINT assignments_short_code_format
      CHECK (short_code ~ '^[A-Z0-9]{6}$');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_assignment_short_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.short_code IS NULL THEN
    NEW.short_code := public.generate_assignment_short_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_assignment_short_code ON public.assignments;
CREATE TRIGGER trg_set_assignment_short_code
  BEFORE INSERT ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_assignment_short_code();

COMMENT ON COLUMN public.assignments.short_code IS
  '6-char A-Z2-9 stable URL slug. Globally unique across all courses.';
