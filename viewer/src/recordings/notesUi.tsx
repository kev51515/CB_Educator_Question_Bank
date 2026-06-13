/**
 * Shared notes UI bits — the section heading with an icon, used by both the
 * editable teacher NotesView (RecordingDetailPage) and the read-only student
 * SharedRecordingView so the "Fathom notes" look is identical on both sides.
 */
const SECTION_ICONS: Record<string, JSX.Element> = {
  summary: <path d="M4 6h16M4 12h16M4 18h10" />,
  topics: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  actions: <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  highlights: <path d="M12 2l2.9 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 7.1-1.01L12 2Z" />,
};

export function NoteSectionHeading({
  kind,
  children,
}: {
  kind: keyof typeof SECTION_ICONS;
  children: string;
}) {
  return (
    <h2 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      <svg
        width={13}
        height={13}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-indigo-500"
        aria-hidden
      >
        {SECTION_ICONS[kind]}
      </svg>
      {children}
    </h2>
  );
}
