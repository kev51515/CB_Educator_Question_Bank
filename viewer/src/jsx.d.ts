/**
 * Global JSX namespace shim.
 *
 * Older React types exposed `JSX` as a global namespace. React 19 +
 * `verbatimModuleSyntax` requires `JSX` to come from `react`. Older code in
 * this repo still uses bare `JSX.Element`; this file maps that back onto the
 * React namespace so we don't have to touch every file.
 *
 * Long-term: prefer the explicit `React.JSX.Element` form in new code.
 */
import type { JSX as ReactJSX } from "react";

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
    type ElementClass = ReactJSX.ElementClass;
    type ElementAttributesProperty = ReactJSX.ElementAttributesProperty;
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute;
    interface IntrinsicAttributes extends ReactJSX.IntrinsicAttributes {}
    interface IntrinsicClassAttributes<T> extends ReactJSX.IntrinsicClassAttributes<T> {}
    type IntrinsicElements = ReactJSX.IntrinsicElements;
  }
}

export {};
