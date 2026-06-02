/**
 * NewThreadModal
 * ==============
 * Recipient picker for starting a new 1:1 thread. The user types a name /
 * email fragment; we run an ilike search against `public.profiles` and let
 * them click a row. On click, we call the `open_thread_with(uuid)` RPC which
 * either returns the existing canonical thread id or creates a new one — then
 * navigate to `/inbox/:threadId`.
 *
 * The RPC enforces self-message prevention server-side, but we also filter
 * the local result list to hide the current user.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toast";
import { useFocusTrap } from "../hooks";

export interface NewThreadModalProps {
  currentUserId: string;
  onClose: () => void;
  onThreadOpened: (threadId: string) => void;
}

interface ProfileSearchRow {
  id: string;
  display_name: string | null;
  email: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong.";
}

export function NewThreadModal({
  currentUserId,
  onClose,
  onThreadOpened,
}: NewThreadModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);
  const toast = useToast();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const pattern = `%${trimmed}%`;
        const { data, error: err } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .or(`display_name.ilike.${pattern},email.ilike.${pattern}`)
          .limit(20);
        if (err) throw err;
        if (cancelled) return;
        const rows = ((data ?? []) as ProfileSearchRow[]).filter(
          (r) => r.id !== currentUserId,
        );
        setResults(rows);
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query, currentUserId]);

  const handlePick = async (otherUserId: string) => {
    setError(null);
    const picked = results.find((r) => r.id === otherUserId);
    const label = picked?.display_name ?? picked?.email;
    try {
      const { data, error: err } = await supabase.rpc("open_thread_with", {
        p_other_user_id: otherUserId,
      });
      if (err) throw err;
      if (typeof data !== "string") {
        throw new Error("Unexpected RPC response.");
      }
      toast.success("Conversation started", label);
      onThreadOpened(data);
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      setError(msg);
      toast.error("Couldn't start conversation", msg);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Start a new conversation"
      className="fixed inset-0 z-40 flex items-start justify-center bg-slate-900/40 px-4 pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 shadow-xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            New conversation
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 text-sm"
          >
            Close
          </button>
        </div>
        <div className="p-3 border-b border-slate-100 dark:border-slate-800">
          <input
            ref={inputRef}
            data-autofocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-indigo-400"
          />
        </div>
        <div className="max-h-72 overflow-y-auto">
          {error && (
            <p className="px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          {searching && (
            <p className="px-4 py-3 text-sm text-slate-500">Searching…</p>
          )}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">No matches.</p>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => void handlePick(r.id)}
              className="block w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                {r.display_name ?? r.email}
              </p>
              {r.display_name && (
                <p className="text-xs text-slate-500 truncate">{r.email}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
