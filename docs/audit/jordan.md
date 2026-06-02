# Mobile UX audit — Jordan Liu, 15, low-confidence phone-primary student

## Persona

**Jordan Liu, 15, sophomore.** iPhone 14 (390×844) is his only device. Gets easily lost in dense UI, doesn't trust himself with destructive actions, wants visible confirmation that he hit "submit" correctly. Tapping is his only input modality — no keyboard, no hover. Wants three things from a session: (1) know what's due, (2) see green checkmarks when he finishes, (3) not feel dumb when something says "qbank_set". Frustrations: tiny taps, dense tables that force horizontal scroll, jargon, full-screen modals with no obvious close.

---

## Page-by-page mobile fitness (iPhone 14, 390px)

| Surface | Tap targets | 390px layout | Clarity | Top friction |
|---|---|---|---|---|
| **Home / AreaSelector** `viewer/src/auth/AreaSelector.tsx:154` | Sign-out `px-3 py-1.5` ≈ 30px FAIL (`:172`). AreaCards big OK. Join-course `px-4 py-2` ≈ 36px borderline (`:254`). | Fits, no horizontal scroll. `max-w-3xl mx-auto` centered, `grid sm:grid-cols-2` stacks on phone. | "Welcome back / Hi, Jordan" friendly. But the **page order buries what's due**. | **Assignments panel is item #5 down the page** (`:243`) below Question Bank, Mock Test, Announcements, SkillHeatmap+ScorePrediction. Jordan must scroll ~3 screens to see "Due tomorrow". |
| **Course list (student)** `viewer/src/student/MyClassesPanel.tsx:29` | "Leave" `px-2 py-0.5 text-[11px]` ≈ 22px tall FAIL (`:46-50`). Whole card is not clickable — no way to open a course from this panel. | Fits. | "My courses · 3 enrolled" clear. | **There is no student course list page**. The only entry to a course is via per-assignment links. Jordan can't tap "SAT Prep – June" to browse it. |
| **/courses/:id (student view)** | n/a | n/a | n/a | **Surface does not exist for students** — `StudentRoutesTree` (AuthGate.tsx:215) routes Home, /practice, /mock-test, /assignment/:id/take, /assignment/:id/review/:attempt, /inbox, /account. No `/courses/*` entry for students. |
| **AssignmentRunner** `viewer/src/student/AssignmentRunner.tsx:282` | Retry/Back buttons `px-4 py-2` ≈ 36px borderline (`:304,311`). Once handed to MockTestApp, see below. | Loading state centered min-h-screen — fits. Error/max-attempts `max-w-md` fits. | "Couldn't start this assignment" friendly. "No attempts remaining / You've used all 3" clear. | Loading shows only literal "Preparing your assignment…" text — no skeleton. Jordan stares at grey text wondering if it's stuck. |
| **MockTestApp footer** `viewer/src/mocktest/components/TestPhaseFooter.tsx:27` | All footer buttons `h-8` = 32px FAIL (`:49,55,66`). On phone, labels are `hidden sm:inline` so Submit/Prev/Next collapse to single-character icons (◀ ▶) (`:60,74-75`). | Sticky footer OK. | "Submit" only shows on the last question; otherwise it's a tiny mobile-only chevron `lg:hidden` Submit at line 47-52 (32px tall, 4-char width). | **Jordan cannot find Submit until the very last question** — on Q5 of 10 he sees ▶ but not "Submit". When he finally hits it, a ConfirmDialog pops, then on confirm the entire screen swaps to results. Confirmation IS visual (ScoreHero), no toast — acceptable but inconsistent with QBankAssignmentRunner which DOES fire `toast.success("Submitted", "Your test was saved.")` (`viewer/src/student/QBankAssignmentRunner.tsx:215`). |
| **Mock test runner** | See above; same footer + header. Header `TestPhaseHeader.tsx` uses `max-w-3xl mx-auto px-4` — fits 390px. | Fits. | Bluebook-styled. | No bottom MobileTabBar visible here (MobileTabBar is bank-only — `viewer/src/components/MobileTabBar.tsx:26-49`, only used in App.tsx:1175 for the question-bank shell). |
| **/practice** | MobileTabBar buttons `py-2` + 10.5px label — only ≈ 36px tall FAIL (`viewer/src/components/MobileTabBar.tsx:66-72`). Three-tab Filters / List / Question. | Tab bar fits, but the inner List/Detail surfaces are dense desktop UI shoehorned into 390px. | "Filters / List / Question" labels are clear. | The question-bank shell is the only authenticated route with a real bottom tab nav. Everywhere else (Home, /calendar, /inbox, /account) Jordan has zero persistent navigation — only the floating StudentBadge in the bottom-right corner. |
| **/calendar** `viewer/src/calendar/CalendarPage.tsx:307` | View toggle Month/List buttons OK size. | **HARD FAIL**: Month grid wraps `min-w-[560px]` (`:309`) → horizontal scroll on 390px. List view table `min-w-[640px]` (`:357`) → worse horizontal scroll. | Date / Time / Type / Title / Course columns clear; "Assignment" / "Portfolio" badges friendly. | The whole calendar requires sideways swipe just to see the day cells. For a phone-first sophomore this is the worst surface in the app. |
| **/inbox** `viewer/src/inbox/InboxPage.tsx:44` | "New" button `px-3 py-1.5 text-xs` ≈ 30px FAIL (`:56`). Thread rows are full-width tap targets — OK. | Smart mobile pattern: rail hidden when thread open, "← Back to inbox" link appears `sm:hidden` (`:127`). Works at 390px. | "No conversations yet" empty state w/ CTA. | Tiny grey "← Back to inbox" link is the only way out of a thread on phone — easy to miss; should be a full-width bar or use a back-arrow icon button. |
| **/account/settings** `viewer/src/auth/AccountSettings.tsx:47` | Form buttons inline `py-2.5 text-sm` ≈ 40px OK. Sign-out & destructive buttons distinguishable (not deeply inspected — only first 100 lines). | Top-down stack — should fit. | Friendly: "display name", "email", "change password". | (Lower-priority, not deeply walked — the surface is form-only.) |

