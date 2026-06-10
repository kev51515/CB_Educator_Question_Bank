# User Guide

This is the operations manual for the people running the LMS day-to-day. It is opinionated, concrete, and assumes you can edit a JSON file, run a `psql` command, and click around the Supabase dashboard. It does **not** assume you remember the architecture in detail.

For deployment, see [DEPLOYMENT.md](./DEPLOYMENT.md). For what is not built yet, see [LMS_ROADMAP.md](./LMS_ROADMAP.md). This guide is about what to **do**.

---

## 1. The first 30 minutes (one-time setup)

Run through this once, in order, before you invite anyone.

1. **Clone and install.**
   ```bash
   git clone <repo>
   cd CB_Educator_Question_Bank/viewer
   npm install
   ```

2. **Check your env file.** Confirm `viewer/.env.local` exists and contains:
   ```bash
   VITE_SUPABASE_URL=https://ljdofwovsyaqydcbohhd.supabase.co
   VITE_SUPABASE_ANON_KEY=<your anon key>
   ```
   The anon key is fine to commit-adjacent (it is meant for browsers). It is **not** a secret. The service-role key is — never put that in `.env.local`.

3. **Anonymous auth.** *(done — already configured)* Migration `0032` plus a one-time Management API call already enabled anonymous sign-ins on the cloud project, which powers the quick-start QR flow. If you ever clone to a fresh Supabase project, toggle **Authentication → Sign In / Up → Allow anonymous sign-ins** ON manually.

