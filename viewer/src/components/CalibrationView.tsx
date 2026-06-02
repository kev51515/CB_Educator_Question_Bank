import { useEffect, useMemo, useRef } from "react";
import type { IndexEntry } from "@/types";
import { IDENTITY } from "../lib/designTokens";
import { useFocusTrap } from "../hooks";

interface CalibrationViewProps {
  open: boolean;
  onClose: () => void;
  index: IndexEntry[];
  confidence: { getAll: () => Record<string, number> };
  onFilterToQuestion: (id: string) => void;
}

type DifficultyKey = "Easy" | "Medium" | "Hard";
type ConfidenceKey = "Unsure" | "Okay" | "Confident";

const DIFFICULTIES: DifficultyKey[] = ["Easy", "Medium", "Hard"];
const CONFIDENCES: ConfidenceKey[] = ["Unsure", "Okay", "Confident"];

/** Map a raw difficulty string from the index into our canonical key, or null if unknown. */
function normalizeDifficulty(raw: string): DifficultyKey | null {
  const lower = raw.toLowerCase();
  if (lower === "easy") return "Easy";
  if (lower === "medium") return "Medium";
  if (lower === "hard") return "Hard";
  return null;
}

/** Map a rating number (1-3) into the canonical confidence label. */
function confidenceLabel(rating: number): ConfidenceKey | null {
  if (rating === 1) return "Unsure";
  if (rating === 2) return "Okay";
  if (rating === 3) return "Confident";
  return null;
}

interface SurpriseItem {
  entry: IndexEntry;
  difficulty: DifficultyKey;
  confidence: ConfidenceKey;
  /** Type of surprise: "struggling" = easy + unsure, "stronger" = hard + confident */
  kind: "struggling" | "stronger";
}

interface CalibrationData {
  /** matrix[difficultyIndex][confidenceIndex] = count */
  matrix: number[][];
  total: number;
  agreement: number; // count on the diagonal
  score: number; // 0-100
  surprises: SurpriseItem[];
}

function computeCalibration(
  index: IndexEntry[],
  ratings: Record<string, number>,
): CalibrationData {
  const matrix: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  let total = 0;
  let agreement = 0;
  const struggling: SurpriseItem[] = [];
  const stronger: SurpriseItem[] = [];

  // Build a lookup of entries by id for fast access
  const byId = new Map<string, IndexEntry>();
  for (const entry of index) {
    byId.set(entry.id, entry);
  }

  for (const [id, rating] of Object.entries(ratings)) {
    const entry = byId.get(id);
    if (!entry) continue;
    const diff = normalizeDifficulty(entry.difficulty);
    const conf = confidenceLabel(rating);
    if (!diff || !conf) continue;
    const diffIdx = DIFFICULTIES.indexOf(diff);
    const confIdx = CONFIDENCES.indexOf(conf);
    matrix[diffIdx][confIdx]++;
    total++;
    if (diffIdx === confIdx) agreement++;

    if (diff === "Easy" && conf === "Unsure") {
      struggling.push({ entry, difficulty: diff, confidence: conf, kind: "struggling" });
    } else if (diff === "Hard" && conf === "Confident") {
      stronger.push({ entry, difficulty: diff, confidence: conf, kind: "stronger" });
    }
  }

  const score = total > 0 ? Math.round((agreement / total) * 100) : 0;

  // Surprise list: interleave struggling and stronger, capped at 10 total
  const surprises: SurpriseItem[] = [];
  const maxLen = Math.max(struggling.length, stronger.length);
  for (let i = 0; i < maxLen && surprises.length < 10; i++) {
    if (i < struggling.length && surprises.length < 10) surprises.push(struggling[i]);
    if (i < stronger.length && surprises.length < 10) surprises.push(stronger[i]);
  }

  return { matrix, total, agreement, score, surprises };
}

function scoreColorClass(score: number): string {
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-rose-600";
}

