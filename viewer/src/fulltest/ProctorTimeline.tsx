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
import type { CSSProperties, ReactNode } from "react";
import { Skeleton } from "@/components/Skeleton";
import type {
  ProctorEvent,
  ProctorEventType,
  ActionEventType,
  TimelineEventType,
} from "./api";

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

/**
 * Action-journal types (migration 0124) are a SEPARATE family from the
 * integrity signals above: high-volume (a student may change one answer many
 * times) and behavioural rather than violations. They're partitioned out of
 * the integrity track/summary and rendered as an aggregated "Answer activity"
 * section so they neither swamp the flag track nor break the "no flags"
 * reassurance.
 */
const ACTION_TYPES: ReadonlySet<TimelineEventType> = new Set<ActionEventType>([
  "answer_set",
  "answer_change",
  "answer_clear",
  "flag",
  "unflag",
  "eliminate",
  "uneliminate",
  "nav",
]);

function isActionEvent(ev: ProctorEvent): boolean {
  return ACTION_TYPES.has(ev.type);
}

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
  const base = EVENT_STYLES[ev.type as ProctorEventType]?.label ?? ev.type;
  const parts = [base];
  if (ev.question != null) parts.push(`Q${ev.question}`);
  else if (ev.module != null) parts.push(`Module ${ev.module}`);
  const dur = fmtDuration(ev.durationSeconds);
  if (dur) parts.push(dur);
  // Copy/cut: include a short snippet of what was copied in the tooltip.
  if ((ev.type === "copy" || ev.type === "copy_blocked") && ev.meta?.text) {
    const t = ev.meta.text.replace(/\s+/g, " ").trim();
    parts.push(`“${t.length > 80 ? `${t.slice(0, 80)}…` : t}”`);
  }
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
  glyph: ReactNode;
  label: string;
  value: string | number;
  /** tailwind tone classes (bg/text/ring) */
  tone: string;
  /** optional hover/focus tooltip explaining what the count means. */
  title?: string;
}

/** Small inline arrow-up-right icon — "left tab / navigated away" marker. */
function ArrowUpRightIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  );
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
      glyph: <ArrowUpRightIcon />,
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
          title={c.title}
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

// --- answer activity (action journal, migration 0124) ----------------------

interface QuestionActivity {
  question: number;
  /** ordered answer chain, e.g. ["B","D","A","D"] ("—" = cleared). */
  chain: string[];
  changeCount: number; // answer_change events
  flagged: boolean; // net flag state (flags − unflags > 0)
  eliminations: number; // eliminate events
  revisits: number; // nav events beyond the first
}

interface ActivityModel {
  totalChanges: number;
  flagCount: number; // questions currently flagged
  elimCount: number; // total eliminate events
  highChurn: QuestionActivity[]; // questions changed ≥2×, most-churned first
}

function buildActivity(actions: ProctorEvent[]): ActivityModel {
  // Group by question, preserving chronological order (events arrive ordered).
  const byQ = new Map<number, ProctorEvent[]>();
  for (const ev of actions) {
    if (ev.question == null) continue;
    const list = byQ.get(ev.question);
    if (list) list.push(ev);
    else byQ.set(ev.question, [ev]);
  }

  const perQ: QuestionActivity[] = [];
  let elimCount = 0;
  for (const [question, list] of byQ) {
    const chain: string[] = [];
    let changeCount = 0;
    let flags = 0;
    let eliminations = 0;
    let navs = 0;
    for (const ev of list) {
      switch (ev.type) {
        case "answer_set":
          if (ev.meta?.to) chain.push(ev.meta.to);
          break;
        case "answer_change":
          if (ev.meta?.to) chain.push(ev.meta.to);
          changeCount += 1;
          break;
        case "answer_clear":
          chain.push("—");
          break;
        case "flag":
          flags += 1;
          break;
        case "unflag":
          flags -= 1;
          break;
        case "eliminate":
          eliminations += 1;
          elimCount += 1;
          break;
        case "nav":
          navs += 1;
          break;
        default:
          break;
      }
    }
    perQ.push({
      question,
      chain,
      changeCount,
      flagged: flags > 0,
      eliminations,
      revisits: Math.max(0, navs - 1),
    });
  }

  const flagCount = perQ.filter((q) => q.flagged).length;
  const totalChanges = perQ.reduce((n, q) => n + q.changeCount, 0);
  const highChurn = perQ
    .filter((q) => q.changeCount >= 2)
    .sort((a, b) => b.changeCount - a.changeCount || a.question - b.question);

  return { totalChanges, flagCount, elimCount, highChurn };
}

