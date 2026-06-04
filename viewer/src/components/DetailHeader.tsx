/**
 * DetailHeader
 * ============
 * Big top header of the `Detail` pane, sitting just below the thin sticky
 * strip. It bundles together:
 *
 *   - Question number + bookmark / done / in-print-set toggles.
 *   - The SPR badge (when applicable).
 *   - A right-side toolbar: font stepper, note button, copy link, random,
 *     choice-analysis, reading mode, snapshot, flag, tag picker, and the
 *     position-count readout.
 *   - The metadata row (section · difficulty · domain · skill · more-like-this).
 *   - Embedded `NoteEditor` (controlled by note state held in `Detail`).
 *
 * Owns no persistent state — note-draft / note-open / choice-analysis-open
 * live in the parent `Detail`. Extracted to keep `Detail.tsx` focused on
 * orchestration rather than markup.
 */
import type { Question } from "@/types";
import { FlagButton, type QuestionFlag, type FlagType } from "@/components/QuestionFlags";
import { TagPicker, TagChips, type Tag } from "@/components/TagSystem";
import { ReadingModeToggle } from "@/components/ReadingMode";
import { SnapshotButton } from "@/components/QuestionSnapshot";
import { NoteEditor } from "@/components/NoteEditor";
import {
  IconButton,
  FontStepper,
  iconCls,
  StarOutline,
  StarFilled,
  CheckOutline,
  CheckFilled,
  CopyIcon,
  SetOutline,
  SetFilled,
  NoteIcon,
  ShuffleIcon,
} from "@/components/DetailIcons";
import type { Annotation } from "@/components/Annotations";
import { IDENTITY } from "@/lib/designTokens";

function difficultyChipClass(d: string): string {
  switch (d) {
    case "Easy":
      return "bg-emerald-50 text-emerald-700";
    case "Medium":
      return "bg-amber-50 text-amber-700";
    case "Hard":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-ink-100 text-ink-700";
  }
}

interface DetailHeaderProps {
  /** The current question (never null — caller guarantees). */
  question: Question;
  /** Position-aware display number. */
  number: number | null;
  position: number | null;
  total: number | null;
  /** Bookmark / done / print-set toggle state + handlers. */
  isBookmarked: boolean;
  isDone: boolean;
  isInSelection: boolean;
  onToggleBookmark: () => void;
  onToggleDone: () => void;
  onToggleSelection: () => void;
  /** Font-stepper state + handlers. */
  fontStep: number;
  onFontStep: (n: number) => void;
  fontMin: number;
  fontMax: number;
  /** Note state — controlled by Detail. */
  note: string;
  noteOpen: boolean;
  noteDraft: string;
  onNoteToggle: () => void;
  onNoteOpen: () => void;
  onNoteDraftChange: (text: string) => void;
  onSaveNote: (text: string) => void;
  onNoteClear: () => void;
  /** Top-bar action callbacks. */
  onCopyLink: () => void;
  onRandom: () => void;
  onOpenChoiceAnalysis: () => void;
  onOpenReading?: () => void;
  onFilterSimilar?: () => void;
  /** Snapshot button surface — only shown when `showToast` is provided. */
  showToast?: (msg: string) => void;
  /** Snapshot needs the current annotation set for this question. */
  annotationsForQuestion: Annotation[];
  /** Question flag state + handlers. */
  questionFlags?: QuestionFlag[];
  onAddFlag?: (flag: QuestionFlag) => void;
  onRemoveFlag?: (flagType: FlagType) => void;
  /** Tag system state + handlers. */
  tags?: Tag[];
  assignedTagIds?: string[];
  onToggleTag?: (tagId: string) => void;
  onCreateTag?: (name: string, color: string) => Tag;
}

