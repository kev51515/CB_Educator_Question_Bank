# Monitoring

Operational runbook for observability: errors, product usage, database health, and deploys.

## What We Monitor and Why

- **Errors** → **Sentry**. Catches runtime exceptions in the React app, with stack traces and (optionally) session replay.
- **Product usage** → **PostHog**. Pageviews, clicks, custom events, funnels, retention. Tells you what students actually do.
- **Database health** → **Supabase Dashboard**. Slow queries, auth signups, logs. The built-in tooling is enough for now.
- **Deploys and edge** → **Cloudflare Pages Dashboard**. Build status and build logs; the runtime is a static CDN (no server logs).

No single pane of glass. Four tabs in a browser.

## Sentry Setup

1. Create a project at **sentry.io** (free tier: 5,000 errors/month, 10k performance units, 30-day retention).
2. Pick **React** as the platform during onboarding.
3. Copy the DSN — it looks like `https://abc123@o456.ingest.sentry.io/789`.
4. In **Cloudflare Pages → Settings → Environment variables** (Production + Preview), add:

```
VITE_SENTRY_DSN = <the DSN>
```

5. Redeploy. The next build picks it up.

### How the wiring works

The app initializes Sentry in `viewer/src/lib/telemetry.ts`. Relevant behavior:

- Sentry initializes only when `VITE_SENTRY_DSN` is set. Without it, all calls are no-ops and dev consoles stay clean.
- `tracesSampleRate: 0.1` — 10% of pageviews send performance data. Plenty of signal without blowing the quota.
- `replaysOnErrorSampleRate: 1.0` — every error captures a session replay (the 30 seconds before the error). `replaysSessionSampleRate: 0` means no replays without errors, which keeps the quota under control.
- `identifyUser(id, email, role)` is called on login, so errors show up tagged with which student/teacher hit them.

### Verify it works

In the deployed app, open the browser console and run:

```js
throw new Error("sentry test");
```

The error appears in Sentry within ~10 seconds. Delete the issue afterward so it doesn't clutter the dashboard.

### Configure alerts

In **Sentry → Alerts → Create Alert**:

- **Issue Alert: A new issue is created** → action: email. This is the one alert worth having on day one.
- Optional: **Metric Alert: Error rate exceeds 5%** → email. Useful once you have baseline traffic.

### Source maps

For readable stack traces, you need source maps uploaded. The straightforward path: install `@sentry/vite-plugin` and add a Sentry auth token (`SENTRY_AUTH_TOKEN` env var). Until that's done, stack traces will show minified function names — still useful, just less readable.

## PostHog Setup

1. Create a project at **posthog.com** (free tier: 1M events/month, 1-year retention).
2. Copy the **Project API Key** (looks like `phc_xxxx`).
3. In Cloudflare Pages → Settings → Environment variables, add:

```
VITE_POSTHOG_KEY  = phc_xxxx
VITE_POSTHOG_HOST = https://us.i.posthog.com    (or https://eu.i.posthog.com)
```

4. Redeploy.

### How the wiring works

In `viewer/src/lib/telemetry.ts`:

- **autocapture: true** — clicks and form interactions are tracked automatically.
- **capture_pageview / capture_pageleave: true** — pageviews on entry and exit.
- **person_profiles: "identified_only"** — anonymous visitors don't burn through the person quota; only signed-in users count.
- `trackEvent(name, properties)` is sprinkled throughout the app for custom events (e.g. assignment started, mock test submitted).
- `identifyUser` ties events to the logged-in user.

### Recommended dashboards

Build these in PostHog → Insights:

| Insight | Type | What it answers |
|---|---|---|
| Signup → first class joined → first assignment attempted → first assignment completed | **Funnel** | Where do new students drop off? |
| D1 / D7 / D30 retention by signup week | **Retention** | Are students sticking? |
| Modules tab clicks vs Assignments tab clicks | **Trends** | Which surface gets used? |
| Mock test starts per student per week | **Trends, breakdown by user** | Who is engaged? Who is dormant? |
| Time from signup to first attempt | **Lifecycle** | How long is activation? |

### Privacy notes

