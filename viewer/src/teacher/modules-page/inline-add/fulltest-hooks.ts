/**
 * modules-page/inline-add/fulltest-hooks
 * ======================================
 * Full-Test picker state hook for InlineAddItemRow. Holds the module-selection
 * / contiguity / section logic + the "Available from" date. Extracted verbatim
 * from the pre-split inline-add.tsx — no behavior change.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FtModule } from "./types";

export interface FullTestSelection {
  fullTestSlug: string;
  setFullTestSlug: (slug: string) => void;
  ftModules: FtModule[];
  ftDeployed: Set<number>;
  ftOpensAt: string | null;
  setFtOpensAt: (v: string | null) => void;
  ftDeployedSorted: number[];
  ftContiguous: boolean;
  ftIsSubset: boolean;
  toggleFtModule: (position: number) => void;
  setFtBySection: (section: string | "all") => void;
  ftSections: string[];
  ftSectionActive: (section: string) => boolean;
}

export function useFullTestSelection(itemType: string): FullTestSelection {
  // Full-Test picker: the chosen slug.
  const [fullTestSlug, setFullTestSlug] = useState("");
  // Module selection for a Full-Test: the teacher picks WHICH modules to deploy
  // to this course (e.g. Reading & Writing only). Defaults to all modules. A
  // strict subset is persisted via set_test_module_windows (0144) after the
  // link is created. `ftModules` is the chosen test's module list.
  const [ftModules, setFtModules] = useState<FtModule[]>([]);
  const [ftDeployed, setFtDeployed] = useState<Set<number>>(new Set());
  // One "Available from" open date for the whole occurrence (NULL = open now),
  // written via set_module_open_date after the link is inserted.
  const [ftOpensAt, setFtOpensAt] = useState<string | null>(null);

  // Load the chosen test's modules so the teacher can pick a subset. Defaults
  // every module selected (= full test, no windows written).
  useEffect(() => {
    if (itemType !== "full_test" || !fullTestSlug) {
      setFtModules([]);
      setFtDeployed(new Set());
      return;
    }
    let alive = true;
    void (async () => {
      const { data: t } = await supabase
        .from("tests")
        .select("id")
        .eq("slug", fullTestSlug)
        .single();
      if (!alive) return;
      if (!t) {
        setFtModules([]);
        setFtDeployed(new Set());
        return;
      }
      const { data } = await supabase
        .from("test_modules")
        .select("position, section, label, time_limit_seconds, question_count")
        .eq("test_id", t.id)
        .order("position");
      if (!alive) return;
      const mods = (data ?? []) as FtModule[];
      setFtModules(mods);
      setFtDeployed(new Set(mods.map((m) => m.position)));
    })();
    return () => {
      alive = false;
    };
  }, [itemType, fullTestSlug]);

  // Deployed positions are valid only as a non-empty CONTIGUOUS range (the run
  // walks first→last; set_test_module_windows enforces this server-side too).
  const ftDeployedSorted = useMemo(
    () => [...ftDeployed].sort((a, b) => a - b),
    [ftDeployed],
  );
  const ftContiguous = useMemo(() => {
    if (ftDeployedSorted.length === 0) return false;
    return (
      ftDeployedSorted[ftDeployedSorted.length - 1] - ftDeployedSorted[0] + 1 ===
      ftDeployedSorted.length
    );
  }, [ftDeployedSorted]);
  const ftIsSubset = ftModules.length > 0 && ftDeployed.size < ftModules.length;
  const toggleFtModule = (position: number): void => {
    setFtDeployed((prev) => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });
  };
  const setFtBySection = (section: string | "all"): void => {
    if (section === "all") {
      setFtDeployed(new Set(ftModules.map((m) => m.position)));
    } else {
      setFtDeployed(
        new Set(ftModules.filter((m) => m.section === section).map((m) => m.position)),
      );
    }
  };
  const ftSections = useMemo(
    () => Array.from(new Set(ftModules.map((m) => m.section))),
    [ftModules],
  );
  const ftSectionActive = (section: string): boolean => {
    const ps = ftModules.filter((m) => m.section === section).map((m) => m.position);
    return ps.length > 0 && ps.length === ftDeployed.size && ps.every((p) => ftDeployed.has(p));
  };

  return {
    fullTestSlug,
    setFullTestSlug,
    ftModules,
    ftDeployed,
    ftOpensAt,
    setFtOpensAt,
    ftDeployedSorted,
    ftContiguous,
    ftIsSubset,
    toggleFtModule,
    setFtBySection,
    ftSections,
    ftSectionActive,
  };
}
