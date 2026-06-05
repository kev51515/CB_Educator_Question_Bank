# viewer/scripts

Utility Node scripts that talk to the Supabase Cloud project backing the LMS.
All scripts read configuration from environment variables — **never** commit
keys.

---

## `seed-demo.mjs` — populate a demo dataset

Seeds the connected Supabase project with a small, deterministic demo dataset
so a fresh sign-in lands you in a populated LMS instead of an empty one.

### What it creates

- **1 teacher**
  - `demo-teacher@example.com` / `demoteacher123` — promoted to role `teacher`.
- **3 students**
  - `demo-student1@example.com` — *Alex Chen*
  - `demo-student2@example.com` — *Brianna Davis*
  - `demo-student3@example.com` — *Chris Patel*
  - All passwords: `demostudent123`. All email-confirmed.
- **2 classes**, both owned by the demo teacher:
  - `Demo: SAT Reading Spring 2026` — join code **`DEMO-RW01`** — Alex, Brianna, Chris enrolled.
  - `Demo: SAT Math Spring 2026` — join code **`DEMO-MT01`** — Alex + Brianna enrolled (Chris intentionally left out so you can demo joining).
- **3 assignments**:
  - *Reading Warm-up* (Reading class, `cb`, 5 q, 10 min)
  - *Reading Practice — Hard* (Reading class, `sat`, 10 q, 20 min, hard)
  - *Math Diagnostic* (Math class, `mixed`, 15 q, 30 min)
- **Pre-populated attempts** so the teacher dashboard has real scores:
  - Alex submitted *Reading Warm-up* (80%) and *Reading Practice — Hard* (70%).
  - Brianna submitted *Reading Warm-up* (60%).
  - Chris is intentionally pending — so the teacher view also shows a
    "Not started" row.

### How to run

From the `viewer/` directory:

```bash
SUPABASE_URL="https://<your-project-ref>.supabase.co" \
SUPABASE_ANON_KEY="<anon-key>" \
SUPABASE_SERVICE_KEY="<service-role-key>" \
  node scripts/seed-demo.mjs
```

Add `--quiet` to suppress per-step progress logs (the final summary still prints):

```bash
node scripts/seed-demo.mjs --quiet
```

### Re-runnable / idempotent

Every demo entity uses a deterministic `demo-*` / `Demo:%` prefix. On each run
the script first deletes any prior demo data before creating fresh rows:

1. Delete classes whose name starts with `Demo:` (cascades to assignments,
   attempts, memberships).
2. Delete `auth.users` whose email matches `demo-%@example.com` (cascades to
   profiles).
