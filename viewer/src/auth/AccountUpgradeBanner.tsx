/**
 * AccountUpgradeBanner
 * ====================
 * Tiny fixed banner that appears at the top of the viewport for users who
 * signed in through QuickStart as an anonymous Supabase user. The banner
 * nudges them to convert to a permanent email+password account so their
 * progress survives a device switch.
 *
 * The banner queries supabase.auth.getUser() once on mount (and on auth
 * change) to read `user.is_anonymous`. Render returns null for permanent
 * users so the host can mount it unconditionally without UI cost.
 *
 * Clicking "Upgrade" opens the UpgradeAccountModal which calls
 * upgradeAnonymousAccount(email, password). On success the modal closes
 * and the banner auto-hides on the next auth state change (since the user
 * is no longer anonymous).
 */
import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session as SupabaseAuthSession } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { AuthResult } from "./session";
import { UpgradeAccountModal } from "./UpgradeAccountModal";

interface AccountUpgradeBannerProps {
  upgradeAnonymousAccount: (email: string, password: string) => Promise<AuthResult>;
}

export function AccountUpgradeBanner({
  upgradeAnonymousAccount,
}: AccountUpgradeBannerProps) {
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [modalOpen, setModalOpen] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    const check = async (): Promise<void> => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const user = data.user as unknown as { is_anonymous?: boolean } | null;
      setIsAnonymous(user?.is_anonymous === true);
    };

    void check();

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, nextSession: SupabaseAuthSession | null) => {
        const user = nextSession?.user as unknown as { is_anonymous?: boolean } | undefined;
        setIsAnonymous(user?.is_anonymous === true);
      },
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!isAnonymous) return null;

  return (
    <>
      <div
        role="status"
        className="fixed top-0 inset-x-0 z-40 bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 print:hidden"
      >
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm">
          <span className="truncate">
            You're signed in as a guest. Add an email + password to save your progress.
          </span>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="shrink-0 rounded-md bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1"
          >
            Upgrade →
          </button>
        </div>
      </div>
      {modalOpen && (
        <UpgradeAccountModal
          upgradeAnonymousAccount={upgradeAnonymousAccount}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
