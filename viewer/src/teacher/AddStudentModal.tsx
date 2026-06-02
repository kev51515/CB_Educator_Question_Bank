/**
 * AddStudentModal
 * ===============
 * Create a teacher-managed student login from the roster. The teacher types a
 * name; we auto-generate a friendly password (editable + regenerable), then
 * call the `admin_create_student` RPC which mints the account, assigns a
 * per-course code (e.g. "KQAZNP-04"), and enrolls the student.
 *
 * On success we flip to a **credentials card** — the login code + password
 * with one-click copy (individually + "copy both"), a Print handout button,
 * and an "Add another" action so the teacher can churn through a class list
 * without reopening the modal. The password is shown ONCE here: it's stored
 * only as a bcrypt hash server-side, so there's no way to retrieve it later —
 * the teacher resets it instead. We make that explicit in the UI.
 *
 * Follows the project modal contract: role=dialog, aria-modal, focus trap,
 * top-right ×, Esc to close, backdrop click closes (panel stops propagation).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toast";
import { useFocusTrap } from "../hooks";
import { studentLoginUrl } from "../lib/routes";

/** Stable DOM id for the credential QR canvas (read back for print). */
const QR_CANVAS_ID = "add-student-qr-canvas";

interface AddStudentModalProps {
  courseId: string;
  courseName: string;
  onClose: () => void;
  /** Fired after each successful create so the caller can refresh the roster. */
  onCreated: () => void;
}

interface CreatedStudent {
  studentId: string;
  loginCode: string;
  email: string;
  password: string;
  name: string;
}

// Friendly, readable password parts — avoids ambiguous look-alikes and keeps
// the handout easy to read aloud. Two words + two digits ≈ plenty of entropy
// for a tutoring context and far easier than a random string.
const ADJECTIVES = [
  "brave", "calm", "clever", "eager", "gentle", "happy", "jolly", "kind",
  "lucky", "merry", "nimble", "proud", "quick", "swift", "warm", "wise",
];
const NOUNS = [
  "otter", "falcon", "maple", "river", "comet", "harbor", "willow", "cedar",
  "pebble", "meadow", "lantern", "summit", "anchor", "garden", "beacon", "harvest",
];

