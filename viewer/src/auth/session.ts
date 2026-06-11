/**
 * Student session: thin React hook around Supabase auth + a chosen study area.
 *
 * The "session" object is derived from the live Supabase auth session. The
 * `area` ("bank" | "mock") is a UI choice we persist per user in localStorage
 * so reloads land back where the student left off. Sign in / sign up / sign
 * out all delegate to supabase.auth; the DB trigger handles profile creation.
 *
 * Account lifecycle methods added in the security hardening pass:
 *   - signUp now always lands users as 'student' first; teacher elevation
 *     happens via a second call to the redeem_teacher_invite RPC, gated by
 *     a valid admin-minted invite code. If the redeem fails we sign the
 *     user out so the half-created teacher account can't be used as a
 *     student either.
 *   - upgradeAnonymousAccount converts a quick-start anonymous user into a
 *     permanent email/password account without churning the user_id.
 *   - requestPasswordReset + updatePassword cover the forgot-password flow.
 *   - updateDisplayName syncs the auth metadata AND the profiles row.
 */
import { useCallback, useEffect, useState } from "react";
import type { AuthChangeEvent, Session as SupabaseAuthSession, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { clearUser, identifyUser } from "@/lib/telemetry";

export type StudentArea = "bank" | "mock";
export type SignUpRole = "student" | "teacher";

export interface StudentSession {
  userId: string;
  email: string;
  name: string;
  area: StudentArea | null;
}

export interface AuthResult {
  error: string | null;
}

export interface UseStudentSession {
  session: StudentSession | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  /**
   * Passwordless sign-in for a managed student with their teacher-issued login
   * code (mirrors first-time join). Resolves the code → the seat's CURRENT
   * account server-side (student-code-login edge fn) and verifies the returned
   * one-time token to establish a session. Fixes the post-claim "Invalid login
   * credentials" lockout (the account email is no longer <code>@students.local).
   */
  signInWithCode: (code: string) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
    role: SignUpRole,
    teacherInviteCode?: string,
  ) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  setArea: (area: StudentArea | null) => void;
  upgradeAnonymousAccount: (email: string, password: string) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (newPassword: string) => Promise<AuthResult>;
  updateDisplayName: (name: string) => Promise<AuthResult>;
}

const AREA_STORAGE_PREFIX = "student.area:";

function areaStorageKey(userId: string): string {
  return `${AREA_STORAGE_PREFIX}${userId}`;
}

function readArea(userId: string): StudentArea | null {
  try {
    const raw = localStorage.getItem(areaStorageKey(userId));
    return raw === "bank" || raw === "mock" ? raw : null;
  } catch {
    return null;
  }
}

function writeArea(userId: string, area: StudentArea | null): void {
  try {
    if (area) localStorage.setItem(areaStorageKey(userId), area);
    else localStorage.removeItem(areaStorageKey(userId));
  } catch {
    /* quota or disabled — non-fatal */
  }
}

function deriveName(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | null | undefined;
  const displayName = meta && typeof meta.display_name === "string" ? meta.display_name.trim() : "";
  if (displayName) return displayName;
  const email = user.email ?? "";
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

function buildSession(authSession: SupabaseAuthSession | null): StudentSession | null {
  if (!authSession?.user) return null;
  const { user } = authSession;
  return {
    userId: user.id,
    email: user.email ?? "",
    name: deriveName(user),
    area: readArea(user.id),
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong. Please try again.";
}

/**
 * Map a Postgres exception thrown by the redeem_teacher_invite RPC into a
 * user-facing message. The RPC uses bare keywords as exception messages so
 * we can map them to localizable copy here without parsing strings.
 */
function mapRedeemError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid_invite_code")) {
    return "That teacher invite code isn't valid. Ask your admin for a fresh one.";
  }
  if (m.includes("already_elevated")) {
    return "Your account is already a teacher or admin.";
  }
  if (m.includes("not_authenticated")) {
    return "You're not signed in. Please sign in and try again.";
  }
  if (m.includes("profile_not_found")) {
    return "We couldn't find your profile. Try signing in again.";
  }
  return `Invite code could not be redeemed: ${message}`;
}

