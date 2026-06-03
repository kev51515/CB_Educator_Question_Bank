# LMS Features

A catalog of the complete feature space for this SAT-prep LMS — built, partially built, unbuilt, and explicitly out of scope. Treat this as a reference menu so future feature decisions can be made by selecting from a known surface rather than re-brainstorming.

## 1. How to read this doc

`docs/LMS_ROADMAP.md` is the prioritized BUILD path: the next four weeks, opinionated about which gaps to close. This doc is a CATALOG — every feature plausibly relevant to an LMS or test-prep product, including ones we will deliberately never build. The point is a map of the territory.

Each feature has a status tag, brief description, and (for unbuilt items) an effort tag and one-line schema/UI sketch. Status tags:

- **✓ Built** — works today, can point at the file
- **◐ Partial** — built but unwired, missing a critical piece, or only one side of the loop exists
- **○ Not built** — no code yet
- **✗ Out of scope** — deliberately won't build, with rationale in section 5

Effort tags: **S** (hours), **M** (days), **L** (week-plus), **XL** (multi-week). All status claims were verified against the codebase. If you change a feature's status, update this doc.

## 2. The feature tree

### A. Identity + access control

| Feature | Status | Notes |
|---|---|---|
| Email + password sign-up / sign-in | ✓ Built | `auth/AuthScreen.tsx`, `auth/session.ts` |
| Anonymous quick-start with class code | ✓ Built | `quick_start_with_code` RPC + `QuickStartScreen.tsx` |
| Password reset (email link flow) | ✓ Built | `PasswordResetScreen.tsx`, recovery session via `onAuthStateChange` |
| Email verification | ◐ Partial | Supabase supports it; needs flip in cloud console per `DEPLOYMENT.md` |
| Anonymous → permanent account upgrade | ✓ Built | `UpgradeAccountModal.tsx` calls `supabase.auth.updateUser({ email, password })`; `AccountUpgradeBanner` surfaces it |
| Profile editing (name, email, password) | ✓ Built | `AccountSettings.tsx`, including email-change confirmation flow |
| Role gating at signup | ✓ Built | All signups default to `student`; teacher path is `redeem_teacher_invite` |
| Teacher invite codes | ✓ Built | `mint_teacher_invite` / `redeem_teacher_invite` / `revoke_teacher_invite`; UI in `AdminInviteCodesPage.tsx` |
| First-admin bootstrap | ✓ Built | `bootstrap_first_admin` RPC, service-role only |
| SSO / SAML / OAuth providers | ○ Not built | M; Supabase provider config + sign-in button row |
| 2FA / MFA | ○ Not built | M; Supabase MFA enrollment + `AAL2` session check |
| Account deletion (GDPR) | ◐ Partial | `export_my_data()` RPC shipped in `0023_gdpr_dedup.sql` and surfaced in `AccountSettings.tsx`; deletion side still needs `delete_my_account()` RPC + confirm modal |
| Audit log | ✓ Built | `audit_log` table + triggers in `0022_audit_log.sql` / `0027_audit_more.sql` |
| Per-IP / per-uid rate limit on auth RPCs | ✓ Built | `0021_rate_limit.sql` throttles `join_class_by_code` / `quick_start_with_code` |
| Session timeout / forced re-auth | ○ Not built | S; Supabase JWT TTL + activity timer |
| Magic link login | ○ Not built | S; flip on in Supabase, add "Email me a link" button |

### B. Classes (= courses)

