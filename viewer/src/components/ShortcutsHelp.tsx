/**
 * ShortcutsHelp
 * =============
 * Global keyboard-shortcut discovery overlay for the LMS. Mounted by
 * StaffShell and StudentShell; opened with the `?` key (Shift+/) from
 * anywhere the user isn't typing in an input.
 *
 * This is the successor to the older `ShortcutHelpOverlay` — same family,
 * but with the up-to-date surface inventory (CommandPalette, QuickCreate,
 * sidebar toggle, calendar, inbox, notifications, modules drag) and a
 * role-gated content set. Staff get the staff-only sections; students get
 * the universal ones plus their own.
 *
 * Modal contract (per CLAUDE.md):
 *   - role="dialog", aria-modal="true", aria-labelledby
 *   - useFocusTrap wired
 *   - Top-right × (≥40px) with aria-label
 *   - Esc closes; backdrop click closes via onMouseDown + stopPropagation
 *     on the panel (so a drag-select inside the panel doesn't trigger
 *     close-on-mouseup-outside)
 *   - Dark mode parity
 */
import { useEffect, useRef, type ReactNode } from "react";
import { useFocusTrap } from "@/hooks";

export type ShortcutsHelpRole = "student" | "teacher" | "admin";

export interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
  /**
   * Used to gate staff-only sections (Modules drag/reorder, course-scoped
   * Quick Create). Pass the user's profile role; default is `"student"`
   * so a missing role hides the staff-only groups.
   */
  userRole?: ShortcutsHelpRole | null;
}

interface ShortcutRow {
  /** Key combo(s) to render as <kbd> chips, in display order. */
  keys: string[];
  /** Optional human-readable separator between chips (e.g. "or"). */
  description: string;
}

interface ShortcutSection {
  title: string;
  /** Hide entire section when false. Used for role gating. */
  show?: boolean;
  rows: ShortcutRow[];
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className={[
        "inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5",
        "text-[11px] font-mono font-medium",
        "rounded-md bg-slate-50 dark:bg-slate-800",
        "ring-1 ring-slate-200 dark:ring-slate-700",
        "text-slate-700 dark:text-slate-200",
        "shadow-[0_1px_0_0_rgba(15,23,42,0.05)]",
      ].join(" ")}
    >
      {children}
    </kbd>
  );
}

function KeyCombo({ keys }: { keys: string[] }) {
  // Render each chip; no separator between adjacent chips (e.g. ⌘+K reads as
  // two adjacent keys). The whitespace gap-1 handles visual separation.
  return (
    <span className="flex flex-shrink-0 items-center gap-1">
      {keys.map((k, i) => (
        <Kbd key={i}>{k}</Kbd>
      ))}
    </span>
  );
}

