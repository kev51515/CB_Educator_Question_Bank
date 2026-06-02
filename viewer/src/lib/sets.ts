/**
 * Set metadata + data-base resolution.
 *
 * Every question lives under one of:
 *   - `/data/json/...`         (the original College Board scrape)
 *   - `/data/sets/<setId>/...` (a generated parallel form, e.g. set-1)
 *
 * The viewer can switch sets at runtime via the sidebar pill switcher.
 * When you add a new set:
 *   1. Build its data tree under `/data/sets/<id>/`
 *   2. Append it to `AVAILABLE_SETS` below
 */

/** Resolve the data-base URL prefix for a given setId. */
export function baseForSet(setId: string): string {
  return setId ? `/data/sets/${setId}` : "/data";
}

/** Sets shown in the viewer's switcher, in display order. */
export const AVAILABLE_SETS: { id: string; label: string }[] = [
  { id: "", label: "All Questions" },
  { id: "set-1", label: "Print Set 1" },
];
