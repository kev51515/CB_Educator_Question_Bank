/**
 * useLineLink
 * ===========
 * Reads the current user's LINE binding (RLS owner-read scopes the table to
 * the caller's single row). Returns the link, a loading flag, an imperative
 * refresh, and a setter for optimistic local updates.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface LineLink {
  profile_id: string;
  line_user_id: string;
  status: "linked" | "unlinked";
  display_name: string | null;
  prefs: Record<string, string>;
  linked_at: string;
}

export function useLineLink() {
  const [link, setLink] = useState<LineLink | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("line_links")
      .select("profile_id, line_user_id, status, display_name, prefs, linked_at")
      .maybeSingle();
    if (!alive.current) return;
    setLink((data as LineLink | null) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);

  return { link, loading, refresh, setLink };
}
