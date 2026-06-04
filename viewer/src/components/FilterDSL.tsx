import { useEffect, useRef } from "react";
import type { Filters, IndexEntry } from "@/types";
import { useFocusTrap } from "@/hooks";

// ─────────────────────────────── types ───────────────────────────────

type Comparator = "=" | ">=" | "<=" | ">" | "<";

interface FacetClause {
  values: string[];
  comparator: Comparator;
}

export interface ParsedQuery {
  search: string; // remaining free text
  facets: {
    section?: string[];
    difficulty?: string[];
    domain?: string[];
    skill?: string[];
    type?: string[];
    bookmarked?: boolean;
    done?: boolean;
  };
  // Internal: comparator info for difficulty (preserved for applyDSL)
  _difficultyComparator?: Comparator;
}

const DIFFICULTY_RANK: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

const FACET_KEYS = new Set([
  "section",
  "difficulty",
  "domain",
  "skill",
  "type",
  "is",
  "not",
]);

// ─────────────────────────────── tokenizer ───────────────────────────

interface Token {
  text: string;
  quoted: boolean;
}

/**
 * Tokenize on whitespace, but preserve quoted strings (single or double quotes).
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    // Skip whitespace
    while (i < n && /\s/.test(input[i])) i++;
    if (i >= n) break;

    const ch = input[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let buf = "";
      while (i < n && input[i] !== quote) {
        buf += input[i];
        i++;
      }
      if (i < n) i++; // consume closing quote
      tokens.push({ text: buf, quoted: true });
      continue;
    }

    // Read until whitespace, but allow quoted segments after key:
    // e.g. skill:"linear equations"
    let buf = "";
    let sawColon = false;
    while (i < n && !/\s/.test(input[i])) {
      if (!sawColon && input[i] === ":") {
        sawColon = true;
        buf += input[i];
        i++;
        // After colon, accept an optional comparator >=, <=, >, <
        if (i < n && (input[i] === ">" || input[i] === "<")) {
          buf += input[i];
          i++;
          if (i < n && input[i] === "=") {
            buf += input[i];
            i++;
          }
        }
        // After comparator (or after colon), accept quoted value
        if (i < n && (input[i] === '"' || input[i] === "'")) {
          const quote = input[i];
          i++;
          while (i < n && input[i] !== quote) {
            buf += input[i];
            i++;
          }
          if (i < n) i++; // consume closing quote
          break;
        }
        continue;
      }
      buf += input[i];
      i++;
    }
    if (buf.length > 0) {
      tokens.push({ text: buf, quoted: false });
    }
  }
  return tokens;
}

// ─────────────────────────────── parser ──────────────────────────────

function parseFacetClause(value: string): FacetClause {
  let comparator: Comparator = "=";
  let rest = value;
  if (rest.startsWith(">=")) {
    comparator = ">=";
    rest = rest.slice(2);
  } else if (rest.startsWith("<=")) {
    comparator = "<=";
    rest = rest.slice(2);
  } else if (rest.startsWith(">")) {
    comparator = ">";
    rest = rest.slice(1);
  } else if (rest.startsWith("<")) {
    comparator = "<";
    rest = rest.slice(1);
  }
  // Multiple values can be comma-separated
  const values = rest
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .map((v) => v.toLowerCase());
  return { values, comparator };
}

export function parseDSL(input: string): ParsedQuery {
  const result: ParsedQuery = {
    search: "",
    facets: {},
  };
  if (!input || !input.trim()) return result;

  const tokens = tokenize(input);
  const freeText: string[] = [];

  for (const tok of tokens) {
    // Quoted tokens without a key are always free text
    if (tok.quoted) {
      freeText.push(tok.text);
      continue;
    }

    const colonIdx = tok.text.indexOf(":");
    if (colonIdx <= 0 || colonIdx === tok.text.length - 1) {
      freeText.push(tok.text);
      continue;
    }

    const rawKey = tok.text.slice(0, colonIdx).toLowerCase();
    const rawValue = tok.text.slice(colonIdx + 1);

    if (!FACET_KEYS.has(rawKey)) {
      freeText.push(tok.text);
      continue;
    }

    if (rawKey === "is" || rawKey === "not") {
      const v = rawValue.toLowerCase().trim();
      if (v === "bookmarked") {
        result.facets.bookmarked = rawKey === "is";
      } else if (v === "done") {
        result.facets.done = rawKey === "is";
      }
      continue;
    }

    const clause = parseFacetClause(rawValue);
    if (clause.values.length === 0) continue;

    switch (rawKey) {
      case "section":
        result.facets.section = clause.values;
        break;
      case "difficulty":
        result.facets.difficulty = clause.values;
        result._difficultyComparator = clause.comparator;
        break;
      case "domain":
        result.facets.domain = clause.values;
        break;
      case "skill":
        result.facets.skill = clause.values;
        break;
      case "type":
        result.facets.type = clause.values;
        break;
    }
  }

  result.search = freeText.join(" ").trim();
  return result;
}

// ─────────────────────────────── applyDSL ────────────────────────────

function matchesDifficulty(
  entry: IndexEntry,
  values: string[],
  comparator: Comparator,
): boolean {
  const entryRank = DIFFICULTY_RANK[(entry.difficulty || "").toLowerCase()];
  if (comparator === "=") {
    return values.includes((entry.difficulty || "").toLowerCase());
  }
  // For comparators, use the first value's rank as the threshold
  const thresholdRank = DIFFICULTY_RANK[values[0]];
  if (entryRank === undefined || thresholdRank === undefined) {
    // Fall back to equality
    return values.includes((entry.difficulty || "").toLowerCase());
  }
  switch (comparator) {
    case ">=":
      return entryRank >= thresholdRank;
    case "<=":
      return entryRank <= thresholdRank;
    case ">":
      return entryRank > thresholdRank;
    case "<":
      return entryRank < thresholdRank;
    default:
      return false;
  }
}

export function applyDSL(query: ParsedQuery, index: IndexEntry[]): IndexEntry[] {
  const { facets, search } = query;
  const searchLower = search.toLowerCase();

  return index.filter((entry) => {
    if (facets.section && facets.section.length > 0) {
      if (!facets.section.includes((entry.section || "").toLowerCase())) return false;
    }
    if (facets.difficulty && facets.difficulty.length > 0) {
      const cmp = query._difficultyComparator ?? "=";
      if (!matchesDifficulty(entry, facets.difficulty, cmp)) return false;
    }
    if (facets.domain && facets.domain.length > 0) {
      if (!facets.domain.includes((entry.domain || "").toLowerCase())) return false;
    }
    if (facets.skill && facets.skill.length > 0) {
      if (!facets.skill.includes((entry.skill || "").toLowerCase())) return false;
    }
    if (facets.type && facets.type.length > 0) {
      if (!facets.type.includes((entry.type || "").toLowerCase())) return false;
    }
    // Note: bookmarked/done filters depend on external state; this applyDSL
    // only filters on index fields. The caller integrates is:bookmarked /
    // is:done via dslToFilters into the existing Filters pipeline.
    if (searchLower.length > 0) {
      const hay =
        (entry.searchText ?? "") +
        " " +
        (entry.preview ?? "") +
        " " +
        (entry.mathText ?? "");
      if (!hay.toLowerCase().includes(searchLower)) return false;
    }
    return true;
  });
}

// ───────────────────────────── dslToFilters ──────────────────────────

/**
 * Convert a ParsedQuery into the existing Filters shape so the sidebar can
 * be updated when the user types DSL into the search box. Unsupported
 * comparators on difficulty are expanded to the matching set of difficulties.
 */
