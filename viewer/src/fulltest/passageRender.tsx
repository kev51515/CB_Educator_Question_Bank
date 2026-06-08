/**
 * passageRender — turns a plain-text stimulus passage into structured blocks
 * (prose + tables) for the full-test reader, WITHOUT breaking the character-
 * offset highlight model in `annotations.ts`.
 *
 * Why this exists: passages are stored as plain text. Some embed a table as
 * pipe-delimited rows ("Method | LCFS revenue | …"), which renders as ugly raw
 * text. We parse those runs into real <table>s. Literary excerpts read better
 * inside a set-apart "source card" (see `QuestionPane`'s Stimulus).
 *
 * Offset safety: highlights store absolute char offsets into the raw passage.
 * `annotations.offsetWithin` resolves a DOM selection by finding the nearest
 * ancestor carrying `data-annot-offset` (a text block's absolute start) and
 * adding the local text offset — so a text block's rendered textContent must
 * equal its exact raw slice (it does; we only wrap <mark>s). Tables carry
 * `data-annot-skip`; selections inside them are non-highlightable (their cell
 * text intentionally drops the `|`/newline separators, so they can't map back
 * to raw offsets). Everything outside a table still maps 1:1.
 */
import type { JSX } from "react";
import { mergeRanges, type AnnotField, type Highlight } from "./annotations";

interface TextBlock {
  type: "text";
  start: number;
  text: string;
}
interface TableBlock {
  type: "table";
  hasHeader: boolean;
  rows: string[][];
}
type PassageBlock = TextBlock | TableBlock;

const isTableLine = (line: string): boolean => line.includes("|");
const isMarkerLine = (line: string): boolean => /^\s*table:\s*$/i.test(line);
/** A cell that is purely numeric/currency/percent — used for header + alignment. */
const isNumericCell = (cell: string): boolean =>
  cell.trim() !== "" && /^[-+]?[\d.,%/$()\s]+$/.test(cell.trim());

const splitRow = (line: string): string[] =>
  line.split("|").map((c) => c.trim());

/**
 * Some passages encode a small table on ONE line, rows joined by ";" and cells
 * by "|", optionally behind a "table:"/"Rows:" label —
 * e.g. `table: x | y; 0 | 8; 1 | 9`. Returns the parsed rows, or null if the
 * line isn't an inline table (every ";"-segment must be piped).
 */
function parseInlineTable(line: string): string[][] | null {
  const segs = line
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  if (segs.length < 2) return null;
  // Strip a leading "Label:" from the first segment (e.g. "table:", "Rows:").
  segs[0] = segs[0].replace(/^[A-Za-z][\w ]*:\s*/, "");
  if (!segs.every((s) => s.includes("|"))) return null;
  return segs.map(splitRow);
}

function buildTableBlock(rows: string[][]): TableBlock {
  const cols = Math.max(...rows.map((r) => r.length));
  const norm = rows.map((r) => {
    const next = [...r];
    while (next.length < cols) next.push("");
    return next;
  });
  const header0 = norm[0] ?? [];
  const hasHeader =
    header0.length >= 2 && !header0.every((c) => isNumericCell(c) || c === "");
  return { type: "table", hasHeader, rows: norm };
}

/**
 * Parse a passage into ordered blocks. Each text block records its absolute
 * `start` so highlight offsets survive; table runs (≥2 consecutive piped lines)
 * become table blocks. A lone "table:" marker line is dropped.
 */
export function parsePassageBlocks(passage: string): PassageBlock[] {
  const blocks: PassageBlock[] = [];
  let i = 0;
  let cursor = 0; // absolute offset at the start of line `i`
  // Pre-compute line spans so we can recover absolute offsets.
  const lines = passage.split("\n");
  // For each line, its absolute start offset.
  const lineStart: number[] = [];
  {
    let acc = 0;
    for (const ln of lines) {
      lineStart.push(acc);
      acc += ln.length + 1; // + the '\n'
    }
  }

  let textStart: number | null = null;
  let textEndExclusive = 0;

  const flushText = (): void => {
    if (textStart === null) return;
    const text = passage.slice(textStart, textEndExclusive);
    if (text.trim() !== "") blocks.push({ type: "text", start: textStart, text });
    textStart = null;
  };

  while (i < lines.length) {
    const line = lines[i];
    // A table run = this line + the next line both piped (avoid treating a lone
    // piped prose line as a table). The preceding "table:" marker is consumed.
    const markerHere = isMarkerLine(line);
    const runStartIdx = markerHere ? i + 1 : i;
    const firstRunLine = lines[runStartIdx];
    const isRun =
      firstRunLine !== undefined &&
      isTableLine(firstRunLine) &&
      lines[runStartIdx + 1] !== undefined &&
      isTableLine(lines[runStartIdx + 1]);

    if (isRun) {
      flushText();
      let j = runStartIdx;
      const rowLines: string[] = [];
      while (j < lines.length && isTableLine(lines[j])) {
        rowLines.push(lines[j]);
        j += 1;
      }
      blocks.push(buildTableBlock(rowLines.map(splitRow)));
      i = j;
      cursor = lineStart[i] ?? passage.length;
      continue;
    }

    if (markerHere) {
      // drop the marker line entirely
      flushText();
      i += 1;
      cursor = lineStart[i] ?? passage.length;
      continue;
    }

    // Single-line inline table (rows joined by ";").
    const inline = parseInlineTable(line);
    if (inline) {
      flushText();
      blocks.push(buildTableBlock(inline));
      i += 1;
      cursor = lineStart[i] ?? passage.length;
      continue;
    }

    // Accumulate into the current text block (preserving internal newlines).
    if (textStart === null) textStart = lineStart[i];
    textEndExclusive = lineStart[i] + line.length;
    i += 1;
    cursor = lineStart[i] ?? passage.length;
  }
  void cursor;
  flushText();
  return blocks;
}