3. Delete `teacher_invite_codes` whose note starts with `demo-` (safety; the
   seed itself doesn't create any).

> **Why this order?** `classes.teacher_id` and `assignments.created_by` are
> `ON DELETE RESTRICT` references to `profiles(id)`, which itself cascades
> from `auth.users`. Classes must be dropped before the auth-user delete or
> the cascade is blocked. The script enforces this order.

### Reset-only mode

To wipe demo data without recreating it (e.g., before a clean redeploy):

```bash
RESET_ONLY=1 node scripts/seed-demo.mjs
```

The script runs only the reset phase and exits.

### Verifying the seed

Sign in to the app:

- As **`demo-teacher@example.com`** — should see both classes, the three
  assignments, and existing attempt scores per student.
- As **`demo-student3@example.com`** (Chris) — should see *Reading* class
  populated; use join code **`DEMO-MT01`** to enroll in the Math class, then
  take *Math Diagnostic*.

### Trade-offs / known simplifications

- **`result_detail` is stubbed.** The MVP does not snapshot question pools
  per attempt (see migration `0004_assignments.sql`), so the seeded
  `result_detail.questions` is an empty array. The score header and
  aggregate metrics render correctly; the per-question review screen will
  show no items for the demo attempts. Live student attempts populate
  questions normally.
- The seed uses fake question IDs (`demo-q1`...`demo-qN`) in the `answers`
  map — there is no attempt to align these with the real question bank.
- The teacher is promoted directly to `role='teacher'` via the service-role
  client. The seed does **not** mint and redeem a teacher invite code,
  because the seed shouldn't depend on an existing admin.

### ⚠️ Safety

This script **writes real rows to the connected cloud project** using the
service-role key (which bypasses RLS). Use it **only** against a
development or demo Supabase project — never against a project holding real
student data. The reset phase will permanently delete any prior rows that
match the `demo-*` / `Demo:%` prefix.

---

## Smoke pipeline — three suites + a driver

| Suite | What it covers |
|---|---|
| `smoke-e2e.mjs` | Provisions throwaway users with timestamped emails and walks the full teacher / student / admin auth → course → assignment loop against Supabase Cloud. 14 scenarios. |
| `smoke-features.mjs` | Modules, announcements, materials, portfolio, course clone, plus the RPC surface for rate-limit, mastery, prediction, GDPR export, audit-log reads, discussions, inbox, notifications, multi-attempts. 91 scenarios. |
| `smoke-modules.mjs` | Every operation a teacher can trigger from the Modules tab: inline-create, rename, publish toggle, add submodule, drag-into-as-child, indent / outdent, reorder, duplicate, item insert, item move across modules, bulk publish, cycle prevention, bulk delete. Signs in as the seeded demo teacher so RPCs see a real `auth.uid()`. 26 scenarios. |
| `smoke-all.mjs` | Driver that runs all three sequentially and prints a unified pass/fail summary. Exits non-zero if any suite fails. |

### Run them

```bash
# All three (recommended before any deploy):
npm run smoke

# Individually:
npm run smoke:e2e
npm run smoke:features
npm run smoke:modules
```

All four scripts require the same three env vars:
```
SUPABASE_URL=…
SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_KEY=…
```

The driver validates them once up front so a missing var fails fast.

### When to add a new suite

If you ship a new feature that touches the DB through RPCs not already
covered by `smoke-features.mjs`, write a dedicated `smoke-<feature>.mjs`
following the pattern in `smoke-modules.mjs`:
- Sign in as the demo teacher (so RPCs see a real auth context).
- Use a dedicated test-prefix on every row you create (e.g. `"smoke-test "`).
- Track inserted ids and delete them in a `finally` cleanup.
- Report `ok(name, cond, detail?)` for each scenario; print `TOTAL: N  PASS: N  FAIL: N` at the end.
- Add the suite to `SUITES` in `smoke-all.mjs` + a script alias to `package.json`.

---

## Clickthrough / hardening harnesses (one-off, not in smoke-all)

These provision **fresh disposable accounts per run** and self-clean on the way
out, so — like `loadtest` and `restore-drill` — they live as their own npm
scripts rather than in `smoke-all` (a dozen rapid sign-ins per run would risk
tripping the GoTrue per-IP sign-in rate limit and make `npm run smoke` flaky).

| Script | npm | What it covers |
|---|---|---|
| `clickthrough-two-students.mjs` | `npm run clickthrough` | Full real-world path for 2 students: teacher invites seats → each claims → each takes `dsat-nov-2023` end-to-end (all 98 Q across 4 modules). One answers from the key (expect full marks), one answers naively, proving the scoring engine discriminates. Then release + result read-back. 34 checks. |
| `clickthrough-practice-test.mjs` | — | Single-student deep happy-path (resume round-trip, eliminations, results gating, one-attempt lock, retake). 41 checks. |
| `clickthrough-practice-test-edges.mjs` | `npm run clickthrough:edges` | Linear negatives: out-of-order, double-submit, post-submit lockout, bogus run_id. 10 checks. |
| `clickthrough-edge-hardening.mjs` | `npm run harden` | Adversarial hardening across 7 groups: A cross-tenant access · B invite/claim abuse · C proctor authz (0104) · D retake idempotency · E input validation · F concurrency races · G **RLS direct-table bypass** (attacker hits tables directly via PostgREST — runs/answers/PII/answer-key must all be unreadable). 27 checks. |

```bash
npm run clickthrough        # 2-student invite → claim → full test
npm run harden              # adversarial edge-case + RLS hardening suite
npm run clickthrough:edges  # linear negative paths
```

Each exits non-zero on any failure and prints a per-defect summary. Run
`npm run harden` after any change to the test-runner RPCs, RLS policies, or the
claim/invite flow.

### CI

`.github/workflows/ci.yml` runs the pipeline on every push to `main` and
every PR. Two jobs:

- **build** — `tsc -b` + `vite build`. No secrets needed. Runs on fork PRs too.
- **smoke** — runs `npm run smoke`. Depends on `build`. Skipped on fork PRs
  (no secret access).

**One-time setup** — under repo Settings → Secrets and variables → Actions,
add these three repository secrets:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`

Point them at a **development or demo** Supabase project — every CI run
will create + delete test rows. Never at a project holding real student
data.
