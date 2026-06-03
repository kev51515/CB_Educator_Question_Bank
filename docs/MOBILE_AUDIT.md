# Mobile Audit — LMS Surfaces at 360px

**Methodology**: Static analysis of JSX/Tailwind class strings for each surface. No live browser observation — findings reason from class semantics about how the layout will render at the iPhone SE width (360px). Caveats:

- Cannot verify actual computed pixel dimensions, scrollbar overlap, or text wrap behavior.
- Cannot observe touch-vs-mouse interaction differences (notably HTML5 drag-and-drop does NOT work on touch devices — flagged below).
- Cannot detect runtime z-index conflicts between overlapping fixed elements.
- Body font, prose stylesheet, and `MarkdownEditor`/`SafeHtml` inner markup not audited — they may introduce their own overflow.

Tap-target reference: Apple HIG and WCAG 2.5.5 both target **44×44px** minimum. "Borderline" below means 28–40px (usable but flagged).

---

## auth/AuthScreen

**Mobile risk**: Low

- Card is `max-w-md` centered on a `flex` viewport with `px-4` — fits comfortably at 360px (`max-w-md` = 448px caps below viewport but card has `w-full` so it shrinks).
- Tabs are `flex gap-2` two-button row — each tab gets ~150px wide, height ~36px from `py-2 text-sm`. Borderline height; tap area OK.
- Inputs are full-width with `py-2 px-3` — fine.
- Sign-up role radiogroup uses `grid-cols-2` (unprefixed) — that's intentional 2-up at all widths, fine here.
- Submit buttons are `w-full py-2.5` — primary CTA height ~40px. Borderline; not below 40.
- "Forgot password?" link is `text-xs font-medium` — tap area is the natural text height ~16–18px. Below 40px tap target, but right-aligned in spacious area so unlikely to be mis-tapped.

**Recommended fixes**:
- Bump primary submit buttons to `py-3` (~44px) to clear WCAG 2.5.5.
- Wrap "Forgot password?" in `py-2` to expand vertical hit area.

---

## auth/QuickStartScreen

**Mobile risk**: Low

- Same shell as AuthScreen (`max-w-md`, `px-4`, full-width inputs) — fits 360px.
- Course-code input uses `font-mono tracking-widest` — at narrow widths a long code like `ABCD1234` is fine, but pasting longer course codes risks horizontal overflow inside the field (it will scroll inside the input — not breakage, just awkward).
- Single primary `w-full py-2.5` button — borderline 40px tap target.

**Recommended fixes**:
- Same `py-3` upgrade for the primary CTA.

---

## auth/AreaSelector

**Mobile risk**: Medium

- Page wrapper is `max-w-3xl px-4 py-12` — content area inside 360px viewport = 328px after padding. Reasonable.
- Header is `flex items-start justify-between` (no `flex-col sm:flex-row`) — at 360px the "Welcome back / Hi, name" block plus the right-side "Sign out" button compete for horizontal space. The button has no `shrink-0`, but it's short text so likely fits.
- Area cards use `grid gap-4 sm:grid-cols-2` — collapses to single column at 360px **✓**.
- "Your progress" sub-grid is `grid gap-4 md:grid-cols-2` — single column on mobile **✓** (SkillHeatmap and ScorePrediction stack).
- Risk: `SkillHeatmap` and `ScorePrediction` aren't audited; if either renders a fixed-width heatmap grid (`grid-cols-N`) it will overflow.
- "Join a course" button bottom-right is `flex justify-end` + button with `px-4 py-2` — fits.
- Sign-out button is `text-sm px-3 py-1.5` — ~32px tall. Borderline tap target.

**Recommended fixes**:
- Audit `SkillHeatmap.tsx` for fixed-column grids; add `overflow-x-auto` wrapper if needed.
- Increase sign-out button to `py-2.5` minimum.
- Verify card title `text-xl` doesn't overflow with the right-side arrow at 360px (likely fine because of `flex-1` on the title column).

---

## auth/StaffShell (left rail)

**Mobile risk**: High

