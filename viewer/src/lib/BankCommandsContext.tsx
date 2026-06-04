/**
 * BankCommandsContext
 * ===================
 * Bridge that lets the question-bank `App` publish its command-palette
 * commands (random question, toggle bookmark, reset filters, print, dark
 * mode, etc.) to the global `<CommandPalette>` that lives in the auth
 * shells (StudentShell / StaffShell) and is fed by `useLmsCommands()`.
 *
 * Why a subscription store instead of a React Context Provider?
 *   The palette is a sibling of `<App />` (both mount under the shell), so
 *   there is no shared ancestor where a Provider could wrap both. Rather
 *   than restructuring the route tree we use a tiny module-level store and
 *   `useSyncExternalStore` so:
 *
 *     - `App` calls `useRegisterBankCommands(commands)` and the store
 *       updates whenever its commands array changes.
 *     - `useLmsCommands()` calls `useBankCommands()` to subscribe and
 *       re-renders when the registration changes.
 *     - When `App` unmounts (e.g. user navigates off `/practice`) the
 *       effect cleanup clears the registration, so stale bank commands
 *       never leak onto LMS routes.
 *
 * The store holds at most one set of commands at a time; the bank is the
 * single producer.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { Command } from "@/components/CommandPalette";

type Listener = () => void;

const EMPTY: readonly Command[] = Object.freeze([]);

let current: readonly Command[] = EMPTY;
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): readonly Command[] {
  return current;
}

function setBankCommands(next: readonly Command[]): void {
  current = next;
  for (const l of listeners) l();
}

/**
 * Read the currently-registered bank commands. Returns a stable empty
 * array when no producer is mounted (e.g. on LMS routes).
 */
export function useBankCommands(): readonly Command[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Register the bank command list for the lifetime of the calling
 * component. Clears the registration on unmount so the palette never
 * shows stale entries from a route the user has left.
 */
export function useRegisterBankCommands(commands: readonly Command[]): void {
  useEffect(() => {
    setBankCommands(commands);
    return () => {
      setBankCommands(EMPTY);
    };
  }, [commands]);
}
