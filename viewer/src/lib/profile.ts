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

export type ProfileRole = "student" | "teacher" | "admin";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: ProfileRole;
  created_at: string;
  updated_at: string;
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
  return {
    id: r.id,
    email: r.email,
    display_name: displayName,
    role,
    created_at: r.created_at,
    updated_at: r.updated_at,
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
      const { data, error: queryError } = await supabase
        .from("profiles")
        .select("id, email, display_name, role, created_at, updated_at")
        .eq("id", userId)
        .single();
      if (queryError) {
        setProfile(null);
        setError(queryError.message);
        return;
      }
      const parsed = toProfile(data);
      if (!parsed) {
        setProfile(null);
        setError("Profile data was malformed.");
        return;
      }
      setProfile(parsed);
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
