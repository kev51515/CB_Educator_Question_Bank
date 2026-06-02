/**
 * Thin wrapper around MathJax SRE (Speech Rule Engine) for screen reader
 * narration of MathML. The actual MathJax library is loaded externally on
 * demand; this module gracefully falls back when it isn't available.
 */

interface MathJaxSre {
  toSpeech: (mathml: string) => string;
}

interface MathJaxGlobal {
  sre?: MathJaxSre;
}

declare global {
  interface Window {
    MathJax?: MathJaxGlobal;
  }
}

/**
 * Generate accessible speech text from a MathML element.
 *
 * Tries `window.MathJax.sre.toSpeech` first. If that isn't available (or
 * throws), falls back to the element's `alttext` attribute, then its plain
 * text content. Always returns a string (possibly empty).
 */
export function generateSpeech(mathElement: HTMLElement): string {
  try {
    const sre = window.MathJax?.sre;
    if (sre && typeof sre.toSpeech === "function") {
      const out = sre.toSpeech(mathElement.outerHTML);
      if (out && typeof out === "string") {
        return out;
      }
    }
  } catch {
    // Fall through to alt/text fallback.
  }

  const alt = mathElement.getAttribute("alttext");
  if (alt && alt.length > 0) {
    return alt;
  }

  return mathElement.textContent ?? "";
}

/**
 * Walk the container and inject `aria-label` attributes on every <math>
 * element with the generated speech text. Also sets `role="math"` to ensure
 * the element is exposed correctly to assistive technologies that don't yet
 * recognize native MathML.
 */
export function enhanceMathAccessibility(container: HTMLElement): void {
  const nodes = container.querySelectorAll<HTMLElement>("math");
  for (const node of Array.from(nodes)) {
    const speech = generateSpeech(node);
    if (speech.length > 0) {
      node.setAttribute("aria-label", speech);
    }
    node.setAttribute("role", "math");
  }
}
