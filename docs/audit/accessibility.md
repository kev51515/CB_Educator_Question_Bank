# Accessibility Audit — CB Educator Question Bank LMS

Read-only cross-cutting audit of `viewer/src/**/*.tsx` (181 .tsx files, 40 dialogs, ~107 aria-labels). Wave 8B Modules page is the reference UX bar.

## 1. Summary

| Dimension | Blocker | Major | Minor |
|---|---:|---:|---:|
| Keyboard navigation | 0 | 2 | 2 |
| ARIA | 1 | 4 | 3 |
| Color contrast | 1 | 3 | 2 |
| Forms | 0 | 1 | 1 |
| Semantic HTML | 0 | 1 | 2 |
| Focus indicators | 0 | 3 | 0 |
| Reduced motion | 0 | 1 | 0 |
| Screen-reader / test runner | 2 | 2 | 1 |
| **Total** | **4** | **17** | **11** |

The codebase has a solid baseline (global `prefers-reduced-motion` honored at `index.css:228`, `useFocusTrap` hook exists at `components/hooks.ts`, 40/40 dialogs declare `role="dialog" aria-modal="true"`, KebabMenu uses `role="menu"`/`role="menuitem"` and Esc-to-close, ConfirmDialog restores focus on close, FileDropzone exposes drop area as keyboard button). But the **test runner has critical SR gaps** and **focus traps are missing from the 17 most-used LMS modals**.

---

## 2. Blockers (must-fix before claiming SAT-accommodation parity)

### B1 — Test runner timer change is silent to screen readers
`viewer/src/mocktest/components/TestPhaseHeader.tsx:46` sets `aria-live="off"` on the countdown pill and the only visual transition into the *critical* state is `animate-pulse` + `text-red-500` (`TestPhaseHeader.tsx:40`). A blind student under extended-time accommodations gets **no audible warning** at the 5-minute / 1-minute boundary. The timer doesn't need to tick (that would be noise), but the **state change** (`warning` → `critical`, and "1 minute remaining") must announce.
**Fix:** add a sibling `<span className="sr-only" aria-live="assertive" role="status">` that the parent updates on threshold crossings only ("5 minutes remaining", "1 minute remaining", "Time is up").

### B2 — Test answer choices are not a radio group
`viewer/src/mocktest/components/AnswerChoices.tsx:21-54` uses a `<button aria-pressed>` per choice inside `role="group"`. A SR student hears four pressable buttons, not "Choice A of 4, radio button" — losing the affordance + position-in-set/total. SAT-aligned. AT users can't navigate with arrow keys (only Tab → 4 stops vs. Tab-into-group + Arrow).
**Fix:** convert to `role="radiogroup"` with `role="radio" aria-checked` children, manage arrow-key navigation + roving tabIndex. The `aria-label="Choice A"` already provides the label string.

