import { useCallback } from "react";
import type { Question } from "@/types";

interface PdfExportProps {
  questions: Question[];
  numbers: Record<string, number | null>;
  notes: Record<string, string>;
  onStart?: () => void;
  onDone?: () => void;
}

const LETTERS = ["A", "B", "C", "D", "E"];

export function generateWorksheetHTML(
  questions: Question[],
  numbers: Record<string, number | null>,
  notes: Record<string, string>,
): string {
  const count = questions.length;
  const title = `OmniLMS — ${count} question${count === 1 ? "" : "s"}`;

  const questionBlocks = questions
    .map((q, i) => {
      const num = numbers[q.questionId];
      const label = num != null ? `#${num}` : `Question ${i + 1}`;
      const meta = [q.section, q.difficulty, q.domain, q.skill]
        .filter(Boolean)
        .join(" &middot; ");
      const note = notes[q.questionId];

      let choicesHtml = "";
      if (q.type === "mcq" && q.answerOptions) {
        const items = q.answerOptions
          .map(
            (o, j) =>
              `<li style="padding:6px 0 6px 28px;position:relative;font-size:10.5pt;page-break-inside:avoid;">` +
              `<span style="position:absolute;left:0;font-weight:600;">${LETTERS[j] ?? "?"}.</span>` +
              `<span>${o.content}</span>` +
              `</li>`,
          )
          .join("");
        choicesHtml = `<ol style="list-style:none;padding-left:0;margin:0;">${items}</ol>`;
      } else if (q.type === "spr") {
        choicesHtml = `<div style="border:1px solid #ccc;padding:12px;margin-top:8px;font-size:10pt;color:#555;">Student-produced response: __________________</div>`;
      }

      const stimulusHtml = q.stimulus
        ? `<div style="border-left:2px solid #ccc;padding-left:10px;margin-bottom:10px;font-size:10.5pt;">${q.stimulus}</div>`
        : "";

      const noteHtml = note
        ? `<div style="font-size:9.5pt;color:#555;font-style:italic;margin-top:8px;padding-left:10px;border-left:2px solid #e5e5e5;">Note: ${escapeHtml(note)}</div>`
        : "";

      return (
        `<article style="page-break-inside:avoid;margin-bottom:0.45in;">` +
        `<header style="border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:baseline;gap:12px;">` +
        `<span style="font-weight:600;font-size:12pt;">${escapeHtml(label)}</span>` +
        `<span style="font-size:9pt;color:#555;">${meta}</span>` +
        `</header>` +
        stimulusHtml +
        `<div style="margin-bottom:10px;font-size:11pt;font-weight:500;">${q.stem}</div>` +
        choicesHtml +
        noteHtml +
        `</article>`
      );
    })
    .join("\n");

  // Answer key
  const answerRows = questions
    .map((q) => {
      const num = numbers[q.questionId];
      const label = num != null ? `#${num}` : q.questionId;
      let answer = "—"; // em dash
      if (q.type === "mcq" && q.answerOptions && q.keys?.length) {
        const idx = q.answerOptions.findIndex((o) => o.id === q.keys?.[0]);
        if (idx >= 0) answer = LETTERS[idx] ?? "?";
      } else if (q.type === "spr" && q.keys?.length) {
        answer = escapeHtml(q.keys[0]);
      }
      return (
        `<tr>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #eee;">${escapeHtml(label)}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #eee;">${escapeHtml(q.skill)}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #eee;font-weight:600;width:40px;text-align:right;">${answer}</td>` +
        `</tr>`
      );
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #1d1d20;
    background: white;
  }
  body { padding: 0.5in; }
  math {
    font-size: 1.06em;
    font-family: "STIX Two Math", "Cambria Math", "Latin Modern Math", serif;
  }
  img, svg { max-width: 100%; height: auto; }
  table { border-collapse: collapse; }
  p { margin: 0 0 0.85rem 0; }
  p:last-child { margin-bottom: 0; }
  @media print {
    body { padding: 0.5in; }
  }
</style>
</head>
<body>
<div style="font-size:13pt;font-weight:600;margin-bottom:0.4in;color:#1d1d20;">
  ${escapeHtml(title)}
</div>
${questionBlocks}
<hr style="border:0;border-top:1px solid #ccc;margin:0.3in 0 0.2in;page-break-before:always;">
<h2 style="font-size:13pt;font-weight:600;margin:0 0 0.2in;">Answer Key</h2>
<table style="width:100%;border-collapse:collapse;font-size:10pt;">
<tbody>
${answerRows}
</tbody>
</table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function PdfExportButton({
  questions,
  numbers,
  notes,
  onStart,
  onDone,
}: PdfExportProps): JSX.Element | null {
  const handleClick = useCallback(() => {
    onStart?.();
    const html = generateWorksheetHTML(questions, numbers, notes);
    const newWindow = window.open("", "_blank");
    if (!newWindow) {
      onDone?.();
      return;
    }
    newWindow.document.write(html);
    newWindow.document.close();
    // Give the browser time to render MathML and layout before triggering print
    setTimeout(() => {
      newWindow.print();
      // Close after a delay so the print dialog can finish
      setTimeout(() => {
        newWindow.close();
        onDone?.();
      }, 1000);
    }, 400);
  }, [questions, numbers, notes, onStart, onDone]);

  if (questions.length === 0) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      className="px-3 py-1.5 rounded-md bg-accent-600 text-white text-[12px] font-medium hover:bg-accent-700 transition-colors focus-ring inline-flex items-center gap-1.5"
    >
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-3.5 h-3.5"
        aria-hidden="true"
      >
        <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
        <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
      </svg>
      Export PDF
    </button>
  );
}
