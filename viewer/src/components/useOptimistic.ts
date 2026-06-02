/**
 * useOptimistic — abstracts the common optimistic-update pattern:
 *   1. Apply a local state change immediately.
 *   2. Fire a server-side write.
 *   3. On failure, roll back and surface a toast.
 *
 * @example
 * ```tsx
 * // before
 * const [pinned, setPinned] = useState(announcement.pinned);
 * const handleToggle = async () => {
 *   setPinned(!pinned);
 *   const { error } = await supabase
 *     .from("course_announcements")
 *     .update({ pinned: !pinned })
 *     .eq("id", id);
 *   if (error) {
 *     setPinned(pinned); // rollback
 *     alert(error.message); // ugly
 *   }
 * };
 *
 * // after
 * const [pinned, applyPin] = useOptimistic(announcement.pinned);
 * const handleToggle = () =>
 *   applyPin({
 *     optimistic: (cur) => !cur,
 *     commit: async () => {
 *       const { error } = await supabase
 *         .from("course_announcements")
 *         .update({ pinned: !pinned })
 *         .eq("id", id);
 *       if (error) throw new Error(error.message);
 *     },
 *     successMessage: "Pin updated",
 *   });
 * ```
 */
import { useState, useCallback, useRef } from "react";
import { useToast, type ToastAction } from "./Toast";

export interface OptimisticAction<T> {
  /** Compute the new value for the optimistic update. */
  optimistic: (current: T) => T;
  /** Server-side write. Throws on failure. */
  commit: () => Promise<void>;
  /** Optional success message. If omitted, no toast on success. */
  successMessage?: string;
  /** Optional success body (secondary line under the title). */
  successBody?: string;
  /**
   * Optional inline action button shown on the success toast — typically
   * "Undo". The toast auto-extends its ttl when an action is present.
   */
  successAction?: ToastAction;
  /** Optional error message override. Defaults to the thrown error's message. */
  errorMessage?: string;
}

export function useOptimistic<T>(
  initial: T,
): [T, (action: OptimisticAction<T>) => Promise<boolean>, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const toast = useToast();
  // Mirror the current value in a ref so the `apply` callback below can read
  // it without listing `value` in its deps. Otherwise rapid back-to-back
  // calls capture stale snapshots — the second rollback would restore the
  // first call's optimistic value instead of the true original.
  const valueRef = useRef<T>(initial);
  valueRef.current = value;

  const apply = useCallback(
    async (action: OptimisticAction<T>): Promise<boolean> => {
      const before = valueRef.current;
      const next = action.optimistic(before);
      setValue(next);
      valueRef.current = next;
      try {
        await action.commit();
        if (action.successMessage) {
          toast.success(action.successMessage, action.successBody, {
            action: action.successAction,
          });
        }
        return true;
      } catch (err: unknown) {
        setValue(before); // rollback to the pre-call snapshot
        valueRef.current = before;
        const msg =
          action.errorMessage ??
          (err instanceof Error ? err.message : "Something went wrong.");
        toast.error("Couldn't save", msg);
        return false;
      }
    },
    [toast],
  );

  return [value, apply, setValue];
}
