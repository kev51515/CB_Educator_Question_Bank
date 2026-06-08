/**
 * QuickCreatePalette
 * ==================
 * A "spawn anywhere" picker for the four primary teacher-created surfaces:
 *
 *   - Assignment      → /courses/:short_code/assignments
 *   - Announcement    → /courses/:short_code/announcements
 *   - Discussion      → /courses/:short_code/discussions
 *   - Material        → /courses/:short_code/materials
 *
 * Triggered by ⌘N / Ctrl+N. Mounted inside ClassLayout so it only fires when
 * the user is inside a course route and the class context is available.
 *
 * Activation strategy: ROUTE-ONLY. None of the four consumer pages currently
 * honor a `?new=true` (or equivalent) query flag — they expose "+ New"
 * buttons inline. Rather than invent a flag the consumers don't read, this
 * palette navigates to the surface route and the teacher clicks "+ New"
 * once on the destination page. This keeps the palette honest: if any of
 * those pages later gain a `?new=...` flag we can layer it in here without
 * a routing rewrite.
 *
 * Recents: last-used card id is persisted to
 *   localStorage["staff.quickcreate.recent:<userId>"]
 * so the next open auto-highlights the most-recent choice. Single string
 * (not an ordered list) — this is a 4-card picker, not a fuzzy search.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile } from "@/lib/profile";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useClassContext } from "./classLayoutContext";
import {
  courseAssignmentsPath,
  courseAnnouncementsPath,
  courseDiscussionsPath,
  courseMaterialsPath,
} from "@/lib/routes";

type CardId = "assignment" | "announcement" | "discussion" | "material";

interface CardDef {
  id: CardId;
  label: string;
  hint: string;
  icon: ReactNode; // inline line-SVG glyph — keeps deps to zero
  build: (shortCode: string) => string;
}

/** Shared wrapper so every card icon renders at a consistent stroke + size. */
function CardIcon({ children }: { children: ReactNode }): JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

// 2x2 grid order: top-left, top-right, bottom-left, bottom-right.
const CARDS: ReadonlyArray<CardDef> = [
  {
    id: "assignment",
    label: "Assignment",
    hint: "Question Set, Practice Test, or upload",
    icon: (
      <CardIcon>
        <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-9.9 9.9-3.56.486.486-3.56 9.414-9.886Z" />
        <path d="M14 4l3 3" />
      </CardIcon>
    ),
    build: courseAssignmentsPath,
  },
  {
    id: "announcement",
    label: "Announcement",
    hint: "Post to your students",
    icon: (
      <CardIcon>
        <path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V7L6 11H4a1 1 0 0 0-1 0Z" />
        <path d="M14 8a4 4 0 0 1 0 8" />
        <path d="M18 5a8 8 0 0 1 0 14" />
      </CardIcon>
    ),
    build: courseAnnouncementsPath,
  },
  {
    id: "discussion",
    label: "Discussion topic",
    hint: "Open a thread",
    icon: (
      <CardIcon>
        <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5Z" />
      </CardIcon>
    ),
    build: courseDiscussionsPath,
  },
  {
    id: "material",
    label: "Material",
    hint: "Add a link, file, or note",
    icon: (
      <CardIcon>
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      </CardIcon>
    ),
    build: courseMaterialsPath,
  },
];

function recentKey(userId: string): string {
  return `staff.quickcreate.recent:${userId}`;
}

function readRecent(userId: string | undefined): CardId | null {
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(recentKey(userId));
    if (raw === "assignment" || raw === "announcement" || raw === "discussion" || raw === "material") {
      return raw;
    }
  } catch {
    // localStorage can throw (private mode, quota, etc.) — non-fatal.
  }
  return null;
}

function writeRecent(userId: string | undefined, id: CardId): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(recentKey(userId), id);
  } catch {
    // non-fatal
  }
}

/**
 * True when the active element is a text input target the user is typing
 * into. We don't want ⌘N to fire while they're writing an announcement body.
 */
function isTypingInField(): boolean {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function QuickCreatePalette() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { cls } = useClassContext();

  const isStaff = profile?.role === "teacher" || profile?.role === "admin";

  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, open);

  // Global ⌘N / Ctrl+N listener. Gated on:
  //   - staff role
  //   - not typing in a field (INPUT/TEXTAREA/SELECT/contenteditable)
  //   - not already open
  useEffect(() => {
    if (!isStaff) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      const isModN = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "n";
      if (!isModN) return;
      if (isTypingInField()) return;
      e.preventDefault();
      // Default-highlight the most-recent card; otherwise the first.
      const recent = readRecent(profile?.id);
      const initial = recent ? CARDS.findIndex((c) => c.id === recent) : 0;
      setCursor(initial >= 0 ? initial : 0);
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isStaff, profile?.id]);

  const close = useCallback((): void => {
    setOpen(false);
  }, []);

  const activate = useCallback(
    (card: CardDef): void => {
      writeRecent(profile?.id, card.id);
      setOpen(false);
      navigate(card.build(cls.short_code));
    },
    [navigate, cls.short_code, profile?.id],
  );

  // Subtitle, memoized so the dialog doesn't churn during keyboard nav.
  const subtitle = useMemo(() => cls.name, [cls.name]);

  if (!isStaff || !open) return null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const card = CARDS[cursor];
      if (card) activate(card);
      return;
    }
    // Arrow nav — 2x2 grid. Indices: 0 TL, 1 TR, 2 BL, 3 BR.
    let next = cursor;
    if (e.key === "ArrowRight") next = cursor === 0 ? 1 : cursor === 2 ? 3 : cursor;
    else if (e.key === "ArrowLeft") next = cursor === 1 ? 0 : cursor === 3 ? 2 : cursor;
    else if (e.key === "ArrowDown") next = cursor === 0 ? 2 : cursor === 1 ? 3 : cursor;
    else if (e.key === "ArrowUp") next = cursor === 2 ? 0 : cursor === 3 ? 1 : cursor;
    else return;
    e.preventDefault();
    setCursor(next);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onMouseDown={close}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm motion-safe:transition-opacity"
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-create-title"
        className="relative w-full max-w-[480px] rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-2xl p-5 motion-safe:transition-transform"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2
              id="quick-create-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Quick create
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="shrink-0 inline-flex items-center justify-center min-h-[40px] min-w-[40px] rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 motion-safe:transition-colors"
          >
            <span aria-hidden className="text-xl leading-none">×</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3" role="group" aria-label="Choose a thing to create">
          {CARDS.map((card, idx) => {
            const focused = idx === cursor;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => activate(card)}
                onMouseEnter={() => setCursor(idx)}
                aria-current={focused ? "true" : undefined}
                className={`text-left rounded-xl p-4 min-h-[96px] ring-1 motion-safe:transition-all ${
                  focused
                    ? "bg-indigo-50 dark:bg-indigo-950/40 ring-indigo-500 dark:ring-indigo-400 shadow-sm"
                    : "bg-slate-50 dark:bg-slate-800/50 ring-slate-200 dark:ring-slate-800 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 hover:ring-indigo-300 dark:hover:ring-indigo-700"
                } focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span aria-hidden className="text-xl leading-none">
                    {card.icon}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      focused
                        ? "text-indigo-700 dark:text-indigo-200"
                        : "text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    {card.label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                  {card.hint}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2 flex-wrap">
          <span>
            <kbd className="font-mono">↑↓←→</kbd> Navigate ·{" "}
            <kbd className="font-mono">Enter</kbd> Create ·{" "}
            <kbd className="font-mono">Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