export function dslToFilters(query: ParsedQuery): Partial<Filters> {
  const out: Partial<Filters> = {};
  if (query.facets.section && query.facets.section.length > 0) {
    out.sections = new Set(query.facets.section);
  }
  if (query.facets.difficulty && query.facets.difficulty.length > 0) {
    const cmp = query._difficultyComparator ?? "=";
    if (cmp === "=") {
      // Title-case for display compatibility
      out.difficulties = new Set(query.facets.difficulty.map(titleCase));
    } else {
      // Expand range
      const thresholdRank = DIFFICULTY_RANK[query.facets.difficulty[0]];
      const matching: string[] = [];
      for (const [name, rank] of Object.entries(DIFFICULTY_RANK)) {
        const ok =
          cmp === ">="
            ? rank >= thresholdRank
            : cmp === "<="
              ? rank <= thresholdRank
              : cmp === ">"
                ? rank > thresholdRank
                : cmp === "<"
                  ? rank < thresholdRank
                  : false;
        if (ok) matching.push(titleCase(name));
      }
      out.difficulties = new Set(matching);
    }
  }
  if (query.facets.domain && query.facets.domain.length > 0) {
    out.domains = new Set(query.facets.domain);
  }
  if (query.facets.skill && query.facets.skill.length > 0) {
    out.skills = new Set(query.facets.skill);
  }
  const status = new Set<"bookmarked" | "done" | "selected">();
  if (query.facets.bookmarked === true) status.add("bookmarked");
  if (query.facets.done === true) status.add("done");
  if (status.size > 0) out.status = status;
  if (query.search) out.search = query.search;
  return out;
}

function titleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ───────────────────────────── DslHelpPopover ────────────────────────

interface DslHelpPopoverProps {
  open: boolean;
  onClose: () => void;
}

export function DslHelpPopover({ open, onClose }: DslHelpPopoverProps): JSX.Element | null {
  const ref = useRef<HTMLDivElement | null>(null);

  useFocusTrap(ref, open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Search syntax help"
      className="absolute right-0 bottom-full mb-2 bg-white border border-ink-200 rounded-lg shadow-modal p-3 text-[12px] z-20 w-72"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-ink-800">Search syntax</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close help"
          className="w-5 h-5 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-100 flex items-center justify-center"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <ul className="space-y-1 font-mono text-[11px] text-ink-700">
        <li>
          <code>section:math</code>
        </li>
        <li>
          <code>difficulty:hard</code>
        </li>
        <li>
          <code>difficulty:&gt;=medium</code>
        </li>
        <li>
          <code>skill:&quot;linear equations&quot;</code>
        </li>
        <li>
          <code>type:mcq</code> or <code>type:spr</code>
        </li>
        <li>
          <code>is:bookmarked</code>
        </li>
        <li>
          <code>not:done</code>
        </li>
        <li className="text-ink-500 font-sans">free text → stem/rationale</li>
      </ul>
    </div>
  );
}