export function DetailHeader({
  question,
  number,
  position,
  total,
  isBookmarked,
  isDone,
  isInSelection,
  onToggleBookmark,
  onToggleDone,
  onToggleSelection,
  fontStep,
  onFontStep,
  fontMin,
  fontMax,
  note,
  noteOpen,
  noteDraft,
  onNoteToggle,
  onNoteOpen,
  onNoteDraftChange,
  onSaveNote,
  onNoteClear,
  onCopyLink,
  onRandom,
  onOpenChoiceAnalysis,
  onOpenReading,
  onFilterSimilar,
  showToast,
  annotationsForQuestion,
  questionFlags,
  onAddFlag,
  onRemoveFlag,
  tags,
  assignedTagIds,
  onToggleTag,
  onCreateTag,
}: DetailHeaderProps) {
  return (
    <header className="mb-8">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h2 className="text-[26px] font-semibold tracking-tight text-ink-800 tabular-nums leading-none">
            {number != null ? (
              <>
                <span className="text-ink-300 font-medium mr-0.5">#</span>
                {number}
              </>
            ) : (
              "Question"
            )}
          </h2>
          <div className="flex items-center gap-1.5 print:hidden">
            <IconButton
              onClick={onToggleBookmark}
              active={isBookmarked}
              activeColor="amber"
              title={isBookmarked ? "Remove bookmark (B)" : "Bookmark (B)"}
            >
              {isBookmarked ? <StarFilled /> : <StarOutline />}
            </IconButton>
            <IconButton
              onClick={onToggleDone}
              active={isDone}
              activeColor="emerald"
              title={isDone ? "Mark not done (D)" : "Mark done (D)"}
            >
              {isDone ? <CheckFilled /> : <CheckOutline />}
            </IconButton>
            <IconButton
              onClick={onToggleSelection}
              active={isInSelection}
              activeColor="accent"
              title={isInSelection ? "Remove from print set (S)" : "Add to print set (S)"}
            >
              {isInSelection ? <SetFilled /> : <SetOutline />}
            </IconButton>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 print:hidden">
          <FontStepper
            value={fontStep}
            onChange={onFontStep}
            min={fontMin}
            max={fontMax}
          />
          <div className="w-px h-4 bg-ink-200 mx-1" aria-hidden />
          <IconButton
            onClick={onNoteToggle}
            active={noteOpen || (note?.length ?? 0) > 0}
            title={note ? "Edit note (N)" : "Add note (N)"}
          >
            <NoteIcon />
          </IconButton>
          <IconButton onClick={onCopyLink} title="Copy link (C)">
            <CopyIcon />
          </IconButton>
          <IconButton onClick={onRandom} title="Random question (G)">
            <ShuffleIcon />
          </IconButton>
          {question.type === "mcq" && (
            <IconButton
              onClick={onOpenChoiceAnalysis}
              title="Choice analysis"
            >
              <svg viewBox="0 0 24 24" className={iconCls} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="13" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </IconButton>
          )}
          {onOpenReading && (
            <ReadingModeToggle onClick={onOpenReading} />
          )}
          {showToast && (
            <SnapshotButton
              question={question}
              number={number}
              annotations={annotationsForQuestion}
              note={note ?? ""}
              showToast={showToast}
            />
          )}
          {onAddFlag && onRemoveFlag && (
            <FlagButton
              questionId={question.questionId}
              flags={questionFlags ?? []}
              onAdd={onAddFlag}
              onRemove={onRemoveFlag}
            />
          )}
          {onToggleTag && onCreateTag && tags && (
            <TagPicker
              questionId={question.questionId}
              tags={tags}
              assignedTagIds={assignedTagIds ?? []}
              onToggleTag={onToggleTag}
              onCreateTag={onCreateTag}
            />
          )}
          {position != null && total != null && (
            <span className="ml-2 text-[12px] text-ink-400 tabular-nums">
              {position.toLocaleString()} / {total.toLocaleString()}
            </span>
          )}
        </div>
      </div>
      <h2 className="sr-only">{question.skill}</h2>
      <div className="text-[12px] flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${IDENTITY.content.chipBg} ${IDENTITY.content.chipText}`}
        >
          {question.section}
        </span>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${difficultyChipClass(question.difficulty)}`}
        >
          {question.difficulty}
        </span>
        {question.type === "spr" && (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700"
            title="Student-Produced Response"
          >
            SPR
          </span>
        )}
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${IDENTITY.content.chipBg} ${IDENTITY.content.chipText}`}
        >
          {question.domain}
        </span>
        {question.skill && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${IDENTITY.topic.chipBg} ${IDENTITY.topic.chipText}`}
          >
            {question.skill}
          </span>
        )}
        {onFilterSimilar && (
          <button
            type="button"
            onClick={onFilterSimilar}
            className="text-accent-600 hover:text-accent-700 font-medium transition-colors focus-ring rounded px-1 text-[11.5px]"
          >
            More like this
          </button>
        )}
        {assignedTagIds && assignedTagIds.length > 0 && tags && (
          <TagChips
            tagIds={assignedTagIds}
            tags={tags}
          />
        )}
      </div>
      <NoteEditor
        open={noteOpen}
        draft={noteDraft}
        note={note}
        onDraftChange={onNoteDraftChange}
        onSaveNote={onSaveNote}
        onOpen={onNoteOpen}
        onClear={onNoteClear}
      />
    </header>
  );
}
