/**
 * ProgramsPanel — manage the per-course pickleball PROGRAM catalog (a "program"
 * is a named coaching track/series the course offers; shared by the player and
 * coach tracks). Backed by the 0150 RPCs:
 *   - pk_upsert_program(course, id|null, name, description, sort_order) — create/edit
 *   - pk_archive_program(id, archived)                                  — archive toggle
 * Reads come straight from `pickleball_programs` (RLS lets the educator read).
 *
 * UX (matches the Modules-page bar):
 *   - inline rename: click the name to edit, Enter saves / Esc cancels,
 *   - one-click archive toggle on the status badge,
 *   - reorder with up/down controls that persist sort_order,
 *   - "+ Program" inline add, optimistic local update, toast feedback,
 *   - skeleton load, empty state with CTA.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { KebabMenu } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";

interface Program {
  id: string;
  course_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  archived: boolean;
  created_at: string;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";

function sortPrograms(rows: Program[]): Program[] {
  return [...rows].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.created_at.localeCompare(b.created_at);
  });
}

export function ProgramsPanel({ courseId }: { courseId: string }) {
  const toast = useToast();
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Inline rename state.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Add-program state.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const newNameRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pickleball_programs")
      .select("*")
      .eq("course_id", courseId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (!aliveRef.current) return;
    if (error) {
      toast.error("Couldn't load programs", error.message);
      setPrograms([]);
    } else {
      setPrograms(sortPrograms((data ?? []) as Program[]));
    }
    setLoading(false);
  }, [courseId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const beginAdd = (): void => {
    setAdding(true);
    setNewName("");
    // focus after the input mounts
    window.setTimeout(() => newNameRef.current?.focus(), 0);
  };

  const onAdd = async (): Promise<void> => {
    const name = newName.trim();
    if (name === "") {
      toast.error("Name required", "Give the program a name first.");
      return;
    }
    if (savingNew) return;
    setSavingNew(true);
    const nextOrder =
      programs.reduce((max, p) => Math.max(max, p.sort_order), -1) + 1;
    const { data, error } = await supabase.rpc("pk_upsert_program", {
      p_course_id: courseId,
      p_id: null,
      p_name: name,
      p_description: null,
      p_sort_order: nextOrder,
    });
    if (!aliveRef.current) return;
    setSavingNew(false);
    if (error) {
      toast.error("Couldn't add program", error.message);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as Program | null;
    if (row) setPrograms((prev) => sortPrograms([...prev, row]));
    setAdding(false);
    setNewName("");
    toast.success("Program added");
  };

  const beginRename = (p: Program): void => {
    setEditingId(p.id);
    setEditName(p.name);
  };

  const onRename = async (p: Program): Promise<void> => {
    const name = editName.trim();
    if (name === "") {
      toast.error("Name required", "A program needs a name.");
      return;
    }
    if (name === p.name) {
      setEditingId(null);
      return;
    }
    setBusyId(p.id);
    const { data, error } = await supabase.rpc("pk_upsert_program", {
      p_course_id: courseId,
      p_id: p.id,
      p_name: name,
      p_description: p.description,
      p_sort_order: p.sort_order,
    });
    if (!aliveRef.current) return;
    setBusyId(null);
    if (error) {
      toast.error("Couldn't rename program", error.message);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as Program | null;
    if (row) {
      setPrograms((prev) =>
        sortPrograms(prev.map((x) => (x.id === row.id ? row : x))),
      );
    }
    setEditingId(null);
    toast.success("Program renamed");
  };

  const onToggleArchive = async (p: Program): Promise<void> => {
    setBusyId(p.id);
    // Optimistic flip.
    const nextArchived = !p.archived;
    setPrograms((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, archived: nextArchived } : x)),
    );
    const { data, error } = await supabase.rpc("pk_archive_program", {
      p_id: p.id,
      p_archived: nextArchived,
    });
    if (!aliveRef.current) return;
    setBusyId(null);
    if (error) {
      // Roll back.
      setPrograms((prev) =>
        prev.map((x) =>
          x.id === p.id ? { ...x, archived: p.archived } : x,
        ),
      );
      toast.error("Couldn't update program", error.message);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as Program | null;
    if (row) {
      setPrograms((prev) =>
        sortPrograms(prev.map((x) => (x.id === row.id ? row : x))),
      );
    }
    toast.success(nextArchived ? "Program archived" : "Program restored");
  };

  const move = async (p: Program, dir: -1 | 1): Promise<void> => {
    const ordered = sortPrograms(programs);
    const idx = ordered.findIndex((x) => x.id === p.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;
    const other = ordered[swapIdx];
    setBusyId(p.id);

    // Optimistic swap of sort_order between the two rows.
    const pOrder = p.sort_order;
    const otherOrder = other.sort_order;
    const orderForP = otherOrder === pOrder ? otherOrder + dir : otherOrder;
    setPrograms((prev) =>
      sortPrograms(
        prev.map((x) => {
          if (x.id === p.id) return { ...x, sort_order: orderForP };
          if (x.id === other.id) return { ...x, sort_order: pOrder };
          return x;
        }),
      ),
    );

    const results = await Promise.all([
      supabase.rpc("pk_upsert_program", {
        p_course_id: courseId,
        p_id: p.id,
        p_name: p.name,
        p_description: p.description,
        p_sort_order: orderForP,
      }),
      supabase.rpc("pk_upsert_program", {
        p_course_id: courseId,
        p_id: other.id,
        p_name: other.name,
        p_description: other.description,
        p_sort_order: pOrder,
      }),
    ]);
    if (!aliveRef.current) return;
    setBusyId(null);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      toast.error("Couldn't reorder", failed.error.message);
      void load();
    }
  };

  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Programs
        </h3>
        {!loading && programs.length > 0 && !adding && (
          <button
            type="button"
            onClick={beginAdd}
            className="min-h-[40px] rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + Program
          </button>
        )}
      </div>

      {adding && (
        <div className="flex items-center gap-2 rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-3">
          <input
            ref={newNameRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onAdd();
              } else if (e.key === "Escape") {
                setAdding(false);
              }
            }}
            placeholder="Program name (e.g. Beginner Clinic)"
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => {
              void onAdd();
            }}
            disabled={savingNew}
            className="min-h-[40px] shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {savingNew ? "Adding…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="min-h-[40px] shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonRows count={3} />
      ) : programs.length === 0 ? (
        <EmptyState
          icon="sparkles"
          title="No programs yet"
          body="Programs are the coaching tracks this course offers — clinics, ladders, private series. Add your first to start organizing lessons around it."
          cta={{ label: "Add a program", onClick: beginAdd }}
        />
      ) : (
        <ul className="space-y-2">
          {programs.map((p, i) => {
            const isEditing = editingId === p.id;
            const isBusy = busyId === p.id;
            return (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5"
              >
                {/* Reorder controls (visible affordance). */}
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0 || isBusy}
                    onClick={() => {
                      void move(p, -1);
                    }}
                    className="flex h-5 w-6 items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden
                    >
                      <path
                        d="M5 12l5-5 5 5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === programs.length - 1 || isBusy}
                    onClick={() => {
                      void move(p, 1);
                    }}
                    className="flex h-5 w-6 items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden
                    >
                      <path
                        d="M5 8l5 5 5-5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                {/* Name — inline rename. */}
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <input
                      autoFocus
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void onRename(p);
                        } else if (e.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      onBlur={() => {
                        void onRename(p);
                      }}
                      className={`${inputCls} min-h-[40px]`}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => beginRename(p)}
                      title="Click to rename"
                      className={`group inline-flex max-w-full items-center gap-1.5 truncate rounded px-1 py-0.5 text-left text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        p.archived ? "line-through text-slate-400 dark:text-slate-500" : ""
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      <svg
                        className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden
                      >
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5a1 1 0 01-.464.263l-3 .8a.5.5 0 01-.61-.61l.8-3a1 1 0 01.263-.464l8.5-8.5z" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* One-click archive toggle on the status badge. */}
                <button
                  type="button"
                  onClick={() => {
                    void onToggleArchive(p);
                  }}
                  disabled={isBusy}
                  title={
                    p.archived ? "Click to restore" : "Click to archive"
                  }
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${
                    p.archived
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                  }`}
                >
                  {p.archived ? "Archived" : "Active"}
                </button>

                <KebabMenu
                  options={[
                    {
                      label: "Rename",
                      onSelect: () => beginRename(p),
                    },
                    {
                      label: p.archived ? "Restore" : "Archive",
                      onSelect: () => {
                        void onToggleArchive(p);
                      },
                    },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
