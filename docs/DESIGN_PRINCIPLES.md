# Design Principles

The UX bar for this LMS. Treat every new surface as accountable to these
principles. The Wave 8B Modules page (`viewer/src/teacher/ModulesPage.tsx`)
is the reference standard — when in doubt, read it.

---

## 1. The bar

We are competing with Canvas, Linear, and Notion on interaction quality.
Plain-input-and-save UX is acceptable nowhere in this app. If something
asks the user to type, click, or pick — it should *feel* finished.

The way to know if a screen meets the bar:

> A teacher using this for the first time, with no documentation, finishes
> their task in under 30 seconds and doesn't have a question afterward.

If the answer is yes, ship it. If the answer is no, fix it before merge.

---

## 2. Forbidden patterns

These are explicitly off-limits unless there's a documented reason. If you
ship one of these in a wave, expect it to bounce back.

### Entry

- **Plain `<textarea>` for any body content** (essay, post, announcement,
  message, description). Use `<MarkdownEditor />` from `@/components`. Even
  for short replies — the toolbar reveals on focus.
- **Bare `<input type="file">`**. Use `<FileDropzone />` — drag-and-drop,
  multi-file, per-file preview + size + progress.
- **Bare `<input type="datetime-local">`**. Use `<SmartDatePicker />`
  which surfaces relative presets (Today / Tomorrow / Friday / In 1 week
  / In 2 weeks / End of month) above the raw picker. Calendar users *never*
  want to type "2025-11-14T17:00".
- **Long forms with no validation as you type.** Validate inline on blur or
  on keystroke for fields with a clear regex (email, URL, code).
- **Pickers without typeahead** when the list is > 10 items.

### Output

- **`Loading…` text on a blank page.** Show a skeleton matching the
  incoming layout.
- **Blank empty states.** Render an empty-state card with an icon (✦ or
  similar), a one-sentence explanation, and a primary CTA.
- **Inline error banners for transient outcomes.** Use a toast. Inline error
  text is for permanent form-field validation, not "saved successfully" or
  "couldn't connect."
- **Raw timestamps.** Render as relative ("in 3 days", "2 hours ago") with
  the absolute time on hover.
- **Inert status badges that look interactive.** If a badge can be clicked
  to toggle, it has hover affordance + cursor pointer. If not, it's
  visually inert (no ring, no hover).

### Navigation

- **Modals that pop just to confirm something cheap.** "Save?" — don't ask;
  save and show a toast with undo.
- **Page transitions that lose user state.** Every list page restores its
  scroll position + filter state on back-navigation.
- **Hidden destructive actions.** Delete is always red, always confirmed,
  always shows what will be deleted.

---

## 3. The Modules page playbook — what to copy

Things to copy from Wave 8B verbatim when building a new list surface:

| Pattern | Why it works |
|---|---|
| 6-dot drag handle SVG visible on every row | The single most important affordance for "you can drag this." Don't make users discover it via experimentation. |
| Inline rename: click title → input → Enter saves, Esc cancels, blur saves | Removes the modal round-trip for a common action. |
| One-click status badge (green check ↔ outlined slash) | Publishing is a primary action — make it a primary control, not a kebab item. |
| Kebab `⋯` collects tertiary actions: Edit, Duplicate, Move to…, Delete | Familiar Gmail/Google Drive pattern. Always last item is destructive, separated visually. |
| Top toolbar with batch operations (Collapse all / Publish all / + New) | Batch ops are first-class for power users (teachers). |
| Persisted collapse state per (user, course) in localStorage | Reload doesn't punish the user for organizing their view. |
| Student-side reads the same data, hides editing controls, exposes one-click "Done" ticks | Single rendering pipeline, role-aware affordances. |
| Lock-until display with 🔒 icon + relative time | Time-gated content needs a visible reason, not silent absence. |

---

## 4. Component contracts

When you build a shared component, follow these contracts:

### `<MarkdownEditor>` 
- Controlled (`value` + `onChange`)
- Returns HTML string
- Toolbar visible by default; pass `showToolbar={false}` for inline replies
- `characterLimit` prop with live counter and ring color flip
- `placeholder` prop for empty state copy

### `<FileDropzone>`
- Controlled (`files: File[]` + `onChange`)
- `accept` (mime list), `maxSize` (bytes), `multiple`
- Renders per-file row: icon + name + size + remove
- Drag-over state visually distinct (indigo ring instead of slate)
- Progress prop optional — pass `{ [filename]: percent }`

