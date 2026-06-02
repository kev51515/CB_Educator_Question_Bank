# Maya Chen — Head Teacher UX Audit

## 1. Persona

Maya Chen, 38, head teacher and co-owner. Runs 4–6 SAT cohorts in parallel, lives in the LMS 6 hrs/day on a 16" MBP and an iPad Pro split-view. Power-user: expects ⌘K, inline edit, multi-select, and "tell me who is behind across every cohort" — not three modals to push one mock test.

## 2. Page-by-page

Ratings: 1 = unusable / missing, 3 = passable, 5 = bar-meeting.

| Page | File | Job | UI | Speed | Top friction |
|---|---|---|---|---|---|
| `/dashboard` | `viewer/src/dashboard/DashboardPage.tsx:160` | 3 | 4 | 4 | Card grid only. No "needs attention" / behind-students panel. Nothing cross-cohort actionable. (`:183-265`) |
| `/courses` | `viewer/src/admin/AllClassesView.tsx:99` | 4 | 4 | 4 | Filter pills (Active/Archived/Templates) + inline-create are great, but no quick "Start from template" CTA when filter ≠ templates (`:115-117`). |
| `/courses/:id/modules` | `viewer/src/teacher/ModulesPage.tsx:1` | 5 | 5 | 5 | **Reference standard.** Nothing to fix. |
| `/courses/:id/assignments` | `viewer/src/teacher/AssignmentsPage.tsx:1` | 4 | 4 | 4 | Strong inline rename + filter pills + optimistic archive (`:139-170`). But "Drop in Practice Test 4" still routes through `AssignmentFormModal` (617 lines) — no one-click "Add mock test" path. |
| `/courses/:id/people` | `viewer/src/teacher/ClassRoster.tsx:145` | 4 | 4 | 4 | Bulk import button is a tiny indigo pill in the header (`:213-220`); no per-row select-and-message. No "students behind" filter. |
| `/courses/:id/discussions` | `viewer/src/teacher/CourseDiscussions.tsx:1` | 4 | 4 | 4 | Pin / Lock badges + kebab — solid. No "unread teacher replies" filter for triage. |
| `/courses/:id/announcements` | `viewer/src/teacher/CourseAnnouncements.tsx:1` | 2 | 4 | 4 | **Single-course only.** `AnnouncementFormModal` takes one `courseId` prop (`:43`). No scheduling — `publish_at` doesn't exist in the form. |
| `/courses/:id/materials` | `viewer/src/teacher/CourseMaterials.tsx:1` | 5 | 5 | 4 | Drag-handle, inline-rename, bulk-select with `BatchOpsBar` (`:619, :1087`). Best non-Modules surface. |
| `/courses/:id/grades` | `viewer/src/teacher/CourseGradebook.tsx:167` | 3 | 3 | 3 | Matrix renders + sort + CSV (`:565-634`). No row-level "behind" highlight, no late-submission filter, no click-cell-to-message. |
| `/courses/:id/portfolio` | `viewer/src/teacher/CoursePortfolio.tsx:1` | 4 | 4 | 3 | 1840 lines, tree drag-and-drop with parent_item_id (`:14-22`). Polished but heavy. Maya likely never opens this for SAT-only cohorts. |
| `/courses/:id/settings` | `viewer/src/teacher/CourseSettings.tsx:41` | 5 | 5 | 5 | Inline name, MD description, one-click status, type-the-name delete. Bar-meeting. |
| `/question-bank` | `viewer/src/teacher/QuestionBankPage.tsx:1` | 3 | 4 | 4 | Practice Tests tab is empty-state-only (`:6-10`) — Maya can't actually browse mock tests here. |
| `/inbox` | `viewer/src/inbox/InboxPage.tsx:35` | 3 | 4 | 4 | Two-pane, unread badge, realtime — solid. But 1:1 only; can't message "all students who haven't submitted Assignment 3." |
| `/calendar` | `viewer/src/calendar/CalendarPage.tsx:1` | 4 | 4 | 4 | Cross-course assignments + portfolio. Read-only — can't drag an assignment to reschedule. |
| `/account/settings` | `viewer/src/auth/AccountSettings.tsx` | 4 | 4 | 4 | 408 lines, profile + password + data export. Fine. |
| `/account/admin/*` | `viewer/src/admin/Admin*.tsx` | 4 | 3 | 4 | Audit, Invites, Users, Stats. Functional but dated tables compared to Modules. |

