/**
 * NoteEditor
 * ==========
 * Two-mode note pane shown inside `Detail`'s header:
 *
 *   - `open=true`  → Editable textarea bound to `draft` + `onDraftChange`,
 *                     auto-saved on blur, with a "Clear note" affordance.
 *   - `open=false` → Compact preview button (only shown when there is a saved
 *                     note); clicking it re-opens the editor via `onOpen`.
 *
 * Parent `Detail` owns the draft state and the "open" flag so that keyboard
 * shortcuts (the "N" toggle) and the auto-reset on question change can drive
 * them. This component is purely controlled.
 */

interface NoteEditorProps {
  /** Whether the editor textarea is shown (vs the collapsed preview). */
  open: boolean;
  /** The draft text currently in the textarea (controlled). */
  draft: string;
  /** The previously-saved note (used to decide whether to show the preview). */
  note: string;
  /** Called whenever the textarea value changes. */
  onDraftChange: (text: string) => void;
  /** Persist callback — fires on blur with the trimmed draft. */
  onSaveNote: (text: string) => void;
  /** Called when user clicks the preview to re-open the editor. */
  onOpen: () => void;
  /**
   * Called when the user clicks "Clear note" inside the editor.
   * The implementation in `Detail` resets the draft AND calls `onSaveNote("")`.
   */
  onClear: () => void;
}

export function NoteEditor({
  open,
  draft,
  note,
  onDraftChange,
  onSaveNote,
  onOpen,
  onClear,
}: NoteEditorProps) {
  if (open) {
    return (
      <div className="mt-4 print:hidden">
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={() => onSaveNote(draft.trim())}
          placeholder="Your notes about this question…"
          className="w-full min-h-[88px] px-3.5 py-2.5 rounded-xl border border-ink-200 bg-ink-50 text-[13.5px] leading-relaxed text-ink-800 placeholder:text-ink-400 focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100 transition resize-vertical"
          autoFocus
        />
        <div className="flex items-center justify-between mt-1.5 text-[11px] text-ink-400">
          <span>Saved automatically.</span>
          {draft && (
            <button
              type="button"
              onClick={onClear}
              className="text-ink-500 hover:text-red-600 transition-colors"
            >
              Clear note
            </button>
          )}
        </div>
      </div>
    );
  }
  if (!note) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-3 text-left w-full px-3.5 py-2 rounded-lg border border-ink-150 bg-ink-50/60 text-[12.5px] text-ink-700 hover:bg-ink-50 transition-colors print:hidden"
    >
      <span className="font-medium text-ink-500 mr-1.5">Note:</span>
      <span className="line-clamp-2 inline">{note}</span>
    </button>
  );
}