### `<SmartDatePicker>`
- Controlled (`value: ISO string | null` + `onChange`)
- `label`, `allowClear`
- Native input + relative-preset row below
- Relative-string footer ("in 3 days" / "tomorrow")

### `<NotificationBell>` (already shipped)
- Self-contained — reads from `useNotifications` hook
- Unread badge + dropdown with last 10
- Click an item → markRead + navigate

### `useToast`
- `success / error / info / warning(title, body?)` — fire and forget
- Variants color-coded; auto-dismiss after 4–6s
- Stack at bottom-center, dismissable
- For destructive-action undo: pass an `action` button (future enhancement)

---

## 5. Tailwind palette

Use these and only these accent colors. Slate for neutrals.

| Color | Meaning |
|---|---|
| **Indigo** (`indigo-500/600/700`) | Primary action, links, focus rings, brand |
| **Emerald** (`emerald-500/600`) | Success, published, completed, high mastery |
| **Amber** (`amber-500/600`) | Warning, draft, in progress, weak skill, locked-until |
| **Rose** (`rose-500/600`) | Destructive, error, overdue, low mastery |
| **Slate** (50–950) | Text, borders, backgrounds, muted |
| **Violet** (`violet-500/600`) | Secondary brand accent (use sparingly — Account banner, badges) |

Dark mode: every utility above pairs with `dark:` variant. Use `dark:bg-slate-900`
for cards, `dark:bg-slate-950` for page background, `dark:ring-slate-800` for
hairlines.

Never use: `red-*`, `green-*`, `yellow-*`, `blue-*`, `orange-*`, `purple-*`,
`gray-*`. They're not in our palette — Tailwind's color spaces have ramps that
disagree across modes, and our accents are slightly off the defaults.

---

## 6. Animation + motion

Subtle, fast, purposeful.

- **Hover/focus**: `transition-colors duration-150` is the default.
- **Layout shifts** (collapse, modal open): `transition-transform duration-200`.
- **Page transitions**: none (React Router default).
- **Skeleton shimmer**: `animate-pulse` on slate placeholders.
- **No bouncy springs, no auto-confetti.** This is a teacher tool, not a
  consumer game.

---

## 7. Accessibility

We're not at WCAG 2.1 AA yet (deferred), but we should at minimum:
- Keyboard-operate every primary action (focus visible, Enter/Space activate)
- aria-label every icon-only button
- Color contrast ≥ 4.5:1 for text (`text-slate-700` on white passes; `text-slate-500` is borderline — use only for muted secondary)
- `aria-live` regions for toasts (`role="status"`)
- Tab order matches visual order
- `<dialog>` semantics or proper `role="dialog"` + focus trap on modals

For drag-and-drop, ALWAYS provide a keyboard fallback: a "Move to…" menu
item on the kebab. Drag alone is a non-starter for accessibility.

---

## 8. Performance targets

- First meaningful paint < 2s on a fast laptop
- Time-to-interactive < 3s
- Question-bank list scroll: 60fps with virtualization
- Mock-test page transitions: < 100ms perceived latency
- No layout shift after first paint (reserve space for images, badges)

If a new feature pushes us off these targets, optimize before merge or
flag for follow-up. Don't ship a slow feature.

---

## 8a. Floating UI — overflow + sizing (always)

Every dropdown, popover, tooltip, and absolutely-positioned panel must
handle the case where it sits near a viewport edge. Cutoff menus erode
trust and look broken. Rules:

1. **Anchor + flip.** A right-anchored menu (e.g. kebab) must measure its
   `getBoundingClientRect()` on open and flip to left-anchored if its right
   edge would overflow `window.innerWidth`. Same rule for bottom→top.
   Pattern reference: `KebabMenu` in `viewer/src/teacher/ModulesPage.tsx`.
2. **`max-width` is mandatory** on every floating panel. Pair `min-w-[Nrem]`
   with `max-w-[Nrem]` so a single long string can't push the panel past
   the viewport. Default for menus: `min-w-[11rem] max-w-[18rem]`.
3. **Truncate long labels** with `truncate` + a `title="…"` attribute that
   exposes the full string on hover. Never let label text wrap to 2 lines
   inside a menu item — that breaks visual rhythm.
4. **Invisible-first-paint trick** to avoid one-frame flicker on the wrong
   side: render the menu invisible until the measurement effect resolves
   the correct anchor, then reveal.
5. **Disabled items** look disabled (slate-400, `cursor-not-allowed`,
   `disabled` attribute), with the *reason* in the `title="…"` tooltip —
   NOT appended to the label as a parenthetical. "Indent (no preceding
   sibling)" is forbidden; the label stays "Indent", the disabled state +
   tooltip convey the reason.
