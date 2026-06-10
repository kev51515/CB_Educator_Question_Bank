/**
 * CertificationsPanel — Pickleball COACH-track teacher panel.
 *
 * Per-coach certification records (migration 0153). The educator adds / edits /
 * deletes credentials per enrolled coach, with an optional expiry that the UI
 * flags as "expiring soon" (≤60 days) or "expired". A certificate file can be
 * pasted as a link OR uploaded via FileDropzone to the "pickleball-certs"
 * Storage bucket.
 *
 * Prop contract (Foundation stub):
 *   export function CertificationsPanel({ courseId }: { courseId: string })
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast, SkeletonRows, FileDropzone } from "@/components";
import { ConfirmDialog } from "@/teacher/ConfirmDialog";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useClassRoster, type RosterStudent } from "@/teacher/useClassRoster";

const CERT_BUCKET = "pickleball-certs";
const EXPIRING_SOON_DAYS = 60;
const SIGNED_URL_TTL = 3600; // 1 hour

/**
 * Resolve the storage object path for a stored cert file reference.
 *
 * The `pickleball-certs` bucket is private, so we mint short-lived signed URLs
 * on demand. `file_url` historically stored a *public* URL
 * (…/object/public/pickleball-certs/<path>); newer rows may store just the
 * object path. Both must resolve. An external http(s) link that is NOT in our
 * bucket is returned as-is (null path → open verbatim).
 *
 * Returns the bucket-relative object path, or null when the value should be
 * opened directly (external link).
 */
function certObjectPath(fileUrl: string): string | null {
  const trimmed = fileUrl.trim();
  if (trimmed === "") return null;
  // Public or signed Supabase storage URL for our bucket.
  const marker = `/${CERT_BUCKET}/`;
  for (const seg of [
    `/object/public${marker}`,
    `/object/sign${marker}`,
    `/object${marker}`,
  ]) {
    const idx = trimmed.indexOf(seg);
    if (idx !== -1) {
      const after = trimmed.slice(idx + seg.length);
      // Drop any query string (signed URLs carry ?token=…).
      const path = after.split("?")[0];
      return path !== "" ? decodeURIComponent(path) : null;
    }
  }
  // A bare object path (no scheme) → treat as in-bucket.
  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^\/+/, "");
  }
  // External link not in our bucket → open verbatim.
  return null;
}

/**
 * Open a cert file: mint a signed URL for in-bucket objects, else open the
 * external link directly. Returns true on success, false on (already-toasted)
 * failure so callers can decide whether to navigate.
 */