| Feature | Status | Notes |
|---|---|---|
| Class CRUD (create / edit / delete) | ✓ Built | `ClassFormModal.tsx`, direct `from('classes')` writes under RLS |
| Class archive / unarchive | ✓ Built | `archived` flag on `classes`; toggled from `ClassDetailView` |
| Class join codes | ✓ Built | 8-char alphanumeric, retry on PG `23505`, displayed on detail view |
| QR / shareable URL invites | ✓ Built | `QRCodeSVG` in `ClassDetailView`; `?code=` and `#code=` deep links parsed by `AuthGate` |
| Class capacity / waitlists | ○ Not built | S; `classes.max_seats int` + check in `join_class_by_code` |
| Co-teachers / TAs | ○ Not built | M; `class_teachers(class_id, teacher_id, role)` + rewrite `is_teacher_of_class` |
| Class templates (clone settings + materials) | ✓ Built | `clone_course` RPC + `is_template` flag in `0018_course_clone.sql`; "Create from template" path in `ClassFormModal.tsx` |
| Class import / export (JSON) | ○ Not built | M; serialise class + assignments + roster snapshot |
| Class metadata (room, time, semester) | ◐ Partial | `description` exists, no structured fields; would need `meeting_pattern jsonb` |
| Sub-classes / sections | ○ Not built | M; `class_sections(class_id, name)` + optional `assignment.section_id` |
| Cross-class assignment templates | ○ Not built | M; library of saved configs reusable across classes |

### C. Roster + people

| Feature | Status | Notes |
|---|---|---|
| Manual student enrollment via code | ✓ Built | `join_class_by_code` RPC, `JoinClassModal.tsx` |
| Bulk roster CSV / paste import | ✓ Built | `BulkRosterModal.tsx` — CSV/paste import flow on the teacher roster page |
| Teacher removes student | ✓ Built | Remove action exposed in `ClassRoster.tsx` |
| Student leaves class | ✓ Built | `ConfirmLeaveDialog` in `MyClassesPanel.tsx` |
| Student sub-grouping inside class | ○ Not built | M; ties to B-sub-sections |
| Parent / guardian read-only access | ○ Not built | L; new `guardian` role + `guardian_links(guardian_id, student_id)` + dashboard view |
| Co-teacher invites | ○ Not built | M; depends on B-co-teachers |
| Roster export (CSV) | ○ Not built | S; client-side CSV from `useClassRoster` |
| Per-student notes (teacher-only) | ○ Not built | S; `student_notes(class_id, student_id, body)` |
| Student profile photo / avatar | ○ Not built | S; Supabase Storage avatar bucket + `profiles.avatar_url` |

### D. Assignments + assessments

| Feature | Status | Notes |
|---|---|---|
| Create / edit / delete assignment | ✓ Built | `AssignmentFormModal.tsx`, `AssignmentsPage.tsx` |
| Assignment archive | ✓ Built | `archived` flag; archived rows rendered muted in list |
| Question source picker (CB / SAT / mixed) | ✓ Built | `source_id` enum, CHECK matches `TestSourceId` union |
| Question count + time limit + difficulty mix | ✓ Built | All three columns enforced by CHECK in `0004_assignments.sql` |
| Due date + open date | ✓ Built | `due_at`, `opens_at` on `assignments` |
| Multiple attempts per assignment | ✓ Built | `0020_multi_attempts.sql` lifts the unique constraint and adds `attempt_number`; `max_attempts` configurable in `AssignmentFormModal.tsx` |
| Late submission policy | ✓ Built | `late_penalty_percent` + `grace_minutes` columns wired in `AssignmentFormModal.tsx` |
| Per-student extensions | ○ Not built | M; `assignment_extensions(assignment_id, student_id, due_at, extra_minutes)` |
| Assignment templates (save + reuse) | ○ Not built | M; `assignment_templates` owned by teacher, "Create from template" |
| Question pool snapshot (resume integrity) | ✓ Built | `0014_attempt_snapshot.sql` adds the attempt-questions table + `start_assignment_attempt`; `QuestionSnapshot.tsx` renders from it |
| Auto-grading (MCQ) | ✓ Built | Computed at submit-time in `MockTestApp` from answer key |
| Manual grading (free-response) | ○ Not built | L; needs `manual_score`, `graded_by`, `graded_at` + SpeedGrader-style UI |
| Rubrics | ✗ Out of scope | MCQ doesn't need them; reconsider only if essays return |
| Peer review | ✗ Out of scope | Not a fit for SAT prep |
| Self-assessment / reflection | ○ Not built | S; per-attempt text field surfaced on submit |
| Anti-cheat (lockdown, randomization, time-tracking) | ◐ Partial | Time tracked via `started_at`/`duration_seconds`; no lockdown, no randomization seed stored |
| Make-up exams | ○ Not built | S; depends on per-student extensions |
| Assignment scheduling (auto-publish later) | ◐ Partial | `opens_at` exists but no UI filter for "not yet open" on student side |

