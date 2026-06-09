# Changelog

All notable changes from the autonomous improvement sessions are recorded here,
newest first. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
Dates are the work date. Migration numbers in parentheses where relevant.

> Note: an earlier parallel session also kept `docs/AUTONOMOUS_CHANGELOG.md`;
> this root file is the canonical changelog going forward.

## 2026-06-09

### Added
- **Class skills dashboard** (new "Skills" tab on a course) — class-wide,
  cross-test per-domain mastery: %-correct per SAT domain aggregated over the
  latest submitted run per (student, test) for enrolled students, grouped by
  section, with a weakest-skill callout, counts header, and CSV export. New
  `course_skill_mastery` RPC (**0123**, course-scoped SECURITY DEFINER);
  `teacher/ClassSkillsView.tsx` reuses `skills.ts` + `lib/csv.ts`. The 5th and
  broadest skill surface. _Verified: 3 students × 1 test renders the rollup +
  weakest callout._
- **Clickable skill → jump-to-question on the student result.** Each domain
  name and the "Focus area" chip in the Skills-by-topic card now scrolls the
  page to that skill's first question in the review list below (each review card
  carries a `result-q-<id>` anchor), turning the summary into a navigation aid.
  _Verified: clicking the Focus chip scrolls to the first weak-domain question._
- **CSV export from the Review heatmap** — per-question rows (module, Q#, domain,
  %-correct, correct, total). Extracted a shared `viewer/src/lib/csv.ts`
  (`toCsv` / `downloadCsv`, RFC-4180 escaping) and moved the cross-class
  comparison's inline CSV logic onto it — one download helper, no duplication.
- **SAT domain chip on student result review cards.** Each per-question card on
  a released result now shows its skill domain (e.g. "Advanced Math") next to
  "Section · Q#", so a student reviewing a missed question sees which skill it
  tests — reinforcing the "Focus area" from the summary card. Uses the `domain`
  already returned by `get_test_result` (0121); matches the teacher-side nav pill.

### Fixed
- **Teacher per-student skill mastery double-counted retakes** (0122). The
  `student_test_report` RPC's per-domain rollup summed every submitted run, so a
  student who retook the *same* test had that form's questions counted once per
  attempt (e.g. 34/34 instead of 17/17), inflating denominators and skewing the
  "Focus" domain. The `domains` aggregate now counts only the latest attempt per
  test (`DISTINCT ON (test_id) … ORDER BY submitted_at DESC`); the `runs` array
  still spans all attempts so the score-trajectory sparkline is unchanged.
  _Verified: a 2-attempt same-test student now reports 98 domain answers (one
  attempt) with both runs in the trajectory._

### Tests
- **`smoke-skills.mjs`** — a disposable, self-cleaning integration suite for the
  three skill RPCs: `get_test_result` domain presence + release gate (0121),
  `student_test_report` latest-attempt dedup (0122), and `course_skill_mastery`
  class rollup + course-scope authorization (0123). Wired into `smoke-all` and
  `npm run smoke:skills`. 11/11 green.

### Docs
- Added [`docs/SKILL_DOMAINS.md`](docs/SKILL_DOMAINS.md) — end-to-end architecture
  of the SAT skill-domain system (data, shared `skills.ts` module, the four
  surfaces, RLS/RPCs, how to classify a new test, gotchas).
- README now describes the Canvas-style LMS + skill analytics, links the new
  docs, and corrects the dev server port (9000, not 5173).
