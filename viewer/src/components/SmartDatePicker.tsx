/**
 * SmartDatePicker
 * ===============
 * A date/time picker built around the way humans actually think about
 * scheduling teaching work: "today", "tomorrow", "Friday", "end of month".
 *
 * The relative presets are the *primary* affordance — they're rendered as a
 * pill row, always visible. The raw `<input type="datetime-local">` is a
 * fall-back tucked behind a "Custom…" toggle for the rare case where none
 * of the presets fit.
 *
 * When a value is set the picker shows a compact summary pill above the
 * presets ("✓ Tomorrow at 11:59 pm · in 1 day · ×") so the user can see and
 * clear the choice in one glance.
 */
import { useMemo, useState } from "react";

interface SmartDatePickerProps {
  value: string | null;          // ISO string or null
  onChange: (next: string | null) => void;
  label?: string;
  allowClear?: boolean;
  className?: string;
}

interface Preset {
  key: string;
  label: string;
  toIso: () => string;
}

export function SmartDatePicker({
  value,
  onChange,
  label,
  allowClear = true,
  className,
}: SmartDatePickerProps) {
  const [customOpen, setCustomOpen] = useState(false);

  const presets: Preset[] = useMemo(
    () => [
      { key: "today", label: "Today", toIso: () => endOfDay(new Date()).toISOString() },
      { key: "tomorrow", label: "Tomorrow", toIso: () => endOfDay(addDays(new Date(), 1)).toISOString() },
      { key: "friday", label: "Friday", toIso: () => endOfDay(nextDayOfWeek(5)).toISOString() },
      { key: "1w", label: "In 1 week", toIso: () => endOfDay(addDays(new Date(), 7)).toISOString() },
      { key: "2w", label: "In 2 weeks", toIso: () => endOfDay(addDays(new Date(), 14)).toISOString() },
      { key: "eom", label: "End of month", toIso: () => endOfMonth(new Date()).toISOString() },
    ],
    [],
  );

  // Identify which preset (if any) the current value matches. Match within
  // 60 seconds so we still highlight the chip even if the user re-loaded a
  // value that was set yesterday with the same preset.
  const matchedKey: string | null = useMemo(() => {
    if (!value) return null;
    const t = new Date(value).getTime();
    for (const p of presets) {
      if (Math.abs(new Date(p.toIso()).getTime() - t) < 60_000) return p.key;
    }
    return null;
  }, [value, presets]);

  const localValue = value ? toLocalDatetimeInput(value) : "";

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          {label}
        </label>
      )}

      {/* Compact summary pill of the current value */}
      {value && (
        <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-900 px-2.5 py-1.5 text-sm text-indigo-800 dark:text-indigo-200">
          <span aria-hidden>✓</span>
          <span className="font-medium">{prettyDate(value)}</span>
          <span className="opacity-70">· {relativeString(value)}</span>
          {allowClear && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setCustomOpen(false);
              }}
              aria-label="Clear date"
              className="ml-1 -mr-0.5 rounded text-indigo-600 dark:text-indigo-300 hover:text-rose-600 dark:hover:text-rose-400 min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 inline-flex items-center justify-center"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Preset chip row — always visible. THIS is the affordance. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((p) => {
          const active = matchedKey === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                onChange(p.toIso());
                setCustomOpen(false);
              }}
              aria-pressed={active}
              className={
                "rounded-full px-3 py-2 md:py-1 text-xs font-medium transition-colors " +
                (active
                  ? "bg-indigo-600 text-white ring-1 ring-indigo-600 dark:ring-indigo-500"
                  : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-700 dark:hover:text-indigo-200")
              }
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCustomOpen((o) => !o)}
          aria-pressed={customOpen}
          className={
            "rounded-full px-3 py-2 md:py-1 text-xs font-medium transition-colors " +
            (customOpen
              ? "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 ring-1 ring-slate-300 dark:ring-slate-600"
              : "text-slate-500 dark:text-slate-400 ring-1 ring-dashed ring-slate-300 dark:ring-slate-700 hover:text-slate-700 dark:hover:text-slate-200")
          }
        >
          {customOpen ? "− Hide custom" : "+ Custom…"}
        </button>
      </div>

      {/* Custom datetime input — opt-in only */}
      {customOpen && (
        <div className="mt-2">
          <input
            type="datetime-local"
            value={localValue}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) onChange(null);
              else onChange(new Date(v).toISOString());
            }}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}
    </div>
  );
}

// ---- date helpers ---------------------------------------------------------

function endOfDay(d: Date): Date {
  const x = new Date(d);
  // 23:59:59.999 (not :00) so a due date doesn't appear "overdue" for the
  // last 60 seconds of the day. Matches Canvas's behavior.
  x.setHours(23, 59, 59, 999);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function nextDayOfWeek(weekday: number): Date {
  const today = new Date();
  const diff = (weekday - today.getDay() + 7) % 7 || 7;
  return addDays(today, diff);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 0, 0);
}
function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function prettyDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const datePart = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const timePart = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} at ${timePart}`;
}
function relativeString(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const absMs = Math.abs(ms);
  const minutes = Math.round(ms / 60_000);
  const hours = Math.round(ms / 3_600_000);
  const days = Math.round(ms / 86_400_000);
  if (absMs < 60_000) return "just now";
  try {
    const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (absMs < 3_600_000) return fmt.format(minutes, "minute");
    if (absMs < 86_400_000) return fmt.format(hours, "hour");
    if (absMs < 60 * 86_400_000) return fmt.format(days, "day");
    return new Date(iso).toLocaleDateString();
  } catch {
    if (days === 0) return "today";
    if (days === 1) return "tomorrow";
    if (days > 0) return `in ${days} days`;
    return `${-days} days ago`;
  }
}
