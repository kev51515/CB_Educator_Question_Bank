/**
 * PrintLoginsModal
 * ================
 * Bulk "print / download all logins" for a course roster. Produces a class set
 * of sign-in cards — one per teacher-managed student — each with the student's
 * name, login code, and a scan-to-prefill QR (code only).
 *
 * IMPORTANT constraint: passwords are bcrypt-hashed server-side and
 * unrecoverable, so a bulk export CANNOT include passwords. The sheet/CSV
 * therefore carries name + code + a code-prefill sign-in link/QR; the student
 * supplies their own password (a teacher resets it per-student from the roster
 * if it's lost). We say this plainly in the UI so nobody expects passwords.
 *
 * Two outputs:
 *   • Print sheet — opens a print window with a card grid. QR images are read
 *     off hidden <canvas> nodes (qrcode.react QRCodeCanvas) as PNG data URLs so
 *     they survive into the separate print document.
 *   • Download CSV — Name, Login code, Sign-in URL.
 *
 * Modal contract: role=dialog, aria-modal, focus trap, ×, Esc, backdrop click.
 */
import { useCallback, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { useToast } from "../components/Toast";
import { useFocusTrap } from "../hooks";
import { studentCodePrefillUrl } from "../lib/routes";

export interface PrintableLogin {
  name: string;
  code: string;
}

interface PrintLoginsModalProps {
  courseName: string;
  students: PrintableLogin[];
  onClose: () => void;
}

const qrDomId = (code: string): string => `bulkqr-${code}`;

function csvCell(value: string): string {
  // Quote + escape per RFC 4180 when the value contains a comma, quote, or newline.
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function PrintLoginsModal({
  courseName,
  students,
  onClose,
}: PrintLoginsModalProps) {
  const toast = useToast();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);

  const onPrint = useCallback(() => {
    if (students.length === 0) {
      toast.info("No managed logins", "Add a student to print a login sheet.");
      return;
    }
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) {
      toast.info("Pop-up blocked", "Allow pop-ups to print the login sheet.");
      return;
    }
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const cards = students
      .map((s) => {
        const canvas = document.getElementById(
          qrDomId(s.code),
        ) as HTMLCanvasElement | null;
        const qr =
          canvas && typeof canvas.toDataURL === "function"
            ? canvas.toDataURL("image/png")
            : "";
        const qrImg = qr
          ? `<img src="${qr}" width="120" height="120" alt="Login QR"/>`
          : "";
        return `<div class="card">
            <div class="qr">${qrImg}</div>
            <div class="meta">
              <div class="name">${esc(s.name)}</div>
              <div class="lbl">Login code</div>
              <div class="code">${esc(s.code)}</div>
              <div class="hint">Scan, or go to the class site → “I’m a student”.
              Enter your password.</div>
            </div>
          </div>`;
      })
      .join("");

    w.document.write(`<!doctype html><html><head><title>Logins — ${esc(courseName)}</title>
      <style>
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
        .hint{font-size:10px;color:#64748b;margin-top:8px;line-height:1.35}
        @media print{body{margin:12mm}}
      </style></head><body>
      <h1>${esc(courseName)} — student logins</h1>
      <p class="sub">${students.length} student${students.length === 1 ? "" : "s"} · passwords are set per student (not shown) — use Reset password on the roster if one is lost.</p>
      <div class="grid">${cards}</div>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }, [students, courseName, toast]);

  const onDownloadCsv = useCallback(() => {
    if (students.length === 0) {
      toast.info("No managed logins", "Add a student first.");
      return;
    }
    const header = ["Name", "Login code", "Sign-in URL"];
    const rows = students.map((s) =>
      [s.name, s.code, studentCodePrefillUrl(s.code)].map(csvCell).join(","),
    );
    const csv = [header.join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = courseName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    a.href = url;
    a.download = `${safeName || "course"}-logins.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  }, [students, courseName, toast]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-logins-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="print-logins-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Print all logins
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {students.length} managed{" "}
              {students.length === 1 ? "student" : "students"} in {courseName}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md inline-flex items-center justify-center min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 md:p-1 -mt-1 -mr-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 flex-none"
          >
            ✕
          </button>
        </header>

        {students.length === 0 ? (
          <p className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
            No teacher-created logins yet. Use{" "}
            <span className="font-medium">+ Add student</span> first — only
            managed accounts have a login code to print.
          </p>
        ) : (
          <p className="rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 ring-1 ring-amber-200 dark:ring-amber-900">
            Passwords aren't included — they're stored encrypted and can't be
            re-shown. The sheet carries each student's code + a scan-to-fill QR;
            students enter their own password. Reset a lost one from the roster.
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrint}
            disabled={students.length === 0}
            className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 text-sm min-h-[40px]"
          >
            Print sheet
          </button>
          <button
            type="button"
            onClick={onDownloadCsv}
            disabled={students.length === 0}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 min-h-[40px]"
          >
            Download CSV
          </button>
        </div>

        {/* Off-screen QR canvases — read back as PNG data URLs at print time.
            Kept in the DOM (not display:none, which can blank a canvas) but
            visually hidden and pulled out of the layout/a11y tree. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            overflow: "hidden",
            opacity: 0,
            pointerEvents: "none",
          }}
        >
          {students.map((s) => (
            <QRCodeCanvas
              key={s.code}
              id={qrDomId(s.code)}
              value={studentCodePrefillUrl(s.code)}
              size={120}
              marginSize={2}
              level="M"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
