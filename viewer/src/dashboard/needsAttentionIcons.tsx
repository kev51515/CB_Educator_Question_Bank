// ─── Tiny SVG icons ───────────────────────────────────────────────────────

export function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`transition-transform ${collapsed ? "-rotate-90" : "rotate-0"}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function RowChevron() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-slate-400 dark:text-slate-500"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ─── Section header icons (slate line icons) ──────────────────────────────

function SectionIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-slate-400 dark:text-slate-500"
    >
      {children}
    </svg>
  );
}

/** "To grade" — clipboard with a check. */
export function GradeIcon() {
  return (
    <SectionIcon>
      <path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
      <rect x={9} y={3} width={6} height={4} rx={1} />
      <path d="m9 14 2 2 4-4" />
    </SectionIcon>
  );
}

/** "Past due" — clock. */
export function PastDueIcon() {
  return (
    <SectionIcon>
      <circle cx={12} cy={12} r={9} />
      <path d="M12 7.5V12l3 1.8" />
    </SectionIcon>
  );
}

/** "New replies" — chat bubble. */
export function RepliesIcon() {
  return (
    <SectionIcon>
      <path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.7A8.4 8.4 0 1 1 21 11.5Z" />
    </SectionIcon>
  );
}

/** "At-risk students" — alert triangle. */
export function AtRiskIcon() {
  return (
    <SectionIcon>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1={12} y1={9} x2={12} y2={13} />
      <line x1={12} y1={17} x2={12.01} y2={17} />
    </SectionIcon>
  );
}

export function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={spinning ? "animate-spin" : ""}
    >
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <polyline points="16 8 21 8 21 3" />
      <polyline points="8 16 3 16 3 21" />
    </svg>
  );
}
