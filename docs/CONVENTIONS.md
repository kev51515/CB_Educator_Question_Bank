# CONVENTIONS — keeping the codebase efficient & organized

Short, enforceable rules for how code is structured. The goal: any file is easy
to find, easy to read, and small enough to hold in your head. Most of this is
enforced automatically (see "Tooling" below) so it doesn't rely on review.

## File size

- **200–400 LOC typical, 800 max.** ESLint `max-lines` warns past 800.
- When a component/file outgrows the cap, **split it into a folder** (next section)
  — don't let it drift to 1500+. (We've split `modules-page/`, `inline-add/`,
  `TeacherAttemptDetailView/`, `fulltest/` this way.)

## The folder split pattern (proven)

A large surface becomes a **folder** with one role per file:

```
SurfaceName/
  index.tsx          orchestrator + barrel (owns top-level state, composes the rest,
                     and EXPORTS the same public name(s) the old file had)
  <name>-hooks.ts    stateful logic / data-loading / effects  (use*)
  <name>-ui.tsx      presentational sub-components (no own data-fetching)
  <name>-handlers.ts / api.ts   DB writes / RPC calls (pure-ish, take args + supabase)
  helpers.ts         pure functions
  types.ts           shared types/interfaces
```

- **`index.tsx` is the barrel.** Keep its exports identical to the old file's so
  every consumer's `import … from ".../SurfaceName"` resolves unchanged — you
  rarely touch consumers.
- **Move code verbatim** when splitting. A behavior-preserving move is a refactor;
  rewriting logic at the same time is how regressions sneak in. Run `tsc -b` + the
  smoke suite after.
- It's fine if the orchestrator stays a bit large — it's glue. Extract the
  *separable* pieces (pickers, panels, hooks, handlers) and stop before you'd have
  to thread state across artificial boundaries.

## Imports

- **Cross-folder → `@/` alias** (`@/components`, `@/lib/…`, `@/teacher/…`).
  ESLint warns on `../` parent traversal.
- **Within the same folder → relative `./`** (`./types`, `./fulltest-hooks`).
- Import the **barrel**, not deep paths, for shared primitives (`@/components`),
  but import a **deep submodule** when you specifically want to avoid pulling a
  heavy sibling onto the critical path (e.g. lazy routes importing
  `@/inbox/InboxPage` directly so TipTap stays out of the eager bundle).

## Component placement

- **Cross-cutting primitives** (used by 2+ surfaces) live in `src/components/` and
  are barrel-exported from `src/components/index.ts`.
- **Surface-coupled components** (only meaningful inside one surface) live in that
  surface's folder (`dashboard/`, `student/`, `teacher/`, `fulltest/`) and are
  imported directly. Don't promote to `components/` until a second surface needs it.

## Async / realtime patterns

- Guard `setState`-after-`await` with a local `aliveRef`/`cancelled` flag (per-effect,
  not a shared `useMounted`).
- For realtime channel handlers, keep a `refreshRef` so the subscribe effect depends
  only on stable values (channel isn't torn down on every callback identity flip).
- Wrap props passed into memoized children in `useCallback`/`useMemo`; wrap recursive
  list rows in `React.memo`.

## Tooling (enforces the above)

- **`npm run lint`** — ESLint. `max-lines` (≤800) and `no-restricted-imports` (`../`)
  warn; design-system rules (no inline hex / arbitrary z-index) warn.
- **`npm run knip`** — finds unused files, exports, and dependencies. Run before a
  modularization wave so you split *live* code, not dead code.
- **`npm run analyze`** — builds with a bundle treemap (`rollup-plugin-visualizer`)
  to see what's in each chunk before splitting (don't guess at chunking).
- **`npx tsc -b`** must stay green; run the 5-suite smoke (`npm run smoke`) after
  any backend-touching change.

## Deploy discipline

- Cloudflare builds `tsc -b && vite build`; a `tsc` error means **no deploy lands**
  and the live bundle silently stays stale. After every push, **verify the live
  bundle hash changed** (`curl -s "https://pication.app/?cb=$(openssl rand -hex 3)"
  | grep -oE 'index-[A-Za-z0-9_-]+\.js'`).
- Run a clean `tsc -b --force` (not incremental) before trusting a push — the
  incremental cache can hide an error CI will hit.
