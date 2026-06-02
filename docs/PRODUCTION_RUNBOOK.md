# Production Runbook

The step-by-step playbook for taking this LMS live and keeping it running. Audience: the two of you operating the business. Read this *after* [DEPLOYMENT.md](./DEPLOYMENT.md) (which explains *why* the architecture looks the way it does) and alongside [USER_GUIDE.md](./USER_GUIDE.md) (which covers daily teacher/student workflows).

This document is opinionated on purpose. Decision fatigue is the enemy when you are also teaching classes and running a business. Where a choice exists, we pick one and tell you why.

Related references — do not re-read; just keep them open in tabs:

- [DEPLOYMENT.md](./DEPLOYMENT.md) — architectural overview, vendor comparison, cost projections at scale
- [USER_GUIDE.md](./USER_GUIDE.md) — operator daily workflows
- [SMTP_SETUP.md](./SMTP_SETUP.md) — Resend wiring, DNS, deliverability troubleshooting
- [`supabase/functions/cleanup-anon-users/README.md`](../supabase/functions/cleanup-anon-users/README.md) — anonymous-user GC function

---

## 1. Going from dev to production: a 90-minute checklist

Do these in order, top to bottom, one sitting. The whole thing is ~90 minutes if nothing goes sideways.

1. **Buy a domain** at Cloudflare Registrar (at-cost pricing, free DNS, no upsell). Why: confirmation emails MUST come from a domain you control or Gmail/Outlook will silently spam-folder them.
2. **Create a fresh Supabase Cloud project for production** at https://supabase.com/dashboard. Pick the region closest to your students; **region is not changeable**. Why: never share a Supabase project between dev and prod — one bad migration would corrupt real student records.
3. **Save the DB password** to your password manager (1Password, Bitwarden). Why: you will need it for `supabase db push` and for `pg_dump` backups, and Supabase will not show it again after creation.
4. **Push migrations to prod**: `cd /Users/kevin/coding/CB_Educator_Question_Bank && supabase login && supabase link --project-ref <prod-ref> && supabase db push`. Why: this is how the schema gets there; the prod DB starts empty.
5. **Verify migrations applied**: in Supabase SQL Editor, run `\dt` (or `select tablename from pg_tables where schemaname='public';`). You should see `profiles`, `classes`, `class_memberships`, `teacher_invite_codes`, `memberships`, `attempts`. Why: catches a half-applied migration before students hit it.
6. **Enable email auth + email confirmation**: Authentication → Providers → Email → on; Authentication → Sign In / Up → Confirm email → on. Why: without confirmation, signups are an account-takeover vector.
7. **Enable anonymous auth (optional, recommended)**: Authentication → Providers → Anonymous → on. Why: lets prospects try a mock test without an account, then convert. The cleanup function below garbage-collects them.
8. **Set Site URL and Redirect URLs** at Authentication → URL Configuration. Site URL = your production domain (e.g. `https://satprep.example.com`). Redirect URLs allowlist must include the production domain, any preview deploys (`https://*.vercel.app`), and `http://localhost:5173` for dev. Why: confirmation emails embed Site URL — if it is wrong, every confirmation link is broken.
9. **Set up Resend + custom SMTP** per [SMTP_SETUP.md](./SMTP_SETUP.md). Why: the Supabase default SMTP relay silently drops anything past 4 emails/hour. You will hit this in your first class.
10. **Verify the domain DNS in Resend** (SPF, DKIM x3, DMARC). Why: without DKIM, Gmail dumps you in spam.
11. **Send a test email from the Supabase SMTP page**, then sign up a real test address and confirm the link works end-to-end. Why: catches the most common launch-day failure (the "I never got the email" report from student #1).
12. **Deploy the frontend to Vercel** per Section 2 below. Why: Vite + Vercel is zero-config, free, and has the slickest preview deploys.
13. **Add `vercel.json` with the SPA rewrite** per Section 2. Why: without it, deep-linking to `/courses/abc` returns 404 on refresh.
14. **Attach the custom domain in Vercel** per Section 3. Why: students should never see a `*.vercel.app` URL.
15. **Set environment variables in Vercel** per Section 2 and redeploy. Why: the build inlines `VITE_*` env vars; missing values produce a broken app that loads but can't reach Supabase.
16. **Deploy the cleanup edge function** per Section 4. Why: anonymous users will accumulate forever otherwise — by month three you'll have 10k orphan rows.
17. **Schedule the cleanup cron job** per Section 4. Why: deployed-but-unscheduled functions don't actually run.
18. **Run the prod smoke test** per Section 7. Why: this is the gate. 13 PASS + 1 SKIP or you do not open the door.
19. **Wire up Sentry**: create a free Sentry project (React platform), copy the DSN into Vercel as `VITE_SENTRY_DSN`, redeploy. Why: students will not report errors clearly. Sentry will tell you what broke and on which line.
20. **Wire up PostHog**: create a free PostHog project, copy the key and host into Vercel as `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST`, redeploy. Why: you need a signup-to-first-attempt funnel before you can tell whether the product works.
21. **Bootstrap the first admin** per [DEPLOYMENT.md § First admin bootstrap](./DEPLOYMENT.md). Why: the app ships with no default admin; without this step you cannot mint teacher invite codes.
22. **Create one real student test account** and run through the daily workflows in [USER_GUIDE.md](./USER_GUIDE.md) start to finish. Why: smoke tests pass with synthetic data; humans find the broken things.
23. **Run a one-class soft launch** with 1–2 trusted students before the first real cohort. See Section 8.

---

## 2. Vercel deployment

The viewer is a static SPA. Vercel is the path of least resistance.

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Root Directory | `viewer` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |
| Node version | 22 (Vercel default; `viewer/package.json` does not pin an `engines` range, so accept the default) |

### Environment variables

Set all of these in Vercel → Project → Settings → Environment Variables. Scope to **Production, Preview, and Development** unless noted.

| Variable | Source | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL | Public; safe to ship to browser |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → `anon` key | Public; RLS is what protects data |
| `VITE_SENTRY_DSN` | Sentry → Settings → Projects → \<project\> → Client Keys | Optional in dev; required in prod |
| `VITE_POSTHOG_KEY` | PostHog → Project Settings → Project API Key | Optional in dev; required in prod |
| `VITE_POSTHOG_HOST` | Usually `https://us.i.posthog.com` (US) or `https://eu.i.posthog.com` (EU) | Match the region you signed up in |

`SUPABASE_SERVICE_ROLE_KEY` does **not** belong in Vercel — anything `VITE_*` ends up in the JS bundle. The service role key is only ever in your local shell or auto-injected into edge functions.

### SPA fallback — CRITICAL

React Router uses client-side routing. Without this rewrite, `https://yourdomain/courses/abc` returns 404 on refresh because Vercel looks for `/courses/abc.html`, which doesn't exist.

Create `vercel.json` at the **repo root** (not inside `viewer/`):

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The rewrite serves `index.html` for any path; React Router then takes over and renders the right route. Verify against current Vercel docs (`vercel.com/docs/projects/project-configuration`) before launch in case the schema has shifted.

Test after deploying: open `https://yourdomain/courses/anything-fake` directly. You should see the app's 404 page (rendered by React Router), not Vercel's 404 page. If you see Vercel's 404, the rewrite is missing or misplaced.

---

## 3. Custom domain on Vercel

1. Vercel → Project → Settings → Domains → Add → enter your domain.
2. Vercel shows the DNS records to add. Two cases:
   - **Apex domain** (`satprep.example.com`): add an A record pointing to `76.76.21.21` (Vercel's anycast IP — verify against current docs).
   - **Subdomain**: add a CNAME pointing to `cname.vercel-dns.com`.
3. Add the records at your registrar's DNS panel. Cloudflare Registrar: DNS tab → Add record. Set the proxy status to **DNS only** (gray cloud) initially — Vercel handles HTTPS, and the orange-cloud proxy will fight it.
4. Wait ~5 minutes for propagation. Vercel auto-provisions a Let's Encrypt cert once DNS resolves.
5. **Update Supabase**: Authentication → URL Configuration → Site URL = the new domain. Redirect URLs → include the new domain.
6. **Re-test signup**: brand-new email, check that the confirmation link points to the new domain and works on click.

If step 6 fails, your Site URL is still pointing at Vercel's default URL or localhost. Fix and re-test before sending a single real invite.

---

## 4. Edge function deploy

The repo ships one edge function: `cleanup-anon-users`. The full reference is in [its README](../supabase/functions/cleanup-anon-users/README.md). Operational steps:

```bash
# Deploy
supabase functions deploy cleanup-anon-users --project-ref <prod-ref>

# Configure secrets
supabase secrets set CLEANUP_DAYS=14 \
  CLEANUP_TOKEN=$(openssl rand -hex 32) \
  --project-ref <prod-ref>

# Save the generated CLEANUP_TOKEN to your password manager.
```

Schedule with pg_cron (Dashboard → Database → Extensions: enable `pg_cron` and `pg_net` first):

```sql
select cron.schedule(
  'cleanup-anon-users-daily',
  '0 3 * * *',  -- 03:00 UTC daily; pick a low-traffic hour for your region
  $$
  select net.http_post(
    url := 'https://<prod-ref>.supabase.co/functions/v1/cleanup-anon-users',
    headers := '{"Authorization": "Bearer <CLEANUP_TOKEN>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

After scheduling, verify a run with a dry-run invocation (see the function's README). Check `cron.job_run_details` after 24 hours to confirm the schedule fired.

---

## 5. Secret rotation

Rotate any credential that may have been seen by someone who no longer has access (contractor offboard, laptop loss, suspected leak). Below are the moving parts and what to do.

### Supabase DB password

Dashboard → Settings → Database → Reset database password. Then locally:

```bash
supabase link --project-ref <prod-ref> -p <new-password>
```

Update any backup scripts that hard-code the connection string. **There are none in the repo today**, but your local `pg_dump` cron will need it.

### Supabase service-role key

Dashboard → Settings → API → Roll service_role key. The edge function reads this from auto-injected `SUPABASE_SERVICE_ROLE_KEY` and picks up the new value on next invocation — no manual step. If you ever add a server-side script that hard-codes it, you'll need to redeploy that script.

### Supabase anon key

Only rotate if leaked AND you believe RLS was misconfigured at the same time (a leaked anon key with sound RLS is not a meaningful incident — that's what RLS exists for). To rotate: Dashboard → Settings → API → Roll anon key, then update `VITE_SUPABASE_ANON_KEY` in Vercel and trigger a redeploy.

### Resend API key

Resend → API Keys → revoke the old key, create a new one with "Sending access only", label it (e.g. `supabase-prod-2026Q2`). Paste into Supabase → Auth → SMTP Settings → password field. Save. Send a test email immediately to confirm.

### Sentry / PostHog keys

Their dashboards → project settings → rotate. Update Vercel env vars. Redeploy.

### After any rotation

Run the smoke test (Section 7). A botched rotation is the easiest way to break production silently — a fresh smoke test catches it before students do.

---

## 6. Backup + restore

### If you're on Supabase Pro

Daily automated backups, 7-day retention. Verify they exist at Dashboard → Database → Backups. Test a restore quarterly (Section 12). PITR is an optional add-on; skip until you cross 500 students.

### If you're still on free

There are no automated backups. Run `pg_dump` weekly:

```bash
pg_dump "postgresql://postgres:<password>@db.<prod-ref>.supabase.co:5432/postgres" \
  --no-owner --no-acl \
  > backup-$(date +%Y%m%d).sql
gzip backup-$(date +%Y%m%d).sql
```

Store the gzipped dump in a **separate** location — S3, Backblaze B2, or even a Google Drive folder. The point is: if Supabase is down or your account is locked, you still have the data. A backup on the same provider as the primary is not a backup.

Automate this with a local cron or a GitHub Actions scheduled workflow. Don't trust yourself to remember.

### Restore drill

Do this **once per quarter**, ideally on a Sunday morning when no class is running:

1. Create a fresh Supabase project (free is fine).
2. `psql "<new-connection-string>" < backup-YYYYMMDD.sql`
3. Verify schema with `\dt` and sample a few rows: `select count(*) from profiles; select count(*) from attempts;`.
4. Time the whole thing. For a small DB, target under 30 minutes from "oh no" to "data restored". Write it down.
5. Delete the scratch project when done.

The first time you do this, things will go wrong. That's the point. Better to discover the broken assumption now than during an actual outage.

---

## 7. Smoke test against prod

After every production deploy, every secret rotation, and once per week regardless:

```bash
cd /Users/kevin/coding/CB_Educator_Question_Bank/viewer
SUPABASE_URL=https://<prod-ref>.supabase.co \
  SUPABASE_ANON_KEY=<prod-anon-key> \
  SUPABASE_SERVICE_KEY=<prod-service-role-key> \
  node scripts/smoke-e2e.mjs
```

Expected result: **13 PASS + 1 SKIP** (the SKIP is the anonymous-auth test, which only runs if you've enabled anonymous auth in the dashboard).

If FAIL > 0: **do not open the app to real students**. Triage from the [`docs/SMOKE_TEST_REPORT.md`](./SMOKE_TEST_REPORT.md) template, fix the first failing test, re-run. The smoke test is the gate.

Common failures:

- "Unauthorized" → wrong anon key, or RLS policy got broken by a recent migration.
- "Email confirmation timeout" → SMTP is broken; check Resend dashboard.
- "Cannot reach Supabase URL" → wrong URL, trailing slash, or project paused (free tier).

---

## 8. First-week soft launch playbook

Resist the urge to onboard a full class on day one. The first week is for catching the things that synthetic tests can't.

- **Day 0**: Smoke test passes. You log in as a student, take a mock test, log in as a teacher, see the result.
- **Day 1**: Invite 1–2 trusted students (a current student, your spouse's nephew, a beta tester). Check Sentry every hour for the first day. Watch the Supabase logs page for slow queries (>500ms). Email yourselves daily summaries.
- **Day 3**: Invite ~5 more students. Now check Resend's deliverability tab — you want >95% "delivered" (not bounced or spammed). If you see a deliverability cliff, your DNS is wrong, fix it before going wider.
- **Day 7**: Full class trial. Review the week before scaling further:
  - Any Sentry issues that recurred more than twice → fix this week.
  - Email deliverability still >95%? If not, mail-tester.com is your friend.
  - Database queries: open Supabase → Reports → Query Performance. Anything over 100ms on a list/read should be investigated.
  - PostHog funnels: signup → first attempt. If the drop-off is more than 30%, something in the onboarding UX is broken.
  - Student feedback in a shared doc. Tag each item: bug, feature, training gap.

Only after this week do you open invitations to a second class.

---

## 9. Incident response

When something breaks, classify first, then act. The triage cost of treating every issue as Sev 1 is real — you will burn out and start ignoring the genuine emergencies.

| Sev | Definition | Examples | Response time |
|---|---|---|---|
| **1** | Students cannot use the product at all, OR data is at risk | Signup broken, login broken, mock test crashes mid-attempt, RLS bug exposing other students' data | Drop everything. Replicate, hotfix or roll back, deploy within 1 hour. |
| **2** | One feature broken; students can still use most flows | Leaderboard wrong, one question type rendering badly, teacher dashboard slow | Fix within 24 hours. Communicate to affected users. |
| **3** | Cosmetic or minor | Typo, slightly-off colors, edge-case error message wording | Backlog. Fix in the next scheduled release. |

### Rollback procedure

**Frontend (Vercel)**: Project → Deployments → find a known-good previous deployment → click the `…` menu → Promote to Production. Instant. This is your fastest panic button. Get comfortable doing it once now, on a Sunday, with no pressure.

**Database (Supabase)**: There is **no trivial rollback for migrations**. Migrations are forward-only. If you push a bad migration:

1. Do not panic. Do not run anything destructive.
2. Identify what the bad migration did. Read the SQL.
3. Write a **forward-fix migration** (e.g. `0007_revert_bad_thing_from_0006.sql`) that undoes the damage.
4. Test it locally with `supabase db reset` first.
5. Push it.

Because of this, **never push a migration on a Friday afternoon** or within 6 hours of a class starting. The discipline is: migrations on Monday or Tuesday, monitor for a day, then carry on.

If the bad migration corrupted data (not just schema), restore from backup — that's what Section 6 exists for.

---

## 10. Cost ceiling + when to upgrade

| Stage | Students / classes | Stack | Approx. monthly |
|---|---|---|---|
| Today | 1–30 students, 1 class | Supabase Free, Vercel Free, Resend Free, Sentry Free, PostHog Free | **$0** |
| Pilot | 50–200 students, 1–5 classes | Supabase Pro ($25), everything else free | **~$25** |
| Growth | 200–1000 students, 5–20 classes | Supabase Pro + small compute ($25 + ~$30), Resend Pro ($20), rest free | **~$75** |
| Scale | 1000+ students | Bigger Supabase compute, possibly Vercel Pro for teammates, Sentry paid tier | **$200–500** |

Upgrade triggers in order of likelihood:

1. **Supabase free pauses your project after 7 days idle**. Either upgrade to Pro or run a keepalive cron (uptimerobot.com on a 6-day schedule against your app URL works). Upgrading is cleaner.
2. **You hit Resend's 100/day or 3,000/month limit**. Upgrade to Resend Pro ($20/mo, 50k/month).
3. **Supabase DB > 500 MB** or **MAU > 50k**. Upgrade Supabase to Pro.
4. **Queries getting slow under load**. Supabase Pro lets you scale compute. Start with the smallest paid compute size; only go bigger when you've actually measured slowness in production.

See [DEPLOYMENT.md § Cost projection at scale](./DEPLOYMENT.md) for the deeper analysis.

---

## 11. The "I'm in over my head" escalation list

Honest signposting. When the thing that's broken is not yours to fix:

- **Supabase outage** → https://status.supabase.com. If they're down, you're down. Their support is responsive on email; Pro tier gets priority. There is nothing useful you can do — communicate to students that the app is unavailable and check the status page every 15 minutes.
- **Vercel outage** → https://www.vercel-status.com. Same playbook. The static SPA is on a CDN, so partial outages may still work for cached users.
- **DNS / domain issue** → your registrar's support. Cloudflare is responsive on chat. Namecheap is slower. Symptoms: domain stops resolving, cert renewal fails, MX records flap.
- **Stuck on a migration that won't apply** → Supabase Discord (https://discord.supabase.com), #help channel. Post the migration SQL and the error message verbatim. Response is usually within an hour during business hours.
- **Sentry showing errors from a third-party script** → ignore unless it's reproducible. Browser extensions, ad blockers, and bot scrapers generate a constant background of noise.
- **An error you don't understand at all** → use the AI assistant in Sentry (it's actually useful), or paste the stack trace into Claude. Don't randomly try fixes against production.

For anything genuinely critical and beyond your skill: a contractor on Upwork or a freelance Supabase consultant at $150–250/hr is cheaper than an extended outage.

---

## 12. Quarterly checklist

Every three months, block 2 hours and do all of these:

- [ ] **Rotate the service-role key**. (Even if nothing happened. Hygiene.)
- [ ] **Review Sentry issues**. How many distinct issues open? Any recurring ones triaged-but-not-fixed for >30 days? Close them or fix them.
- [ ] **Review PostHog funnels**. Has signup-to-first-attempt regressed? Why?
- [ ] **Full restore drill** per Section 6. Time it.
- [ ] **Review Supabase compute size**. Have queries gotten slower? Is anything near the DB size limit?
- [ ] **Update dependencies**: `cd viewer && npm outdated` and `npm audit`. Patch critical CVEs immediately, batch other updates into a single PR per quarter.
- [ ] **Re-run smoke test against prod**. Should still be 13/14.
- [ ] **Re-read this runbook**. Mark anything that is now stale and fix it.
- [ ] **Review the backup**: when was the last successful backup? Can you actually find it? Try opening one.

The quarterly review is the difference between a system you operate and a system that operates you.

---

## Final note

This document will go stale. Vendor dashboards move buttons, pricing pages change, new services appear. When something here disagrees with the vendor's current docs, **trust the vendor and update this file**. The cost of a slightly out-of-date runbook is far smaller than the cost of running on tribal knowledge alone.

When in doubt: smoke test. The 13-pass-1-skip green light is the single most reliable signal that production is healthy.
