# Pickleball Coaching

Canonical reference for the pickleball coaching course types. Companion to
[`COUNSELING.md`](./COUNSELING.md) (the other non-`class` vertical). Product vision
lives in [`PICKLEBALL_REQUIREMENTS_v3.md`](./PICKLEBALL_REQUIREMENTS_v3.md); the build
plan in [`PLAN_PICKLEBALL.md`](./PLAN_PICKLEBALL.md); the domain/theming layer in
[`PLAN_DOMAIN_LAYER.md`](./PLAN_DOMAIN_LAYER.md).

**Status: DEPLOYED to prod 2026-06-11** (migrations `0174`–`0193`) + merged to `main`
(Cloudflare build). Validated on prod: structural smoke + **`smoke-pickleball.mjs` 28/28
green** (auth/RLS/RPC/waitlist/auto-step). Follow-ups + the contribution model complete
(see bottom). Both demo courses fully seeded for visualization.

## What it is

A pickleball coaching academy layered onto the LMS as **two `course_type` values**
(extends the `class` / `counseling` model — see [`MIGRATIONS.md`](./MIGRATIONS.md) 0133):

| `course_type` | UI label | Who enrolls | Theme |
|---|---|---|---|
| `pickleball_player` | **Pickleball: Players** | players being coached | coaching (orange) |
| `pickleball_coach` | **Pickleball: Coaches** | coaches being developed | coaching (orange) |

The academy owner is the educator (`role='teacher'`); enrolled "students" are the
players (player course) or the coaches-in-development (coach course). Security roles
(`teacher`/`admin`/`student`) and all RLS are unchanged — see the Domain layer below.

## Surfaces (tab IA, gated in `ClassLayout.tsx`)

**Player course** (`pickleball_player`): Players (profiles) · Lessons (plan/recap + video) ·
Progress (assessments) · Drills (+homework) · Programs · Briefings · Events · Roster · Chat ·
Announcements · Materials · Settings. Student portal (`StudentCourseView`): own profile,
lessons timeline + check-in, progress card, homework, events, chat.

**Coach course** (`pickleball_coach`): Coaches (profiles) · Certifications · Development ·
Shadowing · Evaluations · Hours · Programs-taught · Roster · Chat · … . Coach (enrollee)
portal: own profile, development card, evaluations, hours, chat.

Surface components: `viewer/src/teacher/pickleball/*`, `viewer/src/student/pickleball/*`,
shared chat `viewer/src/components/pickleball/ChatPanel.tsx`, video helper
`viewer/src/lib/videoEmbed.ts`, skills taxonomy `viewer/src/lib/pickleballSkills.ts`.

## Data model (migrations 0174–0193)

| # | Tables / change |
|---|---|
| 0174 | `course_type` CHECK += pickleball values; `pickleball_programs` |
| 0175 | `pickleball_player_profiles` |
| 0176 | `pickleball_lessons` + `pickleball_lesson_videos` (link/upload) |
| 0177 | `pickleball_coach_profiles` + `pickleball_certifications` |
| 0178 | `pickleball_coach_devsteps` + `pickleball_hours_log` + `pickleball_coach_programs` (+ hours-totals view) |
| 0179 | `pickleball_chat_messages` (+ realtime publication) |
| 0180 | `pickleball_assessments` (immutable 10-skill snapshots; program level bands) |
| 0181 | `pickleball_drills` + `pickleball_homework` |
| 0182 | `pickleball_player_notes` (coach-private) + lesson check-in cols |
| 0183 | `pickleball_shadow_logs` + dev-step auto-completion triggers |
| 0184 | `pickleball_coach_evaluations` |
| 0185 | `pickleball_events` + `pickleball_event_registrations` (capacity/skill-gate/waitlist) |
| 0186 | `profiles.domain` + `set_my_domain` + `derive_user_domain` (domain layer) |
| 0190 | certs bucket → private; dropped broad homework player-UPDATE policy (writes via RPC) |
| 0191 | certs storage RLS **course-path-scoped** (`<course_id>/<coach_id>/<file>`) |
| 0192 | `derive_user_domain` also reads enrollments → player shell themes coaching |
| 0193 | `pickleball_lesson_videos.added_by`; player adds/removes own lesson clips; counseling revise-not-delete; videos-only storage policy |

19 `pickleball_*` tables, 42 `pk_*` RPCs (all `SECURITY DEFINER`, `SET search_path = public,
auth`, stable error codes, `GRANT EXECUTE TO authenticated`). RLS pattern: educator-full
(`is_teacher_of_course(...) OR is_admin(...)`) + the subject reads/writes own
(`player_id`/`coach_id`/`student_id = auth.uid()`); writes route through `pk_*` RPCs.
Storage buckets `pickleball-videos`, `pickleball-certs`.