4. **Email confirmation + SMTP.** *(done — already configured)* Resend SMTP is wired with sender `onboarding@resend.dev` (Resend's placeholder — swap in a verified domain before real launch or some inboxes mark it spam). Confirmation can stay ON.
   - **For early dev work:** turn email confirmation **OFF** so you can rapidly create test accounts. Flip it back on before real students arrive.

5. **Bootstrap the first admin.** There is no admin role assigned automatically — you have to promote yourself once.
   - Open the app, click **Sign up**, create an account like `kevin@yourdomain.com`. Confirm the email if confirmation is on.
   - In the Supabase dashboard go to **Authentication → Users**, find your row, copy the UUID.
   - Open **SQL Editor** and run:
     ```sql
     select public.bootstrap_first_admin('00000000-0000-0000-0000-000000000000');
     ```
     Substitute your UUID. This RPC will refuse to run a second time once an admin exists, so it is safe to leave around.

6. **Mint a teacher invite code.** Sign in as your now-admin account. You will see an **Admin** area with tabs (Overview, Classes, Users, Invites). Go to **Invites**, click **Mint code**, set max uses (`1` is fine for a co-teacher), copy the code.

7. **Co-teacher signs up.** Send them the code. They go to the app, **Sign up**, paste the code into the teacher-invite field on the sign-up form. The moment they confirm their email, they land as a teacher. Verify by checking **Admin → Users** that their role reads `teacher`.

8. **Create your first class.** Either teacher goes to the **Teacher Console**, clicks **New class**, sets a name, saves. The class detail view shows the **join code** and a QR. Copy the join code or share the QR URL.

9. **Bring students in.** Either:
   - They sign up normally and click **Join a class** on their dashboard with the code; or
   - They scan the QR and hit the quick-start path, which mints an anonymous account and auto-enrolls them. Anonymous accounts work fine for taking assignments, but encourage them to upgrade (set email + password) so they can recover access from a new device. The yellow banner in the student UI prompts them.

10. **Go live.**
    - Local dev: `npm run dev` in `viewer/`.
    - Deployed: push to `main`, which Cloudflare Pages auto-builds. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the build settings.

You are now ready to write assignments.

---

## 2. Daily workflows

### Admin (you)

This role is for plumbing, not teaching. Most days you will not touch it.

- **Mint a teacher invite:** Admin → Invites → Mint code → share. Codes can be one-shot or multi-use; default to one-shot to avoid leakage.
- **Revoke a code:** Admin → Invites → click the code's row → Revoke. Already-redeemed users keep their role; only future redemptions are blocked.
- **Check overall stats:** Admin → Overview. Watch student counts, attempts submitted, and any error spikes.
- **Promote / demote a user:** Admin → Users → click row → change role. You cannot demote yourself (the RPC blocks it to prevent lockout). Demoting a teacher to student does **not** delete their classes — reassign or archive first.
- **Hard-delete a user:** Admin → Users → click row → Delete. This cascades to their profile, class memberships, and attempts. Irreversible. Use sparingly.

### Teacher (you and your spouse, mostly)

This is where the actual work happens.

- **Create a class:** Teacher Console → **New class** → name + description → save. Copy the join code or QR from the class detail page.
- **Create an assignment:** Teacher Console → click a class → **Manage assignments** → **Create assignment** → choose source (a question set or aspect), question count, time limit, due date → save. Students see it appear immediately on their dashboard.
- **See who has done it:** Click into the assignment → see the roster with status (not started / in progress / submitted) and score. Click any submitted row to drill into that student's exact answers, time per question, and what they got wrong.
- **Archive an old class:** Class detail → **Edit class** → check **Archived** → save. Archived classes are hidden from the join-code lookup, so the code stops working immediately. Roster and past attempts are preserved.
- **Edit a class:** Same modal. The join code does **not** regenerate when you edit other fields — it is stable unless you explicitly change it via SQL.

### Student

The simplest persona. Two paths in.

- **Sign up normally** with email + password, then click **Join a class** → paste code.
- **Scan a class QR** → anonymous session minted → auto-enrolled. The upgrade banner nags them to set email + password.
- **Take an assignment:** Dashboard → Assignments tab → click an assignment → AssignmentRunner walks through questions one at a time with a timer if one is set. Answers persist as they go; submit when done.
- **Review past work:** Assignments tab → click a submitted attempt → see per-question feedback, correct answers, and explanations.
- **Join another class:** **My Classes** panel → **Join class** → paste new code.

### Course features (teacher + student share these)

These tabs live inside each course (Teacher Console → click course → tab strip). Students see the same tabs in read/participate mode.

- **Modules** — Canvas-style ordered "Day 1 / Day 2" buckets. Modules tab → **Add module** → drop assignments, materials, or links in with **Add item**. The lesson-plan order students walk through.
- **Portfolio** — teacher's checklist of college-app deliverables (essays, CV, recs). Portfolio tab → **Add item** → set due date. Student fills in via `PortfolioSubmissionForm`; teacher leaves feedback inline.
- **Discussions** — per-course forum. Discussions tab → **New topic**. Replies in `DiscussionTopicView`. Pin/lock on the topic kebab.
- **Materials** — file/link uploads via Supabase Storage. Materials tab → **Add material** → upload PDF or paste URL. Students see them under **Course Materials**.
- **Announcements** — per-course broadcast. Announcements tab → **New announcement**. Fans out a notification to every enrolled student.
- **Gradebook** — Gradebook tab → students × assignments matrix using the `assignment_best_attempts` view. CSV export from toolbar.
- **Duplicate course / templates** — course kebab → **Duplicate course** clones modules + assignments. Mark a course as **Template** in edit; the courses list **Templates** filter exposes a **Create from template** action.

### Cross-course features

- **Inbox** (sidebar ✉) — direct messages between users in your classes. **New thread** → pick recipient → write. Each new message fires a notification.
- **Notifications bell** (top bar) — fans out announcements, discussion replies, due reminders, messages, portfolio feedback. Click to mark read; click an item to jump to source.
- **Calendar** (sidebar 📅) — month/week view of assignment due dates, portfolio due dates, announcements. Teacher sees everything they own; student sees their enrolled courses.

### Assignment options worth knowing

When creating an assignment (`AssignmentFormModal`):
- **Multiple attempts** — set max attempts (default 1). Gradebook uses `assignment_best_attempts` so highest score sticks.
- **Late penalty** — per-day percent deduction. Effective score = `apply_late_penalty(raw_score, submitted_at, due_at)`.

### Bulk roster import

ClassRoster page → **Import CSV** (`BulkRosterModal`). Format: `email,display_name`. Mints/matches accounts and enrolls. For 30 students send the QR; for 300, this is the path.

### Admin → Audit

Account → Admin → **Audit**. Append-only ledger of sensitive actions (role changes, course deletes, invite mints, user deletes). Filter by actor / action / target. Screenshot this when a parent asks "who changed my kid's grade".

### Student-side enhancements

- **Skill mastery panel** — `SkillHeatmap` shows per-skill mastery (migration `0024`), updating after each submitted attempt. It's **read-only insight** in the controlled-access model: students see where they stand but can't self-assign practice (the old `ScorePrediction` SAT-band card and the "Practice this skill" drill links were removed 2026-06-03 — the prediction's low-data band misled students, and `/practice` isn't reachable for students).
- **Focus weak skills toggle** — `WeakSkillsToggle` pill filters to skills below mastery threshold. Lives in the legacy question bank, which is **staff-only** now; not a student surface.
- **GDPR data export** — Account Settings → **Export my data**. JSON dump of profile + attempts + portfolio + messages.

---

## 3. Common questions / troubleshooting

**A student can't sign up.**
Almost always email confirmation + Supabase's default SMTP rate limit. Confirm by checking **Authentication → Logs** for rate-limit warnings. Fix permanently by wiring Resend or SendGrid under **Authentication → Settings → SMTP**. To unblock immediately, manually confirm the email:
```sql
update auth.users set email_confirmed_at = now() where email = 'student@example.com';
```

**A student forgot their password.**
Sign-in screen → **Forgot password?** → they enter their email → click the magic link → set a new one. If the student is **anonymous** (quick-started via QR), they have no email to recover from. Get them to use **Account settings** → **Upgrade account** to attach an email + password first. After that, recovery works normally.

**A teacher can't see their class anymore.**
Almost certainly archived. The Teacher Console hides archived classes by default. Look in the archived view, click the class, edit, uncheck **Archived**, save. The join code becomes live again.

**The join code stopped working.**
Either the class was archived (most common), or the join code itself was changed in the database. Open the class as the teacher, copy the **current** join code from the class detail page, reshare it. Old printed QR codes pointing at an obsolete code will not work — reprint.

**A student took an assignment but it isn't showing in the teacher's view.**
They probably did not submit. In-progress attempts (where `submitted_at IS NULL`) do not show up in the teacher's roster view — only submissions do. Ask the student to finish and click **Submit**. If they refuse or abandoned, you can manually check:
```sql
select student_id, started_at, submitted_at
from assignment_attempts
where assignment_id = '<assignment-uuid>';
```

**Anonymous accounts are piling up.**
The `cleanup-anon-users` edge function runs nightly at 03:00 UTC via pg_cron and deletes anon users older than 14 days. If you need to run it manually:
```sql
delete from auth.users
where is_anonymous = true
  and created_at < now() - interval '14 days';
```

**Student didn't get a notification / reminder email.**
1. Confirm the cron jobs are scheduled:
   ```sql
   select jobname, schedule, active from cron.job order by jobname;
   ```
   Expect `assignment-due-reminders-hourly`, `cleanup-anon-users-daily`, `prune-reminder-log-weekly`, `prune-rate-limits-weekly`.
2. Confirm the function fired and Resend accepted it: dashboard → **Resend → Logs** for the last hour. If Resend shows nothing, the function didn't run (check next item) or rejected the recipient.
3. Confirm pg_cron actually hit the function:
   ```sql
   select * from net.http_request_queue order by id desc limit 20;
   select * from net._http_response order by id desc limit 20;
   ```

**Cron job not firing.**
- `select * from cron.job` — confirm row exists and `active = true`.
- `select * from cron.job_run_details order by start_time desc limit 20;` — confirm recent runs and their status.
- If empty: pg_cron or pg_net extension was disabled. Re-enable in **Database → Extensions** and re-apply migration `0031`.
- If status = failed: usually the `CRON_TOKEN` / `CLEANUP_TOKEN` secret was rotated and didn't reach the edge function env. Reset via `supabase secrets set --project-ref ljdofwovsyaqydcbohhd CRON_TOKEN=... CLEANUP_TOKEN=...`.

**Reset a forgotten admin password.**
Use the Supabase dashboard, not the app. **Authentication → Users → your row → ⋮ → Send password recovery**. Or directly: **⋮ → Reset password** and set a new one inline. Do not bypass with SQL — Supabase hashes server-side.

**The mock test crashes on load.**
The mock test runner reads `viewer/public/data/sat-questions.json`. If you re-ran scraper scripts and forgot to copy the output, the file may be stale or missing. Restore it from git (`git checkout viewer/public/data/sat-questions.json`) or re-run whichever data sync step you skipped.

**The app shows a blank screen.**
Three usual suspects, check in order:
1. Browser console for a JS error. If `import.meta.env.VITE_SUPABASE_URL` is undefined, your `.env.local` is missing or you did not restart `npm run dev` after editing it.
2. Supabase project paused. The free tier pauses after 7 days of zero activity. Hit the project in the dashboard and unpause it; the app comes back automatically.
3. Service worker stuck on an old build. Hard-refresh (Cmd+Shift+R) or unregister it via DevTools → Application → Service Workers.

---

## 4. Rotating secrets

The only true secrets in this system are the database password and the `service_role` key. Anon key + URL are public by design.

Rotate when:
- You offboard a collaborator who had dashboard access.
- You suspect a leak (committed `.env` by accident, screenshot in chat, anything).
- Every quarter, as hygiene.

**DB password:** Dashboard → **Project Settings → Database → Reset database password**. After resetting, re-link the CLI:
```bash
supabase link --project-ref ljdofwovsyaqydcbohhd -p '<new password>'
```
If you have any scripts using the connection string, update them.

**Service role key:** Dashboard → **Project Settings → API → Roll `service_role` key**. Anything using the old key (edge functions, server scripts) stops working immediately — update them right after. The frontend does not use this key, so users feel nothing.

**Anon key + project URL:** Not secrets. Do not bother rotating. They live in `viewer/.env.local` and are baked into the browser bundle on deploy.

---

## 5. Backup and restore

If you have real students, get **Supabase Pro** ($25/mo). It gives you daily point-in-time backups handled automatically. Below Pro, you are doing it yourself.

**Manual backup (free tier):**
```bash
pg_dump "postgresql://postgres:<pwd>@db.ljdofwovsyaqydcbohhd.supabase.co:5432/postgres" \
  --no-owner --no-acl -Fc -f backup_$(date +%Y%m%d).dump
```
Run nightly via cron on any machine that stays on. Keep at least 7 dailies + 4 weeklies.

**Restore to a fresh project:**
1. Spin up a new Supabase project.
2. Apply migrations: `supabase db push` from this repo.
3. Restore data:
   ```bash
   pg_restore --no-owner --no-acl --data-only -d "<new connection string>" backup_YYYYMMDD.dump
   ```
4. The `auth.users` table is in the same database, so `pg_dump` captures it. But Supabase's hashing scheme is project-specific — passwords from a backup will only work in the project they were backed up from. For users to log in to the *new* project, they must reset passwords. Communicate this in advance if disaster strikes.

Your git repo (this one) is also a backup. The migrations under `supabase/migrations/`, the question JSON, and the viewer code are everything you need to rebuild the app from scratch — the dump just gets you the user data.

---

## 6. Monitoring and what to watch

You do not need a NOC. A 60-second daily glance is enough.

- **Supabase → Reports → Database:** look at slow query list. If something appears repeatedly above 500ms, file a ticket against it.
- **Supabase → Authentication → Users:** scroll to most recent. Look for anonymous pileup, weird email patterns (`asdf@asdf.com` × 20 = a student is testing your sign-up flow, or a bot found you).
- **Supabase → Logs:** filter to "error" level. Expect zero on a normal day.
- **Cloudflare Pages dashboard:** deploy status, build logs if you just shipped.
- **Frontend errors:** not wired up yet. When you go beyond a handful of students, install Sentry (`@sentry/react`) or PostHog and pipe browser errors out. See the roadmap.

---

## 7. When to call for help

A rough triage:

- **"DB column 'X' missing" or "function 'X' does not exist":** a migration did not run. Run `supabase migration list --linked`, see what is missing, then `supabase db push`. If push complains about drift, resolve it before pushing again.
- **"Component not rendering" / TypeScript noise:** run `npm run build` and read the error. The dev server hides some compilation errors; the build does not.
- **"Cloud DB returned 500":** check `status.supabase.com` first. Real outages happen, and you cannot fix them.
- **"RLS policy denies what it shouldn't":** in SQL Editor, temporarily impersonate the user. Wrap your query as:
  ```sql
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"<user uuid>"}';
  select * from <table>;
  ```
  This runs under that user's JWT so RLS evaluates exactly as it would for them.

---

## 8. Common SQL recipes

Copy-paste-ready. Run in **SQL Editor** unless noted.

```sql
-- Promote anyone to admin (you must already be an admin, or run as service role).
update profiles set role = 'admin' where email = 'someone@example.com';

-- Promote a student to teacher without an invite code.
update profiles set role = 'teacher' where email = 'teacher@example.com';

-- Find anonymous users older than 14 days (candidates for cleanup).
select id, created_at
from auth.users
where is_anonymous = true
  and created_at < now() - interval '14 days';

-- Hard-delete a class and everything under it (cascades to assignments,
-- memberships, attempts). No undo.
delete from classes where id = '<class-uuid>';

-- Manually confirm an email (useful when SMTP is rate-limited).
update auth.users set email_confirmed_at = now() where email = 'student@example.com';

-- Per-student per-class submitted attempt counts. Good for end-of-week glance.
select p.display_name, c.name, count(*) as attempts
from assignment_attempts a
join profiles p   on p.id = a.student_id
join assignments asg on asg.id = a.assignment_id
join classes c    on c.id = asg.class_id
where a.submitted_at is not null
group by p.display_name, c.name
order by attempts desc;

-- All in-progress attempts older than 24h (probably abandoned).
select a.id, p.display_name, asg.title, a.started_at
from assignment_attempts a
join profiles p on p.id = a.student_id
join assignments asg on asg.id = a.assignment_id
where a.submitted_at is null
  and a.started_at < now() - interval '24 hours';

-- Best attempt per student per assignment (this is what the gradebook reads).
select * from assignment_best_attempts
where assignment_id = '<assignment-uuid>'
order by score_percent desc;

-- Recent sensitive admin/teacher actions (last 7 days).
select created_at, actor_id, action, target_kind, target_id, details
from audit_events
where created_at > now() - interval '7 days'
order by created_at desc
limit 100;

-- All notifications for a specific user (unread first).
select id, kind, title, body, link, read_at, created_at
from notifications
where recipient_id = '<user-uuid>'
order by read_at nulls first, created_at desc;
```

---

## 9. Known limitations (today)

The app works, but be aware of these rough edges before promising parents anything:

- **Single-pool snapshot model.** Assignment questions are snapshotted at attempt-start (migration `0014`), but the question pool itself is shared across all attempts of an assignment — re-randomization per attempt isn't supported. If you publish, edit, then re-publish, in-flight attempts keep their snapshot.
- **KaTeX bundle size.** The math renderer adds ~250KB gzipped to the initial bundle. Acceptable for desktop; noticeable on a 3G phone.
- **No PWA / offline mode.** Students need a live connection to take an assignment. Closing the tab mid-attempt does not lose progress (answers persist server-side), but they cannot resume offline.
- **No rubrics.** Portfolio feedback is freeform text only; no structured criterion grids.
- **No peer review.** Discussions support replies but not blind/double-blind peer-grading workflows.
- **No real-time / proctored class mode.** Mock tests are timed but unsupervised.
- **No frontend error monitoring** until you wire Sentry or PostHog.

See [LMS_ROADMAP.md](./LMS_ROADMAP.md) for the prioritized plan and [SESSION_REPORT.md](./SESSION_REPORT.md) for the full feature list shipped in this round.

---

## 10. Stuck? Try this decision tree

**Question 1: Is the app loading at all?**
- No → check console for errors → check `.env.local` → check Supabase status. See section 3.
- Yes → continue.

**Question 2: Can you sign in?**
- No → password reset via the dashboard (section 4 / 3). If you cannot reach the dashboard, you have bigger problems — call Supabase support.
- Yes → continue.

**Question 3: Is the thing that broke a specific student / class / assignment?**
- Yes → use the SQL recipes in section 8 to inspect that row directly. Most "the app is broken" reports are actually one bad row.
- No, it's everyone → check Supabase Reports for a database-wide issue, check the latest deploy, roll back if needed.

If the decision tree did not resolve it: open the Supabase logs for the last 15 minutes, copy any errors, and ask for help with that in hand.

---

## Appendix: paths cheat sheet

| Thing | Where |
| --- | --- |
| Frontend code | `viewer/src/` |
| Env vars | `viewer/.env.local` |
| Migrations | `supabase/migrations/` |
| Mock test data | `viewer/public/data/sat-questions.json` |
| Deployment notes | `docs/DEPLOYMENT.md` |
| Roadmap | `docs/LMS_ROADMAP.md` |
| This guide | `docs/USER_GUIDE.md` |
