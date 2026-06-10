/**
 * AdminCollegesPage
 * =================
 * Admin-only CRUD surface for the shared `public.colleges` catalog — the curated
 * set of schools that students and counselors build college lists from. RLS
 * already restricts writes to admins (this page mounts under the admin routes),
 * so reads/writes go straight through `supabase` rather than an RPC.
 *
 * The curated catalog is small, so we load every row once and filter the table
 * client-side by name/state (display capped at 200 rows). Create/Edit share one
 * focus-trapped modal form; Delete confirms via ConfirmDialog. Every write
 * refetches the list and toasts.
 *
 * Editable fields here: name (required), city, state, type, website, admit_rate,
 * common_app, the four standard deadlines (ED/EA/REA/RD → `deadlines` jsonb),
 * and notes. aliases / essay_prompts / requirements are intentionally left out
 * of this form for now.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { ConfirmDialog } from "@/teacher/ConfirmDialog";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const MAX_DISPLAY = 200;

type CollegeType = "public" | "private" | "community" | "other";

interface Deadlines {
  ED?: string;
  EA?: string;
  REA?: string;
  RD?: string;
  [key: string]: string | undefined;
}

interface College {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  type: CollegeType | null;
  website: string | null;
  admit_rate: number | null;
  common_app: boolean | null;
  deadlines: Deadlines | null;
  notes: string | null;
}

interface FormState {
  name: string;
  city: string;
  state: string;
  type: "" | CollegeType;
  website: string;
  admit_rate: string;
  common_app: boolean;
  ED: string;
  EA: string;
  REA: string;
  RD: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  city: "",
  state: "",
  type: "",
  website: "",
  admit_rate: "",
  common_app: false,
  ED: "",
  EA: "",
  REA: "",
  RD: "",
  notes: "",
};

function formFromCollege(c: College): FormState {
  const d = c.deadlines ?? {};
  return {
    name: c.name ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    type: c.type ?? "",
    website: c.website ?? "",
    admit_rate: c.admit_rate == null ? "" : String(c.admit_rate),
    common_app: !!c.common_app,
    ED: d.ED ?? "",
    EA: d.EA ?? "",
    REA: d.REA ?? "",
    RD: d.RD ?? "",
    notes: c.notes ?? "",
  };
}

/** Map the editable form back to a colleges row payload. */
function payloadFromForm(f: FormState): Record<string, unknown> {
  const trimmedRate = f.admit_rate.trim();
  const rate = trimmedRate === "" ? null : Number(trimmedRate);
  const deadlines: Deadlines = {};
  if (f.ED.trim()) deadlines.ED = f.ED.trim();
  if (f.EA.trim()) deadlines.EA = f.EA.trim();
  if (f.REA.trim()) deadlines.REA = f.REA.trim();
  if (f.RD.trim()) deadlines.RD = f.RD.trim();
  return {
    name: f.name.trim(),
    city: f.city.trim() || null,
    state: f.state.trim() || null,
    type: f.type === "" ? null : f.type,
    website: f.website.trim() || null,
    admit_rate: rate != null && Number.isFinite(rate) ? rate : null,
    common_app: f.common_app,
    deadlines: Object.keys(deadlines).length > 0 ? deadlines : null,
    notes: f.notes.trim() || null,
  };
}

function locationLabel(c: College): string {
  const parts = [c.city, c.state].filter((p) => p && p.trim());
  return parts.length ? parts.join(", ") : "—";
}

const TYPE_LABEL: Record<CollegeType, string> = {
  public: "Public",
  private: "Private",
  community: "Community",
  other: "Other",
};

const inputCls =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const labelCls =
  "block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1";

