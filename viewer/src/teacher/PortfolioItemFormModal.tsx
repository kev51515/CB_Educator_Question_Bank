/**
 * PortfolioItemFormModal
 * ======================
 * Create / edit a single portfolio item (a requirement) attached to the
 * course's template. The form dynamically reveals settings based on the
 * selected `item_type`:
 *   - short_text / long_text → max_chars
 *   - choice / multi_choice  → comma-separated options
 *   - everything else        → no extra settings
 *
 * Position is assigned by the caller (next position = max + 1) for new rows;
 * we don't surface drag-reorder in this modal — the kebab on each row owns
 * that.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  PortfolioItem,
  PortfolioItemSettings,
  PortfolioItemType,
} from "./usePortfolio";
import { SmartDatePicker, TagInput, useToast } from "@/components";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { useFocusTrap } from "@/hooks";

interface PortfolioItemFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  templateId: string;
  /** Position to assign on create. Ignored on edit. */
  nextPosition: number;
  /**
   * When creating a sub-item, the parent item id to attach the new row to.
   * Optional + defaults to null (root-level insert). Backward-compatible —
   * existing callers that don't pass it still create root items.
   */
  parentItemId?: string | null;
  /** Existing item when mode === "edit". */
  initial?: PortfolioItem;
  onClose: () => void;
  onSaved?: () => void;
}

const ITEM_TYPE_OPTIONS: ReadonlyArray<{ value: PortfolioItemType; label: string }> =
  [
    { value: "short_text", label: "Short text" },
    { value: "long_text", label: "Long text / essay" },
    { value: "file", label: "File upload" },
    { value: "link", label: "Link / URL" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "choice", label: "Single choice" },
    { value: "multi_choice", label: "Multiple choice" },
  ];

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function PortfolioItemFormModal({
  open,
  mode,
  templateId,
  nextPosition,
  parentItemId = null,
  initial,
  onClose,
  onSaved,
}: PortfolioItemFormModalProps) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [itemType, setItemType] = useState<PortfolioItemType>("long_text");
  const [required, setRequired] = useState(true);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [maxChars, setMaxChars] = useState("");
  /**
   * choice / multi_choice options. Maintained as `string[]` so the new
   * TagInput primitive can render chips; legacy `(initial.settings.options
   * ?? []).join(", ")` parse path is replaced by direct array seeding.
   */
  const [options, setOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const titleRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setTitle(initial.title);
      setPrompt(initial.prompt ?? "");
      setItemType(initial.item_type);
      setRequired(initial.required);
      setDueAt(initial.due_at);
      setMaxChars(
        typeof initial.settings.max_chars === "number"
          ? String(initial.settings.max_chars)
          : "",
      );
      setOptions(initial.settings.options ?? []);
    } else {
      setTitle("");
      setPrompt("");
      setItemType("long_text");
      setRequired(true);
      setDueAt(null);
      setMaxChars("");
      setOptions([]);
    }
    setError(null);
    const id = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, mode, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  if (!open) return null;

  const buildSettings = (): PortfolioItemSettings => {
    const out: PortfolioItemSettings = {};
    if (itemType === "short_text" || itemType === "long_text") {
      const n = Number.parseInt(maxChars, 10);
      if (Number.isFinite(n) && n > 0) out.max_chars = n;
    }
    if (itemType === "choice" || itemType === "multi_choice") {
      // TagInput already normalises (trim, drop blanks, dedupe), so we can
      // forward the array as-is.
      if (options.length > 0) out.options = options;
    }
    return out;
  };

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Please enter a title.");
      return;
    }
    if (
      (itemType === "choice" || itemType === "multi_choice") &&
      (buildSettings().options ?? []).length === 0
    ) {
      setError("Please enter at least one choice option.");
      return;
    }

    setBusy(true);
    try {
      const settings = buildSettings();

      if (mode === "create") {
        const { error: insertError } = await supabase
          .from("portfolio_items")
          .insert({
            template_id: templateId,
            parent_item_id: parentItemId ?? null,
            position: nextPosition,
            title: trimmedTitle,
            prompt: prompt.trim() || null,
            item_type: itemType,
            required,
            due_at: dueAt,
            settings,
          });
        if (insertError) {
          toast.error("Couldn't save", insertError.message);
          return;
        }
        toast.success("Item added");
      } else if (initial) {
        const { error: updateError } = await supabase
          .from("portfolio_items")
          .update({
            title: trimmedTitle,
            prompt: prompt.trim() || null,
            item_type: itemType,
            required,
            due_at: dueAt,
            settings,
          })
          .eq("id", initial.id);
        if (updateError) {
          toast.error("Couldn't save", updateError.message);
          return;
        }
        toast.success("Item updated");
      }
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      toast.error("Couldn't save", getErrorMessage(err, "Failed to save item."));
    } finally {
      setBusy(false);
    }
  };

  const showMaxChars = itemType === "short_text" || itemType === "long_text";
  const showOptions = itemType === "choice" || itemType === "multi_choice";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "Add portfolio item" : "Edit portfolio item"}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {mode === "create" ? "Add item" : "Edit item"}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Define a requirement students will complete in their portfolio.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!busy) onClose();
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
              placeholder="e.g. Personal statement first draft"
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Prompt{" "}
              <span className="text-slate-500 dark:text-slate-400 font-normal">(optional)</span>
            </span>
            <div className="mt-1">
              <MarkdownEditor
                value={prompt}
                onChange={setPrompt}
                minHeight={120}
                characterLimit={500}
              />
            </div>
          </label>

          <fieldset>
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Type
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ITEM_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 rounded-lg ring-1 px-3 py-2 text-sm cursor-pointer ${
                    itemType === opt.value
                      ? "ring-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-200"
                      : "ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="item_type"
                    value={opt.value}
                    checked={itemType === opt.value}
                    onChange={() => setItemType(opt.value)}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          {showMaxChars && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Max characters{" "}
                <span className="text-slate-500 dark:text-slate-400 font-normal">(optional)</span>
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={maxChars}
                onChange={(e) => setMaxChars(e.target.value)}
                placeholder="e.g. 650"
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
          )}

          {showOptions && (
            <div className="block">
              <label
                htmlFor="portfolio-item-choices"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Choices
              </label>
              <div className="mt-1">
                <TagInput
                  id="portfolio-item-choices"
                  ariaLabel="Choices"
                  value={options}
                  onChange={setOptions}
                  placeholder="Type a choice and press Enter"
                  maxTagLength={120}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Press Enter or comma to add. Backspace removes the last
                choice; arrow keys focus a chip to remove it.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <SmartDatePicker
              label="Due date (optional)"
              value={dueAt}
              onChange={setDueAt}
              allowClear
            />
            <label className="flex items-end gap-2 pb-2">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-200">
                Required
              </span>
            </label>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
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
              {busy ? "Saving…" : mode === "create" ? "Add item" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
