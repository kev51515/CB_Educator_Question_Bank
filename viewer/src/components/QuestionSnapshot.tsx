/**
 * QuestionSnapshot
 * ================
 * Generate a standalone HTML snapshot of a question (with metadata,
 * stimulus, stem, choices, annotations, and note) that can be opened
 * in a new tab, copied to the clipboard, or printed.
 *
 * The generated document is fully self-contained: all styles are inline,
 * so the file can be saved or shared and still render correctly.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Question } from "@/types";
import type { Annotation } from "./Annotations";
import { applyAnnotations } from "./Annotations";

/* ─── Types ─── */

interface SnapshotProps {
  question: Question;
  number: number | null;
  annotations: Annotation[];
  note: string;
}

interface SnapshotButtonProps {
  question: Question | null;
  number: number | null;
  annotations: Annotation[];
  note: string;
  showToast: (msg: string) => void;
}

/* ─── Helpers ─── */

const LETTERS = ["A", "B", "C", "D", "E"];

/** Minimal HTML escape for plain-text user content (e.g. notes). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function metaLine(q: Question): string {
  return [q.section, q.difficulty, q.domain, q.skill].filter(Boolean).join(" · ");
}

function correctLetter(q: Question): string | null {
  if (!q.keys || q.keys.length === 0) return null;
  const keyId = q.keys[0];
  if (q.answerOptions) {
    const idx = q.answerOptions.findIndex((o) => o.id === keyId);
    if (idx >= 0) return LETTERS[idx] ?? null;
  }
  return null;
}

/* ─── HTML generation ─── */

export function generateSnapshotHTML(props: SnapshotProps): string {
  const { question, number, annotations, note } = props;

  const title = `Question ${number ?? question.questionId}`;
  const meta = metaLine(question);
  const stimulus = question.stimulus
    ? applyAnnotations(question.stimulus, annotations)
    : "";
  const stem = applyAnnotations(question.stem, annotations);
  const correct = correctLetter(question);

  const choicesHtml =
    question.type === "mcq" && question.answerOptions
      ? question.answerOptions
          .map((opt, idx) => {
            const letter = LETTERS[idx] ?? "?";
            const isCorrect = correct === letter;
            const marker = isCorrect
              ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
              : "";
            return `
              <li style="margin:0 0 8px 0; padding:8px 12px; border:1px solid ${
                isCorrect ? "#16a34a" : "#e5e7eb"
              }; border-radius:6px; background:${
                isCorrect ? "#f0fdf4" : "#ffffff"
              };">
                <span style="display:inline-block; min-width:1.5em; font-weight:600; color:${
                  isCorrect ? "#15803d" : "#374151"
                };">${letter}.</span>
                <span>${opt.content}</span>
                <span style="float:right; color:#16a34a; font-weight:600;">${marker}</span>
              </li>`;
          })
          .join("")
      : "";

  const notesHtml = note.trim()
    ? `
      <section style="margin-top:24px; padding:12px 16px; background:#fffbeb; border-left:3px solid #f59e0b; border-radius:4px;">
        <h3 style="margin:0 0 6px 0; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:#92400e;">Note</h3>
        <p style="margin:0; white-space:pre-wrap; color:#78350f;">${escapeHtml(note)}</p>
      </section>`
    : "";

  const annotationsHtml = annotations.length
    ? `
      <section style="margin-top:24px; padding:12px 16px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:4px;">
        <h3 style="margin:0 0 6px 0; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:#374151;">Annotations (${annotations.length})</h3>
        <ul style="margin:0; padding-left:18px; color:#4b5563; font-size:13px;">
          ${annotations
            .map(
              (a) =>
                `<li style="margin-bottom:4px;"><span style="background:${
                  a.color === "yellow"
                    ? "rgba(251,191,36,0.3)"
                    : a.color === "green"
                      ? "rgba(52,211,153,0.3)"
                      : a.color === "blue"
                        ? "rgba(96,165,250,0.3)"
                        : "rgba(244,114,182,0.3)"
                }; padding:0 4px; border-radius:2px;">${escapeHtml(a.text)}</span></li>`,
            )
            .join("")}
        </ul>
      </section>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      mark.annotation-yellow { background: rgba(251, 191, 36, 0.3); border-radius: 2px; padding: 0 2px; }
      mark.annotation-green { background: rgba(52, 211, 153, 0.3); border-radius: 2px; padding: 0 2px; }
      mark.annotation-blue { background: rgba(96, 165, 250, 0.3); border-radius: 2px; padding: 0 2px; }
      mark.annotation-pink { background: rgba(244, 114, 182, 0.3); border-radius: 2px; padding: 0 2px; }
      @media print {
        body { padding: 0 !important; }
        .no-print { display: none !important; }
      }
    </style>
  </head>
  <body style="margin:0; padding:32px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#111827; background:#ffffff; max-width:720px; margin-left:auto; margin-right:auto; line-height:1.55;">
    <header style="border-bottom:1px solid #e5e7eb; padding-bottom:12px; margin-bottom:20px;">
      <h1 style="margin:0 0 4px 0; font-size:18px; font-weight:600;">${escapeHtml(title)}</h1>
      <p style="margin:0; color:#6b7280; font-size:12px;">${escapeHtml(meta)}</p>
      <p style="margin:4px 0 0 0; color:#9ca3af; font-size:11px;">ID: ${escapeHtml(question.questionId)}</p>
    </header>

    ${
      stimulus
        ? `<section style="margin-bottom:20px; padding:12px 16px; background:#f9fafb; border-radius:6px; font-size:14px;">${stimulus}</section>`
        : ""
    }

    <section style="margin-bottom:20px; font-size:15px;">${stem}</section>

    ${choicesHtml ? `<ol style="list-style:none; padding:0; margin:0;">${choicesHtml}</ol>` : ""}

    ${
      correct
        ? `<p style="margin-top:16px; color:#16a34a; font-size:13px; font-weight:600;">Correct answer: ${correct}</p>`
        : ""
    }

    ${annotationsHtml}
    ${notesHtml}

    ${
      question.rationale
        ? `<section style="margin-top:24px; padding:12px 16px; background:#eff6ff; border-left:3px solid #3b82f6; border-radius:4px;">
            <h3 style="margin:0 0 6px 0; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:#1e3a8a;">Rationale</h3>
            <div style="color:#1e3a8a; font-size:13.5px;">${question.rationale}</div>
          </section>`
        : ""
    }

    <footer style="margin-top:32px; padding-top:12px; border-top:1px solid #e5e7eb; color:#9ca3af; font-size:11px;">
      Snapshot generated ${escapeHtml(new Date().toLocaleString())}
    </footer>
  </body>
