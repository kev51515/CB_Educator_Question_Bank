import { useEffect, useRef, useState } from "react";
import type { Question } from "@/types";
import { useAnnotations, AnnotationToolbar, type Annotation } from "@/components/Annotations";
import { PracticeMode } from "@/components/PracticeMode";
import { StickyActions } from "@/components/StickyActions";
import type { QuestionFlag, FlagType } from "@/components/QuestionFlags";
import type { Tag } from "@/components/TagSystem";
import { ProgressiveHints } from "@/components/ProgressiveHints";
import { SimilarQuestionsPanel } from "@/components/SearchExtras";
import { useChoiceNotes, ChoiceAnalysisPanel } from "@/components/ChoiceAnalysis";
import { QuestionHtml } from "@/components/QuestionHtml";
import { AnswerOptions } from "@/components/AnswerOptions";
import { AnswerActions } from "@/components/AnswerActions";
import { SprAnswerInput } from "@/components/SprAnswerInput";
import { RationaleBlock } from "@/components/RationaleBlock";
import { DetailHeader } from "@/components/DetailHeader";
import { DetailFootnote } from "@/components/DetailFootnote";
import {
  DetailSetupPrompt,
  DetailNoResults,
  DetailNoSelection,
  DetailLoadError,
  DetailSkeleton,
} from "@/components/DetailEmptyStates";

interface DetailProps {
  question: Question | null;
  number: number | null;
  position: number | null;
  total: number | null;
  loading: boolean;
  error: string | null;
  showAnswer: boolean;
  showRationale: boolean;
  onToggleAnswer: () => void;
  onToggleRationale: () => void;
  setupComplete: boolean;
  missingRequired: string[];
  isBookmarked: boolean;
  isDone: boolean;
  onToggleBookmark: () => void;
  onToggleDone: () => void;
  onRandom: () => void;
  onCopyLink: () => void;
  fontStep: number;
  onFontStep: (n: number) => void;
  fontMin: number;
  fontMax: number;
  fontStepPx: number;
  isInSelection: boolean;
  onToggleSelection: () => void;
  note: string;
  onSaveNote: (text: string) => void;
  onReset?: () => void;
  filteredCount?: number;
  confidenceRating?: number;
  onRateConfidence?: (rating: number) => void;
  onFilterSimilar?: () => void;
  viewMode?: "browse" | "practice" | "flashcard";
  questionFlags?: QuestionFlag[];
  onAddFlag?: (flag: QuestionFlag) => void;
  onRemoveFlag?: (flagType: FlagType) => void;
  tags?: Tag[];
  assignedTagIds?: string[];
  onToggleTag?: (tagId: string) => void;
  onCreateTag?: (name: string, color: string) => Tag;
  similarPanelData?: {
    current: import("../types").IndexEntry | null;
    similar: import("../types").IndexEntry[];
  };
  onPickSimilar?: (id: string) => void;
  onOpenReading?: () => void;
  showToast?: (msg: string) => void;
  timeStats?: { count: number; totalSeconds: number; avgSeconds: number };
}

const LETTERS = ["A", "B", "C", "D", "E"];

