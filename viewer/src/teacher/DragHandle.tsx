/** Six-dot Canvas-style drag handle. */
function DragHandle({
  className,
  compact = false,
}: {
  className?: string;
  /** Smaller variant for nested rows so child chrome reads as lower-level. */
  compact?: boolean;
}): JSX.Element {
  const w = compact ? 10 : 14;
  const h = compact ? 14 : 20;
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 14 20"
      aria-hidden
      style={{ touchAction: "none" }}
      className={`cursor-grab active:cursor-grabbing opacity-60 hover:opacity-100 ${className ?? ""}`}
    >
      <circle cx={4} cy={5} r={1.5} fill="currentColor" />
      <circle cx={10} cy={5} r={1.5} fill="currentColor" />
      <circle cx={4} cy={10} r={1.5} fill="currentColor" />
      <circle cx={10} cy={10} r={1.5} fill="currentColor" />
      <circle cx={4} cy={15} r={1.5} fill="currentColor" />
      <circle cx={10} cy={15} r={1.5} fill="currentColor" />
    </svg>
  );
}

export { DragHandle };
