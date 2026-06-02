"""Programmatic math-correctness audit for Set #1 clones.

Strategy:
  - Strip HTML/MathML from stem, normalize math notation.
  - Identify the question pattern (linear system, quadratic discriminant,
    polynomial equation, single-variable solve, etc.).
  - Use sympy to compute the answer independently.
  - Compare to the keyed answer; flag mismatches.

This is a *partial* auditor: it can confidently verify ~30-50% of math
questions whose stems match recognized patterns. Items that don't match
any pattern are reported as "unverifiable" rather than as errors.

Run: python scripts/audit_math.py [--set set-1] [--limit N]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import sympy as sp

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# ---------- text normalization ----------

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")

def _decode_html_entities(s: str) -> str:
    return (
        s.replace("&minus;", "-")
         .replace("&plus;", "+")
         .replace("&times;", "*")
         .replace("&divide;", "/")
         .replace("&ne;", "!=")
         .replace("&le;", "<=")
         .replace("&ge;", ">=")
         .replace("&lt;", "<")
         .replace("&gt;", ">")
         .replace("&amp;", "&")
         .replace("&nbsp;", " ")
         .replace("−", "-")  # unicode minus
         .replace("×", "*")  # multiplication sign
         .replace("·", "*")  # middle dot
         .replace("–", "-")  # en dash
         .replace("—", "-")  # em dash
    )

def _strip_mathml(s: str) -> str:
    """Replace MathML <math>...</math> with the alttext if any, else strip tags."""
    out = []
    i = 0
    while i < len(s):
        m = re.match(r"<math\b[^>]*>", s[i:])
        if m:
            end = s.find("</math>", i)
            if end < 0:
                out.append(s[i:])
                break
            block = s[i+m.end()-m.start(): end]
            # try alttext attr
            atag = re.search(r'alttext="([^"]+)"', s[i:i+m.end()-m.start()])
            if atag:
                out.append(atag.group(1))
            else:
                # crude: strip inner tags, take text
                out.append(_TAG_RE.sub("", block))
            i = end + len("</math>")
        else:
            out.append(s[i])
            i += 1
    return "".join(out)

def clean_text(s: str) -> str:
    s = _decode_html_entities(s)
    s = _strip_mathml(s)
    s = _TAG_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s

def normalize_math(s: str) -> str:
    """Make a stem string more amenable to regex math parsing."""
    s = clean_text(s)
    # Replace superscript digits e.g. x² → x^2
    sup_map = {"²": "^2", "³": "^3", "⁴": "^4", "⁵": "^5"}
    for k, v in sup_map.items():
        s = s.replace(k, v)
    # Strip "sup" remnants e.g. "x<sup>2</sup>" already handled by tag strip;
    # but "x ^ 2" sometimes appears: normalize whitespace around ^
    s = re.sub(r"\s*\^\s*", "^", s)
    # Implicit multiplication between number and variable: "2x" stays as is for sympy via parse_expr with transformations
    # Strip backslashes from latex remnants
    s = s.replace("\\", "")
    return s

# ---------- key extraction ----------

def keyed_value(q: dict) -> str | None:
    """Return the string representation of the keyed answer."""
    keys = q.get("keys") or []
    if not keys:
        return None
    k = keys[0]
    if q.get("type") == "mcq":
        # k is option id; resolve to text content
        for o in q.get("answerOptions") or []:
            if o.get("id") == k:
                return clean_text(o.get("content", ""))
        return None
    else:
        return str(k)

def parse_numeric(text: str) -> sp.Expr | None:
    """Try to interpret text as a number or simple expression."""
    if text is None:
        return None
    t = text.strip()
    t = t.replace(",", "")  # remove thousands separators
    # Handle fractions like "1369/100"
    if re.fullmatch(r"-?\d+/\d+", t):
        try:
            return sp.Rational(t)
        except Exception:
            return None
    # Handle decimals and integers
    try:
        return sp.nsimplify(sp.sympify(t))
    except Exception:
        return None

def value_matches(computed: sp.Expr, keyed: sp.Expr) -> bool:
    """Compare two sympy expressions tolerantly."""
    if computed is None or keyed is None:
        return False
    try:
        if sp.simplify(computed - keyed) == 0:
            return True
    except Exception:
        pass
    try:
        return abs(float(computed) - float(keyed)) < 1e-3
    except Exception:
        return False

# ---------- pattern matchers ----------

_IMPLICIT_MUL_RE = re.compile(r"(\d)([a-z])")

def _to_sympy(s: str):
    """Convert text like '2x+3y' to '2*x+3*y' before sympify."""
    return _IMPLICIT_MUL_RE.sub(r"\1*\2", s)

def _solve_eqs(eqs_text, var_letters="xy"):
    """Solve a list of equation strings in given variables."""
    syms = {c: sp.Symbol(c) for c in var_letters}
    py_eqs = []
    for s in eqs_text:
        if "=" not in s:
            return None
        lhs, rhs = s.split("=", 1)
        try:
            L = sp.sympify(_to_sympy(lhs), locals=syms)
            R = sp.sympify(_to_sympy(rhs), locals=syms)
            py_eqs.append(sp.Eq(L, R))
        except Exception:
            return None
    try:
        sol = sp.solve(py_eqs, list(syms.values()), dict=True)
        return sol, syms
    except Exception:
        return None

LINEAR_PAIR_RE = re.compile(r"([-+]?\d*\s*[a-z]\s*[-+]\s*\d*\s*[a-z]\s*=\s*-?\d+)")

def try_linear_system(stem: str, key: sp.Expr | None) -> tuple[str, str | None]:
    """Linear system: two equations like 'x + 3y = 9' and 'x - 3y = 3'. Question asks for x or y."""
    text = normalize_math(stem)
    # Skip if the stem contains fractions or division signs that would confuse our regex
    if "/" in text or "frac" in text.lower():
        return ("no_match", None)
    # Skip if there's an adjacent-digits pattern that suggests fraction-without-slash (e.g. "9 2 x" from "9/2 x")
    if re.search(r"\d\s+\d\s*[a-z]", text):
        return ("no_match", None)
    # Find equations of form "<terms> = <number>"
    eqs = re.findall(r"([\-\+]?\s*\d*\s*[a-z]\s*[\-\+]\s*\d*\s*[a-z]\s*=\s*[\-\+]?\d+)", text)
    eqs = [e.replace(" ", "") for e in eqs]
    # Heuristic: require exactly 2 equations and two variables
    if len(eqs) < 2:
        return ("no_match", None)
    # Detect variables used
    vars_used = set(re.findall(r"[a-z]", " ".join(eqs)))
    if len(vars_used) != 2:
        return ("no_match", None)
    var_list = sorted(vars_used)
    parse = _solve_eqs(eqs[:2], "".join(var_list))
    if not parse:
        return ("unparseable", None)
    sols, syms = parse
    if not sols:
        return ("unparseable", None)
    sol = sols[0]
    # What does the question ask?
    # "value of x", "value of y", "value of x + y", "x - y", etc.
    qm = re.search(r"value of\s+([a-z](?:\s*[\+\-]\s*[a-z])?)", text, re.I)
    if not qm:
        # could be "what is x?" pattern
        qm = re.search(r"what is\s+([a-z](?:\s*[\+\-]\s*[a-z])?)", text, re.I)
    if not qm:
        return ("no_target", None)
    target = qm.group(1).replace(" ", "")
    try:
        # Insert * between adjacent letters for product targets like "ab"
        target_for_parse = re.sub(r"([a-z])([a-z])", r"\1*\2", target)
        target_expr = sp.sympify(target_for_parse, locals=syms)
        result = target_expr.subs(sol)
    except Exception:
        return ("unparseable", None)
    # If result still has free symbols, we couldn't fully resolve — unverifiable
    if result.free_symbols:
        return ("unparseable", None)
    if key is None:
        return ("no_key", None)
    if value_matches(result, key):
        return ("ok", str(result))
    return ("mismatch", f"computed={result} keyed={key}")

DISCRIMINANT_NEG_RE = re.compile(
    r"([\+\-]?\s*\d*)\s*([a-z])\s*\^?2?\s*\+\s*([a-z])\s*[\*]?\s*([a-z])\s*([\+\-])\s*(\d+)\s*=\s*0",
)

def try_discriminant_no_real(stem: str, key: sp.Expr | None) -> tuple[str, str | None]:
    """Pattern: ax² + bx + c = 0 with a,c known, b positive integer, no real solution, greatest b."""
    text = normalize_math(stem)
    if "no real" not in text.lower() or "greatest" not in text.lower():
        return ("no_match", None)
    # Find quadratic of form: A x^2 + b x + C = 0 (with A,C numeric, b variable)
    m = re.search(r"([\-\+]?\s*\d*)\s*\*?\s*([a-z])\^2\s*\+\s*([a-z])\s*\*?\s*([a-z])\s*([\+\-])\s*(\d+)\s*=\s*0", text)
    if not m:
        # alt: -x^2 + bx - 324 = 0 ; A may be "-"
        m = re.search(r"([\-\+])\s*([a-z])\^2\s*\+\s*([a-z])\s*\*?\s*([a-z])\s*([\+\-])\s*(\d+)\s*=\s*0", text)
        if not m:
            return ("no_match", None)
        a_str, var_sq, b_var, x_var, c_sign, c_val = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5), m.group(6)
        A = -1 if a_str == "-" else 1
    else:
        A_str, var_sq, b_var, x_var, c_sign, c_val = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5), m.group(6)
        A_str = A_str.replace(" ", "")
        A = -1 if A_str == "-" else (1 if A_str in ("", "+") else int(A_str))
    if var_sq != x_var:
        return ("no_match", None)
    C = int(c_val) * (-1 if c_sign == "-" else 1)
    # Discriminant b^2 - 4AC < 0  →  b^2 < 4AC  →  |b| < sqrt(4AC)
    # Greatest positive integer b with b^2 < 4AC.
    disc_bound = 4 * A * C
    if disc_bound <= 0:
        return ("no_match", None)  # can't have b² < non-positive
    import math
    b_max = math.isqrt(disc_bound - 1)  # largest int with b² < 4AC
    if key is None:
        return ("no_key", None)
    if value_matches(sp.Integer(b_max), key):
        return ("ok", str(b_max))
    return ("mismatch", f"computed_b_max={b_max} keyed={key}")

def try_difference_of_squares(stem: str, opts: list[dict], key_id: str | None) -> tuple[str, str | None]:
    """Pattern: 'equivalent to t² - K' with factor choices. Check that key choice equals expansion."""
    text = normalize_math(stem)
    m = re.search(r"equivalent to\s+([a-z])\^2\s*-\s*(\d+)", text, re.I)
    if not m:
        return ("no_match", None)
    var = m.group(1)
    K = int(m.group(2))
    # Check the keyed option
    if not key_id or not opts:
        return ("no_key", None)
    for o in opts:
        if o.get("id") == key_id:
            content = clean_text(o.get("content", ""))
            # Expand keyed expression and compare to var^2 - K
            try:
                expr = sp.sympify(content.replace("√", "sqrt"))
                target = sp.Symbol(var)**2 - K
                if sp.simplify(sp.expand(expr) - target) == 0:
                    return ("ok", content)
                return ("mismatch", f"keyed_expansion={sp.expand(expr)} target={target}")
            except Exception:
                return ("unparseable", content)
    return ("no_match", None)

# ---------- driver ----------

def audit(set_dir: Path, limit: int | None = None) -> int:
    files = sorted(set_dir.glob("**/*-s1.json"))
    if limit:
        files = files[:limit]
    stats = {
        "checked": 0,
        "ok": 0,
        "mismatch": 0,
        "unverifiable": 0,
    }
    mismatches = []
    for fp in files:
        try:
            q = json.load(open(fp))
        except Exception:
            continue
        if q.get("section") != "Math":
            continue
        stats["checked"] += 1
        stem = q.get("stem") or ""
        opts = q.get("answerOptions") or []
        keys = q.get("keys") or []
        key_id = keys[0] if keys else None
        key_text = keyed_value(q)
        key_expr = parse_numeric(key_text) if key_text else None

        verdict = None
        for matcher in (
            ("linear_system", lambda: try_linear_system(stem, key_expr)),
            ("discriminant_neg", lambda: try_discriminant_no_real(stem, key_expr)),
            ("diff_of_squares", lambda: try_difference_of_squares(stem, opts, key_id)),
        ):
            name, fn = matcher
            res, detail = fn()
            if res == "ok":
                verdict = ("ok", name, detail)
                stats["ok"] += 1
                break
            if res == "mismatch":
                verdict = ("mismatch", name, detail)
                stats["mismatch"] += 1
                mismatches.append((q["questionId"], name, detail))
                break
            if res in ("unparseable", "no_key", "no_target"):
                # bookkeeping but keep trying other patterns
                continue
        if verdict is None:
            stats["unverifiable"] += 1

    print(f"Math clones checked: {stats['checked']}")
    print(f"  Verified OK: {stats['ok']}")
    print(f"  MISMATCHES:  {stats['mismatch']}")
    print(f"  Unverifiable (pattern not matched): {stats['unverifiable']}")
    if mismatches:
        print("\nMismatches:")
        for cid, pattern, detail in mismatches[:50]:
            print(f"  {cid}  [{pattern}]  {detail}")
    return 0 if stats["mismatch"] == 0 else 1

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--set", default="set-1")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    set_dir = DATA / "sets" / args.set / "json"
    if not set_dir.exists():
        print(f"FAIL: {set_dir} missing", file=sys.stderr)
        return 2
    return audit(set_dir, args.limit)

if __name__ == "__main__":
    sys.exit(main())
