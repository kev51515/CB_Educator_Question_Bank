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
