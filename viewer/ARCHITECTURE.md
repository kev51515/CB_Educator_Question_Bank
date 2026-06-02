# Viewer architecture

## Folder layout

```
viewer/src/
  App.tsx           # top-level composition; wires the three-pane layout
  main.tsx          # React root
  types.ts          # shared types + URL-hash parsers
  index.css         # Tailwind + global styles

  components/       # presentational + container UI components
    index.ts        # barrel — import from "@/components"
    HelpOverlay.tsx
    MobileTabBar.tsx
    PrintSet.tsx
    Detail.tsx
    Sidebar.tsx
    QuestionList.tsx
    CommandPalette.tsx
    …

  hooks/            # custom hooks (state, persistence, key bindings)
    index.ts        # barrel — import from "@/hooks"
    useKeyboardShortcuts.ts
    (all other hooks live inside index.ts for now)

  lib/              # pure helpers (no React)
    index.ts        # barrel — import from "@/lib"
    filters.ts      # applyFilters, sanitizeFilters, missingRequired, ciHas
    fetch.ts        # fetchJson<T>
    sets.ts         # AVAILABLE_SETS + baseForSet

e2e/                # Playwright golden-path tests
  golden-paths.spec.ts
playwright.config.ts
```

## Import conventions

Use the `@/` alias everywhere. It maps to `src/`.

```ts
// ✅ Good — barrel import via alias
import { Detail, Sidebar, useDarkMode } from "@/components";
import { useLocalStorageSet, useKeyboardShortcuts } from "@/hooks";
import { applyFilters, fetchJson } from "@/lib";
import type { Filters, Question } from "@/types";

// ❌ Avoid — relative paths
import { Detail } from "./components/Detail";
import { useLocalStorageSet } from "../hooks";

// ❌ Avoid — deep imports through a barrel
import { Detail } from "@/components/Detail";
```

When you add a new component / hook / lib helper, **re-export it from the
relevant `index.ts` barrel**. That's what makes the alias-only convention work.

The alias is configured in two places — keep them in sync:
- `vite.config.ts`        — runtime resolver
- `tsconfig.app.json`     — type-checker resolver (`paths`)

## State ownership

App-level state (filters, selected question, modal visibility, bookmarks,
done, selected, notes, font size, recent, confidence, tags, flags) is owned
by `App.tsx`. Components receive only the slice they need via props.

Persistence is handled by `useLocalStorage*` hooks. Each one syncs across
tabs via the `storage` event so two open viewer windows stay consistent.

URL-hash sync runs as an effect in `App.tsx`: any filter / selectedId / setId
change is serialized to `#…` so deep links restore state.

## Event-based loose coupling

Some interactions need to fire across component boundaries without
prop-drilling (e.g. pressing `N` from anywhere should toggle the note panel
in `Detail`). The viewer dispatches and listens on `window` for those:

| Event name             | Fired by              | Listened by      |
|------------------------|-----------------------|------------------|
| `sat:toggle-note`      | useKeyboardShortcuts  | Detail           |

When adding a new cross-cut event, **document it here**.

## Adding a new component

1. Create `src/components/MyThing.tsx` and export at least one named symbol.
2. Add `export * from "./MyThing";` to `src/components/index.ts`.
3. Import via `import { MyThing } from "@/components";` elsewhere.
4. If it owns persistent state, prefer a `useLocalStorage*` hook from
   `@/hooks` rather than introducing a new persistence pattern.

## Adding a new hook

1. Create `src/hooks/useFoo.ts` (or add it inline to `hooks/index.ts` if it's
   a small one). Export named.
2. If it's a separate file, `export * from "./useFoo";` at the bottom of
   `hooks/index.ts`.
3. Import via `import { useFoo } from "@/hooks";`.

## Adding a new pure helper

1. Create `src/lib/myThing.ts`.
2. `export * from "./myThing";` in `lib/index.ts`.
3. Pure functions only — no hooks, no React, no DOM access if avoidable.
   The point of `lib/` is testability and reuse.

## Testing

E2E:
```bash
npm run test:e2e            # headless
npm run test:e2e:ui         # Playwright UI mode
```

Tests live in `e2e/` and use accessible-name selectors (`getByRole`,
`getByLabel`) rather than CSS classes so they survive refactors.

## Why the structure looks like this

- **Flat → grouped folders** drops cognitive load when scanning the file tree
  and makes "where do I add X" obvious.
- **Barrel files + `@/` alias** mean import paths never change when a file
  moves — only the barrel changes.
- **Pure `lib/`** isolates the logic we'd want to unit-test without React.
- **Hooks bucket** separates stateful primitives from rendering, so
  components stay focused on layout.

## Pre-refactor App.tsx history

App.tsx peaked at **1,542 lines** with 4 inner components, 30+ useState
calls, and a 115-line keyboard-shortcut effect. After this refactor:
- ~1,080 lines
- 0 inner components (extracted: HelpOverlay, MobileTabBar, PrintSet, Row)
- Keyboard shortcuts in `@/hooks/useKeyboardShortcuts`
- Pure filter/fetch/set helpers in `@/lib`
- Pre-existing bug fixed: `sanitizeFilters` was dropping `f.status`
