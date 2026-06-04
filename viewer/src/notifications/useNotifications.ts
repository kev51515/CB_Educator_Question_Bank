/**
 * useNotifications
 * ================
 * Subscribes to the current user's notification feed. Fetches the 50 most
 * recent rows up-front, then keeps the list fresh via a Supabase Realtime
 * channel filtered by `recipient_id`. Returns helpers to mark single or all
 * rows read.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import {
  isKindEnabled,
  loadPrefs,
  prefsStorageKey,
  type NotificationPrefs,
} from "./preferences";

export interface NotificationRow {
  id: number;
  recipient_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

interface UseNotificationsResult {
  notifications: NotificationRow[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadPrefs(null));
  const toast = useToast();

  // Re-read prefs whenever userId resolves (the per-user key changes).
  useEffect(() => {
    setPrefs(loadPrefs(userId));
  }, [userId]);

  // Cross-tab sync: another tab toggling prefs writes the same key, which
  // fires a `storage` event in this tab. Re-load prefs so the bell stays in
  // sync without a page refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = prefsStorageKey(userId);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      setPrefs(loadPrefs(userId));
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [userId]);

  // Tracks whether the latest mount is still alive — guards against
  // post-unmount setState landing on a new user's render after a fast
  // sign-out → sign-in-as-other flip. Lane B pattern from AssignmentRunner.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const fetchNotifications = useCallback(async (uid: string): Promise<void> => {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, recipient_id, kind, title, body, link, read_at, created_at")
      .eq("recipient_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);
    // Bail if the component (or this user session) is gone — stale rows
    // must not land on a new render.
    if (!aliveRef.current) return;
    if (error) {
      // R4: don't swallow silently. Surface to console + toast so the
      // bell going empty after sign-in flips is debuggable.
      console.warn("[useNotifications] fetch failed", error);
      toast.error("Couldn't load notifications");
      setNotifications([]);
      return;
    }
    setNotifications((data ?? []) as NotificationRow[]);
  }, [toast]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) return;
    setLoading(true);
    await fetchNotifications(userId);
    // Same mount-guard: avoid flipping loading off on a dead component.
    if (!aliveRef.current) return;
    setLoading(false);
  }, [userId, fetchNotifications]);

  // Resolve current user once.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      // Local guard: identical to Lane B's pattern — abort if this
      // mount has been torn down before auth resolved.
      if (!alive) return;
      setUserId(uid);
      if (uid) {
        await fetchNotifications(uid);
      } else {
        if (!alive) return;
        setNotifications([]);
      }
      if (!alive) return;
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [fetchNotifications]);

  // Realtime subscription scoped to this recipient.
  // `fetchNotifications` is intentionally NOT in deps — calling it via a
  // ref keeps the channel alive across callback identity flips, so we
  // don't open a temporary subscription gap on every re-render.
  const fetchNotificationsRef = useRef(fetchNotifications);
  fetchNotificationsRef.current = fetchNotifications;
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          // Read latest fetcher off the ref so identity flips don't
          // tear down the channel.
          void fetchNotificationsRef.current(userId);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const markRead = useCallback(
    async (id: number): Promise<void> => {
      const nowIso = new Date().toISOString();
      // Optimistic update. Snapshot for rollback on failure so a server-side
      // RLS reject doesn't leave the badge in a fake-read state.
      let previous: NotificationRow[] = [];
      setNotifications((prev) => {
        previous = prev;
        return prev.map((n) =>
          n.id === id && n.read_at === null ? { ...n, read_at: nowIso } : n,
        );
      });
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: nowIso })
        .eq("id", id)
        .is("read_at", null);
      if (error) {
        setNotifications(previous);
        toast.error("Couldn't mark as read");
      }
    },
    [toast],
  );

  const markAllRead = useCallback(async (): Promise<void> => {
    if (!userId) return;
    const nowIso = new Date().toISOString();
    // Snapshot for rollback on failure.
    let previous: NotificationRow[] = [];
    setNotifications((prev) => {
      previous = prev;
      return prev.map((n) => (n.read_at === null ? { ...n, read_at: nowIso } : n));
    });
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: nowIso })
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (error) {
      // Revert optimistic update and surface the failure.
      setNotifications(previous);
      toast.error("Couldn't mark notifications as read");
      return;
    }
    // Refresh to ensure unread count + state align with server truth.
    await fetchNotifications(userId);
  }, [userId, fetchNotifications, toast]);

  // Drop notifications whose kind the user has opted out of. The unread
  // badge + dropdown both consume `visible`, so opt-outs naturally hide
  // from view without touching the underlying rows (which stay on the
  // server for when the user re-enables the kind later).
  const visible = notifications.filter((n) => isKindEnabled(prefs, n.kind));

  const unreadCount = visible.reduce(
    (count, n) => (n.read_at === null ? count + 1 : count),
    0,
  );

  return {
    notifications: visible,
    unreadCount,
    loading,
    refresh,
    markRead,
    markAllRead,
  };
}
