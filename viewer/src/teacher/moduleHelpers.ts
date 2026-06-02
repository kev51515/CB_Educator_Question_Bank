/**
 * moduleHelpers
 * =============
 * Pure helpers, constants, and types extracted from ModulesPage.tsx. No JSX,
 * no React state — only tree/drag math, localStorage read/write, formatters,
 * and the small value types those functions traffic in. Kept in the same
 * `teacher/` folder so relative imports (`./useCourseModules`) stay valid.
 */
import type { ModuleItem, ModuleNode } from "./useCourseModules";

const ITEM_TYPE_ICON: Record<ModuleItem["item_type"], string> = {
  assignment: "📝",
  header: "▸",
  link: "🔗",
  page: "📄",
  file: "📎",
};

/**
 * Notion/Linear-style drop target. A single anchor row + relative position +
 * cursor-X depth resolution. `asChild` is only valid when position==="after"
 * and means "nest as the last child of the anchor".
 */
interface DropTarget {
  anchorId: string;
  position: "before" | "after";
  asChild: boolean;
  parentId: string | null;
  depth: number;
}

/** Pixel indent per depth level. Mirrors the `ml-6` (24px) used in the tree. */
const DEPTH_INDENT_PX = 24;

/**
 * Notion/Linear-style drop target for items WITHIN a module. Items are flat
 * (no nesting), so this is simpler than DropTarget — we only need an anchor
 * item + before/after + the target module id. Cross-module drops set
 * `moduleId` to the destination module's id; same-module reorders use the
 * anchor's own module_id.
 */
interface ItemDropTarget {
  anchorItemId: string;
  moduleId: string;
  position: "before" | "after";
}

/**
 * Resolve an item drop target from cursor Y relative to a single item row.
 * Returns null when dropping onto self (reject no-op). Items don't nest, so
 * no X threshold needed.
 */
function resolveItemDropTarget(
  anchor: ModuleItem,
  cursorY: number,
  rowRect: DOMRect,
  draggedItemId: string,
): ItemDropTarget | null {
  if (anchor.id === draggedItemId) return null;
  const midY = rowRect.top + rowRect.height / 2;
  return {
    anchorItemId: anchor.id,
    moduleId: anchor.module_id,
    position: cursorY < midY ? "before" : "after",
  };
}

/**
 * Resolve a drop target from cursor coords relative to an anchor row.
 *
 * Notion-style cursor-X depth control on the BOTTOM half:
 *   - Cursor X past the right edge of the row's indent → nest as child
 *     (`asChild: true`, depth = anchor + 1)
 *   - Cursor X at the row's content edge → sibling at anchor's depth
 *   - Cursor X LEFT of the row's content edge → OUTDENT by N levels
 *     (one level per INDENT_PX cursor moves left), bounded by anchor's
 *     own depth. This is how the user drags a nested module OUT of its
 *     parent: they don't need to navigate to a top-level row, they just
 *     drag the cursor leftward and the bar's anchor walks up the ancestor
 *     chain.
 *
 * Top half is always a sibling-before drop at the anchor's depth (no
 * outdent there — would be confusing; user can outdent via bottom half).
 *
 * Returns null if dropping onto self or a descendant (cycle prevention).
 */
