/**
 * Recordings — small pure formatting + export helpers (no React).
 */
import type { Recording, RecordingNotes, RecordingPart } from "./types";

/** Relative time: "just now" / "5 min ago" / "in 3 days"; falls back to a date. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then; // +ve = past
  const abs = Math.abs(diff);
  const MIN = 60_000, HR = 3_600_000, DAY = 86_400_000;
  const unit = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"}`;
  let label: string;
  if (abs < MIN) return "just now";
  else if (abs < HR) label = unit(Math.round(abs / MIN), "min");
  else if (abs < DAY) label = unit(Math.round(abs / HR), "hour");
  else if (abs < 7 * DAY) label = unit(Math.round(abs / DAY), "day");
  else return new Date(iso).toLocaleDateString();
  return diff >= 0 ? `${label} ago` : `in ${label}`;
}

/** Seconds → "m:ss" (or "Ns" under a minute). */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m >= 1 ? `${m}:${String(s).padStart(2, "0")}` : `${seconds}s`;
}

/** Milliseconds → "m:ss" for transcript timestamps. */
export function fmtTs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Display a speaker label: bare A–Z → "Speaker A"; a custom name → as-is. */
export function speakerDisplay(speaker: string): string {
  return /^[A-Z]$/.test(speaker) ? `Speaker ${speaker}` : speaker;
}

/** Plain-text transcript with Part dividers + speaker labels (for copy/export). */
export function transcriptToText(parts: RecordingPart[]): string {
  return parts
    .filter((p) => p.transcript?.length)
    .map(
      (p) =>
        `[Part ${p.part_index}]\n` +
        (p.transcript ?? [])
          .map((u) => `${speakerDisplay(u.speaker)}: ${u.text}`)
          .join("\n"),
    )
    .join("\n\n");
}

/** Notes + transcript as a single Markdown document (for download). */
export function recordingToMarkdown(
  recording: Recording,
  notes: RecordingNotes | null,
  parts: RecordingPart[],
): string {
  const out: string[] = [`# ${recording.title}`, ""];
  if (notes) {
    if (notes.tldr) out.push("## Summary", "", notes.tldr, "");
    if (notes.topics.length) {
      out.push("## Topics", "");
      for (const t of notes.topics) out.push(`- **${t.title}** — ${t.summary}`);
      out.push("");
    }
    if (notes.action_items.length) {
      out.push("## Action items", "");
      for (const a of notes.action_items)
        out.push(`- [ ] ${a.text}${a.owner ? ` (${a.owner})` : ""}`);
      out.push("");
    }
    if (notes.highlights.length) {
      out.push("## Highlights", "");
      for (const h of notes.highlights) out.push(`> ${h.quote}`);
      out.push("");
    }
  }
  out.push("## Transcript", "", transcriptToText(parts));
  return out.join("\n");
}

/** Trigger a client-side download of text content. */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function esc(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A clean, printer-friendly HTML document for a recording's notes + transcript.
 * Mirrors the question-bank PdfExport approach: a self-contained styled doc that
 * the browser prints (→ "Save as PDF"). Fathom-style: cover meta, then notes
 * sections, then the full transcript with Part dividers + speaker labels.
 */
export function recordingPrintHTML(
  recording: Recording,
  notes: RecordingNotes | null,
  parts: RecordingPart[],
): string {
  const subtitle = `${new Date(recording.created_at).toLocaleString()} · ${
    recording.subject_type === "session" ? "Session" : "Voice note"
  } · ${parts.length} part${parts.length === 1 ? "" : "s"}`;

  const sec = (title: string, body: string) =>
    body
      ? `<section class="sec"><h2>${esc(title)}</h2>${body}</section>`
      : "";

  const notesHtml = notes
    ? sec("Summary", notes.tldr ? `<p class="lead">${esc(notes.tldr)}</p>` : "") +
      sec(
        "Topics",
        notes.topics.length
          ? `<ul class="topics">${notes.topics
              .map(
                (t) =>
                  `<li><div class="t-title">${esc(t.title)}</div><div class="t-sum">${esc(
                    t.summary,
                  )}</div></li>`,
              )
              .join("")}</ul>`
          : "",
      ) +
      sec(
        "Action items",
        notes.action_items.length
          ? `<ul class="checks">${notes.action_items
              .map((a) => `<li>${esc(a.text)}${a.owner ? ` <span class="owner">— ${esc(a.owner)}</span>` : ""}</li>`)
              .join("")}</ul>`
          : "",
      ) +
      sec(
        "Highlights",
        notes.highlights.length
          ? notes.highlights.map((h) => `<blockquote>${esc(h.quote)}</blockquote>`).join("")
          : "",
      )
    : "";

  const transcriptHtml = parts
    .filter((p) => p.transcript?.length)
    .map(
      (p) =>
        `<div class="part"><div class="part-h">Part ${p.part_index}</div>${(p.transcript ?? [])
          .map(
            (u) =>
              `<p class="utt"><span class="spk">${esc(speakerDisplay(u.speaker))}</span> ${esc(u.text)}</p>`,
          )
          .join("")}</div>`,
    )
    .join("");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(recording.title)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{font-family:-apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif;color:#1d1d20;background:#fff;font-size:11pt;line-height:1.55}
  body{padding:0.6in;max-width:7.3in;margin:0 auto}
  h1{font-size:20pt;font-weight:700;letter-spacing:-0.01em;margin-bottom:4px}
  .meta{color:#6b7280;font-size:10pt;margin-bottom:0.4in}
  .sec{margin-bottom:0.34in;page-break-inside:avoid}
  h2{font-size:9.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6366f1;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin-bottom:10px}
  .lead{font-size:11.5pt;color:#26262b}
  ul{list-style:none}
  .topics li{margin-bottom:9px}
  .t-title{font-weight:600}
  .t-sum{color:#4b5563;font-size:10.5pt}
  .checks li{position:relative;padding-left:20px;margin-bottom:5px}
  .checks li:before{content:"\\2610";position:absolute;left:0;color:#9ca3af}
  .owner{color:#6b7280}
  blockquote{border-left:3px solid #c7d2fe;padding:2px 0 2px 12px;margin:7px 0;font-style:italic;color:#374151}
  .transcript-h{font-size:9.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin:0.3in 0 12px;page-break-before:auto}
  .part{margin-bottom:14px;page-break-inside:auto}
  .part-h{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6366f1;margin:10px 0 6px}
  .utt{margin-bottom:5px;font-size:10.5pt}
  .spk{font-weight:600;color:#6b7280;margin-right:4px}
  @media print{body{padding:0.5in}}
</style></head><body>
<h1>${esc(recording.title)}</h1>
<div class="meta">${esc(subtitle)}</div>
${notesHtml}
${transcriptHtml ? `<div class="transcript-h">Full transcript</div>${transcriptHtml}` : ""}
</body></html>`;
}

/** Open a print-friendly window for the recording and trigger the print dialog. */
export function printRecording(
  recording: Recording,
  notes: RecordingNotes | null,
  parts: RecordingPart[],
): void {
  const html = recordingPrintHTML(recording, notes, parts);
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    w.print();
    setTimeout(() => w.close(), 1000);
  }, 350);
}

/** A filesystem-safe slug from a title. */
export function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "recording"
  );
}