---

## Jordan-shaped probes

**1. "Open + see what's due."** Jordan opens the app → lands on `AreaSelector` (`viewer/src/auth/AreaSelector.tsx:154`). Above the fold on 390×844 he sees: Welcome header, "Question Bank" card, "Full Mock Test" card. **He does not see any due dates above the fold.** "My assignments" mounts at `:243`, position 5 in the layout — after `CourseAnnouncementsList`, `SkillHeatmap`, `ScorePrediction`. **He has to scroll past ~1500px of vertical content** to reach "Due tomorrow · Geometry Practice Set 4". Taps to discover what's due: 0 taps but ~3 screen-heights of scroll. For a phone-primary student this is wrong.

**2. "Submit confirmation."** Two surfaces, two patterns:
- **MockTestApp**: Confirm dialog opens (`ConfirmDialog.tsx:55`), on confirm the entire screen replaces with `TestResults` (`viewer/src/mocktest/components/TestResults.tsx:43`) showing ScoreHero. **No toast.** Big visual swap = clear confirmation. OK.
- **QBankAssignmentRunner**: Fires `toast.success("Submitted", "Your test was saved.")` (`viewer/src/student/QBankAssignmentRunner.tsx:215`). OK.
- **Inconsistent.** Jordan would benefit from both: a toast AND a results page.

**3. "Where am I?"** Catastrophic on student paths:
- StudentShell (`viewer/src/auth/StudentShell.tsx:45-67`) is just `<Outlet />` + floating StudentBadge + invisible CommandPalette. **No top bar, no breadcrumb, no bottom nav.**
- `AssignmentRunner` "Back" button (`viewer/src/student/AssignmentRunner.tsx:311,339`) only renders on error / max-attempts. Mid-test there is no back-out except the mock test's own exit affordance.
- ConfirmDialog has **no close X** (`viewer/src/teacher/ConfirmDialog.tsx:55-95`). ClassFormModal has **no close X** (`viewer/src/teacher/ClassFormModal.tsx:262-268`) — only backdrop click or Esc; on phone Jordan has no Esc key and tapping outside a modal isn't an obvious affordance.

**4. Tap targets — class-based audit.** Hits on actionable elements:
- `text-xs` + `py-1.5` Start/Review buttons in AssignmentsPanel (`viewer/src/student/AssignmentsPanel.tsx:127,135`) ≈ 28px tall.
- `text-[11px]` + `py-0.5` Leave button (`viewer/src/student/MyClassesPanel.tsx:46-50`) ≈ 22px tall.
- `h-8` (32px) Prev/Next/Submit in test runner footer (`viewer/src/mocktest/components/TestPhaseFooter.tsx:49,55,66`).
- `text-xs px-3 py-1.5` "New" thread button (`viewer/src/inbox/InboxPage.tsx:56`) ≈ 30px.
- `py-1` StudentBadge wrapper (`viewer/src/auth/StudentBadge.tsx:122`) — outer button ≈ 32px tall.
- MobileTabBar `py-2` (`viewer/src/components/MobileTabBar.tsx:66`) ≈ 36px including 10.5px label.

**Verdict**: every primary action a student takes on a phone is below the 40px rule CLAUDE.md sets.