export function CalibrationView(props: CalibrationViewProps): JSX.Element | null {
  const { open, onClose, index, confidence, onFilterToQuestion } = props;
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, open);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const data = useMemo<CalibrationData>(() => {
    if (!open) {
      return {
        matrix: [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ],
        total: 0,
        agreement: 0,
        score: 0,
        surprises: [],
      };
    }
    return computeCalibration(index, confidence.getAll());
  }, [open, index, confidence]);

  if (!open) return null;

  const maxCell = data.matrix.reduce(
    (m, row) => row.reduce((mm, c) => Math.max(mm, c), m),
    0,
  );

  return (
    <div
      className="fixed inset-0 z-10 bg-ink-800/25 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="calibration-title"
    >
      <div
        ref={dialogRef}
        className={"bg-white rounded-2xl shadow-modal border border-ink-100 border-t-[3px] " + IDENTITY.difficulty.topBorder + " w-full max-w-2xl p-7 max-h-[85vh] overflow-y-auto"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 id="calibration-title" className="text-[15px] font-semibold tracking-tight">
            Calibration
          </h2>
          <button
            data-close
            data-autofocus
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors flex items-center justify-center focus-ring"
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {data.total === 0 ? (
          <p className="text-[13px] text-ink-500">
            Rate some questions to see how your confidence compares to CB's difficulty ratings.
          </p>
        ) : (
          <div className="space-y-7">
            {/* Calibration score */}
            <section>
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="text-[13px] font-semibold text-ink-700">Calibration Score</h3>
                <span className="text-[11.5px] text-ink-500 tabular-nums">
                  {data.agreement} of {data.total} agree
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-[28px] font-semibold tabular-nums ${scoreColorClass(data.score)}`}>
                  {data.score}
                </span>
                <span className="text-[12px] text-ink-500">/ 100</span>
              </div>
              <p className="text-[12px] text-ink-500 mt-1">
                Higher = your confidence tracks CB's difficulty. Lower = your skill profile diverges from average.
              </p>
            </section>

            {/* Calibration matrix */}
            <section>
              <h3 className="text-[13px] font-semibold text-ink-700 mb-3">
                Matrix: CB Difficulty × Your Confidence
              </h3>
              <div className="overflow-x-auto">
                <table className="border-collapse text-[12px]">
                  <thead>
                    <tr>
                      <th className="p-2 text-left text-ink-500 font-normal"></th>
                      {CONFIDENCES.map((c) => (
                        <th
                          key={c}
                          className="p-2 text-center text-ink-600 font-medium tabular-nums"
                          scope="col"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DIFFICULTIES.map((diff, diffIdx) => (
                      <tr key={diff}>
                        <th
                          className="p-2 text-left text-ink-600 font-medium pr-3"
                          scope="row"
                        >
                          {diff}
                        </th>
                        {CONFIDENCES.map((conf, confIdx) => {
                          const count = data.matrix[diffIdx][confIdx];
                          const isDiagonal = diffIdx === confIdx;
                          const intensity =
                            maxCell > 0 ? Math.round((count / maxCell) * 100) : 0;
                          let cellClass: string;
                          if (count === 0) {
                            cellClass = "bg-ink-50 text-ink-300";
                          } else if (isDiagonal) {
                            cellClass = "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
                          } else {
                            cellClass = "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
                          }
                          return (
                            <td
                              key={conf}
                              className={`p-3 text-center font-medium tabular-nums rounded ${cellClass}`}
                              style={{
                                minWidth: 72,
                                opacity: count === 0 ? 1 : Math.max(0.55, intensity / 100),
                              }}
                              aria-label={`${diff}, ${conf}: ${count}`}
                            >
                              {count}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11.5px] text-ink-500 mt-2">
                Green diagonal = agreement. Amber off-diagonal = mismatch.
              </p>
            </section>

            {/* Surprises */}
            {data.surprises.length > 0 && (
              <section>
                <h3 className="text-[13px] font-semibold text-ink-700 mb-3">
                  Surprises ({data.surprises.length})
                </h3>
                <ul className="divide-y divide-ink-100 border border-ink-100 rounded-lg overflow-hidden">
                  {data.surprises.map((item) => {
                    const labelText =
                      item.kind === "struggling"
                        ? "CB Easy · You Unsure"
                        : "CB Hard · You Confident";
                    const labelClass =
                      item.kind === "struggling"
                        ? "bg-rose-50 text-rose-700"
                        : "bg-emerald-50 text-emerald-700";
                    return (
                      <li key={item.entry.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onFilterToQuestion(item.entry.id);
                            onClose();
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-ink-50 focus-ring"
                        >
                          <span
                            className={`text-[10.5px] font-medium px-2 py-0.5 rounded ${labelClass} whitespace-nowrap`}
                          >
                            {labelText}
                          </span>
                          <span className="text-[12px] text-ink-700 tabular-nums">
                            #{item.entry.number ?? "—"}
                          </span>
                          <span className="text-[12px] text-ink-500 truncate flex-1">
                            {item.entry.skill || item.entry.domain || item.entry.section}
                          </span>
                          {item.entry.preview && (
                            <span className="text-[11.5px] text-ink-400 truncate hidden sm:inline max-w-[40%]">
                              {item.entry.preview}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
