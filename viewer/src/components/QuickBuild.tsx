/**
 * QuickBuild
 * ==========
 * Two-step wizard for rapidly assembling a print set from the question index:
 *
 *   1. Configure — pick section / difficulty / domain filters, choose how many
 *      questions, decide whether to exclude already-selected or done items.
 *   2. Preview   — review the random sample, shuffle to re-roll, or commit it
 *      to the print set. On commit, optionally save the configuration as a
 *      reusable template.
 *
 * The wizard is a modal dialog with focus-trap, restoration, and ESC-to-close.
 * It's the only export consumed externally (lazy-loaded via
 * `LazyQuickBuildWizard` in `./lazy`), so the supporting sub-components live
 * in sibling files and are NOT re-exported from the components barrel — this
 * preserves the lazy chunk boundary.
 *
 * Sibling files:
 *   - QuickBuildPill.tsx                — toggle pill button primitive
 *   - QuickBuildTemplates.tsx           — Template type, useTemplates, sidebar
 *   - QuickBuildConfigureStep.tsx       — step 1 UI
 *   - QuickBuildPreviewStep.tsx         — step 2 UI
 *   - QuickBuildSaveTemplatePrompt.tsx  — post-add "save as template" prompt
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IndexEntry } from "@/types";
import { IDENTITY } from "@/lib/designTokens";
import { useFocusTrap } from "@/hooks";
import { QuickBuildConfigureStep } from "@/components/QuickBuildConfigureStep";
import { QuickBuildPreviewStep } from "@/components/QuickBuildPreviewStep";
import { QuickBuildSaveTemplatePrompt } from "@/components/QuickBuildSaveTemplatePrompt";
import {
  TemplateSidebar,
  useTemplates,
  type Template,
} from "@/components/QuickBuildTemplates";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface QuickBuildProps {
  open: boolean;
  onClose: () => void;
  index: IndexEntry[];
  alreadySelected: Set<string>;
  done: Set<string>;
  onAddToSet: (ids: string[]) => void;
  showToast: (msg: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function ciHas(set: Set<string>, value: string): boolean {
  if (set.has(value)) return true;
  const low = value.toLowerCase();
  for (const v of set) if (v.toLowerCase() === low) return true;
  return false;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Toggle a string value in a Set (immutably). */
function toggleInSet(set: Set<string>, val: string): Set<string> {
  const next = new Set(set);
  if (next.has(val)) next.delete(val);
  else next.add(val);
  return next;
}

/* ------------------------------------------------------------------ */
/*  QuickBuildWizard                                                   */
/* ------------------------------------------------------------------ */

