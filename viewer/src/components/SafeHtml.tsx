/**
 * SafeHtml
 * ========
 * Render a string of HTML safely via DOMPurify. Used for content produced by
 * the MarkdownEditor (TipTap) — which already emits safe HTML, but defense
 * in depth matters. NEVER bypass this component for user-authored content.
 *
 * Allowed tags align with TipTap StarterKit + extension-link output:
 * paragraphs, headings, lists, code, blockquote, hr, br, strong, em, a, code.
 * Links open in a new tab with rel=noopener noreferrer.
 */
import DOMPurify from "dompurify";
import { useMemo } from "react";

const ALLOWED_TAGS = [
  "p", "br", "hr",
  "h1", "h2", "h3", "h4",
  "strong", "em", "u", "s",
  "ul", "ol", "li",
  "blockquote",
  "code", "pre",
  "a",
];

const ALLOWED_ATTR = ["href", "target", "rel", "class"];

// Register the link-hardening hook ONCE at module load. DOMPurify hooks are
// global; registering inside the component would re-add the hook on every
// render. Forcing target=_blank + rel=noopener noreferrer on every <a> closes
// the tab-nabbing vector even if user content tries to opt out.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

interface SafeHtmlProps {
  html: string;
  className?: string;
}

export function SafeHtml({ html, className }: SafeHtmlProps) {
  const clean = useMemo(() => {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      // Force every anchor to a safe target.
      ADD_ATTR: ["target", "rel"],
    });
  }, [html]);

  return (
    <div
      className={className ?? "prose prose-sm dark:prose-invert max-w-none"}
      // eslint-disable-next-line react/no-danger -- sanitized via DOMPurify above
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
