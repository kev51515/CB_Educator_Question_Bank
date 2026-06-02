import { useCallback, useEffect, useState } from "react";

// ─────────────────────────── types ───────────────────────────────

interface ActivityCalendarProps {
  activityByDate: Record<string, number>; // "YYYY-MM-DD" -> count
  daysToShow?: number;
}

interface ActivityLogEntry {
  date: string;
  ids: string[];
}

// ─────────────────────────── helpers ─────────────────────────────

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Format a Date as "YYYY-MM-DD" in local time. */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse "YYYY-MM-DD" into a Date at local midnight. */
function fromIsoDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Bucket activity count into a Tailwind class. */
function colorForCount(count: number): string {
  if (count <= 0) return "bg-ink-100";
  if (count <= 2) return "bg-emerald-200";
  if (count <= 5) return "bg-emerald-400";
  if (count <= 10) return "bg-emerald-600";
  return "bg-emerald-700";
}

interface DayCell {
  date: string; // ISO
  count: number;
  inRange: boolean;
}

/**
 * Build a 53 × 7 grid of days ending today. Columns are weeks (Sun..Sat),
 * the last column contains today. Leading cells in the first column may be
 * out-of-range (rendered transparent) so the grid aligns to weekday rows.
 */
function buildGrid(
  activityByDate: Record<string, number>,
  daysToShow: number,
): { weeks: DayCell[][]; monthLabels: { col: number; label: string }[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const earliest = new Date(today);
  earliest.setDate(today.getDate() - (daysToShow - 1));

  // Anchor the grid so that the last column's last row is "today".
  // Last column day-of-week = today.getDay().
  // The grid is 53 weeks * 7 days. Start point = today - (52 weeks + today.getDay()) days.
  const startOffset = 52 * 7 + today.getDay();
  const gridStart = new Date(today);
  gridStart.setDate(today.getDate() - startOffset);

  const weeks: DayCell[][] = [];
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;

  for (let w = 0; w < 53; w++) {
    const col: DayCell[] = [];
    for (let r = 0; r < 7; r++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + w * 7 + r);
      const iso = toIsoDate(d);
      const inRange = d >= earliest && d <= today;
      const count = inRange ? activityByDate[iso] ?? 0 : 0;
      col.push({ date: iso, count, inRange });

      // Track month transitions on the first row of each column for labeling.
      if (r === 0) {
        const m = d.getMonth();
        if (m !== lastMonth) {
          monthLabels.push({ col: w, label: MONTH_NAMES[m] });
          lastMonth = m;
        }
      }
    }
    weeks.push(col);
  }

  return { weeks, monthLabels };
}

/** Load + normalise the activity log from localStorage. */
function loadLog(key: string): ActivityLogEntry[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ActivityLogEntry[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as { date?: unknown }).date === "string" &&
        Array.isArray((item as { ids?: unknown }).ids)
      ) {
        const ids = ((item as { ids: unknown[] }).ids).filter(
          (x): x is string => typeof x === "string",
        );
        out.push({ date: (item as { date: string }).date, ids });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function saveLog(key: string, log: ActivityLogEntry[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(log));
  } catch {
    /* quota or disabled — non-fatal */
  }
}

// ─────────────────────── ActivityCalendar ────────────────────────