- Left rail is `w-20 md:w-44` — at <768px collapses to 80px icon-only column. **Good in principle**, but...
- Rail items are `flex flex-col md:flex-row` — at mobile they stack icon over text (`text-xs` label). Label "Announcements" at `text-xs` in a 80px column will wrap awkwardly or get truncated since there's no `truncate` on the `<span>`.
- Rail header label "Educator" is `hidden md:block` — correctly hidden on mobile **✓**.
- Sticky `h-screen` rail on mobile consumes 80px of every screen and CANNOT be dismissed — eats 22% of viewport width permanently. Standard mobile pattern would be a bottom tab bar or hamburger drawer.
- Floating `NotificationBell` is positioned `fixed bottom-3 right-44` — at 360px, `right-44` (176px from right edge) lands the bell awkwardly in the middle-right. It does NOT collide with StudentBadge at `right-3` (12px from right) — gap is fine. But `right-44` is hardcoded for desktop spacing; on mobile it may overlap content.
- StudentBadge is `fixed bottom-3 right-3 z-50` — overlays the bottom-right corner where students often need to interact with primary CTAs (e.g., the "Join a course" button on AreaSelector lands near there).

**Recommended fixes**:
- Switch the rail to a bottom tab bar at `sm:` and below, or a slide-in drawer triggered by a hamburger.
- Add `truncate` to the rail link `<span>` labels.
- Make `NotificationBell` position responsive — e.g., `right-3 bottom-16 md:bottom-3 md:right-44` so the bell stacks above the badge on mobile rather than alongside.
- Consider hiding StudentBadge label `firstName` on the smallest widths (already capped at `max-w-[8rem]` — fine).

---

## dashboard/DashboardPage

**Mobile risk**: Low

- Container `max-w-6xl px-4 py-6` — fits 360px (`max-w-6xl` is a cap, content shrinks).
- Course-card grid is `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` — single column on mobile **✓**.
- Card header band is `h-24 w-full` — full width, no fixed pixel width. Good.
- `CardActionIcon` tap targets are `h-7 w-7` (28px) — borderline; below the 40px target.
- Card titles use `truncate` — won't break layout if course name is long.

**Recommended fixes**:
- Enlarge quick-action icons to `h-9 w-9` minimum on touch widths (`sm:h-7 sm:w-7`).

---

## admin/AllClassesView

**Mobile risk**: High

- Container `max-w-7xl px-4 py-6` — fits 360px after padding.
- Header is `flex items-center justify-between gap-3 flex-wrap` — `flex-wrap` will allow the search + refresh group to drop below the title on narrow widths **✓**.
- Search input has no `w-full` — it picks up its natural width (around 200–240px). At 360px after padding + wrap, fits.
- Filter chips use `flex items-center gap-2 flex-wrap` — chips wrap nicely.
- Main table: `min-w-full text-sm` inside `overflow-x-auto` wrapper. The table itself has 6 columns (Name / Teacher / Members / Assignments / Status / Created, +1 for templates). The teacher cell holds name + email stacked; row will be tall. Net: table **will require horizontal scroll** at 360px (probably 600–700px natural width). The `overflow-x-auto` makes that survivable, but:
  - First column (Name) is not `sticky` — when scrolling right, the user loses the row identity.
  - Click target is the entire row — tap-anywhere is mobile-friendly.

**Recommended fixes**:
- Sticky-position the first column: `sticky left-0 z-10 bg-white`.
- Consider a mobile card-style list at `<sm:` (each row becomes a stacked card with key-value pairs).
- Make filter chip tap area larger — chips are `px-3 py-1 text-xs` (~26px tall). Bump to `py-1.5`.

---

## admin/AllUsersView

**Mobile risk**: High

- Container same `max-w-7xl px-4 py-6` — fits.
- Header `flex-wrap` — wraps **✓**.
- Table: 5 columns (Name / Email / Role / Created / Actions). Actions cell contains an inline `<select>` + Delete button — that's 2 controls per row, will be wide. Table will horizontally scroll at 360px.
- Role `<select>` is `px-2 py-1 text-xs` — native picker tap area is OS-controlled, generally fine.
- Delete button is `text-xs font-medium hover:underline` — naked text link, NO padding, probably ~16px tall. **Below tap-target threshold for a destructive action** — risky.
- Pagination Prev/Next at `px-2.5 py-1 text-xs` — ~28px tall, borderline.

