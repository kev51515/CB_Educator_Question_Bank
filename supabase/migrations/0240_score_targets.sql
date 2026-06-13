-- 0240_score_targets.sql
-- Student-set SAT score target + test date.
--
-- Powers a Score Trajectory / target-gap card on the student dashboard: the
-- student declares the score they're aiming for (400-1600) and, optionally, the
-- date they sit the exam. The card compares their effective-score trajectory
-- against this target so they can see the gap to close and the time left.
--
-- Product shape: exactly one target per student (PK on user_id). Writes go
-- through set_score_target (SECURITY DEFINER) so the 400-1600 guard lives in one
-- place; the table carries no INSERT/UPDATE policy. Reads are scoped to the
-- student themselves PLUS any teacher of a course the student is enrolled in
-- (and admins), so the target surfaces on the teacher's view of that student.
--
-- House conventions (cf. 0224): SECURITY DEFINER fns set search_path =
-- public, auth; stable RAISE error codes the client switches on
-- (not_authenticated / invalid_target); GRANT EXECUTE TO authenticated.

-- ---------------------------------------------------------------------------
-- 1. Target table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_score_targets (
  user_id      uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_score int         NOT NULL CHECK (target_score BETWEEN 400 AND 1600),
  test_date    date,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_score_targets ENABLE ROW LEVEL SECURITY;

-- Read: the student themselves, or a teacher of a course the student is in
-- (course owner via courses.teacher_id), or an admin. Writes go through the RPC.
DROP POLICY IF EXISTS "score_targets: own or teacher read" ON public.student_score_targets;
CREATE POLICY "score_targets: own or teacher read"
  ON public.student_score_targets FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.course_memberships m
      JOIN public.courses c ON c.id = m.course_id
      WHERE m.student_id = student_score_targets.user_id
        AND (
          c.teacher_id = (SELECT auth.uid())
          OR public.is_admin((SELECT auth.uid()))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. set_score_target — upsert the caller's own target
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_score_target(
  p_target_score int,
  p_test_date    date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_target_score IS NULL OR p_target_score NOT BETWEEN 400 AND 1600 THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  INSERT INTO public.student_score_targets (user_id, target_score, test_date, updated_at)
  VALUES (v_uid, p_target_score, p_test_date, now())
  ON CONFLICT (user_id) DO UPDATE
    SET target_score = EXCLUDED.target_score,
        test_date    = EXCLUDED.test_date,
        updated_at   = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_score_target(int, date) TO authenticated;
