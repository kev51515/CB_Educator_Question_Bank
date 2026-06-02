# SCHEMA.md — Current database schema reference

**Purpose:** a single, accurate place to check table/column/function names
**before** writing SQL, so we stop repeating drift mistakes (the classic one:
writing `class_id` / `is_teacher_of_class` after migration 0012 renamed them).

- **Source of truth:** the live Supabase project `ljdofwovsyaqydcbohhd`
  (linked). Migrations are forward-only under `supabase/migrations/`.
- **Verified:** 2026-06-02, against the live DB. **Remote has 0001–0061 applied**
  (Local=Remote for every file; full smoke suite green). 0057 had to be fixed
  first — its `CREATE OR REPLACE VIEW assignment_best_attempts` inserted
  `effective_score` mid-column-list (illegal `42P16`); moved to the end so the
  view only appends, then 0057–0060 pushed cleanly.
- **Regenerate a full dump** (needs the DB password, so run it yourself):
  `supabase db dump --schema public -f docs/schema.snapshot.sql`
- When you change the schema with a new migration, update this file too.

> ⚠️ **The #1 gotcha — the "classes → courses" rename (migration 0012).**
> The URL/UI and the DB both say **course** now. Old `class*` names are GONE.

---

## 1. Naming / rename map (0012) — use the RIGHT name

| ❌ Old (removed) | ✅ Current | Where |
|---|---|---|
| table `classes` | table `courses` | — |
| column `class_id` | column **`course_id`** | `assignments`, `course_modules`, `course_memberships` |
| `is_teacher_of_class(uuid,uuid)` | **`is_teacher_of_course(uid, p_course_id)`** | RLS helper (old one DROPPED) |
| `class_memberships` | `course_memberships` | join table |
| `join_class_by_code` | `join_course_by_code` | RPC |
| `regenerate_class_join_code` | (course variant) | RPC |

Other naming traps:
- `course_memberships` keys the student as **`student_id`** (NOT `user_id`).
- `assignments.created_by`, `assignment_attempts.student_id`,
  `assignment_attempts.grader_id` — different "who" columns; don't assume `user_id`.
- **Ambiguous:** both `is_student_in_class(uid, p_class_id)` (kept, body queries
  courses) and `is_student_in_course(uid, p_course_id)` (0028) exist. Grep recent
  migrations for the one actually in use before adding a new caller.

---

## 2. Security/helper functions (use in RLS; never inline EXISTS on `profiles`)

| Function | Signature | Meaning |
|---|---|---|
| `is_staff` | `(uid uuid) → bool` | teacher OR admin |
| `is_admin` | `(uid uuid) → bool` | admin only |
| `is_teacher` | `(uid uuid) → bool` | teacher role |
| `is_teacher_of_course` | `(uid uuid, p_course_id uuid) → bool` | teacher owns that course |
| `is_student_in_course` | `(uid uuid, p_course_id uuid) → bool` | enrolled student |
| `is_student_in_class` | `(uid uuid, p_class_id uuid) → bool` | legacy name, course-backed body |

Pass `(SELECT auth.uid())` (subselect form) so the planner caches it per query.

---

## 3. Core tables (live columns)

**courses** — `id, teacher_id, name, description, join_code, archived,
created_at, updated_at, is_template, short_code`

**course_memberships** — `id, course_id, student_id, joined_at`

**course_modules** — `id, course_id, name, position, published, opens_at,
lock_at, parent_module_id, created_at, updated_at`

**profiles** — `id, email, display_name, role, created_at, updated_at`
(role ∈ student|teacher|admin; INSERT only via the auto-profile trigger; self
UPDATE allowed but **cannot change role** — and beware the profiles RLS
recursion trap, see 0008/0013.)

**assignments** — `id, course_id, created_by, title, description, source_id,
question_count, time_limit_minutes, difficulty_mix, due_at, opens_at, archived,
max_attempts, late_penalty_percent, grace_period_hours, short_code, kind,
qbank_set_uid, qbank_set_label, created_at, updated_at`
(`kind` ∈ mocktest|qbank_set; `source_id` nullable since 0045.)

**assignment_attempts** — `id, assignment_id, student_id, started_at,
submitted_at, score_percent, correct_count, total_questions, duration_seconds,
result_detail (jsonb), answers (jsonb), client_attempt_id, feedback_text,
score_override, graded_at, grader_id, created_at, updated_at`
(grading columns added 0056; `assignment_attempts_effective` view exposes
`effective_score = COALESCE(score_override, score_percent)`.)

**assignment_attempt_questions** — per-attempt question snapshot (0014):
`attempt_id, position, question (jsonb)`.

---

## 4. Full-length tests feature (migrations 0048–0056)

Proctored, server-graded full tests (e.g. the Nov-2023 DSAT, slug
`dsat-nov-2023`). **Question text + answer key live ONLY in Postgres** —
students cannot SELECT `test_questions`; content is delivered per-module via
SECURITY DEFINER RPCs with the key stripped.

**tests** — `id, slug, ordinal, title, short_title, source, total_questions, created_at`
*(SELECT: any authenticated)*

**test_modules** — `id, test_id, position, section ('reading-writing'|'math'),
label, time_limit_seconds, question_count` *(SELECT: any authenticated)*

