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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const name = (t.other.display_name ?? t.other.email ?? "").toLowerCase();
      const snippet = (t.last_message_snippet ?? "")
        .replace(/<[^>]*>/g, "")
        .toLowerCase();
      return name.includes(q) || snippet.includes(q);
    });
  }, [threads, query]);

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
                return (
                  <li
                    key={t.id}
                    role="option"
                    aria-selected={isHighlighted}
                    onMouseEnter={() => {
                      // Keep keyboard + mouse cursors in sync so the user
                      // doesn't see two competing highlights.
                      if (idx !== highlightedIndex) setHighlightedIndex(idx);
                    }}
                  >
                    <NavLink
                      ref={(el) => {
                        rowRefs.current[idx] = el;
                      }}
                      to={inboxThreadPath(t.id)}
                      className={[
                        "block px-4 py-3 border-b border-slate-100 dark:border-slate-800 motion-safe:transition-colors",
                        isOpen
                          ? "bg-indigo-50 dark:bg-indigo-950/40"
                          : isHighlighted
                            ? "bg-indigo-50/60 dark:bg-indigo-950/30 ring-1 ring-inset ring-slate-300 dark:ring-slate-600"
                            : "hover:bg-slate-50 dark:hover:bg-slate-900",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {name}
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
                        {t.unread_count > 0 && (
                          <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-semibold">
                            {t.unread_count}
                          </span>
                        )}
                      </div>
                    </NavLink>
                  </li>
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
