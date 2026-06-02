interface ConfidenceRatingProps {
  questionId: string;
  rating: number; // 0 = unrated, 1 = unsure, 2 = okay, 3 = confident
  onRate: (questionId: string, rating: number) => void;
}

const LEVELS = [
  { label: "Unsure", fill: "bg-rose-500", outline: "border-ink-300" },
  { label: "Okay", fill: "bg-amber-500", outline: "border-ink-300" },
  { label: "Confident", fill: "bg-emerald-500", outline: "border-ink-300" },
] as const;

function fillColor(rating: number, index: number): string {
  if (rating === 0 || index >= rating) return "border border-ink-300 bg-transparent";
  if (rating === 1) return "bg-rose-500 border border-rose-500";
  if (rating === 2) return "bg-amber-500 border border-amber-500";
  return "bg-emerald-500 border border-emerald-500";
}

export function ConfidenceRating({ questionId, rating, onRate }: ConfidenceRatingProps) {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Confidence rating">
      {LEVELS.map((level, i) => {
        const value = i + 1;
        const active = rating >= value && rating > 0;
        return (
          <button
            key={value}
            type="button"
            className={`inline-block rounded-full focus-ring transition-colors ${fillColor(rating, i)}`}
            style={{ width: 10, height: 10 }}
            data-tooltip={level.label}
            aria-label={`Rate ${level.label}${active ? " (selected)" : ""}`}
            onClick={() => onRate(questionId, rating === value ? 0 : value)}
          />
        );
      })}
    </span>
  );
}
