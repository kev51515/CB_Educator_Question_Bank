# UX Audit — May 2026

Read-only audit of the CB Educator LMS against the Wave 8B Modules-page UX bar (per `CLAUDE.md`). Five personas, page-by-page friction, forbidden-pattern scan, prioritized fix list.

---

## 1. Personas

**P1 — Maya Chen, Course Owner / Head Teacher (38, high tech comfort).**
Co-founder, runs 4–6 concurrent SAT cohorts. Lives in the LMS 6 hrs/day across desktop + iPad. Goals: ship new cohorts in <10 min from a template, see at a glance who's behind, post announcements that actually get read. Frustrations: clicking through 3 modals to do one thing, having to remember which course she's in. Primary workflows: Dashboard → Modules drag/publish, Assignments create, Gradebook scan, Announcements compose. Owns schema decisions — high trust.

**P2 — Daniel Park, Co-Teacher / TA (29, medium tech comfort).**
Grades essays, posts replies in discussions, sometimes runs a session. Doesn't touch the DB; CSV-imports rosters but won't trust himself to delete a course. Goals: not break anything, find a student fast, leave timely feedback. Frustrations: hidden affordances ("where do I publish?"), modal forms with required fields he didn't know about, raw datetime pickers. Primary workflows: People (find student), Gradebook (open attempt), Discussions (reply), Inbox (DM parent). Mostly desktop, occasional phone.

**P3 — Sophia Rivera, Motivated Student (16, high tech comfort, targeting 1520).**
Junior, drills 1–2 hours/night. Wants to spend zero seconds on navigation and 100% on questions. Goals: drill weak skills, see score trajectory, beat last week. Frustrations: clicking past "What's new" before getting to practice, mock-test results buried, having to remember which set she finished. Primary workflows: home → Weak-skills pill → practice; Mock test → review; Assignments panel. Uses laptop + phone interchangeably.

**P4 — Jordan Liu, Average Student (15, sophomore, low confidence, mobile-first).**
Practices when reminded, easily lost in dense UI. Phone is primary; uses laptop only when assignment is too painful on mobile. Goals: know what's due, see green checkmarks, not feel dumb. Frustrations: tiny tap targets, dense tables, walls of text, modals that scroll inside scrolls, jargon ("portfolio_item", "qbank_set"). Workflows: open due-soon assignment → start → submit → see score.

**P5 — Linda Park, Parent / Guardian of Jordan (44, medium tech comfort, read-only observer).**
No account today, peers over Jordan's shoulder. Future: wants a once-a-week digest. Goals: confirm Jordan is doing the work, see scores trending up, talk to teacher without weird email threads. Frustrations: nothing exists for her yet. Workflows (today): forwarded screenshots; (future): read-only `/students/:id` view, email digest, in-app DM to teacher.

---

## 2. Page-by-page audit

Scale: ★★★ = matches Modules bar · ★★ = functional but visible gaps · ★ = falls noticeably short. "Top friction" = the single thing the persona would hit first.

### `/dashboard` — `viewer/src/dashboard/DashboardPage.tsx`
- **Functions ★★★** courses split Published/Unpublished; per-card kebab (Open/Edit/Duplicate/Archive/Delete); inline quick-nav to Assignments/People/Announcements (lines 91–155).
- **UI ★★★** Skeleton cards while loading (197–199), EmptyState with CTA (212–222), themed CourseCard primitive.
- **UX ★★** No "what's overdue this week" or "ungraded attempts" callouts — Maya still has to drill into every course to learn the state of the world. No keyboard list-nav.
- **Top friction (Maya):** No cross-course "needs attention" row → opens every course every morning.