**Recommended fixes**:
- Pad the Delete button: `px-3 py-1.5` minimum.
- Sticky first column for horizontal scroll context.
- Add explicit `w-9 h-9` to Prev/Next buttons or pad to `py-2`.

---

## admin/SystemStats

**Mobile risk**: Low

- KPI grid is `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4` — explicit single column at mobile **✓**.
- "Most active" tables are inside `grid grid-cols-1 lg:grid-cols-2` (stacks at mobile) and each has its own `overflow-x-auto`. Tables have only 2–3 columns and short content — will likely fit without horizontal scroll at 360px.
- Refresh button is `text-sm font-medium hover:underline` — naked link, small tap target.

**Recommended fixes**:
- Pad the refresh link.

---

## teacher/TeacherConsole

**Mobile risk**: Low

- Container `max-w-5xl px-4 py-12` — fits.
- Header `flex items-start justify-between` — at 360px the "Create course" CTA (`px-4 py-2`) competes with the title. No `flex-col sm:flex-row`. CTA is short text; should fit but may force title to wrap awkwardly.
- Class card grid `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` — single column on mobile **✓**.
- Cards have `truncate` on title and `line-clamp-2` on description — no overflow.

**Recommended fixes**:
- Stack header on mobile: `flex-col items-start sm:flex-row sm:items-start`.

---

## teacher/ClassLayout (tab strip)

**Mobile risk**: High

- The course header lives in `max-w-5xl px-4` — fits 360px.
- Course name + archived badge use `flex-wrap` with `truncate` on `<h1>` — works.
- Kebab menu button is `p-2` (~36px) — borderline tap target.
- **The tab strip is the critical issue**: 10 tabs (Modules / Overview / Roster / Assignments / Announcements / Materials / Discussions / Portfolio / Grades / Settings) inside a `flex items-center gap-1 overflow-x-auto` container. `whitespace-nowrap` + `overflow-x-auto` means the strip is horizontally scrollable — survivable, but:
  - No scroll-indicator gradient — user may not realize there are more tabs offscreen.
  - The currently-active tab does NOT auto-scroll into view, so deep-linking to e.g. `/grades` lands on a screen where the active tab is invisible.
  - Tab buttons are `px-3 py-2 text-sm` — ~36px tall, borderline.
- Dropdown menu positions `absolute right-0 mt-1 w-56` — at 360px viewport that's 56*4 = 224px wide menu, fits.
- Edit modals are not audited here (live in `ClassFormModal`) but `ConfirmDialog` for delete includes an inline confirm-text input that should be fine.

**Recommended fixes**:
- Auto-scroll the active tab into view on mount: `useEffect(() => activeTab?.scrollIntoView(...))`.
- Add a left/right fade gradient overlay to signal scrollability.
- Increase tab `py-2` to `py-2.5` for better tap target.
- Consider collapsing rarely-used tabs into a "More" menu on mobile.

---

## teacher/ModulesPage

**Mobile risk**: P0 (critical) — drag-and-drop has no touch fallback

- Toolbar uses `flex flex-wrap items-center justify-between gap-3` — header and action chips wrap on narrow widths **✓**.
- Module cards are full-width `rounded-2xl` — fine.
- Module row has `flex items-center gap-2 px-3 py-3` containing: DragHandle (14×20px) + expand toggle + title (`InlineRename`) + lock/opens-at labels + `PublishToggle` (24×24px / w-6 h-6) + KebabMenu (28×28px / w-7 h-7). At 360px after `ml-6` indent on nested modules (`ml-6` = 24px on every depth level), a deeply nested module shrinks to ~250–300px. The inline metadata (`🔒 {date}`, `opens {date}`) uses `truncate` — fine, but those `text-xs` strings will visually crowd the title.
- Item rows have `padding-left` proportional to `item.indent` (`${0.75 + item.indent * 1.25}rem`) — a 3-level indented item has paddingLeft = ~4.5rem = 72px. On a 320px-content area minus the drag handle + icon + publish toggle + kebab, the title field shrinks to ~140–180px. Title `truncate` saves it but readability is poor.
- **Critical**: drag handles use HTML5 native `draggable={canEdit}` + `onDragStart/Over/Drop` — these events **do not fire on touch devices**. Reordering modules and items is impossible on mobile/tablet. Indent/Outdent kebab fallback exists but Move-to picker is the only practical alternative.
- `PublishToggle` is 24×24px (`w-6 h-6`) — below tap target.
- `DragHandle` SVG is 14×20px hit area — below tap target (irrelevant since drag is broken anyway).
- `LockUntilPicker` / `MoveItemPicker` / `MoveModulePicker` modals use `max-w-sm` + `p-4 space-y-3` — fit 360px after the `p-4` padding (`max-w-sm` = 384px caps below).
- The `datetime-local` input is full-width — relies on OS picker on mobile, fine.

