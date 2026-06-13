/**
 * modules-page/inline-add/submit-handlers
 * =======================================
 * Per-item-type async DB-write logic for InlineAddItemRow, extracted verbatim
 * from the pre-split inline-add.tsx. These are pure helpers: they take the
 * already-validated data + the supabase client and perform the inserts/RPCs,
 * returning a small result object. The orchestrator (index.tsx) owns
 * validation, toast feedback, busy state, field reset, and the
 * onCommitted/onCommittedKeepOpen callbacks — behavior is unchanged.
 *
 * Practice Test / Question Set both insert two rows in sequence:
 *   1) `assignments` (kind='mocktest' or 'qbank_set' respectively)
 *   2) `module_items` (item_type='assignment', item_ref_id=<new id>)
 * If step 2 fails we best-effort delete the orphan assignment so the
 * teacher's Assignments page doesn't accumulate phantom rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeacherMockTest } from "@/teacher/useTeacherMockTests";
import type { CatalogEntry } from "@/teacher/useQuestionBankCatalog";

type DB = SupabaseClient;

/** A simple "errorMessage or null" result for an insert/link operation. */
export type WriteResult = { error: string | null };

// Insert the module_item row that points at a freshly-created assignment.
// If this fails we best-effort delete the assignment to avoid orphans.
export async function linkAssignmentToModule(
  supabase: DB,
  moduleId: string,
  position: number,
  newAssignmentId: string,
  displayTitle: string,
): Promise<string | null> {
  const { error: linkError } = await supabase.from("module_items").insert({
    module_id: moduleId,
    position,
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
}

// Insert a plain module_item (assignment / header / link). Returns the
// insert error message or null.
export async function insertModuleItem(
  supabase: DB,
  row: {
    module_id: string;
    position: number;
    item_type: "assignment" | "header" | "link" | "note" | "divider" | "page" | "video" | "file" | "goal" | "countdown" | "live_session" | "survey";
    item_ref_id: string | null;
    title: string;
    url: string | null;
    /** Per-type inline payload (0225) — note body+tone, etc. */
    config?: Record<string, unknown>;
  },
): Promise<string | null> {
  const { error: insertError } = await supabase.from("module_items").insert(row);
  return insertError ? insertError.message : null;
}

// CLONE on add: snapshot the chosen Practice-Test template's pedagogy-bearing
// columns into a new assignments row scoped to the CURRENT course, then link
// it to the module. Mirrors the qbank_set flow (insert → link → cleanup) so a
// failure to link doesn't leak an orphan assignment row.
export async function createPracticeTestItem(
  supabase: DB,
  args: {
    classId: string;
    createdBy: string;
    template: TeacherMockTest;
    dueAt: string | null;
    displayTitle: string;
    moduleId: string;
    position: number;
  },
): Promise<{ ok: boolean; createTitle?: string; createError?: string; linkError?: string }> {
  const nowIso = new Date().toISOString();
  const { data: newAssignment, error: insertError } = await supabase
    .from("assignments")
    .insert({
      course_id: args.classId,
      created_by: args.createdBy,
      title: args.template.title,
      description: args.template.description,
      kind: "mocktest",
      source_id: args.template.source_id,
      question_count: args.template.question_count,
      time_limit_minutes: args.template.time_limit_minutes,
      difficulty_mix: args.template.difficulty_mix,
      due_at: args.dueAt,
      opens_at: nowIso,
      archived: false,
    })
    .select("id")
    .single();

  if (insertError || !newAssignment) {
    return {
      ok: false,
      createError: insertError?.message ?? "Insert returned no row.",
    };
  }

  const linkErr = await linkAssignmentToModule(
    supabase,
    args.moduleId,
    args.position,
    newAssignment.id as string,
    args.displayTitle,
  );
  if (linkErr) {
    return { ok: false, linkError: linkErr };
  }
  return { ok: true };
}

// CLONE on add for a Question Set: snapshot the chosen catalog entry into a
// new qbank_set assignments row scoped to the CURRENT course, then link it.
export async function createQuestionSetItem(
  supabase: DB,
  args: {
    classId: string;
    createdBy: string;
    entry: CatalogEntry;
    uid: string;
    title: string;
    computedTimeLimit: number;
    dueAt: string | null;
    displayTitle: string;
    moduleId: string;
    position: number;
  },
): Promise<{ ok: boolean; createError?: string; linkError?: string }> {
  const nowIso = new Date().toISOString();
  const { data: newAssignment, error: insertError } = await supabase
    .from("assignments")
    .insert({
      course_id: args.classId,
      created_by: args.createdBy,
      title: args.title,
      description: null,
      kind: "qbank_set",
      source_id: null,
      qbank_set_uid: args.uid,
      // Authoritative questions-file path (0220) — runner reads this instead of
      // re-resolving the uid against the catalog.
      qbank_questions_html: args.entry.questionsHtml,
      qbank_set_label: args.entry.label,
      question_count: args.entry.questionCount,
      time_limit_minutes: args.computedTimeLimit,
      difficulty_mix: "any",
      due_at: args.dueAt,
      opens_at: nowIso,
      archived: false,
    })
    .select("id")
    .single();

  if (insertError || !newAssignment) {
    return {
      ok: false,
      createError: insertError?.message ?? "Insert returned no row.",
    };
  }

  const linkErr = await linkAssignmentToModule(
    supabase,
    args.moduleId,
    args.position,
    newAssignment.id as string,
    args.displayTitle,
  );
  if (linkErr) {
    return { ok: false, linkError: linkErr };
  }
  return { ok: true };
}

// Insert the Full-Test link row. A strict module subset is encoded in the URL
// as `?m=<first>-<last>` by the caller. Returns the insert error or null.
export async function insertFullTestLink(
  supabase: DB,
  row: {
    /** Client-generated module_items id — the URL embeds it as `&item=<id>`
     *  (the assignment-occurrence identity, 0215), so the id must be known
     *  BEFORE the insert. */
    id: string;
    module_id: string;
    position: number;
    title: string;
    url: string;
  },
): Promise<string | null> {
  const { error: insertError } = await supabase.from("module_items").insert({
    id: row.id,
    module_id: row.module_id,
    position: row.position,
    item_type: "link",
    item_ref_id: null,
    title: row.title,
    url: row.url,
  });
  return insertError ? insertError.message : null;
}

// Write the single "Available from" date across the deployed range via the
// set_module_open_date RPC. Returns the RPC error message or null.
export async function setFullTestOpenDate(
  supabase: DB,
  args: {
    classId: string;
    slug: string;
    first: number;
    last: number;
    opensAt: string;
  },
): Promise<string | null> {
  const { error: dateError } = await supabase.rpc("set_module_open_date", {
    p_course_id: args.classId,
    p_slug: args.slug,
    p_first: args.first,
    p_last: args.last,
    p_opens_at: args.opensAt,
  });
  return dateError ? dateError.message : null;
}
