/**
 * QuickBuildSaveTemplatePrompt
 * ============================
 * Post-add prompt shown inside the Quick Build wizard offering to save the
 * just-used configuration as a reusable template. Renders a single text
 * input plus Save / Skip actions; the parent owns the underlying name state
 * and persistence callbacks.
 *
 * Co-located with QuickBuild — not re-exported from the components barrel so
 * it stays inside the lazy chunk.
 */

interface QuickBuildSaveTemplatePromptProps {
  /** Current draft template name (controlled). */
  name: string;
  /** Update the draft template name. */
  onNameChange: (v: string) => void;
  /** Persist the template and close the wizard. */
  onSave: () => void;
  /** Skip saving and close the wizard. */
  onSkip: () => void;
}

export function QuickBuildSaveTemplatePrompt({
  name,
  onNameChange,
  onSave,
  onSkip,
}: QuickBuildSaveTemplatePromptProps) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-600">Save this configuration as a reusable template?</p>
      <input
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Template name"
        className="w-full px-3 py-2 rounded-lg border border-ink-200 text-[13px] text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-400"
        onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
        autoFocus
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={!name.trim()}
          className="px-4 py-2 rounded-lg bg-accent-600 text-white text-[13px] font-medium hover:bg-accent-700 transition-colors focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save template
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="px-4 py-2 rounded-lg border border-ink-200 text-ink-600 text-[13px] font-medium hover:bg-ink-50 transition-colors focus-ring"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
