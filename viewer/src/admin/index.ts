/**
 * Admin barrel. Single import surface for the admin-only pages.
 *
 * The legacy `AdminShell` (tab strip) and the interim `ConsoleShell` were
 * both retired when the staff surface moved to the Canvas-style
 * Dashboard / Courses / Account layout. The admin power-tools (stats /
 * users / invites) now live under `/account/admin/*` via the
 * `AdminStatsPage`, `AdminUsersPage`, and `AdminInvitesPage` wrappers.
 */
export { AdminInviteCodesPage } from "./AdminInviteCodesPage";
export { SystemStats } from "./SystemStats";
export { AllClassesView, type AdminClass } from "./AllClassesView";
export { AllUsersView } from "./AllUsersView";
export { AdminClassDetail } from "./AdminClassDetail";
export { AdminStatsPage } from "./AdminStatsPage";
export { AdminUsersPage } from "./AdminUsersPage";
export { AdminInvitesPage } from "./AdminInvitesPage";
export { AdminAuditPage } from "./AdminAuditPage";
export { AdminTrashPage } from "./AdminTrashPage";
export { AdminCollegesPage } from "./AdminCollegesPage";
