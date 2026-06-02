# Deployment Guide

This guide covers deploying the CB Educator Question Bank to production. The current runtime is a single static React/Vite SPA (`viewer/`) backed by Supabase for auth and data. Everything else in the repo (`scraper/`, `scripts/`, `sat_scraper_legacy/`) is offline tooling and does not get deployed.

## TL;DR

Recommended stack:

- **Supabase Cloud** for Postgres, Auth, and (eventually) Storage. The local schema in `supabase/migrations/` ships to cloud unchanged via `supabase db push`.
- **Vercel** for the `viewer/` SPA. It's the path of least resistance for Vite: zero-config builds, free tier, preview deploys per PR, automatic HTTPS.
- **Cloudflare Pages** is a strong alternative if you expect heavy bandwidth or want a more generous free tier.
- **Railway** is overkill today (no Node server to host) but becomes the right answer the day you fold in a real backend (`sat_questions/` Express API, cron jobs, queues).

## Architecture

```
                  ┌──────────────────────────┐
                  │   Student / Teacher      │
                  │   Browser (PWA)          │
                  └────────────┬─────────────┘
                               │ HTTPS
                ┌──────────────┴──────────────┐
                │                             │
        ┌───────▼────────┐         ┌──────────▼──────────┐
        │  Vercel CDN    │         │  Supabase Cloud     │
        │  (static SPA)  │         │  ┌───────────────┐  │
        │  viewer/dist   │         │  │ Auth (GoTrue) │  │
        └────────────────┘         │  ├───────────────┤  │
                                   │  │ Postgres + RLS│  │
                                   │  ├───────────────┤  │
                                   │  │ Storage       │  │
                                   │  ├───────────────┤  │
                                   │  │ Edge Functions│  │
                                   │  └───────────────┘  │
                                   └─────────────────────┘
```

The browser talks directly to Supabase using `@supabase/supabase-js`. There is no API server in the middle. Row-Level Security (RLS) is the only thing between a student and someone else's data — take it seriously.

## Supabase Cloud setup

### 1. Create the project

Sign in at https://supabase.com/dashboard and create a new project.

> **Note:** Pick the region closest to your users. Latency on auth round-trips is what students will feel most. If your audience is North American, use `us-east-1`. If it's APAC, use `ap-southeast-1` or `ap-northeast-1`. Region cannot be changed after creation without a full migration.

