/**
 * PrintLoginsModal
 * ================
 * Bulk login tooling for a course roster, over every teacher-managed student.
 *
 * Two tracks:
 *
 *  1. Codes only (safe, repeatable) — print a class set of cards / download a
 *     CSV with each student's name + login code + a scan-to-prefill QR (code
 *     only). No passwords: they're bcrypt-hashed server-side and unrecoverable.
 *
 *  2. Reset all & print WITH passwords (destructive) — generate a fresh
 *     password for every managed student, reset each via
 *     admin_reset_student_password, then print/export the full set with
 *     passwords and a full auto-login QR (code + password). This invalidates
 *     every current password, so it sits behind an explicit confirm and the
 *     new passwords are shown ONCE.
 *
 * QR images are read off hidden <canvas> nodes (qrcode.react QRCodeCanvas) as
 * PNG data URLs so they survive into the separate print document.
 *
 * Shell: renders inside the shared ResponsiveModal (bottom sheet on mobile,
 * centered card on desktop) which bakes in the role=dialog / aria-modal /
 * focus-trap / × / Esc / backdrop-click contract. While a bulk reset is
 * running, dismissal is disabled and the × is hidden.
 */
import { useCallback, useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { ResponsiveModal } from "@/components";
import { studentCodePrefillUrl, studentLoginUrl } from "@/lib/routes";

export interface PrintableLogin {
  id: string;
  name: string;
  code: string;
  /** True once the student claimed the seat — the code login is retired and
   *  they sign in with their own email. Such seats are shown for reference but
   *  excluded from QR/code distribution and from bulk password reset. */
  claimed: boolean;
  /** The student's real login email (present once claimed). */
  email?: string | null;
}

interface ResetResult {
  name: string;
  code: string;
  password: string;
}

interface PrintLoginsModalProps {
  courseName: string;
  students: PrintableLogin[];
  onClose: () => void;
  /** Called after a bulk password reset so the caller can refresh the roster. */
  onChanged?: () => void;
}

type View = "main" | "confirm" | "running" | "result";

const codeQrId = (code: string): string => `bulkqr-${code}`;
const pwQrId = (code: string): string => `pwqr-${code}`;

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

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function readQr(id: string): string {
  const canvas = document.getElementById(id) as HTMLCanvasElement | null;
  return canvas && typeof canvas.toDataURL === "function"
    ? canvas.toDataURL("image/png")
    : "";
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const SHEET_CSS = `
  *{box-sizing:border-box}
  body{font-family:Georgia,serif;margin:32px;color:#0f172a}
  h1{font-size:20px;margin:0 0 2px}
  .sub{color:#64748b;font-size:12px;margin:0 0 20px}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
  .card{border:1px solid #cbd5e1;border-radius:12px;padding:16px;display:flex;gap:16px;align-items:center;break-inside:avoid}
  .qr img{border:1px solid #e2e8f0;border-radius:8px;padding:4px;background:#fff}
  .meta{min-width:0}
  .name{font-size:15px;font-weight:600;margin-bottom:8px}
  .lbl{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#64748b}
  .code{font-family:ui-monospace,Menlo,monospace;font-size:20px;font-weight:600}
  .pw{font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:600;margin-top:6px}
  .hint{font-size:10px;color:#64748b;margin-top:8px;line-height:1.35}
  @media print{body{margin:12mm}}
`;

export function PrintLoginsModal({
  courseName,
  students,
  onClose,
  onChanged,
}: PrintLoginsModalProps) {
  const toast = useToast();

  const [view, setView] = useState<View>("main");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ResetResult[]>([]);
  const [failures, setFailures] = useState<{ name: string; reason: string }[]>([]);

  const busy = view === "running";

  // Claimed seats sign in with their own email — the code/QR no longer works for
  // them, and a bulk reset would clobber the password they chose. Split them out.
  const codeStudents = useMemo(() => students.filter((s) => !s.claimed), [students]);
  const claimedStudents = useMemo(() => students.filter((s) => s.claimed), [students]);

  // ---- Track 1: codes only -------------------------------------------------

  const onPrintCodes = useCallback(() => {
    if (students.length === 0) return;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) {
      toast.info("Pop-up blocked", "Allow pop-ups to print the login sheet.");
      return;
    }
    const codeCards = codeStudents
      .map((s) => {
        const qr = readQr(codeQrId(s.code));
        const img = qr ? `<img src="${qr}" width="120" height="120" alt="Login QR"/>` : "";
        return `<div class="card"><div class="qr">${img}</div><div class="meta">
            <div class="name">${esc(s.name)}</div>
            <div class="lbl">Login code</div><div class="code">${esc(s.code)}</div>
            <div class="hint">Scan, or go to the class site → “I’m a student”. Enter your password.</div>
          </div></div>`;
      })
      .join("");
    // Claimed seats: the code/QR no longer signs them in — show their email.
    const claimedCards = claimedStudents
      .map(
        (s) => `<div class="card"><div class="meta">
            <div class="name">${esc(s.name)}</div>
            <div class="lbl">Signs in with own email</div>
            <div class="code" style="font-size:14px">${esc(s.email ?? "—")}</div>
            <div class="hint">This student set up their own login — the class login code no longer applies.</div>
          </div></div>`,
      )
      .join("");
    const sub =
      `${codeStudents.length} with a login code` +
      (claimedStudents.length
        ? ` · ${claimedStudents.length} use their own email`
        : "") +
      " · passwords set per student (not shown) — use Reset password on the roster if one is lost.";
    w.document.write(`<!doctype html><html><head><title>Logins — ${esc(courseName)}</title>
      <style>${SHEET_CSS}</style></head><body>
      <h1>${esc(courseName)} — student logins</h1>
      <p class="sub">${sub}</p>
      <div class="grid">${codeCards}${claimedCards}</div></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }, [students, codeStudents, claimedStudents, courseName, toast]);

  const onDownloadCodesCsv = useCallback(() => {
    if (students.length === 0) return;
    const rows = students.map((s) =>
      s.claimed
        ? [s.name, "—", s.email ?? "", ""].map(csvCell).join(",")
        : [s.name, s.code, "", studentCodePrefillUrl(s.code)].map(csvCell).join(","),
    );
    downloadCsv(
      `${courseName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "course"}-logins.csv`,
      ["Name,Login code,Email,Sign-in URL", ...rows].join("\r\n"),
    );
    toast.success("CSV downloaded");
  }, [students, courseName, toast]);

  // ---- Track 2: reset all & print with passwords ---------------------------

  const onResetAll = useCallback(async () => {
    setView("running");
    setProgress({ done: 0, total: codeStudents.length });
    const okResults: ResetResult[] = [];
    const failed: { name: string; reason: string }[] = [];
    for (const s of codeStudents) {
      const password = generatePassword();
      try {
        const { error } = await supabase.rpc("admin_reset_student_password", {
          p_student_id: s.id,
          p_password: password,
        });
        if (error) failed.push({ name: s.name, reason: error.message });
        else okResults.push({ name: s.name, code: s.code, password });
      } catch (err: unknown) {
        failed.push({
          name: s.name,
          reason: err instanceof Error ? err.message : "Unexpected error.",
        });
      } finally {
        setProgress((p) => ({ done: p.done + 1, total: p.total }));
      }
    }
    setResults(okResults);
    setFailures(failed);
    setView("result");
    onChanged?.();
    if (failed.length === 0) {
      toast.success(`Reset ${okResults.length} password${okResults.length === 1 ? "" : "s"}`);
    } else {
      toast.warning(
        `Reset ${okResults.length}, failed ${failed.length}`,
        "See the list in the dialog.",
      );
    }
  }, [codeStudents, toast, onChanged]);

  const onPrintWithPasswords = useCallback(() => {
    if (results.length === 0) return;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) {
      toast.info("Pop-up blocked", "Allow pop-ups to print the login sheet.");
      return;
    }
    const cards = results
      .map((r) => {
        const qr = readQr(pwQrId(r.code));
        const img = qr ? `<img src="${qr}" width="120" height="120" alt="Login QR"/>` : "";
        return `<div class="card"><div class="qr">${img}</div><div class="meta">
            <div class="name">${esc(r.name)}</div>
            <div class="lbl">Login code</div><div class="code">${esc(r.code)}</div>
            <div class="lbl" style="margin-top:8px">Password</div><div class="pw">${esc(r.password)}</div>
            <div class="hint">Scan to sign in (code + password filled), then tap Sign in.</div>
          </div></div>`;
      })
      .join("");
    w.document.write(`<!doctype html><html><head><title>Logins — ${esc(courseName)}</title>
      <style>${SHEET_CSS}</style></head><body>
      <h1>${esc(courseName)} — student logins</h1>
      <p class="sub">${results.length} student${results.length === 1 ? "" : "s"} · passwords were just reset — distribute privately and keep this copy secure.</p>
      <div class="grid">${cards}</div></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }, [results, courseName, toast]);

  const onDownloadPwCsv = useCallback(() => {
    if (results.length === 0) return;
    const rows = results.map((r) =>
      [r.name, r.code, r.password, studentLoginUrl(r.code, r.password)]
        .map(csvCell)
        .join(","),
    );
    downloadCsv(
      `${courseName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "course"}-logins-with-passwords.csv`,
      ["Name,Login code,Password,Sign-in URL", ...rows].join("\r\n"),
    );
    toast.success("CSV downloaded");
  }, [results, courseName, toast]);

  const headerTitle =
    view === "result"
      ? "New passwords"
      : view === "confirm"
        ? "Reset all passwords?"
        : view === "running"
          ? "Resetting passwords…"
          : "Print all logins";

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      title={headerTitle}
      subtitle={
        <>
          {students.length} managed{" "}
          {students.length === 1 ? "student" : "students"} in {courseName}
          {claimedStudents.length > 0
            ? ` · ${claimedStudents.length} use their own email`
            : ""}
          .
        </>
      }
      size="md"
      dismissible={!busy}
      hideClose={view === "running"}
    >
      <div className="space-y-4">
        {/* ---------- MAIN ---------- */}
        {view === "main" && (
          <>
            {students.length === 0 ? (
              <p className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                No teacher-created logins yet. Use{" "}
                <span className="font-medium">+ Add student</span> first — only
                managed accounts have a login code.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Codes only (no passwords)
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-autofocus
                      onClick={onPrintCodes}
                      className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 text-sm min-h-[40px]"
                    >
                      Print sheet
                    </button>
                    <button
                      type="button"
                      onClick={onDownloadCodesCsv}
                      className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[40px]"
                    >
                      Download CSV
                    </button>
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Need passwords too?
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Passwords can't be re-shown once set. This generates a{" "}
                    <span className="font-medium">new</span> password for every
                    student with a login code and prints the full set — useful at
                    the start of term or after a leak.
                    {claimedStudents.length > 0 && (
                      <>
                        {" "}
                        {claimedStudents.length} student
                        {claimedStudents.length === 1 ? "" : "s"} who set up their
                        own login{" "}
                        {claimedStudents.length === 1 ? "is" : "are"} skipped.
                      </>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setView("confirm")}
                    disabled={codeStudents.length === 0}
                    className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-amber-800 dark:text-amber-200 ring-1 ring-amber-300 dark:ring-amber-800 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 disabled:opacity-60 disabled:cursor-not-allowed min-h-[40px]"
                  >
                    {codeStudents.length === 0
                      ? "No code logins to reset"
                      : "Reset all passwords & print"}
                  </button>
                </div>
              </>
            )}

            {/* hidden code-only QR canvases (read at print time) — unclaimed
                seats only; a claimed seat's code no longer signs them in. */}
            <div aria-hidden style={hiddenStyle}>
              {codeStudents.map((s) => (
                <QRCodeCanvas
                  key={s.code}
                  id={codeQrId(s.code)}
                  value={studentCodePrefillUrl(s.code)}
                  size={120}
                  marginSize={2}
                  level="M"
                />
              ))}
            </div>
          </>
        )}

        {/* ---------- CONFIRM ---------- */}
        {view === "confirm" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 ring-1 ring-rose-200 dark:ring-rose-900 px-3 py-3 text-sm text-rose-700 dark:text-rose-300">
              This sets a <span className="font-semibold">brand-new password</span>{" "}
              for the {codeStudents.length} code-based{" "}
              {codeStudents.length === 1 ? "student" : "students"} in {courseName}.
              Their current passwords stop working immediately. You'll see the
              new passwords once — print or download them right after.
              {claimedStudents.length > 0 && (
                <>
                  {" "}
                  {claimedStudents.length}{" "}
                  {claimedStudents.length === 1 ? "student" : "students"} who set
                  up their own login{" "}
                  {claimedStudents.length === 1 ? "is" : "are"} left untouched.
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView("main")}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[40px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onResetAll()}
                className="flex-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2.5 text-sm min-h-[40px]"
              >
                Reset {codeStudents.length} password{codeStudents.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}

        {/* ---------- RUNNING ---------- */}
        {view === "running" && (
          <div className="space-y-2 py-2">
            <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-indigo-600 motion-safe:transition-all"
                style={{
                  width: `${progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)}%`,
                }}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
              Resetting… ({progress.done} / {progress.total})
            </p>
          </div>
        )}

        {/* ---------- RESULT ---------- */}
        {view === "result" && (
          <div className="space-y-4">
            <p className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-200 dark:ring-emerald-900">
              New passwords set for {results.length}{" "}
              {results.length === 1 ? "student" : "students"}. Shown once — print
              or download now.
            </p>

            {failures.length > 0 && (
              <div className="rounded-md bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900">
                <p className="font-medium">{failures.length} failed:</p>
                <ul className="mt-1 space-y-0.5">
                  {failures.map((f) => (
                    <li key={f.name}>
                      {f.name}: {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrintWithPasswords}
                disabled={results.length === 0}
                className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2.5 text-sm min-h-[40px]"
              >
                Print with passwords
              </button>
              <button
                type="button"
                onClick={onDownloadPwCsv}
                disabled={results.length === 0}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 min-h-[40px]"
              >
                Download CSV
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 min-h-[40px]"
            >
              Done
            </button>

            {/* hidden full-login QR canvases (code + password) */}
            <div aria-hidden style={hiddenStyle}>
              {results.map((r) => (
                <QRCodeCanvas
                  key={r.code}
                  id={pwQrId(r.code)}
                  value={studentLoginUrl(r.code, r.password)}
                  size={120}
                  marginSize={2}
                  level="M"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

const hiddenStyle: React.CSSProperties = {
  position: "absolute",
  width: 0,
  height: 0,
  overflow: "hidden",
  opacity: 0,
  pointerEvents: "none",
};