### E. Mock test runner

| Feature | Status | Notes |
|---|---|---|
| Phase machine (setup → loading → running → submitted) | ✓ Built | `MockTestApp.tsx` |
| Free-practice mode | ✓ Built | No `assignment` prop; `localStorage` mirror keyed `mocktest.session:<userId>` |
| Assignment-driven mode | ✓ Built | `MockTestAssignmentContext`; setup skipped, DB is source of truth |
| Localstorage resume (free practice) | ✓ Built | Cleared on submit/reset/exit |
| DB-backed resume (assignment) | ✓ Built | Snapshot table (`0014_attempt_snapshot.sql`) pins items per attempt; `AssignmentRunner.tsx` resumes against it |
| Flag for review / skip / return | ✓ Built | Question navigation in `MockTestApp` |
| SAT-style break screen (between modules) | ✓ Built | `mocktest/components/BreakScreen.tsx` |
| KaTeX math rendering | ✓ Built | `katex` in `package.json`; rendered via `mocktest/components/RichText.tsx` |
| Real SAT scaled scoring (1600 scale) | ○ Not built | L; needs conversion tables + calibration. (The `ScorePrediction.tsx` linear-v1 stub was removed 2026-06-03 — its low-data band misled students; the `0024` RPC stays but is no longer surfaced) |
| Adaptive modules (Module 2 routes off Module 1) | ○ Not built | L; full SAT-day simulation; deferred |
| Section timing + auto-advance | ◐ Partial | Time limit enforced; no per-section timing or auto-move |
| Calculator (Desmos-style) embed | ○ Not built | M; iframe Desmos test calculator |
| Reference sheet (formulas) | ○ Not built | S; static panel toggle in runner |
| Highlight + strike-out on question text | ◐ Partial | Bank viewer has `Highlight.tsx`; mock-test runner does not reuse it |

### F. Question bank (legacy viewer)

| Feature | Status | Notes |
|---|---|---|
| Browse by domain / skill / difficulty | ✓ Built | `SidebarV2`, facet filters |
| Search | ✓ Built | `SidebarSearchBox` |
| Filter presets | ✓ Built | `FilterPresets.tsx` |
| Bookmarks | ✓ Built | `useLocalStorageSet("sat:bookmarks")` |
| Notes | ✓ Built | `NoteEditor.tsx`, `ChoiceAnalysis` per-choice notes |
| Spaced repetition (SRS) | ✓ Built | `SpacedRepetition.tsx` — FSRS-lite, `localStorage` |
| Print sets / worksheets | ✓ Built | `PrintSet.tsx`, `PdfExport.tsx`, `DraggablePrintList.tsx` |
| Compare view (side-by-side) | ✓ Built | `CompareView.tsx` |
| Practice mode (one-question drill) | ✓ Built | `PracticeMode.tsx` |
| Confidence ratings | ✓ Built | `ConfidenceRating.tsx` |
| Knowledge graph view | ✓ Built | `KnowledgeGraph.tsx` (lazy) |
| Activity calendar (per-student streak) | ✓ Built | `ActivityCalendar.tsx` |
| Reading mode | ✓ Built | `ReadingMode.tsx` |
| Annotations / highlights | ✓ Built | `Annotations.tsx`, `Highlight.tsx` |
| Bank progress dashboard | ✓ Built | `ProgressDashboard.tsx` |
| Tagging system (user tags) | ✓ Built | `TagSystem.tsx` |
| Bank state export / import (JSON) | ✓ Built | `StateExport.tsx` |
| Server-side persistence of bank state | ○ Not built | M; currently `localStorage` only — won't survive device change |

### G. Gradebook + analytics

