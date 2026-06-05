/**
 * ProctorTimeline
 * ===============
 * A reusable, presentational visualization of a single test run's proctoring
 * telemetry — when (and for how long) a student left their tab, lost focus,
 * left full screen, copied/pasted, or triggered devtools — laid out on a
 * time-scaled horizontal track over the test session.
 *
 * Two modes:
 *   • FULL    — summary chips + scaled track w/ axis + hover tooltips + a
 *               chronological event list (accessible / mobile fallback) + legend.
 *   • compact — just the summary chips + a thin sparkline-style track, for
 *               embedding inside a live-monitor row.
 *
 * Purely presentational: the consumer fetches `events` via
 * `getRunTimeline(runId)` (api.ts) and passes them in. No data fetching here.
 *
 * Styling matches the rest of the full-test surfaces — Tailwind utilities,
 * slate/indigo palette, rounded cards, soft rings, dark-mode pairs. Colors are
 * always paired with a shape so the encoding is never color-only.
 */
import { useMemo } from "react";
import type { CSSProperties } from "react";
import { Skeleton } from "@/components/Skeleton";
import type { ProctorEvent, ProctorEventType } from "./api";

export interface ProctorTimelineProps {
  events: ProctorEvent[];
  /** ISO start of the session — anchors the track's left edge. */
  startedAt?: string | null;
  /** ISO submit time — anchors the right edge; falls back to now if absent. */
  submittedAt?: string | null;
  loading?: boolean;
  /** Dense embed variant for a monitor row (chips + thin track only). */
  compact?: boolean;
}

// --- event taxonomy --------------------------------------------------------

type Shape = "block" | "tick" | "dot";
interface EventStyle {
  /** Human label for tooltips / list rows. */
  label: string;
  shape: Shape;
  /** marker fill (light) */
  fill: string;
  /** marker fill (dark) */
  darkFill: string;
  /** glyph used in the list + legend (shape-encoded, not color-only). */
  glyph: string;
}

const EVENT_STYLES: Record<ProctorEventType, EventStyle> = {
  away: { label: "Left tab", shape: "block", fill: "#f59e0b", darkFill: "#fbbf24", glyph: "▭" },
  focus_loss: { label: "Lost focus", shape: "block", fill: "#fbbf24", darkFill: "#fcd34d", glyph: "▭" },
  fullscreen_exit: { label: "Exited full screen", shape: "tick", fill: "#ef4444", darkFill: "#f87171", glyph: "▏" },
  fullscreen_enter: { label: "Entered full screen", shape: "tick", fill: "#10b981", darkFill: "#34d399", glyph: "▏" },
  copy: { label: "Copied", shape: "dot", fill: "#3b82f6", darkFill: "#60a5fa", glyph: "●" },
  paste: { label: "Pasted", shape: "dot", fill: "#3b82f6", darkFill: "#60a5fa", glyph: "●" },
  copy_blocked: { label: "Copy blocked", shape: "dot", fill: "#60a5fa", darkFill: "#93c5fd", glyph: "○" },
  paste_blocked: { label: "Paste blocked", shape: "dot", fill: "#60a5fa", darkFill: "#93c5fd", glyph: "○" },
  contextmenu_blocked: { label: "Right-click blocked", shape: "dot", fill: "#94a3b8", darkFill: "#cbd5e1", glyph: "○" },
  devtools: { label: "Opened dev tools", shape: "tick", fill: "#a855f7", darkFill: "#c084fc", glyph: "▏" },
};

const MIN_BLOCK_WIDTH_PCT = 1.2; // a short away-event is still visibly wide
const MIN_TRACK_MS = 60_000; // guard against a zero/near-zero span

// --- formatters ------------------------------------------------------------

