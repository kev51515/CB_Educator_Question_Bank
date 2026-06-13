/**
 * ModuleContentBlocks
 * ===================
 * Three self-contained, READ-ONLY render components for the student course
 * module list:
 *  - VideoBlock — responsive 16:9 embed for YouTube / Vimeo / Loom (anchor
 *    fallback for unknown providers; never injects raw HTML).
 *  - PageBlock — stored lesson text rendered safely WITHOUT
 *    dangerouslySetInnerHTML: paragraphs split on blank lines, single newlines
 *    become <br/>, with minimal **bold** / *italic* inline parsing.
 *  - FileBlock — compact download/open row with an inline file icon.
 */
import type { JSX, ReactNode } from "react";

// ── VideoBlock ─────────────────────────────────────────────────────────────

function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") {
        const v = u.searchParams.get("v");
        return v ? `https://www.youtube.com/embed/${v}` : null;
      }
      if (u.pathname.startsWith("/embed/")) return `https://www.youtube.com${u.pathname}`;
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === "loom.com") {
      const m = u.pathname.match(/\/share\/([\w-]+)/) ?? u.pathname.match(/\/embed\/([\w-]+)/);
      return m ? `https://www.loom.com/embed/${m[1]}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function VideoBlock({ url, title }: { url: string; title?: string }): JSX.Element {
  const embed = toEmbedUrl(url);
  const label = title ?? "Video";
  if (!embed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-sky-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-sky-800 dark:text-sky-300 dark:ring-slate-700 dark:hover:bg-slate-800"
      >
        Open video ↗
      </a>
    );
  }
  return (
    <div className="relative w-full overflow-hidden rounded-lg ring-1 ring-slate-200 dark:ring-slate-700">
      <div className="aspect-video w-full">
        <iframe
          src={embed}
          title={label}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    </div>
  );
}

// ── PageBlock ──────────────────────────────────────────────────────────────

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Match **bold** or *italic*; emit plain spans for the rest.
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) nodes.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3] !== undefined) nodes.push(<em key={key++}>{m[3]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderParagraph(block: string): ReactNode[] {
  const lines = block.split("\n");
  const out: ReactNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) out.push(<br key={`br-${i}`} />);
    out.push(...renderInline(line));
  });
  return out;
}

export function PageBlock({ body }: { body: string }): JSX.Element {
  const blocks = body.split(/\n\s*\n/).filter((b) => b.trim().length > 0);
  return (
    <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 space-y-2">
      {blocks.length === 0 ? (
        <p className="text-slate-400 dark:text-slate-500">No content.</p>
      ) : (
        blocks.map((b, i) => <p key={i}>{renderParagraph(b)}</p>)
      )}
    </div>
  );
}

// ── FileBlock ──────────────────────────────────────────────────────────────

export function FileBlock({ url, title }: { url: string; title?: string }): JSX.Element {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"
        aria-hidden="true"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
      <span className="truncate">{title ?? "File"}</span>
    </a>
  );
}