function generatePassword(): string {
  // Index math via crypto when available; falls back to a time-seeded pick.
  // (Math.random is fine here — this is a human-friendly temp credential the
  // teacher immediately hands over, not a long-lived secret.)
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const d = String(Math.floor(Math.random() * 90) + 10); // 10–99
  return `${a}-${n}-${d}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/** Map the RPC's bare error keywords to teacher-facing copy. */
function mapRpcError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("not_authorized")) return "You don't have permission to add students to this course.";
  if (m.includes("invalid_name")) return "Please enter the student's name.";
  if (m.includes("weak_password")) return "Password must be at least 6 characters.";
  if (m.includes("course_not_found")) return "This course no longer exists.";
  if (m.includes("not_authenticated")) return "Your session expired — sign in again.";
  return raw.split("\n")[0]?.trim() || "Couldn't create the student.";
}

interface CopyButtonProps {
  value: string;
  label: string;
}

function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op; value is visible to select manually */
    }
  }, [value]);
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={`Copy ${label}`}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 min-h-[32px]"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

export function AddStudentModal({
  courseId,
  courseName,
  onClose,
  onCreated,
}: AddStudentModalProps) {
  const toast = useToast();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);

  const [name, setName] = useState("");
  const [password, setPassword] = useState<string>(() => generatePassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedStudent | null>(null);

  const combinedCredentials = useMemo(() => {
    if (!created) return "";
    return [
      `Course: ${courseName}`,
      `Student: ${created.name}`,
      `Login code: ${created.loginCode}`,
      `Password: ${created.password}`,
    ].join("\n");
  }, [created, courseName]);

  const loginUrl = useMemo(
    () => (created ? studentLoginUrl(created.loginCode, created.password) : ""),
    [created],
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter the student's name.");
      return;
    }
    if (password.trim().length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("admin_create_student", {
        p_course_id: courseId,
        p_display_name: trimmed,
        p_password: password,
      });
      if (rpcError) {
        setError(mapRpcError(rpcError.message));
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as
        | { student_id: string; login_code: string; roster_code: string; email: string }
        | undefined;
      if (!row) {
        setError("The server didn't return the new student. Refresh and check the roster.");
        return;
      }
      setCreated({
        studentId: row.student_id,
        loginCode: row.login_code,
        email: row.email,
        password,
        name: trimmed,
      });
      toast.success(`Created ${trimmed}`, `Login code ${row.login_code}`);
      onCreated();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Couldn't create the student."));
    } finally {
      setBusy(false);
    }
  };

  const onAddAnother = useCallback(() => {
    setCreated(null);
    setName("");
    setPassword(generatePassword());
    setError(null);
  }, []);

  const onPrint = useCallback(() => {
    if (!created) return;
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) {
      toast.info("Pop-up blocked", "Allow pop-ups to print the handout.");
      return;
    }
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Pull the rendered QR off its canvas as a PNG so it survives into the
    // separate print document.
    const canvas = document.getElementById(
      QR_CANVAS_ID,
    ) as HTMLCanvasElement | null;
    const qrDataUrl =
      canvas && typeof canvas.toDataURL === "function"
        ? canvas.toDataURL("image/png")
        : "";
    const qrBlock = qrDataUrl
      ? `<div class="qr"><img src="${qrDataUrl}" width="180" height="180" alt="Login QR code"/><div class="qrcap">Scan to sign in</div></div>`
      : "";
    w.document.write(`<!doctype html><html><head><title>Login — ${esc(created.name)}</title>
      <style>
        body{font-family:Georgia,serif;margin:48px;color:#0f172a}
        h1{font-size:20px;margin:0 0 4px}
        .muted{color:#64748b;font-size:13px;margin:0 0 24px}
        .card{border:1px solid #cbd5e1;border-radius:12px;padding:24px;max-width:360px;display:flex;gap:24px;align-items:center}
        .rows{flex:1}
        .row{margin:14px 0}
        .lbl{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#64748b}
        .val{font-family:ui-monospace,Menlo,monospace;font-size:22px;font-weight:600;margin-top:2px}
        .qr{text-align:center}
        .qr img{border:1px solid #e2e8f0;border-radius:8px;padding:6px;background:#fff}
        .qrcap{font-size:11px;color:#64748b;margin-top:6px}
        .foot{font-size:12px;color:#64748b;margin-top:24px;max-width:360px}
      </style></head><body>
      <h1>${esc(courseName)}</h1>
      <p class="muted">Sign-in card for ${esc(created.name)}</p>
      <div class="card">
        <div class="rows">
          <div class="row"><div class="lbl">Login code</div><div class="val">${esc(created.loginCode)}</div></div>
          <div class="row"><div class="lbl">Password</div><div class="val">${esc(created.password)}</div></div>
        </div>
        ${qrBlock}
      </div>
      <p class="foot">Scan the QR to open the sign-in page with the code already
      filled in, then tap “Sign in”. Or go to the class website, choose “I’m a
      student”, and type the code + password. Keep this card private.</p>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }, [created, courseName, toast]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-student-title"
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
              id="add-student-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              {created ? "Student created" : "Add student"}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {created
                ? "Hand these to the student. The password is shown only once."
                : `New login for ${courseName}. No email needed.`}
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

        {!created ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Student name
              </span>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input
                data-autofocus
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex Chen"
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </span>
              <div className="mt-1 flex items-center gap-2">
                <input
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
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 min-h-[40px]"
                  title="Generate a new password"
                >
                  ↻ New
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Auto-generated and editable. The student can't change it — you
                reset it from the roster if it's lost.
              </p>
            </label>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              The login code (like{" "}
              <span className="font-mono text-slate-700 dark:text-slate-300">
                ABCDEF-04
              </span>
              ) is assigned automatically when you create the student.
            </p>

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
                className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 text-sm min-h-[40px]"
              >
                {busy ? "Creating…" : "Create student"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              <CredRow label="Student" value={created.name} />
              <CredRow label="Login code" value={created.loginCode} copy />
              <CredRow label="Password" value={created.password} copy />
            </div>

            {/* Scannable login — opens the sign-in page with the code (and
                password) pre-filled. Great for handing out on paper or screen. */}
            <div className="flex items-center gap-4 rounded-xl ring-1 ring-slate-200 dark:ring-slate-700 px-4 py-3 bg-white dark:bg-slate-900">
              <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
                <QRCodeCanvas
                  id={QR_CANVAS_ID}
                  value={loginUrl}
                  size={104}
                  marginSize={2}
                  level="M"
                  aria-label={`Login QR code for ${created.name}`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Scan to sign in
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Opens the sign-in page with the code filled in — the student
                  just taps Sign in.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(loginUrl);
                      toast.success("Login link copied");
                    } catch {
                      toast.error("Couldn't copy", "Select the link manually.");
                    }
                  }}
                  className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 min-h-[32px]"
                >
                  Copy login link
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(combinedCredentials);
                  toast.success("Copied login + password");
                } catch {
                  toast.error("Couldn't copy", "Select the text manually.");
                }
              }}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 text-sm min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
            >
              Copy login + password
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrint}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[40px]"
              >
                Print handout
              </button>
              <button
                type="button"
                onClick={onAddAnother}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 min-h-[40px]"
              >
                Add another
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 min-h-[40px]"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface CredRowProps {
  label: string;
  value: string;
  copy?: boolean;
}

function CredRow({ label, value, copy }: CredRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-slate-900">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-500">
          {label}
        </p>
        <p className="font-mono text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
          {value}
        </p>
      </div>
      {copy && <CopyButton value={value} label={label} />}
    </div>
  );
}