## 3. Maya-shaped probes

**1. Cohort kickoff (sign-in → 12 students importing + first assignment due Friday).**
Sign-in → Dashboard (`DashboardPage.tsx:160`) → click "+ New course" (or `⌘K → "New course"` per `lib/lmsCommands.ts:165-169`) which deep-links `/courses?openNew=1` → inline-create row (`AllClassesView.tsx:115-118`) → auto-navigates to `/courses/:short_code/modules` (`:163-164`). Then she has to navigate to People (`ClassRoster.tsx`), click "Bulk import" (`:215`), paste/upload (`BulkRosterModal.tsx`, 452 lines). Then navigate to Assignments, click "+ Assignment", fill `AssignmentFormModal` (617 lines, including SmartDatePicker at `:497`). **Real path: ~8 clicks + 2 form modals. ~5 minutes.** Beats the 10-min target — but only because `⌘K → New course` exists. The chain still jumps three top-level surfaces; a cohort-kickoff wizard would cut it to 4 clicks.

**2. Cross-course triage ("who hasn't submitted Assignment 3 across all my courses").**
**Missing.** No cross-course view exists. The Dashboard renders only `CourseCard`s (`DashboardPage.tsx:225-265`); grep for "behind", "needs attention", "triage" returns zero hits in `viewer/src/`. The closest tool is Calendar (`CalendarPage.tsx`), but it shows due dates, not submission status. Maya would have to open each course's Gradebook (`CourseGradebook.tsx`) and visually scan. **This is the single biggest gap for her job.**

**3. Drop-in mock test ("push Practice Test 4 to Friday cohort by tonight").**
Open course → Assignments → `+ Assignment` → `AssignmentFormModal` (`AssignmentFormModal.tsx:1`). 617-line form, SmartDatePicker at line 497, but no "Add mock test" shortcut — Practice Tests are catalog rows in `QuestionBankPage.tsx` whose CTA says "open mock-test surface" (`:6-10`), not "add to course." Adding a CB question set goes through `AddSetToCourseModal.tsx` (referenced `QuestionBankPage.tsx:37`) — so this works for question sets but not full Practice Tests. **Friction: the Practice Tests tab is essentially a placeholder.** Maya cannot drop in Practice Test 4 from one screen.

**4. Reuse / clone last year's syllabus.**
`DuplicateCourseModal.tsx:1-21` deep-clones via the `clone_course` SECURITY DEFINER RPC plus a Storage object copy step. "Clear due dates" + "Save as template" checkboxes (`:9-10`). Wired into Dashboard kebab (`DashboardPage.tsx:65-74`), AllClassesView, ClassFormModal. **This is excellent.** Maya can clone last year's cohort in two clicks. Bar-meeting.

**5. Announcement broadcasting across cohorts + scheduling.**
**Missing both.** `AnnouncementFormModal.tsx:17-29` takes a single `courseId: string`. Form fields are title + body + pinned — no `publish_at`, no target-courses multi-select. To announce "Saturday mock test moved to Sunday" across 5 cohorts, Maya writes the same announcement 5 times. This is the single biggest daily-productivity loss for her.

