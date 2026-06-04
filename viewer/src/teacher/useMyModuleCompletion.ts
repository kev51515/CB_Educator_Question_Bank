/**
 * useMyModuleCompletion
 * =====================
 * Loads the current student's `module_item_completion` rows for every item in
 * the given list, and exposes a `toggle(itemId, complete)` helper that calls
 * the `mark_item_complete` RPC and optimistically updates local state.
 *
 * Keys are module_item_ids (strings); values are `true` when a completion row
 * exists for that item belonging to the current `auth.uid()` user.
 *
 * The hook does not subscribe to the assignment_attempts trigger; callers can
 * invoke `refresh()` after an assignment submission to pick up the row that
 * the trigger inserted server-side.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface UseMyModuleCompletion {
  completed: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
  toggle: (itemId: string, complete: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

interface CompletionRow {
  module_item_id: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load completions.";
}

export function useMyModuleCompletion(
  itemIds: readonly string[],
  enabled: boolean,
): UseMyModuleCompletion {
  const [completed, setCompleted] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Stable key so the effect only re-runs when the actual id set changes,
  // not on every render that produces a fresh array reference.
  const itemIdsKey = useMemo(() => {
    const sorted = itemIds.slice().sort();
    return sorted.join("|");
  }, [itemIds]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled || itemIds.length === 0) {
      setCompleted(new Set<string>());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? null;
      if (!userId) {
        setCompleted(new Set<string>());
        return;
      }
      const { data, error: queryError } = await supabase
        .from("module_item_completion")
        .select("module_item_id")
        .eq("student_id", userId)
        .in("module_item_id", itemIds as string[]);
      if (queryError) {
        setError(queryError.message);
        setCompleted(new Set<string>());
        return;
      }
      const rows = (data ?? []) as unknown as CompletionRow[];
      const next = new Set<string>();
      for (const row of rows) {
        if (typeof row.module_item_id === "string") next.add(row.module_item_id);
      }
      setCompleted(next);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setCompleted(new Set<string>());
    } finally {
      setLoading(false);
    }
    // itemIdsKey participates as a dependency below to control re-fetch
    // cadence; we read itemIds directly because the array value is what the
    // network call actually needs.
  }, [enabled, itemIds]);

  useEffect(() => {
    void refresh();
    // We intentionally key on itemIdsKey + enabled so unrelated re-renders
    // don't re-issue the network call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIdsKey, enabled]);

  const toggle = useCallback(
    async (itemId: string, complete: boolean): Promise<void> => {
      if (!enabled) return;
      // Optimistic update — revert on RPC failure.
      const prev = completed;
      const next = new Set(prev);
      if (complete) next.add(itemId);
      else next.delete(itemId);
      setCompleted(next);

      const { error: rpcError } = await supabase.rpc("mark_item_complete", {
        p_item_id: itemId,
        p_complete: complete,
      });
      if (rpcError) {
        setCompleted(prev);
        setError(rpcError.message);
      }
    },
    [completed, enabled],
  );

  return { completed, loading, error, toggle, refresh };
}