function resolveDropTarget(
  anchor: ModuleNode,
  anchorDepth: number,
  cursorY: number,
  cursorX: number,
  rowRect: DOMRect,
  draggedId: string,
  draggedDescendants: ReadonlySet<string>,
  flatModules: readonly ModuleNode[],
): DropTarget | null {
  if (anchor.id === draggedId || draggedDescendants.has(anchor.id)) return null;

  const midY = rowRect.top + rowRect.height / 2;

  if (cursorY < midY) {
    return {
      anchorId: anchor.id,
      position: "before",
      asChild: false,
      parentId: anchor.parent_module_id,
      depth: anchorDepth,
    };
  }

  // Bottom half — cursor X picks the depth.
  // Layout: row's content starts at `rowRect.left + (anchorDepth * INDENT_PX)`
  // (approximate, accounting for the children container's inset padding —
  // currently `ml-6 p-3` for the tinted submodule block). We pick a simpler
  // bias: each indent step LEFT of the row's left edge = -1 depth, each
  // indent step RIGHT of (rowLeft + INDENT_PX) = nest.
  const stepFromLeft = Math.floor(
    (cursorX - rowRect.left) / DEPTH_INDENT_PX,
  );

  if (stepFromLeft >= 1) {
    // Far right of the row's content edge → nest as last child of anchor.
    return {
      anchorId: anchor.id,
      position: "after",
      asChild: true,
      parentId: anchor.id,
      depth: anchorDepth + 1,
    };
  }

  if (stepFromLeft >= 0) {
    // Within the row's left edge band → sibling-after at anchor's depth.
    return {
      anchorId: anchor.id,
      position: "after",
      asChild: false,
      parentId: anchor.parent_module_id,
      depth: anchorDepth,
    };
  }

  // Cursor LEFT of the row's left edge → outdent N levels.
  // `stepFromLeft` is negative; -1 = outdent one level, -2 = two, etc.
  // Bounded by anchor's actual depth (can't go above top level).
  const outdentLevels = Math.min(anchorDepth, -stepFromLeft);
  if (outdentLevels <= 0 || !anchor.parent_module_id) {
    // Already top-level or can't outdent — fall through to sibling-after
    // at anchor's depth.
    return {
      anchorId: anchor.id,
      position: "after",
      asChild: false,
      parentId: anchor.parent_module_id,
      depth: anchorDepth,
    };
  }
  // Walk up the parent chain by `outdentLevels` steps.
  let ancestor: ModuleNode | undefined = anchor;
  for (let i = 0; i < outdentLevels && ancestor; i += 1) {
    const parentId: string | null = ancestor.parent_module_id;
    if (!parentId) break;
    ancestor = flatModules.find((m) => m.id === parentId);
  }
  if (!ancestor) return null;
  // Drop AFTER the ancestor at its level — outdent visually anchors the
  // bar to the ancestor row so the user sees the bar climb up the tree.
  return {
    anchorId: ancestor.id,
    position: "after",
    asChild: false,
    parentId: ancestor.parent_module_id,
    depth: anchorDepth - outdentLevels,
  };
}

const collapseKey = (userId: string | null, courseId: string | null): string =>
  `mod-collapse:${userId ?? "anon"}:${courseId ?? "none"}`;

function readCollapseState(key: string): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const result: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "boolean") result[k] = v;
    }
    return result;
  } catch {
    return {};
  }
}

function writeCollapseState(
  key: string,
  state: Record<string, boolean>,
): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
}

type InlineAddType =
  | "assignment"
  | "practice_test"
  | "question_set"
  | "full_test"
  | "header"
  | "link";

// Practice Test source filter (UI-only, used to narrow the teacher's
// cross-course mocktest library). The Practice Test branch no longer
// configures a source at assign-time — it's a property of the chosen
// template, surfaced as a filter pill + per-row chip.
type PracticeTestSourceFilter = "all" | "cb" | "sat" | "mixed";

// Defaults aligned with AssignmentFormModal / AddSetToCourseModal so behaviour
// matches what teachers see in those longer-form surfaces.
/**
 * Compute a sensible default time limit from the catalog entry's question
 * count: ~45 sec/question with safety margin, rounded up to the nearest 5
 * minutes, with a 10-minute floor. Mirrors `AddSetToCourseModal`.
 *
 * Why compute instead of asking the teacher? Per the project's workflow
 * audit (May 2026), assign-time forms should only vary (which thing, due
 * date, display title). Time limit is intrinsic to the catalog entry and
 * belongs to its definition. catalog.json doesn't carry it today.
 */
function computeDefaultQbankTimeLimit(questionCount: number): number {
  if (!Number.isFinite(questionCount) || questionCount <= 0) return 10;
  const raw = questionCount * 0.75;
  const rounded = Math.ceil(raw / 5) * 5;
  return Math.max(10, rounded);
}

