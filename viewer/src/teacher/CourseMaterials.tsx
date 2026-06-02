/**
 * CourseMaterials
 * ===============
 * Teacher-side Materials tab for a course. Shows the unified file + link
 * library scoped to the current course, with affordances for staff
 * (teachers + admins) to upload files, paste links, edit titles /
 * descriptions, and delete rows.
 *
 * Backed by `useMaterials(courseId)` which:
 *   - SELECTs `course_materials` filtered to this course
 *   - mints 1-hour signed Storage URLs for kind='file' rows
 *   - subscribes to postgres_changes so a second tab sees inserts/updates
 *
 * Delete behavior: for kind='file' rows we also remove the orphan Storage
 * object after the DB row is gone. Best-effort — if the storage delete fails
 * (network, RLS regression) we surface a warning but don't roll back the DB
 * delete because the row is already gone and the user has moved on.
 *
 * Edit is in-place: title + description only. We don't expose re-upload (the
 * spec calls for delete + re-add) or kind switching (file ↔ link); those are
 * deliberately out of scope for v1.
 *
 * Wave 8C UX upgrade — matches the ModulesPage bar:
 *   - Inline rename on the title (click → input → Enter/blur saves, Esc
 *     cancels).
 *   - One-click Draft / Published badge toggles `published` via
 *     `useOptimistic` (rolls back + toasts on failure).
 *   - Toasts replace the inline rose banner on delete success/error.
 *   - 6-dot drag handle visible on hover; HTML5 drag-and-drop reorders rows
 *     by writing the new `position` column. A "Move up / Move down" pair in
 *     the kebab acts as a touch / a11y fallback for users who can't drag.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useClassContext } from "./classLayoutContext";
import { useProfile } from "../lib/profile";
import { AddMaterialModal, type AddMaterialMode } from "./AddMaterialModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { useMaterials, type CourseMaterial } from "./useMaterials";
import { KebabMenu, useOptimistic, type KebabMenuOption } from "@/components";
import { useToast } from "../components/Toast";
import { EmptyState } from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { useFocusTrap } from "../hooks";

const STORAGE_BUCKET = "course-materials";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const rounded = n >= 10 || i === 0 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${rounded} ${units[i]}`;
}

function safeHostname(raw: string | null): string {
  if (!raw) return "";
  try {
    return new URL(raw).hostname;
  } catch {
    return "";
  }
}

/** Six-dot Canvas-style drag handle — copied from ModulesPage. */
function DragHandle({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      width={14}
      height={20}
      viewBox="0 0 14 20"
      aria-hidden
      style={{ touchAction: "none" }}
      className={`cursor-grab active:cursor-grabbing ${className ?? ""}`}
    >
      <circle cx={4} cy={5} r={1.5} fill="currentColor" />
      <circle cx={10} cy={5} r={1.5} fill="currentColor" />
      <circle cx={4} cy={10} r={1.5} fill="currentColor" />
      <circle cx={10} cy={10} r={1.5} fill="currentColor" />
      <circle cx={4} cy={15} r={1.5} fill="currentColor" />
      <circle cx={10} cy={15} r={1.5} fill="currentColor" />
    </svg>
  );
}

/**
 * Click-to-edit title field — mirrors ModulesPage's `InlineRename`. Enter
 * or blur saves; Esc cancels; empty / unchanged values collapse back to the
 * original. The button keeps the title visually identical to the static
 * label so hover is the only affordance — same as Modules.
 */
interface InlineTitleProps {
  value: string;
  href: string | null;
  isFile: boolean;
  onSave: (next: string) => Promise<void>;
}

