/**
 * ResetStudentPasswordModal
 * =========================
 * Reset the password for a teacher-managed student (managed=true). The old
 * password is unrecoverable (bcrypt-hashed), so this generates/accepts a new
 * one and, on success, shows it once with copy. Calls
 * `admin_reset_student_password`, which is gated server-side to managed
 * accounts the caller teaches.
 *
 * Follows the modal contract (role=dialog, focus trap, ×, Esc, backdrop).
 */
import { useCallback, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toast";
import { useEscapeKey, useFocusTrap } from "../hooks";
import { studentLoginUrl } from "../lib/routes";

interface ResetStudentPasswordModalProps {
  studentId: string;
  studentName: string;
  loginCode: string | null;
  onClose: () => void;
}

const ADJECTIVES = [
  "brave", "calm", "clever", "eager", "gentle", "happy", "jolly", "kind",
  "lucky", "merry", "nimble", "proud", "quick", "swift", "warm", "wise",
];
const NOUNS = [
  "otter", "falcon", "maple", "river", "comet", "harbor", "willow", "cedar",
  "pebble", "meadow", "lantern", "summit", "anchor", "garden", "beacon", "harvest",
];

function generatePassword(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const d = String(Math.floor(Math.random() * 90) + 10);
  return `${a}-${n}-${d}`;
}

function mapRpcError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("not_authorized")) return "You don't have permission to reset this student's password.";
  if (m.includes("not_managed")) return "This is a self-signup account — they reset their own password from the sign-in screen.";
  if (m.includes("weak_password")) return "Password must be at least 6 characters.";
  if (m.includes("student_not_found")) return "This student no longer exists.";
  return raw.split("\n")[0]?.trim() || "Couldn't reset the password.";
}

export function ResetStudentPasswordModal({
  studentId,
  studentName,
  loginCode,
  onClose,
}: ResetStudentPasswordModalProps) {
  const toast = useToast();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);

  const [password, setPassword] = useState<string>(() => generatePassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEscapeKey(() => {
    if (!busy) onClose();
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.trim().length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc("admin_reset_student_password", {
        p_student_id: studentId,
        p_password: password,
      });
      if (rpcError) {
        setError(mapRpcError(rpcError.message));
        return;
      }
      setDone(true);
      toast.success(`Password reset for ${studentName}`);
    } catch {
      setError("Couldn't reset the password.");
    } finally {
      setBusy(false);
    }
  };

  const onCopy = useCallback(async () => {
    const text = loginCode
      ? `Login code: ${loginCode}\nPassword: ${password}`
      : `Password: ${password}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy", "Select the text manually.");
    }
  }, [loginCode, password, toast]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-pw-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="reset-pw-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Reset password
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {studentName}
              {loginCode ? (
                <>
                  {" · "}
                  <span className="font-mono">{loginCode}</span>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!busy) onClose();
            }}
            aria-label="Close"
            className="rounded-md inline-flex items-center justify-center min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 md:p-1 -mt-1 -mr-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 flex-none"
          >
            ✕
          </button>
        </header>

        {done ? (
          <div className="space-y-4">
            <div className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-700 px-4 py-3 bg-white dark:bg-slate-900">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-500">
                New password
              </p>
              <p className="font-mono text-base font-semibold text-slate-900 dark:text-slate-100 break-all">
                {password}
              </p>
            </div>

            {loginCode && (
              <div className="flex items-center gap-4 rounded-xl ring-1 ring-slate-200 dark:ring-slate-700 px-4 py-3 bg-white dark:bg-slate-900">
                <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
                  <QRCodeCanvas
                    value={studentLoginUrl(loginCode, password)}
                    size={104}
                    marginSize={2}
                    level="M"
                    aria-label={`Updated login QR code for ${studentName}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Scan to sign in
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    New QR for the updated password — the old one no longer works.
                  </p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onCopy}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 text-sm min-h-[40px]"
            >
              {loginCode ? "Copy login + password" : "Copy password"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 min-h-[40px]"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                New password
              </span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  data-autofocus
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setPassword(generatePassword())}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[40px]"
                  title="Generate a new password"
                >
                  ↻ New
                </button>
              </div>
            </label>

            {error && (
              <div
                role="alert"
                className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
              >
                {error}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 min-h-[40px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2.5 text-sm min-h-[40px]"
              >
                {busy ? "Resetting…" : "Reset password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
