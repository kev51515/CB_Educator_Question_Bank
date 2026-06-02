# Linda Park — Parent / Guardian Audit

> Surface mostly does not exist. This audit catalogs what's absent, what
> adjacent surfaces leak, and the cheapest v1 to ship.

---

## 1. Persona

**Linda Park, 44.** Mom of Jordan, sophomore. Wants three things:

1. A **weekly digest email**: "What did Jordan do? Is he on track?"
2. A **read-only progress view** she can open from that email — no app install.
3. A way to **message the teacher** when something looks off.

Medium tech comfort. Will not create an account just to "verify her son
exists." Will not tolerate seeing any other student's name, score, or
course content — that would scare her off (FERPA instinct, even if she
can't name the statute).

---

## 2. What Exists Today

**Nothing.** Zero parent-facing surface. One row says it all:

| Probe | Result |
|---|---|
| `user_role` enum values | `('student', 'teacher', 'admin')` — `supabase/migrations/0001_init.sql:15` |
| `grep -r "parent\|guardian\|family"` in `supabase/migrations/` | Zero matches for the *role* sense. Only matches are tree-structure `parent_id` columns (modules, portfolio) |
| `grep -r "guardian"` in `viewer/src/` | Zero matches |
| Auth screen role picker | Two buttons only: `student` / `teacher` — `viewer/src/auth/AuthScreen.tsx:347` |
| Sign-up role API | `SignUpRole = "student" \| "teacher"` — `viewer/src/auth/session.ts:26` |
| Notification kinds | announcement, message, feedback — `supabase/migrations/0029_notifications.sql:30,45,62`. No `weekly_digest`, no `guardian_summary`. |
| Account routes | `/account/settings`, `/account/admin/*` — no `/family`, no `/guardian` — `viewer/src/lib/routes.ts:59-65` |
| Cron jobs | `prune-reminder-log-weekly`, `prune-rate-limits-weekly` — both *housekeeping*, neither sends mail. `supabase/migrations/0031_cron_schedules.sql:48-100` |

The string "parent" appears 100+ times in the codebase, but every
occurrence is either a React parent component reference (e.g.
`viewer/src/inbox/ThreadView.tsx:12`) or a tree-parent FK
(`useStudentPortfolio.ts:34` — `parent_item_id`). Never a human parent.

---

## 3. What's Absent

| Surface Linda needs | Why | Min schema | Complexity |
|---|---|---|---|
| Parent role in `user_role` enum | So a guardian can authenticate as themselves, not as Jordan | `ALTER TYPE user_role ADD VALUE 'guardian'` | **S** |
| `guardians(parent_id, student_id, relationship, verified_at)` link table | Lets RLS scope a guardian to *only* their child | New table + 3-4 RLS policies | **M** |
| Weekly digest email (Linda's #1 ask) | She won't log in; needs push, not pull | None for v1 (use existing data); `digest_log` for v2 | **S (v1) / M (v2)** |
| Read-only "Jordan's Progress" page (`/family/:studentId/progress`) | Verify "is he studying?" | None for v1 (signed magic-link route); RLS for v2 | **M** |
| Guardian → teacher message channel | The "message the teacher" ask | None — the inbox table already supports staff-as-recipient (`supabase/migrations/0026_inbox.sql`); needs a guardian-side composer UI | **M** |
| Account-linking flow ("I am Jordan's mom — verify me") | Prevents random adults claiming kids | Confirmation token on `guardians` row + teacher-approval RPC | **L** |
| Parent-side privacy policy / FERPA consent capture | Required before ANY data flows to a non-student | New `consents` table or column | **S** |
| Email-template + send infrastructure for digests | The digest itself | Either Supabase Edge Function + Resend/SES, or pg_cron + pg_net | **M** |
| File paths that *would* house this (none exist today): `viewer/src/family/`, `viewer/src/auth/GuardianShell.tsx`, `viewer/src/notifications/digest/`, `supabase/migrations/0048_guardians.sql` | All missing | — | — |

---

## 4. Privacy / FERPA Risk Assessment

The good news: today's RLS is strict enough that **Linda can't accidentally
see anything**, because she has no account. The risks all appear the moment
a parent surface gets bolted on.

- **Shared-credential leak (today's reality).** A parent who "verifies" by
  logging in *as Jordan* gets full student powers: discussion posts as
  Jordan (`viewer/src/teacher/CourseDiscussions.tsx`), assignment
  submissions as Jordan, inbox-as-Jordan
  (`viewer/src/inbox/ThreadView.tsx`). Any v1 *must* steer parents away
  from this path — including a teacher-facing line in the onboarding
  email: "do not share your child's password."

- **Cross-course bleed risk.** The gradebook view
  (`viewer/src/teacher/CourseGradebook.tsx:1-10`) renders a
  *full class roster* — every enrolled student's name + scores. If a v1
  "guardian view" naively reused `CourseGradebook` scoped to Jordan's
  course, Linda would see her son's classmates' grades. RLS *would*
  enforce this on the API, but the React component still expects a list.
  **Build a separate read-only `<GuardianProgress />`** — do not reuse
  the gradebook component.

- **Course-list bleed risk.** `student_skill_stats`
  (`supabase/migrations/0024_mastery_predictions.sql:26`) and
  `my_skill_mastery()` (line 49) are scoped via `auth.uid()`. A guardian
  RPC would need a sibling `guardian_skill_mastery(student_uuid)` that
  checks `guardians.parent_id = auth.uid() AND student_id = $1` first.
  Without that, the easiest implementation (impersonation) reintroduces
  the shared-credential leak above.

- **Discussion / announcement content.** Course discussions
  (`viewer/src/teacher/CourseDiscussions.tsx`) and announcements
  (`viewer/src/teacher/CourseAnnouncements.tsx`) contain other students'
  posts. A guardian view must **never** surface these — only Jordan's
  *own* activity (his posts, his assignment scores, his attendance).
  This implies a deliberately narrower data contract than "show the
  student's view."

- **Public route reads safely today.** When Linda lands unauth'd on
  `/courses/AB12CD/modules`, `PublicRoutes` (`viewer/src/auth/AuthGate.tsx:158`)
  bounces her to `/signin`. She sees the auth screen, nothing more.
  The short-code in the URL is the only thing she "leaks" to herself,
  and the short-code (per `0038_course_short_codes.sql`) is the
  *intended* shareable identifier. **This is safe.**

- **Notification fanout has no parent kind.** Today
  `fanout_announcement_notifications()`
  (`supabase/migrations/0029_notifications.sql:30`) writes only to
  enrolled students. Bolting on a parent fanout means *every* trigger
  function gains a guardian-aware branch. High blast radius — defer to v2.

---

## 5. MVP Parent Surface

**v1 — Zero schema changes (ship this week).** Add a teacher-side button on
the gradebook (`viewer/src/teacher/CourseGradebook.tsx` already has an
"Export CSV" action at line 517) called **"Email weekly summary."** It opens
a modal with: (a) a textarea of comma-separated parent emails per student
(stored in `course_memberships.notes` or a new
`memberships.guardian_emails text[]` column — even that's S complexity),
(b) a generated plain-text digest per student computed from
`student_skill_stats` (`0024_mastery_predictions.sql:26`) and
`assignment_attempts` over the last 7 days. The email contains *only*
numbers and skill names — never another student's content. It links back to
a **signed, read-only magic-link page** at `/family/<jwt>` that re-renders
the same digest in a browser, expires in 7 days, and requires no account.
This sidesteps the entire RLS-policy problem because the only DB access
happens server-side under the teacher's role at digest-generation time. The
teacher ships it manually each Sunday for now; pg_cron can take over once
it's proven.

**v2 — Add the `guardians` table.** Once parents are clicking digest
links and asking for more, introduce `ALTER TYPE user_role ADD VALUE
'guardian'` plus a `guardians(parent_id uuid, student_id uuid,
verified_at, verified_by_teacher uuid)` link table. RLS policies on
`assignment_attempts`, `course_memberships`, `student_skill_stats`, and a
new `guardian_skill_mastery(uuid)` RPC use `EXISTS (SELECT 1 FROM guardians
WHERE parent_id = auth.uid() AND student_id = $1 AND verified_at IS NOT
NULL)` as the guard — wrapped in a SECURITY DEFINER helper to dodge the
recursion bug that bit migrations 0008 and 0013 (per `CLAUDE.md` backend
rules). A new `viewer/src/auth/GuardianShell.tsx` mounts a deliberately
sparse route tree: `/family` (list of linked students), `/family/:id`
(progress + a "Message teacher" button that pre-fills the inbox composer
with the teacher of Jordan's primary course). Guardians never see
`/courses`, `/dashboard`, `/inbox` as a sender to anyone but their own
child's teachers, and never see other students. Notifications fan out via
a new `'digest'` kind with a daily-or-weekly preference stored in
`profiles.digest_cadence`.

---

## 6. Would Linda Recommend This Today?

**No — and she wouldn't even know she should.** The product is great for
the teacher and reasonable for Jordan, but it is *invisible* to Linda. Her
friend's question will be: "Can I see what my kid is doing?" and the honest
answer is "Only by looking over his shoulder, or by asking him to log in
and show you." That's the same answer she'd get from a free Google Doc —
which means the SAT-prep moat (skill mastery, score prediction, weak-skill
focus) never reaches the person writing the check. The v1 above
(teacher-driven weekly digest, zero schema change) is one afternoon of
work and would flip Linda from "I have no idea what I'm paying for" to "I
got a clean Sunday-night summary and I can see he did 47 questions at 72%
accuracy." That single email is probably worth more in word-of-mouth
referrals than any other feature on the roadmap.

---

**Word count: ~1,180**
