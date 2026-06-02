/**
 * Aspects catalog loader.
 *
 * The aspects catalog is a runtime-fetched JSON file
 * (`/data/aspects/catalog.json`) that enumerates every globally-unique aspect
 * slug, its human-readable label, and the skill / domain / section it belongs
 * to. Per-question `aspects: string[]` slugs on `IndexEntry` reference this
 * catalog.
 *
 * The build step that generates this file is in flight and may not yet exist.
 * `loadAspectCatalog()` therefore must degrade gracefully — returning `[]` on
 * 404 or parse error so consumers (the Aspects panel in `SidebarV2`) can hide
 * the row instead of erroring.
 *
 * The fetch is memoised at module scope so multiple consumers share one
 * network request.
 */
import type { AspectCatalogEntry } from "@/types";

interface AspectCatalogFile {
  version: number;
  aspects: AspectCatalogEntry[];
}

let cachedPromise: Promise<AspectCatalogEntry[]> | null = null;

const CATALOG_URL = "/data/aspects/catalog.json";

function devLog(message: string, error: unknown): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[aspects] ${message}`, error);
  }
}

async function fetchCatalog(): Promise<AspectCatalogEntry[]> {
  try {
    const res = await fetch(CATALOG_URL, { cache: "no-cache" });
    if (!res.ok) {
      // 404 is the expected "catalog not yet generated" path — silent in prod.
      if (res.status !== 404) {
        devLog(`fetch failed with HTTP ${res.status}`, null);
      }
      return [];
    }
    const data = (await res.json()) as Partial<AspectCatalogFile>;
    if (!data || !Array.isArray(data.aspects)) {
      devLog("catalog JSON missing 'aspects' array", data);
      return [];
    }
    return data.aspects;
  } catch (err: unknown) {
    devLog("failed to load catalog", err);
    return [];
  }
}

/**
 * Load and return the aspects catalog. Returns `[]` if the file is absent or
 * malformed. The result is cached for the lifetime of the page — subsequent
 * callers share the same in-flight promise.
 */
export function loadAspectCatalog(): Promise<AspectCatalogEntry[]> {
  if (!cachedPromise) {
    cachedPromise = fetchCatalog();
  }
  return cachedPromise;
}

/**
 * Test-only: reset the memoised promise. Not exported from a barrel.
 */
export function __resetAspectCatalogCache(): void {
  cachedPromise = null;
}
