/**
 * JoinClassModal
 * ==============
 * Single-input modal where a student enters a course join code. Submits via
 * the `join_course_by_code` RPC (SECURITY DEFINER) so the student never
 * touches `course_memberships` directly. Shows the joined course on success
 * and a clean, friendly error for each known RPC error code.
 *
 * Code format (per CLAUDE.md): 6 chars from the alphabet [A-Z2-9] — the
 * O/0/I/1/L confusables are excluded by the migration's short_code generator.
 * We mirror that alphabet here for live input scrubbing so a user can't even
 * type an invalid character. Paste handling extracts the first 6 valid
 * chars (stripping spaces, hyphens, or anything outside the alphabet).
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { ResponsiveModal } from "@/components";
import { studentCoursePath } from "@/lib/routes";

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

const CODE_LENGTH = 6;
// A–Z and 2–9 — matches the short_code alphabet from migrations 0038–0040.
const CODE_ALPHABET = /[A-Z2-9]/;
const CODE_ALPHABET_GLOBAL = /[A-Z2-9]/g;

/**
 * Scrub raw input/paste to a valid join code prefix:
 *  - upper-case any letters
 *  - drop anything outside the [A-Z2-9] alphabet (spaces, hyphens, O/0/I/1/L)
 *  - keep at most the first CODE_LENGTH chars
 */
function scrubCode(raw: string): string {
  const matches = raw.toUpperCase().match(CODE_ALPHABET_GLOBAL);
  if (!matches) return "";
  return matches.join("").slice(0, CODE_LENGTH);
}

function isCompleteCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (let i = 0; i < code.length; i += 1) {
    if (!CODE_ALPHABET.test(code.charAt(i))) return false;
  }
  return true;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong. Please try again.";
}

interface MappedError {
  message: string;
  /** When the error indicates an existing membership, the modal can offer "Open class". */
  alreadyJoinedCourseId?: string | null;
}

function mapRpcError(raw: string, response?: RpcRow | null): MappedError {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid_join_code")) {
    return {
      message:
        "We couldn't find a class with that code. Double-check it with your teacher.",
    };
  }
  if (lower.includes("already_joined") || lower.includes("already_enrolled")) {
    return {
      message: "You're already enrolled in this class.",
      alreadyJoinedCourseId: response?.id ?? null,
    };
  }
  if (lower.includes("rate_limited") || lower.includes("too_many")) {
    return {
      message: "Too many attempts. Please wait a minute and try again.",
    };
  }
  if (lower.includes("not_authenticated")) {
    return { message: "Your session expired. Please sign in again." };
  }
  return { message: "Could not join class. Please try again." };
}

export function JoinClassModal({ open, onClose, onJoined }: JoinClassModalProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const [joined, setJoined] = useState<JoinedClass | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setCode("");
    setError(null);
    setJoined(null);
  }, [open]);

  const complete = useMemo(() => isCompleteCode(code), [code]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complete || busy) return;
    setError(null);
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("join_course_by_code", {
        p_code: code,
      });
      if (rpcError) {
        const mapped = mapRpcError(rpcError.message);
        setError(mapped);
        toast.error("Couldn't join course", mapped.message);
        return;
      }
      // RPC returns SETOF row; we expect exactly one.
      const rows = (data ?? []) as RpcRow[];
      const first = rows[0];
      if (!first) {
        const mapped: MappedError = {
          message: "We couldn't confirm the course you joined. Try again.",
        };
        setError(mapped);
        toast.error("Couldn't join course", mapped.message);
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
      const mapped = mapRpcError(getErrorMessage(err));
      setError(mapped);
      toast.error("Couldn't join course", mapped.message);
    } finally {
      setBusy(false);
    }
  };

  const hintId = "join-class-format-hint";
  const errorId = "join-class-error";
  const formId = "join-class-form";

  const footer = joined ? (
    <button
      type="button"
      onClick={onClose}
      className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
    >
      Done
    </button>
  ) : (
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
        form={formId}
        disabled={busy || !complete}
        title={
          !complete
            ? "Enter the 6-character code your teacher shared"
            : undefined
        }
        className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
      >
        {busy ? "Joining…" : "Join course"}
      </button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title="Join a course"
      subtitle="Enter the 6-character code your teacher gave you."
      size="sm"
      footer={footer}
    >
      {joined ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 ring-1 ring-emerald-200 dark:ring-emerald-900">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
              You joined {joined.name}
            </p>
            {joined.teacher_display_name && (
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                Teacher: {joined.teacher_display_name}
              </p>
            )}
          </div>
        </div>
      ) : (
        <form id={formId} onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Course join code
            </span>
            <input
              data-autofocus
              type="text"
              value={code}
              onChange={(e) => setCode(scrubCode(e.target.value))}
              onPaste={(e) => {
                // Extract first CODE_LENGTH valid chars from the pasted blob,
                // stripping spaces, hyphens, and out-of-alphabet characters.
                const pasted = e.clipboardData.getData("text");
                if (pasted) {
                  e.preventDefault();
                  setCode(scrubCode(pasted));
                }
              }}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              inputMode="text"
              placeholder="A2C4E6"
              maxLength={CODE_LENGTH}
              aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
              aria-invalid={error ? true : undefined}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-3 text-slate-900 dark:text-slate-100 font-mono tracking-widest text-center uppercase text-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div
              id={hintId}
              aria-live="polite"
              className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400"
            >
              <span>
                {code.length === 0
                  ? "Enter a code"
                  : "Letters and numbers only (no O, 0, I, 1, or L)"}
              </span>
              <span
                className={
                  complete
                    ? "font-medium text-emerald-600 dark:text-emerald-400"
                    : ""
                }
              >
                {code.length} / {CODE_LENGTH}
              </span>
            </div>
          </label>

          {error && (
            <div
              id={errorId}
              role="alert"
              className="rounded-lg bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900 space-y-2"
            >
              <p>{error.message}</p>
              {error.alreadyJoinedCourseId && (
                <a
                  href={`#${studentCoursePath(error.alreadyJoinedCourseId)}`}
                  onClick={onClose}
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-100 dark:bg-rose-900/60 px-2 py-1 text-xs font-medium text-rose-800 dark:text-rose-200 hover:bg-rose-200 dark:hover:bg-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  Open class →
                </a>
              )}
            </div>
          )}
        </form>
      )}
    </ResponsiveModal>
  );
}
