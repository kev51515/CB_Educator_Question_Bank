/**
 * JoinClassModal
 * ==============
 * Single-input modal where a student enters a course join code. Submits via
 * the `join_class_by_code` RPC (SECURITY DEFINER) so the student never
 * touches `class_memberships` directly. Shows the joined course on success
 * and a clean error for `invalid_join_code`.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toast";
import { useFocusTrap } from "../hooks";

interface JoinedClass {
  id: string;
  name: string;
  description: string | null;
  join_code: string;
  teacher_display_name: string | null;
}

interface JoinClassModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful join so the parent can refresh its class list. */
  onJoined?: (joined: JoinedClass) => void;
}

interface RpcRow {
  id: string;
  name: string;
  description: string | null;
  join_code: string;
  teacher_display_name: string | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong. Please try again.";
}

function friendlyError(raw: string): string {
  // The RPC raises `invalid_join_code` for both unknown codes and empty
  // inputs. PostgREST surfaces the raw message; rewrite it for users.
  if (raw.toLowerCase().includes("invalid_join_code")) {
    return "That join code didn't match an active course. Double-check it with your teacher.";
  }
  if (raw.toLowerCase().includes("not_authenticated")) {
    return "Your session expired. Please sign in again.";
  }
  return raw;
}

export function JoinClassModal({ open, onClose, onJoined }: JoinClassModalProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<JoinedClass | null>(null);
  const toast = useToast();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    setCode("");
    setError(null);
    setJoined(null);
    // defer focus so the modal mount completes first
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Please enter a join code.");
      return;
    }
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("join_course_by_code", {
        p_code: trimmed,
      });
      if (rpcError) {
        const msg = friendlyError(rpcError.message);
        setError(msg);
        toast.error("Couldn't join course", msg);
        return;
      }
      // RPC returns SETOF row; we expect exactly one.
      const rows = (data ?? []) as RpcRow[];
      const first = rows[0];
      if (!first) {
        const msg = "We couldn't confirm the course you joined. Try again.";
        setError(msg);
        toast.error("Couldn't join course", msg);
        return;
      }
      const joinedClass: JoinedClass = {
        id: first.id,
        name: first.name,
        description: first.description,
        join_code: first.join_code,
        teacher_display_name: first.teacher_display_name,
      };
      setJoined(joinedClass);
      toast.success("Joined course", joinedClass.name);
      onJoined?.(joinedClass);
    } catch (err: unknown) {
      const msg = friendlyError(getErrorMessage(err));
      setError(msg);
      toast.error("Couldn't join course", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-class-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="space-y-1">
          <h2
            id="join-class-title"
            className="text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            Join a course
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Enter the join code your teacher gave you.
          </p>
        </header>

        {joined ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 ring-1 ring-emerald-200 dark:ring-emerald-900">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                You joined {joined.name}
              </p>
              {joined.teacher_display_name && (
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                  Teacher: {joined.teacher_display_name}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <div
                role="alert"
                className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
              >
                {error}
              </div>
            )}
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Course join code
              </span>
              <input
                ref={inputRef}
                data-autofocus
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder="ABCD-1234"
                maxLength={16}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-slate-900 dark:text-slate-100 font-mono tracking-widest text-center uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
              >
                {busy ? "Joining…" : "Join course"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
