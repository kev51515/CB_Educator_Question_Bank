/**
 * AdminUsersPage
 * ==============
 * Thin route wrapper mounted at `/account/admin/users`. Forwards the current
 * user id (so the table can hide actions on the signed-in row) and delegates
 * the actual list rendering to the unchanged `AllUsersView`.
 */
import { AllUsersView } from "./AllUsersView";

interface AdminUsersPageProps {
  currentUserId: string;
}

export function AdminUsersPage({ currentUserId }: AdminUsersPageProps) {
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          All users
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Every signed-up account. Promote teachers or revoke access from here.
        </p>
      </header>
      <AllUsersView currentUserId={currentUserId} />
    </div>
  );
}