### `/courses` — `viewer/src/admin/AllClassesView.tsx`
- **Functions ★★★** search box, Active/Archived/Templates filter, inline create row (lines 113–118).
- **UI ★★** uses CourseCard + SkeletonCard; teacher join code uses crypto-random generation client-side (33–46) which is fine.
- **UX ★★** 592 lines — splitting the inline-create row out as `<InlineCreateCourseRow>` is overdue. Filter pills don't persist per-user (compare AssignmentsPage `filterKey` pattern at lines 49–51).
- **Top friction (Maya):** Loses filter selection on reload; no bulk-archive.

### `/courses/:id/modules` — `viewer/src/teacher/ModulesPage.tsx` — **reference standard**
- **Functions / UI / UX ★★★** drag handles, inline rename, persisted collapse, one-click publish, kebab tertiaries, auto-scroll on drag (57–101), SmartDatePicker, ConfirmDialog, useOptimistic, useToast. Empty state has CTA. Skeletons. This is the bar.
- **Top friction (Sophia/Jordan, student side):** Locked-module display is read-only but doesn't surface *why* locked or *when* it unlocks in plain English — only the lock_at timestamp.

### `/courses/:id/assignments` — `viewer/src/teacher/AssignmentsPage.tsx` (888 lines)
- **Functions ★★★** inline rename (Wave 8C, doc lines 11–22), one-click status toggle, filter pills persisted to localStorage per (user,class) (49–51), ConfirmDialog.
- **UI ★★** at 888 lines this needs to be split (cards/filters/bulk into sub-files) — violates CLAUDE.md "200–400 lines typical, 800 max" by sitting right at the ceiling.
- **UX ★★★** matches Modules bar.
- **Top friction (Daniel):** Bulk-select bar exists but discovery is low — first-time users don't realize they can shift-click.

### `/courses/:id/people` — `viewer/src/teacher/ClassRoster.tsx`
- **Functions ★★** EmptyState + CTA, inline rename of display_name (61–93), relative "joined N days ago" timestamps, BulkRosterModal.
- **UI ★★** clean.
- **UX ★★** No search; relies on browser ⌘F. No bulk-remove (per-row only).
- **Top friction (Daniel):** Class of 35 — finding one student is painful. Needs a header search input (mirror AllClassesView pattern).

### `/courses/:id/discussions` — `viewer/src/teacher/CourseDiscussions.tsx` (636 lines)
- **Functions ★★★** pinned-first, inline rename of topic title (74–105), one-click Pin/Lock badges, kebab Edit/Pin/Lock/Delete.
- **UI ★★★** EmptyState, SkeletonRows.
- **UX ★★** Mobile: topic-row tap area is fine but the inline-rename input is tiny on phones (no min-height bump). Reply composer in `DiscussionTopicView` not audited here but probably needs MarkdownEditor.
- **Top friction (Jordan, mobile):** Tapping a topic title to read accidentally triggers inline-rename if he's an author.

### `/courses/:id/announcements` — `viewer/src/teacher/CourseAnnouncements.tsx`
- **Functions ★★★** inline rename, one-click Pinned chip, optimistic, toast, realtime refresh.
- **UI ★★★** SafeHtml render.
- **UX ★★** uses `AnnouncementFormModal` — verify it uses `MarkdownEditor` (it should — needs grep).
- **Top friction (Maya):** Cannot schedule an announcement to publish later; cannot @-mention a student.

### `/courses/:id/grades` — `viewer/src/teacher/CourseGradebook.tsx`
- **Functions ★★** matrix view + per-student average + CSV export, tone-banded scoring (63–71).
- **UI ★★** SkeletonTable on load, EmptyState.
- **UX ★** No sticky header row, no sticky first column — at 30 students × 20 assignments the scroll experience is rough. No filter by submission state. No keyboard cell navigation.
- **Top friction (Daniel):** Scrolling right loses the student-name column → can't tell whose row he's reading.

