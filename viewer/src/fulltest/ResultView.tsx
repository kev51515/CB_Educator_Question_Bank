/**
 * ResultView
 * ==========
 * Post-submission summary + per-question review for a full test. Only rendered
 * once the run is submitted, when the server safely returns the answer key
 * alongside the student's response (`get_test_result`).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/lib/routes";
import { getQuestionTimes } from "./api";
import { PacingPanel, fmtMs, paceTone } from "./PacingPanel";
import { QuestionPane } from "./QuestionPane";
import { scaledFromSectionScores } from "./satScore";
import { band, orderDomains, orderSections, pctOf, sectionLabel } from "./skills";
import type { QuestionTime, ResultQuestion, TestResult } from "./types";

const SCALED_NOTE =
  "Estimated from your raw section scores on a representative Digital SAT curve. " +
  "The real exam is section-adaptive and uses a per-form table, so treat this as a practice estimate, not an official score.";

export function ResultView({ result, testTitle }: { result: TestResult; testTitle: string }) {
  const navigate = useNavigate();
  const pct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
  const scaled = scaledFromSectionScores(result.section_scores);

  // Per-question pacing vs. the class (best-effort: a failed/empty fetch just
  // means the comparison stays hidden — never blocks the review screen).
  const [times, setTimes] = useState<QuestionTime[]>([]);
  useEffect(() => {
    let alive = true;
    getQuestionTimes(result.run_id)
      .then((t) => {
        if (alive) setTimes(t);
      })
      .catch(() => {
        /* non-critical — pacing comparison simply won't render */
      });
    return () => {
      alive = false;
    };
  }, [result.run_id]);

  // Keyed lookup for the inline per-question pace pill in the review list.
  const timeById = useMemo(() => {
    const m = new Map<string, QuestionTime>();
    for (const t of times) m.set(t.question_id, t);
    return m;
  }, [times]);

  // A single-section test (RW-only or Math-only) has no 1600 composite, but its
  // one section's estimated 200–800 score is far more meaningful than raw, so
  // surface that as the hero instead of the raw fallback.
  const singleSection =
    scaled.total === null && scaled.rw !== null
      ? { label: sectionLabel("reading-writing"), scaled: scaled.rw }
      : scaled.total === null && scaled.math !== null
        ? { label: sectionLabel("math"), scaled: scaled.math }
        : null;
  const hasEstimate = scaled.total !== null || singleSection !== null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl">
        <header className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-7 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm uppercase tracking-wide text-white/80">Results</p>
            {hasEstimate && (
              <span
                className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/90 ring-1 ring-white/20"
                title={SCALED_NOTE}
              >
                Estimated
              </span>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-bold">{testTitle}</h1>

          {scaled.total !== null ? (
            <>
              <div className="mt-5 flex items-end gap-3">
                <div className="ceremonial text-[3.25rem] font-bold leading-none tabular-nums">
                  {scaled.total}
                </div>
                <div className="pb-1">
                  <div className="text-lg font-medium text-white/70">/ 1600</div>
                  <div className="text-xs uppercase tracking-wide text-white/70">
                    estimated SAT score
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <ScoreChip
                  label="Reading & Writing"
                  scaled={scaled.rw}
                  raw={result.section_scores?.["reading-writing"]}
                />
                <ScoreChip label="Math" scaled={scaled.math} raw={result.section_scores?.["math"]} />
              </div>
            </>
          ) : singleSection !== null ? (
            <div className="mt-5 flex items-end gap-3">
              <div className="ceremonial text-[3.25rem] font-bold leading-none tabular-nums">
                {singleSection.scaled}
              </div>
              <div className="pb-1">
                <div className="text-lg font-medium text-white/70">/ 800</div>
                <div className="text-xs uppercase tracking-wide text-white/70">
                  estimated {singleSection.label} score
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 text-4xl font-bold tabular-nums">
              {result.score}
              <span className="text-2xl font-medium text-white/70">/{result.total}</span>
            </div>
          )}

          {/* Secondary raw + timing stats */}
          <div className="mt-5 flex flex-wrap items-end gap-x-7 gap-y-3 border-t border-white/15 pt-4">
            <div>
              <div className="text-lg font-semibold tabular-nums">
                {result.score}/{result.total}
              </div>
              <div className="text-xs text-white/70">{pct}% correct · raw</div>
            </div>
            {typeof result.duration_seconds === "number" && (
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {Math.floor(result.duration_seconds / 60)} min
                </div>
                <div className="text-xs text-white/70">Time taken</div>
              </div>
            )}
          </div>

          {hasEstimate && (
            <p className="mt-3 max-w-xl text-[11px] leading-snug text-white/60">{SCALED_NOTE}</p>
          )}
        </header>

        <SkillProfileCard result={result} />

        <TimingCard result={result} />

        <PacingPanel runId={result.run_id} questions={result.questions} />

        <div className="mt-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Review
          </h2>
          {result.questions.map((rq) => (
            <ReviewCard key={rq.id} rq={rq} time={timeById.get(rq.id) ?? null} />
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => navigate(ROUTES.HOME)}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** A section score chip in the result hero: scaled /800 with raw beneath. */
function ScoreChip({
  label,
  scaled,
  raw,
}: {
  label: string;
  scaled: number | null;
  raw?: { correct: number; total: number };
}) {
  if (scaled === null) return null;
  return (
    <div className="rounded-xl bg-white/10 px-4 py-2.5 ring-1 ring-white/15">
      <div className="text-[11px] font-medium uppercase tracking-wide text-white/70">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums">{scaled}</span>
        <span className="text-xs text-white/60">/ 800</span>
      </div>
      {raw && (
        <div className="text-[11px] text-white/60">
          {raw.correct}/{raw.total} raw
        </div>
      )}
    </div>
  );
}

// --- Skill profile (per-domain mastery) -------------------------------------

interface DomainStat {
  domain: string;
  correct: number;
  total: number;
  pct: number;
  /** id of this domain's first question, for jump-to-review */
  firstId: string;
}

/**
 * A student-facing breakdown of how they did on each College Board skill
 * domain — the SAT-prep payoff of the result screen. Surfaces a single "focus
 * area" up top (or praise when strong across the board), then per-section
 * mastery bars. Hidden entirely when the test has no classified questions.
 */
function SkillProfileCard({ result }: { result: TestResult }) {
  const grouped = useMemo(() => {
    const bySection = new Map<string, Map<string, { correct: number; total: number }>>();
    const firstId = new Map<string, string>(); // domain → its first question id
    for (const q of result.questions) {
      if (!q.domain) continue;
      if (!firstId.has(q.domain)) firstId.set(q.domain, q.id);
      if (!bySection.has(q.section)) bySection.set(q.section, new Map());
      const dm = bySection.get(q.section)!;
      const prev = dm.get(q.domain) ?? { correct: 0, total: 0 };
      dm.set(q.domain, {
        correct: prev.correct + (q.is_correct === true ? 1 : 0),
        total: prev.total + 1,
      });
    }
    return orderSections(bySection.keys()).map((sec) => {
      const dm = bySection.get(sec)!;
      const domains: DomainStat[] = orderDomains(sec, dm.keys()).map((domain) => {
        const e = dm.get(domain)!;
        return { domain, correct: e.correct, total: e.total, pct: pctOf(e.correct, e.total) ?? 0, firstId: firstId.get(domain)! };
      });
      return { section: sec, domains };
    });
  }, [result.questions]);

  if (grouped.length === 0) return null;

  const all = grouped.flatMap((g) => g.domains);
  const weakest = all.reduce<DomainStat | null>((w, d) => (!w || d.pct < w.pct ? d : w), null);
  const focus = weakest && weakest.pct < 70 ? weakest : null;

  // Jump to a domain's first question in the review list below.
  const jumpToQuestion = (id: string) => {
    document.getElementById(`result-q-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
        Skills by topic
      </h2>

      {focus ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Focus area:{" "}
          <button
            type="button"
            onClick={() => jumpToQuestion(focus.firstId)}
            className="rounded-md px-1.5 py-0.5 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900"
            style={{ backgroundColor: band(focus.pct).bg, color: band(focus.pct).fg }}
            title={`Jump to the first ${focus.domain} question`}
          >
            {focus.domain} · {focus.pct}%
          </button>{" "}
          — practising this skill will move your score the most.
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Strong across every topic — nice work. Keep all skills sharp before the real test.
        </p>
      )}

      <div className="mt-4 space-y-5">
        {grouped.map((g) => (
          <div key={g.section}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {sectionLabel(g.section)}
            </h3>
            <div className="space-y-2.5">
              {g.domains.map((d) => (
                <div key={d.domain} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => jumpToQuestion(d.firstId)}
                    className="w-48 shrink-0 truncate text-left text-sm text-slate-700 hover:text-indigo-600 hover:underline focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-200 dark:hover:text-indigo-400 sm:w-56"
                    title={`Jump to the first ${d.domain} question`}
                  >
                    {d.domain}
                  </button>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${d.pct}%`, backgroundColor: band(d.pct).bg }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {d.correct}/{d.total} · {d.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function fmtClock(sec: number | null): string {
  if (sec == null) return "—";
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Per-module time-on-task (from test_runs.module_timing). Coaching signal:
 *  did the student rush or run over time? Hidden when no timing was recorded. */
function TimingCard({ result }: { result: TestResult }) {
  const timing = result.module_timing ?? {};
  const positions = Object.keys(timing)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  if (positions.length === 0) return null;

  const sectionByPos = new Map<number, string>();
  for (const q of result.questions) {
    if (!sectionByPos.has(q.module_position)) sectionByPos.set(q.module_position, q.section);
  }

  return (
    <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
        Time per section
      </h2>
      <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
        {positions.map((pos) => {
          const tm = timing[String(pos)];
          if (!tm) return null;
          return (
            <li key={pos} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-slate-700 dark:text-slate-200">
                Module {pos} · {sectionLabel(sectionByPos.get(pos) ?? "")}
              </span>
              <span className="flex items-center gap-2 tabular-nums text-slate-600 dark:text-slate-300">
                {fmtClock(tm.elapsed_seconds)}
                <span className="text-slate-400 dark:text-slate-500">/ {fmtClock(tm.limit_seconds)}</span>
                {tm.timed_out && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
                    Ran over time
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Inline "you vs. class" time pill for a single review card. Renders nothing
 *  when there's no class comparison for the question. Colour follows the same
 *  faster/even/slower coding as the PacingPanel strip (reused via paceTone). */
function PacePill({ time }: { time: QuestionTime | null }) {
  if (!time || time.class_n <= 0 || time.class_avg_ms == null) return null;
  const tone = paceTone(time.your_time_ms, time.class_avg_ms);
  const cls =
    tone === "fast"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900"
      : tone === "slow"
        ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900"
        : "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ring-1 ${cls}`}
      title={`You ${fmtMs(time.your_time_ms)} · class avg ${fmtMs(time.class_avg_ms)}`}
    >
      You {fmtMs(time.your_time_ms)} · class {fmtMs(time.class_avg_ms)}
    </span>
  );
}

function ReviewCard({ rq, time }: { rq: ResultQuestion; time: QuestionTime | null }) {
  const correct = rq.is_correct === true;
  const blank = !rq.your_answer;
  const yourText =
    rq.type === "mcq" && rq.choices && rq.your_answer
      ? `${rq.your_answer}. ${rq.choices[rq.your_answer as "A"] ?? ""}`
      : rq.your_answer ?? "—";
  const correctText =
    rq.type === "mcq" && rq.choices && rq.correct_answer
      ? `${rq.correct_answer}. ${rq.choices[rq.correct_answer as "A"] ?? ""}`
      : // grid-in stores the canonical answer in `accepted` (correct_answer is null)
        rq.correct_answer ?? rq.accepted?.[0] ?? "—";

  return (
    <div
      id={`result-q-${rq.id}`}
      className={[
        "scroll-mt-4 rounded-xl border bg-white p-5 dark:bg-slate-900",
        correct
          ? "border-emerald-200 dark:border-emerald-900"
          : "border-rose-200 dark:border-rose-900",
      ].join(" ")}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {sectionLabel(rq.section)} · Q{rq.number}
          </span>
          {rq.domain && (
            <span
              className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
              title="SAT skill domain"
            >
              {rq.domain}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <PacePill time={time} />
          <span
            className={[
              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
              correct
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
            ].join(" ")}
          >
            {correct ? "Correct" : blank ? "Skipped" : "Incorrect"}
          </span>
        </span>
      </div>

      <QuestionPane
        question={{
          id: rq.id,
          ref: rq.ref,
          number: rq.number,
          type: rq.type,
          section: rq.section,
          passage: rq.passage,
          passage_alt: rq.passage_alt,
          stem: rq.stem,
          choices: rq.choices,
          figure: rq.figure,
        }}
        value={rq.your_answer}
        onChange={() => {}}
        disabled
      />

      <div className="mt-4 grid gap-2 border-t border-slate-100 pt-3 text-sm dark:border-slate-800 sm:grid-cols-2">
        <div>
          <span className="text-slate-500 dark:text-slate-400">Your answer: </span>
          <span className={correct ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}>
            {blank ? "(blank)" : yourText}
          </span>
        </div>
        {!correct && (
          <div>
            <span className="text-slate-500 dark:text-slate-400">Correct answer: </span>
            <span className="text-emerald-700 dark:text-emerald-300">{correctText}</span>
          </div>
        )}
        {rq.eliminated && rq.eliminated.length > 0 && (
          <div className="sm:col-span-2">
            <span className="text-slate-500 dark:text-slate-400">Eliminated: </span>
            <span className="font-medium text-slate-700 line-through decoration-rose-400 dark:text-slate-300">
              {rq.eliminated.join(", ")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
