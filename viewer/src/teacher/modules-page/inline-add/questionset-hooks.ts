/**
 * modules-page/inline-add/questionset-hooks
 * =========================================
 * Question-Set picker state hook for InlineAddItemRow. Holds the catalog
 * filter/title-sync state + the derived sorted/filtered catalog list.
 * Extracted verbatim from the pre-split inline-add.tsx — no behavior change.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  catalogEntryUid,
  useQuestionBankCatalog,
  type CatalogEntry,
} from "@/teacher/useQuestionBankCatalog";
import {
  readQbankLastFilter,
  writeQbankLastFilter,
  type QbankSectionFilter,
  type QbankDifficultyFilter,
} from "../persistence";

export interface CatalogOption {
  entry: CatalogEntry;
  uid: string;
}

export interface QuestionSetSelection {
  catalogLoading: boolean;
  catalogError: string | null;
  refreshCatalog: () => Promise<void>;
  catalogOptions: CatalogOption[];
  psSetUid: string;
  setPsSetUid: (v: string) => void;
  psTitle: string;
  setPsTitle: (v: string) => void;
  psTitleDirty: boolean;
  setPsTitleDirty: (v: boolean) => void;
  psDueAt: string | null;
  setPsDueAt: (v: string | null) => void;
  psSectionFilter: QbankSectionFilter;
  setPsSectionFilter: (v: QbankSectionFilter) => void;
  psDifficultyFilter: QbankDifficultyFilter;
  setPsDifficultyFilter: (v: QbankDifficultyFilter) => void;
  psQuery: string;
  setPsQuery: (v: string) => void;
  psHighlightIdx: number;
  setPsHighlightIdx: React.Dispatch<React.SetStateAction<number>>;
  psListRef: React.MutableRefObject<HTMLDivElement | null>;
  filteredCatalog: CatalogOption[];
}

export function useQuestionSetSelection(): QuestionSetSelection {
  const {
    catalog: qbankCatalog,
    loading: catalogLoading,
    error: catalogError,
    refresh: refreshCatalog,
  } = useQuestionBankCatalog();

  // Question Set fields. time_limit was removed in the workflow-audit
  // cleanup — it's computed from the catalog entry's questionCount at
  // INSERT time.
  const [psSetUid, setPsSetUid] = useState<string>("");
  const [psTitle, setPsTitle] = useState<string>("");
  const [psDueAt, setPsDueAt] = useState<string | null>(null);

  // Question Set picker — filterable list state.
  const initialFilter = readQbankLastFilter();
  const [psSectionFilter, setPsSectionFilter] =
    useState<QbankSectionFilter>(initialFilter.section);
  const [psDifficultyFilter, setPsDifficultyFilter] =
    useState<QbankDifficultyFilter>(initialFilter.difficulty);
  const [psQuery, setPsQuery] = useState<string>("");
  const [psHighlightIdx, setPsHighlightIdx] = useState<number>(0);
  const psListRef = useRef<HTMLDivElement | null>(null);

  // Persist filter selections.
  useEffect(() => {
    writeQbankLastFilter({ section: psSectionFilter, difficulty: psDifficultyFilter });
  }, [psSectionFilter, psDifficultyFilter]);

  // Stable catalog list, sorted for a predictable picker order:
  // section → difficulty → label.
  const catalogOptions = useMemo(() => {
    const difficultyRank: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
    return [...qbankCatalog]
      .map((entry) => ({
        entry,
        uid: catalogEntryUid(entry),
      }))
      .sort((a, b) => {
        if (a.entry.section !== b.entry.section) {
          return a.entry.section.localeCompare(b.entry.section);
        }
        const da = difficultyRank[a.entry.difficulty] ?? 99;
        const db = difficultyRank[b.entry.difficulty] ?? 99;
        if (da !== db) return da - db;
        return a.entry.label.localeCompare(b.entry.label);
      });
  }, [qbankCatalog]);

  // Keep the Question Set title in sync with the chosen catalog entry until
  // the teacher edits it manually.
  const [psTitleDirty, setPsTitleDirty] = useState(false);
  useEffect(() => {
    if (psTitleDirty) return;
    if (!psSetUid) {
      setPsTitle("");
      return;
    }
    const chosen = catalogOptions.find((opt) => opt.uid === psSetUid);
    setPsTitle(chosen ? chosen.entry.label : "");
  }, [psSetUid, catalogOptions, psTitleDirty]);

  // Filtered Question Set catalog (2d).
  const filteredCatalog = useMemo(() => {
    const q = psQuery.trim().toLowerCase();
    return catalogOptions.filter(({ entry }) => {
      if (psSectionFilter !== "all" && entry.section !== psSectionFilter) return false;
      if (psDifficultyFilter !== "all" && entry.difficulty !== psDifficultyFilter) return false;
      if (!q) return true;
      const hay = `${entry.label} ${entry.topic} ${entry.section} ${entry.difficulty}`.toLowerCase();
      return hay.includes(q);
    });
  }, [catalogOptions, psQuery, psSectionFilter, psDifficultyFilter]);

  // Reset highlighted row when filter narrows.
  useEffect(() => {
    setPsHighlightIdx(0);
  }, [psQuery, psSectionFilter, psDifficultyFilter]);

  return {
    catalogLoading,
    catalogError,
    refreshCatalog,
    catalogOptions,
    psSetUid,
    setPsSetUid,
    psTitle,
    setPsTitle,
    psTitleDirty,
    setPsTitleDirty,
    psDueAt,
    setPsDueAt,
    psSectionFilter,
    setPsSectionFilter,
    psDifficultyFilter,
    setPsDifficultyFilter,
    psQuery,
    setPsQuery,
    psHighlightIdx,
    setPsHighlightIdx,
    psListRef,
    filteredCatalog,
  };
}
