/**
 * TagInput
 * ========
 * Pill-chip multi-value input for "list of short strings" fields that today
 * are textareas split on `,` / `\n`. First consumer: PortfolioItemFormModal
 * Choices field (was `<textarea>`).
 *
 * Interaction model (Notion / Linear-style):
 *  • Type, then Enter or Comma commits the current text as a new tag.
 *  • Backspace on empty input deletes the previous tag.
 *  • ←/→ on empty input rove focus into the chip strip; Backspace/Delete on
 *    a focused chip removes it.
 *  • Paste of `apple, banana\ncherry` splits on `,` and `\n`, adding each.
 *  • Duplicates rejected with a brief ring flash (no toast).
 *  • Tab leaves the field — does NOT commit the current text. This avoids
 *    losing data when keyboard users move on after typing a half-tag.
 *
 * a11y:
 *  • Wrapper is `role="group"` with `aria-label`.
 *  • Chip strip is `role="list"`; each chip is `role="listitem"`.
 *  • Each × button has `aria-label="Remove {tag}"`.
 *  • A visually-hidden `role="status" aria-live="polite"` region announces
 *    add/remove for screen-reader users so they hear what happened.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";

export interface TagInputProps {
  /** Current tags. */
  value: ReadonlyArray<string>;
  /** Emits the next tag array (immutable update). */
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Optional cap; when reached the input rejects further additions. */
  maxTags?: number;
  /** Optional per-tag char cap; over-cap typing is truncated on commit. */
  maxTagLength?: number;
  /** Default false. When true, duplicate strings are allowed (case-sensitive). */
  allowDuplicates?: boolean;
  /** Default false. Marks the field invalid when empty + required is true. */
  required?: boolean;
  /** Accessibility label for the group. */
  ariaLabel?: string;
  /** Optional form id for labels pointing at the input. */
  id?: string;
  disabled?: boolean;
}

function normalize(raw: string): string {
  return raw.trim();
}

export function TagInput({
  value,
  onChange,
  placeholder,
  maxTags,
  maxTagLength,
  allowDuplicates = false,
  required = false,
  ariaLabel,
  id,
  disabled = false,
}: TagInputProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [draft, setDraft] = useState("");
  // Brief visual flash when a duplicate is rejected. Cleared on the next
  // commit or after 600ms.
  const [flashDuplicate, setFlashDuplicate] = useState(false);
  // For SR announcements.
  const [announcement, setAnnouncement] = useState("");
  const fallbackId = useId();
  const inputId = id ?? fallbackId;

  useEffect(() => {
    if (!flashDuplicate) return;
    const t = window.setTimeout(() => setFlashDuplicate(false), 600);
    return () => window.clearTimeout(t);
  }, [flashDuplicate]);

  const tags = value;

  const commit = useCallback(
    (raw: string): boolean => {
      const t = normalize(raw);
      if (!t) return false;
      const trimmed = maxTagLength && t.length > maxTagLength ? t.slice(0, maxTagLength) : t;
      if (!allowDuplicates && tags.includes(trimmed)) {
        setFlashDuplicate(true);
        setAnnouncement(`"${trimmed}" is already in the list`);
        return false;
      }
      if (maxTags !== undefined && tags.length >= maxTags) {
        setAnnouncement(`Maximum of ${maxTags} tags reached`);
        return false;
      }
      onChange([...tags, trimmed]);
      setAnnouncement(`Added ${trimmed}`);
      return true;
    },
    [allowDuplicates, maxTagLength, maxTags, onChange, tags],
  );

  const removeAt = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= tags.length) return;
      const removed = tags[idx];
      const next = tags.slice(0, idx).concat(tags.slice(idx + 1));
      onChange(next);
      setAnnouncement(`Removed ${removed}`);
      // Restore focus to input after removal.
      inputRef.current?.focus();
    },
    [onChange, tags],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      // Commit on Enter or Comma. Tab intentionally NOT a commit (see header).
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        if (commit(draft)) {
          setDraft("");
        }
        return;
      }
      // Backspace on empty input: delete the previous tag.
      if (e.key === "Backspace" && draft.length === 0 && tags.length > 0) {
        e.preventDefault();
        removeAt(tags.length - 1);
        return;
      }
      // ArrowLeft on empty input: focus the last chip for keyboard removal.
      if (e.key === "ArrowLeft" && draft.length === 0 && tags.length > 0) {
        e.preventDefault();
        const last = chipRefs.current[tags.length - 1];
        last?.focus();
      }
    },
    [commit, draft, removeAt, tags],
  );

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData("text");
      if (!pasted.includes(",") && !pasted.includes("\n")) {
        // Single-token paste — let the input handle it normally.
        return;
      }
      e.preventDefault();
      const parts = pasted.split(/[,\n]/);
      const before = tags.length;
      let next = [...tags];
      for (const p of parts) {
        const t = normalize(p);
        if (!t) continue;
        const trimmed = maxTagLength && t.length > maxTagLength ? t.slice(0, maxTagLength) : t;
        if (!allowDuplicates && next.includes(trimmed)) continue;
        if (maxTags !== undefined && next.length >= maxTags) break;
        next.push(trimmed);
      }
      if (next.length !== before) {
        onChange(next);
        setAnnouncement(`Added ${next.length - before} tags`);
      }
      setDraft("");
    },
    [allowDuplicates, maxTagLength, maxTags, onChange, tags],
  );

  const onChipKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
      if (e.key === "Backspace" || e.key === "Delete" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        removeAt(idx);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const nextRef = chipRefs.current[idx + 1];
        if (nextRef) {
          nextRef.focus();
        } else {
          inputRef.current?.focus();
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prevRef = chipRefs.current[idx - 1];
        prevRef?.focus();
        return;
      }
    },
    [removeAt],
  );

  const containerInvalid = required && tags.length === 0;
  const focusRing = "focus-within:ring-2 focus-within:ring-indigo-500";
  const baseBorder = containerInvalid
    ? "ring-1 ring-rose-300 dark:ring-rose-800"
    : flashDuplicate
      ? "ring-2 ring-amber-400 dark:ring-amber-500"
      : "ring-1 ring-slate-300 dark:ring-slate-700";

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? "Tags"}
      aria-invalid={containerInvalid || undefined}
      className={`relative flex flex-wrap items-center gap-1.5 rounded-lg bg-white dark:bg-slate-800 px-2 py-1.5 min-h-[40px] transition-shadow ${baseBorder} ${focusRing} ${disabled ? "opacity-60 pointer-events-none" : ""}`}
    >
      <ul role="list" className="contents">
        {tags.map((tag, idx) => (
          <li role="listitem" key={`${tag}-${idx}`} className="contents">
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-medium pl-2.5 pr-1 py-0.5">
              <span className="max-w-[200px] truncate">{tag}</span>
              <button
                type="button"
                ref={(el) => { chipRefs.current[idx] = el; }}
                onClick={() => removeAt(idx)}
                onKeyDown={(e) => onChipKeyDown(e, idx)}
                aria-label={`Remove ${tag}`}
                className="inline-flex items-center justify-center h-5 w-5 rounded-full text-indigo-500 hover:text-indigo-700 hover:bg-indigo-200/60 dark:text-indigo-400 dark:hover:text-indigo-200 dark:hover:bg-indigo-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <span aria-hidden>×</span>
              </button>
            </span>
          </li>
        ))}
      </ul>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={tags.length === 0 ? placeholder : ""}
        disabled={disabled}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 px-1"
      />
      {/* SR-only live region for add/remove announcements. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
