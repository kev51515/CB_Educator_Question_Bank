/**
 * breadcrumbs
 * ===========
 * Pure derivation of the educator breadcrumb trail from a URL pathname.
 *
 * The staff shell renders one global breadcrumb bar above every page (see
 * `components/Breadcrumbs.tsx`). Rather than have each page declare its own
 * trail, we compute it here by walking the `/educator/...` path segment by
 * segment against a small label dictionary. Static segments map to fixed
 * labels; dynamic id segments (a course short_code, an assignment slug, …)
 * resolve to a human label registered by the owning page — falling back to a
 * generic entity word ("Course", "Assignment") until that page loads.
 *
 * Keeping this logic pure (no React, no router) makes it trivially testable
 * and means the bar re-derives synchronously on every navigation with zero
 * async flicker for the static portion of the trail.
 */

/** One node in the breadcrumb trail. */
export interface Crumb {
  /** Human-readable label. */
  label: string;
  /** Navigation target. Absent ⇒ not a link (current page or structural). */
  to?: string;
  /** True only for the final/current crumb (rendered `aria-current`, no link). */
  current?: boolean;
}

/** Registry of resolved labels keyed by the dynamic segment's URL value. */
export type BreadcrumbLabelMap = Readonly<Record<string, string>>;

/**
 * Static path segments → their display label. Covers every fixed segment in
 * the educator route tree (top-level surfaces, course tabs, account/admin
 * sub-pages). Anything not listed is treated as a dynamic id value.
 */
const STATIC_LABELS: Readonly<Record<string, string>> = {
  // Top-level surfaces
  dashboard: "Dashboard",
  calendar: "Calendar",
  courses: "Courses",
  "question-bank": "Question Bank",
  "qbank-submissions": "Submissions",
  tests: "Tests",
  inbox: "Inbox",
  account: "Account",
  // Course tabs
  modules: "Modules",
  overview: "Overview",
  assignments: "Assignments",
  people: "Roster",
  roster: "Roster",
  announcements: "Announcements",
  materials: "Materials",
  discussions: "Discussions",
  portfolio: "Portfolio",
  grades: "Grades",
  settings: "Settings",
  skills: "Skills",
  caseload: "Caseload",
  // Course tabs — pickleball player track
  players: "Players",
  lessons: "Lessons",
  briefings: "Briefings",
  progress: "Progress",
  drills: "Drills",
  programs: "Programs",
  events: "Events",
  // Course tabs — pickleball coach track
  coaches: "Coaches",
  certifications: "Certifications",
  development: "Development",
  shadowing: "Shadowing",
  evaluations: "Evaluations",
  hours: "Hours",
  "coach-programs": "Programs",
  chat: "Chat",
  // Test
  review: "Review",
  // Account / admin
  "notification-preferences": "Notifications",
  admin: "Admin",
  stats: "Stats",
  users: "Users",
  invites: "Invites",
  audit: "Audit",
};

/**
 * Static segments that exist only as structure — they have no index route of
 * their own, so their crumb is plain text (no link).
 */
const NON_LINKABLE_STATIC: ReadonlySet<string> = new Set(["admin"]);

/**
 * When a segment is a dynamic id, the PRECEDING static segment names the
 * entity. Used to pick the generic fallback word before the owning page
 * registers a real label.
 */
const ENTITY_BY_PARENT: Readonly<Record<string, string>> = {
  courses: "Course",
  assignments: "Assignment",
  people: "Student",
  discussions: "Discussion",
  tests: "Test",
  inbox: "Conversation",
  attempts: "Attempt",
};

/**
 * Compute the breadcrumb trail for an educator pathname.
 *
 * @param pathname e.g. `/educator/courses/AB12CD/assignments/H7K9MN`
 * @param labels   resolved dynamic labels keyed by segment value
 * @returns ordered crumbs (root → current). Empty for non-`/educator` paths.
 */
export function buildEducatorTrail(
  pathname: string,
  labels: BreadcrumbLabelMap = {},
): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "educator") return [];

  const crumbs: Crumb[] = [];
  let acc = "/educator";

  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    const parent = parts[i - 1];
    acc = `${acc}/${seg}`;

    // `attempts` is purely structural — the attempt id that follows carries
    // the "Attempt" crumb, so we skip emitting one for the literal segment.
    if (seg === "attempts") continue;

    const staticLabel = STATIC_LABELS[seg];
    if (staticLabel !== undefined) {
      crumbs.push({
        label: staticLabel,
        to: NON_LINKABLE_STATIC.has(seg) ? undefined : acc,
      });
      continue;
    }

    // Dynamic id segment — resolve to a registered label, else the entity word.
    const entity = ENTITY_BY_PARENT[parent] ?? "Item";
    const label = labels[seg] ?? entity;
    // Attempt ids aren't independently navigable; every other entity
    // (course / assignment / test / student / topic) resolves to a real or
    // redirecting route, so its crumb links to that path.
    const linkable = parent !== "attempts";
    crumbs.push({ label, to: linkable ? acc : undefined });
  }

  if (crumbs.length === 0) return crumbs;

  // The bare course landing defaults to the Modules tab. Drop a trailing
  // Modules crumb so the course landing reads "Courses / SAT" (the course
  // name as the current page) and the up-control targets the course list.
  const n = parts.length;
  const isCourseModulesLanding =
    parts[n - 1] === "modules" && parts[n - 3] === "courses";
  if (isCourseModulesLanding) crumbs.pop();

  // Mark the final crumb as the current page: emphasised, no link.
  const lastIdx = crumbs.length - 1;
  crumbs[lastIdx] = { ...crumbs[lastIdx], to: undefined, current: true };

  return crumbs;
}

/**
 * The target for the breadcrumb bar's dedicated "back" (up one level) control:
 * the nearest ancestor crumb that is a link. Returns null when the current
 * page is a top-level surface (no parent) — the control is then disabled.
 */
export function backTargetOf(crumbs: readonly Crumb[]): string | null {
  for (let i = crumbs.length - 2; i >= 0; i--) {
    const to = crumbs[i].to;
    if (to) return to;
  }
  return null;
}
