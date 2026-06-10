# STACKS.md — the tech stack, in one place

The authoritative list of what this project actually runs on. Read this before
writing any deployment, hosting, infra, or ops content — **do not assume a host
or provider; check here.**

> **Hosting is Cloudflare Pages — NOT Vercel.** The repo has no Vercel config and
> never deployed to Vercel. The SPA is served by **Cloudflare Pages**; the SPA
> rewrite lives in `viewer/public/_redirects` (`/*  /index.html  200`). Any doc
> that says otherwise is wrong — fix it.

---

## Frontend

| Thing | Choice | Notes |
|---|---|---|
| Framework | **React 19** (`react@^19`) | function components + hooks only |
| Build tool | **Vite 8** | `viewer/` is the app root |
| Language | **TypeScript 6** | `npx tsc -b` must stay green |
| Routing | **react-router-dom 7** | client-side; needs the SPA rewrite (below) |
| Data client | **@supabase/supabase-js 2** | browser talks to Supabase directly |
| Math | **KaTeX** | `$…$` / `$$…$$` rendering in test content |
| Rich text | **TipTap** | the `MarkdownEditor` component |
| Styling | **Tailwind CSS** | utility classes; dark mode throughout |
| PWA | yes | installable; offline-aware test runner |

The app is a **single static SPA** (`viewer/dist`). There is **no API server** —
the browser calls Supabase directly, and **Row-Level Security (RLS) is the only
thing between a student and someone else's data.**

## Hosting / deploy — Cloudflare Pages

- **Host:** Cloudflare Pages. Project root **`viewer/`**, build command
  **`npm run build`** (`tsc -b && vite build`), output dir **`dist`**.
- **SPA rewrite:** `viewer/public/_redirects` → `/*  /index.html  200`
  (Cloudflare Pages convention; this is why deep links survive a refresh — no
  `vercel.json`, no `*.html` lookups).
- **Deploy trigger:** Cloudflare Pages git integration (auto-deploy on push to
  `main`), or direct upload via **`wrangler pages deploy viewer/dist`**.
  Branch/PR builds get preview URLs at `*.pages.dev`.
- **Env vars:** set the `VITE_*` vars in **Cloudflare Pages → Settings →
  Environment variables** (Production + Preview). `VITE_*` is inlined into the
  bundle — public by design; never put a service-role key here.
- **Rollback:** Cloudflare Pages → Deployments → pick a known-good deploy →
  **Rollback to this deployment**.
- **DNS / domain:** Cloudflare Registrar + Cloudflare DNS; custom domain attached
  in the Pages project (HTTPS is automatic).
- **Status:** https://www.cloudflarestatus.com

## Backend / data — Supabase Cloud

- **Postgres + RLS + GoTrue auth + Storage**, project ref **`ljdofwovsyaqydcbohhd`**.
- **Migrations:** forward-only SQL in `supabase/migrations/` (ledger:
  `docs/MIGRATIONS.md`). Apply via `supabase db push`, or directly via `psql`
  over the session pooler (`supabase/.temp/pooler-url` + `SUPABASE_DB_PASSWORD`).
- **Auth model:** managed students (teacher-created seats, claim via login code),
  plus quick-start course codes. See `docs/ARCHITECTURE.md`.

## Email, monitoring, CI

| Concern | Provider |
|---|---|
| Transactional email | **Resend** (SendGrid is the named alternative) |
| Error tracking | **Sentry** (`VITE_SENTRY_DSN`) |
| Product analytics | **PostHog** (`VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST`) |
| Web analytics | **Cloudflare Web Analytics** (free, privacy-first) |
| CI | **GitHub Actions** (`.github/workflows/ci.yml`) — build (tsc + vite) + smoke (hits a Supabase project) |

CI does **not** deploy. Deployment is Cloudflare Pages (git-integration or
`wrangler`).

## Key paths

| Path | What |
|---|---|
| `viewer/` | the React SPA (the only deployed artifact) |
| `viewer/public/_redirects` | Cloudflare Pages SPA rewrite |
| `supabase/migrations/` | forward-only DB migrations |
| `viewer/scripts/` | smoke suites + verification harnesses (offline tooling) |
| `docs/` | architecture, deployment, runbook, monitoring, this file |

## Things AI assistants get wrong here

- **Don't say Vercel.** It's Cloudflare Pages. (This file exists because that
  mistake was made.)
- **Don't add a `vercel.json` or a Node server** — the SPA rewrite is
  `_redirects`, and there's no backend to host.
- **Don't put secrets in `VITE_*`** — they ship to the browser. The service-role
  key stays in local shells / server-side scripts only.
- **Two sessions often share this working tree** — scope `git add` to specific
  files, never `-A`.
