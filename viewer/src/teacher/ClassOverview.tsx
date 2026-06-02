/**
 * ClassOverview
 * =============
 * The "/" tab inside ClassLayout. Renders the course metadata, join code
 * with copy + shareable QR/URL, and an enrollment-count pill. The kebab
 * action menu (edit / archive / regen / delete) lives in ClassLayout
 * (the persistent header), so this tab is just the surface body — header
 * chrome is owned by the layout.
 *
 * Lifted directly from the old ClassDetailView so existing styling /
 * copy / behaviour is preserved verbatim. The only changes are:
 *   - reads cls from the routed context instead of props,
 *   - no longer renders the kebab menu (moved to ClassLayout),
 *   - no longer renders the roster table (moved to ClassRoster tab),
 *   - no "Manage assignments" CTA card (replaced by the tab strip).
 */
import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useClassContext } from "./classLayoutContext";
import { useClassRoster } from "./useClassRoster";

/**
 * Build the deeplink URL students can scan / open. Encodes the join code
 * into a `?code=` query param on the current viewer origin so the teacher
 * can self-test by scanning the QR with their own phone.
 */
function buildJoinUrl(joinCode: string): string {
  if (typeof window === "undefined") return "";
  // Anchor at the root path; the SPA router handles the rest. We can't
  // assume window.location.pathname here because we're now in a nested
  // route (e.g. /classes/:id) and that would build a recursive URL.
  return `${window.location.origin}/?code=${encodeURIComponent(joinCode)}`;
}

export function ClassOverview() {
  const { cls } = useClassContext();
  // The roster count + member_count diverge by at most one refetch — we
  // prefer the live roster query so the pill matches what the Roster tab
  // shows. Fast: the same query backs the Roster tab and Supabase caches
  // it across tabs in the same session.
  const { roster } = useClassRoster(cls.id);

  const [copied, setCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const joinUrl = useMemo(() => buildJoinUrl(cls.join_code), [cls.join_code]);

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(cls.join_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — silently no-op */
    }
  };

  const onCopyUrl = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setUrlCopied(true);
      window.setTimeout(() => setUrlCopied(false), 1500);
    } catch {
      /* clipboard blocked — silently no-op */
    }
  };

  const enrollmentCount = roster.length || cls.member_count;

  return (
    <div className="space-y-6">
      {cls.description && (
        <p className="text-slate-600 dark:text-slate-400">{cls.description}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-900 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
            Join code
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="font-mono text-lg font-semibold tracking-widest text-indigo-900 dark:text-indigo-100">
              {cls.join_code}
            </span>
            <button
              type="button"
              onClick={() => {
                void onCopy();
              }}
              className="rounded-md bg-white dark:bg-slate-900 ring-1 ring-indigo-300 dark:ring-indigo-800 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 ring-1 ring-slate-200 dark:ring-slate-700 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Enrollment
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {enrollmentCount} student{enrollmentCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Share-with-students card. Renders a QR + a copyable deeplink so the
          teacher can either print, project, or paste-share. */}
      <div className="rounded-xl bg-white dark:bg-slate-900/50 ring-1 ring-slate-200 dark:ring-slate-800 px-4 py-4">
        <p className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Share with students
        </p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex justify-center sm:justify-start">
            {joinUrl ? (
              <div className="rounded-md bg-white p-2 ring-1 ring-slate-200 dark:ring-slate-700">
                <QRCodeSVG
                  value={joinUrl}
                  size={180}
                  marginSize={4}
                  level="M"
                  aria-label={`QR code that opens ${joinUrl}`}
                />
              </div>
            ) : null}
          </div>
          <div className="flex-1 space-y-2 text-sm">
            <p className="text-slate-600 dark:text-slate-400">
              Students can scan this QR or open the link to start with just
              their name + email — no password.
            </p>
            <div className="rounded-md bg-slate-50 dark:bg-slate-800/60 ring-1 ring-slate-200 dark:ring-slate-700 px-2.5 py-1.5 text-[11px] font-mono break-all text-slate-700 dark:text-slate-300">
              {joinUrl}
            </div>
            <button
              type="button"
              onClick={() => {
                void onCopyUrl();
              }}
              disabled={!joinUrl}
              className="rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed px-3 py-1.5 text-xs font-medium text-white"
            >
              {urlCopied ? "URL copied" : "Copy URL"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