**5. Drag fallbacks.** ModulesPage drag (`viewer/src/teacher/ModulesPage.tsx:1146,1397`) has a "Move to…" kebab fallback (`:1082,1365`). ✅ But ModulesPage is teacher-only. Students don't see drag affordances anywhere.

**6. Modals on phone.** ConfirmDialog and ClassFormModal both `max-w-md` centered, `fixed inset-0` overlay, backdrop tap to close. **No close-X icon on either** (`viewer/src/teacher/ConfirmDialog.tsx:55`, `viewer/src/teacher/ClassFormModal.tsx:262`). Not full-screen on phone (they're 28rem ≈ 448px wide capped, but viewport is 390px so they're effectively full-width with `px-4` margin). Jordan can dismiss by tapping the dim backdrop, but he doesn't know that — there is no visual hint.

**7. Jargon scan.** Good news: `qbank_set` only appears in TS types (`AssignmentRunner.tsx:42`, `QBankAssignmentRunner.tsx:48,155`) — `qbank_set_label` is mapped to the human title before render. `kind` is mapped to "Assignment" / "Portfolio" in CalendarPage (`:388`). `short_code` only used for URL building, never shown. ✅ No raw jargon leaks to UI labels found in the student paths.

**8. Bottom navigation.** MobileTabBar (`viewer/src/components/MobileTabBar.tsx:26-49`) exists but is **mounted only inside the question-bank App** (`viewer/src/App.tsx:1175`). It is NOT in StudentShell. **Jordan has no persistent navigation on Home, /calendar, /inbox, /account, or in the mock test.** His only persistent nav is the floating StudentBadge in the bottom-right corner of every page (`viewer/src/auth/StudentBadge.tsx:56`) — and even that drops him to either a menu (Switch area / Account / Sign out) or back to Home. He cannot one-tap jump from "What's due?" to "My grades" to "Inbox".

---

## Top 5 fixes (ranked by mobile-student daily impact)

1. **Add a student MobileTabBar to StudentShell** (Home / Calendar / Inbox / Account). Sticky, ≥48px tap targets. Complexity **M**. Highest impact — fixes navigation across every student surface in one shot.
2. **Reorder AreaSelector: put "Due soon" at the top** (move `AssignmentsPanel` above the AreaCards, or add a compact `UpNext` strip above the welcome header). `viewer/src/auth/AreaSelector.tsx:178-247`. Complexity **S**. Directly addresses Jordan's #1 daily question.
3. **Fix calendar mobile layout: replace `min-w-[560px]` month grid with a vertical day-by-day list on small viewports.** `viewer/src/calendar/CalendarPage.tsx:307-338` and `:354-403`. Complexity **M**. Eliminates the only horizontal-scroll surface in the LMS.
4. **Raise every student-facing button to ≥40px and use `text-sm` not `text-xs`.** Specifically: AssignmentsPanel Start/Review (`:127,135`), MockTest footer h-8 → h-11 (`viewer/src/mocktest/components/TestPhaseFooter.tsx:49,55,66`), MyClassesPanel Leave (`:46-50`). Stop hiding the "Submit" / "Next" / "Prev" labels on phone (`hidden sm:inline` at lines 42,61,74 → drop the `hidden`). Complexity **S**.
5. **Add a top-left close X to ConfirmDialog and ClassFormModal**, and add a sticky "Exit assignment" affordance to AssignmentRunner so Jordan can always back out. `viewer/src/teacher/ConfirmDialog.tsx:63-66`, `viewer/src/teacher/ClassFormModal.tsx:265-268`, plus a header on AssignmentRunner above MockTestApp. Complexity **S**.

---

## Verdict

The LMS **renders** on a phone but is not genuinely usable on one. Layouts respect the viewport (`max-w-*` + responsive grids prevent broken pages), and language is friendly with no raw jargon leaks. But three structural problems make this a desktop-first product wearing mobile clothes: (1) the student has **no persistent navigation** — `MobileTabBar` exists but lives only in the question-bank shell, so the entire LMS surface (Home, Calendar, Inbox, Account) is wandered via floating widgets and in-page links; (2) the **single most important question Jordan asks every day — "what's due?" — is buried fifth in the AreaSelector stack** behind cards, announcements, and score predictors; (3) almost every actionable button is **below the 40px touch standard** the project itself sets in CLAUDE.md, and the test runner's mobile footer collapses Submit to a 32px chevron that's invisible to a low-confidence student. Jordan would finish a quiz, see ScoreHero, feel briefly proud, then close the browser because he can't find his way back. Fixes 1–3 above turn this from "renders on a phone" into "usable on a phone" in roughly two waves of work.