| Feature | Status | Notes |
|---|---|---|
| Per-assignment attempts list (teacher) | ✓ Built | `AssignmentAttemptsView.tsx` |
| Per-attempt detail (teacher) | ✓ Built | `TeacherAttemptDetailView.tsx` |
| Per-student attempt review (student) | ✓ Built | `StudentAttemptReview.tsx` |
| Per-class gradebook table (students × assignments) | ✓ Built | `CourseGradebook.tsx` — sticky-column students × assignments scoreboard |
| Per-student progress trend | ○ Not built | M; line chart over attempt history; depends on multi-attempt |
| Per-assignment item analysis | ◐ Partial | `result_detail.bySkill` exists per attempt; no class-aggregate view |
| Skill mastery heatmap (class) | ✓ Built | `0024_mastery_predictions.sql` view + `SkillHeatmap.tsx` |
| Class average vs individual | ○ Not built | S; once gradebook RPC exists, add an avg row |
| Score predictions (SAT 1600 scale) | ○ Not built | UI removed 2026-06-03 (low-data band misled students). `0024_mastery_predictions.sql` RPC remains but is unused; real scaled scoring needs a calibration cohort |
| CSV export (gradebook) | ✓ Built | Client-side CSV download from `CourseGradebook.tsx` |
| PDF report (per-student) | ○ Not built | M; reuse `PdfExport` machinery; render attempt history + skill breakdown |
| Admin system stats | ✓ Built | `admin_dashboard_stats` RPC + `SystemStats.tsx` |
| Time-per-question analytics | ◐ Partial | `duration_seconds` per attempt; no per-question timer persisted |

### H. Content delivery

| Feature | Status | Notes |
|---|---|---|
| Pages / wiki | ○ Not built | M; `class_pages(class_id, slug, title, body_md, published)` + lightweight markdown renderer |
| Materials / file uploads | ✓ Built | `0016_materials.sql` + `CourseMaterials.tsx` / `AddMaterialModal.tsx` / `useMaterials.ts` on Supabase Storage |
| External links | ✓ Built | `kind='link'` rows in the materials table |
| Notes (teacher-authored markdown) | ○ Not built | S; `kind='note'` in materials |
| Video / media embeds | ○ Not built | S; YouTube / Vimeo iframe in pages |
| Modules / lesson sequences | ✓ Built | `0011_modules.sql` defines `modules` + `module_items`; surfaced in teacher course shell |
| Resource library (cross-class) | ○ Not built | M; teacher-scoped library + "Add to class" |
| Rich-text editor | ○ Not built | M; pick lightweight (TipTap or markdown textarea) — no library is in `package.json` today |

### I. Communication

| Feature | Status | Notes |
|---|---|---|
| Per-class announcements | ✓ Built | `0015_announcements.sql` + `CourseAnnouncements.tsx` / `CourseAnnouncementsList.tsx` |
| Direct messaging | ✓ Built | `0026_inbox.sql` + `InboxPage.tsx` |
| Class discussions / forum threads | ✓ Built | `0025_discussions.sql` + `CourseDiscussions.tsx` / `DiscussionTopicView.tsx` / `TopicFormModal.tsx` with threaded posts |
| Reply notifications | ◐ Partial | In-app notifications fire on new posts; no email reply notifications yet |
| Email digests (daily / weekly) | ◐ Partial | `assignment-due-reminders` Edge Function sends due-soon mail via Resend; no general daily/weekly digest yet |
| In-app notification bell | ✓ Built | `0029_notifications.sql` + `NotificationBell.tsx` in `StaffShell` |
| Push notifications (Web Push) | ○ Not built | L; service worker already registered; add push subscription + VAPID keys |
| @mentions in discussions | ○ Not built | M; depends on discussions |
| Office hours signup | ○ Not built | M; `office_hour_slots`, `office_hour_bookings`; or punt to Calendly |

### J. Calendar + scheduling

| Feature | Status | Notes |
|---|---|---|
| Assignment due dates on a calendar | ✓ Built | `calendar/CalendarPage.tsx` renders due/opens dates on a grid |
| Class schedule / recurring events | ○ Not built | M; `class_events(class_id, rrule, title)` |
| Office hours booking | ○ Not built | M; see I |
| Personal study calendar | ○ Not built | S; per-student local-state planner |
| Sync to Google / Apple calendar (ICS) | ○ Not built | M; static ICS feed per class |
| Reminder cadences | ○ Not built | M; depends on email outbox |

### K. Administration

