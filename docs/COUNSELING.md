# Counseling courses

A **course type** distinguishes a normal teaching **Class** from a **Counseling**
course (college/career advising). `courses.course_type` ('class' | 'counseling',
migration 0133, default 'class') is chosen at creation in `ClassFormModal` and
shown as a badge in the course header. The type gates which surfaces appear; the
counseling build-out is benchmarked against the MaiaLearning feature reference.

## Type-gated surfaces

| Surface | Where | Shown when |
|---|---|---|
| Portfolio tab | ClassLayout | counseling only |
| Caseload tab | ClassLayout → `CounselingCaseloadView` | counseling only |
| Per-student counseling workspace | `StudentProfilePage` (counselor side) | counseling only |
| Student counseling portal | `StudentCourseView` (student side) | counseling only |
| Skills tab | ClassLayout | Question-Bank access (separate gate, see access.ts) |

## Data model

All tables are **course + student scoped**; RLS routes through the SECURITY
DEFINER helper `is_teacher_of_course(uid, course_id)` (incl. shared co-teachers,
0130) + `is_admin`, plus a student-own-row path where appropriate.

| Table (migration) | Purpose | Student access |
|---|---|---|
| `counseling_profiles` (0134) | digital profile: grad year, GPA, major, goals, activities (jsonb), test scores (jsonb); UNIQUE(course,student) | read + insert + update **own** (0134/0136) |
| `college_applications` (0134, +`documents` jsonb 0137) | unified college **list** (tier, notes) + application **tracker** (plan, deadline, status, submitted) + **document checklist** | read **own** (counselor-managed writes) |
| `counseling_tasks` (0134) | counselor-assigned to-dos (title, due, status) | read **own**; mark done via `complete_counseling_task` RPC (0136) |
| `counseling_meetings` (0134) | dated advising notes | **none** — counselor-private |

## RPCs

- `counseling_caseload(course)` (0135, +docs 0137) — one round-trip course-level
  roll-up: per-student application/task/meeting/doc aggregates + course totals
  (by status, by plan, deadlines-in-14d, docs missing, open/overdue tasks).
  Auth: teacher-of-course or admin.
- `complete_counseling_task(task, done)` (0136) — toggle a task's status; callable
  by the task's own student or a counselor/admin (so students check tasks off
  without broad write rights).

## Notifications

`counseling_tasks` AFTER INSERT → a `'counseling_task'` notification to the
student (trigger `fanout_counseling_task_notification`, 0136), mirroring the
0059 grade-notify pattern. Icon added to `NotificationBell`.

A daily pg_cron worker `run_counseling_deadline_reminders()` (0138, job
`counseling-deadline-reminders`, 01:00 UTC) sends `'reminder'` notifications for
college deadlines 3/1 days out (not submitted) and tasks due tomorrow (open),
deduped per title per 20h. In-app only (no email).

## Counselor-only AI

`supabase/functions/counselor-ai` — essay feedback + rec-letter draft. It
authorizes the caller as a teacher-of-course (owner/shared) or admin (students
rejected even if enrolled) and calls the LLM with a server-side key. The UI is
`CounselorAiCard` on the per-student workspace (teacher side only). **AI is never
exposed to students by design.**

Setup (one-time):
```
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy counselor-ai
# optional: supabase secrets set COUNSELOR_AI_MODEL=claude-sonnet-4-6
```
Until deployed/configured, the card shows a friendly "not set up yet" message.

## Verification

`viewer/scripts/smoke-counseling.mjs` (in `smoke-all`) — RLS (counselor full,
student reads-own, meetings private, unrelated-teacher isolation), the caseload
RPC, student self-service (task complete + profile insert), the task
notification, and the missing-docs metric.

## Known follow-ups

- `clone_course` (0036) doesn't copy `course_type` — duplicating a counseling
  course currently yields a 'class'.
