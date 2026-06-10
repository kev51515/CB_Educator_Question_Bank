/**
 * CourseOrgSidebar — the folder rail for the courses grid.
 * "All courses" + "Unfiled" pseudo-folders, then the teacher's folders with
 * live counts, a per-folder kebab (rename / recolour / delete), and an inline
 * "New folder" creator. Selection drives the grid's folder filter.
 */
import { useEffect, useRef, useState } from "react";
import { KebabMenu } from "@/components";
import { ColorPicker } from "./CourseOrgBits";
import {
  colorClasses,
  COURSE_DND_MIME,
  ORG_COLORS,
  type CourseFolder,
  type OrgColor,
} from "./courseOrg";

/** Pull a dragged course id off a drag event, or null if the drag isn't one. */
function readCourseDrag(e: React.DragEvent): string | null {
  if (!e.dataTransfer.types.includes(COURSE_DND_MIME)) return null;
  // `getData` is empty during dragover in some browsers; presence of the type
  // is enough to accept the drop, and the id is read on drop where it's available.
  return e.dataTransfer.getData(COURSE_DND_MIME) || "";
}

export interface FolderCounts {
  all: number;
  unfiled: number;
  byFolder: Record<string, number>;
}

interface Props {
  folders: CourseFolder[];
  counts: FolderCounts;
  selected: string; // "all" | "unfiled" | folderId
  onSelect: (f: string) => void;
  onCreate: (name: string, color: OrgColor) => Promise<CourseFolder | null>;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: OrgColor) => void;
  onDelete: (id: string) => void;
  /** Fired when a course card is dropped onto a folder row (folderId) or the
   *  "Unfiled" row (null). Wired only while a course drag is in flight. */
  onDropCourse: (courseId: string, folderId: string | null) => void;
  /** True while a course card is being dragged anywhere on the page — drives
   *  the "drop here" affordance so rows don't light up when nothing's moving. */
  courseDragActive: boolean;
}

export function CourseOrgSidebar({
  folders,
  counts,
  selected,
  onSelect,
  onCreate,
  onRename,
  onRecolor,
  onDelete,
  onDropCourse,
  courseDragActive,
}: Props): JSX.Element {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<OrgColor>(ORG_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Which row is the active drop target ("unfiled" | folderId), so only the
  // hovered row shows its highlight ring.
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const commitNew = async () => {
    if (busy || !newName.trim()) return;
    setBusy(true);
    const f = await onCreate(newName, newColor);
    setBusy(false);
    if (f) {
      setNewName("");
      setNewColor(ORG_COLORS[0]);
      setCreating(false);
      onSelect(f.id);
    }
  };

  return (
    <nav aria-label="Course folders" className="space-y-0.5">
      <PseudoRow
        label="All courses"
        count={counts.all}
        active={selected === "all"}
        onClick={() => onSelect("all")}
        icon={
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        }
      />
      <PseudoRow
        label="Unfiled"
        count={counts.unfiled}
        active={selected === "unfiled"}
        onClick={() => onSelect("unfiled")}
        icon={<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />}
        dashed
        dropActive={courseDragActive}
        dropHover={dropTarget === "unfiled"}
        onCourseDragOver={(e) => {
          if (readCourseDrag(e) === null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropTarget("unfiled");
        }}
        onCourseDragLeave={() => setDropTarget((cur) => (cur === "unfiled" ? null : cur))}
        onCourseDrop={(e) => {
          const id = readCourseDrag(e);
          setDropTarget(null);
          if (!id) return;
          e.preventDefault();
          onDropCourse(id, null);
        }}
      />

      {folders.length > 0 && (
        <div className="my-1.5 h-px bg-slate-200 dark:bg-slate-800" aria-hidden />
      )}

      {folders.map((f) => (
        <FolderRow
          key={f.id}
          folder={f}
          count={counts.byFolder[f.id] ?? 0}
          active={selected === f.id}
          onClick={() => onSelect(f.id)}
          onRename={(name) => onRename(f.id, name)}
          onRecolor={(c) => onRecolor(f.id, c)}
          onDelete={() => {
            if (selected === f.id) onSelect("all");
            onDelete(f.id);
          }}
          dropActive={courseDragActive}
          dropHover={dropTarget === f.id}
          onCourseDragOver={(e) => {
            if (readCourseDrag(e) === null) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropTarget(f.id);
          }}
          onCourseDragLeave={() => setDropTarget((cur) => (cur === f.id ? null : cur))}
          onCourseDrop={(e) => {
            const id = readCourseDrag(e);
            setDropTarget(null);
            if (!id) return;
            e.preventDefault();
            onDropCourse(id, f.id);
          }}
        />
      ))}

      <div className="pt-1.5">
        {creating ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void commitNew();
            }}
            className="rounded-lg border border-indigo-300 bg-white p-2.5 dark:border-indigo-800 dark:bg-slate-900"
          >
            <input
              ref={inputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewName("");
                }
              }}
              placeholder="Folder name"
              disabled={busy}
              className="w-full border-b border-slate-200 bg-transparent pb-1 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none dark:border-slate-700 dark:text-slate-100"
            />
            <div className="mt-2.5">
              <ColorPicker value={newColor} onChange={setNewColor} />
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="submit"
                disabled={busy || !newName.trim()}
                className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? "Adding…" : "Add folder"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            New folder
          </button>
        )}
      </div>
    </nav>
  );
}

