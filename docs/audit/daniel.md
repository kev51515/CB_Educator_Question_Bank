# Daniel Park — TA UX Audit

## Persona

**Daniel Park, 29 — Co-Teacher / TA.** Helps grade essays, posts a few Discussions replies, occasionally answers an Inbox DM, never touches schema or admin tools. Wants: don't break anything, find a student fast, leave timely feedback, move through a batch of attempts efficiently. Frustrations: hidden hover-only affordances (he won't discover them), raw datetime pickers, dense roster lists without search, accidentally destructive buttons. 14" MBP primarily; phone for quick replies on the bus. Medium tech comfort — uses keyboard shortcuts only if a tooltip or visible hint advertises them.

---

## Page-by-page audit

| Surface | Discoverability | Safety | Speed | Top friction |
|---|---|---|---|---|
| `/dashboard` (`viewer/src/dashboard/DashboardPage.tsx`) | OK — course cards visible | Safe (no destructive ops) | Fast — one click to a course | No quick-link to "ungraded attempts" or "unread DMs"; Daniel always has to drill into a course |
| `/courses` (`viewer/src/admin/AllClassesView.tsx`) | OK — list view | Probably safe for a TA; staff-only filters | Acceptable | Daniel rarely lives here — he goes course → people |
| `/courses/:id/assignments` (`viewer/src/teacher/AssignmentsPage.tsx`) | Mixed — pencil-on-hover for rename is invisible until hover (`AssignmentsPage.tsx:215` `opacity-0 group-hover:opacity-60`) | ConfirmDialog wraps delete (`AssignmentsPage.tsx:31` + reuse) — good. **Inline title rename has no confirm, no undo** — Daniel could accidentally rename "Practice Test 4" while clicking a row. | "View attempts" is a labeled button — clear | Click target for rename is the title text itself; on a trackpad Daniel may rename when he meant to navigate |
| `/courses/:id/people` (`viewer/src/teacher/ClassRoster.tsx`) | **No search input** — only Name / Email / Joined columns (`ClassRoster.tsx:248-256`). Bulk-import button is prominent. | ConfirmDialog on Remove (`ClassRoster.tsx:296-313`) — destructive, named confirm "Remove". Safe. | **Slow for 35 students** — Daniel must Cmd-F the browser to find "Maria Lopez". No type-ahead. | Add a search box above the table. |
| `/courses/:id/discussions` (`viewer/src/teacher/CourseDiscussions.tsx`) | OK — topic rows are obviously clickable | Delete behind kebab + ConfirmDialog (~line 270 pattern) | Adequate; topic list shows reply counts | Inline rename via hover-pencil (`CourseDiscussions.tsx:163`) — Daniel won't find it |
| `/courses/:id/announcements` (`viewer/src/teacher/CourseAnnouncements.tsx`) | OK — primary CTA visible; kebab for tertiary | ConfirmDialog on delete (`CourseAnnouncements.tsx:466`) | Fast for read; compose is a modal | Pencil edit hidden behind hover (`CourseAnnouncements.tsx:154`) |
| `/courses/:id/grades` (`viewer/src/teacher/CourseGradebook.tsx`) | **No student search** (`CourseGradebook.tsx:566-635`). Sort pills are visible (`:548-563`). | Read-only matrix; safe. Export CSV is non-destructive. | Clicking a cell jumps straight into the attempt — fast | Finding "Maria Lopez" in a 35-row matrix = manual scan |
| `/courses/:id/portfolio` (`viewer/src/teacher/CoursePortfolio.tsx` → `SubmissionDetailDrawer.tsx`) | Tabbed (Template / Overview) clear. Drawer opens on cell click — good. | Item delete = ConfirmDialog (`CoursePortfolio.tsx:1788`). **Drag-to-nest could move someone else's template item** — only "Item moved" toast confirms, no undo (`:1320`). | Drawer is fast. Feedback uses MarkdownEditor + optimistic post (`SubmissionDetailDrawer.tsx:202-247`) — solid. | Daniel might accidentally re-parent template items by drag; the affordance is there for staff but a TA may not realize a drag commits. |
| `/inbox` (`viewer/src/inbox/InboxPage.tsx` + `ThreadView.tsx`) | OK — two-pane; unread badge visible (`InboxPage.tsx:109-113`) | Safe — no delete here | Acceptable; mark-as-read is automatic (`ThreadView.tsx:79-98`) | **No thread search** — Daniel has to scroll. No @mentions. |
| Attempt grading (`viewer/src/teacher/TeacherAttemptDetailView.tsx`) | **THERE IS NO GRADING UI.** It's read-only: ScoreHero, breakdowns, AnswerReview (`:120-158`). No comment box, no score override, no rubric, no "Mark graded". | Cannot break anything because cannot edit anything. | **Cannot complete the task at all.** Click "View" → see auto-scored breakdown → click back. | Daniel cannot leave a per-question comment or a holistic essay grade through this surface. |

