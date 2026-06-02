// ─── Empty state row ──────────────────────────────────────────────────────

export function EmptySectionLine({ text }: { text: string }) {
  return (
    <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 italic">
      {text}
    </p>
  );
}
