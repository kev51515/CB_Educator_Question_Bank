/**
 * Tiny typed fetch helper.
 *
 * Use it whenever you load JSON from the viewer's data tree under `/data`.
 * Throws an `Error` with the HTTP status on a non-2xx response so callers
 * can surface a user-visible error message.
 */
export function fetchJson<T>(url: string): Promise<T> {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<T>;
  });
}
