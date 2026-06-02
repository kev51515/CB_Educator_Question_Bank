export type SubView = "template" | "overview";

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

// -----------------------------------------------------------------------------
// localStorage helpers for sub-view tab persistence. Per-course so each
// course remembers whether the teacher was last on Template or Overview.
// (Per-node collapse state helpers live in PortfolioItemNode.tsx since they
// belong to the tree concern.) Try/catch each access — Safari private mode
// throws on localStorage access.
// -----------------------------------------------------------------------------

const subViewKey = (courseId: string): string =>
  `portfolio-subview:${courseId}`;

export function readSubView(courseId: string): SubView {
  try {
    const raw = window.localStorage.getItem(subViewKey(courseId));
    if (raw === "template" || raw === "overview") return raw;
  } catch {
    /* localStorage unavailable */
  }
  return "template";
}

export function writeSubView(courseId: string, value: SubView): void {
  try {
    window.localStorage.setItem(subViewKey(courseId), value);
  } catch {
    /* ignore */
  }
}