function InlineTitle({ value, href, isFile, onSave }: InlineTitleProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(async (): Promise<void> => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    try {
      await onSave(trimmed);
      // Only close on success; throws keep the input open with the user's
      // typed value so they can retry instead of losing it.
      setEditing(false);
    } catch {
      // Keep editing=true; the parent handler already toasted.
    }
  }, [draft, onSave, value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        onBlur={() => {
          void commit();
        }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-800 ring-1 ring-indigo-400 rounded-md px-2 py-0.5 text-base font-semibold text-slate-900 dark:text-slate-100 w-full"
      />
    );
  }

  // Render the link as the title — but a small pencil on hover invites the
  // rename flow. Clicking the pencil enters edit mode without following the
  // link.
  const pencil = (
    <button
      type="button"
      aria-label="Rename"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setEditing(true);
      }}
      className="opacity-60 hover:opacity-100 transition text-slate-400 flex-none inline-flex items-center justify-center min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 md:p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <svg width={12} height={12} viewBox="0 0 16 16" aria-hidden>
        <path
          fill="currentColor"
          d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-1.66 1.66l-3.56-3.56l1.66-1.66Zm-2.6 2.6L2.158 10.28a1.75 1.75 0 0 0-.479.864l-.7 2.91a.75.75 0 0 0 .907.907l2.91-.7a1.75 1.75 0 0 0 .864-.479l6.254-6.254l-3.56-3.56Z"
        />
      </svg>
    </button>
  );

  if (href) {
    return (
      <span className="group inline-flex items-center gap-1 min-w-0">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          download={isFile ? value : undefined}
          className="text-base font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-700 dark:hover:text-indigo-300 truncate"
        >
          {value}
        </a>
        {pencil}
      </span>
    );
  }

  return (
    <span className="group inline-flex items-center gap-1 min-w-0">
      <span
        className="text-base font-semibold text-slate-400 dark:text-slate-500 truncate"
        title="Link unavailable"
      >
        {value}
      </span>
      {pencil}
    </span>
  );
}

/**
 * One-click published / draft badge — clicking flips `published` via
 * useOptimistic. Re-keyed by the server value so a realtime refresh resets
 * the inner optimistic seed.
 */
interface PublishBadgeProps {
  published: boolean;
  rowKey: string;
  onCommit: (next: boolean) => Promise<void>;
}

function PublishBadgeInner({
  published,
  onCommit,
}: Omit<PublishBadgeProps, "rowKey">): JSX.Element {
  const [value, apply] = useOptimistic<boolean>(published);
  const [busy, setBusy] = useState(false);

  const toggle = async (): Promise<void> => {
    setBusy(true);
    await apply({
      optimistic: (cur) => !cur,
      commit: async () => {
        await onCommit(!value);
      },
      successMessage: value ? "Unpublished" : "Published",
    });
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={() => {
        void toggle();
      }}
      disabled={busy}
      title={value ? "Published — click to unpublish" : "Draft — click to publish"}
      className={`rounded-full min-h-[40px] md:min-h-0 inline-flex items-center justify-center px-3 md:px-2 py-1.5 md:py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 transition ${
        value
          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
          : "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-900 hover:bg-amber-200 dark:hover:bg-amber-900/60"
      } ${busy ? "opacity-60 cursor-wait" : ""}`}
    >
      {value ? "Published" : "Draft"}
    </button>
  );
}

function PublishBadge(props: PublishBadgeProps): JSX.Element {
  const { rowKey, ...rest } = props;
  return <PublishBadgeInner key={`${rowKey}:${rest.published}`} {...rest} />;
}

interface MaterialCardProps {
  material: CourseMaterial;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPublishCommit: (next: boolean) => Promise<void>;
  onRenameCommit: (next: string) => Promise<void>;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  isDraggedOver: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  actionBusy: boolean;
  // Bulk-select wiring
  selectMode: boolean;
  selected: boolean;
  onToggleSelected: () => void;
}

