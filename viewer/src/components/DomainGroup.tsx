import { DIFFICULTY_ORDER } from "./progressDashboardHelpers";
import { HeatmapCell } from "./HeatmapCell";

interface DomainGroupProps {
  domain: string;
  skills: string[];
  cellMap: Map<string, { total: number; confSum: number; confCount: number; doneOnly: number }>;
  onCellClick: (skill: string, difficulty: string) => void;
}

export function DomainGroup({ domain, skills, cellMap, onCellClick }: DomainGroupProps) {
  return (
    <>
      {/* Domain header row */}
      <tr>
        <td
          colSpan={1 + DIFFICULTY_ORDER.length}
          className="pt-4 pb-1 text-[11px] font-semibold text-ink-500 uppercase tracking-wide border-b border-ink-150"
        >
          {domain}
        </td>
      </tr>
      {skills.map((skill) => (
        <tr key={skill} className="group/row hover:bg-ink-50 transition-colors">
          <td className="py-1.5 pr-3 text-ink-700 sticky left-0 bg-white group-hover/row:bg-ink-50 transition-colors">
            {skill}
          </td>
          {DIFFICULTY_ORDER.map((diff) => {
            const key = `${skill}|||${diff}`;
            const cell = cellMap.get(key);
            return (
              <HeatmapCell
                key={diff}
                cell={cell ?? null}
                skill={skill}
                difficulty={diff}
                onClick={onCellClick}
              />
            );
          })}
        </tr>
      ))}
    </>
  );
}