**6. Gradebook 60s scan.**
`CourseGradebook.tsx` renders the matrix with score-tone cells (`:63-71`) and an Average column with persisted sort (`:140-165`). Loads everyone × everything in one shot (`:197-244`). **Visually parseable, but:** no "behind" / "missing" filter, no row-highlight for at-risk students, no click-cell-to-open-attempt with one click (the navigate path exists at `:19-22` but cells aren't styled as actionable). 60s scan works on a 12-student cohort; brittle at 25+.

**7. ⌘K / shortcuts / bulk.**
`StaffShell.tsx:92-109` wires ⌘K globally and `?` for the shortcut overlay — both gracefully ignored inside editable surfaces (`:32-38, :100`). `lib/lmsCommands.ts:98` builds nav + per-course tabs + "New course / announcement / assignment / module" + "Copy course URL." **Solid.** But: the StaffShell mounts the palette with empty `commands`, `index`, `recentIds` (`StaffShell.tsx:300-307`); only `useLmsCommands()` inside the palette populates it. That works, but means there's no quick-search over student names, courses, or assignments — pure command list. Bulk select exists in CourseMaterials (`:619`); missing in Assignments and Roster.

**8. iPad split-view.**
StaffShell rail collapses to `w-20` icon-only on narrow widths (`StaffShell.tsx:119`). Inbox correctly hides the left rail when a thread is open on mobile (`InboxPage.tsx:47`). **Risks:** Gradebook table is a single `overflow-x-auto` matrix (`CourseGradebook.tsx:565-566`) — at iPad split-view ~507px, horizontal scroll on every cohort. NotificationBell is fixed at `bottom-3 right-44` (`StaffShell.tsx:281`), which collides with the StudentBadge at narrow widths. The `hidden sm:inline` Publish toggle label in `ModulesPage.tsx:184` is fine; the 40px touch target is honored (`:161`). Materials uses `selectMode` exit behavior that depends on keyboard escape (`:642-651`) — no visible "exit" affordance for iPad.

## 4. Top 5 fixes, ranked by Maya's daily impact

1. **Cross-course "Needs attention" panel on Dashboard.** `viewer/src/dashboard/DashboardPage.tsx:183` — between the `<header>` and the published-courses grid, add a panel listing: students with overdue assignments, courses with low average score this week, cohorts with no announcement in 7+ days. Backed by a single RPC that aggregates `assignment_attempts` and `course_memberships` across the teacher's courses. **L.**

2. **Multi-course announcement broadcast + scheduled publish.** `viewer/src/teacher/AnnouncementFormModal.tsx:17` — change `courseId: string` to `targetCourseIds: string[]` (default to the current course) and add a `SmartDatePicker` for `publish_at`. Requires DB migration: `announcements.publish_at timestamptz` + multi-row insert in the submit handler. **M.**

3. **"Add mock test" first-class action.** `viewer/src/teacher/QuestionBankPage.tsx:6-10` — make the Practice Tests tab a real catalog (not empty-state), with an "Add to course" button per test that opens a course-picker → due-date picker, mirroring `AddSetToCourseModal.tsx`. Cuts Maya's Saturday-night flow from 4 hops to 1. **M.**

4. **Gradebook: "behind" filter + click-cell-to-message.** `viewer/src/teacher/CourseGradebook.tsx:565` — add a sticky filter row above the matrix ("Show: all / behind / draft / missing") and make `—` and `draft` cells `<button>`s that open Inbox with the student pre-selected. Row-highlight at-risk students (avg <60%). **M.**

5. **Cohort-kickoff wizard at ⌘K + Dashboard.** Hidden new command `useLmsCommands.ts:115` "Start a cohort" → single 3-step modal: name → clone from template → bulk-paste roster. Each step is a thin wrapper over `clone_course` RPC + `BulkRosterModal` paste flow. Cuts 8-click chain to 3 clicks. **M.**

## 5. Would Maya recommend it?

**Conditionally yes — to herself, not yet to a peer.** The single-course experience meets the bar: Modules is best-in-class, Settings and Materials are right behind it, ⌘K and inline edit and optimistic UI are everywhere, course cloning is genuinely a 10-second flow. But Maya runs 4–6 cohorts, and the LMS treats every surface as single-course. She has no cross-cohort triage view, can't broadcast an announcement, can't drop in a mock test from the catalog, can't see the at-risk students from the Dashboard, and can't reschedule from the Calendar. Today she'd live in the LMS and tolerate the gaps; she would not yet tell a fellow head teacher "switch from Canvas to this" because the multi-cohort workflows that justify head-teacher use are exactly the ones the product hasn't shipped yet.