**Recommended fixes**:
- **P0**: Replace native HTML5 drag with a touch-aware library (`@dnd-kit/core` or `react-beautiful-dnd`) OR make Move-to picker prominent on touch widths (auto-show Move icon next to kebab).
- Bump `PublishToggle` to `w-8 h-8` (32px) minimum.
- Cap `item.indent` visual offset on mobile: e.g., `Math.min(item.indent, 2) * 1.25rem`.
- Move lock/opens-at metadata into a second line on mobile instead of inline.

---

## teacher/CourseAnnouncements

**Mobile risk**: Low

- Page header `flex items-start justify-between gap-4` (no `flex-col` prefix) — title + "+ Announcement" button compete for width. Button is `px-4 py-2` — short, will fit.
- Cards: `rounded-2xl p-5` — fine.
- Card header `flex items-start justify-between gap-3` with title + pinned badge wrapping via `flex-wrap`, plus a kebab on the right — works.
- Kebab dropdown `absolute right-0 mt-1 w-48` — fits 360px viewport.
- Body uses `line-clamp-3` on collapsed view, full when expanded; SafeHtml inner content NOT audited (may contain wide tables, images, code blocks — could overflow).

**Recommended fixes**:
- Add `flex-col sm:flex-row` to page header for cleaner mobile stacking.
- Add `overflow-x-auto` inside `SafeHtml` wrapper to contain wide embedded content.

---

## teacher/CourseMaterials

**Mobile risk**: Medium

- Same shell pattern as Announcements (cards + add CTA + kebabs).
- Modal at `fixed inset-0 z-50 flex items-center justify-center px-4` — modal content sized inside via inner max-width, fits.
- Materials list pattern likely uses the same card+kebab convention — fine.
- Risk: if Material rows show file-size / file-name / uploader inline horizontally without wrap, they may overflow. Not verified without full re-read.

**Recommended fixes**:
- Verify file-row metadata wraps; add `flex-wrap` to inner meta rows if not present.

---

## teacher/CourseDiscussions

**Mobile risk**: Low

- Cards via `<Link>` with `rounded-2xl p-5` — fits.
- Topic title `flex items-center gap-2 flex-wrap` with truncating `<h3>` + pinned/locked badges — works.
- SafeHtml body has `line-clamp-2` — safe.
- Page header same as Announcements — same fix applies (`flex-col sm:flex-row`).

---

## teacher/CoursePortfolio

**Mobile risk**: P0 — drag-and-drop + overview grid

- Portfolio item nodes use `flex items-start gap-2` with a DragHandle, expand toggle (`w-5 h-5`, 20px tap target — below threshold), type icon, title block, and kebab on the right. `min-w-0 flex-1` on the title block lets it shrink correctly.
- Nested children use `ml-6 mt-2 border-l-2 pl-3` — at deep nesting the visible content area collapses below 200px. `line-clamp-3` saves the prompt from overflowing vertically; title `truncate` handles horizontal.
- Drop zones use HTML5 drag events — same touch-device blocker as ModulesPage.
- **Overview Grid (staff-only)**: a roster × portfolio-items matrix table with `overflow-x-auto`. With even 5 students × 5 portfolio items, the table will be much wider than 360px. The first "Student" column IS `sticky left-0 z-10 bg-...` — **good, this is correctly implemented**. Item header column titles use `whitespace-nowrap` — they won't wrap, so wide titles will create a very wide table.
- Cell chips are `px-2 py-0.5 text-xs` — ~24px tall, tap target borderline.
- `KebabMenu` width-44 dropdown — fits.

