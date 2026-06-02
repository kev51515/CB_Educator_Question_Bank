import { CONFIDENCE } from "../lib/designSystem";

interface HeatmapCellProps {
  cell: { total: number; confSum: number; confCount: number; doneOnly: number } | null;
  skill: string;
  difficulty: string;
  onClick: (skill: string, difficulty: string) => void;
}

export function HeatmapCell({ cell, skill, difficulty, onClick }: HeatmapCellProps) {
  if (!cell || cell.total === 0) {
    // No questions exist for this skill/difficulty combo
    return <td className="text-center py-1.5 px-2" />;
  }

  const attempted = cell.confCount + cell.doneOnly;
  let dotColor: string;
  let label: string;

  if (attempted === 0) {
    // Not attempted
    dotColor = "bg-ink-200";
    label = `${skill} ${difficulty}: ${cell.total} questions, not attempted`;
  } else if (cell.confCount === 0) {
    // Done but no confidence rating
    dotColor = "bg-white border-2 border-accent-400";
    label = `${skill} ${difficulty}: ${attempted}/${cell.total} done, no confidence rating`;
  } else {
    const avg = cell.confSum / cell.confCount;
    if (avg <= 1.5) {
      dotColor = CONFIDENCE.unsure.dot;
      label = `${skill} ${difficulty}: ${attempted}/${cell.total}, mostly unsure`;
    } else if (avg <= 2.5) {
      dotColor = CONFIDENCE.okay.dot;
      label = `${skill} ${difficulty}: ${attempted}/${cell.total}, mostly okay`;
    } else {
      dotColor = CONFIDENCE.confident.dot;
      label = `${skill} ${difficulty}: ${attempted}/${cell.total}, mostly confident`;
    }
  }

  return (
    <td className="text-center py-1.5 px-2">
      <button
        type="button"
        onClick={() => onClick(skill, difficulty)}
        className="inline-flex flex-col items-center gap-0.5 focus-ring rounded p-1 hover:bg-ink-100 transition-colors"
        aria-label={label}
        title={label}
      >
        <span className={`inline-block w-3.5 h-3.5 rounded-full ${dotColor}`} />
        <span className="text-[9px] text-ink-400 tabular-nums leading-none">
          {attempted}/{cell.total}
        </span>
      </button>
    </td>
  );
}