async function openCertFile(
  fileUrl: string,
  onError: (msg: string) => void,
): Promise<void> {
  const path = certObjectPath(fileUrl);
  if (path === null) {
    window.open(fileUrl, "_blank", "noopener,noreferrer");
    return;
  }
  const { data, error } = await supabase.storage
    .from(CERT_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) {
    onError("Could not open the certificate file.");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

interface CertRow {
  id: string;
  course_id: string;
  coach_id: string;
  name: string;
  issuing_body: string | null;
  level: string | null;
  earned_on: string | null;
  expires_on: string | null;
  cert_no: string | null;
  file_url: string | null;
  created_at: string;
}

interface CertDraft {
  id: string | null;
  coach_id: string;
  name: string;
  issuing_body: string;
  level: string;
  earned_on: string;
  expires_on: string;
  cert_no: string;
  file_url: string;
}

function emptyDraft(coachId: string): CertDraft {
  return {
    id: null,
    coach_id: coachId,
    name: "",
    issuing_body: "",
    level: "",
    earned_on: "",
    expires_on: "",
    cert_no: "",
    file_url: "",
  };
}

function rowToDraft(row: CertRow): CertDraft {
  return {
    id: row.id,
    coach_id: row.coach_id,
    name: row.name,
    issuing_body: row.issuing_body ?? "",
    level: row.level ?? "",
    earned_on: row.earned_on ?? "",
    expires_on: row.expires_on ?? "",
    cert_no: row.cert_no ?? "",
    file_url: row.file_url ?? "",
  };
}

function rpcError(code: string): string {
  switch (code) {
    case "not_authorized":
      return "You don't have permission to manage these certifications.";
    case "not_authenticated":
      return "Your session expired — sign in again.";
    case "invalid_input":
      return "A certification needs a name.";
    case "not_found":
      return "That certification no longer exists.";
    default:
      return "Could not save the certification.";
  }
}

type ExpiryState = "ok" | "soon" | "expired" | "none";

function expiryState(expiresOn: string | null): ExpiryState {
  if (!expiresOn) return "none";
  const exp = new Date(`${expiresOn}T00:00:00`);
  if (Number.isNaN(exp.getTime())) return "none";
  const now = new Date();
  const days = Math.ceil((exp.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= EXPIRING_SOON_DAYS) return "soon";
  return "ok";
}

const FIELD_INPUT =
  "w-full min-h-[44px] rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 ring-1 ring-slate-300 dark:ring-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 placeholder:text-slate-400 dark:placeholder:text-slate-600";
const FIELD_LABEL =
  "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1";

function ExpiryBadge({ expiresOn }: { expiresOn: string | null }): React.ReactElement | null {
  const state = expiryState(expiresOn);
  if (state === "none") return null;
  if (state === "ok") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
        Valid · expires {expiresOn}
      </span>
    );
  }
  if (state === "soon") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
        Expiring soon · {expiresOn}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-rose-100 dark:bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">
      Expired · {expiresOn}
    </span>
  );
}