| Feature | Status | Notes |
|---|---|---|
| All classes view | ✓ Built | `AllClassesView.tsx`, gated by `is_admin` |
| All users view | ✓ Built | `AllUsersView.tsx` |
| Promote / demote (role changes) | ✓ Built | `set_user_role` RPC, refuses self-demotion |
| Delete user | ✓ Built | `admin_delete_user` RPC; CASCADE handles dependents |
| Manual data fixes | ◐ Partial | Service-role console only (SQL editor); no in-app surface |
| System stats console | ✓ Built | `admin_dashboard_stats` |
| Teacher invite code management | ✓ Built | `AdminInviteCodesPage.tsx`, plus `is_staff` lets teachers manage too (0009) |
| Multi-tenant orgs / schools | ○ Not built | L; `organizations` root + `organization_id` on `classes` + RLS rewrite. Cheap if done before 100+ classes |
| White-label / branding | ○ Not built | M; per-org logo/colors via `organizations.branding jsonb` |
| Custom domains | ○ Not built | M; Vercel project alias + per-org subdomain |
| Billing / subscriptions | ○ Not built | L; Stripe + `subscriptions` table + entitlements |
| Anonymous user cleanup | ✓ Built | `cleanup-anon-users` Edge Function + cron binding in `0031_cron_schedules.sql` |
| Audit log | ✓ Built | See A — `0022_audit_log.sql` + `0027_audit_more.sql` |
| Backups + restore procedure | ◐ Partial | Supabase PITR (7d free / 14d Pro); no documented restore drill |
| Per-RPC rate limiting | ✓ Built | `0021_rate_limit.sql` — applied to join/quick-start RPCs |
| Feature flags | ○ Not built | S; `feature_flags(key, enabled, audience)` + hook |

### L. Integrations

| Feature | Status | Notes |
|---|---|---|
| LTI (Canvas / Schoology / Moodle) | ✗ Out of scope | This is the destination, not an embed |
| Google Classroom | ✗ Out of scope | Same rationale |
| Stripe (billing) | ○ Not built | M; needs subscriptions, customer portal, webhooks |
| Resend / SendGrid (transactional email) | ✓ Built | Resend wired into `assignment-due-reminders` Edge Function; no general outbox yet |
| Sentry (error reporting) | ○ Not built | S; add `@sentry/react` to viewer init |
| PostHog / Plausible (product analytics) | ○ Not built | S; script tag + minimal events |
| Calendly (office hours fallback) | ○ Not built | S; embed link in class settings |
| Zoom / Google Meet (live class link) | ○ Not built | S; URL field on class — punt the hosting |
| Desmos test calculator | ○ Not built | S; iframe embed; bundle-free |
| College Board API | ✗ Out of scope | No public partner API for SAT items |

### M. SAT-specific pedagogy

| Feature | Status | Notes |
|---|---|---|
| Per-skill breakdown on attempt | ✓ Built | `attemptReview.ts` computes `bySkill`, `byDomain`, `byDifficulty` |
| Score predictions (SAT scaled) | ○ Not built | `ScorePrediction.tsx` stub removed 2026-06-03; real 1600-scaled scoring gated on cohort calibration |
| Personalized study plans (target weak skills) | ○ Not built | L; weakest 3 skills → pre-built question sets from bank |
| Skill mastery progression over time | ✓ Built | `0024_mastery_predictions.sql` view feeds `SkillHeatmap.tsx` |
| Item analysis (per question, per class) | ◐ Partial | Per-attempt only; no class-aggregate |
| Full SAT-day simulation | ○ Not built | L; adaptive Module 2 + scaled scoring + section timing |
| Test-day timing patterns (per-question pacing) | ○ Not built | M; persist per-question time, report distribution |
| Vocabulary builder (SAT word lists) | ○ Not built | M; `vocab_lists`, `vocab_items`, SRS queue (could reuse `SpacedRepetition.tsx`) |
| Reading speed tracker | ○ Not built | M; passage-length / time logger |
| Essay scorer | ✗ Out of scope | SAT essay was retired; reconsider only if it returns |
| Question difficulty calibration (IRT) | ○ Not built | XL; requires statisticians + volume |

### N. Mobile + offline