/** "0:42" or "1:05:30" from a second count. */
function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || sec <= 0) return "";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** mm:ss elapsed from the session start (axis ticks + list "time from start"). */
function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** "Left tab · Q14 · 0:42" — humanized marker / list label. */
function describe(ev: ProctorEvent): string {
  const base = EVENT_STYLES[ev.type]?.label ?? ev.type;
  const parts = [base];
  if (ev.question != null) parts.push(`Q${ev.question}`);
  else if (ev.module != null) parts.push(`Module ${ev.module}`);
  const dur = fmtDuration(ev.durationSeconds);
  if (dur) parts.push(dur);
  return parts.join(" · ");
}

// --- derived model ---------------------------------------------------------

interface Positioned {
  ev: ProctorEvent;
  /** 0–100 left offset on the track. */
  leftPct: number;
  /** width as % of track (blocks only; ticks/dots are zero-width markers). */
  widthPct: number;
  /** ms elapsed from session start. */
  elapsedMs: number;
  style: EventStyle;
}

interface Summary {
  awaySeconds: number;
  awayCount: number;
  focusLossCount: number;
  copyPasteCount: number;
  fullscreenExitCount: number;
  devtoolsCount: number;
}

function buildSummary(events: ProctorEvent[]): Summary {
  let awaySeconds = 0;
  let awayCount = 0;
  let focusLossCount = 0;
  let copyPasteCount = 0;
  let fullscreenExitCount = 0;
  let devtoolsCount = 0;
  for (const ev of events) {
    switch (ev.type) {
      case "away":
        awayCount += 1;
        awaySeconds += ev.durationSeconds ?? 0;
        break;
      case "focus_loss":
        focusLossCount += 1;
        awaySeconds += ev.durationSeconds ?? 0;
        break;
      case "copy":
      case "paste":
      case "copy_blocked":
      case "paste_blocked":
        copyPasteCount += 1;
        break;
      case "fullscreen_exit":
        fullscreenExitCount += 1;
        break;
      case "devtools":
        devtoolsCount += 1;
        break;
      default:
        break;
    }
  }
  return { awaySeconds, awayCount, focusLossCount, copyPasteCount, fullscreenExitCount, devtoolsCount };
}

// --- chips -----------------------------------------------------------------

interface ChipDef {
  key: string;
  glyph: string;
  label: string;
  value: string | number;
  /** tailwind tone classes (bg/text/ring) */
  tone: string;
}

function chipsFor(s: Summary): ChipDef[] {
  const out: ChipDef[] = [];
  if (s.awaySeconds > 0)
    out.push({
      key: "away-time",
      glyph: "▭",
      label: "away",
      value: fmtDuration(s.awaySeconds),
      tone: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
    });
  if (s.awayCount > 0)
    out.push({
      key: "away-count",
      glyph: "↗",
      label: `left tab ${s.awayCount}×`,
      value: "",
      tone: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
    });
  if (s.focusLossCount > 0)
    out.push({
      key: "focus",
      glyph: "◇",
      label: `focus lost ${s.focusLossCount}×`,
      value: "",
      tone: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
    });
  if (s.copyPasteCount > 0)
    out.push({
      key: "copypaste",
      glyph: "●",
      label: `copy/paste ${s.copyPasteCount}×`,
      value: "",
      tone: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900",
    });
  if (s.fullscreenExitCount > 0)
    out.push({
      key: "fsexit",
      glyph: "▏",
      label: `left full screen ${s.fullscreenExitCount}×`,
      value: "",
      tone: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900",
    });
  if (s.devtoolsCount > 0)
    out.push({
      key: "devtools",
      glyph: "▏",
      label: `dev tools ${s.devtoolsCount}×`,
      value: "",
      tone: "bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:ring-purple-900",
    });
  return out;
}

