import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IDENTITY } from "@/lib/designTokens";

/* ─── Types ─── */

export interface Tag {
  id: string;
  name: string;
  color: string; // hex color like "#f59e0b"
}

/* ─── Preset colors for the mini color picker ─── */

const PRESET_COLORS = [
  { name: "Red", hex: "#ef4444" },
  { name: "Orange", hex: "#f97316" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Green", hex: "#22c55e" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Purple", hex: "#a855f7" },
] as const;

/* ─── Hooks ─── */

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Read JSON from localStorage, returning `fallback` on any error. */
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Write JSON to localStorage (non-fatal on failure). */
function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or disabled */
  }
}

/**
 * Manage a list of Tag definitions.
 * Persisted to localStorage with cross-tab sync.
 */
export function useTags(storageKey: string): {
  tags: Tag[];
  createTag: (name: string, color: string) => Tag;
  removeTag: (id: string) => void;
  renameTag: (id: string, name: string) => void;
} {
  const [tags, setTags] = useState<Tag[]>(() => readJSON<Tag[]>(storageKey, []));

  // Persist on change.
  useEffect(() => {
    writeJSON(storageKey, tags);
  }, [storageKey, tags]);

  // Sync across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      try {
        const next = e.newValue ? (JSON.parse(e.newValue) as Tag[]) : [];
        setTags(Array.isArray(next) ? next : []);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  const createTag = useCallback(
    (name: string, color: string): Tag => {
      const tag: Tag = { id: generateId(), name: name.trim(), color };
      setTags((prev) => [...prev, tag]);
      return tag;
    },
    [],
  );

  const removeTag = useCallback((id: string) => {
    setTags((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const renameTag = useCallback((id: string, name: string) => {
    setTags((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name: name.trim() } : t)),
    );
  }, []);

  return { tags, createTag, removeTag, renameTag };
}

/**
 * Manage question -> tag assignments.
 * Stored as `Record<questionId, tagId[]>` in localStorage with cross-tab sync.
 */
export function useQuestionTags(storageKey: string): {
  getTagIds: (questionId: string) => string[];
  addTag: (questionId: string, tagId: string) => void;
  removeTag: (questionId: string, tagId: string) => void;
  getQuestionsByTag: (tagId: string) => string[];
  counts: () => Record<string, number>;
} {
  const [map, setMap] = useState<Record<string, string[]>>(() =>
    readJSON<Record<string, string[]>>(storageKey, {}),
  );

  // Persist on change.
  useEffect(() => {
    writeJSON(storageKey, map);
  }, [storageKey, map]);

  // Sync across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      try {
        const next = e.newValue ? (JSON.parse(e.newValue) as Record<string, string[]>) : {};
        setMap(typeof next === "object" && next && !Array.isArray(next) ? next : {});
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  const getTagIds = useCallback(
    (questionId: string): string[] => map[questionId] ?? [],
    [map],
  );

  const addTag = useCallback((questionId: string, tagId: string) => {
    setMap((prev) => {
      const existing = prev[questionId] ?? [];
      if (existing.includes(tagId)) return prev;
      return { ...prev, [questionId]: [...existing, tagId] };
    });
  }, []);

  const removeTag = useCallback((questionId: string, tagId: string) => {
    setMap((prev) => {
      const existing = prev[questionId];
      if (!existing) return prev;
      const next = existing.filter((id) => id !== tagId);
      if (next.length === existing.length) return prev;
      const result = { ...prev };
      if (next.length === 0) {
        delete result[questionId];
      } else {
        result[questionId] = next;
      }
      return result;
    });
  }, []);

  const getQuestionsByTag = useCallback(
    (tagId: string): string[] =>
      Object.entries(map)
        .filter(([, ids]) => ids.includes(tagId))
        .map(([qId]) => qId),
    [map],
  );

  const counts = useCallback((): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const ids of Object.values(map)) {
      for (const id of ids) {
        result[id] = (result[id] ?? 0) + 1;
      }
    }
    return result;
  }, [map]);

  return { getTagIds, addTag, removeTag, getQuestionsByTag, counts };
}

/* ─── TagPicker Component ─── */

interface TagPickerProps {
  questionId: string;
  tags: Tag[];
  assignedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  onCreateTag: (name: string, color: string) => Tag;
}

