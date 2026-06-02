/**
 * InboxPage
 * =========
 * Two-pane direct messaging surface. Left rail = thread list (other
 * participant + last message snippet + unread badge). Right pane = nested
 * `<Outlet />` for `/inbox/:threadId` (ThreadView). When no thread is
 * selected, the right pane shows a placeholder hint.
 *
 * Available to both staff (mounted under StaffShell) and students (mounted
 * inside StudentShell). RLS handles authz — both roles share the same UI.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useProfile } from "../lib/profile";
import { inboxThreadPath } from "../lib/routes";
import { NewThreadModal } from "./NewThreadModal";
import { useThreads } from "./useThreads";
import { EmptyState } from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toast";
import { KebabMenu } from "../components/KebabMenu";

// Per-user localStorage key for muted thread IDs.
const mutedThreadsKey = (userId: string): string =>
  `inbox.mutedThreads:${userId}`;

// Per-user localStorage key for pinned thread IDs.
const pinnedThreadsKey = (userId: string): string =>
  `inbox.pinnedThreads:${userId}`;

// LRU cap — generous; users rarely mute / pin that many threads. When
// exceeded, we drop the oldest entries (front of the array).
const MUTED_THREADS_CAP = 500;
const PINNED_THREADS_CAP = 500;

/**
 * Read the muted-thread set from localStorage. Returns a plain Set for O(1)
 * lookup. Shape-validates (must be an array of strings); any quota / JSON /
 * shape error is swallowed and treated as "no muted threads".
 */
function readMutedThreads(userId: string | null): Set<string> {
  if (!userId) return new Set();
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(mutedThreadsKey(userId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const ids: string[] = [];
    for (const v of parsed) {
      if (typeof v === "string") ids.push(v);
    }
    return new Set(ids);
  } catch {
    return new Set();
  }
}

/**
 * Persist the muted-thread set. Enforces the LRU cap by keeping the most
 * recent entries (set insertion order is preserved). Swallows quota errors.
 */
function writeMutedThreads(userId: string, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    let arr = Array.from(ids);
    if (arr.length > MUTED_THREADS_CAP) {
      arr = arr.slice(arr.length - MUTED_THREADS_CAP);
    }
    window.localStorage.setItem(mutedThreadsKey(userId), JSON.stringify(arr));
  } catch {
    // Quota exceeded or storage unavailable — silently drop. Muting is
    // best-effort UX state, not a contract we're failing.
  }
}

/**
 * Read the pinned-thread set from localStorage. Mirrors readMutedThreads:
 * shape-validates and swallows JSON / quota errors.
 */
