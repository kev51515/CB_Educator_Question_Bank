/**
 * CourseOrganizeModal — file ONE course into a folder + manage its tags.
 * Opened from a course card's kebab ("Tags & folder…"). Multi-field, so a
 * modal per the CLAUDE.md contract (focus trap, Esc/backdrop close, ≥40px
 * close target). All edits apply optimistically through the org hook.
 */
import { useState } from "react";
import { ResponsiveModal } from "@/components";
import { ColorPicker, TagChip } from "./CourseOrgBits";
import {
  colorClasses,
  ORG_COLORS,
  type CourseOrg,
  type CourseFolder,
  type CourseTag,
  type OrgColor,
} from "./courseOrg";

interface Props {
  course: { id: string; name: string };
  org: CourseOrg;
  onSetFolder: (courseId: string, folderId: string | null) => void;
  onCreateFolder: (name: string, color: OrgColor) => Promise<CourseFolder | null>;
  onToggleTag: (courseId: string, tagId: string, on: boolean) => void;
  onCreateTag: (name: string, color: OrgColor) => Promise<CourseTag | null>;
  onClose: () => void;
}

export function CourseOrganizeModal({
  course,
  org,
  onSetFolder,
  onCreateFolder,
  onToggleTag,
  onCreateTag,
  onClose,
}: Props): JSX.Element {
  const currentFolder = org.folderOf.get(course.id) ?? null;
  const courseTagIds = new Set(org.tagsOf.get(course.id) ?? []);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState<OrgColor>(ORG_COLORS[0]);

  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState<OrgColor>(ORG_COLORS[1]);

  const addFolder = async () => {
    if (!folderName.trim()) return;
    const f = await onCreateFolder(folderName, folderColor);
    if (f) {
      onSetFolder(course.id, f.id);
      setFolderName("");
      setNewFolderOpen(false);
    }
  };

  const addTag = async () => {
    if (!tagName.trim()) return;
    const t = await onCreateTag(tagName, tagColor);
    if (t) {
      onToggleTag(course.id, t.id, true);
      setTagName("");
    }
  };

  return (
    <ResponsiveModal
      open={true}
      onClose={onClose}
      title="Organize course"
      subtitle={course.name}
      size="md"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-6">
          {/* ---- folder ---- */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Folder
            </h3>
            <div className="space-y-1">
              <FolderOption
                label="No folder"
                autoFocus
                selected={currentFolder == null}
                onSelect={() => onSetFolder(course.id, null)}
              />
              {org.folders.map((f) => (
                <FolderOption
                  key={f.id}
                  label={f.name}
                  color={f.color}
                  selected={currentFolder === f.id}
                  onSelect={() => onSetFolder(course.id, f.id)}
                />
              ))}
            </div>

            {newFolderOpen ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void addFolder();
                }}
                className="mt-2 rounded-lg border border-indigo-300 p-2.5 dark:border-indigo-800"
              >
                <input
                  autoFocus
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setNewFolderOpen(false)}
                  placeholder="Folder name"
                  className="w-full border-b border-slate-200 bg-transparent pb-1 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-100"
                />
                <div className="mt-2.5">
                  <ColorPicker value={folderColor} onChange={setFolderColor} />
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <button type="submit" disabled={!folderName.trim()} className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                    Add & file here
                  </button>
                  <button type="button" onClick={() => setNewFolderOpen(false)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setNewFolderOpen(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New folder
              </button>
            )}
          </section>

          {/* ---- tags ---- */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Tags
            </h3>
            {org.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {org.tags.map((t) => {
                  const on = courseTagIds.has(t.id);
                  const c = colorClasses(t.color);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onToggleTag(course.id, t.id, !on)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${
                        on ? c.chip : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                      {t.name}
                      {on && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500">No tags yet — create your first below.</p>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void addTag();
              }}
              className="mt-3 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700"
            >
              <div className="flex items-center gap-2">
                <input
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  placeholder="New tag name"
                  maxLength={40}
                  className="min-w-0 flex-1 border-b border-slate-200 bg-transparent pb-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:border-slate-700 dark:text-slate-100"
                />
                <button type="submit" disabled={!tagName.trim()} className="flex-none rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                  Add
                </button>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-[11px] text-slate-400 dark:text-slate-500">Colour</span>
                <ColorPicker value={tagColor} onChange={setTagColor} />
                {tagName.trim() && <TagChip name={tagName.trim()} color={tagColor} />}
              </div>
            </form>
          </section>
      </div>
    </ResponsiveModal>
  );
}

function FolderOption({
  label,
  color,
  selected,
  onSelect,
  autoFocus,
}: {
  label: string;
  color?: string | null;
  selected: boolean;
  onSelect: () => void;
  autoFocus?: boolean;
}): JSX.Element {
  const c = colorClasses(color ?? null);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      {...(autoFocus ? { "data-autofocus": true } : {})}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
        selected
          ? `${c.soft} font-semibold text-slate-900 ring-1 ring-inset ring-slate-300 dark:text-slate-100 dark:ring-slate-600`
          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      }`}
    >
      <span className={`h-2.5 w-2.5 flex-none rounded-full ${color ? c.dot : "ring-1 ring-slate-300 dark:ring-slate-600"}`} aria-hidden />
      <span className="flex-1 truncate text-left">{label}</span>
      {selected && (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-slate-500 dark:text-slate-400" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </button>
  );
}