**Recommended fixes**:
- **P0**: Touch-aware drag library.
- Increase expand-toggle tap area to `w-8 h-8`.
- Cap nested indent at depth 2 on mobile.
- Allow item header titles to wrap at `<sm:` (`whitespace-normal sm:whitespace-nowrap`) so the grid is narrower.
- Bump cell chip `py-0.5` to `py-1.5`.

---

## teacher/CourseGradebook

**Mobile risk**: High

- Wraps the gradebook table in `overflow-x-auto`. Table is `min-w-full border-collapse` — a roster × assignments grid that will be **far wider than 360px** in any real course.
- Did NOT audit whether the first (student) column is sticky-positioned — file has `sticky left-0` patterns in similar places, worth verifying. Without sticky-first-column, scrolling right hides which student a cell belongs to.
- Header column titles likely use `whitespace-nowrap` to prevent wrapping (common for gradebooks).

**Recommended fixes**:
- Ensure first column is `sticky left-0 z-10 bg-white` (verify; if absent, add).
- Consider a mobile "single-student detail" pattern where tapping a row drills into per-student grade detail rather than rendering a matrix.

---

## teacher/AssignmentsPage

**Mobile risk**: Medium

- Page wrapper `max-w-5xl px-4 py-6` — fits.
- Header has the same `flex items-start justify-between gap-4` (no col fallback) plus "Create assignment" CTA — title may wrap.
- Card grid is `grid gap-4 sm:grid-cols-2` — single column on mobile **✓**.
- Each card uses `grid gap-x-4 gap-y-1 grid-cols-2 text-xs` for the metadata `<dl>` (Source / Questions / Time / Due) — 2 columns of metadata at all widths, fine.
- Kebab dropdown `absolute right-0 mt-1 w-48` — fits.
- Delete-confirm modal is `fixed inset-0 z-50` with `max-w-md` inner — fits with `px-4`.

**Recommended fixes**:
- `flex-col sm:flex-row` on page header.

---

## teacher/AssignmentDetailPage

**Mobile risk**: Medium

- Detail metadata uses `grid grid-cols-2 sm:grid-cols-3` — explicit 2-column at mobile, OK but `<dt>/<dd>` pairs may be tight at 360px ÷ 2 = 180px columns minus `gap-x-6`. Reasonable.
- Kebab dropdown `w-48` — fits.
- Attempt list / submission detail not deeply audited — likely card-based and OK.

**Recommended fixes**:
- Consider `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` so metadata stacks fully on mobile.

---

## student/AssignmentRunner

**Mobile risk**: Low (gating screens) — but the underlying MockTestApp was NOT audited

- AssignmentRunner only renders loading / error / max-attempts shells: all use `max-w-md w-full rounded-2xl px-4 p-6` — fit 360px.
- Buttons are `px-4 py-2 text-sm` — ~36px tap, borderline.
- The actual test runner (MockTestApp) is the destination — the mock test question UI was out of scope for this audit but is the most likely place to break on mobile (timer overlays, question navigators, answer choices).

**Recommended fixes**:
- Bump gating buttons to `py-2.5`.
- Out-of-scope follow-up: audit `mocktest/MockTestApp.tsx` separately — this is the highest-stakes screen for the student.

---

## student/AssignmentsPanel

**Mobile risk**: Low

- Section wrapper `rounded-2xl p-5 space-y-4` — fits.
- Each `AssignmentRow` is a `<li>` with `flex items-start justify-between gap-3` — left side is `min-w-0` (shrinks) with truncating title + meta line; right side is `shrink-0` button. Works at 360px.
- Meta row uses `flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]` — wraps **✓**.
- Buttons are `px-3 py-1.5 text-xs` — ~28px tall, borderline tap target on a Start CTA.