// localStorage keys.
const LAST_ADD_TYPE_KEY = (userId: string | null, classId: string | null): string =>
  `lms.lastAddType:${userId ?? "anon"}:${classId ?? "none"}`;
const QBANK_LAST_FILTER_KEY = "qbank.lastFilter";
const PT_LIBRARY_LAST_FILTER_KEY = "lms.ptLibraryLastFilter";

type QbankSectionFilter = "all" | "math" | "reading-and-writing";
type QbankDifficultyFilter = "all" | "easy" | "medium" | "hard";

interface QbankLastFilter {
  section: QbankSectionFilter;
  difficulty: QbankDifficultyFilter;
}

function readQbankLastFilter(): QbankLastFilter {
  try {
    const raw = window.localStorage.getItem(QBANK_LAST_FILTER_KEY);
    if (!raw) return { section: "all", difficulty: "all" };
    const parsed = JSON.parse(raw) as Partial<QbankLastFilter>;
    const section: QbankSectionFilter =
      parsed.section === "math" || parsed.section === "reading-and-writing"
        ? parsed.section
        : "all";
    const difficulty: QbankDifficultyFilter =
      parsed.difficulty === "easy" ||
      parsed.difficulty === "medium" ||
      parsed.difficulty === "hard"
        ? parsed.difficulty
        : "all";
    return { section, difficulty };
  } catch {
    return { section: "all", difficulty: "all" };
  }
}

function writeQbankLastFilter(filter: QbankLastFilter): void {
  try {
    window.localStorage.setItem(QBANK_LAST_FILTER_KEY, JSON.stringify(filter));
  } catch {
    // ignore (private mode etc.)
  }
}

function readLastAddType(userId: string | null, classId: string | null): InlineAddType | null {
  try {
    const raw = window.localStorage.getItem(LAST_ADD_TYPE_KEY(userId, classId));
    if (raw === "assignment" || raw === "practice_test" || raw === "question_set" || raw === "header" || raw === "link") {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

function writeLastAddType(userId: string | null, classId: string | null, type: InlineAddType): void {
  try {
    window.localStorage.setItem(LAST_ADD_TYPE_KEY(userId, classId), type);
  } catch {
    // ignore
  }
}

interface PtLibraryLastFilter {
  source: PracticeTestSourceFilter;
  courseId: string | "all";
}

function readPtLibraryLastFilter(): PtLibraryLastFilter {
  try {
    const raw = window.localStorage.getItem(PT_LIBRARY_LAST_FILTER_KEY);
    if (!raw) return { source: "all", courseId: "all" };
    const parsed = JSON.parse(raw) as Partial<PtLibraryLastFilter>;
    const source: PracticeTestSourceFilter =
      parsed.source === "cb" || parsed.source === "sat" || parsed.source === "mixed"
        ? parsed.source
        : "all";
    const courseId: string | "all" =
      typeof parsed.courseId === "string" && parsed.courseId.length > 0
        ? parsed.courseId
        : "all";
    return { source, courseId };
  } catch {
    return { source: "all", courseId: "all" };
  }
}

function writePtLibraryLastFilter(filter: PtLibraryLastFilter): void {
  try {
    window.localStorage.setItem(PT_LIBRARY_LAST_FILTER_KEY, JSON.stringify(filter));
  } catch {
    // ignore
  }
}

export {
  ITEM_TYPE_ICON,
  DEPTH_INDENT_PX,
  resolveItemDropTarget,
  resolveDropTarget,
  collapseKey,
  readCollapseState,
  writeCollapseState,
  computeDefaultQbankTimeLimit,
  LAST_ADD_TYPE_KEY,
  QBANK_LAST_FILTER_KEY,
  PT_LIBRARY_LAST_FILTER_KEY,
  readQbankLastFilter,
  writeQbankLastFilter,
  readLastAddType,
  writeLastAddType,
  readPtLibraryLastFilter,
  writePtLibraryLastFilter,
};
export type {
  DropTarget,
  ItemDropTarget,
  InlineAddType,
  PracticeTestSourceFilter,
  QbankSectionFilter,
  QbankDifficultyFilter,
  QbankLastFilter,
  PtLibraryLastFilter,
};