</html>`;
}

/* ─── SnapshotButton component ─── */

export function SnapshotButton({
  question,
  number,
  annotations,
  note,
  showToast,
}: SnapshotButtonProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
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

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const buildHtml = useCallback(
    (): string | null => {
      if (!question) return null;
      return generateSnapshotHTML({ question, number, annotations, note });
    },
    [question, number, annotations, note],
  );

  const handleOpenInTab = useCallback(() => {
    const html = buildHtml();
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      showToast("Popup blocked");
    } else {
      showToast("Snapshot opened");
    }
    // Revoke a little later so the new tab can load.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setOpen(false);
  }, [buildHtml, showToast]);

  const handleCopyHtml = useCallback(() => {
    const html = buildHtml();
    if (!html) return;
    navigator.clipboard.writeText(html).then(
      () => showToast("Copied HTML to clipboard"),
      () => showToast("Copy failed"),
    );
    setOpen(false);
  }, [buildHtml, showToast]);

  const handlePrint = useCallback(() => {
    const html = buildHtml();
    if (!html) return;
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) {
      showToast("Popup blocked");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    // Wait for layout/fonts before triggering print.
    const trigger = () => {
      try {
        win.focus();
        win.print();
      } catch {
        /* user may have closed the window */
      }
    };
    if (win.document.readyState === "complete") {
      trigger();
    } else {
      win.addEventListener("load", trigger);
    }
    showToast("Sent to print");
    setOpen(false);
  }, [buildHtml, showToast]);

  if (!question) return null;

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="px-2.5 py-1 rounded-md text-[11.5px] text-ink-600 hover:bg-ink-100 hover:text-ink-800 transition focus-ring inline-flex items-center gap-1"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Snapshot
        <svg
          className={"w-3 h-3 transition-transform " + (open ? "rotate-180" : "")}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
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
          role="menu"
          className="absolute right-0 mt-1 w-48 bg-white border border-ink-200 rounded-lg shadow-card z-30 py-1 text-[12px]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleOpenInTab}
            className="w-full text-left px-3 py-1.5 text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition-colors"
          >
            Open in new tab
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleCopyHtml}
            className="w-full text-left px-3 py-1.5 text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition-colors"
          >
            Copy as HTML
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handlePrint}
            className="w-full text-left px-3 py-1.5 text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition-colors"
          >
            Print snapshot
          </button>
        </div>
      )}
    </div>
  );
}
