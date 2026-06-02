interface HighlightProps {
  text: string;
  query: string;
  className?: string;
}

/** Escape special regex characters so the query can be used in a RegExp safely. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function Highlight({ text, query, className }: HighlightProps): JSX.Element {
  if (!query || !text) {
    return <span className={className}>{text}</span>;
  }

  const escaped = escapeRegex(query);
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  // If splitting produced only one part, there was no match.
  if (parts.length === 1) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            className="bg-amber-200/60 text-inherit rounded-sm px-px"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
