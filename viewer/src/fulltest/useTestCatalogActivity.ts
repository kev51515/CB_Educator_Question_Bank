/**
 * useTestCatalogActivity — per-test live-activity signal for the Full-Test
 * catalog. One `test_catalog_activity` RPC (migration 0200) returns, for the
 * signed-in teacher's scope, how many courses link each test (assigned_courses)
 * and how many students have a live in-progress sitting right now (live_now).
 *
 * Drives the catalog's Monitor gate (active only when live_now > 0) and the
 * "Live now" view. Polls every POLL_MS while the tab is visible so the live
 * count stays current without a realtime subscription; pauses when hidden.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface TestActivity {
  assignedCourses: number;
  liveNow: number;
}

interface RawRow {
  slug: string;
  assigned_courses: number;
  live_now: number;
}

const POLL_MS = 25_000;

export function useTestCatalogActivity(enabled = true): {
  /** Keyed by test slug. Missing slug ⇒ never assigned (treat as zeros). */
  activity: Map<string, TestActivity>;
  loading: boolean;
  refresh: () => void;
} {
  const [activity, setActivity] = useState<Map<string, TestActivity>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(true);
  const aliveRef = useRef(true);

  const load = useCallback(async (): Promise<void> => {
    const { data, error } = await supabase.rpc("test_catalog_activity");
    if (!aliveRef.current) return;
    if (!error && Array.isArray(data)) {
      const next = new Map<string, TestActivity>();
      for (const r of data as RawRow[]) {
        next.set(r.slug, {
          assignedCourses: r.assigned_courses ?? 0,
          liveNow: r.live_now ?? 0,
        });
      }
      setActivity(next);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    if (!enabled) {
      setLoading(false);
      return () => {
        aliveRef.current = false;
      };
    }
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
    };
  }, [enabled, load]);

  return { activity, loading, refresh: () => void load() };
}
