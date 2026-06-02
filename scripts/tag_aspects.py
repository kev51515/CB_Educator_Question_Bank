#!/usr/bin/env python3
"""
Deterministic aspect tagger for SAT question bank.

Reads cluster specs from /tmp/aspects/FINAL/{math-A,math-B,rw}.md (informational only)
and applies hand-encoded heuristics to assign one aspect slug per question.

Outputs:
- data/aspects/aspects.json    -> { version, generatedAt, byId: { id: [slug,...] } }
- data/aspects/catalog.json    -> { version, aspects: [ { slug, label, skill, domain, section, count } ] }
- data/aspects/REPORT.md       -> coverage + spot-checks + dead rules
- viewer/dist/data/index.json  -> mutated in place to add `aspects: [slug,...]` per entry
- viewer/dist/data/index.json.bak -> backup of original

Usage:
    python3 scripts/tag_aspects.py
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
import time
import random
from collections import Counter, OrderedDict  # noqa: F401
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Callable, Dict, List, Optional, Tuple

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INDEX_PATH = os.path.join(REPO_ROOT, "viewer", "dist", "data", "index.json")
ASPECTS_DIR = os.path.join(REPO_ROOT, "data", "aspects")
DATA_JSON_ROOT = os.path.join(REPO_ROOT, "data")  # path field already starts with "json/..."

# ----------------------------------------------------------------------------
# Catalog: ordered (skill, [(slug, label), ...]) per FINAL spec.
# Order matters: first-match-wins within a skill.
# ----------------------------------------------------------------------------

# (skill_normalized, domain, section) -> ordered list of (slug, label, predicate)
# Skill names in the index sometimes have trailing whitespace; we .strip() everywhere.

CATALOG: "OrderedDict[str, List[Tuple[str, str, Callable]]]" = OrderedDict()
SKILL_META: Dict[str, Tuple[str, str]] = {}  # skill -> (domain, section)


def html_strip(s: str) -> str:
    if not s:
        return ""
    out = re.sub(r"<[^>]+>", " ", s)
    out = (
        out.replace("&nbsp;", " ")
        .replace("&ndash;", "-")
        .replace("&mdash;", "-")
        .replace("&ldquo;", '"')
        .replace("&rdquo;", '"')
        .replace("&lsquo;", "'")
        .replace("&rsquo;", "'")
        .replace("&hellip;", "...")
        .replace("&amp;", "&")
    )
    out = re.sub(r"\s+", " ", out).strip()
    return out


def best_answer_sentence(rationale_text: str) -> str:
    """Isolate the sentence that begins with 'Choice X is the best answer...'."""
    if not rationale_text:
        return ""
    m = re.search(
        r"Choice\s+[A-D]\s+is\s+the\s+best\s+answer\.?(.*?)(?=Choice\s+[A-D]\s+is\s+(?:the\s+best\s+answer|incorrect)|$)",
        rationale_text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if m:
        return m.group(0)
    # Fallback: take first ~400 chars of rationale.
    return rationale_text[:400]


def correct_answer_texts(question: dict) -> List[str]:
    keys = set(question.get("keys") or [])
    out: List[str] = []
    for opt in question.get("answerOptions") or []:
        if opt.get("id") in keys:
            txt = html_strip(opt.get("content") or "")
            if txt:
                out.append(txt)
    return out


# ----------------------------------------------------------------------------
# Helpers for predicate writing. Each predicate gets a `ctx` dict with:
#   ctx['blob']          : lowercased searchText (stem + rationale, MathML-stripped to alttext words)
#   ctx['stem_text']     : lowercased plain text of stem
#   ctx['stem_raw']      : raw stem HTML (lowercased)
#   ctx['rationale_text']: lowercased plain text of full rationale
#   ctx['rationale_raw'] : raw rationale HTML (lowercased)
#   ctx['best_sentence'] : lowercased text of "Choice X is the best answer..." sentence
#   ctx['answer_text']   : lowercased plain text of all correct answers, joined
#   ctx['answer_raw']    : raw HTML of all correct answers concatenated (lowercased)
#   ctx['qtype']         : 'mcq' or 'spr'
# ----------------------------------------------------------------------------


def any_in(text: str, needles) -> bool:
    return any(n in text for n in needles)


def any_re(text: str, patterns) -> bool:
    return any(re.search(p, text) for p in patterns)


# ----------------------------------------------------------------------------
# MATH BATCH A
# ----------------------------------------------------------------------------

# Skill: Advanced Math :: Equivalent expressions
def _eq_radicals(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["square root", "cube root", "startroot", "rootindex", "superscript one-half",
                     "superscript one third", "superscript two thirds", "raised to the one-half",
                     "raised to the power", "rational exponent"]):
        return True
    if "to the start" in blob and "endfraction" in blob:
        return True
    # A24 widen: product-of-powers / quotient-of-powers stems (1be909aa
    # h^15·q^7 / h^5·q^21; f5c3e3b8 m^4 q^4 z^-1 · m q^5 z^3; 89fc23af).
    # Stem contains "Superscript" and multiple variable bases and asks
    # "equivalent". Skip cases where the stem also distributes a factor
    # across a sum (d9137a84 is a distribution problem).
    if "superscript" in blob and "equivalent" in blob:
        var_count = sum(1 for v in ("h superscript", "q superscript",
                                     "m superscript", "n superscript",
                                     "p superscript", "y superscript",
                                     "z superscript", "x superscript",
                                     "a superscript", "b superscript",
                                     "k superscript") if v in blob)
        # Distribution cue: "the product of (...) and (...) + (...)"
        is_distribution = (
            "product of" in blob and any_in(blob, ["plus", "minus"])
            and re.search(r"baseline\s+(?:plus|minus)\s+", blob))
        if var_count >= 2 and not is_distribution:
            return True
    # A24 widen: product expansions like "(8yz)(y)(7z)" — at least three
    # consecutive parenthesised factor groups + "equivalent". Excludes cases
    # where one of the groups contains a "+" / "minus" (distribution) —
    # d9137a84 is `(x^-6 y^3 z^5)(x^4 z^5 + y^8 z^-7)` which is distribution.
    if "equivalent" in blob and any_in(blob, [
            "which expression is equivalent",
            "which of the following is equivalent",
            "which of the following expressions is equivalent"]):
        # Look for adjacent paren groups: "right parenthesis left parenthesis"
        # appearing TWICE (i.e. three factors in a row).
        adj_count = blob.count("right parenthesis left parenthesis")
        if adj_count >= 2:
            # Skip if any paren group contains a sum/difference
            # (= distribution; d9137a84).
            if not re.search(r"left\s+parenthesis[^()]*?(?:\s+plus\s+|\s+minus\s+)[^()]*?right\s+parenthesis", blob):
                return True
    return False

def _eq_rational(ctx):
    blob = ctx["blob"]
    if "common denominator" in blob or "factoring the denominator" in blob:
        return True
    if any_in(blob, ["startfraction", "endfraction"]) and re.search(r"over[^.,!?]{0,30}x", blob):
        return True
    if re.search(r"x\s+(?:is\s+not\s+equal|does\s+not\s+equal|≠|cannot\s+equal)\s+to", blob):
        return True
    # A24-spillover widen: rational-expression rewrite where the rationale
    # mentions "numerator ... rewritten in terms of the denominator" and
    # "long division" — characteristic of an improper rational expression
    # simplification (89fc23af).
    rat = ctx["rationale_text"]
    if ("numerator" in rat and "denominator" in rat
            and any_in(rat, ["rewritten in terms of the denominator",
                             "long division", "synthetic division",
                             "polynomial division"])):
        return True
    return False

def _eq_find_constant(ctx):
    blob = ctx["blob"]
    if re.search(r"where\s+[a-k]\s+(?:and\s+[a-k]\s+)?(?:is|are)\s+(?:positive\s+|nonzero\s+)?constants?", blob):
        if "value of" in blob:
            return True
    if "is a positive constant" in blob and "value of" in blob:
        return True
    if "where a is a constant" in blob and "value of" in blob:
        return True
    return False

def _eq_factor(ctx):
    blob = ctx["blob"]
    if "factor of" in blob or "factored form" in blob:
        return True
    if any_in(blob, ["factored", "common factor", "difference of squares", "factoring", "square of a binomial"]):
        return True
    return False

def _eq_distribute(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["distributive property", "distributing", "expanding", "expand the expression"]):
        return True
    # stem with multiplier times parenthesized expression and "equivalent"
    if "which expression is equivalent" in blob and re.search(r"\d+\s+left\s+parenthesis", blob):
        return True
    return False

def _eq_combine(ctx):
    blob = ctx["blob"]
    if "like terms" in blob or "combining like terms" in blob:
        return True
    # Two polynomials added/subtracted: "(...) + (...)" pattern
    if re.search(r"left\s+parenthesis[^()]*right\s+parenthesis\s+(?:plus|minus)\s+left\s+parenthesis", blob):
        if "which expression is equivalent" in blob or "equivalent to" in blob:
            return True
    return False


CATALOG["Equivalent expressions"] = [
    ("eq-expr-radicals", "Manipulate radicals / rational exponents", _eq_radicals),
    ("eq-expr-rational", "Rewrite rational expressions", _eq_rational),
    ("eq-expr-find-constant", "Find the unknown constant", _eq_find_constant),
    ("eq-expr-factor", "Factor a polynomial", _eq_factor),
    ("eq-expr-distribute", "Distribute and expand", _eq_distribute),
    ("eq-expr-combine", "Combine like terms / add or subtract polynomials", _eq_combine),
]
SKILL_META["Equivalent expressions"] = ("Advanced Math", "Math")


# Skill: Advanced Math :: Nonlinear functions
def _nlf_zero_cubic(ctx):
    blob = ctx["blob"]
    # Three factor product
    if re.search(r"left\s+parenthesis[^()]+right\s+parenthesis\s+left\s+parenthesis[^()]+right\s+parenthesis\s+left\s+parenthesis", blob):
        return True
    if "zero product property" in blob and blob.count("right parenthesis") >= 3:
        return True
    return False

def _nlf_quadratic_features(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["vertex form", "vertex of the parabola", "axis of symmetry",
                     "x-coordinate of the vertex", "y-coordinate of the vertex",
                     "minimum value", "maximum value"]):
        if "x squared" in blob or "parabola" in blob:
            return True
    if "parabola" in blob and any_in(blob, ["x-intercept", "y-intercept", "vertex"]):
        return True
    # h = -gt^2 + ... or projectile motion
    if any_in(blob, ["t squared", "x squared"]) and any_in(blob, ["height", "kicked", "thrown",
                                                                   "platform", "projectile", "ground"]):
        return True
    # w(w+9) type cutting board / area
    if "area" in blob and any_in(blob, ["rectangular", "cutting board"]) and any_in(blob, ["width", "length"]):
        return True
    # A1 widen: vertex / min-max framings that don't include the literal "vertex"
    # word. Captures stems like "what is the minimum value of the function f"
    # (a7711fe8) and "for what value of x does y reach its minimum" (ee857afb,
    # 6d9e01a2). The rationale typically mentions "x squared", "vertex form",
    # "a x squared plus b x plus c", or "quadratic function".
    if any_in(blob, ["maximum value of the function", "minimum value of the function",
                     "reach its minimum", "reach its maximum",
                     "reaches its minimum", "reaches its maximum"]):
        if any_in(blob, ["x squared", "z squared", "quadratic", "vertex", "parabola",
                         "a x squared plus b x plus c"]):
            return True
    # A1 widen: "for what value of x does ... reach" form (ee857afb).
    if "value of x does" in blob and any_in(blob, ["reach its minimum", "reach its maximum",
                                                    "reach a minimum", "reach a maximum"]):
        return True
    # A1 widen: "ax^2 + bx + c" rationale paired with reach/minimum/maximum.
    if "a x squared plus b x plus c" in blob and any_in(blob, ["reach", "minimum", "maximum"]):
        return True
    # A1 widen: projectile / softball / launched / models problems even without
    # literal "t squared" or "x squared" in the search blob (the equation often
    # lives in MathML that strips out). Look for "quadratic function ... models"
    # paired with motion/depth/height words, or explicit "maximum height" /
    # "ground level" / "launches" / "projectile" stems.
    if "quadratic function" in blob and "models" in blob:
        if any_in(blob, ["height", "depth", "projectile", "launched", "softball",
                         "above the ground", "below the surface", "ground level",
                         "reached its maximum", "reached a maximum",
                         "reached its minimum", "reached a maximum height",
                         "maximum height", "maximum depth"]):
            return True
    if any_in(blob, ["projectile", "softball", "launches", "launched vertically"]) and "models" in blob:
        if any_in(blob, ["height", "ground", "maximum", "x-intercept"]):
            return True
    # A1 widen: "machine launches a softball ... which equation represents the
    # height" (7902bed0) — no "models" word but the projectile shape and
    # "which equation represents the height" stem are unambiguous.
    if any_in(blob, ["projectile", "softball", "launches a", "launched vertically"]):
        if any_in(blob, ["maximum height", "above the ground", "ground level",
                         "maximum depth", "below the surface"]):
            if any_in(blob, ["which equation represents the height",
                             "which equation represents",
                             "real-life meaning",
                             "x-intercept",
                             "what is the estimated", "what was the estimated"]):
                return True
    # A1 widen: "models the height/depth ... what does the number X represent"
    # (5bf0f84a). The stem says "object above ground t seconds after being
    # launched straight up". Already covered above when "launches"/"launched"
    # appears, but be explicit about the "height ... above ground" framing.
    if "models the height" in blob and any_in(blob, ["seconds after", "above ground", "above the ground"]):
        return True
    return False

def _nlf_graph_read(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["graph shown", "the graph shown", "the graph of f", "graph in the xy-plane",
                     "graphs in the xy-plane could represent",
                     "graph of the polynomial function", "graph of the function f"]):
        return True
    if any_in(blob, ["the parabola opens", "the curve trends", "the parabola passes through",
                     "the parabola shown", "could be the graph", "in quadrant",
                     "the curve rises", "the curve falls", "for the first curve",
                     "for the second curve"]):
        return True
    return False

def _nlf_exp_build(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["each year", "each month", "each day", "each hour", "compounded",
                     "doubles every", "halves every", "doubled every", "each time",
                     "bounces", "after each", "halves the height"]):
        if any_in(blob, ["which equation", "which function", "represents the value", "models",
                         "function h estimates", "function f estimates", "estimates",
                         "maximum height", "between the", "what was its maximum", "represents the number"]):
            return True
    if "percent" in blob and any_in(blob, ["each year", "every year", "annually"]):
        if any_in(blob, ["which equation", "which function", "represents"]):
            return True
    # A2 widen: factor / doubling / each-increase framings.
    if any_in(blob, ["increases by a factor of", "decreases by a factor of",
                     "each term after the first is",
                     "each increase of 1 in the value of x"]):
        if any_in(blob, ["which equation", "which function", "which represents", "represents this",
                         "gives w in terms"]):
            return True
    # A2 widen: exponential-function setup ("balance is given by an exponential function ...
    # which equation could define A"). Look at stem (not blob) so we don't fire
    # on questions where "exponential function" only appears in the rationale —
    # those are typically nlf-exp-rewrite or other variants.
    stem_text = ctx["stem_text"]
    if ("exponential function" in stem_text
            and any_in(stem_text, ["which equation could define",
                                    "which equation defines",
                                    "which of the following equations could",
                                    "which function could define"])
            and "equivalent" not in blob):
        return True
    # A2 widen: table-driven exponential ("the table shows ... equation y = a (b)^x ... value of a").
    if "table" in blob and ("superscript" in blob or "to the" in blob):
        if any_in(blob, ["which of the following equations could define",
                         "which equation could define"]):
            return True
        # Tabular exponential constant-resolution ("y = 4(2)^x + 3 ... in the table, a is a constant").
        if "the table shows" in blob and "is a constant" in blob and "value of" in blob:
            return True
    # A2 widen: tabular function-definition with exponential rationale
    # ("the table above gives ... which of the following equations could define f"
    # where rationale mentions "exponent" / "base").
    if "table" in blob and any_in(blob, ["which of the following equations could define f",
                                          "which equation could define f"]):
        if "exponent" in blob or "base 2" in blob or "base 3" in blob:
            return True
    return False

def _nlf_exp_rewrite(ctx):
    blob = ctx["blob"]
    if "exponential" in blob and any_in(blob, ["equivalent to", "best interpretation", "rewritten"]):
        return True
    if re.search(r"superscript\s+\w+", blob) and "equivalent" in blob and "exponential" in blob:
        return True
    return False

def _nlf_interpret_context(ctx):
    blob = ctx["blob"]
    if "best interpretation" in blob or "best describes the meaning" in blob:
        return True
    if "what does" in blob and "represent" in blob and ("in this context" in blob or "in the context" in blob):
        return True
    if "meaning of" in blob and "context" in blob:
        return True
    return False

def _nlf_build_from_text(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["which equation defines f", "which function defines f", "which equation defines the function",
                     "which function f best models"]):
        if not any_in(blob, ["each year", "each month", "doubles", "compounded"]):
            return True
    return False

def _nlf_evaluate(ctx):
    blob = ctx["blob"]
    has_func = any_in(blob, ["function f is defined", "function g is defined", "function h is defined",
                              "function p is defined", "function defined by"])
    if has_func and any_in(blob, ["what is the value of", "for what value of x", "for which value of x"]):
        return True
    if "substituting" in blob and any_in(blob, ["for x in", "for x ,"]):
        return True
    return False


# B1 new aspect: nlf-exp-rescale-time. Inserted AFTER nlf-exp-build /
# nlf-exp-rewrite (which handle the "build an exponential from a verbal model"
# task) so it only catches the residual: questions where the exponential model
# is GIVEN and the task is to re-express the time unit (months <-> years <->
# quarter-years) or to find a doubling/halving period.
def _nlf_exp_rescale_time(ctx):
    blob = ctx["blob"]
    stem_text = ctx["stem_text"]
    # Exponential-base hints (model is given explicitly). Not strictly required:
    # 59d1f4b5 has the equation referenced as "the equation above" with no
    # numeric base visible after MathML stripping.
    has_exp_base = any_in(blob, ["1.06 to", "2 to the",
                                  "superscript t", "superscript m",
                                  "superscript q", "to the t",
                                  "right parenthesis superscript",
                                  "superscript startfraction"])
    has_exp_word = ("the equation above models" in stem_text
                    or "the function" in stem_text and "models" in stem_text
                    or "the given function" in stem_text)
    if not (has_exp_base or has_exp_word):
        return False
    # Rescaled time / doubling-period framings.
    rescale_signal = any_in(blob, ["per quarter", "per month", "per year",
                                    "quarter years", "quarter year",
                                    "months after the census",
                                    "month after the census",
                                    "minutes after an initial observation",
                                    "minute after an initial observation"])
    doubling_signal = any_in(blob, ["does it take for the number of",
                                     "to double", "to halve", "to triple",
                                     "doubling", "halving"])
    rewrite_signal = any_in(stem_text, ["which equation models the number",
                                          "best models the population",
                                          "which of the following functions best models",
                                          "of the following, which equation models"])
    if rescale_signal and rewrite_signal:
        return True
    if doubling_signal and "how much time" in blob:
        return True
    # "at the surface of the sample" / "when it is at the surface" — evaluating
    # the given exponential at t=0 / t=K (dc77e0dc). Stem asks "estimated number
    # of ... when ...".
    if "the function f models" in stem_text and "estimated" in stem_text and "when" in stem_text:
        return True
    return False


# B2 new aspect: nlf-table-features. Inserted AFTER nlf-graph-read,
# nlf-exp-build, etc. Captures table-driven polynomial / relationship questions
# that don't fit the existing nlf-graph-read (graph) or nlf-build-from-text
# (verbal) predicates.
def _nlf_table_features(ctx):
    blob = ctx["blob"]
    stem_text = ctx["stem_text"]
    if "table" not in blob:
        return False
    # Exclude graph-based questions (nlf-graph-read should already win those,
    # but in case it doesn't, key off the stem-level graph signal — the
    # rationale almost always mentions "graph" even for table questions).
    if any_in(stem_text, ["the graph shown", "the graph of f shown",
                          "the graph of the function shown"]):
        return False
    # The B2 cluster has distinctive cues in stem or rationale.
    if any_in(blob, ["must be a factor", "selected values of a polynomial",
                     "selected values of the polynomial",
                     "could define the function"]):
        return True
    # Stem-level: "the table ... which of the following equations could
    # define" (dba7432e shape, already in nlf-exp-build, but f-shape catches
    # f423771c).
    if any_in(stem_text, ["which of the following equations could",
                          "which of the following functions best represents",
                          "which of the following graphs in the xy -plane could represent"]):
        if any_in(stem_text, ["the table shows", "the table above",
                              "the table shown",
                              "table shows three values",
                              "values of x and their corresponding"]):
            return True
    # 02060533: "the table shows three values of x and their corresponding
    # values of g(x), where g(x) = f(x)/(x+3) and f is a linear function.
    # what is the y-intercept of the graph of y = f(x)". Distinctive table +
    # composed-function shape.
    if "table shows three values" in stem_text and "y -intercept" in stem_text:
        return True
    return False


CATALOG["Nonlinear functions"] = [
    ("nlf-graph-read", "Read a feature from a given graph", _nlf_graph_read),
    ("nlf-zero-cubic", "Cubic / factored polynomial zeros", _nlf_zero_cubic),
    ("nlf-quadratic-features", "Quadratic: vertex, axis, intercepts, transformation", _nlf_quadratic_features),
    ("nlf-exp-build", "Build an exponential model from context", _nlf_exp_build),
    ("nlf-exp-rewrite", "Rewrite or interpret an exponential expression", _nlf_exp_rewrite),
    ("nlf-exp-rescale-time", "Re-express exponential model on a different time unit / find doubling period", _nlf_exp_rescale_time),
    # Merged: nlf-table-features + nlf-build-from-text -> nlf-build-from-data-or-text
    # Both predicates retained as separate first-match-wins entries; they
    # both emit the unified slug. Ordering preserved (table-features first,
    # build-from-text later) to match prior catch order.
    ("nlf-build-from-data-or-text", "Build a function from a table or verbal description", _nlf_table_features),
    ("nlf-interpret-context", "Interpret a parameter or value in context", _nlf_interpret_context),
    ("nlf-build-from-data-or-text", "Build a function from a table or verbal description", _nlf_build_from_text),
    ("nlf-evaluate", "Evaluate a function at a value", _nlf_evaluate),
]
SKILL_META["Nonlinear functions"] = ("Advanced Math", "Math")


# Skill: Advanced Math :: Nonlinear equations in one variable and systems of equations in two variables
def _nle_system_substitute(ctx):
    blob = ctx["blob"]
    if "system" in blob and any_in(blob, ["x squared", "parabola", "x cubed", "x to the third"]):
        if any_in(blob, ["solution", "value of x y", "value of xy", "value of x", "value of y"]):
            return True
    if "system of equations" in blob and "substituting" in blob and "x squared" in blob:
        return True
    return False

def _nle_system_graph(ctx):
    blob = ctx["blob"]
    if "intersect at the point" in blob:
        return True
    if "system" in blob and "shown" in blob and "graph" in blob and any_in(blob, ["parabola", "absolute value", "curve"]):
        return True
    return False

def _nle_discriminant_constant(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["exactly one solution", "no real solution", "two distinct real solution", "exactly two distinct real solutions"]):
        if "constant" in blob or "value of" in blob:
            return True
    if "discriminant" in blob:
        return True
    return False

def _nle_absolute_value(ctx):
    blob = ctx["blob"]
    if "absolute value" in blob:
        return True
    return False

def _nle_radical(ctx):
    blob = ctx["blob"]
    if "squaring both sides" in blob or "square both sides" in blob:
        return True
    if any_in(blob, ["startroot", "square root of", "cube root of"]) and any_in(blob, ["equation", "=", "equals"]):
        if "solution" in blob or "value of" in blob:
            return True
    return False

def _nle_rational(ctx):
    blob = ctx["blob"]
    if "common denominator" in blob:
        return True
    # Variable in denominator and equation
    if "startfraction" in blob and "endfraction" in blob and re.search(r"over[^.,!?]{0,30}x", blob):
        if "value of x" in blob or "solution" in blob:
            return True
    return False

def _nle_literal(ctx):
    blob = ctx["blob"]
    if re.search(r"express\s+[a-z]\s+in\s+terms\s+of", blob):
        return True
    if "which equation gives" in blob and "in terms of" in blob:
        return True
    if "isolating" in blob and "in terms of" in blob:
        return True
    if "in terms of" in blob and any_in(blob, ["which of the following", "which equation"]):
        return True
    return False

def _nle_exponent_eq(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["same base", "matching exponents", "equating exponents"]):
        return True
    # superscript on both sides
    if blob.count("superscript") >= 2 and "=" in blob and "value of" in blob:
        return True
    # power equation pattern: "to the 2x = 16" etc.
    if re.search(r"to\s+the\s+(?:\d+|\w+)", blob) and "x" in blob and "=" in blob:
        if "value of x" in blob or "solution" in blob:
            return True
    return False

def _nle_zero_product(ctx):
    blob = ctx["blob"]
    if "zero product property" in blob:
        return True
    if "factored" in blob and "= 0" in blob and "solution" in blob:
        return True
    # Already factored: count parens
    parens = blob.count("right parenthesis")
    if parens >= 4 and any_in(blob, ["= 0", "equals 0"]) and "x squared" not in blob:
        return True
    # A7 widen: two-factor stems "(ax+b)(cx+d) = 0" + "which is a solution".
    # 2926cc6d has parens == 2 and "product of two factors is equal to 0" in
    # the rationale. Distinguish from rational equations by requiring the
    # "two factors ... equal to 0" rationale phrase OR the literal stem form
    # left/right-parenthesis pair followed by "equals 0" + "solution".
    if "product of two factors is equal to 0" in blob and "solution" in blob:
        return True
    if (parens >= 2 and any_in(blob, ["equals 0", "= 0"])
            and "which of the following is a solution" in blob
            and "x squared" not in blob):
        # Make sure there's a multiplicative-pair form like
        # "right parenthesis left parenthesis" (factor-factor).
        if "right parenthesis left parenthesis" in blob:
            return True
    return False

def _nle_quadratic_solve(ctx):
    blob = ctx["blob"]
    if "x squared" in blob and any_in(blob, ["= 0", "equals 0"]) and any_in(blob, ["solution", "value of x", "positive solution"]):
        return True
    if "quadratic formula" in blob:
        return True
    if "x squared" in blob and "=" in blob and any_in(blob, ["positive solution", "negative solution", "what is one solution", "solutions to", "value of x"]):
        return True
    # A6 widen: same form but the variable is named z / w / y / a / b / t
    # instead of x. The MathML often strips out and we have "z squared plus 10 z
    # minus 24 equals 0" in the blob.
    for var in ("z squared", "w squared", "y squared", "a squared",
                "b squared", "t squared"):
        if var in blob and any_in(blob, ["equals 0", "= 0"]) and any_in(
                blob, ["solution", "value of"]):
            return True
    # A6 widen: "product of the solutions to the given equation" (911383f2).
    if "product of the solutions" in blob or "sum of the solutions" in blob:
        return True
    # A6 widen: "square root of both sides" / "taking the square root of both
    # sides" — the x squared = K solving move (eb268057).
    if any_in(blob, ["taking the square root of both sides",
                     "square root of both sides"]):
        return True
    # A6 widen: "value of x satisfies" / "values of x satisfies" — quadratic-
    # solve framings (eb268057). Require some quadratic signal (factoring,
    # discriminant, or quadratic in the rationale).
    if any_in(blob, ["value of x satisfies the given equation",
                     "values of x satisfies the given equation",
                     "value of x satisfies the equation",
                     "which of the following values of x satisfies"]):
        if any_in(blob, ["quadratic", "factoring", "x squared",
                         "square root", "two integer solutions",
                         "two solutions"]):
            return True
    # A6 widen: "two integer solutions" / "a is a solution of the equation"
    # rationale framings with quadratic factoring (a4f61d75, 87a3de81).
    if any_in(blob, ["two integer solutions",
                     "two integer solutions to the equation"]):
        if any_in(blob, ["factor", "factoring", "quadratic", "value of"]):
            return True
    if ("a is a solution of the equation" in blob
            and "factoring the quadratic expression" in blob):
        return True
    return False


# B4 new aspect: nle-no-real-solution-check. "How many distinct real
# solutions does the given equation have?" / "how many times does the graph
# intersect" with a nonlinear form. Distinct from nle-discriminant-constant
# (which finds a *constant* given a #-of-solutions condition); here the
# coefficients are concrete and the answer is the count.
def _nle_no_real_solution_check(ctx):
    blob = ctx["blob"]
    stem_text = ctx["stem_text"]
    if any_in(stem_text, ["how many distinct real solutions",
                          "how many real solutions",
                          "the number of distinct real solutions"]):
        return True
    # 6bdcac03 ("x^2 = -841 ... how many distinct real solutions") may have
    # the question in blob rather than stem_text alone.
    if "how many distinct real solutions" in blob:
        # Make sure it's not a discriminant-constant question (which talks
        # about finding constants).
        if not any_in(blob, ["value of k", "value of a constant",
                              "values of k"]):
            return True
    # f5247e52: "how many times does the graph of the equation above
    # intersect the graph of the equation in the xy-plane".
    if "how many times does the graph" in stem_text and "intersect" in stem_text:
        if any_in(blob, ["parabola", "x squared", "quadratic"]):
            return True
    return False


# B5 new aspect: nle-system-quadratic-context. A system with one quadratic +
# one linear, asks for a derived quantity (xy, ordered pair, or x+y).
# Distinct from nle-system-substitute which fully solves; here the question
# wraps the solution in a derived ask.
def _nle_system_quadratic_context(ctx):
    blob = ctx["blob"]
    stem_text = ctx["stem_text"]
    # System indicators
    has_system = ("system of equations" in blob or "system of two equations" in blob
                  or "given system" in blob)
    # Quadratic signal — either explicit "squared"/"parabola" or rationale
    # uses distributive-property / two-solutions reasoning (876a731c MathML
    # strips out but rationale mentions "apply the distributive property" and
    # "thus, ... are the solutions").
    has_quad = any_in(blob, ["squared", "x squared", "parabola", "quadratic"])
    rat = ctx["rationale_text"]
    has_quad_rationale = (
        ("distributive property" in rat and "factor" in rat
         and "solutions" in rat)
        or ("two solutions to the system" in rat))
    if not (has_system and (has_quad or has_quad_rationale)):
        return False
    # The "derived quantity" framing distinguishes this from
    # nle-system-substitute.
    if any_in(blob, ["value of x y", "value of xy",
                     "what is the value of x y",
                     "which ordered pair",
                     "ordered pair left parenthesis x comma y right parenthesis is a solution",
                     "one possible value"]):
        return True
    return False


CATALOG["Nonlinear equations in one variable and systems of equations in two variables"] = [
    ("nle-system-substitute", "Solve (line + nonlinear) by substitution", _nle_system_substitute),
    ("nle-system-graph", "Read a system's solution from a graph", _nle_system_graph),
    # Merged: nle-system-quadratic-context -> nle-system-substitute
    ("nle-system-substitute", "Solve (line + nonlinear) by substitution", _nle_system_quadratic_context),
    ("nle-discriminant-constant", "Number of solutions / discriminant", _nle_discriminant_constant),
    # Merged: nle-no-real-solution-check -> nle-discriminant-constant
    ("nle-discriminant-constant", "Number of solutions / discriminant", _nle_no_real_solution_check),
    ("nle-absolute-value", "Solve an absolute value equation", _nle_absolute_value),
    ("nle-radical", "Solve a radical or exponent equation", _nle_radical),
    ("nle-rational", "Solve a rational equation", _nle_rational),
    ("nle-literal", "Solve a literal equation for one variable", _nle_literal),
    # Merged: nle-exponent-eq -> nle-radical
    ("nle-radical", "Solve a radical or exponent equation", _nle_exponent_eq),
    ("nle-zero-product", "Solve a factored polynomial equation", _nle_zero_product),
    ("nle-quadratic-solve", "Solve a quadratic equation", _nle_quadratic_solve),
]
SKILL_META["Nonlinear equations in one variable and systems of equations in two variables"] = ("Advanced Math", "Math")


# Skill: Algebra :: Linear functions
def _lf_combine_functions(ctx):
    blob = ctx["blob"]
    if "h left parenthesis x right parenthesis equals f" in blob:
        return True
    if "g left parenthesis x right parenthesis" in blob and "f left parenthesis x right parenthesis" in blob:
        if "plus" in blob or "minus" in blob or "compose" in blob:
            return True
    if "f left parenthesis 2 right parenthesis" in blob and "g left parenthesis 2 right parenthesis" in blob:
        return True
    return False

def _lf_build_from_table(ctx):
    blob = ctx["blob"]
    if "the table" in blob and any_in(blob, ["which equation", "linear function", "defines f", "represents the relationship"]):
        if "table shows" in blob or "table gives" in blob or "selected values" in blob:
            return True
    if "table shows several values" in blob:
        return True
    return False

def _lf_build_from_slope(ctx):
    blob = ctx["blob"]
    if "slope" in blob and ("passes through" in blob or "y-intercept" in blob):
        if any_in(blob, ["which equation defines", "which function defines", "which equation represents"]):
            return True
    # A4 widen: two-point pickup. Stems give two (x, y) pairs and ask "which
    # of the following linear functions" without the literal word "slope"
    # (2b15d65f demand q for price p; 3122fc7b population 1991/2011; 41fdc0b8
    # 2000/2010 table; c22b5f25 "the points and lie on the graph of which
    # linear functions").
    if any_in(blob, ["two values of", "two points",
                     "the points and lie", "points and lie on the graph",
                     "the points and lie on"]):
        if any_in(blob, ["which of the following linear functions",
                         "which linear function",
                         "which equation defines",
                         "which equation represents",
                         "which function defines"]):
            return True
    # A4 widen: explicit two-data-point linear-modelling stems (rate-of-change /
    # population / demand-elasticity questions where the rationale uses the
    # two-point slope formula and the stem doesn't contain "slope"). Accept
    # both explicit "linear function/model" and just "is linear" + "models".
    has_linear_signal = ("linear" in blob and any_in(blob,
                            ["constant rate of change",
                             "constant rate", "linear function",
                             "linear model",
                             "is linear",
                             "models the population",
                             "population is linear"]))
    if has_linear_signal:
        # Two timestamps / two values pattern
        if (re.search(r"\b(?:19|20)\d{2}\b.*\b(?:19|20)\d{2}\b", blob)
                and any_in(blob, ["which function", "which equation",
                                  "which of the following functions",
                                  "which of the following equations",
                                  "value of x", "what is the value",
                                  "estimated the population",
                                  "models the population",
                                  "population of"])):
            return True
        # "demand was X units when ... was Y per unit, and demand was N when ..."
        if "demand was" in blob and "per unit" in blob:
            return True
    return False

def _lf_interpret_coeff(ctx):
    blob = ctx["blob"]
    if "best interpretation" in blob or "best describes the meaning" in blob:
        return True
    if ("what does" in blob and "represent" in blob and any_in(blob, ["in this context", "in the context", "of the function"])):
        return True
    if "best describes" in blob and "function" in blob:
        return True
    # "the equation shown gives the estimated amount of X" with rate
    if "estimated" in blob and any_in(blob, ["gives the", "represents the"]) and "function" not in blob:
        if "best interpretation" in blob or "what does" in blob or "represent" in blob:
            return True
    return False

def _lf_build_from_context(ctx):
    blob = ctx["blob"]
    rate_signal = any_in(blob, ["per hour", "per day", "per minute", "per month", "per week",
                                "per year", "each week", "each day", "each hour", "each month",
                                "each year", "per mile", "constant rate"])
    word_signal = any_in(blob, ["deposits", "charges", "rented", "activation", "membership",
                                "onetime", "one-time", "subscription", "fixed fee", "flat fee",
                                "initial fee", "down payment", "savings account", "purchased",
                                "take-home pay", "sign-on bonus", "selling", "fundraiser",
                                "roller-coaster", "training program", "rides his bike"])
    eq_signal = any_in(blob, ["which equation defines f", "which function defines f",
                              "which equation represents the function",
                              "which equation represents this situation",
                              "which function f best models", "function f",
                              "defines the function", "which equation represents the relationship",
                              "which equation represents", "which function m models",
                              "which function f models", "which equation models",
                              "which of the following equations"])
    if rate_signal and eq_signal:
        return True
    if word_signal and eq_signal:
        return True
    if word_signal and any_in(blob, ["how much money", "how many", "total amount", "after",
                                     "what was the total", "what was the cost"]):
        return True
    if rate_signal and any_in(blob, ["how much money", "how many", "total amount", "after"]):
        return True
    if re.search(r"the\s+number\s+y\s+is\s+\d+", blob) and "which equation" in blob:
        return True
    # A3 widen: "for the first day ... for each additional day" rental-style
    # step pricing (67d63e19, a7e2859a, be9cb6a2) — a fixed-fee + per-unit
    # structure that the existing rate/word signals missed.
    if "for the first day" in blob and any_in(blob, [
            "for each additional", "for each subsequent",
            "each additional day", "each additional"]):
        if any_in(blob, ["which equation", "which function",
                         "which of the following equations",
                         "which of the following functions"]):
            return True
    # A3 widen: "X will cover N square feet" / paint-coverage word problems
    # (a309803e, d1f50dbe).
    if (("will cover" in blob or "covers" in blob)
            and "square feet" in blob
            and any_in(blob, ["which equation represents", "which equation",
                              "which of the following equations"])):
        return True
    # A3 widen: "increase by $X on the first day of the year" wage-step variant
    # (de6fe450).
    if "first day of the" in blob and any_in(blob, ["increase by", "increases by"]):
        if any_in(blob, ["which function best models", "which function models",
                         "which equation models", "which of the following functions"]):
            return True
    return False

def _lf_find_constant(ctx):
    blob = ctx["blob"]
    # "f(x) = mx + a, f(c) = k, find a"
    if "constant" in blob and "value of" in blob and "function f" in blob:
        return True
    if re.search(r"value\s+of\s+[abk]\s*\??", blob) and "function" in blob and "defined by" in blob:
        return True
    return False

def _lf_graph_intercepts(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["x-intercept", "y-intercept", "slope"]) and any_in(blob, ["graph of f", "graph of y",
                                                                               "graph of the function",
                                                                               "graph shown",
                                                                               "graph models",
                                                                               "the line shown",
                                                                               "the line slants",
                                                                               "line passes through"]):
        return True
    if any_in(blob, ["graph of f", "graph of the linear function", "graph of the function"]) and any_in(blob, ["x-intercept", "y-intercept", "value of x", "value of y"]):
        return True
    # A5 widen: "line k has a slope of N and a y-intercept of ... what is the
    # x-coordinate of the x-intercept" (17d80dc3). No "graph" word in the stem
    # but conceptually identical to reading intercepts from a line. Restrict
    # to the STEM so we don't accidentally promote table-driven questions
    # whose rationales contain the same words. Normalise hyphen spacing on
    # the stem_text since the upstream stem may have "x -intercept" with a
    # space.
    stem_text = ctx.get("stem_text", "")
    stem_norm = stem_text.replace(" -intercept", "-intercept").replace(" -coordinate", "-coordinate")
    if (any_in(stem_norm, ["x-coordinate of the x-intercept"])
            and "slope" in stem_norm and "y-intercept" in stem_norm):
        return True
    # A5 widen: e25f0807 — table-driven "two values of x and y" but the
    # question asks for a value on the linear graph at a non-table x. This
    # is "find a point on the line" rather than two-point pickup; route to
    # graph-intercepts because that's the closest existing aspect intent.
    if ("two values of x" in blob and "the graph of the linear equation" in blob
            and "passes through the point" in blob):
        return True
    return False

def _lf_evaluate(ctx):
    blob = ctx["blob"]
    has_func_def = any_in(blob, ["function f is defined by", "function g is defined by",
                                 "function h is defined by", "the function defined by",
                                 "f is defined"])
    if has_func_def and any_in(blob, ["what is the value of", "for what value of x", "for what value of"]):
        return True
    if "substituting" in blob and any_in(blob, ["function f", "function g", "function h",
                                                "f left parenthesis x", "in the given equation"]):
        return True
    if "value of f" in blob or "value of g" in blob or "value of h" in blob:
        return True
    # "if y = 5x + 10, what is the value of y when x = 8"
    if re.search(r"if\s+y\s+equals", blob) and "value of y when x" in blob:
        return True
    if re.search(r"if\s+y\s+equals", blob) and "when x equals" in blob and "value of y" in blob:
        return True
    return False


# B3 new aspect: lf-temperature-unit-formula. Captures the "F(x) = (9/5)(x -
# 273.15) + 32" template (6989c80a, b3abf40f) and similar unit-formula
# conversions where a small input change produces a scaled output change.
# Distinct from lf-build-from-context (no fixed-fee + per-unit structure) and
# lf-evaluate (asks for an increment, not an evaluation).
def _lf_temperature_unit_formula(ctx):
    blob = ctx["blob"]
    # Kelvin-Fahrenheit canonical template.
    if "kelvins" in blob and any_in(blob, ["fahrenheit", "degrees fahrenheit"]):
        if any_in(blob, ["by how much did the temperature increase",
                         "by how much did the temperature decrease",
                         "by how much, in degrees",
                         "temperature increased by",
                         "temperature decreased by"]):
            return True
    # The "9/5 (x - 273.15) + 32" formula explicitly.
    if "nine fifths" in blob and "273.15" in blob:
        return True
    # Boiling-point / elevation linear-formula variant (dae126d7): "for every
    # X feet above sea level, the boiling point is lowered by ..."
    if (any_in(blob, ["boiling point", "freezing point"])
            and any_in(blob, ["above sea level", "below sea level",
                              "above the surface"])
            and any_in(blob, ["which of the following equations",
                              "which equation can be used",
                              "which equation"])):
        return True
    return False


CATALOG["Linear functions"] = [
    ("lf-combine-functions", "Combine/compose/transform two functions", _lf_combine_functions),
    ("lf-build-from-table", "Find slope/intercept/equation from a table", _lf_build_from_table),
    ("lf-build-from-slope", "Write equation given slope and point/intercept", _lf_build_from_slope),
    ("lf-temperature-unit-formula", "Apply a temperature/unit-formula conversion increment", _lf_temperature_unit_formula),
    ("lf-interpret-coeff", "Interpret slope or y-intercept in context", _lf_interpret_coeff),
    ("lf-build-from-context", "Translate words to a linear function", _lf_build_from_context),
    ("lf-graph-intercepts", "Read x/y-intercept from graph or equation", _lf_graph_intercepts),
    ("lf-find-constant", "Find an unknown constant in a linear function", _lf_find_constant),
    ("lf-evaluate", "Evaluate a linear function", _lf_evaluate),
]
SKILL_META["Linear functions"] = ("Algebra", "Math")


# Skill: Algebra :: Linear equations in two variables
def _le2_perpendicular_parallel(ctx):
    blob = ctx["blob"]
    if "perpendicular" in blob or "parallel" in blob:
        if any_in(blob, ["slope of line", "slope of", "what is the slope", "what is an equation"]):
            return True
    return False

def _le2_table_to_eq(ctx):
    blob = ctx["blob"]
    if "the table" in blob and any_in(blob, ["which equation", "linear relationship", "represents the linear",
                                              "represents the relationship"]):
        return True
    if "table shows" in blob and "x" in blob and "y" in blob and any_in(blob, ["which equation", "linear"]):
        return True
    return False

def _le2_build_from_features(ctx):
    blob = ctx["blob"]
    if "slope" in blob and "passes through" in blob and any_in(blob, ["which equation defines", "which equation represents", "what is the equation"]):
        return True
    if "passes through" in blob and "passes through" in blob and "which equation" in blob:
        return True
    return False

def _le2_substitute_given_one_var(ctx):
    blob = ctx["blob"]
    if re.search(r"if\s+[a-z]\s+(?:=|equals)\s+\d+", blob) and "value of" in blob:
        return True
    if any_in(blob, ["if x equals", "if y equals"]) and "value of" in blob:
        return True
    if "given equation relates" in blob and any_in(blob, ["value of", "how many"]):
        return True
    if "the equation" in blob and "if" in blob and any_in(blob, ["how many", "how much"]) and ("x " in blob or "y " in blob):
        return True
    if "equation gives" in blob and any_in(blob, ["how many", "if"]) and ("x " in blob or "y " in blob):
        return True
    # "the equation X = Y gives ... what is the length"
    if "equation" in blob and "gives" in blob and any_in(blob, ["perimeter", "length", "width", "mixture"]):
        if any_in(blob, ["what is the", "if"]):
            return True
    if "what is the mass" in blob and "mixture" in blob:
        return True
    # A12 widen: "given equation describes the relationship between ... if [N]
    # [item] ... how many [other] can it ..." (637022d2).
    if "given equation describes the relationship" in blob and any_in(
            blob, ["how many", "how much"]):
        return True
    # A12 widen: "the equation 7g + 7b = 840 represents ... the artist needs 71
    # blue tiles ... how many green tiles" (7625073d, 686b7244).
    if (("the equation" in blob or "equation" in blob)
            and "represents" in blob
            and any_in(blob, ["how many more", "how many", "how much"])
            and any_in(blob, ["needs", "purchased", "enrolled", "sold", "courses",
                              "blue", "green", "smaller containers", "larger containers"])):
        return True
    # A12 widen: "the equation X represents this situation, where x is the
    # number of ... according to the equation, what is the price" (a04190b7,
    # ee846db7).
    if "represents this situation" in blob and any_in(
            blob, ["according to the equation",
                   "what is the price", "what is the cost"]):
        return True
    # A12 widen: "milkshakes ... how much calcium" / mixture-style word problem
    # where the equation is implicit (0d1b1e35, c5e38487).
    if any_in(blob, ["banana milkshakes", "consists of", "milligrams"]):
        if any_in(blob, ["how much", "how many"]):
            return True
    if ("acetic acid" in blob or "chemist combines" in blob or "mixture" in blob) and any_in(
            blob, ["what is the volume", "what is the mass", "how much"]):
        return True
    return False

def _le2_build_from_context(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["which equation represents the relationship", "which equation represents this situation"]):
        return True
    if "which equation represents" in blob and any_in(blob, ["total", "altogether", "combined", "spent"]):
        return True
    if "which equation represents" in blob and any_in(blob, ["pounds", "ounces", "feet", "minutes", "shipment", "purchased"]):
        return True
    # "bought X and Y for $..., how many ..." -- two-variable word problem
    if any_in(blob, ["bought", "purchased"]) and any_in(blob, ["how many"]):
        if any_in(blob, ["each", "cost"]) and "total" in blob:
            return True
    if "shipment" in blob and any_in(blob, ["how many", "how much"]):
        return True
    return False

def _le2_intercept_conversion(ctx):
    blob = ctx["blob"]
    if "x-intercept" in blob and "y-intercept" in blob:
        if "what is" in blob:
            return True
    return False

def _le2_find_constant(ctx):
    blob = ctx["blob"]
    if "where" in blob and "constant" in blob and "value of" in blob:
        if "line" in blob or "equation" in blob:
            return True
    return False

def _le2_interpret_coeff(ctx):
    blob = ctx["blob"]
    if "best interpretation" in blob:
        return True
    if "what does" in blob and "represent" in blob and "context" in blob:
        return True
    return False

def _le2_graph_feature(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["slope of the line", "y-intercept of the line", "x-intercept of the line",
                     "slope of the graph", "which table"]):
        return True
    if any_in(blob, ["graph of", "y equals"]) and any_in(blob, ["slope", "y-intercept", "x-intercept"]):
        if "which" in blob or "what is" in blob:
            return True
    # "the line passes through" / "the line slants" -> graph
    if any_in(blob, ["the line slants", "the line passes through"]) and any_in(blob, ["graph shows", "graph"]):
        return True
    # A5 widen (le2 side): "the line with the equation ... is graphed in the
    # xy-plane. what is the x-coordinate of the x-intercept" (cb58833c).
    if any_in(blob, ["x-coordinate of the x-intercept",
                      "x -coordinate of the x-intercept"]) and any_in(
            blob, ["graphed in the xy-plane", "graph of the line",
                   "the line with the equation",
                   "is graphed in the xy",
                   "graphed in the xy ‑plane"]):
        return True
    return False


CATALOG["Linear equations in two variables"] = [
    ("le2-table-to-eq", "Find the equation from a table of (x, y)", _le2_table_to_eq),
    ("le2-perpendicular-parallel", "Slope of a parallel or perpendicular line", _le2_perpendicular_parallel),
    ("le2-build-from-features", "Write equation from slope + point or two points", _le2_build_from_features),
    ("le2-intercept-conversion", "Find intercept given the other intercept / a point", _le2_intercept_conversion),
    ("le2-find-constant", "Find unknown constant in an equation given graph/extra info", _le2_find_constant),
    ("le2-interpret-coeff", "Interpret a coefficient in context", _le2_interpret_coeff),
    ("le2-build-from-context", "Build a two-variable linear equation from a word problem", _le2_build_from_context),
    ("le2-substitute-given-one-var", "Solve for one variable given the value of the other", _le2_substitute_given_one_var),
    ("le2-graph-feature", "Read intercept/slope from a graph or from a slope-intercept equation", _le2_graph_feature),
]
SKILL_META["Linear equations in two variables"] = ("Algebra", "Math")


# Skill: Algebra :: Linear equations in one variable
def _le1_find_constant_infinite(ctx):
    blob = ctx["blob"]
    if "infinitely many solutions" in blob and "value of" in blob:
        return True
    return False

def _le1_find_constant_nosol(ctx):
    blob = ctx["blob"]
    if "has no solution" in blob and "value of" in blob:
        return True
    return False

def _le1_num_solutions(ctx):
    blob = ctx["blob"]
    if "how many solutions" in blob:
        return True
    return False

def _le1_treat_block(ctx):
    blob = ctx["blob"]
    if "treating" in blob and ("as a single" in blob or "as one" in blob or "as a variable" in blob):
        return True
    # Stem has the same parenthesized expression twice
    parens = re.findall(r"left\s+parenthesis\s+([^()]+?)\s+right\s+parenthesis", blob)
    counts = Counter(parens)
    if any(c >= 2 for c in counts.values()) and any_in(blob, ["= ", "equals "]):
        if "x plus" in blob or "x minus" in blob:
            return True
    return False

def _le1_scale_substitute(ctx):
    blob = ctx["blob"]
    # "if 4x+2 = 12, what is 16x+8?"
    if "if " in blob:
        if re.search(r"what\s+is\s+the\s+value\s+of\s+[0-9].*x", blob):
            return True
        if re.search(r"what\s+is\s+the\s+value\s+of\s+startfraction", blob):
            return True
        # Asking for value of expression (not just a single variable)
        if re.search(r"what\s+is\s+the\s+value\s+of\s+[^.,?]{0,80}(?:plus|minus|times|over)", blob):
            return True
    if "if y equals" in blob and "what is the value of" in blob and "x equals" in blob:
        # already caught in lf-evaluate; skip here
        return False
    if "multiplying both sides" in blob and "value of" in blob:
        return True
    return False

def _le1_build_from_context(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["which equation represents this situation", "which equation can be used",
                     "which equation represents the situation",
                     "which of the following equations represents"]):
        return True
    if "which equation gives" in blob:
        return True
    real_world = any_in(blob, [" he ", " she ", " they ", " his ", " her ",
                               "company", "rented", "purchased", "store", "bought",
                               "team", "saved", "gym", "charges", "enrollment", "membership", "donor",
                               "volunteer", "essay", "additional", "manager", "shop", "supply", "contract",
                               "monthly", "paid a total", "down payment", "principal",
                               "flags", "club", "coupon", "field day", "triangle",
                               "perimeter", "isosceles", "members", "semester", "ordered",
                               "original price", "storage bins"])
    if real_world:
        if any_in(blob, ["how many", "how much", "what is the total", "in how many",
                         "what is the length", "what is the original price",
                         "what was the original", "what is the third side"]):
            return True
    # A10 widen: more word-problem cues that drive setup of a one-variable
    # equation. Keep the gate (asks for a number / equation) and add a richer
    # context vocabulary.
    a10_context = any_in(blob, [
        "divided into three parts",
        "divided into",
        "perimeter, in feet",
        "perimeter of the dance floor",
        "dance floor",
        "pounds of grapes",
        "pounds of",
        "kilograms",
        "kg of propellant",
        "ounces of wax",
        "candle",
        "polygon",
        "30 -sided",
        "n cds",
        "more than twice the number",
        "more than three times the number",
        "box of cereal", "strawberries",
        "average rate",
        "average of 1",
        "centimeters per day",
        "centimeters per",
        "scientist",
        "burning",
        "in terms of",
    ])
    if a10_context:
        if any_in(blob, ["how many", "how much",
                         "which equation must be true",
                         "what is the length",
                         "which of the following expresses",
                         "in terms of",
                         "which of the following equations can be used",
                         "approximately how much",
                         "approximately how many",
                         "which equation can be used to find",
                         "what was the height",
                         "what was the original",
                         "what is the height"]):
            return True
    # A10 widen: "at this rate, how many dollars will c pounds ... cost"
    # (93954cfa) — symbolic rate problem with answer in terms of a variable.
    if "at this rate" in blob and any_in(blob, ["how many", "how much"]):
        return True
    return False

def _le1_isolate(ctx):
    blob = ctx["blob"]
    if re.search(r"what\s+value\s+of\s+[a-z]\s+(?:is|satisfies|does|is\s+the\s+solution)", blob):
        return True
    if re.search(r"for\s+what\s+value\s+of\s+[a-z]", blob):
        return True
    if re.search(r"what\s+is\s+the\s+value\s+of\s+[a-z]\b", blob):
        if "equals" in blob or "=" in blob:
            return True
    if any_in(blob, ["what is the solution to the given equation", "what is the solution",
                     "the equation above"]):
        return True
    if "which equation has the same solution" in blob:
        return True
    if "which of the following is equivalent to" in blob and "equation" in blob:
        return True
    if re.search(r"if\s+.+\s+(?:equals|=)\s+", blob) and "value of" in blob:
        return True
    # A11 widen: bare "if , what is the value of ..." stems where MathML strips out
    # the equation entirely. The stem_text is essentially "if , what is the value of ?".
    stem_text = ctx["stem_text"]
    if re.match(r"^\s*if\s*,\s*what\s+is\s+the\s+value\s+of\b", stem_text):
        return True
    return False


CATALOG["Linear equations in one variable"] = [
    ("le1-find-constant-infinite", "Find constant for infinitely many solutions", _le1_find_constant_infinite),
    ("le1-find-constant-nosol", "Find constant for no solution", _le1_find_constant_nosol),
    ("le1-num-solutions", "Determine number of solutions", _le1_num_solutions),
    ("le1-treat-block-as-variable", "Treat a sub-expression as a single variable", _le1_treat_block),
    ("le1-scale-substitute", "Scale both sides / value of a related expression", _le1_scale_substitute),
    ("le1-build-from-context", "Translate a word problem into a one-variable equation", _le1_build_from_context),
    ("le1-isolate", "Solve a one-variable linear equation", _le1_isolate),
]
SKILL_META["Linear equations in one variable"] = ("Algebra", "Math")


# Skill: Algebra :: Systems of two linear equations in two variables
def _sys_find_constant_infinite(ctx):
    blob = ctx["blob"]
    stem_text = ctx["stem_text"]
    if "infinitely many solutions" in blob and "value of" in blob:
        return True
    # A8 widen: stems where the answer is the second equation (not a constant
    # value). e.g. "the system has infinitely many solutions. which equation
    # could be the second equation in this system?" (79784c23, d909cd31).
    # Gate on STEM_TEXT so rationales that discuss both "infinitely many" and
    # "no solution" don't accidentally match this predicate.
    if "infinitely many solutions" in stem_text and any_in(
            stem_text, ["which equation could be the second equation",
                        "which of the following could be the second equation",
                        "which of the following equations could be the other equation",
                        "which equation could be the other equation",
                        "which of the following could be the second"]):
        return True
    return False

def _sys_find_constant_nosol(ctx):
    blob = ctx["blob"]
    stem_text = ctx["stem_text"]
    if "has no solution" in blob and "value of" in blob and "system" in blob:
        return True
    # A8 widen: "the system has no solution. which equation could be the second
    # equation in this system?" (4becad44, 567ac7ab, 5e08a055). Gate on STEM
    # to avoid rationale-driven false matches.
    if "has no solution" in stem_text and any_in(
            stem_text, ["which equation could be the second equation",
                        "which of the following could be the second equation",
                        "which of the following equations could be the other equation",
                        "which equation could be the other equation",
                        "which of the following could be the other equation",
                        "which of the following could be the second"]):
        return True
    # A8 widen: "at least one solution" variant (58477a6c) — same shape, answer
    # is a single equation that makes the system consistent.
    if "at least one solution" in stem_text and any_in(
            stem_text, ["which equation could be the second",
                        "which of the following equations could be the other equation",
                        "which of the following could be the other equation"]):
        return True
    return False

def _sys_find_constant_given_point(ctx):
    blob = ctx["blob"]
    if "intersect at" in blob and "value of" in blob:
        return True
    if "system" in blob and any_in(blob, ["where", "if"]) and "value of" in blob and re.search(r"left\s+parenthesis\s+\d+\s+comma", blob):
        return True
    return False

def _sys_num_solutions(ctx):
    blob = ctx["blob"]
    if "how many solutions" in blob and "system" in blob:
        return True
    # A8 widen: "which system of linear equations has no solution?" — answer
    # choices are full systems (1e0a46e4, b3c7ca1d, e77a76ce).
    if any_in(blob, ["which system of linear equations has no solution",
                     "which of the following systems of linear equations has no solution",
                     "which system of linear equations has infinitely many solutions",
                     "which of the following systems of linear equations has infinitely many"]):
        return True
    # A8 widen: "at how many points do the graphs of the given equations
    # intersect" (6a87902f). Pair of linear equations.
    if "at how many points do the graphs" in blob and "intersect" in blob:
        return True
    return False

def _sys_graph_read(ctx):
    blob = ctx["blob"]
    if "system" in blob and any_in(blob, ["graphs of", "graph of"]) and "shown" in blob:
        return True
    if "system" in blob and "intersect" in blob and "shown" in blob:
        return True
    # "at how many points do the graphs of the equations ... intersect"
    if "graphs of the equations" in blob and "intersect" in blob:
        return True
    return False

def _sys_build_from_context(ctx):
    blob = ctx["blob"]
    if "system of equations" in blob:
        if any_in(blob, ["which system", "represents the situation", "represents this situation",
                          "can be used to determine"]):
            return True
        if any_in(blob, ["tickets", "company", "purchased", "store", "ordered", "rented", "sold",
                          "shirts", "pants", "magazines", "books", "novels"]) and any_in(blob, ["which", "system"]):
            return True
    # 2-equation word problem WITHOUT explicit "system"
    has_two_items = re.search(r"(?:standard|premium|adult|child|loaf|loaves|boys|girls|shirts|pants|tickets|chairs|umbrellas)", blob)
    if has_two_items and any_in(blob, ["how many", "how much"]) and "total" in blob:
        if any_in(blob, [" each ", " cost ", " sold ", " purchased ", " ordered ", " bought "]):
            return True
    # A9 widen: classic 2-unknown word-problem markers that the existing
    # has_two_items regex doesn't catch.
    a9_two_items = any_in(blob, [
        "two customers purchased",
        "piece of wire",
        "cut into two parts",
        "types of tickets",
        "shirts and pants",
        "shirts and a pair",
        "3 times as many",
        "three times as many",
        "5 times as many",
        "beach chairs", "umbrellas",
        "outfits for boys", "outfits for girls",
        "voted in favor", "voted against",
        "ran r miles", "biked b miles",
        "correct answers", "incorrect answers",
        "different-sized containers",
        "trivia game",
        "petting zoo",
    ])
    if a9_two_items:
        if any_in(blob, ["how many", "how much", "what is the value of",
                         "what is the cost", "what is the price",
                         "what is the total", "what was the mass",
                         "which of the following systems",
                         "which system"]):
            return True
    # A9 widen: "more than 3 times the number ... [total | combined | sum |
    # completed] ... how many" pattern (4f1342d6 car dealer; c5082ce3 trivia
    # score). Different shape from "shirts and pants".
    if (re.search(r"more than\s+\d+\s+times the number", blob)
            and any_in(blob, ["total", "combined", "completed", "sales", "sum"])
            and any_in(blob, ["how many", "how much"])):
        return True
    # A9 widen: "alloy / mixture / percent" two-unknown systems (7866a908).
    if "alloy" in blob and "percent" in blob and any_in(blob, ["how many", "what was the mass"]):
        return True
    # A9 widen: equation system stated explicitly then asks for an interpretation
    # graph (36f068e2: "the given equations represent ... which graph
    # represents this situation").
    if ("given equations represent" in blob
            and any_in(blob, ["which of the following graphs", "which graph"])):
        return True
    return False

def _sys_solve_elimination(ctx):
    blob = ctx["blob"]
    if "system" in blob and any_in(blob, ["x plus y", "x minus y", "value of x plus y", "value of x minus y", "x y"]):
        if any_in(blob, ["adding", "subtracting", "elimination"]) or "what is the value of x" in blob:
            return True
        return True
    return False

def _sys_solve_substitution(ctx):
    blob = ctx["blob"]
    if "system" in blob and any_in(blob, ["solution to the given system", "solution to the system",
                                          "what is the value of x", "what is the value of y",
                                          "ordered pair"]):
        return True
    if "substituting" in blob and "system" in blob:
        return True
    return False


CATALOG["Systems of two linear equations in two variables"] = [
    ("sys-find-constant-infinite", "Find constant(s) for infinitely many solutions", _sys_find_constant_infinite),
    ("sys-find-constant-nosol", "Find constant(s) for no solution", _sys_find_constant_nosol),
    ("sys-find-constant-given-point", "Find a constant given a particular solution", _sys_find_constant_given_point),
    ("sys-num-solutions", "Determine number of solutions or identify equivalent/parallel", _sys_num_solutions),
    ("sys-graph-read", "Read solution from a graph", _sys_graph_read),
    ("sys-build-from-context", "Build a system from a word problem", _sys_build_from_context),
    ("sys-solve-substitution", "Solve a system by substitution", _sys_solve_substitution),
    ("sys-solve-elimination", "Solve a system by elimination / combination", _sys_solve_elimination),
]
SKILL_META["Systems of two linear equations in two variables"] = ("Algebra", "Math")


# Skill: Algebra :: Linear inequalities in one or two variables
def _lineq_triangle(ctx):
    blob = ctx["blob"]
    if "triangle inequality" in blob:
        return True
    if "triangle" in blob and "third side" in blob:
        return True
    return False

def _lineq_build_compound(ctx):
    blob = ctx["blob"]
    if "between" in blob and " and " in blob:
        if "which inequality" in blob:
            return True
    if any_in(blob, ["no less than", "at least"]) and any_in(blob, ["no more than", "at most"]) and "which" in blob:
        return True
    return False

def _lineq_test_point(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["which point", "which ordered pair", "is a solution to the inequality",
                     "is a solution to the system of inequalities",
                     "which of the following could be a solution",
                     "satisfies the inequality", "satisfies the system of inequalities"]):
        return True
    if "which" in blob and "table" in blob and "inequality" in blob:
        return True
    return False

def _lineq_graph_read(ctx):
    blob = ctx["blob"]
    if "inequality" in blob and ("graph of" in blob or "shaded" in blob or "boundary line" in blob):
        if "which inequality" in blob:
            return True
    return False

def _lineq_solve_1var(ctx):
    blob = ctx["blob"]
    # No narrative, just inequality + asks greatest/least value
    if "inequality" in blob and any_in(blob, ["greatest", "least", "solution set", "equivalent to the inequality"]):
        # No word problem signal
        if not any_in(blob, [" he ", " she ", " they ", "company", "store", "student", "essay",
                              "needs", "hours", "ticket"]):
            return True
    return False

def _lineq_build_2var(ctx):
    blob = ctx["blob"]
    if "inequality" in blob and any_in(blob, ["interpretation", "best interpretation",
                                              "rectangle", "perimeter", "length", "width"]):
        if any_in(blob, ["less than or equal to", "greater than or equal to"]):
            return True
    if "which inequality represents" in blob and re.search(r"\b[a-z]\s+(?:small|large|large pizzas|adult|child)", blob):
        return True
    if "which inequality" in blob and ("x" in blob and "y" in blob) and not any_in(blob, ["which point", "ordered pair", "table"]):
        return True
    # A22 widen: two-variable inequality from a multi-unknown word problem.
    # Requires an explicit pair of variable letters in the stem (e.g.
    # "r is the number of hours rhett drove and j is the number of hours
    # jessica drove" — ee439cff; "t, the number of years after installation"
    # alone would be 1var so we require two named variables).
    if any_in(blob, ["which of the following inequalities can be solved",
                     "which of the following inequalities represents"]):
        # Look for explicit two-variable framing: ", where X is ... and Y is".
        if re.search(r"\bwhere\s+[a-z]\s+is.+?\s+and\s+[a-z]\s+is\s", blob):
            return True
        # OR the answer contains both x and y (or two distinct named vars).
        ans = ctx["answer_text"]
        # Heuristic: a 2-var inequality has both x and y letters in the answer.
        if re.search(r"\bx\b", ans) and re.search(r"\by\b", ans):
            return True
    # A22 widen: bus-vs-walk-style inequality (45cfb9de "which of the
    # following inequalities gives the values of w for which it would be
    # faster for adam to walk to school"). One variable but two scenarios.
    if "which of the following inequalities gives the values" in blob:
        # 45cfb9de is conceptually 1-var (only w). Route via 1-var below.
        # Tag as 2-var only when answer explicitly uses x and y.
        ans = ctx["answer_text"]
        if re.search(r"\bx\b", ans) and re.search(r"\by\b", ans):
            return True
    return False

def _lineq_build_1var(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["at most", "at least", "no more than", "no less than", "exceeds", "more than",
                     "minimum number", "maximum number", "greatest possible", "least possible",
                     "minimum value", "maximum value"]):
        return True
    # A22 widen: budget + sales-tax style word problems where the inequality
    # is implicit ("maximum possible price per chair, before sales tax" —
    # 03503d49). The stem isn't an explicit "at most"/"at least" but the
    # task is to find a max-bounded value from a fixed budget.
    if (("total budget" in blob or "budget" in blob)
            and any_in(blob, ["sales tax", "%", "percent"])
            and any_in(blob, ["maximum possible", "minimum possible",
                              "closest to the maximum", "closest to the minimum",
                              "could pay based on this budget"])):
        return True
    # A22 widen: "inequality is true for any recorded temperature" (2869fe95)
    # — building a compound inequality from observed min/max range.
    if "inequality is true for any recorded" in blob:
        return True
    # A22 widen: "between X and Y inclusive ... which of the following could
    # be" (915463e0).
    if "inclusive" in blob and any_in(blob, ["between", "from"]):
        if any_in(blob, ["which of the following could be",
                          "which of the following is",
                          "could be his", "could be the"]):
            return True
    # A22 widen: "which of the following inequalities can be solved to find
    # T, the number of years after installation" (90bd9ef8) — single
    # variable T, payback inequality.
    if any_in(blob, ["which of the following inequalities can be solved to find",
                     "which of the following inequalities can be used to find"]):
        return True
    # A22 widen: bus-vs-walk-style 1-var inequality (45cfb9de). The variable
    # is W (waiting time); the question asks for W-values for which walking
    # is faster.
    if ("which of the following inequalities gives the values" in blob
            and "faster" in blob):
        return True
    return False


# (re-declare CATALOG below)


CATALOG["Linear inequalities in one or two variables"] = [
    ("lineq-build-compound", "Build a compound (between / inclusive range) inequality", _lineq_build_compound),
    ("lineq-triangle-inequality", "Triangle inequality / geometric inequality", _lineq_triangle),
    ("lineq-test-point", "Test which ordered pair satisfies an inequality/system", _lineq_test_point),
    ("lineq-graph-read", "Identify inequality from a shaded graph", _lineq_graph_read),
    ("lineq-solve-1var", "Solve a one-variable linear inequality (algebraic)", _lineq_solve_1var),
    ("lineq-build-2var-context", "Build a two-variable inequality from context", _lineq_build_2var),
    ("lineq-build-1var-context", "Build a one-variable inequality from context", _lineq_build_1var),
]
SKILL_META["Linear inequalities in one or two variables"] = ("Algebra", "Math")


# ----------------------------------------------------------------------------
# MATH BATCH B
# ----------------------------------------------------------------------------

# Skill: Geometry and Trigonometry :: Area and volume
def _av_prism(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["prism", "rectangular box", "cube", "right rectangular"]):
        return True
    return False

def _av_cylinder(ctx):
    blob = ctx["blob"]
    if "cylinder" in blob or "cylindrical" in blob:
        return True
    return False

def _av_similar_scale(ctx):
    blob = ctx["blob"]
    if "similar" in blob and any_in(blob, ["volume", "area", "scale"]):
        return True
    if "scale factor" in blob or "scale model" in blob:
        return True
    return False

def _av_circle(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["circumference", "circle"]):
        return True
    if "area of" in blob and "circle" in blob:
        return True
    return False

def _av_triangle(ctx):
    blob = ctx["blob"]
    if "triangle" in blob and any_in(blob, ["area", "perimeter", "base", "height"]):
        return True
    return False

def _av_rectangle_square(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["rectangle", "square", "parallelogram"]):
        return True
    return False


CATALOG["Area and volume"] = [
    ("av-prism", "3D prism / box volume & surface area", _av_prism),
    ("av-cylinder", "Right cylinder volume", _av_cylinder),
    ("av-similar-scale", "Similarity / scale-factor area & volume", _av_similar_scale),
    ("av-circle", "Circle area / circumference / diameter", _av_circle),
    ("av-triangle", "Triangle area / perimeter / side", _av_triangle),
    ("av-rectangle-square", "Rectangle / square area, perimeter, side", _av_rectangle_square),
]
SKILL_META["Area and volume"] = ("Geometry and Trigonometry", "Math")


# Skill: Geometry and Trigonometry :: Lines, angles, and triangles
def _lat_parallel_transversal(ctx):
    blob = ctx["blob"]
    if "parallel" in blob and any_in(blob, ["intersect", "lines", "transversal"]):
        return True
    if any_in(blob, ["alternate interior", "corresponding angles", "transversal"]):
        return True
    return False


# A25 new aspect: lat-intersecting-lines. Captures stems where two or three
# lines intersect at a point and the question asks for an angle measure (using
# vertical-angle / linear-pair reasoning). Distinct from
# lat-parallel-transversal (no parallel lines) and lat-triangle-angle-sum (no
# triangle).
def _lat_intersecting_lines(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["two lines intersect", "three lines intersect",
                     "lines intersect at a point",
                     "lines intersect at point",
                     "lines intersect at exactly one point"]):
        if any_in(blob, ["vertical angles", "vertical angle",
                          "linear pair", "supplementary angles",
                          "adjacent angles are supplementary",
                          "opposite angles are congruent",
                          "sum of the measures",
                          "value of z", "value of w", "value of x",
                          "measure of angle", "what is the value",
                          "what is the measure"]):
            return True
    # "at the intersection of the 2 lines, the angles are labeled" (64d1f49f,
    # a456f28c diagram-description).
    if "at the intersection of the" in blob and "lines" in blob:
        return True
    return False

def _lat_similar(ctx):
    blob = ctx["blob"]
    if "similar" in blob and "triangle" in blob:
        return True
    if "corresponds to" in blob:
        return True
    return False

def _lat_congruent(ctx):
    blob = ctx["blob"]
    if "congruent" in blob and "triangle" in blob:
        return True
    return False

def _lat_isosceles(ctx):
    blob = ctx["blob"]
    if "isosceles" in blob or "equilateral" in blob:
        return True
    return False

def _lat_exterior(ctx):
    blob = ctx["blob"]
    if "exterior angle" in blob:
        return True
    return False

def _lat_triangle_sum(ctx):
    blob = ctx["blob"]
    if "triangle" in blob and any_in(blob, ["angle", "measure of"]):
        return True
    return False


CATALOG["Lines, angles, and triangles"] = [
    ("lat-parallel-transversal", "Parallel lines cut by a transversal", _lat_parallel_transversal),
    ("lat-intersecting-lines", "Intersecting lines: vertical angles / linear pair", _lat_intersecting_lines),
    ("lat-similar-triangles", "Similar triangles / proportional sides", _lat_similar),
    ("lat-congruent-triangles", "Congruent triangles / corresponding parts", _lat_congruent),
    ("lat-isosceles-equilateral", "Isosceles / equilateral angle reasoning", _lat_isosceles),
    ("lat-exterior-angle", "Exterior-angle theorem", _lat_exterior),
    ("lat-triangle-angle-sum", "Interior angle sum in a triangle", _lat_triangle_sum),
]
SKILL_META["Lines, angles, and triangles"] = ("Geometry and Trigonometry", "Math")


# Skill: Geometry and Trigonometry :: Right triangles and trigonometry
def _rtt_special(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["30-60-90", "45-45-90", "30 degrees", "60 degrees", "45 degrees"]):
        return True
    if "equilateral" in blob and "triangle" in blob:
        return True
    return False

def _rtt_sin_cos_complement(ctx):
    blob = ctx["blob"]
    if "sine" in blob and "cosine" in blob:
        if "90" in blob or "complement" in blob:
            return True
    return False

def _rtt_sohcahtoa(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["sine of", "cosine of", "tangent of", "sine", "cosine", "tangent"]):
        return True
    return False

def _rtt_similar_right(ctx):
    blob = ctx["blob"]
    if "similar" in blob and ("right triangle" in blob or "right triangles" in blob):
        return True
    return False

def _rtt_pythag(ctx):
    blob = ctx["blob"]
    if "pythagorean" in blob:
        return True
    if any_in(blob, ["legs", "hypotenuse"]):
        return True
    if "right triangle" in blob:
        return True
    return False


CATALOG["Right triangles and trigonometry"] = [
    ("rtt-special-triangles", "30-60-90, 45-45-90, equilateral", _rtt_special),
    ("rtt-sin-cos-complement", "sin(x) = cos(90 - x) identity", _rtt_sin_cos_complement),
    ("rtt-similar-right", "Similar right triangles", _rtt_similar_right),
    ("rtt-sohcahtoa", "Sine, cosine, tangent ratios", _rtt_sohcahtoa),
    ("rtt-pythag-basic", "Pythagorean theorem: find side", _rtt_pythag),
]
SKILL_META["Right triangles and trigonometry"] = ("Geometry and Trigonometry", "Math")


# Skill: Geometry and Trigonometry :: Circles
def _cir_radians(ctx):
    blob = ctx["blob"]
    if "radian" in blob and "degree" in blob:
        return True
    return False

def _cir_eq_complete_square(ctx):
    blob = ctx["blob"]
    if "completing the square" in blob or "complete the square" in blob:
        return True
    # x^2 + Bx + y^2 + Cy = D pattern (no parens around (x-h)^2)
    if "x squared" in blob and "y squared" in blob and "circle" in blob:
        if not re.search(r"left\s+parenthesis\s+x\s+(?:minus|plus)\s+\d+\s+right\s+parenthesis\s+squared", blob):
            return True
    return False

def _cir_eq_extract(ctx):
    blob = ctx["blob"]
    if "circle" in blob and any_in(blob, ["center", "radius", "diameter", "length of the radius"]):
        if re.search(r"left\s+parenthesis\s+x\s+(?:minus|plus)", blob) and "squared" in blob:
            return True
    return False

def _cir_eq_find(ctx):
    blob = ctx["blob"]
    if "circle" in blob and any_in(blob, ["which equation represents", "equation of the circle",
                                          "equation of a circle"]):
        return True
    return False

def _cir_arc_sector(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["minor arc", "major arc", "length of arc", "arc length", "sector",
                     "fraction of the circumference"]):
        return True
    return False

def _cir_tangent_chord(ctx):
    blob = ctx["blob"]
    if "tangent" in blob or "chord" in blob:
        return True
    return False

def _cir_central(ctx):
    blob = ctx["blob"]
    if "central angle" in blob or "inscribed angle" in blob or "measure of arc" in blob:
        return True
    return False

def _cir_unit_circle(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["cosine", "sine"]) and "pi" in blob and "radian" not in blob:
        if "value of" in blob:
            return True
    return False

def _cir_points_props(ctx):
    blob = ctx["blob"]
    if "circle" in blob and any_in(blob, ["endpoints of", "endpoints of a diameter", "three points"]):
        return True
    # A23 widen: triangle inscribed in / formed with a circle (196e8e6e
    # right-angle chord; 24cec8d1 isosceles ORS; 9adb86ed perimeter of PQR;
    # 35d37640 unit-circle angle). Stem contains both "circle" and
    # "triangle" / a triangle-vertex name pattern.
    if "circle" in blob and any_in(blob, ["triangle", "right angle",
                                           "right triangle"]):
        if any_in(blob, ["what is the length",
                          "what is the measure",
                          "what is the perimeter",
                          "what is the area",
                          "positive measure of angle",
                          "measure of angle",
                          "length of line segment"]):
            return True
    # A23 widen: "lie on a circle ... triangle has a perimeter of N inches"
    # (9adb86ed). Even if rationale doesn't mention "triangle" word.
    if ("lie on a circle" in blob or "lies on a unit circle" in blob
            or "lies on the circle" in blob or "lie on the circle" in blob):
        if any_in(blob, ["perimeter of", "length of line segment",
                          "positive measure of angle",
                          "right angle", "is a right angle"]):
            return True
    return False


CATALOG["Circles"] = [
    ("cir-radians-degrees", "Radian-degree conversion", _cir_radians),
    ("cir-eq-complete-square", "Complete the square to find circle", _cir_eq_complete_square),
    ("cir-arc-sector", "Arc length / sector / fraction of circumference", _cir_arc_sector),
    ("cir-tangent-chord", "Tangent line / chord properties", _cir_tangent_chord),
    ("cir-central-inscribed-arc", "Central or inscribed angle <-> arc", _cir_central),
    ("cir-trig-unit-circle", "Unit-circle trig values", _cir_unit_circle),
    ("cir-points-properties", "Geometry on a circle (chords through center, etc.)", _cir_points_props),
    ("cir-eq-extract", "Read center/radius from given equation", _cir_eq_extract),
    ("cir-eq-find", "Write/choose equation of a circle", _cir_eq_find),
]
SKILL_META["Circles"] = ("Geometry and Trigonometry", "Math")


# Skill: PSDA :: Ratios, rates, proportional relationships, and units
def _rpr_density(ctx):
    blob = ctx["blob"]
    if "density" in blob or "grams per cubic" in blob or "kilograms per cubic" in blob:
        return True
    return False

def _rpr_speed_time_distance(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["miles per hour", "meters per second", "kilometers per hour",
                     "average speed", "feet per second", "kilometers per second"]):
        return True
    # A14 widen: "at this rate" + a constant-rate-in-X-per-Y stem (be35c117
    # revolutions/minute; fe4c1c9e items/hour). Excludes unit-conversion
    # framings ("at what rate, in X per Y" / "how many X in Y") which belong
    # to rpr-unit-convert-rate / rpr-unit-convert-length.
    if ("at this rate" in blob
            and "at what rate" not in blob):
        # Skip when the stem is a unit conversion ("how many MINUTES does
        # it take to PIT N POUNDS" — fe1ec415 — where the rate is given and
        # we're converting between time units).
        has_conversion_ask = (
            re.search(r"how many\s+(?:minutes|seconds|hours|days|weeks)\s+does it take", blob)
            or re.search(r"how many\s+(?:minutes|seconds|hours|days|weeks)\s+will it take", blob)
        )
        if not has_conversion_ask:
            if any_in(blob, ["revolutions per minute",
                              "items per hour",
                              "items per minute",
                              "revolutions", "items"]):
                return True
    if "at a constant rate of" in blob and any_in(blob, ["per hour", "per minute",
                                                          "per day", "per second"]):
        # Skip when "at what rate" appears (= conversion question).
        if "at what rate" not in blob:
            return True
    # A14 widen: "how many miles did ... travel per day" (000259aa).
    if re.search(r"how many [a-z]+ did .* (?:travel|fly|drive|run|walk) per", blob):
        return True
    if re.search(r"on average, how many [a-z]+ .* per ", blob):
        return True
    return False

def _rpr_unit_price(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["per pound", "per ounce", "per gallon", "cost per", "price per",
                     "dollars per", "per kilogram", "per unit"]):
        return True
    return False

def _rpr_scale_model(ctx):
    blob = ctx["blob"]
    if "scale" in blob and any_in(blob, ["represents", "drawing", "model"]):
        if any_in(blob, ["inch", "foot", "centimeter", "meter"]):
            return True
    return False

def _rpr_unit_convert_area_vol(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["square miles", "square yards", "square feet", "cubic feet",
                     "cubic yards", "cubic meter", "cubic centimeter", "square kilometers"]):
        if any_in(blob, ["convert", "equivalent", "equal to", "approximately"]):
            return True
    return False

def _rpr_unit_convert_rate(ctx):
    blob = ctx["blob"]
    # "at what rate, in X per Y, does..."
    if "at what rate" in blob:
        return True
    matches = re.findall(r"per\s+\w+", blob)
    if len(matches) >= 2:
        if any_in(blob, ["convert", "at what rate", "equivalent rate"]):
            return True
    if re.search(r"per\s+\w+\s+squared", blob):
        return True
    return False

def _rpr_unit_convert_length(ctx):
    blob = ctx["blob"]
    if re.search(r"\d[\d,.]*\s+\w+\s+equals\s+\d", blob):
        return True
    if re.search(r"\d+\s+\w+\s*=\s*\d+\s*\w+", blob):
        return True
    if any_in(blob, ["how many", "how far"]) and any_in(blob, ["equivalent to", "in miles", "in yards",
                                                                "in meters", "in centimeters", "in inches",
                                                                "in grams", "in kilograms", "in feet"]):
        if any_in(blob, ["yards", "feet", "meters", "inches", "miles", "centimeters", "kilometers",
                         "teaspoons", "tablespoons", "cups", "ounces", "rods", "minutes", "seconds",
                         "grams", "kilograms", "pesos", "dollars"]):
            return True
    return False

def _rpr_proportional_symbolic(ctx):
    blob = ctx["blob"]
    if re.search(r"mass\s+of\s+[a-z]\s+identical", blob):
        return True
    if "which expression represents" in blob and any_in(blob, ["mass", "weight", "volume"]):
        return True
    # A14 widen: symbolic rate stems "X items per Y units, which expression
    # represents the number/time when ..." (21e539a0 88x oz in 5y min;
    # 50b99b2d 4x in y seconds).
    if "which expression represents" in blob:
        if any_in(blob, ["at this rate", "constant speed", "constant rate"]):
            return True
        # variables-in-rate form: "N x ... in M y minutes"
        if (re.search(r"[a-z]\s+(?:ounces|inches|gallons|feet|grams|liters)", blob)
                and re.search(r"[a-z]\s+(?:minutes|seconds|hours|days)", blob)
                and any_in(blob, ["how many", "puts", "travel", "speed"])):
            return True
    return False

def _rpr_one_step(ctx):
    blob = ctx["blob"]
    if "for every" in blob or "for each" in blob:
        return True
    if "if " in blob and "produces" in blob:
        return True
    # A14 widen: "X square feet per person ... maximum number of people"
    # (99550621). Single-step proportion with explicit per-unit ratio.
    if any_in(blob, ["square feet per person",
                     "square feet per",
                     "per person"]) and any_in(blob, ["maximum number of",
                                                       "minimum number of",
                                                       "how many",
                                                       "how much"]):
        return True
    return False

def _rpr_ratio(ctx):
    blob = ctx["blob"]
    if "ratio" in blob or "proportional" in blob or "proportion" in blob:
        return True
    return False


# B6 new aspect: rpr-symbolic-fraction-equation. Captures the "if a/b = K and
# c/d = M, what is the value of n" template (3726e079, 8637294f, 808f7d6c)
# where the question rearranges symbolic proportion equations to solve for a
# variable in the denominator/numerator. Distinct from rpr-proportional-
# symbolic (which is about expressions, not equations).
def _rpr_symbolic_fraction_equation(ctx):
    blob = ctx["blob"]
    # Two fraction-equation premises + asks for value of a single variable.
    fraction_count = blob.count("startfraction")
    if fraction_count >= 2 and any_in(blob, ["value of n", "value of k",
                                              "value of a", "value of b"]):
        if any_in(blob, ["which of the following is equivalent",
                         "what is the value of"]):
            return True
    # Fallback for 808f7d6c whose MathML strips out entirely and stem is just
    # "if , which of the following is equivalent to ?" — heuristic uses the
    # rationale words.
    rat = ctx["rationale_text"]
    if ("multiplying both sides of this equation" in rat
            and ("which of the following is equivalent" in blob
                 or "which of the following is" in blob)):
        if any_in(rat, ["dividing both sides", "multiplying both sides",
                        "value of n"]):
            return True
    return False


CATALOG["Ratios, rates, proportional relationships, and units"] = [
    ("rpr-density", "Density problems", _rpr_density),
    ("rpr-rate-speed-time-distance", "Speed / time / distance", _rpr_speed_time_distance),
    ("rpr-unit-price", "Unit price (price/cost per unit)", _rpr_unit_price),
    ("rpr-scale-model", "Scale model / drawing", _rpr_scale_model),
    ("rpr-unit-convert-area-vol", "Square / cubic unit conversion", _rpr_unit_convert_area_vol),
    ("rpr-unit-convert-rate", "Compound-rate unit conversion", _rpr_unit_convert_rate),
    ("rpr-unit-convert-length", "One-step unit conversion (length/volume/time)", _rpr_unit_convert_length),
    # Merged: rpr-symbolic-fraction-equation -> rpr-proportional-symbolic
    ("rpr-proportional-symbolic", "Symbolic / algebraic proportional expression", _rpr_symbolic_fraction_equation),
    ("rpr-proportional-symbolic", "Symbolic / algebraic proportional expression", _rpr_proportional_symbolic),
    # Merged: rpr-one-step-proportion -> rpr-ratio-equivalent
    ("rpr-ratio-equivalent", "Equivalent ratios / proportion solve", _rpr_one_step),
    ("rpr-ratio-equivalent", "Equivalent ratios / proportion solve", _rpr_ratio),
]
SKILL_META["Ratios, rates, proportional relationships, and units"] = ("Problem-Solving and Data Analysis", "Math")


# Skill: PSDA :: Percentages
def _pct_chained_two_step(ctx):
    blob = ctx["blob"]
    # Two relations chained
    g_count = blob.count("percent sign greater than") + blob.count("percent greater than") + len(re.findall(r"percent\s+(?:greater|less|more)\s+than", blob))
    if g_count >= 2:
        return True
    # "X% greater than Y; Y is Z% less than W"
    if any_in(blob, ["percent sign greater than", "percent greater than", "percent sign less than", "percent less than"]):
        # require two such phrases or a 'percent' mention twice
        if blob.count("percent") >= 4:
            return True
    # A16 widen: depreciation / year-over-year (566759ef "depreciate by 20%
    # of the previous year's value"; 63573fea repeated month-over-month
    # returns).
    has_pct = any_in(blob, ["percent", "%", "percent sign"])
    if any_in(blob, ["depreciate by", "depreciates by",
                     "previous year's value", "previous year's estimated value",
                     "previous month's value"]):
        if has_pct and any_in(blob, ["estimated value", "what is the",
                                      "how many", "total", "after"]):
            return True
    # A16 widen: "if sales and the return rate remain the same for each of the
    # next N months" (63573fea) — chained percent application over a horizon.
    if "return rate" in blob and "remain the same" in blob and has_pct:
        return True
    return False

def _pct_table_multiplier(ctx):
    blob = ctx["blob"]
    if "table" in blob and ("percent" in blob or "percentage" in blob):
        if any_in(blob, ["what percent", "which percent"]):
            return True
    return False

def _pct_multiplier_times(ctx):
    blob = ctx["blob"]
    if re.search(r"1\s*point\s*\d+\s+(times|multiplied by)", blob):
        return True
    if re.search(r"1\.\d+\s+(?:times|multiplied)", blob):
        return True
    return False

def _pct_reverse_find_whole(ctx):
    blob = ctx["blob"]
    if "percent of what number" in blob or "percent sign of what number" in blob:
        return True
    if re.search(r"is\s+\d+\s*percent\s+of\s+what", blob):
        return True
    if "value of p" in blob and "percent" in blob and "what is the value of p" in blob:
        return True
    return False

def _pct_change(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["percent increase", "percent decrease", "percent change", "percent sign increase",
                     "increased by", "decreased by", "sale price", "discount", "reduced by"]):
        if "percent" in blob or "%" in blob or "percent sign" in blob:
            return True
    # A16 widen: "projected to increase by N percent / N%" (194ae3b1) —
    # forward-projection single-step percent change.
    if any_in(blob, ["projected to increase by", "projected to decrease by",
                     "will increase by", "will decrease by"]):
        if any_in(blob, ["percent", "%", "percent sign"]):
            return True
    return False

def _pct_greater_less(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["percent greater than", "percent less than", "percent more than",
                     "percent sign greater than", "percent sign less than", "percent sign more than"]):
        return True
    return False

def _pct_basic_find_part(ctx):
    blob = ctx["blob"]
    # "X percent of N" or "what is X% of Y"
    if re.search(r"\d+\s+percent\s+sign\s+of\s+\d+", blob):
        return True
    if re.search(r"\d+\s+percent\s+of\s+\d+", blob):
        return True
    if "percent sign of" in blob or "percent of" in blob:
        if any_in(blob, ["what is", "how many", "how much"]):
            return True
    # Word problems with percent
    if "percent sign" in blob or " percent " in blob:
        return True
    return False


# B7 new aspect: pct-tax-tip-sales. Applies a tax / tip / sales-tax percent in
# a single step (Y + X%·Y or X%·Y for tip computation). Distinct from
# pct-basic-find-part because the framing is a real-world tax/tip word problem
# and from pct-pct-greater-less because the answer is an absolute total, not
# a comparison. Cluster: 6e4a60dd, 8705ecba, 7ed0d098, a8fabad0, 41b71b4e.
def _pct_tax_tip_sales(ctx):
    blob = ctx["blob"]
    stem_text = ctx["stem_text"]
    # Tip-style: "left a tip of X%" / "tip is N%" / "what was the amount of
    # the tip" (6e4a60dd, a8fabad0).
    if any_in(blob, [" tip ", " tip,", "tip of", "a tip of",
                     "amount of the tip", "the tip"]) and "%" in blob:
        if any_in(blob, ["what was the amount", "what is the amount",
                         "closest to the tip", "would expect to leave",
                         "would expect to receive",
                         "amount of the tip"]) or "tip of" in blob:
            return True
    # Sales tax (8705ecba): "before a 5% sales tax is added ... what is the
    # total cost".
    if any_in(blob, ["sales tax", "sales-tax"]) and any_in(
            blob, ["%", "percent", "percent sign"]):
        if any_in(blob, ["total cost", "total price", "what is the total",
                          "how much in total", "after sales tax",
                          "including sales tax", "is added"]):
            return True
    # "X% of an 8-hour workday" / pure percent-of-time variant (7ed0d098).
    # Distinct from pct-basic-find-part because the workday is in hours and
    # the answer is in minutes — a unit-conversion step.
    if "workday" in blob and "%" in blob and "minutes" in blob:
        return True
    # 41b71b4e: "what number is 20% greater than 60". Stripped of "percent"
    # word — uses literal %. This is the one-step "X% greater than Y" framing.
    if re.search(r"\d+\s*%\s*(?:greater|more|less|fewer)\s+than\s+\d+", blob):
        return True
    return False


CATALOG["Percentages"] = [
    ("pct-tax-tip-sales", "Apply a tax / tip / sales-tax percent in a single step", _pct_tax_tip_sales),
    ("pct-chained-two-step", "Two chained percent-greater/less", _pct_chained_two_step),
    ("pct-table-multiplier", "Table-driven percent share", _pct_table_multiplier),
    ("pct-multiplier-times", "Multiplier hidden as 'times'", _pct_multiplier_times),
    ("pct-reverse-find-whole", "Reverse: find the original or whole", _pct_reverse_find_whole),
    ("pct-pct-change", "Percent increase / decrease over time", _pct_change),
    ("pct-pct-greater-less", "One-step 'X% greater/less than'", _pct_greater_less),
    ("pct-basic-find-part", "Basic find-the-part", _pct_basic_find_part),
]
SKILL_META["Percentages"] = ("Problem-Solving and Data Analysis", "Math")


# Skill: PSDA :: One-variable data
def _ov_compare_two_sets(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["data set a", "data set b", "data set 1", "data set 2",
                     "group 1", "group 2", "list a", "list b", "the two data sets"]):
        return True
    if "two data sets" in blob or "two groups" in blob:
        return True
    if "combined" in blob and "mean" in blob:
        return True
    return False

def _ov_dot_plot(ctx):
    return "dot plot" in ctx["blob"]

def _ov_box_plot(ctx):
    return "box plot" in ctx["blob"] or "boxplot" in ctx["blob"]

def _ov_freq_table(ctx):
    blob = ctx["blob"]
    if "frequency" in blob and ("table" in blob or "distribution" in blob):
        return True
    return False

def _ov_sd_spread(ctx):
    return "standard deviation" in ctx["blob"]

def _ov_range_iqr(ctx):
    blob = ctx["blob"]
    if "interquartile" in blob or "iqr" in blob:
        return True
    if "range of" in blob and ("data" in blob or "set" in blob):
        return True
    return False

def _ov_median(ctx):
    return "median" in ctx["blob"]

def _ov_mean(ctx):
    blob = ctx["blob"]
    return "mean" in blob or "average" in blob


# B9 new aspect: ov-bar-graph-read. Inserted AFTER existing rules but BEFORE the
# catch-all (which is appended by _install_catch_alls). This way it only catches
# the residual that no earlier predicate handled — i.e. it absorbs ov-other
# bar-graph-read questions without flipping already-tagged items.
def _ov_bar_graph_read(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["bar graph", "pictograph", "the histogram shows"]):
        if any_in(blob, ["how many", "which value", "which color", "which letter",
                         "which type", "how many more", "how many fewer",
                         "what is the median", "what is the value"]):
            return True
    return False


CATALOG["One-variable data: Distributions and measures of center and spread"] = [
    ("ov-compare-two-sets", "Compare two named datasets", _ov_compare_two_sets),
    ("ov-dot-plot", "Dot-plot reading", _ov_dot_plot),
    ("ov-box-plot", "Box-plot reading", _ov_box_plot),
    ("ov-freq-table-center", "Frequency table center", _ov_freq_table),
    ("ov-sd-spread", "Standard deviation / spread comparison", _ov_sd_spread),
    ("ov-range-iqr", "Range / interquartile range", _ov_range_iqr),
    ("ov-median-from-list", "Find median of a list", _ov_median),
    ("ov-mean-from-list", "Find or use the mean", _ov_mean),
    ("ov-bar-graph-read", "Read a value from a bar graph / pictograph / histogram", _ov_bar_graph_read),
]
SKILL_META["One-variable data: Distributions and measures of center and spread"] = ("Problem-Solving and Data Analysis", "Math")


# Skill: PSDA :: Two-variable data
def _tv_exponential(ctx):
    blob = ctx["blob"]
    if "exponential" in blob:
        return True
    if any_in(blob, ["increases by", "decreases by"]) and "percent" in blob and any_in(blob, ["each year", "annually"]):
        return True
    return False

def _tv_line_graph(ctx):
    blob = ctx["blob"]
    return "line graph" in blob

def _tv_identify_nonlinear(ctx):
    blob = ctx["blob"]
    if "table" in blob and any_in(blob, ["linear", "nonlinear", "quadratic"]):
        if "relationship" in blob or "best describes" in blob:
            return True
    return False

def _tv_best_fit_equation(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["which equation best models", "best models the data", "best models the relationship",
                     "equation of the line of best fit", "equation of best fit"]):
        return True
    return False

def _tv_best_fit_predict(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["line of best fit", "best-fit line", "scatterplot", "scatter plot"]):
        return True
    return False


# B8 new aspect: tv-cooling-warming-curve. Reads a value from a non-linear
# graph (cooling, stopping distance, momentum-with-asymptote) where the
# question asks "best estimate" / "approximately" / "greatest average rate".
# Distinct from tv-best-fit-predict (line of best fit on a scatterplot).
def _tv_cooling_warming_curve(ctx):
    blob = ctx["blob"]
    phenomenon = any_in(blob, ["temperature", "stopping distance",
                                "braking distance", "cooling", "coffee",
                                "momentum", "newton-seconds",
                                "warming"])
    # Require an explicit non-linear curve signal — exclude scatterplots that
    # show a linear pattern (those belong to tv-best-fit-predict).
    has_curve_signal = any_in(blob, ["the curve", "curve rises",
                                      "curve trends", "curve falls",
                                      "rises sharply", "rises gradually",
                                      "10-minute intervals",
                                      "stopping distance"])
    if not (phenomenon and has_curve_signal):
        return False
    # Skip linear-pattern scatterplots (line-of-best-fit territory).
    if any_in(blob, ["linear pattern", "line of best fit", "best-fit line"]):
        return False
    if any_in(blob, ["best estimate", "approximately",
                      "greatest average rate",
                      "least average rate",
                      "average rate of change",
                      "interval"]):
        return True
    return False


CATALOG["Two-variable data: Models and scatterplots"] = [
    ("tv-exponential-model", "Exponential growth/decay model", _tv_exponential),
    ("tv-line-graph-read", "Line graph reading", _tv_line_graph),
    ("tv-identify-nonlinear", "Linear vs nonlinear from table", _tv_identify_nonlinear),
    ("tv-best-fit-equation", "Choose/interpret equation of best fit", _tv_best_fit_equation),
    ("tv-cooling-warming-curve", "Estimate from a non-linear curve (cooling, stopping, growth-then-asymptote)", _tv_cooling_warming_curve),
    ("tv-best-fit-predict", "Predict / interpolate from line of best fit", _tv_best_fit_predict),
]
SKILL_META["Two-variable data: Models and scatterplots"] = ("Problem-Solving and Data Analysis", "Math")


# Skill: PSDA :: Probability and conditional probability
def _prob_two_way_conditional(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["of those who", "of the men", "of the women", "of the males",
                     "of the females", "given that",
                     "of the students who", "of the customers who"]):
        return True
    # "If one of the men/women/students/etc."
    if re.search(r"if\s+one\s+of\s+the\s+(?:men|women|students|customers|days|adults|surveyed)", blob):
        return True
    return False

def _prob_two_way_joint(ctx):
    blob = ctx["blob"]
    if "table" in blob and "probability" in blob:
        if any_in(blob, ["selected at random", "chosen at random"]):
            return True
    return False

def _prob_simple_list(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["fair", "sided die", "spinner", "vertices labeled", "rolled"]):
        return True
    return False

def _prob_simple_population(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["on a street", "households", "trees", "planets", "houses", "shipment",
                     "marbles", "bag contains", "data set"]):
        if "probability" in blob:
            return True
    if "probability" in blob and any_in(blob, ["randomly selected", "selected at random",
                                                "chosen at random"]) and "fraction" not in blob:
        return True
    return False

def _prob_freq_table(ctx):
    blob = ctx["blob"]
    if "frequency" in blob and "probability" in blob:
        return True
    return False


CATALOG["Probability and conditional probability"] = [
    ("prob-two-way-conditional", "Conditional from two-way table", _prob_two_way_conditional),
    ("prob-simple-list-die", "Equally-likely outcomes (die, spinner, labels)", _prob_simple_list),
    ("prob-simple-population", "Simple ratio from a single-attribute group", _prob_simple_population),
    ("prob-frequency-table", "One-way frequency table", _prob_freq_table),
    ("prob-two-way-joint", "Joint / marginal from two-way table", _prob_two_way_joint),
]
SKILL_META["Probability and conditional probability"] = ("Problem-Solving and Data Analysis", "Math")


# Skill: PSDA :: Inference from sample statistics and margin of error
def _inf_margin_of_error_ci(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["margin of error", "confidence interval", "plausible value", "plausible mean",
                     "plausible proportion", "95% confidence"]):
        return True
    if "plausible" in blob and any_in(blob, ["mean", "proportion", "value"]):
        return True
    return False

def _inf_scale_up_count(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["random sample", "randomly selected", "selected at random",
                     "randomly selects", "selected 20", "selected 50"]):
        if any_in(blob, ["estimate the number", "best estimate", "expected number",
                         "estimate of the total", "about how many", "would be expected",
                         "approximately how many", "based on the table"]):
            return True
    if "estimate the number" in blob or "best estimate of the number" in blob:
        return True
    return False

def _inf_conclusion_validity(ctx):
    blob = ctx["blob"]
    if "most appropriate conclusion" in blob or "best conclusion" in blob:
        return True
    return False


CATALOG["Inference from sample statistics and margin of error"] = [
    ("inf-margin-of-error-ci", "Margin of error / CI interpretation", _inf_margin_of_error_ci),
    ("inf-scale-up-count", "Scale sample count to population", _inf_scale_up_count),
    ("inf-conclusion-validity", "Most appropriate conclusion from sample", _inf_conclusion_validity),
]
SKILL_META["Inference from sample statistics and margin of error"] = ("Problem-Solving and Data Analysis", "Math")


# Skill: PSDA :: Evaluating statistical claims
def _esc_random_assign(ctx):
    blob = ctx["blob"]
    if "randomly assigned" in blob or "random assignment" in blob:
        return True
    return False

def _esc_biased(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["voluntary response", "self-selected", "viewers", "playground",
                     "responded via", "convenience sample", "biased", "non-representative"]):
        return True
    return False

def _esc_random_select(ctx):
    blob = ctx["blob"]
    if "random sample" in blob or "randomly selected" in blob or "selected at random" in blob:
        return True
    return False


CATALOG["Evaluating statistical claims: Observational studies and experiments"] = [
    ("esc-random-assign-causal", "Random assignment -> causal claim", _esc_random_assign),
    ("esc-biased-sample", "Biased / non-representative sample", _esc_biased),
    ("esc-random-select-generalize", "Random selection -> generalizability", _esc_random_select),
]
SKILL_META["Evaluating statistical claims: Observational studies and experiments"] = ("Problem-Solving and Data Analysis", "Math")


# ----------------------------------------------------------------------------
# READING & WRITING
# ----------------------------------------------------------------------------

# Skill: Information and Ideas :: Command of Evidence
def _coe_literary_quote(ctx):
    blob = ctx["blob"]
    if "which quotation" in blob and any_in(blob, ["illustrates", "supports"]):
        return True
    return False

def _coe_survey_quote(ctx):
    blob = ctx["blob"]
    if "survey respondent" in blob or "quotation from a survey" in blob:
        return True
    if "response from" in blob and "survey" in blob:
        return True
    return False

def _coe_hypothetical(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["which finding, if true", "if true, would most directly support",
                     "if true, would most directly weaken", "if true, would most directly challenge",
                     "if true, would most strongly support"]):
        return True
    return False

def _coe_quantitative(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["according to the table", "according to the graph",
                     "data from the table", "data from the graph"]):
        return True
    if "table" in blob and any_in(blob, ["completes the text", "supports the claim", "supports the conclusion"]):
        return True
    if "graph" in blob and any_in(blob, ["completes the text", "supports the claim"]):
        return True
    return False

def _coe_other_detail(ctx):
    blob = ctx["blob"]
    if "table" in blob or "graph" in blob:
        return True
    return False


CATALOG["Command of Evidence"] = [
    ("coe-literary-quote", "Literary quotation illustrates a claim", _coe_literary_quote),
    ("coe-survey-or-respondent-quote", "Survey/respondent quote supports a conclusion", _coe_survey_quote),
    ("coe-hypothetical-finding", "Hypothetical finding supporting/weakening a claim", _coe_hypothetical),
    ("coe-quantitative-data", "Data from a table or graph", _coe_quantitative),
    ("coe-other-detail-from-data", "Direct data-lookup detail", _coe_other_detail),
]
SKILL_META["Command of Evidence"] = ("Information and Ideas", "Reading and Writing")


# Skill: Information and Ideas :: Central Ideas and Details
def _cid_lit_main(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["main idea of the text", "main purpose of the text", "main idea of the excerpt"]):
        if any_in(blob, ["adapted from", "novel", "short story", "poem"]):
            return True
    return False

def _cid_info_main(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["main idea of the text", "main purpose of the text", "main topic"]):
        return True
    return False

def _cid_lit_detail(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["according to the text", "based on the text", "the text suggests",
                     "the text most strongly suggests", "what does the text"]):
        if any_in(blob, ["adapted from", "novel", "short story", "poem"]):
            return True
    return False

def _cid_info_detail(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["according to the text", "based on the text", "the text suggests",
                     "what does the text", "the text indicates", "the text states"]):
        return True
    return False


CATALOG["Central Ideas and Details"] = [
    ("cid-lit-main-idea", "Main idea of a literary excerpt", _cid_lit_main),
    ("cid-info-main-idea", "Main idea of a nonfiction passage", _cid_info_main),
    ("cid-lit-detail", "Detail question on a literary excerpt", _cid_lit_detail),
    ("cid-info-detail", "Detail question on a nonfiction passage", _cid_info_detail),
]
SKILL_META["Central Ideas and Details"] = ("Information and Ideas", "Reading and Writing")


# Skill: Information and Ideas :: Inferences
def _inf_literary(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["adapted from the novel", "adapted from the short story", "adapted from", "narrator"]):
        if "blank" in blob:
            return True
    return False

def _inf_research_study(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["researcher", "researchers", "study", "experiment", "scientists",
                     "hypothesized", "observed", "tested", "in the study", "investigators"]):
        return True
    return False

def _inf_humanities_arts(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["scholar", "scholars", "historian", "artist", "art historian",
                     "literary critic", "musician", "philosopher", "novelist", "poet",
                     "writer", "composer"]):
        return True
    return False

def _inf_general_claim(ctx):
    blob = ctx["blob"]
    if "blank" in blob and any_in(blob, ["logically completes", "most logically completes", "most logically completes the text"]):
        return True
    return False


CATALOG["Inferences"] = [
    ("inf-literary", "Complete an inference from a literary excerpt", _inf_literary),
    ("inf-research-study", "Complete a research-study conclusion", _inf_research_study),
    ("inf-humanities-arts", "Complete a humanities/arts argument", _inf_humanities_arts),
    ("inf-general-claim", "Complete a general explanatory claim", _inf_general_claim),
]
SKILL_META["Inferences"] = ("Information and Ideas", "Reading and Writing")


# Skill: Craft and Structure :: Words in Context
# These need the correct answer's POS.
COMMON_ADJ_SUFFIX = ("ous", "ful", "ive", "less", "able", "ible", "ic", "al", "ant", "ent", "ed", "ing")
COMMON_NOUN_SUFFIX = ("tion", "sion", "ment", "ity", "ence", "ance", "ship", "ism", "ness", "hood")
COMMON_VERB_SUFFIX = ("ize", "ate", "ify", "ed", "es", "s")


def _word_pos(word: str) -> str:
    w = word.lower().strip().strip(",.;:")
    if not w:
        return "other"
    if w.endswith("ly"):
        return "adv"
    if w.endswith(COMMON_ADJ_SUFFIX):
        # could be adj or verb -ed/-ing
        if w.endswith(("ed", "ing")):
            # ambiguous - check participle vs verb base
            return "adj"
        return "adj"
    if w.endswith(COMMON_NOUN_SUFFIX):
        return "noun"
    return "verb"


def _wic_context_meaning(ctx):
    return "most nearly mean" in ctx["blob"]

def _wic_fill_adverb(ctx):
    blob = ctx["blob"]
    if "logical and precise word" not in blob:
        return False
    ans = ctx["answer_text"].strip().lower().split()
    if not ans:
        return False
    first = ans[0].strip(",.;:")
    return first.endswith("ly") and len(first) > 3

def _wic_fill_adj(ctx):
    blob = ctx["blob"]
    if "logical and precise word" not in blob:
        return False
    ans = ctx["answer_text"].strip().lower().split()
    if not ans:
        return False
    first = ans[0].strip(",.;:")
    return _word_pos(first) == "adj"

def _wic_fill_noun(ctx):
    blob = ctx["blob"]
    if "logical and precise word" not in blob:
        return False
    ans = ctx["answer_text"].strip().lower().split()
    if not ans:
        return False
    first = ans[0].strip(",.;:")
    return _word_pos(first) == "noun"

def _wic_fill_verb(ctx):
    blob = ctx["blob"]
    if "logical and precise word" not in blob:
        return False
    ans = ctx["answer_text"].strip().lower().split()
    if not ans:
        return False
    first = ans[0].strip(",.;:")
    return _word_pos(first) == "verb"

def _wic_fill_other(ctx):
    return "logical and precise word" in ctx["blob"]


CATALOG["Words in Context"] = [
    ("wic-context-meaning", "'Most nearly mean' definition in situ", _wic_context_meaning),
    ("wic-fill-adverb", "Fill-in an adverb", _wic_fill_adverb),
    ("wic-fill-noun", "Fill-in an academic noun", _wic_fill_noun),
    ("wic-fill-adj-participle", "Fill-in a descriptive adjective or participle", _wic_fill_adj),
    ("wic-fill-verb", "Fill-in a verb (incl. short phrasal predicates)", _wic_fill_verb),
    ("wic-fill-other-pos", "Fill-in any other part of speech", _wic_fill_other),
]
SKILL_META["Words in Context"] = ("Craft and Structure", "Reading and Writing")


# Skill: Craft and Structure :: Text Structure and Purpose
def _tsp_underlined(ctx):
    blob = ctx["blob"]
    if "underlined" in blob and "function" in blob:
        return True
    if "function of the first sentence" in blob or "function of the underlined" in blob:
        return True
    return False

def _tsp_overall_structure(ctx):
    return "overall structure" in ctx["blob"]

def _tsp_main_purpose_lit(ctx):
    blob = ctx["blob"]
    if "main purpose" in blob and any_in(blob, ["adapted from", "novel", "poem", "short story", "of the excerpt"]):
        return True
    return False

def _tsp_main_purpose_info(ctx):
    return "main purpose" in ctx["blob"]

def _tsp_other(ctx):
    blob = ctx["blob"]
    return "function" in blob or "structure" in blob


CATALOG["Text Structure and Purpose"] = [
    ("tsp-underlined-function", "Function of an underlined sentence/portion", _tsp_underlined),
    ("tsp-overall-structure", "Overall structure of the text", _tsp_overall_structure),
    ("tsp-main-purpose-lit", "Main purpose of a literary excerpt", _tsp_main_purpose_lit),
    ("tsp-main-purpose-info", "Main purpose of an informational text", _tsp_main_purpose_info),
    ("tsp-other", "Other function/structure variants", _tsp_other),
]
SKILL_META["Text Structure and Purpose"] = ("Craft and Structure", "Reading and Writing")


# Skill: Craft and Structure :: Cross-Text Connections
def _xtc_difference(ctx):
    blob = ctx["blob"]
    if "difference" in blob and "text 1" in blob and "text 2" in blob:
        return True
    if "how text 1 and text 2 relate" in blob:
        return True
    return False

def _xtc_both_agree(ctx):
    blob = ctx["blob"]
    return "both authors would" in blob or "would most likely agree" in blob

def _xtc_text1_agreement(ctx):
    blob = ctx["blob"]
    if "author of text 1" in blob and any_in(blob, ["most likely respond", "most likely regard", "most likely view"]):
        return True
    return False

def _xtc_text2_responds(ctx):
    blob = ctx["blob"]
    if "author of text 2" in blob and any_in(blob, ["most likely respond", "most likely regard",
                                                    "most likely view", "would characterize"]):
        return True
    return False

def _xtc_other(ctx):
    blob = ctx["blob"]
    return "text 1" in blob and "text 2" in blob


CATALOG["Cross-Text Connections"] = [
    ("xtc-difference-between", "Difference between the two authors' views", _xtc_difference),
    ("xtc-both-agree", "Statement both authors would agree with", _xtc_both_agree),
    ("xtc-text1-agreement", "Text 1's likely view on Text 2", _xtc_text1_agreement),
    ("xtc-text2-responds-text1", "Text 2's likely response to Text 1", _xtc_text2_responds),
    ("xtc-other-response", "Other paired-text inference shapes", _xtc_other),
]
SKILL_META["Cross-Text Connections"] = ("Craft and Structure", "Reading and Writing")


# Skill: Expression of Ideas :: Rhetorical Synthesis
def _rs_research_summary(ctx):
    blob = ctx["blob"]
    return any_in(blob, ["aim of the research", "summarize the study", "summary of the study",
                         "summarize the study's findings"])

def _rs_similarity(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["similarity", "similarities", "shared", "in common", "what both", "both have"]):
        if not any_in(blob, ["contrast", "differ"]):
            return True
    return False

def _rs_contrast(ctx):
    blob = ctx["blob"]
    return any_in(blob, ["contrast", "difference between", "distinguish", "differ"])

def _rs_explain(ctx):
    blob = ctx["blob"]
    return any_in(blob, ["explain", "advantage", "disadvantage", "origin of", "describe how",
                         "describe why", "explain how", "explain why"])

def _rs_emphasize_claim(ctx):
    blob = ctx["blob"]
    return any_in(blob, ["emphasize", "highlight", "support a claim", "argue", "make the case"])

def _rs_introduce_summarize(ctx):
    blob = ctx["blob"]
    return any_in(blob, ["introduce", "audience unfamiliar", "overview", "present the"])

def _rs_specify_fact(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["specify", "identify", "indicate"]):
        return True
    return False

def _rs_other(ctx):
    blob = ctx["blob"]
    return any_in(blob, ["rhetorical", "goal", "best accomplishes", "would most effectively"])


CATALOG["Rhetorical Synthesis"] = [
    ("rs-research-summary", "Summarize a study's aim or findings", _rs_research_summary),
    ("rs-similarity", "Emphasize a similarity / shared trait", _rs_similarity),
    ("rs-contrast", "Contrast or emphasize a difference", _rs_contrast),
    ("rs-explain", "Explain origin, advantage, or process", _rs_explain),
    ("rs-emphasize-claim", "Emphasize a point or support a claim", _rs_emphasize_claim),
    ("rs-introduce-summarize", "Introduce for an unfamiliar audience", _rs_introduce_summarize),
    ("rs-specify-fact", "Specify or identify a single fact", _rs_specify_fact),
    ("rs-other", "Other rhetorical goals", _rs_other),
]
SKILL_META["Rhetorical Synthesis"] = ("Expression of Ideas", "Reading and Writing")


# Skill: Expression of Ideas :: Transitions
# The "correct answer text" tells us which transition word.
TRANS_CONTRAST = {"however", "but", "by contrast", "in contrast", "nevertheless", "though", "that said",
                  "instead", "conversely", "on the other hand", "yet", "still", "nonetheless", "even so",
                  "regardless", "despite", "granted",
                  # A26 widen
                  "on the contrary", "undermining this explanation", "contrary to"}
TRANS_CAUSE = {"as a result", "therefore", "thus", "consequently", "hence", "for this reason",
               "accordingly", "so", "fittingly",
               # A26 widen
               "as such"}
TRANS_SEQ = {"next", "then", "later", "previously", "finally", "eventually", "ultimately", "meanwhile",
             "subsequently", "first", "second", "third", "in conclusion", "overall", "in sum",
             "earlier", "today", "currently", "afterward", "afterwards", "again and again",
             "there", "in time", "soon"}
TRANS_EXAMPLE = {"for example", "for instance", "specifically", "in particular", "notably"}
TRANS_ADD = {"in addition", "additionally", "also", "moreover", "furthermore", "likewise", "similarly",
             "in many cases", "in comparison",
             # A26 widen
             "what's more", "more often"}
TRANS_EMPH = {"in fact", "indeed", "clearly", "of course", "increasingly"}
TRANS_PURP_RESTATE = {"to that end", "in other words", "that is", "by comparison", "alternatively",
                     "with this in mind", "in turn", "in so doing", "to be exact"}


def _trans_match(ctx, words):
    ans = ctx["answer_text"].lower().strip().rstrip(",.;:")
    if not ans:
        return False
    for w in words:
        if ans == w or ans.startswith(w + ",") or ans.startswith(w + ".") or ans == w + ",":
            return True
        # also bare phrase match
        if ans == w:
            return True
    return False

def _trans_contrast(ctx):
    return _trans_match(ctx, TRANS_CONTRAST)

def _trans_cause_effect(ctx):
    return _trans_match(ctx, TRANS_CAUSE)

def _trans_sequence(ctx):
    return _trans_match(ctx, TRANS_SEQ)

def _trans_example(ctx):
    return _trans_match(ctx, TRANS_EXAMPLE)

def _trans_addition(ctx):
    return _trans_match(ctx, TRANS_ADD)

def _trans_emphasis(ctx):
    return _trans_match(ctx, TRANS_EMPH)

def _trans_purpose_restatement(ctx):
    return _trans_match(ctx, TRANS_PURP_RESTATE)


CATALOG["Transitions"] = [
    ("trans-contrast", "Contrast / concession", _trans_contrast),
    ("trans-cause-effect", "Cause and effect", _trans_cause_effect),
    ("trans-example", "Example / specification", _trans_example),
    ("trans-addition", "Addition / similarity", _trans_addition),
    ("trans-emphasis", "Emphasis / intensification", _trans_emphasis),
    ("trans-purpose-restatement", "Purpose, restatement, or alternative", _trans_purpose_restatement),
    ("trans-sequence", "Temporal or ordinal sequence", _trans_sequence),
]
SKILL_META["Transitions"] = ("Expression of Ideas", "Reading and Writing")


# Skill: Standard English Conventions :: Form, Structure, and Sense
def _fss_dangling(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["dangling modifier", "modifying phrase", "supplementary participial",
                     "supplementary noun phrase"]):
        return True
    return False

def _fss_possessive(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["apostrophe", "possessive determiner", "possessive form", "possessive noun"]):
        return True
    # A21 widen: contraction vs possessive (dc645172 "aren't"; d073983d
    # bare last name "Rawles" with no apostrophe). The correct answer is
    # a contraction (aren't / isn't / don't / doesn't / they're) OR a bare
    # proper-noun answer where the rationale frames it as
    # "subject ... followed by a verb" / "no punctuation between a subject
    # and verb".
    ans = ctx["answer_text"].strip().rstrip(",.;:")
    if ans in {"aren't", "isn't", "don't", "doesn't", "they're", "we're",
               "haven't", "hasn't", "wasn't", "weren't", "wouldn't",
               "couldn't", "shouldn't", "it's"}:
        return True
    rat = ctx["rationale_text"]
    if "subject and a verb" in rat and "punctuation between" in rat:
        return True
    return False

def _fss_pronoun(ctx):
    blob = ctx["blob"]
    return any_in(blob, ["pronoun", "antecedent", "subjective case", "objective case"])

def _fss_fragment(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["sentence fragment", "main clause", "finite verb", "lacks a subject"]):
        return True
    # A20 widen: modifier-placement / dangling-modifier stems where the
    # correct answer is a full clause with subject + finite verb. The
    # rationale frames this as "subject-modifier placement" (684b8bd2,
    # dab8b8ee, f0864217, a14eef71).
    rat = ctx["rationale_text"]
    best = ctx["best_sentence"]
    combined = rat + " " + best
    if any_in(combined,
              ["subject-modifier placement",
               "subject of the modifier",
               "modifier and its subject",
               "modifiers and their subjects",
               "modifiers need to be next to",
               "the modifier",
               "subjects they describe"]):
        # Tighten: only if the answer is a clause (contains a verb / pronoun
        # / proper-noun subject — heuristically signalled by ", was" / "is "
        # / "are " / multi-word answer).
        ans = ctx["answer_text"]
        if any_in(ans, [" was ", " is ", " were ", " are ", " tells ",
                        " reduce", " reached ", " had ", " has ", "were used"]):
            return True
        # Or just any multi-word answer with at least one verb-ish ending.
        if len(ans.split()) >= 3 and "modifier" in combined:
            return True
    return False

def _fss_noun_number(ctx):
    blob = ctx["blob"]
    if "singular" in blob and "plural" in blob and "noun" in blob and "subject-verb" not in blob and "subject" not in blob:
        return True
    return False

def _fss_sv_agreement(ctx):
    blob = ctx["blob"]
    if any_in(blob, ["subject-verb agreement", "subject–verb agreement", "agreement in number"]):
        return True
    if any_in(blob, ["singular subject", "plural subject"]):
        return True
    return False

def _fss_verb_tense(ctx):
    blob = ctx["blob"]
    return any_in(blob, ["verb tense", "past tense", "present tense", "verb form",
                         "past participle", "present participle", "verbs to express"])


CATALOG["Form, Structure, and Sense"] = [
    ("fss-dangling-modifier", "Dangling/misplaced modifier", _fss_dangling),
    ("fss-possessive-apostrophe", "Possessive form and apostrophe placement", _fss_possessive),
    ("fss-pronoun-agreement-case", "Pronoun agreement and case", _fss_pronoun),
    ("fss-fragment-clause", "Sentence completeness (fragment vs. clause)", _fss_fragment),
    ("fss-noun-number", "Noun form / plural vs. singular", _fss_noun_number),
    ("fss-subject-verb-agreement", "Subject-verb agreement", _fss_sv_agreement),
    ("fss-verb-tense-form", "Verb tense and form", _fss_verb_tense),
]
SKILL_META["Form, Structure, and Sense"] = ("Standard English Conventions", "Reading and Writing")


# Skill: Standard English Conventions :: Boundaries
# Use the best-answer sentence to detect punctuation type.
def _boundary_semicolon(ctx):
    best = ctx["best_sentence"]
    if "semicolon" in best:
        return True
    return False

def _boundary_colon(ctx):
    best = ctx["best_sentence"]
    if "colon" in best:
        return True
    return False

def _boundary_dash(ctx):
    best = ctx["best_sentence"]
    if "em dash" in best or "em-dash" in best or "pair of em dashes" in best or "dash" in best:
        return True
    return False

def _boundary_sentence_end(ctx):
    best = ctx["best_sentence"]
    if "period" in best or "end-of-sentence" in best:
        return True
    return False

def _boundary_comma_splice(ctx):
    best = ctx["best_sentence"]
    rat = ctx["rationale_text"]
    if "comma splice" in best or "comma splice" in rat:
        return True
    if "coordinating conjunction" in best and "main clause" in best:
        return True
    if "run-on" in best or "fused sentence" in best:
        return True
    # A19 widen: correct answer is "<word>, <participle>ing" — a one-word fix
    # that joins to a participle clause (avoids run-on / comma-splice). Only
    # trigger when the rationale does NOT frame this as a supplementary phrase
    # (otherwise it belongs to boundary-supplement-pair-commas).
    ans = ctx["answer_text"].strip().rstrip(",.;:")
    if re.search(r"\w+\s*,\s*\w+ing\b", ans):
        if not any_in(best + " " + rat,
                      ["supplementary", "nonessential", "nonrestrictive",
                       "appositive", "parenthetical", "pair of commas"]):
            return True
    return False

def _boundary_supplement_commas(ctx):
    best = ctx["best_sentence"]
    rat = ctx["rationale_text"]
    if any_in(best + " " + rat, ["supplementary", "nonrestrictive", "appositive", "parenthetical",
                                  "pair of commas", "supplementary element",
                                  # A17 widen
                                  "items in a series", "items in a simple series",
                                  "introductory participial phrase", "introductory phrase",
                                  "paired punctuation", "nonessential phrase",
                                  "nonessential supplement", "list of three"]):
        return True
    # A17 widen: correct answer ends with a comma AND best sentence mentions
    # "comma" + "separate" (first-of-a-list / pair-comma pattern where the second
    # comma is supplied by adjacent text).
    ans = ctx["answer_text"].strip()
    if ans.endswith(",") and "comma" in best and "separate" in best:
        return True
    return False

def _boundary_subordinate_main(ctx):
    best = ctx["best_sentence"]
    rat = ctx["rationale_text"]
    if "subordinate clause" in best or "dependent clause" in best:
        return True
    if "subordinate clause and a main clause" in rat:
        return True
    return False

def _boundary_no_punctuation(ctx):
    best = ctx["best_sentence"]
    rat = ctx["rationale_text"]
    if "no punctuation is needed" in best or "no punctuation is needed" in rat:
        return True
    # A18 widen: bare-word patterns. Strip non-breaking spaces and whitespace
    # then check for canonical "no punctuation" phrasings.
    blob_br = (best + " " + rat).replace("\xa0", " ")
    blob_br = re.sub(r"\s+", " ", blob_br)
    if any_in(blob_br, ["no punctuation should separate",
                        "no additional punctuation is needed",
                        "should not use punctuation",
                        "shouldn't use punctuation",
                        "don't want to separate it with punctuation",
                        "we don't need any punctuation",
                        "we don't want to use a comma to separate",
                        "don't want to use a comma to separate",
                        "no punctuation between"]):
        return True
    return False


CATALOG["Boundaries"] = [
    ("boundary-semicolon-clauses", "Semicolon to join two independent clauses", _boundary_semicolon),
    ("boundary-colon-introduction", "Colon introducing a list, explanation, or quotation", _boundary_colon),
    ("boundary-dash", "Em dash for supplementary information or break", _boundary_dash),
    ("boundary-sentence-end", "Sentence boundary (period / capitalization)", _boundary_sentence_end),
    ("boundary-comma-splice-runon", "Avoid a comma splice or run-on", _boundary_comma_splice),
    ("boundary-subordinate-main", "Comma between a subordinate clause and a main clause", _boundary_subordinate_main),
    ("boundary-supplement-pair-commas", "Paired commas around a nonrestrictive element", _boundary_supplement_commas),
    ("boundary-no-punctuation-needed", "No punctuation needed", _boundary_no_punctuation),
]
SKILL_META["Boundaries"] = ("Standard English Conventions", "Reading and Writing")


# ----------------------------------------------------------------------------
# Catch-all `*-other` buckets. Appended last to each skill's rule list so any
# question not caught by a per-skill predicate ends up here. For skills that
# already have an `*-other` slug in the catalog, we reuse that slug.
# ----------------------------------------------------------------------------

def _catch_all(ctx):
    return True


# (skill_name, slug, label). Order doesn't matter; we append to each list.
_OTHER_BUCKETS: List[Tuple[str, str, str]] = [
    # Math :: Advanced Math
    ("Equivalent expressions", "eq-expr-other", "Other (uncategorised)"),
    ("Nonlinear functions", "nlf-other", "Other (uncategorised)"),
    ("Nonlinear equations in one variable and systems of equations in two variables", "nle-other", "Other (uncategorised)"),
    # Math :: Algebra
    ("Linear functions", "lf-other", "Other (uncategorised)"),
    ("Linear equations in two variables", "le2-other", "Other (uncategorised)"),
    ("Linear equations in one variable", "le1-other", "Other (uncategorised)"),
    ("Systems of two linear equations in two variables", "sys-other", "Other (uncategorised)"),
    ("Linear inequalities in one or two variables", "lineq-other", "Other (uncategorised)"),
    # Math :: Geometry and Trigonometry (FINAL spec uses these exact slugs)
    ("Area and volume", "av-other", "Composite / coord-plane area"),
    ("Lines, angles, and triangles", "lat-other", "Auxiliary line / area+angle combo"),
    ("Right triangles and trigonometry", "rtt-other", "Rectangle diagonals & hybrid"),
    ("Circles", "cir-other", "Misc. (parameterized circle equation)"),
    # Math :: Problem-Solving and Data Analysis (FINAL spec uses these slugs)
    ("Ratios, rates, proportional relationships, and units", "rpr-other", "Misc. proportional residual"),
    ("Percentages", "pct-other", "Word problems with embedded percent"),
    ("One-variable data: Distributions and measures of center and spread", "ov-other", "Misc. read-the-graph / pick-applicable-stat"),
    ("Two-variable data: Models and scatterplots", "tv-other", "Scatterplot association / trend description"),
    ("Probability and conditional probability", "prob-other", "Probability + arithmetic mash-up"),
    ("Inference from sample statistics and margin of error", "inf-other", "Other (uncategorised)"),
    ("Evaluating statistical claims: Observational studies and experiments", "esc-other", "Other (uncategorised)"),
    # R&W :: Information and Ideas
    # Command of Evidence reuses existing coe-other-detail-from-data slug.
    ("Command of Evidence", "coe-other-detail-from-data", "Direct data-lookup detail"),
    ("Central Ideas and Details", "cid-other", "Other (uncategorised)"),
    # Inferences (R&W) — uses 'inferences-other' to avoid collision with 'inf-other' (math skill).
    ("Inferences", "inferences-other", "Other (uncategorised)"),
    # R&W :: Craft and Structure
    # Words in Context reuses wic-fill-other-pos (residual).
    ("Words in Context", "wic-fill-other-pos", "Fill-in any other part of speech"),
    # Text Structure and Purpose reuses tsp-other.
    ("Text Structure and Purpose", "tsp-other", "Other function/structure variants"),
    # Cross-Text Connections reuses xtc-other-response.
    ("Cross-Text Connections", "xtc-other-response", "Other paired-text inference shapes"),
    # R&W :: Expression of Ideas
    # Rhetorical Synthesis reuses rs-other.
    ("Rhetorical Synthesis", "rs-other", "Other rhetorical goals"),
    ("Transitions", "trans-other", "Other (uncategorised)"),
    # R&W :: Standard English Conventions
    ("Form, Structure, and Sense", "fss-other", "Other (uncategorised)"),
    ("Boundaries", "boundary-other", "Other (uncategorised)"),
]


def _install_catch_alls() -> None:
    """Append a catch-all `*-other` predicate to each skill's CATALOG entry.

    For reused slugs (those that already appear in the skill's rule list with a
    specific predicate), we do NOT replace the original rule — we append a
    second tuple with the same slug and a True-predicate. Order matters
    (first-match-wins), so the original specific predicate fires first and the
    catch-all only catches the residual.

    We then de-duplicate by slug when emitting the catalog entries so the slug
    only appears once in catalog.json.
    """
    for skill, slug, label in _OTHER_BUCKETS:
        if skill not in CATALOG:
            print(f"  ! _install_catch_alls: unknown skill {skill!r}")
            continue
        CATALOG[skill].append((slug, label, _catch_all))


_install_catch_alls()


# Pre-run snapshot of aspects.json, populated at top of main() for the Phase 1
# regression check.
_PRE_RUN_BY_ID: Dict[str, List[str]] = {}


# ----------------------------------------------------------------------------
# Driver
# ----------------------------------------------------------------------------

def load_question(entry: dict) -> Optional[dict]:
    path = os.path.join(DATA_JSON_ROOT, entry["path"])
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except Exception as e:
        print(f"  ! load error {entry['id']}: {e}", file=sys.stderr)
        return None


def build_ctx(entry: dict, question: dict) -> dict:
    stem_raw = (question.get("stem") or "").lower()
    rationale_raw = (question.get("rationale") or "").lower()
    stem_text = html_strip(stem_raw)
    rationale_text = html_strip(rationale_raw)
    best = best_answer_sentence(rationale_text)
    ans_texts = correct_answer_texts(question)
    ans_text = " ".join(ans_texts).lower()
    ans_raw = " ".join(
        (opt.get("content") or "").lower()
        for opt in (question.get("answerOptions") or [])
        if opt.get("id") in set(question.get("keys") or [])
    )
    blob = (entry.get("searchText") or "").lower()
    # Phase 3: normalise Unicode non-breaking hyphen (‑) which appears in
    # some stems (e.g. "x‑intercept" on cb58833c) — the rest of the
    # predicates use ASCII hyphens.
    blob = blob.replace("‑", "-").replace("‐", "-").replace("–", "-")
    # Normalize hyphens with surrounding spaces: "y -intercept" -> "y-intercept"
    blob = re.sub(r"\s+-\s*intercept", "-intercept", blob)
    blob = re.sub(r"\s+-\s+", " - ", blob)
    return {
        "blob": blob,
        "stem_text": stem_text,
        "stem_raw": stem_raw,
        "rationale_text": rationale_text,
        "rationale_raw": rationale_raw,
        "best_sentence": best.lower(),
        "answer_text": ans_text,
        "answer_raw": ans_raw,
        "qtype": entry.get("type", "mcq"),
    }


# Phase 3 A15: explicit cross-skill cleanup. These question IDs are filed under
# one skill in the index but conceptually belong to a different skill's aspect.
# The slug-vs-skill assertion is relaxed for QIDs in this map (see below).
CROSS_SKILL_OVERRIDES: Dict[str, str] = {
    # 555939d2 lives in "Ratios, rates, ..." but is a textbook
    # inf-scale-up-count (random sample of 300 → estimate the total of
    # 30,000). Per the OTHER-PROPOSAL.md A15 cleanup.
    "555939d2": "inf-scale-up-count",
    # 3638f413 lives in "Ratios, rates, ..." but is a textbook exponential
    # build (amount of money doubled each year). Per A15.
    "3638f413": "nlf-exp-build",
}


def classify(entry: dict, question: dict) -> Tuple[Optional[str], bool]:
    """Return (slug, via_catch_all). `via_catch_all` is True if the slug came
    from the trailing catch-all True predicate (i.e. this question is a true
    residual, not a positive match)."""
    qid = entry.get("id")
    if qid in CROSS_SKILL_OVERRIDES:
        return CROSS_SKILL_OVERRIDES[qid], False
    skill = (entry.get("skill") or "").strip()
    rules = CATALOG.get(skill)
    if not rules:
        return None, False
    try:
        ctx = build_ctx(entry, question)
    except Exception as e:
        print(f"  ! ctx error {entry['id']}: {e}", file=sys.stderr)
        return None, False
    for slug, label, pred in rules:
        try:
            if pred(ctx):
                return slug, (pred is _catch_all)
        except Exception as e:
            print(f"  ! predicate error {slug} on {entry['id']}: {e}", file=sys.stderr)
            continue
    return None, False


def main() -> int:
    t0 = time.time()
    os.makedirs(ASPECTS_DIR, exist_ok=True)

    # Backup index.json
    bak = INDEX_PATH + ".bak"
    if not os.path.exists(bak):
        shutil.copy2(INDEX_PATH, bak)
        print(f"Backup written: {bak}")
    else:
        print(f"Backup exists: {bak}")

    # Second-pass safety backup of aspects.json (one-shot).
    aspects_existing = os.path.join(ASPECTS_DIR, "aspects.json")
    aspects_bak2 = os.path.join(ASPECTS_DIR, "index.json.bak2")
    if os.path.exists(aspects_existing) and not os.path.exists(aspects_bak2):
        shutil.copy2(aspects_existing, aspects_bak2)
        print(f"Aspects backup written: {aspects_bak2}")

    # Pre-run snapshot of current aspects.json for the Phase 1 regression check.
    global _PRE_RUN_BY_ID
    _PRE_RUN_BY_ID = {}
    if os.path.exists(aspects_existing):
        try:
            with open(aspects_existing, "r", encoding="utf-8") as pf:
                _PRE_RUN_BY_ID = json.load(pf).get("byId", {})
            print(f"Pre-run snapshot: {len(_PRE_RUN_BY_ID)} tagged ids")
        except Exception as e:
            print(f"  ! Could not load aspects.json for regression baseline: {e}")

    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        index = json.load(f)

    print(f"Loaded {len(index)} entries from index.json")

    # Build slug -> label/skill/domain/section map.
    # First-occurrence wins so the original label (for reused `*-other` slugs)
    # is preserved when a catch-all entry is appended later with the same slug.
    slug_meta: Dict[str, Tuple[str, str, str, str]] = {}
    for skill, rules in CATALOG.items():
        domain, section = SKILL_META[skill]
        for slug, label, _ in rules:
            if slug not in slug_meta:
                slug_meta[slug] = (label, skill, domain, section)

    by_id: Dict[str, List[str]] = {}
    per_skill_total: Counter = Counter()
    per_skill_tagged: Counter = Counter()
    slug_counts: Counter = Counter()
    other_ids_by_skill: Dict[str, List[str]] = {}
    # qids that hit the trailing catch-all (true residuals), grouped by slug.
    catch_all_qids_by_slug: Dict[str, List[str]] = {}

    spot_pool: List[Tuple[str, str, str]] = []  # (id, slug, skill)

    for i, entry in enumerate(index):
        skill = (entry.get("skill") or "").strip()
        per_skill_total[skill] += 1
        q = load_question(entry)
        if q is None:
            continue
        slug, via_catch_all = classify(entry, q)
        if slug is not None:
            by_id[entry["id"]] = [slug]
            per_skill_tagged[skill] += 1
            slug_counts[slug] += 1
            spot_pool.append((entry["id"], slug, skill))
            if via_catch_all:
                catch_all_qids_by_slug.setdefault(slug, []).append(entry["id"])
        else:
            other_ids_by_skill.setdefault(skill, []).append(entry["id"])

        if (i + 1) % 500 == 0:
            print(f"  ... {i+1}/{len(index)} processed")

    total = len(index)
    tagged = sum(per_skill_tagged.values())
    coverage = 100.0 * tagged / total

    print(f"\nTagged {tagged}/{total} ({coverage:.1f}%) in {time.time()-t0:.1f}s")

    # Sanity check: every slug in by_id must exist in catalog.
    for qid, slugs in by_id.items():
        for s in slugs:
            assert s in slug_meta, f"Unknown slug {s} for {qid}"

    # Sanity check: aspects belong to correct skill.
    qid_to_skill = {e["id"]: (e.get("skill") or "").strip() for e in index}
    for qid, slugs in by_id.items():
        for s in slugs:
            # Phase 3 A15 cross-skill cleanup: explicit overrides bypass the
            # skill-mismatch assertion.
            if qid in CROSS_SKILL_OVERRIDES and s == CROSS_SKILL_OVERRIDES[qid]:
                continue
            expected_skill = slug_meta[s][1]
            actual_skill = qid_to_skill.get(qid, "")
            assert expected_skill == actual_skill, (
                f"Skill mismatch: {qid} has slug {s} (skill {expected_skill}) "
                f"but entry skill is {actual_skill}"
            )

    # Phase 1 + Phase 2 regression check: compare against the previous
    # aspects.json. Any already-tagged question that flips its slug must be a
    # cited Phase 1 or Phase 2 example (or a known upgrade from a previously
    # wrong tag); any other flip is a regression and aborts the run.
    PHASE1_CITED_FLIPS = {
        # A26 trans-other → trans-{contrast|cause|addition}
        "2ba97187", "4b7a84b0", "7ce14583", "a2bff07e", "d3b7d7a3", "e6b1e12c",
        # B9 ov-other → ov-bar-graph-read
        "15d87c0f", "29fa7970", "57481175", "6e3ab4bf", "80f1f3a9", "93779b53", "a067c926",
        # A17 boundary-other → boundary-supplement-pair-commas
        "9f0ac61d", "6fece68e", "a7fdf862", "e15c50b2", "fdb16e20",
        # A18 boundary-other → boundary-no-punctuation-needed (also pulls A19 residuals)
        "603755a5", "89ab0d46", "594b4a94", "b1e8b87f", "a1e0c981",
        # A19 boundary-other → boundary-comma-splice-runon
        "403d7bb5", "8f6d6ae6", "be34a3df",
        # A2 nlf-other → nlf-exp-build
        "7ba694f3", "a8ae0d22", "d8ace155", "2c6f214f", "99269e03", "dba7432e",
        # A11 le1-other → le1-isolate
        "45bba652", "9ff10b3b", "ce314070",
    }
    PHASE2_CITED_FLIPS = {
        # A1 nlf-other → nlf-quadratic-features
        "a7711fe8", "ee857afb", "6d9e01a2", "271ffad7", "7902bed0",
        "7eed640d", "5bf0f84a", "2b1a27cd",
        # B1 nlf-other → nlf-exp-rescale-time
        "1fe10d97", "59d1f4b5", "90bcaa61", "ae05d37b", "dc77e0dc",
        # B2 nlf-other → nlf-table-features
        "0121a235", "02060533", "b39d74a0", "f423771c",
        # A6 nle-other → nle-quadratic-solve
        "717a1964", "911383f2", "eb268057", "a4f61d75", "87a3de81",
        # A7 nle-other → nle-zero-product
        "2926cc6d",
        # A8 sys-other → sys-{find-constant-{nosol,infinite},num-solutions}
        "1e0a46e4", "4becad44", "567ac7ab", "58477a6c", "6a87902f",
        "79784c23", "b3c7ca1d", "d909cd31", "e77a76ce",
        # A9 sys-other → sys-build-from-context
        "0c541d87", "36f068e2", "4f1342d6", "686b7cad", "70feb725",
        "7866a908", "9f6f96ff", "a71b1bc1", "b86123af", "c5082ce3",
        "dba8d38a", "ee031767",
        # A10 le1-other → le1-build-from-context
        "0cb57740", "5ad9eff0", "79cf8505", "8c515062", "93954cfa",
        "ed18c4f7", "f305b5ca", "fbb0ea7f", "f09097b1",
        # A12 le2-other → le2-substitute-given-one-var
        "0d1b1e35", "637022d2", "686b7244", "7625073d", "c5e38487",
        "a04190b7", "ee846db7",
    }
    # Phase 2 also upgrades 6 previously-mistagged questions to their correct
    # slug. These are documented upgrades, not regressions:
    PHASE2_KNOWN_UPGRADES = {
        # A1 widen also fixes 4 quadratic min/max questions that were
        # mistakenly tagged as `nlf-evaluate` because the stem says "for what
        # value of x does f(x) reach its minimum".
        "04bbce67",  # nlf-evaluate -> nlf-quadratic-features
        "841ef26c",  # nlf-evaluate -> nlf-quadratic-features
        "84e8cc72",  # nlf-evaluate -> nlf-quadratic-features
        # B2 widen catches a table-driven quadratic question that was
        # mistagged nlf-evaluate.
        "1178f2df",  # nlf-evaluate -> nlf-table-features
        # A8 widens: "at how many points do the graphs ... intersect" was
        # being caught by sys-graph-read even when no graph was shown.
        "0dd6227f",  # sys-graph-read -> sys-num-solutions
        # A8 widen of sys-find-constant-nosol catches a previously-mistagged
        # "which equation could be the second equation" item that was being
        # routed to sys-solve-elimination.
        "5e08a055",  # sys-solve-elimination -> sys-find-constant-nosol
    }
    # Phase 3 cited flips (catch-all -> positive slug from this phase's
    # widens & new aspects).
    PHASE3_CITED_FLIPS = {
        # A3 lf-other -> lf-build-from-context
        "67d63e19", "a7e2859a", "be9cb6a2", "a309803e", "d1f50dbe", "de6fe450",
        # A4 lf-other -> lf-build-from-slope
        "2b15d65f", "3122fc7b", "41fdc0b8", "c22b5f25",
        # A5 lf-other -> lf-graph-intercepts (+ le2-other side: cb58833c)
        "17d80dc3", "e25f0807", "cb58833c",
        # B3 lf-other -> lf-temperature-unit-formula
        "6989c80a", "b3abf40f", "dae126d7",
        # A14 rpr-other -> rpr-rate-speed-time-distance / rpr-one-step-proportion
        "000259aa", "be35c117", "fe4c1c9e", "99550621",
        # A14 + B6 rpr-other -> rpr-proportional-symbolic / rpr-symbolic-fraction-equation
        "21e539a0", "50b99b2d", "3726e079", "8637294f", "808f7d6c",
        # A15 cross-skill (rpr-other -> inf-scale-up-count / nlf-exp-build)
        "555939d2", "3638f413",
        # A16 pct-other -> pct-pct-change / pct-chained-two-step
        "194ae3b1", "566759ef", "63573fea",
        # B7 pct-other -> pct-tax-tip-sales
        "6e4a60dd", "8705ecba", "7ed0d098", "a8fabad0", "41b71b4e",
        # A20 fss-other -> fss-fragment-clause
        "684b8bd2", "dab8b8ee", "f0864217", "a14eef71",
        # A21 fss-other -> fss-possessive-apostrophe
        "dc645172", "d073983d",
        # A22 lineq-other -> lineq-build-1var-context / lineq-build-2var-context
        "03503d49", "2869fe95", "45cfb9de", "90bd9ef8", "ee439cff", "915463e0",
        # A23 cir-other -> cir-points-properties
        "196e8e6e", "24cec8d1", "9adb86ed", "35d37640",
        # A24 eq-expr-other -> eq-expr-radicals
        "1be909aa", "4ac59df6", "f5c3e3b8", "89fc23af",
        # A25 lat-other -> lat-intersecting-lines
        "087cdcfd", "64d1f49f", "a456f28c", "c41eb616",
        # B4 nle-other -> nle-no-real-solution-check
        "6bdcac03", "71014fb1", "f5247e52",
        # B5 nle-other -> nle-system-quadratic-context
        "0bebc08c", "a67a439d", "876a731c",
        # B8 tv-other -> tv-cooling-warming-curve
        "83272c51", "9bb4107c", "5c24c861",
    }
    # Phase 3 known upgrades: any documented re-routing where the question
    # was previously tagged with a (different) positive slug but Phase 3
    # widens / new aspects produce a more accurate tag.
    PHASE3_KNOWN_UPGRADES = set()  # populated as needed during smoke-tests
    # Phase 4 aspect merges (collapse 6 pairs to cap each skill at <=10
    # aspects). Each id below currently emits the merged-away slug and will
    # flip to its surviving slug after this run.
    MERGE_KNOWN_FLIPS = {
        # nle-no-real-solution-check -> nle-discriminant-constant
        "6bdcac03", "71014fb1", "f5247e52",
        # nle-system-quadratic-context -> nle-system-substitute
        "0bebc08c", "876a731c", "a67a439d",
        # nle-exponent-eq -> nle-radical
        "d0a7871e", "e9349667",
        # nlf-build-from-text -> nlf-build-from-data-or-text
        "44076c7d", "68607eca", "8462b105", "a26c29f7",
        # nlf-table-features -> nlf-build-from-data-or-text
        "0121a235", "02060533", "1178f2df", "b39d74a0", "f423771c",
        # rpr-one-step-proportion -> rpr-ratio-equivalent
        "312ba47c", "3f236a64", "99550621",
        # rpr-symbolic-fraction-equation -> rpr-proportional-symbolic
        "3726e079", "808f7d6c", "8637294f",
    }
    PHASE1_CITED_FLIPS = (PHASE1_CITED_FLIPS | PHASE2_CITED_FLIPS
                          | PHASE2_KNOWN_UPGRADES | PHASE3_CITED_FLIPS
                          | PHASE3_KNOWN_UPGRADES | MERGE_KNOWN_FLIPS)
    # Prefer the most recent aspects.json (pre-run snapshot was taken at top of
    # main()) as the regression baseline.
    prev_by_id: Dict[str, List[str]] = dict(_PRE_RUN_BY_ID)
    # All known catch-all "*-other" slugs are treated as "uncategorised"; flipping
    # FROM one of these to a positive slug is an UPGRADE (not a regression).
    OTHER_SLUGS = {slug for _skill, slug, _label in _OTHER_BUCKETS}
    flips: List[Tuple[str, str, str]] = []  # (qid, old_slug, new_slug)
    upgrades: List[Tuple[str, str, str]] = []
    for qid, new_slugs in by_id.items():
        old_slugs = prev_by_id.get(qid)
        if not old_slugs:
            continue
        old = old_slugs[0] if old_slugs else None
        new = new_slugs[0] if new_slugs else None
        if old != new:
            if old in OTHER_SLUGS and new not in OTHER_SLUGS:
                upgrades.append((qid, old or "", new or ""))
            else:
                flips.append((qid, old or "", new or ""))
    expected_flips = [f for f in flips if f[0] in PHASE1_CITED_FLIPS]
    unexpected_flips = [f for f in flips if f[0] not in PHASE1_CITED_FLIPS]
    expected_upgrades = [u for u in upgrades if u[0] in PHASE1_CITED_FLIPS]
    incidental_upgrades = [u for u in upgrades if u[0] not in PHASE1_CITED_FLIPS]
    print(f"\nUpgrades (catch-all -> positive slug): {len(upgrades)} total "
          f"({len(expected_upgrades)} cited, {len(incidental_upgrades)} incidental).")
    for qid, old, new in incidental_upgrades:
        print(f"  upgrade {qid}: {old} -> {new}")
    print(f"\nRegression check: {len(flips)} slug changes vs previous run "
          f"({len(expected_flips)} expected cited, {len(unexpected_flips)} unexpected)")
    for qid, old, new in expected_flips:
        print(f"  ok   {qid}: {old} -> {new}")
    if unexpected_flips:
        print("  REGRESSIONS:")
        for qid, old, new in unexpected_flips:
            print(f"  FAIL {qid}: {old} -> {new}")
        print("\nAborting: unexpected slug flips detected. "
              "No files written.")
        return 2

    # Write aspects.json
    aspects_payload = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "byId": dict(sorted(by_id.items())),
    }
    aspects_path = os.path.join(ASPECTS_DIR, "aspects.json")
    with open(aspects_path, "w", encoding="utf-8") as f:
        json.dump(aspects_payload, f, indent=2, ensure_ascii=False)
    print(f"Wrote {aspects_path} ({os.path.getsize(aspects_path)} bytes)")

    # Emit per-slug list of question ids that landed via the trailing catch-all
    # rule. Useful as input to the next clustering iteration: these are the
    # genuine residuals not yet matched by any specific predicate.
    catch_all_payload = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "bySlug": {k: sorted(v) for k, v in sorted(catch_all_qids_by_slug.items())},
    }
    catch_all_path = os.path.join(ASPECTS_DIR, "catch_all_qids.json")
    with open(catch_all_path, "w", encoding="utf-8") as f:
        json.dump(catch_all_payload, f, indent=2, ensure_ascii=False)
    print(f"Wrote {catch_all_path} ({os.path.getsize(catch_all_path)} bytes)")

    # Write catalog.json - preserve definition order.
    # Dedupe by slug so that reused catch-all slugs (e.g. `tsp-other`,
    # `coe-other-detail-from-data`) appear only once with the original label.
    catalog_entries = []
    seen_slugs: set = set()
    for skill, rules in CATALOG.items():
        domain, section = SKILL_META[skill]
        for slug, label, _ in rules:
            if slug in seen_slugs:
                continue
            seen_slugs.add(slug)
            catalog_entries.append({
                "slug": slug,
                "label": label,
                "skill": skill,
                "domain": domain,
                "section": section,
                "count": slug_counts.get(slug, 0),
            })
    catalog_payload = {
        "version": 1,
        "aspects": catalog_entries,
    }
    catalog_path = os.path.join(ASPECTS_DIR, "catalog.json")
    with open(catalog_path, "w", encoding="utf-8") as f:
        json.dump(catalog_payload, f, indent=2, ensure_ascii=False)
    print(f"Wrote {catalog_path} ({os.path.getsize(catalog_path)} bytes)")

    # Spot-check: 20 random tagged questions, seeded.
    rng = random.Random(20260529)
    spot_sample = rng.sample(spot_pool, min(20, len(spot_pool)))
    spot_details = []
    for qid, slug, skill in spot_sample:
        entry = next((e for e in index if e["id"] == qid), None)
        preview = (entry.get("preview") or "")[:140] if entry else ""
        spot_details.append({
            "id": qid,
            "slug": slug,
            "label": slug_meta[slug][0],
            "skill": skill,
            "preview": preview,
        })

    # Write REPORT.md
    lines: List[str] = []
    lines.append("# Aspect Tagging Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).isoformat()}")
    lines.append("")
    lines.append(f"**Global coverage: {tagged}/{total} = {coverage:.1f}%**")
    lines.append("")
    lines.append("## Per-skill coverage")
    lines.append("")
    lines.append("| Skill | Total | Tagged | Untagged | Coverage |")
    lines.append("|---|---:|---:|---:|---:|")
    skill_order = list(CATALOG.keys())
    # Append any skills that exist in the index but not in CATALOG (untagged skills).
    extra_skills = sorted({s for s in per_skill_total.keys() if s not in skill_order})
    for skill in skill_order + extra_skills:
        tot = per_skill_total.get(skill, 0)
        tg = per_skill_tagged.get(skill, 0)
        if tot == 0:
            continue
        pct = 100.0 * tg / tot if tot else 0.0
        lines.append(f"| {skill} | {tot} | {tg} | {tot - tg} | {pct:.1f}% |")
    lines.append("")
    lines.append("## Slug-level counts")
    lines.append("")
    lines.append("| Slug | Skill | Label | Count |")
    lines.append("|---|---|---|---:|")
    for skill, rules in CATALOG.items():
        for slug, label, _ in rules:
            lines.append(f"| `{slug}` | {skill} | {label} | {slug_counts.get(slug, 0)} |")
    lines.append("")

    # Dead / over-firing rules.
    lines.append("## Dead or over-firing rules")
    lines.append("")
    dead = []
    over = []
    for skill, rules in CATALOG.items():
        skill_total = per_skill_total.get(skill, 0)
        for slug, label, _ in rules:
            c = slug_counts.get(slug, 0)
            if c == 0:
                dead.append((slug, skill, label))
            elif skill_total > 0 and c / skill_total > 0.7:
                over.append((slug, skill, label, c, skill_total))
    if dead:
        lines.append("### Dead rules (zero matches)")
        lines.append("")
        for slug, skill, label in dead:
            lines.append(f"- `{slug}` ({skill}) - {label}")
        lines.append("")
    else:
        lines.append("No dead rules.")
        lines.append("")
    if over:
        lines.append("### Over-firing rules (>70% of skill)")
        lines.append("")
        for slug, skill, label, c, tot in over:
            lines.append(f"- `{slug}` ({skill}) - {c}/{tot} = {100.0*c/tot:.1f}%")
        lines.append("")

    # Underperforming skills.
    lines.append("## Underperforming skills (<80% coverage)")
    lines.append("")
    under = []
    for skill in skill_order:
        tot = per_skill_total.get(skill, 0)
        tg = per_skill_tagged.get(skill, 0)
        if tot == 0:
            continue
        pct = 100.0 * tg / tot
        if pct < 80.0:
            under.append((skill, tot, tg, pct))
    if under:
        for skill, tot, tg, pct in under:
            lines.append(f"- **{skill}**: {tg}/{tot} = {pct:.1f}%")
    else:
        lines.append("All defined skills above 80%.")
    lines.append("")

    # Spot checks.
    lines.append("## Spot-check sample (20 random tagged questions)")
    lines.append("")
    lines.append("| ID | Slug | Skill | Preview |")
    lines.append("|---|---|---|---|")
    for item in spot_details:
        pv = item["preview"].replace("|", "\\|")
        lines.append(f"| `{item['id']}` | `{item['slug']}` | {item['skill']} | {pv} |")
    lines.append("")

    # Other samples.
    lines.append("## Sample of untagged ('Other') IDs (up to 50)")
    lines.append("")
    all_others: List[Tuple[str, str]] = []
    for skill, ids in other_ids_by_skill.items():
        for i in ids:
            all_others.append((skill, i))
    rng2 = random.Random(20260530)
    sample_others = rng2.sample(all_others, min(50, len(all_others)))
    sample_others.sort(key=lambda x: (x[0], x[1]))
    lines.append("| Skill | ID |")
    lines.append("|---|---|")
    for skill, qid in sample_others:
        lines.append(f"| {skill} | `{qid}` |")
    lines.append("")

    report_path = os.path.join(ASPECTS_DIR, "REPORT.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Wrote {report_path} ({os.path.getsize(report_path)} bytes)")

    # Mutate index.json - re-load from backup to start clean.
    with open(bak, "r", encoding="utf-8") as f:
        fresh_index = json.load(f)
    for entry in fresh_index:
        slugs = by_id.get(entry["id"])
        if slugs:
            entry["aspects"] = slugs
        elif "aspects" in entry:
            del entry["aspects"]
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(fresh_index, f, ensure_ascii=False)
    print(f"Mutated {INDEX_PATH} (added aspects to {len(by_id)} entries)")

    elapsed = time.time() - t0
    print(f"\nDone in {elapsed:.1f}s. Coverage: {coverage:.1f}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