export function ActivityCalendar({
  activityByDate,
  daysToShow = 365,
}: ActivityCalendarProps): JSX.Element {
  const { weeks, monthLabels } = buildGrid(activityByDate, daysToShow);

  return (
    <div className="inline-block text-[10px] text-ink-500" aria-label="Activity calendar">
      {/* Month labels row */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `16px repeat(53, 10px)`,
          columnGap: 1,
          marginBottom: 2,
        }}
        aria-hidden="true"
      >
        <span />
        {Array.from({ length: 53 }).map((_, col) => {
          const lab = monthLabels.find((m) => m.col === col);
          return (
            <span key={col} className="text-[9px] leading-none">
              {lab ? lab.label : ""}
            </span>
          );
        })}
      </div>

      <div className="flex">
        {/* Day-of-week labels (Sun=0..Sat=6). Show M, W, F. */}
        <div
          className="grid mr-1"
          style={{
            gridTemplateRows: `repeat(7, 10px)`,
            rowGap: 1,
          }}
          aria-hidden="true"
        >
          {["", "M", "", "W", "", "F", ""].map((lbl, i) => (
            <span key={i} className="text-[9px] leading-[10px]">
              {lbl}
            </span>
          ))}
        </div>

        {/* The heatmap grid: 53 cols × 7 rows. */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(53, 10px)`,
            gridTemplateRows: `repeat(7, 10px)`,
            gridAutoFlow: "column",
            gap: 1,
          }}
          role="grid"
          aria-label={`Activity over the last ${daysToShow} days`}
        >
          {weeks.flatMap((col) =>
            col.map((cell) => {
              if (!cell.inRange) {
                return (
                  <div
                    key={cell.date}
                    className="bg-transparent"
                    style={{ width: 10, height: 10 }}
                  />
                );
              }
              const title =
                cell.count === 0
                  ? `No activity on ${cell.date}`
                  : `${cell.count} question${cell.count === 1 ? "" : "s"} on ${cell.date}`;
              return (
                <div
                  key={cell.date}
                  className={`${colorForCount(cell.count)} rounded-[2px]`}
                  style={{ width: 10, height: 10 }}
                  title={title}
                  role="gridcell"
                  aria-label={title}
                />
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── useActivityLog ──────────────────────

interface UseActivityLogReturn {
  log: (questionId: string) => void;
  getByDate: () => Record<string, number>;
  getStreak: () => { current: number; longest: number };
  clear: () => void;
}

/**
 * localStorage-backed daily activity log. Stores `Array<{date, ids}>`
 * with one entry per day; ids deduped within a day.
 */
export function useActivityLog(storageKey: string): UseActivityLogReturn {
  const [entries, setEntries] = useState<ActivityLogEntry[]>(() => loadLog(storageKey));

  // Persist on change
  useEffect(() => {
    saveLog(storageKey, entries);
  }, [storageKey, entries]);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== storageKey) return;
      setEntries(loadLog(storageKey));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  const log = useCallback((questionId: string) => {
    if (!questionId) return;
    const today = toIsoDate(new Date());
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.date === today);
      if (idx === -1) {
        return [...prev, { date: today, ids: [questionId] }];
      }
      const existing = prev[idx];
      if (existing.ids.includes(questionId)) return prev; // dedupe
      const next = prev.slice();
      next[idx] = { date: today, ids: [...existing.ids, questionId] };
      return next;
    });
  }, []);

  const getByDate = useCallback((): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const e of entries) out[e.date] = e.ids.length;
    return out;
  }, [entries]);

  const getStreak = useCallback((): { current: number; longest: number } => {
    if (entries.length === 0) return { current: 0, longest: 0 };
    const activeDates = new Set(entries.filter((e) => e.ids.length > 0).map((e) => e.date));
    if (activeDates.size === 0) return { current: 0, longest: 0 };

    // Sort ascending for longest streak scan
    const sorted = [...activeDates].sort();
    let longest = 0;
    let run = 0;
    let prev: Date | null = null;
    for (const iso of sorted) {
      const d = fromIsoDate(iso);
      if (prev) {
        const diff = Math.round((d.getTime() - prev.getTime()) / (24 * 3600 * 1000));
        if (diff === 1) run += 1;
        else run = 1;
      } else {
        run = 1;
      }
      if (run > longest) longest = run;
      prev = d;
    }

    // Current streak: walk back from today (or yesterday if today missing).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = toIsoDate(today);
    const cursor = new Date(today);
    let current = 0;
    if (!activeDates.has(todayIso)) {
      // Allow yesterday as the anchor — streak continues even if today not yet logged.
      cursor.setDate(cursor.getDate() - 1);
    }
    while (activeDates.has(toIsoDate(cursor))) {
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return { current, longest };
  }, [entries]);

  const clear = useCallback(() => {
    setEntries([]);
  }, []);

  return { log, getByDate, getStreak, clear };
}