**test_questions** — `id, module_id, position, ref, number, type ('mcq'|'grid'),
passage, passage_alt, stem, choices (jsonb), figure, correct_answer, accepted
(jsonb), domain, source_page`
*(SELECT: staff only — `is_staff`. Grids store the answer in `accepted`;
`correct_answer` is NULL for grids.)*

**test_runs** — `id, user_id, test_id, status ('in_progress'|'submitted'|
'abandoned'), current_module, current_module_started_at, started_at,
submitted_at, score, total, section_scores (jsonb), duration_seconds,
module_timing (jsonb)` *(RLS: owner only; partial unique index = one active run
per (user,test).)*

**test_run_answers** — `run_id, question_id, module_position, chosen,
is_correct, time_ms, answered_at` *(owner SELECT only; written only by DEFINER
RPCs, so `is_correct` can't be forged. A draft = `is_correct IS NULL`.)*

### RPCs (all SECURITY DEFINER, `SET search_path = public, auth`)
| RPC | Args | Returns |
|---|---|---|
| `start_test` | `(p_slug text)` | run + module metadata (no questions) + `answered` (count of recorded answers; drives the resume label — 0061) |
| `get_test_module` | `(p_run_id uuid, p_position int)` | module questions (**no key**) + `seconds_remaining` + `saved_answers` (drafts) |
| `save_test_progress` | `(p_run_id uuid, p_position int, p_answers jsonb)` | persists ungraded drafts |
| `submit_test_module` | `(p_run_id uuid, p_position int, p_answers jsonb)` | grades server-side, advances; records `module_timing`/`timed_out` |
| `get_test_result` | `(p_run_id uuid)` | full review **with** key (only once submitted) |

Stable error codes raised: `not_authenticated`, `test_not_found`,
`run_not_found`, `not_authorized`, `run_already_submitted`,
`run_not_submitted`, `module_out_of_order`.

Grading helpers: `_spr_numeric(text) → numeric` (parses `a/b` & decimals),
`_grade_answer(type, correct, accepted, chosen) → bool` (mcq = case-insensitive
letter; grid = `accepted` membership OR numeric-equality against the canonical
value, which for grids comes from `accepted[0]` — fixed in 0055).

---

## 5. Migration conventions (from CLAUDE.md, re-confirmed by 0056's bugs)

- **Forward-only.** No rollbacks. Pick the **next free number** — and check the
  parallel session isn't using it (a `0053` collision happened in Wave 20:
  always `ls supabase/migrations | tail` before naming).
- Triggers/RPCs that write another table → **`SECURITY DEFINER` +
  `SET search_path = public, auth`** (else RLS blocks the write).
- **Never** inline `EXISTS (SELECT 1 FROM profiles ...)` in a profiles policy —
  use a SECURITY DEFINER helper (recursion bug, 0008/0013).
- RPCs raise **stable string error codes** the client switches on.
- Prefer **`short_code`** over `id` in URLs (courses/assignments/discussions).
- A `CREATE OR REPLACE VIEW` can only **append** columns — never reorder/rename
  existing ones (else `42P16`; the 0057 fix). Add new columns last, or DROP+CREATE.
- **Views over RLS tables must be `security_invoker = on`** (PG15+) or they run
  as the view owner and BYPASS the base table's RLS (cross-user data leak). The
  `assignment_*` views were fixed in 0065; set this on any new view over an
  RLS-protected table.
- **Push migrations:** `cd viewer && npm run db:push` (forward extra flags:
  `npm run db:push -- --include-all`). It reads `SUPABASE_DB_PASSWORD` and uses
  the **session pooler** (the direct `db.<ref>.supabase.co` host won't resolve
  on IPv4-only networks). Region host: `aws-1-ap-southeast-2.pooler.supabase.com`.
- **After backend changes run the smoke suites:** `cd viewer && npm run smoke`
  (or `smoke:grading`, `smoke:cascade`, …). Secrets auto-load from the
  **gitignored root `.env`** (`SUPABASE_URL`/`ANON_KEY`/`SERVICE_KEY`/
  `DB_PASSWORD`) via `--env-file-if-exists` — no need to paste keys inline.

---

## 6. Migration ledger

`supabase/migrations/0001 … 0065`. **Live on remote: 0001–0061 + 0065** (0062–0064
are a parallel session's; 0063/0064 portfolio-import not yet pushed). Recent:
- 0065 RLS fix: `assignment_best_attempts` + `assignment_attempts_effective`
  set `security_invoker = on` (closed a cross-student best-score leak)
- 0048 full-test schema + RPCs · 0049 DSAT Nov-2023 seed
- 0050 security audit/cascade · 0051 full-test hardening (timing + drafts)
- 0052 fix M3-Q16 stem typo · 0053 fix M1-Q13 choice typo
- 0054 announcement publish_at · 0055 grid numeric grading fix
- 0056 grading persistence (assignment grading columns/RLS/audit/view)
- 0057 `assignment_best_attempts`/`_effective` pick by effective score
  (effective_score appended as last view column — see migration header)
- 0058 scheduled-announcement cron fan-out · 0059 grade-complete notification
- 0060 `test_attempts.user_id` FK → profiles (3-phase NOT VALID + VALIDATE)
- 0061 `start_test` returns `answered` → full-test resume label fix
