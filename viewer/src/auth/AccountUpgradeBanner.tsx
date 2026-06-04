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
 *
 * Dismiss/snooze: the × button snoozes the banner for 24 hours. Snooze
 * state is persisted per-user in localStorage at
 * `auth.upgradeBanner.dismissedUntil:${userId}` so a reload still
 * respects the dismissal.
 */
import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session as SupabaseAuthSession } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AuthResult } from "./session";
import { UpgradeAccountModal } from "./UpgradeAccountModal";

interface AccountUpgradeBannerProps {
  upgradeAnonymousAccount: (email: string, password: string) => Promise<AuthResult>;
}

const SNOOZE_MS = 24 * 60 * 60 * 1000; // 24 hours
const STORAGE_KEY_PREFIX = "auth.upgradeBanner.dismissedUntil:";

function isSnoozed(userId: string | null): boolean {
  if (!userId) return false;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
    if (!raw) return false;
    const until = Date.parse(raw);
    if (Number.isNaN(until)) return false;
    return until > Date.now();
  } catch {
    return false;
  }
}

function setSnoozed(userId: string): void {
  try {
    const until = new Date(Date.now() + SNOOZE_MS).toISOString();
    window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, until);
  } catch {
    // ignore: storage may be unavailable in private mode
  }
}

export function AccountUpgradeBanner({
  upgradeAnonymousAccount,
}: AccountUpgradeBannerProps) {
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    const check = async (): Promise<void> => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const user = data.user as unknown as { id?: string; is_anonymous?: boolean } | null;
      const nextId = user?.id ?? null;
      setUserId(nextId);
      setIsAnonymous(user?.is_anonymous === true);
      setDismissed(isSnoozed(nextId));
    };

    void check();

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, nextSession: SupabaseAuthSession | null) => {
        const user = nextSession?.user as unknown as { id?: string; is_anonymous?: boolean } | undefined;
        const nextId = user?.id ?? null;
        setUserId(nextId);
        setIsAnonymous(user?.is_anonymous === true);
        setDismissed(isSnoozed(nextId));
      },
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleDismiss = (): void => {
    if (userId) setSnoozed(userId);
    setDismissed(true);
  };

  if (!isAnonymous || dismissed) return null;

  return (
    <>
      <div
        role="region"
        aria-label="Upgrade your account"
        className="fixed top-0 inset-x-0 z-40 bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 print:hidden"
      >
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm">
          <span className="truncate">
            You're signed in as a guest. Save your progress across devices and never lose your work — add an email + password.
          </span>
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              aria-label="Upgrade to a permanent account with email and password"
              className="min-h-[40px] rounded-md bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1"
            >
              Upgrade →
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss for 24 hours"
              title="Dismiss for 24 hours"
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1"
            >
              <span aria-hidden="true" className="text-lg leading-none">×</span>
            </button>
          </div>
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