/**
 * Render a slice of raw text with its highlight <mark>s. `ranges` are ABSOLUTE
 * passage offsets; `baseOffset` is this slice's absolute start. The rendered
 * textContent equals `text` exactly (marks add no text), so offsets round-trip.
 */
export function renderText(
  text: string,
  baseOffset: number,
  field: AnnotField,
  ranges: Highlight[],
  onRemove?: (field: AnnotField, offset: number) => void,
): JSX.Element {
  // Clip + localize ranges to this slice.
  const local = mergeRanges(
    ranges
      .map((r) => ({ start: r.start - baseOffset, end: r.end - baseOffset }))
      .filter((r) => r.end > 0 && r.start < text.length),
  );
  if (local.length === 0 || !text) return <>{text}</>;
  const out: JSX.Element[] = [];
  let pos = 0;
  local.forEach((r, idx) => {
    const s = Math.max(0, Math.min(r.start, text.length));
    const e = Math.max(s, Math.min(r.end, text.length));
    if (s > pos) out.push(<span key={`t${idx}`}>{text.slice(pos, s)}</span>);
    out.push(
      <mark
        key={`m${idx}`}
        onClick={() => {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed) onRemove?.(field, baseOffset + s);
        }}
        title="Click to remove highlight"
        className="cursor-pointer rounded-sm bg-amber-200/70 text-inherit box-decoration-clone dark:bg-amber-300/40 dark:text-inherit"
      >
        {text.slice(s, e)}
      </mark>,
    );
    pos = e;
  });
  if (pos < text.length) out.push(<span key="tail">{text.slice(pos)}</span>);
  return <>{out}</>;
}

function PassageTable({ block }: { block: TableBlock }): JSX.Element {
  const { rows, hasHeader } = block;
  const body = hasHeader ? rows.slice(1) : rows;
  const cols = rows[0]?.length ?? 0;
  // Per-column alignment: right-align a column when its body cells are numeric.
  const alignRight: boolean[] = Array.from({ length: cols }, (_, c) => {
    const cells = body.map((r) => r[c] ?? "").filter((v) => v !== "");
    return cells.length > 0 && cells.every(isNumericCell);
  });
  return (
    <div
      className="my-3 overflow-x-auto"
      data-annot-skip
      // Table text drops the raw `|`/newline separators, so it must not feed the
      // offset model — selections here are intentionally non-highlightable.
      style={{ userSelect: "none" }}
    >
      <table className="w-full border-collapse text-[15px] tabular-nums">
        {hasHeader && (
          <thead>
            <tr>
              {rows[0].map((cell, c) => (
                <th
                  key={c}
                  scope="col"
                  className={[
                    "border-b-2 border-slate-300 px-3 py-2 font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200",
                    alignRight[c] ? "text-right" : "text-left",
                  ].join(" ")}
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row, r) => (
            <tr
              key={r}
              className={r % 2 === 1 ? "bg-slate-50/70 dark:bg-slate-800/30" : undefined}
            >
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={[
                    "border-b border-slate-200 px-3 py-1.5 text-slate-700 dark:border-slate-700/70 dark:text-slate-200",
                    alignRight[c] ? "text-right" : "text-left",
                    c === 0 && !alignRight[c] ? "font-medium" : "",
                  ].join(" ")}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PassageBodyProps {
  passage: string;
  ranges: Highlight[];
  serif: React.CSSProperties;
  onRemoveHighlight?: (field: AnnotField, offset: number) => void;
}

/**
 * Renders the passage as a stack of prose + table blocks. The root carries
 * `data-annot-field="passage"`; each prose block carries its absolute
 * `data-annot-offset` so the highlight layer maps DOM selections → raw offsets.
 */
export function PassageBody({
  passage,
  ranges,
  serif,
  onRemoveHighlight,
}: PassageBodyProps): JSX.Element {
  const blocks = parsePassageBlocks(passage);
  return (
    <div
      data-annot-field="passage"
      className="text-[17px] leading-relaxed text-slate-800 dark:text-slate-200"
      style={serif}
    >
      {blocks.map((block, idx) =>
        block.type === "table" ? (
          <PassageTable key={idx} block={block} />
        ) : (
          <div
            key={idx}
            data-annot-offset={block.start}
            className="whitespace-pre-wrap"
          >
            {renderText(block.text, block.start, "passage", ranges, onRemoveHighlight)}
          </div>
        ),
      )}
    </div>
  );
}