**Recommended fixes**:
- Bump Start/Resume/Review buttons to `py-2 text-sm`.

---

## student/StudentPortfolio

**Mobile risk**: Medium

- Card pattern same as teacher CoursePortfolio without drag — `flex items-start gap-3` works.
- Children nested with `ml-6` border-left tree — same indent-accumulation concern as ModulesPage but less severe (no drag).
- "Open" button `px-4 py-2 text-sm` — ~36px, borderline.
- Status badges `px-2 py-0.5 text-[10px]` — visual not tap-target (non-interactive spans).

**Recommended fixes**:
- Cap nested indent depth at mobile.
- Bump Open button height.

---

## inbox/InboxPage

**Mobile risk**: P0 — two-pane layout has no responsive collapse

- Root is `flex h-screen bg-white` with a `w-72 flex-shrink-0` left aside and a `flex-1` right section. At 360px, **the 288px left rail consumes 80% of the viewport**, leaving 72px for the right pane. The user cannot read messages.
- No `hidden sm:flex` / drawer collapse — the layout is unconditionally desktop-style.
- Thread list rows are `px-4 py-3` — reasonable tap targets.
- Unread badge `min-w-[1.25rem] h-5` (~20px) — fine, it's a non-interactive indicator.

**Recommended fixes**:
- **P0**: Implement a master/detail responsive pattern. On mobile: show ONLY the thread list when no threadId, ONLY the ThreadView when one is selected, with a back arrow to return. Examples:
  - `hidden md:flex` on the `<aside>` when a thread is open, and `md:flex` on the right pane always.
  - Or use a single full-width column with route-driven visibility.

---

## inbox/ThreadView

**Mobile risk**: Medium (dependent on InboxPage fix)

- Within ThreadView: messages use `max-w-[75%]` bubbles — calculated against the parent's flex column, so at 360px viewport minus 72px left rail = a 72px-wide column, bubbles would be ~54px wide. Once InboxPage is fixed, the 75% becomes useful (~240px of 320px content area).
- Message author timestamps use `text-[10px]` — small but legible.
- Compose row: `flex gap-2 items-end` with a `flex-1` MarkdownEditor + Send button. Send is `px-4 py-2` — fine.
- MarkdownEditor `showToolbar` may render a horizontal toolbar wider than 360px — not verified.

**Recommended fixes**:
- After InboxPage fix, verify MarkdownEditor toolbar wraps or `overflow-x-auto` at narrow widths.
- Consider hiding toolbar on small screens (`showToolbar={isMobile ? false : true}`).

---

## calendar/CalendarPage

**Mobile risk**: High

- Outer `px-4 md:px-8 py-6` — 16px sides on mobile.
- View toggle "Month / List" uses `inline-flex rounded-lg ring-1 overflow-hidden` — two short buttons, fits.
- **MonthView**: `grid grid-cols-7` for both header and day cells — at 360px after 32px padding = 328px / 7 = ~47px per day cell. That's tight but viable.
- Each `MonthCell` has `min-h-[96px]` — fixed pixel min-height. Will create a very tall calendar (96 × 6 rows = 576px). OK at mobile, no break.
- Event chips inside cells: `text-[11px] truncate` — fits.
- Event chip tap target is ~24px tall — way below the 44px target. The +N more affordance is `text-[11px] hover:underline` text link — even smaller.
- Day numbers are not interactive — fine.
- **ListView**: `<table>` with 5 columns (Date / Time / Type / Title / Course). `Date` and `Time` cells use `whitespace-nowrap` — won't wrap, plus type chip + title + course = the table easily exceeds 600px. Crucially, ListView's container has NO `overflow-x-auto` wrapper — the table will force the page to scroll horizontally or overflow the viewport.

**Recommended fixes**:
- **P0** Wrap ListView's `<table>` in `overflow-x-auto` (or change ListView to render mobile-friendly cards at `<sm:`).
- Increase event-chip min-height for tap accessibility.
- Consider collapsing weekend columns or showing 1-week view on mobile instead of 6-week month grid.

---

## notifications/NotificationBell

**Mobile risk**: Medium