Save the database password somewhere secure (you'll need it for `supabase db push`).

### 2. Link the local project to cloud

From the repo root:

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

The project ref is the subdomain of your project's Supabase URL (e.g. `abcdefghijklmno` from `https://abcdefghijklmno.supabase.co`).

### 3. Push migrations

```bash
supabase db push
```

This applies every file in `supabase/migrations/` in order. Today that's just `0001_init.sql` (the `profiles`, `classes`, `class_memberships` schema plus RLS policies and the `handle_new_user` trigger).

> **Note:** Migrations are idempotent only if you write them that way. `0001_init.sql` uses `CREATE TABLE` (not `IF NOT EXISTS`), so re-running it against a populated cloud DB will fail. That's a feature, not a bug — it forces you to use new migration files for changes. Never edit a migration that has already been pushed to cloud; always add a new one.

### 4. Configure Auth

In the Supabase dashboard, under **Authentication → Providers**:

- Enable **Email** provider
- Turn on **Confirm email** (required to prevent throwaway signups)
- Set **Site URL** to your production URL (e.g. `https://questionbank.example.com`)
- Add additional **Redirect URLs**:
  - `http://localhost:5173` (Vite dev server)
  - `https://*.vercel.app` (preview deploys, if using Vercel)

Under **Authentication → Email Templates**, customize the confirmation and password-reset templates so they don't look like phishing.

Under **Settings → Auth**, the default JWT expiry of 3600s (1 hour) is fine. The refresh token will keep students logged in across sessions transparently.

### 5. Capture environment variables

From **Settings → API** in the dashboard, copy:

| Variable | Where it goes | Notes |
|----------|---------------|-------|
| `Project URL` | Vercel as `VITE_SUPABASE_URL` | Public, safe to ship to browser |
| `anon` key | Vercel as `VITE_SUPABASE_ANON_KEY` | Public, RLS protects data |
| `service_role` key | **Never** in frontend; admin scripts only | Bypasses RLS — treat like a root password |

### 6. Pricing notes

Free tier (as of late 2025): 500 MB database, 1 GB file storage, 50,000 MAU, 2 GB egress, 7-day inactive pause. Plenty for development and small pilots.

Upgrade to **Pro ($25/mo)** when you need:

- No inactive pause (free projects sleep after 7 days idle)
- Daily backups (7 days retention)
- More than 500 MB DB or 50k MAU
- PITR (point-in-time recovery, extra cost)

Pricing changes — confirm at https://supabase.com/pricing before committing.

## Frontend hosting — Option A: Vercel (recommended)

Vercel detects Vite automatically. Setup:

1. Push the repo to GitHub.
2. At https://vercel.com/new, import the repo.
3. Configure the project:
   - **Framework Preset**: Vite
   - **Root Directory**: `viewer`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

   If Vercel doesn't pick up the `viewer/` subfolder from the import wizard, override **Root Directory** to `viewer` in project settings.

4. Add environment variables under **Settings → Environment Variables**:

   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-key>
   ```

   Apply to **Production**, **Preview**, and **Development** scopes.

5. Add a custom domain under **Settings → Domains**. Vercel issues a Let's Encrypt cert automatically.

### Preview deploys

Every PR gets a unique preview URL (`pr-42-cb-educator-question-bank.vercel.app`). Add those URLs to Supabase **Redirect URLs** (the wildcard `https://*.vercel.app` covers them).

### Pricing

Hobby: free, includes 100 GB/mo bandwidth, unlimited static requests, 1 concurrent build. Sufficient for under ~500 active students.

Pro: $20/user/mo, gives you team features, more build concurrency, password-protected previews. Get this when you have teammates, not for traffic reasons.

### PWA caveat — service worker cache busting

The viewer registers a service worker (`viewer/src/registerSW.ts`, served from `viewer/public/sw.js`). This is great for offline use but a deployment hazard: once a student has the old SW installed, they may continue serving the cached app shell even after you ship new code.

Mitigations:

1. **Use Vite PWA plugin's `registerType: 'autoUpdate'`** if you aren't already. This sends a skip-waiting message and reloads on next navigation.
2. **Bump a version meta tag** in `viewer/index.html` each release (CI can stamp this from `git rev-parse --short HEAD`):

   ```html
   <meta name="app-version" content="__APP_VERSION__" />
   ```

   The SW can compare on activation and force-refresh.
3. **Hash all asset filenames** (Vite does this by default — verify with `ls viewer/dist/assets/`).
4. **Never cache `index.html`** in the SW. Always fetch fresh, cache the hashed assets it references.

Without one of these, a non-trivial fraction of users will be stuck on the old build until they manually clear site data.

## Frontend hosting — Option B: Cloudflare Pages

Mechanically the same as Vercel:

```
Framework preset: Vite
Build command:    cd viewer && npm install && npm run build
Build output:     viewer/dist
Root directory:   /
Env vars:         VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

### When to prefer Cloudflare

- You need globally low latency (CF has more edge locations than Vercel)
- Bandwidth is the bottleneck — CF Pages free tier is unlimited bandwidth, unlimited requests
- You're already using Cloudflare for DNS / WAF
- You plan to lean on **Cloudflare Workers** (D1, KV, R2, Durable Objects) for any future server logic

### When Vercel is better

- You want zero-config: Vercel's Vite detection is slightly slicker
- You use Next.js elsewhere and want one dashboard
- Preview deploy DX is marginally better

Both are fine. Don't agonize.

## Frontend hosting — Option C: Railway

Railway can host a static site (Nixpacks auto-detects Vite and runs `npm run build`), but it bills by resource-second instead of being free for static traffic. For a pure SPA with no backend, you're paying for a container to serve files that Vercel/CF will host for $0.

### When Railway becomes the right call

The moment you add a real backend, Railway starts winning:

- **The `sat_questions/` Express API** lands and needs a Node server
- Cron jobs for daily question rotation / leaderboards
- A background worker for AI-powered question generation
- A queue (Railway has Redis as a one-click add-on)
- You want viewer + API + Postgres on a single platform with one bill

At that point: keep Supabase for auth (Railway's Postgres is fine but Supabase's auth + RLS is a lot of value), put the API and any workers on Railway, and serve the static viewer either from the same Railway service or keep it on Vercel/CF. Mix-and-match is normal.

## Environment variables — single source of truth

| Variable | Local dev (`viewer/.env.local`) | Production (Vercel/CF env) | Server-side scripts |
|----------|----------------------------------|-----------------------------|---------------------|
| `VITE_SUPABASE_URL` | From `supabase start` output (`http://127.0.0.1:54321`) | Supabase Cloud project URL | Same as production URL |
| `VITE_SUPABASE_ANON_KEY` | From `supabase start` output | Anon key from cloud dashboard | Same as production |
| `SUPABASE_SERVICE_ROLE_KEY` | **Never set in viewer** | **Never set in viewer** | Developer's `~/.zshrc` or a Supabase Edge Function secret |

### Why the service role key never goes in the frontend

Anything prefixed `VITE_` is inlined into the JavaScript bundle and shipped to the browser. The service role key bypasses all RLS — anyone who finds it in your bundle can read and write the entire database. Treat it like an AWS root key.

You'd need it for:

- One-off admin scripts (`scripts/seed-data.ts` running locally)
- Supabase Edge Functions doing privileged operations
- A future API server doing admin tasks (e.g. teacher impersonation, bulk grade imports)

In all those cases the key lives server-side or in a developer's local shell — never in the SPA.

### Local dev `.env.local`

After `supabase start`, the CLI prints local values. Drop them in `viewer/.env.local`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local-anon-key-from-supabase-start>
```

This file is gitignored. Confirm `.env.local` is in `viewer/.gitignore` before committing anything.

## Deployment checklist before going live

- [ ] `supabase db push` succeeded against cloud; `\dt` in the cloud SQL editor shows `profiles`, `classes`, `class_memberships`
- [ ] RLS is enabled on all three tables (`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('profiles','classes','class_memberships');` returns `t` for each)
- [ ] Manual RLS smoke test: sign up as Student A, create a class membership; sign up as Student B; confirm B cannot read A's `class_memberships` row via the JS client
- [ ] Email confirmation enabled in Supabase Auth
- [ ] Production Site URL and Redirect URLs configured in Auth settings
- [ ] Custom domain attached, HTTPS green
- [ ] PWA manifest (`viewer/public/manifest.webmanifest`) `name`, `short_name`, `start_url`, and icon paths match the live URL
- [ ] `viewer/public/robots.txt` decision made — for a student-only app, ship `User-agent: *\nDisallow: /` to keep it out of Google
- [ ] Backup strategy in place (see below)
- [ ] Error monitoring wired up (Sentry or PostHog — see Monitoring)

### Backup strategy

**Pro tier**: Supabase takes daily backups automatically with 7-day retention. Test a restore in a scratch project before you need it.

**Free tier**: No automated backups. Run `pg_dump` on a schedule. Example weekly job (cron or GitHub Actions):

```bash
#!/bin/bash
set -euo pipefail
DATE=$(date +%Y-%m-%d)
pg_dump "$SUPABASE_DB_URL" \
  --no-owner --no-acl \
  -f "backup-${DATE}.sql"
gzip "backup-${DATE}.sql"
# upload to S3, Backblaze, or Google Drive
```

The connection string is at **Settings → Database → Connection string → URI** in the Supabase dashboard. Use the connection pooler URL (port 6543) for one-off scripts.

### Monitoring

- **Supabase dashboard**: DB size, slow queries, auth events, API request counts. Check weekly.
- **Vercel Analytics**: Page views, Web Vitals. Free tier has a daily event cap.
- **Sentry** (recommended for errors): Drop in `@sentry/react`, point at your DSN, get stack traces with sourcemaps. Free tier is generous for small apps.
- **PostHog** (alternative): Product analytics + session replay + error tracking in one. Self-hostable.

Pick one error tracker before launch. Debugging RLS issues from user reports alone is misery.

## CI/CD recommendations

### Branch policy

- `main` is always deployable. Vercel auto-deploys it.
- Feature work happens on branches; PR triggers a preview deploy.
- Migrations get extra scrutiny: any PR touching `supabase/migrations/` needs a reviewer who has run `supabase db reset` locally to confirm it applies cleanly.

### Migration safety rules

1. Migrations are append-only. Never edit `0001_init.sql` after it's been pushed to cloud — write `0002_*.sql` instead.
2. Test locally first: `supabase db reset` re-applies the full migration chain against a fresh local DB.
3. Test against a staging Supabase project before pushing to prod. (Yes, this costs a second free-tier project, worth it.)
4. Destructive migrations (DROP COLUMN, DROP TABLE) need a separate PR with explicit signoff.

### GitHub Actions example

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  viewer:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: viewer
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: viewer/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm run build
```

Vercel handles deploys; this workflow exists to fail PRs that don't typecheck or lint. Add a `test` step once you have meaningful tests.

For the migration safety check, add a second job that runs `supabase db reset` against a local Postgres in CI to confirm migrations still apply cleanly:

```yaml
  migrations:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase db start
      - run: supabase db reset --no-seed
```

## Cost projection at scale

Prices below are accurate as of late 2025. Always confirm at vendor pricing pages before budgeting.

| Stage | Users | Supabase | Vercel | Total / mo |
|-------|-------|----------|--------|------------|
| Pilot | ~50 students | Free | Hobby (free) | **$0** |
| Small school | ~500 students | Pro ($25) | Hobby (free) | **~$25** |
| Multi-school | ~5,000 students | Pro + compute add-on (~$60–100) | Pro ($20/seat) | **~$100–150** |
| Regional | 20,000+ | Team ($599+) or self-host | Enterprise (quote) | quote |

The DB compute upgrade is the first thing you hit at scale — Supabase's default Pro instance is a small one (2-core, 1 GB RAM). Egress is the second.

If you cross 10k MAU and bandwidth becomes meaningful, re-evaluate Cloudflare Pages for the SPA; unlimited bandwidth on free tier can save real money.

## Migration path for future LMS features

The roadmap (teacher dashboards, classes, assignments, gradebook, AI question generation) does not force a platform switch. Concretely:

- **Schema growth**: New tables for `assignments`, `submissions`, `grades`, `rubrics` land as new migration files (`0002_*.sql`, `0003_*.sql`, ...). RLS policies scale the same way — teacher-vs-student access enforced at the row level.
- **Server-side logic**: Use Supabase Edge Functions (Deno runtime) for things like sending assignment-due reminders, computing class averages, or webhook handlers. Deploy with `supabase functions deploy`. Free tier covers 500k invocations/mo.
- **File uploads**: Supabase Storage handles student PDF uploads, scanned worksheets, profile pictures. Same RLS model applies to buckets.
- **AI question generation**: If this is async/batch, an Edge Function on a schedule works. If it's interactive (teacher clicks "generate 10 questions" and waits), the latency budget probably pushes you toward a dedicated Node service.
- **When Railway enters the picture**: The first real Express API — almost certainly the `sat_questions/` mock-test backend — is the natural moment to spin up a Railway project. Put the API + any cron + any queue there. Keep Supabase for auth/DB/storage. Move the viewer to Railway only if you want a single bill; otherwise leave it on Vercel/CF.

The architectural decision is: Supabase stays as the system of record forever. Other platforms come in around it.

## Common gotchas

- **`VITE_` prefix**: Vite only exposes env vars prefixed `VITE_` to the browser. `SUPABASE_URL` won't work in the SPA; it has to be `VITE_SUPABASE_URL`. Conversely, anything you prefix `VITE_` gets shipped to the browser — don't put secrets there.
- **Trailing slashes on Supabase URL**: `supabase-js` expects no trailing slash. `https://abc.supabase.co/` and `https://abc.supabase.co` are not equivalent in some auth flows. Match what the dashboard shows exactly.
- **Email rate limits on free tier**: Supabase free tier sends max 4 emails/hour from the default `noreply@mail.app.supabase.io` sender. During testing you'll hit this fast. Workarounds: configure a custom SMTP provider (Resend, SendGrid, AWS SES) in **Auth → SMTP Settings**, or use the dashboard's "Send confirmation" button manually.
- **CORS**: For browser usage you don't need to touch CORS — Supabase allows all origins by default on the API. If you ever call from a non-browser context (curl, server-side script), add the origin to **API → CORS Allowed Origins** if you've restricted it.
- **Local Supabase port conflicts**: `supabase start` uses ports 54321–54324. If another project is running you'll get cryptic errors. `supabase stop --project-id <other>` first.
- **Migration drift between developers**: If two devs each write `0002_*.sql` on separate branches, the merge will be painful. Coordinate migration numbers in the PR description or use timestamp-based migrations (`20260529_*.sql`).
- **RLS recursion**: A common foot-gun is writing an RLS policy on table A that references table B, which has a policy referencing table A. Postgres will catch infinite recursion at query time, but the error message is unhelpful. Keep policies flat; use `security definer` functions for cross-table checks.
- **Service worker caching `/`**: If your SW caches the index route, users on the old build never see new releases. Audit the SW caching strategy specifically for `index.html` — it should be network-first or no-cache.
- **Supabase free tier pause**: Free projects pause after 7 days of no API activity. The first request after a pause takes 30+ seconds to unpause. Either hit it with a keepalive cron (uptimerobot.com on a 6-day interval works) or accept the cold start.

---

## First admin bootstrap

The app ships without a default admin — teacher elevation is gated on an admin-minted invite code (`public.teacher_invite_codes`, migration `0005`), and only an admin can mint codes. To get the first admin in:

1. Sign up any user normally (e.g., `admin@yourdomain.com`). They will land with `role='student'`.
2. Find their `auth.users.id` in the Supabase Dashboard → Authentication → Users.
3. In the SQL Editor, run:
   ```sql
   select public.bootstrap_first_admin('<that-uuid>');
   ```
4. They now have `role='admin'`. They can mint teacher invite codes from the admin UI (when wired) or via the RPC directly:
   ```sql
   select public.mint_teacher_invite('spring-2026', 'Spring 2026 cohort', null, 25);
   ```

The `bootstrap_first_admin` RPC refuses to run once any admin exists — so it's a one-shot. Subsequent admin promotions can be done via `UPDATE profiles SET role='admin' WHERE id='…'` from the SQL editor by another admin (RLS allows admin updates of any profile), or by wiring an admin-only UI in the future.

---

If anything in this guide ages out (it will — pricing pages change, dashboard UIs move buttons), trust the vendor docs over this file and PR a fix.