---

## Daniel-shaped probes

### 1. Grade 12 essays
**Blocked.** `TeacherAttemptDetailView.tsx:91-161` renders score breakdowns and `AnswerReview` only — no `<MarkdownEditor>`, no comment thread, no save-grade button. Daniel's workflow today: open attempt → eyeball auto-score → hit "Back to attempts" (`:94-100`) → repeat. No keyboard nav between attempts (no `onKeyDown` for j/k or shift+N). No autosave because there's nothing to save. The closest thing to per-submission feedback exists for **portfolio** items (`SubmissionDetailDrawer.tsx:183-248`) — not assignments. **Cost per essay = 2 clicks to learn nothing actionable.**

### 2. Find "Maria Lopez"
**Manual scan.** `ClassRoster.tsx:245-292` renders a plain `<table>` with no search input above it. No `<input type="search">`, no filter state, no `searchTerm` variable. For 35 rows it's Cmd-F or pagination scrolling. Same in `CourseGradebook.tsx` — sort by name pill exists (`:548-555`) but no filter. **Time cost: 10-30 seconds + browser Cmd-F.**

### 3. Reply to discussion (his post is #9)
**Mostly OK.** `DiscussionTopicView.tsx:330-352` per-post `Reply` button placeholder seeds `Reply to {node.post.author_name}…` (`:333-340`) so context is preserved. Optimistic append works (`:440-482`). But: **no @mention/autocomplete** anywhere — Daniel can type "@maria" but nothing happens. No notification will fire to Maria specifically. The depth-cap at 4 (`:292-300`) means deeply-threaded conversations all visually align at depth 4. **Acceptable but no @mention is a real gap.**

### 4. Accidental destruction
- ClassRoster Remove → ConfirmDialog with `destructive` flag (`ClassRoster.tsx:295-313`). ✅
- Discussion delete topic/reply → ConfirmDialog (`DiscussionTopicView.tsx:698-739`). ✅
- Announcement delete → ConfirmDialog (`CourseAnnouncements.tsx:465-490`). ✅
- Assignment delete → ConfirmDialog (`AssignmentsPage.tsx:31` import + use). ✅
- Portfolio item delete → ConfirmDialog (`CoursePortfolio.tsx:1788-1808`). ✅
- **Inline title renames have no confirm and no undo** — Modules, Assignments, Discussions, Roster. A TA clicking a title to navigate may land in edit mode, hit Enter on his own name, and silently rename it. Toast says "Renamed" but no undo button (`AssignmentsPage.tsx:155-170` style). Risk is **low for data loss, medium for embarrassment**.
- **Portfolio drag-to-nest** is staff-grade but the only visible affordance for what just happened is a "Item moved" toast (`CoursePortfolio.tsx:1320`) with no Undo action.