function ActivitySummary({ model }: { model: ActivityModel }): JSX.Element {
  const chips: ChipDef[] = [];
  if (model.totalChanges > 0)
    chips.push({
      key: "changes",
      glyph: "↻",
      label: "answer changes",
      value: model.totalChanges,
      tone: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900",
      title: "How many times this student replaced an answer they had already chosen, across the whole test.",
    });
  if (model.highChurn.length > 0)
    chips.push({
      key: "churn",
      glyph: "⇄",
      label: "high-churn Qs",
      value: model.highChurn.length,
      tone: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900",
      title: "Questions whose answer changed 2 or more times — worth a look for confusion or second-guessing.",
    });
  if (model.flagCount > 0)
    chips.push({
      key: "flags",
      glyph: "⚑",
      label: "flagged",
      value: model.flagCount,
      tone: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
      title: "Questions the student marked for review and left flagged at submit.",
    });
  if (model.elimCount > 0)
    chips.push({
      key: "elim",
      glyph: "⊘",
      label: "eliminations",
      value: model.elimCount,
      tone: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
      title: "How many answer choices the student crossed out using the eliminator tool.",
    });

  if (chips.length === 0) return <></>;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Answer activity
        </h4>
        <span
          aria-hidden
          title="How the student worked the test — recorded only when proctoring is on. Use it for coaching (where they second-guessed) and to spot last-second answer swaps."
          className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300"
        >
          ?
        </span>
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Most-changed questions, with each answer in the order the student picked it
        (<span className="font-mono">→</span> shows a change, <span className="font-mono">—</span> a clear).
      </p>
      <SummaryChips chips={chips} />
      {model.highChurn.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
          {model.highChurn.slice(0, 8).map((q) => (
            <li
              key={q.question}
              title={`Q${q.question}: answered ${q.chain.join(" then ")}${q.revisits > 0 ? ` · revisited ${q.revisits}×` : ""}`}
              className="flex items-center gap-2.5 px-3 py-1.5 text-xs bg-white dark:bg-slate-900"
            >
              <span className="flex-none font-semibold text-slate-700 dark:text-slate-200 tabular-nums w-10">
                Q{q.question}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {q.chain.join(" → ")}
              </span>
              {q.revisits > 0 && (
                <span className="flex-none text-[10px] text-slate-400 dark:text-slate-500">
                  {q.revisits} revisit{q.revisits === 1 ? "" : "s"}
                </span>
              )}
              <span className="flex-none tabular-nums font-semibold text-indigo-600 dark:text-indigo-400">
                {q.changeCount}× changed
              </span>
            </li>
          ))}
        </ul>
      )}
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
  // Partition the timeline into integrity SIGNALS (the flag track) and ACTION
  // journal (answer churn / flags / eliminations — the "Answer activity"
  // aggregate). They have very different volume and meaning.
  const { integrity, actions } = useMemo(() => {
    const integ: ProctorEvent[] = [];
    const acts: ProctorEvent[] = [];
    for (const ev of events) (isActionEvent(ev) ? acts : integ).push(ev);
    return { integrity: integ, actions: acts };
  }, [events]);

  const activity = useMemo(() => buildActivity(actions), [actions]);

  const { positioned, summary, ticks } = useMemo(() => {
    const sum = buildSummary(integrity);

    // Establish the track span. Prefer explicit started/submitted; otherwise
    // derive from the events themselves so the layout still reads sensibly.
    const evTimes = integrity
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

    const pos: Positioned[] = integrity
      .map((ev) => {
        const t = new Date(ev.at).getTime();
        const elapsedMs = Number.isNaN(t) ? 0 : Math.max(0, t - startMs);
        const leftPct = Math.min(100, Math.max(0, (elapsedMs / span) * 100));
        const style = EVENT_STYLES[ev.type as ProctorEventType] ?? EVENT_STYLES.away;
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
  }, [integrity, startedAt, submittedAt]);

  const hasActivity = activity.totalChanges > 0 || activity.flagCount > 0 || activity.elimCount > 0;

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

  const chips = chipsFor(summary);

  // COMPACT: integrity signals only (chips + thin sparkline track). The dense
  // monitor row never shows the answer-activity aggregate.
  if (compact) {
    if (integrity.length === 0) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <span aria-hidden>✓</span> No flags
        </span>
      );
    }
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

  // FULL: integrity section (flag track OR reassurance) + answer-activity.
  return (
    <div className="space-y-4">
      {integrity.length === 0 ? (
        <FocusedState />
      ) : (
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
              className="flex items-start gap-2.5 px-3 py-1.5 text-xs bg-white dark:bg-slate-900"
            >
              <span
                aria-hidden
                className="mt-0.5 w-3 flex-none text-center leading-none"
                style={{ color: p.style.fill }}
              >
                {p.style.glyph}
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {p.style.label}
                  {p.ev.question != null && (
                    <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">
                      Q{p.ev.question}
                    </span>
                  )}
                </span>
                {/* Exactly what the student copied (0211) — captured selection,
                    capped 2000 chars. Shown for both copy + copy_blocked. */}
                {(p.ev.type === "copy" || p.ev.type === "copy_blocked") && p.ev.meta?.text && (
                  <p className="mt-1 break-words rounded bg-slate-50 px-1.5 py-1 font-mono text-[11px] leading-snug text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700">
                    “{p.ev.meta.text}”
                    {p.ev.meta.chars != null && p.ev.meta.chars > p.ev.meta.text.length && (
                      <span className="ml-1 not-italic text-slate-400 dark:text-slate-500">
                        (+{p.ev.meta.chars - p.ev.meta.text.length} more characters)
                      </span>
                    )}
                  </p>
                )}
              </div>
              {dur && (
                <span className="mt-0.5 flex-none tabular-nums text-amber-600 dark:text-amber-400">{dur}</span>
              )}
              <span className="mt-0.5 flex-none tabular-nums text-slate-400 dark:text-slate-500">
                {fmtElapsed(p.elapsedMs)}
              </span>
            </li>
          );
        })}
      </ul>
        </div>
      )}

      {hasActivity && <ActivitySummary model={activity} />}
    </div>
  );
}
