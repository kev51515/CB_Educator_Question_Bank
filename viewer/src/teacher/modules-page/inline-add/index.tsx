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
  type InlineAddGroup,
  INLINE_ADD_GROUP_LABEL,
  INLINE_ADD_GROUP_OF,
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

/** Today's date as "M/D" (no leading zeros) — matches the teacher's module
 *  naming convention ("6/12", "6/12 HW") so a new module is usable with zero
 *  typing: Enter to accept, or just start typing to rename. */
function todayLabel(): string {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function InlineCreateModuleRow({
  busy,
  onCommit,
  onCancel,
}: InlineCreateModuleRowProps) {
  const [name, setName] = useState(todayLabel);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // select() focuses AND highlights the prefilled date so the user can press
    // Enter to accept it or start typing to replace it.
    inputRef.current?.select();
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
  // Note/Callout (Structure group): a short message + a tone.
  const [noteBody, setNoteBody] = useState("");
  const [noteTone, setNoteTone] = useState<"info" | "tip" | "warning">("info");
  // Page (Learn group): markdown lesson body (Video/File reuse `url`).
  const [pageBody, setPageBody] = useState("");
  // Plan group: Goal (target/metric) + Countdown (date).
  const [goalTarget, setGoalTarget] = useState("");
  const [goalMetric, setGoalMetric] = useState("");
  const [countdownDate, setCountdownDate] = useState("");
  // Engage group: Live Session (starts-at + duration; join link reuses `url`).
  const [lsStartsAt, setLsStartsAt] = useState("");
  const [lsDuration, setLsDuration] = useState("");
  // Engage group: Survey (prompt + kind + options for "choice").
  const [surveyPrompt, setSurveyPrompt] = useState("");
  const [surveyKind, setSurveyKind] = useState<"scale" | "choice" | "text">("scale");
  const [surveyOptions, setSurveyOptions] = useState("");

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
    setNoteBody("");
    setNoteTone("info");
    setPageBody("");
    setGoalTarget("");
    setGoalMetric("");
    setCountdownDate("");
    setLsStartsAt("");
    setLsDuration("");
    setSurveyPrompt("");
    setSurveyKind("scale");
    setSurveyOptions("");
    setUrl("");
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
      // Client-generated module_items id, embedded in the link as `&item=` —
      // the assignment-occurrence identity (0215). Assign the same module
      // twice and each link launches runs attributed to ITS OWN occurrence,
      // so rosters and retake gating never merge the two.
      const itemId = crypto.randomUUID();
      // Strict TIME mode (0211) adds `tm=strict` to the link so the run keeps its
      // clock running while away; appended with `&` after a range or as the sole
      // `?` query on a full test.
      const base =
        ft.ftIsSubset && first != null
          ? `${testRunPath(ft.fullTestSlug)}?m=${first}-${last}&item=${itemId}`
          : testRunPath(ft.fullTestSlug);
      const url =
        ft.ftTimeMode === "strict"
          ? `${base}${base.includes("?") ? "&" : "?"}tm=strict`
          : base;
      setBusy(true);
      try {
        const insertErr = await insertFullTestLink(supabase, {
          id: itemId,
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

    if (itemType === "page") {
      const heading = title.trim();
      const body = pageBody.trim();
      if (!heading && !body) {
        toast.warning("Add a title or some content for the page");
        return;
      }
      setBusy(true);
      const insertErr = await insertModuleItem(supabase, {
        module_id: module.id,
        position: maxPosition + 1,
        item_type: "page",
        item_ref_id: null,
        title: heading,
        url: null,
        config: { body },
      });
      setBusy(false);
      if (insertErr) {
        toast.error("Couldn't add page", insertErr);
        return;
      }
      toast.success("Page added", heading || undefined);
      if (keepOpen) {
        resetPerItemFields();
        onCommittedKeepOpen();
      } else {
        onCommitted();
      }
      return;
    }

    if (itemType === "video") {
      const link = url.trim();
      if (!link) {
        toast.warning("Paste a video link (YouTube, Vimeo, or Loom)");
        return;
      }
      setBusy(true);
      const insertErr = await insertModuleItem(supabase, {
        module_id: module.id,
        position: maxPosition + 1,
        item_type: "video",
        item_ref_id: null,
        title: title.trim(),
        url: link,
      });
      setBusy(false);
      if (insertErr) {
        toast.error("Couldn't add video", insertErr);
        return;
      }
      toast.success("Video added", title.trim() || undefined);
      if (keepOpen) {
        resetPerItemFields();
        onCommittedKeepOpen();
      } else {
        onCommitted();
      }
      return;
    }

    if (itemType === "file") {
      const link = url.trim();
      const heading = title.trim();
      if (!link) {
        toast.warning("Paste a file URL");
        return;
      }
      setBusy(true);
      const insertErr = await insertModuleItem(supabase, {
        module_id: module.id,
        position: maxPosition + 1,
        item_type: "file",
        item_ref_id: null,
        title: heading || "File",
        url: link,
      });
      setBusy(false);
      if (insertErr) {
        toast.error("Couldn't add file", insertErr);
        return;
      }
      toast.success("File added", heading || undefined);
      if (keepOpen) {
        resetPerItemFields();
        onCommittedKeepOpen();
      } else {
        onCommitted();
      }
      return;
    }

    if (itemType === "goal") {
      const heading = title.trim();
      if (!heading) {
        toast.warning("Add a goal title");
        return;
      }
      setBusy(true);
      const insertErr = await insertModuleItem(supabase, {
        module_id: module.id,
        position: maxPosition + 1,
        item_type: "goal",
        item_ref_id: null,
        title: heading,
        url: null,
        config: {
          target: goalTarget.trim() || undefined,
          metric: goalMetric.trim() || undefined,
        },
      });
      setBusy(false);
      if (insertErr) {
        toast.error("Couldn't add goal", insertErr);
        return;
      }
      toast.success("Goal added", heading);
      if (keepOpen) {
        resetPerItemFields();
        void onCommittedKeepOpen();
      } else {
        onCommitted();
      }
      return;
    }

    if (itemType === "countdown") {
      if (!countdownDate) {
        toast.warning("Pick a date");
        return;
      }
      setBusy(true);
      const insertErr = await insertModuleItem(supabase, {
        module_id: module.id,
        position: maxPosition + 1,
        item_type: "countdown",
        item_ref_id: null,
        title: title.trim(),
        url: null,
        config: { date: countdownDate },
      });
      setBusy(false);
      if (insertErr) {
        toast.error("Couldn't add countdown", insertErr);
        return;
      }
      toast.success("Countdown added", title.trim() || undefined);
      if (keepOpen) {
        resetPerItemFields();
        void onCommittedKeepOpen();
      } else {
        onCommitted();
      }
      return;
    }

    if (itemType === "live_session") {
      const heading = title.trim();
      if (!heading) {
        toast.warning("Add a session title");
        return;
      }
      const startsAtIso = lsStartsAt ? new Date(lsStartsAt).toISOString() : undefined;
      setBusy(true);
      const insertErr = await insertModuleItem(supabase, {
        module_id: module.id,
        position: maxPosition + 1,
        item_type: "live_session",
        item_ref_id: null,
        title: heading,
        url: url.trim() || null,
        config: {
          starts_at: startsAtIso,
          duration_min: lsDuration ? Number(lsDuration) : undefined,
        },
      });
      setBusy(false);
      if (insertErr) {
        toast.error("Couldn't add live session", insertErr);
        return;
      }
      toast.success("Live Session added", heading);
      if (keepOpen) {
        resetPerItemFields();
        void onCommittedKeepOpen();
      } else {
        onCommitted();
      }
      return;
    }

    if (itemType === "survey") {
      const prompt = surveyPrompt.trim();
      if (!prompt) {
        toast.warning("Add a survey question");
        return;
      }
      const optionsArray = surveyOptions
        .split(/[\n,]/)
        .map((o) => o.trim())
        .filter((o) => o.length > 0);
      if (surveyKind === "choice" && optionsArray.length < 2) {
        toast.warning("Add at least two options");
        return;
      }
      setBusy(true);
      const insertErr = await insertModuleItem(supabase, {
        module_id: module.id,
        position: maxPosition + 1,
        item_type: "survey",
        item_ref_id: null,
        title: title.trim(),
        url: null,
        config: {
          prompt,
          kind: surveyKind,
          options: surveyKind === "choice" ? optionsArray : undefined,
        },
      });
      setBusy(false);
      if (insertErr) {
        toast.error("Couldn't add survey", insertErr);
        return;
      }
      toast.success("Survey added");
      if (keepOpen) {
        resetPerItemFields();
        void onCommittedKeepOpen();
      } else {
        onCommitted();
      }
      return;
    }

    if (itemType === "note") {
      const body = noteBody.trim();
      if (!body) {
        toast.warning("Add a message for the note");
        return;
      }
      setBusy(true);
      const insertErr = await insertModuleItem(supabase, {
        module_id: module.id,
        position: maxPosition + 1,
        item_type: "note",
        item_ref_id: null,
        title: title.trim(), // optional heading above the body
        url: null,
        config: { body, tone: noteTone },
      });
      setBusy(false);
      if (insertErr) {
        toast.error("Couldn't add note", insertErr);
        return;
      }
      toast.success("Note added");
      if (keepOpen) {
        resetPerItemFields();
        onCommittedKeepOpen();
      } else {
        onCommitted();
      }
      return;
    }

    if (itemType === "divider") {
      setBusy(true);
      const insertErr = await insertModuleItem(supabase, {
        module_id: module.id,
        position: maxPosition + 1,
        item_type: "divider",
        item_ref_id: null,
        title: "",
        url: null,
      });
      setBusy(false);
      if (insertErr) {
        toast.error("Couldn't add divider", insertErr);
        return;
      }
      toast.success("Divider added");
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
    page: (
      <>
        <path d="M5 4a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
        <path d="M14 2v5h5" />
      </>
    ),
    video: (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="2" />
        <path d="m10 9 5 3-5 3Z" />
      </>
    ),
    file: (
      <path d="M21.44 11.05 12.25 20.24a4 4 0 0 1-5.66-5.66l8.49-8.49a2.5 2.5 0 0 1 3.54 3.54l-8.49 8.49a1 1 0 0 1-1.41-1.41l7.78-7.78" />
    ),
    header: <path d="M4 7h16M4 12h10M4 17h7" />,
    note: (
      <>
        <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4Z" />
        <path d="M8 8h8M8 11.5h5" />
      </>
    ),
    divider: <path d="M4 12h16" />,
    goal: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.5" />
      </>
    ),
    countdown: (
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 2.5v4M16 2.5v4" />
      </>
    ),
    live_session: (
      <>
        <rect x="2" y="6" width="13" height="12" rx="2" />
        <path d="M15 10l6-3.5v11L15 14z" />
      </>
    ),
    survey: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
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
    page: "A rich-text lesson page rendered inline for students.",
    video: "Embed a YouTube, Vimeo, or Loom video inline.",
    file: "Link a file (PDF, slides…) for students to open or download.",
    header: "A bold divider row that groups the items below it.",
    note: "A callout with a short message — info, a tip, or a warning. No click-through.",
    divider: "A thin rule to visually separate runs of items.",
    goal: "A target/checkpoint card to keep students aiming.",
    countdown: "A countdown to the test date.",
    live_session: "A scheduled live class with a join link.",
    survey: "A quick poll — scale, choice, or free text. Results roll up for you.",
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

  // Add-picker sub-tab groups (docs/PLAN_MODULE_ITEM_TYPES.md). Only groups with
  // ≥1 available type render, so the bar grows as new types ship. Question-Bank
  // types are gated to allow-listed educators (canQbank).
  const groupTypes: Record<InlineAddGroup, Array<{ type: InlineAddType; label: string }>> = {
    learn: [
      { type: "page", label: "Page" },
      { type: "video", label: "Video" },
      { type: "file", label: "File" },
    ],
    assess: [
      { type: "assignment", label: "Assignment" },
      ...(canQbank
        ? ([
            { type: "full_test", label: "Full-Test" },
            { type: "question_set", label: "Question Set" },
            { type: "practice_test", label: "Practice Test" },
          ] as Array<{ type: InlineAddType; label: string }>)
        : []),
    ],
    engage: [
      { type: "live_session", label: "Live Session" },
      { type: "survey", label: "Survey" },
    ],
    plan: [
      { type: "goal", label: "Goal" },
      { type: "countdown", label: "Countdown" },
    ],
    structure: [
      { type: "header", label: "Header" },
      { type: "note", label: "Note" },
      { type: "divider", label: "Divider" },
      { type: "link", label: "Link" },
    ],
  };
  const visibleGroups = (Object.keys(groupTypes) as InlineAddGroup[]).filter(
    (g) => groupTypes[g].length > 0,
  );
  const activeGroup = INLINE_ADD_GROUP_OF[itemType];

  // Group sub-tab button (the band-above-the-band). Clicking jumps to the
  // group's first type so the chip row + form swap together.
  const groupTabClass = (active: boolean): string =>
    "whitespace-nowrap min-h-[36px] md:min-h-[28px] inline-flex items-center rounded-md px-3 text-[12px] font-semibold transition-colors " +
    (active
      ? "bg-accent-600 text-white"
      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800");

  // Helper labels for context-aware submit button (2h).
  const submitLabel = (() => {
    if (busy) return "Adding…";
    switch (itemType) {
      case "assignment": return "Add Assignment";
      case "practice_test": return "Add Practice Test";
      case "full_test": return "Add Full-Test";
      case "question_set": return "Add Question Set";
      case "page": return "Add Page";
      case "video": return "Add Video";
      case "file": return "Add File";
      case "header": return "Add Header";
      case "note": return "Add Note";
      case "divider": return "Add Divider";
      case "goal": return "Add Goal";
      case "countdown": return "Add Countdown";
      case "live_session": return "Add Live Session";
      case "survey": return "Add Survey";
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
      {/* Two-tier picker (docs/PLAN_MODULE_ITEM_TYPES.md): a group sub-tab row
          (Learn / Assess / Engage / Structure) over the active group's type
          chips, so the bar stays scannable as types grow. Only non-empty groups
          show; the chip band keeps the CourseTabStrip fused-band recipe. */}
      <div className="space-y-1.5">
        {visibleGroups.length > 1 && (
          <div
            role="tablist"
            aria-label="Item category"
            className="flex flex-wrap items-center gap-1"
          >
            {visibleGroups.map((g) => (
              <button
                key={g}
                type="button"
                role="tab"
                aria-selected={activeGroup === g}
                onClick={() => setItemType(groupTypes[g][0].type)}
                className={groupTabClass(activeGroup === g)}
              >
                {INLINE_ADD_GROUP_LABEL[g]}
              </button>
            ))}
          </div>
        )}
        <div>
          <span className="sr-only">Item type</span>
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-accent-600/[0.08] dark:bg-accent-400/[0.14] px-1.5 py-1.5">
            {groupTypes[activeGroup].map(({ type, label }) => (
              <span key={type}>{chip(type, label)}</span>
            ))}
          </div>
          <p className="mt-1 px-1 text-[11px] text-slate-500 dark:text-slate-400">
            {TYPE_HINT[itemType]}
          </p>
        </div>
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

      {itemType === "page" && (
        <div className="space-y-1.5">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Page title — e.g. 'How to attack inference questions'"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
          <textarea
            value={pageBody}
            onChange={(e) => setPageBody(e.target.value)}
            placeholder="Lesson content — plain text or simple markdown (**bold**, *italic*, blank line = new paragraph)."
            disabled={busy}
            rows={4}
            className="w-full resize-y rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
        </div>
      )}

      {itemType === "video" && (
        <div className="space-y-1.5">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Video title (optional)"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="YouTube / Vimeo / Loom link"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
        </div>
      )}

      {itemType === "file" && (
        <div className="space-y-1.5">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="File name — e.g. 'Week 1 notes (PDF)'"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="File URL (link from Materials, Drive, etc.)"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
        </div>
      )}

      {itemType === "note" && (
        <div className="space-y-1.5">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Heading (optional) — e.g. 'Before you start'"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Message — e.g. 'Bring a calculator; we start with the Math module.'"
            disabled={busy}
            rows={2}
            className="w-full resize-y rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Tone</span>
            {(["info", "tip", "warning"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setNoteTone(t)}
                aria-pressed={noteTone === t}
                disabled={busy}
                className={
                  "rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ring-1 transition-colors " +
                  (noteTone === t
                    ? "bg-indigo-600 text-white ring-indigo-600"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-slate-300 dark:ring-slate-700 hover:ring-slate-400")
                }
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {itemType === "goal" && (
        <div className="space-y-1.5">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Goal — e.g. 'Hit a 1400'"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
          <input
            type="text"
            value={goalTarget}
            onChange={(e) => setGoalTarget(e.target.value)}
            placeholder="Target — e.g. 'by mock #3'"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
          <input
            type="text"
            value={goalMetric}
            onChange={(e) => setGoalMetric(e.target.value)}
            placeholder="Tag (optional) — e.g. 'Math'"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
        </div>
      )}

      {itemType === "countdown" && (
        <div className="space-y-1.5">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Label — e.g. 'SAT test day'"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
          <input
            type="date"
            value={countdownDate}
            onChange={(e) => setCountdownDate(e.target.value)}
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
        </div>
      )}

      {itemType === "live_session" && (
        <div className="space-y-1.5">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Session title"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
          <input
            type="datetime-local"
            value={lsStartsAt}
            onChange={(e) => setLsStartsAt(e.target.value)}
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
          <input
            type="number"
            value={lsDuration}
            onChange={(e) => setLsDuration(e.target.value)}
            placeholder="Duration (min)"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Join link — Zoom/Meet (optional)"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
        </div>
      )}

      {itemType === "survey" && (
        <div className="space-y-1.5">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Heading (optional)"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
          <input
            type="text"
            value={surveyPrompt}
            onChange={(e) => setSurveyPrompt(e.target.value)}
            placeholder="Question — e.g. 'How confident are you on geometry?'"
            disabled={busy}
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Type</span>
            {(["scale", "choice", "text"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSurveyKind(k)}
                aria-pressed={surveyKind === k}
                disabled={busy}
                className={
                  "rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ring-1 transition-colors " +
                  (surveyKind === k
                    ? "bg-indigo-600 text-white ring-indigo-600"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-slate-300 dark:ring-slate-700 hover:ring-slate-400")
                }
              >
                {k}
              </button>
            ))}
          </div>
          {surveyKind === "choice" && (
            <textarea
              value={surveyOptions}
              onChange={(e) => setSurveyOptions(e.target.value)}
              placeholder="One option per line"
              disabled={busy}
              rows={3}
              className="w-full resize-y rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
            />
          )}
        </div>
      )}

      {itemType === "divider" && (
        <p className="px-1 py-2 text-[11px] text-slate-500 dark:text-slate-400">
          A thin rule with no text — just adds visual separation. Press “Add Divider”.
        </p>
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
