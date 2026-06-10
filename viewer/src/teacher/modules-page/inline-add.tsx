/**
 * modules-page/inline-add
 * =======================
 * The two inline "add a row" forms used by the Modules surface, extracted
 * verbatim from ModulesPage so each file stays focused:
 *   - InlineCreateModuleRow — the "+ Module" inline create row (page owns it).
 *   - InlineAddItemRow       — the "+ Add item" form rendered inside a module
 *                              card's item list (five item types via a chip
 *                              row; Practice Test / Question Set clone an
 *                              existing template into a course-scoped row).
 *
 * Behavior is unchanged from the pre-extraction ModulesPage; see the
 * inline comments below for the Practice-Test / Question-Set clone model.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";
import { canAccessQuestionBank } from "@/lib/access";
import { ROUTES, testRunPath } from "@/lib/routes";
import { useFullTests } from "@/fulltest/useFullTests";
import { sectionSummary, formatTestDuration } from "@/fulltest/testSections";
import { SmartDatePicker } from "@/components";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/Skeleton";
import { type CourseModule } from "@/teacher/useCourseModules";
import { useAssignments } from "@/teacher/useAssignments";
import { useTeacherMockTests, type TeacherMockTest } from "@/teacher/useTeacherMockTests";
import {
  catalogEntryUid,
  useQuestionBankCatalog,
} from "@/teacher/useQuestionBankCatalog";
import {
  computeDefaultQbankTimeLimit,
  readQbankLastFilter,
  writeQbankLastFilter,
  readLastAddType,
  writeLastAddType,
  readPtLibraryLastFilter,
  writePtLibraryLastFilter,
  type InlineAddType,
  type PracticeTestSourceFilter,
  type QbankSectionFilter,
  type QbankDifficultyFilter,
} from "./persistence";

interface InlineCreateModuleRowProps {
  busy: boolean;
  onCommit: (name: string) => Promise<boolean>;
  onCancel: () => void;
}

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
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || name.trim().length === 0}
          className="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
// InlineAddItemRow — modern alternative to AddItemModal. Renders inside a
// module's item list when the user clicks "+ Add item". Five item types
// (assignment, practice_test, question_set, header, link) selectable via a
// chip row; the rest of the row shows only the fields each type actually
// needs. Enter commits, Esc cancels.
//
// Vocabulary note (matches /question-bank tabs + AssignmentDetailPage):
//   - "Practice Test" → DB row kind='mocktest'   (full-length SAT)
//   - "Question Set"  → DB row kind='qbank_set'  (pre-built CB set)
// The DB enum stays unchanged; only the UI surface uses "Question Set" and
// the internal InlineAddType value `question_set`.
//
// Practice Test and Question Set both insert two rows in sequence:
//   1) `assignments` (kind='mocktest' or 'qbank_set' respectively)
//   2) `module_items` (item_type='assignment', item_ref_id=<new id>)
// If step 2 fails we best-effort delete the orphan assignment so the
// teacher's Assignments page doesn't accumulate phantom rows.
//
// Practice Test PICKER MODEL (refactor): teachers PICK an existing mocktest
// from their cross-course library (via useTeacherMockTests) instead of
// configuring source/preset/time/questions inline. On submit we CLONE the
// chosen template: snapshot its title/source/time/questions/difficulty into
// a new assignments row scoped to the current course, then link it. This
// matches the "templates are picked, but the row that ends up in this
// course IS course-scoped" mental model and mirrors Question Set's flow.
//
// PARKING LOT — explicitly deferred to follow-up PRs:
//   - Optimistic insert + scroll-into-view + indigo flash
//   - Real <Combobox> extraction to @/components
//   - Recents list on catalog
//   - "Add to multiple cohorts" broadcast
// ---------------------------------------------------------------------------
interface InlineAddItemRowProps {
  classId: string;
  module: CourseModule;
  usedAssignmentIds: ReadonlySet<string>;
  /** Close the form + refresh module list. */
  onCommitted: () => void;
  /** Refresh the module list but keep the form mounted ("Add and add another"). */
  onCommittedKeepOpen: () => void;
  onCancel: () => void;
}

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
  const {
    catalog: qbankCatalog,
    loading: catalogLoading,
    error: catalogError,
    refresh: refreshCatalog,
  } = useQuestionBankCatalog();
  const {
    mockTests: ptLibrary,
    loading: ptLibraryLoading,
    error: ptLibraryError,
  } = useTeacherMockTests(profile?.id ?? null);
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
  // Full-Test picker: the full-length tests catalog + the chosen slug.
  const { tests: fullTests } = useFullTests(itemType === "full_test");
  const [fullTestSlug, setFullTestSlug] = useState("");
  // Module selection for a Full-Test: the teacher picks WHICH modules to deploy
  // to this course (e.g. Reading & Writing only). Defaults to all modules. A
  // strict subset is persisted via set_test_module_windows (0144) after the
  // link is created. `ftModules` is the chosen test's module list.
  interface FtModule {
    position: number;
    section: string;
    label: string;
    time_limit_seconds: number;
    question_count: number;
  }
  const [ftModules, setFtModules] = useState<FtModule[]>([]);
  const [ftDeployed, setFtDeployed] = useState<Set<number>>(new Set());

  // Load the chosen test's modules so the teacher can pick a subset. Defaults
  // every module selected (= full test, no windows written).
  useEffect(() => {
    if (itemType !== "full_test" || !fullTestSlug) {
      setFtModules([]);
      setFtDeployed(new Set());
      return;
    }
    let alive = true;
    void (async () => {
      const { data: t } = await supabase
        .from("tests")
        .select("id")
        .eq("slug", fullTestSlug)
        .single();
      if (!alive) return;
      if (!t) {
        setFtModules([]);
        setFtDeployed(new Set());
        return;
      }
      const { data } = await supabase
        .from("test_modules")
        .select("position, section, label, time_limit_seconds, question_count")
        .eq("test_id", t.id)
        .order("position");
      if (!alive) return;
      const mods = (data ?? []) as FtModule[];
      setFtModules(mods);
      setFtDeployed(new Set(mods.map((m) => m.position)));
    })();
    return () => {
      alive = false;
    };
  }, [itemType, fullTestSlug]);

  // Deployed positions are valid only as a non-empty CONTIGUOUS range (the run
  // walks first→last; set_test_module_windows enforces this server-side too).
  const ftDeployedSorted = useMemo(
    () => [...ftDeployed].sort((a, b) => a - b),
    [ftDeployed],
  );
  const ftContiguous = useMemo(() => {
    if (ftDeployedSorted.length === 0) return false;
    return (
      ftDeployedSorted[ftDeployedSorted.length - 1] - ftDeployedSorted[0] + 1 ===
      ftDeployedSorted.length
    );
  }, [ftDeployedSorted]);
  const ftIsSubset = ftModules.length > 0 && ftDeployed.size < ftModules.length;
  const toggleFtModule = (position: number): void => {
    setFtDeployed((prev) => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });
  };
  const setFtBySection = (section: string | "all"): void => {
    if (section === "all") {
      setFtDeployed(new Set(ftModules.map((m) => m.position)));
    } else {
      setFtDeployed(
        new Set(ftModules.filter((m) => m.section === section).map((m) => m.position)),
      );
    }
  };
  const ftSections = useMemo(
    () => Array.from(new Set(ftModules.map((m) => m.section))),
    [ftModules],
  );
  const ftSectionActive = (section: string): boolean => {
    const ps = ftModules.filter((m) => m.section === section).map((m) => m.position);
    return ps.length > 0 && ps.length === ftDeployed.size && ps.every((p) => ftDeployed.has(p));
  };

  // Practice Test picker state — teacher PICKS from their cross-course
  // mocktest library rather than configuring source/preset/time/questions
  // at assign-time.
  const initialPtFilter = readPtLibraryLastFilter();
  const [ptTemplateId, setPtTemplateId] = useState<string>("");
  const [ptDueAt, setPtDueAt] = useState<string | null>(null);
  const [ptQuery, setPtQuery] = useState<string>("");
  const [ptSourceFilter, setPtSourceFilter] = useState<PracticeTestSourceFilter>(
    initialPtFilter.source,
  );
  const [ptCourseFilter, setPtCourseFilter] = useState<string | "all">(
    initialPtFilter.courseId,
  );
  const [ptHighlightIdx, setPtHighlightIdx] = useState<number>(0);
  const ptListRef = useRef<HTMLDivElement | null>(null);

  // Question Set fields. time_limit was removed in the workflow-audit
  // cleanup — it's computed from the catalog entry's questionCount at
  // INSERT time.
  const [psSetUid, setPsSetUid] = useState<string>("");
  const [psTitle, setPsTitle] = useState<string>("");
  const [psDueAt, setPsDueAt] = useState<string | null>(null);

  // Question Set picker — filterable list state.
  const initialFilter = readQbankLastFilter();
  const [psSectionFilter, setPsSectionFilter] =
    useState<QbankSectionFilter>(initialFilter.section);
  const [psDifficultyFilter, setPsDifficultyFilter] =
    useState<QbankDifficultyFilter>(initialFilter.difficulty);
  const [psQuery, setPsQuery] = useState<string>("");
  const [psHighlightIdx, setPsHighlightIdx] = useState<number>(0);
  const psListRef = useRef<HTMLDivElement | null>(null);

  // Persist filter selections.
  useEffect(() => {
    writeQbankLastFilter({ section: psSectionFilter, difficulty: psDifficultyFilter });
  }, [psSectionFilter, psDifficultyFilter]);

  // Persist Practice Test library filter selections.
  useEffect(() => {
    writePtLibraryLastFilter({ source: ptSourceFilter, courseId: ptCourseFilter });
  }, [ptSourceFilter, ptCourseFilter]);

  // Persist type selection.
  useEffect(() => {
    writeLastAddType(userIdForKeys, classId, itemType);
  }, [itemType, userIdForKeys, classId]);

  const titleRef = useRef<HTMLInputElement | null>(null);

  const available = useMemo(
    () => assignments.filter((a) => !a.archived && !usedAssignmentIds.has(a.id)),
    [assignments, usedAssignmentIds],
  );

  // Stable catalog list, sorted for a predictable picker order:
  // section → difficulty → label.
  const catalogOptions = useMemo(() => {
    const difficultyRank: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
    return [...qbankCatalog]
      .map((entry) => ({
        entry,
        uid: catalogEntryUid(entry),
      }))
      .sort((a, b) => {
        if (a.entry.section !== b.entry.section) {
          return a.entry.section.localeCompare(b.entry.section);
        }
        const da = difficultyRank[a.entry.difficulty] ?? 99;
        const db = difficultyRank[b.entry.difficulty] ?? 99;
        if (da !== db) return da - db;
        return a.entry.label.localeCompare(b.entry.label);
      });
  }, [qbankCatalog]);

  // Focus shifts to the first meaningful field whenever the user switches type.
  useEffect(() => {
    titleRef.current?.focus();
  }, [itemType]);

  // Keep the Question Set title in sync with the chosen catalog entry until
  // the teacher edits it manually.
  const [psTitleDirty, setPsTitleDirty] = useState(false);
  useEffect(() => {
    if (psTitleDirty) return;
    if (!psSetUid) {
      setPsTitle("");
      return;
    }
    const chosen = catalogOptions.find((opt) => opt.uid === psSetUid);
    setPsTitle(chosen ? chosen.entry.label : "");
  }, [psSetUid, catalogOptions, psTitleDirty]);

  const maxPosition = module.items.reduce(
    (max, it) => (it.position > max ? it.position : max),
    -1,
  );

  // Insert the module_item row that points at a freshly-created assignment.
  // If this fails we best-effort delete the assignment to avoid orphans.
  const linkAssignmentToModule = async (
    newAssignmentId: string,
    displayTitle: string,
  ): Promise<string | null> => {
    const { error: linkError } = await supabase.from("module_items").insert({
      module_id: module.id,
      position: maxPosition + 1,
      item_type: "assignment",
      item_ref_id: newAssignmentId,
      title: displayTitle,
      url: null,
    });
    if (linkError) {
      // Best-effort cleanup of the orphan assignment. Swallow the cleanup
      // error so we still surface the original failure to the teacher.
      await supabase.from("assignments").delete().eq("id", newAssignmentId);
      return linkError.message;
    }
    return null;
  };

  // Reset just the per-item fields after a successful submit when the
  // teacher uses "Add and add another". Keeps itemType + due_at + source so
  // batch entry is fast (e.g. adding three Question Sets in a row).
  const resetPerItemFields = (): void => {
    setTitle("");
    setShowOverrideTitle(false);
    setUrl("");
    setAssignmentId("");
    setPtTemplateId("");
    setPtQuery("");
    setPtHighlightIdx(0);
    setPsSetUid("");
    setPsTitle("");
    setPsTitleDirty(false);
    setPsQuery("");
    setPsHighlightIdx(0);
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
      const { error: insertError } = await supabase
        .from("module_items")
        .insert({
          module_id: module.id,
          position: maxPosition + 1,
          item_type: "assignment",
          item_ref_id: chosen.id,
          title: payloadTitle,
          url: null,
        });
      setBusy(false);
      if (insertError) {
        toast.error("Couldn't add item", insertError.message);
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
      if (!ptTemplateId) {
        toast.warning("Pick a practice test from your library");
        return;
      }
      const template = ptLibrary.find((t) => t.id === ptTemplateId);
      if (!template) {
        toast.error("That practice test is no longer available");
        return;
      }

      setBusy(true);
      try {
        // CLONE on add: snapshot the template's pedagogy-bearing columns into
        // a new assignments row scoped to the CURRENT course. The teacher's
        // chosen due_at + optional display-title override are applied here.
        // Mirrors the qbank_set branch's insert-then-link-then-cleanup flow
        // so a failure to link doesn't leak an orphan assignment row into
        // the teacher's Assignments page.
        const nowIso = new Date().toISOString();
        const { data: newAssignment, error: insertError } = await supabase
          .from("assignments")
          .insert({
            course_id: classId,
            created_by: profile.id,
            title: template.title,
            description: template.description,
            kind: "mocktest",
            source_id: template.source_id,
            question_count: template.question_count,
            time_limit_minutes: template.time_limit_minutes,
            difficulty_mix: template.difficulty_mix,
            due_at: ptDueAt,
            opens_at: nowIso,
            archived: false,
          })
          .select("id")
          .single();

        if (insertError || !newAssignment) {
          toast.error(
            "Couldn't create Practice Test",
            insertError?.message ?? "Insert returned no row.",
          );
          return;
        }

        const displayTitle = title.trim() || template.title;
        const linkErr = await linkAssignmentToModule(
          newAssignment.id as string,
          displayTitle,
        );
        if (linkErr) {
          toast.error("Couldn't add to module", linkErr);
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
      if (!psSetUid) {
        toast.warning("Pick a question-bank set");
        return;
      }
      const chosen = catalogOptions.find((opt) => opt.uid === psSetUid);
      if (!chosen) {
        toast.error("That set is no longer available");
        return;
      }
      const trimmedPsTitle = psTitle.trim() || chosen.entry.label;
      const computedTimeLimit = computeDefaultQbankTimeLimit(
        chosen.entry.questionCount,
      );

      setBusy(true);
      try {
        const nowIso = new Date().toISOString();
        const { data: newAssignment, error: insertError } = await supabase
          .from("assignments")
          .insert({
            course_id: classId,
            created_by: profile.id,
            title: trimmedPsTitle,
            description: null,
            kind: "qbank_set",
            source_id: null,
            qbank_set_uid: chosen.uid,
            qbank_set_label: chosen.entry.label,
            question_count: chosen.entry.questionCount,
            time_limit_minutes: computedTimeLimit,
            difficulty_mix: "any",
            due_at: psDueAt,
            opens_at: nowIso,
            archived: false,
          })
          .select("id")
          .single();

        if (insertError || !newAssignment) {
          toast.error(
            "Couldn't create Question Set",
            insertError?.message ?? "Insert returned no row.",
          );
          return;
        }

        const displayTitle = title.trim() || trimmedPsTitle;
        const linkErr = await linkAssignmentToModule(
          newAssignment.id as string,
          displayTitle,
        );
        if (linkErr) {
          toast.error("Couldn't add to module", linkErr);
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
      if (!fullTestSlug) {
        toast.warning("Pick a full-length test");
        return;
      }
      // Guard the module selection before we touch the DB.
      if (ftModules.length > 0 && ftDeployed.size === 0) {
        toast.warning("Pick at least one module to deploy");
        return;
      }
      if (ftIsSubset && !ftContiguous) {
        toast.warning(
          "Modules must be contiguous",
          "Pick a continuous range — e.g. Reading & Writing (M1–M2) or Math (M1–M2).",
        );
        return;
      }
      const chosen = fullTests.find((t) => t.slug === fullTestSlug);
      const payloadTitle = title.trim() || chosen?.title || "Full-length test";
      setBusy(true);
      try {
        // Quick link: full-length tests aren't assignments, so store them as a
        // link module_item pointing at the Bluebook runner (/test/:slug).
        const { error: insertError } = await supabase.from("module_items").insert({
          module_id: module.id,
          position: maxPosition + 1,
          item_type: "link",
          item_ref_id: null,
          title: payloadTitle,
          url: testRunPath(fullTestSlug),
        });
        if (insertError) {
          toast.error("Couldn't add Full-Test", insertError.message);
          return;
        }
        // If the teacher chose a strict subset of modules, persist the
        // deployment via set_test_module_windows (0144): every position gets a
        // row with its deployed flag (excluded modules never appear for
        // students; the run finalizes at the last deployed module). A full
        // selection writes nothing — zero windows = the whole test, open now.
        if (ftIsSubset) {
          const windows = ftModules.map((m) => ({
            position: m.position,
            deployed: ftDeployed.has(m.position),
            opens_at: null,
          }));
          const { error: winError } = await supabase.rpc("set_test_module_windows", {
            p_course_id: classId,
            p_slug: fullTestSlug,
            p_windows: windows,
          });
          if (winError) {
            // The link is already in place (= full test). Tell the teacher their
            // subset didn't apply so they can fix it from the test overview.
            toast.warning(
              "Added as the full test",
              "Couldn't limit the modules — set them from the test's schedule.",
            );
          } else {
            toast.success("Full-Test added", `${payloadTitle} · ${ftDeployed.size} of ${ftModules.length} modules`);
            if (keepOpen) {
              resetPerItemFields();
              onCommittedKeepOpen();
            } else {
              onCommitted();
            }
            return;
          }
        }
        toast.success("Full-Test added", payloadTitle);
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
      const { error: insertError } = await supabase.from("module_items").insert({
        module_id: module.id,
        position: maxPosition + 1,
        item_type: "link",
        item_ref_id: null,
        title: payloadTitle,
        url: url.trim(),
      });
      setBusy(false);
      if (insertError) {
        toast.error("Couldn't add item", insertError.message);
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
    const { error: insertError } = await supabase.from("module_items").insert({
      module_id: module.id,
      position: maxPosition + 1,
      item_type: "header",
      item_ref_id: null,
      title: payloadTitle,
      url: null,
    });
    setBusy(false);
    if (insertError) {
      toast.error("Couldn't add item", insertError.message);
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

  // Unified chip style — mobile tap target ≥40px, desktop dense.
  // Per CLAUDE.md: rounded-full pill, py-1.5 on mobile, py-0.5 on md+.
  const chipClass = (active: boolean): string =>
    "rounded-full px-3 py-1.5 text-xs md:py-0.5 md:text-[11px] font-medium transition-colors text-center " +
    (active
      ? "bg-indigo-600 text-white ring-1 ring-indigo-600"
      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-700 dark:hover:text-indigo-200");

  const chip = (type: InlineAddType, label: string): JSX.Element => {
    const active = itemType === type;
    return (
      <button
        type="button"
        onClick={() => setItemType(type)}
        aria-pressed={active}
        className={chipClass(active)}
      >
        {label}
      </button>
    );
  };

  // Distinct courses present in the Practice Test library — used to populate
  // the Course filter pill row. Sorted by name for predictable order.
  const ptLibraryCourses = useMemo(() => {
    const seen = new Map<string, TeacherMockTest["course"]>();
    for (const test of ptLibrary) {
      if (!seen.has(test.course.id)) seen.set(test.course.id, test.course);
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [ptLibrary]);

  // Filter the library by source + course + free-text query. Defensive on
  // archived rows: hide them from the picker — assigning an archived test
  // would surprise the teacher. They remain visible in /question-bank.
  const filteredPtLibrary = useMemo(() => {
    const q = ptQuery.trim().toLowerCase();
    return ptLibrary.filter((t) => {
      if (t.archived) return false;
      if (ptSourceFilter !== "all" && t.source_id !== ptSourceFilter) return false;
      if (ptCourseFilter !== "all" && t.course.id !== ptCourseFilter) return false;
      if (!q) return true;
      const hay = `${t.title} ${t.course.name} ${t.source_id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [ptLibrary, ptSourceFilter, ptCourseFilter, ptQuery]);

  // Reset highlighted row when the filter narrows.
  useEffect(() => {
    setPtHighlightIdx(0);
  }, [ptQuery, ptSourceFilter, ptCourseFilter]);

  const ptSourceLabel: Record<Exclude<PracticeTestSourceFilter, "all">, string> = {
    cb: "CB",
    sat: "SAT",
    mixed: "Mixed",
  };

  // Filtered Question Set catalog (2d).
  const filteredCatalog = useMemo(() => {
    const q = psQuery.trim().toLowerCase();
    return catalogOptions.filter(({ entry }) => {
      if (psSectionFilter !== "all" && entry.section !== psSectionFilter) return false;
      if (psDifficultyFilter !== "all" && entry.difficulty !== psDifficultyFilter) return false;
      if (!q) return true;
      const hay = `${entry.label} ${entry.topic} ${entry.section} ${entry.difficulty}`.toLowerCase();
      return hay.includes(q);
    });
  }, [catalogOptions, psQuery, psSectionFilter, psDifficultyFilter]);

  // Reset highlighted row when filter narrows.
  useEffect(() => {
    setPsHighlightIdx(0);
  }, [psQuery, psSectionFilter, psDifficultyFilter]);

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
          redundant with the chip row. Grid prevents jagged wraps on narrow
          widths (2 cols mobile, 5 cols sm+). */}
      <div>
        <span className="sr-only">Item type</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {chip("assignment", "Assignment")}
          {canQbank && chip("full_test", "Full-Test")}
          {canQbank && chip("question_set", "Question Set")}
          {canQbank && chip("practice_test", "Practice Test")}
          {chip("header", "Header")}
          {chip("link", "Link")}
        </div>
      </div>

      {itemType === "assignment" && (
        <div className="space-y-1.5">
          <select
            value={assignmentId}
            onChange={(e) => setAssignmentId(e.target.value)}
            disabled={busy}
            className="w-full rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">
              {available.length === 0
                ? "No unassigned assignments — create one first"
                : "Pick an assignment…"}
            </option>
            {available.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Display title (optional — defaults to assignment title)"
            disabled={busy}
            className="w-full rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}

      {itemType === "full_test" && (
        <div className="space-y-1.5">
          <select
            value={fullTestSlug}
            onChange={(e) => setFullTestSlug(e.target.value)}
            disabled={busy}
            className="w-full rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">
              {fullTests.length === 0 ? "No full-length tests yet" : "Pick a full-length test…"}
            </option>
            {fullTests.map((t) => {
              const sum = sectionSummary(t.sections);
              return (
                <option key={t.slug} value={t.slug}>
                  {t.title}
                  {sum ? ` — ${sum.short}` : ""}
                </option>
              );
            })}
          </select>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Display title (optional — defaults to the test title)"
            disabled={busy}
            className="w-full rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {(() => {
            // Show the chosen test's section composition so the teacher knows
            // whether it's RW-only, Math-only, or a full SAT before adding it.
            const chosen = fullTests.find((t) => t.slug === fullTestSlug);
            if (!chosen) {
              return (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Adds the full-length, Bluebook-style test. Enrolled students open
                  it straight from this module.
                </p>
              );
            }
            const sum = sectionSummary(chosen.sections);
            return (
              <div
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700"
                aria-label="Test composition"
              >
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {sum?.label ?? "Full-length test"}
                </span>
                <span className="text-slate-400">·</span>
                <span className="tabular-nums">
                  {chosen.total_questions} question
                  {chosen.total_questions === 1 ? "" : "s"}
                </span>
                {chosen.module_count != null && (
                  <>
                    <span className="text-slate-400">·</span>
                    <span className="tabular-nums">
                      {chosen.module_count} timed module
                      {chosen.module_count === 1 ? "" : "s"}
                    </span>
                  </>
                )}
                {formatTestDuration(chosen.total_time_seconds) && (
                  <>
                    <span className="text-slate-400">·</span>
                    <span className="tabular-nums">
                      ~{formatTestDuration(chosen.total_time_seconds)}
                    </span>
                  </>
                )}
              </div>
            );
          })()}

          {/* Module selection — pick which modules to deploy to this course.
              All selected = the full test. A contiguous subset (e.g. R&W only)
              writes set_test_module_windows after the link is created. */}
          {fullTestSlug && ftModules.length > 1 && (
            <div className="space-y-1.5 rounded-md ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-900 p-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Modules to deploy
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFtBySection("all")}
                    aria-pressed={ftDeployed.size === ftModules.length}
                    disabled={busy}
                    className={chipClass(ftDeployed.size === ftModules.length)}
                  >
                    All
                  </button>
                  {ftSections.includes("reading-writing") && (
                    <button
                      type="button"
                      onClick={() => setFtBySection("reading-writing")}
                      aria-pressed={ftSectionActive("reading-writing")}
                      disabled={busy}
                      className={chipClass(ftSectionActive("reading-writing"))}
                    >
                      R&amp;W only
                    </button>
                  )}
                  {ftSections.includes("math") && (
                    <button
                      type="button"
                      onClick={() => setFtBySection("math")}
                      aria-pressed={ftSectionActive("math")}
                      disabled={busy}
                      className={chipClass(ftSectionActive("math"))}
                    >
                      Math only
                    </button>
                  )}
                </div>
              </div>
              <ul className="space-y-0.5">
                {ftModules.map((m) => {
                  const on = ftDeployed.has(m.position);
                  return (
                    <li key={m.position}>
                      <label
                        className={
                          "flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 " +
                          (on ? "" : "opacity-50")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleFtModule(m.position)}
                          disabled={busy}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          aria-label={`Deploy ${m.label}`}
                        />
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {m.label}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          {m.section === "math" ? "Math" : "R&W"} · {m.question_count}q ·{" "}
                          {Math.round(m.time_limit_seconds / 60)}m
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {ftDeployed.size > 0 && !ftContiguous && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Pick a continuous range — e.g. R&amp;W (M1–M2) or Math (M1–M2).
                </p>
              )}
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                All modules = the full test. Deselect to deploy a subset (e.g. Reading &amp;
                Writing only). Set per-module release dates from the test&apos;s schedule after adding.
              </p>
            </div>
          )}
        </div>
      )}

      {itemType === "practice_test" && (
        <div className="space-y-2">
          {/* When the teacher has zero practice tests anywhere, the picker
              is meaningless. Render an EmptyState CTA that points them at
              the Question Bank Practice Tests tab. The chip row above
              stays visible so they can switch to another type without
              backtracking. */}
          {!ptLibraryLoading && !ptLibraryError && ptLibrary.length === 0 ? (
            <EmptyState
              icon="sparkles"
              title="No practice tests yet"
              body="Practice Tests live in the Question Bank. Author one there first, then come back to assign it."
              cta={{
                label: "Open Question Bank",
                onClick: () => navigate(`${ROUTES.QUESTION_BANK}?tab=practice-tests`),
              }}
              framed
            />
          ) : (
            <>
              {/* Source filter pills — narrows by template's source_id. */}
              <div>
                <span className="block text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                  Source
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPtSourceFilter("all")}
                    aria-pressed={ptSourceFilter === "all"}
                    disabled={busy}
                    className={chipClass(ptSourceFilter === "all")}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setPtSourceFilter("cb")}
                    aria-pressed={ptSourceFilter === "cb"}
                    disabled={busy}
                    className={chipClass(ptSourceFilter === "cb")}
                  >
                    CB
                  </button>
                  <button
                    type="button"
                    onClick={() => setPtSourceFilter("sat")}
                    aria-pressed={ptSourceFilter === "sat"}
                    disabled={busy}
                    className={chipClass(ptSourceFilter === "sat")}
                  >
                    SAT
                  </button>
                  <button
                    type="button"
                    onClick={() => setPtSourceFilter("mixed")}
                    aria-pressed={ptSourceFilter === "mixed"}
                    disabled={busy}
                    className={chipClass(ptSourceFilter === "mixed")}
                  >
                    Mixed
                  </button>
                </div>
              </div>

              {/* Course filter pills — only shown when the teacher actually
                  owns tests in >1 course. Single-course teachers don't need
                  to see this row. */}
              {ptLibraryCourses.length > 1 && (
                <div>
                  <span className="block text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                    Course
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPtCourseFilter("all")}
                      aria-pressed={ptCourseFilter === "all"}
                      disabled={busy}
                      className={chipClass(ptCourseFilter === "all")}
                    >
                      All
                    </button>
                    {ptLibraryCourses.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setPtCourseFilter(c.id)}
                        aria-pressed={ptCourseFilter === c.id}
                        disabled={busy}
                        className={chipClass(ptCourseFilter === c.id)}
                        title={c.name}
                      >
                        <span className="truncate inline-block max-w-[140px] align-bottom">
                          {c.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Type-to-filter input + ↑/↓ Enter Esc keyboard nav. */}
              <input
                ref={titleRef}
                type="text"
                value={ptQuery}
                onChange={(e) => setPtQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPtHighlightIdx((idx) =>
                      Math.min(filteredPtLibrary.length - 1, idx + 1),
                    );
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPtHighlightIdx((idx) => Math.max(0, idx - 1));
                  } else if (e.key === "Enter") {
                    if (filteredPtLibrary.length > 0) {
                      e.preventDefault();
                      e.stopPropagation();
                      const chosen = filteredPtLibrary[ptHighlightIdx];
                      if (chosen) setPtTemplateId(chosen.id);
                    }
                  } else if (e.key === "Escape" && ptQuery) {
                    // Spec: Esc clears the query when non-empty; the
                    // form-level Esc handler cancels otherwise.
                    e.preventDefault();
                    e.stopPropagation();
                    setPtQuery("");
                  }
                }}
                placeholder="Filter your practice tests…"
                disabled={busy}
                aria-label="Filter your practice tests"
                className="w-full rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              {/* Result list — error / skeletons / empty / rows. */}
              <div
                ref={ptListRef}
                className="max-h-60 overflow-y-auto rounded-md ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900"
                role="listbox"
                aria-label="Your practice tests"
              >
                {ptLibraryError ? (
                  <div className="p-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-50/60 dark:bg-rose-950/30">
                    Couldn't load practice tests: {ptLibraryError}
                  </div>
                ) : ptLibraryLoading ? (
                  <div className="p-2">
                    <SkeletonRows count={4} rowClassName="h-10" gap={6} />
                  </div>
                ) : filteredPtLibrary.length === 0 ? (
                  <div className="p-4 text-sm text-center text-slate-500 dark:text-slate-400">
                    <div>No practice tests match these filters.</div>
                    <button
                      type="button"
                      onClick={() => {
                        setPtSourceFilter("all");
                        setPtCourseFilter("all");
                        setPtQuery("");
                      }}
                      className="mt-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Reset filters
                    </button>
                  </div>
                ) : (
                  <ul className="py-1">
                    {filteredPtLibrary.map((t, idx) => {
                      const selected = ptTemplateId === t.id;
                      const highlighted = idx === ptHighlightIdx;
                      const sourceKey = t.source_id;
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setPtTemplateId(t.id);
                              setPtHighlightIdx(idx);
                            }}
                            onMouseEnter={() => setPtHighlightIdx(idx)}
                            role="option"
                            aria-selected={selected}
                            className={
                              "w-full text-left px-2 py-2 text-sm flex items-center gap-2 min-h-[40px] " +
                              (selected
                                ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-100"
                                : highlighted
                                  ? "bg-indigo-50 dark:bg-indigo-950/30 text-slate-900 dark:text-slate-100"
                                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800")
                            }
                          >
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-medium">{t.title}</div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                <span className="truncate" title={t.course.name}>
                                  {t.course.name}
                                </span>
                                <span aria-hidden>·</span>
                                <span className="tabular-nums shrink-0">
                                  {t.time_limit_minutes}m · {t.question_count}q
                                </span>
                              </div>
                            </div>
                            <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase">
                              {ptSourceLabel[sourceKey]}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Due date — full-width row so SmartDatePicker preset pills
                  don't wrap. */}
              <div className="block">
                <SmartDatePicker
                  label="Due date (optional)"
                  value={ptDueAt}
                  onChange={setPtDueAt}
                  allowClear
                />
              </div>

              {/* Override display title hidden behind a disclosure. */}
              <details
                className="text-[12px] text-slate-600 dark:text-slate-300"
                open={showOverrideTitle}
                onToggle={(e) =>
                  setShowOverrideTitle((e.target as HTMLDetailsElement).open)
                }
              >
                <summary className="cursor-pointer select-none text-indigo-600 dark:text-indigo-400 hover:underline">
                  + Override display title
                </summary>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Display title in module (optional)"
                  disabled={busy}
                  className="mt-1.5 w-full rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </details>
            </>
          )}
        </div>
      )}

      {itemType === "question_set" && (
        <div className="space-y-2">
          {/* Filter pill rows — Section + Difficulty (2d). */}
          <div className="space-y-1.5">
            <div>
              <span className="block text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                Section
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPsSectionFilter("all")}
                  aria-pressed={psSectionFilter === "all"}
                  className={chipClass(psSectionFilter === "all")}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setPsSectionFilter("math")}
                  aria-pressed={psSectionFilter === "math"}
                  className={chipClass(psSectionFilter === "math")}
                >
                  Math
                </button>
                <button
                  type="button"
                  onClick={() => setPsSectionFilter("reading-and-writing")}
                  aria-pressed={psSectionFilter === "reading-and-writing"}
                  className={chipClass(psSectionFilter === "reading-and-writing")}
                >
                  R&amp;W
                </button>
              </div>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                Difficulty
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPsDifficultyFilter("all")}
                  aria-pressed={psDifficultyFilter === "all"}
                  className={chipClass(psDifficultyFilter === "all")}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setPsDifficultyFilter("easy")}
                  aria-pressed={psDifficultyFilter === "easy"}
                  className={chipClass(psDifficultyFilter === "easy")}
                >
                  Easy
                </button>
                <button
                  type="button"
                  onClick={() => setPsDifficultyFilter("medium")}
                  aria-pressed={psDifficultyFilter === "medium"}
                  className={chipClass(psDifficultyFilter === "medium")}
                >
                  Medium
                </button>
                <button
                  type="button"
                  onClick={() => setPsDifficultyFilter("hard")}
                  aria-pressed={psDifficultyFilter === "hard"}
                  className={chipClass(psDifficultyFilter === "hard")}
                >
                  Hard
                </button>
              </div>
            </div>
          </div>

          {/* Type-to-filter input with keyboard navigation (2d). */}
          <input
            ref={titleRef}
            type="text"
            value={psQuery}
            onChange={(e) => setPsQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setPsHighlightIdx((idx) =>
                  Math.min(filteredCatalog.length - 1, idx + 1),
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setPsHighlightIdx((idx) => Math.max(0, idx - 1));
              } else if (e.key === "Enter") {
                if (filteredCatalog.length > 0) {
                  e.preventDefault();
                  e.stopPropagation();
                  const chosen = filteredCatalog[psHighlightIdx];
                  if (chosen) {
                    setPsSetUid(chosen.uid);
                    setPsTitleDirty(false);
                  }
                }
              } else if (e.key === "Escape" && psQuery) {
                // Per spec: Esc clears query when query is non-empty;
                // the form-level Esc handler cancels otherwise.
                e.preventDefault();
                e.stopPropagation();
                setPsQuery("");
              }
            }}
            placeholder="Type to filter sets (label, topic, section, difficulty)…"
            disabled={busy}
            aria-label="Filter Question Sets"
            className="w-full rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {/* Result list — error / loading skeletons / empty state / rows. */}
          <div
            ref={psListRef}
            className="max-h-60 overflow-y-auto rounded-md ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900"
            role="listbox"
            aria-label="Question Set catalog"
          >
            {catalogError ? (
              <div className="p-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-50/60 dark:bg-rose-950/30 flex items-center justify-between gap-2">
                <span>Couldn't load catalog: {catalogError}</span>
                <button
                  type="button"
                  onClick={() => void refreshCatalog()}
                  className="rounded-md bg-white dark:bg-slate-900 ring-1 ring-rose-300 dark:ring-rose-800 px-2 py-1 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  Retry
                </button>
              </div>
            ) : catalogLoading ? (
              <div className="p-2">
                <SkeletonRows count={4} rowClassName="h-8" gap={6} />
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="p-4 text-sm text-center text-slate-500 dark:text-slate-400">
                <div>No sets match these filters.</div>
                <button
                  type="button"
                  onClick={() => {
                    setPsSectionFilter("all");
                    setPsDifficultyFilter("all");
                    setPsQuery("");
                  }}
                  className="mt-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <ul className="py-1">
                {filteredCatalog.map(({ entry, uid }, idx) => {
                  const selected = psSetUid === uid;
                  const highlighted = idx === psHighlightIdx;
                  return (
                    <li key={uid}>
                      <button
                        type="button"
                        onClick={() => {
                          setPsSetUid(uid);
                          setPsTitleDirty(false);
                          setPsHighlightIdx(idx);
                        }}
                        onMouseEnter={() => setPsHighlightIdx(idx)}
                        role="option"
                        aria-selected={selected}
                        className={
                          "w-full text-left px-2 py-1.5 text-sm flex items-center gap-2 " +
                          (selected
                            ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-100"
                            : highlighted
                              ? "bg-indigo-50 dark:bg-indigo-950/30 text-slate-900 dark:text-slate-100"
                              : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800")
                        }
                      >
                        <span className="flex-1 truncate">{entry.label}</span>
                        <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {entry.section === "math" ? "Math" : "R&W"}
                        </span>
                        <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">
                          {entry.difficulty}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          {entry.questionCount}q
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Selected-set title field — only meaningful once a row is chosen. */}
          <input
            type="text"
            value={psTitle}
            onChange={(e) => {
              setPsTitle(e.target.value);
              setPsTitleDirty(true);
            }}
            placeholder={psSetUid ? "Title (defaults to set label)" : "Pick a set above first"}
            disabled={busy || !psSetUid}
            maxLength={200}
            className="w-full rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
          />

          {/* Read-only meta — set definitions live in the catalog. */}
          {psSetUid &&
            (() => {
              const chosen = catalogOptions.find((o) => o.uid === psSetUid);
              if (!chosen) return null;
              const minutes = computeDefaultQbankTimeLimit(
                chosen.entry.questionCount,
              );
              return (
                <div
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700"
                  aria-label="Set defaults"
                >
                  <span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      ~{minutes} min
                    </span>{" "}
                    suggested
                  </span>
                  <span className="text-slate-400">·</span>
                  <span>unlimited attempts</span>
                  <span className="text-slate-400">·</span>
                  <span>
                    {chosen.entry.questionCount} question
                    {chosen.entry.questionCount === 1 ? "" : "s"}
                  </span>
                </div>
              );
            })()}

          {/* Due date — full-width row (2a). */}
          <div className="block">
            <SmartDatePicker
              label="Due date (optional)"
              value={psDueAt}
              onChange={setPsDueAt}
              allowClear
            />
          </div>

          {/* Override display title disclosure (2b). */}
          <details
            className="text-[12px] text-slate-600 dark:text-slate-300"
            open={showOverrideTitle}
            onToggle={(e) =>
              setShowOverrideTitle((e.target as HTMLDetailsElement).open)
            }
          >
            <summary className="cursor-pointer select-none text-indigo-600 dark:text-indigo-400 hover:underline">
              + Override display title
            </summary>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Display title in module (optional)"
              disabled={busy}
              className="mt-1.5 w-full rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </details>
        </div>
      )}

      {itemType === "header" && (
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Header title — e.g. 'Week 1: Linear Equations'"
          disabled={busy}
          className="w-full rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            className="w-full rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            disabled={busy}
            className="w-full rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
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
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-300 dark:ring-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-50"
          >
            Add and add another
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
