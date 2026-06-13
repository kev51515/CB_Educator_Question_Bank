/**
 * digests — types for the parent progress digest feature (lane C).
 *
 * A digest is a teacher-approved weekly progress summary delivered to a
 * student's GUARDIANS via LINE. The teacher composes a draft (stats + an
 * editable AI summary + an optional note) and clicks Approve & Send; the
 * backend enqueues one LINE message per LINE-linked guardian. See migration
 * 0239 + the digest-ai-summary edge function.
 */

/** One recent full-test result inside a digest's stats blob. */
export interface DigestRecentScore {
  test_title: string;
  /** Raw scaled score for the run (out of `total`). */
  score: number | null;
  total: number | null;
  submitted_at: string;
}

/** One upcoming/due-soon assignment inside a digest's stats blob. */
export interface DigestUpcoming {
  title: string;
  due_at: string | null;
}

/**
 * The computed stats blob (jsonb) produced by compose_student_digest. All
 * fields are scoped to the digest's course + the current ISO week, except
 * `prior_score` (the most recent submitted full-test score BEFORE this week,
 * for a trajectory delta).
 */
export interface DigestStats {
  recent_scores: DigestRecentScore[];
  completed_this_week: number;
  due_soon: number;
  upcoming: DigestUpcoming[];
  /** Best full-test score this week as a percent (0-100), or null. */
  best_recent_score: number | null;
  /** Prior full-test score as a percent (0-100), or null. */
  prior_score: number | null;
}

export type DigestStatus = "draft" | "sent";

/** A row from public.student_progress_digests. */
export interface StudentDigest {
  id: string;
  course_id: string;
  student_id: string;
  period_start: string;
  period_end: string;
  stats: DigestStats;
  ai_summary: string | null;
  teacher_note: string | null;
  status: DigestStatus;
  approved_by: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A roster student paired with their current-week digest (if one exists) and
 * whether they have any LINE-linked guardian to deliver to. Drives the
 * DigestsPage list.
 */
export interface DigestRosterRow {
  student_id: string;
  display_name: string | null;
  email: string;
  digest: StudentDigest | null;
  /** Count of guardians attached to this student (any link state). */
  guardian_count: number;
  /** Count of guardians with an active LINE link (delivery reach). */
  line_linked_guardian_count: number;
}
