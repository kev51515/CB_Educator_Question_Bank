/**
 * AdminInvitesPage
 * ================
 * Thin route wrapper mounted at `/account/admin/invites`. Delegates the
 * actual mint / revoke UI to the unchanged `AdminInviteCodesPage`.
 */
import { AdminInviteCodesPage } from "./AdminInviteCodesPage";

export function AdminInvitesPage() {
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Invite codes
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Invite codes promote new users to the teacher role at signup.
          Anyone with staff access can mint or revoke.
        </p>
      </header>
      <AdminInviteCodesPage />
    </div>
  );
}