| Feature | Status | Notes |
|---|---|---|
| PWA install | ✓ Built | `manifest.webmanifest`, `sw.js`, `registerSW.ts` (production only) |
| Offline question bank | ◐ Partial | `IndexedDBCache.ts` caches question data; mock-test sources also cacheable |
| Offline mock test (sync on reconnect) | ○ Not built | L; queue attempts to IndexedDB + replay on reconnect |
| Native iOS / Android (Capacitor wrapper) | ✗ Out of scope | PWA is sufficient; revisit if schools require store distribution |
| Mobile push notifications | ○ Not built | L; depends on Web Push |
| Mobile-optimized layout | ✓ Built | `AdaptiveLayout.tsx`, `MobileTabBar.tsx`, `BottomSheet.tsx` |
| Swipe navigation between questions | ✓ Built | `SwipeNav.tsx` |

### O. Developer / API

| Feature | Status | Notes |
|---|---|---|
| Supabase REST API (auto-generated) | ✓ Built | RLS-gated; intended for SPA only |
| GraphQL endpoint | ○ Not built | S to enable; M to validate RLS coverage |
| Webhooks (assignment submitted, low-score alert) | ○ Not built | M; outbox table + Edge Function dispatcher |
| Public read-only docs (Swagger / OpenAPI) | ○ Not built | S; auto-generated from Postgres schema |
| Service-account API keys | ○ Not built | M; per-org scoped tokens |
| CLI for class import / roster sync | ○ Not built | M; bun script hitting RPCs |
| Webhook for grade-passback to external LMS | ✗ Out of scope | Pairs with LTI |

### P. Compliance + safety

| Feature | Status | Notes |
|---|---|---|
| COPPA (under-13 protections) | ○ Not built | M; age gate at signup + parental-consent flow if we accept <13 |
| FERPA (student data handling) | ◐ Partial | RLS isolation is the substrate; no formal data-handling policy document |
| GDPR data export | ○ Not built | S; `export_my_data()` RPC returns single JSON blob |
| GDPR data deletion | ◐ Partial | CASCADE FKs handle it; no in-app "Delete my account" button |
| Accessibility (WCAG 2.1 AA) | ◐ Partial | `A11yPreferences.tsx`, dark mode, focus trap, ARIA on modals; not audited end-to-end |
| Internationalization (i18n provider) | ○ Not built | M; wrap strings in `i18next` or `react-intl` before more strings exist |
| Localization (zh-TW, es, others) | ○ Not built | M; depends on i18n |
| Cookie consent banner | ○ Not built | S; needed if EU traffic + analytics |
| Privacy policy + ToS pages | ○ Not built | S; static `/privacy`, `/terms` routes |
| Content moderation tools (for discussions) | ○ Not built | M; gated on whether discussions ship |

## 3. Cross-cutting capabilities

These aren't user-facing features but unblock entire categories above. Each is referenced repeatedly in section 2.

- **Resend transactional email** — wired into `assignment-due-reminders`. Still need: general `email_outbox` + drain for arbitrary notifications, account verification mail, bulk roster invites.
- **Supabase Storage** — enabled for materials (H). Still unblocks: profile avatars (C), PDF report export (G).
- **Edge Functions with cron triggers** — `0031_cron_schedules.sql` binds the anon-cleanup and reminder jobs. Headroom for: outbox drain, weekly digests, mark-as-late jobs.
- **Supabase Realtime subscriptions** — used by `useTeacherClasses` and the notification bell. Still unblocks: live-class mode, presence indicators.
- **Background workers**. Heavy compute we don't want on the request path: PDF rendering, real score-prediction model, skill mastery refresh at scale.
- **i18n provider**. Cheap to add now; retrofitting after the string count doubles is annoying. Soft prerequisite for international expansion.
- **A persisted server-side per-user state store** (replace `localStorage` for bank features). Unblocks: cross-device study state (F), bookmarks/notes that survive a new phone.
- **Real SAT calibration cohort** — 50+ submitted attempts with known true scores. Unblocks moving score predictions from linear-v1 to a real scaled model (E, G, M).

## 4. Suggested feature pairings