6. **Tap targets ≥ 40px on mobile** apply to menu items too. Use
   `py-2.5 md:py-1.5` so phones get a generous hit area without bloating
   the desktop menu.

These rules apply to: KebabMenu, NotificationBell dropdown, CommandPalette
results, SmartDatePicker preset row, FilterPill rows, any future
combobox/typeahead. Any floating UI primitive missing these is a bug.

---

## 8b. Focus management

Every modal, dialog, and overlay must behave like a first-class focus owner.
Broken focus = broken keyboard nav = inaccessible.

1. **Trap Tab inside the modal** while open. Tab from the last focusable
   element wraps to the first; Shift+Tab from the first wraps to the last.
2. **Restore focus on close** to the element that opened the modal. Stash
   `document.activeElement` on open; call `.focus()` on it in the cleanup.
3. **Auto-focus a safe default on open.** Destructive confirm → Cancel
   button. Form → first text input. Read-only overlay → the title element
   (with `tabIndex={-1}`).
4. **Esc closes** via a top-level `keydown` listener on `document`, not an
   inline `onKeyDown` that breaks when focus is inside a child input.
5. **ARIA contract.** `role="dialog"`, `aria-modal="true"`, and
   `aria-labelledby` pointing at the title element's `id`.

Reference: ConfirmDialog and any future modal primitive.

---

## 8c. Error message conventions

Every error toast, inline banner, and form-field error must read like a
human wrote it for another human.

1. **Lead with the verb the user attempted.** "Couldn't save", "Couldn't
   delete", "Couldn't load modules" — not "Save failed" or "Error saving".