function SummaryChips({ chips }: { chips: ChipDef[] }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span
          key={c.key}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${c.tone}`}
        >
          <span aria-hidden className="leading-none">
            {c.glyph}
          </span>
          {c.value !== "" ? (
            <>
              <span className="tabular-nums font-semibold">{c.value}</span>
              <span>{c.label}</span>
            </>
          ) : (
            <span>{c.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

// --- legend ----------------------------------------------------------------

const LEGEND: Array<{ glyph: string; label: string; cls: string }> = [
  { glyph: "▭", label: "Left tab / lost focus (width = time)", cls: "text-amber-500" },
  { glyph: "▏", label: "Left full screen / dev tools", cls: "text-rose-500" },
  { glyph: "●", label: "Copy / paste", cls: "text-blue-500" },
];

function Legend(): JSX.Element {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400 dark:text-slate-500">
      {LEGEND.map((l) => (
        <li key={l.label} className="inline-flex items-center gap-1">
          <span aria-hidden className={`leading-none ${l.cls}`}>
            {l.glyph}
          </span>
          <span>{l.label}</span>
        </li>
      ))}
    </ul>
  );
}

// --- track -----------------------------------------------------------------

interface TrackProps {
  positioned: Positioned[];
  compact?: boolean;
}

function Track({ positioned, compact }: TrackProps): JSX.Element {
  const trackH = compact ? "h-3" : "h-9";
  return (
    <div
      role="group"
      aria-label="Proctoring timeline track"
      className={`relative w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800/70 ring-1 ring-slate-200 dark:ring-slate-700 ${trackH}`}
    >
      {positioned.map((p, i) => {
        const { style } = p;
        const aria = describe(p.ev) + ` at ${fmtElapsed(p.elapsedMs)}`;
        // Marker fill is set inline (saturated colours read well on both the
        // light and the dark track) — avoids any Tailwind arbitrary-value edge
        // cases with the dark variant.
        const fill: CSSProperties = { backgroundColor: style.fill };
        if (style.shape === "block") {
          return (
            <button
              key={i}
              type="button"
              title={aria}
              aria-label={aria}
              style={{ ...fill, left: `${p.leftPct}%`, width: `${p.widthPct}%` }}
              className="group absolute top-1/2 -translate-y-1/2 h-[70%] rounded-[3px] opacity-90 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 dark:focus-visible:ring-white"
            />
          );
        }
        if (style.shape === "tick") {
          return (
            <button
              key={i}
              type="button"
              title={aria}
              aria-label={aria}
              style={{ ...fill, left: `${p.leftPct}%` }}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-[80%] w-[3px] rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 dark:focus-visible:ring-white"
            />
          );
        }
        // dot
        return (
          <button
            key={i}
            type="button"
            title={aria}
            aria-label={aria}
            style={{ ...fill, left: `${p.leftPct}%` }}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 ${compact ? "h-2 w-2" : "h-2.5 w-2.5"} rounded-full ring-2 ring-white dark:ring-slate-900 focus:outline-none focus-visible:ring-slate-900 dark:focus-visible:ring-white`}
          />
        );
      })}
    </div>
  );
}

// --- empty + loading states ------------------------------------------------

function FocusedState(): JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-200 dark:ring-emerald-900 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
      <span aria-hidden className="text-base leading-none">
        ✓
      </span>
      <span>Stayed focused — no flags during this test</span>
    </div>
  );
}

// --- main ------------------------------------------------------------------