### `/courses/:id/portfolio` — `viewer/src/teacher/CoursePortfolio.tsx` (**1840 lines — over 2× the 800 limit**)
- **Functions ★★★** rich: hierarchical tree, drag w/ Before/After/Into zones, cycle prevention, sub-item kebab, submissions matrix.
- **UI ★★** OK but `PortfolioItemFormModal.tsx:321` still uses raw `<textarea>` for "Choices" — should be a tag input or MarkdownEditor for prose fields.
- **UX ★** 1840 lines is the single biggest code-quality risk in the app. Splitting into `<PortfolioTreeView>`, `<PortfolioOverviewGrid>`, `<PortfolioItemNode>` is overdue and will materially reduce future regression risk.
- **Top friction (Daniel):** Doesn't trust the drag — needs an explicit "Move to…" menu item as keyboard fallback (Modules has it; check parity).

### `/practice` (legacy QB) — `viewer/src/App.tsx:~1038`
- **Functions ★★★** WeakSkillsToggle integrated.
- **Top friction (Sophia):** Returning to the page resets the question — needs "Resume where you left off" surfacing.

### `/question-bank` — `viewer/src/teacher/QuestionBankPage.tsx`
- **Functions ★★★** two tabs (Practice Tests / Question Sets), filter pills, persisted active tab, EmptyState w/ CTA, SkeletonRows. Doc comments explicitly disavow "Loading…" text (line 29).
- **UX ★★★** matches bar.
- **Top friction (Maya):** Can't favorite a set; revisiting same one means rescrolling.

### `/inbox` — `viewer/src/inbox/InboxPage.tsx`
- **Functions ★★** two-pane DMs, unread badges, mobile-aware show/hide.
- **UI ★★** Skeleton rows, EmptyState w/ CTA, snippet HTML-stripped (104–108).
- **UX ★** Right pane placeholder is just text "Select a conversation to read." — no illustration, no suggestion. No search across threads.
- **Top friction (Linda, future):** No way for a parent without an account to contact a teacher.

### `/calendar` — `viewer/src/calendar/CalendarPage.tsx`
- **Functions ★★** month + list, persisted view mode globally (66–80).
- **UI ★★** SkeletonRows.
- **UX ★★** No filter by course; no iCal/Google export; no "today" jump button visible from snippet (would need fuller read).
- **Top friction (Sophia):** Can't subscribe to her own due dates from Apple Calendar.

### `/account/settings` — `viewer/src/auth/AccountSettings.tsx`
- **Functions ★★★** display-name edit, change email/password sub-flows, data export.
- **UI ★** uses inline notice/error text (`nameNotice`/`nameError`, etc., lines 56–73) instead of `useToast` — drifts from project norm.
- **UX ★★** sub-form pattern is fine but multiple busy/notice/error triples is duplicated state that toasts would simplify.
- **Top friction (Maya):** Changing email shows confirmation as inline grey text easy to miss.

### `/courses/:id/materials` — exists, not deep-audited.
### `/calendar/.ics` subscription — **not yet built**.
### Parent read-only view (`/families/...`) — **not yet built** (referenced for Linda).

---

## 3. Forbidden-pattern findings

Grep against the CLAUDE.md forbidden table:

| Pattern | Hits | File:Line | Verdict |
|---|---|---|---|
| Raw `<textarea>` | 5 | `components/NoteEditor.tsx:48`, `components/ChoiceAnalysis.tsx:345`, `teacher/BulkRosterModal.tsx:277`, `teacher/AddSetToCourseModal.tsx:277`, `teacher/PortfolioItemFormModal.tsx:321` | NoteEditor + BulkRosterModal + ChoiceAnalysis are **acceptable** (note-taking / paste-emails / quick analysis are not prose). `AddSetToCourseModal:277` ("description") and `PortfolioItemFormModal:321` ("Choices") **should be replaced** — Description is prose → `MarkdownEditor`; Choices → tag input. |
| Raw `<input type="file">` | 1 in app code | `components/StateExport.tsx:563` | Acceptable (admin power-tool); could still upgrade to FileDropzone for consistency. |
| Raw `<input type="datetime-local">` | 1 (inside `SmartDatePicker.tsx:140`) | OK — that's the implementation of the modern wrapper. No raw uses outside it. |
| `window.confirm` / `window.alert` | 1 | `components/StateExport.tsx:481-482` | Acceptable — staff/admin power-tool with permanent-overwrite semantics. Should still migrate to `ConfirmDialog` (destructive) for consistency. |
| "Loading…" text on blank page | 2 | `auth/routeViews.tsx:213` ("Loading assignment…"), `:223` ("Loading session…") | **Should be skeletons**, but the centered-message pattern here is the *fallback before route mount*, which is a defensible exception. Worth a 1-line review. |
| Empty page without CTA | None found in audited pages | All major pages use `<EmptyState>` with a CTA. ✅ |

