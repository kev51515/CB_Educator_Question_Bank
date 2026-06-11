import { useCallback, useEffect, useRef, useState } from "react";
import type { Question } from "@/types";

/* ─── Shared types ─── */

interface ExportOptions {
  questions: Question[];
  numbers: Record<string, number | null>;
  notes: Record<string, string>;
  includeAnswerKey: boolean;
  includeRationale: boolean;
}

/* ─── Helpers ─── */

const LETTERS = ["A", "B", "C", "D", "E"];

/**
 * Strip HTML tags from a string.  For MathML, extract the alttext attribute
 * value first; if none, keep only text content.
 */
function stripHtml(html: string): string {
  // Extract alttext from MathML (e.g. <math alttext="x^2">…</math>)
  let result = html.replace(
    /<math[^>]*\balttext\s*=\s*"([^"]*)"[^>]*>[\s\S]*?<\/math>/gi,
    (_, alt: string) => alt,
  );
  // Remove any remaining MathML / HTML tags, keeping text content
  result = result.replace(/<[^>]+>/g, "");
  // Collapse whitespace
  result = result.replace(/\s+/g, " ").trim();
  // Decode common HTML entities
  result = result
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·");
  return result;
}

function questionMeta(q: Question): string {
  return [q.section, q.difficulty, q.domain, q.skill].filter(Boolean).join(" · ");
}

function answerLetter(q: Question): string {
  if (!q.keys || q.keys.length === 0) return "?";
  const keyId = q.keys[0];
  if (q.answerOptions) {
    const idx = q.answerOptions.findIndex((o) => o.id === keyId);
    if (idx >= 0) return LETTERS[idx] ?? "?";
  }
  return keyId;
}

/* ─── Plain text ─── */

