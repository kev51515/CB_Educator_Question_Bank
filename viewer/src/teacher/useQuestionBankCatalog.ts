/**
 * useQuestionBankCatalog
 * ======================
 * Lightweight loader for `/exports/catalog.json` — the static manifest of
 * pre-built CB question sets. The catalog is generated at build time and
 * served from `/viewer/public/exports/catalog.json`; from the running app
 * we fetch it once and cache it in a module-level singleton so opening
 * the Question Bank surface is instant after the first visit.
 *
 * No react-query intentionally — the data is a single static JSON blob,
 * never mutates at runtime, and we want zero additional dependencies for
 * a surface this simple. The singleton survives unmount/remount of the
 * page, which is what we want when navigating away and back.
 *
 * Entry shape mirrors `catalog.json` exactly — every field is taken from
 * the live file. Unknown future fields will simply pass through the type
 * unchecked, which is fine because the consumer only reads a known
 * subset.
 */
import { useEffect, useState } from "react";
import { qbankSetUid } from "@/lib/qbankSetUid";

export type CatalogAxis = "skill" | "domain" | "mixed";
export type CatalogSection = "math" | "reading-and-writing";
export type CatalogDifficulty = "easy" | "medium" | "hard";

export interface CatalogEntry {
  axis: CatalogAxis;
  section: CatalogSection;
  difficulty: CatalogDifficulty;
  setId: string;
  label: string;
  topic: string;
  questionCount: number;
  questionsHtml: string;
  keyHtml: string;
  questionsPdf?: string;
  questionsPdfSpaced?: string;
  keyPdf?: string;
}

interface CatalogPayload {
  generatedAt: string;
  entries: CatalogEntry[];
}

interface UseQuestionBankCatalog {
  catalog: CatalogEntry[];
  loading: boolean;
  error: string | null;
  /**
   * Force a re-fetch of the catalog. Nulls the module-level singleton so the
   * next `loadCatalog()` actually hits the network. Returns the new entries
   * (or throws — callers typically ignore the throw and read `error`).
   */
  refresh: () => Promise<void>;
}

// Module-level singleton — survives unmount/remount.
let cached: CatalogEntry[] | null = null;
let inflight: Promise<CatalogEntry[]> | null = null;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load question bank catalog.";
}

async function loadCatalog(): Promise<CatalogEntry[]> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async (): Promise<CatalogEntry[]> => {
    try {
      const response = await fetch("/exports/catalog.json", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(
          `Catalog request failed: ${response.status} ${response.statusText}`,
        );
      }
      const payload = (await response.json()) as CatalogPayload;
      const entries = Array.isArray(payload?.entries) ? payload.entries : [];
      cached = entries;
      return entries;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Derive the assignment's `qbank_set_uid` for a catalog entry.
 *
 * Delegates to the single canonical encoder in `@/lib/qbankSetUid` so the
 * teacher (writer) and the student runner (resolver) can never drift apart.
 * Kept as a thin re-export for existing call sites.
 */
export function catalogEntryUid(entry: CatalogEntry): string {
  return qbankSetUid(entry);
}

export function useQuestionBankCatalog(): UseQuestionBankCatalog {
  const [catalog, setCatalog] = useState<CatalogEntry[]>(() => cached ?? []);
  const [loading, setLoading] = useState<boolean>(() => cached === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (cached) {
      setCatalog(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void loadCatalog()
      .then((entries) => {
        if (cancelled) return;
        setCatalog(entries);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(getErrorMessage(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async (): Promise<void> => {
    // Invalidate the module-level singleton so the next load actually
    // re-fetches. Also null any in-flight promise to be safe.
    cached = null;
    inflight = null;
    setLoading(true);
    setError(null);
    try {
      const entries = await loadCatalog();
      setCatalog(entries);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return { catalog, loading, error, refresh };
}
