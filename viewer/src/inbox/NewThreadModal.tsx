/**
 * NewThreadModal
 * ==============
 * Recipient picker for starting a new 1:1 thread.
 *
 * Behavior (Wave 21 polish):
 *  - Empty query: show "Recent" section (localStorage-backed, max 10) on top,
 *    then an alphabetical eligible list (bounded to 50).
 *  - Non-empty query: ilike search across display_name and email on
 *    `public.profiles`; no Recent section.
 *  - Keyboard: ↑/↓ moves highlight, Enter opens, Esc closes. Search input is
 *    auto-focused on open.
 *  - On successful open: prepend the recipient id to the recents list (dedup,
 *    cap 10), then call onThreadOpened.
 *  - Recents are filtered against the currently visible eligible list — if a
 *    recent is no longer eligible (dropped course, deleted profile), it's
 *    silently hidden.
 *  - Tolerant to bad localStorage JSON / shape — falls back to empty recents.
 *
 * RPC: `open_thread_with(uuid)` returns the canonical thread id (existing or
 * created). RLS enforces self-message prevention; we also filter currentUser
 * out client-side.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { ResponsiveModal } from "@/components";

export interface NewThreadModalProps {
  currentUserId: string;
  onClose: () => void;
  onThreadOpened: (threadId: string) => void;
}

interface ProfileSearchRow {
  id: string;
  display_name: string | null;
  email: string;
  role?: string | null;
}

const RECENTS_CAP = 10;
const LIST_LIMIT = 50;

function recentsKey(userId: string): string {
  return `inbox.recentRecipients:${userId}`;
}

function readRecents(userId: string): string[] {
  try {
    const raw = localStorage.getItem(recentsKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    return valid.slice(0, RECENTS_CAP);
  } catch {
    return [];
  }
}

function writeRecents(userId: string, ids: string[]): void {
  try {
    localStorage.setItem(recentsKey(userId), JSON.stringify(ids));
  } catch {
    // quota / privacy mode — silently ignore
  }
}

function pushRecent(userId: string, id: string): void {
  const current = readRecents(userId);
  const next = [id, ...current.filter((x) => x !== id)].slice(0, RECENTS_CAP);
  writeRecents(userId, next);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong.";
}

function initialsFor(row: ProfileSearchRow): string {
  const base = (row.display_name ?? row.email).trim();
  if (!base) return "?";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  const r = role.toLowerCase();
  if (r === "student") return "Student";
  if (r === "teacher") return "Teacher";
  if (r === "admin") return "Admin";
  return null;
}

export function NewThreadModal({
  currentUserId,
  onClose,
  onThreadOpened,
}: NewThreadModalProps) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileSearchRow[]>([]);
  const [eligibleList, setEligibleList] = useState<ProfileSearchRow[]>([]);
  const [recentRows, setRecentRows] = useState<ProfileSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const toast = useToast();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load alphabetical eligible list + resolve recents against it.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from("profiles")
          .select("id, display_name, email, role")
          .neq("id", currentUserId)
          .order("display_name", { ascending: true, nullsFirst: false })
          .limit(LIST_LIMIT);
        if (err) throw err;
        if (cancelled) return;
        const rows = (data ?? []) as ProfileSearchRow[];
        setEligibleList(rows);

        // Resolve recents — only fetch the ones not already in eligibleList
        const recents = readRecents(currentUserId);
        if (recents.length === 0) {
          setRecentRows([]);
          return;
        }
        const byId = new Map(rows.map((r) => [r.id, r]));
        const missingIds = recents.filter((id) => !byId.has(id));
        let fetched: ProfileSearchRow[] = [];
        if (missingIds.length > 0) {
          const { data: extra, error: extraErr } = await supabase
            .from("profiles")
            .select("id, display_name, email, role")
            .in("id", missingIds);
          if (!extraErr && extra) {
            fetched = extra as ProfileSearchRow[];
          }
        }
        const lookup = new Map<string, ProfileSearchRow>([
          ...rows.map((r): [string, ProfileSearchRow] => [r.id, r]),
          ...fetched.map((r): [string, ProfileSearchRow] => [r.id, r]),
        ]);
        const ordered = recents
          .map((id) => lookup.get(id))
          .filter((r): r is ProfileSearchRow => Boolean(r) && r!.id !== currentUserId);
        setRecentRows(ordered);
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  // Search effect — only fires for non-empty query
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const pattern = `%${trimmed}%`;
        const { data, error: err } = await supabase
          .from("profiles")
          .select("id, display_name, email, role")
          .or(`display_name.ilike.${pattern},email.ilike.${pattern}`)
          .neq("id", currentUserId)
          .limit(20);
        if (err) throw err;
        if (cancelled) return;
        setSearchResults((data ?? []) as ProfileSearchRow[]);
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query, currentUserId]);

  // Compose the visible flat list (drives keyboard nav + render order).
  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;

  const visibleList: ProfileSearchRow[] = useMemo(() => {
    if (isSearching) return searchResults;
    return [...recentRows, ...eligibleList.filter((r) => !recentRows.some((rr) => rr.id === r.id))];
  }, [isSearching, searchResults, recentRows, eligibleList]);

  // Reset highlight when the visible list changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [trimmedQuery, visibleList.length]);

  const handlePick = useCallback(
    async (otherUserId: string) => {
      setError(null);
      const picked = visibleList.find((r) => r.id === otherUserId);
      const label = picked?.display_name ?? picked?.email;
      try {
        const { data, error: err } = await supabase.rpc("open_thread_with", {
          p_other_user_id: otherUserId,
        });
        if (err) throw err;
        if (typeof data !== "string") {
          throw new Error("Unexpected RPC response.");
        }
        pushRecent(currentUserId, otherUserId);
        toast.success("Conversation started", label);
        onThreadOpened(data);
      } catch (err: unknown) {
        const msg = getErrorMessage(err);
        setError(msg);
        toast.error("Couldn't start conversation", msg);
      }
    },
    [currentUserId, onThreadOpened, toast, visibleList],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (visibleList.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % visibleList.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i - 1 + visibleList.length) % visibleList.length);
    } else if (e.key === "Enter") {
      const target = visibleList[highlightIndex];
      if (target) {
        e.preventDefault();
        void handlePick(target.id);
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlightIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlightIndex(visibleList.length - 1);
    }
  };

  // Scroll highlighted row into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(
      `[data-row-index="${highlightIndex}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  const renderRow = (row: ProfileSearchRow, flatIndex: number) => {
    const isHighlighted = flatIndex === highlightIndex;
    const role = roleLabel(row.role);
    return (
      <button
        key={row.id}
        type="button"
        data-row-index={flatIndex}
        onClick={() => void handlePick(row.id)}
        onMouseEnter={() => setHighlightIndex(flatIndex)}
        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left motion-safe:transition-colors min-h-[44px] ${
          isHighlighted
            ? "bg-indigo-50 dark:bg-indigo-500/10"
            : "hover:bg-slate-50 dark:hover:bg-slate-800"
        }`}
      >
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
        >
          {initialsFor(row)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
              {row.display_name ?? row.email}
            </span>
            {role && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {role}
              </span>
            )}
          </span>
          {row.display_name && (
            <span className="truncate text-xs text-slate-500 dark:text-slate-400">
              {row.email}
            </span>
          )}
        </span>
      </button>
    );
  };

  // Compute index offsets for sectioned rendering so keyboard nav stays aligned
  const recentsToShow = isSearching ? [] : recentRows;
  const alphaToShow = isSearching
    ? searchResults
    : eligibleList.filter((r) => !recentsToShow.some((rr) => rr.id === r.id));

  return (
    <ResponsiveModal
      open={true}
      onClose={onClose}
      title="New conversation"
      size="md"
    >
      <div onKeyDown={onKeyDown} className="-mx-5 -my-4">
        <div className="border-b border-slate-100 p-3 dark:border-slate-800">
          <input
            ref={inputRef}
            data-autofocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            aria-label="Search by name or email"
            className="w-full rounded-lg bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-200 focus:outline-none focus:ring-indigo-400 dark:bg-slate-950 dark:text-slate-100 dark:ring-slate-700"
          />
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {error && (
            <p
              role="alert"
              className="px-4 py-3 text-sm text-rose-600 dark:text-rose-400"
            >
              {error}
            </p>
          )}

          {/* Empty states */}
          {!error && !loading && visibleList.length === 0 && (
            <div className="px-4 py-8 text-center">
              {isSearching ? (
                <>
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    No one matches “{trimmedQuery}”
                  </p>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700 motion-safe:transition-colors dark:text-indigo-300 dark:hover:text-indigo-200"
                  >
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    No one to message yet
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Once you share a course with someone, they'll show up here.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Loading skeleton (only when we have nothing to show yet) */}
          {!error && loading && visibleList.length === 0 && (
            <div aria-busy="true" className="space-y-2 px-4 py-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 py-1"
                >
                  <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-800" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-2.5 w-1/2 rounded bg-slate-100 dark:bg-slate-800/60" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sectioned list */}
          {!error && visibleList.length > 0 && (
            <>
              {recentsToShow.length > 0 && (
                <>
                  <div className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Recent
                  </div>
                  {recentsToShow.map((row, i) => renderRow(row, i))}
                </>
              )}
              {alphaToShow.length > 0 && (
                <>
                  {!isSearching && recentsToShow.length > 0 && (
                    <div className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      All contacts
                    </div>
                  )}
                  {alphaToShow.map((row, i) =>
                    renderRow(row, recentsToShow.length + i),
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}
