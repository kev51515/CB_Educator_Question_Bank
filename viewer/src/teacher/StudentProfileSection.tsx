import { useState } from "react";

interface SectionProps {
  id: string;
  title: string;
  count: number | null;
  defaultOpen: boolean;
  children: React.ReactNode;
}

export function Section({
  id,
  title,
  count,
  defaultOpen,
  children,
}: SectionProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const headerId = `${id}-header`;
  const panelId = `${id}-panel`;
  return (
    <section
      aria-labelledby={headerId}
      className="rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden"
    >
      <button
        type="button"
        id={headerId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 min-h-[44px] text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {title}
          </span>
          {count !== null && (
            <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              {count}
            </span>
          )}
        </div>
        <span
          aria-hidden
          className={`text-slate-400 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        >
          ›
        </span>
      </button>
      {open && (
        <div id={panelId} className="px-5 pb-5">
          {children}
        </div>
      )}
    </section>
  );
}