export function AdminCollegesPage() {
  const toast = useToast();
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // Form modal state. `editing` null = create; a row = edit.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<College | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Delete confirm state.
  const [toDelete, setToDelete] = useState<College | null>(null);
  const [deleting, setDeleting] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, formOpen);

  // Close the form on Escape (modal contract).
  useEffect(() => {
    if (!formOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !saving) {
        setFormOpen(false);
        setEditing(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formOpen, saving]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    const { data, error } = await supabase
      .from("colleges")
      .select(
        "id,name,city,state,type,website,admit_rate,common_app,deadlines,notes",
      )
      .order("name");
    if (!aliveRef.current) return;
    if (error) {
      setLoading(false);
      toast.error("Couldn't load colleges", error.message);
      return;
    }
    setColleges((data ?? []) as College[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = !q
      ? colleges
      : colleges.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.state?.toLowerCase().includes(q) ?? false),
        );
    return rows.slice(0, MAX_DISPLAY);
  }, [colleges, query]);

  const openCreate = (): void => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (c: College): void => {
    setEditing(c);
    setForm(formFromCollege(c));
    setFormOpen(true);
  };

  const closeForm = (): void => {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
  };

  const onSave = async (): Promise<void> => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const payload = payloadFromForm(form);
    const { error } = editing
      ? await supabase.from("colleges").update(payload).eq("id", editing.id)
      : await supabase.from("colleges").insert(payload);
    if (!aliveRef.current) return;
    setSaving(false);
    if (error) {
      toast.error(
        editing ? "Couldn't update college" : "Couldn't add college",
        error.message,
      );
      return;
    }
    toast.success(editing ? "College updated" : "College added");
    setFormOpen(false);
    setEditing(null);
    void load();
  };

  const onDelete = async (): Promise<void> => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from("colleges")
      .delete()
      .eq("id", toDelete.id);
    if (!aliveRef.current) return;
    setDeleting(false);
    if (error) {
      toast.error("Couldn't delete college", error.message);
      return;
    }
    toast.success(`Deleted ${toDelete.name}`);
    setToDelete(null);
    void load();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Colleges
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            The shared college catalog students and counselors build lists from.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          Add college
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or state…"
        aria-label="Search colleges by name or state"
        className={inputCls}
      />

      {/* Table */}
      {loading ? (
        <SkeletonRows count={6} />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 px-4 py-10 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {query.trim()
              ? "No colleges match your search."
              : "No colleges in the catalog yet."}
          </p>
          {!query.trim() && (
            <button
              type="button"
              onClick={openCreate}
              className="mt-3 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              Add college
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200 dark:ring-slate-800">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Admit %</th>
                <th className="px-4 py-3">Common App</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {c.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {locationLabel(c)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {c.type ? TYPE_LABEL[c.type] : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {c.admit_rate == null
                      ? "—"
                      : `${(c.admit_rate * 100).toFixed(1)}%`}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {c.common_app ? "Yes" : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setToDelete(c)}
                        className="rounded-md ring-1 ring-rose-300 dark:ring-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {colleges.length > MAX_DISPLAY && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Showing the first {MAX_DISPLAY} of {colleges.length} colleges — refine
          your search to narrow the list.
        </p>
      )}

      {/* Create / Edit modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 py-10"
          onClick={closeForm}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="college-form-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 shadow-xl ring-1 ring-slate-200 dark:ring-slate-800"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
              <h2
                id="college-form-title"
                className="text-lg font-semibold text-slate-900 dark:text-slate-100"
              >
                {editing ? "Edit college" : "Add college"}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  &times;
                </span>
              </button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <label htmlFor="college-name" className={labelCls}>
                  Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="college-name"
                  data-autofocus
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="college-city" className={labelCls}>
                    City
                  </label>
                  <input
                    id="college-city"
                    type="text"
                    value={form.city}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, city: e.target.value }))
                    }
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="college-state" className={labelCls}>
                    State
                  </label>
                  <input
                    id="college-state"
                    type="text"
                    value={form.state}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, state: e.target.value }))
                    }
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="college-type" className={labelCls}>
                    Type
                  </label>
                  <select
                    id="college-type"
                    value={form.type}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        type: e.target.value as FormState["type"],
                      }))
                    }
                    className={inputCls}
                  >
                    <option value="">—</option>
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                    <option value="community">Community</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="college-admit" className={labelCls}>
                    Admit rate (0–1)
                  </label>
                  <input
                    id="college-admit"
                    type="number"
                    min={0}
                    max={1}
                    step={0.001}
                    value={form.admit_rate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, admit_rate: e.target.value }))
                    }
                    placeholder="e.g. 0.045"
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="college-website" className={labelCls}>
                  Website
                </label>
                <input
                  id="college-website"
                  type="url"
                  value={form.website}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, website: e.target.value }))
                  }
                  placeholder="https://…"
                  className={inputCls}
                />
              </div>

              <label className="flex items-center gap-3 py-1">
                <input
                  type="checkbox"
                  checked={form.common_app}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, common_app: e.target.checked }))
                  }
                  className="h-5 w-5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-700 dark:text-slate-200">
                  Accepts the Common App
                </span>
              </label>

              <fieldset>
                <legend className={labelCls}>Application deadlines</legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(["ED", "EA", "REA", "RD"] as const).map((key) => (
                    <div key={key}>
                      <label
                        htmlFor={`college-deadline-${key}`}
                        className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
                      >
                        {key}
                      </label>
                      <input
                        id={`college-deadline-${key}`}
                        type="text"
                        value={form[key]}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, [key]: e.target.value }))
                        }
                        placeholder="Nov 1"
                        className={inputCls}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="college-notes" className={labelCls}>
                  Notes
                </label>
                <textarea
                  id="college-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 px-5 py-4">
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void onSave();
                }}
                disabled={saving || !form.name.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {saving
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Add college"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {toDelete && (
        <ConfirmDialog
          title="Delete college"
          body={
            <>
              Delete <strong>{toDelete.name}</strong> from the shared catalog?
              This can't be undone.
            </>
          }
          confirmLabel="Delete college"
          destructive
          busy={deleting}
          onConfirm={() => {
            void onDelete();
          }}
          onCancel={() => {
            if (!deleting) setToDelete(null);
          }}
        />
      )}
    </div>
  );
}
