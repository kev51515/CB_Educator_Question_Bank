/**
 * StarRating
 * ==========
 * A small, accessible star display + grading control, shared by the counseling
 * star-grading surfaces (migration 0140). Counseling deliverables earn
 * "punctuality" stars automatically (locked at submission) plus counselor-
 * awarded "quality" stars, so this component models BOTH:
 *
 *   - Read-only display (`interactive` omitted): renders `value` filled of `max`,
 *     with the first `lockedCount` (punctuality) stars tinted indigo and the
 *     quality stars amber — so a student can glance down their list and read the
 *     score at a glance.
 *   - Grading control (`interactive`): the first `lockedCount` stars are static
 *     (auto punctuality, not clickable); the remaining stars are buttons. Clicking
 *     the k-th quality star calls `onChange(k)` — i.e. the QUALITY value (0..max-
 *     locked), not the absolute star count. Hovering previews the fill.
 *
 * Pure inline SVG, no deps, no emojis. Keyboard accessible (each interactive star
 * is a real button; click-again on the lowest filled quality star clears to 0).
 */
import { useState } from "react";

type Size = "sm" | "md" | "lg";

const PX: Record<Size, number> = { sm: 14, md: 18, lg: 24 };

export interface StarRatingProps {
  /** Filled stars to show (absolute, including locked punctuality stars). */
  value: number;
  /** Total stars. Default 5. */
  max?: number;
  /** First N stars are "locked" (auto punctuality) — tinted + non-interactive. */
  lockedCount?: number;
  /** Render as a grading control; the non-locked stars become buttons. */
  interactive?: boolean;
  /** Called with the QUALITY value (clicked star index minus lockedCount). */
  onChange?: (quality: number) => void;
  size?: Size;
  /** Accessible label override for the read-only display. */
  label?: string;
  className?: string;
}

function StarIcon({ px, className }: { px: number; className: string }) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      <path
        d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.77 6.2 20.84l1.11-6.46-4.7-4.58 6.49-.94z"
        fill="currentColor"
      />
    </svg>
  );
}

export function StarRating({
  value,
  max = 5,
  lockedCount = 0,
  interactive = false,
  onChange,
  size = "md",
  label,
  className,
}: StarRatingProps): JSX.Element {
  const px = PX[size];
  const [hover, setHover] = useState<number | null>(null);

  const stars = Array.from({ length: max }, (_, i) => i + 1);

  // Read-only display: a single labelled image of filled/empty stars.
  if (!interactive) {
    return (
      <span
        role="img"
        aria-label={label ?? `${value} of ${max} stars`}
        className={["inline-flex items-center gap-0.5", className ?? ""].join(" ")}
      >
        {stars.map((n) => {
          const filled = n <= value;
          const locked = n <= lockedCount;
          const color = !filled
            ? "text-slate-300 dark:text-slate-700"
            : locked
              ? "text-indigo-500 dark:text-indigo-400"
              : "text-amber-500 dark:text-amber-400";
          return <StarIcon key={n} px={px} className={color} />;
        })}
      </span>
    );
  }

  // Grading control: locked stars static, quality stars interactive.
  const effective = hover ?? value;
  return (
    <div
      role="group"
      aria-label={label ?? "Award quality stars"}
      className={["inline-flex items-center gap-0.5", className ?? ""].join(" ")}
      onMouseLeave={() => setHover(null)}
    >
      {stars.map((n) => {
        const locked = n <= lockedCount;
        const filled = n <= effective;
        if (locked) {
          return (
            <span key={n} className="inline-flex" title="Punctuality (automatic)">
              <StarIcon
                px={px}
                className={
                  filled
                    ? "text-indigo-500 dark:text-indigo-400"
                    : "text-slate-300 dark:text-slate-700"
                }
              />
            </span>
          );
        }
        const quality = n - lockedCount;
        return (
          <button
            key={n}
            type="button"
            aria-label={`Award ${quality} quality ${quality === 1 ? "star" : "stars"}`}
            aria-pressed={n <= value}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            // Click the current top quality star again to clear back to 0.
            onClick={() => onChange?.(n === value ? quality - 1 : quality)}
            className="inline-flex min-h-[40px] min-w-[28px] items-center justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <StarIcon
              px={px}
              className={[
                filled
                  ? "text-amber-500 dark:text-amber-400"
                  : "text-slate-300 dark:text-slate-700",
                "transition-colors",
              ].join(" ")}
            />
          </button>
        );
      })}
    </div>
  );
}