Some features only really pay off when shipped with a partner. The good pairs:

- **Per-class gradebook + Item analysis** — gradebook is in; class-aggregate item analysis is the next half of this pair. With both, "class bombed assignment 3" lands on "because question 7 had a 20% correct rate."
- **Real scaled score predictions + Personalized study plans** — linear-v1 + heatmap exist, but the predicted number isn't trustworthy yet and there's no "do these 20 questions" handoff. Calibrate the model and ship a plan generator in the same sprint.
- **Bulk roster import + Co-teachers** — bulk import shipped; the moment one teacher onboards a whole school they want a colleague to share the load. Co-teachers is now the dangling half.
- **Reply notifications + Email digests + Push** — in-app bell and assignment-due mail exist; daily/weekly digests, reply mail, and Web Push close the broadcast loop so students who don't log in daily still hear teachers.
- **Materials + Pages** — materials/links ship; pages/wiki is the missing half so teachers can write lesson context alongside the PDFs.
- **Skill mastery + Vocabulary builder + SRS** — heatmap is in; vocab builder + the existing FSRS-lite hook complete the three pillars of SAT-prep retention.
- **Account deletion + GDPR export** — export RPC shipped; the deletion side and a confirm modal complete the GDPR pair.

## 5. Anti-features (deliberately not building)

- **LTI tool provider** — this app is the destination, not an embed. Weeks of compliance work for a use case nobody asked for.
- **ePortfolios** — test prep doesn't produce essays, projects, or reflections worth curating.
- **Live web conferencing** — Zoom and Google Meet exist. A URL field on the class is sufficient.
- **Course catalog / marketplace browsing** — teachers create classes and invite students; nobody self-enrolls in "SAT Prep With Mr. Wu Spring 2026."
- **Discussions-as-grading-tool** — a Canvas pattern that doesn't translate to SAT MCQ pedagogy.
- **Plagiarism detection** — auto-graded multiple choice doesn't have a plagiarism failure mode.
- **Rubrics + SpeedGrader** — 80% UI for 0% answered when there's nothing to grade subjectively.
- **External standards alignment (Common Core etc.)** — the SAT skill taxonomy already provides the signal Outcomes provides. Mapping is a content authoring problem, not engineering.
- **Native mobile apps (Capacitor / RN)** — the PWA covers the use case. Revisit only if a school requires App Store distribution.
- **College Board API / live item sync** — there is no such partner API.
- **Essay scoring** — SAT essay was retired in 2021. Build only if it returns.
- **Course catalog Browse** — not a marketplace.

## 6. The shipping playbook

For any tier-1 feature in section 2, the recommended sequence — and the one this codebase rewards — is:

1. **DB schema first.** Write the migration. New table goes through the `0001_init.sql` template: `IF NOT EXISTS`, enable RLS, helper-function-based policies with `-- Why:` comments, indexes for the read paths the UI will use. Migrations are sequentially numbered with no gaps.
2. **RPC if multi-row mutation or invariant enforcement is needed.** Anything beyond a single direct `from('table').insert(...)` that fits RLS belongs in a `SECURITY DEFINER` function. Stable string error codes. Returns the affected row or `RETURNS TABLE(...)`, never `void`. `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated;`.
3. **Hook in `feature/useFooBar.ts`.** Standard return shape: `{ data, loading, error, refresh }`. `error` typed `string | null`. Realtime subscription only if there's a real edit-collision case; clean up via `supabase.removeChannel`.
4. **Component co-located with the hook.** Function component, named `interface FooProps`, JSDoc header, Tailwind palette inside indigo/violet/emerald/rose/slate, modals matching `ClassFormModal` structure. No `any`, no `React.FC`, no icon library, no emojis in UI strings.
5. **Wire into the route surface.** `AuthGate.tsx` is the single point that switches on role/session/area. Nested navigation inside a role surface is a local state machine in the parent — no router library.

For every step, the rubric is `docs/ARCHITECTURE.md` section 8. If a feature in section 2 above ever moves from ○ to ✓ without conforming to that rubric, the audit will catch it. The catalog stays honest only if status tags stay honest — when you ship a feature, find its row here and update the tag in the same PR.
