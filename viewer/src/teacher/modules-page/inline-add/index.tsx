/**
 * modules-page/inline-add
 * =======================
 * The two inline "add a row" forms used by the Modules surface, extracted
 * verbatim from ModulesPage so each file stays focused:
 *   - InlineCreateModuleRow — the "+ Module" inline create row (page owns it).
 *   - InlineAddItemRow       — the "+ Add item" form rendered inside a module
 *                              card's item list (six item types via a chip
 *                              row; Practice Test / Question Set clone an
 *                              existing template into a course-scoped row).
 *
 * Behavior is unchanged from the pre-extraction ModulesPage; the per-type DB
 * writes live in ./submit-handlers, the picker state in ./*-hooks, and the
 * picker UI in ./*-ui. See the inline comments below for the Practice-Test /
 * Question-Set clone model.
 *
 * Vocabulary note (matches /question-bank tabs + AssignmentDetailPage):
 *   - "Practice Test" → DB row kind='mocktest'   (full-length SAT)
 *   - "Question Set"  → DB row kind='qbank_set'  (pre-built CB set)
 * The DB enum stays unchanged; only the UI surface uses "Question Set" and
 * the internal InlineAddType value `question_set`.
 *
 * Practice Test and Question Set both insert two rows in sequence:
 *   1) `assignments` (kind='mocktest' or 'qbank_set' respectively)
 *   2) `module_items` (item_type='assignment', item_ref_id=<new id>)
 * If step 2 fails we best-effort delete the orphan assignment so the
 * teacher's Assignments page doesn't accumulate phantom rows.
 *
 * Practice Test PICKER MODEL (refactor): teachers PICK an existing mocktest
 * from their cross-course library (via useTeacherMockTests) instead of
 * configuring source/preset/time/questions inline. On submit we CLONE the
 * chosen template: snapshot its title/source/time/questions/difficulty into
 * a new assignments row scoped to the current course, then link it.
 *
 * PARKING LOT — explicitly deferred to follow-up PRs:
 *   - Optimistic insert + scroll-into-view + indigo flash
 *   - Real <Combobox> extraction to @/components
 *   - Recents list on catalog
 *   - "Add to multiple cohorts" broadcast
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";
import { canAccessQuestionBank } from "@/lib/access";
import { testRunPath } from "@/lib/routes";
import { useFullTests } from "@/fulltest/useFullTests";
import { useToast } from "@/components/Toast";
import { Combobox } from "@/components";
import { useAssignments } from "@/teacher/useAssignments";
import {
  readLastAddType,
  writeLastAddType,
  computeDefaultQbankTimeLimit,
  type InlineAddType,
} from "../persistence";
import type { InlineCreateModuleRowProps, InlineAddItemRowProps } from "./types";
import {
  insertModuleItem,
  createPracticeTestItem,
  createQuestionSetItem,
  insertFullTestLink,
  setFullTestOpenDate,
} from "./submit-handlers";
import { useFullTestSelection } from "./fulltest-hooks";
import { FullTestSection } from "./fulltest-ui";
import { usePracticeTestSelection } from "./practicetest-hooks";
import { PracticeTestSection } from "./practicetest-ui";
import { useQuestionSetSelection } from "./questionset-hooks";
import { QuestionSetSection } from "./questionset-ui";

export function InlineCreateModuleRow({
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
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 rounded disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || name.trim().length === 0}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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

// ---------------------------------------------------------------------------
// InlineAddItemRow — replaced the old AddItemModal (since deleted). Renders inside a
// module's item list when the user clicks "+ Add item". Six item types
// (assignment, full_test, question_set, practice_test, header, link)
// selectable via a chip row; the rest of the row shows only the fields each
// type actually needs. Enter commits, Esc cancels.
// ---------------------------------------------------------------------------
export function InlineAddItemRow({
  classId,
  module,
  usedAssignmentIds,
  onCommitted,
  onCommittedKeepOpen,
  onCancel,
}: InlineAddItemRowProps) {
  const { assignments } = useAssignments(classId);
  const { profile } = useProfile();
  const navigate = useNavigate();
  const toast = useToast();
  const userIdForKeys = profile?.id ?? null;

  // Question Bank content (Full-Test, Practice Test, Question Set) is restricted
  // to allow-listed educators — they can't add those item types to a module
  // either. Assignment / Header / Link stay available to everyone. See
  // lib/access.ts.
  const canQbank = canAccessQuestionBank(profile?.email);

  // Last-used type per (user, class) — preselect on open. Falls back to
  // 'assignment' the very first time.
  const [itemType, setItemType] = useState<InlineAddType>(
    () => readLastAddType(userIdForKeys, classId) ?? "assignment",
  );

  // If a non-allow-listed educator's persisted last-type is a Question Bank
  // type, fall back to Assignment so they never land on a hidden tab.
  useEffect(() => {
    if (
      !canQbank &&
      (itemType === "full_test" ||
        itemType === "question_set" ||
        itemType === "practice_test")
    ) {
      setItemType("assignment");
    }
  }, [canQbank, itemType]);

  const [title, setTitle] = useState("");
  // "Override display title" lives behind a disclosure; default closed.
  const [showOverrideTitle, setShowOverrideTitle] = useState(false);
  const [url, setUrl] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [busy, setBusy] = useState(false);

  // Full-Test picker: the full-length tests catalog + the chosen slug + module
  // selection / date state.
  const { tests: fullTests } = useFullTests(itemType === "full_test");
  const ft = useFullTestSelection(itemType);

  // Practice Test picker state.
  const pt = usePracticeTestSelection(profile?.id ?? null);

  // Question Set picker state.
  const qs = useQuestionSetSelection();

  // Persist type selection.
  useEffect(() => {
    writeLastAddType(userIdForKeys, classId, itemType);
  }, [itemType, userIdForKeys, classId]);

  const titleRef = useRef<HTMLInputElement | null>(null);

  const available = useMemo(
    () => assignments.filter((a) => !a.archived && !usedAssignmentIds.has(a.id)),
    [assignments, usedAssignmentIds],
  );

  // Focus shifts to the first meaningful field whenever the user switches type.
  useEffect(() => {
    titleRef.current?.focus();
  }, [itemType]);

  const maxPosition = module.items.reduce(
    (max, it) => (it.position > max ? it.position : max),
    -1,
  );

  // Reset just the per-item fields after a successful submit when the
  // teacher uses "Add and add another". Keeps itemType + due_at + source so
  // batch entry is fast (e.g. adding three Question Sets in a row).
  const resetPerItemFields = (): void => {
    setTitle("");
    setShowOverrideTitle(false);
    setUrl("");
    setAssignmentId("");
    pt.setPtTemplateId("");
    pt.setPtQuery("");
    pt.setPtHighlightIdx(0);
    qs.setPsSetUid("");
    qs.setPsTitle("");
    qs.setPsTitleDirty(false);
    qs.setPsQuery("");
    qs.setPsHighlightIdx(0);
    ft.setFtOpensAt(null);
  };

  const submit = async (keepOpen: boolean = false): Promise<void> => {
    if (busy) return;

    if (itemType === "assignment") {
      if (!assignmentId) {
        toast.warning("Pick an assignment");
        return;
      }
      const chosen = available.find((a) => a.id === assignmentId);
      if (!chosen) {
        toast.error("That assignment is no longer available");
        return;
      }
      const payloadTitle = title.trim() || chosen.title;
      setBusy(true);
      const insertErr = await insertModuleItem(supabase, {
        module_id: module.id,
        position: maxPosition + 1,
        item_type: "assignment",
        item_ref_id: chosen.id,
        title: payloadTitle,
        url: null,
      });
      setBusy(false);
      if (insertErr) {
        toast.error("Couldn't add item", insertErr);
        return;
      }
      toast.success("Item added", payloadTitle);
      if (keepOpen) {
        resetPerItemFields();
        void onCommittedKeepOpen();
      } else {
        onCommitted();
      }
      return;
    }

    if (itemType === "practice_test") {
      if (!profile?.id) {
        toast.error("Couldn't add Practice Test", "Not signed in.");
        return;
      }
      if (!pt.ptTemplateId) {
        toast.warning("Pick a practice test from your library");
        return;
      }
      const template = pt.ptLibrary.find((t) => t.id === pt.ptTemplateId);
      if (!template) {
        toast.error("That practice test is no longer available");
        return;
      }

      setBusy(true);
      try {
        const displayTitle = title.trim() || template.title;
        const result = await createPracticeTestItem(supabase, {
          classId,
          createdBy: profile.id,
          template,
          dueAt: pt.ptDueAt,
          displayTitle,
          moduleId: module.id,
          position: maxPosition + 1,
        });
        if (!result.ok) {
          if (result.createError) {
            toast.error("Couldn't create Practice Test", result.createError);
          } else if (result.linkError) {
            toast.error("Couldn't add to module", result.linkError);
          }
          return;
        }
        toast.success("Practice Test added", displayTitle);
        if (keepOpen) {
          resetPerItemFields();
          onCommittedKeepOpen();
        } else {
          onCommitted();
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    if (itemType === "question_set") {
      if (!profile?.id) {
        toast.error("Couldn't add Question Set", "Not signed in.");
        return;
      }
      if (!qs.psSetUid) {
        toast.warning("Pick a question-bank set");
        return;
      }
      const chosen = qs.catalogOptions.find((opt) => opt.uid === qs.psSetUid);
      if (!chosen) {
        toast.error("That set is no longer available");
        return;
      }
      const trimmedPsTitle = qs.psTitle.trim() || chosen.entry.label;
      const computedTimeLimit = computeDefaultQbankTimeLimit(
        chosen.entry.questionCount,
      );

      setBusy(true);
      try {
        const displayTitle = title.trim() || trimmedPsTitle;
        const result = await createQuestionSetItem(supabase, {
          classId,
          createdBy: profile.id,
          entry: chosen.entry,
          uid: chosen.uid,
          title: trimmedPsTitle,
          computedTimeLimit,
          dueAt: qs.psDueAt,
          displayTitle,
          moduleId: module.id,
          position: maxPosition + 1,
        });
        if (!result.ok) {
          if (result.createError) {
            toast.error("Couldn't create Question Set", result.createError);
          } else if (result.linkError) {
            toast.error("Couldn't add to module", result.linkError);
          }
          return;
        }
        toast.success("Question Set added", displayTitle);
        if (keepOpen) {
          resetPerItemFields();
          onCommittedKeepOpen();
        } else {
          onCommitted();
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    if (itemType === "full_test") {
      if (!ft.fullTestSlug) {
        toast.warning("Pick a full-length test");
        return;
      }
      // Guard the module selection before we touch the DB.
      if (ft.ftModules.length > 0 && ft.ftDeployed.size === 0) {
        toast.warning("Pick at least one module to deploy");
        return;
      }
      if (ft.ftIsSubset && !ft.ftContiguous) {
        toast.warning(
          "Modules must be contiguous",
          "Pick a continuous range — e.g. Reading & Writing (M1–M2) or Math (M1–M2).",
        );
        return;
      }
      const chosen = fullTests.find((t) => t.slug === ft.fullTestSlug);
      const payloadTitle = title.trim() || chosen?.title || "Full-length test";
      // A strict module subset is encoded in the LINK URL as `?m=<first>-<last>`
      // so it launches its OWN run with its OWN report (0156). Assign the same
      // test twice — e.g. modules 1-1 and 2-2 — and each is an independent
      // attempt rather than collapsing into one run. A full selection uses the
      // plain /test/<slug> link.
      const first = ft.ftDeployedSorted[0];
      const last = ft.ftDeployedSorted[ft.ftDeployedSorted.length - 1];
      const url =
        ft.ftIsSubset && first != null
          ? `${testRunPath(ft.fullTestSlug)}?m=${first}-${last}`
          : testRunPath(ft.fullTestSlug);
      setBusy(true);
      try {
        const insertErr = await insertFullTestLink(supabase, {
          module_id: module.id,
          position: maxPosition + 1,
          title: payloadTitle,
          url,
        });
        if (insertErr) {
          toast.error("Couldn't add Full-Test", insertErr);
          return;
        }
        // Write the single "Available from" date across the deployed range
        // (full test = min..max position). Skip if not set (= open now). A
        // scheduling failure shouldn't fail the add — warn but keep going.
        if (ft.ftOpensAt) {
          const firstPos = first ?? ft.ftDeployedSorted[0];
          const lastPos = last ?? ft.ftDeployedSorted[ft.ftDeployedSorted.length - 1];
          const dateErr = await setFullTestOpenDate(supabase, {
            classId,
            slug: ft.fullTestSlug,
            first: firstPos,
            last: lastPos,
            opensAt: ft.ftOpensAt,
          });
          if (dateErr) {
            toast.warning("Added, but the date didn't update", dateErr);
          }
        }
        toast.success(
          "Full-Test added",
          ft.ftIsSubset ? `${payloadTitle} · modules ${first}–${last}` : payloadTitle,
        );
        if (keepOpen) {
          resetPerItemFields();
          onCommittedKeepOpen();
        } else {
          onCommitted();
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    if (itemType === "link") {
      const payloadTitle = title.trim();
      if (!payloadTitle) {
        toast.warning("Please enter a title");
        return;
      }
      if (!url.trim()) {
        toast.warning("Please enter a URL");
        return;
      }
      setBusy(true);
      const insertErr = await insertModuleItem(supabase, {
        module_id: module.id,
        position: maxPosition + 1,
        item_type: "link",
        item_ref_id: null,
        title: payloadTitle,
        url: url.trim(),
      });
      setBusy(false);
      if (insertErr) {
        toast.error("Couldn't add item", insertErr);
        return;
      }
      toast.success("Item added", payloadTitle);
      if (keepOpen) {
        resetPerItemFields();
        onCommittedKeepOpen();
      } else {
        onCommitted();
      }
      return;
    }

    // header
    const payloadTitle = title.trim();
    if (!payloadTitle) {
      toast.warning("Please enter a header title");
      return;
    }
    setBusy(true);
    const insertErr = await insertModuleItem(supabase, {
      module_id: module.id,
      position: maxPosition + 1,
      item_type: "header",
      item_ref_id: null,
      title: payloadTitle,
      url: null,
    });
    setBusy(false);
    if (insertErr) {
      toast.error("Couldn't add item", insertErr);
      return;
    }
    toast.success("Item added", payloadTitle);
    if (keepOpen) {
      resetPerItemFields();
      onCommittedKeepOpen();
    } else {
      onCommitted();
    }
  };

  // Filter-pill style (Ivy kit `.pill`): compact, hug-content — never
  // stretched edge-to-edge in a grid. Mobile keeps the ≥40px tap target
  // via min-h; desktop stays dense.
  const chipClass = (active: boolean): string =>
    "inline-flex items-center justify-center rounded-full px-3 min-h-[40px] md:min-h-[26px] text-xs md:text-[11px] font-medium transition-colors " +
    (active
      ? "bg-indigo-600 text-white ring-1 ring-indigo-600"
      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700 hover:ring-slate-400 dark:hover:ring-slate-500 hover:text-slate-900 dark:hover:text-slate-100");

  // Type selector — fused-band segmented control, same recipe as the course
  // subtab band in CourseTabStrip (tinted band, raised white active pill).
  const typeChipClass = (active: boolean): string =>
    "whitespace-nowrap min-h-[40px] md:min-h-[30px] inline-flex items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors " +
    (active
      ? "bg-white dark:bg-slate-900 text-accent-800 dark:text-accent-200 font-semibold shadow-sm ring-1 ring-accent-600/20"
      : "text-accent-800/80 dark:text-accent-200/80 hover:bg-white/60 dark:hover:bg-slate-900/50 hover:text-accent-800 dark:hover:text-accent-200");

  // 14px stroke icons per type — same line-icon language as the module rows'
  // ItemTypeIcon (tree.tsx), so a chip previews the row it will create.
  const TYPE_ICON: Record<InlineAddType, JSX.Element> = {
    assignment: (
      <>
        <path d="M5 4a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
        <path d="M14 2v5h5" />
        <path d="M9 13h6M9 16.5h4" />
      </>
    ),
    full_test: <><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.5 2M10 2.5h4" /></>,
    question_set: (
      <>
        <path d="m12 2 9 4.5-9 4.5-9-4.5L12 2Z" />
        <path d="m3 11.5 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
      </>
    ),
    practice_test: (
      <>
        <path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1Z" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="m9 14 2 2 4-4" />
      </>
    ),
    header: <path d="M4 7h16M4 12h10M4 17h7" />,
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.07 0l1.93-1.93a5 5 0 0 0-7.07-7.07L11 5" />
        <path d="M14 11a5 5 0 0 0-7.07 0L5 12.93a5 5 0 0 0 7.07 7.07L13 19" />
      </>
    ),
  };

  // One quiet line under the band explaining what the selected type adds —
  // Full-Test / Practice Test / Question Set are easy to confuse otherwise.
  const TYPE_HINT: Record<InlineAddType, string> = {
    assignment: "Link an assignment that already exists in this course.",
    full_test: "A full-length SAT in the locked test runner — pick which modules to deploy.",
    question_set: "A pre-built Question Bank set, auto-scored on submission.",
    practice_test: "Clone a practice test from your library into this course.",
    header: "A bold divider row that groups the items below it.",
    link: "An external URL — opens for students in a new tab.",
  };

  const chip = (type: InlineAddType, label: string): JSX.Element => {
    const active = itemType === type;
    return (
      <button
        type="button"
        onClick={() => setItemType(type)}
        aria-pressed={active}
        className={typeChipClass(active)}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="h-3.5 w-3.5 flex-none opacity-70"
        >
          {TYPE_ICON[type]}
        </svg>
        {label}
      </button>
    );
  };

  // Helper labels for context-aware submit button (2h).
  const submitLabel = (() => {
    if (busy) return "Adding…";
    switch (itemType) {
      case "assignment": return "Add Assignment";
      case "practice_test": return "Add Practice Test";
      case "full_test": return "Add Full-Test";
      case "question_set": return "Add Question Set";
      case "header": return "Add Header";
      case "link": return "Add Link";
    }
  })();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className="rounded-lg ring-1 ring-indigo-300 dark:ring-indigo-700 bg-indigo-50/40 dark:bg-indigo-950/20 p-3 space-y-2"
    >
      {/* Type chips. "TYPE" eyebrow text hidden as sr-only — visual label is
          redundant with the chip row. Fused band (CourseTabStrip recipe):
          chips hug content and wrap; the tint carries the grouping. */}
      <div>
        <span className="sr-only">Item type</span>
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-accent-600/[0.08] dark:bg-accent-400/[0.14] px-1.5 py-1.5">
          {chip("assignment", "Assignment")}
          {canQbank && chip("full_test", "Full-Test")}
          {canQbank && chip("question_set", "Question Set")}
          {canQbank && chip("practice_test", "Practice Test")}
          {chip("header", "Header")}
          {chip("link", "Link")}
        </div>
        <p className="mt-1 px-1 text-[11px] text-slate-500 dark:text-slate-400">
          {TYPE_HINT[itemType]}
        </p>
      </div>

      {itemType === "assignment" && (
        <div className="space-y-1.5">
          <Combobox
            value={assignmentId || null}
            onChange={(v) => setAssignmentId(v)}
            options={available.map((a) => ({ value: a.id, label: a.title }))}
            disabled={busy || available.length === 0}
            ariaLabel="Assignment"
            placeholder={
              available.length === 0
                ? "No unassigned assignments — create one first"
                : "Pick an assignment…"
            }
            searchPlaceholder="Type to filter assignments…"
            emptyText="No matching assignments"
          />
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Display title (optional — defaults to assignment title)"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
        </div>
      )}

      {itemType === "full_test" && (
        <FullTestSection
          fullTests={fullTests}
          title={title}
          setTitle={setTitle}
          busy={busy}
          chipClass={chipClass}
          ft={ft}
        />
      )}

      {itemType === "practice_test" && (
        <PracticeTestSection
          pt={pt}
          title={title}
          setTitle={setTitle}
          busy={busy}
          chipClass={chipClass}
          showOverrideTitle={showOverrideTitle}
          setShowOverrideTitle={setShowOverrideTitle}
          titleRef={titleRef}
          navigate={navigate}
        />
      )}

      {itemType === "question_set" && (
        <QuestionSetSection
          qs={qs}
          title={title}
          setTitle={setTitle}
          busy={busy}
          chipClass={chipClass}
          showOverrideTitle={showOverrideTitle}
          setShowOverrideTitle={setShowOverrideTitle}
          titleRef={titleRef}
        />
      )}

      {itemType === "header" && (
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Header title — e.g. 'Week 1: Linear Equations'"
          disabled={busy}
          className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
        />
      )}

      {itemType === "link" && (
        <div className="space-y-1.5">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Link title"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
        </div>
      )}

      <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Enter to add · Esc to cancel
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
          {/* "Add and add another" (2f). Submits then re-opens with the same
              chip selection but cleared per-item fields. */}
          <button
            type="button"
            onClick={() => void submit(true)}
            disabled={busy}
            title="Submit and keep the form open for another"
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-300 dark:ring-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-50"
          >
            Add and add another
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
