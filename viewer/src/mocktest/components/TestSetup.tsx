/**
 * TestSetup — pre-test configuration screen.
 *
 * The student picks a question source, count, difficulty mix, and time limit,
 * then clicks "Start Test". `onStart` is called with the finalised
 * `TestConfig` for the orchestrator to load questions.
 */
import { useState } from "react";
import type { TestConfig, TestSourceId } from "@/mocktest/types";
import { TestTypeSelector, type TestTypeOption } from "./TestTypeSelector";

interface TestSetupProps {
  onStart: (config: TestConfig) => void;
  onExit: () => void;
}

const OPTIONS: TestTypeOption[] = [
  {
    id: "cb",
    label: "College Board",
    description: "Official-style questions from the CB question bank.",
    icon: "📘",
  },
  {
    id: "sat",
    label: "AI SAT Bank",
    description: "Curated SAT-style prep questions with rationales.",
    icon: "📗",
  },
  {
    id: "mixed",
    label: "Mixed",
    description: "Half from each source — closer to the full test feel.",
    icon: "📚",
  },
];

const COUNT_PRESETS: number[] = [10, 20, 30, 44];
const TIME_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: "Untimed" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "60 min" },
];
const DIFFICULTY_PRESETS: { value: TestConfig["difficultyMix"]; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export function TestSetup({ onStart, onExit }: TestSetupProps) {
  const [sourceId, setSourceId] = useState<TestSourceId | null>(null);
  const [questionCount, setQuestionCount] = useState<number>(20);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(30);
  const [difficultyMix, setDifficultyMix] = useState<TestConfig["difficultyMix"]>("any");

  function handleStart(): void {
    if (!sourceId) return;
    onStart({ sourceId, questionCount, timeLimitMinutes, difficultyMix });
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-8">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onExit}
            className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            ← Back
          </button>
        </div>
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Mock Test Setup
          </h1>
          <p className="text-sm text-slate-500">
            Choose a question source and configure your timed practice session.
          </p>
        </div>

        <TestTypeSelector options={OPTIONS} selected={sourceId} onSelect={setSourceId} />

        <SettingGroup title="Question count">
          <PresetRow
            presets={COUNT_PRESETS.map((n) => ({ value: n, label: String(n) }))}
            value={questionCount}
            onChange={setQuestionCount}
          />
        </SettingGroup>

        <SettingGroup title="Time limit">
          <PresetRow
            presets={TIME_PRESETS}
            value={timeLimitMinutes}
            onChange={setTimeLimitMinutes}
          />
        </SettingGroup>

        <SettingGroup title="Difficulty">
          <PresetRow
            presets={DIFFICULTY_PRESETS}
            value={difficultyMix}
            onChange={setDifficultyMix}
          />
        </SettingGroup>

        <button
          type="button"
          onClick={handleStart}
          disabled={!sourceId}
          className="w-full h-11 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium"
        >
          Start Test →
        </button>
      </div>
    </div>
  );
}

interface SettingGroupProps {
  title: string;
  children: React.ReactNode;
}

function SettingGroup({ title, children }: SettingGroupProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  );
}

interface PresetRowProps<T extends string | number> {
  presets: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}

function PresetRow<T extends string | number>({ presets, value, onChange }: PresetRowProps<T>) {
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((p) => {
        const isSelected = p.value === value;
        return (
          <button
            key={String(p.value)}
            type="button"
            onClick={() => onChange(p.value)}
            aria-pressed={isSelected}
            className={[
              "px-3 py-1.5 rounded-md text-sm border transition-colors",
              isSelected
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-indigo-300",
            ].join(" ")}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
