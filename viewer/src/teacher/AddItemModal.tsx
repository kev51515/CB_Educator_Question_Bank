/**
 * AddItemModal
 * ============
 * Add a row to a module. Three shapes:
 *   - assignment: pick from the course's assignments that aren't already
 *                 referenced by any module_item.
 *   - header:     a label/divider — just a title.
 *   - link:       title + url.
 *
 * Position is set to max(existing item position) + 1 client-side from the
 * already-loaded items list.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { ResponsiveModal } from "@/components";
import { useAssignments } from "./useAssignments";
import type { CourseModule, ModuleItemType } from "./useCourseModules";

interface AddItemModalProps {
  open: boolean;
  classId: string;
  module: CourseModule | null;
  /** Already-claimed assignment IDs (so we don't show them in the dropdown). */
  usedAssignmentIds: ReadonlySet<string>;
  onClose: () => void;
  onCreated: () => void;
}

type AddItemType = Extract<ModuleItemType, "assignment" | "header" | "link">;

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function AddItemModal({
  open,
  classId,
  module,
  usedAssignmentIds,
  onClose,
  onCreated,
}: AddItemModalProps) {
  const { assignments } = useAssignments(open ? classId : null);
  const toast = useToast();

  const [itemType, setItemType] = useState<AddItemType>("assignment");
  const [assignmentId, setAssignmentId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement | HTMLInputElement | null>(
    null,
  );

  const availableAssignments = useMemo(
    () =>
      assignments.filter(
        (a) => !a.archived && !usedAssignmentIds.has(a.id),
      ),
    [assignments, usedAssignmentIds],
  );

  useEffect(() => {
    if (!open) return;
    setItemType("assignment");
    setAssignmentId("");
    setTitle("");
    setUrl("");
    setError(null);
  }, [open]);

  // Auto-focus the first interactive field when the modal opens (or when the
  // item type changes and the relevant field re-mounts). Defer to next tick
  // so the ref callback has fired.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      firstFieldRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, itemType]);

  if (!module) return null;

  const maxPosition = module.items.reduce(
    (max, it) => (it.position > max ? it.position : max),
    -1,
  );

  // Live validation: derive why Save can't fire yet, so we can disable the
  // button and surface the reason via a tooltip instead of only failing on
  // submit. Returning null = ready to submit.
  const submitDisabledReason: string | null = (() => {
    if (itemType === "assignment") {
      if (availableAssignments.length === 0)
        return "No unassigned assignments in this course.";
      if (!assignmentId) return "Choose an assignment first.";
      return null;
    }
    if (itemType === "header") {
      if (!title.trim()) return "Enter header text first.";
      return null;
    }
    // link
    if (!title.trim()) return "Enter a title first.";
    if (!url.trim()) return "Enter a URL first.";
    return null;
  })();

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    let payloadTitle = title.trim();
    let payloadUrl: string | null = null;
    let payloadRef: string | null = null;

    if (itemType === "assignment") {
      if (!assignmentId) {
        setError("Please choose an assignment.");
        return;
      }
      const chosen = availableAssignments.find((a) => a.id === assignmentId);
      if (!chosen) {
        setError("That assignment is no longer available.");
        return;
      }
      payloadRef = chosen.id;
      // Why: the spec says the title is a *copy* of the assignment title at
      // insert time so the teacher can override later. If they didn't type
      // a custom title we fall back to the assignment's own title.
      if (!payloadTitle) payloadTitle = chosen.title;
    } else if (itemType === "link") {
      if (!payloadTitle) {
        setError("Please enter a title.");
        return;
      }
      if (!url.trim()) {
        setError("Please enter a URL.");
        return;
      }
      payloadUrl = url.trim();
    } else {
      // header
      if (!payloadTitle) {
        setError("Please enter a header title.");
        return;
      }
    }

    setBusy(true);
    try {
      const { error: insertError } = await supabase.from("module_items").insert({
        module_id: module.id,
        position: maxPosition + 1,
        item_type: itemType,
        item_ref_id: payloadRef,
        title: payloadTitle,
        url: payloadUrl,
      });

      if (insertError) {
        setError(insertError.message);
        toast.error("Couldn't add item", insertError.message);
        return;
      }
      toast.success("Item added", payloadTitle);
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg = getErrorMessage(err, "Failed to add item.");
      setError(msg);
      toast.error("Couldn't add item", msg);
    } finally {
      setBusy(false);
    }
  };

  const footer = (
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
        form="add-item-form"
        disabled={busy || submitDisabledReason !== null}
        title={submitDisabledReason ?? undefined}
        aria-describedby={
          submitDisabledReason ? "add-item-submit-hint" : undefined
        }
        className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy ? "Adding…" : "Add item"}
      </button>
      {submitDisabledReason && (
        <span id="add-item-submit-hint" className="sr-only">
          {submitDisabledReason}
        </span>
      )}
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title={`Add item to ${module.name}`}
      size="md"
      footer={footer}
    >
      <form
        id="add-item-form"
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        className="space-y-4"
      >
        <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Item type
            </legend>
            {(
              [
                ["assignment", "Assignment"],
                ["header", "Header"],
                ["link", "Link"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
              >
                <input
                  type="radio"
                  name="add-item-type"
                  value={value}
                  checked={itemType === value}
                  onChange={() => setItemType(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>

          {itemType === "assignment" && (
            <div className="space-y-1">
              <label
                htmlFor="add-item-assignment"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Assignment
              </label>
              {availableAssignments.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 rounded-md bg-slate-50 dark:bg-slate-800/50 px-3 py-2 ring-1 ring-slate-200 dark:ring-slate-700">
                  No unassigned assignments in this course. Create one in the
                  Assignments tab first.
                </p>
              ) : (
                <select
                  id="add-item-assignment"
                  data-autofocus
                  ref={(el) => {
                    firstFieldRef.current = el;
                  }}
                  value={assignmentId}
                  onChange={(e) => setAssignmentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Choose an assignment…</option>
                  {availableAssignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              )}
              <div className="space-y-1 pt-2">
                <label
                  htmlFor="add-item-title-override"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Display title{" "}
                  <span className="text-slate-500 dark:text-slate-400">(optional override)</span>
                </label>
                <input
                  id="add-item-title-override"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Defaults to the assignment's title"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {itemType === "header" && (
            <div className="space-y-1">
              <label
                htmlFor="add-item-header-title"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Header text
              </label>
              <input
                id="add-item-header-title"
                ref={(el) => {
                  firstFieldRef.current = el;
                }}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Readings"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
          )}

          {itemType === "link" && (
            <>
              <div className="space-y-1">
                <label
                  htmlFor="add-item-link-title"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Title
                </label>
                <input
                  id="add-item-link-title"
                  ref={(el) => {
                    firstFieldRef.current = el;
                  }}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Course slides"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="add-item-link-url"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  URL
                </label>
                <input
                  id="add-item-link-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
            >
              {error}
            </div>
          )}
      </form>
    </ResponsiveModal>
  );
}