export default function ProctorTimeline({
  events,
  startedAt,
  submittedAt,
  loading = false,
  compact = false,
}: ProctorTimelineProps): JSX.Element {
  const { positioned, summary, ticks } = useMemo(() => {
    const sum = buildSummary(events);

    // Establish the track span. Prefer explicit started/submitted; otherwise
    // derive from the events themselves so the layout still reads sensibly.
    const evTimes = events
      .map((e) => new Date(e.at).getTime())
      .filter((t) => !Number.isNaN(t));
    const startMs = (() => {
      const s = startedAt ? new Date(startedAt).getTime() : NaN;
      if (!Number.isNaN(s)) return s;
      return evTimes.length ? Math.min(...evTimes) : Date.now() - MIN_TRACK_MS;
    })();
    const endMs = (() => {
      const e = submittedAt ? new Date(submittedAt).getTime() : NaN;
      if (!Number.isNaN(e)) return e;
      const last = evTimes.length ? Math.max(...evTimes) : Date.now();
      return Math.max(last, Date.now());
    })();
    const span = Math.max(MIN_TRACK_MS, endMs - startMs);

    const pos: Positioned[] = events
      .map((ev) => {
        const t = new Date(ev.at).getTime();
        const elapsedMs = Number.isNaN(t) ? 0 : Math.max(0, t - startMs);
        const leftPct = Math.min(100, Math.max(0, (elapsedMs / span) * 100));
        const style = EVENT_STYLES[ev.type] ?? EVENT_STYLES.away;
        let widthPct = 0;
        if (style.shape === "block") {
          const durMs = (ev.durationSeconds ?? 0) * 1000;
          widthPct = Math.max(MIN_BLOCK_WIDTH_PCT, Math.min(100 - leftPct, (durMs / span) * 100));
        }
        return { ev, leftPct, widthPct, elapsedMs, style };
      })
      .sort((a, b) => a.elapsedMs - b.elapsedMs);

    // axis ticks at 0, ¼, ½, ¾, end (elapsed mm:ss).
    const tk = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      pct: f * 100,
      label: fmtElapsed(span * f),
    }));

    return { positioned: pos, summary: sum, ticks: tk };
  }, [events, startedAt, submittedAt]);

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading proctoring timeline" className="space-y-2">
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <Skeleton className={compact ? "h-3 w-full rounded-lg" : "h-9 w-full rounded-lg"} />
        {!compact && <Skeleton className="h-16 w-full rounded-lg" />}
      </div>
    );
  }

  if (events.length === 0) {
    // Compact embeds want a one-liner; full mode gets the reassuring card.
    if (compact) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <span aria-hidden>✓</span> No flags
        </span>
      );
    }
    return <FocusedState />;
  }

  const chips = chipsFor(summary);

  // COMPACT: chips + thin sparkline track only.
  if (compact) {
    return (
      <div className="space-y-1.5">
        {chips.length > 0 && <SummaryChips chips={chips} />}
        <div className="overflow-x-auto">
          <div className="min-w-[180px]">
            <Track positioned={positioned} compact />
          </div>
        </div>
      </div>
    );
  }

  // FULL.
  return (
    <div className="space-y-3">
      {chips.length > 0 && <SummaryChips chips={chips} />}

      {/* scaled track + axis */}
      <div className="overflow-x-auto">
        <div className="min-w-[280px] space-y-1">
          <Track positioned={positioned} />
          <div className="relative h-4 w-full select-none">
            {ticks.map((t, i) => (
              <span
                key={i}
                aria-hidden
                style={{ left: `${t.pct}%` }}
                className={`absolute top-0 text-[10px] tabular-nums text-slate-400 dark:text-slate-500 ${
                  i === 0 ? "translate-x-0" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"
                }`}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <Legend />

      {/* chronological list — accessibility / mobile fallback */}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
        {positioned.map((p, i) => {
          const dur = fmtDuration(p.ev.durationSeconds);
          return (
            <li
              key={i}
              className="flex items-center gap-2.5 px-3 py-1.5 text-xs bg-white dark:bg-slate-900"
            >
              <span
                aria-hidden
                className="w-3 flex-none text-center leading-none"
                style={{ color: p.style.fill }}
              >
                {p.style.glyph}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">
                {p.style.label}
                {p.ev.question != null && (
                  <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">
                    Q{p.ev.question}
                  </span>
                )}
              </span>
              {dur && (
                <span className="flex-none tabular-nums text-amber-600 dark:text-amber-400">{dur}</span>
              )}
              <span className="flex-none tabular-nums text-slate-400 dark:text-slate-500">
                {fmtElapsed(p.elapsedMs)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
