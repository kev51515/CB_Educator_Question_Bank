# PLAN — Pickleball Coaching course types

Status: **planning** · Author: AI session 2026-06-10 · Owner decisions locked (see below)

> **Migration renumber (2026-06-10):** `main` reached `0158` (LINE integration + parallel
> session merged), colliding with the original `0150`–`0158` numbering below. Pickleball
> migrations were renumbered to **`0159`–`0167`** (order preserved): course_types `0159`,
> player_profiles `0160`, lessons `0161`, coach_core `0162`, coach_dev `0163`, chat `0164`,
> assessments `0165`, drills_homework `0166`, coach_efficiency `0167`. Re-check the live head
> again before merge — the parallel session may advance `main` further.

A pickleball coaching academy layered onto the LMS as **two new `course_type`
values**, following the same end-to-end pattern that added `counseling` (0133+):
extend the `course_type` CHECK enum → type-specific tables + RLS + RPCs → extend
the `CourseType` TS union → branch the tab strip in `ClassLayout` → add radios to
`ClassFormModal`/`CourseSettings` → gate student surfaces → add course-card badges.

## Owner decisions (locked 2026-06-10)

| Decision | Choice |
|---|---|
| Player vs Coach modeling | **Two separate course types** |
| Naming / scope | **Pickleball-specific** |
| Lesson-recap video | **Both** — paste a link AND upload a file |
| Community chat | **Dedicated real-time chat** (Supabase Realtime) |

### Course type values

| `course_type` | UI label | Track |
|---|---|---|
| `pickleball_player` | **Pickleball: Players** | Players being coached |
| `pickleball_coach` | **Pickleball: Coaches** | Coaches being developed |

Vocabulary canon: internal enum values stay `pickleball_player` / `pickleball_coach`;
user-facing strings are "Pickleball: Players" / "Pickleball: Coaches".

## Surfaces (tab IA)

**Player course** (`pickleball_player`): Roster · **Players** (profiles) · **Lessons**
(schedule + plan + recap + video) · **Programs** · **Chat** · Announcements · Materials · Settings

**Coach course** (`pickleball_coach`): Roster · **Coaches** (profiles) · **Certifications** ·
**Development** (next-steps) · **Hours** (log + totals) · **Programs taught** · **Chat** ·
Announcements · Materials · Settings

(Modules / Assignments / Grades / Skills / Portfolio / Caseload do not apply and are hidden.)

## Data model (forward-only migrations)

**Phase 0 — `0150_pickleball_course_types.sql`**
- Extend `courses.course_type` CHECK to allow `pickleball_player`, `pickleball_coach`.
  (Index `courses_course_type_idx` already exists from 0133.)

**Phase 1 — Player track**
- `pickleball_programs(id, course_id→courses, name, description, sort_order, archived)` — per-course lookup (Newbie / Level Up / Master Class …).
- `pickleball_player_profiles(course_id, student_id→profiles, dob, years_played, sports_background, goal text-enum [fun|fitness|competition|skill], goal_notes, referred_by, skill_level, dupr numeric, dominant_hand, start_date, contact, emergency_contact, …)`. One per (course, student).
- `pickleball_lessons(id, course_id, player_id→profiles, coach_id→profiles, program_id→pickleball_programs, scheduled_at, duration_min, location, status [scheduled|completed|recapped|cancelled], plan_md, recap_md, created_at)`.
- `pickleball_lesson_videos(id, lesson_id→pickleball_lessons, kind [link|upload], url, storage_path, title, sort_order)` — supports BOTH video modes.
- RLS: educator-of-course full; student reads own player rows. RPCs: `pk_upsert_player_profile`, `pk_schedule_lesson`, `pk_recap_lesson`, `pk_set_lesson_status`.

**Phase 2 — Coach track**
- `pickleball_coach_profiles(course_id, coach_id→profiles, personal info…)`.
- `pickleball_certifications(id, coach_id, course_id, name, issuing_body, level, earned_on, expires_on, cert_no, file_url)`.
- `pickleball_coach_devsteps(id, course_id, coach_id, title, detail, status [open|done], notes, due_on, completed_at)` — modeled on `counseling_tasks`.
- `pickleball_hours_log(id, course_id, coach_id, taught_on, hours numeric, program_id, num_players, notes)` → running total via view.
- `pickleball_coach_programs(coach_id, program_id, status [training|cleared])`.
- RLS + RPCs: `pk_log_hours`, `pk_add_certification`, `pk_complete_devstep`, `pk_set_coach_program`.

**Phase 3 — Chat**
- `pickleball_chat_messages(id, course_id, sender_id→profiles, body, created_at, edited_at, deleted_at)`.
- RLS: any enrolled member of the course reads + posts; author/educator can soft-delete.
- Add table to the `supabase_realtime` publication. `ChatPanel` subscribes via Supabase Realtime.

## Frontend touch-points

- `viewer/src/teacher/useTeacherClasses.ts` — extend `CourseType` union + row normalization.
- `viewer/src/teacher/ClassFormModal.tsx` — add 2 radio options (grid → wrap).
- `viewer/src/teacher/CourseSettings.tsx` — add 2 radio options + type-switch.
- `viewer/src/teacher/ClassLayout.tsx` — 2 new tab-order branches + nested routes for new surfaces.
- `viewer/src/student/StudentCourseView.tsx` — gate player/coach student portals.
- `viewer/src/dashboard/DashboardPage.tsx` + `viewer/src/admin/AllClassesView.tsx` — course-card badges.
- `viewer/src/lib/routes.ts` — route constants/builders for new surfaces.
- New surface components under `viewer/src/teacher/pickleball/*` and `viewer/src/student/pickleball/*`.
- Video: `viewer/src/lib/videoEmbed.ts` (YouTube/Vimeo/Drive URL → embed) + `FileDropzone` upload to a `pickleball-videos` storage bucket.

## Verification

- `viewer/scripts/smoke-pickleball.mjs` → add to `smoke-all.mjs`.
- `npx tsc -b` green between phases.
- Cloud: confirm live migration head (`supabase migration list`) BEFORE `db push` — the
  working tree has gaps vs cloud (0147 parallel session, 0148 dashless codes, 0149 LINE).
- Deploy = push to `main` → Cloudflare Pages auto-build (NOT Vercel).

## Risks / notes

- **Shared working tree + parallel session** — scope every `git add` to pickleball files; never `-A`.
- **Migration numbering** — confirm the real cloud head before numbering; 0150 is provisional.
- `clone_course` (0036) does not copy `course_type` (known pre-existing gap) — duplicating a
  pickleball course currently yields a `class`. Out of scope unless requested.
- Coaches-as-enrollees: in `pickleball_coach` courses the enrolled "students" ARE the coaches
  being developed; the academy owner is the educator. The student-side portal renders the
  coach-development surfaces for them.
