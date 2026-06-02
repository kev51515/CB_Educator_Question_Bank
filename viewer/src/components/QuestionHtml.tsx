/**
 * QuestionHtml
 * ============
 * Trusted-HTML renderer used throughout the question detail surface.
 *
 * Renders College Board question content (stem, stimulus, MCQ options,
 * rationale fragments) via `dangerouslySetInnerHTML`. The content is trusted
 * (it ships with the data file) and MathML must survive intact — which is
 * why we don't sanitise here.
 *
 * Side effects applied after mount, scoped to the rendered subtree:
 *   - Adds `loading="lazy"` and `decoding="async"` to any `<img>`.
 *   - Ensures every `<img>` has at least an empty `alt` attribute (a11y).
 *   - Forces external links to open in a new tab with `rel="noopener noreferrer"`.
 *
 * Extracted from Detail so sibling components (AnswerOptions, RationaleBlock,
 * etc.) can share the exact same image/link-safety behavior.
 */
import { useEffect, useRef } from "react";

interface QuestionHtmlProps {
  /** Trusted HTML payload. May contain MathML. */
  html: string;
  /** Optional extra className appended after the default `q-html`. */
  className?: string;
}

export function QuestionHtml({ html, className }: QuestionHtmlProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Lazy-load images and add basic safety attrs after the HTML mounts.
  useEffect(() => {
    if (!ref.current) return;
    for (const img of ref.current.querySelectorAll("img")) {
      img.loading = "lazy";
      img.decoding = "async";
      if (!img.getAttribute("alt")) img.setAttribute("alt", "");
    }
    // Open external links in a new tab safely
    for (const a of ref.current.querySelectorAll("a")) {
      if (a.getAttribute("target") !== "_blank") {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      }
    }
    // Inline-math reflow: the source HTML often wraps a single inline
    // `<math>` in its own `<p>`, producing awkward line breaks like
    //   The expression above is equivalent to
    //   ax² + bx + c
    //   , where a, b, and c are constants.
    // Merge those math-only paragraphs into the previous (and, when
    // present, next) sibling `<p>` so the sentence reads as one line.
    // Skip display="block" math — those are intentionally block-level.
    const paragraphs = Array.from(ref.current.querySelectorAll("p"));
    for (const p of paragraphs) {
      if (p.childElementCount !== 1) continue;
      const only = p.firstElementChild;
      if (!only || only.tagName.toLowerCase() !== "math") continue;
      if (only.getAttribute("display") === "block") continue;
      if ((p.textContent ?? "").trim() !== (only.textContent ?? "").trim()) continue;

      const prev = p.previousElementSibling;
      const next = p.nextElementSibling;
      if (!prev || prev.tagName.toLowerCase() !== "p") continue;

      prev.appendChild(document.createTextNode(" "));
      prev.appendChild(only);
      if (next && next.tagName.toLowerCase() === "p") {
        while (next.firstChild) prev.appendChild(next.firstChild);
        next.remove();
      }
      p.remove();
    }
  }, [html]);
  return (
    <div
      ref={ref}
      className={"q-html " + (className ?? "")}
      // Trusted content from College Board; MathML must survive intact.
      dangerouslySetInnerHTML={{ __html: html || "" }}
    />
  );
}