### 5. Hidden affordances (group-hover)
Hover-only pencil reveals at: `AssignmentsPage.tsx:215`, `CourseAnnouncements.tsx:154`, `CourseDiscussions.tsx:163`, `ClassRoster.tsx:134`, `DiscussionTopicView.tsx:150`, `ModulesPage.tsx:341`, `CourseMaterials.tsx:180`. **Every one** of these requires Daniel to mouseover a row to discover he can edit. On touch the pencil never appears. The kebab menu pattern (KebabMenu in `@/components`) is the right alternative — it is used on Assignments and Modules but isn't a primary discovery channel.

### 6. Bulk operations
**None for grading.** `AssignmentAttemptsView.tsx:120-153` renders one "View" button per row, no checkboxes. No "Mark all read" in Inbox. ClassRoster has Bulk import (`:215-221`) but no bulk remove or bulk message. Portfolio Overview cells are one-at-a-time. **Daniel cannot bulk-comment "Nice work" on 12 essays.**

### 7. Error handling mid-grade
N/A for assignments (no grade UI exists). For **portfolio feedback**: `SubmissionDetailDrawer.tsx:238-247` rolls back the optimistic append AND restores the draft text (`setNewComment(trimmed)` at `:241`) on error. Excellent pattern. For **Inbox**: same rollback (`ThreadView.tsx:145-153`) — `setDraft(body)` restores. For **Discussion replies**: optimistic placeholder is removed (`DiscussionTopicView.tsx:474-481`) but the `body` is **not** restored to the editor — the user loses their reply text if Supabase rejects. **Real bug.**

---

## Top 5 fixes (ranked by TA daily impact)

1. **Add a grading UI to `TeacherAttemptDetailView`** — Markdown comment box + score override + Save & Next + ⌘↩ / J/K keyboard nav. Without this Daniel's primary job is undoable in-product. **Complexity: L** (needs new tables/columns: `attempt_feedback`, `attempt_grade_override`; new RPC; navigation state between siblings). Migration ledger is already at 0040; add 0041.
2. **Search input on ClassRoster + CourseGradebook** — single `<input type="search">` with debounced client-side filter (35–100 rows, no server roundtrip needed). **Complexity: S.** Cite: `ClassRoster.tsx:206-221` (header), `CourseGradebook.tsx:546-564` (sort pill area — drop a search beside it).
3. **Reply-text persistence in DiscussionTopicView** — when `handleSubmitReply` (`DiscussionTopicView.tsx:440-482`) catches an error, also restore the draft to the `ReplyForm` (pattern already used in ThreadView `:149` and SubmissionDetailDrawer `:241`). **Complexity: S.**
4. **Visible edit affordance** — replace hover-only pencil with always-visible muted pencil (or move rename into the KebabMenu and remove the click-on-title-to-edit). Affects all 7 surfaces listed under probe #5. Single component change in the InlineRename helper used in each. **Complexity: S.**
5. **Undo on inline rename + portfolio move** — show toast with "Undo" action button (toast component already supports actions per CLAUDE.md). 5-second window, reverts the last write. **Complexity: M.**

---

## Risk that Daniel damages data on a typical Tuesday

**Low to very low.** Every truly destructive op is gated by `ConfirmDialog` with explicit destructive styling — roster Remove, assignment Delete, announcement Delete, discussion Delete, portfolio item Delete. The realistic damage surface is (a) accidentally renaming an assignment, discussion topic, or student display name via a misfired click on an inline-rename target — recoverable but embarrassing; or (b) accidentally drag-nesting a portfolio item while scrolling on a trackpad — recoverable via Move to… but no undo. The bigger risk is the **opposite**: Daniel can't *do* his job. He can read submitted attempts but cannot leave a single graded comment from `TeacherAttemptDetailView`. So on a Tuesday he is far more likely to ping Kevin in Slack saying "how do I leave feedback on this essay?" than to wreck a course. The system is over-indexed on safety and under-indexed on TA throughput.
