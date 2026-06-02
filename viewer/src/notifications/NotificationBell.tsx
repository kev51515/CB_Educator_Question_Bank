/**
 * NotificationBell
 * ================
 * Compact bell button with an unread-count badge and a dropdown listing the 10
 * most recent notifications. Click a row to mark it read and navigate to its
 * link. A footer button marks all as read. Closes on outside click / Escape.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications, type NotificationRow } from "./useNotifications";

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.max(1, Math.floor((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * KindIcon
 * --------
 * Tiny 14×14 SVG glyph that hints at a notification's category. Unread rows
 * tint the icon indigo; read rows fade into the slate palette. Inline SVG so
 * we don't pull a new dependency.
 */
function KindIcon({ kind, unread }: { kind: string; unread: boolean }): JSX.Element {
  const tone = unread
    ? "text-indigo-500"
    : "text-slate-500 dark:text-slate-400";
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: `${tone} flex-shrink-0 mt-0.5`,
  };
  switch (kind) {
    case "announcement":
      // Megaphone
      return (
        <svg {...common}>
          <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
          <path d="M14 8a4 4 0 0 1 0 8" />
          <path d="M18 5a8 8 0 0 1 0 14" />
        </svg>
      );
    case "message":
      // Envelope
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      );
    case "feedback":
      // Speech bubble
      return (
        <svg {...common}>
          <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12z" />
        </svg>
      );
    case "assignment_grade":
      // Check-circle
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 3 3 5-6" />
        </svg>
      );
    case "reminder":
      // Clock
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    default:
      // Generic dot
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      );
  }
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState<boolean>(false);
  const [side, setSide] = useState<"left" | "right">("right");
  const [measured, setMeasured] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const top: NotificationRow[] = notifications.slice(0, 10);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Measure-and-flip: on open, decide which side to anchor to so the menu
  // never overflows the viewport. Until measured, render invisibly to avoid
  // a flicker on the wrong side.
  useEffect(() => {
    if (!open) {
      setMeasured(false);
      return;
    }
    const node = menuRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      setSide("left");
    } else {
      setSide("right");
    }
    setMeasured(true);
  }, [open]);

  const onItemClick = async (n: NotificationRow): Promise<void> => {
    setOpen(false);
    if (n.read_at === null) {
      await markRead(n.id);
    }
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={ref} className="relative inline-block print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        className="relative inline-flex items-center justify-center h-9 w-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
      >
        <svg
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold leading-[18px] text-center ring-2 ring-white dark:ring-slate-900"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={[
            "absolute mt-2 w-80 max-w-[calc(100vw-1.5rem)] max-h-[28rem] overflow-y-auto rounded-xl bg-white dark:bg-slate-900 shadow-xl ring-1 ring-slate-200 dark:ring-slate-700 z-50",
            side === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left",
            measured ? "" : "invisible",
          ].join(" ")}
        >
          <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Notifications
            </p>
            {unreadCount > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {unreadCount} unread
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void markAllRead();
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium inline-flex items-center justify-center min-h-[40px] px-2 -my-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  Mark all read
                </button>
              </div>
            )}
          </div>

          {top.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              You&apos;re all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {top.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void onItemClick(n);
                    }}
                    className={[
                      "w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition",
                      n.read_at === null ? "bg-indigo-50/40 dark:bg-indigo-950/20" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-2">
                      {n.read_at === null && (
                        <span
                          aria-hidden
                          className="mt-1.5 h-2 w-2 rounded-full bg-indigo-500 flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2.5">
                          <KindIcon kind={n.kind} unread={n.read_at === null} />
                          <p
                            title={n.title}
                            className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate min-w-0 flex-1"
                          >
                            {n.title}
                          </p>
                        </div>
                        {n.body && (
                          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {formatRelative(n.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-900">
            <button
              type="button"
              onClick={() => {
                void markAllRead();
              }}
              disabled={unreadCount === 0}
              className="w-full text-sm text-indigo-600 dark:text-indigo-400 hover:underline disabled:text-slate-400 disabled:hover:no-underline disabled:cursor-not-allowed py-2.5 md:py-1"
            >
              Mark all as read
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