function CertEditorModal({
  draft,
  onChange,
  busy,
  onSave,
  onCancel,
}: {
  draft: CertDraft;
  onChange: (d: CertDraft) => void;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const set = (k: keyof CertDraft, v: string): void =>
    onChange({ ...draft, [k]: v });

  const handleUpload = useCallback(
    async (picked: File[]): Promise<void> => {
      setFiles(picked);
      const file = picked[0];
      if (!file) return;
      setUploading(true);
      try {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${draft.coach_id}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from(CERT_BUCKET)
          .upload(path, file, { upsert: false });
        if (upErr) {
          toast.error(`Upload failed: ${upErr.message}`);
          return;
        }
        // Bucket is private — store the object path, not a public URL.
        // Files are served later via short-lived signed URLs (openCertFile).
        onChange({ ...draft, file_url: path });
        toast.success("Certificate file uploaded.");
      } catch {
        toast.error("Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [draft, onChange, toast],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cert-editor-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-slate-900/40 backdrop-blur-sm overflow-y-auto"
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="absolute top-2 right-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <h2
          id="cert-editor-title"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100 pr-8"
        >
          {draft.id ? "Edit certification" : "Add certification"}
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={FIELD_LABEL}>Name *</label>
            <input
              data-autofocus
              type="text"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. PPR Certified Pickleball Coach"
              className={FIELD_INPUT}
            />
          </div>
          <div>
            <label className={FIELD_LABEL}>Issuing body</label>
            <input
              type="text"
              value={draft.issuing_body}
              onChange={(e) => set("issuing_body", e.target.value)}
              placeholder="e.g. PPR / IPTPA"
              className={FIELD_INPUT}
            />
          </div>
          <div>
            <label className={FIELD_LABEL}>Level</label>
            <input
              type="text"
              value={draft.level}
              onChange={(e) => set("level", e.target.value)}
              placeholder="e.g. Level II"
              className={FIELD_INPUT}
            />
          </div>
          <div>
            <label className={FIELD_LABEL}>Earned on</label>
            <input
              type="date"
              value={draft.earned_on}
              onChange={(e) => set("earned_on", e.target.value)}
              className={FIELD_INPUT}
            />
          </div>
          <div>
            <label className={FIELD_LABEL}>Expires on</label>
            <input
              type="date"
              value={draft.expires_on}
              onChange={(e) => set("expires_on", e.target.value)}
              className={FIELD_INPUT}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={FIELD_LABEL}>Certificate number</label>
            <input
              type="text"
              value={draft.cert_no}
              onChange={(e) => set("cert_no", e.target.value)}
              className={FIELD_INPUT}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={FIELD_LABEL}>Certificate file</label>
            <FileDropzone
              files={files}
              onChange={(f) => void handleUpload(f)}
              accept="application/pdf,image/*"
              multiple={false}
              disabled={uploading || busy}
            />
            <div className="mt-2">
              <input
                type="url"
                value={draft.file_url}
                onChange={(e) => set("file_url", e.target.value)}
                placeholder="…or paste a link to the certificate"
                className={FIELD_INPUT}
              />
              {draft.file_url && (
                <button
                  type="button"
                  onClick={() =>
                    void openCertFile(draft.file_url, (m) => toast.error(m))
                  }
                  className="mt-1 inline-block text-xs font-medium text-indigo-600 dark:text-indigo-300 hover:underline"
                >
                  Open current file
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy || uploading || draft.name.trim() === ""}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? "Saving…" : draft.id ? "Save changes" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CoachCertGroup({
  coach,
  certs,
  onAdd,
  onEdit,
  onDelete,
  onOpenFile,
}: {
  coach: RosterStudent;
  certs: CertRow[];
  onAdd: () => void;
  onEdit: (cert: CertRow) => void;
  onDelete: (cert: CertRow) => void;
  onOpenFile: (fileUrl: string) => void;
}): React.ReactElement {
  const name = coach.display_name ?? coach.email;
  return (
    <div className="rounded-xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {name}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {certs.length === 0
              ? "No certifications yet"
              : `${certs.length} certification${certs.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <svg
            width={15}
            height={15}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add
        </button>
      </div>

      {certs.length > 0 && (
        <ul className="mt-3 space-y-2">
          {certs.map((cert) => (
            <li
              key={cert.id}
              className="group flex items-start justify-between gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 px-3 py-2.5 ring-1 ring-slate-200 dark:ring-slate-800"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {cert.name}
                  </span>
                  {cert.level && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {cert.level}
                    </span>
                  )}
                  <ExpiryBadge expiresOn={cert.expires_on} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {[
                    cert.issuing_body,
                    cert.cert_no ? `No. ${cert.cert_no}` : null,
                    cert.earned_on ? `earned ${cert.earned_on}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {cert.file_url && (
                  <button
                    type="button"
                    onClick={() => onOpenFile(cert.file_url as string)}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-300 hover:underline"
                  >
                    <svg
                      width={13}
                      height={13}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    View certificate
                  </button>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => onEdit(cert)}
                  aria-label={`Edit ${cert.name}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
                >
                  <svg
                    width={15}
                    height={15}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(cert)}
                  aria-label={`Delete ${cert.name}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 hover:bg-rose-100/60 dark:hover:bg-rose-500/10"
                >
                  <svg
                    width={15}
                    height={15}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CertificationsPanel({
  courseId,
}: {
  courseId: string;
}): React.ReactElement {
  const toast = useToast();
  const { roster, loading: rosterLoading, error: rosterError } =
    useClassRoster(courseId);
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [certsLoading, setCertsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<CertDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CertRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCerts = useCallback(async (): Promise<void> => {
    setCertsLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("pickleball_certifications")
        .select(
          "id, course_id, coach_id, name, issuing_body, level, earned_on, expires_on, cert_no, file_url, created_at",
        )
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) {
        setLoadError(error.message);
        setCerts([]);
        return;
      }
      setCerts((data ?? []) as CertRow[]);
    } catch {
      setLoadError("Could not load certifications.");
      setCerts([]);
    } finally {
      setCertsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void loadCerts();
  }, [loadCerts]);

  const byCoach = useMemo(() => {
    const m = new Map<string, CertRow[]>();
    for (const c of certs) {
      const list = m.get(c.coach_id) ?? [];
      list.push(c);
      m.set(c.coach_id, list);
    }
    return m;
  }, [certs]);

  const save = useCallback(async (): Promise<void> => {
    if (!draft) return;
    if (draft.name.trim() === "") {
      toast.error("A certification needs a name.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("pk_add_certification", {
        p_course_id: courseId,
        p_coach_id: draft.coach_id,
        p_id: draft.id,
        p_name: draft.name.trim(),
        p_issuing_body:
          draft.issuing_body.trim() === "" ? null : draft.issuing_body.trim(),
        p_level: draft.level.trim() === "" ? null : draft.level.trim(),
        p_earned_on: draft.earned_on === "" ? null : draft.earned_on,
        p_expires_on: draft.expires_on === "" ? null : draft.expires_on,
        p_cert_no: draft.cert_no.trim() === "" ? null : draft.cert_no.trim(),
        p_file_url: draft.file_url.trim() === "" ? null : draft.file_url.trim(),
      });
      if (error) {
        toast.error(rpcError(error.message));
        return;
      }
      const saved = data as CertRow;
      setCerts((prev) => {
        const next = prev.filter((c) => c.id !== saved.id);
        next.unshift(saved);
        return next;
      });
      setDraft(null);
      toast.success("Certification saved.");
    } catch {
      toast.error("Could not save the certification.");
    } finally {
      setSaving(false);
    }
  }, [courseId, draft, toast]);

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (!pendingDelete) return;
    setDeleting(true);
    const target = pendingDelete;
    // Optimistic remove.
    setCerts((prev) => prev.filter((c) => c.id !== target.id));
    try {
      const { error } = await supabase.rpc("pk_delete_certification", {
        p_id: target.id,
      });
      if (error) {
        // Roll back.
        setCerts((prev) => [target, ...prev]);
        toast.error(rpcError(error.message));
        return;
      }
      toast.success("Certification deleted.");
    } catch {
      setCerts((prev) => [target, ...prev]);
      toast.error("Could not delete the certification.");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }, [pendingDelete, toast]);

  const loading = rosterLoading || certsLoading;

  if (loading) {
    return (
      <div className="space-y-3">
        <SkeletonRows count={4} rowClassName="h-24" />
      </div>
    );
  }

  if (rosterError || loadError) {
    return (
      <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 ring-1 ring-rose-200 dark:ring-rose-500/30 p-6 text-sm text-rose-700 dark:text-rose-300">
        {rosterError ?? loadError}
      </div>
    );
  }

  if (roster.length === 0) {
    return (
      <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-10 text-center">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          No coaches enrolled yet
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Add coaches from the course roster (People), then record their
          certifications here.
        </p>
      </div>
    );
  }

  const expiringCount = certs.filter(
    (c) => expiryState(c.expires_on) === "soon",
  ).length;
  const expiredCount = certs.filter(
    (c) => expiryState(c.expires_on) === "expired",
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Certifications
        </h2>
        <div className="flex items-center gap-2 text-xs">
          {expiringCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
              {expiringCount} expiring soon
            </span>
          )}
          {expiredCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-rose-100 dark:bg-rose-500/15 px-2 py-0.5 font-medium text-rose-700 dark:text-rose-300">
              {expiredCount} expired
            </span>
          )}
        </div>
      </div>

      {roster.map((coach) => (
        <CoachCertGroup
          key={coach.student_id}
          coach={coach}
          certs={byCoach.get(coach.student_id) ?? []}
          onAdd={() => setDraft(emptyDraft(coach.student_id))}
          onEdit={(cert) => setDraft(rowToDraft(cert))}
          onDelete={(cert) => setPendingDelete(cert)}
          onOpenFile={(fileUrl) =>
            void openCertFile(fileUrl, (m) => toast.error(m))
          }
        />
      ))}

      {draft && (
        <CertEditorModal
          draft={draft}
          onChange={setDraft}
          busy={saving}
          onSave={() => void save()}
          onCancel={() => setDraft(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete certification"
          body={
            <>
              Delete <strong>{pendingDelete.name}</strong>? This can't be
              undone.
            </>
          }
          confirmLabel="Delete"
          destructive
          busy={deleting}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
