/* ─────────────────────────── small helpers ────────────────────────────── */

export function omitKey<T extends Record<string, unknown>>(obj: T, key: string): T {
  const next = { ...obj };
  delete next[key];
  return next as T;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

export function ciHas(list: string[], target: string): boolean {
  const low = target.toLowerCase();
  return list.some((v) => v.toLowerCase() === low);
}