export function useStudentSession(): UseStudentSession {
  const [session, setSession] = useState<StudentSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Side effect: identify the user to telemetry providers when a session
    // is live, or clear identity on sign-out. No-op when keys are absent.
    const syncTelemetry = (authSession: SupabaseAuthSession | null): void => {
      const user = authSession?.user;
      if (!user) {
        clearUser();
        return;
      }
      const meta = user.user_metadata as Record<string, unknown> | null | undefined;
      const role = meta && typeof meta.role === "string" ? meta.role : "student";
      identifyUser(user.id, user.email ?? "", role);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(buildSession(data.session));
      syncTelemetry(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, nextAuthSession: SupabaseAuthSession | null) => {
        setSession(buildSession(nextAuthSession));
        syncTelemetry(nextAuthSession);
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error ? error.message : null };
      } catch (error: unknown) {
        return { error: getErrorMessage(error) };
      }
    },
    [],
  );

  const signInWithCode = useCallback(async (code: string): Promise<AuthResult> => {
    try {
      const trimmed = code.trim();
      if (!trimmed) return { error: "Please enter your login code." };
      const { data, error } = await supabase.functions.invoke("student-code-login", {
        body: { code: trimmed },
      });
      // functions.invoke returns the parsed body in `data` on 2xx; on non-2xx it
      // sets `error` (FunctionsHttpError) and stashes the Response in
      // error.context — read our { error: kind } code out of it for nice copy.
      if (error) {
        let kind = "";
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.json === "function") {
            kind = ((await ctx.json()) as { error?: string })?.error ?? "";
          }
        } catch {
          /* body unreadable — fall through to generic */
        }
        if (kind === "rate_limited") {
          return { error: "Too many attempts. Wait a minute and try again." };
        }
        if (kind === "invalid_code") {
          return { error: "We couldn't find that login code. Check it with your teacher." };
        }
        // Network / unexpected — generic, and nudge toward the email path.
        return {
          error:
            "We couldn't sign you in with that code. Check it with your teacher, or sign in with your email and password.",
        };
      }
      const tokenHash = (data as { token_hash?: string } | null)?.token_hash;
      if (!tokenHash) {
        return { error: "We couldn't find that login code. Check it with your teacher." };
      }
      const { error: vErr } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "magiclink",
      });
      if (vErr) return { error: "That login code couldn't be used. Ask your teacher to re-issue it." };
      return { error: null };
    } catch (error: unknown) {
      return { error: getErrorMessage(error) };
    }
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
      role: SignUpRole,
      teacherInviteCode?: string,
    ): Promise<AuthResult> => {
      try {
        // ALWAYS sign up as 'student' first. The handle_new_auth_user trigger
        // reads role from raw_user_meta_data — passing 'teacher' here would
        // bypass the invite check entirely (the original bug).
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName, role: "student" } },
        });
        if (error) return { error: error.message };

        // If the caller asked for teacher, redeem the invite. We only do this
        // when a session lands immediately (i.e., email confirmation is off
        // or the user lands signed-in). If email confirmation is on, the
        // session is null here and redemption will need to happen post-confirm
        // — that's a separate flow we don't ship today; surface a notice.
        if (role === "teacher") {
          const code = (teacherInviteCode ?? "").trim();
          if (!code) {
            return { error: "Teacher invite code is required to sign up as a teacher." };
          }
          if (!data.session) {
            // Session not yet live (likely email confirmation). Tell the user
            // they'll need to redeem after confirming — out of scope for this
            // pass, but at least we don't half-create a teacher account.
            return {
              error:
                "Account created, but you'll need to confirm your email before redeeming your teacher invite. Sign in after confirming.",
            };
          }
          const { error: redeemError } = await supabase.rpc("redeem_teacher_invite", {
            p_code: code,
          });
          if (redeemError) {
            // Roll back the half-broken state by signing out. The auth user
            // and student profile still exist — they can sign in as a student
            // later, or ask an admin to clean up.
            await supabase.auth.signOut();
            return { error: mapRedeemError(redeemError.message) };
          }
        }

        return { error: null };
      } catch (error: unknown) {
        return { error: getErrorMessage(error) };
      }
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut();
  }, []);

  const setArea = useCallback((area: StudentArea | null) => {
    setSession((prev) => {
      if (!prev) return prev;
      writeArea(prev.userId, area);
      return { ...prev, area };
    });
  }, []);

  const upgradeAnonymousAccount = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) {
          return { error: "You're not signed in." };
        }
        // is_anonymous is the canonical Supabase flag for guest accounts.
        const isAnon = (user as unknown as { is_anonymous?: boolean }).is_anonymous === true;
        if (!isAnon) {
          return { error: "This account is already a permanent account." };
        }

        // Per Supabase docs: updateUser({email, password}) on an anonymous
        // user converts it to a permanent account. The user_id is preserved,
        // which is the whole point — all the student's progress survives.
        const { error } = await supabase.auth.updateUser({ email, password });
        if (error) {
          const msg = error.message.toLowerCase();
          if (msg.includes("already") && msg.includes("registered")) {
            return { error: "email_exists" };
          }
          if (msg.includes("user with this email")) {
            return { error: "email_exists" };
          }
          return { error: error.message };
        }
        return { error: null };
      } catch (error: unknown) {
        return { error: getErrorMessage(error) };
      }
    },
    [],
  );

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    try {
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/?reset=1` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      return { error: error ? error.message : null };
    } catch (error: unknown) {
      return { error: getErrorMessage(error) };
    }
  }, []);

  const updatePassword = useCallback(async (newPassword: string): Promise<AuthResult> => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      return { error: error ? error.message : null };
    } catch (error: unknown) {
      return { error: getErrorMessage(error) };
    }
  }, []);

  const updateDisplayName = useCallback(async (name: string): Promise<AuthResult> => {
    try {
      const trimmed = name.trim();
      if (!trimmed) return { error: "Display name cannot be empty." };

      const { error: authErr } = await supabase.auth.updateUser({
        data: { display_name: trimmed },
      });
      if (authErr) return { error: authErr.message };

      // RLS lets a user update their own profile row. We update display_name
      // here so the rest of the app (which reads from profiles) sees the
      // change without waiting for the next auth refresh.
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (userId) {
        const { error: profileErr } = await supabase
          .from("profiles")
          .update({ display_name: trimmed })
          .eq("id", userId);
        if (profileErr) return { error: profileErr.message };
      }

      // Refresh local session name so the badge etc. updates immediately.
      setSession((prev) => (prev ? { ...prev, name: trimmed } : prev));
      return { error: null };
    } catch (error: unknown) {
      return { error: getErrorMessage(error) };
    }
  }, []);

  return {
    session,
    loading,
    signInWithPassword,
    signInWithCode,
    signUp,
    signOut,
    setArea,
    upgradeAnonymousAccount,
    requestPasswordReset,
    updatePassword,
    updateDisplayName,
  };
}
