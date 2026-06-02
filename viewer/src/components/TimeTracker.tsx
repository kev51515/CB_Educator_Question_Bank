import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────── types ───────────────────────────────

interface StoredStat {
  count: number;
  totalSeconds: number;
}

interface UseTimeTrackerReturn {
  start: (questionId: string) => void;
  stop: () => void;
  getStats: (
    questionId: string,
  ) => { count: number; totalSeconds: number; avgSeconds: number };
  getAllStats: () => Record<string, StoredStat>;
}

// ─────────────────────────── constants ───────────────────────────

/** Sessions longer than this are capped (probably AFK). */
const MAX_SESSION_SECONDS = 5 * 60;
/** Sessions shorter than this are discarded (just navigating). */
const MIN_SESSION_SECONDS = 2;

// ─────────────────────────── helpers ─────────────────────────────

function loadStats(key: string): Record<string, StoredStat> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, StoredStat> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        typeof (v as { count?: unknown }).count === "number" &&
        typeof (v as { totalSeconds?: unknown }).totalSeconds === "number"
      ) {
        const s = v as StoredStat;
        if (s.count >= 0 && s.totalSeconds >= 0) {
          out[k] = { count: s.count, totalSeconds: s.totalSeconds };
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

function saveStats(key: string, stats: Record<string, StoredStat>): void {
  try {
    localStorage.setItem(key, JSON.stringify(stats));
  } catch {
    /* quota or disabled — non-fatal */
  }
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// ─────────────────────────── useTimeTracker ──────────────────────

/**
 * Track time spent viewing each question.
 *
 * - `start` for the same question twice is a no-op until `stop`.
 * - `start` for a different question implicitly stops the previous one.
 * - Sessions >5min are capped; sessions <2s are discarded.
 */
export function useTimeTracker(storageKey: string): UseTimeTrackerReturn {
  const [stats, setStats] = useState<Record<string, StoredStat>>(() => loadStats(storageKey));

  // Active session refs (don't trigger re-renders on start/stop).
  const activeIdRef = useRef<string | null>(null);
  const startTsRef = useRef<number>(0);

  // Persist on change
  useEffect(() => {
    saveStats(storageKey, stats);
  }, [storageKey, stats]);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== storageKey) return;
      setStats(loadStats(storageKey));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  const flush = useCallback((): void => {
    const id = activeIdRef.current;
    if (!id) return;
    const elapsed = (Date.now() - startTsRef.current) / 1000;
    activeIdRef.current = null;
    startTsRef.current = 0;
    if (elapsed < MIN_SESSION_SECONDS) return;
    const capped = Math.min(elapsed, MAX_SESSION_SECONDS);
    setStats((prev) => {
      const existing = prev[id] ?? { count: 0, totalSeconds: 0 };
      return {
        ...prev,
        [id]: {
          count: existing.count + 1,
          totalSeconds: existing.totalSeconds + capped,
        },
      };
    });
  }, []);

  const start = useCallback(
    (questionId: string): void => {
      if (!questionId) return;
      if (activeIdRef.current === questionId) return; // dedupe same-id
      if (activeIdRef.current) flush();
      activeIdRef.current = questionId;
      startTsRef.current = Date.now();
    },
    [flush],
  );

  const stop = useCallback((): void => {
    flush();
  }, [flush]);

  // Flush any pending session on unmount so we don't lose data.
  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  const getStats = useCallback(
    (
      questionId: string,
    ): { count: number; totalSeconds: number; avgSeconds: number } => {
      const s = stats[questionId];
      if (!s || s.count === 0) return { count: 0, totalSeconds: 0, avgSeconds: 0 };
      return {
        count: s.count,
        totalSeconds: s.totalSeconds,
        avgSeconds: s.totalSeconds / s.count,
      };
    },
    [stats],
  );

  const getAllStats = useCallback((): Record<string, StoredStat> => stats, [stats]);

  return { start, stop, getStats, getAllStats };
}

// ─────────────────────────── TimeStat ────────────────────────────

interface TimeStatProps {
  questionId: string;
  getStats: (
    id: string,
  ) => { count: number; totalSeconds: number; avgSeconds: number };
}

/** Tiny inline stat: "Median: 1:24 · Viewed 3×". Renders null if no data. */
export function TimeStat({ questionId, getStats }: TimeStatProps): JSX.Element | null {
  const s = getStats(questionId);
  if (s.count === 0) return null;
  const avg = formatDuration(s.avgSeconds);
  return (
    <span className="text-[11px] text-ink-400 tabular-nums">
      Median: {avg} · Viewed {s.count}×
    </span>
  );
}