- Bell button is `h-9 w-9` (36px) — borderline tap target.
- Unread badge is positioned `absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px]` — visual only.
- **Dropdown**: `absolute right-0 mt-2 w-80 max-h-[28rem] overflow-y-auto` — that's a 320px-wide dropdown. At 360px viewport, if the bell sits at `right-44` (StaffShell), the dropdown's right-anchor places its left edge at viewport-x = 360 - 320 - 176 = -136px — **the dropdown will be clipped off the left side of the screen** on mobile.
- The bell currently lives in StaffShell at `fixed bottom-3 right-44` which is the cause; the dropdown itself is fine for desktop placement.

**Recommended fixes**:
- Make dropdown width responsive: `w-[calc(100vw-1.5rem)] sm:w-80`.
- Move bell to `right-3 bottom-16 md:bottom-3 md:right-44` so it sits above StudentBadge stacked on mobile.
- Bump bell button to `h-11 w-11` on touch widths.

---

## auth/StudentBadge

**Mobile risk**: Medium

- Trigger button `pl-1 pr-3 py-1` with `h-7 w-7` avatar + `text-sm` name (`max-w-[8rem] truncate`) — total height ~32px. Borderline tap target for a fixed corner widget.
- Dropdown `mb-2 w-56` rendered above the trigger — 224px wide, fits 360px.
- Dropdown items are `px-4 py-2 text-sm` — ~36px tall, OK.
- Fixed `bottom-3 right-3 z-50` — overlays bottom-right of every screen.
  - On AreaSelector, "Join a course" button sits in `flex justify-end` — its position may be hidden under the badge.
  - On scrollable pages with floating action affordances, the badge competes for the same corner.

**Recommended fixes**:
- Increase trigger button vertical padding to `py-2`.
- Audit each surface for bottom-right CTAs that may be hidden by the badge; add bottom safe-area padding (`pb-20`) to those pages on mobile.

---

## auth/AccountUpgradeBanner

**Mobile risk**: Low

- `fixed top-0 inset-x-0 z-40` — full-width banner at top of viewport.
- Inner `max-w-3xl mx-auto px-4 py-2 flex items-center justify-between gap-3` — message text with `truncate` + `shrink-0` button. Works.
- Message uses `truncate` — if longer copy is added it will cut off cleanly.
- Banner does NOT add top padding to the page below — content under it may be hidden behind the fixed banner on small viewports. The StaffShell layout doesn't account for it. (For students the banner is rendered inside AuthGate's wrappers — may have same issue.)

**Recommended fixes**:
- When the banner is visible, add `pt-12` (or similar) to the body content area to push content below.
- Increase Upgrade button to `py-1.5` minimum.

---

# Prioritized Fix List

## P0 — Breaks at 360px

1. **InboxPage two-pane layout** — 288px sidebar leaves no room for messages on mobile. Implement master/detail responsive routing.
2. **HTML5 drag-and-drop in ModulesPage and CoursePortfolio** — completely broken on touch devices. Replace with `@dnd-kit/core` or surface the existing Move-to picker prominently on touch widths.
3. **CalendarPage ListView table** — no `overflow-x-auto` wrapper; 5-column table will overflow viewport.
4. **NotificationBell dropdown clipping** — 320px-wide dropdown at `right-44` clips off-screen at 360px. Make width responsive.
5. **StaffShell rail consuming 80px permanently** — bottom tab bar / drawer pattern needed; currently no way to hide rail and it eats irreplaceable horizontal space.

## P1 — Awkward at 360px

1. **ClassLayout tab strip** — 10 tabs in horizontal scroll without scroll indicators or auto-scroll-to-active.
2. **AllClassesView / AllUsersView tables** — first column not sticky during horizontal scroll; row context lost.
3. **CourseGradebook** — verify and add sticky-first-column for the roster matrix.
4. **CoursePortfolio Overview Grid** — `whitespace-nowrap` on item title headers makes grid very wide; allow wrap at small widths.
5. **AllUsersView Delete button** — destructive action with no padding (~16px tap target) is dangerous.
6. **AccountUpgradeBanner not reserving space** — content behind it may be hidden.
7. **ModulesPage nested item indent** — `indent * 1.25rem` accumulates without cap; deep items become unreadable on mobile.
8. **StudentBadge bottom-right overlay** — may hide CTAs on pages with `justify-end` footers.

