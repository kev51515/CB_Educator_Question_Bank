/**
 * WeakSkillsToggle
 * =================
 * Pill button that surfaces the student's weak-skill count and lets them
 * filter the question bank to only those skills. Renders nothing when the
 * RPC says the student has no weak skills yet (a fine state — they may be
 * a new user with zero attempts).
 */
import { useWeakSkills } from "./useWeakSkills";

interface WeakSkillsToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
}

export function WeakSkillsToggle({ value, onChange }: WeakSkillsToggleProps) {
  const { weakSkills, loading } = useWeakSkills();

  if (loading) {
    return (
      <button
        type="button"
        disabled
        className="rounded-full px-3 py-1.5 text-sm ring-1 ring-slate-300 dark:ring-slate-700 text-slate-400 dark:text-slate-500"
      >
        Focus weak skills…
      </button>
    );
  }

  const count = weakSkills.size;
  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      title={`Focus on ${count} skill${count === 1 ? "" : "s"} you're below 65% on (or with <3 attempts)`}
      className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
        value
          ? "bg-amber-500 text-white ring-1 ring-amber-600 dark:bg-amber-600 dark:ring-amber-700"
          : "bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-700 text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/30"
      }`}
    >
      {value ? "✓ " : ""}Focus weak skills ({count})
    </button>
  );
}
