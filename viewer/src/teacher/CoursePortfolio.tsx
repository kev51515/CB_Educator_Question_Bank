/**
 * CoursePortfolio
 * ===============
 * The Portfolio tab on the course detail screen. Acts as a role-aware
 * splitter:
 *   - Staff: two sub-views (Template editor + Overview grid).
 *   - Student: delegates to <StudentPortfolio /> which uses the same template
 *     resolved by `usePortfolio` indirectly (student hook re-fetches it).
 *
 * Wave 11A layers a hierarchical portfolio on top of the flat list. Items now
 * carry `parent_item_id` and the staff template view renders a tree:
 *   - <PortfolioTreeView> composes recursive <PortfolioItemNodeRow> rows
 *     with per-node collapse persisted via localStorage.
 *   - HTML5 native drag-and-drop with Before / After / Into drop zones,
 *     wired to the `move_portfolio_item` RPC.
 *   - Indent / Outdent / Move to… / + Sub-item via the kebab.
 *   - Cycle prevention by excluding any descendant of the dragged node from
 *     valid drop targets.
 *
 * Submissions are still per-leaf; the Overview grid walks the tree and only
 * surfaces leaf items as columns (header items can be parents but never
 * accept submissions).
 *
 * This file is the orchestrator: state, RPC callbacks, modal management,
 * sub-view tab. The recursive row + drag plumbing + tree wrapper + overview
 * grid all live in dedicated files (see PortfolioItemNode.tsx,
 * usePortfolioDrag.ts, PortfolioTreeView.tsx, PortfolioOverviewGrid.tsx).
 */
import { useClassContext } from "./classLayoutContext";
import { useProfile } from "@/lib/profile";
import { StudentPortfolio } from "@/student/StudentPortfolio";
import { StaffPortfolio } from "./StaffPortfolio";

// -----------------------------------------------------------------------------
// Top-level component
// -----------------------------------------------------------------------------

export function CoursePortfolio() {
  const { cls } = useClassContext();
  const { profile } = useProfile();
  const isStaff = profile?.role === "teacher" || profile?.role === "admin";

  // Student-side rendering is delegated to StudentPortfolio. We branch BEFORE
  // calling staff-only hooks (usePortfolio bootstraps via RPC which would
  // raise for students).
  if (!isStaff && profile?.role === "student") {
    return <StudentPortfolio />;
  }

  return (
    <StaffPortfolio
      isStaff={isStaff}
      courseId={cls.id}
      authorId={profile?.id ?? ""}
      userId={profile?.id ?? null}
    />
  );
}