**Verdict:** Forbidden patterns are largely contained. Two clear drift points:
1. `PortfolioItemFormModal.tsx:321` — Description-style textarea in a form modal → MarkdownEditor.
2. `AddSetToCourseModal.tsx:277` — Description textarea → MarkdownEditor.
3. `AccountSettings.tsx` — replace inline notice/error pairs with `useToast` for consistency.

---

## 4. Top 10 prioritized fixes

| # | File:line | Change | Persona benefit | Complexity |
|---|---|---|---|---|
| 1 | `teacher/CoursePortfolio.tsx` (1840 lines) | Split into `<PortfolioTreeView>`, `<PortfolioOverviewGrid>`, `<PortfolioItemNode>`, `<usePortfolioDrag>` hook. Triple the future-bug resistance. | Daniel, Maya | **L** |
| 2 | `teacher/CourseGradebook.tsx:~80+` | Add sticky header row + sticky first column; add submission-state filter; row-hover cross-highlight. | Daniel, Maya | M |
| 3 | `teacher/ClassRoster.tsx` | Add header search input (filter by name/email) + bulk-remove via select-checkbox column. | Daniel | M |
| 4 | `dashboard/DashboardPage.tsx` | Add a "Needs attention" rail above course grid: ungraded attempts, overdue assignments, new discussion replies (cross-course). | Maya | M |
| 5 | `teacher/AssignmentsPage.tsx` (888 lines) | Split into `<AssignmentCard>`, `<AssignmentsToolbar>`, `<BulkActionsBar>`; hoist filter persistence to a small hook. | All teachers (maintenance) | M |
| 6 | `teacher/PortfolioItemFormModal.tsx:321` + `teacher/AddSetToCourseModal.tsx:277` | Replace raw `<textarea>` with `<MarkdownEditor>` for Description fields; replace Choices `<textarea>` with a tag input. | Maya, Daniel | S |
| 7 | `auth/AccountSettings.tsx` | Replace inline notice/error state triples with `useToast`. Reduces duplicated busy-state code. | Maya (consistency) | S |
| 8 | `calendar/CalendarPage.tsx` | Add per-course filter pills; add "Today" jump button; add iCal subscription URL (read-only). | Sophia, Maya | M |
| 9 | `student/AreaSelector.tsx` near 200–242 | Surface "Resume where you left off" card + last 3 mock-test results sparkline above the AreaCards; weak-skills pill should be the first thing on mobile. | Sophia, Jordan | M |
| 10 | `auth/routeViews.tsx:213,223` | Swap `<CenteredMessage>Loading…</CenteredMessage>` for a route-level skeleton matching incoming layout shape. | Everyone (perceived perf) | S |

**Not-yet-built but on the roadmap:**
- Parent read-only view (`/families/:studentId`) — unblocks Linda.
- Weekly email digest — addresses Linda's stated frustration ("forwarded screenshots").
- Scheduled announcements / @mention — Maya's announcement pain.
- `MarkdownEditor` integration audit on `AnnouncementFormModal`, `TopicFormModal`, `AssignmentFormModal` — verify (these were not deep-read).

---

*Audit performed read-only. No source files modified.*
