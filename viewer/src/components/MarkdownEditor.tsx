/**
 * MarkdownEditor (lazy wrapper)
 * ============================
 * The TipTap-based editor (@tiptap/* + prosemirror, ~67 KB gzip) is heavy and
 * only needed when an editor actually mounts — most surfaces never show one.
 * This wrapper React.lazy-loads the implementation (MarkdownEditorImpl) so those
 * deps land in their own async chunk instead of the main bundle. A lightweight
 * skeleton renders while the chunk loads.
 *
 * The Suspense boundary is co-located here so the ~22 call sites keep using
 * `<MarkdownEditor … />` with no changes. The props type is re-exported as a
 * type-only import (erased — does not pull the impl into the main chunk).
 */
import { lazy, Suspense } from "react";
import type { MarkdownEditorProps } from "./MarkdownEditorImpl";

export type { MarkdownEditorProps };

const MarkdownEditorImpl = lazy(() =>
  import("./MarkdownEditorImpl").then((m) => ({ default: m.MarkdownEditor })),
);

export function MarkdownEditor(props: MarkdownEditorProps): JSX.Element {
  const minHeight = props.minHeight ?? 160;
  return (
    <Suspense
      fallback={
        <div
          aria-busy="true"
          className="rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-900 animate-pulse"
          style={{ minHeight }}
        />
      }
    >
      <MarkdownEditorImpl {...props} />
    </Suspense>
  );
}