function MaterialCard({
  material,
  canEdit,
  onEdit,
  onDelete,
  onPublishCommit,
  onRenameCommit,
  onMoveUp,
  onMoveDown,
  isDraggedOver,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  actionBusy,
  selectMode,
  selected,
  onToggleSelected,
}: MaterialCardProps) {
  const isFile = material.kind === "file";
  const href = isFile ? material.download_url : material.url;
  const meta = isFile
    ? formatBytes(material.file_size)
    : safeHostname(material.url);

  return (
    <article
      draggable={canEdit}
      onDragStart={(e) => {
        if (!canEdit) return;
        // Prevent native image preview from picking the title link.
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (!canEdit) return;
        onDragOver(e);
      }}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        onDrop();
      }}
      className={`group rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 p-4 shadow-sm transition ${
        isDragging ? "opacity-40" : ""
      } ${
        isDraggedOver
          ? "ring-2 ring-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/30"
          : ""
      } ${selectMode && selected ? "ring-2 ring-indigo-400 dark:ring-indigo-600" : ""}`}
    >
      <div className="flex items-start gap-3">
        {selectMode && canEdit && (
          <label className="mt-1 flex-none inline-flex items-center justify-center p-1 cursor-pointer">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelected}
              onClick={(e) => e.stopPropagation()}
              aria-label={selected ? "Deselect material" : "Select material"}
              className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
          </label>
        )}
        {canEdit && (
          <DragHandle className="mt-2 text-slate-400 flex-none opacity-60 hover:opacity-100 transition" />
        )}

        <span
          aria-hidden
          className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-100 dark:ring-indigo-900 text-lg"
        >
          {isFile ? "📄" : "🔗"}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit ? (
              <InlineTitle
                value={material.title}
                href={href}
                isFile={isFile}
                onSave={onRenameCommit}
              />
            ) : href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                download={isFile ? material.title : undefined}
                className="text-base font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-700 dark:hover:text-indigo-300 truncate"
              >
                {material.title}
              </a>
            ) : (
              <span
                className="text-base font-semibold text-slate-400 dark:text-slate-500 truncate"
                title="Link unavailable"
              >
                {material.title}
              </span>
            )}
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700">
              {isFile ? "File" : "Link"}
            </span>
            {canEdit ? (
              <PublishBadge
                published={material.published}
                rowKey={`material:${material.id}`}
                onCommit={onPublishCommit}
              />
            ) : (
              !material.published && (
                <span className="rounded-full bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900">
                  Draft
                </span>
              )
            )}
          </div>
          {meta && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {meta}
            </p>
          )}
          {material.description && (
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
              {material.description}
            </p>
          )}
        </div>

        {canEdit && (
          <div className="shrink-0">
            <KebabMenu
              options={(
                [
                  { label: "Edit", onSelect: onEdit },
                  {
                    label: "Move up",
                    disabled: !onMoveUp,
                    hint: !onMoveUp ? "Already at the top" : undefined,
                    onSelect: () => onMoveUp?.(),
                  },
                  {
                    label: "Move down",
                    disabled: !onMoveDown,
                    hint: !onMoveDown ? "Already at the bottom" : undefined,
                    onSelect: () => onMoveDown?.(),
                  },
                  {
                    label: "Delete…",
                    destructive: true,
                    disabled: actionBusy,
                    hint: actionBusy ? "Working…" : undefined,
                    onSelect: onDelete,
                  },
                ] satisfies KebabMenuOption[]
              )}
            />
          </div>
        )}
      </div>
    </article>
  );
}

interface EditModalProps {
  material: CourseMaterial;
  busy: boolean;
  error: string | null;
  onSave: (title: string, description: string | null) => void;
  onCancel: () => void;
}

function EditMaterialModal({
  material,
  busy,
  error,
  onSave,
  onCancel,
}: EditModalProps) {
  const [title, setTitle] = useState(material.title);
  const [description, setDescription] = useState(material.description ?? "");
  const titleRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);

  useEffect(() => {
    const id = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const trimmedDescription = description.trim();
    onSave(trimmedTitle, trimmedDescription || null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit material"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Edit material
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Update the title or description.{" "}
              {material.kind === "file"
                ? "To replace the file, delete and re-upload."
                : "To change the URL, delete and re-add."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!busy) onCancel();
            }}
            aria-label="Close"
            className="rounded-md inline-flex items-center justify-center min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 md:p-1 -mt-1 -mr-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 flex-none"
          >
            ✕
          </button>
        </header>

        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
            >
              {error}
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Title
            </span>
            <input
              ref={titleRef}
              data-autofocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Description{" "}
              <span className="text-slate-500 dark:text-slate-400 font-normal">(optional)</span>
            </span>
            <div className="mt-1">
              <MarkdownEditor
                value={description}
                onChange={setDescription}
                minHeight={120}
                characterLimit={500}
              />
            </div>
          </label>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || title.trim().length === 0}
              className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ConfirmDeleteState {
  material: CourseMaterial;
}

