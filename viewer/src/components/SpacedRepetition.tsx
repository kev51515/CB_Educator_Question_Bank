import { useCallback, useEffect, useRef, useState } from "react";

export interface ReviewRecord {
  questionId: string;
  lastReviewed: number; // unix ms
  reviews: number;
  confidence: number; // last rating 1-3
  nextDue: number; // unix ms when this should be reviewed again
  interval: number; // current interval in days
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_INTERVAL_DAYS = 90;

/**
 * Compute the next review interval (in days) given the previous interval and the user's confidence.
 * - First review (interval <= 0): always 1 day
 * - Confidence 1 (unsure): interval * 0.5, min 1 day (effectively a reset)
 * - Confidence 2 (okay): interval * 2
 * - Confidence 3 (confident): interval * 3
 * - Capped at MAX_INTERVAL_DAYS
 */
function nextInterval(prevIntervalDays: number, confidence: number): number {
  if (prevIntervalDays <= 0) return 1;
  let next: number;
  if (confidence <= 1) {
    next = Math.max(1, prevIntervalDays * 0.5);
  } else if (confidence === 2) {
    next = prevIntervalDays * 2;
  } else {
    next = prevIntervalDays * 3;
  }
  return Math.min(MAX_INTERVAL_DAYS, next);
}

function isReviewRecord(value: unknown): value is ReviewRecord {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.questionId === "string" &&
    typeof v.lastReviewed === "number" &&
    typeof v.reviews === "number" &&
    typeof v.confidence === "number" &&
    typeof v.nextDue === "number" &&
    typeof v.interval === "number"
  );
}

function parseRecords(raw: unknown): Record<string, ReviewRecord> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, ReviewRecord> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isReviewRecord(v)) result[k] = v;
  }
  return result;
}

export interface UseSpacedRepetition {
  getRecord: (id: string) => ReviewRecord | null;
  recordReview: (id: string, confidence: number) => void;
  getDueQuestions: (allIds: string[], now?: number) => string[];
  countDue: (allIds: string[]) => number;
}

/**
 * FSRS-lite spaced repetition hook. Stores review records per question in localStorage
 * and computes "due for review" status using a simple SM-2 variant.
 */
export function useSpacedRepetition(storageKey: string): UseSpacedRepetition {
  const [map, setMap] = useState<Record<string, ReviewRecord>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return {};
      return parseRecords(JSON.parse(raw));
    } catch {
      return {};
    }
  });

  // Use a ref to track whether the update came from a storage event,
  // so we don't write back to localStorage on cross-tab sync.
  const fromStorage = useRef(false);

  useEffect(() => {
    if (fromStorage.current) {
      fromStorage.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(map));
    } catch {
      /* quota or disabled — non-fatal */
    }
  }, [storageKey, map]);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      try {
        const next = e.newValue ? parseRecords(JSON.parse(e.newValue)) : {};
        fromStorage.current = true;
        setMap(next);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  const getRecord = useCallback(
    (id: string): ReviewRecord | null => {
      return map[id] ?? null;
    },
    [map],
  );

  const recordReview = useCallback((id: string, confidence: number) => {
    const clamped = Math.max(1, Math.min(3, Math.round(confidence)));
    setMap((prev) => {
      const existing = prev[id];
      const prevInterval = existing?.interval ?? 0;
      const interval = nextInterval(prevInterval, clamped);
      const now = Date.now();
      const record: ReviewRecord = {
        questionId: id,
        lastReviewed: now,
        reviews: (existing?.reviews ?? 0) + 1,
        confidence: clamped,
        nextDue: now + interval * MS_PER_DAY,
        interval,
      };
      return { ...prev, [id]: record };
    });
  }, []);

  const getDueQuestions = useCallback(
    (allIds: string[], now: number = Date.now()): string[] => {
      const due: string[] = [];
      for (const id of allIds) {
        const record = map[id];
        if (record && record.nextDue <= now) due.push(id);
      }
      return due;
    },
    [map],
  );

  const countDue = useCallback(
    (allIds: string[]): number => {
      const now = Date.now();
      let count = 0;
      for (const id of allIds) {
        const record = map[id];
        if (record && record.nextDue <= now) count++;
      }
      return count;
    },
    [map],
  );

  return { getRecord, recordReview, getDueQuestions, countDue };
}

interface DueReviewIndicatorProps {
  count: number;
  onClick: () => void;
}

/** Small badge button shown when there are questions due for review. */
export function DueReviewIndicator({ count, onClick }: DueReviewIndicatorProps): JSX.Element | null {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11.5px] px-2 py-1 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 focus-ring"
      aria-label={`${count} question${count === 1 ? "" : "s"} due for review`}
    >
      {count} due for review
    </button>
  );
}