## P2 — Polish

1. Numerous primary CTAs at `py-2 text-sm` (~36px) — bump to `py-2.5` (~40px) or `py-3` (~44px) to hit WCAG 2.5.5.
2. Header rows everywhere using `flex items-start justify-between` without `flex-col sm:flex-row` — title + CTA crowd each other; stack on mobile.
3. KPI / dashboard quick-action icons at `h-7 w-7` (28px) — enlarge to `h-9 w-9` on touch widths.
4. PublishToggle, expand toggles, drag handles all at 14–24px — visual is fine, but tap area should be a 32–40px wrapper.
5. "Refresh" naked text links throughout admin views — add padding for tap area.
6. Cell chips in CoursePortfolio Overview Grid `py-0.5` — bump to `py-1.5`.
7. SafeHtml-rendered bodies (announcements, discussions, materials) may contain embedded wide elements — wrap in `overflow-x-auto`.
8. MarkdownEditor toolbar in ThreadView compose — verify it wraps or hide on mobile.

---

## Summary

The strongest mobile risk areas are surfaces that assume desktop two-pane / tabular layouts (InboxPage, gradebooks, admin tables) and surfaces relying on HTML5 drag-and-drop (ModulesPage, CoursePortfolio). Most card-based teacher/student list surfaces (Announcements, Discussions, AssignmentsPanel) follow a sound mobile-first card pattern with `sm:grid-cols-2` reflow and will work acceptably at 360px. The most consistent global polish needed: bumping primary CTAs from `py-2 text-sm` (~36px) to `py-3` to meet WCAG 2.5.5 tap-target guidance, and stacking page headers via `flex-col sm:flex-row` so the inline CTA doesn't crowd the title.

Out-of-scope but high-stakes for student usability: `mocktest/MockTestApp.tsx` (the actual test runner) should get its own mobile audit, since AssignmentRunner ultimately hands control to it.

---

## Live audit — full-test runner + staff pages (2026-06-03)

Live (Playwright, real DSAT preview) audit of the **full-length test runner**
(`fulltest/FullTestApp` + `QuestionPane`) at iPad portrait (768), iPad
landscape (1024), and iPhone (390), plus the staff dashboard/courses/test-
overview pages. Tablet is the realistic device for sitting a test; phone is the
"someone might" case.

**Findings + fixes (all shipped):**

1. **Runner preview remount (cross-viewport regression).** The role-aware test
   landing had split staff preview across a separate exact route and the `/*`
   splat — different element trees, so navigating bare → `/section/n/q/m`
   unmounted/remounted `FullTestApp` and bounced the preview back to the intro
   on every "Begin". Fixed by collapsing to one splat route + internal
   `StaffTestGate` so the runner keeps its state.
2. **Phone two-pane R&W.** `grid-cols-1 md:grid-cols-2` stacked into two cramped
   independent scroll panes on phones. Now one natural scroll container below
   `md` (passage flows into the question with a divider); the Bluebook
   two-column split with independent pane scroll is preserved at `md`+. Verified
   footer always visible, all choices reachable, zero horizontal overflow.
3. **Desmos calculator** is already viewport-clamped (`min(880, innerWidth−16)`
   × `min(1040, innerHeight−16)`, centered, draggable) — fine on tablet/phone.
4. **Staff-page horizontal overflow at phone width** (NOT the shell — individual
   cards/toolbars with `min-width:auto` refusing to shrink). Fixed with `min-w-0`
   on `CourseCard` (root + name), `CohortCard`, the `DashboardPage` card wrapper,
   and the `TestOverviewPage` grid cards; the All-Classes header toolbar now
   wraps with a responsive search input. `/dashboard`, `/courses`, and the test
   overview are now overflow-free at 390 / 768 / 1024.

Method note: this complements the static analysis above with actual computed
pixel checks (`document.documentElement.scrollWidth` vs viewport, boundingBox
of footer/choices) — the kind of verification the original audit flagged it
couldn't do.