### Notable behaviors
- **Dev-step auto-completion** — a devstep with `step_type` cert/hours/shadow + `auto_threshold`
  auto-closes (status→done + notifies coach+teacher) when its metric crosses the threshold;
  `pk_recompute_devsteps` is fired by AFTER triggers on `pickleball_hours_log`,
  `pickleball_shadow_logs` (signoff), `pickleball_certifications`.
- **Events** — `pk_register_event` enforces skill-gate + capacity server-side (over capacity →
  waitlisted); `pk_cancel_registration` promotes the lowest `waitlist_rank` + notifies. All
  capacity/waitlist math locks the event row `FOR UPDATE` (race-safe).
- **Injury check-in** — `pk_submit_checkin` with condition `injured` fans a
  `pickleball_checkin_injury` notification to the lesson's coach + course teacher.

## Domain layer (presentation/routing — not a security role)

`profiles.domain` (`academic` | `counseling` | `coaching`, nullable) drives per-vertical
**vocabulary** (educator label Teacher/Counselor/**Coach**; student label
Student/Advisee/**Player**/**Coach-in-training**) and **accent color** (indigo / emerald /
**orange**) via `lib/domain.ts` + `DomainProvider` (writes `--accent-*` CSS vars) + a
`DomainSwitcher` in both shells. `set_my_domain` self-updates only the caller's row;
`profiles.role` + RLS untouched. `domainOf(course_type)` maps the verticals.

## Follow-ups — DONE
- ✅ `smoke-pickleball.mjs` (`npm run smoke:pickleball`) — auth/RLS/RPC/waitlist/auto-step
  end-to-end, **28/28 green on prod**. Structural psql-rollback smoke also green.
- ✅ Whole-app **domain theming**: Tailwind `indigo`+`accent` driven by `--accent-*` channel
  vars, so switching domain re-themes the entire app (academic=indigo / counseling=emerald /
  coaching=orange), opacity + dark included.
- ✅ `pickleball-certs` bucket **private** (0190) + UI uses 1h **signed URLs**; storage RLS is
  now **course-path-scoped** (0191): path `<course_id>/<coach_id>/<file>`, access =
  educator-of-course OR admin OR the coach themself.
- ✅ **Per-course accent**: inside a course the accent themes by the course's domain
  (`previewDomain` on ClassLayout + StudentCourseView), reverting on leave — a Player in a
  pickleball course sees orange regardless of their saved domain.
- ✅ Assessment 1–5 skill avg → **2.0–5.5 band** remap; override-enroll **waitlist toast**;
  homework broad player-UPDATE policy **dropped** (writes via `pk_set_homework_status` only).

## Member contribution model (who can add content, by vertical)

Owner-specified (migration 0193); the educator/coach/counselor owns the structure everywhere.

| Vertical | Member (student) can |
|---|---|
| **Academic** (class) | nothing — read-only |
| **Counseling** | upload + **revise** their own Portfolio submissions; **cannot delete or reorder** |
| **Coaching** (player) | add + remove **their own** video clips/URLs to their lessons (for analysis); coach keeps full control |

## Demo data + seed scripts

`viewer/scripts/`: `seed-pickleball-demo.mjs` (mints the two demo courses + logins),
`seed-pickleball-iptpa.mjs` (IPTPA content), **`seed-pickleball-full.mjs`** (the
comprehensive seed — 18 drills with real verified YouTube videos, 7 players with
development-story assessments + lessons + homework, 5 clinics + registrations, 3 coaches
with certs/dev-tracks/evals, chat; idempotent find-or-create). Demo courses **`5W84HR`**
(players) + **`3KN2C6`** (coaches), owned by `kevyao@gmail.com` (admin, domain=coaching).

> **LINE note:** outbound LINE sending (`line-dispatch-minutely` cron, job 13) is currently
> **paused** (`active=false`) at the owner's request — re-enable via
> `cron.alter_job(job_id := 13, active := true)`.

## Open (minor)
- Storage path-scoping is course-level, not per-cert-row; fine for this model.
- (none blocking.)

## History note — the migration-number race
Built on the `feat/pickleball-coaching` worktree off a pre-LINE base. `main` advanced
`0146`→`0189` during the build (a parallel session), so the set was renumbered three times;
final clean block `0174`–`0186`. The prod push was **gated on a `supabase db push --dry-run`
that listed exactly the 13 files** — because `db push` matches by numeric prefix, a
same-numbered parallel migration would otherwise be silently skipped. Lesson recorded.
