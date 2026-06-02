import { useCallback, useEffect, useRef, useState } from "react";
import type { Filters, StatusFilter } from "@/types";
import { emptyFilters } from "@/types";

// ─────────────────────────────── types ───────────────────────────────

export interface FilterPreset {
  id: string;
  name: string;
  filters: {
    sections: string[];
    difficulties: string[];
    domains: string[];
    skills: string[];
    status: string[];
    search: string;
  };
}

// ─────────────────────────── storage helpers ─────────────────────────

function randomId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isPreset(value: unknown): value is FilterPreset {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.name !== "string") return false;
  if (!v.filters || typeof v.filters !== "object") return false;
  const f = v.filters as Record<string, unknown>;
  return (
    Array.isArray(f.sections) &&
    Array.isArray(f.difficulties) &&
    Array.isArray(f.domains) &&
    Array.isArray(f.skills) &&
    Array.isArray(f.status) &&
    typeof f.search === "string"
  );
}

function readPresets(storageKey: string): FilterPreset[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPreset);
  } catch {
    return [];
  }
}

function writePresets(storageKey: string, presets: FilterPreset[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(presets));
  } catch {
    /* quota or disabled — non-fatal */
  }
}

function serializeFilters(filters: Filters): FilterPreset["filters"] {
  return {
    sections: [...filters.sections],
    difficulties: [...filters.difficulties],
    domains: [...filters.domains],
    skills: [...filters.skills],
    status: [...filters.status],
    search: filters.search,
  };
}

export function deserializeFilters(serialized: FilterPreset["filters"]): Filters {
  const f = emptyFilters();
  f.sections = new Set(serialized.sections);
  f.difficulties = new Set(serialized.difficulties);
  f.domains = new Set(serialized.domains);
  f.skills = new Set(serialized.skills);
  f.status = new Set(
    serialized.status.filter(
      (s): s is StatusFilter => s === "bookmarked" || s === "done" || s === "selected",
    ),
  );
  f.search = serialized.search;
  return f;
}

// ───────────────────────────── useFilterPresets ──────────────────────

export function useFilterPresets(storageKey: string): {
  presets: FilterPreset[];
  save: (name: string, filters: Filters) => FilterPreset;
  remove: (id: string) => void;
  apply: (presetId: string) => FilterPreset | null;
} {
  const [presets, setPresets] = useState<FilterPreset[]>(() => readPresets(storageKey));

  useEffect(() => {
    writePresets(storageKey, presets);
  }, [storageKey, presets]);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      try {
        const next = e.newValue ? JSON.parse(e.newValue) : [];
        if (Array.isArray(next)) {
          setPresets(next.filter(isPreset));
        } else {
          setPresets([]);
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  const save = useCallback((name: string, filters: Filters): FilterPreset => {
    const preset: FilterPreset = {
      id: randomId(),
      name: name.trim() || "Untitled",
      filters: serializeFilters(filters),
    };
    setPresets((prev) => [...prev, preset]);
    return preset;
  }, []);

  const remove = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Reads from current presets state for return value
  const presetsRef = useRef(presets);
  presetsRef.current = presets;
  const apply = useCallback((presetId: string): FilterPreset | null => {
    return presetsRef.current.find((p) => p.id === presetId) ?? null;
  }, []);

  return { presets, save, remove, apply };
}

// ─────────────────────────────── PresetMenu ──────────────────────────

interface PresetMenuProps {
  presets: FilterPreset[];
  currentFilters: Filters;
  onApply: (filters: Filters) => void;
  onSave: (name: string) => void;
  onRemove: (id: string) => void;
}

export function PresetMenu({
  presets,
  currentFilters: _currentFilters,
  onApply,
  onSave,
  onRemove,
}: PresetMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName("");
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] rounded-md border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 focus-ring"
      >
        Views
        <svg
          viewBox="0 0 24 24"
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-64 bg-white border border-ink-200 rounded-lg shadow-modal text-[12px] z-20"
        >
          {presets.length === 0 ? (
            <div className="px-3 py-2 text-ink-400 italic">No saved views</div>
          ) : (
            <ul className="max-h-60 overflow-y-auto py-1">
              {presets.map((p) => (
                <li key={p.id}>
                  <div className="group flex items-center justify-between px-2 py-1.5 hover:bg-ink-50 rounded">
                    <button
                      type="button"
                      onClick={() => {
                        onApply(deserializeFilters(p.filters));
                        setOpen(false);
                      }}
                      className="flex-1 text-left text-ink-700 truncate focus-ring rounded px-1"
                      role="menuitem"
                    >
                      {p.name}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(p.id);
                      }}
                      aria-label={`Delete ${p.name}`}
                      className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded text-ink-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-opacity"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-ink-150 px-2 py-2">
            <label className="block text-[11px] text-ink-500 mb-1" htmlFor="preset-name">
              Save current as…
            </label>
            <input
              id="preset-name"
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder="View name"
              className="w-full px-2 py-1 border border-ink-200 rounded text-[12px] focus-ring outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
