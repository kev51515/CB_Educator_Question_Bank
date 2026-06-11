-- =============================================================================
-- 0197_available_domains.sql
--
-- my_available_domains() — the set of product verticals (domains) the caller
-- actually PARTICIPATES in, for scoping the DomainSwitcher. A student enrolled
-- only in academic classes should not be offered Counseling / Coaching areas;
-- an educator who only teaches SAT classes should not see Counselor / Coach
-- hats. (derive_user_domain from 0186/0192 picks the DEFAULT domain; this one
-- returns the full allowed set.)
--
-- Participation =
--   • courses the caller teaches  (courses.teacher_id)
--   • courses shared with them    (course_shares.recipient_id, 0130)
--   • courses they're enrolled in (course_memberships.student_id)
-- Admins get all three domains (they manage everything).
-- Zero participation falls back to ['academic'] (the historical default), so
-- a brand-new account still renders a coherent shell.
--
-- Ordering is stable: academic, counseling, coaching.
--
-- SECURITY DEFINER + SET search_path per CLAUDE.md RPC rule — it must read
-- courses/memberships regardless of the caller's RLS, and it only ever reads
-- the caller's OWN participation (auth.uid()), so there is no privilege-
-- escalation surface. This is UI scoping, not a data lock: course data itself
-- stays guarded by the existing RLS policies.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.my_available_domains()
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_domains text[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN ARRAY['academic'];
  END IF;

  IF public.is_admin(v_uid) THEN
    RETURN ARRAY['academic', 'counseling', 'coaching'];
  END IF;

  SELECT array_agg(d ORDER BY array_position(ARRAY['academic','counseling','coaching'], d))
    INTO v_domains
  FROM (
    SELECT DISTINCT CASE
      WHEN c.course_type IN ('pickleball_player', 'pickleball_coach') THEN 'coaching'
      WHEN c.course_type = 'counseling' THEN 'counseling'
      ELSE 'academic'
    END AS d
    FROM public.courses c
    WHERE c.teacher_id = v_uid
       OR EXISTS (
            SELECT 1 FROM public.course_shares s
             WHERE s.course_id = c.id AND s.recipient_id = v_uid
          )
       OR EXISTS (
            SELECT 1 FROM public.course_memberships m
             WHERE m.course_id = c.id AND m.student_id = v_uid
          )
  ) t;

  RETURN COALESCE(v_domains, ARRAY['academic']);
END;
$$;

REVOKE ALL ON FUNCTION public.my_available_domains() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_available_domains() TO authenticated;

-- =============================================================================
-- END 0197
-- =============================================================================