export function TagPicker({
  questionId,
  tags,
  assignedTagIds,
  onToggleTag,
  onCreateTag,
}: TagPickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(PRESET_COLORS[4].hex); // blue default
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const tag = onCreateTag(trimmed, newColor);
    onToggleTag(tag.id);
    setNewName("");
  };

  const assignedSet = useMemo(() => new Set(assignedTagIds), [assignedTagIds]);

  // Suppress unused-var warning: questionId is required by the interface for callers
  void questionId;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="w-7 h-7 rounded-md inline-flex items-center justify-center transition-colors focus-ring text-ink-500 hover:text-ink-800 hover:bg-ink-100"
        title="Tags"
        aria-label="Tags"
        data-tooltip="Tags"
      >
        <TagIcon />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-ink-200 rounded-xl shadow-modal z-10 overflow-hidden">
          {tags.length > 0 && (
            <div className="max-h-48 overflow-y-auto thin-scrollbar py-1.5">
              {tags.map((tag) => {
                const assigned = assignedSet.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => onToggleTag(tag.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[13px] hover:bg-ink-50 transition-colors"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color }}
                      aria-hidden
                    />
                    <span className="flex-1 truncate text-ink-700">{tag.name}</span>
                    {assigned && (
                      <svg
                        viewBox="0 0 24 24"
                        className="w-3.5 h-3.5 text-accent-600 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="border-t border-ink-150 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setNewColor(c.hex)}
                  title={c.name}
                  aria-label={c.name}
                  className={
                    "w-5 h-5 rounded-full transition-all focus-ring " +
                    (newColor === c.hex ? "ring-2 ring-offset-1 ring-ink-400 scale-110" : "hover:scale-110")
                  }
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                placeholder="New tag name…"
                className="flex-1 min-w-0 px-2 py-1 text-[12px] rounded-md border border-ink-200 bg-white placeholder:text-ink-400 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-100 transition"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="px-2 py-1 text-[11px] font-medium rounded-md bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-ring"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── TagFilterSection Component ─── */

interface TagFilterSectionProps {
  tags: Tag[];
  activeTags: Set<string>;
  counts: Record<string, number>;
  onToggle: (tagId: string) => void;
}

export function TagFilterSection({
  tags,
  activeTags,
  counts,
  onToggle,
}: TagFilterSectionProps): JSX.Element | null {
  if (tags.length === 0) return null;

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-1.5 px-3">
        <span className={"w-1.5 h-1.5 rounded-full " + IDENTITY.status.dot} aria-hidden />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
          Tags
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {tags.map((tag) => {
          const checked = activeTags.has(tag.id);
          const count = counts[tag.id] ?? 0;
          const isZero = count === 0 && !checked;
          return (
            <label
              key={tag.id}
              className={
                "group flex items-center gap-2.5 px-2.5 py-1 rounded-md transition-colors select-none " +
                (isZero
                  ? "cursor-default opacity-55"
                  : "cursor-pointer hover:bg-ink-200/60")
              }
            >
              <span
                className={
                  "relative inline-flex items-center justify-center w-[16px] h-[16px] rounded-[4px] border transition-colors " +
                  (checked
                    ? "bg-accent-600 border-accent-600"
                    : isZero
                      ? "bg-white border-ink-200"
                      : "bg-white border-ink-300 group-hover:border-ink-400")
                }
                aria-hidden
              >
                {checked && (
                  <svg
                    viewBox="0 0 16 16"
                    className="w-3 h-3 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3.5,8.5 6.5,11.5 12.5,5" />
                  </svg>
                )}
              </span>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(tag.id)}
                disabled={isZero}
                className="sr-only"
                aria-label={tag.name}
              />
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: tag.color }}
                aria-hidden
              />
              <span
                className={
                  "flex-1 truncate text-[13px] " +
                  (checked ? "text-ink-800" : "text-ink-700")
                }
              >
                {tag.name}
              </span>
              <span
                className={
                  "tabular-nums text-[12px] " +
                  (isZero ? "text-ink-300" : "text-ink-400 group-hover:text-ink-600")
                }
              >
                {count.toLocaleString()}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Inline tag chips (for display in the question list/detail) ─── */

export function TagChips({
  tagIds,
  tags,
}: {
  tagIds: string[];
  tags: Tag[];
}): JSX.Element | null {
  if (tagIds.length === 0) return null;
  const tagMap = new Map(tags.map((t) => [t.id, t]));
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tagIds.map((id) => {
        const tag = tagMap.get(id);
        if (!tag) return null;
        return (
          <span
            key={id}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-medium leading-none"
            style={{
              backgroundColor: tag.color + "18",
              color: tag.color,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: tag.color }}
              aria-hidden
            />
            {tag.name}
          </span>
        );
      })}
    </span>
  );
}

/* ─── Icons ─── */

function TagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}