2. **Body** is the raw server message OR a translated guidance line ("Check
   your connection and try again"). Pick one; don't concatenate both.
3. **Length limits.** Title ≤ 30 chars; body ≤ 120 chars. Toasts wider than
   that get truncated and look broken.
4. **Never expose internals.** No stack traces, no UUIDs, no Postgres
   error codes, no "TypeError: undefined is not a function".
5. **Forbidden strings.** "Something went wrong", "An error occurred",
   "Error 500", "Unknown error". These tell the user nothing actionable;
   replace with the verb-led form above.

Apply to `useToast().error(...)` calls and inline form errors everywhere.

---

## 8d. Loading + empty + error + success — the four states

Every data-driven surface renders four distinct states. Collapsing two of
them into the same branch is the bug.

1. **Loading** → `SkeletonRows` / `SkeletonCard` / `SkeletonTable` matched
   to the incoming layout's shape. Never the string "Loading…" on a blank
   page.
2. **Empty** (data loaded, zero rows) → `EmptyState` with a primary CTA
   pointing at the most-likely next action ("No modules yet — + Module").
3. **Error** (load failed) → inline error block with a Retry button, plus a
   toast. Don't silently render Empty when the fetch threw.
4. **Success** (data loaded, rows present) → the actual UI.

The classic failure mode: rendering Empty while `loading === true`, which
flashes "no data" for a beat before the real rows arrive. Always gate Empty
on `!loading && rows.length === 0`.

Reference: ModulesPage.tsx, AssignmentsPage.tsx.

---

## 8e. Destructive actions

Three tiers, escalating friction. Match the tier to the blast radius.

1. **Reversible** (publish toggle, archive, mark-as-read) → one-click,
   optimistic UI, toast with implicit undo via re-clicking the same control.
   No confirm dialog.
2. **Hard but recoverable** (delete a row that doesn't cascade) →
   `<ConfirmDialog destructive />` with a body that names exactly what's
   being deleted ("Delete module 'Algebra Basics'? Its 4 items will be
   unassigned."). No undo affordance promised.
3. **Irreversible / cascading** (delete a course, delete a user, regenerate
   join code, drop a roster) → ConfirmDialog with **type-the-name
   confirmation**: the user must type the entity's name to enable the
   Confirm button. Reference: `CourseSettings.tsx` Delete Course flow.

Never use a tier-1 pattern for a tier-3 action. The friction is the feature.

---

## 8f. Optimistic UI rules

Every toggle, reorder, and rename should feel instant. The server is the
audit log, not the source of truth for the next paint.

1. **Snapshot before mutate.** Capture the pre-call value in a ref (NOT
   from current state, which may have already changed). Reference:
   `viewer/src/lib/useOptimistic.ts`.
2. **Apply optimistically.** Update local state immediately.
3. **Fire the write.** On success: keep the optimistic value; let realtime
   or the next refresh reconcile.
4. **On failure: roll back to the snapshot** (not to current state) and
   fire an error toast per §8c.
5. **Disable the trigger during commit** so rapid clicks don't queue
   duplicate writes. Re-enable on settle.
6. **Never optimistic for irreversible actions.** Delete, regenerate code,
   archive-with-cascade — all wait for server confirmation before updating
   the UI.

---

## 8g. Network failure recovery

The network will fail. Plan for it; never silently drop the user's work.

1. **User-initiated writes that fail** → immediate toast per §8c, plus a
   Retry button when the action is idempotent (save, publish, reorder).
2. **Preserve drafts.** Keep the form / editor / dialog populated on
   failure. Never auto-close a modal when the save errored — the user
   loses their input.
3. **Offline detection.** When `navigator.onLine === false` or the fetch
   throws a network error, the toast reads "Couldn't save — you're offline"
   rather than "Couldn't save — server error".
4. **Background reconciliation** (mark-as-read poll, realtime resubscribe,
   prefetch) → silent retry with exponential backoff (1s → 2s → 4s, cap
   30s). `console.warn` only; no toast. The user didn't initiate it.
5. **Realtime drop** → reconnect silently; on reconnect, refetch the
   surface's data so the user sees the latest state without a banner.

---

## 8h. Time + relative formatting

Every timestamp the user sees passes through one formatter. Raw ISO strings
in the UI are a bug.

1. **Relative for recent** — "in 3 days", "2 hours ago", "just now" for
   anything within 30 days of now.
2. **Absolute for older** — "Mar 15" or "Mar 15, 2025" if the year differs
   from the current year. Use the user's locale via `Intl.DateTimeFormat`.
3. **Title attribute always.** Wrap the rendered string with
   `title={absoluteISO}` so hover reveals the exact moment. Screen readers
   read both.
4. **Use `Intl.RelativeTimeFormat`.** No `date-fns`, no `moment`, no
   `dayjs` — the bundle stays lean.
5. **Forbidden in UI.** Raw ISO ("2026-05-30T14:22:00Z"), epoch ints,
   `Date.toString()` output ("Fri May 30 2026 14:22:00 GMT-0700").
6. **For input** → `<SmartDatePicker />` with preset chips first ("Today",
   "Tomorrow", "In 1 week"), custom datetime opt-in. Never raw
   `<input type="date">` or `<input type="datetime-local">`.

---

## 8i. Tree drag-and-drop

Every tree-shaped surface (modules, portfolio, future hierarchical things)
uses ONE global insertion-bar + cursor-X-for-depth pattern. No per-row drop
zones that overlap. No ambiguity about where the drop lands.

1. **One indicator at a time.** Page-level `dropTarget` state, mirrored to a
   ref (`dropTargetRef`) for stable reads inside hot `onDragOver` handlers.
   Never per-row `hoverZone` state — they fight each other.
2. **Single resolver function** —
   `resolveDropTarget(anchor, cursorY, cursorX, rect, draggedId, draggedDescendants) → DropTarget | null`.
   Cursor Y picks before/after the anchor; cursor X past
   `(depth+1) * 24px` from the anchor's left edge means "nest as child".
   Self / descendant → returns `null`.
3. **Insertion bar visual contract.** 2px indigo-500 line + 10px dot at the
   left end + glow shadow. `marginLeft: depth * 24px` to show depth. Depth
   ticks in the gutter (one dash per nesting level) so users can count. Pill
   at the left names the action: `↳ Nest inside [Parent]` (solid indigo) or
   `↑ [Sibling]` (soft indigo). Pill is `max-w-[16rem] truncate` with
   `title=` for long names.
4. **Parent row highlight on nest.** When the resolved target is
   `asChild: true`, the anchor row gets `ring-2 ring-indigo-500
   bg-indigo-50/40`. Depth shift alone was not enough confirmation.
5. **Tree guides.** Indigo-300 / indigo-800 vertical 0.5px guide down the
   children container
   (`before:absolute before:left-1.5 before:top-0 before:bottom-6 before:w-0.5`);
   each child row has a 5px elbow
   (`before:left-[-20px] before:top-7 before:w-5 before:h-0.5`). Slate was
   too subtle.
6. **Required edge-case handling.** Resolver returns null → clear the
   indicator (else it sticks). Container `onDragLeave` with a child-bubble
   guard → clear on tree-exit. Drop tail zone after the last top-level row
   (drag-only) → `"Drop here to append at the end"`. `onDragEnd` clears
   BOTH dragged-id and dropTarget state. Cycle prevention: client preempt
   (resolver rejects descendant anchors) AND server trigger (mig 0034
   `prevent_module_cycle`).
7. **Touch fallback ALWAYS exists.** HTML5 DnD doesn't work on touch. Every
   drag affordance must have a kebab "Move to…" picker.

Reference: `viewer/src/teacher/ModulesPage.tsx` — search for
`resolveDropTarget`, `InsertionBar`, `DropTarget`. Any new tree surface
should mirror this pattern.

---

## 8j. Page chrome — the global breadcrumb + content alignment

Every educator (`/educator/*`) surface sits under ONE global breadcrumb bar,
mounted once in `StaffShell`'s `<main>` (above the `<Outlet/>`). You don't add
a breadcrumb per page — the bar already covers every page + subpage. Rules:

1. **Don't hand-roll a breadcrumb or an inline "← Back to X" link** on an
   educator surface. The bar's clickable ancestors + its "up one level" back
   control already provide that. (Local back links were removed from
   ClassLayout / TestOverviewPage when the bar landed.)
2. **The trail is derived from the URL** by `lib/breadcrumbs.ts` (pure,
   table-driven). Static segments are mapped there; if you add a new educator
   route, add its segment label to `STATIC_LABELS`.
3. **Dynamic segments resolve to real names.** A page that owns a dynamic id
   segment (`:courseId`, `:assignmentId`, `:slug`, `:studentId`, `:topicId`,
   `:threadId`) MUST call `useBreadcrumbLabel(urlValue, entityName)` from
   `@/components` — keyed by the **URL param value** (the short_code/uuid in the
   address bar), with the human name. Call it unconditionally, before any early
   `return`; it no-ops until both are truthy and on the student shell (no
   provider). Without it the crumb shows a generic fallback ("Course").
4. **Constant height = no layout shift.** The bar is a fixed `h-12` on every
   route. Its height is published as the `--app-chrome-top` CSS var (`3rem` in
   the staff shell, `0px` everywhere else). Any page-level chrome must respect
   it:
   - A `sticky top-0` header that pins to the page scroll → use
     `top-[var(--app-chrome-top,0px)]` so it sits *below* the bar, not behind
     it. (See QuestionBank, AssignmentDetail, CourseGradebook, TestReview.)
   - A full-viewport pane (`h-screen`) → use
     `h-[calc(100vh-var(--app-chrome-top,0px))]` so it fits beneath the bar in
     both shells. (See InboxPage.)
5. **Content left-aligns flush with the bar.** The bar's gutter is
   `px-4 sm:px-6 lg:px-8`, flush-left. A page's outer content container must
   match — **no `mx-auto` centering** (it pushes the left edge off the bar and
   reads as misaligned). Keep `max-w-Nxl` as a right-edge cap, but left-align:
   `max-w-Nxl px-4 sm:px-6 lg:px-8`. This is the standard for every educator
   surface.

Reference: `viewer/src/components/Breadcrumbs.tsx` + `viewer/src/lib/breadcrumbs.ts`,
wired in `viewer/src/auth/StaffShell.tsx`.

---

## 9. Patterns to introduce next (not yet shipped)

These belong on the roadmap but are explicitly *intended* for future waves:

- **Command palette (`Cmd/Ctrl + K`)** — the legacy question bank has one
  (`viewer/src/components/CommandPalette.tsx`). Extend it to LMS routes so
  any teacher can `Cmd+K → "new module"` from anywhere.
- **Optimistic UI helpers** — a hook that handles "update locally, reconcile
  later, roll back on error, surface toast." Wave 8B does this ad-hoc in
  `ModulesPage`. Generalize.
- **Smart pickers everywhere lists exceed 10 items** — assignments,
  students, courses, modules. Combobox with typeahead.
- **Bulk select pattern** — checkbox column + sticky action bar at bottom
  ("3 selected — Publish / Move / Delete"). Useful for assignments, items,
  roster.
- **Section/tab persistence on every page** with shared `useTabState(key)`
  hook.
- **Inline-create rows** — clicking "+" appends a row that's immediately
  editable, no modal.

When you encounter the need for these in a wave, build the generic pattern,
not the surface-specific one. Reuse is how we keep this app cohesive.

---

## 10. Things this doc does *not* cover (yet)

- Mobile-specific gestures (swipe-to-archive, pull-to-refresh)
- Internationalization (English-only today)
- Native dark-mode theme tokens (we use Tailwind dark variants ad hoc)
- Voice / dictation entry
- Real-time collaboration cursors (Notion-style)
- Onboarding flow / first-time tutorial

These are explicit roadmap items, not blockers for current waves. Add a
section here when one ships.
