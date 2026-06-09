/**
 * replayModel — pure reconstruction of a student's sitting at a point in time.
 *
 * Given the ordered event stream from `get_test_run_replay`, compute the exact
 * state the student's screen was in at elapsed time T: which question they were
 * viewing, their answers, colored highlights, eliminations, flags, the open
 * note, and whether the calculator was open. Also derives per-question dwell
 * (active seconds) for the heatmap.
 *
 * Events key state by `${module}:${questionNumber}` (the stream carries module
 * position + question NUMBER, not the question id). The page maps that back to
 * the TestQuestion via the module content.
 */
import type { ProctorEvent, ReplayModule } from "./api";
import { mergeRanges, subtractRange, coerceColor, type Highlight } from "./annotations";
import type { Letter, TestQuestion } from "./types";

export type QKey = string; // `${module}:${number}`

export function qKey(module: number | null, question: number | null): QKey {
  return `${module ?? 0}:${question ?? 0}`;
}

export interface ReplayState {
  /** Current position (from the latest nav at/under T). */
  module: number | null;
  question: number | null;
  answers: Record<QKey, string | null>;
  highlights: Record<QKey, Highlight[]>;
  eliminations: Record<QKey, Set<Letter>>;
  marks: Set<QKey>;
  notes: Record<QKey, string>;
  calcOpen: boolean;
}

function emptyState(): ReplayState {
  return {
    module: null,
    question: null,
    answers: {},
    highlights: {},
    eliminations: {},
    marks: new Set(),
    notes: {},
    calcOpen: false,
  };
}

// Mirror annotations.addHighlight's color-aware merge (newest color wins).
function applyHighlightAdd(list: Highlight[], hl: Highlight): Highlight[] {
  const trimmed: Highlight[] = list.flatMap((h) =>
    h.field !== hl.field
      ? [h]
      : subtractRange({ start: h.start, end: h.end }, { start: hl.start, end: hl.end }).map(
          (r): Highlight => ({ field: h.field, start: r.start, end: r.end, color: h.color }),
        ),
  );
  const sameColor = trimmed.filter((h) => h.field === hl.field && h.color === hl.color);
  const otherColor = trimmed.filter((h) => !(h.field === hl.field && h.color === hl.color));
  const merged = mergeRanges([...sameColor, hl]).map(
    (r): Highlight => ({ field: hl.field, start: r.start, end: r.end, color: hl.color }),
  );
  return [...otherColor, ...merged];
}

function applyHighlightRemove(list: Highlight[], field: string, offset: number): Highlight[] {
  return list.filter((h) => !(h.field === field && offset >= h.start && offset < h.end));
}

/**
 * Reconstruct the screen state from all events with `at <= tMs`.
 * Events must be sorted ascending by `at` (the RPC returns them so).
 */
export function reconstructAt(events: ProctorEvent[], tMs: number, startMs: number): ReplayState {
  const s = emptyState();
  for (const ev of events) {
    const at = new Date(ev.at).getTime();
    if (Number.isNaN(at) || at - startMs > tMs) break;
    const k = qKey(ev.module, ev.question);
    const m = ev.meta ?? {};
    switch (ev.type) {
      case "nav":
        s.module = ev.module;
        s.question = ev.question;
        break;
      case "answer_set":
      case "answer_change":
        s.answers[k] = (m.to as string) ?? null;
        break;
      case "answer_clear":
        s.answers[k] = null;
        break;
      case "highlight_add": {
        const hl: Highlight = {
          field: (m.field as Highlight["field"]) ?? "passage",
          start: (m.start as number) ?? 0,
          end: (m.end as number) ?? 0,
          color: coerceColor(m.color),
        };
        if (hl.end > hl.start) s.highlights[k] = applyHighlightAdd(s.highlights[k] ?? [], hl);
        break;
      }
      case "highlight_remove":
        s.highlights[k] = applyHighlightRemove(
          s.highlights[k] ?? [],
          (m.field as string) ?? "passage",
          (m.offset as number) ?? -1,
        );
        break;
      case "highlight_clear":
        s.highlights[k] = [];
        break;
      case "eliminate": {
        const set = new Set(s.eliminations[k] ?? []);
        if (m.choice) set.add(m.choice as Letter);
        s.eliminations[k] = set;
        break;
      }
      case "uneliminate": {
        const set = new Set(s.eliminations[k] ?? []);
        if (m.choice) set.delete(m.choice as Letter);
        s.eliminations[k] = set;
        break;
      }
      case "flag":
        s.marks.add(k);
        break;
      case "unflag":
        s.marks.delete(k);
        break;
      case "note_edit":
        s.notes[k] = (m.text as string) ?? "";
        break;
      case "calc_open":
        s.calcOpen = true;
        break;
      case "calc_close":
        s.calcOpen = false;
        break;
      default:
        break;
    }
  }
  return s;
}

// --- per-question dwell (heatmap) ------------------------------------------

export interface DwellEntry {
  module: number;
  number: number;
  seconds: number;
  /** elapsed ms from session start of the FIRST nav to this question (for jump). */
  firstSeenMs: number | null;
}

/** Sum dwell seconds per (module, question) + earliest visit offset. */
export function buildDwell(events: ProctorEvent[], startMs: number): DwellEntry[] {
  const byKey = new Map<QKey, DwellEntry>();
  for (const ev of events) {
    if (ev.module == null || ev.question == null) continue;
    const k = qKey(ev.module, ev.question);
    let e = byKey.get(k);
    if (!e) {
      e = { module: ev.module, number: ev.question, seconds: 0, firstSeenMs: null };
      byKey.set(k, e);
    }
    if (ev.type === "dwell") e.seconds += ev.durationSeconds ?? 0;
    if (ev.type === "nav" && e.firstSeenMs == null) {
      const at = new Date(ev.at).getTime();
      if (!Number.isNaN(at)) e.firstSeenMs = at - startMs;
    }
  }
  return [...byKey.values()].sort((a, b) => a.module - b.module || a.number - b.number);
}

// --- content lookup --------------------------------------------------------

/** Map `${module}:${number}` → TestQuestion across all modules. */
export function buildQuestionIndex(modules: ReplayModule[]): Map<QKey, TestQuestion> {
  const map = new Map<QKey, TestQuestion>();
  for (const m of modules) {
    for (const q of m.questions) map.set(qKey(m.position, q.number), q);
  }
  return map;
}

/** mm:ss (or h:mm:ss) from elapsed ms. */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}
