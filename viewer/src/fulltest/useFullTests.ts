/**
 * useFullTests — the full-length test catalog (the `tests` table).
 * Small shared hook so surfaces (Modules add-item picker, catalogs) can list
 * full-length tests without duplicating the query.
 */
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { TestCatalogEntry } from "./types";

export function useFullTests(enabled = true): {
  tests: TestCatalogEntry[];
  loading: boolean;
} {
  const [tests, setTests] = useState<TestCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("tests")
        .select("slug,ordinal,title,short_title,total_questions")
        .order("ordinal", { ascending: true });
      if (!alive) return;
      setTests((data ?? []) as TestCatalogEntry[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { tests, loading };
}