function readPinnedThreads(userId: string | null): Set<string> {
  if (!userId) return new Set();
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(pinnedThreadsKey(userId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const ids: string[] = [];
    for (const v of parsed) {
      if (typeof v === "string") ids.push(v);
    }
    return new Set(ids);
  } catch {
    return new Set();
  }
}

/**
 * Persist the pinned-thread set. LRU cap matches the mute pattern. Swallows
 * quota / storage errors — pinning is best-effort UX state.
 */
function writePinnedThreads(userId: string, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    let arr = Array.from(ids);
    if (arr.length > PINNED_THREADS_CAP) {
      arr = arr.slice(arr.length - PINNED_THREADS_CAP);
    }
    window.localStorage.setItem(pinnedThreadsKey(userId), JSON.stringify(arr));
  } catch {
    // Quota exceeded or storage unavailable — silently drop.
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatStamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString();
}

export function InboxPage() {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const { threadId } = useParams<{ threadId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUserId = profile?.id ?? null;
  const { threads, loading, error, refresh } = useThreads(currentUserId);
  const [showNew, setShowNew] = useState(false);
  const [composing, setComposing] = useState(false);
  const composeConsumedRef = useRef<string | null>(null);
  const toast = useToast();
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // Keyboard cursor across the thread list. -1 = no highlight.
  // This is separate from the "currently open" thread (driven by URL/threadId)
  // — the highlight is a navigation cursor; opening still requires Enter/click.
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  // Track whether the user is actively typing in the search input — if so,
  // we don't yank the highlight back to index 0 on every keystroke (jarring).
  const searchFocusedRef = useRef<boolean>(false);

  // Muted thread set (per-user, persisted to localStorage). Muted threads
  // stay in their normal sort position but hide their unread badge and
  // de-emphasize the row body — the message is still delivered, just quiet.
  const [mutedThreads, setMutedThreads] = useState<Set<string>>(() =>
    readMutedThreads(currentUserId),
  );

  // Re-hydrate when the user changes (login, profile switch).
  useEffect(() => {
    setMutedThreads(readMutedThreads(currentUserId));
  }, [currentUserId]);

  // Cross-tab sync — mirror the pattern from Round 25 notification preferences.
  // Listen for `storage` events on the muted-set key and re-hydrate from
  // localStorage so a mute in one tab reflects in others.
  useEffect(() => {
    if (!currentUserId) return;
    if (typeof window === "undefined") return;
    const key = mutedThreadsKey(currentUserId);
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== key) return;
      setMutedThreads(readMutedThreads(currentUserId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [currentUserId]);

  const toggleMuted = useCallback(
    (threadId: string): void => {
      if (!currentUserId) return;
      setMutedThreads((prev) => {
        const next = new Set(prev);
        let wasMuted: boolean;
        if (next.has(threadId)) {
          next.delete(threadId);
          wasMuted = true;
        } else {
          next.add(threadId);
          wasMuted = false;
        }
        writeMutedThreads(currentUserId, next);
        // Transient feedback — confirmations belong in toasts, per the bar.
        if (wasMuted) {
          toast.info("Conversation unmuted");
        } else {
          toast.info("Conversation muted");
        }
        return next;
      });
    },
    [currentUserId, toast],
  );

  // Pinned thread set (per-user, persisted to localStorage). Pinned threads
  // float to the top of the list, sorted among themselves by last_message_at
  // desc. Pin and Mute are orthogonal — a thread can be both.
  const [pinnedThreads, setPinnedThreads] = useState<Set<string>>(() =>
    readPinnedThreads(currentUserId),
  );

  // Re-hydrate when the user changes (login, profile switch).
  useEffect(() => {
    setPinnedThreads(readPinnedThreads(currentUserId));
  }, [currentUserId]);

  // Cross-tab sync — same pattern as muted-set above.
  useEffect(() => {
    if (!currentUserId) return;
    if (typeof window === "undefined") return;
    const key = pinnedThreadsKey(currentUserId);
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== key) return;
      setPinnedThreads(readPinnedThreads(currentUserId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [currentUserId]);

  const togglePinned = useCallback(
    (threadId: string): void => {
      if (!currentUserId) return;
      setPinnedThreads((prev) => {
        const next = new Set(prev);
        let wasPinned: boolean;
        if (next.has(threadId)) {
          next.delete(threadId);
          wasPinned = true;
        } else {
          next.add(threadId);
          wasPinned = false;
        }
        writePinnedThreads(currentUserId, next);
        if (wasPinned) {
          toast.info("Conversation unpinned");
        } else {
          toast.info("Conversation pinned");
        }
        return next;
      });
    },
    [currentUserId, toast],
  );

  // Focus shortcut: "/" focuses the inbox search (GitHub/Vercel convention).
  // We deliberately avoid ⌘K — that's owned globally by CommandPalette
  // (StaffShell / StudentShell call preventDefault on it). "/" is gated on
  // non-editable targets so it doesn't hijack typing in the right pane.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Strip HTML tags for case-insensitive snippet matching (snippets may
  // contain rich-text markup from the TipTap editor).
  //
  // Pin-aware sort: pinned threads float to the top of the visible list
  // (sorted among themselves by last_message_at desc — the upstream order is
  // already last_message_at desc, so we just partition without re-sorting).
  // Search/filter still applies independently of pin state — pinned threads
  // can be filtered out by search, and when searching they remain at the top
  // of the result set.
  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? threads.filter((t) => {
          const name = (t.other.display_name ?? t.other.email ?? "")
            .toLowerCase();
          const snippet = (t.last_message_snippet ?? "")
            .replace(/<[^>]*>/g, "")
            .toLowerCase();
          return name.includes(q) || snippet.includes(q);
        })
      : threads;
    if (pinnedThreads.size === 0) return base;
    // Stable partition preserves upstream last_message_at desc within each group.
    const pinned = base.filter((t) => pinnedThreads.has(t.id));
    const rest = base.filter((t) => !pinnedThreads.has(t.id));
    return [...pinned, ...rest];
  }, [threads, query, pinnedThreads]);

  // Index of the first unpinned row (used to render the slate group divider).
  // -1 when divider shouldn't show (no pinned, or no unpinned).
  const firstUnpinnedIndex = useMemo(() => {
    if (pinnedThreads.size === 0) return -1;
    const idx = filteredThreads.findIndex((t) => !pinnedThreads.has(t.id));
    // Divider needs both a pinned group and an unpinned group to mean
    // anything. idx === 0 means everything is unpinned (no pin in view).
    if (idx <= 0) return -1;
    return idx;
  }, [filteredThreads, pinnedThreads]);

  // Default highlight on mount / when threads first arrive: pick the
  // currently-open thread (from URL) if it's still in filteredThreads, else
  // index 0. We only run this when highlight is unset OR list shape changed
  // such that the old index no longer points at a valid row.
  useEffect(() => {
    if (filteredThreads.length === 0) {
      if (highlightedIndex !== -1) setHighlightedIndex(-1);
      return;
    }
    // First-time mount: seed from URL or to first row.
    if (highlightedIndex === -1) {
      if (threadId) {
        const idx = filteredThreads.findIndex((t) => t.id === threadId);
        setHighlightedIndex(idx >= 0 ? idx : 0);
      } else {
        setHighlightedIndex(0);
      }
      return;
    }
    // Clamp into range when list shrinks. Don't yank during active search typing.
    if (highlightedIndex >= filteredThreads.length) {
      setHighlightedIndex(searchFocusedRef.current ? 0 : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredThreads, threadId]);

  // Auto-scroll the highlighted row into view when it changes.
  useEffect(() => {
    if (highlightedIndex < 0) return;
    const el = rowRefs.current[highlightedIndex];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  const openHighlighted = useCallback(() => {
    if (highlightedIndex < 0 || highlightedIndex >= filteredThreads.length) {
      return;
    }
    const t = filteredThreads[highlightedIndex];
    if (t) navigate(inboxThreadPath(t.id));
  }, [filteredThreads, highlightedIndex, navigate]);

  // Keyboard shortcuts: ↑/↓/Home/End/Enter/Esc on the list container.
  // Gated so we never steal keystrokes from inputs / textareas / contenteditable
  // (which includes the right-pane TipTap composer and the search input).
  // `/` is intentionally NOT handled here — the existing window-level handler
  // owns it and works from any non-editable focus target.
  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (filteredThreads.length === 0) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setHighlightedIndex((i) =>
            i < 0 ? 0 : (i + 1) % filteredThreads.length,
          );
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setHighlightedIndex((i) => {
            if (i < 0) return filteredThreads.length - 1;
            return (i - 1 + filteredThreads.length) % filteredThreads.length;
          });
          break;
        }
        case "Home": {
          e.preventDefault();
          setHighlightedIndex(0);
          break;
        }
        case "End": {
          e.preventDefault();
          setHighlightedIndex(filteredThreads.length - 1);
          break;
        }
        case "Enter": {
          e.preventDefault();
          openHighlighted();
          break;
        }
        case "Escape": {
          // Only clear list-side highlight; the right-pane handles its own Esc.
          // If a thread is OPEN (threadId in URL), we don't fight that — we just
          // clear the keyboard cursor. If no thread open, same: drop the cursor.
          if (highlightedIndex >= 0) {
            setHighlightedIndex(-1);
            // Keep focus on the list container so ↑/↓ can re-seed.
            listContainerRef.current?.focus();
          }
          break;
        }
        default:
          break;
      }
    },
    [filteredThreads.length, highlightedIndex, openHighlighted],
  );

  // Consume ?compose=<userId>: open (or create) the thread with that user and
  // navigate straight to it. Strips the param so refresh doesn't re-fire.
  useEffect(() => {
    const composeUserId = searchParams.get("compose");
    if (!composeUserId) return;
    if (!currentUserId) return; // wait until profile is ready
    if (composeConsumedRef.current === composeUserId) return; // already handled
    composeConsumedRef.current = composeUserId;

    const stripParam = () => {
      const next = new URLSearchParams(searchParams);
      next.delete("compose");
      setSearchParams(next, { replace: true });
    };

    const failNotFound = () => {
      toast.error("Couldn't find that user");
      stripParam();
      setComposing(false);
    };

    if (!UUID_RE.test(composeUserId)) {
      failNotFound();
      return;
    }
    if (composeUserId === currentUserId) {
      failNotFound();
      return;
    }

    let cancelled = false;
    setComposing(true);
    (async () => {
      try {
        // Resolve the recipient profile — fails (0 rows) if user doesn't exist
        // or RLS blocks visibility.
        const { data: profileRow, error: profileErr } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .eq("id", composeUserId)
          .maybeSingle();
        if (cancelled) return;
        if (profileErr || !profileRow) {
          failNotFound();
          return;
        }
        // open_thread_with returns the canonical thread id — existing or new.
        const { data: openedThreadId, error: rpcErr } = await supabase.rpc(
          "open_thread_with",
          { p_other_user_id: composeUserId },
        );
        if (cancelled) return;
        if (rpcErr || typeof openedThreadId !== "string") {
          toast.error(
            "Couldn't open conversation",
            rpcErr?.message ?? undefined,
          );
          stripParam();
          setComposing(false);
          return;
        }
        stripParam();
        setComposing(false);
        void refresh();
        navigate(inboxThreadPath(openedThreadId), { replace: true });
      } catch (err: unknown) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Something went wrong.";
        toast.error("Couldn't open conversation", msg);
        stripParam();
        setComposing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams, currentUserId, navigate, refresh, toast]);

  return (
    <div className="flex h-screen bg-white dark:bg-slate-950">
      {/* Left rail — on mobile, hidden when a thread is open */}
      <aside
        className={`${threadId ? "hidden sm:flex" : "flex"} w-full sm:w-72 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 flex-col`}
      >
        <header className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Inbox
          </h1>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5"
          >
            New
          </button>
        </header>
        {/* Search — client-side filter over the already-loaded thread list.
            Query is intentionally not persisted: it's transient session state. */}
        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800">
          <div className="relative">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
            >
              <circle
                cx="9"
                cy="9"
                r="6"
                stroke="currentColor"
                strokeWidth="1.75"
              />
              <path
                d="m17 17-3.5-3.5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                searchFocusedRef.current = true;
              }}
              onBlur={() => {
                searchFocusedRef.current = false;
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              placeholder="Search conversations…"
              aria-label="Search conversations"
              title="Press / to focus"
              className="w-full min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 motion-safe:transition-colors"
            />
          </div>
          {/* Discoverability hint — desktop only; tap-only on mobile doesn't need it. */}
          <p
            aria-hidden="true"
            className="hidden sm:block mt-1.5 text-[10px] text-slate-500 dark:text-slate-400 leading-tight"
          >
            <kbd className="font-sans">↑↓</kbd> Navigate ·{" "}
            <kbd className="font-sans">Enter</kbd> Open ·{" "}
            <kbd className="font-sans">/</kbd> Search
          </p>
        </div>
        <div
          ref={listContainerRef}
          tabIndex={0}
          onKeyDown={onListKeyDown}
          className="flex-1 overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
        >
          {loading && (
            <div className="px-3 py-3">
              <SkeletonRows count={6} rowClassName="h-14" />
            </div>
          )}
          {error && (
            <p className="px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          {!loading && !error && threads.length === 0 && (
            <EmptyState
              title="No conversations yet"
              body="Start a message with a teacher or classmate to begin a thread."
              cta={{ label: "Start a message", onClick: () => setShowNew(true) }}
            />
          )}
          {!loading &&
            !error &&
            threads.length > 0 &&
            filteredThreads.length === 0 && (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No conversations match &ldquo;{query.trim()}&rdquo;
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    searchInputRef.current?.focus();
                  }}
                  className="mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Clear search
                </button>
              </div>
            )}
          {filteredThreads.length > 0 && (
            <ul role="listbox" aria-label="Conversations" className="list-none">
              {filteredThreads.map((t, idx) => {
                const name =
                  t.other.display_name ?? t.other.email ?? "Unknown";
                const isHighlighted = idx === highlightedIndex;
                const isOpen = t.id === threadId;
                const isMuted = mutedThreads.has(t.id);
                const isPinned = pinnedThreads.has(t.id);
                // Hide the unread badge when muted — the conversation
                // continues to receive messages, it just doesn't shout.
                const showUnreadBadge = !isMuted && t.unread_count > 0;
                // Divider sits BEFORE the first unpinned row when both groups
                // are non-empty. Keep it as a sibling <li> with role="separator"
                // so screen readers announce the group break without
                // confusing the listbox's option indexing for keyboard nav
                // (which still uses filteredThreads indices unchanged).
                const showDivider = idx === firstUnpinnedIndex;
                return (
                  <Fragment key={t.id}>
                  {showDivider && (
                    <li
                      role="separator"
                      aria-label="Pinned conversations"
                      className="px-4 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40"
                    >
                      <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-500">
                        Other
                      </span>
                    </li>
                  )}
                  <li
                    role="option"
                    aria-selected={isHighlighted}
                    onMouseEnter={() => {
                      // Keep keyboard + mouse cursors in sync so the user
                      // doesn't see two competing highlights.
                      if (idx !== highlightedIndex) setHighlightedIndex(idx);
                    }}
                    className={[
                      "group relative border-b border-slate-100 dark:border-slate-800 motion-safe:transition-colors",
                      // Pin accent — decorative left border. The keyboard
                      // cursor's ring (below) takes visual precedence when
                      // both apply, so we keep this subtle (border, not ring).
                      isPinned
                        ? "border-l-2 border-l-indigo-400 dark:border-l-indigo-500"
                        : "",
                      isOpen
                        ? "bg-indigo-50 dark:bg-indigo-950/40"
                        : isHighlighted
                          ? "bg-indigo-50/60 dark:bg-indigo-950/30 ring-1 ring-inset ring-slate-300 dark:ring-slate-600"
                          : "hover:bg-slate-50 dark:hover:bg-slate-900",
                    ].join(" ")}
                  >
                    <NavLink
                      ref={(el) => {
                        rowRefs.current[idx] = el;
                      }}
                      to={inboxThreadPath(t.id)}
                      className={[
                        // Pad the right edge so the kebab (~40px tap target,
                        // absolutely positioned) doesn't visually overlap row text.
                        "block pl-4 pr-12 py-3 motion-safe:transition-opacity",
                        isMuted ? "opacity-70" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={[
                            "text-sm font-medium truncate flex items-center gap-1.5",
                            isMuted
                              ? "text-slate-600 dark:text-slate-400"
                              : "text-slate-900 dark:text-slate-100",
                          ].join(" ")}
                        >
                          <span className="truncate">{name}</span>
                          {isPinned && (
                            // Pin icon — small inline SVG. Indigo so it
                            // reads as a deliberate marker rather than
                            // chrome. <title> for SR announcement.
                            <svg
                              viewBox="0 0 20 20"
                              fill="none"
                              aria-hidden="false"
                              role="img"
                              className="h-3.5 w-3.5 flex-shrink-0 text-indigo-500 dark:text-indigo-400"
                            >
                              <title>Pinned</title>
                              <path
                                d="M12.5 2.5 17.5 7.5M11 4 4 11l-1.5 4.5L7 14l7-7M7 14l-3.5 3.5"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                          {isMuted && (
                            // Bell-slash icon — small inline SVG.
                            // Slate by default, indigo on row hover. Has
                            // <title> so screen readers announce "Muted".
                            <svg
                              viewBox="0 0 20 20"
                              fill="none"
                              aria-hidden="false"
                              role="img"
                              className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 group-hover:text-indigo-500 dark:text-slate-500 dark:group-hover:text-indigo-400 motion-safe:transition-colors"
                            >
                              <title>Muted</title>
                              <path
                                d="M5.5 8a4.5 4.5 0 0 1 7.4-3.46M14.5 9.2V10c0 1.5.6 2.4 1.2 3 .4.4.1 1-.4 1H6.4M8 16.5a2 2 0 0 0 4 0M3 3l14 14"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </p>
                        <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                          {formatStamp(t.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-slate-500 truncate">
                          {/* Snippet may include HTML now that messages are rich; strip tags for the inline preview. */}
                          {t.last_message_snippet ? (
                            t.last_message_snippet.replace(/<[^>]*>/g, "")
                          ) : (
                            <em>No messages yet</em>
                          )}
                        </p>
                        {showUnreadBadge && (
                          <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-semibold">
                            {t.unread_count}
                          </span>
                        )}
                      </div>
                    </NavLink>
                    {/* Kebab — absolutely positioned at the right edge so it
                        layers above the NavLink (nested interactive elements
                        would be invalid). Always visible on touch / mobile;
                        on desktop fades in on row hover or when the kebab
                        itself has focus (keyboard discoverability). */}
                    <div
                      className="absolute right-2 top-1/2 -translate-y-1/2 opacity-100 sm:opacity-0 group-hover:sm:opacity-100 focus-within:sm:opacity-100 motion-safe:transition-opacity"
                      // Don't propagate to the <li> (which would steal the
                      // highlight index) or the NavLink (which would navigate).
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Thread actions for ${name}`}
                    >
                      <KebabMenu
                        options={[
                          {
                            label: isPinned ? "Unpin" : "Pin",
                            hint: isPinned
                              ? "Remove from the top of the inbox"
                              : "Keep this conversation at the top of the inbox",
                            onSelect: () => togglePinned(t.id),
                          },
                          {
                            label: isMuted ? "Unmute" : "Mute",
                            hint: isMuted
                              ? "Restore notifications for this conversation"
                              : "Suppress notifications for this conversation",
                            onSelect: () => toggleMuted(t.id),
                          },
                        ]}
                      />
                    </div>
                  </li>
                  </Fragment>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Right pane — on mobile, hidden when no thread is selected */}
      <section
        className={`${threadId ? "flex" : "hidden sm:flex"} flex-1 min-w-0 flex-col`}
      >
        {threadId ? (
          <>
            <div className="sm:hidden px-4 py-2 border-b border-slate-200 dark:border-slate-800">
              <Link
                to="/inbox"
                className="inline-flex items-center text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                ← Back to inbox
              </Link>
            </div>
            <Outlet context={{ onMessageSent: refresh }} />
          </>
        ) : composing ? (
          <div
            className="flex-1 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400"
            role="status"
            aria-live="polite"
          >
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-indigo-600 animate-spin"
              />
              Opening conversation…
            </span>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
            Select a conversation to read.
          </div>
        )}
      </section>

      {showNew && currentUserId && (
        <NewThreadModal
          currentUserId={currentUserId}
          onClose={() => setShowNew(false)}
          onThreadOpened={(id) => {
            setShowNew(false);
            void refresh();
            navigate(inboxThreadPath(id));
          }}
        />
      )}

    </div>
  );
}
