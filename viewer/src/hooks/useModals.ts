/**
 * useModals
 * =========
 * Consolidates ~16 individual `useState<boolean>` calls that control modal /
 * overlay visibility in `App.tsx` into a single `useReducer`-backed hook.
 *
 * Rationale:
 *   - App.tsx previously declared a separate `[fooOpen, setFooOpen] = useState(false)`
 *     for every modal/overlay. The set of overlays kept growing (16+ at last
 *     count), bloating the component, scattering "is X open?" logic across the
 *     file, and producing one re-render per open/close per useState slot.
 *   - This hook collapses them into one state object keyed by a string-literal
 *     `ModalName` union, behind a small action reducer.
 *   - The exposed API (`isOpen`, `open`, `close`, `toggle`, `closeAll`) is
 *     referentially stable across renders, so consumers can pass these callbacks
 *     to children without churn.
 *
 * Scope:
 *   Only consolidates booleans that gate modal/overlay visibility. Non-modal
 *   ephemeral flags (e.g. `showAnswer`, `compactList`, `timerActive`) remain
 *   independent useStates — those are domain state, not modal state.
 */
import { useCallback, useMemo, useReducer } from "react";

/**
 * String-literal union of every modal/overlay tracked by `useModals`.
 * Order is purely for readability; the runtime state object holds the same keys.
 */
export type ModalName =
  | "quickBuild"
  | "timerSetup"
  | "dashboard"
  | "help"
  | "print"
  | "palette"
  | "a11y"
  | "maintainer"
  | "graph"
  | "reading"
  | "stateExport"
  | "calibration"
  | "customizer"
  | "stats"
  | "compare"
  | "printDrawer";

/** All known modal names. Used to seed the initial state map. */
const MODAL_NAMES: readonly ModalName[] = [
  "quickBuild",
  "timerSetup",
  "dashboard",
  "help",
  "print",
  "palette",
  "a11y",
  "maintainer",
  "graph",
  "reading",
  "stateExport",
  "calibration",
  "customizer",
  "stats",
  "compare",
  "printDrawer",
];

type ModalState = Record<ModalName, boolean>;

type ModalAction =
  | { type: "open"; name: ModalName }
  | { type: "close"; name: ModalName }
  | { type: "toggle"; name: ModalName }
  | { type: "closeAll" };

/** Build a fresh `{ name: false, ... }` map. */
function buildInitialState(): ModalState {
  const initial = {} as ModalState;
  for (const name of MODAL_NAMES) {
    initial[name] = false;
  }
  return initial;
}

function reducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case "open":
      if (state[action.name]) return state;
      return { ...state, [action.name]: true };
    case "close":
      if (!state[action.name]) return state;
      return { ...state, [action.name]: false };
    case "toggle":
      return { ...state, [action.name]: !state[action.name] };
    case "closeAll": {
      // Bail out if nothing is open — preserves referential equality.
      let anyOpen = false;
      for (const name of MODAL_NAMES) {
        if (state[name]) {
          anyOpen = true;
          break;
        }
      }
      if (!anyOpen) return state;
      return buildInitialState();
    }
    default:
      return state;
  }
}

/**
 * Public API returned by `useModals`. All function members are referentially
 * stable across renders (memoized via `useCallback` over the stable `dispatch`).
 */
export interface ModalsApi {
  /** Returns whether the named modal is currently open. */
  isOpen: (name: ModalName) => boolean;
  /** Open the named modal. No-op if already open. */
  open: (name: ModalName) => void;
  /** Close the named modal. No-op if already closed. */
  close: (name: ModalName) => void;
  /** Flip the named modal's open state. */
  toggle: (name: ModalName) => void;
  /** Close every tracked modal. */
  closeAll: () => void;
}

/**
 * Hook returning a stable API for managing all modal/overlay visibility flags.
 *
 * @example
 *   const modals = useModals();
 *   if (modals.isOpen("help")) ...
 *   <button onClick={() => modals.open("dashboard")}>Open</button>
 *   <Modal onClose={() => modals.close("dashboard")} />
 */
export function useModals(): ModalsApi {
  const [state, dispatch] = useReducer(reducer, undefined, buildInitialState);

  const open = useCallback(
    (name: ModalName) => dispatch({ type: "open", name }),
    [],
  );
  const close = useCallback(
    (name: ModalName) => dispatch({ type: "close", name }),
    [],
  );
  const toggle = useCallback(
    (name: ModalName) => dispatch({ type: "toggle", name }),
    [],
  );
  const closeAll = useCallback(() => dispatch({ type: "closeAll" }), []);

  // `isOpen` reads from the latest `state` — it must be re-created whenever
  // `state` changes so callers see fresh values. Memoizing on `state` keeps it
  // stable within a single render pass.
  const isOpen = useCallback((name: ModalName) => state[name], [state]);

  return useMemo<ModalsApi>(
    () => ({ isOpen, open, close, toggle, closeAll }),
    [isOpen, open, close, toggle, closeAll],
  );
}