### B3 — Critical-state coloring fails AA on white background
`text-red-500` (#ef4444) on `bg-red-50` ≈ 3.7:1, on plain white ≈ 4.0:1. Fails WCAG AA for body text (4.5:1). Appears on `mocktest/components/TestPhaseHeader.tsx:40`, the unanswered-warning `SubmitConfirmDialog.tsx:58-69` (`text-amber-500` ≈ 3.1:1 on white — **worse**), and several skill heatmap variants. For a *timed* test this is functionally exclusionary.
**Fix:** use `text-red-700` / `text-amber-700` for body text on light backgrounds; reserve `-500` for fills/borders/icons.

### B4 — Inline rename pencil reveal is hover-only on Modules page
`viewer/src/teacher/ModulesPage.tsx:336-348` shows the pencil icon via `opacity-0 group-hover:opacity-60`. Keyboard-only users tabbing to a module title see nothing; the rename affordance is invisible until mouse hover. Same pattern repeated for module items. This is the project's reference UX bar — the bar itself is currently inaccessible to keyboard users.
**Fix:** add `group-focus-within:opacity-60` alongside the hover class, and ensure the InlineRename button has a visible `:focus-visible` ring.

---

## 3. Majors

### Keyboard

- **M1 — `text-transparent`/invisible drop targets not keyboard-reachable.** ModulesPage DnD reorder (`ModulesPage.tsx:1146-1194`) has no keyboard equivalent. The "Move to…" kebab option (`ModulesPage.tsx:1082, 1365`) is the documented fallback — but the position picker (`MoveItemPicker:431-453`) uses a raw numeric input ("Position (0-based)") which is unusable without seeing the current order. **Fix:** show the target module's current items in the picker and let the user pick "Before X / After X / At top / At end". Same applies to `MoveModulePicker:478-559` and `CoursePortfolio.tsx:680-915`.
- **M2 — Submit-Test confirmation doesn't trap focus.** `mocktest/components/SubmitConfirmDialog.tsx:25-93` has `autoFocus` on Cancel but no trap → Tab escapes to the now-occluded TestPhase under the overlay. A keyboard user can accidentally interact with answer choices behind the modal.

### ARIA

- **M3 — 17 LMS modals declare `role="dialog"` but do not trap focus.** Inventory from grep (`useFocusTrap` not imported): `inbox/NewThreadModal.tsx`, `auth/UpgradeAccountModal.tsx`, `student/PortfolioSubmissionForm.tsx`, `student/MyClassesPanel.tsx`, `student/JoinClassModal.tsx`, `components/CommandPalette.tsx`, `components/ShortcutHelpOverlay.tsx`, `mocktest/components/SubmitConfirmDialog.tsx`, `teacher/SubmissionDetailDrawer.tsx`, `teacher/ConfirmDialog.tsx`, `teacher/EditModuleModal.tsx`, `teacher/AddMaterialModal.tsx`, `teacher/DuplicateCourseModal.tsx`, `teacher/BulkRosterModal.tsx`, `teacher/TopicFormModal.tsx`, `teacher/AddSetToCourseModal.tsx`, `teacher/ClassFormModal.tsx`, `teacher/AddItemModal.tsx`, `teacher/AddModuleModal.tsx`, `teacher/AssignmentFormModal.tsx`, `teacher/PortfolioItemFormModal.tsx`, `teacher/AnnouncementFormModal.tsx`. Tab leaks to the page behind. ConfirmDialog (`teacher/ConfirmDialog.tsx:47-54`) restores focus on close but does not trap. **Fix:** call `useFocusTrap(dialogRef, true)` from `components/hooks`.
- **M4 — Skeleton component lacks `aria-busy`/`role="status"`.** `viewer/src/components/Skeleton.tsx:6-12` renders `animate-pulse` divs but the containing region is never marked `aria-busy="true"` or wrapped in an `aria-live="polite"` region. SR users hear nothing, then suddenly content appears. Used in ModulesPage, AssignmentsPage, etc. **Fix:** wrap `SkeletonRows` in `<div role="status" aria-live="polite" aria-busy="true"><span className="sr-only">Loading…</span>…</div>`.
- **M5 — KebabMenu trigger missing `aria-haspopup` + `aria-expanded`.** `components/KebabMenu.tsx:96-107` has `aria-label="More actions"` but no `aria-haspopup="menu"` or `aria-expanded={open}`. SR users don't know it opens a submenu. Also no arrow-key navigation between menuitems (`role="menu"` requires this per WAI-ARIA APG).
- **M6 — Toast uses `role="status"` for errors.** `components/Toast.tsx:69` uses `role="status"` (polite) for all variants. Errors should be `role="alert"` (assertive) — a destructive-action failure can be missed by SR users. **Fix:** branch on `variant === "error"`.

### Color contrast

- **M7 — `text-slate-400 dark:text-slate-400` as body text on white.** ~3.5:1, fails AA. Examples: `inbox/InboxPage.tsx:98`, `inbox/ThreadView.tsx:200`, `auth/AccountRoutes.tsx:139`. Used as timestamps and meta lines that students/teachers actually read. **Fix:** use `text-slate-500` (passes 4.5:1) for body and reserve `-400` for ≥18pt or decorative.
- **M8 — Amber pill text in dark mode.** Multiple sites use `text-amber-300 dark:text-amber-300` on `bg-amber-100 dark:bg-amber-950/50` (e.g. `student/CourseAnnouncementsList.tsx:85`, `teacher/CourseMaterials.tsx:262,412`, `student/StudentPortfolio.tsx:88,103`, `components/CourseCard.tsx:207`). In **light mode** the class string is `text-amber-700 dark:text-amber-300` so light is fine; in dark mode `text-amber-300` on `bg-amber-950/50` is ~5:1 — borderline OK. The concern is `bg-amber-100` (light cell) with `text-amber-300` if dark prefs override — verify per pill. Lower priority than M7.
- **M9 — `text-indigo-600 dark:text-indigo-400` links in dense rows.** Within `ModulesPage.tsx:1460,1468` and similar, link text relies on color alone (no underline by default — `hover:underline` only). Fails WCAG 1.4.1 use-of-color. **Fix:** keep `underline underline-offset-2` always, brighten on hover.

### Forms

- **M10 — `MoveItemPicker` "Position (0-based)" number field is unlabeled by intent.** `ModulesPage.tsx:445-454` has a visible `<label>` wrapping but no help text + no validation feedback. A teacher entering a number > items length gets silent reorder. Add inline validation + announce errors via `aria-describedby`.

### Semantic HTML

- **M11 — `<a href onClick stopPropagation>` patterns inside row buttons.** `ModulesPage.tsx:1455,1465` nest interactive elements (button-link or assignment-button) inside a `draggable` row. While technically OK with stopPropagation, the row itself is not focusable (no tabIndex) so a keyboard user lands on the inner button only — meaning the row is the only thing draggable but nothing dragable is keyboard-focusable. Reinforces M1.

### Focus indicators

- **M12 — `focus:outline-none` without ring replacement.** Confirmed at:
  - `components/MarkdownEditor.tsx:43` (ProseMirror content area — typed content host)
  - `admin/AllClassesView.tsx:362` (inline rename for class name)
  - `components/CommandPalette.tsx:239` (search box)
  - `teacher/ModulesPage.tsx:2962` (inline "+ Module" creation input)
  - `teacher/TeacherConsole.tsx:160` (search input)
  Five interactive inputs that disable the outline and supply no replacement → keyboard users can't see focus. **Fix:** add `focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1` (or `focus-visible:` variant).

- **M13 — `CourseCard.tsx:166-181` ring focus only on inner div.** When kebab is present, the card renders as `<div role="button" tabIndex={0}>` with `focus:ring-2` via `baseClass:94`. OK on the wrapper, but the inner `KebabMenu` button (`CourseCard.tsx:117`) is a nested interactive child — focus order is wrapper, then kebab. The kebab inherits the wrapper's `focus:outline-none focus:ring-2` styling? No: the kebab is a separate `<button>` from KebabMenu component with no focus styles defined. Verify with manual SR/keyboard test.

- **M14 — Drag handle has no focus state.** `ModulesPage.tsx:107-134` `DragHandle` is a `<svg>` with `cursor-grab` but no tabIndex, no aria-label, and no role. Not keyboard-discoverable as a drag affordance.

### Reduced motion

- **M15 — `animate-pulse` on critical states overrides the global reduce rule for users without OS preference set.** The `index.css:228-237` media query is correct, but the *visual urgency* of `animate-pulse` on `recentlyMovedId` (`ModulesPage.tsx:1143, 1445`) and the critical timer pill (`TestPhaseHeader.tsx:40`) is a known migraine/vestibular trigger and for users who haven't enabled OS preference it's still distracting during a timed test. Consider an in-app A11y pref toggle (one exists in `components/A11yPreferences.tsx` — verify it gates these classes).

### Screen reader / test runner

- **M16 — `MockTestApp` test phase has no `<h1>`.** `mocktest/components/TestPhase.tsx` renders only `<main>` (line 178), no `<h1>` — the test label sits in a `<span>` inside `<TestPhaseHeader>` (`TestPhaseHeader.tsx:32`). Skipping the document outline is confusing for SR navigation by heading.
- **M17 — Answer choice `[1] [2] [3] [4]` shortcut hint is `aria-hidden`** (`AnswerChoices.tsx:49`). Good — but the *availability* of shortcuts is never announced. Add an `sr-only` instruction near the radiogroup: "Press 1-4 or A-D to choose. Press F to flag."

---

## 4. Minors (grouped)

- **Headings:** `student/AssignmentRunner.tsx:294,325` use `<h2>` with no `<h1>` above (error/max-attempts states render top-level). Use `<h1>`.
- **Lists not marked up:** Many module/item lists use `<div>`s instead of `<ul role="list">` (e.g. ModulesPage items, CoursePortfolio items, CourseGradebook table rows).
- **`<button>` icon-only without `aria-label` count:** ~5 buttons in ModulesPage rely on visual text but the expand/collapse arrow button (`ModulesPage.tsx:1216-1232`) has only `title=` (not announced by all SRs). Add `aria-label`.
- **`title=` over-reliance:** KebabMenu, PublishToggle, several emoji-only spans use `title=` — not consistently surfaced by SR or mobile.
- **Emoji status icons:** `ITEM_TYPE_ICON` uses 📝🔗📄📎 (`ModulesPage.tsx:565-571`) marked `aria-hidden`, but the visible-text fallback is the title only — SR users don't hear "assignment" vs "link" vs "file". Add a visually-hidden type label.
- **`<svg>` checkmarks for completion** (`PublishBadge:236-249`) use `text-white` symbol on `bg-emerald-500` — passes contrast but redundant with title. Add `aria-label="Published"` on the wrapper span instead of `title`.
- **`text-amber-500` on white in SubmitConfirmDialog** (lines 58-69) flagged as B3 but also a minor consistency issue with the rest of the design system.
- **Reduced-motion respects OS but not in-app preference toggle.** Verify `A11yPreferences.tsx` actually emits a class hook that the runner observes.
- **No skip link** to main content. The shell `auth/StaffShell.tsx:275` has `<main>` but no `<a href="#main">` skip link.
- **Inputs without label/aria-label:** 5 raw `<input>` instances surfaced; spot-check showed they had wrapping `<label>` — acceptable. Tighten with explicit `aria-label` for clarity.
- **`PublishToggle:154-191`** is well done — `role="switch" aria-checked`. Minor: label uses `hidden sm:inline` so on mobile only the visual switch shows; the `title=` carries the state. Add `<span className="sr-only">{published ? 'Published' : 'Draft'}</span>`.

---

## 5. Test-runner accessibility verdict

**Can a screen-reader / keyboard-only / extended-time student use this LMS today?**

- **Keyboard-only student**: *Partially.* Can navigate menus and modals (Esc works, Tab order mostly sane), can answer questions (`AnswerChoices` are real `<button>`s), can submit. Cannot reorder modules via drag (Move-to kebab works but position picker is bad — M1). Focus traps missing on 17 modals — Tab leaks (M3). Several inputs hide focus (M12). **Usable but degraded.**
- **Screen-reader student**: *No, not for the timed test.* B1 (silent timer state changes), B2 (choices are buttons not radios) and M5/M6 (no announce of menu state / wrong toast politeness for errors) combine to make the *timed test* a hostile environment. The non-test surfaces (Modules, Assignments, Gradebook) are largely usable.
- **Extended-time student (ESL/dyslexia, no SR)**: *Yes.* Timer is visible, can navigate, contrast issues are localized.
- **SR + extended-time (standard SAT accommodation combination)**: **No.** B1+B2 must ship before claiming this — College Board SAT accommodations explicitly include screen-reader-with-extra-time and the runner has neither announce-on-threshold nor radio semantics.

---

## 6. Top 10 fixes (ranked)

| # | Title | file:line | Fix | Complexity |
|---|---|---|---|---|
| 1 | Announce timer threshold crossings | `mocktest/components/TestPhaseHeader.tsx:35-51` (parent: `TestPhase.tsx:63-67`) | Add an `sr-only` `aria-live="assertive" role="status"` sibling updated only on `warning`/`critical`/`time-up` transitions | S |
| 2 | Convert answer choices to radio group | `mocktest/components/AnswerChoices.tsx:19-57` | Switch to `role="radiogroup"` + `role="radio" aria-checked`, add arrow-key handler + roving tabIndex; keep aria-label, keep 1-4/A-D shortcuts on parent | M |
| 3 | Fix critical-color contrast | `TestPhaseHeader.tsx:40`, `SubmitConfirmDialog.tsx:58,69` | `text-red-500`→`text-red-700`, `text-amber-500`→`text-amber-700` for body text | S |
| 4 | Trap focus in all LMS modals | 17 files in M3 inventory | Add `useFocusTrap(dialogRef, true)` (hook already exists) | M |
| 5 | Reveal inline-rename pencil on focus | `teacher/ModulesPage.tsx:341` and item-row equivalents | Add `group-focus-within:opacity-60` to pencil; ensure visible `focus-visible:ring` on the rename button | S |
| 6 | Restore focus rings on the 5 inputs | `MarkdownEditor.tsx:43`, `AllClassesView.tsx:362`, `CommandPalette.tsx:239`, `ModulesPage.tsx:2962`, `TeacherConsole.tsx:160` | Add `focus-visible:ring-2 focus-visible:ring-indigo-500` | S |
| 7 | `text-slate-400` → `text-slate-500` for body text | InboxPage, ThreadView, AccountRoutes etc. (grep) | Replace in body lines; keep -400 for icons | M |
| 8 | Skeleton announce-busy | `components/Skeleton.tsx` + `SkeletonRows` | Wrap container `role="status" aria-live="polite" aria-busy="true"` + sr-only "Loading…" | S |
| 9 | KebabMenu APG compliance | `components/KebabMenu.tsx:96-145` | Add `aria-haspopup="menu" aria-expanded={open}`; add Arrow Up/Down navigation within menuitems | M |
| 10 | Toast errors use `role="alert"` | `components/Toast.tsx:69` | Branch on variant: `role={variant === "error" ? "alert" : "status"}` and `aria-live="assertive"` for errors | S |

Total estimated effort: ~6 small + ~3 medium fixes → ~1.5 dev-days to clear the blockers + top majors. Tackling 1-3 alone makes the timed test SR-usable.
