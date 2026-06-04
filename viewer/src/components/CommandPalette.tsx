import { useEffect, useMemo, useRef, useState } from "react";
import type { IndexEntry } from "@/types";
import { useLmsCommands } from "@/lib/lmsCommands";

export interface Command {
  id: string;
  label: string;
  hint?: string; // shortcut hint, e.g. "B"
  keywords?: string; // extra searchable text
  group: "Command";
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  index: IndexEntry[];
  recentIds: string[];
  commands: Command[];
  onPickQuestion: (id: string) => void;
}

type Row =
  | { type: "question"; entry: IndexEntry; group: "Recent" | "Questions" }
  | { type: "command"; command: Command };

const MAX_PER_GROUP = 8;

function questionMatches(e: IndexEntry, q: string): boolean {
  if (!q) return true;
  // Number match
  const num = q.replace(/^#/, "");
  if (/^\d+$/.test(num) && e.number != null && String(e.number).startsWith(num)) {
    return true;
  }
  const hay =
    (e.searchText ?? e.preview ?? "") +
    " " +
    e.skill +
    " " +
    e.domain +
    " " +
    e.section +
    " " +
    e.difficulty +
    " " +
    e.id;
  return hay.toLowerCase().includes(q);
}

function commandMatches(c: Command, q: string): boolean {
  if (!q) return true;
  return (c.label + " " + (c.keywords ?? "")).toLowerCase().includes(q);
}

export function CommandPalette({
  open,
  onClose,
  index,
  recentIds,
  commands,
  onPickQuestion,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setCursor(0);
      // Defer focus until the modal is in the DOM
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Restore focus to previously focused element on close
  useEffect(() => {
    if (!open && previousFocus.current) {
      previousFocus.current.focus();
      previousFocus.current = null;
    }
  }, [open]);

  // Trap focus within the palette
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const container = listRef.current?.closest('[role="dialog"]') as HTMLElement | null;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const q = query.trim().toLowerCase();

  // LMS-flavored commands derived from the current route + role. Merged with
  // the host-supplied `commands` prop so the palette stays the single entry
  // point for navigation, per-course actions, and question-bank tasks. The
  // host's commands win on id collision (defensive — none expected today).
  const lmsCommands = useLmsCommands();
  const mergedCommands = useMemo<Command[]>(() => {
    const seen = new Set(commands.map((c) => c.id));
    const extras = lmsCommands.filter((c) => !seen.has(c.id));
    return [...commands, ...extras];
  }, [commands, lmsCommands]);

  const rows: Row[] = useMemo(() => {
    if (!open) return [];
    const out: Row[] = [];
    // Recent (only when no query)
    if (!q) {
      const recent = recentIds
        .map((id) => index.find((e) => e.id === id))
        .filter((e): e is IndexEntry => Boolean(e))
        .slice(0, 5);
      for (const e of recent) out.push({ type: "question", entry: e, group: "Recent" });
    }
    // Questions
    const matched = index.filter((e) => questionMatches(e, q)).slice(0, MAX_PER_GROUP);
    for (const e of matched) {
      // Avoid showing the same item in Recent and Questions
      if (out.some((r) => r.type === "question" && r.entry.id === e.id)) continue;
      out.push({ type: "question", entry: e, group: "Questions" });
    }
    // Commands (host + LMS)
    const matchedCmds = mergedCommands.filter((c) => commandMatches(c, q));
    for (const c of matchedCmds) out.push({ type: "command", command: c });
    return out;
  }, [open, q, index, recentIds, mergedCommands]);

  // Clamp cursor when rows change
  useEffect(() => {
    setCursor((c) => Math.max(0, Math.min(c, rows.length - 1)));
  }, [rows.length]);

  // Scroll the active row into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-row="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const fire = (row: Row) => {
    if (row.type === "question") {
      onPickQuestion(row.entry.id);
      onClose();
    } else {
      row.command.run();
      onClose();
    }
  };

  // Group headers — only the first row of each group renders one
  const groupOf = (r: Row): string =>
    r.type === "question" ? r.group : "Commands";

  const labelFor = (r: Row): string =>
    r.type === "question"
      ? r.entry.number != null
        ? `#${r.entry.number}`
        : r.entry.id
      : r.command.label;

  return (
    <div
      className="fixed inset-0 z-20 bg-ink-800/25 backdrop-blur-md flex items-start justify-center pt-[15vh] px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="bg-white rounded-2xl shadow-modal border border-ink-150 w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-150">
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 text-ink-400 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, rows.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (rows[cursor]) fire(rows[cursor]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Search questions, filters, or commands…"
            // M30: input is the palette's primary focus target; keep outline
            // suppressed but add a visible focus ring so keyboard users see it.
            className="flex-1 bg-transparent text-[15px] text-ink-800 placeholder:text-ink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded"
          />
          <kbd>Esc</kbd>
        </div>
        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto thin-scrollbar"
        >
          {rows.length === 0 && (
            <div className="px-4 py-6 text-center text-[12.5px] text-ink-400">
              No matches
            </div>
          )}
          {rows.map((r, i) => {
            const prevGroup = i > 0 ? groupOf(rows[i - 1]) : null;
            const showHeader = groupOf(r) !== prevGroup;
            const isActive = i === cursor;
            return (
              <div key={(r.type === "question" ? r.entry.id : r.command.id) + ":" + groupOf(r)}>
                {showHeader && (
                  <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">
                    {groupOf(r)}
                  </div>
                )}
                <button
                  data-row={i}
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => fire(r)}
                  className={
                    "w-full text-left px-4 py-2 flex items-center gap-3 text-[13px] transition-colors " +
                    (isActive ? "bg-accent-50" : "hover:bg-ink-50")
                  }
                >
                  {r.type === "question" ? (
                    <>
                      <span
                        className={
                          "tabular-nums font-semibold shrink-0 " +
                          (isActive ? "text-accent-700" : "text-ink-700")
                        }
                      >
                        {labelFor(r)}
                      </span>
                      <span className="text-ink-500 truncate flex-1">
                        {r.entry.preview ?? `${r.entry.section} · ${r.entry.skill}`}
                      </span>
                      <span className="text-[11px] text-ink-400 shrink-0">
                        {r.entry.difficulty}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-ink-700">{r.command.label}</span>
                      {r.command.hint && <kbd>{r.command.hint}</kbd>}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-ink-150 flex items-center gap-3 text-[11px] text-ink-400">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
