/**
 * useFullTests — the full-length test catalog (the `tests` table).
 * Small shared hook so surfaces (Modules add-item picker, catalogs) can list
 * full-length tests without duplicating the query.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Section, TestCatalogEntry } from "./types";
import { CATALOG_SELECT, deriveSections } from "./testSections";

interface RawCatalogRow {
  slug: string;
  ordinal: number;
  title: string;
  short_title: string | null;
  total_questions: number;
  test_modules: { section: Section }[] | null;
}

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
        .select(CATALOG_SELECT)
        .order("ordinal", { ascending: true });
      if (!alive) return;
      setTests(
        ((data ?? []) as unknown as RawCatalogRow[]).map((r) => ({
          slug: r.slug,
          ordinal: r.ordinal,
          title: r.title,
          short_title: r.short_title,
          total_questions: r.total_questions,
          sections: deriveSections(r.test_modules),
          module_count: r.test_modules?.length ?? 0,
        })),
      );
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { tests, loading };
}