export function exportAsPlainText(opts: ExportOptions): string {
  const { questions, numbers, notes, includeAnswerKey, includeRationale } = opts;
  const count = questions.length;
  const lines: string[] = [];

  lines.push(`OmniLMS — ${count} question${count === 1 ? "" : "s"}`);
  lines.push("=".repeat(40));
  lines.push("");

  questions.forEach((q, i) => {
    const num = numbers[q.questionId];
    const label = num != null ? `#${num}` : `#${i + 1}`;
    lines.push(`${label} · ${questionMeta(q)}`);

    if (q.stimulus) {
      lines.push(stripHtml(q.stimulus));
      lines.push("");
    }

    lines.push(stripHtml(q.stem));
    lines.push("");

    if (q.type === "mcq" && q.answerOptions) {
      q.answerOptions.forEach((o, j) => {
        lines.push(`${LETTERS[j] ?? "?"}. ${stripHtml(o.content)}`);
      });
      lines.push("");
    }

    if (includeRationale && q.rationale) {
      lines.push(`Rationale: ${stripHtml(q.rationale)}`);
      lines.push("");
    }

    const note = notes[q.questionId];
    if (note) {
      lines.push(`Note: ${note}`);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  });

  if (includeAnswerKey) {
    lines.push("Answer Key");
    const keyParts: string[] = [];
    questions.forEach((q, i) => {
      const num = numbers[q.questionId] ?? i + 1;
      keyParts.push(`#${num}: ${answerLetter(q)}`);
    });
    // Wrap at ~4 per line
    for (let k = 0; k < keyParts.length; k += 4) {
      lines.push(keyParts.slice(k, k + 4).join("  "));
    }
    lines.push("");
  }

  return lines.join("\n");
}

/* ─── CSV ─── */

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export function exportAsCsv(opts: ExportOptions): string {
  const { questions, numbers, notes, includeRationale } = opts;
  const rows: string[] = [];

  const headers = ["Number", "Section", "Difficulty", "Domain", "Skill", "Type", "Stem", "Answer"];
  if (includeRationale) headers.push("Rationale");
  headers.push("Note");
  rows.push(headers.join(","));

  questions.forEach((q, i) => {
    const num = numbers[q.questionId] ?? i + 1;
    const fields = [
      String(num),
      csvField(q.section),
      csvField(q.difficulty),
      csvField(q.domain),
      csvField(q.skill),
      csvField(q.type),
      csvField(stripHtml(q.stem)),
      csvField(answerLetter(q)),
    ];
    if (includeRationale) {
      fields.push(csvField(q.rationale ? stripHtml(q.rationale) : ""));
    }
    fields.push(csvField(notes[q.questionId] ?? ""));
    rows.push(fields.join(","));
  });

  return rows.join("\n");
}

/* ─── Markdown ─── */

export function exportAsMarkdown(opts: ExportOptions): string {
  const { questions, numbers, notes, includeAnswerKey, includeRationale } = opts;
  const count = questions.length;
  const lines: string[] = [];

  lines.push(`# OmniLMS — ${count} question${count === 1 ? "" : "s"}`);
  lines.push("");

  questions.forEach((q, i) => {
    const num = numbers[q.questionId];
    const label = num != null ? `#${num}` : `#${i + 1}`;
    lines.push(`## ${label} · ${questionMeta(q)}`);
    lines.push("");

    if (q.stimulus) {
      lines.push(stripHtml(q.stimulus));
      lines.push("");
    }

    lines.push(stripHtml(q.stem));
    lines.push("");

    if (q.type === "mcq" && q.answerOptions) {
      q.answerOptions.forEach((o, j) => {
        lines.push(`- **${LETTERS[j] ?? "?"}.** ${stripHtml(o.content)}`);
      });
      lines.push("");
    }

    if (includeRationale && q.rationale) {
      lines.push(`> **Rationale:** ${stripHtml(q.rationale)}`);
      lines.push("");
    }

    const note = notes[q.questionId];
    if (note) {
      lines.push(`> **Note:** ${note}`);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  });

  if (includeAnswerKey) {
    lines.push("## Answer Key");
    lines.push("");
    lines.push("| # | Answer |");
    lines.push("|---|--------|");
    questions.forEach((q, i) => {
      const num = numbers[q.questionId] ?? i + 1;
      lines.push(`| ${num} | ${answerLetter(q)} |`);
    });
    lines.push("");
  }

  return lines.join("\n");
}

/* ─── Download helper ─── */

function triggerDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Cleanup after a tick
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}

/* ─── ExportMenu component ─── */

interface ExportMenuProps {
  questions: Question[];
  numbers: Record<string, number | null>;
  notes: Record<string, string>;
  showToast: (msg: string) => void;
}

export function ExportMenu({
  questions,
  numbers,
  notes,
  showToast,
}: ExportMenuProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // Viewport-flip state (mirrors KebabMenu): `null` until measured — rendered
  // invisibly on first paint, then re-positioned and revealed to avoid a
  // one-frame flicker on the wrong side.
  const [side, setSide] = useState<"right" | "left" | null>(null);
  const [vside, setVside] = useState<"down" | "up" | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Measure after layout: flip horizontally if the menu would overflow the
  // right viewport edge, vertically if it would overflow the bottom.
  useEffect(() => {
    if (!open) {
      setSide(null);
      setVside(null);
      return;
    }
    if (!popRef.current) return;
    const rect = popRef.current.getBoundingClientRect();
    setSide(rect.right > window.innerWidth - 8 ? "left" : "right");
    setVside(rect.bottom > window.innerHeight - 8 ? "up" : "down");
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const makeOpts = useCallback(
    (includeAnswerKey: boolean, includeRationale: boolean): ExportOptions => ({
      questions,
      numbers,
      notes,
      includeAnswerKey,
      includeRationale,
    }),
    [questions, numbers, notes],
  );

  const handleCopyText = useCallback(() => {
    const text = exportAsPlainText(makeOpts(true, false));
    navigator.clipboard.writeText(text).then(
      () => showToast("Copied to clipboard"),
      () => showToast("Copy failed"),
    );
    setOpen(false);
  }, [makeOpts, showToast]);

  const handleCopyMarkdown = useCallback(() => {
    const md = exportAsMarkdown(makeOpts(true, false));
    navigator.clipboard.writeText(md).then(
      () => showToast("Copied to clipboard"),
      () => showToast("Copy failed"),
    );
    setOpen(false);
  }, [makeOpts, showToast]);

  const handleDownloadCsv = useCallback(() => {
    const csv = exportAsCsv(makeOpts(false, true));
    triggerDownload(csv, "worksheet.csv", "text/csv;charset=utf-8");
    showToast("Downloaded worksheet.csv");
    setOpen(false);
  }, [makeOpts, showToast]);

  const handleDownloadMarkdown = useCallback(() => {
    const md = exportAsMarkdown(makeOpts(true, true));
    triggerDownload(md, "worksheet.md", "text/markdown;charset=utf-8");
    showToast("Downloaded worksheet.md");
    setOpen(false);
  }, [makeOpts, showToast]);

  if (questions.length === 0) return null;

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="px-2.5 py-1 rounded-md text-[11.5px] text-ink-600 hover:bg-ink-100 hover:text-ink-800 transition focus-ring inline-flex items-center gap-1"
      >
        Export
        <svg
          className={"w-3 h-3 transition-transform " + (open ? "rotate-180" : "")}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          ref={popRef}
          className={
            "absolute min-w-[11rem] max-w-[18rem] bg-white border border-ink-200 rounded-lg shadow-card z-30 py-1 text-[12px] " +
            (side === "left" ? "left-0 " : "right-0 ") +
            (vside === "up" ? "bottom-full mb-1 " : "top-full mt-1 ") +
            (side === null || vside === null ? "invisible" : "")
          }
        >
          <button
            type="button"
            onClick={handleCopyText}
            className="w-full text-left px-3 py-1.5 text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition-colors"
          >
            Copy as text
          </button>
          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="w-full text-left px-3 py-1.5 text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition-colors"
          >
            Copy as Markdown
          </button>
          <div className="border-t border-ink-100 my-1" />
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="w-full text-left px-3 py-1.5 text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition-colors"
          >
            Download CSV
          </button>
          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="w-full text-left px-3 py-1.5 text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition-colors"
          >
            Download Markdown
          </button>
        </div>
      )}
    </div>
  );
}