export function ShortcutsHelp({
  open,
  onClose,
  userRole = "student",
}: ShortcutsHelpProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);

  // Local Esc-to-close. Defensive — the shell's `?` listener swallows the
  // open keystroke, and useFocusTrap doesn't itself handle Esc.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isStaff = userRole === "teacher" || userRole === "admin";

  const sections: ShortcutSection[] = [
    {
      title: "Global",
      rows: [
        { keys: ["⌘", "K"], description: "Open command palette (macOS)" },
        { keys: ["Ctrl", "K"], description: "Open command palette (Win / Linux)" },
        { keys: ["⌘", "B"], description: "Toggle sidebar (macOS)" },
        { keys: ["Ctrl", "B"], description: "Toggle sidebar (Win / Linux)" },
        { keys: ["?"], description: "Show this help dialog" },
        { keys: ["Esc"], description: "Close dialog or popover" },
      ],
    },
    {
      title: "Inside courses",
      show: isStaff,
      rows: [
        {
          keys: ["⌘", "N"],
          description: "Quick create (Assignment / Announcement / Discussion / Material)",
        },
      ],
    },
    {
      title: "Calendar",
      rows: [
        { keys: ["←"], description: "Previous month" },
        { keys: ["→"], description: "Next month" },
        { keys: ["T"], description: "Jump to today" },
        { keys: ["M"], description: "Month view" },
        { keys: ["L"], description: "List view" },
      ],
    },
    {
      title: "Inbox",
      rows: [
        { keys: ["/"], description: "Focus search" },
        { keys: ["↑"], description: "Previous thread" },
        { keys: ["↓"], description: "Next thread" },
        { keys: ["Enter"], description: "Open highlighted thread" },
        { keys: ["Esc"], description: "Clear keyboard cursor" },
      ],
    },
    {
      title: "Notifications dropdown",
      rows: [
        { keys: ["↑"], description: "Previous notification" },
        { keys: ["↓"], description: "Next notification" },
        { keys: ["Enter"], description: "Activate (mark read + navigate)" },
        { keys: ["M"], description: "Mark highlighted as read" },
        { keys: ["A"], description: "Mark all as read" },
        { keys: ["Home"], description: "Jump to first" },
        { keys: ["End"], description: "Jump to last" },
        { keys: ["Esc"], description: "Close dropdown" },
      ],
    },
    {
      title: "Modules page",
      show: isStaff,
      rows: [
        { keys: ["Alt", "↑"], description: "Move focused module up" },
        { keys: ["Alt", "↓"], description: "Move focused module down" },
        { keys: ["Esc"], description: "Blur the grip handle" },
      ],
    },
  ];

  const visibleSections = sections.filter((s) => s.show !== false);

  // Backdrop click handling: use onMouseDown rather than onClick so a
  // text drag-select that ends outside the panel doesn't fire close. The
  // panel itself stops propagation in its own onMouseDown.
  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={[
        "fixed inset-0 z-[100] flex items-center justify-center",
        "bg-slate-900/40 dark:bg-slate-950/60",
        "backdrop-blur-sm p-4 print:hidden",
        "motion-safe:transition-opacity",
      ].join(" ")}
      onMouseDown={handleBackdropMouseDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-help-title"
    >
      <div
        ref={panelRef}
        onMouseDown={(e) => e.stopPropagation()}
        className={[
          "w-full max-w-[560px] max-h-[80vh]",
          "rounded-2xl bg-white dark:bg-slate-900",
          "border-l-4 border-l-indigo-500 dark:border-l-indigo-400",
          "ring-1 ring-slate-200 dark:ring-slate-800",
          "shadow-2xl",
          "flex flex-col overflow-hidden",
        ].join(" ")}
      >
        <header className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0">
            <h2
              id="shortcuts-help-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Keyboard shortcuts
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Press <Kbd>?</Kbd> from anywhere to reopen this list.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-autofocus
            className={[
              "flex-shrink-0 inline-flex items-center justify-center",
              "h-10 w-10 rounded-lg",
              "text-slate-500 dark:text-slate-400",
              "hover:bg-slate-100 dark:hover:bg-slate-800",
              "hover:text-slate-900 dark:hover:text-slate-100",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
              "motion-safe:transition-colors",
            ].join(" ")}
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="overflow-y-auto px-6 py-5 grid gap-6 sm:grid-cols-2">
          {visibleSections.map((section) => {
            const headingId = `shortcuts-section-${section.title
              .toLowerCase()
              .replace(/\s+/g, "-")}`;
            return (
              <section
                key={section.title}
                aria-labelledby={headingId}
                className="break-inside-avoid"
              >
                <h3
                  id={headingId}
                  className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2"
                >
                  {section.title}
                </h3>
                <ul className="space-y-1">
                  {section.rows.map((row, idx) => (
                    <li
                      key={`${section.title}-${idx}`}
                      className="flex items-center justify-between gap-3 min-h-[40px] text-sm"
                    >
                      <span className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {row.description}
                      </span>
                      <KeyCombo keys={row.keys} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <footer className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between gap-3">
          <span>
            Tip: most inline edits save on <Kbd>Enter</Kbd> and cancel on{" "}
            <Kbd>Esc</Kbd>.
          </span>
          <span className="flex-shrink-0">
            Close: <Kbd>Esc</Kbd>
          </span>
        </footer>
      </div>
    </div>
  );
}
