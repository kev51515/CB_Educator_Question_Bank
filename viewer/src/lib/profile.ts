/**
 * useProfile — hook that fetches the current authenticated user's
 * `public.profiles` row from Supabase.
 *
 * Why it exists: the auth session tells us who the user is, but their role
 * (student / teacher / admin) lives in profiles. AuthGate branches on role
 * to decide which surface to render, so we need a small, focused hook that
 *   - fetches the profile when auth lands,
 *   - clears it on sign-out,
 *   - refetches on sign-in (or any auth state change that yields a user),
 *   - exposes `refresh()` for callers that just mutated the row.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthChangeEvent, Session as SupabaseAuthSession } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Domain } from "./domain";

export type ProfileRole = "student" | "teacher" | "admin";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: ProfileRole;
  created_at: string;
  updated_at: string;
  /** True for teacher-created student accounts (login code + managed password). */
  managed: boolean;
  /** The login username for managed students (e.g. "KQAZNP-04"); else null. */
  login_code: string | null;
  /**
   * The user's active product-vertical domain ('academic' | 'counseling' |
   * 'coaching'), or null when unset (the client derives a default). Drives
   * vocabulary + accent theming. See lib/domain.ts + migration 0171.
   */
  domain: Domain | null;
}

export interface UseProfile {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load profile.";
}

/**
 * Postgres transient errors that are safe to retry verbatim: 40P01 deadlock
 * detected, 40001 serialization failure. The profile read is a plain SELECT, so
 * a deadlock only ever means it was the momentary victim of a concurrent write
 * (a seed, a cascade delete) — retrying clears it. We surface the error only
 * after a few quick attempts so a blip never shows the user "Couldn't load your
 * profile". */
const TRANSIENT_DB_CODES = new Set(["40P01", "40001"]);
function isTransientDbError(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false;
  return (
    TRANSIENT_DB_CODES.has(e.code ?? "") ||
    /deadlock detected|could not serialize/i.test(e.message ?? "")
  );
}

/**
 * Narrow + validate a Supabase row into a Profile. We're defensive here
 * because supabase-js returns `unknown`-shaped data and we want a clean
 * runtime guarantee that downstream consumers can rely on.
 */
function toProfile(row: unknown): Profile | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    typeof r.email !== "string" ||
    typeof r.role !== "string" ||
    typeof r.created_at !== "string" ||
    typeof r.updated_at !== "string"
  ) {
    return null;
  }
  const role = r.role;
  if (role !== "student" && role !== "teacher" && role !== "admin") return null;
  const displayName =
    typeof r.display_name === "string" || r.display_name === null ? r.display_name : null;
  const loginCode =
    typeof r.login_code === "string" ? r.login_code : null;
  const domain =
    r.domain === "academic" || r.domain === "counseling" || r.domain === "coaching"
      ? r.domain
      : null;
  return {
    id: r.id,
    email: r.email,
    display_name: displayName,
    role,
    created_at: r.created_at,
    updated_at: r.updated_at,
    managed: r.managed === true,
    login_code: loginCode,
    domain,
  };
}

export function useProfile(): UseProfile {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `userId` ref so `refresh()` always pulls for the latest known user
  // without becoming a dependency of the callback's identity.
  const userIdRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // Retry transient DB errors (deadlock / serialization) a few times with a
      // short backoff before surfacing — see isTransientDbError.
      let queryError: { code?: string; message?: string } | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await supabase
          .from("profiles")
          .select("id, email, display_name, role, created_at, updated_at, managed, login_code, domain")
          .eq("id", userId)
          .single();
        queryError = res.error;
        if (!queryError) {
          const parsed = toProfile(res.data);
          if (!parsed) {
            setProfile(null);
            setError("Profile data was malformed.");
            return;
          }
          setProfile(parsed);
          return;
        }
        if (!isTransientDbError(queryError)) break;
        // 150ms, 300ms, 450ms (+jitter) — fast enough to feel instant.
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1) + Math.random() * 120));
      }
      setProfile(null);
      setError(queryError?.message ?? "Couldn't load your profile.");
    } catch (err: unknown) {
      setProfile(null);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async (): Promise<void> => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const userId = data.session?.user.id ?? null;
      userIdRef.current = userId;
      if (!userId) {
        setProfile(null);
        setLoading(false);
        return;
      }
      await fetchProfile(userId);
    };

    void bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, nextAuthSession: SupabaseAuthSession | null) => {
        const userId = nextAuthSession?.user.id ?? null;
        userIdRef.current = userId;
        if (!userId) {
          setProfile(null);
          setError(null);
          setLoading(false);
          return;
        }
        void fetchProfile(userId);
      },
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const refresh = useCallback(async (): Promise<void> => {
    const userId = userIdRef.current;
    if (!userId) return;
    await fetchProfile(userId);
  }, [fetchProfile]);

  return { profile, loading, error, refresh };
}
