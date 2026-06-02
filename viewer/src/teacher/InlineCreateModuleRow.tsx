import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// InlineCreateModuleRow — the modern alternative to "Add module" modals.
// Click "+ Module" → this row appears at the top of the list with the input
// focused. Type a name and press Enter to commit. Esc cancels. The user sets
// publish / lock-until afterwards via the one-click badge + kebab on the new
// row (cheaper than a modal full of optional fields you may never want).
// ---------------------------------------------------------------------------
interface InlineCreateModuleRowProps {
  busy: boolean;
  onCommit: (name: string) => Promise<boolean>;
  onCancel: () => void;
}

function InlineCreateModuleRow({
  busy,
  onCommit,
  onCancel,
}: InlineCreateModuleRowProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (): Promise<void> => {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const ok = await onCommit(trimmed);
    if (ok) setName("");
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-indigo-300 dark:ring-indigo-700 shadow-sm px-4 py-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex items-center gap-2"
      >
        <span aria-hidden className="text-indigo-500 dark:text-indigo-400 text-lg leading-none">
          +
        </span>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          disabled={busy}
          placeholder="Module name — Enter to create, Esc to cancel"
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || name.trim().length === 0}
          className="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </form>
      <p className="mt-1.5 ml-6 text-[11px] text-slate-500 dark:text-slate-400">
        Saved as draft. Click the badge after to publish, or use the menu to set a lock date.
      </p>
    </div>
  );
}

export { InlineCreateModuleRow };
export type { InlineCreateModuleRowProps };