PostHog captures URLs, click targets, and explicit `trackEvent` payloads. It does **not** capture form input values (we don't pass any input values into `trackEvent`). Worth documenting if a parent or school asks. If you ever add tracking on student answers or scores, write that into a privacy policy first.

## Supabase Dashboard (Database Health)

Free-tier Supabase has no email alerts — you have to look. Bookmark these and check them weekly.

| Path | What to look for |
|---|---|
| **Database → Query Performance** | Sort by **Total Time**. Anything over 100ms with high call count needs an index or a query rewrite |
| **Database → Indexes** | Confirm expected indexes exist after migrations |
| **Authentication → Users** | Signup rate; sudden spike could be bot signups |
| **Logs → Postgres Logs** | Errors, deadlocks, slow query warnings |
| **Logs → Auth Logs** | Failed signups, repeated failed logins on a single account |
| **Project Settings → Backups** | Daily backups exist (**Pro tier only** — on free, you have no backups) |

Slow queries are the most common operational issue on Supabase. The "Query Performance" view will show you the offender; usually adding an index on the column you filter by fixes it.

## Cloudflare Pages Dashboard (Deploy + Edge)

| Tab | Watch for |
|---|---|
| **Deployments** | Latest production deploy succeeded |
| **Deployments → Build log** | Build failures (open the deploy to read the log) |
| **Web Analytics** (free) | Page views, Core Web Vitals |

The runtime is a static CDN, so there are no server/runtime logs to watch — only build logs and the CDN's cache behavior.

## Alert Configuration

| Tool | Alert | Trigger | Channel |
|---|---|---|---|
| Sentry | New issue type | Any error not seen before | Email |
| Sentry | Error rate spike | >5% of sessions hitting errors | Email |
| PostHog | Signup drop | Signups per week down 50% WoW | Email (PostHog Insight subscription) |
| Cloudflare Pages | Deploy failure | Production build fails | Email (built-in) |
| Supabase free | — | No native alerts. Either poll manually or upgrade to Pro | — |

If Supabase health matters and you don't want to upgrade, a 5-minute cron job hitting a health endpoint and pinging you on failure is enough.

## Daily Watch (First 4 Weeks)

Five-minute morning check while the product is finding its feet:

1. **Sentry → Issues** — any new errors overnight?
2. **PostHog → Insights** — yesterday's signup count vs the day before
3. **Supabase → Authentication → Users** — total users count went up by what you'd expect
4. **Resend → Emails** — confirmation rate (delivered / sent) above 95%
5. **Cloudflare Pages → Deployments** — last deploy is green

After a month, drop to weekly unless something is changing fast.

## Incident Response Playbook

When something breaks:

1. **Detect.** Alert email fires, or a student says "I can't log in."
2. **Triage.**
   - Sentry → find the issue → open the session replay → watch what the user did
   - Supabase → Logs → cross-reference time of the error
   - PostHog → does the funnel show a sudden drop at that step? Is it one user or all users?
3. **Reproduce.** Try the same flow locally. If you can't reproduce, it's likely env-specific (auth state, RLS, network).
4. **Resolve.** Hotfix → commit → push to `main` → Cloudflare Pages auto-deploys → confirm the Sentry issue stops getting new events.
5. **Document.** A one-paragraph note in `docs/LEARNINGS.md`: what broke, why, how you found it, how to prevent it.

## Data Retention and Privacy

| Source | Retention |
|---|---|
| Sentry (free) | 30 days |
| PostHog (free) | 1 year |
| Resend | 30 days for the email log |
| Supabase | Indefinite until you delete |
| Cloudflare Pages | Build logs retained per deployment; no runtime logs (static CDN) |

A planned `export_my_data` RPC will give a student a dump of everything Supabase knows about them. It will **not** include Sentry or PostHog data — those have to be deleted separately via their dashboards if a student requests it (Sentry: search by user ID, delete the issue events; PostHog: **Data Management → Delete Person**).

## What We Don't Monitor (Gap List)

Being honest about the gaps so they don't surprise you:

- **Uptime monitoring.** Nothing pings the app from outside to tell you it's down. Add **BetterUptime** or **UptimeRobot** (both have free tiers, 5-minute checks, email alerts) — takes 10 minutes to set up.
- **Synthetic transactions.** No automated "can a student actually sign up?" check. The smoke E2E script in the repo can be wired to a GitHub Actions cron later.
- **Real User Monitoring beyond PostHog.** PostHog gives you clicks and pageviews; for actual performance metrics across the user base, you'd need Sentry Performance at scale or Cloudflare Web Analytics.
- **Cost / quota alerts.** Nothing warns you when you're at 80% of the Supabase free tier database row limit, the Resend monthly cap, or the Sentry error quota. Set calendar reminders to check the dashboards monthly until you have alerts.
- **Database backups (free tier).** Supabase free tier has no automated backups. Pro tier ($25/mo) gets daily backups. Until then, schedule a weekly `pg_dump` to a private bucket.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for environment variable setup and the deployment process. See [USER_GUIDE.md](./USER_GUIDE.md) for the student-facing flows you'll be reading off the funnel.
