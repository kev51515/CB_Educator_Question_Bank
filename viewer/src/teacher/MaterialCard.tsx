import { useCallback, useEffect, useRef, useState } from "react";
import { KebabMenu, useOptimistic, type KebabMenuOption } from "@/components";
import { type CourseMaterial } from "./useMaterials";
import { formatBytes, safeHostname } from "./materialsHelpers";

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

export function MaterialCard({
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
          className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-100 dark:ring-indigo-900"
        >
          {isFile ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 4a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
              <path d="M14 2v5h5" />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M10 13a5 5 0 0 0 7.07 0l1.93-1.93a5 5 0 0 0-7.07-7.07L11 5" />
              <path d="M14 11a5 5 0 0 0-7.07 0L5 12.93a5 5 0 0 0 7.07 7.07L13 19" />
            </svg>
          )}
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