export function CourseMaterials() {
  const { cls } = useClassContext();
  const { profile } = useProfile();
  const { materials, loading, error, refresh } = useMaterials(cls.id);
  const toast = useToast();

  const [addMode, setAddMode] = useState<AddMaterialMode | null>(null);
  const [editTarget, setEditTarget] = useState<CourseMaterial | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteState | null>(
    null,
  );
  const [actionBusy, setActionBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Drag state — id of the material currently being dragged, and the id
  // the cursor is hovering over (so we can highlight the drop target).
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Bulk-select state — mirrors ModulesPage. The toolbar "Select"/"Done"
  // pill toggles select mode; checkboxes render on every card while it's
  // on; the sticky bar appears once at least one row is selected.
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState<boolean>(false);

  const exitSelectMode = useCallback((): void => {
    setSelectMode(false);
    setSelectedIds(new Set<string>());
  }, []);

  const toggleSelected = useCallback((id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Auto-exit select mode on window resize + browser back.
  useEffect(() => {
    if (!selectMode) return;
    const onResize = (): void => exitSelectMode();
    const onPop = (): void => exitSelectMode();
    window.addEventListener("resize", onResize);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("popstate", onPop);
    };
  }, [selectMode, exitSelectMode]);

  // Prune selection if materials disappear (delete elsewhere, refresh, etc.).
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const live = new Set(materials.map((m) => m.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (live.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelectedIds(next);
  }, [materials, selectedIds]);

  // Route is teacher-gated by AuthGate; we still guard the affordances on
  // profile presence so the layout doesn't flash during the profile fetch.
  const canEdit =
    profile?.role === "teacher" || profile?.role === "admin";
  const uploaderId = profile?.id ?? "";

  // Next position: 1 past the current max so new rows append to the end.
  const nextPosition =
    materials.length === 0
      ? 0
      : Math.max(...materials.map((m) => m.position)) + 1;

  /** Persist the new title — toasts on success / failure. */
  const onRenameCommit = useCallback(
    async (material: CourseMaterial, next: string): Promise<void> => {
      const { error: updError } = await supabase
        .from("course_materials")
        .update({ title: next })
        .eq("id", material.id);
      if (updError) {
        toast.error("Couldn't rename material", updError.message);
        // Throw so InlineTitle keeps the draft open for retry instead of
        // resolving as success and discarding the user's typed value.
        throw new Error(updError.message);
      }
      toast.success("Material renamed", next);
      void refresh();
    },
    [refresh, toast],
  );

  /**
   * Persist the new `published` flag. Throws so the inner useOptimistic
   * wrapper can roll back the badge UI on failure.
   */
  const onPublishCommit = useCallback(
    async (material: CourseMaterial, next: boolean): Promise<void> => {
      const { error: updError } = await supabase
        .from("course_materials")
        .update({ published: next })
        .eq("id", material.id);
      if (updError) throw new Error(updError.message);
      void refresh();
    },
    [refresh],
  );

  /**
   * Reorder materials by writing new `position` values. We splice the
   * dragged row into its new index and then UPDATE every row whose
   * position changed (cheap — materials lists are short, typically <50).
   */
  const reorder = useCallback(
    async (sourceId: string, targetId: string): Promise<void> => {
      if (sourceId === targetId) return;
      const sorted = [...materials].sort((a, b) => a.position - b.position);
      const srcIdx = sorted.findIndex((m) => m.id === sourceId);
      const tgtIdx = sorted.findIndex((m) => m.id === targetId);
      if (srcIdx < 0 || tgtIdx < 0) return;
      const [moved] = sorted.splice(srcIdx, 1);
      sorted.splice(tgtIdx, 0, moved);

      // Compute the changeset — only rows whose position will actually
      // change (saves a handful of UPDATEs vs. blindly numbering all).
      const updates: { id: string; position: number }[] = [];
      sorted.forEach((m, i) => {
        if (m.position !== i) updates.push({ id: m.id, position: i });
      });
      if (updates.length === 0) return;

      // Best-effort sequential UPDATE. PostgREST doesn't honor mixed-row
      // UPSERT updates well, so one PATCH per row keeps things simple and
      // RLS-friendly. With <50 rows this is sub-100ms.
      for (const u of updates) {
        const { error: updError } = await supabase
          .from("course_materials")
          .update({ position: u.position })
          .eq("id", u.id);
        if (updError) {
          toast.error("Couldn't reorder", updError.message);
          void refresh();
          return;
        }
      }
      toast.success("Materials reordered");
      void refresh();
    },
    [materials, refresh, toast],
  );

  /** Move-up / move-down fallback for touch + a11y users. */
  const moveBy = useCallback(
    (material: CourseMaterial, delta: -1 | 1): void => {
      const sorted = [...materials].sort((a, b) => a.position - b.position);
      const idx = sorted.findIndex((m) => m.id === material.id);
      const targetIdx = idx + delta;
      if (idx < 0 || targetIdx < 0 || targetIdx >= sorted.length) return;
      void reorder(material.id, sorted[targetIdx].id);
    },
    [materials, reorder],
  );

  const onSaveEdit = async (
    title: string,
    description: string | null,
  ): Promise<void> => {
    if (!editTarget) return;
    setActionBusy(true);
    setEditError(null);
    try {
      const { error: updError } = await supabase
        .from("course_materials")
        .update({ title, description })
        .eq("id", editTarget.id);
      if (updError) {
        setEditError(updError.message);
        return;
      }
      setEditTarget(null);
      toast.success("Material updated", title);
      void refresh();
    } catch (err: unknown) {
      setEditError(getErrorMessage(err, "Failed to update material."));
    } finally {
      setActionBusy(false);
    }
  };

  const onConfirmDelete = async (
    material: CourseMaterial,
  ): Promise<void> => {
    setActionBusy(true);
    try {
      const { error: delError } = await supabase
        .from("course_materials")
        .delete()
        .eq("id", material.id);
      if (delError) {
        toast.error("Couldn't delete material", delError.message);
        return;
      }

      // Best-effort orphan cleanup: the DB row is already gone (RLS cascade
      // would also clean up if Storage had ON DELETE wired, but it doesn't).
      // If the Storage delete fails we surface a soft warning toast but
      // treat the overall delete as successful — the row is invisible to
      // students either way because the SELECT policy gates on the metadata
      // row.
      if (material.kind === "file" && material.file_path) {
        const { error: storageError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([material.file_path]);
        if (storageError) {
          toast.warning(
            "Material deleted",
            `Storage cleanup may need a retry: ${storageError.message}`,
          );
        } else {
          toast.success("Material deleted", material.title);
        }
      } else {
        toast.success("Material deleted", material.title);
      }

      setConfirmDelete(null);
      void refresh();
    } catch (err: unknown) {
      toast.error(
        "Couldn't delete material",
        getErrorMessage(err, "Failed to delete material."),
      );
    } finally {
      setActionBusy(false);
    }
  };

  // ---- Bulk-select actions ----
  const bulkSetPublished = useCallback(
    async (nextPublished: boolean): Promise<void> => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      setBulkBusy(true);
      const { error: updError } = await supabase
        .from("course_materials")
        .update({ published: nextPublished })
        .in("id", ids);
      setBulkBusy(false);
      if (updError) {
        toast.error(
          nextPublished
            ? "Couldn't publish materials"
            : "Couldn't unpublish materials",
          updError.message,
        );
        return;
      }
      const verb = nextPublished ? "published" : "unpublished";
      toast.success(
        nextPublished ? "Materials published" : "Materials unpublished",
        `${ids.length} material${ids.length === 1 ? "" : "s"} ${verb}.`,
      );
      exitSelectMode();
      void refresh();
    },
    [exitSelectMode, refresh, selectedIds, toast],
  );

  const bulkDelete = useCallback(async (): Promise<void> => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    setBulkBusy(true);

    // Capture file paths BEFORE the DB delete so we can clean up storage
    // AFTERWARDS — if the DB delete fails we leave storage untouched (no
    // orphaned-row scenario). Matches the safer ordering used by the
    // single-row onConfirmDelete path.
    const filePaths = materials
      .filter((m) => ids.includes(m.id) && m.kind === "file" && m.file_path)
      .map((m) => m.file_path as string);

    const { error: delError } = await supabase
      .from("course_materials")
      .delete()
      .in("id", ids);
    if (delError) {
      setBulkBusy(false);
      setBulkDeleteOpen(false);
      toast.error("Couldn't delete materials", delError.message);
      return;
    }

    // DB delete succeeded — now best-effort remove the storage objects.
    // Ignore failures here: a dangling storage object is preferable to an
    // orphaned row pointing at a vanished file.
    if (filePaths.length > 0) {
      try {
        await supabase.storage.from(STORAGE_BUCKET).remove(filePaths);
      } catch {
        // ignored — see comment above
      }
    }

    setBulkBusy(false);
    setBulkDeleteOpen(false);
    toast.success(
      "Materials deleted",
      `${ids.length} material${ids.length === 1 ? "" : "s"} deleted.`,
    );
    exitSelectMode();
    void refresh();
  }, [exitSelectMode, materials, refresh, selectedIds, toast]);

  // Sorted-once view so move-up/down indices match the rendered order.
  const ordered = [...materials].sort((a, b) => a.position - b.position);

  return (
    <>
      <div className="space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Materials
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Upload files or paste links your students can download or open.
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              {materials.length > 0 && (
                selectMode ? (
                  <button
                    type="button"
                    onClick={exitSelectMode}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-400 dark:ring-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/60"
                  >
                    Done
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectMode(true)}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Select
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => setAddMode("file")}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Upload File
              </button>
              <button
                type="button"
                onClick={() => setAddMode("link")}
                className="rounded-lg bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium px-4 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Add link
              </button>
            </div>
          )}
        </header>

        {loading ? (
          <SkeletonRows count={4} rowClassName="h-20" />
        ) : error ? (
          <div
            role="alert"
            className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => {
                void refresh();
              }}
              className="shrink-0 rounded-md bg-white dark:bg-slate-900 ring-1 ring-rose-200 dark:ring-rose-900 px-3 py-1 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60"
            >
              Retry
            </button>
          </div>
        ) : ordered.length === 0 ? (
          <EmptyState
            title="No materials yet"
            body={
              canEdit
                ? "Upload a file or add a link to share resources with your students."
                : "Your teacher hasn't posted any materials yet."
            }
            cta={
              canEdit
                ? { label: "Upload your first file", onClick: () => setAddMode("file") }
                : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {ordered.map((m, idx) => (
              <MaterialCard
                key={m.id}
                material={m}
                canEdit={canEdit}
                onEdit={() => {
                  setEditError(null);
                  setEditTarget(m);
                }}
                onDelete={() => setConfirmDelete({ material: m })}
                onPublishCommit={(next) => onPublishCommit(m, next)}
                onRenameCommit={(next) => onRenameCommit(m, next)}
                onMoveUp={idx === 0 ? null : () => moveBy(m, -1)}
                onMoveDown={
                  idx === ordered.length - 1 ? null : () => moveBy(m, 1)
                }
                isDragging={draggedId === m.id}
                isDraggedOver={dragOverId === m.id && draggedId !== m.id}
                onDragStart={() => setDraggedId(m.id)}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverId(null);
                }}
                onDragOver={(e) => {
                  if (!draggedId || draggedId === m.id) return;
                  e.preventDefault();
                  if (dragOverId !== m.id) setDragOverId(m.id);
                }}
                onDrop={() => {
                  if (draggedId && draggedId !== m.id) {
                    void reorder(draggedId, m.id);
                  }
                  setDraggedId(null);
                  setDragOverId(null);
                }}
                actionBusy={actionBusy}
                selectMode={selectMode}
                selected={selectedIds.has(m.id)}
                onToggleSelected={() => toggleSelected(m.id)}
              />
            ))}
          </div>
        )}
      </div>

      {addMode !== null && (
        <AddMaterialModal
          open={true}
          initialTab={addMode}
          courseId={cls.id}
          uploaderId={uploaderId}
          nextPosition={nextPosition}
          onClose={() => setAddMode(null)}
          onCreated={() => {
            // Realtime fires too, but invoking refresh keeps the UI snappy
            // when the realtime ack is slow.
            void refresh();
          }}
        />
      )}

      {editTarget && (
        <EditMaterialModal
          material={editTarget}
          busy={actionBusy}
          error={editError}
          onSave={(title, description) => {
            void onSaveEdit(title, description);
          }}
          onCancel={() => {
            if (!actionBusy) {
              setEditTarget(null);
              setEditError(null);
            }
          }}
        />
      )}

      {canEdit && selectMode && selectedIds.size > 0 && (
        <div
          role="region"
          aria-label="Bulk material actions"
          className="fixed bottom-4 left-0 right-0 z-50 px-3 pointer-events-none"
        >
          <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-indigo-300 dark:ring-indigo-700 shadow-xl px-4 py-2.5 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => {
                  void bulkSetPublished(true);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-300 dark:ring-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkBusy ? "Working…" : "Publish all"}
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => {
                  void bulkSetPublished(false);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Unpublish all
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setBulkDeleteOpen(true)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
            <button
              type="button"
              onClick={exitSelectMode}
              disabled={bulkBusy}
              className="ml-auto text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-50"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <ConfirmDialog
          title={`Delete ${selectedIds.size} material${selectedIds.size === 1 ? "" : "s"}?`}
          body={`Delete ${selectedIds.size} material${selectedIds.size === 1 ? "" : "s"}? Uploaded files will be removed from storage. This cannot be undone.`}
          confirmLabel="Delete materials"
          destructive
          busy={bulkBusy}
          onConfirm={() => {
            void bulkDelete();
          }}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this material?"
          body={
            <div className="space-y-2">
              <p>
                <span className="font-semibold">
                  {confirmDelete.material.title}
                </span>{" "}
                will no longer be visible to students.
              </p>
              {confirmDelete.material.kind === "file" && (
                <p className="text-rose-700 dark:text-rose-300">
                  The uploaded file will be removed from storage.
                </p>
              )}
            </div>
          }
          confirmLabel="Delete material"
          destructive
          busy={actionBusy}
          onConfirm={() => {
            void onConfirmDelete(confirmDelete.material);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