function PseudoRow({
  label,
  count,
  active,
  onClick,
  icon,
  dashed,
  dropActive,
  dropHover,
  onCourseDragOver,
  onCourseDragLeave,
  onCourseDrop,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon: JSX.Element;
  dashed?: boolean;
  /** True while a course is being dragged anywhere — shows the "drop here" cue. */
  dropActive?: boolean;
  /** True when this row is the hovered drop target — shows the ring. */
  dropHover?: boolean;
  onCourseDragOver?: (e: React.DragEvent) => void;
  onCourseDragLeave?: (e: React.DragEvent) => void;
  onCourseDrop?: (e: React.DragEvent) => void;
}): JSX.Element {
  const droppable = !!onCourseDrop;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      onDragOver={onCourseDragOver}
      onDragLeave={onCourseDragLeave}
      onDrop={onCourseDrop}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-all ${
        active
          ? "bg-slate-200/70 font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      } ${
        droppable && dropHover
          ? "ring-2 ring-indigo-500 ring-inset bg-indigo-50 dark:bg-indigo-950/40"
          : droppable && dropActive
            ? "ring-1 ring-dashed ring-indigo-300 dark:ring-indigo-800"
            : ""
      }`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dashed ? "3 3" : undefined}
        className="flex-none text-slate-400 dark:text-slate-500"
        aria-hidden
      >
        {icon}
      </svg>
      <span className="flex-1 truncate text-left">{label}</span>
      <span className="flex-none text-xs tabular-nums text-slate-400 dark:text-slate-500">{count}</span>
    </button>
  );
}

function FolderRow({
  folder,
  count,
  active,
  onClick,
  onRename,
  onRecolor,
  onDelete,
  dropActive,
  dropHover,
  onCourseDragOver,
  onCourseDragLeave,
  onCourseDrop,
}: {
  folder: CourseFolder;
  count: number;
  active: boolean;
  onClick: () => void;
  onRename: (name: string) => void;
  onRecolor: (c: OrgColor) => void;
  onDelete: () => void;
  /** True while a course is being dragged anywhere — shows the "drop here" cue. */
  dropActive: boolean;
  /** True when this row is the hovered drop target — shows the ring. */
  dropHover: boolean;
  onCourseDragOver: (e: React.DragEvent) => void;
  onCourseDragLeave: (e: React.DragEvent) => void;
  onCourseDrop: (e: React.DragEvent) => void;
}): JSX.Element {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const [recoloring, setRecoloring] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);
  const c = colorClasses(folder.color);

  useEffect(() => {
    if (renaming) {
      setDraft(folder.name);
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [renaming, folder.name]);

  return (
    <div
      onDragOver={onCourseDragOver}
      onDragLeave={onCourseDragLeave}
      onDrop={onCourseDrop}
      className={`group rounded-lg transition-all ${
        active ? "bg-slate-200/70 dark:bg-slate-800" : "hover:bg-slate-100 dark:hover:bg-slate-800/70"
      } ${
        dropHover
          ? "ring-2 ring-indigo-500 ring-inset bg-indigo-50 dark:bg-indigo-950/40"
          : dropActive
            ? "ring-1 ring-dashed ring-indigo-300 dark:ring-indigo-800"
            : ""
      }`}
    >
      <div className="flex items-center gap-1 px-1">
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) onRename(draft);
              setRenaming(false);
            }}
            className="flex-1 py-1.5"
          >
            <input
              ref={renameRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (draft.trim() && draft.trim() !== folder.name) onRename(draft);
                setRenaming(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setRenaming(false);
              }}
              className="w-full bg-transparent text-sm font-medium text-slate-900 focus:outline-none dark:text-slate-100"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={onClick}
            aria-current={active ? "true" : undefined}
            className="flex flex-1 items-center gap-2.5 py-1.5 pl-1.5 text-sm"
          >
            <span className={`h-2.5 w-2.5 flex-none rounded-full ${c.dot}`} aria-hidden />
            <span
              className={`flex-1 truncate text-left ${active ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-200"}`}
            >
              {folder.name}
            </span>
            <span className="flex-none text-xs tabular-nums text-slate-400 dark:text-slate-500">
              {count}
            </span>
          </button>
        )}
        <div className="flex-none opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <KebabMenu
            options={[
              { label: "Rename", onSelect: () => setRenaming(true) },
              { label: recoloring ? "Hide colours" : "Change colour", onSelect: () => setRecoloring((v) => !v) },
              { label: "Delete folder", destructive: true, onSelect: onDelete },
            ]}
          />
        </div>
      </div>
      {recoloring && (
        <div className="px-3 pb-2.5 pt-0.5">
          <ColorPicker
            value={(folder.color as OrgColor) ?? "slate"}
            onChange={(col) => {
              onRecolor(col);
              setRecoloring(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
