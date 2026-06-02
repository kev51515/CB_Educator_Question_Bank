/**
 * RichText — render either plain text or HTML markup safely.
 *
 * CB content includes inline SVG figures and MathML and must be injected as
 * HTML. SAT content is plain text but may contain LaTeX-style math delimited
 * by `$...$` (inline) or `$$...$$` (display). When such math is present we
 * typeset it with KaTeX; otherwise the text is rendered verbatim with
 * newlines preserved.
 */
import katex from "katex";
import "katex/dist/katex.min.css";

interface RichTextProps {
  text: string;
  isHtml: boolean;
  className?: string;
  /** `block` (default) renders a div; `inline` renders a span. */
  as?: "block" | "inline";
}

type Segment =
  | { type: "text"; content: string }
  | { type: "inline"; content: string }
  | { type: "display"; content: string };

/**
 * Heuristic: decide whether the content between `$...$` looks like math.
 *
 * Real SAT prompts contain dollar amounts (e.g. "costs $50 each") where the
 * second `$` may be far away or absent. Without a heuristic those dollar
 * signs would either be silently swallowed or render as KaTeX errors.
 *
 * We only enter inline-math mode if the candidate contains at least one of:
 *   - `^` or `_` (super/subscripts)
 *   - `\` (LaTeX command)
 *   - `=` (equation)
 *   - a digit AND a letter (e.g. `2x`, `x2`)
 *   - a single-letter variable surrounded by operators
 *
 * Display math (`$$...$$`) is treated as math unconditionally since SAT
 * content does not use `$$` for non-math purposes.
 */
function looksLikeMath(content: string): boolean {
  if (content.length === 0) return false;
  if (/[\^_\\=]/.test(content)) return true;
  // digit+letter or letter+digit (variable next to coefficient)
  if (/\d[a-zA-Z]|[a-zA-Z]\d/.test(content)) return true;
  // operators with single-letter variables: e.g. "x+y", "a-b"
  if (/[a-zA-Z]\s*[+\-*/]\s*[a-zA-Z0-9]/.test(content)) return true;
  return false;
}

/**
 * Walk the source string once and split it into text/inline/display segments.
 *
 * Algorithm:
 *   1. Scan character by character.
 *   2. `\$` is treated as a literal `$` (escaped).
 *   3. `$$` starts a display-math block; the next `$$` closes it. If no
 *      close is found, the `$$` is emitted as literal text.
 *   4. `$` starts an inline-math candidate; the next `$` closes it. If the
 *      content does not look like math (see `looksLikeMath`) or no close
 *      is found, the `$` is emitted as literal text.
 */
function parseSegments(input: string): Segment[] {
  const segments: Segment[] = [];
  let buf = "";
  let i = 0;
  const flushText = () => {
    if (buf.length > 0) {
      segments.push({ type: "text", content: buf });
      buf = "";
    }
  };

  while (i < input.length) {
    const ch = input[i];

    // Escaped dollar sign: literal $
    if (ch === "\\" && input[i + 1] === "$") {
      buf += "$";
      i += 2;
      continue;
    }

    // Display math: $$...$$
    if (ch === "$" && input[i + 1] === "$") {
      const close = input.indexOf("$$", i + 2);
      if (close === -1) {
        // No closing $$ — treat as literal
        buf += "$$";
        i += 2;
        continue;
      }
      const content = input.slice(i + 2, close);
      if (content.length === 0) {
        // Empty $$ $$ — skip entirely
        i = close + 2;
        continue;
      }
      flushText();
      segments.push({ type: "display", content });
      i = close + 2;
      continue;
    }

    // Inline math: $...$
    if (ch === "$") {
      // Find the next unescaped $
      let close = -1;
      let j = i + 1;
      while (j < input.length) {
        if (input[j] === "\\" && input[j + 1] === "$") {
          j += 2;
          continue;
        }
        if (input[j] === "$") {
          close = j;
          break;
        }
        j += 1;
      }
      if (close === -1) {
        // No closing $ — literal
        buf += "$";
        i += 1;
        continue;
      }
      const content = input.slice(i + 1, close);
      if (!looksLikeMath(content)) {
        // Looks like a dollar amount or non-math; emit literal $ and resume
        buf += "$";
        i += 1;
        continue;
      }
      flushText();
      segments.push({ type: "inline", content });
      i = close + 1;
      continue;
    }

    buf += ch;
    i += 1;
  }

  flushText();
  return segments;
}

function renderMath(content: string, displayMode: boolean): string {
  return katex.renderToString(content, {
    throwOnError: false,
    displayMode,
  });
}

interface MathTextProps {
  text: string;
  className?: string;
  as: "block" | "inline";
}

function MathText({ text, className, as }: MathTextProps) {
  const segments = parseSegments(text);

  // Fast path: if no math segments, render plain text (preserves the prior
  // behaviour exactly so we don't regress non-math SAT prompts).
  const hasMath = segments.some((s) => s.type !== "text");
  if (!hasMath) {
    if (as === "inline") {
      return <span className={className}>{text}</span>;
    }
    return <div className={`whitespace-pre-wrap ${className ?? ""}`}>{text}</div>;
  }

  const children = segments.map((seg, idx) => {
    if (seg.type === "text") {
      return <span key={idx} className="whitespace-pre-wrap">{seg.content}</span>;
    }
    if (seg.type === "inline") {
      return (
        <span
          key={idx}
          dangerouslySetInnerHTML={{ __html: renderMath(seg.content, false) }}
        />
      );
    }
    // display
    return (
      <div
        key={idx}
        className="katex-display"
        dangerouslySetInnerHTML={{ __html: renderMath(seg.content, true) }}
      />
    );
  });

  if (as === "inline") {
    return <span className={className}>{children}</span>;
  }
  return <div className={className}>{children}</div>;
}

export function RichText({ text, isHtml, className, as = "block" }: RichTextProps) {
  if (isHtml) {
    if (as === "inline") {
      return <span className={className} dangerouslySetInnerHTML={{ __html: text }} />;
    }
    return <div className={className} dangerouslySetInnerHTML={{ __html: text }} />;
  }
  return <MathText text={text} className={className} as={as} />;
}
