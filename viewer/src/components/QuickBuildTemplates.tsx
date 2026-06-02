/**
 * QuickBuildTemplates
 * ===================
 * Persistence + UI for the Quick Build wizard's saved templates feature.
 *
 * Exports:
 *   - `Template`        — shape of a saved template, persisted in localStorage.
 *   - `useTemplates`    — hook backed by `useLocalStorageJSON` providing the
 *                         current list plus `save` / `remove` mutators.
 *   - `TemplateSidebar` — compact list rendered at the bottom of the configure
 *                         step, with "Use" and remove actions per row.
 *
 * Co-located with QuickBuild so the lazy chunk fully owns this surface; not
 * re-exported from the components barrel.
 */
import { useCallback } from "react";
import { useLocalStorageJSON } from "@/hooks";

export interface Template {
  id: string;
  name: string;
  sections: string[];
  difficulties: string[];
  domains: string[];
  count: number;
  excludeDone: boolean;
}

/**
 * localStorage-backed list of Quick Build templates.
 *
 * The hook returns the current array plus stable `save` / `remove` callbacks.
 * IDs are generated locally — templates are user-private and never synced.
 */
export function useTemplates(storageKey: string): {
  templates: Template[];
  save: (t: Omit<Template, "id">) => void;
  remove: (id: string) => void;
} {
  const [templates, setTemplates] = useLocalStorageJSON<Template[]>(storageKey, []);

  const save = useCallback(
    (t: Omit<Template, "id">) => {
      const id = Math.random().toString(16).slice(2, 10);
      setTemplates((prev) => [...prev, { ...t, id }]);
    },
    [setTemplates],
  );

  const remove = useCallback(
    (id: string) => {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    },
    [setTemplates],
  );

  return { templates, save, remove };
}

interface TemplateSidebarProps {
  /** Currently-saved templates. Empty array renders nothing. */
  templates: Template[];
  /** Apply a template to the wizard's configure step. */
  onUse: (t: Template) => void;
  /** Delete a template by id. */
  onRemove: (id: string) => void;
}

/**
 * Sidebar listing saved templates at the bottom of the configure step.
 * Renders nothing when the list is empty to keep the modal compact.
 */
export function TemplateSidebar({ templates, onUse, onRemove }: TemplateSidebarProps) {
  if (templates.length === 0) return null;

  return (
    <div className="border-t border-ink-100 pt-3 mt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400 mb-2">
        Saved templates
      </h3>
      <div className="space-y-1.5 max-h-32 overflow-y-auto thin-scrollbar">
        {templates.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 text-[12.5px] group"
          >
            <span className="flex-1 text-ink-600 truncate">{t.name}</span>
            <button
              type="button"
              onClick={() => onUse(t)}
              className="shrink-0 px-2 py-0.5 rounded text-[11px] font-medium text-accent-600 hover:bg-accent-50 transition-colors focus-ring"
            >
              Use
            </button>
            <button
              type="button"
              onClick={() => onRemove(t.id)}
              className="shrink-0 w-5 h-5 rounded text-ink-300 hover:text-ink-600 hover:bg-ink-100 transition-colors flex items-center justify-center focus-ring opacity-0 group-hover:opacity-100"
              aria-label={`Remove template "${t.name}"`}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