export function Detail({
  question,
  number,
  position,
  total,
  loading,
  error,
  showAnswer,
  showRationale,
  onToggleAnswer,
  onToggleRationale,
  setupComplete,
  missingRequired,
  isBookmarked,
  isDone,
  onToggleBookmark,
  onToggleDone,
  onRandom,
  onCopyLink,
  fontStep,
  onFontStep,
  fontMin,
  fontMax,
  fontStepPx,
  isInSelection,
  onToggleSelection,
  note,
  onSaveNote,
  onReset,
  filteredCount,
  confidenceRating,
  onRateConfidence,
  onFilterSimilar,
  viewMode = "browse",
  questionFlags,
  onAddFlag,
  onRemoveFlag,
  tags,
  assignedTagIds,
  onToggleTag,
  onCreateTag,
  similarPanelData,
  onPickSimilar,
  onOpenReading,
  showToast,
  timeStats,
}: DetailProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [headerOut, setHeaderOut] = useState(false);
  const annotations = useAnnotations("sat:annotations");
  const [annotationColor, setAnnotationColor] = useState<Annotation["color"]>("yellow");
  const choiceNotes = useChoiceNotes("sat:choice-notes");
  const [choiceAnalysisOpen, setChoiceAnalysisOpen] = useState(false);

  const captureSelection = () => {
    if (!question) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text) return;
    annotations.add(question.questionId, {
      questionId: question.questionId,
      color: annotationColor,
      text,
      startOffset: 0,
      endOffset: text.length,
    });
    sel.removeAllRanges();
  };

  // Re-sync draft when question changes
  useEffect(() => {
    setNoteDraft(note ?? "");
    setNoteOpen(false);
  }, [question?.questionId, note]);
  // Listen for keyboard "N" shortcut
  useEffect(() => {
    const onToggle = () => setNoteOpen((v) => !v);
    window.addEventListener("sat:toggle-note", onToggle);
    return () => window.removeEventListener("sat:toggle-note", onToggle);
  }, []);
  // Reset scroll on question change
  useEffect(() => {
    if (container) container.scrollTop = 0;
  }, [question?.questionId, container]);
  // Watch sentinel for sticky-header visibility
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setHeaderOut(!entry.isIntersecting),
      { rootMargin: "-1px 0px 0px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [question?.questionId]);
  if (!setupComplete) {
    return <DetailSetupPrompt missingRequired={missingRequired} />;
  }

  if (filteredCount === 0 && !loading) {
    return <DetailNoResults onReset={onReset} />;
  }

  if (!question && !loading && !error) {
    return <DetailNoSelection />;
  }

  if (error) {
    return <DetailLoadError error={error} />;
  }

  if (loading || !question) {
    return <DetailSkeleton />;
  }

  const hasMcqOptions =
    Array.isArray(question.answerOptions) && question.answerOptions.length > 0;
  const isMcq = question.type === "mcq" && hasMcqOptions;
  const isSpr = question.type === "spr";
  const correctIds = new Set(question.keys || []);
  const correctIndex = isMcq
    ? (question.answerOptions ?? []).findIndex((o) => correctIds.has(o.id))
    : -1;
  const correctLetter = correctIndex >= 0 ? LETTERS[correctIndex] : "";
  const sprAnswer = isSpr ? (question.keys?.[0] ?? "") : "";
  const stem = (question.stem || "").trim();
  const rationaleText = (question.rationale || "").trim();
  const hasRationale = rationaleText.length > 0;
  const hasMcqAnswer = isMcq && correctIndex >= 0;
  const hasSprAnswer = isSpr && sprAnswer.length > 0;
  const canShowAnswer = hasMcqAnswer || hasSprAnswer;

  const stemFontPx = 16 + fontStep * fontStepPx;

  return (
    <main
      ref={setContainer}
      className="flex-1 min-w-0 overflow-y-auto thin-scrollbar bg-white print:overflow-visible relative"
      style={{ ["--qfs" as string]: `${stemFontPx}px` }}
    >
      {/* Thin sticky strip: appears once the main header scrolls out of view */}
      <div
        className={
          "sticky top-0 z-[1] bg-white/85 backdrop-blur-md border-b border-ink-150 px-6 py-2 print:hidden text-[12px] transition-opacity duration-150 " +
          (headerOut ? "opacity-100" : "opacity-0 pointer-events-none")
        }
        aria-hidden={!headerOut}
        /*
         * `inert` removes children from the tab order while the strip is
         * hidden. Required by the axe-core `aria-hidden-focus` rule —
         * focusable buttons (Show answer / Show rationale) must not live
         * inside an aria-hidden subtree. React 19 supports `inert` as a
         * boolean attribute; the cast preserves type-safety against older
         * @types/react.
         */
        {...({ inert: !headerOut ? true : undefined } as Record<string, unknown>)}
      >
        <div className="flex items-center justify-between gap-3 max-w-[44rem] mx-auto">
          <div className="flex items-center gap-2 min-w-0">
            <span className="tabular-nums font-semibold text-ink-800 shrink-0">
              {number != null ? `#${number}` : "Question"}
            </span>
            <span className="text-ink-300">·</span>
            <span className="truncate text-ink-600">{question.skill}</span>
          </div>
          {position != null && total != null && (
            <span className="text-ink-400 tabular-nums shrink-0">
              {position.toLocaleString()} / {total.toLocaleString()}
            </span>
          )}
          <StickyActions
            visible={true}
            showAnswer={showAnswer}
            showRationale={showRationale}
            onToggleAnswer={onToggleAnswer}
            onToggleRationale={onToggleRationale}
            canShowAnswer={canShowAnswer}
            hasRationale={hasRationale}
            correctLetter={correctLetter}
          />
        </div>
      </div>
      <div className="max-w-[44rem] mx-auto px-10 lg:px-14 py-12">
        <div ref={sentinelRef} aria-hidden />
        <DetailHeader
          question={question}
          number={number}
          position={position}
          total={total}
          isBookmarked={isBookmarked}
          isDone={isDone}
          isInSelection={isInSelection}
          onToggleBookmark={onToggleBookmark}
          onToggleDone={onToggleDone}
          onToggleSelection={onToggleSelection}
          fontStep={fontStep}
          onFontStep={onFontStep}
          fontMin={fontMin}
          fontMax={fontMax}
          note={note}
          noteOpen={noteOpen}
          noteDraft={noteDraft}
          onNoteToggle={() => setNoteOpen((v) => !v)}
          onNoteOpen={() => setNoteOpen(true)}
          onNoteDraftChange={setNoteDraft}
          onSaveNote={onSaveNote}
          onNoteClear={() => {
            setNoteDraft("");
            onSaveNote("");
          }}
          onCopyLink={onCopyLink}
          onRandom={onRandom}
          onOpenChoiceAnalysis={() => setChoiceAnalysisOpen(true)}
          onOpenReading={onOpenReading}
          onFilterSimilar={onFilterSimilar}
          showToast={showToast}
          annotationsForQuestion={annotations.get(question.questionId)}
          questionFlags={questionFlags}
          onAddFlag={onAddFlag}
          onRemoveFlag={onRemoveFlag}
          tags={tags}
          assignedTagIds={assignedTagIds}
          onToggleTag={onToggleTag}
          onCreateTag={onCreateTag}
        />

        {question.stimulus && (
          <section
            className="mb-8 pl-5 border-l-[3px] border-ink-200 text-ink-800 leading-relaxed"
            style={{ fontSize: "calc(var(--qfs) - 0.5px)" }}
          >
            <QuestionHtml html={question.stimulus} />
          </section>
        )}

        <section
          className="mb-8 font-medium leading-relaxed text-ink-800"
          style={{ fontSize: "var(--qfs)" }}
        >
          {stem ? (
            <QuestionHtml html={stem} />
          ) : (
            <p className="italic text-ink-400">(No prompt text in source.)</p>
          )}
        </section>

        {(viewMode === "practice" || viewMode === "flashcard") && (
          <PracticeMode
            question={question}
            showAnswer={showAnswer}
            onToggleAnswer={onToggleAnswer}
            onToggleRationale={onToggleRationale}
            showRationale={showRationale}
            hasRationale={hasRationale}
            fontSizeVar={`${stemFontPx}px`}
            flashcardMode={viewMode === "flashcard"}
          />
        )}

        {viewMode === "browse" && (<>
        {isMcq && (
          <AnswerOptions
            options={question.answerOptions ?? []}
            correctIds={correctIds}
            showAnswer={showAnswer}
          />
        )}

        {isSpr && (
          <SprAnswerInput showAnswer={showAnswer} sprAnswer={sprAnswer} />
        )}

        {/* Fallback for questions whose type is neither mcq nor spr (or mcq without options) */}
        {!isMcq && !isSpr && (
          <section className="mb-8">
            <div className="px-5 py-5 rounded-xl border border-ink-200 bg-ink-50 text-[13.5px] text-ink-600">
              This question has an unrecognized format
              {question.type ? (
                <>
                  {" "}(<span className="font-mono">{question.type}</span>)
                </>
              ) : null}
              . The prompt above is rendered as-is; see the rationale below for the
              full solution.
            </div>
          </section>
        )}

        {/* Warn if MCQ but the answer key references no choice */}
        {isMcq && !hasMcqAnswer && showAnswer && (
          <section className="mb-6">
            <div className="px-4 py-3 rounded-xl border border-amber-300 bg-amber-50 text-[13px] text-amber-800">
              Answer key not available for this question; see rationale below for the
              correct choice.
            </div>
          </section>
        )}

        <AnswerActions
          showAnswer={showAnswer}
          showRationale={showRationale}
          canShowAnswer={canShowAnswer}
          hasRationale={hasRationale}
          hasMcqAnswer={hasMcqAnswer}
          correctLetter={correctLetter}
          onToggleAnswer={onToggleAnswer}
          onToggleRationale={onToggleRationale}
          questionId={question.questionId}
          confidenceRating={confidenceRating}
          onRateConfidence={onRateConfidence}
        />

        {question && (
          <AnnotationToolbar
            questionId={question.questionId}
            annotations={annotations.get(question.questionId)}
            activeColor={annotationColor}
            onColorChange={setAnnotationColor}
            onCaptureSelection={captureSelection}
            onRemove={(id) => annotations.remove(question.questionId, id)}
            onClearAll={() => annotations.clear(question.questionId)}
          />
        )}

        {!showRationale && hasRationale && (
          <ProgressiveHints question={question} />
        )}
        {showRationale && hasRationale && (
          <RationaleBlock question={question} />
        )}

        {similarPanelData?.current && similarPanelData.similar.length > 0 && onPickSimilar && (
          <SimilarQuestionsPanel
            current={similarPanelData.current}
            index={similarPanelData.similar}
            onPick={onPickSimilar}
          />
        )}
        </>)}

        <DetailFootnote questionId={question.questionId} timeStats={timeStats} />
      </div>
      <ChoiceAnalysisPanel
        question={question}
        notes={choiceNotes.getAll(question.questionId)}
        onSaveNote={(choiceId, text) => choiceNotes.set(question.questionId, choiceId, text)}
        open={choiceAnalysisOpen}
        onClose={() => setChoiceAnalysisOpen(false)}
      />
    </main>
  );
}