export function QuickBuildWizard({
  open,
  onClose,
  index,
  alreadySelected,
  done,
  onAddToSet,
  showToast,
}: QuickBuildProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, open);

  /* ---- Wizard state ---- */
  const [step, setStep] = useState<"configure" | "preview">("configure");

  const [sections, setSections] = useState<Set<string>>(new Set());
  const [difficulties, setDifficulties] = useState<Set<string>>(new Set());
  const [domains, setDomains] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(10);
  const [excludeSelected, setExcludeSelected] = useState(true);
  const [excludeDone, setExcludeDone] = useState(false);

  const [previewIds, setPreviewIds] = useState<string[]>([]);
  const [savePrompt, setSavePrompt] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const { templates, save: saveTemplate, remove: removeTemplate } = useTemplates("sat:qb-templates");

  /* ---- Reset on open ---- */
  useEffect(() => {
    if (open) {
      setStep("configure");
      setSections(new Set());
      setDifficulties(new Set());
      setDomains(new Set());
      setCount(10);
      setExcludeSelected(true);
      setExcludeDone(false);
      setPreviewIds([]);
      setSavePrompt(false);
      setTemplateName("");
    }
  }, [open]);

  /* ---- Escape to close ---- */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  /* ---- Derived data ---- */

  /** All unique sections in the index. */
  const allSections = useMemo(
    () => [...new Set(index.map((e) => e.section))].sort(),
    [index],
  );

  /** All unique difficulties in canonical order. */
  const allDifficulties = useMemo(() => {
    const unique = new Set(index.map((e) => e.difficulty));
    const order = ["Easy", "Medium", "Hard"];
    return order.filter((d) => unique.has(d));
  }, [index]);

  /** Domains available for the currently-selected sections. */
  const availableDomains = useMemo(() => {
    let pool = index;
    if (sections.size > 0)
      pool = pool.filter((e) => ciHas(sections, e.section));
    return [...new Set(pool.map((e) => e.domain))].sort();
  }, [index, sections]);

  /** Pool of matching questions. */
  const matchingPool = useMemo(() => {
    let pool = index;
    if (sections.size > 0) pool = pool.filter((e) => ciHas(sections, e.section));
    if (difficulties.size > 0) pool = pool.filter((e) => ciHas(difficulties, e.difficulty));
    if (domains.size > 0) pool = pool.filter((e) => ciHas(domains, e.domain));
    if (excludeSelected) pool = pool.filter((e) => !alreadySelected.has(e.id));
    if (excludeDone) pool = pool.filter((e) => !done.has(e.id));
    return pool;
  }, [index, sections, difficulties, domains, excludeSelected, excludeDone, alreadySelected, done]);

  /** Pick random questions from the pool. */
  const buildSet = useCallback(() => {
    const picked = shuffle(matchingPool).slice(0, count);
    setPreviewIds(picked.map((e) => e.id));
    setStep("preview");
  }, [matchingPool, count]);

  /** Re-shuffle the preview. */
  const reshufflePreview = useCallback(() => {
    const picked = shuffle(matchingPool).slice(0, count);
    setPreviewIds(picked.map((e) => e.id));
  }, [matchingPool, count]);

  /** Confirm: add to print set. */
  const confirmAdd = useCallback(() => {
    if (previewIds.length === 0) return;
    onAddToSet(previewIds);
    showToast(`Added ${previewIds.length} question${previewIds.length === 1 ? "" : "s"} to print set`);
    setSavePrompt(true);
  }, [previewIds, onAddToSet, showToast]);

  /** Apply a saved template. */
  const applyTemplate = useCallback((t: Template) => {
    setSections(new Set(t.sections));
    setDifficulties(new Set(t.difficulties));
    setDomains(new Set(t.domains));
    setCount(t.count);
    setExcludeDone(t.excludeDone);
    setStep("configure");
    setPreviewIds([]);
    setSavePrompt(false);
  }, []);

  /** Save the current config as a template. */
  const handleSaveTemplate = useCallback(() => {
    const name = templateName.trim();
    if (!name) return;
    saveTemplate({
      name,
      sections: [...sections],
      difficulties: [...difficulties],
      domains: [...domains],
      count,
      excludeDone,
    });
    showToast(`Template "${name}" saved`);
    setSavePrompt(false);
    onClose();
  }, [templateName, sections, difficulties, domains, count, excludeDone, saveTemplate, showToast, onClose]);

  /* ---- Preview entries lookup ---- */
  const previewEntries = useMemo(() => {
    const map = new Map(index.map((e) => [e.id, e]));
    return previewIds.map((id) => map.get(id)).filter((e): e is IndexEntry => Boolean(e));
  }, [index, previewIds]);

  /* ---- Render ---- */
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-20 bg-ink-800/25 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qb-title"
    >
      <div
        ref={dialogRef}
        className={"bg-white rounded-2xl shadow-modal border border-ink-100 border-t-[3px] " + IDENTITY.topic.topBorder + " w-full max-w-lg overflow-hidden"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100">
          <h2 id="qb-title" className="text-[15px] font-semibold tracking-tight text-ink-800">
            Quick Build
          </h2>
          <button
            data-close
            data-autofocus
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors flex items-center justify-center focus-ring"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto thin-scrollbar">
          {step === "configure" && !savePrompt && (
            <QuickBuildConfigureStep
              allSections={allSections}
              allDifficulties={allDifficulties}
              availableDomains={availableDomains}
              sections={sections}
              difficulties={difficulties}
              domains={domains}
              count={count}
              excludeSelected={excludeSelected}
              excludeDone={excludeDone}
              matchCount={matchingPool.length}
              onToggleSection={(s) => setSections(toggleInSet(sections, s))}
              onToggleDifficulty={(d) => setDifficulties(toggleInSet(difficulties, d))}
              onToggleDomain={(d) => setDomains(toggleInSet(domains, d))}
              onSetCount={setCount}
              onSetExcludeSelected={setExcludeSelected}
              onSetExcludeDone={setExcludeDone}
              onBuild={buildSet}
            />
          )}

          {step === "preview" && !savePrompt && (
            <QuickBuildPreviewStep
              entries={previewEntries}
              onShuffle={reshufflePreview}
              onAdd={confirmAdd}
              onBack={() => setStep("configure")}
            />
          )}

          {savePrompt && (
            <QuickBuildSaveTemplatePrompt
              name={templateName}
              onNameChange={setTemplateName}
              onSave={handleSaveTemplate}
              onSkip={onClose}
            />
          )}

          {/* Template sidebar — always visible at bottom when on configure step */}
          {step === "configure" && !savePrompt && (
            <TemplateSidebar
              templates={templates}
              onUse={applyTemplate}
              onRemove={removeTemplate}
            />
          )}
        </div>
      </div>
    </div>
  );
}
