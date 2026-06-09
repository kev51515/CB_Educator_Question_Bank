/**
 * Hooks barrel.
 *
 * Custom React hooks for state, persistence, and reactive helpers.
 *
 * Usage:
 *   import { useLocalStorageSet, useMediaQuery, useTags } from "@/hooks";
 *
 * Add new hook files alongside this `index.ts` and re-export them at the
 * bottom of this file so consumers have a single import surface.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Reactive CSS media query. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

/** localStorage-backed Set of strings. Stays in sync across tabs (storage event). */
export function useLocalStorageSet(key: string): [Set<string>, (id: string) => void, (id: string) => boolean] {
  const [set, setSet] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return new Set();
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed.filter((x): x is string => typeof x === "string"));
      return new Set();
    } catch {
      return new Set();
    }
  });

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify([...set]));
    } catch {
      /* quota or disabled — non-fatal */
    }
  }, [key, set]);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        const next = e.newValue ? JSON.parse(e.newValue) : [];
        setSet(new Set(Array.isArray(next) ? next : []));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const toggle = useCallback((id: string) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const has = useCallback((id: string) => set.has(id), [set]);

  return [set, toggle, has];
}

/** localStorage-backed string→string map (per-id notes, etc). */
export function useLocalStorageMap(key: string): {
  get: (id: string) => string;
  set: (id: string, value: string) => void;
  has: (id: string) => boolean;
  all: () => Record<string, string>;
} {
  const [map, setMap] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
      return {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }, [key, map]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        const next = e.newValue ? JSON.parse(e.newValue) : {};
        setMap(typeof next === "object" && next ? next : {});
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);
  return {
    get: (id) => map[id] ?? "",
    set: (id, value) =>
      setMap((prev) => {
        const next = { ...prev };
        if (value) next[id] = value;
        else delete next[id];
        return next;
      }),
    has: (id) => Boolean(map[id]),
    all: () => map,
  };
}

/** localStorage-backed string list with a max length, used for recents/MRU. */
export function useLocalStorageRecent(
  key: string,
  cap: number,
): [string[], (id: string) => void, () => void] {
  const [list, setList] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
      return [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }, [key, list]);
  const push = useCallback(
    (id: string) => {
      setList((prev) => {
        const next = [id, ...prev.filter((v) => v !== id)];
        if (next.length > cap) next.length = cap;
        return next;
      });
    },
    [cap],
  );
  const clear = useCallback(() => setList([]), []);
  return [list, push, clear];
}

/** localStorage-backed number with default + clamp. */
export function useLocalStorageNumber(
  key: string,
  defaultValue: number,
  min: number,
  max: number,
): [number, (n: number) => void] {
  const [v, setV] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return defaultValue;
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
      return defaultValue;
    } catch {
      return defaultValue;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(v));
    } catch {
      /* ignore */
    }
  }, [key, v]);
  const set = useCallback(
    (n: number) => setV(Math.max(min, Math.min(max, n))),
    [min, max],
  );
  return [v, set];
}

/** localStorage-backed string→number map for confidence ratings. */
export function useLocalStorageConfidence(key: string): {
  get: (id: string) => number;
  set: (id: string, rating: number) => void;
  getAll: () => Record<string, number>;
  countByRating: () => { unsure: number; okay: number; confident: number; unrated: number };
} {
  const [map, setMap] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        // Filter to only valid number values
        const result: Record<string, number> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === "number" && v >= 0 && v <= 3) result[k] = v;
        }
        return result;
      }
      return {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(map));
    } catch {
      /* quota or disabled — non-fatal */
    }
  }, [key, map]);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        const next = e.newValue ? JSON.parse(e.newValue) : {};
        setMap(typeof next === "object" && next && !Array.isArray(next) ? next : {});
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  return {
    get: (id) => map[id] ?? 0,
    set: (id, rating) =>
      setMap((prev) => {
        const next = { ...prev };
        if (rating > 0) next[id] = rating;
        else delete next[id];
        return next;
      }),
    getAll: () => map,
    countByRating: () => {
      const values = Object.values(map);
      return {
        unsure: values.filter((v) => v === 1).length,
        okay: values.filter((v) => v === 2).length,
        confident: values.filter((v) => v === 3).length,
        unrated: 0, // unrated questions aren't tracked in the map
      };
    },
  };
}

/** Generic localStorage-backed JSON state hook with cross-tab sync. */
export function useLocalStorageJSON<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  });

  // Use a ref to track whether the update came from a storage event,
  // so we don't write back to localStorage on cross-tab sync.
  const fromStorage = useRef(false);

  useEffect(() => {
    if (fromStorage.current) {
      fromStorage.current = false;
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* quota or disabled — non-fatal */
    }
  }, [key, state]);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        const next = e.newValue != null ? (JSON.parse(e.newValue) as T) : defaultValue;
        fromStorage.current = true;
        setState(next);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, defaultValue]);

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setState((prev) => (typeof value === "function" ? (value as (prev: T) => T)(prev) : value));
  }, []);

  return [state, setValue];
}

/**
 * Invoke `handler` when Escape is pressed, while `active`. The canonical
 * modal-dismiss companion to useFocusTrap (which only cycles Tab). Uses a ref
 * so a changing handler doesn't rebind the listener.
 */
export function useEscapeKey(handler: () => void, active: boolean = true): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ref.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);
}

/**
 * A timestamp (ms) that refreshes every `intervalMs` (default 60s) so
 * relative-time labels and time-based categorisation update while a view sits
 * open instead of freezing at first render. Also stabilises `useMemo`s that
 * depend on "now": they recompute on each coarse tick rather than on every
 * unrelated re-render. Use a coarse interval — most "x minutes ago" / due-soon
 * UIs don't need second precision, and a coarse tick keeps re-renders cheap.
 */
export function useNow(intervalMs: number = 60_000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// External hooks: re-export from their own modules for the @/hooks barrel.
export * from "./useKeyboardShortcuts";
export * from "./useModals";
export * from "./useFocusTrap";
