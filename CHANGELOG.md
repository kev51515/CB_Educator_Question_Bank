# Changelog

All notable changes from the autonomous improvement sessions are recorded here,
newest first. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
Dates are the work date. Migration numbers in parentheses where relevant.

> Note: an earlier parallel session also kept `docs/AUTONOMOUS_CHANGELOG.md`;
> this root file is the canonical changelog going forward.

## 2026-06-10

### Changed
- **Rebranded the app to "OmniLMS"** (more flexible than SAT-only): page title,
  PWA manifest, splash, exports/print headers, app header, sign-in wordmark +
  brand copy (now positions classes **and** college counseling), package name,
  READMEs. The "Question Bank" feature label, Educator/Student roles, the
  © PrepMasters company footer, and SAT references in test content are unchanged.
- **Wider desktop layout** — main surfaces (course header/tabs/body, Dashboard,
  Courses list) use up to 1800px; Account + per-student pages a wider cap.

### Added
- **Grouped + adjustable course tab strip** — the per-course tabs are grouped by
  function in their default order (Teach · Insights · People · Resources ·
  Manage) and are **drag- or keyboard-reorderable** (Alt+←/→), **saved per
  user**. The active tab auto-scrolls into view; the visible set stays
  course-type aware. New `CourseTabStrip`.
- **Admin entry in the rail** — an admin in their own view gets an "Admin" rail
  item (→ Stats/Users/Invite codes/Audit log) and an "Admin" header label
  (hidden while previewing another role via "View as").

### Polish
- Counseling courses default to the **Caseload** tab (not an empty Modules page);
  a violet **"Counseling"** badge marks them on course cards.
- **Caseload**: sortable columns + filter chips (All / Needs attention /
  Deadline soon / Missing docs), clickable total cards that toggle the matching
  filter, filter+sort **persisted per device**, focus rings, and an actionable
  empty state.
- Student counseling courses hide the SAT "assignments due / my average" stats;
  counseling cards are grouped under a "College counseling" heading on both
  sides; the student college list shows per-college document status.
- Counselor AI: action disabled until there's enough input, with a char count.

## 2026-06-09

### Added
- **Counseling course type + full counseling suite.** Courses now have a
  `course_type` ('class' | 'counseling', migration 0133) chosen at creation;
  Portfolio moved to counseling-only. The Counseling type unlocks a college/
  career advising workspace (see [`docs/COUNSELING.md`](docs/COUNSELING.md)):
  - **Per-student workspace** (counselor side, StudentProfilePage): digital
    profile, college list + **application tracker** (status/plan/deadline),
    **document checklist** ("missing docs"), counselor **tasks**, and
    counselor-private **meeting notes**. Migrations 0134, 0137.
  - **Caseload dashboard** — a counseling-only course tab with course-wide
    totals (applications by status, deadlines due in 14 days, missing docs,
    open/overdue tasks) + a per-student table deep-linking into each workspace.
    `counseling_caseload` RPC (0135/0137).
  - **Student portal** — students in a counseling course see/maintain their own
    profile, college list (read), and tasks (check off via RPC); they're
    **notified** when a counselor assigns a task. Migration 0136. (No AI on the
    student side, by design.)
  - **Counselor-only AI** — an "essay feedback" + "rec-letter draft" assistant
    on the per-student workspace, via a new `counselor-ai` edge function that
    authorizes teachers-of-course/admin only and calls the LLM server-side.
    Needs a one-time `supabase secrets set ANTHROPIC_API_KEY=…` +
    `supabase functions deploy counselor-ai`.
  - Verified by `smoke-counseling.mjs` (20/20: RLS, caseload, student
    self-service, notifications, missing-docs).
- **Admin: cohort-wide skill health** on the Stats page — a "Skills across all
  students" card showing per-SAT-domain %-correct across every student's latest
  attempt per test, with a weakest-domain callout (program-level signal). New
  admin-only `system_skill_mastery` RPC (**0128**); `SystemSkillsCard`. Also
  de-duplicated the section-grouping into a shared `groupDomainRows`/`weakestDomain`
  in `fulltest/skills.ts` (course + system surfaces now share it).
- **Admin: per-user activity drawer.** Click a name in the admin All Users table
  to open a snapshot — role, joined, last sign-in, last active, and activity
  counts (courses teaching/enrolled, assignment attempts, full-test runs
  submitted/total). New admin-only `admin_user_overview` RPC (**0125**); reads
  `auth.users.last_sign_in_at` via the SECURITY DEFINER fn. `UserDetailDrawer`
  follows the modal contract (focus trap, Esc/backdrop close). _Verified live._
  Quick actions in the drawer: **Send password reset** (emails the user a reset
  link — unblock a locked-out account) and **Copy user ID** (support/debug).
- **Admin: export full user roster to CSV** from the All Users view (email, name,
  role, joined) — fetches every page, not just the loaded one. Reuses `lib/csv.ts`.
- **Admin "View as" role preview.** An admin can switch the rendered role
  (Admin / Educator / Student) from the account badge menu to see those
  experiences; a persistent amber banner ("Previewing as … — Return to admin
  view") keeps it obvious + reversible from any shell. Single-role model is
  unchanged — this is a view preview of the admin's own surfaces, not
  impersonation of a specific user. New `auth/viewAs.tsx` (tiny external store +
  `ViewAsMenuItems`/`ViewAsBanner`); `AuthGate` branches on the effective role.
  _Verified: admin → View as Student renders the student shell + banner; Return
  restores admin view._
- **Accounts:** granted `admin` to kevyao@gmail.com (already admin); created
  educators kyao@prepmastersedu.com and kteo@prepmastersedu.com (role `teacher`).
- **Class skills focus-areas card on the course Overview** — surfaces the class's
  3 weakest SAT domains with a "View all skills →" link to the Skills tab, so a
  teacher sees the signal without navigating. Self-hides until the class has test
  data. Extracted a shared `useCourseSkillMastery` hook (fetch + section grouping
  + weakest) now used by both the Overview card and the full `ClassSkillsView`
  (no duplicated logic).
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

### Changed
- **Invitation-only access — now enforced server-side.** Public email self-signup
  is disabled (`supabase/config.toml` `[auth.email] enable_signup=false`; flip the
  same toggle in the prod dashboard for the live gate). Educators are provisioned
  by an admin via the new **`admin_create_educator`** RPC (**0129**) + an "Add
  educator" modal on the admin Users page; students onboard via the teacher's
  class/seat code over anonymous sign-in (unaffected). `admin.createUser` + the
  `admin_create_*` SQL RPCs bypass the signup setting, so provisioning + every
  test harness keep working. AuthScreen's "Educator sign-up" tab now shows an
  invitation-only info panel (the self-signup form is removed). Net: educators ←
  admin, students ← teacher code; no account without an invitation.

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
- **`smoke-admin.mjs`** — disposable, self-cleaning coverage for the admin
  management/monitoring RPCs: `admin_user_overview` (activity counts + is_admin
  gate + not_found), `system_skill_mastery` (cohort rollup shape + gate),
  `admin_dashboard_stats`, and `admin_create_educator` (creates a teacher +
  email_taken + non-admin rejected). Wired into `smoke-all` + `npm run
  smoke:admin`. 13/13.
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
